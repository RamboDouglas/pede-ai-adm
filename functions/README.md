# Cloud Functions — Pede-aí

Backend serverless do painel, rodando em Firebase Functions v2 (Node 20, TypeScript).

## Estrutura

```
functions/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts            # exports das functions
    ├── lib/
    │   ├── admin.ts        # init preguiçoso do firebase-admin
    │   ├── authz.ts        # helpers de checagem de role/tenant
    │   └── audit.ts        # helper de audit log append-only
    ├── setUserClaims.ts    # callable: owner define/revoga claims
    ├── listTenantUsers.ts  # callable: lista usuários do tenant
    └── onOrderWrite.ts     # trigger: audit log de pedidos
```

## Functions

### `setUserClaims` (callable, owner-only)
Substitui o `scripts/setup-claims.js`. O owner do tenant define `tenantId`+`role`
de outro usuário pelo email, ou revoga (`revoke: true`). Sempre carimba o
`tenantId` do próprio caller — não aceita esse campo do payload, então é
impossível elevar acesso pra outro tenant.

**Salvaguardas:**
- Owner não pode remover o próprio owner (previne lockout).
- Não sobrescreve usuário que já pertence a outro tenant.
- Revoga refresh tokens após alterar → próximo request força re-login com claim novo.

**Payload:**
```ts
{ email: 'gerente@loja.com', role: 'manager' }         // set
{ email: 'ex-funcionario@loja.com', revoke: true }     // revoke
```

### `listTenantUsers` (callable, owner/manager)
Lista usuários com `tenantId` == tenant do caller. Firebase Auth não indexa
custom claims, então varre todos e filtra — aceitável até dezenas de milhares
de usuários. Suporta paginação (`pageToken` do próprio Firebase Auth).

### `onOrderWrite` (Firestore trigger)
Escuta `artifacts/{tenant}/public/data/orders/{orderId}` e registra no
audit log privado do tenant: `order.create`, `order.status.change`,
`order.cancel`, `order.delete`. Complementa o audit feito pelo painel —
garante rastro server-side mesmo se o cliente falhar ou for adulterado.

## Setup local

```bash
cd functions
npm install
npm run build          # compila TS -> lib/
```

## Rodar no emulador

```bash
# na raiz do projeto
firebase emulators:start --only functions,firestore,auth
```

UI do emulador em http://localhost:4000. Callables ficam em
`http://localhost:5001/pede-ai-ff294/us-central1/<functionName>`.

## Deploy

Uma função por vez (recomendado até a primeira estabilizar):
```bash
firebase deploy --only functions:setUserClaims
```

Ou tudo:
```bash
firebase deploy --only functions
```

O predeploy do `firebase.json` roda `npm run build` automaticamente.

## Region

Todas as functions rodam em `us-central1` (default do Firebase). Se a latência
do painel Brasil→us-central for um problema, mudar em `src/index.ts`
(`setGlobalOptions`) e nas options de cada função para `southamerica-east1`
— cold starts em SA são mais lentos, então avalie.

## Chamando do frontend

```js
import { getFunctions, httpsCallable } from 'firebase/functions';
const functions = getFunctions(app, 'us-central1');
const setClaims = httpsCallable(functions, 'setUserClaims');
await setClaims({ email: 'novo@loja.com', role: 'cashier' });
```

## Segurança

- Todas as callables validam `auth.token.tenantId` e `auth.token.role` server-side.
  A rule já rejeita quem não tem claim, mas as functions checam de novo por defesa em profundidade.
- Nada de `tenantId` no payload — sempre vem do claim do caller.
- Audit log server-side é append-only. As rules bloqueiam update/delete inclusive pro owner.
