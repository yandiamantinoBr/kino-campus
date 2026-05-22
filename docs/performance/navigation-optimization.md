# Otimizacao De Performance E Navegacao

Atualizado em: 2026-05-22

## Objetivo

Melhorar a fluidez da navegacao web e mobile do Kino Campus sem trocar a arquitetura atual nem arriscar funcionalidades sensiveis como login, criacao de post, acoes administrativas, votos, mensagens e Supabase.

Este documento deve ser atualizado sempre que uma mudanca de performance/cache/navegacao for feita. Ele tambem serve como ponto de rollback: cada item abaixo explica a intencao, o risco e como desfazer.

## Diagnostico Inicial

- A Vercel estava servindo HTML, JS e CSS com `Cache-Control: public, max-age=0, must-revalidate`. Isso evita cache de navegador e faz o usuario revalidar arquivos em navegacoes repetidas.
- O Service Worker existia, mas estava desligado em producao por `KC_ENV.flags['sw.enabled'] = false`.
- O Service Worker antigo cacheava requisicoes GET de forma ampla demais. Se fosse ligado sem revisao, poderia guardar HTML ou respostas que deveriam continuar frescas.
- A home carregava banners do Supabase a cada entrada, mesmo quando os banners nao tinham mudado.
- A pagina `_product.html` buscava o detalhe do post novamente a cada abertura, sem snapshot curto para voltar e reler.
- O feed ja tinha cache de sessao, mas destruia a UI no `pagehide`; isso atrapalha o retorno instantaneo via back/forward cache em alguns navegadores.
- A cadeia de scripts continua grande. Nesta fase ela foi mapeada, mas cortes agressivos ficaram para uma etapa posterior porque o risco de regressao e maior.

## Fase 1 Implementada

### Cache HTTP E Versionamento

- `frontendRuntimeVersion` foi atualizado para `8.6.1`.
- Referencias locais a JS/CSS em HTML foram versionadas com `?v=8.6.1`.
- `/assets/*` passou a poder usar cache longo (`max-age=31536000, immutable`) porque os assets agora possuem versao na URL.
- HTML e `sw.js` continuam com `max-age=0, must-revalidate`, para que deploys novos sejam descobertos rapidamente.
- `scripts/validate-script-chains.js` foi ajustado para aceitar scripts versionados sem perder a validacao de ordem.

Rollback: remover os headers especificos de cache em `vercel.json` ou subir uma nova versao de runtime para forcar nova URL dos assets.

### Banners Da Home

- `kc-banners.js` agora usa cache de sessao para `hero_banners`.
- TTL fresco: 10 minutos.
- Limite stale com fallback: 24 horas.
- Quando existe cache, a home renderiza o banner imediatamente.
- Se o cache ainda estiver fresco, nao consulta o Supabase de novo.
- Se estiver velho, mostra o cache primeiro e atualiza em segundo plano.

Rollback: limpar o scope `home` de `KCSessionStore` ou reverter `assets/js/features/kc-banners.js`.

### Pagina De Publicacao

- `product.load.js` agora tem cache de detalhe do post.
- TTL fresco: 5 minutos.
- Limite stale: 30 minutos.
- Ao voltar para uma publicacao ja aberta, o post pode aparecer primeiro pelo cache e revalidar depois.
- Edicoes, exclusoes, encerramentos, renovacoes e impulsionamentos limpam caches de feed, perfil, meus posts e detalhe do produto.

Rollback: limpar o scope `product-detail` de `KCSessionStore` ou reverter `product.load.js` e `product.edit.js`.

### Back/Forward Cache

- `kc-feed.controller.js` agora preserva a UI quando o navegador guarda a pagina para retorno rapido.
- Em `pagehide` persistido, o feed pausa timers/realtime e salva snapshot sem destruir DOM.
- Em `pageshow` persistido, ele reabre realtime, revalida suavemente e reidrata estados de voto.

Rollback: reverter o bloco `pagehide/pageshow` em `kc-feed.controller.js`.

### Service Worker

- O Service Worker foi endurecido, mas permanece controlado pela flag `sw.enabled`.
- Ele agora so cacheia assets versionados em `/assets/*`.
- Supabase, CDNs e fontes continuam passthrough.
- Navegacoes HTML usam network-first com fallback controlado.
- Navigation preload foi preparado para reduzir custo quando o SW for ativado.

Rollback: manter `sw.enabled=false`. Se ja estiver ativo no navegador, subir novo deploy com versao de cache diferente ou remover o registro.

## Fase 1.1 Implementada

### Ordem Inteligente Do `kc-nav-links`

- `assets/js/features/kc-nav-links-personalized.js` reordena somente os links existentes da navegacao principal.
- A ordem estatica do HTML permanece como fallback imediato e como rollback visual.
- O calculo usa sinais ja existentes:
  - `KCAPI.getPersonalizedTabs()`, que combina afinidade pessoal, `highlight_score`, recencia e volume;
  - `KCHomeCategories.getCategoryCounts()`, para volume atual por modulo/categoria;
  - `kc_nav_module_affinity_v1`, afinidade local de cliques no proprio menu, apenas com consentimento de analytics.
- Pesos no cliente: 62% sinais pessoais/trending, 33% volume global e 5% estabilidade da ordem original.
- Cache de sessao: `kc:navLinksOrder:v1`, TTL de 10 minutos.
- Sem consentimento de analytics, o script nao usa afinidade pessoal; ele pode usar apenas sinais globais ou manter a ordem estatica.

Risco: mudanca de ordem pode surpreender usuarios muito acostumados com a posicao fixa. A mitigacao e manter a ordem estatica se nao houver sinais e preservar dimensoes/classes dos links.

Rollback: remover as tags de `kc-nav-links-personalized.js` dos HTMLs publicos ou limpar `kc:navLinksOrder:v1` e `kc_nav_module_affinity_v1` no navegador.

## Validacao Da Fase 1

Executado em 2026-05-21:

- `npm run check:all`: passou.
- Smoke local no Microsoft Edge headless:
  - desktop 1366x900: home carregou, assets locais vieram com `?v=8.6.1`, banner alternou por clique e alternou automaticamente;
  - mobile 390x844: menu abriu e fechou corretamente;
  - `_product.html?id=1`: shell carregou sem erro de runtime, mas o driver local retornou "Anuncio nao encontrado". O cache de detalhe ficou coberto por testes de contrato/unitarios; validacao visual com post real deve ser feita no ambiente Supabase/producao.
- `npm run lhci`: passou com avisos esperados de Best Practices em HTTP local.

Scores LHCI locais:

| URL | Performance | Acessibilidade | Best Practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| `/` | 99 | 90 | 64 | 100 |
| `/index.html` | 99 | 90 | 64 | 100 |
| `/compra-venda-feed.html` | 100 | 90 | 61 | 100 |
| `/_product.html` | 100 | 94 | 64 | 100 |

Observacao: os avisos de Best Practices locais ja estavam previstos na configuracao do LHCI porque o servidor local usa HTTP, enquanto a Vercel entrega via HTTPS.

## O Que Ficou Para Fase 2

- Reduzir a cadeia universal de scripts por pagina.
- Carregar modulos pesados sob demanda com mais agressividade.
- Avaliar ativacao gradual do Service Worker em producao.
- Revisar imagens LCP da home e das paginas de publicacao com `fetchpriority`, preload e tamanhos responsivos.
- Medir ganhos com Lighthouse/LHCI e comparar antes/depois.

## Criterios De Aceite

- Home nao deve piscar ou recarregar banners desnecessariamente em navegacao curta.
- Voltar para feed/publicacao deve parecer instantaneo quando houver snapshot valido.
- HTML e `sw.js` devem continuar revalidando a cada deploy.
- Assets em `/assets/*` devem sair com cache longo e URL versionada.
- Criacao de post, login, admin, votos, mensagens e Supabase nao podem regredir.

## Referencias

- Vercel Cache-Control headers: https://vercel.com/docs/caching/cache-control-headers
- web.dev Back/forward cache: https://web.dev/articles/bfcache
- web.dev Service worker caching and HTTP caching: https://web.dev/articles/service-worker-caching-and-http-caching
- web.dev Navigation preload: https://web.dev/blog/navigation-preload
- web.dev Optimize LCP: https://web.dev/articles/optimize-lcp
