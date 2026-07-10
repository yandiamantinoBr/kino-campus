# Auditoria técnica KinoCampus - Fase 10: reconciliação de schema, CI e Edge

**Data da evidência:** 2026-07-10
**Branch de trabalho:** `codex/audit-phase4-6-2026-07-09`
**Base sincronizada:** `7e524c96` (`kinocampus-V75.0-foundations`)
**Projeto Supabase observado:** `wacyrkwhkvzwkqpolrbg`
**Modo remoto:** somente leitura; sem migration, secret, deploy ou alteração de produção

> **Atualização pós-merge (2026-07-10):** a PR #641 foi incorporada como `e84d81d8` e o novo
> workflow publicou duas Edge Functions. O deploy revelou uma regressão confirmada de
> `verify_jwt` no dispatcher. O snapshot abaixo permanece como registro da evidência anterior ao
> merge; para o estado posterior e a correção, consulte
> [`technical-audit-edge-auth-regression-2026-07-10.md`](./technical-audit-edge-auth-regression-2026-07-10.md).

## 1. Síntese executiva

O repositório não reconstruía integralmente o schema usado em produção. O reset local possuía
consentimento de privacidade, mas não possuía as tabelas de localizações de caronas e metadados
de unidades. Além disso, funções já usadas pelo frontend existiam no remoto ou no baseline
histórico sem uma migration incremental equivalente.

Esta rodada reconciliou o **código versionado e o banco local**, não a produção. O resultado é:

| Área | Antes | Estado desta branch | Produção |
|---|---|---|---|
| Schema público | Reset local incompleto em relação ao runtime | 43 tabelas reconstruídas | 42 tabelas; ainda sem `privacy_consent_events` |
| Banco em CI | Sem reset, lint ou pgTAP | Reset + lint + 106 contratos pgTAP | Não alterado |
| Edge Functions | Sem type-check integral em CI | 8 entrypoints aprovados por Deno | 8 funções ativas; não redeployadas por esta branch |
| RPCs administrativas | Grants amplos herdados no reset; 7 RPCs anon no remoto | Nenhuma `kc_admin_*` executável por `anon` no reset | 7 RPCs de anúncios ainda executáveis por `anon` |
| Privacidade admin | Ausência remota virava zero aparente | Ausência é exibida como `N/D`/indisponível | Tabela/RPC de consentimento continuam ausentes |
| Deploy de Edge | Push direto podia publicar sem CI concluída | Depende de `Essential Validation` verde após push da base | Workflow novo ainda não promovido |
| Deploy Vercel | Integração Git promove push na base | Runtime alinhado em Node 24 | Continua independente da conclusão do GitHub Actions |

Não há P0 confirmado nesta etapa. Há P1 de drift remoto e de governança de deploy que não deve
ser tratado com `supabase db push` direto ou merge automático desta branch.

## 2. Estado remoto observado

### 2.1 Supabase

Consultas somente leitura em 2026-07-10 confirmaram:

- 42 tabelas base no schema `public`;
- 5.079 eventos em `privacy_analytics_events` no instante da consulta;
- ausência de `privacy_consent_events`;
- 60 linhas em `caronas_locations`, sendo 57 chaves canônicas do frontend e 3 customizadas;
- 59 linhas em `kc_unit_meta`;
- 37 RPCs públicas com prefixo `kc_admin_`;
- 7 dessas RPCs executáveis por `anon`, todas da trilha de anúncios;
- migration remota mais recente registrada: `20260703180959_harden_chat_anon_execute`;
- proteção de senhas vazadas permanece desabilitada no Supabase Auth;
- 8 Edge Functions ativas.

As 7 RPCs administrativas expostas a `anon` são:

1. `kc_admin_ad_campaign_audit(uuid)`
2. `kc_admin_ads_overview(timestamptz)`
3. `kc_admin_archive_ad_campaign(uuid)`
4. `kc_admin_get_ad_network_settings()`
5. `kc_admin_list_ad_campaigns()`
6. `kc_admin_save_ad_campaign(jsonb)`
7. `kc_admin_save_ad_network_settings(jsonb)`

Essas funções verificam admin internamente ou dependem das permissões do invocador. Não foi
demonstrado bypass. O achado é **risco confirmado de superfície excessiva**, não exploração
confirmada.

### 2.2 Vercel

O projeto `kino-campus` está configurado com Node `24.x`. O deployment de produção observado
estava `READY`, na região `gru1`, para o commit `7e524c96` da base. Isso confirma o alinhamento
da alteração de `package.json`/GitHub Actions para Node 24.

A integração Git da Vercel continua promovendo pushes na base sem aguardar o workflow
`Essential Validation`. A correção versionada nesta branch protege o deploy de Edge Functions,
mas **não transforma a Vercel em deploy pós-CI**. Branch protection e/ou configuração de
deployment checks na Vercel continuam necessárias.

## 3. Reconciliação versionada

### `20260710011442_reconcile_privacy_runtime.sql`

- cria `privacy_consent_events` de forma idempotente;
- cria índices, RLS e grants mínimos;
- recria `kc_record_privacy_consent` como `SECURITY INVOKER`;
- restringe `kc_admin_privacy_analytics` a `authenticated`/`service_role`;
- inclui analytics e consentimentos na retenção de `kc_prune_old_analytics`;
- qualifica `extensions.digest` explicitamente.

Contrato: `supabase/tests/privacy_runtime_test.sql` (20 testes).

### `20260710012022_reconcile_caronas_cadu_schema.sql`

- cria `caronas_locations` e semeia 57 chaves iguais a `KC_CONSTANTS`;
- usa `ON CONFLICT DO NOTHING`, preservando contadores e as 3 localizações customizadas remotas;
- restaura wrappers de caronas e valida chaves customizadas;
- cria `kc_unit_meta`, trigger, índice de FK e policies com `auth.uid()` avaliado uma vez;
- aplica grants por coluna em vez de escrita ampla.

Contratos:

- `supabase/tests/caronas_cadu_runtime_test.sql` (37 testes);
- `tests/contract/caronas-schema-reconciliation.test.js` compara o seed SQL com o frontend.

### `20260710012926_reconcile_runtime_rpc_helpers.sql`

- versiona helpers privados já exigidos pelas RPCs públicas;
- qualifica `extensions.similarity` e `extensions.hmac`;
- remove referências às colunas inexistentes `posts.titulo` e `posts.content`;
- corrige auditoria de revogação de convite para usar UUID válido;
- recria wrappers públicos como invocadores e reaplica ACL explícita.

Contratos:

- `supabase/tests/runtime_rpc_helpers_test.sql` (39 testes de existência, ACL e runtime);
- `tests/contract/runtime-rpc-helpers.test.js`.

### `20260710015000_harden_admin_rpc_acl_and_banner.sql`

- revoga `PUBLIC`/`anon` de todas as funções `public.kc_admin_*` existentes no momento da migration;
- preserva execução para `authenticated` e `service_role`;
- fixa `search_path` de `kc_admin_save_banner`;
- remove a leitura descartada que causava aviso do linter;
- faz update de banner inexistente falhar explicitamente, sem auditoria com ID nulo.

Contrato: `supabase/tests/admin_rpc_hardening_test.sql` (10 testes).

## 4. Edge Functions

O primeiro type-check integral encontrou 11 erros em
`kc-dispatch-notification-outbox` e 2 em `kc-help-request-notify`. A causa era o uso de
`ReturnType<typeof createClient>` sobre uma função genérica: com o SDK atual, o schema inferido
virava `never`, invalidando `.rpc()`, `.from().insert()` e `.from().update()`.

Correção controlada:

- fronteira explícita `ServiceClient` nas duas funções;
- `supabase-js` fixado em `2.105.4` apenas nelas;
- nenhum fluxo, payload, segredo ou chamada HTTP foi alterado;
- todas as 8 funções passaram em Deno 2.8.0;
- o type-check respeita o `deno.json` próprio de `kc-ga4-reports`, que ainda usa `2.45.4` via
  `esm.sh`.

Risco residual: as outras funções continuam com o intervalo flutuante
`jsr:@supabase/supabase-js@2`. A documentação oficial recomenda versões exatas e um
`deno.json` por função. A migração deve ocorrer em PR próprio porque altera o bundle de várias
funções simultaneamente.

## 5. Gates de CI e deploy

`Essential Validation` passa a ter três jobs independentes:

1. validadores, Jest e Playwright em Node 24;
2. Supabase local com CLI 2.105.0, reset completo, lint e pgTAP;
3. Deno 2.8.0, com type-check de cada Edge Function e config específica por diretório.

`Deploy Edge Functions` passa a:

- iniciar por `workflow_run` somente após `Essential Validation` verde em push da base;
- nunca publicar a partir de execução de pull request;
- fazer checkout do SHA efetivamente validado;
- validar entrada manual sem interpolá-la diretamente no shell;
- fixar Supabase CLI 2.105.0;
- falhar se `supabase link` falhar;
- rebuildar todas as funções quando `_shared` ou configuração raiz mudar;
- falhar explicitamente diante de função removida, pois exclusão remota exige operação manual;
- não fazer fallback automático para deploy de todas quando não há mudança.

As 14 referências externas `uses:` dos quatro workflows foram fixadas em SHAs oficiais. O
repositório permite ações por tags móveis (`sha_pinning_required=false`), portanto o contrato de
CI também rejeita novas referências que não terminem em um commit hexadecimal de 40 caracteres.

O contrato `tests/contract/ci-deployment-gates.test.js` protege esses invariantes. O YAML foi
validado com `actionlint 1.7.7`.

## 6. Validação final local

| Gate | Resultado |
|---|---|
| `supabase db reset --local --no-seed` | Cadeia completa aplicada do zero |
| `supabase db lint --local --level warning` | Sem erros ou avisos |
| `supabase test db --local supabase/tests` | 4 arquivos, 106 testes aprovados |
| Deno check | 8 de 8 Edge Functions aprovadas |
| `npm run check:all` | 207 suítes, 3.922 testes e 3 snapshots aprovados |
| Playwright Chromium | 85 de 85 cenários aprovados |
| `actionlint` | 0 achados |
| `npm audit --omit=dev` | 0 vulnerabilidades de produção |

O audit npm completo de devDependencies falhou duas vezes por `ECONNRESET` no endpoint do
registry. Portanto, não há conclusão nova sobre advisories de desenvolvimento nesta rodada.

## 7. Riscos e estado de decisão

| Prioridade | Estado | Item | Decisão |
|---|---|---|---|
| P1 | Confirmado | Produção não possui consent table/RPC esperadas pelo admin | Validar as migrations em branch Supabase antes de rollout |
| P1 | Confirmado | Histórico remoto não corresponde à baseline sintética local | Não usar `supabase db push` direto |
| P1 | Confirmado | Vercel promove push da base independentemente do CI | Exigir PR/checks e configurar deployment checks |
| P1 | Confirmado | Branch base sem proteção; Dependabot alerts/updates desabilitados | Ativar nas configurações após decisão operacional |
| P1 | Confirmado | Leaked password protection desabilitada | Alteração manual de Auth com teste de cadastro/reset |
| P1 | Confirmado | 7 RPCs admin executáveis por anon no remoto | Aplicar migration de ACL somente após branch testada |
| P2 | Confirmado | Seis imports Edge ainda flutuam em `@2` | Pin por função em PR e rollout graduais |
| P2 | Confirmado | Edge tem type-check, mas não testes HTTP/runtime por função | Criar testes Deno para auth, CORS, retry e idempotência |
| P2 | Provável | Vercel/Edge podem divergir após merge parcial | Registrar SHA e versão remota no checklist pós-merge |

## 8. Plano de rollout seguro

1. Criar uma branch Supabase de preview; a criação possui custo e exige confirmação do usuário.
2. Rebasear essa branch sobre a produção imediatamente antes do teste.
3. Aplicar as quatro migrations na ordem versionada, nunca o baseline sintético.
4. Executar os 106 pgTAP e repetir consultas de ACL, RLS, índices e contagens.
5. Testar admin de privacidade, caronas, Sites UFG/Cadu, busca admin, convites e banners.
6. Testar anon, authenticated, dono e admin onde aplicável.
7. Capturar definições remotas anteriores das funções substituídas para rollback auditável.
8. Promover o PR somente com GitHub checks verdes e decisão explícita sobre deploy Vercel/Edge.
9. Aplicar migrations em janela acompanhada; monitorar Postgres/API/Edge logs.
10. Validar pós-rollout sem inventar zeros de consentimento e sem perder as 3 localizações customizadas.

## 9. Limites desta fase

- nenhuma migration foi aplicada remotamente;
- nenhuma Edge Function foi publicada;
- nenhum secret foi lido, alterado ou exibido;
- nenhum deploy Vercel foi iniciado;
- nenhum container ou processo do VPS/OpenClaw foi alterado;
- a pull request permanece adequada para revisão técnica, não para merge automático.

## 10. Snapshot de governança GitHub

Consulta somente leitura em 2026-07-10:

- branch padrão `kinocampus-V75.0-foundations`: sem branch protection;
- Dependabot vulnerability alerts: desabilitado;
- Dependabot security updates: desabilitado;
- secret scanning: habilitado;
- secret scanning push protection: habilitado;
- non-provider patterns e validity checks: desabilitados;
- Actions: `allowed_actions=all`, exigência de SHA desabilitada;
- permissão padrão dos workflows: leitura; workflows não podem aprovar PRs;
- auto-merge: desabilitado.

Esta branch reduz o risco de supply chain ao fixar os SHAs no YAML. Ela não altera as
configurações externas acima.
