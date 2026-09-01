# Sincronização automática do workspace kino-campus (VPS)

## Contexto

O checkout `/docker/openclaw-hahq/data/.openclaw/workspace/kino-campus` é o
runtime do pipeline (`node data/.openclaw/workspace/scripts/pipeline-kino.js`
roda com cwd nesse diretório). Em 2026-09-01 ele estava 6 semanas atrás da
`main` — o que produziu o bug de imagens quebradas no feed (galerias com URLs
externas 404 persistidas por um pipeline antigo) e WIP local não versionado.

## Mecanismo (2026-09-01)

`scripts/refresh-kino-workspace.sh` (instalado como
`/usr/local/bin/refresh-kino-workspace.sh` pelo deployer) roda via cron
`7,37 * * * *` e:

1. Pula a janela se um run ou deploy detém o `flock` global
   (`/data/cadu-pipeline-runtime/runtime.lock`) ou se o log mais recente tem
   menos de 300s.
2. `git fetch origin main`; se já está igual e a árvore está limpa, no-op.
3. WIP local (modificações/não rastreados) vai para
   `backup/vps-wip-auto-<data>` — nunca é descartado.
4. Fast-forward para `origin/main` (divergência é auto-curada alinhando o
   branch; o histórico fica na branch de backup).
5. Validação pós-sync: todos os `stage.script` de
   `pipeline/PIPELINE_STAGES.json` existem + `node --check` do
   `pipeline-kino.js` + `sources.json` parseia. Falhou ⇒ `git reset --hard`
   para o HEAD anterior e log de ERROR.

## Segurança

- O deployer (`git-sync.sh`) flocks o mesmo `runtime.lock` — o sync nunca
  corre durante uma transação de deploy.
- A janela é de segundos; um run que inicie nesse instante recebe o erro 75
  padronizado ("lock global ocupado") e é reexecutado depois.
- A linha de cron é revisada pelo `host_maintenance_cron_is_ready` (drift de
  cron gerenciado quebra o readiness, então o mecanismo não pode apodrecer
  silenciosamente).

## Rollback

- Estado WIP pré-sync: branch `backup/vps-wip-20260901` (backup manual) e
  `backup/vps-wip-auto-*` (backups automáticos diários).
- Workspace: `git checkout backup/... && git checkout codex/vps-kino-sync-2026-07-20
  && git reset --hard <sha-antigo>`.
