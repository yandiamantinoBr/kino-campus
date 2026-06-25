# KinoCampus + Cadu (OpenClaw) — Pipeline Documentation

Documentação canônica da pipeline automatizada do Cadu. Esta é a **fonte de verdade** — o admin UI (`/admin/cadu.html`) consome via cadu-api v0.4.2+ e o VPS Hostinger `srv1597083.hstgr.cloud` executa via `docker exec` no container `openclaw-hahq-openclaw-1`.

## Arquitetura

```
┌──────────────────────────────────────┐
│ /admin/cadu.html (Vercel)            │  ← UI: dispara + acompanha runs
└─────────────────┬────────────────────┘
                  │ fetch + EventSource (SSE)
                  v
┌──────────────────────────────────────┐
│ Vercel: /api/cadu/pipeline/*         │  ← Proxy catch-all → cadu-api
└─────────────────┬────────────────────┘
                  │ HTTPS + Bearer token
                  v
┌──────────────────────────────────────┐
│ cadu-api v0.4.2 (FastAPI, VPS)       │  ← Orquestra runs + persiste
│ - Python 3.12 + Docker socket        │
│ - Dedup automático (sem runs paralelos do mesmo stage)
│ - Popen polling (detecta término real, não /proc/PID)
│ - SSE heartbeat :keepalive a cada 15s│
└─────────────────┬────────────────────┘
                  │ subprocess docker exec
                  v
┌──────────────────────────────────────┐
│ openclaw-hahq-openclaw-1 (Node 24)   │  ← Roda os scripts do pipeline
└──────────────────────────────────────┘
```

## Estágios pré-definidos

Cada estágio é uma combinação `script` + `args` fixos. Catálogo em `pipeline/PIPELINE_STAGES.json`:

| Stage ID    | Nome                       | Script                                   | Args                            | Categoria     | ETA |
|-------------|----------------------------|------------------------------------------|---------------------------------|---------------|-----|
| `curator`   | Curador UFG v4.4           | `scripts/cadu-curador-v4.4.js`           | `--daily`                       | scan          | 90s |
| `ig`        | Scanner Instagram          | `scripts/scan-ig-browser.js`             | (nenhum)                        | scan          | 50s |
| `duplicates`| Enriquecimento Duplicatas  | `scripts/enrich-duplicates.js`           | (nenhum)                        | process       | 60s |
| `format`    | Formatador IA              | `scripts/formatador-ia.js`               | (nenhum)                        | process       | 120s |
| `publish`   | Publicação                 | `scripts/publish_auto_v5.js`             | (nenhum)                        | publish       | 60s |
| `enrich`    | Enriquecimento Imagens     | `scripts/enrich-images.js`              | `--from-recent 20`              | process       | 90s |
| `dedup`     | Dedup Visual + Textual     | `scripts/dedup-kino.js`                  | (nenhum)                        | maintenance   | 120s |
| `sigaa`     | SIGAA Calendar Sync        | `scripts/sigaa/sync_calendar.js`         | (nenhum)                        | maintenance   | 100s |
| `all`       | Pipeline Completa          | `scripts/pipeline-kino.js`               | `--ig --format --publish`       | publish       | 400s |

## Pipeline Completa (workflow diário)

A ordem real é:
1. **`ig`** — Captura posts novos de perfis UFG (CDP)
2. **`curator`** — Varre sites UFG Tier 1+2 (~80s, 31 sites)
3. **`duplicates`** — Enriquece posts já publicados com info de duplicatas
4. **`format`** — Gera descrições canônicas (padrão CONPEEX)
5. **`publish`** — Publica os selecionados via Edge Function cadu-publish
6. **`enrich`** — Adiciona imagens complementares aos posts publicados

`pipeline-kino.js --ig --format --publish` faz apenas 1, 2, 4, 5 (sem duplicates + enrich).

## Endpoints da cadu-api

Todos exigem Bearer token (`CADU_API_TOKEN`). Path base: `/api/cadu/pipeline/*`.

| Método | Path                                    | Descrição |
|--------|-----------------------------------------|-----------|
| GET    | `/api/cadu/pipeline`                     | Catálogo de stages + run ativo + histórico (últimos 20) |
| POST   | `/api/cadu/pipeline/run`                 | Inicia run. Body: `{"stage": "curator"}`. Retorna `{run_id, pid, log_path, estimated_sec}` |
| GET    | `/api/cadu/pipeline/runs`                | Lista runs (mesmo que history no GET root) |
| GET    | `/api/cadu/pipeline/:id`                 | Status de um run específico |
| POST   | `/api/cadu/pipeline/:id/stop`            | Mata subprocess (SIGTERM no grupo de processos) |
| GET    | `/api/cadu/pipeline/:id/stream`          | SSE com stdout linha-a-linha. **Bypass Vercel** — chamar direto cadu-api via Traefik. Aceita `?token=...` |

## Persistência

SQLite em `/data/cadu-pipeline.db` (volume persistente do docker-compose):
- Tabela `runs(id, stage, status, started_at, finished_at, exit_code, log_path, pid, submitted_by, message)`
- Status: `running` | `finished` (exit 0) | `failed` (exit != 0 ou -15 SIGTERM)

Logs de cada run em `/data/cadu-pipeline-logs/{run_id}.log` (volume persistente, sobrevive a restart do container).

## Reaper background

**v0.4.2 — correção crítica do reaper**: o reaper original usava `os.kill(pid, 0)` para detectar término do subprocess, mas o PID retornado pelo `subprocess.Popen` no cadu-api é do `docker exec` no namespace cadu-api — quando o bash dentro faz `exec node`, o PID original morre mas o `node` continua rodando dentro do `openclaw-hahq-openclaw-1` container (PID diferente em outro namespace).

**Solução v0.4.2**: reaper mantém `dict[run_id, Popen]` em memória e usa `proc.poll()` (que reflete corretamente o término do docker exec group). Adicionalmente, faz reconciliação de runs órfãos (sem handle, de sessões anteriores do cadu-api) marcando como `failed` após 5 min.

## Cron diário (sugestão — ainda não configurado)

```cron
# Crontab na VPS
30 8 * * *   /usr/bin/docker exec openclaw-hahq-openclaw-1 bash -c "cd /data/.openclaw/workspace && node scripts/cadu-curador-v4.4.js --daily"   >> /var/log/cron-curator.log 2>&1
0  9 * * *   /usr/bin/docker exec openclaw-hahq-openclaw-1 bash -c "cd /data/.openclaw/workspace && node scripts/scan-ig-browser.js"                  >> /var/log/cron-ig.log 2>&1
0  10 * * *   curl -X POST -H "Authorization: Bearer $CADU_API_TOKEN" https://api.openclaw-hahq.srv1597083.hstgr.cloud/api/pipeline/run -H "Content-Type: application/json" -d '{"stage":"publish"}'
0  14 * * *   curl -X POST -H "Authorization: Bearer $CADU_API_TOKEN" https://api.openclaw-hahq.srv1597083.hstgr.cloud/api/pipeline/run -H "Content-Type: application/json" -d '{"stage":"enrich"}'
30 14 * * *   curl -X POST -H "Authorization: Bearer $CADU_API_TOKEN" https://api.openclaw-hahq.srv1597083.hstgr.cloud/api/pipeline/run -H "Content-Type: application/json" -d '{"stage":"dedup"}'
```

## Adicionando novo estágio

1. Adicionar entrada em `pipeline/PIPELINE_STAGES.json`:
   ```json
   {
     "id": "minha-pipeline",
     "name": "Nome descritivo",
     "description": "O que faz",
     "script": "scripts/meu-script.js",
     "args": ["--daily"],
     "estimated_sec": 60,
     "category": "scan"
   }
   ```
2. Adicionar entry em `cadu-api/pipeline.py` no `PIPELINE_STAGES` dict (sincronizar manualmente por enquanto)
3. Deployar cadu-api v0.4.1+
4. Botão aparece automaticamente no admin UI

## Limitações conhecidas

- **Vercel serverless timeout (10-60s)** impede SSE via proxy — clients devem chamar cadu-api direto via Traefik
- **Sem retry automático** em caso de falha de subprocess — admin deve disparar manualmente
- **Catálogo duplicado** (Python hardcoded + JSON de docs) — alvo: ler do JSON no futuro
- **Browser CDP porta 18800** precisa estar rodando dentro do `openclaw-hahq-openclaw-1` para estágios `ig`, `curator`, `duplicates` (que usam Playwright). Iniciar com `docker exec openclaw-hahq-openclaw-1 openclaw browser start`

## Comportamentos v0.4.2 (vs v0.4.1)

- **Dedup automático**: se já existe run `running` para um stage, novo POST `/api/pipeline/run` retorna **409 Conflict** com `existing_run_id` no body. UI mostra "⛔ Já existe um run ativo para X".
- **SSE heartbeat**: `:keepalive` enviado a cada 15s previne reconexão por inatividade (proxies Cloudflare/Traefik/nginx podem fechar conexão sem dados por ~30s).
- **SSE aceita `?token=xxx`** no endpoint `/stream` (workaround para EventSource que não suporta Authorization header). Mesma validação do Bearer token.
- **Stop robusto**: `stop_run()` usa `proc.terminate()` no handle em memória, com fallback `kill()` após 5s timeout.
- **Cleanup automático**: histórico limitado aos últimos `CADU_PIPELINE_MAX_HISTORY=100` runs (configurável via env var).

## Roadmap

- [ ] Sincronizar catálogo Python ↔ `pipeline/PIPELINE_STAGES.json` (single source of truth)
- [ ] Auto-retry de runs que falharam por timeout/erro transitório
- [ ] Lock global (mutex) pra impedir runs simultâneos do mesmo stage
- [ ] Notificação Telegram quando run termina (success/fail)
- [ ] Métricas Prometheus (duração por stage, success rate)
- [ ] Visualização timeline Gantt dos runs