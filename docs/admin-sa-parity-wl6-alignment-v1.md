# SA × Admin tenant parity — WL6 / homologacao (alignment v1)

Homolog only. No production. Read-oriented unless Product authorizes a write smoke.

## 1) Email preview logo (SA)

### Before
`POST /api/whitelabels/:id/emails/templates/preview` merged `brandingDraft`, applied color/logo via Core `EmailBrandingService`, then `isolatedPreviewHtml` removed every `<img>`. FE iframe used `img-src 'none'`. **No supported way to see the tenant email logo in SA preview.**

### Minimal extension (this cycle)
1. Core applies **color only** to the editorial HTML.
2. Core runs `isolatedPreviewHtml` (still strips all images/links/scripts).
3. Core prepends a single allowlisted band from `EmailBrandingService.previewTenantLogoHtml`:
   - `<img data-email-logo="1" src="…">` using stored or draft `logo_url` (http/https, no credentials).
   - Works even when the template has no 6px top strip (e.g. global default `#1` seed body).
4. Response keeps `externalImagesBlocked: true` and may include `previewTenantLogo: boolean`.
5. FE SA iframe must keep only `img[data-email-logo="1"]` and CSP `img-src https: http:`; all other media stay blocked.

### Color on model `#1`
`EmailBrandingService.apply` replaces literals `#1652f0`, `#0a46e4`, `#0039d7` only when `primary_color` is set and ≠ default. If the live `#1` `body_html` has none of those hex values, the QA color will not appear even with a valid draft — that is markup condition, not Nest persistence (preview does not save).

### Admin tenant preview
`POST /admin/email-templates/preview` still applies branding **without** SA isolation; not equivalent to SA. Out of scope for this SA allowlist change.

## 2) Terms — Admin of the own White Label

| Concern | Admin JWT | Super Admin (Nest → Core internal) |
| --- | --- | --- |
| Current revision | `GET /admin/terms-of-use` | `GET /api/whitelabels/:id/terms-of-use` (+ `history` ≤ 20) |
| Publish | `PUT /admin/terms-of-use` `{ title, content_markdown }` | `PUT …/terms-of-use` + optional `expectedCurrentRevisionId` → 409 stale |
| History | **Absent** | Present |
| CAS / concurrent edit | **Absent** | `E_TERMS_OF_USE_REVISION_STALE` |
| Auth | `auth:admin`; tenant = `admin.whitelabel_id` | SA roles via Nest |

**Integrable now:** Admin GET/PUT for current + publish.  
**Minimal extension if Product wants LEG-01 parity on Admin:** history on GET + `expected_current_revision_id` on PUT.

## 3) Platform vs Terms isolation (403 reconciliation)

| Route | Resolver | Uses `admin.whitelabelId`? | Effect with slug `homologacao` + account ≠ WL6 |
| --- | --- | --- | --- |
| `GET /admin/platform` | `AdminWhitelabelService.resolve` | **No** | **200** WL6 (slug wins) |
| `GET /admin/terms-of-use` | `resolveForAdmin` | **Yes** | **403** `E_RESOURCE_OUTSIDE_WHITELABEL` |
| `GET /admin/email-templates` | `resolveScope` → account WL only | **Yes** (slug ignored) | List = account tenant + global defaults |
| `POST /admin/email-templates/preview` | branding from account WL | **Yes** | Branding of account tenant |

### Terms 403 compared values
For non-super Admin: `own.id` from `admins.whitelabel_id` vs `requested.id` from explicit slug (`slug` | `platform_slug` | `x-whitelabel-slug`). Mismatch or null account WL → 403. Origin is not part of this check.

### How to recognize Admin WL6
No `/auth/admin/me`. Require `admins.whitelabel_id = 6`, `is_super_admin = false`, Admin token. Confirm via SA `GET /api/whitelabels/6/admins`. FE must not validate WL6 parity with a session bound to another tenant (e.g. WL4 Finapop).

### Email templates #13 vs #1
- `#13` `email_confirmation`, `wtlb_id=4`, `is_default=false` → outside WL6.
- WL6 list for that type = customs `wtlb_id=6` **or** global default (`wtlb_id IS NULL` AND `is_default`) → global `#1` without FINAPOP is expected, not a bad fallback.

## 4) Institutional brand / PWA

**Build-only** (`VITE_APP_LOGO_*`, `VITE_PWA_*`, etc.). No admin read/write contract per tenant. Runtime email identity remains `email_branding.config` only. BRD-01 stays out of this cycle.

## 5) FE / Backend split

| Item | Owner |
| --- | --- |
| Core preview logo allowlist + `previewTenantLogo` | Backend (Core) |
| Nest pass-through of preview payload | Backend (Nest, unchanged bridge) |
| FE iframe CSP / retain `data-email-logo` | Frontend SA |
| Session bound to WL6 before Admin parity checks | Frontend |
| Platform `resolve` ignoring account WL (gap) | Product/Backend follow-up if isolation hardening is required |
| Admin Terms history + CAS | Product gate |
| CorrelationId actor proof on a past 403 | Ops/logs when FE supplies ids |

## 6) Out of scope
CRUD Netlify flags, BRD-01, LEG-02, EML-* beyond preview, SMTP-02, production enablement.
