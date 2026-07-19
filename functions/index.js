// =================================================================
//  Backend Pede-aí — Cloud Functions (gen 2)
// -----------------------------------------------------------------
//  Por que existe: o painel é 100% front (single-file) e o Firestore é
//  protegido por rules, mas Custom Claims (tenantId + role) só podem ser
//  gravados pelo Admin SDK — e claims são a fundação do multi-tenant.
//  Antes, liberar acesso de um caixa exigia rodar scripts/setup-claims.js
//  na mão, com service account na máquina de quem opera.
//
//  Agora o OWNER gerencia a própria equipe pelo painel (Configurações →
//  Equipe). O isolamento entre lojas é garantido AQUI, não no cliente:
//  um owner só enxerga e altera contas do próprio tenant.
//
//  Deploy:   firebase deploy --only functions   (exige plano Blaze)
//  Bootstrap do PRIMEIRO owner de uma loja nova: continua via
//  scripts/setup-claims.js — decisão de quem opera o SaaS, não do lojista.
// =================================================================

const crypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { normalizeEmail, validateStaffInput, canManageTarget } = require('./helpers');

// Mesma região usada pelo painel em getFunctions(app, 'southamerica-east1').
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });
initializeApp();

// Todo endpoint de equipe exige owner autenticado com claims completos.
function requireOwner(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login novamente.');
    const { tenantId, role } = request.auth.token || {};
    if (!tenantId || role !== 'owner') {
        throw new HttpsError('permission-denied', 'Apenas o dono da loja pode gerenciar a equipe.');
    }
    return { uid: request.auth.uid, email: request.auth.token.email || null, tenantId };
}

// Mesmo formato/caminho do audit log do painel (append-only; rules bloqueiam
// edição — o Admin SDK não passa por rules, mas mantém o contrato).
async function logAudit(actor, action, target, meta = {}) {
    try {
        await getFirestore()
            .collection('artifacts').doc(actor.tenantId)
            .collection('private').doc('audit')
            .collection('log')
            .add({
                ts: Date.now(),
                uid: actor.uid,
                email: actor.email,
                role: 'owner',
                action,
                target: String(target ?? ''),
                before: null,
                after: null,
                meta,
            });
    } catch (e) {
        console.warn('Falha ao gravar audit:', e.message);
    }
}

// Libera (ou atualiza) o acesso de um membro da equipe do tenant do chamador.
// Conta inexistente é criada sem senha — o staff define a dele via
// "Esqueci a senha" na tela de login (zero e-mail transacional próprio).
exports.setStaffClaims = onCall(async (request) => {
    const actor = requireOwner(request);
    const v = validateStaffInput(request.data);
    if (!v.ok) throw new HttpsError('invalid-argument', v.error);

    // Auto-lockout: dono rebaixando a própria conta trancaria a loja.
    if (v.email === normalizeEmail(actor.email)) {
        throw new HttpsError('failed-precondition', 'Você não pode alterar o próprio acesso.');
    }

    const auth = getAuth();
    let user, created = false;
    try {
        user = await auth.getUserByEmail(v.email);
    } catch (e) {
        if (e.code !== 'auth/user-not-found') {
            throw new HttpsError('internal', 'Falha ao buscar usuário: ' + e.message);
        }
        // Senha aleatória descartável (ninguém conhece): garante que o provider
        // email/senha exista, então o "Esqueci a senha" do login SEMPRE funciona
        // como fluxo de convite — conta sem provider nenhum é caso ambíguo no Auth.
        user = await auth.createUser({
            email: v.email,
            emailVerified: false,
            disabled: false,
            password: crypto.randomBytes(24).toString('base64url'),
        });
        created = true;
    }

    if (!canManageTarget(actor.tenantId, user.customClaims)) {
        throw new HttpsError('permission-denied', 'Este e-mail já pertence a outra loja.');
    }

    await auth.setCustomUserClaims(user.uid, { tenantId: actor.tenantId, role: v.role });
    await auth.revokeRefreshTokens(user.uid); // papel novo vale no próximo login
    await logAudit(actor, 'staff.grant', v.email, { role: v.role, created });
    return { uid: user.uid, email: v.email, role: v.role, created };
});

// Lista a equipe do tenant do chamador.
// listUsers é um scan do Auth inteiro — ok para o porte atual; quando o
// número de contas do projeto crescer (muitas lojas), espelhar a equipe
// em artifacts/{tenant}/private/staff e ler de lá.
exports.listStaff = onCall(async (request) => {
    const actor = requireOwner(request);
    const auth = getAuth();
    const staff = [];
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        for (const u of page.users) {
            const c = u.customClaims || {};
            if (c.tenantId === actor.tenantId) {
                staff.push({ uid: u.uid, email: u.email || null, role: c.role || null, disabled: u.disabled });
            }
        }
        pageToken = page.pageToken;
    } while (pageToken);

    const rank = { owner: 0, manager: 1, cashier: 2 };
    staff.sort((a, b) => ((rank[a.role] ?? 9) - (rank[b.role] ?? 9))
        || String(a.email).localeCompare(String(b.email)));
    return { staff };
});

// Revoga o acesso de um membro: limpa os claims e derruba as sessões.
// A conta continua existindo no Auth (histórico/auditoria) — sem claim,
// as rules negam tudo e o painel bloqueia o login (caso S2C).
exports.removeStaffAccess = onCall(async (request) => {
    const actor = requireOwner(request);
    const v = validateStaffInput(request.data, { requireRole: false });
    if (!v.ok) throw new HttpsError('invalid-argument', v.error);
    if (v.email === normalizeEmail(actor.email)) {
        throw new HttpsError('failed-precondition', 'Você não pode remover o próprio acesso.');
    }

    const auth = getAuth();
    let user;
    try {
        user = await auth.getUserByEmail(v.email);
    } catch (e) {
        if (e.code === 'auth/user-not-found') throw new HttpsError('not-found', 'E-mail não encontrado.');
        throw new HttpsError('internal', 'Falha ao buscar usuário: ' + e.message);
    }

    if (!user.customClaims || user.customClaims.tenantId !== actor.tenantId) {
        throw new HttpsError('permission-denied', 'Este e-mail não pertence à sua loja.');
    }

    await auth.setCustomUserClaims(user.uid, null);
    await auth.revokeRefreshTokens(user.uid);
    await logAudit(actor, 'staff.revoke', v.email, { previousRole: user.customClaims.role || null });
    return { ok: true };
});
