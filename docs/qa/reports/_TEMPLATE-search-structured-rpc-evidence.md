# Evidência isolada — RPC de busca estruturada V76

**Candidato:** `public.kc_search_posts_structured_v1`
**Data:** `YYYY-MM-DD`
**Responsável:** `<redigido>`
**Ambiente:** `<banco local descartável; nunca produção>`

## 1. Pré-condições

| Item | Valor/evidência |
|---|---|
| Docker engine ativo | `<sim/não>` |
| Supabase CLI | `<versão>` |
| PostgreSQL `server_version` | `<valor>` |
| Migrations aplicadas | `<132/132 ou nova contagem canônica>` |
| Dataset sintético | `<hash, gerador, 10k/50k>` |
| Nenhum dado real | `<confirmado>` |
| Baseline legado salvo | `<caminho redigido>` |

## 2. Catálogo e privilégios

Anexar saídas redigidas de `pg_proc`, `pg_namespace`, `pg_class`, `pg_policy`,
`pg_indexes` e `aclexplode(proacl)` para o RPC legado e o candidato.

| Invariante | Resultado |
|---|---|
| candidato `prosecdef=false` | `<pass/fail>` |
| `proconfig` contém `search_path=` vazio | `<pass/fail>` |
| PUBLIC sem EXECUTE | `<pass/fail>` |
| anon/auth somente no wrapper | `<pass/fail>` |
| core privado não exposto | `<pass/fail>` |
| RLS ativa em `public.posts` | `<pass/fail>` |

## 3. Matriz RLS

| Ator/caso | Direto em posts | RPC legado | RPC candidato | Paridade |
|---|---:|---:|---:|---:|
| anon / published public | | | | |
| anon / published community | | | | |
| anon / pending public | | | | |
| authenticated terceiro / published public | | | | |
| authenticated terceiro / published community | | | | |
| authenticated terceiro / hidden | | | | |
| autor / própria hidden community | | | | |
| admin / hidden de terceiro | | | | |

## 4. Exatidão e compatibilidade

| Prova | Resultado | Evidência |
|---|---|---|
| consultas legadas idênticas | `<n/n>` | |
| acento/sem acento | `<pass/fail>` | |
| typo por trigram | `<pass/fail>` | |
| filtros schema-aware | `<n/n>` | |
| chaves/operadores inválidos falham fechados | `<n/n>` | |
| campos proibidos rejeitados | `<n/n>` | |
| payload sem eco de diagnóstico | `<pass/fail>` | |

## 5. Planos e latência

Anexar o JSON integral, sem dados pessoais, de cada
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

| Dataset/caso | RPC | p50 | p95 | p99 | buffers | rows removed | timeout | plano/índice |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 10k texto | legado | | | | | | | |
| 10k texto | candidato | | | | | | | |
| 50k texto | legado | | | | | | | |
| 50k estruturado seletivo | candidato | | | | | | | |
| 50k estruturado combinado | candidato | | | | | | | |

Timeouts obrigatórios: `statement_timeout=1500ms`, `lock_timeout=500ms` e
`idle_in_transaction_session_timeout=10s`.

## 6. Índice candidato (se necessário)

| Campo | Valor |
|---|---|
| hipótese comprovada pelo plano | |
| DDL exato | |
| predicado parcial igual à query | |
| tamanho | |
| tempo de criação | |
| bloqueios | |
| ganho p95/buffers | |
| custo de escrita | |
| decisão | `<manter/rejeitar>` |

## 7. Rollback R3

| Passo | Resultado |
|---|---|
| canário/flag volta ao legado | |
| EXECUTE do candidato revogado | |
| wrapper/core removidos | |
| índices exclusivos removidos | |
| RPC legado preservado | |
| matriz RLS repetida | |
| baseline legado idêntico | |
| objetos candidatos ausentes | |
| Rollback R3 executado | `<sim/não>` |

## 8. Decisão

`<Go para redigir migration / No-Go / Bloqueado>`

Motivo: `<evidência objetiva>`

Não anexar tokens, connection strings, project refs, IDs reais, consultas reais ou dumps.
