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
| `format`    | Formatador IA              | `scripts/pipeline-kino.js`               | `--stage=format`                | process       | 120s |
| `publish`   | Publicação                 | `scripts/pipeline-kino.js`               | `--stage=publish`               | publish       | 60s |
| `enrich`    | Enriquecimento Imagens     | `scripts/enrich-images.js`              | `--from-recent 20`              | process       | 90s |
| `dedup`     | Dedup Visual + Textual     | `scripts/dedup-kino.js`                  | (nenhum)                        | maintenance   | 120s |
| `sigaa`     | SIGAA Calendar Sync        | `scripts/sigaa/sync_calendar.js`         | (nenhum)                        | maintenance   | 100s |
| `all`       | Pipeline Completa          | `scripts/pipeline-kino.js`               | `--stage=ig --stage=curator --stage=duplicates --stage=format --stage=publish --stage=enrich` | publish | 600s |

## Pipeline Completa (workflow diário)

A ordem real é:
1. **`ig`** — Captura posts novos de perfis UFG (CDP)
2. **`curator`** — Varre sites UFG Tier 1+2 (~80s, 31 sites)
3. **`duplicates`** — Enriquece posts já publicados com info de duplicatas
4. **`format`** — Gera descrições canônicas (padrão CONPEEX)
5. **`publish`** — Publica os selecionados via Edge Function cadu-publish
6. **`enrich`** — Adiciona imagens complementares aos posts publicados

Hoje a Pipeline Completa chama explicitamente os seis estágios acima. Runs recentes em produção duraram ~500-600s, então o admin usa polling de log para `all` em vez de manter SSE aberto por mais de 300s na Vercel.

Para estágios isolados:
- `format` depende de `_truly_new_YYYY-MM-DD.json`; se ele não existir, tenta derivar do `curadoria-v4.4-daily-YYYY-MM-DD.json` do mesmo dia. Quando todos os itens já existem no Supabase, grava `_formatted_YYYY-MM-DD.json` vazio e fresco para deixar o no-op explícito.
- `publish` depende de `_formatted_YYYY-MM-DD.json` fresco. Se o arquivo formatado for anterior ao `_truly_new` do dia, o preflight bloqueia e orienta rodar `format` novamente.
- `duplicates` usa o relatório `curadoria-v4.x` mais recente; padrões legados `v4.2` e atuais `v4.4` são aceitos.

O filtro de "truly new" usa duas fontes: o cache local `kino-posts-cache.json` e uma leitura REST do Supabase em tempo real (`posts.status=published`, `metadata.source_url/link`). Se a leitura viva falhar, o pipeline continua com o cache local e registra warning no log.

## Endpoints da cadu-api

No admin UI, o path público é same-origin: `/api/cadu/pipeline/*`. O browser envia JWT Supabase de usuário admin para o proxy Vercel, e o proxy encaminha para a cadu-api com `CADU_API_TOKEN` apenas server-side.

Na VPS, o path real da cadu-api é `/api/pipeline/*` e exige Bearer token (`CADU_API_TOKEN`). Acesso direto à VPS deve ficar restrito a operação/debug autorizado.

| Método | Path                                    | Descrição |
|--------|-----------------------------------------|-----------|
| GET    | `/api/cadu/pipeline`                     | Catálogo de stages + run ativo + histórico (últimos 20) |
| POST   | `/api/cadu/pipeline/run`                 | Inicia run. Body: `{"stage": "curator"}`. Retorna `{run_id, pid, log_path, estimated_sec}` |
| GET    | `/api/cadu/pipeline/runs`                | Lista runs (mesmo que history no GET root) |
| GET    | `/api/cadu/pipeline/:id`                 | Status de um run específico |
| POST   | `/api/cadu/pipeline/:id/stop`            | Mata subprocess (SIGTERM no grupo de processos) |
| GET    | `/api/cadu/pipeline/:id/stream`          | SSE com stdout linha-a-linha via proxy same-origin. Como `EventSource` não permite header customizado, o admin usa `kc_admin_token` contra o proxy; a VPS continua recebendo `CADU_API_TOKEN` apenas do servidor. |

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

- **SSE via Vercel proxy** depende de Node serverless com `maxDuration` configurado. Para runs muito longos, usar reconexão/log tail/export ou acesso direto à cadu-api apenas em operação/debug autorizado.
- **Sem retry automático** em caso de falha de subprocess — admin deve disparar manualmente
- **Catálogo duplicado** (Python hardcoded + JSON de docs) — alvo: ler do JSON no futuro

## Browser CDP (Chrome DevTools Protocol)

Estágios `ig`, `curator`, `duplicates` (e qualquer futuro que use Playwright/headless browser) precisam de Chrome rodando dentro do `openclaw-hahq-openclaw-1` na porta `18800`.

### Verificar status
```bash
ssh root@187.77.37.25 'docker exec openclaw-hahq-openclaw-1 python3 -c "
import socket
s = socket.socket()
s.settimeout(2)
try:
    s.connect((chr(49)+chr(50)+chr(55)+chr(46)+chr(48)+chr(46)+chr(48)+chr(46)+chr(49), 18800))
    print(\"CDP UP\")
except: print(\"CDP DOWN\")"'
```
O container NÃO tem `nc`/`netstat`/`ss` — usar Python (ou `curl http://127.0.0.1:18800/json/version`).

### Iniciar
```bash
ssh root@187.77.37.25 'docker exec openclaw-hahq-openclaw-1 openclaw browser start'
```
Resposta esperada: `🦞 browser [openclaw] running: true (headless)`.

### Auto-restart
Adicionar ao crontab do host (roda a cada 5 min):
```cron
*/5 * * * * docker exec openclaw-hahq-openclaw-1 sh -c "echo Q | nc -w 1 127.0.0.1 18800 2>/dev/null || openclaw browser start"
```
(Detalhe: `nc` não está no container; usar Python via wrapper script.)

### Bug conhecido do scanner IG (Chrome 149+)
Antes da v4.4.3, `scripts/scan-ig-browser.js` filtrava `!t.url.startsWith('chrome://')` ao listar pages — Chrome 149 só abre `chrome://newtab/`, então scanner abortava com `❌ Nenhuma página aberta no browser.`

**Fix (v4.4.3)**: aceita `chrome://newtab/` como starting point (o scanner navega pra URL real via `Page.navigate`). Localizado em `scripts/scan-ig-browser.js` linhas 580-595.

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
