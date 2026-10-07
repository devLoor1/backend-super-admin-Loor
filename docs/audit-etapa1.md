# Etapa 1 — Auditoria inicial (2026-10-06)

## backend-super-admin-Loor

- Repositório remoto vazio / sem commits úteis.
- Tentativa anterior de scaffold AdonisJS 5 (parcial) deve ser **descartada**.
- Spec atual define **NestJS + Prisma + MySQL** como Control Plane.

## Backend principal (AdonisJS Core) — o que já existe

| Área | Evidência no Core | Nota para Super Admin |
| --- | --- | --- |
| Whitelabel | `Whitelabel` model, `ResolveWhitelabelService`, FK `whitelabel_id` | Registry existe; falta API interna SA |
| Admin WL | `Admin` + auth OAT; `isSuperAdmin` legado | Não é operador Control Plane |
| Investors | `/admin/investors` list/detail/approve/deny | Expor via `/internal/super-admin/v1` |
| Entrepreneurs | `/admin/entrepreneurs` + company | Idem |
| Opportunities | domínio + approve/deny Admin | Nest orquestra; Core executa |
| Wallet | Investor + Admin wallet/cashout/balance/statement | Sem edição de saldo arbitrária |
| Payments/PIX | Contas/Crenor/webhooks | Comandos explícitos no Core |
| SMTP / templates | Admin platform email config + templates | Secrets mascarados |
| Platform settings/assets | `PlatformSettingService`, assets | Escopo tenant inconsistente em partes |
| Terms | revision + aceite Investor | CORE EXISTS; reaceitação aberta |
| KYC | Investor KYC routes | Face Match no detalhe KYC |
| Gateways | `PaymentProviderResolver`, PAG credentials | Opportunity-scoped hoje |
| Audit Core | `AuditLog` best-effort | Separar do Audit CP |
| Internal SA | **não encontrado** `/internal/super-admin/v1` | Implementar no Core depois |

## Decisão

Control Plane NestJS próprio (`loor_super_admin`). Comunicação apenas via API interna. Sem acesso direto ao MySQL do Core.
