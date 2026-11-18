# Runbook — três frontends de Whitelabel em homologação (V1)

**Escopo:** homologação apenas. Produção = read-only (não alterar DNS/env/deploy de prod).  
**Arquitetura:** Scenario B — **1 build Netlify por app por Whitelabel**, com `VITE_PLATFORM_SLUG` (e vars de marca) em build-time.  
**Não automatizado nesta V1:** criação de site Netlify, DNS, SSL, Netlify API.

Análise de código (Investor / Entrepreneur / Admin + Core `ResolveWhitelabelService`) confirma que hostname **não** substitui o slug bakeado no frontend. Wildcard DNS sozinho **não** muda o tenant do FE.

---

## Convenção de hosts (homolog, WLs novos)

| Ambiente | Host | Env de build principal |
| --- | --- | --- |
| Investor | `https://{slug}.investor.loor.vc` | `loor-capital-suite` |
| Entrepreneur | `https://{slug}.empresa.loor.vc` | `empreendedor-loor` |
| Admin | `https://{slug}.admin.loor.vc` | `admin-canvas` |

Notas:

- Laguna já usa `*.investor.loor.vc`. Finapop histórico usa `*.investidor.loor.vc` — Core aceita ambos; **novos** WLs homolog usam `investor`.
- `https://homolog.loor.vc` é especial (slug `homologacao`). **Não** reutilize esse site para outro slug.
- Core API homolog: `https://back.loor.vc/service` (sem secrets neste doc).

---

## Pré-requisitos manuais (painel)

Ações que **este repositório não executa** (Netlify CLI ausente / sem token no Control Plane):

1. Conta Netlify com permissão de criar sites (ou duplicar site existente).
2. Acesso ao DNS de `loor.vc` (provider **não verificável pelo repositório**).
3. Tenant Core criado via provisioning (ou já existente) com o `slug` desejado.
4. Super Admin com `VITE_WHITELABEL_WRITES_ENABLED` e papel `SUPER_ADMIN`.

Tenant de teste sugerido (se não existir):

```text
name = WL Homolog Test
slug = wl-hml-test
baseUrl = https://wl-hml-test.investor.loor.vc
```

Não use cliente real.

---

## Passo a passo

### 1. Provisionar o tenant (Control Plane)

1. Super Admin → Implantar Whitelabel.
2. Preencher name / slug / baseUrl (investor URL prevista).
3. Opcional: template, branding runtime (`email_branding`, cor login, `main_area`), admin, terms, SMTP, gateway.
4. Aguardar até `FE_DEPLOY_CHECK` (`WAITING_MANUAL_ACTION`).

### 2–4. Preparar Investor / Entrepreneur / Admin (Netlify — manual)

Para **cada** app, no painel Netlify (homolog):

1. **Create site** (ou clone de um site homolog existente do mesmo repo) ligado ao repositório correto:
   - Investor: `loor-capital-suite`, build conforme `netlify.toml` (`base=artifacts/loor`, publish `dist/public`, branch tipicamente `dev` nos sites homolog documentados).
   - Entrepreneur: `empreendedor-loor`, publish `dist`.
   - Admin: `admin-canvas`, publish `dist`.
2. **Environment variables** (site → Environment → Production context = homolog oficial; não misturar com business prod):

| Variável | Investor | Entrepreneur | Admin |
| --- | --- | --- | --- |
| `VITE_PLATFORM_SLUG` | `{slug}` | `{slug}` (ou só `VITE_API_SLUG`) | `{slug}` |
| `VITE_API_SLUG` | — | `{slug}` (obrigatório no `apiFetch`) | — |
| `VITE_API_BASE_URL` | `https://back.loor.vc/service` | idem | idem |
| `VITE_APP_LOGO_URL` | URL pública do logo | idem | idem (favicon do Admin) |
| `VITE_APP_THEME_COLOR` | hex | hex | hex |
| `VITE_PWA_*` | conforme presets `loor`/`finapop` | idem | n/a |
| `VITE_PLATFORM_PREVIEW_ORIGIN` | Admin origin | — | Investor origin (preview) |
| `VITE_SHOWCASE_ENABLED` | **false** (exceto site `homologacao`) | — | — |

3. Trigger deploy / wait green.
4. **Domain management** → add custom domain:
   - Investor: `{slug}.investor.loor.vc`
   - Entrepreneur: `{slug}.empresa.loor.vc`
   - Admin: `{slug}.admin.loor.vc`

### 5. DNS (manual)

Para cada host, criar CNAME (ou o tipo que o Netlify indicar) apontando para o hostname Netlify do site.

Validar:

```text
nslookup {slug}.investor.loor.vc
nslookup {slug}.empresa.loor.vc
nslookup {slug}.admin.loor.vc
```

HTTPS: Netlify emite certificado após o domínio apontar. Esperar `https://…` abrir sem aviso.

**Wildcard** (`*.investor.loor.vc` etc.): útil para reduzir registros DNS, mas **não** elimina 3 sites/builds por WL enquanto o FE for Scenario B.

### 6. Validação funcional (obrigatória)

Para cada URL:

1. Carrega (SPA fallback `/* → /index.html`).
2. Network: requests à API com slug correto (`platform_slug` / `x-whitelabel-slug`).
3. Login / rota privada / refresh direto de rota.
4. Branding runtime (`main_area` / email) se provisionado; logo/PWA = o que foi bakeado no build.

Isolamento:

```text
Abrir {slugA}.investor… → settings/nome/slug do A
Abrir {slugB}.investor… → não pode mostrar dados do A
```

### 7. Completar `FE_DEPLOY_CHECK`

No Super Admin, no gate:

```json
{
  "checklist": { "investor": true, "entrepreneur": true, "admin": true },
  "urls": {
    "investor": "https://{slug}.investor.loor.vc",
    "entrepreneur": "https://{slug}.empresa.loor.vc",
    "admin": "https://{slug}.admin.loor.vc"
  }
}
```

A UI pré-preenche a convenção; ajuste se o domínio real divergir.

### 8. Completar `DNS_CHECK`

```json
{
  "checklist": { "resolves": true, "https": true },
  "hosts": {
    "investor": { "url": "https://…", "status": "ok", "https": true },
    "entrepreneur": { "url": "https://…", "status": "ok", "https": true },
    "admin": { "url": "https://…", "status": "ok", "https": true }
  }
}
```

### 9–10. VALIDATE → DELIVER

Automáticos. `delivery.urls` deve espelhar as URLs confirmadas (não as sugestões).

---

## Custo operacional (estrutural) por novo WL hoje

| Item | Quantidade |
| --- | --- |
| Builds Netlify | 3 (Investor + Entrepreneur + Admin) |
| Sites Netlify | 3 |
| Registros DNS | 3 (ou menos se houver wildcard por sufixo) |
| Certificados TLS | 3 (ou cobertos por wildcard cert no Netlify, se configurado) |
| Trabalho manual | criar sites + envs + DNS + gates no SA |

Com frontend compartilhado + hostname runtime no futuro: **0 sites extras por WL** (só DNS/wildcard + resolução segura no Core) — exige mudança de produto nos três FEs (hoje fora de escopo).

---

## URLs reais deste ciclo

```text
PENDENTE — ação humana no painel Netlify + DNS.
Nenhum site/domínio novo foi criado por este trabalho de código.
```

Quando existirem, registrar aqui e no `FE_DEPLOY_CHECK` do provisioning de teste `wl-hml-test`.
