# White Label Showcase (Vitrine) — V1/V2 implementable contract

**Status:** V1 shipped (revision-based CAS). **V2 (ordered `sections[]`) + logo-options/copy implemented in source (2026-11-12); homolog deploy pending ops.** V1 reads are projected to V2 (see "Schema V2").  
**Owner:** Whitelabel **id=6**, slug **`homologacao`**, environment **homolog only** (`SHOWCASE_ENABLED=true`).  
**Fixture #4** from the FE demo is **not** an operational owner.  
**Schema version:** `2` canonical (writes + reads). `1` accepted for writes only while stored is V1/null.

---

## Identities

| Role | Meaning |
| --- | --- |
| **Owner** | WL6 — stores the showcase document and all showcase assets |
| **Source** | Whitelabel that seeded a card (`source.whitelabelId` / `source.slug`) |
| **Instance** | Card `instanceId` (UUID) — independent customization; same source may repeat |

---

## Routes

### Administrative (Nest → Core)

| Method | Path | Roles | Success |
| --- | --- | --- | --- |
| GET | `/api/whitelabels/:id/showcase` | SUPER_ADMIN, READ_ONLY | 200 |
| PUT | `/api/whitelabels/:id/showcase` | SUPER_ADMIN | 200 |
| POST | `/api/whitelabels/:id/platform/assets` | SUPER_ADMIN | 201 |

- Non-owner / capability off → **404** `E_SHOWCASE_NOT_AVAILABLE`
- SUPPORT_ADMIN → **403** on showcase routes (Settings/AST elsewhere unchanged)
- Upload: multipart `image` + **`slot=showcase`** (PNG/JPEG ≤ 20 MiB). Does **not** touch `main_area_image`.
- PUT replace bytes on `slot=showcase` → **422** `E_SHOWCASE_ASSET_REPLACE_FORBIDDEN` (always POST new `assetRef`)
- Admin preview URLs: response enriches `url` next to `assetRef`; editor may also `GET …/platform/assets/:assetRef` (fresh signed URL)

### Public (Core)

| Method | Path | Success |
| --- | --- | --- |
| GET | `/service/showcase` | 200 |

Tenant via Origin / `x-whitelabel-slug`. Non-owner → **404** `E_SHOWCASE_NOT_AVAILABLE`.

`Cache-Control: private, no-store` on admin + public GET/PUT so signed URLs renew even when `revision` is unchanged.

---

## Concurrency / first write

| State | GET | PUT `expectedRevision` |
| --- | --- | --- |
| Never saved | `configured:false`, `revision:null`, `document:null` | **`null`** |
| After N saves | `configured:true`, `revision:N` | `N` → stores `N+1` |

- Mismatch → **409** `E_SHOWCASE_REVISION_CONFLICT` + current `revision` + `document`
- Uncertain transport → FE GET compare; **no** auto re-PUT
- `schemaVersion` must be `2` (see "Schema V2" for the V1 compatibility window)

---

## PUT body — V1 legacy example (still accepted while stored is V1/null)

```json
{
  "schemaVersion": 1,
  "expectedRevision": null,
  "document": {
    "schemaVersion": 1,
    "banner": {
      "images": [
        {
          "associationId": "11111111-1111-4111-8111-111111111111",
          "assetRef": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "alt": "Banner principal",
          "decorative": false
        }
      ]
    },
    "intro": {
      "title": "Conheça as plataformas",
      "subtitle": "Opcional",
      "bodyMarkdown": "Texto com **negrito** e [link](https://example.com)."
    },
    "cards": [
      {
        "instanceId": "22222222-2222-4222-8222-222222222222",
        "source": {
          "whitelabelId": 6,
          "slug": "homologacao",
          "baseUrl": "https://homolog.loor.vc/wallet"
        },
        "displayName": "LOØR Homologação",
        "shortDescription": "Descrição editorial do card.",
        "colors": { "panel": "#0B1F33", "divider": "#F5A623" },
        "logo": {
          "assetRef": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "alt": "Logo LOØR"
        },
        "images": [
          {
            "associationId": "33333333-3333-4333-8333-333333333333",
            "assetRef": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "alt": "",
            "decorative": true
          }
        ],
        "internalTitle": "Card A (só admin)"
      }
    ]
  }
}
```

Field name is **`intro`** (FE maps prototype `introduction` → `intro`).

---

## Markdown

Allowed subset only (paragraphs, bold, italic, simple lists, http(s) links with text).  
Content outside the subset → **422** `E_SHOWCASE_VALIDATION` (**reject**, no silent strip).

---

## Signed URLs / cache

- TTL: **15 minutes** (`expiresIn=15m`) on each resolve.
- Every admin/public GET regenerates URLs; **not** tied to document revision.
- Responses: `Cache-Control: private, no-store`.
- FE: limited recovery (re-GET showcase or asset) — avoid one request per broken image.

---

## Source eligibility on PUT

| Case | Rule |
| --- | --- |
| New `instanceId` | Source must exist **and be active** |
| Existing `instanceId`, **same** `source.whitelabelId` | Allowed even if source later inactive (preserved card) |
| Existing `instanceId`, **changed** source | New source must pass active eligibility (reusing `instanceId` does **not** skip the check) |

Admin GET may include `warnings[]` e.g. `{ code: "SOURCE_INACTIVE", instanceId, sourceWhitelabelId }`.  
**Public projection omits** warnings, `assetRef`, `source`, `internalTitle`.

---

## Slug lookup (FE)

- `GET /api/whitelabels?search=&active=true` with **full pagination** until exhausted.
- Qualify **0** or **>1** exact slug matches across all pages.
- Incomplete/failed paging → **inconclusive** (never “not found”).
- Early exit on first exact match is **not** sufficient to prove uniqueness.

---

## Public projection — V1 shape (superseded by V2 below)

```json
{
  "data": {
    "configured": true,
    "revision": 1,
    "schemaVersion": 1,
    "document": {
      "banner": {
        "images": [
          {
            "associationId": "…",
            "url": "https://signed…",
            "alt": "…",
            "decorative": false
          }
        ]
      },
      "intro": { "title": "…", "subtitle": null, "bodyMarkdown": "…" },
      "cards": [
        {
          "instanceId": "…",
          "displayName": "…",
          "shortDescription": "…",
          "colors": { "panel": "#0B1F33", "divider": "#F5A623" },
          "logo": { "url": "https://signed…", "alt": "…" },
          "images": [
            {
              "associationId": "…",
              "url": "https://signed…",
              "alt": "",
              "decorative": true
            }
          ]
        }
      ]
    }
  }
}
```

Unconfigured (owner only): **200** `{ configured:false, revision:null, document:null }`.

---

## Env (Core homolog)

```bash
SHOWCASE_ENABLED=true
SHOWCASE_OWNER_WHITELABEL_ID=6
SHOWCASE_OWNER_SLUG=homologacao
```

Production: leave `SHOWCASE_ENABLED` unset/false.

---

## Errors

| Code | HTTP |
| --- | --- |
| `E_SHOWCASE_NOT_AVAILABLE` | 404 |
| `E_SHOWCASE_REVISION_CONFLICT` | 409 |
| `E_SHOWCASE_VALIDATION` | 422 |
| `E_SHOWCASE_ASSET_INVALID` | 422 |
| `E_SHOWCASE_ASSET_REPLACE_FORBIDDEN` | 422 |
| `E_SHOWCASE_SCHEMA_DOWNGRADE` | 422 |
| `E_PLATFORM_ASSET_COPY_SLOT_INVALID` | 422 |
| `E_PLATFORM_ASSET_NOT_FOUND` | 404 |
| `E_PLATFORM_ASSET_FORBIDDEN` | 403 |
| `E_WHITELABEL_NOT_FOUND` | 404 |

---

## Out of V1/V2

Auto identity import; real CTA URLs; server draft/publish step; orphan GC; enabling non-WL6 or production.

---

## Schema V2 — ordered sections

Same routes (`GET`/`PUT /api/whitelabels/:id/showcase`, public `GET /service/showcase`).

### Canonical document

```json
{
  "schemaVersion": 2,
  "banner": { "images": [ { "associationId": "…", "assetRef": "…", "alt": "…", "decorative": false } ] },
  "sections": [
    { "type": "text", "instanceId": "uuid", "title": "…", "subtitle": null, "bodyMarkdown": "…" },
    { "type": "card", "instanceId": "uuid", "source": { "whitelabelId": 6, "slug": "homologacao", "baseUrl": null },
      "displayName": "…", "shortDescription": "…", "colors": { "panel": "#0B1F33", "divider": "#F5A623" },
      "logo": { "assetRef": "…", "alt": "…" }, "images": [ … ], "internalTitle": "opcional" }
  ]
}
```

Rules:

- PUT `schemaVersion` = **2** and `document.schemaVersion` = **2**.
- `banner` stays separate (1..4 images). `sections` is ordered; **1..50** items; **≥ 1 `card`**.
- `instanceId` is a UUID in a **shared namespace** across `text` + `card` (duplicate → 422 `E_SHOWCASE_VALIDATION`).
- `text`: `title` (1..240), optional `subtitle` (1..500, `null` when absent), `bodyMarkdown` (1..20000, markdown subset, rejected otherwise).
- `card`: identical to V1 card rules (source eligibility, `slot=showcase` assets owned by owner, 1..4 images, decorative/alt rules).
- Unknown `type` → 422 `E_SHOWCASE_VALIDATION`.

### V1 → V2 compatibility

- **Read (admin, public, 409 conflict body):** a stored V1 document is **projected to V2 in memory, never persisted**.
  `schemaVersion` in the response is always `2`; `revision` is the stored revision (unchanged).
  - `intro` (if not null) → first `text` section. Its `instanceId` is a **deterministic UUID v5-layout** derived from
    `sha1(namespace + "showcase-intro-<ownerWtlbId>")`, so it is stable across GETs until the first V2 PUT (not random/ephemeral).
  - Each V1 card → `card` section, order preserved; `instanceId`, `associationId`, `assetRef` untouched.
  - Intro is never duplicated.
- **Write:**
  - `schemaVersion: 2` → validated as V2, persisted as V2 (`whitelabel_showcases.schema_version = 2`).
  - `schemaVersion: 1` is accepted **only while stored is V1 or never saved** (stored as V1, until FE cutover).
  - Once stored is V2, `schemaVersion: 1` → **422 `E_SHOWCASE_SCHEMA_DOWNGRADE`**. (Revision conflict 409 is evaluated first.)
- `warnings[]` (`SOURCE_INACTIVE`) walk `card` sections.
- Public V2 projection: `{ configured, revision, schemaVersion: 2, document: { banner, sections[] } }`; `text` sections as-is,
  `card` sections without `assetRef`/`source`/`internalTitle`.
- Unconfigured owner: unchanged (`configured:false`, `revision:null`, `document:null`).

---

## Logo options + copy into the owner showcase (no download/reupload)

| Method | Path (Nest) | Roles | Success |
| --- | --- | --- | --- |
| GET | `/api/whitelabels/:id/platform/assets?slot=main_area` (default `main_area`; also `showcase`) | SUPER_ADMIN, READ_ONLY | 200 `{ data: PlatformAssetDTO[] }` |
| GET | `/api/whitelabels/:id/logo-options` | SUPER_ADMIN, READ_ONLY | 200 `{ data: LogoOptions }` |
| POST | `/api/whitelabels/:id/platform/assets/copy` | SUPER_ADMIN (audited `COPY_PLATFORM_ASSET_TO_SHOWCASE`) | 201 `{ data: PlatformAssetDTO }` |

`GET logo-options` is for the **source** WL (`:id` = source). It does not require/enable showcase on that WL.

```json
{
  "data": {
    "whitelabelId": 12, "slug": "acme", "name": "Acme",
    "variants": [
      { "kind": "main_area", "page": "login", "pages": ["login"], "assetRef": "uuid", "slot": "main_area",
        "previewUrl": "https://signed… | null", "mime": "image/png", "originalName": "logo.png" }
    ]
  }
}
```

- Variants: unique `main_area` platform assets of the WL; assets bound in settings (`main_area_image` for `login`/`register`/`quick_profile`)
  carry `page` (first bound page; `pages` lists all) and are listed first; the rest have `page: null`. Deduplicated by `assetRef`.
- `email_branding.logo_url` is a different plane and is **not** included.

`POST …/copy` — `:id` is the **destination owner** (must be the showcase owner, else 404 `E_SHOWCASE_NOT_AVAILABLE`):

```json
{ "sourceWhitelabelId": 12, "sourceAssetRef": "uuid" }
```

- Source asset must belong to `sourceWhitelabelId` (404 `E_PLATFORM_ASSET_NOT_FOUND` / 403 `E_PLATFORM_ASSET_FORBIDDEN`) and have slot `main_area|showcase`
  (otherwise 422 `E_PLATFORM_ASSET_COPY_SLOT_INVALID`).
- Core copies the bytes server-side inside Drive into `platform/showcase` (new `Image` row + new `assetRef`, `wtlb_id = owner`, `slot = showcase`).
  Source asset and source settings are not modified. Use the returned `asset_ref` in `card.logo.assetRef` / `images[].assetRef`.
