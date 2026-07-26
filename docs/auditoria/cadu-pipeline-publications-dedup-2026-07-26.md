# Auditoria da pipeline, publicações e deduplicação Cadu - 2026-07-26

## Resumo executivo

Esta intervenção confrontou quatro fontes de evidência:

1. código executado pelo OpenClaw no VPS;
2. relatórios JSON do `dedup-kino.js`;
3. estado atual das tabelas `posts` e `post_media` no Supabase;
4. fontes oficiais das publicações que exigiram correção de data ou imagem.

Foram confirmados e tratados três problemas independentes:

- publicações do mesmo evento ou oportunidade entravam por fontes diferentes;
- regras antigas de deduplicação podiam ocultar conteúdos distintos quando havia URL ou imagem compartilhada;
- a coleta estruturada de `events.json` aceitava `IconeX.png`, imagem institucional genérica do Weby, sem passar pelo filtro aplicado às páginas HTML.

Resultado da correção de dados:

- 14 publicações duplicadas foram ocultadas, preservando 13 publicações canônicas;
- 13 canônicas receberam histórico explícito de consolidação entre fontes;
- 8 canônicas tiveram módulo, categoria, prazo ou expiração corrigidos;
- 1 prazo classificado incorretamente foi removido;
- 3 publicações inválidas foram ocultadas;
- 5 referências de capa genérica foram substituídas ou alinhadas a mídia
  específica e verificada;
- nenhuma linha foi excluída da tabela `posts`;
- o estado observado após a intervenção é 704 posts: 140 `published`, 289 `hidden`,
  261 `closed` e 14 `deleted`.

## Nível de certeza

### Fatos observados

- Os números acima foram consultados diretamente no Supabase em 2026-07-26.
- Cada ocultação nova registra `hidden_by_dedup`, `hidden_reason`,
  `merged_into_post_id`, `dedup_method`, `dedup_evidence` e
  `manual_data_corrections`.
- O dry-run anterior à correção analisou 142 posts dos últimos 30 dias e planejou
  11 revisões.
- O dry-run intermediário, antes de reparar as capas, analisou 130 posts, não
  planejou ocultações e manteve 6 revisões manuais.
- O dry-run final, após código e capas corrigidos, analisou 130 posts, enviou
  15 pares à classificação semântica, não planejou ocultações e manteve apenas
  4 revisões manuais.
- `parseEventItem()` consumia `ev.image` diretamente, contornando o filtro de
  imagens institucionais usado na hidratação HTML.
- `image-source-resolver.js` documentava `minBytes` configurável, mas usava
  `1000` bytes de forma fixa.

### Inferências sustentadas

- Os pares formados apenas por `IconeX.png` foram consequência do bypass em
  `events.json`, e não evidência de conteúdos duplicados.
- A mesma capa em cursos da SRI é uma arte de campanha reutilizada. O conteúdo,
  permalink, título e objeto dos cursos são distintos.

### Hipóteses descartadas

- Imagem idêntica não implica publicação idêntica.
- URL canônica idêntica não implica publicação idêntica quando a URL é uma
  listagem agregadora, como a página de processos seletivos da FUNAPE.
- Título semelhante não basta quando existem números de processo, programas,
  cursos, datas ou objetos incompatíveis.

## Duplicatas entre fontes confirmadas

| Conteúdo canônico | Publicações ocultadas | Motivo |
|---|---:|---|
| IX Simpósio em Educação Inclusiva (`59f21854`) | `ac85421d` | Site de eventos e Instagram descrevem o mesmo simpósio |
| PPGBRPH mestrado/doutorado (`2b87dc83`) | `986f3fc8` | Notícias de unidades diferentes descrevem o mesmo edital |
| GIMON 2026 (`6b92fc98`) | `15da6e98` | Página da FANUT e agenda UFG descrevem a mesma conferência |
| Vestibular UFG 2027 (`7d245895`) | `4804d459`, `eba0b045` | Instagram, Verbena e notícia institucional descrevem o mesmo processo |
| Instituto Confúcio - matrículas (`55008a05`) | `dfcb4f27` | Publicação existente e notícia UFG descrevem a mesma oferta |
| IsF Português - Cine Debate B1 (`ba140334`) | `0042c333` | Site IsF e Instagram descrevem o mesmo curso |
| XXX Semana de Filosofia (`ce24a542`) | `905ff707` | Formulário/fonte original e notícia FAFIL descrevem o mesmo evento |
| CERISE Summit 2026 (`2bafb8b5`) | `85eb5e3d` | Site EMC e Instagram descrevem o mesmo summit |
| PPGMTSP - mestrado e doutorado (`e46c28f6`) | `5496f706` | Agregador e notícia IPTSP descrevem o mesmo processo |
| PPGAC - aluno especial (`2ab9a52e`) | `928a9c20` | Agregador e site do programa descrevem a mesma seleção |
| Centro de Línguas - matrículas (`0ac23479`) | `b4af34f8` | Site do Centro de Línguas e Instagram descrevem a mesma matrícula |
| PPGNUT - aluno especial (`59400ff5`) | `e048b4af` | Site e Instagram descrevem a mesma seleção |
| PPGS - aluno especial (`f522ebea`) | `3a52017a` | Agregador e site do programa descrevem a mesma seleção |

Os identificadores abreviados são prefixos dos UUIDs gravados no Supabase. As
duplicatas permaneceram consultáveis como `hidden`; não houve perda física de
descrição, mídia ou metadados.

## Pares que devem permanecer publicados

O relatório posterior deixou apenas revisão humana, sem `hide` automático:

- FUNAPE nº 41/2026 versus nº 38/2026: processos e cargos diferentes, apesar da
  mesma URL agregadora;
- Curso de Inglês "Compreensão Oral - Palestras e Aulas" versus "Comunicação
  Intercultural": cursos diferentes;
- "Comunicação Intercultural" versus "Compreensão oral - estratégias": cursos
  diferentes;
- "Compreensão oral - estratégias" versus "Estratégias de Leitura": cursos
  diferentes.

Antes da troca das capas, o relatório também sinalizava SBHC, Enlic e Saúde
Indígena porque os três posts compartilhavam a mesma imagem genérica. Esses
pares não são duplicatas e desapareceram do relatório final.

## Correções nas capas

| Post | Problema | Correção |
|---|---|---|
| `6be33ea9` - 20º Seminário Nacional da SBHC | capa armazenada derivada de `IconeX.png` | substituída pelo cartaz específico do seminário |
| `4addd028` - II Enlic-CO / VIII Eleb / Prolicen | capa armazenada derivada de `IconeX.png` | substituída pelo cartaz específico do encontro |
| `d252919e` - 4ª edição do Programa de Saúde Indígena | `posts.image_url` apontava diretamente para `IconeX.png` | alinhada à mídia oficial já presente em `post_media` |
| `a8a3f0e5` - VI Seminário Internacional EaD / IV Conect EaD | `posts.image_url` ainda apontava para `IconeX.png` | alinhada ao cartaz específico já marcado como capa em `post_media` |
| `752300fd` - II Jornada Música na Infância | `posts.image_url` e metadados de capa estavam incompletos | alinhados à arte específica já marcada como capa; a segunda arte foi preservada na galeria |

Para os cinco posts, `posts.image_url`, `metadata.image_url` e
`metadata.cover_url` passaram a apontar para a mídia marcada como capa em
`post_media`. `metadata.gallery_image_urls` preserva apenas mídias específicas,
com a capa na primeira posição. Cada alteração registra o valor anterior em
`manual_data_corrections`, versão `cadu-image-placeholder-v1`.

A varredura final dos 140 posts `published` retornou zero ocorrências ativas de
`IconeX.png`, `/weby/assets/` ou `/assets/ufg*/` em `posts.image_url`, campos de
capa/galeria do `metadata` e `post_media`.

## Funcionamento revisado por estágio

### 1. Curadoria

`cadu-curador-v4.4.js` recebe fontes HTML, feeds estruturados e `events.json`.
Agora `parseEventItem()` envia `ev.image` para a mesma normalização usada nas
páginas hidratadas. URLs conhecidas de placeholder resultam em string vazia,
permitindo que estágios posteriores tentem uma fonte melhor.

### 2. Formatação

`formatador-ia.js` descarta explicitamente placeholders antes de montar a lista
de imagens. A formatação não pode reintroduzir uma imagem institucional que o
curador rejeitou.

### 3. Resolução e enriquecimento

`lib/image-source-resolver.js` rejeita placeholders antes de qualquer download,
respeita `minBytes` e `timeoutMs` configurados e devolve apenas candidatos
normalizados. `enrich-images.js` aplica o mesmo contrato às imagens extraídas de
fontes complementares.

### 4. Publicação

`publish_auto_v5.js` faz uma última filtragem fail-closed, remove valores vazios
após normalização e não envia `IconeX.png`, `/weby/assets/` ou `/assets/ufg*/`
ao Supabase Storage.

### 5. Deduplicação

A identidade usa URL canônica, permalink do Instagram, slug Weby, sinais
textuais, conflitos semânticos e evidência de imagem. As regras consolidadas:

- URL, título ou imagem isolados não autorizam ocultação;
- igualdade de imagem é evidência de apoio, nunca decisão autônoma;
- números de processo, programas, cursos, datas e objetos diferentes bloqueiam
  o merge;
- publicação `hidden` por auditoria ou moderação não é reativada;
- duplicidade confirmada preserva uma canônica e registra vínculo reversível.

## Relatórios operacionais

- Pré-correção:
  `/docker/openclaw-hahq/data/.openclaw/workspace/data/dedup-reports/dedup-2026-07-26-pre-correction.json`
- Pós-correção:
  `/docker/openclaw-hahq/data/.openclaw/workspace/data/dedup-reports/dedup-2026-07-26.json`
- Snapshot final após correção de imagens:
  `/docker/openclaw-hahq/data/.openclaw/workspace/data/dedup-reports/dedup-2026-07-26-post-image-fix.json`

Comparativo:

| Métrica | Pré-correção | Intermediário | Final |
|---|---:|---:|---:|
| Posts no recorte de 30 dias | 142 | 130 | 130 |
| Candidatos textuais | 72 | 43 | 43 |
| Grupos por hash exato de imagem | 2 | 2 | 1 |
| Pares por hash exato de imagem | 4 | 9 | 6 |
| Pares por imagem perceptualmente similar | 9 | 7 | 7 |
| Pares classificados pela IA | 0 | 0 | 15 |
| Ações de revisão | 11 | 6 | 4 |
| Ocultações automáticas planejadas | 0 | 0 | 0 |

Os seis pares por hash do relatório final são as combinações entre quatro
cursos SRI que reutilizam a mesma arte. A decisão final reduziu esses sinais a
três revisões e manteve todos os cursos. A quarta revisão é o par FUNAPE nº
41/2026 versus nº 38/2026, também mantido por conflito explícito entre números
de processo.

## Curadoria horária e Feed Coletado

O cron de 2026-07-26 iniciou às 17:20:02 UTC e terminou às 17:32:19 UTC:

- run `a7fee871-38ff-43f0-89e0-8c7b40e7d731`;
- coleta diária site-only, sem IA, Instagram ou publicação;
- 18 itens para revisão e 2.489 descartes, dos quais 1.169 expirados e 366
  duplicados;
- candidato validado com SHA-256
  `8526f4e848a89a8a5e9deb0eb02bcc74172fa32ee68b96c0365ba379acfca3ec`;
- promoção atômica para
  `data/ufg-scrape/curadoria-v4.4-daily-2026-07-26.json`;
- candidato privado removido após a promoção (`cleanupPending=false`).

Esse processo começou antes da implantação do commit `489e398`, por isso seu log
ainda mostra `IconeX.png` em dois candidatos. Isso é evidência do runtime antigo,
não regressão do código implantado depois. O publisher atual rejeita esses
valores mesmo que um artefato anterior ainda os contenha; o próximo cron passa a
coletar com o filtro novo.

Após o restart do `cadu-api`, o healthcheck mostrou `cache_warm=false` até a
primeira leitura, comportamento esperado do cache lazy. Uma chamada autenticada
a `/api/feed?limit=1&offset=0&with_meta=true` carregou o snapshot e confirmou:

- `status=ready`;
- 44 itens;
- 2 artefatos válidos e 0 inválidos;
- `stale=false`;
- diagnóstico da fonte associado ao artefato diário de 2026-07-26.

O healthcheck posterior passou a informar `cache_warm=true`, 2 artefatos e feed
não obsoleto. Portanto não houve indisponibilidade do Feed Coletado nem timeout
da curadoria; houve apenas cache ainda não lido após o restart.

## Código, testes e implantação

- OpenClaw PR `#91`: identidade entre fontes, deduplicação, conflitos
  semânticos e proteção contra reativação; merge
  `af401a6d922d2c7095fc01cb4fe0cdebff80653f`.
- OpenClaw PR `#92`: contrato compartilhado de rejeição de placeholders; merge
  `489e398a59237dd1fd62364c2ef46795fc72ca53`.
- Suite OpenClaw: 51/51 testes aprovados.
- Espelho KinoCampus: 256 suites, 4.624 testes e 3 snapshots aprovados.
- Registro de fontes espelhado e fixado no commit OpenClaw
  `489e398a59237dd1fd62364c2ef46795fc72ca53`.
- VPS implantado no commit `489e398a59237dd1fd62364c2ef46795fc72ca53`,
  com árvore Git limpa.
- `openclaw-hahq-cadu-api` e `openclaw-hahq-openclaw-1` estavam `healthy`.
- O Gateway respondeu `ok=true`, `status=live`; o CDP respondeu Chrome
  `149.0.7827.196`, protocolo `1.3`, na porta interna efetiva `18800`.
- Os hashes SHA-256 dos seis scripts alterados são idênticos no release e no
  bind mount `/data/.openclaw/workspace/scripts`.

## Riscos residuais e próximas ações

1. Manter os quatro pares FUNAPE/SRI como revisão humana, sem auto-hide.
2. Acrescentar identidade de item às fontes agregadoras sempre que o site
   fornecer número de processo, edital ou curso.
3. Monitorar por sete dias os contadores `flag_review`, `hidden_by_dedup` e
   bloqueios de reativação.
4. Tratar ausência de imagem como estado válido. Uma publicação sem imagem é
   preferível a uma publicação com capa falsa.
5. Nunca restaurar automaticamente mídia ou status a partir de metadados
   antigos sem verificar `moderation_reason` e `cadu_reactivation_block`.
6. Manter o relatório de deduplicação como artefato consultável no Admin Cadu,
   distinguindo `review`, `merge`, `hide` e `skip`.
