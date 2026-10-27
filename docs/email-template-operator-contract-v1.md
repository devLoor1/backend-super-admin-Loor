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

## Candidate ownership and release sequence (2026-10-27)

- Core repository `devLoor1/backend`: candidate branch `feature/ast-settings-email-core-v1`, baseline `eab5d3d64f15a1c6adf2338234e2deb614c1a709`. Email-owned paths: `app/Controllers/Http/Internal/SuperAdmin/EmailTemplateController.ts`, `app/Services/Internal/SuperAdmin/EmailTemplateContract.ts`, `app/Services/EmailTemplate/EmailTemplateService.ts`, `app/Services/EmailBrandingService.ts`, email route block in `start/routes/internal/superAdmin.ts`, `scripts/check-email-template-contract.cjs`. Settings paths in the shared worktree belong to the parallel Settings correction.
- Nest repository `devLoor1/backend-super-admin-Loor`: candidate branch `feature/ast-settings-email-nest-v1`, baseline `47c4bea3e1200fda27a68eed292e14df2b02f0d8`. Module `src/modules/email-templates/`, registration in `src/app.module.ts`, scoped parser registration in `src/main.ts`, `scripts/check-email-template-bridge.cjs`, this contract. Candidate changes are uncommitted and unpublished pending coordinating review; neither baseline SHA identifies deployed bridge code.
- Current Admin source reference inspected: `7b1c792fa07b51cc40a978d85fe5f4495dcae543`, including `EmailBrandingSettings.tsx`, `emailConfirmationTemplateModel.ts` and `linkedTemplateModel.ts`. Existing Admin `email_branding/config` storage and Core `EmailBrandingService` remain the consumer contract. The bridge does not replace Admin auth or SMTP.

Before release, the Backend owner must review the maintained-check outcomes below and complete the isolated-environment and deployed-contract gates. Nest requires Node 22. Earlier focused evidence remains useful but distinct: Core `node scripts/check-email-template-contract.cjs` passed 14 source/service/controller/sanitizer checks, using the real sanitizer with in-memory model adapters; Nest `node scripts/check-email-template-bridge.cjs` passed 8 source/service/role checks. The Nest harness accepts `EMAIL_BRIDGE_TYPESCRIPT_PATH` only to reuse an already installed TypeScript module when this checkout has no dependencies. These focused scripts do not establish deployed HTTP or database acceptance. Core needs its maintained checks and isolated test-database acceptance as well as the focused script. Do not run the Core Japa bootstrap against a shared database: it migrates/truncates fixtures.

Initial validation limitation, superseded by the final results below: dependency install first encountered a Node CA-chain issue; a process-scoped `--use-system-ca` retained TLS verification and resolved registry access. Installation then stopped with `ENOSPC`, leaving no usable Nest installation. `package-lock.json` was unchanged. Automatic approval review rejected removal of the generated dependency directory; the user subsequently removed it manually. Work then stopped on dependency installation until the separate authorized resumption recorded below. No global Node change, TLS bypass, migration, seed or live application write was performed. At that checkpoint the maintained Nest gates had not run, and the earlier focused Core lint had been interrupted without a result.

### Latest resumed installation checkpoint — 2026-10-27

After the user freed disk space, one further bounded installation was authorized. It started at 09:25:52 America/Sao_Paulo (12:25:52 UTC), with **2,177,347,584 bytes free** on C:. Command, scoped only to that shell:

```powershell
$env:NODE_OPTIONS='--use-system-ca --max-old-space-size=768'
npm ci --ignore-scripts --no-audit --no-fund
```

The installed runtime was **Node 24.15.0 / npm 11.12.1**; Nest declares **Node 22.x**, so this is not supported-runtime acceptance. No global runtime or npm configuration was changed. npm automatically refetched incomplete cached tarballs left by the prior ENOSPC attempt; there was no cache-clear command. Progress was observed as HTTP 200 package downloads taking 251–648 seconds. The local log is `C:/Users/User/AppData/Local/npm-cache/_logs/2026-10-27T12_25_53_449Z-debug-0.log`.

Disk free space subsequently measured 1,976,754,176 bytes, then **215,461,888 bytes (about 205 MiB)**. The installation was deliberately interrupted with Ctrl-C, exit 1, before another ENOSPC appeared. This was an interrupted attempt, not a successful install and not a completed test run. The partial `node_modules` directory and all sources were preserved; no further deletion or installation was performed. Approximately 2.03 GiB free at start proved insufficient for this attempt under the observed machine load. A reliable minimum has not been measured; completing installation and checks requires additional headroom rather than treating 2 GiB as a qualified minimum.

Evidence retained: **Core 14 focused checks passed; Nest 8 focused source/service/RBAC/audit checks passed; 7 Nest email TypeScript files passed transpilation-syntax checks**. These are distinct from semantic typechecking and actual HTTP/DTO execution. **Full Nest Jest, typecheck, lint and build remain pending and were not started in the resumed attempt.** The scoped parser's actual Nest HTTP test exists but has not run. Package-lock contents were not changed. All Core/Nest candidate changes remain **uncommitted and not deployed**. No mail, database migration, seed, recipient operation or live application mutation occurred.

### Supported-runtime recovery after capacity restoration — completed

The coordinator subsequently measured 9,988,591,616 bytes free and authorized one recovery installation. No installed Node 22 was found in the system or existing Codex/node-manager caches. An official portable **Node 22.23.4 / npm 10.9.9** was downloaded into `C:/Users/User/Desktop/Loor/tmp/email-bridge-runtime-node22/node-v22.23.4-win-x64`. The archive from `https://nodejs.org/dist/v22.23.4/node-v22.23.4-win-x64.zip` matched the official SHA-256 **`cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`**, obtained from Node's HTTPS checksums. Node's `--use-system-ca` verified HTTPS successfully; no TLS verification was disabled. The global Node installation was not changed.

Recovery used that portable runtime with process-only PATH and `NODE_OPTIONS=--use-system-ca --max-old-space-size=768`, running **`npm install --ignore-scripts --no-save --no-audit --no-fund --prefer-offline`** to reuse the partial dependency tree instead of deleting it with `npm ci`. It completed with **exit 0, 56 packages recovered in 12 minutes**, and the original `package-lock.json` SHA-256 was identical before and after. Log: `C:/Users/User/AppData/Local/npm-cache/_logs/2026-10-27T13_33_17_125Z-debug-0.log`. C: had **9,408,880,640 bytes free** afterward. The earlier capacity and unsupported-runtime installation blockers are resolved.

The first semantic TypeScript run then exposed declaration files missing inside the previously interrupted `@nestjs/common` package, despite runtime unit tests passing. Only **`@nestjs/common@11.2.7`** was restored by overlaying its exact lock-pinned registry archive, with no directory deletion. All 379 archive entries were checked for safe package-relative paths, and its SHA-512 matched the lock: `sha512-CGOa0I/5Ac43ydfpjztozOrvgDWYBdY9ktkO0OrRqRo1d8n5cphtrTGYHOwKLMIel0BpSYZoQymJ9Dywv/BzLw==`. No source workaround, dependency-version change or lockfile change was made. The final TypeScript and build runs below passed with the repaired declarations.

### Final local Nest validation — 2026-10-27

All commands ran sequentially in the Nest candidate worktree using the portable Node **22.23.4** above. Set `$runtimeDirectory` to that directory, prepend it to process-only `PATH`, and set `$env:NODE_OPTIONS='--use-system-ca --max-old-space-size=768'`. In the table, `node` refers to that runtime, not the machine's global Node 24.

| Check | Exact command | Result |
| --- | --- | --- |
| Prisma client generation | `node node_modules/prisma/build/index.js generate` | Exit 0; Prisma Client 6.19.3 generated from the local schema. No DB connection, migration or seed. |
| Full maintained unit Jest suite, final rerun | `node node_modules/jest/bin/jest.js --runInBand --no-cache --silent` | Exit 0; **7 suites, 34 tests passed**, 16.617 s. Includes real isolated Nest HTTP parser, DTO and role-guard tests. Expected 413/audit-outage logs come from negative tests. |
| Semantic TypeScript, final rerun | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | Exit 0, including test files. |
| Full configured lint scope, no auto-fix | `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts" --format json --output-file C:/Users/User/Desktop/Loor/tmp/email-bridge-runtime-node22/nest-eslint-results-final.json` | Exit 1; **207 existing errors, 3 existing warnings across 123 files**. All **7 new email files: 0 errors, 0 warnings**. No rules disabled or legacy files reformatted. |
| Production build | `npm run build` (portable npm 10.9.9; runs `nest build`) | Exit 0. |
| Diff and lock | `git diff --check`; `git diff -- package-lock.json` | Exit 0; no whitespace errors and no lockfile diff. |

Lint provenance was checked against Nest baseline `47c4bea3e1200fda27a68eed292e14df2b02f0d8`: the 62 other files with findings match baseline contents after line-ending normalization. For the modified `src/main.ts`, linting the baseline text with matching CRLF produced exactly the same rule/severity/message findings as the candidate: the pre-existing CORS formatting error and unhandled-bootstrap-promise warning. `src/app.module.ts` and every new email file are clean. The full lint gate is therefore **not passing**; the candidate adds no lint findings. The final machine-readable report is `C:/Users/User/Desktop/Loor/tmp/email-bridge-runtime-node22/nest-eslint-results-final.json`; baseline comparison script is alongside it as `compare-nest-lint.cjs`.

The separate `npm run test:e2e` suite was deliberately **not run**: it imports `AppModule` and checks the real Prisma database health. It requires an explicitly isolated test database/environment. Core's Japa suite likewise remains an isolated-environment gate; the coordinating Core validation report records its static-check outcomes. No application DB bootstrap, migration, seed, real recipient/token operation, live template write, mail send or remote publication occurred. All Nest/Core candidate changes are still **uncommitted and not deployed at this validation checkpoint**; the coordinator owns subsequent reviewed local commits and patch packaging.

Supported release order after review and passing checks:

1. **The user confirmed Backend/Ops as the Core publication owner.** Backend/Ops integrates the reviewed Core patch into current `dev`, preserving concurrent changes, after completing the maintained checks. Existing delivery records specify **AWS Core: pull, build, restart the existing service**. The AWS checkout path, process supervisor/service name and access are not established in this workspace; Backend/Ops must use its existing verified procedure. No guessed SSH/PM2 command or legacy Heroku pipeline is authorized by this document. There is no schema migration in this bridge.
2. Owner verifies the deployed internal service-JWT contract, then Nest owner integrates the reviewed Nest patch into `dev` and promotes the exact reviewed revision to **`homolog`** using the repository's established merge process. Nest README and FE integration contract explicitly state that `dev` pushes do not deploy homolog. `origin/dev` and `origin/homolog` were both at the baseline above when inspected. Render must report the new `homolog` revision before the frontend depends on these routes.
3. Through the normal operator session, read tenant identity and template catalog/list; verify READ_ONLY preview and denied writes, SUPER_ADMIN access, global-default immutability and cross-tenant denial. Requalify the disposable QA tenant before any controlled writes. One inactive synthetic create/read/update/read/delete cycle may then use the exact returned new ID; reconcile uncertain outcomes by reads and never repeat a create automatically. Capture responses and the restoration ledger; send no mail and change no effective template selection.
4. Frontend owner publishes the dependent UI only after running-contract verification. Record final Core/Nest commit IDs, Render revision and observed API evidence separately. Until then this remains a local candidate, with Backend/Ops deployment access and maintained-check completion as concrete dependencies.

No live mutation ledger entries exist for this patch: no mail, event, recipient/token creation, SMTP write, template write, tenant activation, legal publication or remote deploy was performed during bridge implementation.
