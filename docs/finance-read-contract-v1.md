# Finance Read-Only — Super Admin contract V1

**Read-only.** No balance edits, no create/update of Investment/Payment/Wallet.

Domains are **distinct**:

```text
Investment ≠ Payment ≠ Wallet Balance ≠ Wallet Movement
```

Money: **integer centavos** (`amountCents` / `authoritativeBalanceCents`) + `currency: "BRL"`.  
`amountCents` is always **≥ 0**. Direction is never a signed amount.

| Layer | Base |
| --- | --- |
| Nest | `/api/investments`, `/api/payments`, `/api/wallets` |
| Core | `/internal/super-admin/v1/investments\|payments\|wallets` |

Nest unwraps `result.data` (no client wrapper on public responses).

---

## 1. Investments — `GET /api/investments`

### Official filters (accepted + applied)

| Param | Applied |
| --- | --- |
| `page`, `perPage` (max 100) | yes |
| `search` | yes — investor name/email OR opportunity name |
| `sort` | yes — `createdAt` (default), `updatedAt`, `status` |
| `order` | yes — `asc` \| `desc` |
| `whitelabelId` | yes |
| `investorId` | yes |
| `opportunityId` | yes |
| `status` | yes — enum below; invalid → **400** |

Status vocabulary:

```text
expired | waiting_payment | paid | refunded | processing | failed | processing_refund
```

`meta` reflects the **filtered** set.

### List item

`id`, `whitelabelId`, `investorId`, `opportunityId`, `amountCents`, `currency`, `quoteQuantity`, `status`, `createdAt`, `updatedAt`

### Detail — `GET /api/investments/:id`

List fields plus:

| Field | Type / nullability |
| --- | --- |
| `anonymous` | boolean |
| `riskAcceptanceAt` | ISO string \| null |
| `investor` | `{ id, fullName, email } \| null` |
| `opportunity` | `{ id, name } \| null` |
| `payment` | `{ id, status, provider, amountCents, paymentAt } \| null` |

Errors: id inválido → `400 E_VALIDATION`; not found → `404 E_INVESTMENT_NOT_FOUND`.

---

## 2. Payments — `GET /api/payments`

Source: investment Pix charge (`QrCode`). Not Investment, not Wallet.

### Official filters (accepted + applied)

| Param | Applied |
| --- | --- |
| `page`, `perPage` | yes |
| `search` | yes — txid OR investor name/email |
| `sort` | yes — `createdAt` (default), `updatedAt`, `status`, `amount` |
| `order` | yes |
| `whitelabelId` | yes |
| `investorId` | yes |
| `opportunityId` | yes |
| `status` | yes — enum; invalid → **400** |

Status vocabulary:

```text
paid | waiting_payment | expired | refunded
```

### List item

`id`, `whitelabelId`, `investmentId`, `investorId`, `opportunityId`, `amountCents`, `currency`, `paymentMethod: "pix"`, `type: "investment_pix"`, `provider`, `status`, `txid`, `createdAt`, `updatedAt`, `paymentAt`

### Detail extras

| Field | Type / nullability |
| --- | --- |
| `expirationAt` | ISO string \| null |
| `liquidationAt` | ISO string \| null |
| `externalEndToEndId` | string \| null |

---

## 3. Wallets — `GET /api/wallets`

One wallet projection **per Whitelabel** (`ownerType: "whitelabel"`, `ownerId` = whitelabelId).

### Official list filters

| Param | Applied |
| --- | --- |
| `page`, `perPage` | yes |
| `search` | yes — Whitelabel name / slug |
| `sort` | yes — **only** `createdAt` \| `name` (other values → **400**) |
| `order` | yes |
| `whitelabelId` | yes — restrict to one wallet |

### List item

`id`, `whitelabelId`, `ownerType`, `ownerId`, `name`, `slug`, `currency`, `authoritativeBalanceCents`, `balanceTimestamp`, `createdAt`, `updatedAt`

### Detail — `GET /api/wallets/:id`

List fields plus:

```json
"summary": {
  "totalInCents": 0,
  "totalOutCents": 0,
  "authoritativeBalanceCents": 0,
  "countIn": 0,
  "countOut": 0
}
```

`:id` = whitelabelId.

---

## 4. Wallet Movements — `GET /api/wallets/:id/movements`

### Supported query

| Param | Support |
| --- | --- |
| `page`, `perPage` (max 100) | yes |
| `kind` | yes — `in` \| `out` |
| `category` | yes — see vocabulary |
| `opportunityId` | yes |
| `search` | **not supported** → **400** |
| `sort` | **not supported** → **400** |
| `order` | **not supported** → **400** |

Default order: `date` desc (ledger fixed). Page above `lastPage` clamps to last page (`meta.page` = `lastPage`).

### `kind` semantics

| kind | Meaning |
| --- | --- |
| `in` | money received by the platform ledger |
| `out` | money paid out |

`amountCents` is **always positive**. Do not interpret sign from amount.

### `category` vocabulary

```text
investment_paid | installment_paid | refund | entrepreneur_cashout | investor_payout
```

### `id` format

Composite string, e.g. `investment:103`, `refund:12`, `investor_cashout:45`.

### `status`

Free string from source row (e.g. investment status, `confirmed`, `completed`). Not a single global enum — treat as opaque source status.

### `reference`

`Record<string, number | string | null>` — source keys vary by category (`investment_id`, `txid`, `end_to_end_id`, …).

### Movement item fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | required |
| `kind` | `in` \| `out` | required |
| `category` | enum above | required |
| `amountCents` | number (≥ 0) | required |
| `currency` | `"BRL"` | required |
| `date` | ISO string | required |
| `description` | string | free text — **embedded CPF/CNPJ redacted** |
| `counterparty.type` | `investor` \| `entrepreneur` | required |
| `counterparty.name` | string | free text — **embedded CPF/CNPJ redacted** |
| `counterparty.document` | string \| null | **masked** (`***.***.***-12`) — never full |
| `opportunity` | `{ id, name } \| null` | `name` free text — **embedded CPF/CNPJ redacted** |
| `reference` | object | string values redacted for embedded docs |
| `provider` | string \| null | |
| `status` | string | required |

### Privacy contract (movements + investment detail opportunity.name)

| Rule | Behavior |
| --- | --- |
| Dedicated document field | `counterparty.document` → mask last-2 (`***.***.***-XX`) |
| Free text | `description`, `counterparty.name`, `opportunity.name`, string `reference.*` → redact formatted/raw CPF (11) / CNPJ (14) with mod-11 validation |
| CNPJ mask in text | `**.***.***/****-XX` |
| CPF mask in text | `***.***.***-XX` |
| Layers | Core redacts at source; Nest re-applies (defense-in-depth) |
| FE | May reject payload if unmasked doc detected — BE must never send unmasked |

**Regression focus:** `category=refund&kind=out` where `opportunity.name` historically leaked full CNPJ.

Envelope may include:

```json
"privacy": {
  "documentFields": ["counterparty.document"],
  "freeTextRedaction": ["description", "counterparty.name", "opportunity.name", "reference.* (string values)"],
  "mask": "last-2-digits"
}
```

---

## 5. `GET /api/wallets/:id/investments`

**Official alias** of:

```http
GET /api/investments?whitelabelId=:id
```

Same list envelope, filters (`page`, `perPage`, `search`, `sort`, `order`, `investorId`, `opportunityId`, `status`), and Investment contract as §1.  
`whitelabelId` is forced from the path param.

---

## Homolog checklist

- Filters return 200 with reduced `meta.total` (not 400 / not ignored).
- Movements: no full CPF; `search` → 400; page overflow clamps.
- Docs match runtime (`finance-read-contract-v1.md`).
