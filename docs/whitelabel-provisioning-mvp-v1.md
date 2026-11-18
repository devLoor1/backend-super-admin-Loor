# Whitelabel Provisioning MVP (Control Plane)

Orchestration lives only in Nest (`src/modules/whitelabel-provisioning`) + MySQL control-plane tables
(`whitelabel_provisionings`, `whitelabel_provisioning_steps`). The Core DB is never touched: every
Core effect goes through existing services (`WhitelabelService`, `AdministratorService`,
`PlatformConfigService`, `TermsService`, `SmtpService`, `GatewayService`) and therefore `LoorCoreClient`.

## Endpoints (prefix `/api`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/whitelabel-provisionings` | SUPER_ADMIN | 201. Runs synchronously until first pause. 409 if same slug is PENDING/RUNNING/WAITING_MANUAL_ACTION |
| GET | `/whitelabel-provisionings/:id` | SA, SUPPORT, READ_ONLY | progress + steps (no secrets) + delivery |
| POST | `/whitelabel-provisionings/:id/retry` | SUPER_ADMIN | body `{ stepKey?, smtp?, initialAdmin?, gateway?, branding? }` (or multipart `payload` + `mainAreaImage`) |
| POST | `/whitelabel-provisionings/:id/steps/:stepKey/complete` | SUPER_ADMIN | legacy; returns 400 while `MANUAL_GATES` is empty |
| GET | `/whitelabels/:whitelabelId/provisioning` | SA, SUPPORT, READ_ONLY | latest provisioning for a Core WL id |

## Pipeline (`STEP_ORDER`)

`CREATE_TENANT → APPLY_SETTINGS_TEMPLATE → UPLOAD_BRAND → INITIAL_ADMIN → TERMS → SMTP → GATEWAY_CONFIG → FE_DEPLOY_CHECK → DNS_CHECK → VALIDATE → DELIVER`

### `enabledEnvironments`

Optional create field: `["INVESTOR","ENTREPRENEUR","ADMIN"]` (at least one when sent). Omitted → all three (legacy).
Stored on `CREATE_TENANT` / gate step payloads. `FE_DEPLOY_CHECK` / `DNS_CHECK` / `DELIVER` only require or return URLs for contracted environments (e.g. Finapop = Investor+Admin; Entrepreneur is not an error). See also Core `docs/platform-bootstrap-shared-fe-v1.md` for shared-FE hostname bootstrap.

- Optional steps are created `SKIPPED` when their input is absent (`UPLOAD_BRAND` → `no_branding`).
- `UPLOAD_BRAND` applies **client** branding (never copied from a template; the template step skips `main_area_image`).
  Input: `branding { email?{primary_color?,logo_url?}, loginBrandPanelTextColor?, mainArea?{pages?} }` in the JSON
  body, or multipart on create/retry (`payload` = DTO JSON string + file field `mainAreaImage`, jpg/png ≤20MiB).
  Order: `email_branding.config` → `login.brand_panel_text_color` → `main_area` asset (`upload` slot `main_area`, or
  `replace` on the persisted `assetRef` when retrying) → per page (`login` default | `register` | `quick_profile`)
  `main_area_image = { capabilityId:'platform.main_area_image', version:1, enabled:true, assetRef }`.
  Step payload = flags only (`hasEmail`, `hasLoginColor`, `hasMainAreaFile`, `mainAreaPages`); result =
  `{ emailApplied, loginColorApplied, mainArea?{ assetRef, pages } }`. Progress (`assetRef`, applied pages/flags) is
  kept on the FAILED step so a retry resumes without a second upload. File bytes live only in the secrets store
  (`branding`), are discarded on success and are lost on restart → retry fails with `E_SECRETS_REQUIRED` until
  `branding` (+ `mainAreaImage`) is re-supplied. **Not covered (build-time `VITE_*`, Core lacuna):** institutional
  AppLogo, favicon, PWA icons. `delivery.branding = { email, mainAreaAssetRef? }` when the step succeeded.
- `CREATE_TENANT` never creates twice: bound id → exact slug lookup → create → on `E_SLUG_TAKEN` re-lookup.
  Core has no get-by-slug, so `WhitelabelService.findExactBySlug` uses list `search=<slug>` and filters the exact
  (case-insensitive) slug client-side (paginated, max 20 pages).
- `APPLY_SETTINGS_TEMPLATE` copies only **stored** provenance cells in `SETTINGS_COPY_ALLOWLIST`; `main_area_image`
  and any cell with secret-like keys are never copied.
- `FE_DEPLOY_CHECK` / `DNS_CHECK` run **automatically** via `FrontendReadinessService` (shared FE):
  public DNS resolve + HTTPS GET of `{slug}.(investor|empresa|admin).loor.vc` (+ legacy aliases) +
  Core `GET /public/platform/bootstrap` with `Origin` of that URL; slug must match the provisioning.
  Nest does **not** call Netlify or Hostinger APIs. Failure codes:
  `E_FRONTEND_READINESS_FAILED` / `E_DNS_READINESS_FAILED`. Retry re-runs only the check.
  Step result includes `mode: shared_frontend`, `environments[]`, `urls` / `hosts`.
- `DELIVER` fills `delivery` (no password).
  - `delivery.urls` for contracted environments come **only** from successful readiness
    (`FE_DEPLOY_CHECK`, fallback `DNS_CHECK`). Skipped gates → those URLs stay `null`.
  - `delivery.suggestedUrls` follow the homolog naming **convention**
    `https://{slug}.investor.loor.vc` / `https://{slug}.empresa.loor.vc` /
    `https://{slug}.admin.loor.vc`. See `docs/whitelabel-shared-fe-homolog-runbook-v2.md`.

## Secrets are ephemeral

SMTP password/username, initial admin temporary password, gateway keys and the branding image are held only in
`ProvisioningSecretsStore` (process memory, 6h TTL). They are never written to step `payload`/`result`, audit or
responses (step JSON is additionally scrubbed). A field is dropped when its step succeeds; everything is dropped on completion.
On failure the secrets are kept so an in-process retry works; **after a restart** a retry of `SMTP`, `INITIAL_ADMIN` or
`GATEWAY_CONFIG` fails with `E_SECRETS_REQUIRED` unless the credentials are re-supplied in the retry body.

## Concurrency / limits

- Runner lock: `updateMany(status in PENDING|FAILED|WAITING_MANUAL_ACTION → RUNNING)` must affect exactly 1 row; steps are claimed
  `PENDING|FAILED → RUNNING` with `attempts + 1`.
- A process crash mid-run leaves the provisioning `RUNNING` (no stale-lock recovery in the MVP).
- No global runner timeout beyond the Core client timeout (10s default per call).
