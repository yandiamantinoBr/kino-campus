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
- Scripts soltos do OpenClaw continham fallback de chave hardcoded ou parsing
  fragil do JSON do formatador.
- A funcao antiga de Instagram via `web_profile_info` ainda existia no curador,
  apesar de estar abandonada por shadow-ban.

## Contrato reforcado no Kino

O endpoint `supabase/functions/cadu-publish` agora:

- aceita `formattedDescription` e preserva esse Markdown quando ele e acionavel;
- completa `metadata.actionLabel` e `metadata.actionKey` quando o Cadu nao enviar;
- usa `gratuito=true` por padrao para `eventos` e `oportunidades`;
- filtra SVG, Instagram CDN, Facebook CDN e URL temporaria de Telegram como
  fallback final de imagem;
- continua tentando upload para `kino-media` antes de qualquer fallback;
- substitui `post_media` de capa em vez de acumular multiplas capas.

## Regras para os scripts do Cadu

1. `formatador-ia.js` deve ler a chave por `CADU_DEEPSEEK_API_KEY` ou
   `.env.local`. Nunca hardcode de segredo.
2. O JSON de saida do formatador deve conter `formattedDescription`.
3. `publish_auto_v5.js` deve repassar `formattedDescription`, `actionLabel`,
   `actionKey`, `sourceUrl`, `sourceName`, `pdfLinks`, `extractedLinks`, `link`
   e `contato`.
4. Se uma imagem veio de Instagram, marque `imageSource=instagram-cdn` e trate
   `imageFinalUsable=false`. Preferir imagem oficial do Weby/UFG.
5. A API publica do Instagram (`web_profile_info`) nao deve ser usada. O unico
   scanner permitido e o browser autenticado (`scan-ig-browser.js`).
6. Se o endpoint retornar `media.uploaded=false` com `media.error`, nao recrie
   o post em loop. Corrija a imagem via `edit` ou mande para revisao.

## Checklist antes de publicar

- Dry-run do publicador endpoint sem `VALIDATION_FAILED`.
- `formattedDescription` com prazo/data, publico ou criterio, CTA e fonte.
- `metadata.link` aponta para acao principal, nao para link generico se houver
  edital/formulario melhor.
- `metadata.source_url` preserva a fonte oficial para deduplicacao.
- Capa HTTP/HTTPS estavel, preferencialmente `files.cercomp.ufg.br` ou Storage.
- Nada de SVG como capa final.
- Sem tentativa repetida em caso de `FLOOD_LIMIT`; aguardar reset ou usar painel
  admin de ritmo de publicacao.

## Monitoramento recomendado

- Guardar JSON de cada run com `runId`, contagens e erros de `media`.
- Registrar itens publicados com `sourceId/sourceUrl/post_id`.
- Separar erros de coleta, formatacao, validacao, upload e flood limit.
- Exportar o digest para o Yan com: publicados, duplicados, pendentes, falhas de
  imagem e itens em revisao.
