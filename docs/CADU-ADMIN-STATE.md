# Cadu Admin (`/admin/cadu.html`) — Estado Atual

**Última atualização:** 2026-06-29 (revisão pós-feedback — 3 correções factuais)
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
  - AGENT: status (online/offline) + main + deepseek-v4-pro + ctx 1M tokens
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

**Próxima ação crítica:** Yan precisa fazer SSH + `docker restart openclaw-hahq-cadu-api` + atualizar `CADU_API_TOKEN` no Vercel. Sem isso, a UI mostra dados stale (ou 401) e os botões "Perguntar Cadu" não funcionam.