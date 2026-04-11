# v11.23.0 Release Gate - QA Run 1

| Campo | Valor |
|---|---|
| Data | 11 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Branch de trabalho | `codex/v11-23-0-release-gate` |
| Objetivo | fechar o release gate final da rodada principal da v11 sem abrir refactor novo |

## Escopo

- regressao completa da base
- hygiene check do frontend canonico
- smoke remoto do dominio publico
- consolidacao dos residuals do Supabase Advisor
- endurecimento do teste de analytics para o contrato atual de cache/SWR

## Ajustes aplicados nesta rodada

- `tests/post-analytics.test.js`: invalida o cache de analytics no `beforeEach` e usa `force: true` nos asserts que precisam verificar o driver ativo, evitando falso positivo ou negativo causado pela hidratacao de sessao introduzida em iteracoes anteriores.
- `package.json`: metadata alinhada ao estado real da base, removendo a referencia antiga a `V8.2.x`.
- `docs/qa/README.md`: mapa de QA reescrito em formato limpo e legivel.

## Comandos executados

```bash
npx jest --runInBand
node scripts/hygiene-check.js
git diff --check
```

## Resultado da regressao

- suites Jest: `51/51` aprovadas
- testes individuais: `530/530` aprovados
- `scripts/hygiene-check.js`: aprovado
- `git diff --check`: aprovado apos os ajustes desta rodada

## Smoke remoto

Validacao por HTTP da producao publicada:

- `/` -> `200 OK`
- `/compra-venda-feed.html` -> marcador esperado presente
- `/moradia.html` -> marcador esperado presente
- `/ajuda.html` -> marcador esperado presente

Observacao operacional:

- o Playwright MCP local continua bloqueado nesta maquina por `EPERM` ao tentar criar `C:\Windows\System32\.playwright-mcp`
- por isso, esta rodada usou smoke HTTP e fetch remoto como fallback de release gate

## Supabase Advisor - residuals aceitos nesta fase

### Security

- `extension_in_public` para `unaccent`
- `auth_leaked_password_protection` desabilitado
- `rls_enabled_no_policy` nas tabelas privadas:
  - `public.notification_delivery_attempts`
  - `public.notification_delivery_outbox`
  - `public.notification_dispatch_runs`
  - `public.notification_dispatch_runtime`

Justificativa:

- essas tabelas fazem parte da trilha privada de dispatch/outbox e nao devem expor policies para `anon` ou `authenticated`
- o acesso operacional esperado continua restrito a service role e runtime controlado

### Performance

- residuals de `unused_index` mantidos para revisao futura separada
- `duplicate_index` em `public.posts` permanece documentado para revisao segura posterior, sem acao destrutiva dentro deste release gate

## Drift ainda conhecido

- a linha funcional e documental do projeto esta em `v11`, mas o runtime canonico do frontend continua explicitamente mapeado em `8.6.0`
- esse estado foi preservado nesta fase para nao introduzir um version bump parcial de alto risco no fechamento da rodada

## PR e deploys

- PR funcional: `#280`
- commit funcional: `441af25`
- merge squash na base: `6bc3897`
- preview validado: `dpl_DucDMJtPmLg7TS78UnVQVX4LHWiU` (`kino-campus-git-codex-v11-23-0-r-29a5cf-yannakamurabrs-projects.vercel.app`)
- deployment pos-merge da base: `dpl_EF3gzc3MLEbGkLpS2CRdopuHo2cb` (`kino-campus-git-kinocampus-v110-a67b39-yannakamurabrs-projects.vercel.app`)
- deploy de producao validado: `dpl_HPMAUgYe6kcoHBDh9vjp54mYg4VA` (`www.kinocampus.com.br`)

## Fechamento

Esta rodada fecha o release gate final da rodada principal da v11 com a base regressivamente verde, metadata de QA atualizada e evidencias remotas registradas.

A proxima iteracao formal passa a ser `v11.24.0`, em modo planejamento-only para i18n, acessibilidade e UX Writing.
