# Estrutura do Repositório — KinoCampus

**Versão:** v16.0.0  
**Data:** 2026-04-26  
**Atualizado em:** v16.2.0 (reescrita de v14.1.0)

---

## 1. Visão Geral

KinoCampus é uma plataforma Vanilla JS + HTML + CSS, sem bundler, sem framework, sem transpilador.
Todo o código JS é servido como arquivos estáticos via Vercel. Os scripts são carregados via
`<script defer src="...">` em ordem determinística nos HTMLs.

**Stack imutável:**
- Frontend: HTML5 + CSS3 + Vanilla JS (IIFE, sem import/export)
- Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- Hosting: Vercel (vercel.json — não tocar sem aprovação)
- Testes: Jest (134 suites · 3046 testes) + Playwright (8 suites E2E)
- Validators: 5 scripts de validação (`npm run check:all`)

---

## 2. Árvore do Repositório (v16.0.0)

```
kino-campus/
├── assets/
│   ├── js/
│   │   ├── boot/               (6 arquivos — cadeia de inicialização)
│   │   ├── core/               (11 arquivos — módulos core do runtime)
│   │   ├── api/                (16 arquivos — drivers Supabase + facade KCAPI)
│   │   ├── utils/              (8 arquivos — kc-utils.js + kc-utils.*.js)
│   │   ├── features/           (10 arquivos — features de interface)
│   │   │   └── create-post/    (7 arquivos — feature de criação de publicação)
│   │   ├── shared/             (7 arquivos — módulos compartilhados entre páginas)
│   │   ├── legacy-shims/       (1 arquivo — migração assistida)
│   │   ├── components/         (3 arquivos — componentes UI reutilizáveis)
│   │   ├── adapters/
│   │   │   ├── local/          (8 arquivos — adapters localStorage)
│   │   │   └── supabase/       (11 arquivos — adapters Supabase)
│   │   └── controllers/
│   │       ├── public/         (31 arquivos — controllers de páginas públicas)
│   │       └── admin/          (10 arquivos — controllers admin)
│   ├── css/
│   │   ├── styles.css          (CSS monolítico principal ~243KB)
│   │   ├── kc-theme-boot.css   (tema inicial — carregado no <head>)
│   │   ├── kc-public-shell.css (shell público)
│   │   ├── admin-shell.css     (shell admin)
│   │   ├── product.css         (estilos específicos de produto)
│   │   └── future-split/       (5 stubs CSS — não carregados em produção)
│   └── images/
├── tests/
│   ├── unit/               (22 suites — módulos puros)
│   ├── integration/        (90 suites — controllers + adapters)
│   ├── contract/           (7 suites — contratos KCAPI + Supabase)
│   ├── structure/          (10 suites — validação estrutural)
│   ├── a11y/               (5 suites — acessibilidade + i18n)
│   ├── fixtures/           (dados mock)
│   └── e2e/                (8 suites Playwright)
├── scripts/
│   ├── validate-version-map.js
│   ├── validate-repository-structure.js
│   ├── validate-script-chains.js
│   ├── validate-public-routes.js
│   ├── hygiene-check.js
│   └── inject-env.js
├── docs/
│   ├── architecture/
│   │   ├── repository-structure.md  ← este arquivo
│   │   ├── module-catalog.md        (v16.3.0–v16.4.0)
│   │   ├── controllers-catalog.md   (v16.5.0)
│   │   ├── script-loading-reference.md (v16.6.0)
│   │   ├── data-flow-guide.md       (v16.7.0)
│   │   ├── ai-development-guide.md  (v16.8.0)
│   │   ├── test-strategy.md         (v16.9.0)
│   │   └── css-architecture.md      (v16.10.0)
│   ├── audits/
│   │   ├── refactors/
│   │   ├── accessibility/
│   │   ├── security/
│   │   └── performance/
│   ├── releases/
│   │   ├── v11/
│   │   └── v12/
│   └── qa/
│       └── reports/
├── admin/                   (5 HTMLs admin)
├── *.html                   (17 HTMLs públicos)
├── sw.js                    (Service Worker)
├── vercel.json              (config deploy — não tocar)
├── jest.config.js
├── package.json
├── VERSION.json
├── CHANGELOG.md
├── README.md
├── RELATORIO-KINOCAMPUS-V15.md
└── RELATORIO-KINOCAMPUS-V16.md
```

---

## 3. Grupos JS — Tabela por Grupo

### 3.1 boot/ (6 arquivos — cadeia de inicialização obrigatória)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-constants.js` | `window.KC_CONSTANTS` | Constantes globais imutáveis (modules, URLs, limites) |
| `kc-env.js` | `window.KC_ENV` | Configuração de runtime (driver, endpoints, flags) |
| `kc-feature-flags.js` | `window.KCFF` | Feature flags booleanos por ambiente |
| `kc-sw-register.js` | *(sem namespace)* | Registro do Service Worker |
| `kc-telemetry.js` | *(sem namespace)* | Telemetria e logging de erros |
| `kc-theme-boot.js` | *(sem namespace)* | Aplicação do tema antes do render (evita flash) |

### 3.2 core/ (11 arquivos — módulos core do runtime)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-i18n.js` | `window.KCI18n` | Internacionalização e traduções |
| `kc-auth.ui.js` | `window.KCAccountProfileUtils` | UI de autenticação e perfil |
| `kc-profiles.client.js` | `window.KCProfilesClient` | Cache e operações de perfil |
| `kc-theme.js` | *(sem namespace)* | Troca de tema (claro/escuro) e persistência |
| `kc-notifications.js` | `window.KCNotifications` | Sistema de notificações in-app |
| `kc-auth-callback.js` | *(sem namespace)* | Callback de autenticação OAuth |
| `kc-core.js` | `window.KCCore` | Core runtime: tabs, scroll, popover, SW cache |
| `kc-post-model.js` | `window.KCPostModel` | Model de publicação (campos, validações) |
| `kc-user-posts.js` | `window.kcUserPosts` | Estado de publicações do usuário |
| `kc-core-widgets.js` | `window.KCWidgets` | Widgets compartilhados (alerts, modals) |
| `kc-public-shell.js` | *(sem namespace)* | Shell público: nav, header, footer |

### 3.3 api/ (16 arquivos — drivers Supabase + facade KCAPI)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-supabase.client.js` | `window.KCSupabase` | Cliente Supabase (auth, realtime, queries) |
| `kc-supabase.posts.js` | `window._KCSPosts` | Queries de posts no Supabase |
| `kc-supabase.ratings.js` | `window._KCSRatings` | Queries de ratings no Supabase |
| `kc-api.auth.js` | `window._KCAPI_auth` | Submódulo KCAPI: autenticação |
| `kc-api.comments-votes.js` | `window._KCAPI_cv` | Submódulo KCAPI: comentários e votos |
| `kc-api.help.js` | `window._KCAPI_help` | Submódulo KCAPI: pedidos de ajuda |
| `kc-api.notifications.js` | `window._KCAPI_notif` | Submódulo KCAPI: notificações |
| `kc-api.posts-feed.js` | `window._KCAPI_feed` | Submódulo KCAPI: feed de publicações |
| `kc-api.posts-read.js` | `window._KCAPI_read` | Submódulo KCAPI: leitura de publicações |
| `kc-api.posts-write.js` | `window._KCAPI_write` | Submódulo KCAPI: escrita de publicações |
| `kc-api.profiles.js` | `window._KCAPI_prof` | Submódulo KCAPI: perfis |
| `kc-api.ratings.js` | `window._KCAPI_rat` | Submódulo KCAPI: ratings |
| `kc-api.related.js` | `window._KCAPI_rel` | Submódulo KCAPI: posts relacionados |
| `kc-api.saved.js` | `window._KCAPI_saved` | Submódulo KCAPI: posts salvos |
| `kc-api.client.js` | `window.KCAPI` | Facade central KCAPI (2411L — agrega todos submódulos) |
| `admin-shell.js` | *(sem namespace)* | Shell admin: nav, ações de moderação |

### 3.4 utils/ (8 arquivos)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-utils.string.js` | `window._KCU_str` | Manipulação de strings |
| `kc-utils.format.js` | `window._KCU_fmt` | Formatação de datas, moeda, tamanhos |
| `kc-utils.dom.js` | `window._KCU_dom` | Helpers DOM (query, events, scroll) |
| `kc-utils.identity.js` | `window._KCU_id` | UUIDs, hashes, identificadores |
| `kc-utils.taxonomy.js` | `window._KCU_tax` | Taxonomia de módulos (labels, cores, ícones) |
| `kc-utils.location.js` | `window._KCU_loc` | Geolocalização e parsing de endereços |
| `kc-utils.presentation.js` | `window._KCU_pres` | Funções de apresentação de dados |
| `kc-utils.js` | `window.KCUtils` | Facade utils (agrega todos submódulos) |

### 3.5 features/ (10 arquivos)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-comments.js` | `window.KCComments` | Sistema de comentários |
| `kc-search.js` | `window.KCSearch` | Busca global |
| `kc-search-modal.js` | `window.KCSearchModal` | Modal de busca |
| `kc-ranking.js` | `window.KCRanking` | Ranking de contribuidores |
| `kc-filters.js` | `window.KCFilters` | Filtros genéricos de feed |
| `kc-feed-filters.js` | `window.KCFeedFilters` | Filtros específicos de feed |
| `kc-banners.js` | `window.KCBanners` | Banners promocionais (fonte de dados) |
| `kc-home-categories.js` | `window.KCHomeCategories` | Grade de categorias na home |
| `kc-lazy-loader.js` | `window.KCLazyLoader` | Carregamento lazy de imagens |
| `kc-pull-to-refresh.js` | `window.KCPullToRefresh` | Pull-to-refresh em feeds mobile |

### 3.6 features/create-post/ (7 arquivos)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-create-post.js` | `window.KCCreatePost` | Orchestrador do formulário de criação |
| `kc-create-post.schema.js` | `window.KCCreatePostSchema` | Schema de validação por módulo |
| `kc-create-post.fields.js` | `window.KCCreatePostFields` | Definição de campos por módulo |
| `kc-create-post.render.js` | `window.KCCreatePostRender` | Renderização do formulário |
| `kc-create-post.media.js` | `window.KCCreatePostMedia` | Upload e preview de mídia |
| `kc-create-post.resolvers.js` | `window.KCCreatePostResolvers` | Resolvers de campos dinâmicos |
| `kc-create-post.submit.js` | `window.KCCreatePostSubmit` | Submissão e validação final |

### 3.7 shared/ (7 arquivos)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `account-profile.shared.js` | `window.KCAccountProfile` | Dados compartilhados de perfil de conta |
| `help.shared.js` | `window.KCHelpShared` | Dados compartilhados de ajuda |
| `home-categories.shared.js` | `window.KCHomeCategoriesShared` | Categorias compartilhadas da home |
| `kc-comments.shared.js` | `window.KCCommentsShared` | Dados compartilhados de comentários |
| `kc-search.shared.js` | `window.KCSearchShared` | Estado compartilhado de busca |
| `ods.shared.js` | `window.KCODSShared` | Dados compartilhados ODS |
| `search-analytics.shared.js` | `window.KCSearchAnalytics` | Analytics de busca |

### 3.8 legacy-shims/ (1 arquivo)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `kc-migrate.myposts.js` | *(sem namespace)* | Migração assistida de "minhas publicações" (766L, caráter transitório) |

### 3.9 components/ (3 arquivos)

| Arquivo | Namespace | Responsabilidade |
|---------|-----------|-----------------|
| `carousel.js` | *(funções globais)* | Hero carousel de banners nos feeds |
| `toast.js` | `showToast()` global | Notificações toast temporárias |
| `voting.js` | *(variáveis de módulo)* | Votos com Supabase Realtime/polling |

### 3.10 adapters/local/ (8 arquivos)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `local.adapter.js` | Adapter base localStorage |
| `local.help.adapter.js` | Pedidos de ajuda (local) |
| `local.notifications.adapter.js` | Notificações (local) |
| `local.posts-read.adapter.js` | Leitura de posts (local) |
| `local.posts-write.adapter.js` | Escrita de posts (local) |
| `local.profile.adapter.js` | Perfis (local) |
| `local.ratings.adapter.js` | Ratings (local) |
| `local.saved.adapter.js` | Posts salvos (local) |

### 3.11 adapters/supabase/ (11 arquivos)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `supabase.adapter.js` | Adapter base Supabase |
| `supabase.admin.adapter.js` | Operações admin |
| `supabase.analytics.adapter.js` | Analytics |
| `supabase.comments.adapter.js` | Comentários |
| `supabase.media.adapter.js` | Upload de mídia |
| `supabase.notifications.adapter.js` | Notificações |
| `supabase.posts-read.adapter.js` | Leitura de posts |
| `supabase.posts-write.adapter.js` | Escrita de posts |
| `supabase.profiles.adapter.js` | Perfis |
| `supabase.saved.adapter.js` | Posts salvos |
| `supabase.votes.adapter.js` | Votos |

### 3.12 controllers/public/ (31 arquivos)

Controllers das 17 páginas públicas. Cada página tem 1 controller principal + 0–N auxiliares.
Padrão: `<pagina>.controller.js` + `<pagina>.load.js` / `<pagina>.render.js` / etc.

### 3.13 controllers/admin/ (10 arquivos)

Controllers das 5 páginas admin. Padrão idêntico ao public.

---

## 4. Namespaces Globais `window.*` — Tabela Completa

| Namespace | Arquivo | Grupo | Tipo |
|-----------|---------|-------|------|
| `window.KC_CONSTANTS` | boot/kc-constants.js | boot | Object.freeze |
| `window.KC_ENV` | boot/kc-env.js | boot | Object.freeze |
| `window.KCFF` | boot/kc-feature-flags.js | boot | Object.freeze |
| `window.KCAPI` | api/kc-api.client.js | api | Object.freeze facade |
| `window._KCAPI_*` | api/kc-api.*.js | api | IIFE submódulos |
| `window.KCSupabase` | api/kc-supabase.client.js | api | Object.freeze |
| `window._KCSPosts` | api/kc-supabase.posts.js | api | IIFE |
| `window._KCSRatings` | api/kc-supabase.ratings.js | api | IIFE |
| `window.KCUtils` | utils/kc-utils.js | utils | Object.freeze facade |
| `window._KCU_*` | utils/kc-utils.*.js | utils | IIFE submódulos |
| `window.KCCore` | core/kc-core.js | core | Object |
| `window.KCI18n` | core/kc-i18n.js | core | Object |
| `window.KCNotifications` | core/kc-notifications.js | core | Object |
| `window.KCPostModel` | core/kc-post-model.js | core | Object |
| `window.kcUserPosts` | core/kc-user-posts.js | core | IIFE |
| `window.KCWidgets` | core/kc-core-widgets.js | core | Object |
| `window.KCAccountProfileUtils` | core/kc-auth.ui.js | core | Object |
| `window.KCProfilesClient` | core/kc-profiles.client.js | core | Object |
| `window.KCComments` | features/kc-comments.js | features | Object |
| `window.KCSearch` | features/kc-search.js | features | Object |
| `window.KCBanners` | features/kc-banners.js | features | Object |
| `window.KCRanking` | features/kc-ranking.js | features | Object |
| `window.KCFilters` | features/kc-filters.js | features | Object |
| `window.KCCreatePost` | features/create-post/*.js | features | IIFE |

---

## 5. Regras de Carregamento de Scripts

### 5.1 Cadeia de Boot (obrigatória em todos os 22 HTMLs)

```
boot/kc-constants.js
→ boot/kc-env.js
→ boot/kc-feature-flags.js
→ boot/kc-sw-register.js
→ boot/kc-telemetry.js
→ boot/kc-theme-boot.js
```

Validado por `npm run check:scripts` (validate-script-chains.js).

### 5.2 Ordem típica de carregamento (páginas de feed)

```
[cadeia de boot]
→ utils/kc-utils.*.js (submódulos)
→ utils/kc-utils.js (facade)
→ api/kc-supabase.client.js
→ api/kc-supabase.posts.js, kc-supabase.ratings.js
→ api/kc-api.*.js (submódulos, em qualquer ordem)
→ api/kc-api.client.js (facade — sempre por último na cadeia api)
→ adapters/local/*.js
→ adapters/supabase/*.js
→ core/ (módulos core)
→ features/ (features específicas da página)
→ components/ (carousel, toast, voting)
→ controllers/public/<pagina>.controller.js
```

### 5.3 Regra de raiz vazia (Gate V15)

Nenhum arquivo `.js` deve existir diretamente em `assets/js/`. O validator `check:structure`
falha imediatamente se esta regra for violada.

---

## 6. Estado CSS (v16.0.0)

### Arquivos em produção (5)

| Arquivo | Carregado em | Tamanho aprox. |
|---------|-------------|----------------|
| `styles.css` | Todas as páginas (via `<link>`) | ~243KB |
| `kc-theme-boot.css` | Todas (no `<head>`) | pequeno |
| `kc-public-shell.css` | Páginas públicas | médio |
| `admin-shell.css` | Páginas admin | médio |
| `product.css` | `_product.html` | médio |

### future-split/ (5 stubs — não carregados)

`00-tokens.css`, `01-base.css`, `02-layout.css`, `03-components.css`, `04-pages.css`

Stubs preparatórios para futura divisão do `styles.css` monolítico. **Não alterar e não carregar
em produção** sem executar o plano de split CSS documentado em `docs/audits/performance/`.

---

## 7. Estado de Testes (v16.0.0)

| Diretório | Suites | Tipo |
|-----------|--------|------|
| `tests/unit/` | 22 | Módulos puros (utils, models) |
| `tests/integration/` | 90 | Controllers + adapters em contexto |
| `tests/contract/` | 7 | Contratos KCAPI e Supabase |
| `tests/structure/` | 10 | Validação estrutural e de repositório |
| `tests/a11y/` | 5 | Acessibilidade e i18n gates |
| `tests/e2e/` | 8 | Playwright (fluxos de usuário) |
| **Total Jest** | **134** | **3046 testes** |

---

## 8. Convenções de Nomenclatura

### 8.1 Arquivos JS

| Padrão | Significado |
|--------|-------------|
| `kc-*.js` | Módulo core KinoCampus |
| `kc-utils.*.js` | Sub-módulo de utils |
| `kc-api.*.js` | Sub-módulo KCAPI (facade) |
| `kc-supabase.*.js` | Sub-módulo Supabase |
| `kc-create-post.*.js` | Sub-módulo de criação de post |
| `*.controller.js` | Controller de página |
| `*.adapter.js` | Adapter de persistência |
| `*.shared.js` | Módulo compartilhado entre páginas |
| `*.normalize.js` | Normalizador extraído de controller |
| `*.load.js` | Carregamento de dados (controller auxiliar) |
| `*.render.js` | Renderização (controller auxiliar) |

### 8.2 Padrão de módulo JS

```js
// Padrão obrigatório para todos os módulos
(function () {
  'use strict';
  // implementação
  window.NomeDoModulo = Object.freeze({ ... });
})();
```

---

## 9. Delta V14 × V15 × V16

| Item | V14 | V15 | V16 |
|------|-----|-----|-----|
| JS na raiz `assets/js/` | 66 arquivos | **0** (gate ativo) | 0 ✅ |
| Subdirs canônicos | utils/, adapters/, controllers/ | +boot/, core/, api/, features/, shared/, legacy-shims/ | +components/ ✅ |
| CANONICAL_JS entries | 20 | 69 | **72** (+carousel, toast, voting) |
| Itens validados | — | 144 | **148** |
| Docs em `docs/architecture/` | 0 | 1 (este, na v14.1.0) | **8** (catálogos + guias) |
| Módulos catalogados | 0 | 0 | **~130** (v16.3.0–v16.5.0) |
| Guia de IA | ✗ | ✗ | ✅ (v16.8.0) |
