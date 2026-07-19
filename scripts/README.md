# Scripts de operação

## setup-claims.js — bootstrap de loja nova

Aplica `tenantId` e `role` (Custom Claims) via Admin SDK. Hoje serve para o
**bootstrap do primeiro owner de um tenant novo** — o dia a dia da equipe
(adicionar caixa/gerente, trocar papel, revogar) é feito pelo próprio dono no
painel (**Configurações → Equipe**), que chama o backend em `functions/`.

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

## Deploy do backend (Cloud Functions)

Exige o projeto no plano **Blaze** (o free tier das functions cobre folgado
uma loja).

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

## Ordem de deploy seguro

1. Setar claims em todos os usuários atuais (`setup-claims.js`).
2. Publicar o backend (`firebase deploy --only functions`) — a seção Equipe
   do painel depende dele.
3. Confirmar que o painel novo (`index`) está em algum host de staging.
4. Publicar as `firestore.rules`.
5. Substituir o painel em produção.

Inverter claims ↔ rules trava o painel até alguém logar com claim correto.
