# Regras de negócio V1 (stack atual)

Stack deste projeto (não a proposta Adonis do DOCX para o Control Plane):

```text
FE Super Admin → NestJS Control Plane → Adonis Core /internal/super-admin/v1 → MySQL Core
CP MySQL (Prisma): operadores, roles, audit
```

Frontend baseline puxado: `super-admin-Loor` `dev` (Login, Dashboard, Whitelabels, Accounts, Settings, Emails, Finance/Gateways).  
Todas as feature branches do FE foram fetchadas; a árvore canônica para integração é **`dev`**. O FE ainda é protótipo (**INTEGRATION PENDING**) — o wire-up HTTP é do Arthur.

## Fronteira (Arthur + arquitetura)

| Pertence ao Nest (CP) | Pertence ao Core | Pertence ao FE (Arthur) |
| --- | --- | --- |
| Login/JWT do operador LOØR | Investor, Entrepreneur, Opportunity, Wallet, Payment… | Client HTTP, token storage, rotas hash → API |
| RBAC do operador | Registry Whitelabel (id/slug/name/baseUrl/isActive) | Substituição dos stores in-memory |
| Audit do Control Plane | Regras financeiras / KYC / Terms legais | UX de erro/loading/empty |
| Orquestração + projeção segura | Persistência operacional | |

`Admin.isSuperAdmin` no Core **não** é operador do Control Plane.

## Entregue nesta fatia

### Core

- `InternalServiceAuth` — só service JWT (`iss=loor-super-admin`, `aud=loor-core`)
- `GET /internal/super-admin/v1/health`
- `GET /internal/super-admin/v1/whitelabels` (paginação, search, active)
- `GET /internal/super-admin/v1/whitelabels/:id`
- Status Core: apenas `active` | `inactive` (boolean `is_active`) — sem setup/draft inventado (Q-WL-02)

### Nest (alinhado ao FE)

- Auth: `POST /api/auth/login`, `GET /api/auth/me` (+ `expiresIn`)
- Whitelabel projeção FE: `idKey`, `domain`, `admins`, `applications`/`integrations` null, `status` active|inactive
- Accounts: `GET /api/whitelabels/:id/accounts?tipo=investidores|empreendedores|administradores`
- Settings path: `/api/whitelabels/:id/settings`
- Emails SMTP: `/api/whitelabels/:id/emails/smtp` (+ alias `/smtp`)
- Finance gateways: `/api/whitelabels/:id/finance/gateways`
- Contrato: [`fe-integration-contract-v1.md`](./fe-integration-contract-v1.md)

## Ainda bloqueado / próximo

| Item | Motivo |
| --- | --- |
| POST/PATCH Whitelabel no Core | Q-WL-01–03 (campos mutáveis, lifecycle) |
| Pause/reactivate contas | Q-PA + domínio novo no Core |
| Reassign tenant | Q-TR |
| Dashboard aggregates | Q-WL-04 |
| Investors/Entrepreneurs internal reads | próxima fatia de leitura Core |
| Settings / SMTP / Gateways Core exposure | handoff + Q-ST / Q-SM / Q-GW |
| FE client + auth guard | Arthur |

## Env alinhada

```text
# Nest
LOOR_CORE_SERVICE_SECRET=...
LOOR_CORE_SERVICE_ISSUER=loor-super-admin
LOOR_CORE_SERVICE_AUDIENCE=loor-core
CORS_ORIGIN=http://localhost:5173

# Core
SUPER_ADMIN_SERVICE_JWT_SECRET=...   # mesmo secret
SUPER_ADMIN_SERVICE_JWT_ISSUER=loor-super-admin
SUPER_ADMIN_SERVICE_JWT_AUDIENCE=loor-core

# FE (Arthur)
VITE_API_BASE_URL=http://localhost:3334/api
```
