# backend-super-admin-Loor

Backend do **Super Admin LOØR** — Control Plane NestJS.

Branch de trabalho: **`dev`**. Homologação sobe só pela branch **`homolog`** (push em `dev` não faz deploy automático).

## O que é

API usada pelo frontend Super Admin para autenticação de operadores LOØR, RBAC, orquestração, auditoria e visão global da plataforma.

```text
Frontend Super Admin (:5173)
        ↓  operator JWT
backend-super-admin-Loor (NestJS)   ← este repositório (:3334)
        ↓  service JWT
Backend principal LOØR (AdonisJS)   ← Core / Data Plane (:3333)
        ↓
MySQL operacional (Core) — Nest NÃO acessa
```

Nest tem **banco próprio** (`loor_super_admin` via Docker na porta **3307**). Nunca aponta `DATABASE_URL` para o MySQL do Core.

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

## Como executar (local)

Pré-requisitos: Node.js 20+, Docker Desktop.

```bash
npm install
cp .env.example .env
docker compose up -d          # MySQL em 127.0.0.1:3307
npx prisma migrate dev
npm run prisma:seed           # cria operador de desenvolvimento
npm run start:dev
```

- API: `http://localhost:3334/api`
- Swagger: `http://localhost:3334/api/docs`
- Health: `http://localhost:3334/api/health`
- Contrato FE↔Nest: [`docs/fe-integration-contract-v1.md`](docs/fe-integration-contract-v1.md)

### Operador seed (somente development)

Definido em `.env` / `.env.example` (`SEED_SUPER_ADMIN_*`):

| Campo | Valor |
| --- | --- |
| E-mail | `superadmin@loor.local` |
| Senha | `ChangeMeDevOnly!123` |

Smoke test rápido:

```bash
curl -s -X POST http://localhost:3334/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"superadmin@loor.local\",\"password\":\"ChangeMeDevOnly!123\"}"
```

```bash
npm test
npm run build
```

### Frontend

Repo `super-admin-Loor` (`dev`):

```bash
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3334/api
npm install && npm run dev
```

Abrir `http://localhost:5173` e logar com o seed acima. Logout está no menu do header.

### Core (opcional — telas que leem/escrevem Data Plane)

Login do operador **não** precisa do Core. Para Whitelabels, contas, settings, SMTP, gateways e dashboard agregados:

1. Subir o Core Adonis em `http://127.0.0.1:3333` (branch `dev`).
2. Alinhar o **mesmo** secret de service JWT:

| Nest (`.env`) | Core (`.env`) |
| --- | --- |
| `LOOR_CORE_SERVICE_SECRET` | `SUPER_ADMIN_SERVICE_JWT_SECRET` |
| `LOOR_CORE_SERVICE_ISSUER=loor-super-admin` | `SUPER_ADMIN_SERVICE_JWT_ISSUER=loor-super-admin` |
| `LOOR_CORE_SERVICE_AUDIENCE=loor-core` | `SUPER_ADMIN_SERVICE_JWT_AUDIENCE=loor-core` |
| `LOOR_CORE_BASE_URL=http://127.0.0.1:3333` | — |

Rotas internas no Core: `/internal/super-admin/v1/*` (service JWT).

## Status de integração (V1)

| Camada | Status |
| --- | --- |
| Auth operador (`POST /api/auth/login`, `GET /api/auth/me`) | Pronto — FE wired |
| Nest → Core (`LoorCoreClient` + service JWT) | Pronto |
| Core `/internal/super-admin/v1` (WL, accounts, settings, SMTP, gateways, dashboard, pause) | Implementado no Core (`dev`) |
| FE Whitelabels / Contas / Settings / E-mails / Finance / Dashboard KPIs | Ainda protótipo local (mock) — próximo wire-up |
| Pause de conta no Core login middleware | Persistido em `SuperAdminAccountAccess`; enforcement no login do ator ainda pendente |

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

## Menu V1 coberto (módulos Nest)

Dashboard · Whitelabels · Administrators · Platform Config · SMTP · Opportunities · Investors · Entrepreneurs · Investments · Payments · Wallet · Gateways · Compliance/KYC · Audit · Auth · Health

## Segurança

Helmet · CORS · Throttling · ValidationPipe · JWT operador · RolesGuard · Argon2 · audit redaction · secrets só em env · sem stack trace em produção
