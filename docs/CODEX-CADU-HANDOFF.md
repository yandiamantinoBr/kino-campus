# Codex Handoff — Cadu Admin (KinoCampus)

**Data:** 2026-06-29
**Autor:** Mavis (MiniMax Agent)
**Para:** Codex (OpenAI CLI) ou outra IA autônoma iterando em `/admin/cadu.html`
**Branch:** `kinocampus-V75.0-foundations`
**Último commit:** `823a645` — docs(admin/cadu): v2 auditoria profunda
**Atualização Codex:** 2026-06-29 — v3 pós-verificação VPS/OpenClaw e correções cadu-api v0.4.6

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

**Estado verificado por Codex em 2026-06-29:**
- cadu-api na VPS está online e responde **v0.4.6** tanto direto quanto via proxy KinoCampus (`/api/cadu/health`)
- endpoints novos (`/pipeline/runs`, `/feed/{chunk_id}/ask`, `/pipeline/{id}/artifacts`, `/pipeline/{id}/log`, `/pipeline/{id}/export`, `/openclaw/context`) estão deployados
- a pipeline tem observabilidade inicial via `GET /api/pipeline/health` e card “Saúde da automação” no admin
- `/health.version`, `FastAPI.version` e `/openclaw/context.cadu_api.version` foram unificados em `CADU_API_VERSION="0.4.6"`
- o container foi recriado com `docker compose up -d --force-recreate cadu-api`; durante a recriação apareceu um bug latente de import (`AgentSendRequest` definido depois da rota), corrigido antes da validação final
- `DEV BYPASS` no client continua desabilitado (`if (false)`) — login Supabase obrigatório
- `TRUSTED_ADMIN_EMAILS = []` — única auth local é `profiles.is_admin=true`

**Bloqueio principal anterior foi removido.** O painel já não deve depender de fallback 401 por falta dos endpoints atuais. Os problemas restantes são operacionais e evolutivos: cron jobs invisíveis/lista vazia, alertas fracos, cache/dedup a auditar, duplicação de mappers Node/Deno e endurecimento de endpoints/health.

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

1. **`docs/CADU-ADMIN-STATE.md`** — leia primeiro o aviso inicial e a seção v3 no fim do arquivo; depois leia v1/v2 como histórico. Tem estado, bugs e próximos passos
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

## 4. Endpoints chave

### Vercel proxy (`/api/cadu/*`)
| URL pública | Função | Auth |
|-------------|--------|------|
| `/api/cadu/health` | Liveness, retorna version | ❌ |
| `/api/cadu/sites` + `/sites/{id}/meta` | Lista UFG + edit tier/note | ✅ Supabase JWT |
| `/api/cadu/feed` + `/api/cadu/feed?path={chunk_id}/ask` | Lista chunks + proxy para ask dedicado (`/api/feed/{chunk_id}/ask` no cadu-api) | ✅ |
| `/api/cadu/publish` | Sugerir publicação no feed | ✅ |
| `/api/cadu/pipeline` + `/pipeline/*` (via rewrite) | Status + run + log SSE + `/health` operacional | ✅ |
| `/api/cadu/openclaw/*` (via rewrite) | Status + chat + sessions | ✅ |

### cadu-api VPS (FastAPI, v0.4.6)

Pontos validados em 2026-06-29:
- `/health` responde `version="0.4.6"` direto no domínio `api.openclaw-hahq.srv1597083.hstgr.cloud` e via `https://www.kinocampus.com.br/api/cadu/health`
- `/api/pipeline/runs?limit=1`, `/api/pipeline/health`, `/api/openclaw/context?refresh=true`, `/api/sites` e `/api/openclaw/status` responderam com dados reais na VPS
- `/api/openclaw/context` agora usa timeouts maiores e não deve marcar OpenClaw como offline por atraso curto se `/api/openclaw/status` está saudável

**IMPORTANTE**: `/pipeline/{id}/artifacts`, `/pipeline/{id}/log` e `/pipeline/{id}/export` não usam exatamente o mesmo `Depends(require_token)` das demais rotas. No código atual, elas são protegidas por `Security(_optional_token_or_query)`, aceitando Bearer token ou `?token=`. Portanto, não são endpoints abertos sem auth, mas o token em query é um risco de exposição por logs/histórico e deve ser migrado para Bearer-only quando possível.

---

## 5. Achados atuais e classificação

### ✅ Corrigidos nesta rodada
1. **Notification bell e endpoints pipeline 404**: cadu-api foi recriado em v0.4.6 e `/api/pipeline/runs` responde.
2. **Cross-tab Ask para feed/pipeline**: `/api/feed/{chunk_id}/ask` está deployado; `askCaduAboutRun()` agora autoenvia via `askCaduContext()`.
3. **Modal de detalhes 404**: endpoints de artifacts/log/export existem em produção v0.4.6.
4. **Versões inconsistentes**: `CADU_API_VERSION` centraliza FastAPI, `/health` e `/openclaw/context`.
5. **`EventSource.controller.abort()`**: substituído por `EventSource.close()`.
6. **Version string compare**: substituído por comparação semver simples.
7. **`escapeHtml` duplicado e `pipelineRefreshTimer` morto**: removidos do controller.
8. **Checkbox OpenClaw enganoso**: `deliver=true` agora aparece como “Enviar resposta também pelo Telegram”, desmarcado por padrão.
9. **`refreshOpenclaw()` interpretando shape errado**: agora lê `statusResp.status.data` e fallbacks.
10. **`/openclaw/context` falso negativo**: timeouts aumentados; validado `cadu_api.openclaw_reachable=true`, com `openclaw.status` e `openclaw.last_session` presentes.

### 🔴 Problemas reais restantes
1. **Cron jobs invisíveis/lista vazia**: `openclaw cron list` retorna `No cron jobs.`, então não há fonte operacional clara para agenda durável/observável.
2. **Alertas de falha ainda frágeis**: há health/status/logs, mas não foi encontrada camada persistente que avise Yan por Telegram/e-mail quando publish, IG scan ou pipeline quebram.
3. **Duplicação de mapper Node vs Deno**: existem `services/cadu-ufg-publisher/src/mapper.js` e `supabase/functions/cadu-publish/mapper.ts`; divergência de contrato pode gerar publicações inconsistentes.
4. **`/api/admin/redeploy` usa `docker restart`** no cadu-api: não recarrega env vars de forma confiável; preferir `docker compose up -d --force-recreate cadu-api`.

### 🟡 Riscos/potenciais que precisam de auditoria própria
5. **Cache/dedup superprotetor**: a run viva teve `633 itens -> 1 publicável -> 1 publicado`; isso é suspeito, mas a causa pode ser curadoria, dedup, relevância ou cache. Não concluir sem auditar `kino-posts-cache.json` e os descartes.
6. **Token por query em artifacts/log/export**: não é “sem auth”, mas `?token=` pode vazar em logs/histórico. Migrar para Bearer-only quando não quebrar downloads.
7. **Cache stale em `/api/cadu/sites`**: PATCH funciona, mas lista root cacheada por 5min pode atrasar confirmação visual. Precisa teste de UI antes de mudar headers.
8. **`/health` público expõe `publish_modes` + `pipeline_stages`**: info disclosure moderado; mudar com cuidado para não quebrar health checks externos.
9. **`pipeline.js` órfão/duplicado**: existe junto de `pipeline-router.js`; limpar só depois de confirmar rewrites e imports em Vercel.

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
3. Se 401: diferencie proxy KinoCampus (`server/cadu-auth.mjs`) de cadu-api (`admin_auth_required`/token upstream). Não peça token em chat; valide env/headers no ambiente.
4. Se 404: em v0.4.6 não assuma container velho. Confira primeiro rewrite em `api/cadu/*`, path enviado pelo browser e rota real no FastAPI.
5. Se 502: cadu-api pode estar reiniciando/offline. Verificar `docker compose ps`, logs e `/health` local na VPS.
6. Se OpenClaw aparece offline mas `/api/openclaw/status` responde: confira timeouts/cache de `/api/openclaw/context` antes de concluir queda real.

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
- **NÃO reintroduza versões hardcoded divergentes**: use `CADU_API_VERSION` no cadu-api
- **NÃO use `docker restart`** para deploy/reload de env — use `docker compose up -d --force-recreate cadu-api`
- **NÃO propague token em query string** em novos endpoints; prefira Bearer token

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
| Sync com origin | Validar com `git status -sb` na sessão atual |
| Último commit de referência | `823a645` — docs v2 (2026-06-29), antes das correções Codex v3 |
| cadu-api (VPS) | ✅ v0.4.6 online; health direto e proxy KinoCampus respondem |
| CADU_API_TOKEN no Vercel | Não registrar valor em docs/chat; validar somente por ambiente/headers |
| OpenClaw container | ✅ status endpoint respondeu; CDP Chrome 149 online |
| OpenClaw context | ✅ `/api/openclaw/context?refresh=true` validado com `cadu_api.openclaw_reachable=true`, `openclaw.status` e `openclaw.last_session` |
| Vercel Hobby functions | 7/12 usadas |
| `.env` local | Não confiar sem validação; nunca colar tokens em chat/PR |

---

## 10. Próximas fases priorizadas

### 🔴 Fase 1 — Operação observável
1. Criar fonte de agendamento durável e visível para pipeline (`openclaw cron list` está vazio).
2. Adicionar alerta persistente para falha de publish/scan/format/pipeline, idealmente Telegram + registro em Supabase/log.
3. Criar healthcheck sintético que verifique `/health`, `/pipeline/runs`, `/openclaw/context` e “última publicação recente”.
   - Parcialmente iniciado: `/api/pipeline/health` calcula atraso/falhas e aparece no admin. Falta job externo com alerta persistente.

### 🟡 Fase 2 — Consolidação de contratos
4. Migrar artifacts/log/export para Bearer-only ou reduzir uso de `?token=`.
5. Unificar ou gerar a partir de uma fonte comum os mappers Node (`services/cadu-ufg-publisher`) e Deno (`supabase/functions/cadu-publish`).
6. Auditar `pipeline.js` vs `pipeline-router.js` e remover duplicação só depois de confirmar rewrites em produção.
7. Rever cache de `/api/cadu/sites` após PATCH com teste de UI, sem quebrar cache de listas nem SSE.

### 🟢 Fase 3 — Qualidade editorial e automação
8. Auditar `kino-posts-cache.json`, critérios de descarte e dedup para explicar `633 -> 1 publicável` sem assumir causa.
9. Adicionar approval gate/métricas de qualidade para conteúdo publicado.
10. Reduzir payload público de `/health` se health checks externos não precisarem de `publish_modes`/`pipeline_stages`.
11. Trocar `/api/admin/redeploy` para `docker compose up -d --force-recreate cadu-api`.
12. Decidir sobre DEV BYPASS com flag segura para preview/dev, sem abrir produção.

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
# Espera: {"status":"ok","version":"0.4.6",...}
```

### Recriar cadu-api quando houver deploy de server.py/env
```bash
ssh root@srv1597083.hstgr.cloud
cd /docker/openclaw-hahq
docker compose up -d --force-recreate cadu-api
docker compose logs cadu-api --tail=80
```

### Verificar Vercel
```bash
vercel env ls production --token $env:VERCEL_TOKEN
# Rotacionar CADU_API_TOKEN somente se validação de ambiente/header mostrar necessidade real.
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

Próxima ação recomendada: implementar observabilidade/alertas e scheduler durável, depois auditar cache/dedup e unificar os mappers de publicação.
