# FE ↔ Control Plane integration contract V1

Audience: FE wires Super Admin UI to Nest. BE owns Nest + Core internal APIs.

| Repo | Branch | Role |
| --- | --- | --- |
| `super-admin-Loor` | `dev` | Frontend |
| `backend-super-admin-Loor` | `dev` | Nest Control Plane |
| Core Adonis (`backend`) | `dev` | Data Plane `/internal/super-admin/v1` |

Default local: FE `http://localhost:5173` → Nest `http://localhost:3334` (`CORS_ORIGIN` allows Vite) → Core `http://127.0.0.1:3333` (quando necessário).

Homolog **não** sobe automaticamente a partir de `dev` — deploy via branch `homolog`.

## Status

| Layer | Status |
| --- | --- |
| FE Login → Nest auth | **Done** — `loginWithCredentials`, session, route guard, header logout |
| Nest auth + operator JWT | **Done** — seed `superadmin@loor.local` |
| Nest Whitelabel / Accounts / Settings / SMTP / Gateways / Dashboard routes | Scaffold + proxies ready |
| Core `/internal/super-admin/v1/*` | **Done** on Core `dev` (reads/writes + account pause table) |
| FE Whitelabels list/detail | **Pending** — still prototype rows (`wl_proto_*`) |
| FE Contas / Settings / E-mails / Finance / Dashboard KPIs | **Pending** — local mock state |
| Account pause enforcement on Core actor login | **Pending** — row persisted; middleware not yet |

## Auth (integrated)

| FE | Nest |
| --- | --- |
| Login form `email` + `password` | `POST /api/auth/login` |
| After login → `#/dashboard` | Store `accessToken`; send `Authorization: Bearer <token>` |
| Operator chip / session | `GET /api/auth/me` |
| Header logout | Clear session → `#/` (login) |

Login body (dev seed):

```json
{ "email": "superadmin@loor.local", "password": "ChangeMeDevOnly!123" }
```

Login response:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": "8h",
  "operator": { "id": "...", "name": "...", "email": "...", "roles": ["super_admin"] }
}
```

Errors: `401` with `code: UNAUTHORIZED`. Do **not** call Core actor login (`/auth/admin` etc.).

FE env:

```bash
VITE_API_BASE_URL=http://localhost:3334/api
```

Client expectations: Bearer token, optional `X-Correlation-ID`, typed error `{ statusCode, code, message, correlationId }`.

## Whitelabels (next FE wire-up)

| FE | Nest |
| --- | --- |
| List / search / filter / sort | `GET /api/whitelabels?page&perPage&search&active&sort&order` |
| Detail / selection | `GET /api/whitelabels/:id` |

Response item (FE field mapping):

| Nest field | FE prototype field | Notes |
| --- | --- | --- |
| `id` / `idKey` | `id` | Use Core numeric id (`idKey` string). Drop `wl_proto_*`. |
| `name` | `name` | |
| `domain` | `domain` | Derived from `baseUrl` |
| `slug` | `slug` | |
| `status` | `status` | Only `active` \| `inactive` (no setup/draft from API) |
| `admins` | `admins` | number or treat 0 as empty if you want "—" |
| `applications` | `applications` | always `null` until Core aggregate exists |
| `integrations` | `integrations` | always `null` until Core aggregate exists |
| `updatedAt` | `updatedAt` | ISO or null |

List envelope:

```json
{
  "data": [ /* ControlPlaneWhitelabel */ ],
  "meta": { "page": 1, "perPage": 20, "total": 0, "lastPage": 1 }
}
```

Requires Core up + matching service JWT secrets (see Nest README).

## Accounts (FE Account Control)

FE: `#/whitelabels/:whitelabelId/accounts?tipo=investidores|empreendedores|administradores`

| Nest | Query |
| --- | --- |
| `GET /api/whitelabels/:whitelabelId/accounts` | `tipo` (FE) or `type=investor\|entrepreneur\|admin` |
| `GET /api/whitelabels/:whitelabelId/accounts/:accountId` | same `tipo` / `type` |

Pause/reactivate go through Nest → Core account-access endpoints. Until FE is wired, Nest/Core may already respond; FE should show empty/error states, not treat mock as success.

## Settings / Emails / Finance (path alignment)

| FE hash | Nest |
| --- | --- |
| `#/whitelabels/:id/settings` | `GET/PUT /api/whitelabels/:id/settings` |
| `#/whitelabels/:id/emails?section=smtp` | `GET/PUT /api/whitelabels/:id/emails/smtp` (+ `POST .../test`) |
| `#/whitelabels/:id/finance/gateways` | `GET/PUT /api/whitelabels/:id/finance/gateways` |

Secrets are write-only: never expect password/API key readback. Finance routes are **configuration/governance**, never wallet/payment mutation.

## Dashboard

`GET /api/dashboard` — Core aggregate. Until FE wires it, keep empty KPI states ("—", "Sem dados").

## How to run the stack (tech lead / local)

1. **Nest** (`backend-super-admin-Loor` / `dev`):
   `npm i` → `cp .env.example .env` → `docker compose up -d` → `npx prisma migrate dev` → `npm run prisma:seed` → `npm run start:dev`
2. **FE** (`super-admin-Loor` / `dev`):
   `npm i` → `cp .env.example .env` → `npm run dev` → login com seed
3. **Core** (opcional): Adonis `:3333` + `SUPER_ADMIN_SERVICE_JWT_*` = `LOOR_CORE_SERVICE_*` do Nest

Detalhes: README do Nest.

## Next FE work

1. Wire Whitelabels list/detail; map Nest fields; guard against `wl_proto_*`.
2. Wire Contas (list + pause/reactivate) against Nest accounts routes.
3. Wire Settings / SMTP / Gateways; keep secrets write-only.
4. Wire Dashboard KPIs when Core aggregate is acceptable for UI.
5. Leave create-WL / reassign writes until Product Qs are closed.
6. Do not invent setup/draft status from the API.

## Backend ownership

- Core `/internal/super-admin/v1/*` for investors, entrepreneurs, settings, SMTP, gateways, dashboard, account access.
- Nest mappers / audit / RBAC / `LoorCoreClient`.
- Homolog/dev env secrets (`JWT_*`, `LOOR_CORE_SERVICE_*` / `SUPER_ADMIN_SERVICE_JWT_*`).
