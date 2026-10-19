# Whitelabel CRUD Operational V1 — Create + Name Update

**Status:** Backend ready for **controlled homolog tests** after Product authorization.  
FE must keep Activate / Deactivate / DELETE / slug·baseUrl edit **OFF**.

**Nest:** Control Plane Render · **Core:** AWS `back.loor.vc`

---

## Scope (this cycle)

| Operation | Nest | Allowed body |
| --- | --- | --- |
| Create | `POST /api/whitelabels` | `{ name, slug, baseUrl }` all required |
| Update name | `PATCH /api/whitelabels/:id` | `{ name }` **only** |
| Activate / Deactivate / DELETE | exist but **FE OFF** | — |
| Change slug / baseUrl | Nest **rejects** (`forbidNonWhitelisted`) | — |

Roles: **SUPER_ADMIN only** for Create/Update.  
Read (GET list/detail): SUPER_ADMIN / SUPPORT_ADMIN / READ_ONLY.

---

## 1. Contract (implanted)

### Create — `POST /api/whitelabels`

**Validations (Nest)**

| Field | Rules |
| --- | --- |
| `name` | string, trim, min 2, max 120 |
| `slug` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 80; Core lowercases |
| `baseUrl` | absolute `http`/`https`, protocol required, TLD optional (localhost OK); no credentials |

**Validations (Core)**

- Empty / whitespace-only after trim → 422 `E_VALIDATION`
- Duplicate slug → **409** `E_SLUG_TAKEN` (Nest propagates 409, not generic CORE_HTTP_ERROR)
- **Name is NOT unique** — only slug is

**Initial state**

- `isActive: true` (Core default)
- `status: "active"`
- Counts start at 0
- Tenant becomes resolvable by slug/baseUrl immediately if active

**Success — 201**

```json
{
  "data": {
    "id": 42,
    "idKey": "42",
    "slug": "sa-smoke-wl",
    "name": "SA Smoke WL",
    "baseUrl": "https://sa-smoke-wl.example.invalid",
    "domain": "sa-smoke-wl.example.invalid",
    "isActive": true,
    "status": "active",
    "counts": { "admins": 0, "investors": 0, "entrepreneurs": 0 },
    "admins": 0,
    "applications": null,
    "integrations": null,
    "createdAt": "2026-10-19T12:00:00.000Z",
    "updatedAt": "2026-10-19T12:00:00.000Z"
  }
}
```

Same shape as `GET /api/whitelabels/:id` (mapped).

**Absent / empty / null**

| Input | Nest | Core |
| --- | --- | --- |
| field omitted on create | 400 validation | — |
| `""` / whitespace | 400 (min length) or Core 422 | 422 `E_VALIDATION` |
| `null` | 400 | treated as empty → 422 |

### Update name — `PATCH /api/whitelabels/:id`

```http
PATCH /api/whitelabels/42
{ "name": "SA Smoke WL Renamed" }
```

**Success — 200** `{ data: ControlPlaneWhitelabel }` (slug/baseUrl unchanged).

**Extra fields** (`slug`, `baseUrl`, …) → **400** (`forbidNonWhitelisted`).

---

## 2. Errors

| Case | HTTP | code | Notes |
| --- | --- | --- | --- |
| Slug duplicado | **409** | `E_SLUG_TAKEN` | Safe retry signal for create with same slug |
| Validation | 400 Nest / 422 Core | `E_VALIDATION` | |
| Not found | 404 | `E_WHITELABEL_NOT_FOUND` | |
| Non-SUPER_ADMIN write | 403 | — | |
| Core timeout / 5xx | 502/503 | Core / `ServiceUnavailable` | See § uncertain |
| `wl_proto_*` id | 400 | `INVALID_WHITELABEL_ID` | |

### Resultado incerto (orientação formal)

FE **não** deve reenviar Create/Update automaticamente.

1. Guarde `X-Correlation-ID` da request.
2. **Create incerto:** `GET /api/whitelabels?search=<slug>` (ou list + filter).  
   - Encontrou o slug → criação **aplicada**; use o `id` retornado.  
   - Não encontrou → pode reenviar **uma** vez manualmente (mesmo slug → 409 se já existir).
3. **Update incerto:** `GET /api/whitelabels/:id` e compare `name` / `updatedAt`.
4. Não invente segundo Create com slug diferente para “compensar”.

Slug uniqueness é a proteção natural contra create duplicado. **Não há Idempotency-Key** neste ciclo (pendência explícita se Product exigir).

---

## 3. Audit — estratégia acordada

| Camada | Persistência |
| --- | --- |
| Core | Whitelabel row |
| Nest Control Plane | Audit log (`CREATE_WHITELABEL` / `UPDATE_WHITELABEL`) |

**Garantia operacional (já implantada):**

- Mutation **só é considerada falha** se o Core falhar.
- Após sucesso no Core, Audit é **best-effort** (`safeAudit`): falha de Audit → **log Nest** `whitelabel_audit_failed` + HTTP **continua 200/201**.
- FE pode tratar HTTP 2xx como **resultado real da operação**.
- Rastreio: `correlationId` + Audit `result: success|failed` + resourceId.

Não há transação distribuída única; o acordo é **Core = source of truth da mutation**, Audit = telemetria best-effort com log de falha.

---

## 4. Concorrência e idempotência

| Tema | Comportamento atual |
| --- | --- |
| Dois PATCH name simultâneos | **Last-write-wins** (sem version/ETag neste ciclo) |
| Versionamento | **Não** — pendência se Product exigir optimistic lock |
| Create repetido mesmo slug | **409** `E_SLUG_TAKEN` |
| Create incerto | Reconciliar via GET por slug (§2) |
| Conflitos FE deve tratar | 409 `E_SLUG_TAKEN`; 404; 400 validation; 403 |

Recomendação FE: refresh do detail antes de editar nome; confirmação before/after (proposta Product E).

---

## 5. Autorização

Confirmado: Create / Update / Activate / Deactivate / DELETE → **`SUPER_ADMIN` only**.  
GET list/detail → SUPER_ADMIN, SUPPORT_ADMIN, READ_ONLY.

---

## 6. Homologação controlada

### Pré-requisitos

1. Product autoriza testes controlados.
2. Nest + Core deployados com este contrato.
3. Conta SUPER_ADMIN de homolog.

### Cenário seguro sugerido

| Campo | Valor sugerido |
| --- | --- |
| `name` | `SA Operational Smoke` |
| `slug` | `sa-op-smoke-<YYYYMMDD>` (único) |
| `baseUrl` | `https://sa-op-smoke.example.invalid` |

- Slug/`example.invalid` **não** resolve DNS de tenant operacional.
- Não usar slug de tenants reais (loor, finapop, …).
- Após teste: `PATCH …/deactivate` **somente se Product autorizar** limpeza; ou deixar inativo documentado. Nesta V1 FE não expõe deactivate — limpeza via suporte BE/Product.

### Checklist

1. `POST` create → 201 + `data.id`
2. `GET /:id` → mesmo name/slug/baseUrl/`isActive=true`
3. `PATCH` `{ name }` → 200; slug/baseUrl intactos
4. `POST` mesmo slug → 409 `E_SLUG_TAKEN`
5. `PATCH` com `{ slug }` → 400
6. Audit CP: `CREATE_WHITELABEL` / `UPDATE_WHITELABEL` success (ou log se Audit falhar sem afetar HTTP)
7. Role não-SA → 403 na escrita

---

## Product A–F (posição técnica Backend)

| Item | Recomendação BE (Product decide) |
| --- | --- |
| **A** Escopo Create + name only | **Sim** — alinhado ao Nest Operational V1 |
| **B** URL http(s) absoluta | **Sim** — Nest exige protocol http/https; localhost OK; IPv6/IDN: Core aceita string, Nest `IsUrl` cobre a maioria; sem credenciais |
| **C** Slug manual vs sugestão | BE exige slug no Create; **sugestão no FE** a partir do nome é OK; após create permanece imutável neste ciclo |
| **D** Estado inicial | Core cria **`isActive=true`** — compatível com ciclo atual; inativo na criação exigiria `isActive:false` (não exposto no Nest Create DTO agora) |
| **E** Confirmação UI | Sem impacto BE — recomendado |
| **F** Só SUPER_ADMIN escreve | **Confirmado** |

---

## Pendências explícitas (próximos ciclos)

1. Idempotency-Key em Create/Update  
2. Optimistic concurrency (`version` / `updatedAt` precondition)  
3. Restrição Core de slug/baseUrl com tenant ativo  
4. Política Product: default WL deactivate; testes controlados; limpeza de smoke rows  
5. Activate/Deactivate/DELETE no FE
