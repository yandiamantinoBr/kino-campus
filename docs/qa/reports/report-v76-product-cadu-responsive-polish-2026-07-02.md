# v76 — Produto, Cadu e Responsividade (2026-07-02)

## Escopo

Iteração focada em regressões visuais e funcionais observadas no detalhe de publicação e no admin Cadu:

- `/_product.html` / `/product.html?id=...`: layout do bloco de informações, largura desktop/mobile e metadados sociais.
- `admin/cadu.html`: aba Feed coletado e comportamento em telas pequenas.
- Consentimento LGPD: presença do banner em páginas operacionais admin/mobile.

## Diagnóstico

### Produto

- O shell visual local é `/_product.html`; a URL pública indexável e compartilhável é `/product.html?id=...`, servida por `api/og-product.js` via rewrite da Vercel.
- O grid global de `.kc-main-content` podia fazer `.kc-product-section` encolher no desktop, deixando a página concentrada à esquerda e gerando espaço vazio lateral.
- O bloco `kc-product-specs` já estava na posição correta dentro de `.kc-product-media`, abaixo da galeria. O problema visual principal era largura/encaixe do container e risco de ícones/links escaparem em dados reais.
- Em produção, os dois IDs comparados no WhatsApp já retornam OG específico:
  - `039b8084-adb9-48c1-9fa7-44f52dd6b5e1`: título e imagem do curso IsF Francês.
  - `168c9cbc-10a4-43a4-8b56-c9c1fb5176e2`: título e imagem do IV Prêmio Crea-GO.
- Portanto, o print ruim do WhatsApp é compatível com cache antigo do WhatsApp ou captura anterior ao enriquecimento de imagem. Mesmo assim, a SSR foi fortalecida para aceitar mais formatos reais de mídia.

### Cadu

- `assets/js/controllers/admin/admin-cadu.controller.js` tinha duas funções `loadFeed` e duas `applyFeedFilter`. A segunda implementação paginada sobrescrevia a primeira, mas a duplicidade deixava a aba Feed coletado mais difícil de auditar e evoluir.
- A duplicidade legada foi removida; a implementação paginada atual permanece como fonte única.

### Consentimento

- O banner de consentimento é exibido no primeiro acesso até existir `kc_consent_v1` com `version: 2026-06-05`.
- Em admin/mobile ele cobria botões, diagnósticos e leitura. O banner agora fica mais compacto em páginas admin e tem altura máxima rolável no mobile.

## Alterações

- `assets/css/product.css`
  - `.kc-product-page .kc-main-content` passa a `display: block !important`.
  - `.kc-product-container` passa a ocupar `width: 100%`.

- `api/og-product.js`
  - `getPostImage` agora resolve imagem por `image_url`, `cover_url`, `post_media`, `images`, `imagens`, `image_urls`, `gallery_image_urls` e variantes em `metadata`.
  - URLs de Storage sem extensão explícita no fim passam a ser aceitas para OG.

- `assets/js/controllers/public/product.render.js`
  - `setOpenGraphTags` foi alinhado com os mesmos formatos de imagem aceitos no SSR.

- `assets/js/controllers/admin/admin-cadu.controller.js`
  - Removida implementação legada duplicada de `loadFeed/applyFeedFilter`.

- `assets/css/styles.css`
  - Banner de consentimento em admin fica lateral e compacto no desktop.
  - Banner mobile tem `max-height: min(40vh, 340px)` e `overflow-y: auto`.

- `tests/integration/product-seo-metadata.test.js`
  - Novos casos para capa marcada em `post_media` e lista de imagens em `metadata` sem extensão explícita.

## Verificação

Executado em 2026-07-02:

- `node --check api/og-product.js`
- `node --check assets/js/controllers/public/product.render.js`
- `node --check assets/js/controllers/admin/admin-cadu.controller.js`
- `npm test -- tests/integration/product-seo-metadata.test.js --runInBand`
- `npm test -- tests/unit/kc-consent.test.js --runInBand`
- `npm test -- tests/integration/seo-indexing.test.js --runInBand`
- `npm run check:routes`
- `npm run test:e2e -- tests/e2e/product-detail.spec.js tests/e2e/header-responsive.spec.js --project=chromium`
- `git diff --check`

Resultados: todos passaram.

## Evidências Visuais Locais

Capturas geradas em `output/playwright/`:

- `visual-product-after-layout-desktop.png`
- `visual-product-after-layout-mobile.png`
- `visual-product-synthetic-specs.png`
- `visual-product-mobile-consent-compact.png`
- `visual-admin-cadu-mobile-consent-compact.png`

Métricas relevantes:

- Produto desktop: `.kc-product-section` com `1180px`, centralizada, sem overflow horizontal.
- Produto mobile: viewport `390px`, sem overflow horizontal.
- Bloco de informações sintético: 9 itens, 0 ícones fora do item.
- Banner mobile: altura final `338px`, rolável, sem overflow horizontal.

## Observações Operacionais

- A checagem pública por `curl` confirmou OG correto em produção para os dois posts citados. Se o WhatsApp continuar exibindo card antigo, usar o depurador/refresh de cache do compartilhador do Meta/WhatsApp antes de concluir que a SSR regrediu.
- O MCP do Supabase falhou nesta rodada por erro de transporte do conector antes de consultar o projeto. Não houve alteração de banco.
