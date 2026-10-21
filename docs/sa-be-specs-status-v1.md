# SA-BE specs — status de implementação

Atualizado com a tranche imediata (P0 em andamento).

| Spec | Status | Notas |
| --- | --- | --- |
| **SA-BE-003** Bloqueio real | **Implantado (Core)** | `AccountAccessService` + check no `Auth` middleware + login Investor/Entrepreneur/Admin → `403 ACCOUNT_PAUSED` |
| **SA-BE-001** Opportunities Admin parity | **Implantado (Nest+Core)** | POST/PATCH/approve/deny/archive + helpers entrepreneurs/contracts/investor-profiles; reusa `CreateService` / `ApproveService` / archive |
| **SA-BE-002** Admins WL | **Parcial** | PATCH update (name/email) + activate/deactivate; reset-password/resend-invite **não** (sem fluxo Core seguro) |
| **SA-BE-008** Audit | **Parcial** | Mutations novas usam `safeAudit`; filtros avançados GET `/api/audit` ainda pendentes |
| **SA-BE-004** Investor 360 | Pendente | |
| **SA-BE-005** Entrepreneur 360 | Pendente | |
| **SA-BE-006** KYC detalhado | Pendente | |
| **SA-BE-007** Operators CP | Pendente | |

## Deny semantics

`POST …/deny` = recusa de review → **archive** com `reason` (mesmo modelo Admin archive). Audit Nest: `DENY_OPPORTUNITY`.

## Deploy

1. Core AWS: pull + `ace build` + `pm2 restart`
2. Nest Render: deploy branch `homolog` / `dev`
