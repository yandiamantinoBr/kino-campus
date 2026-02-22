# Relatório QA — RLS Smoke (`docs/qa/rls-smoke.sql`)

- Data/hora (UTC): 2026-02-22
- Ambiente alvo: Supabase projeto `wacyrkwhkvzwkqpolrbg`
- Origem do roteiro: `docs/qa/rls-smoke.sql`

## Resultado geral

Execução **BLOQUEADA** por falta de autenticação no Supabase Dashboard (redirecionamento para tela de login), impedindo abrir o SQL Editor e rodar os testes 1, 2 e 3 no ambiente alvo.

## Evidências visuais

- `RLS-01-test1.png`
- `RLS-02-test2.png`
- `RLS-03-test3.png`

> As três capturas mostram o mesmo bloqueio: página `.../dashboard/sign-in?returnTo=/project/wacyrkwhkvzwkqpolrbg/sql/new`.

## Registro por teste

| Teste | Query prevista (roteiro) | Query executada | Resultado observado | Interpretação | Evidência |
|---|---|---|---|---|---|
| 1 — reports anon select | `select id, post_id, reporter_id, reason, status, created_at from public.reports limit 20;` | Não executada (SQL Editor inacessível) | Redirecionado para login do Supabase | **BLOQUEADO** (sem execução, sem PASSA/FALHA) | `RLS-01-test1.png` |
| 2 — posts.author_id update | `update public.posts set author_id = '<OUTRO_UUID>'::uuid where id = '<POST_ID_REAL>'::uuid;` + verificação `select` | Não executada (SQL Editor inacessível) | Redirecionado para login do Supabase | **BLOQUEADO** (sem execução, sem PASSA/FALHA) | `RLS-02-test2.png` |
| 3 — profiles insert mismatched id | `insert into public.profiles (id, name, email) values ('UUID_EXTERNO'::uuid, 'Ataque Smoke', 'ataque-smoke@exemplo.com');` + verificação `select` | Não executada (SQL Editor inacessível) | Redirecionado para login do Supabase | **BLOQUEADO** (sem execução, sem PASSA/FALHA) | `RLS-03-test3.png` |

## Critério de bloqueador de segurança

Não foi possível avaliar os critérios de BLOQUEADOR de segurança (ação indevida permitida), pois nenhum teste pôde ser executado no banco alvo sem autenticação.
