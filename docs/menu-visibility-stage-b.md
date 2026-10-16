# Menu Visibility — Stage B

`GET/PUT /api/homolog/menu-visibility`

## Functional rules

| Rule | Behavior |
| --- | --- |
| Locked | `dashboard`, `configuracoes` — always `true`; PUT `false` → **400 `E_MENU_LOCKED`** |
| Independent | `sistema`, `configuracoes`, `ajuda` — no parent/child coupling in storage |
| Scope | Sidebar visibility only — **not** URL access, **not** RBAC |
| Children | Preferências de filhos permanecem no mapa quando o pai é ocultado |
| Roles | GET: SUPER_ADMIN, SUPPORT_ADMIN, READ_ONLY. PUT: SUPER_ADMIN only. FINANCIAL/COMPLIANCE: **sem acesso** |

## Concurrency

- GET returns `data.version` (0 se ainda não existe row).
- PUT exige `version` igual ao atual quando a row já existe → senão **409 `E_MENU_VERSION_CONFLICT`** + `currentVersion`.
- Sucesso incrementa `version`.

## Audit

Após persistência bem-sucedida, Audit é **best-effort**. Falha de Audit **não** devolve erro se o mapa já foi salvo.

## Deploy

`npx prisma migrate deploy` (coluna `version`).
