# CFG — Qualificação de Configurações por Whitelabel (SA)

**Data:** 2026-10-26  
**Natureza:** qualificação por código + smoke homolog autenticado (leituras).  
**Nest inspecionado:** `dev` / `homolog` pós-`86aa366` (+ commits Gate A).  
**Core:** rotas internas SuperAdmin + services.  
**Smoke homolog:** 2026-10-26 — WL A `id=8` (`sa-op-smoke-…`), WL B `id=7` (`laguna-homologacao`).  
**Não feito neste ciclo:** writes de settings/SMTP/gateway/terms em tenant compartilhado; SHA exato do Core AWS além do health Nest↔Core.

---

## Resumo executivo

| ID | Pri | Status de qualificação | Caminho oficial |
| --- | --- | --- | --- |
| **CFG-01** | P0 | **Confirmado (smoke)** | GET WL + GET settings por id; isolamento A/B OK; 404 real |
| **CFG-02** | P0 | **Contrato Core confirmado** | PUT settings = **upsert por `page`+`key`+`value`** (não substitui o bag inteiro) |
| **CFG-03** | P0 | **Confirmado (smoke)** | GET SMTP sem password; `hasPassword` / `configured` |
| **CFG-04** | P1 | **Contrato Core confirmado** | PUT SMTP write-only password; omitido = mantém |
| **CFG-05** | P1 | **Contrato Core confirmado** | POST test envia e-mail **real**; só QA box |
| **CFG-06** | P1 | **Confirmado (código + smoke)** | `terms.current` + `history`≤20 no GET settings |
| **CFG-07** | P1 | **Ausente no SA/Nest** | Publish só Admin `PUT /admin/terms-of-use` — precisa endpoint SA ou decisão Product |
| **CFG-08** | P1 | **Parcial** | Campos Platform App espalhados no bag (`login`, `features`, `dashboard`…); sem rota dedicada |
| **CFG-09** | P1 | **Parcial** | Cores em `quick_profile.theme`; logo via URL/`main_area_image`; upload assets = Admin only |
| **CFG-10** | P2 | **Ausente SA** | Eventos não no Nest; mock-only |
| **CFG-11** | P2 | **Ausente SA** | Templates = Admin `/admin/email-templates` |
| **CFG-12** | P2 | **Confirmado (smoke)** | GET gateways seguro; PUT full-replace items (secrets → `[SET]`) |
| **CFG-13** | P2 | **Confirmado** | Helpers segments/resource-utilizations = **leitura**; não são CRUD |

---

## Path map (Nest → Core)

| Nest `/api` | Roles | Core `/internal/super-admin/v1` |
| --- | --- | --- |
| `GET/PUT /whitelabels/:id/settings` | GET: SA+RO · PUT: SA | `…/whitelabels/:id/settings` |
| `GET/PUT /whitelabels/:id/emails/smtp` (+ alias `/smtp`) | GET: SA+RO · PUT: SA | `…/smtp` |
| `POST …/emails/smtp/test` (+ alias) | SA | `…/smtp/test` |
| `GET/PUT …/finance/gateways` | GET: SA+FIN+RO · PUT: SA+FIN | `…/gateways` |

Fontes: `platform-config/*`, `smtp/*`, `gateway/*`, Core `Settings*`, `Smtp*`, `Gateway*`.

---

## CFG-01 — Identidade e isolamento

**Contrato**

- ID canônico = `whitelabelId` numérico nas rotas.
- GET settings devolve `data.whitelabel: { id, slug, name, baseUrl, isActive }` + bag + terms.
- WL inexistente → **404** `E_WHITELABEL_NOT_FOUND`.

**Smoke 2026-10-26**

| Check | Resultado |
| --- | --- |
| GET `/whitelabels/8` + `/settings` | 200; `returnedId=8`, slug smoke |
| GET `/whitelabels/7/settings` | 200; `returnedId=7`, slug `laguna-homologacao` |
| Cross-check | slugs/baseUrls distintos; sem mistura |
| GET `/whitelabels/999999999/settings` | 404 `E_WHITELABEL_NOT_FOUND` |
| health | database up / core up |

**Aceite FE:** sempre amarrar UI ao `id` do GET; validar `slug`/`baseUrl` autoritativos; nunca cachear settings de WL A ao navegar para B.

---

## CFG-02 — Settings write

**PUT body (único contrato oficial):**

```json
{ "page": "quick_profile", "key": "theme", "value": { "…": "…" } }
```

| Semântica | Valor |
| --- | --- |
| Escopo | **Uma** célula `(page, key)` |
| Merge bag? | **Não** — não envia o objeto settings inteiro |
| Deep-merge value? | **Não** — `value` substitui o JSON da célula |
| `value: null` | persiste null (limpa) |
| omitir value | N/A no create; no update Core usa `value !== undefined` |
| Resposta | `{ data: { id, page, key, value } }` — **não** é o GET bag |
| Readback | **GET** `/settings` após PUT |
| Whitelist page/key | Documentada em `types/platformSettings.ts`; **SA não enforce** whitelist hoje |
| Nest DTO | Ausente (`Record<string, unknown>`) |

Pages default no GET: `features`, `terminology`, `quick_profile`, `dashboard` (+ extras do DB: `login`, `gateways`, `email_branding`…).

**QA:** só WL descartável (`sa-op-smoke-*`); snapshot GET before → PUT 1 célula → GET after → diff só na célula → rollback PUT valor anterior. Sem retry automático em 5xx.

**Audit Nest:** `UPDATE_PLATFORM_CONFIG` com `afterData: body`; `AuditService` redige keys sensíveis por nome. Theme/markdown não-secretos entram no audit.

---

## CFG-03 — SMTP leitura

**Shape GET (smoke WL 7):**

```json
{
  "data": {
    "id": 6,
    "whitelabelId": 7,
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": 0,
    "username": "no-reply@loor.vc",
    "hasPassword": true,
    "fromEmail": "…",
    "fromName": "…",
    "tlsRejectUnauthorized": true,
    "active": true,
    "configured": true,
    "createdAt": "…",
    "updatedAt": "…"
  }
}
```

WL 8 (smoke sem config): `{ "data": null }`.

**Confirmado:** campo `password` **não** aparece. Alias `/smtp` ≡ `/emails/smtp`.

---

## CFG-04 / CFG-05 — SMTP write + test

**PUT:** `host`, `port`, `username`, `fromEmail` obrigatórios; `password` write-only (omitido = mantém; `""` → 422; create exige password).  
**POST test:** `{ "to": "qa@…" }` — envio **real** nodemailer; sucesso = transport accepted ≠ inbox delivery garantida.  
**Erros:** `E_EMAIL_CONFIG_MISSING`, `E_SMTP_TEST_FAILED` (424), `E_VALIDATION`.

**Restrição:** só caixa QA explícita; rate limit/ops; audit `TEST_SMTP` só `{ destination }`.

---

## CFG-06 / CFG-07 — Termos

**Leitura (CFG-06):** embutida em GET settings:

```json
"terms": { "current": null | { configured, revision_id, revision, title, content_markdown, published_at, updated_at }, "history": [ /* até 20 */ ] }
```

Smoke A/B: `current=null`, `history=[]` (não inventar revisão).

**Escrita/publicação (CFG-07):** **não existe** rota Nest/SA. Caminho Admin:

- `GET/PUT /admin/terms-of-use` → `TermsOfUseService.publish` (nova revisão monotônica, marca vigente).

**Proposta (Product):** `POST /api/whitelabels/:id/terms/revisions` + publish/activate — **não** publicar via PUT settings.

---

## CFG-08 / CFG-09 — Platform App + branding

| Capacidade | Onde |
| --- | --- |
| Flags / dashboard / terminology | bag settings |
| Cores perfil inicial | `settings.quick_profile.theme.{primaryColor,backgroundColor,textColor,…}` |
| Imagem área principal | keys `main_area_image` (login/register/quick_profile) — assetRef |
| Logo e-mail | `email_branding.config.logo_url` (se row existir) |
| Upload multipart assets | **Admin** `/admin/platform/assets` — **ausente** no SA |
| Favicon dedicado | **não** encontrado no catálogo de keys |
| Colunas logo/favicon no model Whitelabel | **não** |

**Proposta:** inventário campo↔Admin primeiro; upload SA só se Product exigir (proxy assets); senão PUT settings com URLs já hospedadas.

---

## CFG-10 / CFG-11 — Eventos / templates

Ausentes no Nest. Templates no Core Admin (`EmailTemplate*`). Mock FE não é contrato.  
Toggle/evento exige domínio de despacho Core antes de endpoint SA.

---

## CFG-12 — Gateways

Smoke: `{ whitelabelId, items: [], note: "Configuration only…" }`.  
PUT: full replace de `items`; keys secret-like → persistidas/retornadas como `[SET]` + `*Configured`.  
**Não** é vault de credencial real. Escrita sensível — fora do foco inicial; leitura OK.

---

## CFG-13 — Catálogos

`GET …/helpers/segments?whitelabelId=` e `…/resource-utilizations?whitelabelId=` = catálogos de leitura (Write V1).  
Smoke WL 8: segments `[]`, resource-utilizations com defaults.  
CRUD de catálogo (se Admin tiver) = contrato separado.

---

## Ordem recomendada (inalterada, com gates)

1. **CFG-01** — FE isolamento (já qualificável)  
2. **CFG-03** — SMTP read UI  
3. **CFG-02** — settings write **só** após fixture WL QA + procedimento snapshot/rollback  
4. **CFG-06** — terms read  
5. **CFG-07** — decisão Product + endpoint SA (novo)  
6. **CFG-08/09** — inventário Admin → endpoints só onde faltar  
7. **CFG-04/05** — SMTP write/test com caixa QA  
8. **CFG-10/11** — se Core despachar  
9. **CFG-12/13** — adjacente

---

## Commits / evidência smoke

- Correlação exemplo: `cfg-qual-*` (homolog 2026-10-26)  
- Nest health: `database=up`, `core=up`  
- Escrita de negócio: **não** executada neste smoke
