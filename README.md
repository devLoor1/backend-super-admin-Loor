# backend-super-admin-Loor

Backend do **Super Admin LOØR** — Control Plane NestJS.

## O que é

API usada pelo frontend Super Admin para autenticação de operadores LOØR, RBAC, orquestração, auditoria e visão global da plataforma.

```text
Frontend Super Admin
        ↓
backend-super-admin-Loor (NestJS)   ← este repositório
        ↓  service JWT
Backend principal LOØR (AdonisJS)   ← Core / Data Plane
        ↓
MySQL operacional
```

## Por que NestJS (e não AdonisJS)

| | Core (AdonisJS) | Super Admin (NestJS) |
| --- | --- | --- |
| Papel | Data Plane — operação da plataforma | Control Plane — orquestração global |
| Domínio | Investimentos, Wallet, KYC, Opportunities… | Auth operador, RBAC, audit, dashboards, proxies |
| Estilo | Produtividade integrada / Lucid | Módulos + DI + Guards/Interceptors/Filters |

A escolha é **contextual**: o Super Admin orquestra muitos domínios sem duplicar regras. Nest deixa isso explícito (módulos, `LoorCoreClient` único, guards). Não é “Nest melhor que Adonis” — são responsabilidades diferentes.

## Regras críticas

1. **Não duplicar** Investor/Wallet/Opportunity/etc. no Nest.
2. **Não acessar** o MySQL do Core.
3. Controllers **não** chamam Axios/fetch — só `LoorCoreClient`.
4. Wallet **não** tem endpoint de edição de saldo.
5. Face Match fica **dentro** do detalhe KYC (`/api/compliance/kyc/:id`).
6. V1 é **monólito modular** — sem Rabbit/Kafka/Redis/CQRS obrigatórios.

## Stack

Node.js · TypeScript · NestJS · MySQL 8 · Prisma · JWT/Passport · Argon2 · Swagger · Axios (`@nestjs/axios`) · Pino · Jest · Docker

## Como executar

```bash
npm install
cp .env.example .env
docker compose up -d
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

- API: `http://localhost:3334/api`
- Swagger: `http://localhost:3334/api/docs`
- Health: `http://localhost:3334/api/health`

```bash
npm test
npm run build
```

## Arquitetura

```text
src/
  common/          guards, filters, interceptors, DTOs
  config/          env
  database/prisma/ PrismaService
  integrations/loor-core/   LoorCoreClient + service JWT
  modules/         auth, dashboard, whitelabel, … wallet, compliance, audit
```

Banco próprio `loor_super_admin`: `SuperAdmin`, `Role`, `Permission`, pivôs, `AuditLog`.

## Integração Core

```text
Nest module service
  → LoorCoreClient.request()
  → Authorization: Bearer <service JWT>
  → X-Service-Name / X-Correlation-ID
  → Core /internal/super-admin/v1/...
```

Tokens de operador (frontend) ≠ tokens de serviço (Nest→Core).

Endpoints internos no Core ainda precisam ser implementados (dependência).

## Menu V1 coberto (módulos)

Dashboard · Whitelabels · Administrators · Platform Config · SMTP · Opportunities · Investors · Entrepreneurs · Investments · Payments · Wallet · Gateways · Compliance/KYC · Audit · Auth · Health

## Segurança

Helmet · CORS · Throttling · ValidationPipe · JWT operador · RolesGuard · Argon2 · audit redaction · secrets só em env · sem stack trace em produção
