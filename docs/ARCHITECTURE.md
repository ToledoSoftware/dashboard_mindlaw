# Arquitetura MindLaw (web)

## Duas camadas HTTP

- **Next.js (App Router)** — UI em `app/`, APIs em `app/api/*`, autenticação com cookie `httpOnly` `mindlaw_token` e `middleware.ts` para páginas (exceto `/login` e integrações).
- **Express (`server.js`)** — legado com rotas em `routes/`; pode coexistir com o deploy. Novas funcionalidades devem preferir rotas Next.

## Dados

- **MongoDB** via Mongoose (`lib/mongodb.ts`, modelos em `models/` e `services/clientSync.js` carregados por `lib/cjsModels.ts`).

## Cliente

- O painel (`components/DashboardApp.tsx`) usa **TanStack Query** para dados do dashboard e **paginação em blocos** do endpoint `/api/logs` (`logsLimit` / `logsOffset`).
- Pedidos autenticados usam `credentials: "include"`; não é necessário JWT em `localStorage`.

## Migrações / scripts

- `sqlite3` está em **devDependencies**: usado por `migrate-data.js` e scripts de import, não pelo runtime do painel em produção.
