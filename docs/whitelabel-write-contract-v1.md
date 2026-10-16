# Whitelabel write contract V1 (Control Plane + Core)

**Status:** mutations existem, mas FE deve manter **desabilitadas** até Product autorizar testes controlados em homolog.

| Nest | Core |
| --- | --- |
| `POST /api/whitelabels` | `POST /internal/super-admin/v1/whitelabels` |
| `PATCH /api/whitelabels/:id` | `PATCH /internal/super-admin/v1/whitelabels/:id` |
| `PATCH …/activate` \| `…/deactivate` \| `DELETE` | `PATCH …/status` `{ active }` |

`DELETE` Nest = **desativação lógica** (`isActive=false`). Sem exclusão física / sem cascade.

---

## Create body

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | trimmed; empty → `E_VALIDATION` |
| `slug` | yes | lowercased; unique; empty → `E_VALIDATION` |
| `baseUrl` | yes | trimmed; empty → `E_VALIDATION` |
| `isActive` | no | default `true` |

**Omitted vs null vs `""`:** Core trata via `String(input)` + `trim()`. `null`/`undefined` → `''` → validation error. Não há partial-null semantics além disso.

Response: `{ data: Detail }` (mesmo shape do GET detail).  
Nest: `{ data: ControlPlaneWhitelabel }` + Audit `CREATE_WHITELABEL` (best-effort — falha de Audit **não** reverte HTTP se Core já persistiu).

Errors:

| Case | HTTP | code |
| --- | --- | --- |
| missing fields | 422 | `E_VALIDATION` |
| slug duplicado | **409** Nest / 422 Core | `E_SLUG_TAKEN` |

---

## Update body

Optional: `name`, `slug`, `baseUrl`. Campos omitidos não mudam.  
Slug/baseUrl **podem** ser alterados no Core atual mesmo com tenant ativo — **Product deve decidir restrições** (ver lifecycle).

---

## Activate / Deactivate

Body Core: `{ active: boolean }`.  
Repetir activate em já-ativo (ou deactivate em já-inativo) é **idempotente** — salva o mesmo valor, retorna detail atualizado.

---

## Lifecycle impacts (Core implantado)

### Resolução de tenant (`ResolveWhitelabelService`)

`findBySlug` / `findByBaseUrl` / `findDefault` filtram **`is_active = true`**.

Consequência de desativar:

- Host/slug do tenant **deixa de resolver** → cadastro, configs públicas e login por Origin/slug falham com whitelabel_not_found (exceto fluxos que usem id direto).

### Recuperação de senha (corrigido)

Antes: `findByIdOrDefault` → se WL inativo, **caía no tenant padrão** (risco de URL/visual de outro tenant).

Agora: `findByIdForMail` usa o WL da conta **mesmo inativo**; **não** faz fallback para o default.

### Whitelabel padrão (`DEFAULT_WHITELABEL_SLUG` / `findDefault`)

Desativar o padrão: fallback passa a ser o **menor `id` ativo**. Product deve decidir se o default pode ser desativado.

### slug / baseUrl em tenant ativo

Core **permite** PATCH. Impactos: Origin matching, mail links, bookmarks. Sem migração automática de URLs.

---

## Audit / erros Nest

- Após sucesso no Core, Audit é **best-effort** (log + segue 200/201).
- `E_SLUG_TAKEN` propagado (não vira `CORE_HTTP_ERROR` genérico).

---

## Product open questions (bloqueiam FE mutations)

1. Default WL pode ser desativado?
2. slug/baseUrl editáveis com tenant ativo? Precisa restrição ou migração?
3. Política de testes controlados em homolog.
