# Cadu Workflow Hardening - 2026-06-01

Este documento registra os ajustes feitos apos a auditoria enviada pelo Cadu em
01/06/2026. O objetivo e reduzir dependencia de memoria operacional do agente:
o endpoint oficial deve preservar formato, completar metadata obrigatoria e
evitar capas quebradas mesmo quando o script externo variar.

## Falhas mapeadas

- O formatador IA gerava descricao rica, mas o publicador podia enviar apenas
  `description/text`, fazendo o endpoint publicar texto cru.
- `actionLabel` e `actionKey` nem sempre chegavam ao `metadata`.
- Imagens de Instagram/CDN temporaria podiam virar `image_url` final quando o
  upload para Storage falhava.
- O Cadu resolvia uma falha de busca uma vez, mas nao tinha uma regra fixa para
  enriquecer candidatos com site oficial, Instagram oficial e web quando Yan
  pedia mais informacoes.
- Scripts soltos do OpenClaw continham fallback de chave hardcoded ou parsing
  fragil do JSON do formatador.
- A funcao antiga de Instagram via `web_profile_info` ainda existia no curador,
  apesar de estar abandonada por shadow-ban.

## Contrato reforcado no Kino

O endpoint `supabase/functions/cadu-publish` agora:

- aceita `formattedDescription` e preserva esse Markdown quando ele e acionavel;
- bloqueia `QUALITY_BLOCKED` antes do insert quando detectar evento passado,
  prazo vencido, release institucional/biografico, credito CMS, descricao fraca,
  score abaixo de `0.70`, imagem temporaria/SVG como unica opcao ou Instagram
  sem fonte oficial complementar;
- completa `metadata.actionLabel` e `metadata.actionKey` quando o Cadu nao enviar;
- usa `gratuito=true` por padrao para `eventos` e `oportunidades`;
- aceita até 6 imagens em `images[]`, salva a primeira como capa e as demais em
  `post_media` com `sort_order`;
- grava `metadata.gallery_image_urls` e `metadata.enrichment_sources` para
  auditoria do que foi consultado;
- filtra SVG, Instagram CDN, Facebook CDN e URL temporaria de Telegram como
  fallback final de imagem;
- continua tentando upload para `kino-media` antes de qualquer fallback;
- substitui `post_media` de forma atomica para evitar capa/galeria trocada entre
  posts.

## Regras para os scripts do Cadu

1. `formatador-ia.js` deve ler a chave por `CADU_DEEPSEEK_API_KEY` ou
   `.env.local`. Nunca hardcode de segredo.
2. O JSON de saida do formatador deve conter `formattedDescription`.
3. `publish_auto_v5.js` deve repassar `formattedDescription`, `actionLabel`,
   `actionKey`, `sourceUrl`, `sourceName`, `pdfLinks`, `extractedLinks`, `link`
   `contato`, `images` e `enrichmentSources`.
4. Se uma imagem veio de Instagram, marque `imageSource=instagram-cdn` e trate
   `imageFinalUsable=false`. Preferir imagem oficial do Weby/UFG.
5. A API publica do Instagram (`web_profile_info`) nao deve ser usada. O unico
   scanner permitido e o browser autenticado (`scan-ig-browser.js`).
6. Se o endpoint retornar `media.uploaded=false` com `media.error`, nao recrie
   o post em loop. Corrija a imagem via `edit` ou mande para revisao.
7. O threshold de auto-publicacao local deve ser `0.70`. Itens entre `0.55` e
   `0.69` entram em revisao, mesmo que parecam promissores.
8. Antes de publicar, chame `check` com `sourceId` e `sourceUrl`; depois envie
   `score`, `dates`, `formattedDescription`, `images`, `enrichmentSources` e
   `enrichmentCheckedAt`.
9. Se o endpoint retornar `QUALITY_BLOCKED`, nao reenvie em loop. Corrija a
   fonte, enriquecimento, imagem ou descricao e rode dry-run novamente.

## Regra de enriquecimento ativo

Quando Yan pedir "busque mais informacoes", quando houver dado faltando ou
quando o candidato vier apenas de Instagram, o Cadu deve consultar fontes
complementares antes de chamar o formatador:

1. abrir a fonte oficial (`sourceUrl`, Weby JSON, PDFs e links citados);
2. buscar site oficial da unidade/evento/pro-reitoria responsavel;
3. verificar Instagram oficial respectivo pelo browser scanner;
4. usar web aberta apenas para achar fonte oficial ou plataforma oficial
   vinculada ao evento/edital.

O item final deve incluir `enrichmentSources` com as URLs consultadas e `images`
com até 6 URLs úteis, colocando a melhor capa primeiro. Se houver conflito entre
fontes sobre prazo, local, data ou valor, o item vai para revisao e o digest deve
explicar o conflito.

## Checklist antes de publicar

- Dry-run do publicador endpoint sem `VALIDATION_FAILED`.
- `formattedDescription` com prazo/data, publico ou criterio, CTA e fonte.
- `metadata.link` aponta para acao principal, nao para link generico se houver
  edital/formulario melhor.
- `metadata.source_url` preserva a fonte oficial para deduplicacao.
- Capa HTTP/HTTPS estavel, preferencialmente `files.cercomp.ufg.br` ou Storage.
- Se houver mais imagens oficiais úteis, `images[]` contém até 6 URLs e a capa
  fica na primeira posicao.
- `enrichmentSources[]` registra fonte oficial, unidade, Instagram oficial e
  web oficial usada para complementar.
- Nada de SVG como capa final.
- Sem tentativa repetida em caso de `FLOOD_LIMIT`; aguardar reset ou usar painel
  admin de ritmo de publicacao.

## Monitoramento recomendado

- Guardar JSON de cada run com `runId`, contagens e erros de `media`.
- Registrar itens publicados com `sourceId/sourceUrl/post_id`.
- Separar erros de coleta, formatacao, validacao, upload e flood limit.
- Exportar o digest para o Yan com: publicados, duplicados, pendentes, falhas de
  imagem e itens em revisao.
