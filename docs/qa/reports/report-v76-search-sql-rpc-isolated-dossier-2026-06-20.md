# Relatório V76.41 — dossiê SQL/RPC isolado da busca estruturada

**Data:** 2026-06-20
**Escopo:** contrato e gates de banco; sem migration
**Decisão:** Go documental / No-Go para migration

## Resultado

Foi criado um contrato machine-readable para o futuro
`public.kc_search_posts_structured_v1`, com core privado, nome versionado e sem overload
do RPC legado. O contrato deriva grupos e campos filtráveis do snapshot canônico dos seis
módulos, proíbe contato/link/atributos sensíveis e fixa operadores e limites de abuso.

O dossiê inventaria o SQL local atual, define matriz RLS para anon, usuário, autor e admin,
paridade com `kc_search_posts_fts`, inspeção de catálogo/privilégios, planos em 10k/50k
linhas, critérios mensuráveis e rollback R3. Nenhuma taxonomia foi copiada para uma
migration.

## Achados

- o RPC atual é invoker por padrão e usa `search_path='public'`;
- o grant inicial autoriza `anon` e `authenticated`, mas o arquivo não revoga explicitamente
  `PUBLIC`; o estado efetivo precisa ser medido no banco descartável;
- RLS final de `posts` delega leitura a `kc_can_read_post` para anon/authenticated;
- existe GIN funcional parcial para FTS, mas não GIN genérico de `posts.metadata`;
- índice adicional ficou explicitamente condicionado a `EXPLAIN (ANALYZE, BUFFERS)`.

## Evidências executadas

- contrato focado: 1 suite / 8 testes, todos passando;
- baseline completo: 190 suites / 3780 testes / 3 snapshots, todos passando;
- snapshot canônico comparado em runtime de teste;
- 132 migrations inventariadas e nenhuma contém o RPC candidato;
- Supabase CLI 2.105.0 e Docker CLI 29.4.1 identificados;
- documentação oficial Supabase/PostgreSQL revisada;
- nenhuma conexão, token, project ref, dado real ou escrita remota utilizada.

## Bloqueio honesto

O Docker Desktop engine não estava ativo e `psql` não estava no PATH. Por isso não foram
executados: aplicação das migrations, catálogo real, matriz RLS, paridade, EXPLAIN,
criação de índice ou rollback. O template
`_TEMPLATE-search-structured-rpc-evidence.md` mantém todos esses gates abertos; este
relatório não os classifica como aprovados.

## Segurança e rollback

O desenho exige `SECURITY INVOKER`, `SET search_path=''`, nomes qualificados, core em
schema privado, `REVOKE ALL ... FROM PUBLIC` e grants mínimos somente depois dos testes
RLS. O runtime e o RPC legado permanecem intactos; as duas flags seguem desligadas.

Rollback documental: remover fixture/teste/dossiê. Rollback futuro R3: voltar ao RPC
legado, revogar candidato, remover somente seus objetos/índices e repetir RLS/baseline.

## Próximo gate

PR-I pode avançar no frontend (combobox, cancelamento e performance). SQL continua em
No-Go até um banco local descartável executar integralmente o template de evidência.
