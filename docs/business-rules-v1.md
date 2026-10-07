# Regras de negócio V1 (stack atual)

Stack deste projeto (não a proposta Adonis do DOCX para o Control Plane):

```text
FE Super Admin → NestJS Control Plane → Adonis Core /internal/super-admin/v1 → MySQL Core
CP MySQL (Prisma): operadores, roles, audit
```

## Fronteira (Arthur + arquitetura)

| Pertence ao Nest (CP) | Pertence ao Core |
| --- | --- |
| Login/JWT do operador LOØR | Investor, Entrepreneur, Opportunity, Wallet, Payment… |
| RBAC do operador | Registry Whitelabel (id/slug/name/baseUrl/isActive) |
| Audit do Control Plane | Regras financeiras / KYC / Terms legais |
| Orquestração + projeção segura | Persistência operacional |

`Admin.isSuperAdmin` no Core **não** é operador do Control Plane.

## Entregue nesta fatia

### Core

- `InternalServiceAuth` — só service JWT (`iss=loor-super-admin`, `aud=loor-core`)
- `GET /internal/super-admin/v1/health`
- `GET /internal/super-admin/v1/whitelabels` (paginação, search, active)
- `GET /internal/super-admin/v1/whitelabels/:id`
- Status Core: apenas `active` | `inactive` (boolean `is_active`) — sem setup/draft inventado (Q-WL-02)

### Nest

- `WhitelabelService` com:
  - rejeição de ids `wl_proto_*`
  - paginação limitada (max 100)
  - mapeamento seguro Core → contrato CP
  - audit success/failure em create/update/status
  - unwrap do envelope do `LoorCoreClient` para o FE

## Ainda bloqueado / próximo

| Item | Motivo |
| --- | --- |
| POST/PATCH Whitelabel no Core | Q-WL-01–03 (campos mutáveis, lifecycle) |
| Pause/reactivate contas | Q-PA + domínio novo no Core |
| Reassign tenant | Q-TR |
| Dashboard aggregates | Q-WL-04 |
| Investors/Entrepreneurs internal reads | próxima fatia de leitura |

## Env alinhada

```text
# Nest
LOOR_CORE_SERVICE_SECRET=...
LOOR_CORE_SERVICE_ISSUER=loor-super-admin
LOOR_CORE_SERVICE_AUDIENCE=loor-core

# Core
SUPER_ADMIN_SERVICE_JWT_SECRET=...   # mesmo secret
SUPER_ADMIN_SERVICE_JWT_ISSUER=loor-super-admin
SUPER_ADMIN_SERVICE_JWT_AUDIENCE=loor-core
```
