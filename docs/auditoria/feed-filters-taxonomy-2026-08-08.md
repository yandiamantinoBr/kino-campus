# Auditoria de feed, filtros e taxonomia — 2026-08-08

> **Estado deste documento:** auditoria, implementação e registro de rollout. O frontend do PR #818 e o gate upstream Cadu/Edge estão em produção. As migrations `20260806090000`, `20260808152842`, `20260808152843`, `20260808152845`, `20260808152850`, `20260808152900` e `20260808225424` foram aplicadas e verificadas em produção. A reconciliação estrutural das seis superfícies e o hotfix dos filtros foram entregues pelo PR #824, merge commit `5e449dfc13eeade77e309d155f03d847b0a98e48`. A verificação pós-rollout registra **791** linhas: **134 `published`, 301 `hidden`, 341 `closed` e 15 `deleted`**; os 134 publicados estão no registry e têm as seis superfícies exatas.

## Resumo executivo

O snapshot administrativo somente leitura, reconfirmado em **2026-08-08 às 14:34:18.462341 UTC** (11:34:18 em `America/Sao_Paulo`) com o papel de banco `postgres`, encontrou 790 registros em `public.posts`: 137 `published`, 298 `hidden`, 340 `closed` e 15 `deleted`. Uma recaptura posterior, imediatamente antes do hardening final da migration semântica, encontrou **791** registros: **138 `published`, 298 `hidden`, 340 `closed` e 15 `deleted`**. As tabelas editoriais abaixo preservam o snapshot original de 790 linhas; o preflight de rollout usa as contagens atuais e deltas, não uma soma histórica congelada.

O número **435** usado como universo desta auditoria é a soma de `published + hidden` (`137 + 298`). Ele representa o conjunto interno de publicações potencialmente relevante para revisão de feed e moderação, não 435 cards públicos simultaneamente visíveis. Para evitar confusão com outra métrica administrativa, `published + closed` era **477** (`137 + 340`) no mesmo snapshot. No instante da consulta:

- 137 registros estavam em `status = 'published'` e sem `legacy_id`;
- desses 137, 134 tinham `visibility = 'public'` e 3 tinham `visibility = 'community'`;
- 298 estavam `hidden` e, por definição, não deveriam aparecer no feed normal;
- a visibilidade efetiva para uma pessoa anônima ainda depende de RLS, RPC, módulo, `visibility` e dos demais predicados do endpoint.

A revisão semântica item a item do conjunto `published` identificou 49 correções de alta confiança. O estado final codificado na migration explícita é:

- 44 correções que permanecem no mesmo módulo e 5 movimentos entre `eventos` e `oportunidades`;
- 45 registros permanecem `published`, 1 passa a `closed` e 3 passam a `hidden`;
- sincronização de `module`, `category`, `status` e das seis superfícies de categoria em metadata: `category`, `categoryKey`, `categoriaKey`, `categoryLabel`, `categoria` e `categoriaLabel`;
- substituição determinística da identidade antiga em `tags`/`tagKeys`, preservando ordem, duplicatas e tags editoriais não relacionadas;
- normalização ou limpeza explícita de datas somente nos UUIDs indicados;
- limpeza de campos incompatíveis nos 5 movimentos de módulo;
- nenhuma classificação fuzzy ou atualização em massa por texto.

Além dessas 49 mudanças editoriais, a auditoria pós-rollout encontrou dois registros cuja coluna `category` já estava correta, mas `metadata.categoryKey`, `metadata.categoriaKey` e labels ainda apontavam para outra categoria válida. Eles não exigem reclassificação: exigem somente reconciliação fail-closed dos campos lidos pelo cliente. Essa correção separada está em [20260808152850_audited_category_metadata_reconciliation.sql](../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql). O preflight somente leitura fixa também `visibility = 'public'`, `price = 0`, cardinalidade exata e os dois triggers de atualização; a migration semântica `20260808152900` continua fora desse rollout.

Se aplicada sem novo drift sobre a recaptura atual, a migration projeta **134 `published`, 301 `hidden`, 341 `closed` e 15 `deleted`**, preservando os **791** registros totais. O delta invariável provado em SQL é `published -4`, `hidden +3`, `closed +1`, `deleted` inalterado.

## Escopo e definição de visibilidade

### Snapshot interno

| Estado | Registros | Papel na auditoria |
| --- | ---: | --- |
| `published` | 137 | Revisão semântica item a item e candidatos atuais ao feed |
| `hidden` | 298 | Coorte interna de controle/moderação; não é feed público |
| **Universo `published + hidden`** | **435** | Universo interno de revisão desta rodada |
| `closed` | 340 | Fora da revisão semântica ativa, salvo controle de ciclo de vida |
| `deleted` | 15 | Fora do feed e fora da correção |
| **Total** | **790** | Total de `public.posts` no snapshot |

As contagens foram obtidas pela seguinte agregação administrativa somente leitura; ela também registra o timestamp e o papel efetivamente usados:

```sql
select
  (now() at time zone 'UTC')::text as snapshot_utc,
  current_user as database_role,
  count(*)::int as total,
  count(*) filter (where status = 'published')::int as published_internal,
  count(*) filter (where status = 'closed')::int as closed_internal,
  count(*) filter (where status = 'hidden')::int as hidden_internal,
  count(*) filter (where status = 'deleted')::int as deleted_internal,
  count(*) filter (where status in ('published', 'closed'))::int
    as published_plus_closed,
  count(*) filter (where status in ('published', 'hidden'))::int
    as published_plus_hidden,
  count(*) filter (
    where status = 'published'
      and legacy_id is null
      and visibility = 'public'
  )::int as published_anon_candidate,
  count(*) filter (
    where status = 'published'
      and legacy_id is null
      and visibility = 'community'
  )::int as published_community
from public.posts
;

select module, category, visibility, count(*)
from public.posts
where status = 'published'
  and legacy_id is null
group by module, category, visibility;
```

Essas consultas descrevem o estado interno da tabela; elas não substituem um teste anônimo da RLS. O RPC de feed atualmente alinhado também possui regras próprias para `legacy_id`, `status` e `visibility`, documentadas em [20260808152845_align_feed_cursor_remote_search_20260808.sql](../../supabase/migrations/20260808152845_align_feed_cursor_remote_search_20260808.sql).

### Distribuição atual dos 137 `published`

| Módulo | Categoria | Quantidade |
| --- | --- | ---: |
| eventos | academicos | 30 |
| eventos | congressos | 6 |
| eventos | culturais | 17 |
| eventos | esportivos | 1 |
| eventos | palestras | 4 |
| eventos | workshops | 15 |
| oportunidades | bolsas | 5 |
| oportunidades | concursos | 2 |
| oportunidades | cursos-capacitacoes | 4 |
| oportunidades | editais | 4 |
| oportunidades | empregos | 5 |
| oportunidades | estagios | 2 |
| oportunidades | monitoria | 5 |
| oportunidades | pesquisa | 36 |
| oportunidades | voluntariado | 1 |
| **Total** |  | **137** |

Não havia, no snapshot, registros `published` em `moradia`, `compra-venda`, `caronas` ou `achados-perdidos`. Isso não prova defeito nesses módulos: apenas registra que não existia publicação interna ativa para validar a classificação item a item. Seus controles, trilhos e filtros ainda precisam de smoke test com fixtures representativas.

### Distribuição projetada após a migration no snapshot original

| Módulo | Categoria | `published` projetados |
| --- | --- | ---: |
| eventos | academicos | 17 |
| eventos | congressos | 23 |
| eventos | culturais | 12 |
| eventos | cursos | 6 |
| eventos | esportivos | 1 |
| eventos | palestras | 6 |
| eventos | workshops | 5 |
| oportunidades | bolsas | 6 |
| oportunidades | concursos | 5 |
| oportunidades | cursos-capacitacoes | 10 |
| oportunidades | editais | 2 |
| oportunidades | empregos | 1 |
| oportunidades | monitoria | 2 |
| oportunidades | pesquisa | 36 |
| oportunidades | voluntariado | 1 |
| **Total** |  | **133** |

Além dos 133 publicados desse snapshot original, o conjunto corrigido termina com 1 registro `oportunidades/editais/closed`, 1 `oportunidades/monitoria/hidden`, 1 `eventos/workshops/hidden` e 1 `eventos/academicos/hidden`. A linha publicada acrescentada depois do snapshot leva a projeção operacional atual a 134; ela não foi retroativamente inserida nesta distribuição histórica por categoria.

## Metodologia

1. Contagem somente leitura de todos os registros por `status`, seguida de agregação dos `published` por `module`, `category` e `visibility`.
2. Revisão dos 137 `published` por UUID, título público, conteúdo editorial, módulo, categoria, estado e aliases temporais relevantes.
3. Comparação com as chaves canônicas apresentadas no cadastro, nos filtros de feed e na busca. O schema de criação vigente expõe 9 categorias de eventos e 10 de oportunidades em [kc-create-post.schema.js](../../assets/js/features/create-post/kc-create-post.schema.js).
4. Separação entre:
   - **alta confiança**, quando o tipo editorial é inequívoco e há origem/alvo explícitos;
   - **ambíguo**, quando módulo, categoria, janela de inscrição ou natureza do card dependem da fonte oficial ou de decisão de produto.
5. Codificação das 49 correções de alta confiança por UUID em [20260808152900_semantic_post_reclassification.sql](../../supabase/migrations/20260808152900_semantic_post_reclassification.sql), sem regras heurísticas.
6. Recaptura read-only dos 49 fingerprints depois de `20260808152843`, incluindo labels, `tags`, `tagKeys`, aliases temporais e todos os campos removidos em movimentos de módulo. Um registro só é aceito se ainda estiver na origem auditada ou no alvo completo e idempotente.
7. Validação por contrato Jest, proof transacional de produção e matriz PostgreSQL local real: vazio, cardinalidade parcial, 48/49, 49 fontes, primeiro run, replay integral, status/audit e drift de label/array/`NULL` SQL.

### Limitações

- O snapshot é temporal. Uma edição posterior pode invalidar a precondição de um ou mais UUIDs; por isso o preflight deve ser repetido imediatamente antes do rollout.
- A revisão item a item concentrou-se nos 137 `published`. Os 298 `hidden` foram usados como coorte interna e contagem de integridade, não como candidatos automáticos a republicação.
- Títulos e descrições podem não conter toda a informação da página oficial. Datas ou natureza editorial incertas permanecem na fila manual.
- Houve escrita controlada de schema/dados mecânicos pelas três migrations já registradas, seguida de smoke test pós-deploy. A reclassificação semântica dos 49 UUIDs e a reconciliação dos dois conflitos residuais continuam separadas e protegidas por precondições explícitas.
- A migration corrige dados já publicados; ela não elimina, sozinha, a causa upstream que pode recriar classificações erradas em novos lotes.

## Relação entre taxonomia e filtros

O trilho superior (`kc-scroll-rail--tabs`), as seções laterais (`kc-sidebar-section`), o modal de criação e as preferências de busca precisam consumir as mesmas chaves canônicas. Mesmo quando a lógica de clique e rolagem funciona, um card persistido com categoria semanticamente errada aparece no filtro errado.

As invariantes funcionais são:

- cada chave exibida no trilho ou na lateral deve existir no schema canônico do módulo;
- singular, plural, acento e label de apresentação devem resolver para uma única chave persistida;
- `module/category/status` da linha e `metadata.module/category/categoryKey` não podem divergir;
- filtros de data devem usar início/fim do evento, enquanto prazo de inscrição deve usar `applicationDeadline`; data de notícia não pode substituir nenhum dos dois;
- mudar de filtro deve reiniciar paginação/cursor e recompor anúncios sem alterar a ordem dos posts;
- estados `hidden` e `deleted` nunca devem reaparecer por filtro, busca, cache ou “Carregar mais”.

Os intervalos de eventos, a canonicalização estrutural e a busca remota são tratados, em ordem, por [20260808152842_feed_event_interval_filters_20260808.sql](../../supabase/migrations/20260808152842_feed_event_interval_filters_20260808.sql), [20260808152843_feed_taxonomy_canonicalization_20260808.sql](../../supabase/migrations/20260808152843_feed_taxonomy_canonicalization_20260808.sql) e [20260808152845_align_feed_cursor_remote_search_20260808.sql](../../supabase/migrations/20260808152845_align_feed_cursor_remote_search_20260808.sql). A migration das 49 correções vem depois delas.

## Ledger das 49 correções de alta confiança

Convenções da tabela:

- `origem` e `alvo` usam `módulo/categoria/status`;
- datas estão em ISO `AAAA-MM-DD`;
- `sem alteração` significa que a migration não toca aquele grupo temporal;
- `limpar` significa remoção explícita dos aliases daquele papel temporal;
- o fingerprint completo do estado de origem está na migration, não duplicado neste relatório.

| # | UUID | Publicação (título público abreviado) | Origem | Alvo | Início/fim final | Prazo final |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb` | 21ª edição do ENTAC em outubro de 2026 | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 2 | `19f52e45-7942-474a-9076-015be4e2af48` | 5º Congresso da Associação Latina de Filosofia do Esporte | `eventos/academicos/published` | `eventos/congressos/published` | `2026-08-27` a `2026-08-29` | sem alteração |
| 3 | `6b92fc98-312b-423a-b309-b90d2e7592d2` | Gimon 2026: microbioma, obesidade e nutrição | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 4 | `2b150e53-dc80-459a-93e5-1ae2bc918adc` | IAPS 2026: Conferência Internacional de Filosofia do Esporte | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 5 | `150cadb3-1821-4b39-893b-93deac7b06b6` | International Conference on Alive Engineering Education | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 6 | `752300fd-d5d1-4873-8ca4-62a19d0f04c2` | II Jornada de Estudos “Música na Infância” | `eventos/academicos/published` | `eventos/congressos/published` | `2026-08-24` a `2026-08-24` | `2026-08-25` |
| 7 | `a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39` | VI Seminário Internacional de Educação a Distância | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 8 | `3b3f1ae3-f0ee-41f3-9a33-3e6193464016` | IV Encontro Nacional da Rede de Universidades Promotoras da Saúde | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 9 | `6ce3f580-960f-4138-837f-bac6df0a9498` | XIII Fórum Nacional NEPEG | `eventos/academicos/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 10 | `b0c85d6b-1289-48b1-9248-ea6c8081fbf2` | II Conferência Internacional Desafios Decoloniais | `eventos/culturais/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 11 | `ac5714e1-eb5e-4d30-984e-0244ee1b05e0` | 10º Congresso Brasileiro de Ciências Sociais e Humanas em Saúde | `eventos/culturais/published` | `eventos/congressos/published` | `2026-09-16` a `2026-09-19` | `2026-09-03` |
| 12 | `bcbee373-c92b-4cc2-a290-9f0ab81518e2` | X Fórum Nacional Escola de Educação Básica para Todos | `eventos/culturais/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 13 | `944a8198-4823-4661-afcb-1a6faef1259c` | XX SEMIC | `eventos/culturais/published` | `eventos/congressos/published` | `2026-10-07` a `2026-10-09` | limpar |
| 14 | `176fc9f3-052d-44f1-a251-afd895bfc1a7` | IV Simpósio Integrado de Estudos Territoriais | `eventos/workshops/published` | `eventos/congressos/published` | `2026-11-25` a `2026-11-27` | limpar |
| 15 | `d8715365-d49c-4bb7-b331-5faa4f1cc458` | VII ENGOPE | `eventos/workshops/published` | `eventos/congressos/published` | `2026-10-21` a `2026-10-23` | `2026-09-30` |
| 16 | `e02fc2b9-12b4-458d-a8dc-95b9c0510b49` | XXV Semana de História da UFG | `eventos/workshops/published` | `eventos/congressos/published` | sem alteração | sem alteração |
| 17 | `ebeaf871-371c-4f9b-8169-824e2da86ba3` | Curso online: Processo Administrativo Disciplinar | `eventos/academicos/published` | `eventos/cursos/published` | sem alteração | sem alteração |
| 18 | `899359eb-b411-4b1f-95c4-234e88c49041` | Curso de Extensão Gratuito para Professores | `eventos/culturais/published` | `eventos/cursos/published` | `2026-08-08` a `2026-11-28` | `2026-08-04` |
| 19 | `0f601a58-f4a0-46a7-9810-a28b5564e67c` | Curso gratuito de biossegurança | `eventos/culturais/published` | `eventos/cursos/published` | sem alteração | sem alteração |
| 20 | `7038c22d-fe66-49f6-a2a2-ec086f4f9a20` | Capacitação CERISE: introdução | `eventos/workshops/published` | `eventos/cursos/published` | sem alteração | sem alteração |
| 21 | `ba140334-470b-4655-a9c1-994ba64e4c28` | Cursos IsF: Cine Debate B1 | `eventos/workshops/published` | `eventos/cursos/published` | `2026-09-01` a `2026-09-24` | `2026-08-27` |
| 22 | `a59449cb-ca81-4545-a147-32a6dbd2c852` | Programa de Cuidado com a Saúde Mental no Trabalho | `eventos/workshops/published` | `eventos/cursos/published` | `2026-08-17` a `2026-08-28` | `2026-08-13` |
| 23 | `5c601845-a26e-46d5-94c0-ba67a50e3ccd` | Paternidade Presente na Era Digital | `eventos/academicos/published` | `eventos/palestras/published` | sem alteração | sem alteração |
| 24 | `a246c601-e693-4d7b-a07b-99e0cb617616` | Aula pública sobre música caipira e sertaneja | `eventos/academicos/published` | `eventos/culturais/published` | sem alteração | sem alteração |
| 25 | `09460066-0e96-45b9-81b4-7ff2e564c6aa` | Clube do Livro Flore-ser no Jardim Botânico | `eventos/academicos/published` | `eventos/culturais/published` | sem alteração | sem alteração |
| 26 | `495b4856-d68a-49bc-89a4-79a16c2c3a7f` | Aula Inaugural da Turma Especial PRONERA | `eventos/workshops/published` | `eventos/academicos/published` | sem alteração | sem alteração |
| 27 | `cb2ce3c1-df2c-43ec-a75d-f251ea61473a` | Recepção de Calouros do IQ/UFG | `eventos/culturais/published` | `eventos/academicos/published` | sem alteração | sem alteração |
| 28 | `2764dfda-1cf3-4aa1-b255-49248415c9e2` | Prêmio Péter Murányi 2027 | `eventos/academicos/published` | `oportunidades/concursos/published` | limpar | `2026-08-31` |
| 29 | `b9b214e9-30a2-4a83-8037-e17ca2b8c5d1` | Seleção de mestrado e doutorado em Direito Agrário | `eventos/workshops/published` | `oportunidades/pesquisa/published` | limpar | `2026-08-21` |
| 30 | `14c43a7f-395c-4ee0-8d11-9ddf76667586` | Alunos especiais no PROFMAT | `eventos/workshops/published` | `oportunidades/pesquisa/published` | limpar | `2026-08-14` |
| 31 | `84f595c9-e601-412b-bf10-263284bbe81d` | Simpósio de Nutrição em Oncologia | `oportunidades/editais/published` | `eventos/congressos/published` | `2026-09-15` a `2026-09-15` | limpar |
| 32 | `e9a826be-a1e3-43eb-aece-85742c10e255` | Aula Magna 2026/2 da Faculdade de Direito | `oportunidades/estagios/published` | `eventos/palestras/published` | `2026-08-13` a `2026-08-13` | limpar |
| 33 | `f75602ca-76a2-4cea-b368-3e45cc995816` | XVII SEREX: submissão encerrada | `oportunidades/editais/published` | `oportunidades/editais/closed` | `2026-08-25` a `2026-08-27` | `2026-06-01` |
| 34 | `b6fff52c-93ad-4579-8a9d-86a8d9d1dea4` | Secom orienta sobre o defeso eleitoral | `eventos/workshops/published` | `eventos/workshops/hidden` | limpar | limpar |
| 35 | `31715ae7-9cd9-4fda-adb2-6541da6fec64` | “Publicações sumiram?” — aviso institucional | `oportunidades/monitoria/published` | `oportunidades/monitoria/hidden` | sem alteração | limpar |
| 36 | `953bb526-e5f5-4e36-a59c-7b102e344518` | PIEmp/UFG: inscrições encerradas | `eventos/academicos/published` | `eventos/academicos/hidden` | limpar | `2026-06-05` |
| 37 | `50a3e363-76ed-4bc6-b8fd-ab4b79faa857` | Chamada para projetos de Indicações Geográficas em Goiás | `oportunidades/empregos/published` | `oportunidades/pesquisa/published` | sem alteração | sem alteração |
| 38 | `1917e659-5151-4650-bfa2-6ec20fd5e81b` | Submissões abertas para dossiê da Revista Pensar a Prática | `oportunidades/empregos/published` | `oportunidades/pesquisa/published` | sem alteração | sem alteração |
| 39 | `a8a66d60-0a03-4606-907a-15e48f9f687b` | Concurso Público da Câmara Municipal de Ipameri | `oportunidades/empregos/published` | `oportunidades/concursos/published` | sem alteração | sem alteração |
| 40 | `3ae523bb-c15b-4d36-a494-1ca43ae95aa3` | Concurso da Prefeitura de Buriti Alegre | `oportunidades/empregos/published` | `oportunidades/concursos/published` | sem alteração | sem alteração |
| 41 | `ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe` | Monitoria 2026/2 na Filosofia | `oportunidades/estagios/published` | `oportunidades/monitoria/published` | sem alteração | sem alteração |
| 42 | `c848f243-077b-4dc8-bf52-86572af7f5fb` | Curso EaD Vida no Trânsito | `oportunidades/monitoria/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 43 | `577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4` | Curso Introdutório em Cuidados Paliativos | `oportunidades/monitoria/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 44 | `fffdc11c-2855-4a8d-9cb2-c10cad863888` | Programa Movimenta UFG | `oportunidades/monitoria/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 45 | `498e0054-31f1-458b-8953-3179decdd033` | Especialização em Arquitetura de Dados | `oportunidades/pesquisa/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 46 | `ca10120d-7e9b-42f7-971a-db9861540a5b` | Atualização em Métodos Alternativos ao Uso de Animais | `oportunidades/pesquisa/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 47 | `080f8237-a8fe-4200-b53a-946b7ea934a3` | Curso de extensão sobre Ariovaldo Umbelino de Oliveira | `oportunidades/pesquisa/published` | `oportunidades/cursos-capacitacoes/published` | sem alteração | sem alteração |
| 48 | `858c8b0b-007b-402d-a7e8-0ad1d753d87e` | Voluntários no projeto Lapig na Escola | `oportunidades/pesquisa/published` | `oportunidades/voluntariado/published` | sem alteração | sem alteração |
| 49 | `4bc906fb-0f5f-463e-bcbd-26c6329a995e` | Bolsista para o Jornal UFG | `oportunidades/voluntariado/published` | `oportunidades/bolsas/published` | sem alteração | sem alteração |

### Efeito especial dos 5 movimentos de módulo

Nos UUIDs 28–30 (`eventos` → `oportunidades`), a migration remove aliases exclusivos de data/hora/evento, `eventType`, `eventMode` e localização específica de evento antes de gravar o prazo de oportunidade. `gratuito` é preservado porque também faz parte do contrato canônico de oportunidades.

Nos UUIDs 31–32 (`oportunidades` → `eventos`), remove `area`, `areaKey`, `workMode`, `employmentType`, remuneração, salário, benefícios, aliases de tipo de oportunidade e `subcategory`/`subcategoria`, e então grava o intervalo do evento. A prova SQL exige ausência desses resíduos e das respectivas identidades de área/modalidade em `tags`/`tagKeys` no estado final.

## Itens ambíguos: não autocorrigir

Os UUIDs a seguir formam uma fila manual conservadora produzida durante a revisão de 08/08. Eles **não** são inferidos pela ausência na migration, não fazem parte das 49 correções e não devem receber atualização heurística. A lista é uma fila de investigação, não uma afirmação de erro.

| UUID | Estado atual observado | Ambiguidade a resolver |
| --- | --- | --- |
| `56746645-0aba-4806-97f7-49b739b73772` | `eventos/academicos/published` | “Salão Nacional de Arte Contemporânea” pode ser cultural ou encontro acadêmico; conferir formato oficial. |
| `6643b77a-81c7-4354-86be-2e5eda0ecd6a` | `eventos/academicos/published` | Encontro das Câmaras de Mediação pode ser congresso, mas o título sozinho não define o formato. |
| `fcd0f0b1-3093-49a0-8339-e8ba34b4114c` | `eventos/academicos/published` | “Cerise Summit” pode ser congresso ou série de palestras. |
| `60649e01-5ef5-405e-90b5-a595e9216738` | `eventos/academicos/published` | “Investiga Menina! Diálogos” pode ser palestra, ação cultural ou acadêmica. |
| `12550854-3a1a-4a39-b08c-d57e1cc7d8a7` | `eventos/academicos/published` | Olimpíada científica não possui subtópico canônico próprio; decisão de produto é necessária. |
| `0cf1c2f6-5e65-4d02-8345-7aa82dc40a11` | `eventos/academicos/published` | Teste ANPAD pode ser evento ou oportunidade de inscrição/prova; ciclo de vida difere. |
| `7bebc99a-8f12-4b55-b928-40c6c44bae24` | `eventos/culturais/published` | “Café com Ciência” pode ser palestra ou atividade cultural. |
| `88dda63f-fe66-4553-9794-d732e2a93139` | `eventos/culturais/published` | Ação Movimenta UFG pode ser esportiva, curso ou campanha de saúde. |
| `447659fe-0787-4d79-bb04-8d038d56896f` | `eventos/culturais/published` | Exposição sobre neuromielite pode ser cultural ou extensão acadêmica. |
| `4b39baaf-996b-49ca-a603-b122066946dd` | `oportunidades/bolsas/published` | Passe Livre Estudantil é benefício/assistência, não bolsa; falta categoria canônica adequada. |
| `9d8b952f-c44b-5a66-804e-fdc4dd1be80e` | `oportunidades/editais/published` | Matrícula de veteranos é ação de calendário acadêmico, não necessariamente edital. |
| `b4ac0d24-4711-4758-948f-5e33e1fb1b29` | `oportunidades/editais/published` | Aluno especial de pós-graduação pode ser edital, pesquisa ou curso. |
| `d826a3be-ef42-4d04-8862-1bec56eb697b` | `oportunidades/empregos/published` | Seleção docente pode ser emprego, concurso ou edital, conforme vínculo. |
| `583893a9-a333-4a14-8ecc-7796d10dcf45` | `oportunidades/monitoria/published` | Monitores de evento podem ser voluntariado, e não monitoria acadêmica. |
| `31bbc912-570a-446a-a5aa-015141a42411` | `oportunidades/pesquisa/published` | Alunos especiais sem vínculo podem pertencer a curso ou edital. |
| `3b8d248c-f1db-45cb-adb5-cca9b49a90d9` | `oportunidades/pesquisa/published` | Especialização em Produção de Sementes pode ser curso/capacitação. |
| `871e4c3b-417d-401c-90a1-94ffacc172f7` | `oportunidades/pesquisa/published` | Chamada de trabalhos de conferência pode representar a oportunidade ou o evento. |
| `39cd5662-a46b-42e3-b8de-64142d5b70bd` | `oportunidades/pesquisa/published` | Simpósio pode ser congresso; confirmar se o card divulga evento ou submissão. |
| `af92b968-3198-43b6-8247-c4b507c5d150` | `oportunidades/pesquisa/published` | Semana da Física com submissões tem dupla natureza: chamada e evento. |

Critério para liberar qualquer item dessa fila: abrir a fonte oficial, registrar qual ação o card promove, separar datas de publicação/evento/inscrição, decidir a taxonomia canônica e criar uma correção explícita por UUID com fingerprint de origem. A auditoria histórica de 05/08 também preservou 34 oportunidades de pesquisa por parecerem intencionais e recomendou validar datas inferidas contra o calendário oficial; ver [report-v76-active-posts-reclassification-2026-08-05.md](../qa/reports/report-v76-active-posts-reclassification-2026-08-05.md).

## Disposição completa dos 137 `published`

Para demonstrar a revisão uma a uma, a lista abaixo cobre os **137 UUIDs** do snapshot. Os campos mínimos foram reextraídos somente leitura em **2026-08-08 14:56:24.635215 UTC**. A quantidade e as distribuições agregadas por módulo, categoria e visibilidade coincidiram com o snapshot-base de 14:34:18.462341 UTC; adicionalmente, nenhum dos 137 registros apresentava `updated_at` posterior ao horário-base. Assim, o ledger é consistente com o snapshot sob o contrato normal de manutenção de `updated_at`. A reextração não muda o timestamp-base e não detectaria um writer que alterasse dados burlando esse campo. Qualquer edição posterior exige nova conferência.

Disposição editorial: **49 `corrigir`**, **2 `sincronizar metadados`**, **19 `revisão manual`** e **67 `sem alteração`**. “Sem alteração” significa que a revisão não encontrou correção de alta confiança no snapshot; não é garantia eterna nem dispensa revalidação de datas. “Corrigir” remete ao ledger semântico; “sincronizar metadados” preserva módulo/categoria/status e corrige apenas as superfícies divergentes lidas pelo cliente; “revisão manual” remete à seção de ambiguidades.

| UUID | Título público | Módulo/categoria no snapshot | Visibilidade | Disposição |
| --- | --- | --- | --- | --- |
| `07ef7b16-8257-49e8-b8cf-bd6db2f9ef38` | 🎓 Colação de Grau UFG 2026/1 celebra formandos do ICB, Farmácia e Física | `eventos/academicos` | `public` | **sem alteração** |
| `fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb` | 📅 21ª edição do ENTAC em outubro de 2026 | `eventos/academicos` | `public` | **corrigir** |
| `56746645-0aba-4806-97f7-49b739b73772` | 2º Salão Nacional de Arte Contemporânea de Goiás: exposição gratuita no Centro Cultural UFG | `eventos/academicos` | `public` | **revisão manual** |
| `19f52e45-7942-474a-9076-015be4e2af48` | 5º Congresso da Associação Latina de Filosofia do Esporte (Alfid) | `eventos/academicos` | `public` | **corrigir** |
| `01d7b015-ab92-4b3d-8e4d-4e88f32fe180` | Acolhida dos Novos Monitores – Ciclo 2026/2027 | `eventos/academicos` | `public` | **sem alteração** |
| `a246c601-e693-4d7b-a07b-99e0cb617616` | Aula pública sobre música caipira e sertaneja em Goiânia (4ª sessão do Goiás Plural) | `eventos/academicos` | `public` | **corrigir** |
| `fcd0f0b1-3093-49a0-8339-e8ba34b4114c` | Cerise Summit 2026: evento acadêmico na UFG em 18 de setembro | `eventos/academicos` | `public` | **revisão manual** |
| `09460066-0e96-45b9-81b4-7ff2e564c6aa` | Clube do Livro Flore-ser no Jardim Botânico | `eventos/academicos` | `public` | **corrigir** |
| `dbfdf0cb-55f7-46ad-85ce-12cad27b3d12` | Colação de grau 2026/1 reúne Farmácia, Biologia e Física | `eventos/academicos` | `public` | **sem alteração** |
| `a2be25d1-da54-4ee8-a6d3-fe6de9769011` | Colação de grau 2026/1 reúne FE, FANUT, IESA e IQ | `eventos/academicos` | `public` | **sem alteração** |
| `dc5c09a9-df84-4062-a698-4042145bf07f` | Colação de grau 2026/1: quatro faculdades da UFG celebram formatura | `eventos/academicos` | `public` | **sem alteração** |
| `ebeaf871-371c-4f9b-8169-824e2da86ba3` | Curso online: Processo Administrativo Disciplinar com perspectiva de gênero | `eventos/academicos` | `public` | **corrigir** |
| `018a96bf-1505-48fb-a6d7-3e3f26ea148e` | Defesa de doutorado: A Biblioteca-Parque como signo | `eventos/academicos` | `public` | **sem alteração** |
| `6b92fc98-312b-423a-b309-b90d2e7592d2` | Gimon 2026: Conferência Global sobre Microbioma, Obesidade e Nutrição | `eventos/academicos` | `public` | **corrigir** |
| `2b150e53-dc80-459a-93e5-1ae2bc918adc` | IAPS 2026: Conferência Internacional de Filosofia do Esporte na USP | `eventos/academicos` | `public` | **corrigir** |
| `4addd028-22ac-42c9-8688-015e9779da3f` | II Enlic-CO, VIII Eleb e II Encontro de Pesquisa do Prolicen | `eventos/academicos` | `public` | **sem alteração** |
| `752300fd-d5d1-4873-8ca4-62a19d0f04c2` | II Jornada de Estudos "Música na Infância" debate educação, arte e ciência | `eventos/academicos` | `public` | **corrigir** |
| `6643b77a-81c7-4354-86be-2e5eda0ecd6a` | III Encontro das Câmaras de Mediação das IFES | `eventos/academicos` | `public` | **revisão manual** |
| `150cadb3-1821-4b39-893b-93deac7b06b6` | International Conference on Alive Engineering Education - ICAEEdu 2026 | `eventos/academicos` | `public` | **corrigir** |
| `60649e01-5ef5-405e-90b5-a595e9216738` | Investiga Menina! Diálogos entre ciência e tradição | `eventos/academicos` | `public` | **revisão manual** |
| `3b3f1ae3-f0ee-41f3-9a33-3e6193464016` | IV Encontro Nacional da Rede Brasileira de Universidades Promotoras de Saúde (ReBraUPS) | `eventos/academicos` | `public` | **corrigir** |
| `3d500db4-bb75-4f09-ac0b-a9d0ec6123a4` | IX SIPACV: encontro, diálogo e construção coletiva do conhecimento | `eventos/academicos` | `public` | **sem alteração** |
| `12550854-3a1a-4a39-b08c-d57e1cc7d8a7` | Olimpíada Nacional de Ciências (ONC) 2026 | `eventos/academicos` | `public` | **revisão manual** |
| `5c601845-a26e-46d5-94c0-ba67a50e3ccd` | Paternidade Presente na Era Digital: live debate excesso de telas | `eventos/academicos` | `public` | **corrigir** |
| `953bb526-e5f5-4e36-a59c-7b102e344518` | PIEmp/UFG 2026: inscrições encerradas, confira as próximas etapas | `eventos/academicos` | `public` | **corrigir** |
| `2764dfda-1cf3-4aa1-b255-49248415c9e2` | Prêmio Péter Murányi 2027: inscrições abertas para trabalhos inovadores em saúde | `eventos/academicos` | `public` | **corrigir** |
| `0cf1c2f6-5e65-4d02-8345-7aa82dc40a11` | Teste ANPAD 2026: próximas edições em setembro e novembro | `eventos/academicos` | `public` | **revisão manual** |
| `a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39` | VI Seminário Internacional de Educação a Distância e IV Conect EaD IF Goiano | `eventos/academicos` | `public` | **corrigir** |
| `fac8d6ca-d66a-49d3-8356-9b208af22f75` | VIII ABCF Congress | `eventos/academicos` | `public` | **sem alteração** |
| `6ce3f580-960f-4138-837f-bac6df0a9498` | XIII Fórum Nacional NEPEG de Formação de Professores de Geografia | `eventos/academicos` | `public` | **corrigir** |
| `92f20472-ec25-42b0-94b8-0b56d6255058` | 🎭 I Seminário Viver em Cena: Invisibilidade da Mulher Idosa Brasileira | `eventos/congressos` | `public` | **sem alteração** |
| `ee31c240-f962-482f-a8e4-3a550c43a2f6` | 3° CIEFE: Congresso Internacional de Educação Física Escolar | `eventos/congressos` | `public` | **sem alteração** |
| `68a0bbbc-e2ac-4792-b160-b7577a750d1b` | 3º ENFACO — Encontro de Fundações de Apoio do Centro-Oeste | `eventos/congressos` | `public` | **sem alteração** |
| `6a43f20c-0b8b-472d-b43c-daa8c6b8cb38` | IX EGOEEP discute Engenharia de Produção na era da Inteligência Artificial | `eventos/congressos` | `public` | **sem alteração** |
| `4150a6ca-9d5e-4522-98a9-973952893cc7` | IX Simpósio de Educação Inclusiva do CEPAE/UFG acontece em setembro | `eventos/congressos` | `public` | **sem alteração** |
| `ce24a542-294c-4048-b0ea-2f2b4a435fe2` | XXX Semana de Filosofia da FAFIL/UFG: submissão de resumos prorrogada até 15/07 | `eventos/congressos` | `public` | **sincronizar metadados** |
| `e3c9c66f-85f5-4dac-aff2-ab91e70c564b` | 2ª edição do Conexões do Patrimônio celebra o Dia Nacional do Patrimônio Cultural | `eventos/culturais` | `public` | **sem alteração** |
| `5485a5ae-ca68-4e31-bfbe-7908045faf42` | 80° Recital em Homenagem à Nhanhá do Couto acontece no Centro Cultural UFG | `eventos/culturais` | `public` | **sem alteração** |
| `7bebc99a-8f12-4b55-b928-40c6c44bae24` | Café com Ciência: A Arte da Dinâmica Molecular | `eventos/culturais` | `public` | **revisão manual** |
| `899359eb-b411-4b1f-95c4-234e88c49041` | Curso de Extensão Gratuito para Professores na FE/UFG | `eventos/culturais` | `public` | **corrigir** |
| `447659fe-0787-4d79-bb04-8d038d56896f` | Exposição Itinerante sobre Neuromielite Óptica chega ao HGG em agosto | `eventos/culturais` | `public` | **revisão manual** |
| `87195842-a086-4614-811d-406ad62d8f84` | Feira Multicultural Flore-Ser celebra 1 ano com edição de aniversário em agosto | `eventos/culturais` | `public` | **sem alteração** |
| `e85ee2a3-535a-4483-b87c-c45cfdc7ba90` | Feira Multicultural Floreser acontece em 13 de agosto na Biblioteca Central | `eventos/culturais` | `public` | **sem alteração** |
| `2c0f70aa-8948-4335-bc57-66cfc86e2254` | Festival Flore-Ser: cinema, ciência e cultura sobre o Rio Araguaia | `eventos/culturais` | `public` | **sem alteração** |
| `5bfacd9c-2991-4264-a265-31763bc4b341` | Festival Floreser: programação cultural na Biblioteca Central da UFG | `eventos/culturais` | `public` | **sem alteração** |
| `b0c85d6b-1289-48b1-9248-ea6c8081fbf2` | II Conferência Internacional Desafios Decoloniais em Cultura Física | `eventos/culturais` | `public` | **corrigir** |
| `ac5714e1-eb5e-4d30-984e-0244ee1b05e0` | IPTSP INDICA - 10º Congresso Brasileiro de Ciências Sociais e Humanas em Saúde da Abrasco | `eventos/culturais` | `public` | **corrigir** |
| `0f601a58-f4a0-46a7-9810-a28b5564e67c` | IPTSP/UFG — inscrições para curso gratuito de biossegurança voltado a usuários do NB3-UFG | `eventos/culturais` | `public` | **corrigir** |
| `b4aca32f-814d-4116-b396-2f30afad1494` | Manhã Lírica: árias e duos de óperas na abertura do semestre da EM/UFG | `eventos/culturais` | `public` | **sem alteração** |
| `88dda63f-fe66-4553-9794-d732e2a93139` | Movimenta UFG: saúde e prevenção para servidores com risco cardiometabólico | `eventos/culturais` | `public` | **revisão manual** |
| `cb2ce3c1-df2c-43ec-a75d-f251ea61473a` | Recepção de Calouros do IQ/UFG acontece dia 10 de agosto | `eventos/culturais` | `public` | **corrigir** |
| `bcbee373-c92b-4cc2-a290-9f0ab81518e2` | X Fórum Nacional Escola de Educação Básica para Todos! e V Ciclo Internacional de Debates | `eventos/culturais` | `public` | **corrigir** |
| `944a8198-4823-4661-afcb-1a6faef1259c` | XX SEMIC será de 7 a 9 de outubro de 2026 | `eventos/culturais` | `public` | **corrigir** |
| `013df393-91c2-42a3-9508-b838558a0ee1` | II Campeonato de Drones da EFG Luiz Rassi | `eventos/esportivos` | `public` | **sem alteração** |
| `45d5076e-23d9-490c-965d-03f1135e42ed` | Construção de Produtos AI First — Circuito de Palestras Programa Multicêntrico AKCIT | `eventos/palestras` | `public` | **sem alteração** |
| `ac615cda-89e1-47fd-a1bf-74199e0fc5bf` | Diálogos: como arrasar na apresentação da sua pesquisa | `eventos/palestras` | `public` | **sem alteração** |
| `270d6932-5c04-4b15-8a60-c3340ad0a1b9` | Tendências em Agentes de IA — Circuito de Palestras Programa Multicêntrico AKCIT | `eventos/palestras` | `public` | **sem alteração** |
| `543c3dd3-d247-4830-b659-280fd8836757` | Última palestra do Diálogos debate apresentação de trabalhos científicos | `eventos/palestras` | `public` | **sem alteração** |
| `495b4856-d68a-49bc-89a4-79a16c2c3a7f` | 🎓 Aula Inaugural da Turma Especial PRONERA em Arquitetura e Urbanismo | `eventos/workshops` | `public` | **corrigir** |
| `14c43a7f-395c-4ee0-8d11-9ddf76667586` | Alunos Especiais no Mestrado Profissional em Matemática (PROFMAT/UFG) | `eventos/workshops` | `public` | **corrigir** |
| `7038c22d-fe66-49f6-a2a2-ec086f4f9a20` | Convite do Centro de Excelência CERISE UFG - Capacitação: Introdução ao Raspberry Pi e sua... | `eventos/workshops` | `public` | **corrigir** |
| `ba140334-470b-4655-a9c1-994ba64e4c28` | Cursos IsF - Português para Estrangeiros: Cine Debate B1 | `eventos/workshops` | `public` | **corrigir** |
| `cb991ae6-3ca3-4183-b34e-3655ae1c4f15` | Dispositivo Transborde integra o SIPACV 2026 com produções visuais e curatoriais | `eventos/workshops` | `public` | **sem alteração** |
| `908393bb-c838-4266-940c-78dd79a1222e` | Feira Multicultural Flore-Ser reúne oficinas e arte na UFG | `eventos/workshops` | `public` | **sem alteração** |
| `176fc9f3-052d-44f1-a251-afd895bfc1a7` | IV Simpósio Integrado de Estudos Territoriais acontece em novembro no IESA/UFG | `eventos/workshops` | `public` | **corrigir** |
| `d7e177a2-b48e-441f-adb3-ab4b4c7a17df` | IV Workshop Online do PROFMAT nos dias 17, 18 e 19 de setembro de 2026 | `eventos/workshops` | `public` | **sem alteração** |
| `59a15d62-5a15-46b0-9408-b7c28b4ae823` | Oficina de Zine na Livraria da UFG: crie, desenhe e conte histórias | `eventos/workshops` | `public` | **sem alteração** |
| `fdd48cde-1c6e-4faa-973c-00e02d3d7e75` | Oficina sobre fundos europeus para ciência, cultura e tecnologia na FEN/UFG | `eventos/workshops` | `public` | **sem alteração** |
| `a59449cb-ca81-4545-a147-32a6dbd2c852` | Programa de Cuidado com a Saúde Mental e Emocional no Trabalho | `eventos/workshops` | `public` | **corrigir** |
| `b6fff52c-93ad-4579-8a9d-86a8d9d1dea4` | Secom orienta sobre período do defeso eleitoral | `eventos/workshops` | `public` | **corrigir** |
| `b9b214e9-30a2-4a83-8037-e17ca2b8c5d1` | Seleção de Mestrado e Doutorado em Direito Agrário – Ingresso 2027 | `eventos/workshops` | `public` | **corrigir** |
| `d8715365-d49c-4bb7-b331-5faa4f1cc458` | VII ENGOPE abre inscrições e submissões de trabalhos para edição de 2026 | `eventos/workshops` | `public` | **corrigir** |
| `e02fc2b9-12b4-458d-a8dc-95b9c0510b49` | XXV Semana de História da UFG: Comunidades Tradicionais e Colonialidade | `eventos/workshops` | `public` | **corrigir** |
| `2c139f6c-8d05-43f6-b242-85980428e0d7` | Bolsas AUIP para Dupla Titulação de Pós-Graduação | `oportunidades/bolsas` | `public` | **sincronizar metadados** |
| `17d7d6ec-a70d-4ab1-ae04-847d9b0a43dd` | Bolsas do PPGMEC 2026/2: inscrições abrem em 08/08 | `oportunidades/bolsas` | `public` | **sem alteração** |
| `7a3e040a-72cb-443f-803c-aa1749b0d738` | DAAD Brasil lança bolsas para graduação, mestrado e doutorado na Alemanha | `oportunidades/bolsas` | `public` | **sem alteração** |
| `4f83362b-1af6-4b24-a521-0f242421b64e` | Mediação Pedagógica Inclusiva: inscrições para bolsistas e voluntários | `oportunidades/bolsas` | `public` | **sem alteração** |
| `4b39baaf-996b-49ca-a603-b122066946dd` | Passe Livre Estudantil 2026/2: cadastramento vai até 30 de setembro | `oportunidades/bolsas` | `public` | **revisão manual** |
| `2569361d-d799-463c-88af-2fb0a7f6bb90` | Concurso Público da Prefeitura de São Miguel do Araguaia (GO) está com inscrições abertas | `oportunidades/concursos` | `public` | **sem alteração** |
| `168c9cbc-10a4-43a4-8b56-c9c1fb5176e2` | V Prêmio Crea-GO de Destaque Acadêmico e Docente | `oportunidades/concursos` | `public` | **sem alteração** |
| `0ac23479-325c-428f-80d7-28431217bbde` | Centro de Línguas UFG abre matrículas para o semestre 2026/2 | `oportunidades/cursos-capacitacoes` | `public` | **sem alteração** |
| `55008a05-3d79-5fbd-8aa2-666e2a0b71ff` | Instituto Confúcio UFG: matrículas abertas em agosto — Mandarim, Tai Chi e Medicina Chinesa | `oportunidades/cursos-capacitacoes` | `community` | **sem alteração** |
| `0e920527-0806-46f9-876f-24559a4562b9` | Oficina de Taipa de Pilão no Campus Cidade de Goiás | `oportunidades/cursos-capacitacoes` | `public` | **sem alteração** |
| `403a9ed3-c194-4e2d-ba39-7686526be73c` | XI Curso de Verão do PPGCB abre inscrições em breve | `oportunidades/cursos-capacitacoes` | `public` | **sem alteração** |
| `b4ac0d24-4711-4758-948f-5e33e1fb1b29` | Aluno Especial PPGZ/UFG: inscrições para disciplinas de mestrado e doutorado | `oportunidades/editais` | `public` | **revisão manual** |
| `9d8b952f-c44b-5a66-804e-fdc4dd1be80e` | Matrículas de veteranos UFG 2026/2: 15 a 22 de agosto | `oportunidades/editais` | `community` | **revisão manual** |
| `84f595c9-e601-412b-bf10-263284bbe81d` | Simpósio de Nutrição em Oncologia: Evidências e Práticas no Cuidado com o Câncer | `oportunidades/editais` | `public` | **corrigir** |
| `f75602ca-76a2-4cea-b368-3e45cc995816` | XVII SEREX: inscrições para submissão de trabalhos até 1º de junho | `oportunidades/editais` | `public` | **corrigir** |
| `d826a3be-ef42-4d04-8862-1bec56eb697b` | Centro de Línguas da UFG abre processo seletivo para docentes de línguas (Edital Nº 02/2026) | `oportunidades/empregos` | `public` | **revisão manual** |
| `50a3e363-76ed-4bc6-b8fd-ab4b79faa857` | Chamada para projetos de Indicações Geográficas em Goiás | `oportunidades/empregos` | `public` | **corrigir** |
| `a8a66d60-0a03-4606-907a-15e48f9f687b` | Concurso Público da Câmara Municipal de Ipameri/GO: inscrições até 12 de agosto | `oportunidades/empregos` | `public` | **corrigir** |
| `3ae523bb-c15b-4d36-a494-1ca43ae95aa3` | Inscrições abertas para Concurso da Prefeitura de Buriti Alegre (GO) | `oportunidades/empregos` | `public` | **corrigir** |
| `1917e659-5151-4650-bfa2-6ec20fd5e81b` | Submissões abertas: dossiê da Revista Pensar a Prática (FEFD/UFG + CBCE) | `oportunidades/empregos` | `public` | **corrigir** |
| `e9a826be-a1e3-43eb-aece-85742c10e255` | Aula Magna 2026/2 da Faculdade de Direito com Prof. Ricardo Limongi | `oportunidades/estagios` | `public` | **corrigir** |
| `ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe` | Monitoria 2026/2 na Filosofia: 16 vagas remuneradas e 5 voluntárias | `oportunidades/estagios` | `public` | **corrigir** |
| `c848f243-077b-4dc8-bf52-86572af7f5fb` | Curso EaD Vida no Trânsito abre 150 vagas para profissionais de todo o Brasil | `oportunidades/monitoria` | `public` | **corrigir** |
| `583893a9-a333-4a14-8ecc-7796d10dcf45` | Inscrições para monitores da XLIII Semana da Física da UFG | `oportunidades/monitoria` | `public` | **revisão manual** |
| `577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4` | LAMCP prorroga inscrições para Curso Introdutório em Cuidados Paliativos até 10/08 | `oportunidades/monitoria` | `public` | **corrigir** |
| `fffdc11c-2855-4a8d-9cb2-c10cad863888` | Programa Movimenta UFG abre inscrições para servidores em agosto | `oportunidades/monitoria` | `public` | **corrigir** |
| `31715ae7-9cd9-4fda-adb2-6541da6fec64` | Publicações sumiram e comentários estão desativados? Entenda o período eleitoral na UFG | `oportunidades/monitoria` | `public` | **corrigir** |
| `680de838-2a14-49d5-b1aa-9cb09f0f64ce` | 33ª Jornadas de Jovens Pesquisadores da AUGM: pré-seleção na UFG | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `31bbc912-570a-446a-a5aa-015141a42411` | Alunos Especiais Sem Vínculo: inscrições abertas para o 2º semestre de 2026 | `oportunidades/pesquisa` | `public` | **revisão manual** |
| `498e0054-31f1-458b-8953-3179decdd033` | Aprofunde seus conhecimentos em Arquitetura de Dados com especialistas nacionais | `oportunidades/pesquisa` | `public` | **corrigir** |
| `8a2ffc7d-9460-4686-acf8-865dac1db619` | CNPq/CT-Biotec/FNDCT/MCTI abrem chamada para projetos de PD&I em Biotecnologia (nº 24/2026) | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `ca10120d-7e9b-42f7-971a-db9861540a5b` | Curso de Atualização em Métodos Alternativos ao Uso de Animais na Fiocruz | `oportunidades/pesquisa` | `public` | **corrigir** |
| `080f8237-a8fe-4200-b53a-946b7ea934a3` | Curso de Extensão gratuito sobre a obra de Ariovaldo Umbelino de Oliveira | `oportunidades/pesquisa` | `public` | **corrigir** |
| `b5ec0206-a634-4c32-b937-09145a78eb3f` | Doutorado Sanduíche: PPGCOM abre edital com 1 vaga | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `0ec31a60-b8fb-4711-a921-3e951e942023` | Edital 06/2026: Seleção de Mestrado e Doutorado em Comunicação | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `a0e39686-a85e-4363-a945-f03e313b338d` | Edital de seleção para mestrado e doutorado em Biodiversidade Animal | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `bfb875e4-62d8-4f11-a2f3-78a1b5657f14` | Edital Expressão Acadêmica 2026: apoio à publicação de teses e dissertações da UFG | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `e2374c2d-53ef-4b48-a9c1-5518a06fcdc4` | Especialização, mestrado e doutorado em Letras: editais abertos! | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `ae78b207-f589-4ce8-941a-58a819c47303` | Exame ANPEC 2027: datas das provas já estão disponíveis | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `a773eceb-be43-43b1-88db-4ee38f98343c` | FAPEG abre chamada com R$ 1 milhão para estruturação e consolidação de Indicações Geográficas em... | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `cdb9da59-eb5f-4344-99e0-e7b5b1fd2305` | FAPEG abre edital complementar à Chamada ERC-CONFAP 2026, com Comissão Europeia (12/2026) | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `fe26e460-5155-42de-b66f-e3785e25038c` | FAPEG abre edital complementar à Chamada Mobility CONFAP Italy 2026 — mobilidade internacional... | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `7f6f688b-34f1-4912-b0f5-05a4dec65609` | FAPEG abre edital de R$ 1 milhão para pesquisa e inovação em educação especial inclusiva (13/2026) | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `ffd27f1a-91ba-5295-848c-eb940113d72c` | Fapeg abre três editais de fomento para pesquisadores da UFG | `oportunidades/pesquisa` | `community` | **sem alteração** |
| `0a57fc77-9ab2-4d25-a4a4-f7203c9a1359` | Fapeg lança edital de R$ 1 milhão para educação especial inclusiva | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `a22262e7-794b-4f75-966a-7f65434eb530` | FAPEG/CNPq/CAPES abrem seleção de bolsistas PROFIX-CB para fixação de doutores em Goiás (Chamada... | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `871e4c3b-417d-401c-90a1-94ffacc172f7` | IGU CDES 2026: chamada de trabalhos para conferência em Fortaleza | `oportunidades/pesquisa` | `public` | **revisão manual** |
| `39cd5662-a46b-42e3-b8de-64142d5b70bd` | III Simpósio de Pós-Graduação em Educação Física | `oportunidades/pesquisa` | `public` | **revisão manual** |
| `858c8b0b-007b-402d-a7e8-0ad1d753d87e` | Inscrições prorrogadas para voluntários no projeto Lapig na Escola | `oportunidades/pesquisa` | `public` | **corrigir** |
| `6198c272-e882-4f12-b19a-912e99ff1bf1` | Mestrado em Economia da UFG abre inscrições em agosto | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `80b3ee37-d36c-4e09-af3b-9a897f4b5a6e` | Mestrado em Psicologia (PPGP/UFG): inscrições abertas para a 14ª turma — ingresso em 2027 | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `614b3721-8676-447c-8f7c-cf7e60e6c3ff` | Mestrado em Sociologia: inscrições abertas para turma 2027 | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `70f02616-1131-4b16-b4a9-380139582ec1` | Parceria RAMP lança 1ª chamada para transição verde e digital | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `ceb74ea0-c8e5-4598-8e20-fabf43a48ef5` | PDSE 2027: inscrições abertas para doutorado-sanduíche no exterior | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `2d4d26b3-65c9-46d5-aced-66ec1ab182c8` | PPGECON abre vagas para mestrado | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `587af1e0-e3f8-4ffc-a4a0-bd3d1a715337` | PPGIDH abre vagas para aluno especial | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `e46c28f6-9605-4873-b904-ebd72442df07` | PPGMTSP abre vagas para mestrado e doutorado | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `380404b0-8180-459c-bfb1-80812d42df1a` | PPGNUT 2026/2: Inscrições para Aluno Especial | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `f237d121-a585-459f-824c-9af3a06a7094` | Processo Seletivo de Doutorado em Sociologia – Turma 2027 | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `3b8d248c-f1db-45cb-adb5-cca9b49a90d9` | Prorrogadas as inscrições para Especialização em Produção de Sementes Agrícolas | `oportunidades/pesquisa` | `public` | **revisão manual** |
| `f2ff9855-77ae-40f3-bb7b-44140b0ac7ef` | Revista Pensar a Prática recebe artigos para dossiê até 30/12/2026 | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `cc13f596-231f-4a8d-b8fc-1466e407b19d` | Submissões para o 23º CONPEEX encerram em menos de 30 dias! | `oportunidades/pesquisa` | `public` | **sem alteração** |
| `af92b968-3198-43b6-8247-c4b507c5d150` | XLIII Semana da Física: submissões de resumos até 10 de agosto | `oportunidades/pesquisa` | `public` | **revisão manual** |
| `4bc906fb-0f5f-463e-bcbd-26c6329a995e` | Secom seleciona bolsista para Jornal UFG com bolsa de R$ 700 | `oportunidades/voluntariado` | `public` | **corrigir** |

## Causas upstream e risco de recorrência

### 1. Taxonomia do publisher não está alinhada ao cadastro

O schema canônico de criação possui 9 categorias de eventos e 10 de oportunidades. Já [cadu-publish/schema.ts](../../supabase/functions/cadu-publish/schema.ts) mantém labels para apenas parte delas, usa `academicos` como default de eventos e `monitoria` como default de oportunidades, e `validateItem` não rejeita categoria fora da allowlist do módulo.

Em [cadu-publish/mapper.ts](../../supabase/functions/cadu-publish/mapper.ts), `slugify(item.category)` ou o default é persistido diretamente tanto na linha quanto nos metadados. Assim, uma categoria ausente, genérica ou semanticamente errada pode passar pelo quality gate e reaparecer em novos lotes.

### 2. Resolução textual permissiva e dependente de histórico

Aliases curtos ou genéricos combinados por substring geraram falsos positivos de área: “Passe Livre Estudantil”, “Instituto Confúcio” e a palavra “data” podiam ser interpretados como tecnologia. Estado global de histórico também tornava o resultado dependente da ordem de processamento.

O resolver em [kc-utils.taxonomy.js](../../assets/js/utils/kc-utils.taxonomy.js) e suas regressões em [kc-utils-taxonomy.test.js](../../tests/unit/kc-utils-taxonomy.test.js) foram preparados para exigir correspondências seguras e resultado determinístico. Esse hardening é independente da migration de dados e deve ser entregue antes ou junto dela.

### 3. Papéis temporais confundidos

O mapper possui fallbacks que extraem ano e datas do texto. Para eventos, ele tenta intervalo, primeira data e depois grava `deadline_date` a partir de `data_evento`. Isso mistura três conceitos distintos:

- data de publicação da notícia;
- início/fim do evento;
- prazo de inscrição ou submissão.

Em oportunidades, um prazo textual passado pode permanecer apenas como warning em alguns cenários. Se os demais controles aprovarem o item, o insert pode entrar como `published`. O resultado é filtro de data correto sobre dados semanticamente errados.

### 4. Divergência entre coluna e metadata

O histórico contém combinações divergentes entre `posts.category`, `metadata.category`, `metadata.categoryKey`, `metadata.categoriaKey`, `module` e aliases legados. Corrigir somente a coluna faz o filtro local, busca remota, modal e card discordarem entre si.

### 5. Ciclo de vida editorial incompleto

Avisos institucionais, chamadas encerradas e matérias sobre processo podem ficar `published` quando não existe regra semântica de fechamento/ocultação. Fechamento por data não deve ser aplicado cegamente: oportunidade, evento e notícia usam datas diferentes, e alguns cards continuam úteis depois do prazo.

## Garantias da migration `20260808152900`

A migration foi desenhada para ser explícita, transacional, idempotente e replay-safe:

- contém exatamente 49 UUIDs completos e nenhum classificador;
- em banco totalmente vazio, faz `no-op` para permitir `supabase db reset`, preview e ambientes novos;
- em qualquer banco não vazio, exige os 49 UUIDs; 1–48 presentes ou qualquer ausência abortam antes da escrita;
- aceita somente o fingerprint de origem auditado ou um `target_touched_fingerprint` único, calculado exclusivamente do source embutido por UUID e nunca do metadata live do alvo, com guards `IS NOT TRUE` para que `NULL` SQL nunca seja aprovado;
- sincroniza as seis chaves/labels de categoria e reescreve `tags`/`tagKeys` sem deduplicar conteúdo alheio;
- qualquer terceiro estado, label/array inválido ou drift em campo tocado aborta antes da primeira escrita;
- exige habilitados `kc_posts_set_updated_at`, `trg_audit_posts_status` e `trg_posts_canonicalize_feed_fields` antes do preflight e na pós-condição;
- o replay local injeta ausência e `null` JSON em `deadline_date` e `dates.applicationDeadline`, além de desabilitar isoladamente cada trigger obrigatório; exige `KC001`/`KC003` e comprova restauração exata por subtransação e pelo estado before/after do runner;
- a segunda execução não produz update, mudança de `updated_at` nem nova linha de audit;
- as pós-condições validam exatamente 49 alvos, 5 movimentos, 4 mudanças de status, datas e ausência de resíduos incompatíveis;
- o proof de produção projeta dinamicamente apenas as transições ainda em source, portanto é válido para 49 sources, 49 targets ou mistura dos dois.

Artefatos de prova:

- [contrato Jest](../../tests/contract/semantic-post-reclassification-migration.test.js);
- [proof SQL de produção](../../tests/sql/semantic-post-reclassification-proof.sql);
- [proof SQL de replay](../../tests/sql/semantic-post-reclassification-replay-proof.sql);
- [runner local seguro](../../scripts/test-semantic-post-reclassification.js), executável com `npm run test:db:semantic-post-reclassification`.

## Reconciliação residual `20260808152850`

O estado real dos dois UUIDs foi reconfirmado somente leitura em produção em
2026-08-08: ambos existem uma única vez, estão `published/public`, têm `price =
0` e ainda correspondem ao fingerprint de origem auditado. A reconciliação:

- exige exatamente duas especificações e exatamente os dois UUIDs em qualquer
  banco não vazio;
- aceita somente a origem completa ou o alvo completo, usando guards
  `IS NOT TRUE` para que `NULL` não seja tratado como aprovação;
- inclui `module`, `category`, `status`, `visibility`, `price` e metadata no
  fingerprint;
- exige `kc_posts_set_updated_at` e
  `trg_posts_canonicalize_feed_fields` habilitados antes da escrita;
- confere a cardinalidade real do `UPDATE` contra a quantidade de linhas ainda
  na origem e valida duas linhas completas no alvo;
- usa SQLSTATEs dedicados, permitindo que a prova de drift capture somente o
  erro esperado, sem `catch` genérico.

O [preflight de produção](../../tests/sql/audited-category-metadata-reconciliation-production-preflight.sql)
abre uma transação `READ ONLY`, retorna somente capacidades booleanas e nunca
inclui/aplica a migration. O executor deve rejeitar resposta vazia, campo não
booleano ou qualquer valor diferente de `true`.

O [proof de replay](../../tests/sql/audited-category-metadata-reconciliation-replay-proof.sql)
usa `SET LOCAL session_replication_role`, nunca desabilita triggers globalmente,
prova preservação de `price/visibility`, avanço de `updated_at` apenas na
primeira escrita, idempotência, rejeição específica de drift e termina em
`ROLLBACK`. O runner
[`test-audited-category-metadata-reconciliation.js`](../../scripts/test-audited-category-metadata-reconciliation.js)
resolve exclusivamente o container Docker do projeto Supabase local, recusa uma
tabela `posts` não vazia e compara estado de linhas/triggers antes e depois do
rollback:

```powershell
npm run test:db:audited-category-metadata
```

## Reconciliação estrutural das seis superfícies — `20260808225424`

Uma auditoria global somente leitura, fechada em **2026-08-08 por volta de
20:46 BRT**, comparou todos os `published` com o registry canônico de **34 pares
`module/category`**. O denominador pós-rollout é de **134 published**: 131
`public` e 3 `community`. O resultado foi:

- **87 UUIDs** em estado estrutural de origem e nenhum já no alvo completo;
- 84 alvos `public` e 3 alvos `community`;
- 27 linhas com label divergente, 56 linhas `public` com aliases incompletos,
  a exceção estrutural `4b39baaf-996b-49ca-a603-b122066946dd` e 3 linhas
  `community` com aliases incompletos ou divergentes;
- 47 controles já canônicos fora da especificação;
- zero `published` fora do registry e zero drift fora dos 87 UUIDs;
- preços congelados por UUID: 76 valores `0`, 9 `NULL`, um `300` e um
  `13671.34`.

A linha `4b39baaf-996b-49ca-a603-b122066946dd` (Passe Livre Estudantil)
permanece uma **revisão editorial aberta**. A reconciliação apenas espelha o root
já publicado `oportunidades/bolsas` nas seis superfícies; não decide se o item
deveria pertencer a uma categoria futura de assistência/benefícios.

A migration
[20260808225424_canonical_category_label_reconciliation.sql](../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql)
é UUID-bound e aceita, para cada uma das 87 linhas, somente o fingerprint exato
de origem ou o alvo exato. Ela:

- configura timeouts de sessão e adquire `SHARE ROW EXCLUSIVE` antes de
  substituir funções públicas; o routine principal reacquire o lock antes de
  qualquer leitura/escrita em `posts`, e os timeouts são resetados no fim;
- exige 87 especificações disjuntas, 134 `published`, 134 roots no registry e
  47 controles já canônicos antes da primeira escrita;
- valida metadata objeto, `module/category/status/visibility`, preço por UUID,
  três triggers em modo `O` e a definição completa do trigger canônico;
- altera somente `metadata.category`, `categoryKey`, `categoriaKey`,
  `categoryLabel`, `categoria` e `categoriaLabel`; `tags`, `tagKeys`, `price` e
  todo metadata independente são congelados e comparados depois do `UPDATE`;
- mantém `updated_at` inalterado no replay-alvo e o avança apenas nas fontes;
- exige 87 alvos, 47 controles byte-a-byte e as 134 superfícies globais exatas
  ao final da transação.

A barreira preventiva é module-scoped: pares conhecidos canonicalizam `module`,
`category` e as seis superfícies; insert ou troca efetiva para par desconhecido
falha com `22023`. Updates independentes em 56 linhas legadas `hidden/closed/deleted`
fora do registry continuam permitidos se o par e as seis superfícies não forem
tocados. Alterar qualquer uma dessas superfícies num par legado desconhecido é
rejeitado, evitando legitimar labels arbitrários sem bloquear manutenção não
taxonômica.

Artefatos versionados:

- [preflight de produção READ ONLY](../../tests/sql/canonical-category-label-reconciliation-production-preflight.sql),
  cujo modo pré-deploy exige exatamente 87 sources e zero targets;
- [proof de produção transacional](../../tests/sql/canonical-category-label-reconciliation-production-proof.sql),
  com modo padrão `source` antes do rollout e `-v kc_expected_state=target`
  depois dele; ambos terminam em `ROLLBACK`;
- [proof local de replay](../../tests/sql/canonical-category-label-reconciliation-replay-proof.sql),
  cobrindo 87 sources, mistura 44/43, ponto fixo, mutantes de dados, denominador
  134 e definição de triggers;
- [contrato Jest](../../tests/contract/canonical-category-label-reconciliation-migration.test.js)
  e [runner Docker local](../../scripts/test-canonical-category-label-reconciliation.js).

Execução local segura:

```powershell
npm run test:db:canonical-category-labels
```

O gate abaixo primeiro confirma que `posts` está vazio e então executa
`supabase db reset --local --no-seed`, aplicando o arquivo de migration verbatim
pelo executor do CLI antes do mesmo replay/rollback. Ele é deliberadamente
separado porque recria o banco Supabase local:

```powershell
npm run test:db:canonical-category-labels:reset-local
```

O gate de atomicidade do executor cria dois bancos locais descartáveis a partir
do schema resetado. O primeiro exige `db push --db-url` verbatim com ledger 1 e
funções canônicas; o segundo acrescenta uma falha `PZ901` após o arquivo e exige
ledger 0 mais funções/trigger sentinela byte-a-byte. Ambos são removidos ao fim:

```powershell
npm run test:db:canonical-category-labels:cli-push
```

O rollout de `20260808225424` foi executado em produção em **2026-08-09 entre
01:07 e 01:09 UTC** (2026-08-08 entre 22:07 e 22:09 BRT), depois do merge do PR
#824. O gate operacional registrou:

- Vercel em produção no merge commit `5e449dfc`, Edge `cadu-publish` ACTIVE v48
  e 15/15 funções Edge sem drift de fonte;
- `runtime.lock` no mesmo inode `2049:5542503` no host e nos dois containers,
  zero runs ativos e zero `pg_cron` em execução durante a janela;
- preflight versionado com 10/10 capacidades verdadeiras, 87 fontes, zero
  alvos, 47 controles e 134 publicados;
- proof oficial `source` em uma única transação com a migration real e
  `ROLLBACK` bem-sucedido;
- Supabase CLI 2.105.0 em diretório isolado, histórico remoto terminando em
  `20260808152900`, arquivo único de 50.108 bytes e SHA-256
  `0acd4b89f59bd74030ecf65cdfecf3f55bc944d2a23748b48dd6018b5495ca08`;
- dry-run listando exclusivamente
  `20260808225424_canonical_category_label_reconciliation.sql`, seguido pelo
  `db push` no mesmo diretório, sem `--include-all` e sem `migration repair`;
- ledger local/remoto alinhado em `20260808225424`, proof oficial `target`
  bem-sucedido e leitura final com 87 alvos, 47 controles, 134 superfícies
  globais exatas, zero drift de labels, preços/contagens preservados e os três
  triggers em modo origin.
- QA read-only em produção com seis cenários HTTP 200: 11 cards em Cursos,
  6/6 UUIDs reconciliados visíveis e canônicos, aliases de query/tag/hash com o
  chip correto, duas publicidades inline e duas laterais no desktop, duas
  inline no mobile, zero overflow horizontal e busca `Tendencias` retornando
  exatamente o evento esperado; foram observados zero erros de console,
  página, request ou HTTP e zero tentativa de mutação do aplicativo.

A revisão editorial do Passe Livre permanece aberta; o rollout corrigiu apenas
a coerência estrutural com o root já publicado `oportunidades/bolsas`.
O modal de consentimento alto demais no viewport mobile permanece como débito
visual preexistente e não afeta a integridade do feed ou da reconciliação.

### Auditoria histórica de `20260806090000`

Atualização posterior: `20260806090000`, `20260808152850` e `20260808152900`
foram efetivamente aplicadas e verificadas. O texto abaixo preserva a evidência
e o raciocínio **anteriores** à janela, inclusive o snapshot em que `06090000`
ainda aparecia ausente; não deve ser lido como estado remoto atual.

A migration
`20260806090000_cadu_published_cache_index.sql` entrou no Git no commit
`add9409f`, mas, na inspeção somente leitura de 2026-08-08 às 19:57:40 UTC, **não
consta no ledger remoto** e os dois índices também não existem em produção. O
planner atual percorre o índice parcial `posts_highlight_score_idx` e ainda faz
`Sort` para os dois padrões do cache (`id ASC` e `created_at DESC, id DESC`). A
tabela tinha 791 linhas, 138 `published` e cerca de 8 MB; portanto os índices
dedicados continuam coerentes com o incidente `3cd1deef`, embora a aplicação
deva ser validada de novo à medida que a tabela crescer.

Os dois `CREATE INDEX` não usam `CONCURRENTLY` e podem bloquear writers. A
migration agora fixa `lock_timeout = '5s'` e `statement_timeout = '2min'`: uma
espera anormal aborta em vez de manter um writer indefinidamente na fila. Esses
limites valem por aquisição de lock e por statement, respectivamente; não são um
timeout da migration nem da janela inteira. Mesmo com a tabela pequena, deve
haver um operador único, freeze de outros executores de migrations e coordenação
do Cadu durante a janela inteira, do preflight às pós-condições.

`IF NOT EXISTS` não valida a definição de um índice homônimo e ainda decide
somente pelo nome, mas já não é aceito como prova de sucesso. Na mesma
transação, uma pós-condição resolve tabela, colunas e operator
classes pelo catálogo ativo e exige, para cada nome, exatamente `public.posts`,
`btree`, nenhum `INCLUDE` ou expressão extra, `indisvalid`, `indisready` e
`indislive`, predicate `status = 'published'`, e as chaves/opções completas:

- `id ASC NULLS LAST`, com `uuid_ops`;
- `created_at DESC NULLS FIRST, id DESC NULLS FIRST`, com
  `timestamptz_ops, uuid_ops`.

Os comentários também têm pós-condição. Um índice homônimo ausente, inválido ou
com qualquer definição divergente produz SQLSTATE dedicado e aborta a transação
inteira, inclusive qualquer índice recém-criado e a entrada no ledger. A prova
local muta cada homônimo separadamente, confirma a rejeição e compara o estado
antes/depois do `ROLLBACK`; também prova criação e replay idempotente. Uma prova
adicional executa o arquivo sem reescrita pelo Supabase CLI `2.105.0` em bancos
locais descartáveis: o caminho de sucesso confirma DDL e ledger, e uma falha
forçada depois do DDL confirma ausência tanto dos índices quanto da versão no
ledger. Essa versão do CLI é parte do contrato do rollout e não deve ser trocada
dentro da janela.

Não usar `migration repair --status applied`: isso afirmaria que um SQL ausente
foi executado. A solução correta é aplicar o SQL real da migration e deixar o
Supabase registrar a versão exata. O dry-run do clone completo confirmou que o
ledger remoto possui também lacunas históricas anteriores; nesse clone, usar
`--include-all` ofereceria migrations fora do escopo e é proibido.

O projeto autorizado para este rollout é exclusivamente
`wacyrkwhkvzwkqpolrbg`. O operador deve conferir esse valor no vínculo do
diretório isolado e na saída do CLI antes de cada comando. Não usar `--db-url`,
`SUPABASE_DB_URL` ou `DATABASE_URL`; qualquer project ref diferente, vínculo
ausente ou saída ambígua cancela a janela.

O procedimento seguro foi reproduzido sem escrita remota em um projeto Supabase
temporário. Para `06090000`, usar uma única etapa descartável e sem concorrência:

1. executar `supabase --version` e exigir exatamente `2.105.0`; qualquer outra
   versão cancela a janela até uma nova prova descartável do comportamento
   transacional de arquivo e ledger;
2. criar um diretório temporário, copiar somente a configuração/metadados de
   link necessários e executar `supabase migration fetch --linked` para
   materializar exatamente o histórico reconhecido pelo remoto. Confirmar o
   project ref `wacyrkwhkvzwkqpolrbg` e congelar qualquer outro operador;
3. acrescentar somente
   `20260806090000_cadu_published_cache_index.sql` e, já na janela autorizada,
   executar exatamente
   `supabase db push --linked --dry-run --include-all`. O `--include-all` é
   necessário porque `06090000` antecede a última versão remota, mas é permitido
   **somente nesse diretório isolado**. A saída deve listar somente
   `20260806090000_cadu_published_cache_index.sql`, sem outra migration, aviso de
   identidade ou erro;
4. sem copiar mais arquivos, sem refazer o fetch e imediatamente após esse gate,
   o mesmo operador deve executar, no mesmo diretório isolado, exatamente
   `supabase db push --linked --include-all --yes`. Se o dry-run mudar, ficar
   obsoleto ou não tiver listado um único arquivo, voltar ao passo 1 em novo
   diretório; nunca aplicar por inferência;
5. confirmar `06090000` uma vez no ledger e os dois índices na `public.posts`.
   Validar `indisvalid/indisready/indislive = true`, `btree`, ausência de INCLUDE
   e expressões, predicate, operator classes, sort/nulls, comentários e as
   definições exatas:
   `(id) WHERE status = 'published'` e
   `(created_at DESC, id DESC) WHERE status = 'published'`;
6. descartar o diretório. Para `152850`, criar outro a partir de novo
   `migration fetch --linked` e acrescentar somente
   `20260808152850_audited_category_metadata_reconciliation.sql`; o novo
   `db push --linked --dry-run` deve listar exclusivamente `152850`;
7. executar o preflight booleano, aplicar somente depois de autorização e
   confirmar alvo/ledger;
8. nunca copiar `20260808152900` para esses diretórios e abortar diante de
   qualquer migration adicional em qualquer dry-run.

O dry-run isolado de `06090000` já retornou exatamente o arquivo esperado; ele
não aplicou SQL nem alterou o ledger remoto.

Esse procedimento não altera nem “conserta” retroativamente o histórico: cada
versão só passa a constar depois que seu SQL real foi aplicado.

## Ordem de rollout e checklist

### Antes da janela

- [ ] Confirmar que os diffs de taxonomia, filtros, modal, busca e publisher são compatíveis com as chaves finais.
- [ ] Fazer backup/snapshot integral dos 49 UUIDs, incluindo as seis superfícies de categoria, `tags`, `tagKeys`, status, aliases de datas e campos removidos por módulo.
- [ ] Registrar contagens por `status/module/category/visibility` com timestamp e papel da consulta.
- [ ] Interromper ou coordenar writers do Cadu durante o preflight e a migration para eliminar corrida.
- [ ] Executar o proof/preflight de produção em transação, sob freeze de writers, e exigir os 49 UUIDs/fingerprints atuais.
- [ ] Usar uma sessão PostgreSQL que comece em `session_replication_role=origin`; o proof mantém os três triggers reais habilitados, adquire lock e reverte migration, mutantes e efeitos de trigger no `ROLLBACK` final. O modo `replica` fica restrito ao runner local isolado.
- [ ] Se houver terceiro estado, **parar**; não ajustar fingerprint nem forçar update sem nova auditoria.

### Aplicação

1. Confirmar que o código compatível de taxonomia/resolver e as validações do publisher já estão ativos antes da janela semântica.
2. As migrations `20260808152842`, `20260808152843` e `20260808152845` já estão
   registradas em produção. Antes da reconciliação residual, aplicar e registrar
   a migration histórica realmente pendente `20260806090000` pelo procedimento
   isolado acima.
3. Em uma segunda etapa isolada, aplicar somente
   `20260808152850_audited_category_metadata_reconciliation.sql`, depois que o
   preflight retornar todas as capacidades `true`.
4. Manter `20260808152900_semantic_post_reclassification.sql` fora de ambos os
   diretórios. O gate upstream do Cadu/Edge já foi entregue, mas a migration
   continua sem execução até seu proof final sob freeze. O `supabase db push`
   deste clone completo não oferece limite por versão e continua proibido para
   esse rollout.
5. Reexecutar a prova de produção da reconciliação; os dois UUIDs residuais
   devem estar no alvo e `152850` deve ser idempotente.
6. Para a etapa semântica, criar um terceiro diretório a partir de novo
   `migration fetch --linked`, acrescentar somente `20260808152900`, congelar
   writers, salvar o snapshot integral dos 49, executar antes o runner local
   `npm run test:db:semantic-post-reclassification` e então o proof transacional.
   O dry-run deve listar exclusivamente `152900`; qualquer drift ou versão extra
   cancela a janela.
7. Aplicar `152900` somente depois desse gate, confirmar 49 alvos/5 movimentos/4
   status, replay sem update/audit e as contagens projetadas atuais.
8. Invalidar ou renovar caches de feed sem reintroduzir snapshots anteriores.
9. Liberar writers somente depois das pós-condições e do smoke RLS/feed/busca.

### Smoke test pós-deploy

- [ ] Conferir as contagens atuais projetadas de 134 `published`, 301 `hidden`, 341 `closed` e 15 `deleted` (791 totais) e os deltas `-4/+3/+1/0`.
- [x] Verificar trilho superior, estado `is-overflow-end`, setas e rolagem por mouse/touch em eventos e oportunidades; desktop e mobile foram validados no deploy `dfa34f97`.
- [x] Validar filtros laterais de data e categoria, inclusive combinação com o trilho superior; `Palestras` e `Este mês` passaram, incluindo evento que atravessa a virada do mês.
- [ ] Abrir amostras dos 5 movimentos de módulo e confirmar ausência de campos incompatíveis.
- [x] Validar singular/plural/acentos na busca; `Tendencias` encontrou `Tendências em Agentes de IA` e não restaram raízes singulares conhecidas após a canonicalização mecânica.
- [x] Confirmar que troca de filtro reinicia cursor/paginação e que “Carregar mais” não duplica cards; Eventos passou em 12/23/35 publicações com 2/4/7 anúncios, sempre um anúncio a cada cinco publicações e nunca anúncios consecutivos.
- [ ] Testar moradia, compra-venda, caronas e achados-perdidos com fixtures, pois não havia `published` no snapshot.
- [ ] Confirmar que `hidden`/`deleted` não aparecem para usuário anônimo nem autenticado sem permissão.
- [ ] Observar logs de RPC, erros de schema, cache e publisher durante ao menos um lote completo do Cadu.

## Rollback

1. Se o preflight ou a migration abortar, a transação não deve deixar escrita parcial. Investigar o UUID divergente e gerar novo fingerprint somente após revisão.
2. Se a migration já tiver sido aplicada e houver erro semântico, não editar a migration aplicada. Criar uma migration posterior de correção.
3. A reversão deve ser UUID a UUID, usando o snapshot integral pré-deploy, e só pode restaurar a origem quando o registro ainda corresponder ao fingerprint-alvo. Restaurar também labels e arrays na ordem original; não fazer reversão fuzzy ou por categoria inteira.
4. Nos 5 movimentos de módulo, restaurar também os campos compatíveis da origem; uma simples troca de `module/category` perde dados removidos.
5. Rollback de código e rollback de dados são independentes. Manter compatibilidade entre versão do frontend, RPCs e schema durante toda a janela.
6. Se for necessário reverter canonicalização ou busca, criar migration forward que restaure função/índice anterior e planejar a janela de lock/rebuild.
7. Reexecutar contagens, RLS anônima, filtros, busca, paginação e cache após qualquer rollback.

## Evidências versionáveis

- [Migration das 49 correções](../../supabase/migrations/20260808152900_semantic_post_reclassification.sql)
- [Filtro de data por intervalo de eventos](../../supabase/migrations/20260808152842_feed_event_interval_filters_20260808.sql)
- [Proof SQL do intervalo de eventos](../../tests/sql/feed-event-date-interval-proof.sql)
- [Canonicalização de taxonomia do feed](../../supabase/migrations/20260808152843_feed_taxonomy_canonicalization_20260808.sql)
- [Alinhamento de cursor e busca remota](../../supabase/migrations/20260808152845_align_feed_cursor_remote_search_20260808.sql)
- [Reconciliação auditada de dois metadados residuais](../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql)
- [Contrato da reconciliação residual](../../tests/contract/audited-category-metadata-reconciliation-migration.test.js)
- [Preflight real somente leitura da reconciliação residual](../../tests/sql/audited-category-metadata-reconciliation-production-preflight.sql)
- [Proof SQL de replay da reconciliação residual](../../tests/sql/audited-category-metadata-reconciliation-replay-proof.sql)
- [Runner local seguro da reconciliação residual](../../scripts/test-audited-category-metadata-reconciliation.js)
- [Contrato da migration semântica](../../tests/contract/semantic-post-reclassification-migration.test.js)
- [Proof SQL de produção](../../tests/sql/semantic-post-reclassification-proof.sql)
- [Proof SQL de replay](../../tests/sql/semantic-post-reclassification-replay-proof.sql)
- [Runner local seguro da migration semântica](../../scripts/test-semantic-post-reclassification.js)
- [Schema canônico do modal de criação](../../assets/js/features/create-post/kc-create-post.schema.js)
- [Resolver compartilhado de taxonomia](../../assets/js/utils/kc-utils.taxonomy.js)
- [Testes do resolver](../../tests/unit/kc-utils-taxonomy.test.js)
- [Schema do publisher Cadu](../../supabase/functions/cadu-publish/schema.ts)
- [Mapper do publisher Cadu](../../supabase/functions/cadu-publish/mapper.ts)
- [Quality gate do publisher Cadu](../../supabase/functions/cadu-publish/index.ts)
- [Auditoria histórica de reclassificação de ativos](../qa/reports/report-v76-active-posts-reclassification-2026-08-05.md)

## Conclusão

As 49 mudanças são uma correção semântica fechada, verificável e de alta confiança; não são uma tentativa de “adivinhar” todo caso limítrofe. O frontend, Cadu/Edge, `06090000`, `152850`, `152900` e a reconciliação estrutural `225424` foram entregues e verificados. O estado final é 791 linhas, distribuídas em 134 `published`, 301 `hidden`, 341 `closed` e 15 `deleted`; os 134 publicados têm root canônico, seis superfícies exatas e zero label divergente. O Passe Livre continua em revisão editorial separada.
