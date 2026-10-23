# SA-BE specs — status de implementação

Atualizado: tranche P1 (004–008) no Nest CP + Core.

| Spec | Status | Notas |
| --- | --- | --- |
| **SA-BE-003** Bloqueio real | **Implantado (Core)** | `AccountAccessService` + check no `Auth` middleware + login Investor/Entrepreneur/Admin → `403 ACCOUNT_PAUSED` |
| **SA-BE-001** Opportunities Admin parity | **Implantado (Nest+Core)** | Write V1 + helpers (entrepreneurs/contracts/investor-profiles/**segments/resource-utilizations/images**); detail com campos editáveis; contrato FE em `sa-be-001-opportunities-write-contract-v1.md` |
| **SA-BE-002** Admins WL | **Parcial** | PATCH update (name/email) + activate/deactivate; leituras devolvem `name` + `fullName` (alias); reset-password/resend-invite **não** |
| **SA-BE-004** Investor 360 | **Implantado (Nest+Core)** | `GET /investors/:id/overview` → Core `InvestorOverviewService` (account/KYC/investments/payments/wallet WL) |
| **SA-BE-005** Entrepreneur 360 | **Implantado (Nest+Core)** | `GET /entrepreneurs/:id/overview` → Core `EntrepreneurOverviewService` (account/company/opportunities) |
| **SA-BE-006** KYC detalhado | **Implantado (Nest+Core)** | `GET /compliance/kyc` + `/:id`; case id = FaceMatch id; Face Match dentro do detail (sem menu separado) |
| **SA-BE-007** Operators CP | **Implantado (Nest)** | CRUD local Prisma: list/create/update/activate/deactivate/roles; Argon2; audit; guard last SUPER_ADMIN |
| **SA-BE-008** Audit | **Implantado (Nest)** | GET `/api/audit` com filtros operatorId/action/resource/whitelabel/result/from/to/search + paginação |

## Deny semantics

`POST …/deny` = recusa de review → **archive** com `reason` (mesmo modelo Admin archive). Audit Nest: `DENY_OPPORTUNITY`.

## Deploy

1. Core AWS: pull + `ace build` + `pm2 restart`
2. Nest Render: deploy branch `homolog` / `dev`
