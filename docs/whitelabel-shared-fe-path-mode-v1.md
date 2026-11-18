# Shared FE — PATH mode (`/w/{slug}`) homolog

## Separação obrigatória

```text
.env / Netlify          = infraestrutura global
Core / banco            = configuração de cada Whitelabel
```

Um novo Whitelabel **não** altera variáveis no Netlify.

## Bases de infraestrutura (Nest Control Plane)

```env
PROVISIONING_FRONTEND_URL_MODE=PATH
INVESTOR_BASE_URL=https://homolog.loor.vc
ENTREPRENEUR_BASE_URL=https://homolog.empresa.loor.vc
ADMIN_BASE_URL=https://homolog.admin.loor.vc
```

Provisioning monta `{BASE_URL}/w/{slug}` **somente** para `enabledEnvironments`.

## O que NÃO vai no .env dos shared FEs

```text
VITE_PLATFORM_SLUG / VITE_API_SLUG por cliente
VITE_APP_LOGO_URL / theme por cliente
```

Tenant vem de hostname ou `/w/{slug}` → `GET /public/platform/bootstrap?slug=` → Core/banco.

## Shared FE (Vite) — só global

```env
VITE_API_BASE_URL=https://back.loor.vc/service
```

Favicon/PWA podem permanecer LOØR neutro (build-time) até BRD-01.

## Precedência do tenant (FE)

1. Hostname reconhecido  
2. `/w/{slug}`  
3. `VITE_PLATFORM_SLUG` / `VITE_API_SLUG` (legado)

## Futuro HOSTNAME

Mesma origem de dados (Core). Só muda a extração do slug:

`homolog.loor.vc/w/cliente-x` → `cliente-x.investor.loor.vc`
