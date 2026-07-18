// Testes das validações puras do backend (functions/helpers.js).
// Rodar: node --test functions/   — Node 18+, zero dependências.

import test from 'node:test';
import assert from 'node:assert/strict';
import { VALID_ROLES, normalizeEmail, looksLikeEmail, validateStaffInput, canManageTarget } from './helpers.js';

test('normalizeEmail: trim + lowercase, lixo vira string vazia', () => {
    assert.equal(normalizeEmail('  Caixa@Loja.COM  '), 'caixa@loja.com');
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
});

test('looksLikeEmail: aceita formato básico, barra lixo', () => {
    assert.equal(looksLikeEmail('a@b.co'), true);
    assert.equal(looksLikeEmail('sem-arroba'), false);
    assert.equal(looksLikeEmail('espaco @b.co'), false);
    assert.equal(looksLikeEmail('a@sem-ponto'), false);
});

test('validateStaffInput: payload válido normaliza e-mail e aceita os 3 papéis', () => {
    for (const role of VALID_ROLES) {
        const v = validateStaffInput({ email: ' X@Y.com ', role });
        assert.deepEqual(v, { ok: true, email: 'x@y.com', role });
    }
});

test('validateStaffInput: e-mail ou papel inválido são rejeitados com mensagem', () => {
    assert.equal(validateStaffInput({ email: 'lixo', role: 'owner' }).ok, false);
    assert.equal(validateStaffInput({ email: '', role: 'owner' }).ok, false);
    assert.equal(validateStaffInput(null).ok, false);
    const v = validateStaffInput({ email: 'a@b.co', role: 'root' });
    assert.equal(v.ok, false);
    assert.match(v.error, /Papel inválido/);
});

test('validateStaffInput: requireRole=false ignora o papel (removeStaffAccess)', () => {
    const v = validateStaffInput({ email: 'a@b.co' }, { requireRole: false });
    assert.deepEqual(v, { ok: true, email: 'a@b.co', role: null });
});

test('canManageTarget: conta nova ou do próprio tenant sim; de outra loja não', () => {
    assert.equal(canManageTarget('loja-a', undefined), true);          // conta recém-criada
    assert.equal(canManageTarget('loja-a', {}), true);                 // sem claims
    assert.equal(canManageTarget('loja-a', { tenantId: 'loja-a' }), true);
    assert.equal(canManageTarget('loja-a', { tenantId: 'loja-b' }), false); // isolamento
});
