# White Label Showcase (Vitrine) — V1 implementable contract

**Status:** Product-closed for V1 scope (Arthur 2026-11-10). Backend not yet implemented.  
**Owner:** Whitelabel **id=6**, slug **`homologacao`**, environment **homolog only**.  
**Fixture #4** from the FE demo is **not** an operational owner.  
**Schema version:** `1`

This document consolidates routes, schema, validation, concurrency, media, auth and public projection. Mock/demo behaviors are **not** Backend capabilities until implemented here.

---

## Identities (do not collapse)

| Role | Meaning |
| --- | --- |
| **Owner** | WL6 — stores the showcase document and all showcase assets |
| **Source** | Whitelabel that seeded a card (`source.whitelabelId` / `source.slug`) |
| **Instance** | Card `instanceId` (UUID) — independent customization; same source may repeat |

---

## Routes (final proposal)

### Administrative (Nest Control Plane → Core internal)

Base: `/api/whitelabels/:whitelabelId/showcase`  
Server **must** reject any `:whitelabelId` other than `6` in homolog with **404** `E_SHOWCASE_NOT_AVAILABLE` (stable; not a soft empty). Production: capability off → same 404.

| Method | Path | Roles | Success |
| --- | --- | --- | --- |
| GET | `/api/whitelabels/6/showcase` | SUPER_ADMIN, READ_ONLY | 200 |
| PUT | `/api/whitelabels/6/showcase` | SUPER_ADMIN | 200 |
| POST | `/api/whitelabels/6/platform/assets` | SUPER_ADMIN | 201 |

**SUPPORT_ADMIN:** no access to showcase module (403 `E_FORBIDDEN` on showcase routes). Existing Settings/AST on other tenants **unchanged**.

Asset upload for showcase **reuses** AST pipeline with **`slot=showcase`** (new slot context). Must **not** write or clear `login|register|quick_profile.main_area_image`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `…/platform/assets` | multipart `image` + `slot=showcase`; PNG/JPEG ≤ 20 MiB → new `asset_ref` |
| GET | `…/platform/assets/:assetRef` | owner-scoped read |
| PUT | `…/platform/assets/:assetRef` | **Forbidden for showcase-associated refs** in V1 (FE must POST new). Existing `main_area` PUT semantics stay for Settings only. |
| DELETE | `…/platform/assets/:assetRef` | **Not used by showcase editor in V1** (disassociate only in document) |

### Public (Core, no admin session)

Resolved tenant must be WL6 / `homologacao` (Origin / `x-whitelabel-slug`). Other tenants → **404** `E_SHOWCASE_NOT_AVAILABLE`.

| Method | Path | Success |
| --- | --- | --- |
| GET | `/service/showcase` | 200 |

Preserve existing app routes; do **not** assume app root hosts the vitrine.

---

## First revision / concurrency

| State | `revision` | PUT `expectedRevision` |
| --- | --- | --- |
| Never saved | GET `configured:false`, `revision: null`, `document: null` | **`null`** (JSON null) for first write |
| After N successful saves | `configured:true`, `revision: N` (positive int) | `N` |

Rules:

- PUT body includes full `document` + `schemaVersion` + `expectedRevision`.
- Server compares `expectedRevision` atomically to stored revision (or null if absent).
- Match → persist, bump revision to `N+1` (first save → `1`), return new revision + document.
- Mismatch → **409** `E_SHOWCASE_REVISION_CONFLICT` with current `revision` + `document` (authoritative). FE keeps draft; no forced overwrite.
- Uncertain transport → FE **GET** and compare content+revision; **never** auto-retry PUT.

`schemaVersion` must be `1`. Unknown future versions → 422.

---

## Document schema (`schemaVersion: 1`)

```ts
type ShowcaseDocumentV1 = {
  schemaVersion: 1
  banner: {
    images: ImageAssociation[] // length 1..4
  }
  intro: null | {
    title: string
    subtitle: string | null
    bodyMarkdown: string // limited markdown, version 1 rules
  }
  cards: ShowcaseCardV1[] // length >= 1 on save
}

type ImageAssociation = {
  associationId: string // UUID
  assetRef: string      // owner-scoped UUID from POST assets
  alt: string           // required if !decorative; empty if decorative
  decorative: boolean
}

type ShowcaseCardV1 = {
  instanceId: string // UUID
  source: {
    whitelabelId: number
    slug: string
    // baseUrl may be stored for editor display only; never becomes CTA
    baseUrl?: string | null
  }
  // Editorial (not overwritten by later source changes)
  displayName: string
  shortDescription: string
  colors: {
    panel: string   // #RRGGBB
    divider: string // #RRGGBB
    // seeded from vitrine default palette; flagged client-side as editorial default
  }
  logo: {
    assetRef: string
    alt: string
  }
  images: ImageAssociation[] // length 1..4
  // Optional editor-only fields MUST NOT appear on public projection
  internalTitle?: string
}
```

Persist **only** durable refs (`assetRef`, association ids). Never persist signed URLs, `blob:`, Base64, or filesystem paths.

---

## Validation (PUT — public save)

Draft on FE may be incomplete. **PUT** requires a valid document:

| Rule | |
| --- | --- |
| Banner images | 1..4 |
| Intro | optional (`null`). If object: `title` + `bodyMarkdown` required; `subtitle` optional |
| Cards | ≥ 1 |
| Each card | `displayName`, `shortDescription`, `logo.assetRef`+`alt`, valid `#RRGGBB` colors, images 1..4 |
| Informative image | `decorative=false` ⇒ non-empty `alt` |
| Decorative image | `decorative=true` ⇒ `alt` empty |
| Markdown | limited subset (paragraphs, bold, italic, simple lists, http(s) links with text). No raw HTML/images/tables/code/headings nested lists — reject or strip consistently with public renderer |
| All `assetRef` | must exist, belong to owner WL6, `slot=showcase` |
| Source on add | must be **active** at inclusion time; inactive sources blocked for **new** cards |
| Inactive source later | card **kept**; public still shows card; admin GET may include `warnings[]` (e.g. `SOURCE_INACTIVE`) |

No arbitrary commercial card-count cap in V1. CTAs remain **demonstrative** (not stored as free URLs; no auto `baseUrl`→CTA).

---

## Response envelopes

### GET admin — unconfigured

```json
{
  "data": {
    "configured": false,
    "revision": null,
    "schemaVersion": 1,
    "document": null,
    "owner": { "whitelabelId": 6, "slug": "homologacao" }
  }
}
```

### GET admin — configured

```json
{
  "data": {
    "configured": true,
    "revision": 2,
    "schemaVersion": 1,
    "document": { "...": "ShowcaseDocumentV1" },
    "owner": { "whitelabelId": 6, "slug": "homologacao" },
    "warnings": [{ "code": "SOURCE_INACTIVE", "instanceId": "...", "sourceWhitelabelId": 12 }]
  }
}
```

### PUT success

```json
{
  "data": {
    "configured": true,
    "revision": 3,
    "schemaVersion": 1,
    "document": { "...": "ShowcaseDocumentV1" }
  }
}
```

### PUT conflict — 409

```json
{
  "code": "E_SHOWCASE_REVISION_CONFLICT",
  "message": "expectedRevision does not match current revision",
  "data": {
    "revision": 2,
    "document": { "...": "current stored document" }
  }
}
```

### Public GET — unconfigured (WL6 only)

```json
{
  "data": {
    "configured": false,
    "revision": null,
    "document": null
  }
}
```

HTTP **200**. FE shows discrete empty state. No examples, no other-tenant data, no login Settings fallback.

### Public GET — configured

```json
{
  "data": {
    "configured": true,
    "revision": 3,
    "schemaVersion": 1,
    "document": {
      "banner": { "images": [{ "associationId": "...", "url": "https://signed...", "alt": "...", "decorative": false }] },
      "intro": null,
      "cards": [
        {
          "instanceId": "...",
          "displayName": "...",
          "shortDescription": "...",
          "colors": { "panel": "#112233", "divider": "#445566" },
          "logo": { "url": "https://signed...", "alt": "..." },
          "images": [{ "associationId": "...", "url": "https://signed...", "alt": "...", "decorative": false }]
        }
      ]
    }
  }
}
```

Public omits: `internalTitle`, admin warnings detail policy TBD (prefer omit), audit, drafts, raw `assetRef` if `url` is provided (or include both — FE should prefer `url` for render and treat as ephemeral).

---

## Media URL validity / cache

- `url` is a **read-time** signed/resolvable URL from storage (same family as AST `main_area`).
- **Do not** persist `url` in the showcase document.
- Clients must tolerate expiry: on broken image, re-GET showcase (or asset) for a fresh URL.
- Cache-Control: public projection may be cached briefly by revision (`ETag` / `revision` query optional in a later iteration). V1 minimum: clients key cache by `revision`.

---

## Errors (stable codes)

| Code | HTTP | When |
| --- | --- | --- |
| `E_SHOWCASE_NOT_AVAILABLE` | 404 | Wrong tenant/env / prod off |
| `E_SHOWCASE_REVISION_CONFLICT` | 409 | `expectedRevision` mismatch |
| `E_SHOWCASE_VALIDATION` | 422 | Invalid document / markdown / colors / image rules |
| `E_SHOWCASE_ASSET_INVALID` | 422 | Missing/foreign/`main_area` slot asset used in showcase |
| `E_PLATFORM_ASSET_*` | 4xx | Existing AST upload errors (type/size) |
| `E_FORBIDDEN` | 403 | SUPPORT_ADMIN or role lacking write/read as applicable |
| 401 | — | Unauthenticated admin routes |

---

## Source lookup (reuse, no new search API)

- `GET /api/whitelabels?search=<slug>&active=true&perPage=…`
- FE: paginate until exhausted or exact slug found; incomplete page ≠ “not found”.
- 0 exact → not found; \>1 exact → inconsistency state.
- Seed card: `whitelabelId`, `slug`, `displayName←name`; `baseUrl` informational; logo/description manual; colors = vitrine default palette.

---

## Out of V1

- Auto import of institutional identity across tenants  
- Real commercial CTA URLs / `baseUrl` as destination  
- Server-side draft / separate publish step  
- Automatic orphan asset GC  
- PUT-replace bytes on showcase refs  
- Enabling any owner other than WL6 or production  

---

## Implementation note

Reuse: Nest↔Core bridge, AST FileHelper/PlatformAsset storage, SA role guards, public tenant resolver.  
Extend: showcase document store + CAS, `slot=showcase`, owner gate, public `/service/showcase` projection, validation.  
Do **not** put the showcase document in SET-01 Settings allowlist without CAS (SET-01 `version` remains advisory only).
