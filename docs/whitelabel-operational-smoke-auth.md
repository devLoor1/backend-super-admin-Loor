# Whitelabel Operational V1 — autorização de smoke controlado

**Escopo autorizado:** **1× Create** + **1× PATCH name** · sem Activate/Deactivate/DELETE no FE.  
**Ambiente:** Nest homolog `https://backend-super-admin-loor.onrender.com` → Core AWS homolog.

---

## 1. Contenção (homolog compartilhada) — CONFIRMADO

Criar temporariamente um Whitelabel **ativo** com:

| Campo | Valor |
| --- | --- |
| `slug` | exclusivo `sa-op-smoke-<YYYYMMDD>` (ou sufixo curto único) |
| `baseUrl` | `https://sa-op-smoke.example.invalid` |
| `name` | ex. `SA Operational Smoke` |

**Por que não afeta tenants operacionais:**

1. **Resolução por Origin/slug** (`ResolveWhitelabel`) só casa host/slug da request. `example.invalid` **não resolve DNS** → nenhum browser/app real chega nesse tenant.
2. **Default tenant** usa `DEFAULT_WHITELABEL_SLUG` (não o smoke). Fallback “menor id ativo” **não** muda com um id novo alto.
3. **Auth de outros operadores/usuários** continua no tenant do Origin/slug deles; o smoke não entra nesse caminho.
4. **Slug exclusivo** → sem colisão (`E_SLUG_TAKEN` se repetir).
5. Registro aparece nas listagens Super Admin (esperado); isso **não** altera resolução pública nem tenants existentes.

**Não usar:** slugs/baseUrls de tenants reais (loor, finapop, laguna-*, homolog.loor.vc, …).

---

## 2. Origem FE temporária autorizada (CORS)

Nest homolog usa `CORS_ORIGIN` (lista CSV) — **não** abrimos CORS global (`*`).

### Opção preferida (sem FE compartilhado)

| Origem | Uso |
| --- | --- |
| `http://localhost:5173` | Build local do FE com `VITE_WHITELABEL_WRITES_ENABLED=true` apontando `VITE_API_BASE_URL` para `https://backend-super-admin-loor.onrender.com/api` |

**Pré-requisito Backend (Render Nest homolog):** garantir `CORS_ORIGIN` contendo essa origem (CSV, sem `*`).

Verificação feita em 2026-10-20: resposta homolog com `Origin: http://localhost:5173` **não** incluía `Access-Control-Allow-Origin` → browser bloquearia o smoke até o env ser corrigido.

Exemplo (preserve a origem do FE compartilhado se já existir):

```text
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,<origem-do-fe-homolog-publicado>
```

Após salvar no Render → restart do serviço. Confirmar preflight OPTIONS com `Access-Control-Allow-Origin: http://localhost:5173`.

### Opção alternativa (preview hospedado)

1. FE sobe preview **separado** (branch/PR) com writes enabled.
2. FE informa a **URL exacta** (ex. `https://….vercel.app`).
3. Backend acrescenta **só essa** origem em `CORS_ORIGIN` (append).
4. Após o smoke, Backend remove a origem temporária.

FE compartilhado de homolog **permanece** com writes desabilitados.

---

## 3. Desativação e recuperação — responsável Backend

| Papel | Responsável |
| --- | --- |
| Desativar WL de teste após smoke | **Lucas / Backend** (SUPER_ADMIN operacional) |
| Confirmar `isActive=false` via GET | Backend |
| Confirmar fora da resolução ativa | Backend (`findBySlug` / Origin → not found) |
| Logs `whitelabel_audit_failed` | Backend (Nest Render logs) |
| POST/PATCH incerto ou falha de deactivate | Backend — reconcilia por GET; deactivate retry manual |

### Procedimento pós-smoke (Backend)

```http
PATCH /api/whitelabels/:id/deactivate
Authorization: Bearer <SUPER_ADMIN>
```

Verificação:

```http
GET /api/whitelabels/:id
→ data.isActive === false, data.status === "inactive"
```

Resolução Core: slug/baseUrl do smoke **não** devem mais resolver como ativo.  
Registro permanece no banco (desativação lógica) — OK.

### Resultado incerto

- FE **não** reenvia Create/Update automaticamente.
- Backend: `GET ?search=sa-op-smoke` / `GET /:id`; se create aplicou, deactivate o id; se não, nada a limpar.
- Falha de deactivate: Backend retry; escalar se 5xx Core.

---

## 4. Autorização específica (este ciclo)

**Autorizado:** Conta 1 / operador SUPER_ADMIN de homolog executar **exatamente**:

1. Um `POST /api/whitelabels` com slug `sa-op-smoke-*` + `baseUrl` `https://sa-op-smoke.example.invalid`
2. Um `PATCH /api/whitelabels/:id` com `{ "name": "…" }` no registro criado

**Não autorizado neste smoke:** segundo Create, alteração de slug/baseUrl, Activate, Deactivate ou DELETE pelo FE (deactivate fica com Backend).

Após o smoke, avisar Backend com `id` + `correlationId` para desativação e evidência.
