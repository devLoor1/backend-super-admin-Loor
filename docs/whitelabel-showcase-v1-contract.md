# White Label Showcase (Vitrine) — V1 implementable contract

**Status:** Product-closed + technical refinements (Arthur ACK 2026-11-10). Backend implemented in source; homolog deploy pending ops.  
**Owner:** Whitelabel **id=6**, slug **`homologacao`**, environment **homolog only** (`SHOWCASE_ENABLED=true`).  
**Fixture #4** from the FE demo is **not** an operational owner.  
**Schema version:** `1`

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
- `schemaVersion` must be `1`

---

## PUT body (complete example)

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

## Public projection (render-only)

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

---

## Out of V1

Auto identity import; real CTA URLs; server draft/publish step; orphan GC; enabling non-WL6 or production.
