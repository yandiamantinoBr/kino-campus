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

## Fechamento

Esta rodada confirma que a base atual da v11 esta regressivamente verde para entrar no fechamento final da rodada principal.

Os metadados finais de PR, preview e producao desta iteracao devem ser registrados no closeout documental apos merge e deploy.
