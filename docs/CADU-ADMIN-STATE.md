# Cadu Admin (`/admin/cadu.html`) — Estado Atual

> **Aviso de leitura (2026-06-29):** este documento preserva auditorias v1/v2 com achados históricos. Vários pontos antigos sobre `cadu-api v0.4.2`, token obsoleto, endpoints 404 e restart pendente foram corrigidos ou reclassificados na seção **v3 — Verificação Codex pós-devolutiva OpenClaw (2026-06-29)** no fim do arquivo. Para estado vivo atual, leia a v3 primeiro e use v1/v2 como contexto histórico.

> **Nota de migração de modelos (2026-08-02):** os provedores anteriores foram removidos do runtime; suas menções abaixo são registros históricos. O runtime atual usa DeepSeek V4 Flash, com DeepSeek V4 Pro como única alternativa.

**Última atualização:** 2026-08-03 (contrato DeepSeek-only; narrativa histórica preservada)
**Branch kino-campus:** `kinocampus-V75.0-foundations`
**Commits relevantes:**
- `218e7a6` — feat(admin/cadu): cross-tab "Perguntar Cadu" buttons + status indicators
- `e86f0a4` (implícito) — feed-router rewrite + admin namespace consolidation
- `db2b025` — pipeline-kino.js BUG A fix (v0.4.6 no repo)
- `5891525` — versionar scripts críticos no openclaw-cadu

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser (admin/cadu.html)                                            │
│   ├─ HTML estático (Vercel CDN, ?v=218e7a6ffc2b cache-bust)        │
│   ├─ admin-cadu.controller.js (1694 linhas, monolítico IIFE)         │
│   └─ localStorage: kc:cadu:tab, kc_cadu_seen_runs                  │
│                                                                       │
│ ▼ Vercel Edge /api/cadu/* (proxy + Bearer token; URLs públicas)     │
│   ├─ api/cadu/health.js      → /api/health                            │
│   ├─ api/cadu/sites.js       → /api/sites                             │
│   ├─ api/cadu/feed.js        → /api/cadu/feed?limit=N                 │
│   │                          → /api/cadu/feed?path={id}               │
│   │                          → /api/cadu/feed?path={id}/ask           │
│   │                          → /api/cadu/feed?path=admin/redeploy     │
│   ├─ api/cadu/pipeline.js    → /api/cadu/pipeline (lista + run)       │
│   ├─ api/cadu/pipeline-router.js → /api/cadu/pipeline/* (rewrite → ?path=)│
│   ├─ api/cadu/openclaw-router.js → /api/cadu/openclaw/* (rewrite → ?path=)│
│   ├─ api/cadu/publish.js     → /api/cadu/publish                      │
│   └─ vercel.json rewrites:                                               │
│       /api/cadu/sites/(.+)      → /api/cadu/sites?path=$1               │
│       /api/cadu/pipeline/(.+)   → /api/cadu/pipeline-router?path=$1     │
│       /api/cadu/openclaw/(.+)   → /api/cadu/openclaw-router?path=$1     │
│                                                                       │
│ ▼ cadu-api (FastAPI sidecar na VPS)                                  │
│   ├─ VPS: srv1597083.hstgr.cloud (Hostinger)                         │
│   ├─ Container: openclaw-hahq-cadu-api                                │
│   ├─ Bind mount: /docker/openclaw-hahq/data → /data                   │
│   ├─ Versão atual: **v0.4.2** (server.py novo v0.4.6 deployado no   │
│   │  filesystem mas container ainda NÃO foi reiniciado)              │
│   └─ Auth: admin_auth_required (Yan rotacionou tokens após exposição)│
│                                                                       │
│ ▼ OpenClaw (Docker container na VPS)                                 │
│   ├─ VPS: openclaw-hahq.srv1597083.hstgr.cloud                        │
│   ├─ Bind mount: mesmo /data (visível ao cadu-api)                    │
│   └─ Skills: cadu-api, hhmail, etc (em /data/.openclaw/skills/)       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🚨 STATUS ATUAL (2026-06-28)

| Componente | Status | Detalhes |
|-----------|--------|----------|
| **cadu-api (VPS)** | ⚠️ **UP mas admin_auth_required** | Yan rotacionou tokens após exposição no chat. TODOS endpoints `/api/*` (exceto `/health`) retornam `401 admin_auth_required`. `/health` retorna `200 version=0.4.2`. |
| **cadu-api version** | ❌ **0.4.2 (não atualizado)** | server.py v0.4.6 está escrito no filesystem (`/data/.openclaw/skills/cadu-api/server.py`, 1493 linhas, md5 confere com `5891525`) mas container foi iniciado com versão antiga. **Restart manual pendente.** |
| **cadu-api endpoint `/api/openclaw/context`** | ❌ **404** | Endpoint novo (v0.4.6) não carregado no cadu-api container. Quando restartar v0.4.6, esse endpoint consolidará sites+pipeline+feed+openclaw em 1 request. URL pública via Vercel proxy: `/api/cadu/openclaw/context` (rewrite → `/api/cadu/openclaw-router?path=context`). |
| **cadu-api endpoint `/api/feed/{id}/ask`** | ❌ **404** | Mesmo motivo (cadu-api v0.4.2 não tem). URL pública via Vercel proxy: `/api/cadu/feed?path={id}/ask` (Vercel proxy repassa como POST para `https://cadu-api/api/feed/{id}/ask`). Cai no fallback `agent-send` no controller. |
| **Vercel proxy `/api/cadu/*`** | ⚠️ **Funciona, mas retorna 502/cadu_api_error** | Vercel injeta `Bearer CADU_API_TOKEN` que **foi rotacionado**. Token local em `C:\Users\yan1n\Documents\GitHub\kino-campus\.env` (`3dcbe...`) está obsoleto. |
| **OpenClaw (VPS)** | ⚠️ **UP requer login** | Página `/` retorna HTML com form de token. Endpoint `/agent-send` requer autenticação. Yan fez login em algum momento, mas agora pode ter deslogado. |
| **TRUSTED_ADMIN_EMAILS (controller)** | ❌ **VAZIO** | `var TRUSTED_ADMIN_EMAILS = []` (linha 147). Antes tinha 3 emails hardcoded, Yan limpou por segurança. |
| **DEV BYPASS** | ❌ **DESABILITADO** | Linha 154: `if (false)` — sempre pula o bypass `?test_bypass=kc_admin_2026`. |
| **UI render** | ✅ **Funciona** | HTML/CSS renderiza corretamente. Gate de auth bloqueia dynamic state mas UI está visível. |

### Diagnóstico de fluxo de auth (controller linhas 149-269)

```
CAMADA 1 (mais alta): DEV BYPASS via ?test_bypass=kc_admin_2026 → if (false) = DESATIVADO
CAMADA 2: extrai email de localStorage('kc:user') → window.KCSupabase.getCurrentUser()
          → window.KCSupabase.refreshSession()+getUser() → window.KCAPI.getCurrentUser()
          se email ∈ TRUSTED_ADMIN_EMAILS (VAZIO) → libera
CAMADA 3: KC_ENV.driver === 'supabase' (else: acesso negado)
CAMADA 4: Supabase Auth session (else: redirect /index.html#login)
CAMADA 5: re-checa TRUSTED_ADMIN_EMAILS com user.email do Auth (VAZIO)
CAMADA 6: profiles.is_admin no Supabase via client.from('profiles').select('is_admin,...')
          (fonte da verdade; se is_admin=false → acesso negado)
```

**Quando CAMADAS 1/2/5 falham (todas desabilitadas ou VAZIAS)** + driver correto + Supabase sem sessão → **acesso negado + redirect pra `/index.html#login`**.
**Quando há sessão válida mas `profiles.is_admin=false`** → **acesso negado + dica de `node scripts/grant-admin.js <email>`**.

### Para destravar agora (Yan precisa fazer 1-3 coisas)

1. **SSH + recriar cadu-api (NÃO usar `docker restart`)**:
   ```bash
   ssh root@srv1597083.hstgr.cloud
   cd /docker/openclaw-hahq
   docker compose up -d cadu-api   # recria o container pra recarregar env vars
   sleep 10
   docker exec openclaw-hahq-cadu-api env | grep CADU_API_TOKEN  # confirma token novo
   curl -sS http://localhost:49104/health  # deve retornar version=0.4.6
   ```
   ⚠️ **`docker restart` NÃO basta**: container tem `restart: unless-stopped` mas env vars só recarregam com `docker compose up -d` (recria container e relê `.env`).

2. **Atualizar `CADU_API_TOKEN` em Vercel** com o token novo (que Yan rotacionou). Vercel CLI:
   ```bash
   vercel env rm CADU_API_TOKEN production --token $env:VERCEL_TOKEN --yes
   vercel env add CADU_API_TOKEN production --token $env:VERCEL_TOKEN --sensitive
   # paste novo token
   ```

3. **Adicionar email Yan em TRUSTED_ADMIN_EMAILS** (linha 147) — opcional, only if Yan quiser bypass sem Supabase Auth.

---

## 📄 `admin/cadu.html` — Estrutura HTML (583 linhas)

### Top-level
```html
<body class="kc-admin-page kc-admin-page--dashboard kc-admin-page--cadu">
  <main class="kc-main-content" id="kc-main">
    <div class="kc-cadu-wrapper">
      <!-- Auth gate: loading / access-denied / error -->
      <div id="cadu-loading">...</div>
      <div id="cadu-access-denied"></div>
      <div id="cadu-error"></div>
      <div id="cadu-content" style="display:none;">
        <!-- Hero, KPIs, Tabs, Sections, Footer -->
      </div>
    </div>
  </main>
</body>
```

### Hero
```html
<section class="kc-cadu-hero">
  <h1>🤖 Cadu (OpenClaw)</h1>
  <p>Curador de sites institucionais e perfis do Instagram da UFG.</p>
  <div class="kc-cadu-status-pills">
    <span class="kc-cadu-status" id="cadu-status-pill">...</span>  ← main status
    <span class="kc-cadu-status" id="cadu-bot-pill">...</span>     ← telegram bot
    <span class="kc-cadu-status" id="cadu-context-pill">...</span>  ← v0.4.6+ only
    <span class="kc-cadu-status" id="cadu-version-pill">...</span>  ← version
  </div>
  <button id="cadu-refresh-btn">↻ Atualizar</button>
  <a href="https://github.com/yandiamantinoBr/openclaw-cadu">Repo</a>
</section>
```

### KPIs
| KPI | ID | O que mostra |
|-----|----|---------------|
| Unidades UFG | `#kpi-sites` | Total de sites no mapa curado |
| IG confirmado | `#kpi-ig-confirmed` | Perfis com IG validado |
| Tier 1 | `#kpi-tier1` | Quantos sites T1 (alta prioridade) |
| Memória | `#kpi-memory` | Chunks indexados do Cadu memory |
| cadu-api | `#kpi-api` | OK / OFF |

### Tabs (4)
```html
<button class="kc-cadu-tab is-active" data-tab="sites">🏛️ Sites UFG <span id="badge-sites">—</span></button>
<button class="kc-cadu-tab" data-tab="feed">📊 Feed coletado <span id="badge-feed">—</span></button>
<button class="kc-cadu-tab" data-tab="pipeline">⚙️ Pipeline <span id="badge-pipeline">—</span></button>
<button class="kc-cadu-tab" data-tab="openclaw">🤖 OpenClaw <span id="badge-openclaw">—</span></button>
```

Cada tab tem `<span class="kc-cadu-tab__badge">` que mostra count/items/status.

### Notification bell (no header, fora da wrapper)
```html
<button class="kc-notif-bell" id="kcNotifBell">🔔
  <span class="kc-notif-badge" id="kcNotifBadge">0</span>
</button>
<div id="kcNotifDropdown" class="kc-notif-dropdown" hidden>
  <div class="kc-notif-dropdown__head">Atividade recente</div>
  <div id="kcNotifList" class="kc-notif-dropdown__list">...</div>
  <div class="kc-notif-dropdown__foot"><a href="#tab-pipeline">Ver pipeline →</a></div>
</div>
```

---

## 🏛️ ABA 1: Sites UFG (default)

### Funcionalidades
- **Tabela editável** com 58 unidades UFG (56 ativas + 2 filtradas por padrão)
- **Tier dropdown** (T1/T2/T3/—) com auto-save debounce 700ms → PATCH `/api/sites/{id}/meta`
- **Observação (note) textarea** com auto-save → mesmo endpoint
- **Instagram link clicável** rosa (#e1306c) — abre instagram.com/{handle}
- **Status IG badge** (confirmed/tentative/missing/unknown) — cor dinâmica
- **URL clicável** — abre site institucional
- **Botão publicar** (avião de papel) — POST `/api/cadu/publish` com state.publishingKey (anti double-click)
- **Botão "Perguntar Cadu"** (robô) — POST `/api/cadu/openclaw/agent-send` com `<site-context>` (cyan/blue)
- **Filtros**: search (nome/site/@instagram), tier (1/2/3), IG status
- **CSV export** — botão gera blob UTF-8 BOM e download client-side
- **Auto-load** na `refreshAll()` quando tab=sites

### Funções principais (linhas 331-401)
```js
loadSites()               // fetch /api/cadu/sites, popula state.allSites
applySitesFilter()         // aplica search/tier/ig filter
computeKpis()              // calcula kpi-sites, kpi-tier1, kpi-ig-confirmed
renderSitesTable()         // renderiza tbody com todos os controles
scheduleSiteSave(site, field, value)  // debounce 700ms
commitSiteSave(site, payload)        // PATCH /api/sites/{id}/meta
csv export (downloadCsv)
```

### Status: ✅ **FUNCIONA** (mas com bug menor conhecido)

| Aspecto | Status |
|---------|--------|
| Render da tabela | ✅ 56 sites renderizados |
| Edição de Tier | ✅ Auto-save 700ms + status visual (✓ verde / ⚠️ âmbar / ❌ vermelho) |
| Edição de Nota | ✅ Auto-save 700ms |
| Filtros | ✅ Search + Tier + IG |
| Botão Publicar | ✅ Alert feedback + estado `is-ok`/`is-err` |
| Botão Perguntar Cadu | ✅ Vira para aba OpenClaw + envia mensagem |
| CSV export | ✅ Funciona |
| **BUG POTENCIAL**: Badges IG status | ⚠️ Valores vêm `unknown` em vários (exa: SECOM, FCT, FH). Status real deveria vir do `scan-ig-browser.js` mas muitos sites não têm IG. |

---

## 📊 ABA 2: Feed coletado

### Funcionalidades
- Lista chunks do Cadu memory (DB SQLite em `/data/.openclaw/memory/main.sqlite`)
- Cada item: hash (chunk_id truncado), heading, snippet, timestamp
- **Botão "Perguntar Cadu"** (robô) — POST `/api/cadu/feed/{chunk_id}/ask` (com fallback agent-send se 404)
- **Filtro de busca** por snippet/heading/chunk_id
- **Limite**: 20/50/100 itens (select dropdown)
- **Mais** (load more) — incrementa state.feedLimit
- **Recarregar** manual
- **Auto-load** na `refreshAll()` mesmo se tab não for feed (atualiza KPI Memória)

### Funções principais (linhas 482-573)
```js
loadFeed(initial)         // fetch /api/cadu/feed?limit=N
applyFeedFilter()         // filtra por q (search)
```

### Status: ✅ **FUNCIONA** (após fix commit `148b0c6`)

| Aspecto | Status |
|---------|--------|
| Listagem de chunks | ✅ 20 itens por padrão, 3394 bytes típico |
| Snippet format | ✅ Markdown preservado, escapeHtml OK |
| Filtro busca | ✅ Case-insensitive |
| Botão Perguntar Cadu | ⚠️ **404** (cadu-api v0.4.2, não v0.4.6) — cai no fallback `agent-send` |
| Load more | ✅ |
| Refresh manual | ✅ |
| **BUG POTENCIAL**: Snippet truncado em 500ch | Pode perder contexto em chunks grandes |

---

## ⚙️ ABA 3: Pipeline

### Funcionalidades
- **Lista de estágios pré-definidos** (9 estágios): curator, ig, duplicates, format, publish, enrich, dedup, sigaa, all
  - Cada estágio: nome, descrição, estimated_sec, category, last_run status
  - Botão "Executar" → POST `/api/cadu/pipeline/run` (com 409 conflict se já ativo)
- **Execução atual** (active card): stage, status badge, dot pulsante, botão Parar (SIGTERM)
- **Log streaming** (SSE) via `EventSource` em `/api/cadu/pipeline/{id}/stream`
  - Auto-scroll inteligente (só se usuário estava no fim)
  - Linhas coloridas (verde sucesso, vermelho erro)
- **Histórico** (20 runs mais recentes): stage, status, exit_code, duração
  - 4 botões por run terminado: 👁 Ver (modal), ⬇ Baixar log, 📤 Export JSON, 🤖 Perguntar Cadu
- **Modal de detalhes**: lista de artifacts (curator_daily, truly_new, formatted, enriched, publish_temp) + log tail
- **Auto-refresh 5s** quando tab=pipeline
- **Auto-refresh 15s** quando tab=openclaw

### Funções principais (linhas 1130-1450)
```js
refreshPipeline()              // GET /api/cadu/pipeline (status + history)
renderPipelineStages(stages)   // cards de estágios
renderPipelineActive(active)   // active card + dot pulsante
renderPipelineHistory(history) // lista de runs passados
openRunDetailsModal(runId)      // modal com artifacts + log
downloadRunLog(runId)          // download .log file
downloadRunExport(runId)        // download JSON consolidado
askCaduAboutRun(runId)         // preenche chat OpenClaw com pergunta
stopPipelineRun(runId)          // POST /pipeline/{id}/stop
connectPipelineStream(runId)    // SSE EventSource
appendLogLine(text)             // adiciona linha ao log com cor
```

### Status: ✅ **FUNCIONA** (parcialmente — cadu-api ainda v0.4.2)

| Aspecto | Status |
|---------|--------|
| Lista de estágios | ✅ 9 estágios renderizados |
| Botão Executar | ✅ POST + 409 conflict + alert feedback |
| Execução atual | ✅ Card + dot pulsante + botão Parar |
| Log streaming | ✅ SSE via Vercel rewrite (`/api/cadu/pipeline-router?path={id}/stream`) |
| Auto-refresh 5s | ✅ |
| Histórico | ✅ 20 runs + filtros por status |
| Botões de ação (4 por run) | ✅ |
| Modal de detalhes | ✅ Artifacts + log tail |
| Stop (Parar) | ✅ Confirm + POST + alert |
| **BUG CONHECIDO (corrigido em commit `db2b025`)**: skip format com publish sem formattedDescription | ✅ Resolvido |
| **BUG CONHECIDO (corrigido em commit `75be611`)**: parse regex do enrich result | ✅ Resolvido |
| **ATENÇÃO**: Logs de runs muito longos (>100KB) podem travar UI | ⚠️ Monitorar |

---

## 🤖 ABA 4: OpenClaw (Cadu agent)

### Funcionalidades
- **4 stat cards**:
  - AGENT: status (online/offline) + main + deepseek-v4-flash + ctx 1M tokens
  - TELEGRAM: ON/OFF + bot ID truncado + 1/1 account
  - HEARTBEAT: timestamp + cadence
  - TASKS: total/0/0 ratio
- **Chat com Cadu** (textarea 4000 chars + checkbox "salvar na sessão")
  - POST `/api/cadu/openclaw/agent-send` (Yan recebe resposta streaming-like com payloads)
  - session_id opcional (mantém contexto entre mensagens)
- **Sessões recentes** (8 últimas): title + meta (timestamp, count)
- **Ações rápidas**:
  - Trigger Heartbeat → POST `/api/cadu/openclaw/agent-event`
  - Ver logs do Gateway → GET `/api/cadu/openclaw/logs?limit=100`
- **Auto-refresh 15s** quando tab=openclaw
- **Botão "🤖 Perguntar Cadu"** (cross-tab) — usado por outras abas (Sites/Feed/Pipeline) para abrir chat com contexto pré-preenchido

### Funções principais (linhas 621-823)
```js
refreshOpenclaw()                // GET status + sessions + logs
openclawSendChat(ev)             // POST agent-send, render user+cadu msgs
openclawTriggerHeartbeat()       // POST agent-event
appendChatMsg(role, text, meta)  // render mensagem
askCaduContext(ev)               // CROSS-TAB: usado por Sites/Feed/Pipeline
pollNotifActivity()              // notification bell (novo v0.4.6)
```

### Status: ✅ **FUNCIONA** (com autenticação)

| Aspecto | Status |
|---------|--------|
| 4 stat cards | ✅ Atualizam a cada 15s |
| Chat textarea | ✅ Max 4000 chars |
| Submit mensagem | ✅ session_id persistente |
| Sessões recentes | ✅ Últimas 8 |
| Trigger Heartbeat | ✅ |
| Ver logs Gateway | ✅ |
| Botão Perguntar Cadu (cross-tab) | ✅ Implementado em Sites/Feed/Pipeline |
| Notification bell | ✅ Commit `218e7a6` (badge + dropdown + polling) |
| **BUG**: OpenClaw requer login (`/api/openclaw/agent-send` → 401 admin_auth_required) | ⚠️ Yan rotacionou tokens |
| **BUG**: OpenClaw container requer login web (form HTML) | ⚠️ Yan precisa logar via browser |

---

## 🔔 Notification Bell (cross-tab)

### Funcionalidade (commit `218e7a6`)
- Bell clicável no header (com badge contador)
- Dropdown mostra últimas 8 pipeline runs com:
  - Título (stage)
  - Status pill (verde/amarelo/vermelho)
  - Tempo relativo ("5min atrás")
  - Exit code
- Click no item → switchTab('pipeline') + scroll pro run específico
- Badge: conta **runs novas** desde última visita (localStorage `kc_cadu_seen_runs`) OU runs das últimas 24h
- Polling 30s: atualiza cadu-api version pill + activity bell

### Status: ✅ **FUNCIONA** (UI), ⚠️ **404 no backend** (cadu-api v0.4.2 não tem `/api/openclaw/context`)

---

## 🔄 Cross-tab "Perguntar Cadu" (commit `218e7a6`)

### Fluxo
1. User clica em botão "🤖" em qualquer item (Site / Feed chunk / Pipeline run)
2. `askCaduContext(ev)` é chamado com `data-ask-kind` (site/feed/pipeline)
3. Constrói mensagem com tag `<kind-context>` + pergunta específica
4. **Para feed**: tenta POST `/api/cadu/feed/{id}/ask` (404 → fallback agent-send)
5. **Para site/pipeline**: POST `/api/cadu/openclaw/agent-send` direto
6. `switchTab('openclaw')` → usuário vê a conversa pré-pronta

### Status: ✅ **FUNCIONA** (com fallback gracioso)

| Endpoint | Status |
|----------|--------|
| `/api/cadu/feed/{chunk_id}/ask` | ❌ 404 (cadu-api v0.4.2) → cai no fallback `agent-send` |
| `/api/cadu/openclaw/agent-send` | ❌ 401 admin_auth_required |
| Fallback funciona? | ⚠️ Cai no admin_auth_required também — **bloqueado** |

**Resultado atual**: clica em "Perguntar Cadu" → vai pra aba OpenClaw → mensagem pré-preenchida mas user precisa **clicar em Enviar manualmente** → falha com 401.

---

## 📁 Arquivos-chave (localização + estado)

| Arquivo | Linhas | Estado |
|---------|--------|--------|
| `admin/cadu.html` | 583 | ✅ Vercel deploy, UI funciona |
| `assets/js/controllers/admin/admin-cadu.controller.js` | 1694 | ✅ Commitado (vários commits) |
| `api/cadu/health.js` | ~50 | ✅ Vercel proxy |
| `api/cadu/sites.js` | ~80 | ✅ Vercel proxy |
| `api/cadu/feed.js` | ~80 | ✅ Commit `148b0c6` consolidação |
| `api/cadu/pipeline-router.js` | ~80 | ✅ Vercel proxy com capture group |
| `api/cadu/openclaw-router.js` | ~80 | ✅ Vercel proxy com capture group |
| `vercel.json` | ~85 | ✅ 7 functions totais, dentro do limite Hobby 12 |
| `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py` | 1493 | ⚠️ v0.4.6 escrito no filesystem, container ainda em v0.4.2 |
| `openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py` | 571 | ✅ Commitado |
| `openclaw-cadu/data/.openclaw/workspace/scripts/pipeline-kino.js` | 746 | ✅ Commit `75be611` |
| `openclaw-cadu/data/.openclaw/workspace/scripts/cadu-curador-v4.4.js` | 2144 | ✅ Commit `5891525` (com patches BUG B/C) |

---

## 🐛 Bugs Conhecidos (junho 2026)

### ✅ RESOLVIDOS
1. **BUG A** (commit `db2b025`): skip format + publish sem formattedDescription
2. **BUG B** (patch VPS): isExpired não detectava "horário passado"
3. **BUG C** (patch VPS): score > 1.0 sem cap
4. **FRAG A** (patch VPS): cache `kino-posts-cache.json` 14 dias stale → rebuildado
5. **FRAG F v1** (commit `68717b2`): 2 catch(_) críticos agora logam
6. **FRAG F v2** (commit `75be611`): regex do enrich result mais robusto

### ⚠️ PENDENTES (junho 2026)
1. **cadu-api v0.4.6 não restartado** — server.py novo deployado mas container ainda roda v0.4.2
2. **Yan rotacionou tokens** — `CADU_API_TOKEN` antigo obsoleto, Vercel precisa atualizar
3. **admin_auth_required em TUDO** — cadu-api agora exige auth admin em vez de Bearer simples
4. **DEV BYPASS desabilitado** (`if (false)` na linha 154) — não dá pra testar UI sem login real
5. **TRUSTED_ADMIN_EMAILS vazio** — única forma de acesso é via Supabase Auth
6. **OpenClaw requer login web** — `https://openclaw-hahq.srv1597083.hstgr.cloud/` mostra form de token
7. **SECOM /e/ parser** — sites como `ufg.br/e/39237` não são capturados pelo scraper SECOM
8. **97 scripts no VPS, ~60 legacy** — arquivados em `/tmp/legacy-scripts-archive/scripts-legacy-2026-06-26.tar.gz`

### 🎯 Próximos passos sugeridos
1. **URGENTE**: SSH + restart cadu-api + atualizar `CADU_API_TOKEN` no Vercel
2. Reativar DEV BYPASS (mudar `if (false)` para checar query string `?test_bypass=`)
3. Adicionar email Yan em TRUSTED_ADMIN_EMAILS
4. Implementar scraper SECOM que detecta links `ufg.br/e/*` (BUG D)
5. Cleanup dos scripts legacy (mover para `_legacy/`)
6. Documentar processo de rotação de tokens

---

## 🔧 Como debugar (workflow recomendado)

### Quando a UI não carrega
1. Abrir DevTools → Console → ver erros
2. Checar `localStorage.kc:user` → se vazio, usuário deslogado
3. Verificar `KC_ENV.driver` → deve ser `supabase`
4. Verificar Supabase Auth session (cookies)

### Quando cadu-api retorna 401
1. Verificar `CADU_API_TOKEN` em Vercel env vars
2. Comparar com `os.getenv("CADU_API_TOKEN")` no cadu-api container
3. Se diferentes: atualizar Vercel + redeploy

### Quando pipeline falha
1. Ver `cadu-pipeline-logs/{run_id}.log` no VPS
2. Cada stage imprime `[stage_name]` timestamps
3. Stage 4 (format) usa DeepSeek V4 Pro — pode dar timeout
4. Stage 5 (publish) chama Edge Function `cadu-publish` no Supabase

---

## 📞 Quem/Quando contatar

- **Yan** (você): para decisões de produto, rotação de tokens, deploys manuais
- **Cadu agent** (OpenClaw container): para executar comandos na VPS (precisa estar logado)
- **Mavis** (eu): para análise de logs, patches de código, validação via Playwright, automação

---

**Próxima ação crítica:** Yan precisa fazer SSH + `docker compose up -d cadu-api` (em `/docker/openclaw-hahq`, NÃO `docker restart`) + atualizar `CADU_API_TOKEN` no Vercel. Sem isso, a UI mostra dados stale (ou 401) e os botões "Perguntar Cadu" não funcionam. Sem restart v0.4.6, o notification bell polling `/api/cadu/pipeline/runs` retorna 404 e `/api/cadu/openclaw/context` consolidado nunca ativa.

---

# v2 — Auditoria Profunda (2026-06-29)

> Adicionado por Mavis após análise de código real (admin/cadu.html 613L,
> admin-cadu.controller.js 1694L, server/cadu-auth.mjs 131L,
> api/cadu/*.js 7 arquivos, server.py 1493L, pipeline.py 571L).
> Tudo aqui foi validado lendo o código, não inferido.

---

## 1. Auth: 3 camadas com responsabilidades diferentes

O sistema tem **3 camadas de autenticação** validando coisas distintas:

### CAMADA 1 — Client UI (`admin-cadu.controller.js:149-269`)
- Roda **no browser** do admin
- Verifica `profiles.is_admin` no Supabase via `client.from('profiles').select('is_admin,...')`
- Fallbacks em cadeia: localStorage `kc:user` → `KCSupabase.getCurrentUser()` → `KCSupabase.refreshSession()+getUser()` → `KCAPI.getCurrentUser()`
- Se nenhuma fonte tem email → `TRUSTED_ADMIN_EMAILS.indexOf(email) !== -1` (atualmente VAZIO)
- Se Supabase Auth sem sessão → redirect `/index.html#login` (2s delay)
- **Final fallback**: `profiles.is_admin === true`
- ⚠️ Client-side é **performance gate**, não segurança real. Fácil de burlar via DevTools.

### CAMADA 2 — Vercel proxy (`server/cadu-auth.mjs:74-124`)
- Roda em **Vercel Edge** (Node serverless)
- Lê `Authorization: Bearer <jwt>` **OU** `?kc_admin_token=<jwt>` (query string pro caso SSE)
- Chama Supabase `/auth/v1/user` com o JWT → valida sessão
- Verifica admin via `kc_is_admin(p_user_id)` RPC **OU** fallback `profiles.is_admin`
- ⚠️ A RPC `kc_is_admin` precisa existir no Supabase (PostgREST) — se não existir, fallback automático
- Retorna `{ id, email }` se admin, ou 401/403/503
- **Esta é a fonte da verdade server-side do KinoCampus.** cadu-api recebe apenas um `Bearer CADU_API_TOKEN` server-side (não vê o JWT Supabase)

### CAMADA 3 — cadu-api container (`server.py:152-179`)
- Roda **na VPS** (FastAPI + uvicorn)
- Lê `Authorization: Bearer <CADU_API_TOKEN>` da env var do container
- `_optional_token_or_query` para SSE aceita header OU `?token=<EXPECTED_TOKEN>` query string
- **Cadu-api NÃO sabe qual usuário admin está chamando** — vê apenas um Bearer token compartilhado
- 401 se token errado, 503 se `EXPECTED_TOKEN` vazio (fail closed)
- Exceções notáveis:
  - `GET /pipeline/{id}/artifacts` (linha 872), `GET /pipeline/{id}/log` (linha 941), `GET /pipeline/{id}/export` (linha 965) **NÃO têm Depends(require_token)** — desprotegidos no cadu-api, mas passam pelo Vercel proxy que valida Supabase

### Fluxo de um request típico (ex: clicar "Publicar" num site)

```
[Browser]  POST /api/cadu/publish
              ↓ Authorization: Bearer <Supabase JWT>
[Vercel]   requireCaduAdmin():
              1. Supabase /auth/v1/user (valida JWT)
              2. RPC kc_is_admin OR profiles.is_admin
              → 401/403 se não-admin
              ↓
[Vercel]   POST https://cadu-api/api/publish
              ↓ Authorization: Bearer <CADU_API_TOKEN>
[cadu-api] require_token()
              → 401 se token errado
              ↓
[cadu-api] publish_site() → Edge Function cadu-publish no Supabase
```

**Implicações de segurança**:
- Comprometer `CADU_API_TOKEN` dá acesso a **todos** os endpoints cadu-api (incluindo pipeline run/stop)
- Comprometer JWT Supabase de um admin dá acesso **apenas via Vercel proxy** (ainda passa pelo `kc_is_admin`)
- cadu-api `/artifacts`, `/log`, `/export` são pontos de menor proteção — se Vercel proxy falhar, dados vazam direto

---

## 2. cadu-api: 25 endpoints mapeados (server.py v0.4.3 + hardcoded 0.4.6)

### 2.1 Versões inconsistentes (MESMO arquivo, 3 números!)

| Local | Valor | Linha |
|-------|-------|-------|
| `app.version` | `"0.4.3"` | 117 |
| `GET /health` (hardcoded) | `"0.4.2"` | 607 |
| `GET /openclaw/context.cadu_api_info.version` (hardcoded) | `"0.4.6"` | 1162 |
| Container rodando | **`v0.4.2`** | reportado por /health |

⚠️ A UI mostra `data.version` do `/health`, então **a UI mostra "0.4.2" mesmo após restartar com o server.py novo do repo**. Próxima fase: unificar `__version__` no topo do server.py e usar `app.version` em todos os lugares.

### 2.2 Endpoints cadu-api (todos)

| # | Método | Path | Auth | Função |
|---|--------|------|------|--------|
| 1 | GET | `/health` | ❌ sem auth | liveness; retorna `version`, `publish_modes`, `pipeline_stages` |
| 2 | GET | `/api/sites` | ✅ | Lista unidades UFG parseadas + merge com `kc_unit_meta` do Supabase |
| 3 | GET | `/api/sites/{unit_id}/meta` | ✅ | Metadata editável (tier+note) do Supabase |
| 4 | PATCH | `/api/sites/{unit_id}/meta` | ✅ (via sites.js upstream) | Atualiza tier/note no `kc_unit_meta` |
| 5 | GET | `/api/feed` | ✅ | Lista chunks do Cadu memory (últimos N, default 20) |
| 6 | POST | `/api/publish` | ✅ | Sugere publicação no feed KinoCampus |
| 7 | GET | `/api/pipeline` | ✅ | Status consolidado (stages + active_run + history) |
| 8 | POST | `/api/pipeline/run` | ✅ | Cria run (dedup: rejeita se já tem running/pending do mesmo stage) |
| 9 | GET | `/api/pipeline/runs` | ✅ | Lista runs (history) |
| 10 | GET | `/api/pipeline/{run_id}` | ✅ | Detalhe de um run |
| 11 | POST | `/api/pipeline/{run_id}/stop` | ✅ | SIGTERM no subprocess |
| 12 | GET | `/api/pipeline/{run_id}/stream` | ✅ ou `?token=` | SSE ao vivo do log |
| 13 | GET | `/api/pipeline/{run_id}/artifacts` | ⚠️ **SEM AUTH** | Lista artifacts |
| 14 | GET | `/api/pipeline/{run_id}/log` | ⚠️ **SEM AUTH** | Tail do log (param `tail=80`) |
| 15 | GET | `/api/pipeline/{run_id}/export` | ⚠️ **SEM AUTH** | Export consolidado (artifacts + summary + log_tail) |
| 16 | GET | `/api/openclaw/status` | ✅ | OpenClaw status (agents, heartbeat, tasks) |
| 17 | GET | `/api/openclaw/sessions` | ✅ | Lista sessões (param `limit=N`) |
| 18 | GET | `/api/openclaw/messages` | ✅ | Mensagens de uma sessão |
| 19 | GET | `/api/openclaw/logs` | ✅ | Logs do Gateway (param `limit=100`) |
| 20 | GET | `/api/openclaw/heartbeat` | ✅ | Status do heartbeat |
| 21 | GET | `/api/openclaw/context` | ✅ | **Snapshot consolidado** com cache TTL 30s |
| 22 | GET | `/api/feed/{chunk_id}` | ✅ | Detalhe de um chunk (heading + content) |
| 23 | POST | `/api/feed/{chunk_id}/ask` | ✅ | Pergunta sobre chunk específico (atalho pra agent-send) |
| 24 | POST | `/api/openclaw/agent-send` | ✅ | Envia msg ao Cadu (auto-inject context + tiers) |
| 25 | POST | `/api/openclaw/agent-event` | ✅ | Trigger Heartbeat manual |
| 26 | POST | `/api/admin/redeploy` | ✅ | Redeploy self (git pull + cp + docker restart) |

### 2.3 Detalhes críticos dos endpoints NOVOS (v0.4.3+, hardcoded v0.4.6)

**`GET /api/openclaw/context`** (linha 1082-1208)
- Consolida em paralelo: sites (com merge Supabase), pipeline (status + last run summary), feed (5 chunks), openclaw (status + health + last_session via `asyncio.gather`)
- **Cache TTL 30s em memória** (`_openclaw_context_cache` linha 1079): se `<30s`, retorna `cache_hit=True` + `cache_age_sec`
- Query param `?refresh=true` força bypass do cache
- `cadu_api_info.version` retorna hardcoded `"0.4.6"` — **divergente do `app.version` real ("0.4.3")**

**`POST /api/feed/{chunk_id}/ask`** (linha 1257-1285)
- Atalho: pega chunk + monta `<chunk-context>` + pergunta default `"Resume esse chunk do Cadu memory e me diga o que fazer com ele."`
- Content do chunk truncado em **3000 chars** (linha 1271)
- Heading escapado com aspas simples (linha 1267) — evita quebrar XML
- Chama `openclaw_agent_send` por baixo (delega toda lógica de inject_context + inject_tiers)
- Body opcional: `{ message: "pergunta custom" }`

**`POST /api/admin/redeploy`** (linha 1411-1493)
- ⚠️ **Lógica com bugs latentes**:
  - `cadu_api_dir = /data/.openclaw/skills/cadu-api` — assume `.git` acima desse path
  - Sobe na árvore até achar `.git`; se não achar (cenário comum em VPS), retorna **500**
  - Step 3: copia `repo_root/data/.openclaw/skills/cadu-api/server.py` → `cadu_api_dir/server.py`. **Assume que repo é `openclaw-cadu`** com layout `data/.openclaw/skills/cadu-api/server.py`. Se o repo local não for esse, pula (linha 1467) ou falha (linha 1463-1464)
  - Step 4: `docker restart <container>` (env `CADU_API_CONTAINER`, default `openclaw-hahq-cadu-api`) — **NÃO** é `docker compose up -d`, então **env vars antigas persistem** (gotcha memory). Restart funciona pra carregar server.py novo, mas NÃO pra carregar `CADU_API_TOKEN` novo
- **Recomendação**: usar `docker compose up -d cadu-api` (recria container) OU passar env vars via `--env-file`

**`POST /api/openclaw/agent-send`** (linha 1297+) — auto-inject (padrão)
- `inject_context=True` (default): prepend `<pipeline-context>` com última run se `status in (finished|failed|cancelled)` E `age_sec < 86400`
- `inject_tiers=True` (default): prepend `<sites-tiers>` com lista T1/T2/T3 do `kc_unit_meta` Supabase
- Payload shape: `{ message, agent="main", session_id?, deliver?, inject_context?, inject_tiers? }`
- `deliver=True` faz reply via Telegram (além de retornar pro caller)

---

## 3. Vercel proxy: 7 functions + roteamento

### 3.1 Functions deployadas

| Arquivo | Linhas | URL pública | Auth |
|---------|--------|-------------|------|
| `api/cadu/health.js` | 38 | `GET /api/cadu/health` | ❌ sem auth |
| `api/cadu/sites.js` | 76 | `GET/PATCH /api/cadu/sites` + `/sites/{id}/meta` (via `?path=`) | ✅ Supabase JWT |
| `api/cadu/feed.js` | 84 | `GET/POST /api/cadu/feed?limit=N` + `?path={id}/ask` | ✅ |
| `api/cadu/publish.js` | 76 | `POST /api/cadu/publish` | ✅ |
| `api/cadu/pipeline.js` | 118 | `GET /api/cadu/pipeline` (sem sub-path) | ✅ |
| `api/cadu/pipeline-router.js` | 108 | `GET/POST /api/cadu/pipeline/*` via vercel rewrite | ✅ |
| `api/cadu/openclaw-router.js` | 58 | `GET/POST /api/cadu/openclaw/*` via vercel rewrite | ✅ |

**Total: 7 functions. Dentro do limite Vercel Hobby (12).** Sobra pra 5.

### 3.2 Roteamento via `vercel.json`

```json
{ "source": "/api/cadu/sites/(.+)",      "destination": "/api/cadu/sites?path=$1" }
{ "source": "/api/cadu/pipeline/(.+)",   "destination": "/api/cadu/pipeline-router?path=$1" }
{ "source": "/api/cadu/openclaw/(.+)",   "destination": "/api/cadu/openclaw-router?path=$1" }
```

⚠️ **Não há rewrite pra `/api/cadu/feed/(.+)`** — feed usa query string direto (`?path=`).
⚠️ **Há DOIS arquivos pra pipeline** (`pipeline.js` + `pipeline-router.js`). O router recebe as requisições reais via rewrite; `pipeline.js` fica órfão pra maioria dos sub-paths. **Possível cleanup**: deletar `pipeline.js` ou mover lógica comum pra `cadu-router.js` único (Yan já cogitou no commit `148b0c6`).

### 3.3 SSE pipeline (detalhes técnicos)

**`api/cadu/pipeline.js` e `pipeline-router.js`** (linhas 56-95 / 54-89):
- Detectam SSE: `GET` + `subPath.endsWith('/stream')`
- **Vercel Fluid Compute + Node 20**: suportam `res.write()` em streaming
- `export const config = { maxDuration: 300 }` (5 min — suficiente pra curator, ig, format)
- Headers do response:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no` (desativa buffering de proxy/CDN)
- Upstream `fetch()` com `Accept: text/event-stream` → repassa chunks via `reader.read()` + `res.write()`
- **Sem retry** — se upstream cair, cliente vê `[stream error]` (linha 1538 do controller) e tenta reconectar em 2s

**Client SSE** (`controller.js:1503-1546`):
- `EventSource(url, { withCredentials: false })` — EventSource NÃO suporta `Authorization` header (limitação WHATWG). Auth vai via `?kc_admin_token=` ou `?token=` query string
- 3 event types: `log` (linha de log), `done` (run finished), `error` (stream error)
- Auto-reconnect após 2s no handler `error`
- ⚠️ Bug potencial (linha 1576): `pipelineEventSource.controller.abort()` — `EventSource` não tem `.controller`. Vai throw silencioso em try/catch (não causa crash mas é dead code)

### 3.4 Cache policy inconsistente

| Endpoint Vercel | Cache-Control | TTL |
|----------------|---------------|-----|
| `/api/cadu/health` | sem cache | 0 |
| `/api/cadu/sites` (GET root) | `private, max-age=300` | **5 min** |
| `/api/cadu/sites/{id}/meta` (sub-path) | `no-cache` | 0 |
| `/api/cadu/feed` (GET root) | `private, max-age=60` | **1 min** |
| `/api/cadu/feed/{id}/ask` (sub-path) | `no-cache` | 0 |

⚠️ Após PATCH bem-sucedido em `/sites/{id}/meta`, o root `/sites` permanece cacheado por 5 min. Usuário vê dados stale até dar refresh manual. **Próxima fase**: invalidar cache no PATCH (header `Cache-Control: no-store` ou versão por timestamp).

---

## 4. Comportamento por aba — bugs latentes e melhorias

### 4.1 Sites UFG

**Render** (`renderSitesTable` linha 401-453):
- Re-renderiza **tudo** via `tbody.innerHTML = ...map().join('')` a cada mudança de filtro ou save
- Ineficiente mas com 56 sites é OK. Se chegar a 200+ (futuro câmpus), reescrever com diff
- Event delegation em `tbody.querySelectorAll('select.kc-cadu-tier-select, textarea.kc-cadu-note-input')` — bound **DEPOIS** de cada re-render

**Auto-save debounce** (`scheduleSiteSave` linha 365-376):
- 700ms debounce por `(name, field)`
- Status visual: `<i class="fas fa-clock"></i>` (pendente) → `fa-check verde` (sucesso) → `fa-triangle-exclamation vermelho` (erro)
- Sucesso limpa após 2.5s; erro após 4s
- ⚠️ **BUG LATENTE**: key do debounce é só `site.name` (linha 366). Se 2 sites têm **mesmo nome**, o segundo save sobrescreve pending do primeiro. Em produção atual (56 unidades únicas) OK, mas vale documentar a constraint

**IG link** (linha 416-418):
- Remove `@` leading com `.replace(/^@/, '')` — defensivo
- `target="_blank" rel="noopener"` — seguro
- Cor rosa `#e1306c` (instagram oficial) — fixo no CSS `.kc-cadu-ig-link`

**CSV export** (`#sites-export-csv` handler linha 1091-1097):
- BOM UTF-8 (`'\uFEFF'` linha 93 helper) — Excel abre com encoding correto
- Nome: `cadu-sites-YYYY-MM-DD.csv`
- ⚠️ Exporta `state.filteredSites` (não `state.allSites`) — comportamento útil (exporta só o filtrado) mas pode confundir

**Botão Publicar** (handler linha 1099-1112):
- Delega clique no `#sites-table` (não em cada botão)
- Parse `data-key = name|url` (key composto, evita conflito se 2 sites têm mesmo nome)
- `publishSite` (linha 470): anti double-click via `state.publishingKey === site.key`
- Feedback visual: `is-ok` (verde, 2.5s) / `is-err` (vermelho, 3.5s)

**Botão Perguntar Cadu** (linha 429):
- Atributos `data-ask-kind="site" data-ask-name=... data-ask-url=... data-ask-instagram=... data-ask-tier=...`
- Delegação GLOBAL no `document.addEventListener('click')` (linha 1007) — `t.closest('.kc-cadu-ask-btn')`
- Aciona `askCaduContext({...})` → POST `/api/cadu/openclaw/agent-send` direto (sem tentar endpoint dedicado)

**Correlação com a última pipeline (2026-07-22):**
- `GET /api/cadu/feed?with_meta=true` pode incluir o bloco aditivo `source_diagnostics` do artefato mais recente do Curador;
- o cliente valida o bloco inteiro (forma exata, IDs, URLs HTTPS, estados, contadores, limites e metadados) e o descarta atomicamente se qualquer linha estiver fora do contrato, sem derrubar o feed público;
- cada linha da visão **Fontes web** é correlacionada exclusivamente por `sourceRegistryId`; nome, URL e ordem não são usados como identidade;
- “Última pipeline” descreve aquela execução do Curador (coletados, classificados, duração, modo, horário e artefato). É uma dimensão separada da auditoria estática de transporte do catálogo e não prova ativação, publicação ou saúde permanente da fonte;
- “Sem correlação nesta execução” é esperado quando a fonte canônica ainda não pertence ao inventário operacional considerado; “Diagnóstico indisponível” significa bloco ausente ou inválido, não zero itens.

### 4.2 Feed coletado

**Auto-load** (`refreshAll` linha 1650-1658):
- Carrega feed **mesmo** quando tab não é feed (linha 1656: `if (state.currentTab !== 'feed') loadFeed(true)`) — pra atualizar KPI Memória
- KPI `kpi-memory` = `state.allFeedItems.length` = chunks da amostra (não total real do DB)
- `kpi-memory-detail` = texto dinâmico: `'X com perfil atribuído (confirmado ou tentativa)'` (linha 461) / `'amostra carregada (limit=' + limit + ')'` (linha 535)

**Filtro local** (`applyFeedFilter` linha 543-573):
- Não chama API — filtra `state.allFeedItems` em memória
- Busca case-insensitive em `snippet + heading + chunk_id`
- ⚠️ **BUG LATENTE**: snippet truncado em 500ch em algum lugar do pipeline (citado no doc anterior) — pode perder contexto em chunks grandes. Validar cadu-api `fetch_recent_chunks`

**Botão Perguntar Cadu** (linha 562):
- `data-ask-kind="feed" data-ask-id={chunk_id} data-ask-heading={heading}`
- `askCaduContext` (linha 856-879):
  1. Tenta `POST /api/cadu/feed?path={chunk_id}/ask` PRIMEIRO (endpoint dedicado v0.4.6+)
  2. Se 404/`__error` → fallback com `<chunk-context>` inline + `agent-send`
- ⚠️ **Comportamento atual**: cadu-api v0.4.2 → endpoint dedicado retorna 404 → fallback executa → cai no `agent-send` → **401 admin_auth_required**

**Load More** (handler linha 1124-1128):
- Incrementa `feedLimit` por `FEED_PAGE_SIZE=20`, máx 200 (linha 1125)
- Não persiste — ao mudar de tab e voltar, `state.feedLimit` reseta pro default? Não verificado.

### 4.3 Pipeline

**3 colunas no grid** (HTML linha 415-453):
- Coluna 1: `pipeline-stages-list` (estágios pré-definidos, 220-320px)
- Coluna 2: `pipeline-active-card` + `pipeline-log` (1fr — toma espaço disponível)
- Coluna 3: `pipeline-history-list` (histórico, 220-280px)
- Mobile (`max-width: 1100px`): 1 coluna, empilhado

**Auto-refresh intervals** (linha 1641-1648):
- `setInterval(refreshPipeline, 5000)` quando `state.currentTab === 'pipeline'`
- `setInterval(refreshOpenclaw, 15000)` quando `state.currentTab === 'openclaw'`
- ⚠️ Os intervals NÃO checam `if (pipelineEventSource)` — sempre fazem 1 fetch+render a cada 5s, mesmo com SSE ativo. Pode causar flash visual ao receber log line via SSE e re-render do active card

**Active run card** (`renderPipelineActive` linha 1302-1334):
- Status class: `is-running` (âmbar pulsante), `is-failed` (vermelho), `is-finished` (verde)
- Stop button SÓ se `status === 'running'` (linha 1317)
- Botão Parar chama `stopPipelineRun` (linha 1619-1638): confirm + POST `/pipeline/{id}/stop`
- Mensagens de erro específicas por status code (409, 404, 5xx)

**SSE reconnect** (linha 1537-1542):
- Em `error`, fecha ES, marca null, `setTimeout(refreshPipeline, 2000)`
- ⚠️ **Não diferencia "transient" de "fatal"** — vai ficar reconectando pra sempre se cadu-api estiver down

**Histórico** (`renderPipelineHistory` linha 1336-1373):
- Mostra **últimos 20** runs (`history.slice(0, 20)`)
- **4 botões** SÓ para runs `finished|failed|cancelled` (rodando não tem ações):
  - 👁 Ver (modal com artifacts + log tail, paralelo `Promise.all`)
  - ⬇ Baixar log (`window.open` URL com `?download=1`)
  - 📤 Export JSON (client-side Blob + download)
  - 🤖 Perguntar Cadu (chama `askCaduAboutRun` — vide inconsistência abaixo)

**Modal de detalhes** (`openRunDetailsModal` linha 1375-1420):
- Modal criado dinamicamente em `ensureRunDetailsModal()` (linha 1422-1439) — fica no DOM permanentemente
- CSS inline (`style.cssText`) — não usa CSS global
- Fecha em click no overlay (linha 1436) ou botão Fechar
- 4 botões no footer: 🤖 / ⬇ / 📤 / Fechar

**Cache-bust inconsistente** (admin/cadu.html linha 611):
- `<script src=".../admin-cadu.controller.js?v=1.0.0">` — **versão imutável 1.0.0**
- Outros assets usam `?v=8.6.x` (semver). Controller ficou em 1.0.0 desde o commit original
- ⚠️ **Yan precisa lembrar de bumpar manualmente** após mudanças no controller. Se esquecer, browser cache pode mostrar versão antiga por horas
- **Recomendação próxima fase**: alinhar com `?v={git short hash}` (script de build) ou usar `?v=kc-admin.X.Y`

### 4.4 OpenClaw (Cadu agent)

**4 stat cards** (`refreshOpenclaw` linha 621-719):
- AGENT: `main + deepseek-v4-flash + ctx 1M` (hardcoded hint linha 652)
- TELEGRAM: `Bot: 8746…f8DM · 1/1 account` (hardcoded, vaza início do bot token — aceitável)
- HEARTBEAT: regex em `healthText` (`/Telegram:\s*configured/i`, `/Heartbeat/i`)
- TASKS: `active/total` + `succeeded OK · failures falhas`

**Chat** (`openclawSendChat` linha 721-788):
- Render user msg ANTES do fetch (linha 740) — UX responsiva
- `openclawState.busy = true` no início, libera no `finally` — anti double-click
- Payload: `{ message, agent: "main", session_id?, deliver? }`
- `deliver=true` só se checkbox marcado (linha 746) — Telegram delivery
- Resposta: pega `payloads[].text` ou fallback `data.summary`
- Atualiza `lastSessionId` se criou novo
- `setTimeout(refreshOpenclaw, 1500)` após envio — atualiza stats

**Cross-tab Ask** — INCONSISTÊNCIA CRÍTICA:

| Caminho | Auto-envia? | Onde |
|---------|-------------|------|
| Site row → 🤖 | ✅ sim | `askCaduContext` kind="site" linha 880 |
| Feed chunk → 🤖 | ✅ sim | `askCaduContext` kind="feed" linha 856 |
| Pipeline run history → 🤖 | ❌ **NÃO** | `askCaduAboutRun` linha 1460 |
| Pipeline modal → 🤖 | ❌ **NÃO** | `askCaduAboutRun` linha 1460 |

`askCaduAboutRun` pré-popula o textarea mas **não envia** — usuário precisa clicar Enviar manualmente. Diferente dos outros 2 caminhos que enviam direto. **Inconsistência de UX que vale alinhar**.

**Sessões recentes** (`refreshOpenclaw` linha 682-713):
- Fetch `/api/cadu/openclaw/sessions?limit=8`
- Mostra `kind` (cron/direct), `model`, `key` (slice 60), `ageMs`, `% ctx` se disponível
- Salva `lastSessionId` da sessão "direct" mais recente — usado nos próximos sends

**Notification bell polling** (linha 926-995):
- `pollNotifActivity` chama `GET /api/cadu/pipeline/runs?limit=8`
- ⚠️ **Esse endpoint é NOVO v0.4.3+**. Em cadu-api v0.4.2 retorna 404 → bell **nunca atualiza**
- First poll: `setTimeout(pollNotifActivity, 2000)` (linha 1062)
- Periodic: **NÃO** chama `pollNotifActivity` direto no interval. Em vez disso, faz só `/api/cadu/health` poll a cada 30s (linha 1039-1059). Se a **versão mudou**, aí chama `pollNotifActivity()`
- Lógica: badge = runs NOVAS desde última visita OU runs das últimas 24h (whichever > 0)
- `localStorage.kc_cadu_seen_runs`: `{run_id: Date.now()}` das últimas 20
- Click no item do dropdown → `switchTab('pipeline')` + `scrollIntoView` pro `[data-run-id="..."]`

**Periodic health poll** (linha 1039-1059):
- A cada 30s, GET `/api/cadu/health`
- Atualiza `#cadu-version-text` se mudou (mantém em sync com /health)
- Se version mudou → re-poll notification activity (pega runs novas)
- ⚠️ Comparação `data.version >= '0.4.6'` (linha 1053) é **string comparison**. `'0.4.6'` >= `'0.4.6'` é OK, mas se houver version como `'0.4.10'`, `'0.4.10' < '0.4.6'` lexicograficamente — bug latente. **Fix**: usar `parseFloat(data.version) >= 0.46` ou semver compare

---

## 5. Pontos de extensão / pontos de quebra

### 5.1 Onde adicionar uma nova feature

| Quer adicionar | Mexer em |
|----------------|----------|
| Novo endpoint cadu-api | `server.py` (FastAPI), opcional `api/cadu/*.js` se quer expor via Vercel |
| Nova aba no admin | `admin/cadu.html` (HTML + CSS), `admin-cadu.controller.js` (state + switchTab + loadFn), opcional `bindEvents` |
| Novo botão em site row | `renderSitesTable` (linha 401), `bindEvents` (delegação), `askCaduContext` se for ask-btn |
| Novo estágio de pipeline | `pipeline.py` linha 82 `PIPELINE_STAGES` dict |
| Novo stat card | `refreshOpenclaw` linha 621 + HTML `.kc-cadu-stat-card` correspondente |
| Nova coluna em `kc_unit_meta` | `server.py:_fetch_unit_meta` linha 618 + `SiteUnit` Pydantic + UI |

### 5.2 Onde NÃO mexer sem cuidado

| Componente | Por quê |
|------------|---------|
| `_cadu_token_cache` (server.py:58) | Cache do token do Cadu em memória. Resetar = re-login Supabase. Usado em publish via Edge Function |
| `_openclaw_context_cache` (server.py:1079) | Cache TTL 30s em memória. Resetar = refetch paralelo de 5 fontes |
| `PIPELINE_STAGES` dict (pipeline.py:82) | Stages são referenciados por ID em DB. Renomear ID quebra histórico |
| `app.version` (server.py:117) | Aparece em OpenAPI docs, FastAPI exception handlers |
| `kc_admin_token` query param (cadu-auth.mjs:31) | Hardcoded como convenção entre UI e proxy. Mudar nome = quebrar SSE |
| `data-ask-*` attributes (controller.js) | Contrato implícito UI ↔ askCaduContext. Mudar = quebrar delegation |

### 5.3 Limites operacionais

| Limite | Valor | Onde |
|--------|-------|------|
| Vercel Hobby functions | 12 (usando 7) | vercel.json |
| Vercel Hobby maxDuration SSE | 300s (5min) | pipeline.js + pipeline-router.js config |
| Cadu memory chunks sample | max 200 (limit=200) | controller.js linha 1125 |
| Sites UFG na UI | sem limite explícito (parser renderiza tudo) | renderSitesTable |
| Pipeline dedup | rejeita 2º run se mesmo stage em running/pending | pipeline.py:235 |
| Chat input chars | max 4000 | admin/cadu.html linha 516 |
| SSE auth via query | `?token=` OU `?kc_admin_token=` | server.py:162-179 |
| OpenClaw context cache | 30s TTL | server.py:1098 |

---

## 6. Próximas fases sugeridas (ordem de prioridade)

### 🔴 URGENTE (bloqueia uso)
1. **SSH + `docker compose up -d cadu-api`** em `/docker/openclaw-hahq/` (NÃO `docker restart`)
   - Ativa v0.4.3 do server.py (com `/openclaw/context`, `/feed/{id}/ask`, `/admin/redeploy`)
   - **Sem isso**: notification bell polling 404, cross-tab Ask cai no fallback 401, modal de detalhes 404
2. **Atualizar `CADU_API_TOKEN` no Vercel** com token novo (Yan rotacionou após exposição)
   - Comando: `vercel env rm CADU_API_TOKEN production` + `vercel env add CADU_API_TOKEN production`
3. **Decidir sobre DEV BYPASS** (linha 154 controller): reativar com flag `if (hostname.endsWith('.vercel.app') || hostname === 'localhost')` para permitir testes em preview sem login real

### 🟡 IMPORTANTE (qualidade)
4. **Unificar número de versão no server.py**: criar `__version__ = "0.4.6"` no topo, usar em `app.version`, `/health.version`, e `/openclaw/context.cadu_api_info.version`. **Bate 3 lugares com 1 fonte**
5. **Adicionar `Depends(require_token)` em `/artifacts`, `/log`, `/export`** (server.py:872, 941, 965). **Inconsistência de segurança** — Vercel proxy protege hoje mas cadu-api direto vazaria
6. **Adicionar `Depends(require_token)` no `/health`** OU whitelist pra evitar info disclosure (atualmente expõe `publish_modes` + `pipeline_stages` que são sensíveis)
7. **Auto-invalidate cache `/api/cadu/sites` após PATCH** (sites.js linha 68): usar `Cache-Control: no-store` ou version por `?_t={started_at}`
8. **Fix `askCaduAboutRun` auto-envio** (controller.js:1460): alinharsempipeline ask behavior com site/feed
9. **Bumpar `?v=1.0.0` do controller**: substituir por `?v=kc-admin.{Y.M.D}` ou usar git short hash em build step
10. **Fix `pipelineEventSource.controller.abort()`** (linha 1576): `EventSource` não tem `.controller` — substituir por `es.close()` direto
11. **Dedupe `escapeHtml`** (linha 34 e linha 1221): a segunda é dead code ou shadowing perigoso
12. **Limpar `pipelineRefreshTimer`** (linha 1219): declarado mas nunca usado
13. **Versão semver no periodic poll** (linha 1053): `data.version >= '0.4.6'` falha em `0.4.10`. Usar `parseFloat` ou comparator próprio

### 🟢 DESEJÁVEL (futuro)
14. **Adicionar Cadu Bot ID via env** (controller.js:673 hardcoded `'Bot: 8746…f8DM'`) — vaza bot ID truncation. Ler de `KC_ENV.TELEGRAM_BOT_ID_PREFIX` + `TELEGRAM_BOT_ID_SUFFIX`
15. **Implementar `docker compose up -d` no `/api/admin/redeploy`** (server.py:1474): substituir `docker restart` por `docker compose up -d cadu-api` pra recarregar env vars
16. **Cleanup scripts legacy** no VPS (`/tmp/legacy-scripts-archive/scripts-legacy-2026-06-26.tar.gz` já tem backup — mover para `/data/.openclaw/workspace/_legacy/` ou deletar via SSH)
17. **Implementar scraper SECOM `/e/*`** (BUG D pendente): sites como `ufg.br/e/39237` não são capturados pelo scraper SECOM atual. Pattern precisa cobrir paths `/e/*`
18. **Renomear `pipeline.js` ou deletar**: redundante com `pipeline-router.js`. Unificar em router único
19. **Adicionar testes E2E** (Playwright): capturar screenshots dos 4 estados da página + verificar notification bell em ambiente staging
20. **Documentar processo de rotação de tokens** em `docs/SECURITY.md` (não existe ainda): Supabase, GitHub, Vercel, CADU_API_TOKEN — quem rotaciona, quando, como verificar se está sincronizado

---

## 7. Convenções pra quem for mexer

### 7.1 Naming CSS (kc-cadu-* namespace)
- `.kc-cadu-section` — wrapper de aba
- `.kc-cadu-table` + `.kc-cadu-table-wrap` — tabela editável
- `.kc-cadu-tier-select`, `.kc-cadu-note-input`, `.kc-cadu-ig-link` — controles por célula
- `.kc-cadu-publish-btn` (laranja), `.kc-cadu-ask-btn` (azul cyan) — actions
- `.kc-cadu-badge--{tier|confirmed|tentative|missing|unknown}` — status visual
- `.kc-cadu-kpi`, `.kc-cadu-kpi-strip` — KPI cards
- `.kc-pipeline-grid`, `.kc-pipeline-stage`, `.kc-pipeline-active-card`, `.kc-pipeline-history-item` — pipeline específico
- `.kc-openclaw-grid`, `.kc-openclaw-panel`, `.kc-openclaw-chat-log`, `.kc-openclaw-list-item` — openclaw específico
- `.kc-notif-bell`, `.kc-notif-badge`, `.kc-notif-dropdown`, `.kc-notif-dropdown__item` — notification bell

### 7.2 Contrato de data attributes (ask-btn)
- `data-ask-kind` ∈ {`site`, `feed`, `pipeline`}
- Site: `data-ask-name`, `data-ask-url`, `data-ask-instagram`, `data-ask-tier`
- Feed: `data-ask-id` (chunk_id), `data-ask-heading`
- Pipeline: `data-ask-run-id`, `data-ask-stage`, `data-ask-status`

### 7.3 Contrato de resposta cadu-api
- `__error: true, status: <http_code>, data: <upstream body>` quando erro upstream
- Resposta JSON normal em sucesso
- SSE: `event: log\ndata: {"line": "..."}` e `event: done\ndata: {"status":"finished","exit_code":0}`

### 7.4 Padrão de query params
- `?limit=N` — listas
- `?path=<sub-path>` — proxy Vercel rewrite
- `?token=<EXPECTED_TOKEN>` — cadu-api SSE auth
- `?kc_admin_token=<Supabase JWT>` — Vercel proxy SSE auth
- `?download=1` — força Content-Disposition: attachment
- `?tail=N` — log tail (default 80)
- `?refresh=true` — bypass cache TTL

---

## 8. Onde a próxima IA deve olhar primeiro

Ordem de leitura sugerida pra entender o sistema completo em <30min:

1. **`admin/cadu.html`** (613L, 15min) — vê estrutura DOM + CSS variables + scripts carregados
2. **`assets/js/controllers/admin/admin-cadu.controller.js`** linhas 149-269 (5min) — auth flow
3. **`assets/js/controllers/admin/admin-cadu.controller.js`** linhas 1130-1500 (15min) — pipeline + SSE
4. **`server/cadu-auth.mjs`** (131L, 5min) — Vercel proxy auth
5. **`api/cadu/pipeline.js` + `pipeline-router.js`** (10min) — SSE proxy
6. **`openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`** linhas 595-700 (5min) — `/health` + `/sites` + Supabase merge
7. **`openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`** linhas 1082-1208 (5min) — `/openclaw/context` (snapshot consolidado)
8. **`openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py`** linhas 75-164 (5min) — `PIPELINE_STAGES` dict

Total: ~65min de leitura focada. Depois, ler commit `5891525` (20 arquivos versionados) pra entender decisões históricas.

**Não pule a etapa 6 e 7** — é onde tá a "alma" do cadu-api: como ele mescla Supabase com workspace, e como ele consolida 4 fontes em 1 request via `/openclaw/context`.

---

## 9. TL;DR pro Mavis da próxima iteração

- **3 camadas de auth** validando coisas diferentes (UI / Vercel proxy / cadu-api container)
- **3 versões inconsistentes** no mesmo server.py (app.version="0.4.3", /health="0.4.2", context="0.4.6")
- **7 functions Vercel** deployadas (limite Hobby 12)
- **26 endpoints cadu-api** (25 com auth, 3 sem: /artifacts /log /export)
- **5 bugs latentes críticos** (DEV bypass off, ask auto-inconsistente, version compare string, controller?v=1.0.0, /admin/redeploy docker restart vs compose up)
- **3 ações urgentes bloqueando uso** (SSH+restart cadu-api, atualizar CADU_API_TOKEN no Vercel, decidir bypass)
- **Yan rotacionou todos os tokens após exposição em chat** (CADU_API_TOKEN, Supabase service_role, etc) — `.env` local está obsoleto
- **OpenClaw agent está sem login web** (form HTML pedindo token) — agente sem capacidade de executar remoto até logar

**Próximo passo mais impactante**: SSH + `docker compose up -d cadu-api` (recria container, recarrega env vars) + atualizar `CADU_API_TOKEN` no Vercel. 5 minutos de SSH destravam notification bell, modal de detalhes, cross-tab Ask, e todos os endpoints v0.4.3+.

---

**Fim da v2.** Commit seguinte: append acima do que existia em `0f59546`. v1 em `f6ceb23` preserva o estado básico; v2 adiciona profundidade analítica pra próximas IAs.

---

# v3 — Verificação Codex pós-devolutiva OpenClaw (2026-06-29)

> Adicionado por Codex após leitura de `CODEX-CADU-HANDOFF.md`, auditoria deste arquivo,
> código local do painel e sondagem read-only do VPS Hostinger/OpenClaw.

## Estado vivo medido em 2026-06-29

- O relatório `docs/kino-openclaw-integration-state.md` citado pelo Cadu **não existe neste checkout local**. Ele existe no workspace remoto do OpenClaw em `/data/.openclaw/workspace/docs/kino-openclaw-integration-state.md`.
- `cadu-api` **não está offline**: o container `openclaw-hahq-cadu-api` está `running` desde `2026-06-26T11:01:58Z` e `/health` público responde `200`.
- Antes desta rodada, `/health.version` ainda retornava `0.4.2`, mas o arquivo carregado no container já tinha endpoints v0.4.6 (`/api/openclaw/context`, `/api/feed/{chunk_id}/ask`). Isso induziu diagnóstico errado.
- Corrigido em `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: criado `CADU_API_VERSION="0.4.6"` e usado em `FastAPI.version`, `/health.version` e `/openclaw/context.cadu_api.version`. Validado direto e via `https://www.kinocampus.com.br/api/cadu/health`: ambos retornam `version="0.4.6"`.
- `GET /api/openclaw/context`, `GET /api/pipeline/runs?limit=8`, `GET /api/sites` e `GET /api/openclaw/status` responderam `200` nos logs/sondagens internas.
- `GET /api/sites` retornou 56 unidades; `GET /api/feed?limit=1` retornou amostra válida; `GET /api/openclaw/status` retornou `status`, `health`, `checked_at`.
- Última run consultada: `83fa67cf-b2c2-4d9b-8251-84d3ae41d5aa`, stage `all`, `2026-06-29 06:41:43` a `06:51:21` BRT, `exit_code=0`.
- Resumo dessa run: `Sites escaneados=31`, `Total itens=633`, `Publicáveis=1`, `Revisão=38`, `Descartados=585`, `Publicados=1`.
- `openclaw cron list` retornou `No cron jobs.`; este achado da devolutiva é real.
- Browser CDP está online com Chrome `149.0.7827.155`; este achado da devolutiva é real.

## Correções aplicadas no painel

- `assets/js/controllers/admin/admin-cadu.controller.js`: `askCaduAboutRun()` deixou de apenas preencher textarea e agora reutiliza `askCaduContext()` para autoenviar a pergunta de pipeline ao Cadu, com `stage` e `status` reais da run.
- `assets/js/controllers/admin/admin-cadu.controller.js`: `disconnectPipelineStream()` agora chama `EventSource.close()` antes de limpar a referência.
- `assets/js/controllers/admin/admin-cadu.controller.js`: comparação de versão no health poll passou a usar comparator semver simples, evitando erro lexicográfico em versões como `0.4.10`.
- `assets/js/controllers/admin/admin-cadu.controller.js`: removidos `pipelineRefreshTimer` não usado e a segunda definição duplicada de `escapeHtml`.
- `assets/js/controllers/admin/admin-cadu.controller.js`: `refreshOpenclaw()` passou a interpretar o shape real de `/api/openclaw/status` (`status.data`, `health`, `checked_at`) em vez de procurar somente `statusResp.data`.
- `admin/cadu.html`: checkbox do chat OpenClaw corrigido de “Salvar na sessão” para “Enviar resposta também pelo Telegram” e desmarcado por padrão. O campo mapeia para `deliver=true`, que envia reply via Telegram; sessão continua via `session_id`.
- `admin/cadu.html`: cache-bust do controller atualizado de `v=1.0.0` para `v=kc-admin-20260629.2`.
- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: classe `AgentSendRequest` movida para antes de `/api/feed/{chunk_id}/ask`; a recriação limpa do container revelou que a ordem antiga quebrava o import do uvicorn com `NameError`.
- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: timeouts do `/api/openclaw/context` aumentados para `status=15s`, `health=10s`, `sessions=10s`. Antes, o snapshot podia marcar `cadu_api.openclaw_reachable=false` enquanto `/api/openclaw/status` respondia OK.

## Classificação da devolutiva `kino-openclaw-integration-state.md`

| Afirmação | Classificação | Evidência |
|---|---|---|
| `cadu-api` parado/offline desde 26/06 | ❌ Equivocada no estado vivo | Container running desde 26/06 e health/proxy respondem `200`. |
| Publicação não rodou hoje / 0 publicados | ❌ Desatualizada | Run `all` de 29/06 publicou `1` item. Pode ter sido verdade antes da run das 06:41 BRT. |
| `/admin/cadu` não existe | ❌ Equivocada para este repo | A página está em `admin/cadu.html` e é a superfície atual do painel. |
| `/health` indica `0.4.2` | ✅ Era real, corrigido | `CADU_API_VERSION` agora unifica `FastAPI`, `/health` e `/openclaw/context` em `0.4.6`. |
| `/openclaw/context` pode dizer OpenClaw offline | ✅ Era real/potencial, corrigido | Timeout do snapshot era curto; após ajuste, `cadu_api.openclaw_reachable=true`, `openclaw.status` e `openclaw.last_session` foram validados. |
| Cron jobs invisíveis/lista vazia | ✅ Real | `openclaw cron list` retornou `No cron jobs.` |
| CDP Chrome 149 online | ✅ Real | `/json/version` retornou Chrome 149. |
| Sem alertas fortes de falha | ⚠️ Problema real/potencial | Há logs e status, mas não foi encontrado alerta operacional robusto e persistente. |
| Cache/dedup superprotetor | ⚠️ Potencial | A run atual teve `633 itens -> 1 publicável -> 1 publicado`; precisa auditoria específica do cache para confirmar causa. |
| Mappers duplicados Node/Deno | ✅ Real | Existem `services/cadu-ufg-publisher/src/mapper.js` e `supabase/functions/cadu-publish/mapper.ts`. |

---

# v4 — Observabilidade inicial da pipeline (2026-06-29)

> Adicionado por Codex após a v3. Escopo: reduzir a chance de o painel esconder falha/atraso da automação.

## Implementado

- `openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py`: novo `get_pipeline_health()` lê o SQLite `/data/cadu-pipeline.db` e calcula um resumo operacional sem disparar jobs.
- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: novo endpoint autenticado `GET /api/pipeline/health`, definido antes da rota dinâmica `/api/pipeline/{run_id}` para não colidir com `run_id="health"`.
- `GET /api/pipeline` agora inclui `health` no payload root. O proxy Vercel já encaminha `/api/cadu/pipeline/health` via rewrite existente.
- `admin/cadu.html` e `admin-cadu.controller.js`: novo card “Saúde da automação” na coluna da execução atual, exibindo nível (`ok`, `rodando`, `atenção`, `crítico`), último `all` bem-sucedido, atraso, falhas recentes e recomendação.
- Validado no VPS após `docker compose up -d --force-recreate cadu-api`: `/api/pipeline/health` retornou `level="ok"`, `ok=true`, `failures_recent_count=0`, última run `83fa67cf-b2c2-4d9b-8251-84d3ae41d5aa`; `/api/pipeline` retornou `has_health=true`, 9 estágios e 20 itens de histórico.

## Contrato do health

- Limites padrão via env:
  - `CADU_PIPELINE_HEALTH_WARN_AFTER_SEC=129600` (36h)
  - `CADU_PIPELINE_HEALTH_CRITICAL_AFTER_SEC=259200` (72h)
  - `CADU_PIPELINE_HEALTH_FAILURE_WINDOW_SEC=86400` (24h)
- Campos principais: `ok`, `status`, `level`, `checked_at`, `thresholds`, `active_run`, `latest_run`, `latest_all_run`, `last_successful_all_run`, `seconds_since_successful_all`, `failures_recent_count`, `failures_recent`, `recent_counts`, `issues`, `recommendation`.

## O que isso resolve e o que não resolve

- Resolve visibilidade no admin: o operador vê atraso/falha sem abrir logs ou interpretar histórico manualmente.
- Ainda não é alerta externo persistente: se ninguém abrir o painel, Yan ainda pode não ser avisado. Próximo passo recomendado é um job/watchdog que chama esse endpoint periodicamente e envia Telegram/e-mail quando `level` for `warning` ou `critical`, com dedupe por último alerta.

---

# v5 — Alerta persistente da pipeline e conexão VPS/OpenClaw (2026-06-29)

> Adicionado por Codex após a v4. Escopo: consolidar conexão operacional com o VPS Hostinger/OpenClaw e fechar a lacuna “Yan só descobre dias depois”.

## Conexão consolidada

- SSH funcional via chave local para `root@srv1597083.hstgr.cloud`.
- Diretório operacional: `/docker/openclaw-hahq`.
- Containers vivos após validação:
  - `openclaw-hahq-cadu-api`
  - `openclaw-hahq-openclaw-1`
- Compose: `/docker/openclaw-hahq/docker-compose.yml`.
- cadu-api monta `./data/.openclaw/skills/cadu-api:/app` e `./data:/data`.
- OpenClaw CLI acessível dentro do container: `docker exec openclaw-hahq-openclaw-1 openclaw ...`.

## Schedulers encontrados

- `openclaw cron list` continua retornando `No cron jobs.`.
- Host `crontab -l` possui:
  - sync a cada 6h: `/docker/openclaw-hahq/scripts/sync.sh`
  - watchdog de CDP a cada 5min: `/usr/local/bin/ensure-browser-cdp.py`
- Não foram encontrados timers systemd ativos para Cadu/OpenClaw/Kino.
- Conclusão: o scheduler persistente real hoje é host cron + loops internos do cadu-api, não cron isolado do OpenClaw.

## Alerta persistente implementado

- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: novo loop `_pipeline_alert_loop()` roda dentro do cadu-api.
- O loop consulta `cadu_pipeline.get_pipeline_health()` a cada `CADU_PIPELINE_ALERT_INTERVAL_SEC` (default 3600s).
- Envia Telegram somente se `level` for `warning` ou `critical`.
- Dedupe/cooldown:
  - estado persistente em `/data/cadu-pipeline-alert-state.json`
  - cooldown default `CADU_PIPELINE_ALERT_COOLDOWN_SEC=28800` (8h)
  - o cooldown rege qualquer warning/critical independente da chave: mudança de chave em runs parciais não reabre a janela (anti-spam)
  - escalonamento `warning -> critical` envia imediatamente
  - envia recuperação quando volta para `ok` após alerta ativo.
- Novo endpoint autenticado: `GET /api/pipeline/alert-status`.
- `/health` público agora expõe apenas flags não sensíveis em `pipeline_alerts`: `enabled`, `configured`, `interval_sec`, `cooldown_sec`.

## Ambiente remoto atualizado

- `TELEGRAM_BOT_TOKEN` já existia no `.env` do VPS.
- `TELEGRAM_CHAT_ID` foi adicionado ao `.env` remoto a partir do script operacional existente `scripts/telegram-watchdog.js`.
- Backup criado no VPS antes da alteração: `/docker/openclaw-hahq/.env.bak.pipeline-alert-1782751313`.
- Não registrar token/chat id em Git, docs ou chat.

## Validação

- `/health` via KinoCampus retornou:
  - `version="0.4.6"`
  - `publish_modes.telegram=true`
  - `pipeline_alerts.enabled=true`
  - `pipeline_alerts.configured=true`
- `GET /api/pipeline/alert-status` dentro do container retornou:
  - `enabled=true`
  - `configured=true`
  - `alert_active=false`
- `GET /api/pipeline/health` retornou:
  - `level="ok"`
  - `status="ok"`
  - `failures_recent_count=0`
- Teste Telegram seguro:
  - `TELEGRAM_BOT_TOKEN` presente
  - `TELEGRAM_CHAT_ID` presente
  - `getMe_ok=true`
  - nenhum alerta fake foi enviado porque a pipeline está saudável.

## Achado operacional importante

- O comando `docker compose up -d --force-recreate cadu-api` recriou também `openclaw-hahq-openclaw-1` por dependência.
- Após isso, o CLI `openclaw status --json` passou a reportar runtime `2026.5.19` e contadores de tasks reiniciados, embora os arquivos persistentes ainda existam:
  - `/data/.openclaw/state/openclaw.sqlite`
  - `/data/.openclaw/tasks/runs.sqlite`
  - `/data/.openclaw/agents/main/sessions/sessions.json`
- Próxima regra operacional: para deploy só do cadu-api, usar:

```bash
cd /docker/openclaw-hahq
docker compose up -d --no-deps --force-recreate cadu-api
```

- Futuro P1: transformar cadu-api em imagem buildada ou cachear dependências. Hoje cada recriação reinstala `apt`/`pip`, gerando janela de `502 Bad Gateway`.

# v6 — Pipeline stages: preflight, summaries e divergencia SIGAA (2026-06-29)

> Adicionado por Codex nesta iteracao. Escopo: aprofundar os 9 estagios pre-definidos da aba Pipeline em `/admin/cadu.html`, validar scripts/estado vivo e tornar decisoes operacionais mais explicitas para Yan/OpenClaw.

## Estado vivo verificado

- `GET /api/pipeline`, `/api/pipeline/health` e `/api/pipeline/alert-status` responderam no VPS via token interno do container `openclaw-hahq-cadu-api`.
- A pipeline estava saudavel (`level="ok"`) e sem run ativo.
- Runs recentes `all` terminaram `exit_code=0`; a run mais recente consultada publicou `0` posts porque o unico item publicavel ja estava publicado/absorvido por dedup/merge. Isso nao e automaticamente falha, mas precisa ficar visivel no painel.
- `openclaw cron list` continua nao sendo a fonte de scheduler; o estado operacional real segue em host cron + loop interno do cadu-api.

## Achados por estagio

- `curator`: existe no repo e VPS; gera artefatos e le cache Supabase.
- `ig`: existe no repo e VPS; depende do Chrome/CDP dentro do OpenClaw.
- `duplicates`: existe; altera posts existentes no Supabase quando rodado sem `--dry-run`.
- `format`: existe; consome chave DeepSeek e gera `_formatted_*.json`.
- `publish`: existe; chama Edge Function `cadu-publish` e pode publicar/mesclar posts reais.
- `enrich`: existe; atualiza metadata/post_media de posts publicados.
- `dedup`: existe; no comando catalogado fica em dry-run por padrao porque `dedup-kino.js` so altera com `--apply`.
- `sigaa`: existe no VPS em `/data/.openclaw/workspace/scripts/sigaa/sync_calendar.js`, mas nao existe no checkout local `openclaw-cadu`. O arquivo remoto contem linhas com cara de segredo embutido; nao copiar cru para Git. Proxima melhoria correta: mover segredos para `.env`, versionar script saneado/template e manter preflight apontando disponibilidade real.
- `all`: existe; encadeia IG + curator + duplicates + format + publish + enrich. Pode terminar `ok` com `Publicados=0` se nada novo passou pelo filtro.

## Melhorias implementadas

- `openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py`:
  - adiciona perfis por estagio (`risk`, `effects`, `requirements`, `mutates_platform`, `dry_run_available`);
  - adiciona preflight leve por estagio: existencia do script, comando efetivo, checks sem expor segredos, bloqueio de run se o script estiver ausente;
  - adiciona `get_pipeline_preflight(deep=false)`; `deep=true` testa CDP via `docker exec` quando aplicavel;
  - adiciona parser de resumo de logs (`summary.metrics`, `summary.labels`, `summary.warnings`, `duration_sec`);
  - inclui summaries em `GET /api/pipeline` e `/api/pipeline/health`.
- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`:
  - novo endpoint autenticado `GET /api/pipeline/preflight?deep=0|1`;
  - export consolidado agora tambem retorna `summary_metrics` e `summary_warnings`, mantendo `summary` legado.
- `admin/cadu.html` e `assets/js/controllers/admin/admin-cadu.controller.js`:
  - cards de stage mostram preflight, risco, efeitos, script, mutacao real/dry-run;
  - botao de executar fica desabilitado se o backend bloquear o stage;
  - confirmacao de run mostra comando, risco e avisos;
  - historico, active card e modal exibem metricas como `publicaveis`, `publicados`, `descartados`, `atualizados`, `avisos`.

## Validacoes locais

- `python -m py_compile` em `pipeline.py` e `server.py`: OK.
- `node --check assets/js/controllers/admin/admin-cadu.controller.js`: OK.
- `node --check` nos scripts versionados dos estagios (`curator`, `ig`, `duplicates`, `format`, `publish`, `enrich`, `dedup`, `all`): OK.
- `scripts/sigaa/sync_calendar.js` nao foi validado localmente por nao estar versionado.

## Validacoes VPS pos-deploy

- Deploy aplicado no VPS com `docker compose up -d --no-deps --force-recreate cadu-api`; backups:
  - `/docker/openclaw-hahq/backups/cadu-api-20260629-142329`
  - `/docker/openclaw-hahq/backups/cadu-api-20260629-142445`
- `/health` direto e via `https://www.kinocampus.com.br/api/cadu/health` retornaram `version="0.4.6"` e `pipeline_alerts.configured=true`.
- `/api/pipeline/preflight?deep=1` retornou `total=9`, `runnable=9`, `blocked=0`, `with_warnings=1`; warning do `sigaa` em `google_calendar` porque configuracao sensivel nao e confirmada sem expor segredo.
- `/api/pipeline` retornou 20 runs de historico, `active_run=null`, `health.level="ok"` e summary da ultima run.
- `/api/pipeline/{latest}/export` retornou `summary_metrics` incluindo `publishable=1`, `published=0`, `discarded=609`, `updated=78`.

## Proximas acoes recomendadas

1. Saneamento do SIGAA: extrair segredos do script remoto para `.env`, versionar script/template sem segredo, e documentar variaveis obrigatorias.
2. Considerar alerta de “run all ok mas publicou 0 com publicaveis > 0” como informativo, nao critical; agora fica visivel por summary.
3. Futuro: mover parser de artefatos/resumos para contrato unico e reduzir duplicacao entre export, contexto OpenClaw e UI.

# v7 — Refinamento da Pipeline Completa e estagios isolados (2026-06-29)

> Escopo: auditar profundamente os 9 estagios da aba Pipeline, cruzar estado vivo VPS/OpenClaw/Supabase/Vercel e corrigir problemas reais que impediam execucoes isoladas confiaveis.

## Estado vivo verificado

- SSH funcional via `~/.ssh/openclaw_vps` para `root@187.77.37.25`.
- Containers em execucao: `openclaw-hahq-cadu-api` e `openclaw-hahq-openclaw-1`.
- Ultimo `all` auditado: `64aa40ad-2b9c-4a25-b072-2753b13cf250`, `finished`, `exit_code=0`, duracao ~499s.
- Metricas do ultimo `all`: `total_items=655`, `publishable=1`, `review=41`, `discarded=609`, `published=0`, `updated=78`.
- O `published=0` nesta run nao indica falha de publicacao: o log mostra `1 itens ja publicados` e `0 itens realmente novos`; o enriquecimento de duplicatas atualizou posts existentes.
- Artefatos vivos de 2026-06-29: `curadoria-v4.4-daily` com 5 publicaveis, `_truly_new` com 1, `_formatted` de 09:21 anterior ao ultimo `_truly_new` de 15:10.
- Apos a correcao, `format` isolado gerou `_formatted_2026-06-29.json` fresco com `items=0`, `reason=all_already_published`, `skippedAlreadyPublished=1`.
- `publish` isolado com esse `_formatted` vazio finalizou como no-op (`Publicados: 0`), sem erro e sem publicacao real.
- Supabase: `posts=408`, `published=102`, `posts_with_source_url=270`, `posts_with_last_update=41`. Em 2026-06-29 havia 2 posts com `source_url`, ambos publicados.

## Problemas reais encontrados

- `format` isolado estava mapeado para `formatador-ia.js` sem arquivo de entrada. Esse script exige JSON/`--stdin`/`--item`, entao o stage isolado falharia.
- `publish` isolado estava mapeado para `publish_auto_v5.js` sem arquivo. O fallback procurava `curadoria-v4-`, mas os artefatos atuais sao `curadoria-v4.4-*`; alem disso, publicar relatorio cru sem `formattedDescription` e inseguro.
- `duplicates` direto procurava apenas `curadoria-v4.2-*`; com a versao atual `curadoria-v4.4-*`, poderia falhar ao rodar isolado.
- `format` podia virar no-op quando o item ja existia no Supabase, mas nao gravava `_formatted` fresco; isso deixava o `publish` bloqueado por stale mesmo quando nao havia nada novo a publicar.
- `/api/pipeline/preflight` tinha `summary.total/runnable/blocked`, mas os campos de topo documentados estavam ausentes. Scripts/IA que validavam `total` no root viam `null`.
- A listagem de artefatos atribuia arquivos do mesmo dia ao run mesmo quando eram anteriores ao inicio do run, exemplo `_formatted_2026-06-29.json` stale.
- Vercel registrou timeout de 300s nas rotas de pipeline. Runs `all` duram ~500-600s, entao SSE via Function e inadequado para a Pipeline Completa.

## Correcoes aplicadas

- `openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py`:
  - `format` agora roda `pipeline-kino.js --stage=format`.
  - `publish` agora roda `pipeline-kino.js --stage=publish`.
  - `all` declara `--stage=ig --stage=curator --stage=duplicates --stage=format --stage=publish --stage=enrich`, ETA 600s.
  - Preflight adiciona checks de artefatos: `format` depende de `_truly_new` ou curadoria daily do dia; `publish` depende de `_formatted` fresco; `duplicates` depende de relatorio `curadoria-v4.x`.
  - Preflight expoe `total`, `runnable`, `blocked`, `with_warnings` no topo e em `summary`.
- `openclaw-cadu/data/.openclaw/workspace/scripts/publish_auto_v5.js`: fallback sem arquivo agora escolhe o `_formatted_*.json` mais recente.
- `openclaw-cadu/data/.openclaw/workspace/scripts/enrich-duplicates.js`: fallback agora aceita `curadoria-v4.4-*`, `curadoria-v4.2-*` e padroes `curadoria-v4-*`, ordenando por `mtime`.
- `openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`: artefatos incluem `produced_during_run` e `stale_for_run`.
- `openclaw-cadu/data/.openclaw/workspace/scripts/pipeline-kino.js`: filtro `trulyNew` agora combina `kino-posts-cache.json` com leitura REST viva do Supabase; `format` grava `_formatted` vazio e fresco quando todos os itens ja estao publicados.
- `assets/js/controllers/admin/admin-cadu.controller.js`: runs longos (`all` ou ETA >260s) usam polling de `/log?tail=180` a cada 5s, em vez de SSE; modal de artefatos mostra “antes do run” para stale.
- `docs/PIPELINE.md` atualizado para refletir comandos reais, artefatos exigidos e limite Vercel/SSE.

## Validacoes

- `python -m py_compile` em `pipeline.py` e `server.py`.
- `node --check` em `pipeline-kino.js`, `publish_auto_v5.js`, `enrich-duplicates.js` e `assets/js/controllers/admin/admin-cadu.controller.js`.
- Import local de `pipeline.py` com envs temporarios confirmou `total=9`, comando de `format` como `node scripts/pipeline-kino.js --stage=format` e comando `all` com seis `--stage`.
- VPS/cadu-api: `format` isolado run `1daf1190-1054-47d3-9c2c-9c81b1fb7d29`, `exit_code=0`, gerou `_formatted` vazio/fresco.
- VPS/cadu-api: `publish` isolado run `7f657040-b112-4535-8d79-052102081702`, `exit_code=0`, carregou 0 itens formatados e publicou 0.
- VPS/cadu-api preflight apos esses runs: `total=9`, `runnable=9`, `blocked=0`; `format`, `publish` e `all` sem blockers/warnings.

## Proximas melhorias recomendadas

1. Avaliar expor no admin um botao "Preparar publicacao" que rode `curator -> format` sem publicar, para reduzir risco operacional.
2. Investigar se o cache `kino-posts-cache.json` deve ser atualizado diariamente; o arquivo vivo auditado estava com mtime 2026-06-25, enquanto Supabase ja tinha posts de 2026-06-29. A pipeline agora cruza com Supabase vivo, mas o arquivo segue util como fallback.
3. Corrigir de forma dedicada o parser de resultado de `enrich-images.js`, que em runs anteriores registrou `Parse do enrich result falhou`.

# v8 — Auditoria e expansao de fontes UFG/Cadu (2026-06-30)

> Escopo: aprofundar a cobertura de fontes oficiais e Instagram para melhorar a coleta de eventos/oportunidades da Pipeline Completa.

## Confirmacoes principais

- Fonte oficial de referencia: `https://ufg.br/p/27412-unidades-e-orgaos`, atualizada em 2026-06-27.
- IAC existe e e relevante: `https://iac.ufg.br` tem `news.json` e `events.json`; havia edital de monitoria 2026-2 e eventos culturais recentes.
- CEROF existe e e relevante: `https://cerof.ufg.br` tem `news.json` e link oficial para `@cerofufg`; CDP encontrou 10 posts/3 relevantes.
- Centro Cultural UFG existe e e forte para eventos: `https://centrocultural.ufg.br` tem `news.json` e `events.json` com 20 itens cada e IG `@centroculturalufg`.
- SEACULT responde em `https://seacult.ufg.br`, mas estava sem itens em `news.json/events.json` no momento da auditoria.
- `cultura.ufg.br` e `secult.ufg.br` nao resolvem DNS; nao usar.
- Corrigidos hosts legados: `mat.ufg.br` -> `ime.ufg.br`, `cienciassociais.ufg.br` -> `fcs.ufg.br`, `eec.ufg.br` -> `eeca.ufg.br`, `www2.emc.ufg.br` -> `emc.ufg.br`.

## Mudancas aplicadas na pipeline

- `cadu-curador-v4.4.js`: adiciona ao Tier 2/daily `iac`, `cerof`, `centrocultural`, `csa`, `uaech`.
- `cadu-curador-v4.4.js`: adiciona ao Tier 3/full `cefis`, `cpa`, `cidarq`, `cegraf`, `hospitalveterinario`, `seacult`.
- `scan-ig-browser.js`: adiciona `cerofufg`, `eeca_ufg`, `ime_ufg`, `campusgoiasufg`, `firminopolis_ufg`, `centroculturalufg`, `lacena_ufg`.
- `scan-ig-browser.js`: passa a detectar `profile_unavailable` para reduzir falso positivo de perfil inexistente como "OK 0 posts".
- `ufg-sites-map.md`: refeito em v1.5, ASCII/parseavel, com as fontes novas e status `(confirmed)`.
- `server.py`: parser de `/api/sites` aceita subdominios profundos (`cpa.secplan.ufg.br`, `hospitalveterinario.evz.ufg.br`) e status ASCII `(confirmed)`.
- `server.py`: parser agora restringe mudanca de categoria a headings; antes, uma fonte com texto "Centro"/"Secretaria"/"Hospital" podia derrubar indevidamente o Tier explicito do bloco.
- `server.py`: `(confirmed)` deixou de virar observacao; a aba volta a mostrar a descricao da unidade como nota quando nao ha nota editada no Supabase.
- `site-structure-scan.js` e `services/cadu-ufg-publisher/config/sources.json` alinhados com as novas fontes.

## Evidencia operacional

- CDP Instagram validou: `@cerofufg` (10/3 relevantes), `@eeca_ufg` (6/2), `@ime_ufg` (11/6), `@campusgoiasufg` (9/5), `@firminopolis_ufg` (9/6), `@centroculturalufg` (11/1), `@lacena_ufg` (7/1).
- VPS/OpenClaw: backup criado em `/docker/openclaw-hahq/backups/source-audit-20260630-140850`; `node --check` passou dentro de `openclaw-hahq-openclaw-1`; `cadu-api` foi recriado com `docker compose up -d --no-deps --force-recreate cadu-api`.
- `/api/sites` autenticado no container retornou 65 fontes. IAC, CEROF, CCUFG, CSA e UAECH aparecem como Tier 2; CEFIS, CPA, CIDARQ, CEGRAF, HV e SEACULT aparecem como Tier 3.
- Smoke `news.json/events.json`: IAC 17/4, CEROF 20/0, CCUFG 20/20, CSA 20/9, UAECH 20/16, CEFIS 20/2, CPA 3/1, CIDARQ 30/25, CEGRAF 25/13, HV 20/3, SEACULT 0/0.
- Supabase `kc_unit_meta`: override de `CSA` estava em Tier 3 desde 2026-06-25; corrigido via `PATCH /api/sites/CSA/meta` para Tier 2 em 2026-06-30.
- Documento detalhado criado em `docs/CADU-SOURCE-AUDIT-2026-06-30.md`.

## Proximas verificacoes recomendadas

1. Rodar `curator --daily` em janela segura e medir o impacto de +5 fontes Tier 2 no tempo total e na quantidade de publicaveis/revisao.
2. Revisar se CEFIS/Firminopolis deve subir para Tier 2 depois de observar qualidade dos itens publicados.
3. Procurar periodicamente site/IG novo da Secretaria de Cultura, pois `seacult.ufg.br` ja existe mas ainda estava vazio.
4. Avaliar se o admin deve mostrar "fonte monitora Instagram-only" para perfis como LACENA, TV UFG, LAPIG e Floreser, que nao possuem fonte Weby principal.

# v9 - Curadoria orientada a eventos futuros/oportunidades (2026-06-30)

> Escopo: responder a critica de produto de que a pipeline estava coletando noticias demais. O objetivo correto e alimentar os modulos `eventos` e `oportunidades` com itens futuros, acionaveis e relevantes para comunidade UFG.

## Diagnostico

- Problema real: `cadu-curador-v4.4.js` lia `news.json` de todas as unidades e so lia `https://ufg.br/events.json` na etapa global. Calendarios locais (`centrocultural.ufg.br/events.json`, `fef.ufg.br/events.json`, `em.ufg.br/events.json`, etc.) eram ignorados.
- Problema real: noticia com palavras como "evento", "curso" ou "palestra" podia passar para `publish` mesmo sem data futura extraida.
- Problema real: duplicatas dentro da mesma rodada nao eram detectadas. Exemplo: mesmo evento aparecia no calendario local e no calendario central.
- Problema real: updates de resultado podiam ficar em `review` quando o tipo principal era `prorrogacao_prazo`, apesar de tambem conter `keyword:resultado`.
- Problema real de observabilidade: o classificador tinha motivos, mas o artefato nao persistia `reasons` no registro final.
- Bloqueio operacional real: o CDP do Instagram no VPS esta inacessivel em `127.0.0.1:18800`; a tentativa de validar os handles novos retornou `ECONNREFUSED`.

## Correcoes aplicadas

- OpenClaw `cadu-curador-v4.4.js`:
  - busca `events.json` de cada unidade antes de `news.json`;
  - marca eventos Weby com `sourceKind="event"`, `eventSource`, `place`, `externalUrl`;
  - gera link local correto `/e/{id}` para eventos de unidades;
  - corrige bug de `allEvents.map(parseEventItem)` que podia produzir URL `[object Object].../e/{id}`;
  - impede `publish` de noticia-evento sem data futura/prazo; se houver link de inscricao sem data, fica no maximo `review`;
  - descarta updates quando `updateSignals` contem `keyword:resultado` ou `keyword:cancelamento`;
  - adiciona dedup de rodada (`run_link_duplicate`, `run_title_duplicate`);
  - persiste `reasons` no artefato.
- OpenClaw `server.py`:
  - parser de `/api/sites` aceita `(tentative)` em ASCII;
  - nao transforma `tentative/confirmed` em nota visual;
  - aceita fontes Instagram-only sem URL, como `CECAS`, `LACENA` e `ESPORTES`.
- OpenClaw fontes/scripts:
  - FEF usa `https://fef.ufg.br` e `@fefufg` tentativa;
  - EM usa `https://em.ufg.br` e `@em.ufg` tentativa;
  - ICB usa `@icb.ufg` tentativa;
  - FCT usa `@campusaparecidaufg` tentativa;
  - FO usa `@odontologia.ufg` tentativa;
  - CECAS entrou como Instagram-only `@cecasufg`.
- KinoCampus `services/cadu-ufg-publisher/config/sources.json` alinhado para FEF/EM canonicos.

## Validacoes

- `node --check` local e no VPS para `cadu-curador-v4.4.js`; `python -m py_compile` para `server.py`.
- Backup VPS antes do deploy incremental: `/docker/openclaw-hahq/backups/events-first-20260630-153418`.
- `cadu-api` recriada com `docker compose up -d --no-deps --force-recreate cadu-api`; `/health` interno OK, `version="0.4.6"`.
- `/api/sites` autenticado retornou 73 fontes. Amostras:
  - FEF `https://fef.ufg.br`, `@fefufg`, `tentative`;
  - EM `https://em.ufg.br`, `@em.ufg`, `tentative`;
  - ICB `https://icb.ufg.br`, `@icb.ufg`, `tentative`;
  - FCT `https://fct.ufg.br`, `@campusaparecidaufg`, `tentative`;
  - FO `https://odonto.ufg.br`, `@odontologia.ufg`, `tentative`;
  - CECAS `url=null`, `@cecasufg`, `tentative`.
- `curator --daily` no VPS:
  - 36 sites;
  - 35 `news.json`;
  - 35 calendars locais;
  - 22 eventos locais futuros;
  - 762 itens;
  - 13 `publish`;
  - 30 `review`;
  - 719 descartes, 204 duplicados.
- Casos de controle no artefato `curadoria-v4.4-daily-2026-06-30.json`:
  - FEF Solidaria/mulher atleta: `review`, score 0.69, reason `news_event_without_future_date`;
  - PIEmp/UFG resultado preliminar: `discarded`, `update=true`, `updateSignals` contem `keyword:resultado`;
  - XIX Seminario PPGECM: 1 publicavel e 1 duplicata descartada com `run_link_duplicate`;
  - URLs `[object Object]`: 0.

## Proximos passos

1. Corrigir/reiniciar CDP do OpenClaw na porta 18800 e validar os handles marcados como `tentative`.
2. Melhorar OCR/extração de data de imagens/cards para casos como FEF Solidaria, onde o texto tem link de inscricao mas a data pode estar apenas na imagem.
3. Decidir se itens de oportunidade sem prazo extraido, mas com titulo muito forte ("Selecao de bolsista", "edital", "chamada"), devem ir direto para `publish` ou ficar em `review` ate haver deadline.

# v8 - Run 4cb7fc43, Instagram aliases e observabilidade IG (2026-06-30)

> Escopo: responder ao pedido de Yan para investigar perfis nao encontrados, duplicados e ausentes no Run `4cb7fc43`, e melhorar a aba Pipeline/OpenClaw para explicar melhor cada estagio.

## Achados do Run 4cb7fc43

- Run completo: `4cb7fc43-6207-4eac-89b9-0bbbd250f79a`, stage `all`, `exit_code=0`.
- Resultado: 760 itens, 0 publicaveis novos, 22 revisao, 730 descartados, 0 publicados.
- Instagram: 58 perfis, 51 OK, 7 falhas, 545 posts ja vistos, 9 posts novos, 0 relevantes.
- Falhas de IG eram aliases/canais legados: `@icbufg`, `@emacufg`, `@fct.ufg`, `@odontologiaufg`, `@fefdufg`, `@culturaufg`, `@esportesufg`.

## Correcoes aplicadas

- OpenClaw `scan-ig-browser.js`: canoniza URL/@handle e aliases, remove aliases quebrados da lista ativa, registra `sourceAudit`, versiona `seen-posts`, nao grava cache em `--dry-run` e extrai datas futuras simples da legenda.
- OpenClaw `cadu-curador-v4.4.js`: `dates.futureDates` de IG agora vem de `post.futureDates`; a data da postagem fica em `sourcePublishedDate`.
- OpenClaw `cadu-api`: resumo de log extrai metricas IG e `/artifacts` inclui `ig-browser-YYYY-MM-DD.json`.
- Kino admin: resumo da aba Pipeline mostra chips de IG perfis, novos, relevantes e ja vistos.
- Validacao viva: run `d4b5829e-ba01-4b2e-8413-a0f5687f31c5` (`ig`) terminou `exit_code=0`, 51 perfis OK, 0 falhas, 523 posts avaliados, 136 relevantes, 23 ja vistos; `/artifacts` marcou `ig-browser-2026-06-30.json` como `produced_during_run=true`.
- ETA do stage `ig` foi ajustado para 420s porque o stage isolado roda enriquecimento de legenda/data; a Pipeline Completa segue usando `--skip-enrich`.

## Reclassificacao

- Problema real: aliases antigos poluiam os logs como falha de perfil.
- Problema real: cache antigo bloqueava reavaliacao apos mudanca de criterio editorial.
- Problema real: data de postagem IG era usada como data futura do evento.
- Problema potencial: `--stage=ig` ainda depende de legenda/alt text; se data/CTA estiver so na imagem, o item exige OCR ou revisao manual.
- Equivoco corrigido: as 7 falhas do Run `4cb7fc43` nao significavam 7 fontes oficiais novas perdidas; eram cadastro antigo ou canal substituido.

# v9 - Rota real do cadu-api no VPS apos recreate (2026-06-30)

- Validacao pos-deploy: Vercel producao `https://kino-campus-hwlf8z4wg-yannakamurabrs-projects.vercel.app` ficou `Ready` e com aliases `www.kinocampus.com.br`, `kinocampus.com.br`, `kinocampus.vercel.app` etc.
- `https://www.kinocampus.com.br/api/cadu/health` respondeu `status="ok"`, `version="0.4.6"` e `pipeline_alerts.configured=true`.
- No VPS, `openclaw-hahq-cadu-api` esta `Up`, mas `docker ps` nao mostra `0.0.0.0:49104->49104`. Isso e esperado no compose atual: o sidecar nao publica porta no host; ele e exposto pelo Traefik via label.
- Health correto do cadu-api no VPS: `https://api.openclaw-hahq.srv1597083.hstgr.cloud/health`.
- `curl http://127.0.0.1:49104/api/health` no host falha com connection refused e nao deve ser tratado como cadu-api offline nesse setup.
- Para diagnostico, use:
  - `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'cadu|openclaw|NAMES'`
  - `curl -fsS https://api.openclaw-hahq.srv1597083.hstgr.cloud/health`
  - `curl -fsS https://www.kinocampus.com.br/api/cadu/health`

# v10 - Admin Cadu: Sites, Feed Coletado e OpenClaw UX (2026-07-01)

- Problema real: o botao "Sugerir" em Sites UFG podia enviar fonte sem URL ou com `http://`, gerando erro "Campo url deve ser uma URL HTTPS". Corrigido no admin e no proxy `/api/cadu/publish`: URL `http` vira `https`; se nao houver site mas houver Instagram, usa `https://www.instagram.com/{handle}/`; sem ambos, o botao fica desabilitado.
- Problema real: o controller usava `site.key`, mas os objetos vindos de `/api/sites` nao possuem esse campo. Agora a chave e calculada com `siteActionKey(name|url)`.
- Problema real: Feed Coletado nao tinha paginacao real. `cadu-api` v0.4.7 adiciona `GET /api/feed?limit=&offset=&with_meta=true`, retornando `items`, `total`, `has_more`; a UI ganhou Anterior/Proxima e texto explicando que o Feed Coletado e a memoria indexada do Cadu/OpenClaw, nao o feed publico final.
- Problema real: `/api/feed/{chunk_id}` tentava colunas inexistentes (`file_path`, `heading`, `content`, `created_at`). O schema vivo usa `id`, `path`, `hash`, `model`, `text`, `updated_at`; o endpoint agora procura por `hash/id` e prefixo.
- Problema real: Trigger Heartbeat chamava `openclaw system event --agent`, opcao rejeitada pela CLI OpenClaw 2026.5.19. `cadu-api` v0.4.7 remove `--agent`, usa `--mode now`, marca `ok=false` quando `exit_code != 0`, e a UI mostra sucesso/falha.
- Melhoria UX: "Perguntar Cadu" em site/feed/pipeline agora mostra a pergunta e a resposta no chat OpenClaw, em vez de apenas trocar de aba.
- Melhoria UX: sessoes recentes do OpenClaw sao selecionaveis para o proximo envio do chat.
- Melhoria UX: logs do Gateway ganharam fechamento explicito, limite menor e CSS com `pre-wrap`/`overflow-wrap`, evitando deformar desktop/mobile.
- Pipeline: historico/modal ganharam "Export PDF", que abre uma versao imprimivel do export consolidado (resumo, metricas, avisos, artefatos e tail do log) para salvar como PDF pelo navegador.

# v11 - Admin nav rail, português e OpenClaw ativo (2026-07-01)

## Escopo

Responder aos problemas de navegação admin, textos em PT-BR e baixa responsividade percebida na aba OpenClaw do `/admin/cadu.html`.

## Diagnóstico

- Problema real: o rail público (`kc-scroll-rail` usado por `.kc-nav-links`) não era aplicado ao `kc-admin-nav`, e as páginas admin não carregam `kc-core.js`. Só alterar o core público não resolveria o admin.
- Problema real: `admin/cadu.html` e `admin-cadu.controller.js` tinham strings sem acentos ou reticências inconsistentes em áreas visíveis e no prompt enviado ao Cadu.
- Problema real: a seleção de sessão OpenClaw só mudava uma linha pequena no chat; não havia painel de detalhe nem ação dedicada para logs daquela sessão.
- Problema real de UX: `Trigger Heartbeat` dependia apenas do status do chat, então parecia não responder quando o usuário estava olhando para "Ações rápidas".
- Problema potencial: logs por sessão só são tão bons quanto o que `/api/cadu/openclaw/logs` registra. Se o Gateway não inclui `sessionId`/`key`, a UI não consegue inventar rastreabilidade retroativa.

## Correções aplicadas

- `assets/js/api/admin-shell.js`:
  - cria `.kc-scroll-rail.kc-scroll-rail--admin` em torno de `.kc-admin-nav`;
  - adiciona botões de rolagem prev/next, medição de overflow, labels acessíveis e colapso progressivo de links;
  - expõe `KCAdminShell.refreshNavRail()` e recalcula no resize.
- `assets/css/admin-shell.css` e `assets/css/styles.css`:
  - adicionam suporte visual para `.kc-scroll-rail--admin`;
  - escondem o rail admin junto com a nav no breakpoint mobile;
  - aplicam `.is-icon-only` também aos links admin quando necessário.
- `assets/js/core/kc-core.js`:
  - reconhece `.kc-admin-nav` nos helpers públicos de rail/drag/a11y/collapse para compatibilidade futura.
- `admin/cadu.html`:
  - corrige textos visíveis (`memória`, `específicos`, `não`, `público`, `Próxima`, `Carregando…`);
  - adiciona botão "Foco" ao chat OpenClaw;
  - adiciona painel `openclaw-session-detail` e status `openclaw-action-status`.
- `assets/js/controllers/admin/admin-cadu.controller.js`:
  - corrige strings PT-BR do confirm da Pipeline (`ATENÇÃO`, `estágio`, `mutação`, `padrão`, `ficarão disponíveis`);
  - corrige prompts enviados ao Cadu em feed/site/pipeline;
  - armazena `selectedSession`, renderiza detalhe da sessão e permite "Usar no chat" ou "Ver logs desta sessão";
  - filtra logs por `sessionId`, `session_id`, `id`, `key` e termos derivados;
  - mostra feedback explícito do heartbeat em "Ações rápidas";
  - atualiza notificações de Pipeline a cada health poll saudável e quando o SSE de run emite `done`.

## Validação mínima

- `node --check assets/js/core/kc-core.js`
- `node --check assets/js/api/admin-shell.js`
- `node --check assets/js/controllers/admin/admin-cadu.controller.js`

## Próximo cuidado

- Validar visualmente em desktop estreito/tablet: o admin nav deve virar rail com chevrons antes de comprometer logo/user-actions.
- Se o usuário exigir log realmente vinculado a cada cron/session, evoluir o cadu-api/OpenClaw para persistir `session_id` nos eventos de log, em vez de depender apenas de filtro textual no tail do Gateway.


# v12 - Admin Cadu nav responsivo, OpenClaw session UX e PDF compartilhado (2026-07-01)

## Escopo

Responder aos problemas ainda visiveis no admin: nav admin diferente do KC nav publico, labels cortados/colados no header, Trigger Heartbeat com baixa confirmacao, historico de sessoes OpenClaw pouco acionavel e PDF da Pipeline fora do padrao visual dos relatorios admin.

## Diagnostico

- Problema real: os links de `.kc-admin-nav` nas paginas admin usam texto solto depois do icone, nao `<span>label</span>`. Como o CSS de `.is-icon-only` escondia apenas `span`, o JS podia marcar links como icon-only sem esconder o texto. Esse era o motivo de labels como Dashboard/Cadu ficarem cortados.
- Problema real: o rail mostrava chevron quando ainda havia labels textuais que poderiam desaparecer. O comportamento desejado e o mesmo do `kc-nav-links`: primeiro compacta labels, depois habilita rolagem se ainda houver overflow.
- Problema real/potencial: dashboard e outras paginas admin hidratam auth/user-actions depois do primeiro paint; medir apenas no DOMContentLoaded deixa overflow residual em larguras intermediarias.
- Problema real: o controller Cadu modificado podia ficar preso no cache/service worker porque a query string do asset continuava `kc-admin-20260629.3`.
- Problema real: o PDF da Pipeline usava fluxo proprio de print/fallback e nao a estetica compartilhada de Dashboard/Moderacao.

## Correcoes aplicadas

- `assets/js/api/admin-shell.js`:
  - normaliza links admin criando `<span>` em torno de labels soltos;
  - mede overflow e colapsa labels antes de mostrar chevrons;
  - recalcula apos resize, mutation, fonts ready e remedicoes tardias em `120ms/400ms/900ms/1600ms` e `load`;
  - refresca a nav quando auth/profile/user-actions mudam.
- `assets/js/core/kc-core.js`:
  - adiciona a mesma normalizacao e regra de colapso para `.kc-admin-nav` caso alguma pagina admin carregue o core publico.
- `assets/css/admin-shell.css`:
  - reduz gap/padding dos links admin e alinha o rail a esquerda, mantendo o header sem wrap indesejado no desktop.
- HTMLs admin:
  - bump para `admin-shell.css/js?v=8.6.2` em todas as paginas admin;
  - `admin/cadu.html` carrega `admin-export.shared.js` e `admin-cadu.controller.js?v=kc-admin-20260701.1`.
- `assets/js/controllers/admin/admin-cadu.controller.js`:
  - PDF da Pipeline usa `KCAdminExport.exportReportPDF()` com report estruturado: filtros, KPIs, status da execucao, metricas, avisos, artefatos e tail do log;
  - fallback print mantido apenas se o exporter compartilhado nao existir;
  - `Trigger Heartbeat` mostra horario, `exit_code`, stdout parcial e avisa que os cards serao atualizados;
  - sessao OpenClaw selecionada mostra painel de detalhe; `Usar no chat` informa explicitamente o `session_id`; `Continuar sessao` envia uma mensagem de retomada com o mesmo `session_id`.

## Validacao

- `node --check assets/js/api/admin-shell.js`
- `node --check assets/js/core/kc-core.js`
- `node --check assets/js/controllers/admin/admin-cadu.controller.js`
- `node --check assets/js/controllers/admin/admin-export.shared.js`
- `git diff --check`
- Playwright local com Supabase/cadu-api mockados e service worker bloqueado:
  - `admin/index.html`: 7 links, 7 spans, 2 `is-icon-only`, overflow 0, ativo visivel.
  - `admin/cadu.html`: 7 links, 7 spans, 2 `is-icon-only`, overflow 0, chevron oculto.
  - OpenClaw: sessao selecionada; `Continuar sessao` enviou payload com `session_id=sess-abc123456789`; heartbeat chamou `agent-event` e exibiu `exit_code=0`; logs abriram com `overflow-y:auto`.
  - PDF: objeto enviado ao exporter gerou filename `kc-cadu-pipeline-2026-07-01-4cb7fc43.pdf`, titulo `KinoCampus - Relatorio da Pipeline Cadu`, secoes `Status da execucao|Metricas|Avisos e riscos|Artefatos|Log tail`.

## Cuidados para proxima iteracao

- Se Yan ainda vir assets antigos, orientar hard refresh ou limpar service worker/cache; o codigo ja tem cache-bust novo, mas navegadores podem manter HTML antigo por alguns segundos apos deploy.
- O teste automatizado precisou bloquear service worker para validar o codigo local. Em producao, confirmar pela aba Network que `admin-shell.js?v=8.6.2` e `admin-cadu.controller.js?v=kc-admin-20260701.1` foram carregados.
- O PDF usa o exporter compartilhado; melhorias futuras devem entrar em `admin-export.shared.js` para manter Dashboard, Moderacao e Cadu consistentes.

# v13 - Feed diagnostics com sugestoes dry-run de reparo (2026-07-02)

## Escopo

Continuar a transicao do ranking/feed sem quebrar producao: identificar posts ja publicados pelo Cadu que precisam de `deadline_date`, `data_evento`, reclassificacao ou revisao, mas sem executar escrita automatica no Supabase.

## Diagnostico

- Problema real: depois da normalizacao na origem, ainda existem posts publicados antes da correcao sem `metadata.deadline_date`.
- Problema real: alguns itens em `eventos` ainda nao carregam `data_evento`/`data_fim_evento` e nao devem competir como evento ativo sem revisao.
- Risco evitado: aplicar patch automatico so por regex pode confundir data de resultado/matricula com prazo principal. Por isso a primeira etapa e dry-run, com evidencias e confianca.

## Correcoes aplicadas

- `scripts/analyze-feed-ranking-shadow.js`:
  - adiciona `repairLimit` no CLI;
  - reaproveita `analyzeTemporalRelevance()` do classificador Cadu;
  - gera `sample.repairSuggestions` com `dryRun: true`, `wouldWrite: false`, `metadataPatch`, `rowPatch`, `confidence`, `evidence` e `notes`;
  - separa `totalCandidates`, `shown`, `byAction` e `shownByAction`.
- `api/cadu/feed-diagnostics.js`:
  - aceita `repairLimit`/`repair_limit`, default `100`, max `200`;
  - continua apenas `GET`, protegido por `requireCaduAdmin`, sem `service_role`.
- `assets/js/controllers/admin/admin-cadu.controller.js`:
  - chama `/api/cadu/feed-diagnostics?limit=80&rpcLimit=10&triageLimit=12&repairLimit=100`;
  - cria mapa de sugestoes por `id`;
  - mostra chip "Patch sugerido" quando houver patch estruturado;
  - inclui o patch dry-run no prompt enviado ao Cadu/OpenClaw.

## Evidencia de dados

Benchmark read-only:

```powershell
npm run benchmark:feed-ranking-shadow -- --limit 80 --rpc-limit 10 --triage-limit 12 --repair-limit 100 --now 2026-07-02T12:00:00.000Z --pretty --output output/feed-ranking-shadow-repair-suggestions-2026-07-02.json
```

Resultado:

- 80 posts analisados;
- 76 ativos pela politica shadow;
- 40 itens acionaveis;
- 39 marcados como Cadu;
- 36 `missing-deadline`;
- 4 `missing-event-date`;
- 27 sugestoes `patch_deadline_date`;
- 9 `manual_deadline_review`;
- 4 `manual_event_date_review`.

## Validacao

- `node --check scripts/analyze-feed-ranking-shadow.js`
- `node --check assets/js/controllers/admin/admin-cadu.controller.js`
- `node --check api/cadu/feed-diagnostics.js`
- `npm test -- tests/unit/analyze-feed-ranking-shadow.test.js tests/unit/kc-feed-ranking-policy.test.js tests/integration/cadu-feed-diagnostics-contract.test.js --runInBand`

Resultado: 3 suites Jest passaram, 20 testes passaram.

## Cuidados para proxima iteracao

- Nao transformar `repairSuggestions` em escrita direta. A proxima etapa deve ser uma acao admin separada, com revisao humana/OpenClaw, log de auditoria e rollback por item.
- Os 4 eventos sem data ficaram como `manual_event_date_review`; devem ser validados na fonte oficial antes de preencher `data_evento` ou reclassificar.
- Itens `manual_deadline_review` precisam consulta da fonte oficial; nao havia data extraivel no texto publicado com confianca suficiente.

# v14 - Deduplicação entre fontes e contrato de imagens (2026-07-26)

## Escopo

Auditoria do estado publicado, relatórios do `dedup-kino`, pipeline executada no
OpenClaw/VPS e consistência de mídia no Supabase.

## Resultado

- 14 duplicatas reais ocultadas com vínculo para 13 posts canônicos.
- 8 reparos de classificação, prazo ou expiração nas canônicas.
- 3 publicações inválidas mantidas ocultas.
- 5 referências de capa `IconeX.png` reparadas ou alinhadas com mídia
  específica; a varredura dos 140 posts publicados retornou 0 placeholders
  ativos em `posts`, metadados e `post_media`.
- 0 ocultações planejadas no dry-run final; 15 pares passaram pela classificação
  semântica e restaram somente 4 revisões humanas de processos FUNAPE e cursos
  SRI distintos.
- Estado observado: 704 posts, sendo 140 `published`, 289 `hidden`, 261
  `closed` e 14 `deleted`.

## Correção estrutural

O `events.json` entregava `ev.image` diretamente a `parseEventItem()`, sem o
filtro aplicado às páginas HTML. O contrato compartilhado agora rejeita
`IconeX.png`, `/weby/assets/` e `/assets/ufg*/` na curadoria, formatação,
resolução/enriquecimento e publicação.

Imagem ou URL idêntica passou a ser apenas evidência. Conflitos de processo,
programa, curso, data e objeto impedem merge automático. Posts ocultos por
auditoria/moderação não podem ser reativados pela publicação incremental.

## Evidências e continuidade

O relatório completo, os pares consolidados, os falsos positivos preservados,
os caminhos dos artefatos no VPS e os testes estão em:

`docs/auditoria/cadu-pipeline-publications-dedup-2026-07-26.md`

OpenClaw implantado no VPS no commit
`489e398a59237dd1fd62364c2ef46795fc72ca53`, com Gateway, `cadu-api`, Chrome/CDP
e os dois containers saudáveis. Regressão KinoCampus: 256 suites e 4.624 testes
aprovados.

A curadoria horária `a7fee871-38ff-43f0-89e0-8c7b40e7d731` concluiu às
17:32:19 UTC e promoveu atomicamente o artefato diário. Após o restart, a
primeira leitura autenticada do Feed Coletado aqueceu o cache e confirmou 44
itens, 2 artefatos válidos, 0 inválidos, `status=ready` e `stale=false`. O
`cache_warm=false` inicial era lazy load, não falha da coleta.

# v15 - Integridade temporal, mídia pós-hidratação e registro versionado (2026-07-26)

## Problemas confirmados

- O texto “as inscrições estarão abertas” mantinha uma oportunidade como ativa
  mesmo depois do prazo explícito.
- Datas futuras de resultado ou matrícula administrativa podiam ser confundidas
  com nova janela pública de candidatura.
- Inscrições em múltiplas etapas não reconheciam necessariamente a data limite
  para concluir todas as etapas.
- Eventos estruturados podiam carregar uma arte de outro ano sem revisão.
- A hidratação da página de detalhe podia substituir uma arte válida de
  `images[]` por `IconeX.png` em `image`.
- O registro de fontes havia mudado sem incremento de versão, e o sincronizador
  oficial do KinoCampus bloqueou corretamente essa inconsistência.

## Correções consolidadas

- O curador fecha prazo explícito vencido independentemente do tempo verbal do
  texto original.
- Matrícula de candidato já selecionado é contexto administrativo, não nova
  oportunidade pública.
- A data de conclusão de inscrição em múltiplas etapas passa a ser prazo.
- Divergência entre a data estruturada do evento e o ano inferível da arte
  encaminha o item para revisão.
- `normalizeItemMedia()` reconcilia a mídia depois da hidratação, preservando a
  arte específica e removendo placeholders.
- O committer recusa promoção quando detecta
  `placeholder_image_present`.
- Registro de fontes incrementado para `2026-07-26.1` e espelhado no commit
  OpenClaw `749c05beff5d81253d3b5f36d4bf076950186740`.

## Evidência operacional

O cron `d82e66d9-8242-40bd-9c08-f584a52957b5` encerrou às 18:33:05 UTC com
2.517 itens, 19 publicáveis, 18 para revisão e 2.480 descartados. Uma de 117
fontes atingiu o orçamento global. O artefato revelou 17 placeholders, dois em
publicáveis, e permitiu localizar a sobrescrita pós-hidratação.

O run controlado `e8650794-e42e-4a82-afb7-392b56aa68fd`, executado sem IA,
Instagram ou publicação e em diretório isolado, confirmou:

- 117/117 fontes tentadas e nenhuma interrompida por orçamento;
- 2.526 itens, 14 publicáveis, 18 para revisão e 2.494 descartados;
- `collectionComplete=true`;
- zero placeholders nos campos de mídia;
- IPTSP novamente operacional, com 25 itens;
- artefato SHA-256
  `54ebfc0a976c1963ef012c8740a53b8d706988c15e7191c00eb9c4eb9aaa1733`;
- arquivo canônico inalterado durante o teste.

Casos conferidos no conteúdo real: Maratona do INF permaneceu publicável;
seleções PPGCC, PPGCA e PPGENFS e o XIX Seminário de Estágio foram descartados
por prazo encerrado; o evento UFG `38329` foi retido para revisão por conflito
entre a data estruturada de 2026 e a arte de 2025.

## Estado vivo verificado

- VPS no commit `749c05beff5d81253d3b5f36d4bf076950186740`, `main` limpa.
- OpenClaw e `cadu-api` saudáveis.
- `/api/feed` autenticado respondeu `200`.
- Health após aquecimento: `cache_warm=true`, 2 artefatos e `stale=false`.
- Registro no `cadu-api`: versão `2026-07-26.1`, estado `shadow`, somente
  leitura, sem ativação de coleta ou publicação por esse espelho.
- Curador e bindings do KinoCampus são byte a byte idênticos ao OpenClaw.
- Contratos direcionados do espelho: 5 suites e 73 testes aprovados.
- Regressão completa: 256 suites, 4.629 testes e 3 snapshots aprovados.
- Supabase, leitura final: zero mídia-placeholder ativa, zero títulos Cadu
  publicados exatamente duplicados e zero posts ativos das fontes temporais
  problemáticas. As três menções restantes a `IconeX` estão somente no
  histórico auditável `manual_data_corrections.previous_url`.
- Primeiro cron normal no release final:
  `d291377a-035a-4a3f-abbc-294ceabfa92d`, concluído às 19:31:46 UTC com
  117/117 fontes tentadas, zero `budget-skip`, 2.526 itens e zero placeholders.
- Artefato canônico promovido com SHA-256
  `c033867b1a65fd18efbe211305837230f140453ff35c88b5a0a71314be352164`;
  Feed Coletado recarregado com 44 itens e `stale=false`.

## Limites e continuidade

- O run controlado não promoveu o artefato por definição; a substituição
  canônica já ocorreu no cron normal `d291377a`, submetida ao novo committer
  fail-closed.
- `ppgef`, `ppgenf` e `ppgac` seguem como aliases legados em quarentena, com
  sucessores operacionais. `revistas-ufg` permanece quarentenada por
  incompatibilidade de conteúdo/plataforma.
- O registro espelhado ainda é `shadow`; ativação deve permanecer uma decisão
  separada, com rollout e rollback próprios.
- Evidências completas, hashes, decisões por caso e histórico dos PRs estão em
  `docs/auditoria/cadu-pipeline-publications-dedup-2026-07-26.md`.

# v16 - Estágio global de deduplicação e observabilidade (2026-07-27)

## Estado vivo

- OpenClaw em `2b0ca22cdd9751521234b60f191550f009d90e5d`.
- `cadu-api` 0.5.11, container saudável.
- Preflight profundo: 9/9 estágios executáveis, zero bloqueios e zero warnings.
- Pipeline completa `b6c75272`: 2.106,5 s, 3.405 itens, 25 novos, 1 criado,
  7 mesclados e `outcome_status=success`.
- O parser semântico elimina oito falsos avisos do B6 causados por contadores
  zerados. O aviso restante representa cobertura IG degradada: `@praeufg`
  retornou grade vazia, mas 6 itens foram preservados pelo retry durável.
- Dedup global `dfc30e45`: 137 ativos, 36 candidatos textuais, 7 pares de
  imagem similar, 2 avaliações IA, zero hides e 4 revisões planejadas.
- O run global agora termina com etapa `dedup` e
  `effective_status=outcome_status=success`, em vez de `finished` ambíguo.

## Decisão sobre duplicatas

Não foi executado modo real porque não havia ocultação confirmada. Os quatro
cursos SRI são cursos distintos com prazos/shortcodes diferentes, mas
compartilham os bytes de uma capa incorreta. O problema é integridade de mídia,
não duplicidade de conteúdo. Publicações complementares do 20º SNHCT também
foram preservadas.

## Interface e contrato

- cards/histórico passam a mostrar métricas específicas do dedup;
- revisões e falhas de aplicação ficam visualmente destacadas;
- modal separa artefatos gerados no run de contexto anterior;
- `pipeline/PIPELINE_STAGES.json` é snapshot documental, não fonte executável;
- catálogo estático foi alinhado aos comandos e ETAs do runtime.

## Continuidade

O próximo estágio proposto é `image-audit`, inicialmente apenas dry-run:
validação de URL/placeholder, agrupamento por hash/pHash, OCR, comparação de
entidades/datas e VLM somente para ambiguidades. Ele nunca deve ocultar posts e
qualquer substituição deve usar canário, prévia, origem oficial e rollback.

Relatório completo:
`docs/auditoria/cadu-pipeline-stages-dedup-2026-07-27.md`.

# v17 - Prévia imutável do dedup e datas semânticas (2026-07-27)

## Incidente confirmado

- Simulação `ab28086c`: 137 posts, 3 pares IA, 1 hide e 3 revisões planejadas.
- Execução real `51ae52ed`: mesma base, mas a nova inferência alterou a
  recomendação CASLE; 0 hides e 3 revisões foram aplicadas.
- Não houve conteúdo ocultado incorretamente. A divergência demonstrou que o
  modo real recalculava a proposta em vez de aplicar a simulação.

## Contrato corrigido

- cadu-api 0.5.14 adiciona `--apply-latest-preview` somente ao estágio
  `dedup` isolado real.
- A prévia fica vinculada por SHA-256 ao estado dos posts, aos pares
  semânticos e ao plano completo de ações.
- A execução real não chama a IA novamente.
- O feed é relido antes da primeira escrita; qualquer mudança exige nova
  simulação.
- O dedup inline determinístico da pipeline completa permanece inalterado.
- O Admin mostra referências oficiais, pares semânticos e se uma prévia foi
  aplicada, além de explicar a exigência no diálogo de confirmação.

## Integridade temporal

- `cadu-publish/mapper.ts` passa a priorizar
  `dates.applicationDeadline`, `dates.eventStartsAt` e `dates.eventEndsAt`.
- Datas semânticas válidas são preservadas em `metadata.dates` para
  auto-close, ranking e auditoria.
- Um `applicationDeadline` tipado já vencido bloqueia a publicação com
  `application_deadline_past`, mesmo quando o texto também contém datas futuras
  de aulas, provas ou resultados.
- Aliases e extração textual legados permanecem como fallback.
- Os dois posts CASLE expirados foram encerrados por RPC, sem hard delete.

## Validação operacional concluída

- Simulação: `eee06899-a327-40e9-b23a-e31807d72e0b`.
- Aplicação real: `471755f2-126b-4fea-95a0-13f56cbc952a`.
- Os dois relatórios registraram 135 posts, os mesmos 2 pares semânticos e
  snapshot `799901ac854abe8c8bb0e47a34f3f3170717f3f51901725d73c995ae8aeb4a9f`.
- O plano teve 3 flags e hash
  `f4af1df197176ba9ad598903c55e2047ac0c00ad530925ee7b8493622508f00d`
  nos dois modos.
- A aplicação registrou `dedup_preview_reused=1`, zero chamadas de IA, zero
  hides, três flags e zero falhas.

# v18 - Deduplicação global após reparo de capas (2026-07-27)

## Estado real auditado

- Cinco capas incorretas foram substituídas por arquivos extraídos da publicação
  oficial exata e inspecionados antes da escrita: quatro cursos SRI e a
  programação de férias do Planetário.
- A leitura posterior confirmou cinco hashes distintos e coerência entre
  `posts.image_url`, metadata, galeria e `post_media`.
- Com 138 posts ativos, o estágio encontrou zero URL canônica, referência
  oficial ou hash de imagem exatamente repetido; sete pares por pHash eram
  reutilização de linguagem visual, não prova de duplicidade.

## Falso positivo contido

A simulação `310b9de3-1361-4bad-959c-c32776554e57` incluiu um par adicional por
identidade explícita de programa, mas o modelo confundiu dois cursos SRI
distintos e propôs uma ocultação. Esse plano não foi aplicado. A política foi
endurecida para que a IA não crie autoridade de escrita: um hide semântico só
pode existir quando a decisão determinística já produz `autoHide=true`.

## Contrato final validado

- Simulação segura: `3dd292dc-0302-4720-acc2-9b1ca308c5ba`.
- Execução vinculada: `efc25352-ad33-4097-8464-4c5398f95ed6`.
- Ambas usaram snapshot
  `ef7bf9fc09d555ec5b30debdc29f2d08562bcf0ff6b04d2598ebf191946e1658`.
- Os três pares foram preservados: dois cursos SRI distintos/ambíguos e um post
  específico PPGZ versus uma compilação de 14 programas.
- O plano vazio teve SHA-256
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
- O modo real reutilizou a prévia, fez zero chamadas de IA e zero mutações.

## Observabilidade adicionada

O resumo do run passa a separar:

- pares selecionados por identidade de programa;
- pares classificados como distintos;
- pares ambíguos;
- recomendações de ocultação bloqueadas pela política.

Ambiguidade e recomendação bloqueada aparecem com destaque visual. Esses
contadores explicam por que um par chegou à IA e por que nenhuma ação destrutiva
foi autorizada.

# v19 - Preflight de prévia e runs 225298f8/09de8f15 (2026-07-27)

## Diagnóstico confirmado

- A Pipeline Completa `225298f8` terminou em 2.495 s, exit code zero, todos os
  estágios obrigatórios aprovados e apenas
  `curator_coverage_partial:source_budget_exhausted:1`.
- A fonte Direito consumiu 75,3 s e classificou 5/25 itens nessa run. Runs
  anteriores processaram 25/25 e probes posteriores dos dois JSONs responderam
  HTTP 200 em menos de 0,4 s. A condição foi tratada como degradação transitória,
  sem aumentar o timeout nem esconder o estado parcial.
- `@letras.ufg` apresentou grade inválida na run, mas uma prova isolada posterior
  encontrou 12 posts e 3 relevantes. O perfil foi preservado.
- O funil final teve 3.024 itens, 26 novos, 17 em revisão de qualidade, 10
  avaliados pelo publisher, 1 criado e 8 mesclados.
- Um item foi corretamente recusado por manter imagem temporária do Instagram.
  O cache usava lista regional fixa e não reconhecia o novo host `gru2`.
- A deduplicação real `09de8f15` analisou 139 posts, 36 candidatos textuais e 7
  pares visuais, mas recusou a aplicação porque todas as prévias estavam
  expiradas. Nenhuma escrita ocorreu.

## Contrato corrigido

- O `cadu-api 0.5.15` informa no preflight se existe prévia recente e rejeita
  execução real inválida com HTTP 412 antes de reservar ou iniciar uma run.
- O Admin diferencia a disponibilidade por modo: **Simular** permanece
  habilitado e **Executar real** exige `dedup_preview_real=ok`.
- O cartão mostra `prévia recente pronta` ou `nova simulação necessária`, com o
  detalhe do backend em tooltip e nova validação após renovar o snapshot.
- O cache aceita hosts HTTPS no domínio exato `cdninstagram.com`, inclusive
  subdomínios regionais futuros, sem aceitar HTTP, credenciais ou domínios por
  sufixo enganoso.
- A barreira final da deduplicação permanece inalterada: snapshot, pares e plano
  são novamente comparados antes de qualquer mutação.

## Validação

- OpenClaw: 58/58 suítes, sintaxe 171/171 e secret scan de 454 arquivos.
- KinoCampus: 257 suítes, 4.634 testes e 3 snapshots.
- Playwright: 3/3 cenários, incluindo desktop, mobile e prévia expirada.

Relatório operacional completo:
`openclaw-cadu/docs/incidents/2026-07-27-runs-225298f8-09de8f15.md`.

# v20 - Central de Revisões e run 27292866 (2026-07-28)

## Estado operacional confirmado

- Run `27292866-7346-43a9-8bb1-b9c1dc37f184`: `finished`, exit code zero,
  2.199,9 segundos e resultado agregado parcial.
- A única degradação foi `enrich_items`, etapa opcional, por timeout transitório
  em duas fontes. Os posts já continham três imagens.
- O funil separou corretamente os 29 novos em 19 itens do quality gate e 10
  itens avaliados pelo publicador; estes produziram 1 criação e 9 mesclagens.
- A deduplicação real é executável, mas permanece fail-closed: exige uma
  simulação feita há no máximo 30 minutos e sobre o mesmo snapshot.

## Implementação

- Nova aba **Revisões** em `admin/cadu.html`.
- Fila central paginada para Pipeline e Feed Coletado.
- Fila do Mapa UFG apresentada no mesmo painel, sem substituir o contrato CAS
  do Supabase.
- Provedor OpenClaw reservado até haver evidência imutável e não sensível.
- Histórico consultável e exportação JSON unificada.
- Decisões centrais vinculadas por UUID e SHA-256 da versão do item.
- Rejeição e pedido de ajustes exigem justificativa no cliente, no proxy e no
  `cadu-api`.
- Aprovação editorial registra análise, mas não publica, não ativa fonte e não
  executa Pipeline.

## Segurança

- Browser usa somente endpoint same-origin e JWT da sessão.
- Proxy Vercel revalida `profiles.is_admin`, remove identidade controlada pelo
  cliente e assina resoluções com HMAC server-side.
- `cadu-api` reconstrói a evidência atual, recusa versão obsoleta, replay
  conflitante e nonce repetido.
- Respostas são `private, no-store`, têm schema e tamanho validados e não expõem
  os secrets do VPS.

## Referência

`docs/ops/cadu-review-center-contract-2026-07-28.md`.

# v21 - Runs bd38466f/29da18c0/6b0018ac e acabamento da Central (2026-07-28)

## Estado operacional

- A Pipeline `bd38466f` ficou parcial exclusivamente por uma etapa opcional:
  uma das nove páginas de enriquecimento não passou na validação TLS.
- O host do PPG Artes da Cena omite o intermediário correto. O runtime passa a
  recuperar esse intermediário pelo AIA e refazer o download com validação
  completa. Erros de certificado expirado, hostname ou confiança permanecem
  bloqueados.
- A simulação `29da18c0` foi íntegra e calculou plano vazio.
- O real `6b0018ac` foi corretamente recusado: entre os dois runs, cinco posts
  foram encerrados e um foi editado pela própria plataforma. Não houve write
  da deduplicação.

## Diagnóstico e interface

- O contrato de snapshot não foi enfraquecido. Um manifesto aditivo passa a
  explicar IDs adicionados, removidos e alterados nas próximas divergências.
- A Central traduz `dedup_preview_state_changed` e razões parciais
  `N_of_M_items_failed`.
- O atalho de run espera a atualização do histórico, posiciona e realça o
  cartão correto.
- O atalho de chat apenas preenche e confirma o contexto; o envio continua
  manual.
- Viewports de até 700 px usam 10 itens inicialmente. 25, 50 e 100 continuam
  disponíveis.
- Links e decisões têm alvos táteis maiores, a subaba ativa permanece visível
  no rail horizontal inclusive após restauração inicial ou redimensionamento,
  e os KPIs do OpenClaw usam grade 4/2/1 colunas.
- O rail também se reposiciona após `document.fonts.ready/loadingdone`; a
  validação em produção encontrou que a fonte de ícones podia ampliar a última
  aba depois do layout inicial e deixá-la cerca de 11 px cortada no mobile.
- Um `ResizeObserver` nos cinco botões cobre a segunda fonte de mudança tardia:
  os badges operacionais preenchidos após as consultas (`198`, `147`, `ok`,
  etc.) também alteram o `scrollWidth` sem disparar `resize`.
- Em até 760 px, o rail mantém 8 px de respiro nas duas bordas. A função de
  reposicionamento usa o `padding-inline` calculado como limite, evitando o
  recorte subpixel residual da última aba observado em 390 px.
- O resumo do histórico separa `mesclados`, `persistidos` e
  `duplicatas atualizadas`. Em `bd38466f`, os valores 9/9/6 vêm,
  respectivamente, do publisher e do enriquecimento posterior de duplicatas;
  não representam contagens concorrentes da mesma operação.

Referências:

- `docs/ops/cadu-review-center-contract-2026-07-28.md`;
- `openclaw-cadu/docs/incidents/2026-07-28-runs-bd38466f-29da18c0-6b0018ac.md`.
