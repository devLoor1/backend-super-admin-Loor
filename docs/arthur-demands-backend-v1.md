# Super Admin — entregas Back-end (Arthur demandas P0/P1)

Ambiente alvo: Nest Control Plane `https://backend-super-admin-loor.onrender.com/api` → Core `https://back.loor.vc/service`.

**Importante:** rotas Core novas precisam estar deployadas na AWS homolog. Nest precisa de `prisma migrate deploy` (tabela `menu_visibility_configs`) no Render.

---

## Demanda 1 — CRUD Whitelabels

### Endpoints públicos (Nest)

| Method | Path | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/api/whitelabels` | SA / Support / RO | Preservado |
| GET | `/api/whitelabels/:id` | SA / Support / RO | Preservado |
| POST | `/api/whitelabels` | SUPER_ADMIN | body: `{ name, slug, baseUrl }` |
| PATCH | `/api/whitelabels/:id` | SUPER_ADMIN | `{ name?, slug?, baseUrl? }` |
| PATCH | `/api/whitelabels/:id/activate` | SUPER_ADMIN | logical |
| PATCH | `/api/whitelabels/:id/deactivate` | SUPER_ADMIN | logical |
| DELETE | `/api/whitelabels/:id` | SUPER_ADMIN | **Alias de deactivate** — sem exclusão física / sem cascade |

### Semântica de exclusão

**Desativação lógica** (`isActive=false`). Não apaga Accounts, Investors, Entrepreneurs, Companies, Opportunities, Investments, Payments, Wallets.

### Audit

`CREATE_WHITELABEL`, `UPDATE_WHITELABEL`, `ENABLE_WHITELABEL`, `DISABLE_WHITELABEL` com `whitelabelId`, `beforeData` (quando disponível), `afterData`.

### Erros

| Situação | Código |
| --- | --- |
| ID inexistente | 404 |
| slug duplicado | 422 `E_SLUG_TAKEN` |
| payload inválido | 400 |

Mutations retornam `{ data: ControlPlaneWhitelabel }`.

---

## Demanda 2 — Empresas

### Cardinalidade (oficial)

**1 Entrepreneur → 0..1 Company** (`entrepreneur_company_informations.entrepreneur_id` UNIQUE).  
Ausência de row = sem empresa (nunca inventar).

### Endpoints

| Method | Path |
| --- | --- |
| GET | `/api/companies` |
| GET | `/api/companies/:id` |
| GET | `/api/entrepreneurs/:entrepreneurId/company` |

Core: `/internal/super-admin/v1/companies`, `…/companies/:id`, `…/entrepreneurs/:entrepreneurId/company`.

### Query (list)

`page`, `perPage` (max 100), `search` (legalName / tradeName / cnpj), `whitelabelId`, `status`, `sort` (`createdAt`\|`updatedAt`\|`cnpj`\|`legalName`), `order`.

Nest **aceita e encaminha** `whitelabelId` / `status`; Core **aplica** o filtro. `meta` reflete o conjunto filtrado. Status fora do vocabulário → **400**.

### Status vocabulary

`pending` | `validated` | `invalid` | `not_found` | `unavailable`

### Campos

`id`, `entrepreneurId`, `whitelabelId`, `legalName`, `tradeName`, `cnpj`, `status`, `createdAt`, `updatedAt` (+ detail: `phone`, `email`, `validationSource`, `validatedAt`).

### Envelope extra

List/detail/`byEntrepreneur` incluem `cardinality` (documentado):

```json
{
  "entrepreneurToCompany": "0..1",
  "companyToEntrepreneur": "1",
  "note": "entrepreneur_company_informations.entrepreneur_id is UNIQUE. Absence of a row means no company — never invent one."
}
```

### GET `/api/entrepreneurs/:entrepreneurId/company`

| Case | HTTP | Body / code |
| --- | --- | --- |
| `entrepreneurId` inválido | 400 | `E_VALIDATION` |
| Empreendedor inexistente | 404 | `E_ENTREPRENEUR_NOT_FOUND` |
| Empreendedor existe **sem** empresa | **200** | `{ "data": null, "cardinality": {…} }` |
| Empreendedor com empresa | 200 | `{ "data": {…}, "cardinality": {…} }` |

Sem CRUD de Company nesta entrega.

---

## Demanda 3 — Opportunities

Já entregue — ver `opportunities-read-contract-v1.md`.

---

## Demanda 4 — Financeiro READ-ONLY

Contrato completo e atualizado: [`finance-read-contract-v1.md`](finance-read-contract-v1.md).

**Investment ≠ Payment ≠ Wallet Balance ≠ Wallet Movement.**  
Money: **centavos** + `BRL`. Filtros oficiais **aplicados** (não ignorados).  
Movements: CPF **mascarado**; `search`/`sort`/`order` → **400**.  
`GET /api/wallets/:id/investments` = alias de Investments com `whitelabelId=:id`.

---

## Demanda 5 — Menu Visibility (P1)

Persistido no **Control Plane** (Prisma), não no Core.

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/api/homolog/menu-visibility` | SA / Support / RO |
| PUT | `/api/homolog/menu-visibility` | SUPER_ADMIN only |

PUT recebe **mapa completo** (idempotente). IDs desconhecidos → 400. Non-boolean → 400.  
IDs conhecidos sem config → default **visible**.  
Visibilidade ≠ autorização (RBAC permanece).

Audit: `UPDATE_MENU_VISIBILITY` com before/after + diff.

IDs estáveis: ver `src/modules/menu-visibility/menu-ids.ts`.

Deploy Nest: `npx prisma migrate deploy`.

---

## Checklist homolog

1. Core AWS: `git pull` + `ace build` + `pm2 restart all` (rotas companies/investments/payments/wallets).
2. Nest Render: deploy branch + **migrate** menu_visibility.
3. Smoke:
   - `GET /api/companies`
   - `GET /api/investments`
   - `GET /api/payments`
   - `GET /api/wallets`
   - `GET /api/homolog/menu-visibility`
   - Whitelabel POST/PATCH/DELETE (deactivate)
