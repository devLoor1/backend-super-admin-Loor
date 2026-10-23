# SA-BE-001 — Opportunities Write V1 (contrato oficial FE ↔ Nest ↔ Core)

**Status:** caminho oficial identificado e exposto via Nest Control Plane.  
**Ambiente:** `https://backend-super-admin-loor.onrender.com/api` → Core AWS internal.  
**Princípio:** reutiliza CreateService / ApproveService / matriz Admin — sem segundo pipeline.

---

## Mapa de endpoints (Nest)

| Ação | Método | Path Nest | Auth |
| --- | --- | --- | --- |
| Upload imagem | `POST` | `/api/opportunities/helpers/images` | SUPER_ADMIN |
| Segmentos | `GET` | `/api/opportunities/helpers/segments?whitelabelId=` | SA / Support / RO |
| Usos dos recursos | `GET` | `/api/opportunities/helpers/resource-utilizations?whitelabelId=` | SA / Support / RO |
| Empreendedores | `GET` | `/api/opportunities/helpers/entrepreneurs?whitelabelId=` | SA / Support / RO |
| Contratos | `GET` | `/api/opportunities/helpers/contracts?whitelabelId=` | SA / Support / RO |
| Perfis investidor | `GET` | `/api/opportunities/helpers/investor-profiles?whitelabelId=` | SA / Support / RO |
| Criar | `POST` | `/api/opportunities` | SUPER_ADMIN |
| Detalhe (leitura autoritativa) | `GET` | `/api/opportunities/:id` | SA / Support / RO |
| Editar (parcial) | `PATCH` | `/api/opportunities/:id` | SUPER_ADMIN |
| Aprovar | `POST` | `/api/opportunities/:id/approve` | SUPER_ADMIN |
| Negar (= archive) | `POST` | `/api/opportunities/:id/deny` | SUPER_ADMIN |
| Arquivar | `POST` | `/api/opportunities/:id/archive` | SUPER_ADMIN |

Core interno espelha em `/internal/super-admin/v1/opportunities…`.

Equivalentes Admin (referência de domínio, **não** usar no FE SA):

- `POST /admin/ebooks/images`, `GET /admin/segments`, `GET /admin/resource-utilizations`
- `POST/PATCH /admin/opportunities`, `PUT /admin/opportunities/:id/approve`

---

## 1) Criação — imagem e taxonomias

### 1.1 Fluxo oficial de imagem

1. `POST /api/opportunities/helpers/images` (`multipart/form-data`)
   - `image`: arquivo jpg/png/jpeg, máx. **20mb**
   - `folder`: `opportunities/banner` **ou** `opportunities/extra_images`
2. Resposta: `{ "data": { "id": 123 } }`
3. Usar `id` como:
   - `opportunity.image_id` (banner, **obrigatório** no create)
   - `members[].image_id`
   - `extra_images[]` (0–3 ids)

Reutiliza `FileHelper.store` do Core (mesmo caminho Admin/Common).

### 1.2 Segmentos e usos dos recursos (por Whitelabel)

Fontes autoritativas **no Nest** (não chamar Admin JWT):

```http
GET /api/opportunities/helpers/segments?whitelabelId=4
GET /api/opportunities/helpers/resource-utilizations?whitelabelId=4
```

- Segmento: `{ id, name, whitelabelId }` — usar `id` em `opportunity.segment_id`
- Uso: `{ id, code, name, whitelabelId }` — usar **`code`** em `opportunity.resource_utilization`

Validação Core:

- `E_SEGMENT_OUTSIDE_WHITELABEL`
- `E_RESOURCE_UTILIZATION_OUTSIDE_WHITELABEL`

Defaults de uso (se WL vazio): `working_capital`, `debt_refinancing`, `investment_in_the_opportunity`.

### 1.3 Payload de criação (sanitizado)

Campos Nest obrigatórios além do body Admin: `whitelabelId`, `entrepreneurId`.

```json
{
  "whitelabelId": 4,
  "entrepreneurId": 54,
  "is_private": false,
  "modality": "debt",
  "warranty": false,
  "members": [
    { "image_id": 101, "name": "Founder", "description": "CEO" }
  ],
  "monetary": {
    "max_goal": 100000,
    "min_investment_value": 1000,
    "warranty_amount": 0
  },
  "opportunity": {
    "image_id": 200,
    "segment_id": 3,
    "about": "Texto sobre a captura",
    "business_name": "Acme SPE",
    "cpf": "00000000191",
    "promotional_video_url": null,
    "description": "Descrição longa",
    "name": "Campanha QA SA",
    "resource_utilization": "working_capital",
    "spe_cnpj": "11222333000181"
  },
  "debt": {
    "percentage_profitability": 1.5,
    "payment_frequency": "mensal",
    "profitability_basis": "monthly",
    "grace_period_detail": { "years": 0, "months": 1, "days": 0 },
    "total_installments": 12
  },
  "extra_images": []
}
```

Pré-condições Core:

- WL ativo
- Entrepreneur do mesmo WL + `personalInformationFilled`
- Company canônica do entrepreneur (CNPJ alinhado)
- Perfil com address/bank/pix quando o CreateService exigir
- `modality`: `equity` \| `debt` (política Finapop pode bloquear equity)

Status inicial: **`review`**.  
Sucesso: **201** `{ data: <detail SA> }`.

Erros frequentes: `E_WHITELABEL_INACTIVE`, `E_ENTREPRENEUR_OUTSIDE_WHITELABEL`, `E_INCOMPLETE_PROFILE`, `E_VALIDATION`, validator Adonis (422).

---

## 2) Edição — campos e leitura de confirmação

### 2.1 Matriz editável (Admin / SA)

Fonte: `OpportunityEditableFieldsHelper.assertCanPatchAdmin`.

| Status | Campos permitidos |
| --- | --- |
| `review` | `about`, `promotional_video_url`, `description`, `name`, `business_name`, `resource_utilization`, `whatsapp_group`, `image_id`, `company_cnpj`, `spe_cnpj`, `cpf`, `segment_id`, `is_private` |
| `active` | soft content + `resource_utilization`, `segment_id`, `is_private`, `company_cnpj` (**sem** `spe_cnpj` / `cpf`) |
| `archived` / `finished` | bloqueado → `opportunity_not_editable` |

**Imutáveis neste PATCH:** modality, monetary, debt/equity, address, bank, pix, members, warranties, quotas, status, contract, investor_profile.

### 2.2 PATCH parcial

- Todos os campos do UpdateValidator são opcionais.
- Chaves omitidas / `undefined` **não** sobrescrevem.
- Body `{}` = no-op.
- Campo fora da matriz → 422 `"Fields not editable in status \"…\": …"`.

### 2.3 Leitura autoritativa pós-write

Após create/PATCH/approve/deny/archive o Core devolve **`GET`-equivalente detail** no body (`{ data }`).

`GET /api/opportunities/:id` inclui campos de confirmação editáveis:

- `imageId` / `image_id`
- `promotionalVideoUrl` / `promotional_video_url`
- `whatsappGroup` / `whatsapp_group`
- `companyCnpj` / `company_cnpj`, `speCnpj` / `spe_cnpj`, `cpf`
- `segment_id`, `resource_utilization`, `is_private`, `business_name`
- já existentes: `name`, `about`, `description`, `segment`, `resourceUse`, `status`, …

Exemplo PATCH `review`:

```json
{
  "name": "Campanha QA SA (edit)",
  "about": "…",
  "segment_id": 3,
  "resource_utilization": "working_capital",
  "image_id": 201
}
```

Verificação: comparar response do PATCH **e** `GET /api/opportunities/:id`.

---

## 3) Aprovação — efeitos e recuperação

### 3.1 Pré-condições

1. Opportunity em **`review`** (`getInReview`)
2. Body com `contract_id` (helper contracts do mesmo WL; arquivo do contract não pode já estar ligado como document de outra opp)
3. Provider do WL configurado (Crenor ou BCodex/Asaas) — senão 424/erro de conta
4. Se enviar `opened_at` + `due_at`: `due_at > opened_at`
5. Grace period debt (se enviado): pelo menos um de years/months/days > 0

Body (resumo):

```json
{
  "contract_id": 12,
  "investor_profile_id": 1,
  "loor_percent_fee": 0.5,
  "opened_at": "2026-10-24",
  "due_at": "2026-12-31",
  "grace_period": { "years": 0, "months": 1, "days": 0 },
  "penalties": []
}
```

### 3.2 Ordem dos efeitos (ApproveService)

1. **Fora da TX:** provisionamento no provedor (Crenor mint / BCodex EC + webhook)
2. **Dentro da TX:** document do contract → quotas → `status=active` → fee/grace → credenciais/EC → penalties → debt `approved` se debt

### 3.3 Idempotência

- **Sem** idempotency-key de request.
- Proteção = gate de status: após sucesso, segundo approve falha (“not in review”).
- Não há API automática de reconciliação de órfãos de provider.

### 3.4 Verificação pós-approve

1. `GET /api/opportunities/:id` → `status: "active"`, `openedAt` / `dueAt` preenchidos
2. Audit Nest: `APPROVE_OPPORTUNITY` before `review` → after `active`
3. Ops/DB (se necessário): quotas, investment_contract document, credenciais Crenor / EC

### 3.5 Provider OK + TX falhou (procedimento seguro)

Sintoma típico: HTTP 5xx; opportunity permanece `review`; pode existir mint/EC externo.

1. Confirmar status ainda `review` no GET
2. **Não** spammar approve
3. Crenor: preferir retry com `crenor_cash_in` / `crenor_cash_out` já mintados (evita segundo mint)
4. BCodex/Asaas: checar EC órfão no provedor; limpar externamente ou aceitar risco de duplicidade (decisão Ops/Product)
5. Só re-approve quando side-effects DB estiverem ausentes

Deny = archive com `reason` (mín. 20 chars) — mesma persistência Admin.

---

## 4) Audit (segurança)

Nest `AuditService` redige chaves que casam:

`password|secret|token|apiKey|authorization|credential|smtp|cpf|cnpj|spe_cnpj|document|pix` → `[REDACTED]`

| Ação | afterData |
| --- | --- |
| CREATE_OPPORTUNITY | ids (`whitelabelId`, `entrepreneurId`, `opportunityId`) — sem body completo |
| UPDATE_OPPORTUNITY | body do PATCH **com PII redigida** pelas chaves acima |
| APPROVE_OPPORTUNITY | `{ status: 'active' }` (sem secrets Crenor) |
| DENY/ARCHIVE | status + reason |

---

## 5) QA — recursos descartáveis

**Autorizado para escrita de negócio (somente após Product/Conta 1):**

| Recurso | Regra |
| --- | --- |
| Whitelabel | slug `sa-op-smoke-*` / `baseUrl` `*.example.invalid` (já usado no smoke WL) — **não** tenants reais (loor, finapop, laguna, …) |
| Entrepreneur | do mesmo WL de teste, com perfil completo |
| Opportunity | criar em `review`; **não** aprovar em tenant compartilhado sem autorização explícita |
| Imagens | upload via helper Nest; não reutilizar assets de campanhas reais |

Homolog compartilhada: preferir WL de smoke; se usar WL id conhecido de teste, documentar id + correlationId e arquivar a opp ao final (`deny`/`archive` com reason).

**Não descartáveis (somente leitura):** investors/entrepreneurs/opps de produção-like em homolog (ex.: ids reais vistos em smoke de listagem).

---

## 6) Fluxo FE recomendado (Gate A → write)

1. Escolher `whitelabelId`
2. Helpers: entrepreneurs (filtrar `personalInformationFilled`), segments, resource-utilizations, contracts
3. Upload banner (+ extras/members)
4. `POST /api/opportunities`
5. Editar com PATCH parcial; confirmar via body da response / GET detail
6. Approve **só** com autorização Ops + procedimento de órfão conhecido
7. Em falha de approve: seguir §3.5 — sem retry cego

---

## 7) SA-BE-002 — Admin.name (correção relacionada)

`GET /api/whitelabels/:whitelabelId/admins` e `…/admins/:id` passam a devolver:

- `name`: valor persistido `Admin.name` (`string | null`)
- `fullName`: **alias** de `name` (antes vinha sempre `null`)

Sem mudança em create/activate/deactivate.
