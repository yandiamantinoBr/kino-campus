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
- `metadata.contato`: email detectado, ou `Ver link oficial da UFG`.
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
- `contato`: email detectado, ou `Ver link oficial da UFG`.
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

Para o Cadu, prefira override por usuario em vez de aumentar o padrao global. O valor inicial recomendado e `10 posts / 60 min`, mantendo dry-run e revisao antes de publicar.

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
- `missing_event_datetime`: evento sem `metadata.data_evento` ou `metadata.hora_evento`.
- `missing_work_mode`: oportunidade sem `metadata.modalidadeTrabalho`.
- `source_url_mismatch`: link oficial divergente.
- `invalid_image_url`: imagem do payload nao e uma URL HTTP/HTTPS valida.
