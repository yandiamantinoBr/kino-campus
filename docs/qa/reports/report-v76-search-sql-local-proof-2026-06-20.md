# V76.45 — prova SQL local da busca estruturada

**Data:** 2026-06-20
**Ambiente:** PostgreSQL 17.10 oficial em contêiner descartável
**Dados:** exclusivamente sintéticos, 10 mil e 50 mil posts
**Decisão:** **No-Go para migration; prova local concluída**

## Resultado

O harness `tests/sql/search-structured-v1-isolated-proof.sql` executou com
`ON_ERROR_STOP`, terminou com código `0` e removeu todos os objetos candidatos. Nenhum
projeto Supabase remoto foi consultado ou alterado.

A tentativa anterior de subir a esteira canônica com `supabase start` falhou antes desta
prova: a CLI 2.105.0 ignorou migrations históricas cujos nomes não começam por timestamp e a
primeira migration timestamped aplicável,
`20260519153753_admin_product_management_audit.sql`, encontrou a relação
`public.post_media` ausente. Essa falha é um gate do repositório; o harness isolado não a
mascara e não autoriza migration.

## Segurança e exatidão

| Gate | Resultado |
|---|---|
| PostgreSQL | 17.10 (`server_version_num=170010`) |
| RLS direta × RPC legado × candidato | 8/8 casos em paridade |
| anon public/community/pending | 1/0/0, conforme esperado |
| authenticated terceiro public/community/hidden | 1/1/0 |
| autor em conteúdo próprio oculto | 1 |
| admin sintético em conteúdo oculto de terceiro | 1 |
| validações fail-closed | 6/6 |
| classes estruturadas | eventos, moradia, oportunidades, caronas, compra e venda e achados/perdidos passaram |
| acento e typo | passaram |
| campo proibido `contato` | rejeitado |
| candidato | `SECURITY INVOKER`, `search_path` vazio |
| grants | PUBLIC sem `EXECUTE`; somente `anon` e `authenticated` no wrapper |
| RLS em `public.posts` | ativa, policies separadas por papel |

O wrapper de prova ficou autocontido e não expôs um core privado. Isso reduz superfície de
grants sem mudar a exigência principal: toda leitura continuou sob RLS do chamador.

## Desempenho

Cinco amostras aquecidas por RPC foram coletadas. Os valores abaixo são da execução completa
que terminou em código `0`; tempos em milissegundos.

| Dataset | RPC | p50 | p95 | máximo | Gate p95 |
|---|---|---:|---:|---:|---|
| 10k | legado | 792,462 | 816,073 | 818,079 | referência |
| 10k | candidato sem filtro | 758,778 | 832,483 | 838,203 | +2,0%; passou (≤20%) |
| 50k | legado | 4.093,763 | 4.108,048 | 4.108,515 | referência |
| 50k | candidato sem filtro | 4.014,204 | 4.115,062 | 4.130,558 | +0,2%; passou (≤20%) |

O teto estrito de `statement_timeout=1500ms` não é compatível com o baseline de 50 mil
linhas: a consulta candidata é cancelada como esperado. O harness registra esse resultado e
volta a `60s` apenas para diagnóstico. Assim, desempenho continua sendo No-Go, embora o gate
relativo de regressão tenha passado.

## Índice candidato

Foi testado, e depois removido:

```sql
create index idx_posts_search_module_category_candidate
on public.posts(module, category)
where legacy_id is null;
```

O índice ocupou 368 kB e foi criado em 50,839 ms na rodada final.
O planner continuou escolhendo `idx_posts_fts`; o índice composto não apareceu nos planos do
predicado estruturado. A melhora aparente de uma execução isolada foi efeito de cache e não
uma hipótese comprovada. Decisão: **rejeitar**.

## Rollback R3

- `EXECUTE` do wrapper candidato revogado;
- wrapper candidato removido;
- índice exclusivo removido;
- hash da definição do RPC legado preservado;
- objetos candidatos ausentes em catálogo;
- leitura direta e RPC legado repetidos como `anon` após o rollback;
- marcador final: `candidate_migration_authorized=false`.

## Próximo gate

Antes de redigir qualquer migration de produção, é obrigatório reparar e validar a cadeia
canônica completa em banco descartável. Depois, o desenho da busca precisa evitar o scan
custoso do fallback por trigram e cumprir o timeout operacional definido. Até lá, o frontend
continua no RPC legado e os recursos locais já entregues permanecem reversíveis.

## Regressão do repositório

- `npm run check:all`: 195 suites, 3.806 testes e 3 snapshots aprovados;
- `npm run benchmark:search-shadow`: 12/12 casos, recall/precision/stability iguais a 1;
- `npm run test:e2e`: 83/83 cenários Chromium aprovados;
- `git diff --check` e varredura de segredos: aprovados.
