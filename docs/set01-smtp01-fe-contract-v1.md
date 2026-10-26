# SET-01 + SMTP-01 — Contrato FE (completion)

**Data:** 2026-10-26  
**Ambiente:** Nest `https://backend-super-admin-loor.onrender.com/api` → Core AWS  
**Commits implantados (homolog smoke):** Core `08d5ef0` · Nest `8d661ec` (+ doc follow-up)  
**Auth:** Bearer operator JWT · writes `SUPER_ADMIN` · reads `SUPER_ADMIN` | `READ_ONLY`  
**Tenant QA:** Whitelabel **id=8** (`sa-op-smoke-20261020-a1-c8170b06`) para Settings writes. SMTP PATCH smoke usou **id=7** (config existente) com restore.  
**Não repetir smoke de descoberta** — evidências 26/10 já cobrem allowlist/reset/PATCH seguro.

Documento-mãe: [`multi-tenant-settings-backend-delivery-v1.md`](./multi-tenant-settings-backend-delivery-v1.md).  
CFG histórico: [`cfg-whitelabel-settings-qualification-v1.md`](./cfg-whitelabel-settings-qualification-v1.md) — este contrato **prevalece** nos pontos alterados.

---

## Mapa CFG ↔ Handoff (evitar tarefas duplicadas)

| CFG (backlog) | Handoff | Nota |
| --- | --- | --- |
| CFG-01 isolamento | comum a SET/SMTP | `whitelabelId` canônico nas rotas |
| CFG-02 settings write | **SET-01** (+ APP-01 composto) | allowlist + cell PUT + reset |
| CFG-03 SMTP read | **SMTP-01** GET | sem username/password |
| CFG-04 SMTP write | **SMTP-01** PATCH (+ PUT create) | metadata preserve credentials |
| CFG-05 SMTP test | **SMTP-02** | **fora** do 1º aceite FE |
| CFG-06 terms read | **LEG-01** GET | também embutido em Settings GET |
| CFG-07 terms publish | **LEG-01** PUT | não Settings PUT |
| CFG-08 Platform App | **APP-01** | allowlist `app_*`; full-row replace |
| CFG-09 branding | **BRD-01** / **AST-01** | AST main_area entregue; BRD Product |
| CFG-10/11 email events/templates | **EML-*** | Product/Core |
| CFG-12 gateways | adjacente | não neste lote |
| CFG-13 catálogos | adjacente | helpers RO |

---

## Regras comuns

| Regra | Contrato |
| --- | --- |
| Identidade | Só `:whitelabelId` numérico positivo. Slug/baseUrl = metadata de identidade no GET, **não** substituem o id. |
| Isolamento | Toda mutação é scoped ao id da URL. Cross-tenant → 404/403 do Core. |
| Timeout / 5xx | **Não** retry cego. Reconciliar com GET autoritativo do mesmo recurso. |
| Audit Nest | Settings: `{page,key,valueType}` · SMTP: campos não-secret + flags de replace · sem senhas/tokens. |

---

# SET-01 — Settings

## Endpoints

| Método | Path | Roles | Status sucesso |
| --- | --- | --- | --- |
| GET | `/api/whitelabels/:whitelabelId/settings` | SA, RO | **200** |
| PUT | `/api/whitelabels/:whitelabelId/settings` | SA | **200** |
| DELETE | `/api/whitelabels/:whitelabelId/settings/:page/:key/override` | SA | **200** |

`:page` / `:key` URL-encoded se necessário.

### Erros

| HTTP | code | Quando |
| --- | --- | --- |
| 401/403 | — | auth/role |
| 404 | `E_WHITELABEL_NOT_FOUND` | WL inválido |
| 422 | `E_VALIDATION` | page/key ausente, fora allowlist, value inválido |
| 5xx / 502 | — | incerto → GET reconcile |

## GET — envelope (sanitizado)

```json
{
  "data": {
    "whitelabel": {
      "id": 8,
      "slug": "sa-op-smoke-…",
      "name": "…",
      "baseUrl": "https://….example.invalid",
      "isActive": true
    },
    "settings": {
      "features": { "wallet_visible": true, "…": "…" },
      "quick_profile": { "theme": { "primaryColor": "#1a1aff", "…": "…" } },
      "terminology": { "config": { "…": "…" } },
      "dashboard": { "components": { "…": "…" } }
    },
    "provenance": [
      {
        "page": "login",
        "key": "title",
        "stored": false,
        "storedValue": null,
        "effectiveValue": null,
        "source": "absent",
        "version": null
      },
      {
        "page": "features",
        "key": "wallet_visible",
        "stored": false,
        "storedValue": null,
        "effectiveValue": true,
        "source": "default",
        "version": null
      }
    ],
    "terms": {
      "current": null,
      "history": []
    }
  }
}
```

### Como ler stored vs effective vs source

| Campo | Significado |
| --- | --- |
| `stored` | `true` = existe row DB `(wtlb,page,key)` |
| `storedValue` | valor da row se `stored`; senão **`null`** (sempre presente) |
| `effectiveValue` | o que o bag `settings[page][key]` expõe ao consumidor (default merge ou stored) |
| `source` | `stored` \| `default` \| `absent` |
| `version` | token opaco **apenas informativo** quando `stored`. **Não** há precondição atômica no PUT. |

**FE:** nunca confunda `settings.login.title === ""` com override vazio. Para células sem default de plataforma (`login/title` etc.), após DELETE override use `provenance` (`source=absent`, `effectiveValue=null`) — a chave pode sumir do bag ou aparecer vazia; **provenance manda**.

## PUT — uma célula

**Request**

```json
{ "page": "login", "key": "title", "value": "Texto do login" }
```

| Campo | Regra |
| --- | --- |
| `page`, `key` | obrigatórios; allowlist |
| `value` | obrigatório na prática; `null` permitido só onde allowlist aceita objeto/null (ex. compostos) |
| omitir `value` | não use — envie valor explícito |
| outras keys no body | ignoradas pelo Core (só page/key/value) |

**Response 200**

```json
{ "data": { "id": 22, "page": "login", "key": "title", "value": "Texto do login" } }
```

Isto **não** é o bag completo. Readback = **GET settings**.

### Allowlist (writes)

| page | keys |
| --- | --- |
| `login` | `title`, `subtitle`, `bullets`, `layout_preset`, `brand_panel_text_color`, `main_area_image`, `entry_presentation` |
| `register` | `content`, `main_area_image`, `entry_presentation` |
| `quick_profile` | `theme`, `main_area_image`, `entry_presentation` |
| `features` | 8 booleans (lista em delivery doc / Core `SA_FEATURE_KEYS`) |
| `terminology` | `config` |
| `dashboard` | `components` |
| `offers` | `presentation` |
| `app_entry` | `content` |
| `app_authenticated` | `content` |
| `email_branding` | `config` |

### Validação scalar (resumo)

- `login.title`: string 1..240, sem HTML/controles  
- `login.subtitle`: 1..1000  
- `login.bullets`: **array exatamente 3** strings 1..240  
- `login.layout_preset`: `side`\|`top`\|`hidden`  
- `login.brand_panel_text_color`: `#RRGGBB`  
- `features.*`: **boolean** estrito  

### Objetos compostos (APP-01 / theme / etc.)

- PUT **substitui o JSON inteiro** da célula (`value`).
- **Não** há deep-merge no servidor.
- **Não** há preservação server-side de propriedades omitidas dentro do objeto.
- FE: GET → partir de `provenance[].storedValue` se `stored`, senão do objeto Admin/default conhecido → editar → **reenviar o objeto completo**, preservando unknowns localmente.
- Versão incompatível de capability: FE deve bloquear edição; Core aceita object genérico na allowlist (sem schema profundo App nesta tranche).

## DELETE override — reset

```http
DELETE /api/whitelabels/8/settings/login/title/override
```

**Response 200**

```json
{
  "data": {
    "deleted": true,
    "page": "login",
    "key": "title",
    "stored": false,
    "effectiveValue": null,
    "source": "absent",
    "version": null
  }
}
```

- `deleted:false` se não havia row (ainda 200).
- **Não** grava o default atual como override.
- Confirmar com GET: `provenance` da célula `stored=false`.

## Procedimento FE (SET-01 aceite)

1. Snapshot GET (salvar provenance da célula).  
2. PUT célula allowlisted.  
3. GET: `stored=true`, `storedValue`/`effectiveValue` batem.  
4. Outras células / outro WL inalterados.  
5. Restaurar: PUT valor anterior **ou** DELETE override se `stored` era false.  
6. GET final = snapshot.  
7. Timeout/5xx: só GET; sem segundo PUT automático.

---

# SMTP-01 — SMTP metadata

## Endpoints

| Método | Path | Roles | Sucesso |
| --- | --- | --- | --- |
| GET | `/api/whitelabels/:id/emails/smtp` (+ alias `/smtp`) | SA, RO | **200** |
| PATCH | mesmo | SA | **200** |
| PUT | mesmo | SA | **200** (create/full upsert) |
| POST `…/test` | — | SA | **SMTP-02** — **fora** deste aceite |

### GET 200 — configurado (sanitizado)

```json
{
  "data": {
    "id": 6,
    "whitelabelId": 7,
    "host": "smtp.example.com",
    "port": 587,
    "secure": 0,
    "hasUsername": true,
    "hasPassword": true,
    "fromEmail": "no-reply@example.com",
    "fromName": "Loor",
    "tlsRejectUnauthorized": true,
    "active": true,
    "configured": true,
    "version": "6:2026-…",
    "createdAt": "…",
    "updatedAt": "…"
  }
}
```

### GET 200 — ausente

```json
{ "data": null }
```

**Proibido no DTO:** `username`, `password`, qualquer masked editable credential.

### PATCH — metadados (preferido para edição)

**Request (exemplo)**

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "fromEmail": "no-reply@example.com",
  "fromName": "Nome exibido",
  "tlsRejectUnauthorized": true,
  "active": true
}
```

| Campo | Omitido | `null` | Presente |
| --- | --- | --- | --- |
| host, port, secure, fromEmail, tls*, active | preserva | N/A (não envie null em boolean/port) | atualiza |
| fromName | preserva | **limpa** (`null` no DB) | atualiza string |
| `username` / `password` | — | — | **422** — use `replaceUsername` / `replacePassword` |
| replaceUsername | — | — | troca username |
| replacePassword | — | — | troca password; `""` → 422 |

PATCH em WL **sem** config → 422 `E_EMAIL_CONFIG_MISSING` (criar via PUT).

**Response:** mesmo shape seguro do GET.

### PUT — create / full upsert

Obrigatórios: `host`, `port`, `username`, `fromEmail`.  
Create: `password` obrigatório.  
Update via PUT: password omitido = preserva; `username` ainda exigido no body atual do PUT (por isso **edição operacional = PATCH**).

### version

Campo opaco no GET/PATCH response. **Não** há rejeição 409 por version mismatch nesta tranche. Tratar como ETag informativo para UI, não como lock.

### Procedimento FE (SMTP-01 aceite)

1. GET — confirmar ausência de username/password.  
2. PATCH um metadado (ex. `fromName`) em fixture com SMTP.  
3. GET confirma; credenciais intactas (`hasUsername`/`hasPassword` inalterados).  
4. Restaurar metadado.  
5. **Não** POST test neste aceite.  
6. 5xx: GET only.

---

## Estado desta etapa Backend

| Item | Status |
| --- | --- |
| Implementado + implantado | Sim (commits acima; smoke 26/10) |
| Contrato FE utilizável | Este documento |
| Cenários BE testados | allowlist, reset, SMTP safe GET, PATCH+restore, rejeição username no PATCH |
| Não testados neste ciclo | upload AST positivo com binário; LEG publish; SMTP test send |
| Fixture | WL8 settings title revertido via DELETE; WL7 fromName restaurado |
| Próxima responsabilidade | **FE** integrar SET-01 + SMTP-01; BE só corrige incompatibilidade concreta reportada |

## Limitações conhecidas

1. `version` Settings/SMTP **não** é precondição atômica.  
2. Compostos = full-row replace; preservação de unknowns é **dever do FE** no payload.  
3. Defaults de plataforma existem para features/theme/terminology/dashboard — **não** para `login/title|subtitle|bullets`.  
4. SMTP-02 / BRD-01 / LEG publish / EML fora do 1º aceite.
