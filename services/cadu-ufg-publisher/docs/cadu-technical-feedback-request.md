# Cadu Technical Feedback Request

Atualizado em: 2026-05-21

## Objetivo

Este documento e a pauta que o Cadu Bot deve responder para melhorar a curadoria UFG -> Kino Campus. A resposta deve ser tecnica, verificavel e baseada em exemplos reais de execucoes recentes.

Nao envie segredos. Redija tokens, senhas, cookies, chaves Supabase, chaves DeepSeek, IDs sensiveis de Telegram e qualquer credencial de servidor.

## Contexto Que O Cadu Deve Considerar

O Kino Campus precisa que o Cadu publique principalmente nos modulos:

- `eventos`: eventos academicos, workshops, culturais, esportivos, sustentabilidade e festas oficiais/relevantes.
- `oportunidades`: monitoria, pesquisa, estagios, voluntariado, empregos e freelancer.

As fontes UFG devem priorizar interfaces estruturadas do Weby:

1. `robots.txt`
2. `/news.json`
3. `/events.json`
4. `/feed`
5. `sitemap.xml`
6. HTML como fallback

Referencias oficiais relevantes:

- Weby JSON: https://weby.cercomp.ufg.br/p/17210-doc-da-api-json
- Weby RSS/Atom: https://weby.cercomp.ufg.br/n/40789-componente-rss-e-atom

## Formato Esperado Da Resposta Do Cadu

Responda em Markdown com estas secoes:

1. `Resumo executivo`
2. `Arquivos e versoes em execucao`
3. `Pipeline de busca`
4. `Pipeline editorial`
5. `Pipeline de imagens e midia`
6. `Payload Kino Campus`
7. `Qualidade, revisao e publicacao`
8. `Fontes UFG e cobertura`
9. `Falhas, gargalos e riscos`
10. `Arquivos solicitados`
11. `Perguntas para o Codex/Yan`
12. `Propostas de melhoria priorizadas`

Sempre inclua pelo menos:

- 3 exemplos reais de itens publicados ou prontos para revisao;
- 3 exemplos reais de itens descartados corretamente;
- 3 exemplos reais de falhas ou casos ambiguos;
- 1 payload completo redigido de `eventos`;
- 1 payload completo redigido de `oportunidades`;
- 1 exemplo de noticia institucional que foi descartada e o motivo tecnico;
- 1 exemplo de edital/PDF processado e o resumo extraido.

## Perguntas Tecnicas

### 1. Ambiente, versao e operacao

1. Qual commit exato do repositorio esta rodando no VPS/Hostinger? Informe `git rev-parse HEAD`, branch, `git status --short` e se existem alteracoes locais nao versionadas.
2. O codigo do Cadu que esta em producao e exatamente o mesmo que esta no GitHub? Se nao, liste cada arquivo divergente e explique por que ainda nao foi enviado.
3. Quais comandos reais estao rodando para `quick`, `full`, `dry-run`, `publish` e `reviews`?
4. Quais timers `systemd` estao ativos, com quais horarios, usuario Linux, `WorkingDirectory`, `EnvironmentFile` e logs?
5. Qual versao do Node, npm, sistema operacional, `pdftotext` e dependencias auxiliares estao instaladas?
6. O Cadu esta rodando sempre com `CADU_REVIEW_BEFORE_PUBLISH=true`? Em quais situacoes ele publica automaticamente?
7. Existe diferenca entre o comportamento quando Yan conversa pelo Telegram e quando o comando roda via timer?
8. Como o Cadu impede execucoes simultaneas de `quick` e `full` que possam duplicar posts ou bater no limite de flood?
9. Onde ficam os logs persistentes? Qual e a politica de retencao, rotacao e tamanho maximo?
10. Qual e o procedimento atual para rollback de um post ruim publicado pelo Cadu?

### 2. Busca, fontes UFG e descoberta

1. Para cada fonte em `config/sources.json`, qual endpoint esta funcionando hoje: `news.json`, `events.json`, `feed`, `sitemap.xml`, HTML ou nenhum?
2. Quais fontes retornam `robots.txt` valido? Quais bloqueiam algo relevante para o Cadu?
3. Para sites Weby, o Cadu usa `page`, `per_page`, `sort`, `direction`, `tags`, `search` e `search_type`? Se usa, quais parametros por fonte?
4. Qual `per_page` esta sendo usado por fonte? Ha risco de perder noticias por paginacao insuficiente?
5. O Cadu percorre mais de uma pagina de `/news.json` ou apenas a primeira?
6. Como o Cadu decide que uma fonte e "rapida" ou "completa" na pratica? Ha alguma promocao dinamica por volume/qualidade de publicacoes?
7. Como o Cadu trata conteudo replicado entre `ufg.br`, SECOM e unidades academicas?
8. Existe prioridade editorial por fonte, por exemplo PRPI/PROGRAD/PROEX acima de noticias gerais?
9. Quais fontes UFG falham por DNS, TLS, timeout, 403, 404, HTML quebrado ou schema inesperado?
10. Para cada fonte problemática, qual e a taxa de falha nos ultimos 10 runs?
11. O Cadu coleta `ETag`, `Last-Modified` ou hash de corpo para reduzir downloads repetidos?
12. O Cadu respeita rate limit por host? Qual intervalo minimo entre requisicoes por dominio?
13. Como o Cadu identifica que uma pagina e carregada por JavaScript e precisa de browser/proxy/fallback?
14. Quais sites oficiais de unidades academicas/administrativas ainda faltam no `sources.json`?
15. Ha fontes com URL antiga, alias ou dominio alternativo que deveriam ser fundidas?
16. Como o Cadu lida com anexos hospedados em dominios externos oficiais, como formularios, Even3, Fapeg, sistemas do governo, Drive institucional ou Instagram?
17. Ele diferencia fonte primaria oficial de republicacao/espelho? Como registra essa decisao em `metadata`?
18. Como o Cadu valida que o link final publicado e uma pagina da propria UFG/unidade ou de um parceiro oficial?

### 3. Extracao de conteudo

1. Para Weby JSON, quais campos reais chegam em `title`, `summary`, `text`, `image`, `image_url`, `redirect_url`, `slug`, `id`, `updated_at`, `date_begin_at` e `created_at`?
2. Mostre um item bruto completo de `/news.json` e um de `/events.json`, redigindo dados sensiveis se necessario.
3. O Cadu usa `redirect_url` como fonte final? Em quais casos isso quebra ou melhora a canonicalizacao?
4. O extrator HTML captura `<article>`, `<main>`, meta description e `og:*`; quais sites fogem desse padrao?
5. Como ele normaliza acentos, cedilhas, entidades HTML e whitespace? Ainda existe algum caso de perda de acentuacao?
6. Como ele separa texto editorial de menu, rodape, breadcrumbs, legenda de imagem e blocos de compartilhamento?
7. Como ele detecta links de editais dentro do corpo da noticia? Ele preserva o texto do link como label?
8. Como ele detecta multiplos documentos, retificacoes, anexos, formularios e resultados?
9. Como ele trata PDFs grandes, protegidos, escaneados ou sem texto extraivel?
10. Qual limite de tamanho de PDF esta configurado? Quantos PDFs foram recusados por tamanho?
11. O Cadu detecta tabelas de cronograma dentro de HTML ou PDF? Se sim, como transforma em linhas Markdown?
12. Como ele diferencia datas de publicacao da noticia de datas de inscricao, evento, recurso, resultado e homologacao?
13. Como ele evita publicar datas antigas citadas historicamente no texto?
14. Como ele detecta local do evento quando a fonte usa expressões como "Sala X", "Auditorio", "Campus Samambaia", "Regional Goias" ou modalidade online?
15. O Cadu extrai contatos como email, telefone, formulario, sistema de inscricao e perfil institucional?
16. Como ele lida com imagens SVG, imagens sem extensao, imagens relativas, CDN, hotlink bloqueado ou imagem muito pequena?

### 4. Classificacao, relevancia e descarte

1. Quais termos de inclusao mais geram falsos positivos?
2. Quais termos de exclusao mais geram falsos negativos?
3. O score atual separa bem `eventos` de `oportunidades`? Traga exemplos de erro.
4. Como o Cadu decide entre `oportunidades/pesquisa`, `oportunidades/monitoria`, `oportunidades/voluntariado` e `eventos/academicos` quando uma noticia mistura edital, curso e projeto?
5. Como ele trata editais PRPI/Fapeg, PIBIC/PIVIC, mobilidade e chamadas de pesquisa?
6. Como ele trata cursos de extensao: evento, workshop ou oportunidade?
7. Como ele trata calendario academico: evento, oportunidade ou descartar?
8. Como ele trata processo seletivo de aluno especial, pos-graduacao, concurso, residencia e monitoria?
9. Como ele trata noticias institucionais com acao indireta, por exemplo "UFG abre inscricoes para..." dentro de uma materia mais geral?
10. Qual regra temporal esta sendo usada para `deadline_past`, `event_past` e datas ambiguas?
11. O Cadu consegue detectar prazo sem ano e inferir o ano correto? Quais casos falham perto da virada do ano?
12. Como ele calcula duplicidade por URL canonica, hash de conteudo e similaridade de titulo?
13. Ele detecta duplicata entre uma noticia da SECOM e uma noticia republicada pela unidade academica?
14. Como ele decide entre atualizar um post existente e criar um novo post?
15. Quais foram os ultimos 20 itens descartados e seus motivos tecnicos?
16. Quais foram os ultimos 20 itens enviados para revisao e quais campos impediram auto-publicacao?
17. Quais categorias do Kino estao subutilizadas ou recebendo classificacoes erradas?
18. Que dados seriam necessarios do Kino para melhorar o score, por exemplo cliques, saves, votos, comentarios ou denuncias?

### 5. Descricao, Markdown e estilo editorial

1. Qual prompt real esta sendo enviado ao DeepSeek para resumo/descricao? Envie uma versao sem segredos.
2. O modelo recebe o HTML bruto, texto extraido, links, PDFs, classificacao e schema do Kino? Em qual ordem?
3. Como o Cadu garante que o modelo nao invente prazo, local, requisito, bolsa, quantidade de vagas ou link?
4. Qual e o fallback quando o modelo falha, demora ou retorna texto generico?
5. Quais heuristicas removem boilerplate institucional como "mais de 35 mil alunos"?
6. Como ele evita duplicar cronograma quando o modelo ja incluiu datas no resumo?
7. Como ele decide quando criar secoes `Edital`, `Editais e documentos`, `Datas importantes` e `Fonte oficial`?
8. Qual e o limite real aplicado para titulo e descricao antes de enviar ao Kino?
9. Como ele escolhe emojis e como evita poluicao visual?
10. O Markdown gerado esta 100% compativel com o render atual do Kino? Quais recursos ainda nao renderizam?
11. Mostre 3 descricoes boas e explique por que funcionaram.
12. Mostre 3 descricoes ruins ou superficiais e a causa raiz.
13. Em noticias com varios editais, como ele decide quantos links individuais listar na descricao e quantos guardar so em metadata?
14. Como o Cadu deve escrever quando a fonte nao informa local, data ou contato?
15. Como ele deve escrever quando o edital oficial prevalece sobre o resumo?
16. Como ele deve tratar retificacoes e resultados posteriores do mesmo edital?
17. Existe guia de tom para publicacoes do Cadu? Se nao, proponha um.
18. O Cadu valida a descricao final com uma checagem editorial automatica antes de enviar preview?

### 6. Payload e contrato Kino Campus

1. Envie um payload completo, redigido, de um post `eventos` gerado pelo Cadu.
2. Envie um payload completo, redigido, de um post `oportunidades` gerado pelo Cadu.
3. Quais campos do modal `kc-create-modal` ainda nao sao preenchidos pelo Cadu?
4. Quais campos o Cadu preenche mas o frontend/Kino ignora?
5. Para `eventos`, o Cadu sempre preenche `localizacao`, `metadata.data_evento`, `metadata.hora_evento`, `metadata.link`, `metadata.link_as_cta` e `metadata.gratuito` quando possivel?
6. Para `oportunidades`, o Cadu sempre preenche `area`, `areaKey`, `modalidadeTrabalho`, `contato`, `remuneracao`, `metadata.link` e `metadata.link_as_cta` quando possivel?
7. Como ele define `categoria`, `categoriaKey`, `subcategoria`, `subcategoriaKey`, `tags` e `metadata.subcategory`?
8. Como ele usa `metadata.source_url`, `source_host`, `source_unit`, `source_id`, `content_hash`, `confidence_score`, `deadline_date`, `event_date_detected`, `temporal_status` e `cadu_run_id`?
9. O Cadu esta gravando `posts.image_url` em producao? Traga evidencia de um SELECT redigido.
10. O Cadu esta gravando `post_media` com `is_cover=true`? Traga evidencia redigida.
11. O payload ainda envia `imagens[]`? Como esse campo se relaciona com `posts.image_url`, `metadata.image_url` e `post_media`?
12. Quando o upload da imagem falha, o Cadu usa URL externa como fallback? Isso aparece onde no payload e no digest?
13. Como o Cadu evita mais de 3 URLs externas no titulo/descricao para nao acionar moderacao?
14. O Cadu usa `KCAPI.createPost`, REST direto ou ambos? Justifique o caminho atual.
15. O Cadu usa `updatePost` para reparar posts proprios? Quando?
16. Como ele trata posts que ficam `pending` por moderacao/trust score?

### 7. Imagens, midia e capa

1. Qual e a cascata atual para escolher capa: `item.imageUrl`, `raw.image`, `raw.image_url`, `raw.cover`, `og:image`, primeira `<img>`, fallback?
2. Como o Cadu valida dimensao, tipo, extensao, MIME e tamanho da imagem?
3. Como ele converte ou descarta SVG?
4. Como ele trata imagem oficial que exige hotlink, cookie ou referer?
5. O Cadu faz upload para `kino-media` com qual path e nome?
6. Quais headers sao usados no upload para Supabase Storage?
7. Qual diferenca entre o upload que funciona no `publisher.js` e o curl manual que retorna 403?
8. Como o Cadu registra falha de upload no digest e no state?
9. O Cadu associa imagem a edital/evento correto em paginas com multiplas imagens?
10. Quais fontes oficiais mais frequentemente nao fornecem imagem util?
11. O Cadu deveria usar imagem gerada ou placeholder quando a fonte nao fornece imagem? Se sim, quais regras editoriais?
12. Como garantir que a imagem publicada nao seja decorativa errada, logo generico ou imagem de outra noticia?

### 8. Revisao via Telegram/e-mail

1. Qual e o formato atual do preview no Telegram?
2. O preview mostra titulo, modulo, categoria, descricao completa, imagem, fonte oficial, score, motivo e links de documentos?
3. Como o Yan aprova, rejeita, pede nova extracao ou edita antes de publicar?
4. O Cadu suporta botoes inline no Telegram ou apenas comandos textuais?
5. Como o Cadu evita publicar duas vezes se Yan aprovar o mesmo item mais de uma vez?
6. Onde ficam os itens pendentes de revisao no `state.json`?
7. O Cadu notifica por e-mail os mesmos previews ou apenas digest/erros?
8. Qual e o SLA de notificacao quando uma fonte quebra ou o modelo falha?
9. Que informacao falta no preview para Yan tomar decisao com seguranca?
10. Como o Cadu deveria responder quando Yan pedir manualmente "publique tal link"?

### 9. Observabilidade, auditoria e qualidade

1. Envie um digest completo recente, redigido, com publicados, revisao, descartados e fontes com problema.
2. Envie logs JSONL de uma execucao `quick` e uma `full`, redigindo segredos.
3. Quais metricas o Cadu ja mede por run?
4. Quais metricas faltam para avaliar qualidade editorial e performance?
5. O Cadu calcula taxa de publicacao por fonte, taxa de descarte, taxa de erro, tempo medio por fonte e quantidade de bytes baixados?
6. O Cadu salva motivo de decisao em formato estruturado ou apenas texto?
7. Como rastrear um post publicado de volta ate fonte, run, hash, PDF, imagem e prompt/modelo?
8. Como detectar que uma fonte mudou schema e passou a produzir posts ruins?
9. Como detectar que o DeepSeek melhorou/piorou a qualidade das descricoes?
10. Como o Cadu deveria montar um conjunto "golden" de exemplos para teste regressivo?
11. Quais testes unitarios/integracao faltam hoje?
12. Quais falhas deveriam virar alerta imediato e quais podem ir apenas para digest?

### 10. Seguranca, privacidade e compliance

1. Confirme que nao ha service role no ambiente do Cadu. Se houver, explique por que e onde.
2. Confirme que `.env.local` nao esta versionado e esta com permissao restrita.
3. Quais credenciais o Cadu precisa para operar e quais podem ser removidas?
4. Como o Cadu redige segredos em logs e digests?
5. O Cadu baixa e armazena PDFs localmente? Por quanto tempo?
6. O Cadu armazena dados pessoais de candidatos, contatos ou emails extraidos? Onde?
7. Como o Cadu evita publicar telefone/email pessoal quando o contexto e sensivel?
8. Como ele respeita `robots.txt`, rate limit e origem oficial?
9. Como ele lida com copyright de textos/imagens oficiais?
10. Existe risco de prompt injection vindo de HTML/PDF da fonte? Como mitigar?

### 11. Performance e robustez

1. Qual e o tempo medio de uma execucao `quick` e `full`?
2. Quais fontes consomem mais tempo e por que?
3. Quantas requisicoes sao feitas por run e por host?
4. Qual e a taxa de cache hit por `ETag`, `Last-Modified` ou state/hash?
5. O Cadu usa concorrencia? Qual limite global e por host?
6. Como funciona o retry/backoff em `EAI_AGAIN`, timeout, 429, 500 e TLS?
7. O `CADU_FETCH_PROXY_TEMPLATE` esta ativo? Qual proxy e usado, sem expor segredo?
8. O Cadu deveria usar browser/headless para Even3/Instagram ou e melhor manter esses casos em revisao/manual?
9. Como o Cadu evita processar os mesmos PDFs pesados em todo run?
10. Qual e o maior gargalo atual: DNS, HTTP, PDF, modelo, Supabase, Telegram ou classificacao?

### 12. Melhorias que o Cadu recomenda

1. Quais tres mudancas no codigo do Cadu trariam maior ganho de qualidade editorial?
2. Quais tres mudancas no schema/frontend do Kino facilitariam publicacoes melhores?
3. Quais tres fontes UFG deveriam ser adicionadas ou corrigidas primeiro?
4. Que campos de metadata deveriam virar campos nativos no banco?
5. Que comandos de Telegram deveriam existir para operar com menos atrito?
6. Que dashboards/admin views ajudariam a auditar o Cadu?
7. Como o Cadu propõe tratar posts antigos quando edital recebe retificacao ou resultado?
8. Qual arquitetura ele recomenda para separar crawler, classificador, gerador de texto, publicador e revisor?
9. Quais riscos tecnicos podem quebrar o fluxo nos proximos meses?
10. O que o Cadu precisa do Codex/Yan para operar melhor?

## Arquivos E Evidencias Que O Cadu Deve Enviar

Enviar caminhos e conteudos redigidos ou anexos, sem segredos.

### Obrigatorios

- `git rev-parse HEAD`
- `git status --short`
- `services/cadu-ufg-publisher/config/sources.json`
- `services/cadu-ufg-publisher/.env.example`
- lista redigida das variaveis realmente presentes em `.env.local`, apenas nomes e flags de preenchimento;
- `services/cadu-ufg-publisher/data/state.json` redigido ou uma amostra representativa;
- ultimo digest `quick`;
- ultimo digest `full`;
- logs JSONL ou console output dos ultimos runs;
- 1 payload redigido de `eventos`;
- 1 payload redigido de `oportunidades`;
- 3 previews Telegram recentes;
- resultado de `npm run test:cadu -- --coverage=false`;
- resultado de `npm run cadu:dry-run`;
- resultado de `npm run cadu:dry-run:full`.

### Codigo Essencial

Se houver alteracoes locais no VPS/OpenClaw que ainda nao estao no GitHub, enviar estes arquivos completos ou diff:

- `src/runner.js`
- `src/sources.js`
- `src/http-client.js`
- `src/robots.js`
- `src/extractors.js`
- `src/xml.js`
- `src/pdf.js`
- `src/classifier.js`
- `src/model.js`
- `src/mapper.js`
- `src/quality.js`
- `src/publisher.js`
- `src/reviews.js`
- `src/notifier.js`
- `src/state.js`
- `src/config.js`
- `src/utils.js`
- `systemd/*.service`
- `systemd/*.timer`

### Matrizes Recomendadas

Enviar uma tabela `source-health` com colunas:

```text
source_id,name,base_url,quick,tier,robots_status,news_json_status,events_json_status,feed_status,sitemap_status,html_fallback_status,last_success,last_error,error_rate_10_runs,items_seen,items_publishable,items_review,items_discard
```

Enviar uma tabela `publication-quality` com colunas:

```text
run_id,source_id,title,module,category,decision,confidence,temporal_status,has_pdf,pdf_count,has_image,image_strategy,description_warnings,duplicate_key,published_post_id,review_code
```

Enviar uma tabela `media-diagnostics` com colunas:

```text
run_id,source_id,item_url,image_candidate,image_origin,mime,bytes,width,height,upload_status,storage_path,posts_image_url,post_media_id,error
```

## Criterios Para Considerar A Resposta Boa

A resposta do Cadu sera considerada util se permitir:

- reproduzir uma execucao local sem depender do VPS;
- comparar codigo em producao contra codigo no GitHub;
- identificar fontes UFG com maior qualidade e maior falha;
- ver exatamente como um item vira payload do Kino;
- auditar por que cada item foi publicado, revisado ou descartado;
- corrigir imagem, cronograma, categoria e descricao sem tentativa cega;
- criar testes regressivos com exemplos reais;
- priorizar melhorias por impacto e risco.

## Observacoes Para O Cadu

- Nao responda apenas "esta funcionando". Traga evidencias.
- Nao envie segredos.
- Quando nao souber, diga "nao tenho essa telemetria hoje" e proponha onde instrumentar.
- Quando uma decisao for heuristica, mostre a regra e um exemplo onde ela falha.
- Quando houver sugestao de mudanca no Kino, indique o arquivo ou modulo provavel.
- Quando houver sugestao de mudanca no Cadu, indique o arquivo provavel e o teste que deveria cobrir.
