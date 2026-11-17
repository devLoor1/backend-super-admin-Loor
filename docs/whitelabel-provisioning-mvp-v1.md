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
| POST | `/whitelabel-provisionings/:id/retry` | SUPER_ADMIN | body `{ stepKey?, smtp?, initialAdmin?, gateway? }` |
| POST | `/whitelabel-provisionings/:id/steps/:stepKey/complete` | SUPER_ADMIN | only `FE_DEPLOY_CHECK` / `DNS_CHECK` |
| GET | `/whitelabels/:whitelabelId/provisioning` | SA, SUPPORT, READ_ONLY | latest provisioning for a Core WL id |

## Pipeline (`STEP_ORDER`)

`CREATE_TENANT → APPLY_SETTINGS_TEMPLATE → UPLOAD_BRAND → INITIAL_ADMIN → TERMS → SMTP → GATEWAY_CONFIG → FE_DEPLOY_CHECK → DNS_CHECK → VALIDATE → DELIVER`

- Optional steps are created `SKIPPED` when their input is absent. `UPLOAD_BRAND` is **always SKIPPED** in the MVP
  (the create payload carries no brand bytes; use the existing assets endpoints manually).
- `CREATE_TENANT` never creates twice: bound id → exact slug lookup → create → on `E_SLUG_TAKEN` re-lookup.
  Core has no get-by-slug, so `WhitelabelService.findExactBySlug` uses list `search=<slug>` and filters the exact
  (case-insensitive) slug client-side (paginated, max 20 pages).
- `APPLY_SETTINGS_TEMPLATE` copies only **stored** provenance cells in `SETTINGS_COPY_ALLOWLIST`; `main_area_image`
  and any cell with secret-like keys are never copied.
- `FE_DEPLOY_CHECK` / `DNS_CHECK` park the provisioning in `WAITING_MANUAL_ACTION` until completed with a full checklist
  (`investor+entrepreneur+admin` / `resolves+https`).
- `DELIVER` fills `delivery` (no password). `suggestedUrls` follow the naming **convention**
  `https://{slug}.empresa.loor.vc` / `https://{slug}.admin.loor.vc` — not verified, not guaranteed.

## Secrets are ephemeral

SMTP password/username, initial admin temporary password and gateway keys are held only in
`ProvisioningSecretsStore` (process memory, 6h TTL). They are never written to step `payload`/`result`, audit or
responses (step JSON is additionally scrubbed). A field is dropped when its step succeeds; everything is dropped on completion.
On failure the secrets are kept so an in-process retry works; **after a restart** a retry of `SMTP`, `INITIAL_ADMIN` or
`GATEWAY_CONFIG` fails with `E_SECRETS_REQUIRED` unless the credentials are re-supplied in the retry body.

## Concurrency / limits

- Runner lock: `updateMany(status in PENDING|FAILED|WAITING_MANUAL_ACTION → RUNNING)` must affect exactly 1 row; steps are claimed
  `PENDING|FAILED → RUNNING` with `attempts + 1`.
- A process crash mid-run leaves the provisioning `RUNNING` (no stale-lock recovery in the MVP).
- No global runner timeout beyond the Core client timeout (10s default per call).
