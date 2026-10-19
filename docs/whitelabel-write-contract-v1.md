# Whitelabel write contract V1 (Control Plane + Core)

**Operational V1 (this cycle):** Create + **name-only** Update.  
Ver contrato operacional completo: [`whitelabel-operational-v1.md`](whitelabel-operational-v1.md).

**Status:** Backend pronto; FE habilita mutations **somente** após autorização Product de testes controlados em homolog.

| Nest | Core |
| --- | --- |
| `POST /api/whitelabels` | `POST /internal/super-admin/v1/whitelabels` |
| `PATCH /api/whitelabels/:id` | `PATCH /internal/super-admin/v1/whitelabels/:id` — Nest envia **somente** `{ name }` |
| `PATCH …/activate` \| `…/deactivate` \| `DELETE` | `PATCH …/status` `{ active }` — **FE OFF** neste ciclo |

`DELETE` Nest = **desativação lógica** (`isActive=false`). Sem exclusão física / sem cascade.

---

## Create body

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | trimmed; empty → `E_VALIDATION` |
| `slug` | yes | lowercased; **unique**; empty → `E_VALIDATION`; name **não** é único |
| `baseUrl` | yes | absolute `http`/`https`; empty → `E_VALIDATION` |
| `isActive` | no | default **`true`** (estado inicial ativo) |

**Omitted vs null vs `""`:** Nest ValidationPipe 400; Core `String(input)` + `trim()` → `''` → 422 `E_VALIDATION`.

Response: `{ data: ControlPlaneWhitelabel }` (mesmo shape do GET detail) + Audit `CREATE_WHITELABEL` best-effort.

Errors:

| Case | HTTP | code |
| --- | --- | --- |
| missing / invalid fields | 400 Nest / 422 Core | `E_VALIDATION` |
| slug duplicado | **409** | `E_SLUG_TAKEN` |

---

## Update body (Operational V1)

**Only** `{ "name": "..." }`.

- `slug` / `baseUrl` no body → **400** (`forbidNonWhitelisted`)
- Core ainda aceitaria slug/baseUrl se chamado direto — Nest **não encaminha**

---

## Activate / Deactivate

Body Core: `{ active: boolean }`. Idempotente. **FE OFF** neste ciclo.

---

## Audit

Após sucesso no Core, Audit é **best-effort**. Falha de Audit **não** altera HTTP 200/201 (log `whitelabel_audit_failed`).  
Core = source of truth da mutation.

---

## Lifecycle impacts (Core)

### Resolução de tenant

`findBySlug` / `findByBaseUrl` / `findDefault` filtram **`is_active = true`**.

### Recuperação de senha

`findByIdForMail` usa o WL da conta **mesmo inativo**; **não** faz fallback para o default.

### Whitelabel padrão

Desativar o padrão: fallback = menor `id` ativo. Product decide se default pode ser desativado (ciclo futuro).

### slug / baseUrl em tenant ativo

Fora do escopo Operational V1 (Nest bloqueia). Core ainda permite se chamado direto — Product decide restrições depois.

---

## Product open (fora deste ciclo FE)

1. Default WL pode ser desativado?
2. slug/baseUrl editáveis com tenant ativo?
3. Autorização explícita de testes controlados + limpeza de smoke rows.
4. Idempotency-Key / optimistic concurrency (pendências BE documentadas no operational doc).
