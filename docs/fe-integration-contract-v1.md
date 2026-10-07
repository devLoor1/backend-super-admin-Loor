# FE ↔ Control Plane integration contract V1

Audience: **Arthur (FE)** wires the Super Admin UI to Nest. Lucas (BE) owns Nest + Core internal APIs.

Frontend baseline: `super-admin-Loor` branch `dev@25b5e65` (all feature prototypes merged).  
Control Plane: Nest `backend-super-admin-Loor` global prefix `/api`, Swagger `/api/docs`.  
Default local: FE `http://localhost:5173` → Nest `http://localhost:3334` (`CORS_ORIGIN` already allows Vite).

## Status

| Layer | Status |
| --- | --- |
| FE prototypes | Done — still **in-memory**, no API client |
| Nest auth + Whitelabel reads | Ready for first wire-up |
| Nest Accounts / Settings / Emails / Finance routes | Scaffold aligned to FE paths; Core backing partial/missing |
| FE → Nest wiring | **Arthur** |
| Nest → Core for investors/settings/smtp/gateways | **Lucas** as Core endpoints land |

## Auth (first integration slice)

| FE screen | Nest |
| --- | --- |
| Login form `email` + `password` | `POST /api/auth/login` |
| After login → `#/dashboard` | Store `accessToken`; send `Authorization: Bearer <token>` |
| Operator chip / session | `GET /api/auth/me` |

Login body:

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

## Whitelabels (second slice)

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

## Accounts (FE Account Control)

FE: `#/whitelabels/:whitelabelId/accounts?tipo=investidores|empreendedores|administradores`

| Nest | Query |
| --- | --- |
| `GET /api/whitelabels/:whitelabelId/accounts` | `tipo` (FE) or `type=investor\|entrepreneur\|admin` |
| `GET /api/whitelabels/:whitelabelId/accounts/:accountId` | same `tipo` / `type` |

Requires Core internal investor/entrepreneur/admin reads. Until then Nest will surface Core/proxy errors — FE should show empty/error states, not mock as success.

## Settings / Emails / Finance (path alignment only)

| FE hash | Nest (config only) |
| --- | --- |
| `#/whitelabels/:id/settings` | `GET/PUT /api/whitelabels/:id/settings` |
| `#/whitelabels/:id/emails?section=smtp` | `GET/PUT /api/whitelabels/:id/emails/smtp` (+ `POST .../test`) |
| `#/whitelabels/:id/finance/gateways` | `GET/PUT /api/whitelabels/:id/finance/gateways` |

Secrets are write-only: never expect password/API key readback. Finance routes are **configuration/governance**, never wallet/payment mutation.

## Dashboard

`GET /api/dashboard` — needs Core aggregate (`Q-WL-04`). Until then keep empty KPI states.

## What Arthur should do

1. Add `VITE_API_BASE_URL=http://localhost:3334/api`.
2. API client: Bearer token, `X-Correlation-ID`, typed error `{ statusCode, code, message, correlationId }`.
3. Wire Login → token → navigate `#/dashboard` (replace prototype notice).
4. Wire Whitelabels list/detail; map Nest fields above; guard against `wl_proto_*`.
5. Leave pause/reassign/create WL writes until Product Qs + Core endpoints are ready.
6. Do not invent setup/draft status from the API.

## What stays on Backend

- Core `/internal/super-admin/v1/*` for investors, entrepreneurs, settings, SMTP, gateways, dashboard.
- Nest mappers/audit/RBAC.
- Homolog/dev env secrets (`JWT_*`, `LOOR_CORE_SERVICE_*`).
