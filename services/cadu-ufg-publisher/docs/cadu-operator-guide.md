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

Fontes completas incluem faculdades, institutos e orgaos. Se uma fonte falhar em DNS, `robots.txt`, sitemap ou feed, marque como desabilitada naquela execucao e reporte no digest. Nao force crawling bloqueado.

## Como Descobrir Conteudos

Ordem preferida:

1. `robots.txt`
2. `news.json` / `events.json` em sites Weby
3. `/feed` RSS/Atom
4. `sitemap.xml`
5. HTML somente como fallback

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

## Avisos De Qualidade

Quando o digest mostrar `review:quality` ou `Avisos de qualidade`, nao aprove no automatico. Revise o Markdown e, se necessario, rode nova extracao. Os avisos atuais sao:

- `generic_summary`: resumo institucional generico em item que deveria trazer dados acionaveis.
- `missing_multiple_documents`: ha mais de um PDF, mas a descricao nao explicita os documentos.
- `missing_deadline_context`: o classificador encontrou prazo, mas a descricao nao trouxe contexto de prazo/inscricao.
- `missing_schedule_dates`: a fonte tem varias datas, mas a descricao nao trouxe cronograma suficiente.
- `source_url_mismatch`: link oficial divergente.
- `invalid_image_url`: imagem do payload nao e uma URL HTTP/HTTPS valida.
