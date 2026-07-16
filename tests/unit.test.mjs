// =================================================================
//  Testes unitários das funções puras do painel (index.html).
// -----------------------------------------------------------------
//  O painel é single-file de propósito (deploy = copiar 1 arquivo),
//  então os testes EXTRAEM as funções direto do <script> inline em
//  vez de exigir um build/bundler. Se uma função testada for
//  renomeada ou movida, o extrator falha alto — atualize o marcador.
//
//  Rodar:  node --test tests/
//  Requer: Node 18+ (usa node:test, zero dependências).
// =================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Extrai uma declaração de UMA linha (ex: `const safeNum = (v) => ...;`).
function line(prefix) {
    const found = html.split('\n').find(l => l.trim().startsWith(prefix));
    assert.ok(found, `Extrator: linha começando com "${prefix}" não encontrada no index.html`);
    return found.trim();
}

// Extrai um bloco `function nome(...) {...}` ou `const nome = (...) => {...}`
// por casamento de chaves a partir do marcador.
function block(marker) {
    const start = html.indexOf(marker);
    assert.ok(start !== -1, `Extrator: marcador "${marker}" não encontrado no index.html`);
    const open = html.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end !== -1, `Extrator: chaves desbalanceadas a partir de "${marker}"`);
    return html.slice(start, end + 1) + (html[end + 1] === ';' ? ';' : '');
}

// Monta um sandbox com as funções extraídas e dependências injetáveis.
function sandbox({ settings = {}, now = null } = {}) {
    const src = [
        line('const safeNum'),
        line('const escapeHtml'),
        line('const isHttpUrl'),
        line('const DUP_WINDOW_MS'),
        line('const ESC_B'),          // define LF_B usado por escRow
        line('const stripAccents'),
        line('const getCols'),
        block('function safeImgUrl('),
        block('function orderSignature('),
        block('function findDuplicates('),
        block('function isWithinBusinessHours('),
        block('const escRow = '),
        block('function getSeenNovos('),
        block('function countUnseenNovos('),
        block('function markNovosSeen('),
    ].join('\n');

    const store = new Map();
    const fakeLocalStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
    };
    // `new Date()` dentro de isWithinBusinessHours resolve para esta classe.
    const FakeDate = now
        ? class { getHours() { return now.h; } getMinutes() { return now.m; } }
        : Date;

    const factory = new Function('window', 'localStorage', 'Date', `
        ${src}
        return { safeNum, escapeHtml, safeImgUrl, orderSignature, findDuplicates,
                 isWithinBusinessHours, escRow, getCols, stripAccents,
                 getSeenNovos, countUnseenNovos, markNovosSeen, DUP_WINDOW_MS, LF_B };
    `);
    return factory({ settings }, fakeLocalStorage, FakeDate);
}

// ---------------------------------------------------------------- safeNum
test('safeNum: número válido passa, lixo vira 0', () => {
    const { safeNum } = sandbox();
    assert.equal(safeNum('12.5'), 12.5);
    assert.equal(safeNum(7), 7);
    assert.equal(safeNum('abc'), 0);
    assert.equal(safeNum(null), 0);
    assert.equal(safeNum(Infinity), 0);
});

// ------------------------------------------------------------- escapeHtml
test('escapeHtml: neutraliza os 5 metacaracteres', () => {
    const { escapeHtml } = sandbox();
    assert.equal(escapeHtml(`<img src=x onerror="a">'&`),
        '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&amp;');
    assert.equal(escapeHtml(null), '');
});

// ------------------------------------------------------------- safeImgUrl
test('safeImgUrl: emoji ok, URL https ok, javascript:/lixo bloqueados', () => {
    const { safeImgUrl } = sandbox();
    assert.equal(safeImgUrl('🍺'), '🍺');
    assert.equal(safeImgUrl('https://ex.com/a.png'), 'https://ex.com/a.png');
    assert.equal(safeImgUrl('javascript:alert(1)'), '');
    assert.equal(safeImgUrl('string-longa-que-nao-e-url'), '');
});

// --------------------------------------------------------- orderSignature
test('orderSignature: telefone normalizado + itens fora de ordem = mesma assinatura', () => {
    const { orderSignature } = sandbox();
    const a = { customer: { phone: '(47) 99999-1234' }, total: 30,
                items: [{ name: 'Skol', qty: 2 }, { name: 'Gelo', qty: 1 }] };
    const b = { customer: { phone: '47999991234' }, total: 30,
                items: [{ name: 'gelo ', qty: 1 }, { name: 'SKOL', qty: 2 }] };
    assert.equal(orderSignature(a), orderSignature(b));
    assert.notEqual(orderSignature(a), '');
});

test('orderSignature: sem telefone não agrupa (assinatura vazia)', () => {
    const { orderSignature } = sandbox();
    assert.equal(orderSignature({ customer: { phone: '' }, total: 10, items: [] }), '');
    assert.equal(orderSignature(null), '');
});

// --------------------------------------------------------- findDuplicates
const mkOrder = (id, ts, extra = {}) => ({
    id, timestamp: ts, total: 25, status: 'novo',
    customer: { phone: '47999991234' },
    items: [{ name: 'Skol', qty: 2 }],
    ...extra,
});

test('findDuplicates: 2 pedidos iguais em 5 min => grupo com o mais antigo marcado', () => {
    const { findDuplicates } = sandbox();
    const t = 1_700_000_000_000;
    const dup = findDuplicates([mkOrder('a', t), mkOrder('b', t + 60_000)]);
    assert.equal(dup.size, 2);
    assert.equal(dup.get('a').isOldest, true);
    assert.equal(dup.get('b').isOldest, false);
    assert.deepEqual(dup.get('a').groupIds.sort(), ['a', 'b']);
});

test('findDuplicates: fora da janela de 5 min não é duplicata', () => {
    const { findDuplicates, DUP_WINDOW_MS } = sandbox();
    const t = 1_700_000_000_000;
    const dup = findDuplicates([mkOrder('a', t), mkOrder('b', t + DUP_WINDOW_MS + 1)]);
    assert.equal(dup.size, 0);
});

test('findDuplicates: pedido cancelado não conta no grupo', () => {
    const { findDuplicates } = sandbox();
    const t = 1_700_000_000_000;
    const dup = findDuplicates([mkOrder('a', t, { status: 'cancelado' }), mkOrder('b', t + 1000)]);
    assert.equal(dup.size, 0);
});

// ------------------------------------------------- isWithinBusinessHours
test('horário normal (08→18): 10h aberto, 19h fechado', () => {
    const s = { openHour: 8, openMinute: 0, closeHour: 18, closeMinute: 0 };
    assert.equal(sandbox({ settings: s, now: { h: 10, m: 0 } }).isWithinBusinessHours(), true);
    assert.equal(sandbox({ settings: s, now: { h: 19, m: 0 } }).isWithinBusinessHours(), false);
});

test('atravessa meia-noite (18→02): 23h e 01h abertos, 10h fechado', () => {
    const s = { openHour: 18, openMinute: 0, closeHour: 2, closeMinute: 0 };
    assert.equal(sandbox({ settings: s, now: { h: 23, m: 0 } }).isWithinBusinessHours(), true);
    assert.equal(sandbox({ settings: s, now: { h: 1, m: 30 } }).isWithinBusinessHours(), true);
    assert.equal(sandbox({ settings: s, now: { h: 10, m: 0 } }).isWithinBusinessHours(), false);
});

test('sem horário configurado: considera sempre aberto (compat)', () => {
    assert.equal(sandbox({ settings: {}, now: { h: 3, m: 0 } }).isWithinBusinessHours(), true);
});

// ------------------------------------------------------------------ escRow
test('escRow: linha com largura exata da bobina (80mm=48, 58mm=32 colunas)', () => {
    const s80 = sandbox({ settings: { printerWidth: '80mm' } });
    const row80 = s80.escRow('Subtotal:', '10.00');
    assert.equal(row80.length, 48 + s80.LF_B.length);
    assert.ok(row80.startsWith('Subtotal:') && row80.includes('10.00'));

    const s58 = sandbox({ settings: { printerWidth: '58mm' } });
    assert.equal(s58.escRow('TOTAL:', '99.90').length, 32 + s58.LF_B.length);
});

test('escRow: remove acentos e garante ao menos 1 espaço mesmo estourando a largura', () => {
    const s = sandbox({ settings: {} });
    const row = s.escRow('X'.repeat(60), 'AÇÃO');
    assert.ok(row.includes(' ACAO'));
    assert.ok(!row.includes('Ç'));
});

// ------------------------------------- countUnseenNovos / markNovosSeen
test('countUnseenNovos é pura: duas leituras no mesmo ciclo não engolem o alerta', () => {
    const s = sandbox();
    const orders = [
        { id: 'n1', status: 'novo' },
        { id: 'n2', status: 'novo' },
        { id: 'p1', status: 'preparo' },
    ];
    assert.equal(s.countUnseenNovos(orders), 2);
    assert.equal(s.countUnseenNovos(orders), 2); // segunda chamada NÃO zera (regressão P2-1)
    s.markNovosSeen(orders);
    assert.equal(s.countUnseenNovos(orders), 0); // só zera após marcar explicitamente
    assert.equal(s.countUnseenNovos([...orders, { id: 'n3', status: 'novo' }]), 1);
});
