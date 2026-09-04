# OG do WhatsApp + quota de Image Transformations do Supabase (2026-09-04)

## Sintoma

Preview de link do WhatsApp sem imagem para publicações de produto, ex.:

```
https://www.kinocampus.com.br/product.html?id=c45dd940-2088-4b17-bd21-d59e2d2fe5fd
```

O HTML SSR (`/api/og-product`) injetava `og:image` corretamente, mas a imagem
não carregava no preview do WhatsApp.

## Diagnóstico (evidências de 2026-09-04)

- `og:image` apontava para o endpoint de transformação do Supabase Storage:
  ```
  https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/post-media/.../cadu-1-d5d96aaa.png?width=1920&height=1236&resize=cover&quality=90
  ```
- O painel do Supabase exibia **Storage Image Transformations 142 / 100 (142%)**
  com spend cap ativo no plano Pro. Quando a quota é excedida com spend cap ON,
  as transformações são desativadas e o `/render/` passa a servir o **objeto
  ORIGINAL sem transformar** (e/ou falha de forma intermitente durante o ciclo).
- O objeto original era um **PNG de ~794–826 KB**. Pior: o `cover_render` pedia
  1920 px, mas a fonte tem 1280 px de largura — o render **ampliava** a imagem
  (upscale) antes de falhar em ser leve.
- WhatsApp não renderiza previews com imagens pesadas (limite prático na faixa
  de ~600 KB–1 MB; JPEG leve é o caminho seguro) e **cacheia o resultado
  negativo por URL** — sem parâmetro de versão, o preview não se recuperava sozinho.
- Detalhe estrutural: o `/render/` do Supabase **preserva o formato de origem**
  (fonte `.png` ⇒ saída PNG), então nenhuma calibração de `quality` tornaria
  esse preview leve enquanto a capa fosse PNG.

## Causas-raiz

1. `og:image` dependia de um serviço com quota própria mensal e comportamento
   de degradação silenciosa (serve o original quando bloqueado).
2. Saída em PNG pesado (formato preservado + upscale 1280→1920).
3. URL do `og:image` sem cache-buster: o WhatsApp guardou a falha.

## Correção

### Fase 1 — crawler path (og:image) desacoplado da quota

- Novo endpoint `api/media.js` (Vercel Node + `sharp`): baixa o objeto **cru**
  de `kino-media` (sem `/render/`, sem quota), converte para **JPEG
  progressivo mozjpeg ≤ ~280 KB** (escada de qualidade 82→72→62→52),
  `fit=inside` por padrão (nunca corta, nunca amplia) ou `fit=cover`
  (recorte exato w×h para thumbnails quadrados), cache longo de CDN
  (`s-maxage=31536000` + stale-while-revalidate) e allowlist rigorosa
  (bucket `kino-media`, extensões raster, sem traversal/encoding).
- `api/og-product.js`: `og:image`, `twitter:image` e os novos metas
  `og:image:type`/`og:image:width`/`og:image:height` agora usam
  `/api/media?path=…&w=…&h=…&q=82&v=<timestamp do post>`. O `v=` quebra o
  cache do WhatsApp/CDN quando o post é editado. `values.image` (JSON-LD,
  SSR visível e preload do browser) permanece como estava.
- Resultado verificado localmente com o objeto real do post afetado:
  **826 KB PNG → 90,8 KB JPEG** (1280×824, proporção preservada).

### Fase 2 — thumbnails de UI também saem do `/render/`

Os maiores consumidores da quota eram avatares de feed/ranking e thumbs do
dropdown de busca (`/render/…?width=144…` para cada avatar). Agora:

- `kc-utils.presentation.js` (autor do card) e `kc-ranking.js`: `/api/media?…&w=144&h=144&fit=cover&q=80`.
- `kc-search.js` (`buildOptimizedThumbUrl`): object e render URLs convergem para `/api/media`.
- Semântica visual preservada (recorte quadrado, lazy, fallback único para o
  original em caso de erro); testes unitários e specs e2e atualizados para o
  novo contrato (fixtures e2e interceptam `/api/media` localmente).

## Efeito sobre a quota do Supabase

- O caminho de crawler (og:image) e os thumbnails de UI **não consomem mais
  Image Transformations**. A contagem deve parar de crescer e o ciclo atual
  fecha em 142/100 sem impacto funcional (o degradê para "objeto original"
  não é mais usado nesses caminhos).
- O `cover_render` continua sendo gravado pela Edge Function `cadu-publish`
  — passou a ser **metadado de proporção** consumido pelo SSR (w/h), não uma
  URL de crawler.
- Se o uso restante de transformações (ex.: páginas admin) continuar
  relevante, as opções são: manter o spend cap desligado no mês corrente,
  aguardar o reset do ciclo, ou migrar os consumidores restantes para
  `/api/media` (mesma receita das fases 1–2).

## Limites e comportamentos

- `/api/media` aceita somente `kino-media` + raster (jpg/jpeg/png/webp);
  path inválido ⇒ 400; objeto inexistente (Supabase responde 400 InvalidKey)
  ⇒ 404 com cache negativo curto (`s-maxage=300`); upstream 5xx ⇒ 502 no-store.
- Conteúdo é imutável por construção (nomes de objeto com hash); o `v=` existe
  apenas para bust de crawler/CDN por edição do post.
- O WhatsApp revalida o preview ao reenviar o link; com o `og:image` novo
  (URL diferente) o preview volta a baixar a imagem. Para forçar de imediato,
  reenviar com `&v=2` na URL do post ou usar o Sharing Debugger da Meta.
- Acessos ao `/api/media` contam como invocações de função na Vercel (com
  cache de CDN por URL, o volume de origem é baixo).

## Como verificar

```bash
# 1) og:image no SSR aponta para /api/media
curl -s 'https://www.kinocampus.com.br/product.html?id=<ID>' | grep -o 'og:image" content="[^"]*"'

# 2) imagem leve e JPEG
curl -sI 'https://www.kinocampus.com.br/api/media?path=…' | grep -i 'content-type|cache-control'
```

## Follow-ups conhecidos (não-bloqueantes)

- O hero da página de produto troca a fonte no cliente para
  `post.imagens[0]` (objeto cru, às vezes PNG pesado). Migrar a galeria para
  variantes `/api/media` (w=1200) reduziria banda mobile — requer revisão do
  contrato `data-kc-image-candidates` e dos testes visuais.
- URLs `post_media` legacy com `?width=…&quality=…` na coluna da pipeline
  continuam servindo o objeto original (Supabase ignora query em
  `/object/`); inofensivo para og:image (o SSR roteia por `/api/media`).
- Páginas `/admin` ainda podem usar `/render/` pontualmente (tráfego
  interno, sem impacto no preview).
