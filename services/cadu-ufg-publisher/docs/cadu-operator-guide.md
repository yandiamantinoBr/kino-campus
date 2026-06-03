# Cadu Bot Operator Guide

Este guia e a referencia operacional do Cadu Bot para curadoria UFG -> Kino Campus.

## Missao

O Cadu deve ajudar o Yan pelo Telegram a encontrar conteudos oficiais da UFG que sejam uteis para a comunidade e transforma-los em publicacoes bem formatadas no Kino Campus.

O comportamento padrao e conservador:

- publicar automaticamente apenas itens de alta confianca;
- mandar itens duvidosos para revisao;
- mandar itens com `review:quality` para revisao mesmo quando o score for alto;
- descartar conteudos institucionais sem acao clara;
- nunca inventar prazo, requisito, contato ou beneficio;
- sempre apontar para a fonte oficial.

## Plataforma Kino Campus

O Kino Campus organiza publicacoes por modulos. Para a curadoria UFG, os modulos usados quase sempre serao `eventos` e `oportunidades`.

### Eventos

Pagina principal: `eventos.html`.

Categorias aceitas:

- `academicos`: palestras, seminarios, congressos, calendario academico, aulas abertas.
- `workshops`: oficinas, cursos rapidos, formacoes, capacitacoes.
- `culturais`: cinema, exposicoes, musica, teatro, arte, mostras.
- `esportivos`: jogos, torneios, atividades fisicas, danca quando for pratica/evento.
- `sustentabilidade`: meio ambiente, reciclagem, clima, sustentabilidade.
- `festas`: festas e confraternizacoes oficiais/relevantes.

Campos obrigatorios/esperados:

- `titulo`: maximo 80 caracteres.
- `descricao`: maximo 2000 caracteres.
- `localizacao`: obrigatorio, usar unidade/campus/local detectado ou fonte.
- `metadata.data_evento`: `YYYY-MM-DD` quando detectado.
- `metadata.hora_evento`: `HH:mm` quando detectado.
- `metadata.link`: URL oficial.
- `metadata.link_as_cta`: `true`.
- `metadata.actionLabel`: texto do botao, como `Acessar evento` ou `Realizar inscricao`.
- `metadata.actionKey`: slug do botao, como `acessar-evento`.
- `metadata.contato`: email institucional detectado. Se nao houver contato real,
  nao invente; o link oficial deve ser o caminho de esclarecimento.
- `metadata.area` / `metadata.areaKey`: area/categoria visivel.
- `metadata.tags` / `metadata.tagKeys`: tags e chaves normalizadas para filtros.
- `metadata.categoria`, `metadata.categoriaKey` e `metadata.categoryKey`: sempre preenchidos.
- `metadata.gratuito`: `true` salvo evidencia clara de preco.

### Oportunidades

Pagina principal: `oportunidades.html`.

Categorias aceitas:

- `monitoria`: monitorias, tutoria, selecao de bolsistas de ensino.
- `pesquisa`: editais PRPI, PIBIC/PIVIC, Fapeg, iniciacao cientifica, pesquisa, mobilidade academica.
- `estagios`: estagio, trainee, oportunidade de estagio.
- `voluntariado`: extensao, voluntariado, projetos com chamada para participar.
- `empregos`: emprego, vaga, contratacao, concurso com vinculo profissional.
- `freelancer`: demandas por projeto, servicos pontuais.

Campos obrigatorios/esperados:

- `titulo`: maximo 80 caracteres.
- `descricao`: maximo 2000 caracteres.
- `areaAtuacao` / `metadata.area`: area detectada, como `Academica`, `Saude`, `Direito`, `Tecnologia`, `Linguas`.
- `modalidadeTrabalho`: `Presencial` por padrao quando a fonte nao disser outro modo.
- `contato`: email institucional detectado. Se nao houver contato real, deixe
  vazio e garanta que `metadata.link` aponte para a fonte oficial/edital.
- `metadata.link`: URL oficial.
- `metadata.link_as_cta`: `true`.
- `metadata.actionLabel`: texto do botao, como `Acessar edital`, `Acessar editais` ou `Realizar inscricao`.
- `metadata.actionKey`: slug do botao.
- `metadata.gratuito`: `true`.
- `metadata.tags` / `metadata.tagKeys`: tags e chaves normalizadas para filtros.
- `metadata.categoria`, `metadata.categoriaKey` e `metadata.categoryKey`: sempre preenchidos.

## Markdown E Links

O Kino renderiza links Markdown. Para URLs oficiais e documentos, use a URL completa tambem como texto visivel:

```md
[https://testeanpad.org.br](https://testeanpad.org.br)
```

Evite deixar URL solta sem `[]()`, porque ela pode aparecer como texto puro. Quando precisar contextualizar, escreva o contexto antes e deixe a URL clicavel visivel: `Fonte oficial: [https://...](https://...)`.

`metadata.link` e a URL de acao do botao principal. `metadata.source_url` e a URL da fonte original para auditoria. Quando houver inscricao, formulario, edital ou pagina externa mais acionavel, `metadata.link` deve apontar para essa acao; se nao houver, use a propria fonte oficial.

## Workflow Atual Do Cadu

O fluxo operacional recomendado e:

1. `cadu-curador-v4.2.js`: coleta Weby/Instagram e gera candidatos.
2. `formatador-ia.js`: gera `formattedDescription` com Markdown final.
3. `publish_auto_v5.js`: envia o item inteiro para `cadu-publish`.
4. `cadu-publish`: valida, deduplica, completa metadata, sobe a imagem e publica.

Regras de auto-publicacao:

- threshold local minimo: `0.70`; itens entre `0.55` e `0.69` ficam em revisao;
- antes de publicar, chame `check` com `sourceId` e `sourceUrl`;
- envie `score`, `dates`, `formattedDescription`, `images`, `enrichmentSources` e `enrichmentCheckedAt`;
- se `cadu-publish` retornar `QUALITY_BLOCKED`, nao reenvie em loop. Corrija/enriqueca o item e rode dry-run novamente.

O publicador deve repassar `formattedDescription`; se ele enviar apenas
`description: rec.text`, o endpoint perde a formatacao rica e volta a publicar
texto cru. O endpoint ja preserva `formattedDescription` quando ela for boa e
completa `actionLabel/actionKey` quando o Cadu esquecer.

Para Instagram, a imagem de `cdninstagram.com` serve como fonte temporaria para
upload, mas nao deve ser gravada como capa definitiva. Prefira imagem oficial do
Weby/UFG; se so existir CDN temporaria e o upload falhar, publique sem capa ou
mande para revisao manual.

## Enriquecimento Ativo Antes De Publicar

Quando Yan pedir para "buscar mais informacoes", "confirmar", "ver melhor" ou
quando a fonte estiver incompleta, o Cadu deve fazer uma passada ativa de
enriquecimento antes de formatar/publicar. O objetivo e consolidar fatos, nao
substituir a fonte oficial por suposicao.

Ordem obrigatoria de consulta:

1. **Fonte oficial principal**: abra `sourceUrl`, `news.json`/`events.json`,
   `og:image`, PDFs e links de edital/formulario citados na pagina.
2. **Site oficial relacionado**: se o item veio do Portal UFG, procure a unidade
   responsavel (`sourceName`, dominio da faculdade/pro-reitoria, pagina do evento
   ou edital). Use essa fonte para complementar data, local, contato e documentos.
3. **Instagram oficial da unidade/evento**: use `scan-ig-browser.js` apenas para
   perfis oficiais. Compare por titulo, palavras-chave e data. Caption do
   Instagram e dado complementar; imagem de CDN so deve virar capa se o upload
   para `kino-media` funcionar.
4. **Web aberta**: use busca web apenas quando as fontes oficiais nao bastarem.
   Priorize dominios `.ufg.br`, `goias.gov.br`, plataformas oficiais de evento
   (`Plateia`, `Even3`, `forms.gle` quando linkado pela UFG) e paginas do orgao.
   Nao use blog, repost ou agregador como fato principal.

Saida minima do enriquecimento no item enviado ao endpoint:

```json
{
  "enrichmentSources": [
    { "url": "https://...", "label": "Fonte oficial UFG", "type": "official" },
    { "url": "https://instagram.com/...", "label": "Instagram oficial", "type": "instagram" }
  ],
  "images": [
    "https://files.cercomp.ufg.br/weby/up/.../capa.jpg",
    "https://files.cercomp.ufg.br/weby/up/.../programacao.png"
  ],
  "formattedDescription": "Markdown final com datas, local, CTA e fonte."
}
```

Regras de decisao:

- conflito de data, prazo, local ou valor entre fontes: mande para revisao e
  explique o conflito no digest;
- fonte oficial sem contato: deixe `contato` vazio; nao use fallback generico
  como se fosse contato real;
- fonte oficial com varias imagens uteis: envie ate 5 URLs em `images`, com a
  capa desejada primeiro. O endpoint salva a primeira como capa e as demais em
  `post_media`;
- imagem de Instagram/Telegram: use apenas como fonte de upload; se o retorno
  trouxer `media.uploads[].fallback=false` e erro de upload, procure imagem
  oficial ou publique sem capa;
- fatos de web aberta devem aparecer em `enrichmentSources`, mas a descricao
  deve deixar a fonte oficial da UFG como referencia principal.

Padrao minimo do JSON de run:

- contagens: `published`, `qualityBlocked`, `expiredBlocked`, `institutionalBlocked`, `duplicates`, `imageFailures`, `enrichmentFailures`;
- por item: `sourceId`, `sourceUrl`, `post_id`, `score`, `decision`, `quality.blockingWarnings`, `media.uploads`, `enrichmentSources`;
- `items` deve guardar todos os itens avaliados na run, nao apenas os candidatos
  publicaveis. Se o arquivo ficar grande, separe em `publishableItems`,
  `reviewItems` e `discardedItems`, mas preserve `sourceId`, `sourceUrl`,
  `score`, `dates`, `decision`, `reason`, `images` e `enrichmentSources`;
- `publishedItems` deve guardar `post_id`, `status`, `sourceId`, `sourceUrl`,
  `score`, `dates`, `images`, `quality`, `media` e o retorno bruto sanitizado do
  endpoint. Apenas titulo/source/status nao e suficiente para auditoria;
- `duplicateItems` deve guardar o criterio que bateu (`sourceId`, `sourceUrl`,
  `content_hash` ou titulo similar), o post existente quando retornado pelo
  endpoint e o payload candidato sanitizado;
- `sources` deve ser uma lista por fonte/handle com `kind`, `url` ou `handle`,
  `status`, `itemsFound`, `itemsUsed`, `durationMs` e `error`, nao somente uma
  string resumida;
- nunca grave chaves, tokens, cookies, headers de autorizacao ou URLs temporarias com token fora do log tecnico local.

## Fontes UFG

O arquivo `services/cadu-ufg-publisher/config/sources.json` define as fontes.

Fontes rapidas (`quick`):

- UFG: `https://ufg.br`
- SECOM: `https://secom.ufg.br`
- PROGRAD: `https://prograd.ufg.br`
- PROEX: `https://proex.ufg.br`
- PRPI: `https://prpi.ufg.br`
- Instituto Verbena: `https://institutoverbena.ufg.br`
- CIAR: `https://ciar.ufg.br`
- PRAE: `https://prae.ufg.br`
- SRI: `https://sri.ufg.br`

Fontes completas incluem faculdades, institutos, orgaos e subsites relevantes da FACE. Se uma fonte falhar em DNS, `robots.txt`, sitemap ou feed, marque como desabilitada naquela execucao e reporte no digest. Nao force crawling bloqueado.

## Como Descobrir Conteudos

Ordem preferida:

1. `robots.txt`
2. `news.json` / `events.json` em sites Weby
3. `/feed` RSS/Atom
4. `sitemap.xml`
5. HTML somente como fallback

O runner oficial pagina o Weby JSON com `page=N`, ordena candidatos por data e usa `CADU_WEBY_MAX_PAGES` para controlar profundidade. O padrao conservador e `2`; aumente apenas depois de um dry-run porque cada pagina extra amplia volume de revisao.

Nunca acesse uma rota bloqueada por `robots.txt`.

## Relevancia

Inclua:

- editais;
- chamadas;
- processos seletivos;
- inscricoes;
- cursos, oficinas, palestras e seminarios;
- bolsas, monitoria, estagio, voluntariado;
- eventos culturais/esportivos/academicos;
- prazos e calendarios relevantes;
- oportunidades oficiais UFG/Verbena.

Exclua:

- visita institucional;
- posse, homenagem ou nota de pesar;
- noticia sem acao para estudantes/comunidade;
- conteudo duplicado;
- conteudo sem data/fonte clara;
- item antigo sem inscricao ou utilidade atual.
- titulos institucionais como `prospecta acordos`, `reconhece os destaques`,
  `esta na China para evento`, `recebe expoente` ou `expoente nacional`. A
  palavra `evento`, sozinha, nao torna esse material publicavel. Sem inscricao,
  edital, chamada, prazo, vaga, bolsa ou outro CTA concreto, mande para revisao
  ou descarte.

### Temporalidade

Antes de publicar, sempre confira se a acao ainda esta vigente. O classificador detecta prazos em formatos como `20/05/2026`, `04 a 11 de maio` e `4-11/05`.

- prazo/inscricao vencido: `discard`;
- evento com data passada: `discard`;
- prazo futuro: pode seguir para `publish` ou `review`, conforme score;
- data ambigua ou sem contexto claro: manter em `review`.

Se Yan pedir um post manual por audio, valide a data antes de montar o texto e avise quando a oportunidade ja passou.

## Formato Do Post

Use o mesmo padrao visual que o modal do Kino renderiza:

- titulo ate 80 caracteres;
- descricao em Markdown seguro, entrando direto no conteudo acionavel, sem titulo redundante de `Resumo`;
- fonte oficial dinamica, como `[Fonte oficial: CIAR/UFG](...)` ou `[Fonte oficial: Instituto Verbena](...)`;
- links individuais de editais/documentos quando a pagina oficial listar varios;
- cronograma explicito quando houver datas de inscricao, recurso, homologacao, resultado ou submissao;
- emojis apenas como marcadores uteis;
- imagem de capa da fonte oficial quando existir `image`, `image_url` ou `og:image`; o publisher deve preferir URL do bucket `kino-media` em `posts.image_url`, `metadata.image_url`/`cover_url` e `post_media`, nao hotlink remoto;
- nunca publique um bloco bruto copiado da pagina sem resumir e organizar.

## Editais e PDFs

Quando houver PDF:

- baixar apenas se respeitar limite de tamanho;
- usar `pdftotext` quando disponivel;
- resumir com cuidado;
- manter link oficial do edital;
- escrever que o edital oficial prevalece.

Formato recomendado:

```text
📄 Edital
Quem pode participar: ...
Prazo: ...
Inscricao: use o link oficial da UFG.
Atencao: o edital oficial prevalece sobre este resumo.

📄 Editais e documentos:
- [Edital PIBIC](https://...)

📋 Datas importantes
- Inscricoes: ...
- Resultado preliminar: ...

🔗 [Fonte oficial: PRPI/UFG](https://...)
```

## Comandos Para O Yan No Telegram

Quando Yan disser:

- "rode a curadoria UFG": executar `npm run cadu:dry-run`.
- "rode completo": executar `npm run cadu:dry-run:full`.
- "publique": executar publicacao apenas se o dry-run recente estiver saudavel e os segredos estiverem configurados.
- "mostre revisoes": listar itens `decision=review` no state.
- "por que nao publicou?": explicar score, duplicata, fonte disabled, env ausente, limite 3/h ou erro Supabase.
- "adicione fonte": editar `sources.json`, testar `--source=<id>`, depois commitar.

## Primeiro Setup Seguro

No VPS:

```bash
cd /opt/kino-campus
git checkout kinocampus-V75.0-foundations
git pull
npm install
sudo apt-get update
sudo apt-get install -y poppler-utils
```

Criar `services/cadu-ufg-publisher/.env.local` com valores rotacionados:

```text
CADU_SUPABASE_URL=
CADU_SUPABASE_ANON_KEY=
CADU_KINO_EMAIL=
CADU_KINO_PASSWORD=
CADU_TELEGRAM_BOT_TOKEN=
CADU_TELEGRAM_CHAT_ID=
CADU_RESEND_API_KEY=
CADU_EMAIL_TO=contato@kinocampus.com.br
CADU_USE_MODEL=true
CADU_DEEPSEEK_MODEL=deepseek-v4-flash
CADU_DEEPSEEK_BASE_URL=https://api.deepseek.com
CADU_DEEPSEEK_ENDPOINT=
CADU_REVIEW_BEFORE_PUBLISH=true
CADU_FETCH_PROXY_TEMPLATE=
CADU_SUPABASE_STORAGE_BUCKET=kino-media
CADU_MAX_IMAGE_BYTES=6291456
CADU_MAX_ITEMS_PER_SOURCE=15
CADU_WEBY_MAX_PAGES=2
CADU_MAX_PUBLISH_PER_RUN=3
CADU_PDFTOTEXT_PATH=pdftotext
```

Use `CADU_DEEPSEEK_ENDPOINT` apenas se o ambiente/proxy exigir uma rota completa diferente, por exemplo uma rota compatÃ­vel `/v1/chat/completions`. A configuracao oficial atual do DeepSeek usa `CADU_DEEPSEEK_BASE_URL=https://api.deepseek.com`.

Proteger:

```bash
chmod 600 services/cadu-ufg-publisher/.env.local
```

Validar:

```bash
npm run cadu:dry-run
npm run cadu:dry-run:full
npm run test:cadu -- --coverage=false
```

Publicacao controlada:

```bash
CADU_MAX_PUBLISH_PER_RUN=1 npm run cadu:publish:quick
```

## Conta Do Cadu

Use uma conta dedicada no Supabase Auth. Preferencia:

- email: `cadu.bot@kinocampus.com.br` ou email que o Yan escolher;
- nome: `Cadu Bot`;
- senha forte gerada e guardada apenas em segredo seguro;
- nao usar service role;
- confirmar que a conta consegue publicar via RLS.

Se o cadastro exigir confirmacao de email, avise o Yan para confirmar no inbox ou crie via ferramenta admin segura. Nao inserir usuario manualmente em `auth.users` por SQL.

## Alertas

Avise o Yan se ocorrer:

- auth Supabase falhou;
- falta env;
- fonte bloqueada por robots;
- fonte com DNS/HTTP recorrente;
- erro no parser;
- PDF nao extraido;
- flood limit;
- post pendente por moderacao;
- modelo DeepSeek indisponivel.

O digest separa `Publicados` de `Pendentes de moderacao`. Um post pendente foi criado no banco, mas ainda pode nao aparecer publicamente para todos.

## Limite De Ritmo

O Kino tem dois limites diferentes:

- `post_limits`: controla quantas publicacoes ativas um usuario pode manter.
- `post_flood_limits`: controla quantas publicacoes novas podem ser criadas dentro de uma janela movel.

O erro `FLOOD_LIMIT` vem de `post_flood_limits`/`kc_anti_spam_gate()`. Administradores ajustam isso em `/admin/moderation.html`, painel **Limites de Publicacoes**, bloco **Ritmo de publicacao por janela**.

O erro `POST_LIMIT_REACHED` vem de `post_limits` e controla publicacoes ativas, nao ritmo por hora. Se aparecer para o Cadu, confira o painel **Limites de Publicacoes** para a conta `yan1nakamura+cadu.kinocampus@gmail.com` ou `cadu.bot@kinocampus.com.br`.

Para o Cadu, prefira override por usuario em vez de aumentar o padrao global. Em 28/05/2026, as contas `yan1nakamura+cadu.kinocampus@gmail.com` e `cadu.bot@kinocampus.com.br` ficaram configuradas com `30 posts / 60 min` e reset administrativo aplicado. Se o bot voltar a bater em `FLOOD_LIMIT`, pare as tentativas em lote, peca ao admin para usar **Resetar bloqueio do usuario** no painel de moderacao e rode uma nova checagem antes de publicar.

O reset administrativo nao apaga posts e nao reduz seguranca global: ele cria um marcador em `post_flood_resets` para ignorar publicacoes anteriores ao reset dentro da janela atual. Novos posts continuam contando normalmente depois do reset.

## Reparos Seguros

Use apenas estes metodos do publisher oficial:

- `createPost(payload)`: cria uma publicacao nova pelo contrato completo do mapper.
- `caduEditPost(postId, fields, options)`: repara campos, faz merge seguro de `metadata`, prepara imagem antes do PATCH, serializa edicoes por post e valida o estado final.
- `mergeMetadata(postId, changes, options)`: altera apenas `metadata` sem substituir o objeto inteiro.
- `safeUpdatePost(postId, fields, options)`: alias conservador para `caduEditPost`; nunca use `PATCH` REST direto para metadata parcial.
- `publishPost(postId, options)`: promove para `published`, limpa `moderation_reason` e preserva a metadata existente.

Nunca envie objetos brutos para `image_url`; se um helper retornar `{ url: "..." }`, passe o objeto inteiro para `prepareImagesForPost()` ou extraia `.url`. O publisher normaliza string, `{ url }`, `{ imageUrl }`, `{ image_url }`, `{ coverUrl }` e `{ cover_url }`, e nunca deve gravar `[object Object]`.

Para imagens, o fluxo ideal e: manter URL externa como fallback em `posts.image_url`, `metadata.image_url` e `metadata.cover_url`; tentar upload para `kino-media`; se o upload falhar, publicar com a URL externa e reportar `media.uploads[].error` no digest. Se o erro for `storage_upload_http_403`, a policy `storage_kino_media_cadu_post_media_insert` ainda nao foi aplicada por um owner do projeto Supabase.

Para imagens enviadas pelo Yan no Telegram, a URL do arquivo e temporaria e pode conter token. Use essa URL apenas como fonte de upload e chame `caduEditPost(..., { allowExternalImageFallback: false })`. Se o Storage falhar, o publisher retorna `IMAGE_UPLOAD_FAILED` e nao grava a URL temporaria no Kino.

Guia completo para edicao segura: `docs/cadu-edicao-posts-para-codex.md`.

## Avisos De Qualidade

Quando o digest mostrar `review:quality` ou `Avisos de qualidade`, nao aprove no automatico. Revise o Markdown e, se necessario, rode nova extracao. Os avisos atuais sao:

- `generic_summary`: resumo institucional generico em item que deveria trazer dados acionaveis.
- `missing_multiple_documents`: ha mais de um PDF, mas a descricao nao explicita os documentos.
- `missing_deadline_context`: o classificador encontrou prazo, mas a descricao nao trouxe contexto de prazo/inscricao.
- `missing_schedule_dates`: a fonte tem varias datas, mas a descricao nao trouxe cronograma suficiente.
- `missing_image_url`: nao foi encontrada imagem de capa segura; revise antes de publicar para evitar placeholder.
- `missing_contact`: faltou `metadata.contato`.
- `missing_cta_link`: faltou `metadata.link` HTTP/HTTPS.
- `missing_link_as_cta`: `metadata.link_as_cta` nao esta `true`.
- `missing_action_metadata`: faltou `metadata.actionLabel` ou `metadata.actionKey`.
- `missing_area_metadata`: faltou `metadata.area` ou `metadata.areaKey`.
- `missing_category_metadata`: faltou categoria/categoriaKey/categoryKey.
- `missing_tag_metadata`: faltou `metadata.tags` ou `metadata.tagKeys`.
- `missing_free_flag`: faltou `metadata.gratuito=true`.
- `missing_event_date`: evento sem `metadata.data_evento` (bloqueante).
- `missing_event_time`: evento sem `metadata.hora_evento` (aviso leve; nao bloqueia quando a data existe).
- `missing_work_mode`: oportunidade sem `metadata.modalidadeTrabalho`.
- `source_url_mismatch`: link oficial divergente.
- `invalid_image_url`: imagem do payload nao e uma URL HTTP/HTTPS valida.

Avisos bloqueantes retornados diretamente pelo endpoint `cadu-publish` como `QUALITY_BLOCKED`:

- `source_marks_expired`: o proprio curador marcou o item como expirado.
- `event_past`: evento com data de encerramento/inicio anterior a hoje e sem data futura.
- `deadline_past`: oportunidade com prazo vencido e sem data futura relevante.
- `institutional_or_biographical_release`: release institucional/biografico sem acao concreta para o usuario.
- `cms_credits_in_description`: a descricao ainda contem creditos de CMS (`Texto:`, `Fotos:`, `Por ...`).
- `weak_description`: descricao curta/crua, sem link e informacao acionavel suficiente.
- `score_below_auto_publish_threshold`: score informado abaixo de `0.70`.
- `only_temporary_or_svg_images`: candidatas de imagem eram apenas temporarias ou SVG.
- `instagram_without_official_source`: item veio apenas de Instagram, sem fonte oficial complementar.
