# Pede-aí — Painel Administrativo

Painel admin single-file para o sistema de delivery **Pede-aí**.

## Funcionalidades

- **Pedidos em tempo real** — acompanhe e atualize o status de cada pedido (Novo → Preparo → Entrega → Concluído)
- **Relatórios financeiros** — faturamento, ticket médio, taxas de entrega, pedidos cancelados com valor perdido
- **Gráficos** — pedidos por hora, top produtos, formas de pagamento
- **Extrato de entregas** — tabela filtrável + exportação CSV com coluna de status (CONCLUIDO/CANCELADO)
- **Gestão de produtos** — cadastro individual ou importação em massa via CSV (até 500 linhas)
- **Categorias** — criação e remoção com proteção contra ID duplicado
- **Configurações** — dados da loja, horário de funcionamento, taxas por bairro, cor primária, logo
- **Impressão térmica** — ESC/POS via QZ Tray (58mm/80mm), fallback automático pelo navegador
- **Alertas sonoros** — buzina sintética via Web Audio API, sem dependência de arquivo de áudio

## Tecnologias

| Camada | Biblioteca |
|---|---|
| UI | Tailwind CSS (CDN) + Font Awesome |
| Banco de dados | Firebase Firestore v11.6.1 |
| Autenticação | Firebase Auth |
| Gráficos | Chart.js |
| Impressão | QZ Tray (ESC/POS) |

## Como usar

1. Abra o arquivo `index.html` em qualquer servidor web (ou direto no navegador)
2. Faça login com o e-mail e senha cadastrados no **Firebase Authentication**
3. Configure os dados da loja na aba **Configurações**

## Backend (Cloud Functions)

O painel é 100% front, mas Custom Claims (`tenantId` + `role`) só podem ser
gravados pelo Admin SDK — por isso existe o backend em `functions/`:

| Callable | Quem chama | O que faz |
|---|---|---|
| `setStaffClaims` | owner | Libera/atualiza acesso de um e-mail da própria loja (cria a conta se não existir) |
| `listStaff` | owner | Lista a equipe do tenant |
| `removeStaffAccess` | owner | Revoga o acesso (limpa claims + derruba sessões) |

O isolamento entre lojas é validado **no servidor**: um owner só enxerga e
altera contas do próprio `tenantId`. Toda operação grava no audit log do
tenant (`artifacts/{tenant}/private/audit/log`).

**Deploy** (exige plano Blaze — as functions têm free tier generoso):

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

No painel, a seção **Configurações → Equipe** (visível só para owner) consome
esses endpoints. Conta nova é criada sem senha — a pessoa define a dela pelo
**"Esqueci a senha"** na tela de login.

O `scripts/setup-claims.js` continua existindo para o **bootstrap do primeiro
owner de uma loja nova** (decisão de quem opera o SaaS, não do lojista).

Próximo passo natural do backend: endpoint de assinatura do QZ Tray
(`QZ_SIGN_ENDPOINT` no `index.html`) quando houver certificado, e App Check.

## Segurança

- XSS sanitizado via `escapeHtml()` em todos os pontos de saída HTML
- Validação de entrada em formulários (nome, preço, horários, WhatsApp, cor hex)
- Regras de acesso configuradas no **Firebase Firestore Rules** — update de pedido
  travado por `affectedKeys()` (cashier só muda status + auditoria de cancelamento;
  pedido cancelado é imutável)
- Login exige Custom Claim (`tenantId` + `role`) legível — sem claim, não entra
  (nada de fallback silencioso para outra loja)
- Favicon dinâmico com cor e letra validadas por regex antes de injetar no SVG
- Log de erros JS em `localStorage` para diagnóstico sem Sentry (PII redigida)

## Testes

Funções puras (assinatura de duplicata, horário de funcionamento, impressão,
sanitização) têm testes unitários extraídos direto do `index.html`, e as
validações do backend são testadas em `functions/helpers.test.mjs`:

```bash
node --test tests/*.test.mjs functions/*.test.mjs   # Node 18+, zero dependências
```

O GitHub Actions (`.github/workflows/ci.yml`) roda a suíte em cada push/PR.

## Impressora Térmica

Requer o [QZ Tray](https://qz.io/download/) instalado e rodando na máquina.
Na primeira conexão, clique em **Configurações → Detectar Impressoras**, selecione a impressora e salve.
Em produção, configure `QZ_CERT_PEM` e `QZ_SIGN_ENDPOINT` no código para eliminar o popup de segurança.
