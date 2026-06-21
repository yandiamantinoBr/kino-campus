# V76.47 — baseline consolidada de migrations (destravar `db reset`)

**Data:** 2026-06-21
**Branch:** `codex/v76-migration-baseline`
**Escopo:** substituir a cadeia legacy de 132 migrations por uma baseline única que
sobe limpa via `supabase db reset`
**Decisão:** **Go** para `db reset` local; **bloqueio remoto mantido** (nenhum projeto
Supabase foi consultado ou alterado)

## Resultado

A cadeia canônica de migrations agora sobe do zero. `supabase db reset` em projeto
local (PostgreSQL 17.6) aplica exatamente uma migration —
`00000000000001_baseline_v76.sql` — e produz o schema completo do app: 40 tabelas,
182 funções, 119 índices, 106 policies e RLS ativa em 40 tabelas.

As 132 migrations originais (100 com prefixo `vX.Y.Z` + 24 timestamped) foram
**preservadas integralmente** em `supabase/migrations/_archive-v75/` e os três
scripts de bootstrap manuais soltos em `supabase/manual/_archive/`.

## Bloqueios estruturais eliminados

| Bloqueio (pré-V76.47) | Estado atual |
|---|---|
| 100 migrations `vX.Y.Z` ignoradas pela CLI (só aceita timestamp) | substituídas pela baseline |
| 3 tabelas base (`profiles`/`posts`/`post_media`) ausentes da cadeia | incluídas na baseline |
| ordenação lexicográfica invertendo a cronologia (2026* antes de v8*) | irrelevante (1 arquivo) |
| `config.toml` apontando `seed.sql` inexistente | `sql_paths = []`, `enabled = false` |

## Como a baseline foi gerada

1. Stack Supabase local iniciada em diretório sandbox isolado, com
   `[db.migrations] enabled = false`.
2. Bootstrap `schema-bootstrap-v8.1.2.3.sql` aplicado manualmente (cria as 3 tabelas
   base + RLS + policies). O `v8.1.2.1` foi descartado porque divergia na coluna
   `verified` de `profiles`; o `v8.1.3.3` a re-adiciona via `add column if not exists`.
3. As 132 migrations aplicadas em **ordem cronológica correta**: 100 legacy em ordem
   semver (`sort -V`: v8.1.3.3 → v9.3.5.17 → v10 → v11), depois 24 timestamped.
4. Resultado: **126/132 aplicadas com sucesso**; 6 revelaram bugs latentes de
   dependência/idempotência (overload ambíguo, dependência de ordem cruzada,
   função SQL retornando trigger, schema ausente, extensão pg_cron ausente).
5. `pg_dump --schema-only --no-owner --no-privileges --schema=public` sobre o estado
   final, limpo de cabeçalho do pg_dump.
6. Adicionadas extensões (`pgcrypto`, `unaccent`, `pg_trgm` em schema `extensions`),
   `SET check_function_bodies = false` (permite funções antes de tabelas) e
   `CREATE SCHEMA kc_private` (vazio — ver lacunas).

## As 6 migrations legacy com bugs latentes (registralas, não corrigidas)

| Migration | Falha | Razão |
|---|---|---|
| `v8.3.0.2_search_trends_period.sql` | overload ambíguo | `v8.3.0.1` já define `kc_admin_search_trends(integer)` |
| `v9.3.4.5_internal_rpc_and_notification_rls_hardening.sql` | tabela ausente | depende de `notification_delivery_attempts` (criada em `v11.20.2.0`, ordem cruzada) |
| `v9.3.4.6_security_definer_rpc_wrappers.sql` | tipo inválido | `SQL functions cannot return type trigger` |
| `v9.3.4.7_grant_anon_is_admin_helper_wrapper.sql` | schema ausente | `kc_private` não existia quando rodou |
| `v9.3.5.17_schedule_highlight_score_refresh.sql` | extensão ausente | `cron.job` requer `pg_cron` |
| `20260531180000_admin_pages_rls_perf.sql` | policy ausente | `help_requests_insert_authenticated` dependente de ordem |

## Lacunas conhecidas e deliberadas

- **Schema `kc_private` vazio:** o refactor dinâmico de `v9.3.4.6` (mover funções
  SECURITY DEFINER para `kc_private` e criar wrappers INVOKER em `public`) nunca
  completou — falha em funções que retornam `trigger`. O schema é criado vazio na
  baseline para que as 43 referências `kc_private.*` em wrappers admin não impeçam
  o reset. **3 triggers órfãos de chat** (`kc_private.kc_chat_after_message_insert`,
  `_notify`, `_after_message_update`) foram removidos da baseline porque invocavam
  funções que nunca existiram (o `kc_private` permaneceu vazio em toda a história).
  O chat funcional usa RPCs diretos em `public`, não esses triggers.
- **pg_cron:** `v9.3.5.17` agendava refresh de highlight_score via `cron.job`. Não
  entra na baseline (extensão opcional, não habilitada por padrão na stack local).

## Validação

- **`supabase db reset` (sandbox isolado):** código 0, schema completo;
- **`supabase db reset` (repositório real):** código 0, "Applying migration
  00000000000001_baseline_v76.sql" → "Finished";
- 40 tabelas públicas, incluindo `posts`, `profiles`, `post_media`,
  `search_queries`, `ad_campaigns`, `chat_messages`;
- RPC `kc_search_posts_fts` executa sem erro; `kc_can_read_post` retorna `true`
  para `published`+`public`;
- RLS ativa em `posts` com 5 policies (`posts_select_public_anon`,
  `posts_select_authenticated`, insert/update/delete);
- `npm run check:all`: 195 suites, 3.806 testes e 3 snapshots aprovados;
- `git diff --check`: sem erros de whitespace.

## Ambiente

- Supabase CLI 2.105.0 (PATH), Docker 29.5.3, PostgreSQL 17.6 (stack local).
- **Nenhum** `supabase link --linked`, `db push` ou endpoint remoto foi usado.
- O sandbox de validação ficou em diretório isolado fora do repositório e foi
  descartado após a prova.

## Rollback

1. `git revert` do commit restaura as 132 migrations em `supabase/migrations/` e
   remove a baseline;
2. restaurar `config.toml` (`sql_paths = ["./seed.sql"]`, `enabled = true`);
3. os arquivos em `_archive-v75/` e `manual/_archive/` permanecem preservados;
4. nenhuma escrita foi feita em projeto Supabase remoto, portanto não há estado
   remoto a reverter.

A cadeia legacy restaurada volta ao estado No-Go de `db reset`, mas a aplicação
em produção permanece inalterada (a baseline só afeta `db reset` local e novos
ambientes).
