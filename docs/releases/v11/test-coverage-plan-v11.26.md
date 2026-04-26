# Plano de Cobertura de Testes v11.26.x — KinoCampus

## Contexto

Documento gerado em 12 de abril de 2026 como entrega da iteração `v11.26.0`.

**Estado atual:** 52 suites, 565 testes verdes. Os 7 controllers abaixo não têm testes diretos — todos são IIFEs de integração que orquestram KCAPI, DOM e estado de sessão. Nenhum deles contém guards de auth ou redireciona unauthenticated users (dependem de upstream).

**Abordagem geral:** suites estáticas verificam contratos (quais métodos KCAPI são chamados), padrões de inicialização, constantes e dataset attributes. Nenhum arquivo de produção é alterado.

---

## Auditoria por controller

| Controller | Linhas | Padrões-chave | Testável estaticamente |
|---|---|---|---|
| `create-post.controller.js` | ~175 | KCAPI wrapper, error stages | Sim — contratos de wrapping |
| `kc-feed.controller.js` | ~910 | getFeedCursor, KCSessionStore, anti-dup | Sim — contratos de pager |
| `index.controller.js` | ~509 | getCurrentUser, getMySavedPostsCount | Sim — contratos KCAPI, modal refs |
| `achados-perdidos.controller.js` | ~949 | getPosts, KCFeedFilters, session cache | Sim — cache key, date presets |
| `caronas-feed.controller.js` | ~745 | KCSupabase, KCFeedFilters, locations | Sim — filter structure, presets |
| `moradia.controller.js` | ~1077 | getPosts, KCFeedFilters, price range | Sim — feature sets, cache key |
| `eventos.controller.js` | ~785 | KCFeedFilters, calendar bounds | Sim — categorias, date presets |

---

## Padrões transversais identificados

### 1. KCAPI contracts
- `create-post.controller.js` — envolve `KCAPI.createPost`, expõe `KCAPI.getLastCreatePostError`
- `kc-feed.controller.js` — `KCAPI.getFeedCursor`, `KCAPI.getPostById`, `KCAPI.normalizePost`
- `index.controller.js` — `KCAPI.getCurrentUser`, `KCAPI.getMySavedPostsCount`
- `achados-perdidos.controller.js`, `moradia.controller.js` — `KCAPI.getPosts` / `KCAPI.getDatabaseNormalized`

### 2. KCFeedFilters dependency
Quatro controllers (`achados-perdidos`, `caronas`, `moradia`, `eventos`) chamam `getFeedFilterUtils()` + `KCFeedFilters.getAllowedDatePresets(moduleKey)`. Testes verificam graceful fallback quando `KCFeedFilters` não está presente.

### 3. Session cache pattern
`achados-perdidos`, `caronas`, `moradia` usam `KCSessionStore.get/set()` com chaves como `'achados-perdidos:index'`, `'caronas:index'`, `'moradia:index'` e TTL de 10min. Testes verificam uso da API `KCSessionStore`.

### 4. Modal/overlay pattern
`achados-perdidos`, `moradia`, `eventos` compartilham padrão de overlay: placeholder, `aria-hidden`, classe `kc-modal-open`, `focus restoration`. Testes verificam presença de dataset attrs e IDs de modal esperados no HTML.

### 5. Dataset attributes
Cada controller usa dataset attrs próprios (`data-kc-achados-date-preset`, `data-kc-carona-origem`, `data-kc-housing-region-option`, `data-kc-eventos-date-preset`). Testes verificam que constantes de chave de filtro são estáveis.

---

## Estratégia por iteração

### v11.26.1 — Testes: create-post e kc-feed controllers

**Branch:** `codex/v11-26-1-tests-create-post-feed`

#### `create-post.controller.js`
Suites verificam:
- Wrapper guarda: `KCAPI.createPost` é substituído pelo wrapper enriquecido de diagnóstico
- Stages de erro presentes: `POST_INSERT`, `STORAGE_UPLOAD`, `POST_MEDIA_INSERT`, `POST_FETCH`
- `KCAPI.getLastCreatePostError` disponível após instalação do controller
- Referências a `KCAPI.activeDriver` e `KCAPI.ENV.driver` usadas no diagnóstico

**Estratégia:** mockar `KCAPI` como objeto mínimo; executar a IIFE do controller em escopo de teste; verificar que os métodos foram sobrescritos/adicionados com as assinaturas esperadas.

#### `kc-feed.controller.js`
Suites verificam:
- `KCAPI.getFeedCursor` é chamado com parâmetros de cursor (module, limit, sort)
- `POSTS_LIMIT` é 12 (regressão de configuração)
- `KCSessionStore.get` / `KCSessionStore.set` são chamados no ciclo de pager
- Set de IDs anti-duplicates é inicializado e impede re-inserção de UUID conhecido
- `kc-feed-realtime-banner` é criado com `display:none` inicial
- Singleton `activePager` é registrado em `window.KCFeedPager` (ou equivalente público)

**Estratégia:** DOM mínimo com container de feed; mockar `KCAPI.getFeedCursor` para retornar fixture com 12 posts; verificar estado do pager e chamadas ao session store.

---

### v11.26.2 — Testes: index, achados-perdidos, caronas, moradia, eventos

**Branch:** `codex/v11-26-2-tests-module-controllers`

#### `index.controller.js`
Suites verificam:
- `KCAPI.getCurrentUser` é chamado na inicialização
- `KCAPI.getMySavedPostsCount({ kind: 'favorite' })`, `{ kind: 'later' }`, `{ kind: 'highlight' }` — três chamadas separadas
- Modal refs existem: `kcHomeCategoriesHelpModal`, `kcHomeCategoriesHelpBackdrop`
- `KCOverlayLock.lock` / `KCOverlayLock.unlock` são chamados ao abrir/fechar modal

#### `achados-perdidos.controller.js`
Suites verificam:
- Cache key `'achados-perdidos:index'` usada em `KCSessionStore.get/set`
- `KCFeedFilters.getAllowedDatePresets('achados-perdidos')` chamado sem lançar erro
- Date presets disponíveis: `today`, `last7d`, `last30d` (específico do módulo)
- Dataset attrs de filtro presentes no HTML: `data-kc-achados-date-preset`, `data-kc-achados-status`, `data-kc-achados-type`
- `KCAPI.getPosts` chamado com `module: 'achados-perdidos'`

#### `caronas-feed.controller.js`
Suites verificam:
- `KCFeedFilters.getAllowedDatePresets('caronas')` — retorna `today`, `last3d`, `last7d`
- Session cache key `'caronas:index'` usada em `KCSessionStore`
- `KCSupabase.getClient()` chamado para fetch de `caronas_locations`
- Dataset attrs de filtro: `data-kc-carona-origem`, `data-kc-carona-destino`, `data-kc-carona-features`
- Tipos de carona presentes: `ofereco`, `procuro`

#### `moradia.controller.js`
Suites verificam:
- Cache key `'moradia:index'` usada em `KCSessionStore`
- `KCFeedFilters.getAllowedDatePresets('moradia')` — retorna `today`, `last7d`, `last30d`
- Features verificadas: 12 checkboxes (`pets`, `lgbtq`, `gender-specific`, `furnished`, etc.)
- Price range: sanitização de limites invertidos (min > max → swap)
- `KCAPI.getPosts` chamado com `module: 'moradia'`
- Dataset attrs: `data-kc-housing-region-option`, `data-kc-price`, `data-kc-created-at`

#### `eventos.controller.js`
Suites verificam:
- `KCFeedFilters.getAllowedDatePresets('eventos')` — retorna `today`, `next7d`, `thisMonth`, `past`
- Bounds de calendário: `MIN_Y = current_year - 0`, `MAX_Y = current_year + 1` (±18 meses)
- Categorias de evento: `sustentabilidade`, `academicos`, `culturais`, `esportivos`, `workshops`, `festas`
- Modal de seção: `kcEventosSectionModal` presente no DOM
- Dataset attrs: `data-kc-eventos-date-preset`, `data-kc-eventos-section`

---

## Critérios de QA (por iteração)

- `npx jest --runInBand` verde antes e depois de cada iteração
- `node scripts/hygiene-check.js` verde
- Zero alteração em arquivos de produção (`assets/`)
- Nenhum teste novo usa `fetch` real ou `supabase.rpc` real — todos os I/O são mockados

---

## Tabela resumo

| Iteração | Controllers | Suites novas estimadas |
|---|---|---|
| v11.26.1 | `create-post.controller.js`, `kc-feed.controller.js` | 2 suites (~30 testes) |
| v11.26.2 | `index.controller.js`, `achados-perdidos.controller.js`, `caronas-feed.controller.js`, `moradia.controller.js`, `eventos.controller.js` | 5 suites (~60 testes) |

**Total projetado pós v11.26.x:** ~59 suites, ~655 testes
