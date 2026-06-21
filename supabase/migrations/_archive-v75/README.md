# Migrations legacy V8.x–V75 (arquivadas em V76.47)

Este diretório contém as **132 migrations originais** (100 com prefixo `vX.Y.Z`
+ 24 com prefixo timestamp `2026*`) que formavam a cadeia canônica até a release
V75. Elas foram **preservadas integralmente** (nenhuma foi deletada) e movidas
para cá na V76.47 porque a cadeia não subia do zero, impedindo `supabase db reset`.

## Por que a cadeia foi substituída por uma baseline

Três bloqueios estruturais independentes tornavam a aplicação incremental
irrecuperável:

1. **Nomes não-timestamp ignorados pela CLI.** 100 das 132 migrations usavam
   prefixo semver (`v8.1.3.3`, `v9.2.0.0`, `v10.0.0.0`, `v11.23.0.0`). A CLI do
   Supabase (≥2.105.0) só reconhece prefixo timestamp (`YYYYMMDDHHMMSS_`), então
   esses 100 arquivos eram silenciosamente ignorados em todo `db reset`.

2. **Tabelas base ausentes da cadeia.** As três tabelas nucleares
   (`profiles`, `posts`, `post_media`) nunca foram criadas por nenhuma migration:
   existiam apenas em `supabase/schema-bootstrap-v8.1.2.3.sql`, um script
   manual **fora** de `migrations/`. Quando a CLI aplicava a primeira migration
   timestamped (`20260519153753_admin_product_management_audit.sql`), ela já
   falhava porque criava policies sobre `post_media` inexistente.

3. **Ordem lexicográfica invertida.** A ordenação ASCII coloca `2026*` antes de
   `v8.*`/`v9.*`, então mesmo se todos os nomes fossem aceitos, as migrations
   de 2026 executariam antes das V8, invertendo a cronologia.

Adicionalmente, ao aplicar os 132 arquivos em ordem cronológica correta sobre
um Supabase local descartável, **6 migrations** revelaram bugs latentes de
dependência/idempotência que impediam uma aplicação limpa:

| Migration | Falha |
|---|---|
| `v8.3.0.2_search_trends_period.sql` | overload ambíguo de `kc_admin_search_trends` |
| `v9.3.4.5_internal_rpc_and_notification_rls_hardening.sql` | depende de tabela criada em `v11.20.2.0` (ordem cruzada) |
| `v9.3.4.6_security_definer_rpc_wrappers.sql` | `SQL functions cannot return type trigger` |
| `v9.3.4.7_grant_anon_is_admin_helper_wrapper.sql` | schema `kc_private` inexistente |
| `v9.3.5.17_schedule_highlight_score_refresh.sql` | extensão `pg_cron` ausente |
| `20260531180000_admin_pages_rls_perf.sql` | policy dependente de ordem |

## O que as substituiu

A baseline consolidada em
`../00000000000001_baseline_v76.sql` — um único arquivo gerado a partir do
estado final do schema após aplicação ordenada do bootstrap `v8.1.2.3` + 126 das
132 migrations (as 6 acima eram patches não-essenciais ou refactors incompletos).
A baseline reproduz 40 tabelas, 182 funções, 119 índices, 106 policies e RLS em
40 tabelas, validada via `supabase db reset` em PostgreSQL 17.6 local.

## Lacunas conhecidas e deliberadas

- **Schema `kc_private` vazio:** o refactor dinâmico de `v9.3.4.6` (que moveria
  funções SECURITY DEFINER para `kc_private`) nunca completou por design — falha
  em funções que retornam `trigger`. O schema é criado vazio na baseline; 3
  triggers órfãos de chat (`kc_private.kc_chat_*`) foram removidos porque
  referenciavam funções que nunca existiram (o `kc_private` permaneceu vazio em
  toda a história do projeto). O chat usa RPCs diretos em `public`.
- **pg_cron:** `v9.3.5.17` agendava refresh de highlight_score via `cron.job`,
  extensão não habilitada por padrão na stack local. Não entra na baseline.

## Como este arquivo foi gerado

Aplicação iterativa sobre Supabase local descartável (PostgreSQL 17.6),
captura via `pg_dump --schema-only --no-owner --no-privileges --schema=public`,
limpeza de cabeçalho do pg_dump e adição de extensões/`check_function_bounds`.
Nenhum projeto Supabase remoto foi consultado ou alterado. Evidência completa
em `docs/qa/reports/report-v76-migration-baseline-2026-06-21.md`.
