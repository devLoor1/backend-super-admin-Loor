# Operator Email Templates V1 — candidate contract

Not deployed until independently verified. Uses existing Core EmailTemplateService and EmailBrandingService; never Admin JWTs, mail delivery or event dispatch.

Base: `/api/whitelabels/:whitelabelId/emails/templates`. Numeric positive canonical tenant/template IDs only.

| Method | Suffix | Role | Success |
| --- | --- | --- | --- |
| GET | `/types` | SUPER_ADMIN, READ_ONLY | 200 `{data: Type[]}` |
| GET | `?type=<catalog type>` | SUPER_ADMIN, READ_ONLY | 200 `{data: Template[]}` |
| GET | `/:id` | SUPER_ADMIN, READ_ONLY | 200 `{data: Template}` |
| POST | `/preview` | SUPER_ADMIN, READ_ONLY | 200 `{data: Preview}` (no persistence) |
| POST | `` | SUPER_ADMIN | 201 `{data: Template}` |
| PATCH | `/:id` | SUPER_ADMIN | 200 `{data: Template}` |
| DELETE | `/:id` | SUPER_ADMIN | 200 `{data:{id,whitelabelId,deleted:true}}` |

`Type`: `{type,label,description,available_variables:string[],required_variables:string[],capabilityVersion:1}`. Catalog comes from Core (17 current types). `Template`: `{id,wtlb_id:number|null,name,type,subject,body_html,available_variables:string[],active:boolean,is_default:boolean,created_at:string|null,updated_at:string|null,version:string,capabilityVersion:1}`. No Admin identity, SMTP or credential fields. List contains exactly selected tenant rows and global defaults. Defaults can be read, never modified/deleted. No cross-tenant access even for SUPER_ADMIN.

Create: `{name,type,subject,body_html,active?:boolean}`. Inactive by default. PATCH: changed fields from `{name,subject,body_html,active}`; type immutable. Body HTML is bounded at 150000 characters, subject 1–512, name 1–256. A scoped 1 MiB JSON parser covers UTF-8 HTML; unrelated Nest routes retain their existing parser limit. Allowed/required placeholders come from catalog, with confirmation `url` also mandatory. Existing service owns activation semantics: `active:true` deactivates same-type tenant custom templates, without dispatching an event. Use inactive QA templates; do not alter effective tenant selection merely for testing.

Preview: `{type,subject,body_html,brandingDraft?:{primary_color?:string|null,logo_url?:string|null}}`. No user-supplied account data/variables. Server injects explicit synthetic examples for catalog variables, uses existing renderer and current email branding (or draft branding overlay), then strips executable content, links, stylesheet blocks and external image requests. Safe inline typography, table spacing and colors are retained. External logos/images are deliberately absent: the UI must label this boundary; this preview cannot prove a remote logo rendered in the mail consumer. Result: `{subject,body_html,renderSource:'core-email-template-service',sampleData:true,externalImagesBlocked:true,capabilityVersion:1}`. HTML must still be displayed in `iframe sandbox=""` with CSP `default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'`; never in app shell. Preview does not query recipients, create tokens, send mail or store history. `brandingDraft` omitted properties retain the stored value; explicit null clears that property for this preview only. Credential-bearing logo URLs are rejected.

Errors: 400 malformed numeric path or Nest DTO shape/bounds; 413 JSON over 1 MiB; 404 missing tenant/template or cross-tenant template; 422 Core editorial validation/HTML/placeholders or default mutation; standard 401/403 guards; 502 unavailable Core. No automatic mutation retries. `version` is informational, not an atomic precondition. GET-before-save and GET-after-save are required; preserve unknown state in independent settings composites.

Core internal equivalent: `/internal/super-admin/v1/whitelabels/:whitelabelId/emails/templates`. Service JWT only. Operator audit belongs to Nest and includes only tenant/template/type/changed field names, never HTML, subject, sample variables or secrets. Core Admin-FK attribution is null for this bridge; existing Admin callers unchanged.

Restoration: snapshot effective selection; create inactive disposable template, read, edit, read, delete only that same new ID, read/list confirms absence. Existing templates remain intact. No database migration, SMTP send, attachment generation, consent or legal publication.

## GitHub handoff, existing backlog and release order

Updated 27 October 2026. This is a reviewed candidate for Backend/Ops, **not a deployed bridge or live acceptance claim**. GitHub branches/PRs are the delivery source; no ZIP, workstation file, screenshot or private runtime log is required to review or retrieve the code. Both PRs target review into dev only. No merge, delivery-branch promotion or deployment is authorized by this publication step.

### Existing demand mapping — do not duplicate

The canonical mapping already exists in [SET-01/SMTP-01 contract, CFG ↔ handoff](set01-smtp01-fe-contract-v1.md#mapa-cfg--handoff-evitar-tarefas-duplicadas) and [Backend delivery status](multi-tenant-settings-backend-delivery-v1.md). Preserve those identifiers and previously accepted deliveries:

| Existing item | This candidate | Still outside this acceptance |
| --- | --- | --- |
| CFG-02 / SET-01 | Known-schema composite validation; retain scalar transport/provenance/reset | No replacement of the accepted SET cycle; no atomic-version guarantee |
| CFG-08 / APP-01 | Validate supported existing App composites without dropping unknown fields | Actual consumer acceptance remains separate |
| CFG-09 / AST-01 | Core tenant ownership/normalization for existing entry-asset associations | Positive hosted asset/consumer acceptance; not global PWA branding |
| CFG-03/04 / SMTP-01 | Preserve the previously accepted safe read/write contract | No new SMTP write or requalification in this patch |
| CFG-06/07 / LEG-01 | Preserve the existing Terms contract | No legal publication in this patch |
| CFG-11 / EML-01 | Operator Nest/internal-Core template types/list/detail/preview/create/update/delete using existing renderer | Isolated persistence/restoration acceptance and deployment |
| EMB-01 | Reuse email-only branding in the existing renderer, safe logo attribute escaping | External-logo rendering is deliberately blocked in the preview |
| CFG-09 / BRD-01 | No global identity implementation | Product must define logo/favicon/PWA consumers and contract |
| CFG-05 / SMTP-02 | No send implementation or execution | Recipient policy, allowlist and cooldown remain Product/Ops gates |
| CFG-06/07 / LEG-02 | No drafts/reacceptance implementation | Separate legal workflow and contract |
| CFG-10 / EML-02 | No event suppression implementation or execution | Event scope and delivery policy remain separate |

Historical source capabilities are [Core issue #36 — Admin platform](https://github.com/devLoor1/backend/issues/36) and [Core issue #38 — personalized email templates](https://github.com/devLoor1/backend/issues/38). Those issues are closed and remain closed; this operator integration reuses their existing services. These are references, not automatic closing/reopening directives or duplicate demands. CFG-10/EML-02 event suppression, SMTP-02 recipient/send policy, BRD-01 global identity and LEG-02 legal reacceptance remain distinct policy work; this patch does not implement or resolve them.

### Exact candidates and dependencies

| Component | Reviewed base | Code commit | Temporary review branch |
| --- | --- | --- | --- |
| Core, devLoor1/backend | eab5d3d64f15a1c6adf2338234e2deb614c1a709 | 39da223138afa954506ed6c7bb02c404092e7d8a | [feature/ast-settings-email-core-v1](https://github.com/devLoor1/backend/tree/feature/ast-settings-email-core-v1) |
| Nest, devLoor1/backend-super-admin-Loor | 47c4bea3e1200fda27a68eed292e14df2b02f0d8 | c92b1c4e03e606319ce9648824993e9ad5132cc6 | [feature/ast-settings-email-nest-v1](https://github.com/devLoor1/backend-super-admin-Loor/tree/feature/ast-settings-email-nest-v1) |

Subsequent handoff-only commits preserve these code commits. Review current branch/PR HEAD for documentation changes. Core and Nest remain separate repositories and patches. Fetch current delivery refs before later integration; preserve concurrent changes rather than force-pushing or rewriting history. Temporary branches are for review/recovery and may be removed through normal repository cleanup only after accepted integration.

Core exact source/asset contract: [ast-settings-composite-contract-v1.md](https://github.com/devLoor1/backend/blob/feature/ast-settings-email-core-v1/docs/ast-settings-composite-contract-v1.md). Nest implementation: [src/modules/email-templates](../src/modules/email-templates). The dependent frontend candidate remains local; its operational dev baseline is fe7a9a839c5f5595825661c136aa1107c5071c6f. No frontend publication is included in these PRs.

### Tests performed and exact pending gates

| Component/check | Result | Boundary |
| --- | --- | --- |
| Core AST focused suite | 26/26 passed | Real validators/services with isolated in-memory models, no DB/HTTP/upload |
| Core Email focused suite | 14/14 passed | Existing renderer/sanitizer and controller/service logic with in-memory adapters, no mail |
| Core syntax and scoped lint | Eight changed TS files transpile; zero new lint findings, 11 retained baseline errors | Scoped lint disables project allocation; not a full typed-lint pass |
| Core final style correction | Compiled JS structure equivalent; unchanged control regex verified across 65,536 cases | Only braces/line wrapping and one explained local regex-rule suppression |
| Core semantic typecheck | OOM/exit 134 with a 384 MiB heap before diagnostics | NOT passed; larger run deferred because of machine memory pressure |
| Core production build / DB integration | Not run | Required before Core publication in an appropriate isolated environment |
| Nest full maintained unit Jest | 7 suites / 34 tests passed, final run 16.617 seconds | Real isolated HTTP parser/DTO/role checks; no AppModule/DB |
| Nest semantic TypeScript | Passed | Includes new tests |
| Nest production build | Passed | Node 22.23.4 / npm 10.9.9 |
| Nest full configured lint | 207 existing errors / 3 existing warnings; seven new files clean | Not globally passing; finding files and modified main.ts compared against baseline |
| Nest supplemental source/service/role checks | 8 passed | Not a substitute for deployed contract acceptance |
| Nest AppModule/Prisma e2e | Not run | Requires an isolated database/environment |
| Both repositories | Diff checks pass; package/lockfiles unchanged | No new dependency or migration |

The local Nest install had incomplete declarations after a disk-space interruption. The exact lock-pinned package was repaired from its integrity-verified official archive; final TypeScript/build results above are after repair. No TLS bypass, authentication/CORS change or global runtime modification was used. Machine-specific install logs/paths are intentionally excluded from this handoff.

Reproducible focused commands, run from the appropriate repository:

- Core: node scripts/check-ast-settings-contract.cjs; node scripts/check-email-template-contract.cjs; then npx tsc --noEmit --incremental false, npm run lint and npm run build with the supported Core toolchain.
- Nest (Node 22): `npx prisma generate`; `npm test -- --runInBand`; `npx tsc --noEmit --incremental false`; `npx eslint "{src,apps,libs,test}/**/*.ts"` without `--fix`; `npm run build`. Client generation is not a migration. The repository's `npm run lint` currently includes `--fix`, so use the explicit read-only command for review.

Do not run Core's default Japa bootstrap against a shared database: it migrates/truncates test fixtures. Run DB integration only against an explicitly isolated test environment. Inherited lint debt is documented, not silently waived or broadened by unrelated cleanup. No unchanged frontend suite needs repeating for these documentation-only publication commits.

### Publication order for the responsible owners — not executed here

1. **Backend/Ops owns Core publication**, as explicitly confirmed by the user. Complete the pending Core semantic/build and isolated-environment gates, review against fresh dev, then use the existing AWS pull/build/restart procedure. The actual checkout and service supervisor must come from Ops; no guessed SSH/PM2 command, migration or infrastructure change is supplied.
2. Verify deployed Core revision and the authenticated internal service-JWT catalog/list/preview contract. Record only commit, status, safe shape and correlation; never credentials or raw tokens.
3. After compatible Core is available, integrate the reviewed Nest patch and promote through the established **homolog** branch/Render flow. A dev push alone does not deploy Nest homolog. Confirm the running revision before the frontend relies on it. This PR publication itself performs neither merge nor deployment.
4. Verify operator GET access, SUPER_ADMIN-only writes, READ_ONLY reads/preview, immutable global defaults and cross-tenant denial. Then complete one authorized isolated inactive-template create/read/edit/read/delete/restoration cycle and the scoped AST lifecycle. Reconcile uncertain results by GET; do not blindly retry mutations or send mail. Reuse accepted SET/SMTP evidence.
5. Qualify the actual intended consumer separately from stored JSON/local previews. The historical disposable tenant is inactive and public resolution requires an active tenant; do not activate it, change DNS/slug or alter shared-tenant branding for convenience. A supported isolated consumer path remains necessary for that acceptance.
6. Only after compatible running contracts and applicable acceptance gates pass may the frontend owner publish the dependent operational dev build through the normal Netlify flow and verify its exact assets/authenticated UI. No operational frontend publication occurs in this GitHub handoff.

No live configuration/template/asset write, mail/event, recipient/token creation, tenant activation, legal publication or financial operation occurred during this implementation/publication. There is no live restoration debt. SET-01/SMTP-01, Menu Visibility v5/23, protected branches and unrelated worktrees remain preserved. **AST-01 live acceptance and broader redesign live acceptance both remain pending; the overall delivery is partial.**
