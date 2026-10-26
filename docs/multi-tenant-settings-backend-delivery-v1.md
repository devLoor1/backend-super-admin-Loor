# Multi-tenant Settings — Backend delivery (resposta ao handoff FE)

**Data:** 2026-10-26  
**Base FE:** `docs/multi-tenant-settings-backend-handoff.md`, `branding-contract-handoff.md`, `admin-parity-matrix.md`  
**Escopo entregue nesta tranche:** SET-01, SMTP-01, AST-01, LEG-01 (P0/P1).  
**Fora / Product gate:** BRD-01 (logo/favicon/PWA global), LEG-02 drafts/reacceptance, EML-01 templates, EML-02 events, SMTP-02 recipient policy.

---

## Ordem do handoff → status

| ID | Pri | Status Backend |
| --- | --- | --- |
| **SET-01** | P0 | **Entregue** — allowlist + validação + provenance GET + DELETE override + audit enxuto |
| **SMTP-01** | P0 | **Entregue** — GET sem username; PATCH metadata; audit sem credentials |
| **AST-01** | P1 | **Entregue** — Nest bridge multipart → PlatformAssetService |
| **LEG-01** | P1 | **Entregue** — GET/PUT `/terms-of-use` (publish); não via Settings PUT |
| **APP-01** | P1 | **Parcial** — rows App no allowlist; FE deve enviar value completo (full-row replace) |
| **SMTP-02** | P1 | Endpoint test já existia; recipient allowlist/cooldown = Product/Ops (não inventado) |
| **BRD-01** | P1/P2 | **Não** — Product define consumidores PWA/global antes de schema |
| **LEG-02 / EML-*** | P2 | **Não** nesta tranche |

---

## Contratos Nest (prefixo `/api`)

### SET-01
- `GET /whitelabels/:id/settings` → inclui `data.provenance[]` (`page,key,stored,storedValue?,effectiveValue,source,version`)
- `PUT /whitelabels/:id/settings` `{page,key,value}` — **só allowlist**; 422 se fora
- `DELETE /whitelabels/:id/settings/:page/:key/override` — remove override; resposta com `stored:false` + effective

Allowlist inicial: `login/*` (title,subtitle,bullets,layout_preset,brand_panel_text_color,main_area_image,entry_presentation), `register/*`, `quick_profile/*`, `features` (8 flags), `terminology/config`, `dashboard/components`, `offers/presentation`, `app_entry/content`, `app_authenticated/content`, `email_branding/config`.

### SMTP-01
- `GET …/emails/smtp` → **sem** `username`/`password`; `hasUsername`/`hasPassword`/`configured`/`version`
- `PATCH …/emails/smtp` → host/port/secure/from*/tls/active; credentials só `replaceUsername`/`replacePassword`
- `PUT` permanece para create/full upsert (ainda exige username no body de create)

### AST-01
- `POST /whitelabels/:id/platform/assets` multipart `image` + `slot=main_area`
- `GET/PUT/DELETE …/platform/assets/:assetRef`

### LEG-01
- `GET /whitelabels/:id/terms-of-use`
- `PUT /whitelabels/:id/terms-of-use` `{title,content_markdown,expectedCurrentRevisionId?}`  
  - 409 se expected ≠ current  
  - Audit: hash/length, **sem** markdown completo

---

## Deploy

1. Core AWS: pull + build + restart  
2. Nest Render: `homolog` / `dev`  

Smoke sugerido (WL 8 smoke only para writes): GET settings provenance; GET smtp sem username; PATCH smtp fromName (se config existir em tenant QA); GET terms; **não** publish legal em tenant compartilhado; upload asset só em WL descartável.
