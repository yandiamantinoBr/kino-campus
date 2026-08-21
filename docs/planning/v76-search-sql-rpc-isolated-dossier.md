# V76.41 — dossiê SQL/RPC isolado da busca estruturada

**Data:** 2026-06-20
**Escopo:** desenho verificável e prova em PostgreSQL local descartável; nenhum SQL remoto aplicado
**Decisão atual:** **Go documental / No-Go para migration**

Este documento não é uma migration, não é procedimento de deploy e não autoriza acesso
ao banco remoto. Ele transforma o registry da busca em contrato de entrada para um futuro
RPC, registra riscos do SQL atual e define as provas mínimas que precisam acontecer em um
banco descartável antes de qualquer alteração em `supabase/migrations/`.

## 1. Resultado do inventário

| Item | Evidência local | Conclusão |
|---|---|---|
| Esteira SQL | 132 arquivos em `supabase/migrations/` | fonte canônica preservada |
| RPC atual | `public.kc_search_posts_fts(text,text[],text,text,text,int)` | manter intacto durante o piloto |
| Segurança do RPC | ausência de `SECURITY DEFINER` na última definição | comportamento padrão é invoker; confirmar em `pg_proc` |
| Grants do RPC | `GRANT EXECUTE` para `anon` e `authenticated` na criação | não há `REVOKE ... FROM PUBLIC` no arquivo inicial; estado remoto deve ser consultado no banco isolado |
| RLS de posts | `posts_select_public_anon` e `posts_select_authenticated` chamam `kc_can_read_post` | RPC invoker deve continuar sujeito às policies |
| FTS | GIN funcional parcial `idx_posts_fts`, `legacy_id IS NULL` | reutilizar antes de propor índice novo |
| Metadados | não há GIN genérico de `posts.metadata` nas migrations | índice novo depende de plano e volume medidos |
| API local | apenas `public` e `graphql_public` expostos | core futuro deve ficar em schema privado |
| Tooling | Supabase CLI 2.105.0 e Docker CLI 29.4.1 | versões registradas |
| Banco local | Docker Desktop iniciado em 2026-06-20 | prova isolada executada; a cadeia canônica de migrations falhou antes do teste |
| PostgreSQL local | PostgreSQL oficial 17.10 em contêiner descartável | RLS, explain, catálogo e rollback R3 executados somente com dados sintéticos |

O helper legado `public.kc_can_read_post` é `SECURITY DEFINER` com `search_path=public`.
Ele está fora deste patch e não deve ser reescrito junto da busca. O banco isolado deve
confirmar proprietário, privilégios e resolução de nomes antes de um hardening separado.

## 2. Contrato proposto, sem implementação SQL

O artefato machine-readable é
`tests/fixtures/search-structured-rpc-contract.v1.json`. Ele deriva os seis módulos, os
grupos e os campos filtráveis de `kc-search-registry.generated.js`; não replica opções nem
taxonomias em SQL.

Desenho candidato:

```sql
-- Assinatura de desenho; NÃO executar fora do banco isolado.
private.kc_search_posts_structured_core_v1(
  p_q text,
  p_terms text[],
  p_module text,
  p_category text,
  p_subcategory text,
  p_filters jsonb,
  p_limit integer
)

public.kc_search_posts_structured_v1(
  p_q text,
  p_terms text[],
  p_module text,
  p_category text,
  p_subcategory text,
  p_filters jsonb,
  p_limit integer
) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
```

O wrapper público deve usar nomes totalmente qualificados, chamar somente o core privado e
preservar a RLS do usuário chamador. Antes de qualquer grant:

```sql
REVOKE ALL ON FUNCTION public.kc_search_posts_structured_v1(
  text, text[], text, text, text, jsonb, integer
) FROM PUBLIC;
```

Somente depois de a matriz RLS passar, um candidato de migration poderá conceder `EXECUTE`
a `anon` e `authenticated`. O core privado não recebe grant para papéis da API. O nome
versionado evita overload ambíguo no PostgREST e permite comparar com o RPC legado sem
substituí-lo.

## 3. Validação de entrada e abuso

- módulo obrigatório quando houver filtros; somente os seis IDs do snapshot;
- objetos `groups` e `fields` aceitam apenas chaves da whitelist daquele módulo;
- operador deve pertencer à classe do campo (`enum`, `set`, `boolean`, faixa, data, hora ou
  localização); texto livre não vira predicado SQL;
- chaves desconhecidas, tipos errados e operadores incompatíveis falham fechados com erro de
  argumento, sem fallback silencioso;
- sem concatenação de SQL, `EXECUTE`, nomes de coluna fornecidos pelo cliente ou JSONPath
  fornecido pelo cliente;
- limites: consulta 160 caracteres, 24 termos de 64 caracteres, JSON 8 KiB, 20 valores por
  chave e 50 resultados;
- `contato`, `link`, `link_as_cta` e atributos sensíveis permanecem proibidos;
- o retorno mantém o payload compatível com `kc_search_posts_fts`, sem ecoar consulta, plano,
  preferências ou diagnóstico interno.

## 4. Mapeamento schema-aware

| Módulo | Grupos | Campos filtráveis |
|---|---|---|
| Achados e perdidos | `status`, `tipo` | `entrega`, `localizacao`, `recompensa`, `userTags` |
| Caronas | `tipo` | `contribuicao`, `destino`, `horario`, `marcadoresCarona`, `origem`, `userTags`, `vagas` |
| Compra e venda | `categoria`, `acao` | `condicao`, `localizacao`, `preco`, `userTags` |
| Eventos | `topico` | `data`, `data_fim`, `gratuito`, `hora`, `localizacao`, `preco`, `userTags` |
| Moradia | `tipo` | `localizacao`, `marcadoresMoradia`, `orcamento`, `preco`, `regiao`, `userTags` |
| Oportunidades | `tipo` | `areaAtuacao`, `localizacao`, `modalidadeTrabalho`, `regimeContratacao`, `remuneracao`, `userTags` |

O RPC não deve receber os labels como verdade de banco. Chaves canônicas são comparadas com
os paths já declarados no registry. Faixas numéricas e datas precisam de parsing tipado e
comparação, nunca `ILIKE` sobre JSON serializado. Campos indexáveis entram no documento FTS;
campos apenas filtráveis não entram automaticamente no índice textual.

`userTags` representa somente as tags adicionais livres da publicação. O filtro deve comparar
as chaves canônicas derivadas (`metadata.userTagKeys`), sem substituir ou ampliar a taxonomia
automática de categorias e tipos e sem transformar uma busca isolada em preferência de conta.

## 5. Matriz RLS obrigatória

O teste é feito com usuários sintéticos e posts sintéticos, alternando claims/roles. Não usar
IDs, textos ou dumps reais.

| Ator | Linha | Esperado |
|---|---|---|
| anon | published + public | visível |
| anon | published + community | invisível |
| anon | pending + public | invisível |
| authenticated não autor | published + public/community | visível |
| authenticated não autor | hidden | invisível |
| autor | própria linha hidden/community | visível |
| admin sintético | linha hidden de terceiro | visível |

Cada caso executa o RPC legado e o candidato. O candidato não pode ampliar o conjunto que a
consulta direta a `public.posts` permite sob o mesmo papel. Também devem ser inspecionados
`relrowsecurity`, `prosecdef`, `proconfig`, proprietário e `aclexplode(proacl)`.

## 6. Plano de execução isolada

Pré-condições:

1. Docker Desktop engine ativo e sem projeto Supabase de produção ligado ao diretório.
2. Banco local descartável criado pela CLI e todas as 132 migrations aplicadas.
3. `SHOW server_version` e `SHOW server_version_num` anexados à evidência.
4. Dataset sintético pequeno para exatidão e dataset sintético escalado (10k e 50k posts)
   para planos; nenhuma informação real.
5. Baseline do RPC legado salvo antes de criar objetos candidatos.

Sessão de prova:

```sql
BEGIN;
SET LOCAL statement_timeout = '1500ms';
SET LOCAL lock_timeout = '500ms';
SET LOCAL idle_in_transaction_session_timeout = '10s';
-- criar somente objetos candidatos versionados no banco descartável;
-- executar paridade, matriz RLS e EXPLAIN;
ROLLBACK;
```

Índices `CONCURRENTLY` não podem ser criados dentro dessa transação. Um índice candidato só
pode ir para uma rodada separada, ainda descartável, depois que o plano sem índice provar a
necessidade. A evidência deve registrar DDL, tamanho, tempo de criação, bloqueios e plano antes
e depois.

## 7. EXPLAIN e critérios de desempenho

Executar `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` para:

- texto exato, com e sem acento;
- typo atendido por `pg_trgm`;
- módulo + grupo categórico seletivo;
- cada classe de campo (enum/set/boolean/número/data/hora/localização);
- filtros combinados e zero resultados;
- anon, authenticated e autor, pois RLS pode alterar o plano;
- 10k e 50k linhas, com distribuição documentada.

Go exige zero timeout, zero ampliação RLS, paridade total nas consultas legadas, 100% do corpus
estruturado esperado e p95 do candidato no máximo 20% acima do legado para consultas sem filtro.
Para consultas seletivas em 50k linhas, o plano não pode remover mais de 80% das linhas somente
depois de um scan completo. Esse critério não obriga índice em tabela pequena: a escolha do
planner prevalece e deve ser justificada por buffers/linhas reais.

## 8. Índices: decisão adiada por evidência

O GIN `idx_posts_fts` já cobre o documento textual e deve ser testado primeiro. Não criar GIN
genérico sobre `metadata`. Se uma classe de filtro falhar no gate, comparar nesta ordem:

1. expressão B-tree parcial para igualdade/faixa realmente seletiva;
2. índice composto começando por predicados usados em conjunto (`module`, visibilidade/status);
3. GIN somente para arrays/containment com operador compatível;
4. nenhuma mudança se o ganho não superar custo de escrita/tamanho.

Toda proposta precisa repetir exatamente o predicado parcial usado pela consulta. O advisor de
índice é sinal, não autorização.

## 9. Rollback R3

Antes de qualquer migration candidata:

1. manter `public.kc_search_posts_fts` e a chamada atual de `KCAPI.searchPosts` intactos;
2. manter as flags `search.structuredRuntime` e `search.structuredPilot` desligadas;
3. revogar `EXECUTE` do RPC novo e invalidar o cache de schema do PostgREST;
4. direcionar canário ao RPC legado sem deploy de dados;
5. remover wrapper/core versionados e somente os índices criados por essa rodada;
6. executar novamente a matriz RLS e o hash do baseline legado;
7. confirmar ausência dos objetos candidatos em `pg_proc`/`pg_indexes`.

Se existir índice `CONCURRENTLY`, seu drop é um passo operacional separado e não entra em uma
transação de migration. Dados pessoais nunca fazem parte deste candidato; portanto o rollback
não depende de restaurar perfil ou eventos comportamentais.

## 10. Gates Go/No-Go

| Gate | Estado em 2026-06-20 |
|---|---|
| Contrato registry/RPC versionado | passou estaticamente |
| Nenhuma migration candidata no repo | passou |
| Docker/banco descartável | passou em PostgreSQL 17.10 isolado |
| 132 migrations aplicadas | falhou: nomes legados foram ignorados e `public.post_media` estava ausente na primeira migration timestamped |
| Estado real de grants/proprietário | passou apenas no catálogo sintético; remoto não consultado |
| Matriz RLS executada | passou 8/8 no harness isolado |
| Paridade legado/candidato | passou 8/8 na matriz e no corpus estruturado |
| EXPLAIN com buffers em 10k/50k | executado; timeout estrito de 1500 ms não atendido em 50k |
| Rollback R3 executado | passou; hash legado e ausência dos objetos candidatos confirmados |

Decisão: o desenho pode orientar o próximo experimento, mas SQL de produção, migration, grant,
ativação de flag e troca de RPC continuam em **No-Go**.

## 12. Adendo de execução local V76.45

O harness reproduzível está em `tests/sql/search-structured-v1-isolated-proof.sql`; a
evidência consolidada está em
`docs/qa/reports/report-v76-search-sql-local-proof-2026-06-20.md`. A execução completa usou
somente fixtures sintéticas, PostgreSQL 17.10 e papéis locais `anon`, `authenticated` e
`service_role`.

Resultados objetivos: matriz RLS 8/8, validações fail-closed 6/6, seis módulos cobertos,
acento/typo aprovados, p95 relativo sem filtro dentro do teto de 20% e rollback R3 aprovado.
O índice composto `(module, category) where legacy_id is null` foi rejeitado porque não foi
escolhido pelo planner. O gate absoluto de 1500 ms falhou em 50 mil linhas, e a cadeia
canônica de migrations não sobe do zero. Por esses dois motivos independentes, a decisão
permanece No-Go para migration.

## 13. Revalidação V76.50 (2026-06-21) — cadeia reparada, performance reafirmada

Após a V76.47 reparar a cadeia canônica de migrations (baseline consolidada que
sobe via `supabase db reset`), o harness `tests/sql/search-structured-v1-isolated-proof.sql`
foi re-executado em PostgreSQL 17 descartável puro para atualizar a decisão por
evidência. O resultado consolidou o estado dos gates:

| Gate | V76.45 (pré-reparo) | V76.50 (pós-reparo) |
|---|---|---|
| Harness termina código 0 | passou | **passou** |
| Matriz RLS 8/8 | passou | **passou** |
| Validações fail-closed 6/6 | passou | **passou** |
| Filtros estruturados + acento + typo | passou | **passou** |
| p95 candidato sem filtro vs legado (10k) | +2,0% (≤20%) | **−2,9%** (candidate p95 507ms vs legado 522ms) |
| p95 candidato sem filtro vs legado (50k) | +0,2% (≤20%) | **+1,5%** (candidate p95 2510ms vs legado 2474ms) |
| Gate de regressão p95 ≤20% | passou | **passou** |
| Rollback R3 | passou | **passou** |
| Timeout absoluto 1500ms em 50k | **falhou** | **falhou** (`migration_gate=not-met`) |
| Cadeia canônica de migrations | **falhava** (108 arquivos ignorados, `post_media` ausente) | **reparada** (V76.47, baseline consolidada) |

**Decisão atualizada:** o blocker estrutural (cadeia de migrations) foi removido
pela V76.47. Resta um único blocker independente: o **timeout absoluto de 1500ms
não é atendido em 50 mil registros**. A causa raiz confirmada é o scan sequencial
do fallback trigram sobre `fuzzy_text` (coluna calculada sem índice GIN) combinado
com a cláusula `OR` que anula o uso do índice FTS. Este é um problema de
planejamento de consulta, não de cadeia de migrations.

Portanto SQL de produção, migration candidata, grant, ativação de flag e troca de
RPC continuam em **No-Go**. O caminho para destravar (futuro) é: (1) propor um
índice GIN trigram sobre a expressão `fuzzy_text` ou eliminar o `OR` trigram do
candidato; (2) re-executar o harness confirmando timeout cumprido; (3) só então
uma migration candidata faria sentido. Nenhum banco remoto foi consultado nesta
revalidação. Evidência: `docs/qa/reports/report-v76-search-sql-revalidation-2026-06-21.md`.

## 14. Investigação do caminho de destravamento (V76.50 complementar)

Após a revalidação, foram testadas em PostgreSQL 17 descartável (50k registros)
três abordagens para cumprir o timeout absoluto de 1500ms:

1. **Coluna gerada `fuzzy_text_gen` + índice GIN trigram** — **impossível**.
   O PostgreSQL rejeita (`generation expression is not immutable`) porque a
   expressão chama `unaccent()`, função marcada como `STABLE` (não `IMMUTABLE`)
   no catálogo. Tentar declarar `kc_unaccent` como `IMMUTABLE` não contorna: o
   planner valida a volatilidade real da cadeia de chamadas.

2. **Índice GIN funcional sobre a expressão `fuzzy_text`** — **impossível**.
   Erro `functions in index expression must be marked IMMUTABLE`, mesma causa
   raiz: `unaccent` é STABLE.

3. **Consulta candidata SEM o fallback trigram (FTS puro)** — **passa folgadamente**.
   Em 50k: **344–361ms** (vs ~2510ms com o `OR` trigram). O custo vem
   exclusivamente do `OR EXISTS (word_similarity(term, fuzzy_text) >= 0.5)`,
   que força avaliação linha-a-linha porque `fuzzy_text` é calculada em CTE sem
   índice e `word_similarity()` (função) não usa índice — só o operador `%>`
   usaria, mas ele não pode ser indexado sobre a expressão (mesmo motivo do item 2).

**Conclusão técnica:** o caminho para destravar o SQL estruturado **não é um índice**
(os dois caminhos de indexação são bloqueados pela volatilidade de `unaccent`).
O caminho viável é **redesenhar a consulta candidata** para separar a busca FTS
(rápida, principal, já coberta por `idx_posts_fts`) do fallback trigram (lento):
por exemplo, executar FTS primeiro e aplicar trigram apenas como segunda passada
opcional com limite estrito, ou eliminá-lo do candidato principal. Esta é uma
mudança de desenho da função `kc_search_posts_structured_v1`, a ser proposta como
migration candidata futura após novo desenho e prova isolada — permanece em No-Go
até então. Nenhum banco remoto foi consultado.

## 11. Fontes primárias verificadas

- [Supabase — Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase — Database inspection](https://supabase.com/docs/guides/database/inspect)
- [Supabase Changelog](https://supabase.com/changelog): mudança de 28/04/2026 exige grants explícitos para novos objetos expostos.
- [PostgreSQL — Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [PostgreSQL — EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL — GIN](https://www.postgresql.org/docs/current/gin.html)
- [PostgreSQL — pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

O navegador de pesquisa retornou 403 durante esta rodada; as páginas oficiais foram consultadas
diretamente por HTTPS. Isso não altera os gates: a prova decisiva continua sendo o banco local
descartável, não documentação externa.
