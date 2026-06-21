# V76.50 — revalidação SQL após reparo da cadeia de migrations

**Data:** 2026-06-21
**Branch:** `codex/v76-search-sql-revalidation`
**Ambiente:** PostgreSQL 17 oficial em contêiner descartável
**Dados:** exclusivamente sintéticos, 10 mil e 50 mil posts
**Decisão:** **No-Go para migration** (um único blocker permanece: timeout absoluto)

## Resultado

Após a V76.47 reparar a cadeia canônica de migrations (baseline consolidada que
sobe via `supabase db reset`), o harness `tests/sql/search-structured-v1-isolated-proof.sql`
foi re-executado em PostgreSQL 17 descartável puro para atualizar a decisão por
evidência. O harness terminou com código 0 e a marca final
`KC_PROOF result=pass candidate_migration_authorized=false`.

## Gates revalidados

| Gate | V76.45 (pré-reparo) | V76.50 (pós-reparo) |
|---|---|---|
| Harness termina código 0 | passou | **passou** |
| Matriz RLS 8/8 | passou | **passou** |
| Validações fail-closed | 6/6 | **6/6** |
| Filtros estruturados (6 módulos) | passou | **passou** |
| Acento e typo | passou | **passou** |
| p95 candidato vs legado (10k) | +2,0% (≤20%) | **−2,9%** (507ms vs 522ms) |
| p95 candidato vs legado (50k) | +0,2% (≤20%) | **+1,5%** (2510ms vs 2474ms) |
| Gate de regressão p95 ≤20% | passou | **passou** |
| Rollback R3 | passou | **passou** |
| Timeout absoluto 1500ms em 50k | falhou | **falhou** (`migration_gate=not-met`) |
| Cadeia canônica de migrations | falhava | **reparada** (V76.47) |

## Decisão atualizada

O blocker estrutural — a cadeia de migrations que não subia do zero — foi
**removido** pela V76.47. Resta um único blocker independente: o **timeout
absoluto de 1500ms não é atendido em 50 mil registros**.

A causa raiz, confirmada pela leitura do plano no harness, é o scan sequencial do
fallback trigram sobre `fuzzy_text` (coluna calculada por concatenação + `kc_unaccent`,
sem índice GIN) combinado com a cláusula `OR` que impede o uso do índice FTS
`idx_posts_fts`. O planner precisa avaliar `word_similarity` para cada linha, o que
força a varredura completa de `ranked`. Este é um problema de planejamento de
consulta, não de cadeia de migrations.

SQL de produção, migration candidata, grant, ativação de flag e troca de RPC
continuam em **No-Go**. O caminho para destravar (trabalho futuro, fora desta rodada):

1. propor um índice GIN trigram sobre a expressão `fuzzy_text` (expressão gerada,
   não coluna materializada) ou eliminar o `OR` trigram do candidato;
2. re-executar o harness confirmando o timeout absoluto cumprido em 50k;
3. só então uma migration candidata faria sentido, ainda em banco descartável.

## Ambiente e segurança

- PostgreSQL oficial 17 em contêiner descartável (`postgres:17`), removido ao final;
- apenas dados sintéticos (`generate_series`), nenhum dump ou ID real;
- papéis locais `anon`, `authenticated`, `service_role`;
- **nenhum projeto Supabase remoto foi consultado ou alterado**;
- o harness é autocontido e reversível (faz rollback R3 ao final).

## Rollback

Não há migration, RPC, índice ou dado a reverter — esta entrega é documental. O
dossiê `docs/planning/v76-search-sql-rpc-isolated-dossier.md` foi atualizado com a
seção 13 de revalidação; reverter este commit restaura a seção 12 como final.
