# Scripts de operação

## setup-claims.js
Aplica `tenantId` e `role` (Custom Claims) nos usuários do Firebase Auth.
**Rode antes de publicar as novas `firestore.rules`** — sem o claim, ninguém entra.

```bash
npm i firebase-admin
# Baixe a chave de service account no Console Firebase e salve como serviceAccountKey.json
# Project Settings > Service accounts > Generate new private key
echo serviceAccountKey.json >> ../.gitignore
node scripts/setup-claims.js
```

Roles aceitos: `owner` | `manager` | `cashier`.

## Deploy das rules

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## Ordem de deploy seguro

1. Setar claims em todos os usuários atuais (`setup-claims.js`).
2. Confirmar que o painel novo (`index`) está em algum host de staging.
3. Publicar as `firestore.rules`.
4. Substituir o painel em produção.

Inverter a ordem trava o painel até alguém logar com claim correto.
