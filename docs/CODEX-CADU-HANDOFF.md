# Codex Handoff — Cadu Admin (KinoCampus)

**Data:** 2026-06-29
**Autor:** Mavis (MiniMax Agent)
**Para:** Codex (OpenAI CLI) ou outra IA autônoma iterando em `/admin/cadu.html`
**Branch:** `kinocampus-V75.0-foundations`
**Último commit:** `823a645` — docs(admin/cadu): v2 auditoria profunda

---

## 🎯 Objetivo deste prompt

Dar a você (Codex ou outra IA) **contexto suficiente pra entender, debugar e evoluir o painel Cadu Admin** sem precisar fazer 65min de discovery reading. Tudo aqui foi validado lendo código real.

---

## 1. TL;DR em 30 segundos

`/admin/cadu.html` é o painel administrativo do **Cadu** (agente IA baseado em OpenClaw que cura sites institucionais da UFG e perfis do Instagram). Tem 4 abas:

| Aba | O que faz |
|-----|-----------|
| **Sites UFG** | Tabela editável (Tier T1/T2/T3 + Observação) de 56 unidades UFG. Auto-save 700ms via Supabase |
| **Feed coletado** | Lista chunks do Cadu memory (SQLite no VPS). 20/50/100 itens, busca local |
| **Pipeline** | Lista 9 estágios (curator, ig, duplicates, format, publish, enrich, dedup, sigaa, all). Log streaming SSE ao vivo |
| **OpenClaw** | Chat direto com agente Cadu. Status cards (agent/telegram/heartbeat/tasks). Sessões recentes |

**Estado crítico (junho/2026):**
- cadu-api na VPS roda **v0.4.2** mas server.py no repo é **v0.4.3** com endpoints novos (404 em produção)
- `CADU_API_TOKEN` no Vercel está obsoleto — Yan rotacionou após exposição
- `DEV BYPASS` no client desabilitado (`if (false)` linha 154) — login Supabase obrigatório
- `TRUSTED_ADMIN_EMAILS = []` — única auth é `profiles.is_admin=true`

**Bloqueio principal:** notification bell polling 404, modal de detalhes 404, cross-tab Ask cai em 401. Tudo isso resolve com SSH + `docker compose up -d cadu-api` + atualizar `CADU_API_TOKEN` no Vercel (5min).

---

## 2. Arquitetura em 1 diagrama

```
[Browser admin/cadu.html]
   ↓ (Supabase JWT via cookie)
[Supabase Auth] ← profiles.is_admin (fonte da verdade UI)
   ↓
[Browser] apiFetch() → /api/cadu/* (Vercel)
   ↓ (Bearer Supabase JWT OU ?kc_admin_token= query)
[Vercel Edge] server/cadu-auth.mjs valida Supabase + kc_is_admin
   ↓ (Bearer CADU_API_TOKEN server-side, env var Vercel)
[cadu-api FastAPI] VPS Hostinger srv1597083.hstgr.cloud:49104
   ├─ CORS aberto (allow_origins=["*"])
   ├─ Auth via Bearer CADU_API_TOKEN (env var container)
   └─ Lê Supabase direto via REST (kc_unit_meta)
   ↓
[Workspace /data/.openclaw/workspace/]
   ├─ ufg-sites-map.md (58 unidades UFG)
   ├─ scripts/ (pipeline-kino, cadu-curador-v4.4, formatador-ia, etc)
   └─ data/cadu-pipeline.db (SQLite WAL, runs history)

[OpenClaw Container] (mesma VPS)
   └─ Browser CDP + Skill cadu-api (compartilha /data)
```

---

## 3. Ordem de leitura focada (~65min total)

Antes de mexer em qualquer coisa, leia nesta ordem:

1. **`docs/CADU-ADMIN-STATE.md`** (961 linhas, commit `823a645`) — **LEIA INTEIRO**. Tem estado, bugs, próximos passos
2. **`admin/cadu.html`** (613 linhas) — DOM + CSS variables + scripts carregados
3. **`assets/js/controllers/admin/admin-cadu.controller.js`** (1694 linhas):
   - Linhas 149-269 — auth flow (6 camadas, importante entender)
   - Linhas 1130-1500 — pipeline + SSE
4. **`server/cadu-auth.mjs`** (131 linhas) — Vercel proxy auth (RPC `kc_is_admin`)
5. **`api/cadu/pipeline.js` + `pipeline-router.js`** — SSE proxy (Fluid Compute, maxDuration 300s)
6. **`openclaw-cadu/data/.openclaw/skills/cadu-api/server.py`** (1493 linhas):
   - Linhas 595-700 — `/health` + `/sites` + merge Supabase
   - Linhas 1082-1208 — `/openclaw/context` (snapshot consolidado, cache 30s)
7. **`openclaw-cadu/data/.openclaw/skills/cadu-api/pipeline.py`** (571 linhas) — `PIPELINE_STAGES` dict (linha 82)

**Não pule etapas.** Especialmente #6 e #7 — é onde tá a lógica core do cadu-api.

---

## 4. Endpoints cheave

### Vercel proxy (`/api/cadu/*`)
| URL pública | Função | Auth |
|-------------|--------|------|
| `/api/cadu/health` | Liveness, retorna version | ❌ |
| `/api/cadu/sites` + `/sites/{id}/meta` | Lista UFG + edit tier/note | ✅ Supabase JWT |
| `/api/cadu/feed` + `/feed?path={id}/ask` | Lista chunks + ask dedicado | ✅ |
| `/api/cadu/publish` | Sugerir publicação no feed | ✅ |
| `/api/cadu/pipeline` + `/pipeline/*` (via rewrite) | Status + run + log SSE | ✅ |
| `/api/cadu/openclaw/*` (via rewrite) | Status + chat + sessions | ✅ |

### cadu-api VPS (FastAPI, 26 endpoints)
**IMPORTANTE**: 3 endpoints **SEM auth** no cadu-api: `/pipeline/{id}/artifacts`, `/pipeline/{id}/log`, `/pipeline/{id}/export`. Vercel proxy protege hoje, mas cadu-api direto vazaria.

Versões inconsistentes no MESMO arquivo:
- `app.version = "0.4.3"` (linha 117)
- `/health.version = "0.4.2"` hardcoded (linha 607)
- `/openclaw/context.cadu_api_info.version = "0.4.6"` hardcoded (linha 1162)

Container reporta v0.4.2. server.py novo no repo é v0.4.3. Não há v0.4.6 deployado.

---

## 5. Bugs latentes (9 prioritários)

### 🔴 Críticos (bloqueiam features)
1. **Notification bell polling 404**: depende de `/api/cadu/pipeline/runs` (novo v0.4.3+). Sem restart cadu-api → bell nunca atualiza
2. **Cross-tab Ask cai em 401**: `/api/cadu/feed/{id}/ask` 404 → fallback `/agent-send` → 401 (admin_auth_required)
3. **Modal de detalhes 404**: `/artifacts`, `/log`, `/export` endpoints não-deployados em v0.4.2

### 🟡 Importantes (qualidade)
4. **3 endpoints cadu-api sem auth** (`/artifacts`, `/log`, `/export`) — line 872, 941, 965
5. **Cache stale de 5min em `/api/cadu/sites`** — após PATCH bem-sucedido, root permanece cacheado
6. **`askCaduAboutRun` não auto-envia** (linha 1460 controller) — pré-popula textarea mas usuário precisa clicar Enviar. Diferente de site/feed que enviam direto
7. **`?v=1.0.0` imutável** no controller (linha 611 admin/cadu.html) — Yan precisa bumpar manualmente após mudanças
8. **`EventSource.controller.abort()` dead code** (linha 1576) — EventSource não tem `.controller`. Try/catch engole throw silencioso
9. **Version string compare** (linha 1053 controller): `data.version >= '0.4.6'` falha em `'0.4.10'` (lexicográfico). Usar `parseFloat` ou semver compare

### 🟢 Desejáveis (futuro)
10. **`pipeline.js` órfão** — duplica `pipeline-router.js`. Cleanup
11. **`escapeHtml` definido 2x** (linha 34 + 1221) — shadowing perigoso
12. **`pipelineRefreshTimer` declarado mas nunca usado** (linha 1219)
13. **`/api/admin/redeploy` usa `docker restart`** (server.py:1474) — não recarrega env vars. Substituir por `docker compose up -d`
14. **`/health` expõe `publish_modes` + `pipeline_stages`** — info disclosure (sensível em prod)

---

## 6. Tarefas prováveis que você (Codex) pode receber

### A. Corrigir bug X
1. Leia `docs/CADU-ADMIN-STATE.md` seção relevante
2. Identifique arquivo/linha exata (cite sempre `file:line` no commit message)
3. **Valide antes de commitar** — não invente paths/linhas. Use `grep` / `read` pra confirmar
4. Faça commit com mensagem descritiva em PT-BR (Yan prefere assim)
5. Push e confirme deploy via Vercel auto-deploy (não precisa manual)

### B. Adicionar feature Y
1. Identifique **ponto de extensão** no doc seção 5.1
2. Mexa em **no máximo 2 arquivos por vez** (controller + html OU server.py + api/cadu/*.js)
3. Atualize `docs/CADU-ADMIN-STATE.md` se a feature mudar contrato (endpoints, data-attrs, response shape)

### C. Debug "algo não funciona"
1. Abra DevTools no browser → Console + Network
2. Identifique se o erro é **client-side** (TypeError, etc) ou **401/502** (auth/upstream)
3. Se 401: cadu-api retornando `admin_auth_required` → token rotacionado, atualizar Vercel
4. Se 404 em endpoint v0.4.3+: cadu-api v0.4.2 ainda rodando, precisa restart
5. Se 502: cadu-api offline, verificar `docker ps` na VPS via SSH

---

## 7. Convenções obrigatórias

### Naming CSS
- Namespace `kc-cadu-*` (section, table, badge, tier-select, ig-link, note-input, publish-btn, ask-btn)
- Pipeline-specific: `kc-pipeline-*` (grid, stage, active-card, history-item)
- OpenClaw-specific: `kc-openclaw-*` (grid, panel, chat-log, list-item)
- Notification: `kc-notif-*` (bell, badge, dropdown)

### Data attributes (ask-btn contract)
```
data-ask-kind="site" data-ask-name="..." data-ask-url="..." data-ask-instagram="..." data-ask-tier="..."
data-ask-kind="feed" data-ask-id="..." data-ask-heading="..."
data-ask-kind="pipeline" data-ask-run-id="..." data-ask-stage="..." data-ask-status="..."
```

### Error response (apiFetch)
```js
// Sucesso
{ ...data }
// Erro
{ __error: true, status: 401, data: { error: "...", detail: "..." } }
```

### Cache headers
- `private, max-age=N` só pra listas root (sites=300, feed=60)
- `no-cache` pra sub-paths

### PowerShell (Windows)
- SEMPRE `[Text.UTF8Encoding]::new($false)` (sem BOM) ao escrever arquivos via .NET
- NUNCA `Get-Content | Set-Content` (corrompe UTF-8)
- Use `workdir=` param ao invés de `cd dir && cmd`

---

## 8. Restrições absolutas

### 🚫 NÃO FAÇA
- **NÃO exponha credenciais em chat/PR/issue** (CADU_API_TOKEN, Supabase service_role, Telegram bot token, GH_TOKEN, VERCEL_TOKEN). Yan rotacionou todos em jun/2026 após exposição
- **NÃO force-push** na `kinocampus-V75.0-foundations`
- **NÃO delete arquivos sem confirmar** — use `mavis-trash` (recuperável)
- **NÃO altere cache policies** sem testar SSE — quebra EventSource
- **NÃO mexa em `_cadu_token_cache` / `_openclaw_context_cache`** sem entender (reseta tokens)
- **NÃO confunda versões**: `app.version="0.4.3"`, /health="0.4.2", /context="0.4.6" — três números, MESMO arquivo, três lugares diferentes
- **NÃO use `docker restart`** — precisa `docker compose up -d` pra recarregar env vars

### ✅ FAÇA
- **Cite `file:line`** ao descrever mudanças (ex: "Fix em controller.js:1460 — askCaduAboutRun auto-envia")
- **Valide paths antes de chutar** — `grep`/`read` antes de incluir em commit message
- **Atualize `docs/CADU-ADMIN-STATE.md`** se mudar contrato (endpoint, attr, response)
- **Use `data-ask-*` attributes** pra novos botões cross-tab (não invente novo padrão)
- **Siga padrão de CSS classes** (`kc-cadu-*` namespace)

---

## 9. Estado operacional no momento

| Componente | Status |
|------------|--------|
| Branch local | `kinocampus-V75.0-foundations` |
| Sync com origin | ✅ `Already up to date` |
| Último commit | `823a645` — docs v2 (2026-06-29) |
| cadu-api (VPS) | ⚠️ v0.4.2 — server.py v0.4.3 deployado mas container não-restartado |
| CADU_API_TOKEN no Vercel | ⚠️ Obsoleto (Yan rotacionou após exposição) |
| OpenClaw container | ⚠️ UP mas requer login web (form HTML pedindo token) |
| OpenClaw agent (`agent-send`) | ⚠️ 401 admin_auth_required |
| Vercel Hobby functions | 7/12 usadas |
| `.env` local | ⚠️ Tokens obsoletos (rotacionados) |

---

## 10. Próximas fases priorizadas

### 🔴 URGENTE (5min destrava tudo)
1. SSH + `docker compose up -d cadu-api` em `/docker/openclaw-hahq/` (NÃO `docker restart`)
2. Atualizar `CADU_API_TOKEN` no Vercel: `vercel env rm CADU_API_TOKEN production` + `vercel env add CADU_API_TOKEN production`
3. Decidir sobre DEV BYPASS (linha 154): reativar com flag `if (hostname.endsWith('.vercel.app'))` pra preview/dev

### 🟡 IMPORTANTE (qualidade)
4. Unificar `__version__` em server.py (substituir 3 números hardcoded por 1)
5. Adicionar `Depends(require_token)` em `/artifacts`, `/log`, `/export`
6. Auto-invalidate cache `/sites` após PATCH (`Cache-Control: no-store`)
7. Fix `askCaduAboutRun` auto-envio (alinhar com site/feed)
8. Bumpar `?v=1.0.0` do controller → `?v=kc-admin.{Y.M.D}` ou git hash
9. Fix `EventSource.controller.abort()` (linha 1576) — usar `es.close()`
10. Semver compare em periodic poll (linha 1053)

### 🟢 DESEJÁVEL
11. Limpar `pipeline.js` órfão (substituído por pipeline-router.js)
12. Dedupe `escapeHtml` (linha 34 vs 1221)
13. Limpar `pipelineRefreshTimer` não usado (linha 1219)
14. `/api/admin/redeploy` usar `docker compose up -d` ao invés de `docker restart`
15. Env-based telegram bot ID (controller.js:673 hardcoded)

---

## 11. Comandos úteis pra debugar

### Git
```bash
git status
git log --oneline -10
git diff --stat
git add <arquivo>
git commit -m "mensagem descritiva em PT-BR"
git push
```

### Verificar cadu-api (VPS) — precisa SSH
```bash
ssh root@srv1597083.hstgr.cloud
cd /docker/openclaw-hahq
docker compose ps
docker compose logs cadu-api --tail=50
curl -sS http://localhost:49104/health
# Espera: {"status":"ok","version":"0.4.2",...}
```

### Verificar Vercel
```bash
vercel env ls production --token $env:VERCEL_TOKEN
vercel env rm CADU_API_TOKEN production --token $env:VERCEL_TOKEN --yes
vercel env add CADU_API_TOKEN production --token $env:VERCEL_TOKEN --sensitive
```

### Validação browser (Playwright)
```bash
mavis mcp call playwright browser_navigate '{"url": "https://www.kinocampus.com.br/admin/cadu.html"}'
mavis mcp call playwright browser_evaluate '{"function": "() => ({ tab: localStorage.getItem(\"kc:cadu:tab\"), user: JSON.parse(localStorage.getItem(\"kc:user\") || \"null\")?.email })"}'
```

---

## 12. Onde pedir ajuda

| Tipo de problema | Quem |
|------------------|------|
| Decisão de produto / qual feature priorizar | Yan |
| SSH na VPS / rotação de tokens / deploy manual | Yan |
| Análise de logs / patches de código / validação E2E | Mavis (esta sessão) |
| OpenClaw agent comandos remotos | Yan (precisa logar no container web) |
| Pesquisa acadêmica PNAES/UFG (não relacionado) | Mavis em outra sessão |

---

## 13. Filosofia

Yan é mestrando em Administração (PPGADM/FACE/UFG), nível técnico leigo em programação mas capaz de montar pipelines. Trabalha em horário noturno geralmente (America/Sao_Paulo UTC-3). Idioma PT-BR. Telegram como canal principal.

**Princípios que ele valoriza:**
- ✅ Transparência sobre o que está e o que não está funcionando
- ✅ Não quebrar o que está funcionando
- ✅ Commits pequenos e descritivos
- ✅ Documentar pra próxima pessoa (ele mesmo daqui 3 meses ou outra IA)
- ❌ NÃO chutar respostas — sempre validar antes de afirmar
- ❌ NÃO inventar números / paths / endpoints
- ❌ NÃO pedir credenciais em chat (princípio inegociável desde jun/2026)

---

**Fim do handoff.** Tudo que você precisa pra iterar com autonomia está aqui. Se algo mudou, atualize este arquivo junto com `CADU-ADMIN-STATE.md`.

Próxima ação: SSH + restart cadu-api destrava 80% dos bugs. Depois, cleanup dos bugs latentes em ordem de prioridade.