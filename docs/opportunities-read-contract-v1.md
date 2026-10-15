# Opportunities — Super Admin read contract V1

Audience: FE + Control Plane. **Read-only.** No create / edit / approve / deny on this delivery.

| Layer | Path |
| --- | --- |
| Public (Nest) | `GET /api/opportunities`, `GET /api/opportunities/:id` |
| Internal (Core) | `GET /internal/super-admin/v1/opportunities`, `GET /internal/super-admin/v1/opportunities/:id` |

Nest `OpportunityService.list/detail` returns **Core body** (`result.data`), same pattern as Investor / Entrepreneur / Dashboard — no extra `{ data, status, correlationId }` wrapper on the public API.

## Supported query parameters (list)

| Param | Support | Notes |
| --- | --- | --- |
| `page` | yes | ≥ 1, default 1 |
| `perPage` / `per_page` | yes | 1–100 (Control Plane max 100) |
| `search` | yes | `name` OR `business_name` (LIKE) |
| `sort` | yes | `createdAt` (default), `updatedAt`, `name`, `status`, `dueAt` |
| `order` | yes | `asc` \| `desc` (default `desc`) |
| `whitelabelId` | yes | optional filter |
| `status` | yes | optional; must be official vocabulary (ignored if unknown) |
| `modality` | yes | optional; `equity` \| `debt` only |

## Official status vocabulary

```text
review | active | finished | archived
```

## Modality / Segment / Resource Use

| Dimension | Shape | Rules |
| --- | --- | --- |
| **Modality** | `"equity"` \| `"debt"` | Capital de Giro is **never** a modality |
| **Segment** | `{ id: number, name: string \| null } \| null` | Independent catalog per WTLB |
| **Resource Use** | `{ code: string, name: string \| null } \| null` | Independent; opportunity stores `code` |

Valid conceptual example:

```text
modality: "debt"
segment: { id: …, name: "Capital de Giro" }
resourceUse: { code: "working_capital", name: "Capital de giro" }
```

## List response

```json
{
  "data": [
    {
      "id": 1,
      "whitelabelId": 1,
      "entrepreneurId": 10,
      "name": "…",
      "businessName": "…",
      "modality": "debt",
      "status": "active",
      "fundraisingCompletion": null,
      "isPrivate": false,
      "segment": { "id": 3, "name": "Capital de Giro" },
      "resourceUse": { "code": "working_capital", "name": "Capital de giro" },
      "dueAt": "2026-12-01T00:00:00.000+00:00",
      "openedAt": "2026-01-01T00:00:00.000+00:00",
      "endedAt": null,
      "createdAt": "2026-01-01T00:00:00.000+00:00",
      "updatedAt": "2026-01-02T00:00:00.000+00:00"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 10,
    "total": 0,
    "lastPage": 1
  }
}
```

Empty list: `data: []` with `meta.total: 0`, `meta.lastPage: 1`.

## Detail response

```json
{
  "data": {
    "id": 1,
    "whitelabelId": 1,
    "entrepreneurId": 10,
    "name": "…",
    "businessName": "…",
    "modality": "equity",
    "status": "review",
    "fundraisingCompletion": null,
    "isPrivate": false,
    "segment": { "id": 3, "name": "…" },
    "resourceUse": { "code": "investment_in_the_opportunity", "name": "Investimento na oportunidade" },
    "dueAt": null,
    "openedAt": null,
    "endedAt": null,
    "createdAt": "…",
    "updatedAt": "…",
    "description": "…",
    "about": "…",
    "quotaQuantity": 100,
    "reasonForArchiving": null
  }
}
```

404:

```json
{ "code": "E_OPPORTUNITY_NOT_FOUND", "message": "Opportunity not found" }
```

## Nullability

| Field | Nullability |
| --- | --- |
| `segment` | `null` if no `segmentId`; `name` may be `null` if preload missing |
| `resourceUse` | `null` if no code; else `{ code, name }` (`name` may resolve to code fallback) |
| `fundraisingCompletion` | `null` \| `reached_minimum_goal` \| `did_not_reach_minimum_goal` |
| `dueAt` / `openedAt` / `endedAt` | ISO string or `null` |
| `reasonForArchiving` | string or `null` (detail) |
| `description` / `about` | string or `null` (detail) |

No nested `company` / Empresas object on this contract.

## Out of scope (this delivery)

- Opportunity create / edit / approve / deny / status mutations
- Investments / Payments / Wallet (separate tasks; same Nest unwrap pattern still owed there)
