# V76.54 — consolidação Admin Cadu/OpenClaw + inventário cross‑AI

**Data:** 2026-06-27  
**Branch-base:** `kinocampus-V75.0-foundations`  
**Escopo:** consolidar alterações feitas por Codex, Z.ai Code/GLM 5.2 e MiniMax Code/Minimax 3.0; registrar funcionamento real do painel `/admin/cadu.html`, integrações com VPS/OpenClaw/cadu-api e melhorias recentes de chat/mensagens; aplicar hardening mínimo para não deixar controle administrativo exposto.

## Fontes analisadas

- Repositório local KinoCampus, especialmente commits posteriores a `4c42876` em `admin/cadu.html`, `api/cadu/*`, `assets/js/controllers/admin/admin-cadu.controller.js`, `docs/PIPELINE.md`, `pipeline/PIPELINE_STAGES.json`, chat e migrations Supabase.
- Projeto MiniMax/OpenClaw em `C:\Users\yan1n\.minimax-agent\projects\openclaw-cadu`, com histórico v0.4.2–v0.4.6 e documentação de integração.
- Servidor FastAPI local documentado em `C:\Users\yan1n\.minimax-agent\projects\cadu-api-server.py`.
- Sandboxes ZCode em `C:\Users\yan1n\ZCodeProject\kino-campus` e `C:\Users\yan1n\ZCodeProject\kc-baseline-sandbox`, principalmente artefatos SQL/prints relacionados ao chat V76.
- Mapa operacional consolidado em `docs/ops/cadu-openclaw-operational-handoff-2026-06-27.md`, criado nesta rodada para preservar conexões, envs, rotas e pendências sem registrar segredos.
- Reports já existentes:
  - `report-v76-chat-ux-improvements-2026-06-21.md`
  - `report-v76-chat-features-backend-2026-06-22.md`
  - `report-v76-migration-baseline-2026-06-21.md`
  - `report-v76-ci-playwright-2026-06-21.md`

## Resultado consolidado

O KinoCampus agora possui uma trilha administrativa real para o Cadu:

1. `/admin/cadu.html` é o painel operacional.
2. `/api/cadu/*` é a camada Vercel/serverless que isola o browser da VPS.
3. `cadu-api` na VPS Hostinger expõe endpoints FastAPI protegidos por `CADU_API_TOKEN`.
4. OpenClaw executa os scripts do pipeline dentro do container persistente.
5. Supabase continua sendo a origem de autenticação/admin e de parte da sincronização operacional.
6. `deploy-cadu-api.ps1` existe localmente como helper operacional não rastreado para deploy da cadu-api na Hostinger; ele deve continuar sem senha/token versionado.

Durante esta consolidação, também foi corrigido um problema crítico: a UI anterior dependia de token Cadu em JavaScript público e alguns proxies serverless aceitavam chamada direta sem validar a sessão admin do usuário KinoCampus. A revisão adicionou validação admin no serverless e removeu o fallback de token real do client.

## Funcionalidades Cadu/Admin registradas

### Sites UFG editáveis

- Aba de inventário de unidades/sites UFG.
- Filtros por texto, tier e status de Instagram.
- Export CSV.
- Edição de `tier` e `note`, sincronizada no backend Cadu/Supabase via `PATCH /api/cadu/sites/{unit}/meta`.
- Botões por linha para:
  - sugerir publicação no feed KinoCampus;
  - enviar contexto do site ao Cadu/OpenClaw.

### Feed coletado

- Leitura de chunks recentes da memória do Cadu (`/api/cadu/feed`).
- Paginação por limite incremental.
- Filtro local.
- Ação “Perguntar Cadu” por chunk, usando endpoint dedicado `/api/feed/{chunk_id}/ask` quando disponível, com fallback para `openclaw/agent-send`.

### Pipeline

- Catálogo de stages em `pipeline/PIPELINE_STAGES.json`:
  - `curator`, `ig`, `duplicates`, `format`, `publish`, `enrich`, `dedup`, `sigaa`, `all`.
- Execução manual por stage.
- Dedup de runs concorrentes no cadu-api.
- Stop de run.
- Histórico.
- SSE de logs ao vivo.
- Visualização de artefatos/log tail por run.
- Download de log/export JSON.
- Ação “Perguntar ao Cadu” sobre uma run.

### OpenClaw

- Aba com status consolidado do agente, sessões, Telegram/heartbeat/tarefas.
- Chat direto com Cadu Agent via `agent-send`.
- Eventos operacionais via `agent-event`.
- Logs recentes.
- Context endpoint v0.4.6: agrega sites, feed e reachability do OpenClaw.

### Notificações/admin shell

- Link de navegação para Cadu no admin.
- Sino de notificação com polling cross-tab de runs recentes.
- Polling de versão/health do cadu-api.
- Indicadores visuais de status, versão e contexto.

## Contrato de segurança aplicado nesta revisão

### Antes

- Havia fallback de token Cadu no JavaScript público.
- Havia bypass por query string e allowlist de e-mail no client.
- A autorização real em `/api/cadu/*` dependia do segredo server-side para a VPS, mas não validava necessariamente que o chamador era admin autenticado do KinoCampus.
- `cfg.caduBase` era usado sem ser definido em trechos de pipeline, o que podia quebrar ações de artefatos/log/export.
- Faltava rewrite para `/api/cadu/sites/{unit}/meta`.

### Depois

- `assets/js/controllers/admin/admin-cadu.controller.js`
  - remove fallback de token real;
  - restringe token Cadu direto a ambiente local (`localhost`/`127.0.0.1`);
  - deixa produção usando proxy Vercel `/api/cadu/*`;
  - envia JWT Supabase do admin no header `Authorization` para fetches same-origin;
  - usa `kc_admin_token` apenas nos casos em que o browser não permite header (`EventSource` e `window.open`), e somente contra o proxy same-origin;
  - remove e-mail hardcoded do client;
  - desativa bypass por query;
  - corrige chamadas de artefatos/log/export para não dependerem de `cfg.caduBase`.
- `server/cadu-auth.mjs`
  - valida `Authorization: Bearer <jwt_supabase>` ou `kc_admin_token` same-origin;
  - consulta Supabase Auth (`/auth/v1/user`);
  - autoriza por `kc_is_admin(p_user_id)` e fallback em `profiles.is_admin`;
  - não usa `service_role` no client.
- `api/cadu/sites.js`, `feed.js`, `publish.js`, `pipeline.js`, `pipeline-router.js`, `openclaw-router.js`
  - exigem admin Supabase antes de encaminhar para a VPS;
  - usam `CADU_API_TOKEN` apenas server-side;
  - removem `kc_admin_token`/`path` antes de encaminhar query para a VPS.
- `vercel.json`
  - adiciona rewrite para `/api/cadu/sites/(.+)` → `/api/cadu/sites?path=$1`.

### Observação operacional obrigatória

O token Cadu que esteve em JS público deve ser considerado exposto. A ação correta fora do repositório é rotacionar `CADU_API_TOKEN` na VPS Hostinger e na Vercel, depois invalidar qualquer deploy antigo que ainda sirva o bundle vulnerável. Este report não registra o valor do token.

## Chat/mensagens — consolidação das alterações recentes

O chat passou por duas ondas relevantes:

### V76.52 — UX sem migration

- Agrupamento de mensagens consecutivas.
- Indicador “digitando...” via Supabase Realtime broadcast efêmero.
- Microinterações: shimmer, botão “descer para o fim”, badge de não-lidas e hover states.
- Sem alteração de schema/RLS.

### V76.53 — features em produção

- Checkmarks de leitura com `chat_messages.read_at` e trigger sobre `chat_read_state`.
- Reações emoji com tabela `chat_reactions`, RLS e Realtime.
- Reply/quote com `chat_messages.reply_to_id`, preview no composer e quote clicável.
- RPCs `kc_chat_list_messages` expandidas.
- Frontend atualizado em `chat-inbox.controller.js`, adapters Supabase/local, `kc-api.chat.js`, `kc-chat.css` e cache-bust de `mensagens.html`.

## cadu-api/OpenClaw v0.4.x — pontos funcionais relevantes

Pelo material MiniMax/OpenClaw e `cadu-api-server.py`, a VPS expõe:

- `/health`
- `/api/sites` e `/api/sites/{unit_id}/meta`
- `/api/feed`, `/api/feed/{chunk_id}`, `/api/feed/{chunk_id}/ask`
- `/api/publish`
- `/api/pipeline`, `/run`, `/runs`, `/{run_id}`, `/stop`, `/stream`, `/artifacts`, `/log`, `/export`
- `/api/openclaw/status`, `/sessions`, `/messages`, `/logs`, `/heartbeat`, `/context`, `/agent-send`, `/agent-event`
- `/api/admin/redeploy`

Também foram registrados:

- reaper baseado em `Popen.poll()` para evitar falso status de processo vivo;
- SSE heartbeat;
- dedup de runs do mesmo stage;
- artefatos e exports por run;
- contexto agregado para “Perguntar Cadu”;
- suporte a Chrome DevTools Protocol na porta `18800` dentro do container OpenClaw;
- correções v0.4.6 para contexto/feed/admin redeploy e robustez do pipeline.

## Aprofundamento operacional desta rodada

Foi criado um handoff operacional específico para continuidade em `docs/ops/cadu-openclaw-operational-handoff-2026-06-27.md`. Ele registra:

- caminho UI → Vercel proxy → Supabase admin auth → cadu-api VPS → OpenClaw → Edge Function `cadu-publish`;
- conexões relevantes da VPS Hostinger (`srv1597083.hstgr.cloud` / `187.77.37.25`), containers `openclaw-hahq-cadu-api` e `openclaw-hahq-openclaw-1`, CDP `18800`, workspace `/data/.openclaw/workspace` e memória `/data/.openclaw/memory/main.sqlite`;
- variáveis por camada, sem valores reais: Vercel, cadu-api VPS, Supabase Edge Function e publisher Node legado;
- rotas operacionais da cadu-api e do proxy `/api/cadu/*`;
- runbook mínimo de validação e rollback;
- pendências priorizadas para futuras iterações.

Também foram alinhados:

- `docs/PIPELINE.md`: deixou de orientar SSE direto como fluxo normal e passou a registrar o fluxo atual via proxy same-origin autenticado por admin Supabase, mantendo acesso direto à VPS apenas para operação/debug autorizado.
- `.env.example`: lista agora os endpoints Cadu atuais (`health`, `sites`, `feed`, `publish`, `pipeline/*`, `openclaw/*`) e explicita que `CADU_API_TOKEN` nunca deve ir para o browser.
- `supabase/functions/cadu-publish/index.ts`: corrigiu o mapa de URLs geradas para posts Cadu, usando as páginas canônicas `compra-venda-feed.html` e `caronas-feed.html` em vez das rotas legadas inexistentes `compra-venda.html` e `caronas.html`.

## Pendências abertas após aprofundamento

| Prioridade | Pendência | Próximo passo |
|---|---|---|
| P0 | Rotação do `CADU_API_TOKEN` que esteve exposto em JS público antes do hardening. | Rotacionar na VPS e Vercel; invalidar deploys antigos. |
| P1 | Confirmar envs Supabase no projeto Vercel. | Garantir URL + anon/publishable key para `server/cadu-auth.mjs`. |
| P1 | Deployar/validar `cadu-publish` após correção de URLs canônicas. | `supabase functions deploy cadu-publish` e publish/check de item de teste. |
| P1 | Sincronizar catálogo de stages local e remoto. | Comparar `pipeline/PIPELINE_STAGES.json` com o dict Python da cadu-api. |
| P1 | Validar SSE de pipeline em produção. | Rodar stage curto por admin real e verificar stream, log tail e export. |
| P2 | Definir destino do publisher Node legado em `services/cadu-ufg-publisher`. | Manter como fallback ou arquivar para reduzir duplicidade operacional. |
| P2 | Adicionar testes focados para auth/proxy Cadu. | Cobrir 401 sem JWT, 403 não-admin, 200 admin e stripping de token/path. |
| P2 | Revisar CSP quando o proxy estiver estável. | Remover origem direta da VPS de `connect-src` se não houver mais uso browser direto. |

## Arquivos de código alterados nesta consolidação

- `assets/js/controllers/admin/admin-cadu.controller.js`
- `server/cadu-auth.mjs`
- `api/cadu/sites.js`
- `api/cadu/feed.js`
- `api/cadu/publish.js`
- `api/cadu/pipeline.js`
- `api/cadu/pipeline-router.js`
- `api/cadu/openclaw-router.js`
- `supabase/functions/cadu-publish/index.ts`
- `vercel.json`

## Rollback seguro

Rollback recomendado se o painel Cadu falhar após deploy:

1. Confirmar primeiro se a Vercel tem `SUPABASE_URL`/`SUPABASE_ANON_KEY` ou equivalentes publishable configurados, além de `CADU_API_URL`/`CADU_API_TOKEN`.
2. Se o problema for apenas auth admin, corrigir env ou `profiles.is_admin` antes de reverter.
3. Se for necessário reverter código:
   - reverter este patch de hardening em `api/cadu/*`, `admin-cadu.controller.js` e `vercel.json`;
   - não restaurar token Cadu no client;
   - manter a rotação do `CADU_API_TOKEN` se ele já esteve público.

## Validação executada nesta rodada

- `node --check`:
  - `server/cadu-auth.mjs`
  - `api/cadu/sites.js`
  - `api/cadu/feed.js`
  - `api/cadu/publish.js`
  - `api/cadu/pipeline.js`
  - `api/cadu/pipeline-router.js`
  - `api/cadu/openclaw-router.js`
  - `assets/js/controllers/admin/admin-cadu.controller.js`
  - `assets/js/core/kc-i18n.js`
- `deno check --node-modules-dir=auto supabase/functions/cadu-publish/index.ts`: aprovado após correção das URLs canônicas.
- `git diff --check`: aprovado.
- `npm run check:all`: aprovado.
  - `check:version`, `check:structure`, `check:scripts`, `check:routes`, `check:hygiene`, `check:search-registry`;
  - Jest: 195 suites / 3.806 testes / 3 snapshots aprovados.
- `rg` focado em código vivo confirmou ausência de mapeamento remanescente para `compra-venda.html`/`caronas.html` no `cadu-publish`, `assets/js`, `services`, `api` e `admin`; restaram apenas menções documentais explicando a correção.
- Hygiene adicional resolvida em `admin/cadu.html`: três `title` estáticos receberam `data-i18n-tooltip` e chaves novas em `kc-i18n.js`.
- Varredura focada nos arquivos tocados:
  - sem fallback de token Cadu conhecido;
  - sem `test_bypass`;
  - sem literal hexadecimal de 64 caracteres nos arquivos Cadu/Admin revisados.

Validação manual ainda recomendada após deploy:

- usuário `profiles.is_admin=true` deve conseguir abrir `/admin/cadu.html` e carregar sites/feed/pipeline/openclaw;
- usuário autenticado sem admin deve receber 403 nos endpoints `/api/cadu/*`;
- EventSource de pipeline e download de log devem funcionar via proxy same-origin.
