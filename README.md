# Pede-aí — Painel Administrativo

Painel admin single-file para o sistema de delivery **Pede-aí**.

## Funcionalidades

- **Pedidos em tempo real** — acompanhe e atualize o status de cada pedido (Novo → Preparo → Entrega → Concluído)
- **Relatórios financeiros** — faturamento, ticket médio, taxas de entrega, pedidos cancelados com valor perdido
- **Gráficos** — pedidos por hora, top produtos, formas de pagamento
- **Extrato de entregas** — tabela filtrável + exportação CSV com coluna de status (CONCLUIDO/CANCELADO)
- **Gestão de produtos** — cadastro individual ou importação em massa via CSV (até 500 linhas)
- **Foto do produto por upload** — envie a foto direto do aparelho; ela é comprimida no
  navegador e hospedada no **Firebase Storage** do próprio projeto (URL permanente — sem
  depender de link externo que quebra). Emoji ou URL externa continuam aceitos como alternativa
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

## Upload de foto de produto (setup único)

O upload usa o **Firebase Storage** do projeto. Antes do primeiro uso:

1. No [Console Firebase](https://console.firebase.google.com/) → **Build → Storage** →
   **Começar** (se o console pedir o plano Blaze, é exigência do Firebase para ativar o
   Storage em projetos novos; o uso de fotos comprimidas fica dentro/perto da faixa gratuita)
2. Publique as regras de acesso: `firebase deploy --only storage`
   (arquivo [`storage.rules`](storage.rules) — leitura pública das fotos, escrita só de
   owner/manager do próprio tenant, imagens até 2MB)

Sem esse setup o painel continua funcionando — o botão "Enviar Foto" avisa que o upload
falhou e o campo emoji/URL segue disponível. As fotos são comprimidas no navegador
(máx 800px, JPEG) antes de subir, e ficam em `tenants/{tenant}/products/`. Ao trocar a
foto ou excluir o produto, o arquivo antigo é removido do Storage automaticamente
(best-effort).

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
sanitização) têm testes unitários extraídos direto do `index.html`:

```bash
node --test tests/*.test.mjs   # Node 18+, zero dependências
```

O GitHub Actions (`.github/workflows/ci.yml`) roda a suíte em cada push/PR.

## Impressora Térmica

Requer o [QZ Tray](https://qz.io/download/) instalado e rodando na máquina.
Na primeira conexão, clique em **Configurações → Detectar Impressoras**, selecione a impressora e salve.
Em produção, configure `QZ_CERT_PEM` e `QZ_SIGN_ENDPOINT` no código para eliminar o popup de segurança.

## Backend (Cloud Functions)

O diretório [`functions/`](functions/) contém Cloud Functions v2 em TypeScript:

- **`setUserClaims`** — owner do tenant cria/revoga acesso de outros usuários (substitui `scripts/setup-claims.js`)
- **`listTenantUsers`** — lista usuários do tenant (owner/manager)
- **`onOrderWrite`** — trigger que grava audit log server-side de todo pedido

Ver [`functions/README.md`](functions/README.md) para setup, emulador e deploy.
