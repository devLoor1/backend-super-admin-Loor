# Runbook — frontends compartilhados em homologação (V2)

**Escopo:** homologação apenas. Produção = read-only.  
**Arquitetura:** Scenario B → **1 Investor + 1 Entrepreneur + 1 Admin** compartilhados. Tenant via `GET /public/platform/bootstrap` (Origin/hostname).  
**Não criar** site Netlify por Whitelabel.

---

## A. Sites shared (alvo)

| App | Repo | Branch homolog típica | Site Netlify (candidato) | Custom domains atuais |
| --- | --- | --- | --- | --- |
| Investor shared | `loor-capital-suite` | `dev` | site atrás de `homolog.loor.vc` | `https://homolog.loor.vc` |
| Entrepreneur shared | `empreendedor-loor` | `dev` | site atrás de `homolog.empresa.loor.vc` | `https://homolog.empresa.loor.vc` |
| Admin shared | `admin-canvas` | `dev` | site atrás de `homolog.admin.loor.vc` | `https://homolog.admin.loor.vc` |

PATH delivery (Nest env, infraestrutura):

```env
INVESTOR_BASE_URL=https://homolog.loor.vc
ENTREPRENEUR_BASE_URL=https://homolog.empresa.loor.vc
ADMIN_BASE_URL=https://homolog.admin.loor.vc
```

→ `{BASE}/w/{slug}` — **nunca** `VITE_PLATFORM_SLUG` por cliente nos shared sites.

Sites **específicos preservados** (não deletar):

| Host | Target Netlify |
| --- | --- |
| `finapop.investidor.loor.vc` | `homolpog-finapop.netlify.app` |
| `finapop.admin.loor.vc` | `finapop-admin.netlify.app` |
| `laguna.investor.loor.vc` | `laguna-investor.netlify.app` |

**Netlify Team:** LOØR (painel).  
**Token Netlify nesta sessão:** ausente (`NETLIFY_AUTH_TOKEN` / `NETLIFY_TOKEN` unset) — criação/renomeação de sites e domains **não** foi feita pelo agente.

### Env vars dos shared sites (não fixar tenant)

| Variável | Shared? | Nota |
| --- | --- | --- |
| `VITE_API_BASE_URL` | sim | `https://back.loor.vc/service` |
| `VITE_PLATFORM_SLUG` / `VITE_API_SLUG` | **não** no shared | só fallback local; runtime usa hostname |
| logo / theme / PWA / favicon | build-time | usar branding **neutro LOØR** até runtime completo (BRD-01) |

---

## B. DNS

**Provider autoritativo de `loor.vc`:** Hostinger (`ns1.dns-parking.com` / `ns2.dns-parking.com`).

### Registros observados (não remover)

| Host | Target |
| --- | --- |
| `finapop.investidor.loor.vc` | `homolpog-finapop.netlify.app` |
| `homolog.loor.vc` | `homolo-loor.netlify.app` |
| `laguna.investor.loor.vc` | (registro específico existente) |

### Wildcards a criar **uma vez** (Hostinger DNS — ação humana)

| Tipo | Nome | Target (Netlify site shared) |
| --- | --- | --- |
| CNAME | `*.investor` | `<investor-shared>.netlify.app` |
| CNAME | `*.empresa` | `<entrepreneur-shared>.netlify.app` |
| CNAME | `*.admin` | `<admin-shared>.netlify.app` |

Precedência: registros **específicos** (Finapop/Laguna) vencem wildcards — **não apagar** específicos.  
Smoke atual: `test-shared.investor.loor.vc` → **NXDOMAIN** (wildcard ainda não existe).

---

## C. SSL

Após CNAME apontar para Netlify:

1. Site shared → Domain management → Add domain alias `{slug}.….loor.vc` **ou** habilitar wildcard domain no plano Netlify que suporte.
2. Netlify emite/renova certificado automaticamente.
3. Se o plano **não** permitir certificado wildcard: adicionar domain aliases sob demanda no shared site (ainda **sem** site por cliente) — documentar limitação; **não** inventar ACME manual.

---

## D. Provisioning (código)

- `FE_DEPLOY_CHECK` / `DNS_CHECK` → `FrontendReadinessService` (DNS + HTTPS + bootstrap slug).
- Sem `WAITING_MANUAL_ACTION` para FE/DNS.
- `DELIVER.urls` só para `enabledEnvironments` que passaram readiness.
- Retry reexecuta só a verificação.

---

## E. Ações manuais bloqueantes (credenciais)

1. **Netlify** — login + (opcional) token CLI: preparar 3 sites shared sem `VITE_PLATFORM_SLUG` de cliente; domains `*.investor|empresa|admin.loor.vc`.
2. **Hostinger DNS** — criar os 3 wildcards CNAME acima.
3. **Não tocar produção.**

---

## F. Critério de aceite pós-wildcard

```text
finapop.investor.loor.vc  + laguna.investor.loor.vc  → mesmo site Investor
bootstrap Origin → slug correto
finapop.admin.loor.vc     → Admin Finapop
{slug}.empresa.loor.vc    → só se ENTREPRENEUR contratado
```
