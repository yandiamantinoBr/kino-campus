# KinoCampus - Arquitetura do Frontend

## Visão geral

O KinoCampus continua operando como aplicação estática hospedada na Vercel, com backend Supabase e sem bundler. Cada página HTML carrega explicitamente os scripts de que precisa via `<script defer>`, e a composição entre módulos acontece por meio de IIFEs e contratos expostos em `window.*`.

## Estado atual do repositório

> **Atualizado em v76.5.0 (2026-06-12)** — contagens apos snapshot dedicado de `normalizePost` e runtime frontend `8.6.1`.

| Item | Quantidade atual |
|------|------------------|
| páginas HTML públicas na raiz | `21` |
| páginas HTML administrativas | `6` |
| total de páginas HTML | `27` |
| arquivos JS em `assets/js/` (13 grupos canônicos) | `153` |
| controllers em `assets/js/controllers/` (public + admin) | `48` |
| adapters em `assets/js/adapters/` (local + supabase) | `21` |
| componentes em `assets/js/components/` | `3` |
| arquivos CSS em `assets/css/` (produção) | `7` |
| suites de teste Jest em `tests/` | `173` |
| testes Jest totais | `3559` |
| specs E2E Playwright | `9` |

## Princípio estrutural

### IIFE + `window.*`

Cada módulo JavaScript segue o padrão:

```javascript
(function () {
  'use strict';

  function helperPrivado() {}

  window.KCModule = {
    metodoPublico: metodoPublico,
  };

  document.addEventListener('DOMContentLoaded', init);
}());
```

Esse modelo preserva encapsulamento local sem depender de bundler e mantém interoperabilidade entre páginas carregadas de forma incremental.

### Driver pattern

O frontend fala sempre com a fachada `KCAPI`, que delega para um dos adapters:

```text
Browser -> KCAPI -> LocalAdapter | SupabaseAdapter -> origem dos dados
```

- `KC_ENV.driver === 'local'`: usa `local.adapter.js`
- `KC_ENV.driver === 'supabase'`: usa `supabase.adapter.js`

Em produção, o build `node scripts/inject-env.js` injeta os valores e força o caminho Supabase.

## Camadas do app

### Camada 1 - bootstrap (`assets/js/boot/`, 9 módulos)

- `assets/js/boot/kc-constants.js`
- `assets/js/boot/kc-env.js`
- `assets/js/boot/kc-feature-flags.js`
- `assets/js/boot/kc-google-tag.js`
- `assets/js/boot/kc-seo-structured-data.js`
- `assets/js/boot/kc-speed-insights.js`
- `assets/js/boot/kc-sw-register.js`
- `assets/js/boot/kc-telemetry.js`
- `assets/js/boot/kc-theme-boot.js`
- `assets/css/kc-theme-boot.css`

### Camada 2 - utils e API (`assets/js/utils/` + `assets/js/api/`, 28 módulos)

- `assets/js/utils/kc-utils.js` + sub-módulos `kc-utils.string.js`, `kc-utils.format.js`, `kc-utils.dom.js`, `kc-utils.identity.js`, `kc-utils.taxonomy.js`, `kc-utils.location.js`, `kc-utils.presentation.js`
- `assets/js/api/kc-api.client.js` (fachada) + sub-módulos `kc-api.posts-feed.js`, `kc-api.posts-read.js`, `kc-api.posts-write.js`, `kc-api.auth.js`, `kc-api.profiles.js`, `kc-api.notifications.js`, `kc-api.comments-votes.js`, `kc-api.ratings.js`, `kc-api.related.js`, `kc-api.saved.js`, `kc-api.diagnostics.js`, `kc-api.session.js`, `kc-api.filters.js`, `kc-api.authors.js`, `kc-api.help.js`, `kc-api.chat.js`, `kc-supabase.client.js`, `kc-supabase.posts.js`, `kc-supabase.ratings.js`, `admin-shell.js`

### Camada 3 - adapters (`assets/js/adapters/`, 21 módulos)

- Local (9): `local.adapter.js`, `local.posts-read.adapter.js`, `local.posts-write.adapter.js`, `local.notifications.adapter.js`, `local.ratings.adapter.js`, `local.saved.adapter.js`, `local.profile.adapter.js`, `local.help.adapter.js`, `local.chat.adapter.js`
- Supabase (12): `supabase.adapter.js`, `supabase.posts-read.adapter.js`, `supabase.posts-write.adapter.js`, `supabase.profiles.adapter.js`, `supabase.notifications.adapter.js`, `supabase.comments.adapter.js`, `supabase.votes.adapter.js`, `supabase.saved.adapter.js`, `supabase.media.adapter.js`, `supabase.analytics.adapter.js`, `supabase.admin.adapter.js`, `supabase.chat.adapter.js`

### Camada 4 - core e features compartilhadas (`assets/js/core/` + `assets/js/features/` + `assets/js/shared/`)

- Core (12): `kc-auth-callback.js`, `kc-auth.ui.js`, `kc-consent.js`, `kc-core.js`, `kc-core-widgets.js`, `kc-i18n.js`, `kc-notifications.js`, `kc-post-model.js`, `kc-profiles.client.js`, `kc-public-shell.js`, `kc-theme.js`, `kc-user-posts.js`
- Features (23): `kc-create-post.js` + 6 sub-módulos; `kc-ads.js`, `kc-events-calendar.js`, `kc-privacy-analytics.js`, `kc-search.js`, `kc-lazy-loader.js`, outros
- Shared (7): `account-profile.shared.js`, `help.shared.js`, `home-categories.shared.js`, `kc-comments.shared.js`, `kc-search.shared.js`, `ods.shared.js`, `search-analytics.shared.js`

### Camada 5 - controllers de página (`assets/js/controllers/`, 48 controllers)

Públicos (33): um controller principal por página pública + auxiliares (`product.*.js` ×11, `profile.*.js` ×4)

Admin (15): `admin-dashboard.controller.js` + auxiliares (`metrics`, `audit`, `charts`, `privacy`, `shared`, `export`) + `admin-moderation.controller.js`, `admin-reports.controller.js`, `admin-banners.controller.js`, `admin-help-requests.controller.js`, `admin-invite.controller.js`, `admin-external-access.controller.js`, `admin-feed-ads.controller.js`, `admin-privacy-analytics.controller.js`

## Fluxos principais

### Criação de publicação

```text
UI -> kc-auth.ui.js -> kc-create-post.js -> KCAPI.createPost()
   -> adapter ativo -> Supabase/local
```

Pontos sensíveis:

- schema dinâmico por módulo
- upload e ordenação de mídia
- validação visual e sanitização
- limitação de posts/flood control

### Feed incremental

```text
Controller do módulo -> KCAPI.getFeedCursor()
                      -> adapter -> RPC kc_get_feed_cursor()
```

Pontos sensíveis:

- cursor opaco
- envelopes de filtros avançados
- consistência entre módulos equivalentes
- fallback local e paginação incremental

### Produto

```text
_product.html -> product.controller.js
              -> KCAPI.getPostById()
              -> comentários / relacionados / analytics / saves / share / agenda
```

Pontos sensíveis:

- grande concentração de UI e regras de negócio
- comentários lazy-loaded
- popovers, modais, related posts, analytics e tracking
- acoplamento forte com `styles.css` e `product.css`

### Admin v10

```text
admin/*.html -> admin-shell.js + controller específico
             -> KCAPI/admin adapters/RPCs
```

A linha v10 consolidou:

- navegação admin unificada
- dashboard com filtros/exports endurecidos
- moderação com busca server-side
- reports com paginação progressiva
- help requests com paginação server-side
- convites externos mais defensivos
- responsividade concentrada em `admin-shell.css`

## Hotspots técnicos

> **Atualizado em v76.5.0 / 2026-06-12** — os hotspots abaixo usam contagens medidas no filesystem atual. Para a proxima decomposicao segura, usar `docs/planning/v76-hotspot-decomposition-plan.md`.

| Área | Arquivo principal | Status pós-V15 | Risco residual |
|------|-----------------|----------------|---------------|
| fachada de API | `assets/js/api/kc-api.client.js` (1.698L / 67KB) | ⚠️ Parcialmente decomposto em sub-módulos `_KCAPI.*`; diagnostics, session/freshness, filters/date presets e authors/mocks extraidos; facade ainda concentra bootstrap, normalização de posts, wrappers e contrato público | compatibilidade entre drivers, `window.KCAPI` e fluxos autenticados |
| adapter Supabase | `assets/js/adapters/supabase/supabase.adapter.js` (~420L) | ✅ Decomposto em 11 sub-adapters `_KCSA.*` | acoplamento com banco, RLS, RPCs |
| detalhe de publicação | `assets/js/controllers/public/product.controller.js` | ✅ Decomposto em 8 auxiliares `_KCProduct.*` | UI crítica e estado compartilhado |
| criação de publicação | `assets/js/features/create-post/kc-create-post.js` | ✅ Decomposto em 6 sub-módulos `_KCCreatePost.*` | formulário central, schemas dinâmicos |
| utilitários globais | `assets/js/utils/kc-utils.js` (~440L) | ✅ Decomposto em 7 sub-módulos `_KCU.*` | impacto transversal amplo |
| admin dashboard | `assets/js/controllers/admin/admin-dashboard.controller.js` | ✅ Decomposto em 3 auxiliares `_KCAD.*` | KPIs, ranking, audit log e export |
| design system global | `assets/css/styles.css` (12.282L / 287KB) | ⚠️ Monolito preservado; `future-split/` segue como stub não carregado | alto risco de regressão visual transversal; exige gates V27/V35/V76 |

## Arquitetura CSS

| Arquivo | Tamanho aprox. | Papel |
|---------|----------------|-------|
| `assets/css/styles.css` | `281.0 KB` | base global de layout, componentes e tema |
| `assets/css/product.css` | `44.3 KB` | especificidades da página de produto |
| `assets/css/admin-shell.css` | `33.2 KB` | shell e responsividade do admin |
| `assets/css/kc-public-shell.css` | `20.0 KB` | páginas públicas compartilhadas e superfícies de perfil |
| `assets/css/kc-chat.css` | `16.0 KB` | UI de conversa/chat |
| `assets/css/kc-theme-boot.css` | `5.8 KB` | CSS crítico anti-FOUC |
| `assets/css/product-lightbox.css` | `7.9 KB` | lightbox de mídia da página de produto |

## Regras de equivalência

Quando um padrão compartilhado é alterado, o mínimo esperado de revisão é:

- feeds públicos: os 6 módulos equivalentes
- admin: todos os `admin/*.html`, `admin-shell.js`, `admin-shell.css` e controllers tocados
- adapters: `local.adapter.js`, `supabase.adapter.js` e `kc-api.client.js`
- produto: `_product.html`, `product.controller.js`, `product.css` e utilitários acionados por popovers/modais
- documentação: `README.md`, `CHANGELOG.md`, docs afetadas e `RELATORIO-KINOCAMPUS-V11.md`

## Observações de baseline

- **v16.11.0 (2026-04-27):** contagens e caminhos atualizados para refletir a estrutura pós-V15 (13 grupos canônicos, 41 controllers, 19 adapters, 134 suites). Monolitos técnicos decompostos entre v11–v15.
- **v17.5.0 (2026-04-28):** estrutura documental reorganizada — diretórios históricos `audits`, `legacy` e `releases` sob `docs/` consolidados em `docs/archive/` com 10 subdirs canônicos. README.md reduzido de 534L para 159L.
- **v75.1.0 (2026-06-11):** performance phase 1 consolidada em `appVersion=75.1.0`, `frontendRuntimeVersion=8.6.1` e branch operacional `kinocampus-V75.0-foundations`.
- **v76.1.0 (2026-06-12):** `kc-api.diagnostics.js` extraido para diagnostics de create-post, mantendo 107 membros publicos de `window.KCAPI`.
- **v76.2.0 (2026-06-12):** `kc-api.session.js` extraido para `KCSessionStore`/`KCPostFreshness`, `assets/js/` sobe para 151 arquivos, `assets/js/api/` para 19 arquivos e Jest para 170 suites / 3535 testes.
- **v76.3.0 (2026-06-12):** `kc-api.filters.js` extraido para filtros avancados/date presets de `KCAPI.filterPosts`, `assets/js/` sobe para 152 arquivos, `assets/js/api/` para 20 arquivos e Jest para 171 suites / 3545 testes.
- **v76.4.0 (2026-06-12):** `kc-api.authors.js` extraido para `MOCK_USERS`, indices e resolucao de autor legado, `assets/js/` sobe para 153 arquivos, `assets/js/api/` para 21 arquivos e Jest para 172 suites / 3555 testes.
- **v76.5.0 (2026-06-12):** snapshot dedicado de `KCAPI.normalizePost` criado antes da extracao, cobrindo aliases snake/camel, datas efetivas, autor legado, midia e regra de `compra-venda`; Jest sobe para 173 suites / 3559 testes.
- `frontendRuntimeVersion` atual é `8.6.1` (constante canônica do runtime).
- Para detalhes completos de cada módulo, ver: `docs/architecture/module-catalog.md`, `docs/architecture/controllers-catalog.md`, `docs/architecture/repository-structure.md`.
