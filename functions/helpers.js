// =================================================================
//  helpers.js — validações puras do backend de equipe.
//  Sem dependências de propósito: testável com node:test direto
//  (functions/helpers.test.mjs), sem emulador nem npm install.
// =================================================================

const VALID_ROLES = ['owner', 'manager', 'cashier'];

const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

// RFC-lite: o Firebase Auth valida de verdade; aqui só barra lixo óbvio
// antes de gastar uma chamada do Admin SDK.
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Valida o payload de setStaffClaims / removeStaffAccess.
// Retorna { ok: true, email, role } ou { ok: false, error }.
function validateStaffInput(data, { requireRole = true } = {}) {
    const email = normalizeEmail(data && data.email);
    if (!email || email.length > 254 || !looksLikeEmail(email)) {
        return { ok: false, error: 'E-mail inválido.' };
    }
    if (!requireRole) return { ok: true, email, role: null };
    const role = String((data && data.role) || '');
    if (!VALID_ROLES.includes(role)) {
        return { ok: false, error: "Papel inválido. Use 'owner', 'manager' ou 'cashier'." };
    }
    return { ok: true, email, role };
}

// Isolamento entre lojas: um owner só gerencia conta que ainda não pertence
// a tenant nenhum (conta recém-criada) ou que já pertence ao SEU tenant.
function canManageTarget(callerTenant, targetClaims) {
    const t = (targetClaims && targetClaims.tenantId) || null;
    return t === null || t === callerTenant;
}

module.exports = { VALID_ROLES, normalizeEmail, looksLikeEmail, validateStaffInput, canManageTarget };
