// =================================================================
//  setup-claims.js — Setar tenantId + role nos usuários do Firebase Auth.
// -----------------------------------------------------------------
//  PAPEL ATUAL: bootstrap do PRIMEIRO owner de uma loja (tenant novo).
//  O dia a dia (adicionar caixa/gerente, trocar papel, revogar acesso)
//  agora é feito pelo próprio dono no painel — Configurações → Equipe —
//  via backend em functions/index.js. Este script fica para quem opera
//  o SaaS criar lojas novas.
//
//  Execute ANTES de fazer o deploy das novas firestore.rules.
//  Sem isso, ninguém entra no painel (rules exigem o claim).
//
//  Como rodar (local, uma vez):
//      1) npm i firebase-admin
//      2) Baixar a service-account-key.json no Console Firebase:
//         Project Settings > Service accounts > Generate new private key
//         Salvar como serviceAccountKey.json AO LADO deste script.
//         IMPORTANTE: adicione serviceAccountKey.json no .gitignore.
//      3) Ajustar USERS abaixo conforme sua realidade.
//      4) node scripts/setup-claims.js
//
//  Idempotente: rodar de novo só sobrescreve o claim.
// =================================================================

// API modular (firebase-admin v12+). A API namespaced (admin.credential.cert)
// foi descontinuada e quebra em algumas combinações com Node 22+.
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

initializeApp({ credential: cert(serviceAccount) });

// Edite esta lista com os emails atuais e o papel de cada um.
// roles válidos: 'owner' | 'manager' | 'cashier'
const USERS = [
    { email: 'dono@bravaconveniencia.com.br', tenantId: 'loja-padrao', role: 'owner' },
    // { email: 'gerente@bravaconveniencia.com.br', tenantId: 'loja-padrao', role: 'manager' },
    // { email: 'caixa1@bravaconveniencia.com.br', tenantId: 'loja-padrao', role: 'cashier' },
];

(async () => {
    const auth = getAuth();
    for (const u of USERS) {
        try {
            const user = await auth.getUserByEmail(u.email);
            await auth.setCustomUserClaims(user.uid, {
                tenantId: u.tenantId,
                role: u.role
            });
            // Forçar refresh do token na próxima requisição (revoga sessão atual).
            await auth.revokeRefreshTokens(user.uid);
            console.log(`OK  ${u.email}  ->  tenant=${u.tenantId} role=${u.role}`);
        } catch (e) {
            console.error(`ERR ${u.email}: ${e.message}`);
        }
    }
    process.exit(0);
})();
