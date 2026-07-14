# Auditoria histórica de risco — desenho substituído da revisão institucional

Data: 2026-07-14

Escopo histórico: primeiro desenho de `action = review`, do handler
`cadu-publish` até `public.posts`

Decisão naquele desenho: **NO-GO**

Status atual: **SUBSTITUÍDO; não descreve a implementação vigente**

> **Addendum de resolução (2026-07-14):** os bloqueadores abaixo levaram à
> remoção integral da revisão de `public.posts`. O desenho vigente usa a fila
> tipada `public.cadu_institutional_source_reviews` e as RPCs transacionais
> `kc_create_institutional_source_review`/
> `kc_resolve_institutional_source_review`, com RLS, acesso direto revogado,
> envelope imutável, locks por chave/fonte/solicitante, limite próprio,
> auditoria atômica e feature flag desabilitada por padrão. As provas locais de
> replay, concorrência, limite, resolução e isolamento de `posts` passaram. O
> contrato vigente está em
> `docs/ops/cadu-institutional-source-review-contract-2026-07-14.md`.

## Resumo executivo do desenho rejeitado

O fluxo acerta a proteção mais importante: a linha marcada com
`INSTITUTIONAL_SOURCE_REVIEW` não pode ser promovida para `published` no próprio
registro. A restrição, o gatilho e os dois índices parciais também bloqueiam a
repetição ativa da mesma chave ou da mesma fonte.

Entretanto, o fluxo reutiliza duas abstrações de publicação para um objeto que
é editorialmente diferente de uma publicação:

1. a revisão é gravada em `public.posts`, portanto participa do flood global de
   posts;
2. a revisão usa `metadata.source_id` e o mesmo `findExisting()` da publicação
   normal, portanto ocupa o espaço de deduplicação de todo conteúdo daquela
   fonte institucional.

O resultado é contraditório: em execução sequencial, a revisão pendente bloqueia
uma publicação normal da fonte; em execução concorrente, o banco permite que a
revisão e a publicação normal sejam inseridas juntas, pois os índices únicos
cobrem somente linhas marcadas como revisão. Não há uma transição atômica de
aprovação que crie outra publicação e resolva a revisão sem promover a própria
linha.

## Achados priorizados

### P1 — bloqueador: revisão e publicação normal compartilham o domínio de deduplicação

Evidências:

- `institutionalReviewItem()` usa o identificador canônico da fonte como
  `sourceId` e a URL raiz como `sourceUrl`;
- `mapItemToPost()` grava esses valores em `metadata.source_id` e
  `metadata.source_url`;
- `handlePublish()` chama `findExisting()` antes de inserir e esse helper busca
  qualquer post não excluído do mesmo autor com o mesmo `source_id` ou
  `source_url`, sem distinguir a política;
- o coletor atual atribui `source.id` a `sourceId` nos itens descobertos em
  `services/cadu-ufg-publisher/src/runner.js` e `extractors.js`;
- os índices `posts_cadu_review_active_*` só incluem linhas cujo
  `review_policy_code` é `INSTITUTIONAL_SOURCE_REVIEW`.

Consequências:

- uma revisão pendente de `web.ufg.portal` faz a publicação normal retornar
  `DUPLICATE` quando o item também traz esse `source_id`;
- uma publicação existente da mesma fonte impede criar a revisão institucional;
- excluir logicamente a revisão e depois publicar exige duas requisições e abre
  uma janela de corrida;
- se `review` e `publish` passarem pelos respectivos prechecks ao mesmo tempo,
  ambos podem ser inseridos: não existe unicidade cruzada no banco;
- o comportamento sequencial é excessivamente restritivo, enquanto o
  comportamento concorrente é permissivo demais.

Correção exigida:

- não usar o identificador do catálogo como identidade de conteúdo. Manter um
  campo explícito `registry_source_id` para a fonte e uma identidade de conteúdo
  separada (`content_id`/URL canônica da matéria/hash versionado) para publicação;
- fazer a consulta de replay da revisão exigir também a política e conferir os
  valores persistidos;
- fazer a deduplicação de publicação excluir linhas de revisão e usar somente a
  identidade do conteúdo;
- preferencialmente mover a fila para uma tabela tipada
  `cadu_institutional_reviews`. Se a revisão permanecer em `posts`, criar uma RPC
  transacional de aprovação que insira uma **nova** publicação e resolva a
  revisão no mesmo commit; nunca atualizar a revisão para `published`.

### P1 — bloqueador: a revisão consome e pode travar o flood de publicações

`public.kc_anti_spam_gate()` executa `kc_compute_post_flood_check()` antes de
consultar se o autor é um publisher confiável. O cálculo conta todas as linhas
recentes de `public.posts` do autor/módulo, sem filtro por `status`,
`review_policy_code` ou `cadu_published`.

Como a revisão é sempre mapeada para o módulo `oportunidades`:

- cada revisão pendente consome uma vaga da mesma janela usada pela pipeline de
  publicação em oportunidades;
- uma revisão marcada depois como `deleted` continua contando até a janela
  expirar;
- no fallback de banco (`3` posts em `60` minutos), três revisões bloqueiam a
  quarta revisão e também uma publicação normal;
- limites maiores reduzem a frequência, mas não corrigem o acoplamento. Um lote
  de revisões ainda pode consumir a janela operacional do Cadu.

Correção exigida:

- revisão institucional autenticada deve ter limite próprio, e não entrar no
  contador de publicação;
- se a fila continuar em `posts`, o gatilho só pode desviar do flood normal
  quando **simultaneamente** o autor estiver na allowlist, a política for exata,
  o status solicitado for `pending` e a identidade mínima for válida;
- o cálculo de flood normal deve excluir as linhas de revisão. A fila deve ter
  um rate limit próprio e índices únicos, para que essa exceção não vire bypass
  de spam para usuários comuns;
- adicionar teste de concorrência real com duas conexões; o contador atual é um
  `count(*)` sem serialização e não garante um teto estrito para inserções
  simultâneas de fontes diferentes.

### P1 — bloqueador: não existe transição editorial atômica e auditável

O contrato diz corretamente que a aprovação deve criar uma publicação normal
separada. Contudo, não há ação/RPC que faça isso. O único caminho implícito é:

1. alterar a revisão para `deleted`;
2. enviar depois uma publicação normal.

Esse fluxo não é atômico, não vincula a publicação à revisão aprovada e pode
falhar no segundo passo — inclusive pelo flood que ainda conta a revisão
excluída. Também é possível um retry recriar a revisão no intervalo.

Correção exigida:

- modelar estados editoriais explícitos: `pending`, `approved`, `rejected` e
  `superseded`;
- preservar para sempre a chave idempotente e o resultado terminal;
- em uma RPC transacional, bloquear a revisão (`FOR UPDATE`), conferir estado e
  revisão canônica, inserir a linha normal, registrar `published_post_id`, mudar
  o estado da revisão e inserir auditoria;
- se uploads de mídia não puderem participar da transação, criar primeiro a
  publicação/outbox de mídia no mesmo commit e processar a mídia depois de modo
  idempotente. A falha de mídia não deve reabrir nem promover a revisão.

### P1 — integridade: o banco aceita marcador incompleto e permite mutações de identidade

A `CHECK` nova exige apenas status, `cadu_published`, `review_intent` e
`content_kind`. Ela não exige `author_id`, chave idempotente, `source_id`, URLs,
hashes ou tipos JSON válidos. Como índices únicos do PostgreSQL aceitam vários
`NULL`, uma inserção privilegiada fora do handler pode criar revisões marcadas
sem identidade e fora da unicidade efetiva.

O gatilho de update protege alguns campos, mas não protege:

- `author_id` (nem faz parte do `UPDATE OF` do gatilho);
- `instagram_handle`, `registry_tier`, `registry_category`, `registry_note`;
- nome/título/descrição, `review_origin`, `review_state` e `cadu_review`;
- a transição inversa `deleted -> pending`.

Além disso, `findReviewByIdempotencyKey()` não filtra
`review_policy_code` e o replay devolve os ecos da requisição, não uma identidade
revalidada a partir da linha persistida. Um post pendente comum com a mesma chave
ou uma revisão parcialmente editada pode ser reportado como replay válido.

Correção exigida:

- tabela tipada dedicada é a solução mais robusta;
- na solução mínima, ampliar a constraint para identidade completa, incluir
  `author_id` e todos os campos do envelope no gatilho imutável e bloquear o
  handler genérico `edit` para linhas dessa política;
- replay deve consultar política + chave e comparar a projeção persistida inteira;
- unicidade de fonte editorial deve ser global ou usar um namespace estável do
  publisher, não o `author_id` mutável. Rotação da conta do Cadu não pode criar
  outra revisão ativa da mesma fonte;
- a mesma chave deve continuar idempotente após aprovação/rejeição. Nova revisão
  exige nova revisão canônica/chave, não ressurreição da chave antiga.

### P2 — auditoria não é transacional

Após o insert, `audit()` é executado em modo fire-and-forget. A Edge Function
pode responder ou encerrar o isolate antes da gravação; uma revisão durável pode
existir sem o evento correspondente em `audit_log`.

Correção exigida: inserir revisão e auditoria na mesma RPC/transação, ou usar um
gatilho de banco. Erro de auditoria deve abortar a criação, não ser ignorado.

### P2 — ordem de implantação precisa considerar todas as migrations pendentes

Não é seguro tratar `20260714204500` isoladamente. Um `supabase db push` também
aplicará, em ordem, as migrations pendentes `20260714193000` e
`20260714204000`. A primeira altera o contrato CAS do Mapa UFG; a segunda restaura
uma dependência privada do anti-spam em bancos V76 novos. O backend da VPS deve
ser compatível com o CAS novo antes de qualquer push que alcance essas migrations.

Também não se deve presumir atomicidade se os arquivos forem enviados por
`psql` statement a statement. As migrations `193000` e `204000` têm
`BEGIN/COMMIT` explícitos; `204500` não. Usar o runner padronizado e validar seu
comportamento transacional, ou colocar a migration corretiva completa em uma
transação explícita.

## Proteções que funcionaram

- a constraint aceita apenas `pending`/`deleted` para a política;
- o gatilho rejeita promoção in-place para `published`;
- a chave idempotente ativa e a fonte ativa têm índices únicos parciais;
- retry concorrente idêntico pode convergir para a linha vencedora;
- a Edge exige JWT válido e conta em `kc_trusted_publishers` antes do handler;
- RLS de `posts` não expõe uma linha `pending` ao papel `anon`; somente autor e
  administrador a enxergam entre usuários autenticados;
- a ação não processa imagens e declara `published: false`.

Essas proteções devem ser preservadas na correção.

## Rehearsal e testes executados

Na stack Supabase local foi feita uma prova controlada das invariantes e depois
uma limpeza explícita. O pós-check confirmou `0` posts/perfis/publishers de teste
e ausência dos objetos temporariamente aplicados. Observações verificadas:

| Cenário | Resultado observado |
| --- | --- |
| Mesmo autor + mesma chave de revisão ativa | bloqueado por unicidade |
| Mesmo autor + mesma fonte de revisão ativa | bloqueado por unicidade |
| Atualizar a própria revisão para `published` | bloqueado pelo gatilho |
| Revisão pendente no cálculo de flood | contada |
| Revisão `deleted` no cálculo de flood | continuou contada |
| `deleted -> pending` | permitido |
| Publicação normal concorrente com mesmo `source_id` | permitida pelo banco |
| Marcador de revisão sem chave/fonte/hashes | permitido pela constraint |
| Alterar Instagram após insert | permitido |
| Alterar `author_id` da revisão | permitido pelo banco/gatilho |

Testes automatizados:

- `deno test supabase/functions/cadu-publish/review_test.ts`: **3/3**;
- Jest focal (`cadu-trusted-publisher-contract` + helper restore): **28/28**;
- `supabase db lint --local --level warning`: **sem erros de schema**.

Os testes existentes passam porque validam forma, parsing e presença textual das
proteções. Eles não exercitam o conflito entre classes, a mutabilidade completa,
o flood nem uma aprovação transacional.

## Plano de correção e implantação proposto na auditoria histórica

### Etapa 1 — corrigir o modelo e cobrir concorrência

1. Escolher a tabela dedicada de revisões como desenho preferencial. Se a
   decisão for manter `posts`, documentar a dívida e implementar todas as
   separações mínimas descritas acima.
2. Criar testes SQL com duas sessões para:
   - retry idêntico;
   - duas revisões da mesma fonte por contas confiáveis diferentes;
   - review e publish simultâneos;
   - aprovação simultânea/repetida;
   - flood de revisão separado do flood de publicação.
3. Fazer reset completo do banco local a partir da baseline e executar todas as
   migrations, não somente aplicar deltas sobre a stack existente.
4. Testar RLS como `anon`, `authenticated` comum, Cadu e admin. Lembrar que, em
   PostgreSQL/RLS, `UPDATE` também depende de política `SELECT` compatível.

### Etapa 2 — preparar release reversível

1. Manter a feature de revisão desligada por flag.
2. Garantir que o backend do Mapa UFG já implementa o CAS da migration `193000`.
3. Aplicar as migrations de banco pelo runner oficial e verificar:
   constraints, gatilhos, funções, grants, RLS, índices e ausência de duplicatas.
4. Não fazer down-migration depois que existirem revisões; rollback de aplicação
   deve manter o schema forward-compatible.

### Etapa 3 — publicar de dentro para fora

1. Banco/migrations corrigidas.
2. Edge Function `cadu-publish`, ainda com a flag desabilitada.
3. `cadu-api` na VPS, com revalidação canônica e interpretação estrita de
   `PENDING`; testar contrato inválido/capability probe sem gravar conteúdo.
4. Proxy e frontend Vercel por último.
5. Habilitar a flag somente após smoke tests de leitura, health e rejeição
   fail-closed.

Rollback de aplicação: desabilitar a flag, voltar frontend/proxy, voltar
`cadu-api` e só então voltar a Edge. Manter as migrations e dados.

### Etapa 4 — smoke funcional sem publicar conteúdo real

- validar `401/403/422` para envelopes inválidos;
- validar que falha da Edge nunca vira Telegram nem `ok: true`;
- validar uma revisão controlada apenas quando existir uma forma transacional de
  encerrá-la; confirmar replay e o mesmo `post_id`/review id;
- confirmar que o contador de publicação não mudou após a revisão;
- aprovar o item controlado pela nova ação e confirmar uma linha de publicação
  distinta, vínculo de auditoria e impossibilidade de segunda aprovação;
- confirmar que a linha original nunca teve status `published`.

## Critério de GO proposto para substituir o desenho rejeitado

O release só recebe **GO** quando todos estes itens forem verdadeiros:

- revisão não consome o flood da publicação;
- revisão e conteúdo publicado têm identidades/deduplicações separadas;
- concorrência não permite duplicata e não cria bloqueio indevido;
- aprovação é atômica, cria outra linha e é idempotente;
- envelope completo e autor são imutáveis no banco;
- replay é conferido contra a linha persistida e estados terminais são duráveis;
- auditoria faz parte da mesma transação;
- testes de RLS e duas sessões passam em banco recriado do zero;
- migrations, Edge, VPS e Vercel são implantados na ordem acima com feature flag.

## Referências consultadas

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase — changelog de breaking changes](https://supabase.com/changelog?tags=breaking-change)

Não foi encontrada mudança recente do Supabase que altere as conclusões acima;
elas decorrem das consultas, gatilhos, índices e transações presentes no próprio
repositório.
