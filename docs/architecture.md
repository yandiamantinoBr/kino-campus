# KinoCampus - Arquitetura do Frontend

## Visão geral

O KinoCampus continua operando como aplicação estática hospedada na Vercel, com backend Supabase e sem bundler. Cada página HTML carrega explicitamente os scripts de que precisa via `<script defer>`, e a composição entre módulos acontece por meio de IIFEs e contratos expostos em `window.*`.

## Estado atual do repositório

> **Atualizado em v76.17.0 (2026-06-15)** — contagens após inventário CSS-A, baseline CSS-B/C visual/cascade, micro-splits CSS-C/C.2/C.3, inventário residual JS-I, extrações JS-I.1/JS-I.2/JS-I.3 na fachada `KCAPI` e runtime frontend `8.6.1`.

| Item | Quantidade atual |
|------|------------------|
| páginas HTML públicas na raiz | `21` |
| páginas HTML administrativas | `6` |
| total de páginas HTML | `27` |
| arquivos JS em `assets/js/` (13 grupos canônicos) | `154` |
| controllers em `assets/js/controllers/` (public + admin) | `48` |
| adapters em `assets/js/adapters/` (local + supabase) | `21` |
| componentes em `assets/js/components/` | `3` |
| arquivos CSS em `assets/css/` (produção) | `8` |
| suites de teste Jest em `tests/` | `175` |
| testes Jest totais | `3578` |
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

### Camada 2 - utils e API (`assets/js/utils/` + `assets/js/api/`, 29 módulos)

- `assets/js/utils/kc-utils.js` + sub-módulos `kc-utils.string.js`, `kc-utils.format.js`, `kc-utils.dom.js`, `kc-utils.identity.js`, `kc-utils.taxonomy.js`, `kc-utils.location.js`, `kc-utils.presentation.js`
- `assets/js/api/kc-api.client.js` (fachada) + sub-módulos `kc-api.posts-feed.js`, `kc-api.posts-read.js`, `kc-api.posts-write.js`, `kc-api.auth.js`, `kc-api.profiles.js`, `kc-api.notifications.js`, `kc-api.comments-votes.js`, `kc-api.ratings.js`, `kc-api.related.js`, `kc-api.saved.js`, `kc-api.diagnostics.js`, `kc-api.session.js`, `kc-api.filters.js`, `kc-api.authors.js`, `kc-api.posts-normalize.js`, `kc-api.help.js`, `kc-api.chat.js`, `kc-supabase.client.js`, `kc-supabase.posts.js`, `kc-supabase.ratings.js`, `admin-shell.js`

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

> **Atualizado em v76.30.0 / 2026-06-19** — os hotspots abaixo usam contagens medidas no filesystem atual. Para a próxima decomposição segura, usar `docs/planning/v76-hotspot-decomposition-plan.md`, `docs/planning/v76-kcapi-residual-inventory.md`, `docs/planning/v76-kcapi-bootstrap-driver-core-dossier.md`, `docs/planning/v76-css-ownership-inventory.md` e `docs/planning/v76-css-visual-baseline.md`.

| Área | Arquivo principal | Status pós-V15 | Risco residual |
|------|-----------------|----------------|---------------|
| fachada de API | `assets/js/api/kc-api.client.js` (1.459L / 56.513 bytes) | Parcialmente decomposto em submódulos `_KCAPI.*`; diagnostics, session/freshness, filters/date presets, authors/mocks, normalização de posts, normalizadores de rating, external access admin, notification fallbacks e post mutation bridge extraídos; JS-I mede 107 membros públicos, 141 funções, 98 wrappers exportados/globais, 17 namespaces `_KCAPI.*` e 10 buckets residuais; JS-I.4 classifica o núcleo bootstrap em 12 funções / 131 linhas, cinco domínios e 15 gates; JS-I.5 cobre os quatro gates de `transport-config`, restando 11, com No-Go runtime | compatibilidade entre drivers, `window.KCAPI` e fluxos autenticados |
| adapter Supabase | `assets/js/adapters/supabase/supabase.adapter.js` (~420L) | ✅ Decomposto em 11 sub-adapters `_KCSA.*` | acoplamento com banco, RLS, RPCs |
| detalhe de publicação | `assets/js/controllers/public/product.controller.js` | ✅ Decomposto em 8 auxiliares `_KCProduct.*` | UI crítica e estado compartilhado |
| criação de publicação | `assets/js/features/create-post/kc-create-post.js` | ✅ Decomposto em 6 sub-módulos `_KCCreatePost.*` | formulário central, schemas dinâmicos |
| utilitários globais | `assets/js/utils/kc-utils.js` (~440L) | ✅ Decomposto em 7 sub-módulos `_KCU.*` | impacto transversal amplo |
| admin dashboard | `assets/js/controllers/admin/admin-dashboard.controller.js` | ✅ Decomposto em 3 auxiliares `_KCAD.*` | KPIs, ranking, audit log e export |
| design system global | `assets/css/styles.css` (11.982L / 279.971 bytes) | ⚠️ Monólito reduzido até CSS-C.5; admin, atalho global de mensagens, `.kc-legal-*` e ranking do perfil passaram aos CSS dedicados já carregados; CSS-A/C mede 1.728 regras / 1.945 seletores; CSS-B.1 cobre 21 rotas e 42 screenshots por rodada; `future-split/` segue como stub não carregado | alto risco de regressão visual transversal; exige gates V27/V35/V76 |

## Arquitetura CSS

| Arquivo | Tamanho aprox. | Papel |
|---------|----------------|-------|
| `assets/css/styles.css` | `274.0 KB` | base global de layout, componentes e tema |
| `assets/css/product.css` | `44.3 KB` | especificidades da página de produto |
| `assets/css/admin-shell.css` | `37.7 KB` | shell, navegação e responsividade do admin |
| `assets/css/kc-public-shell.css` | `21.8 KB` | páginas públicas compartilhadas, legais e superfícies de perfil |
| `assets/css/kc-chat.css` | `16.0 KB` | UI de conversa/chat |
| `assets/css/kc-chat-shortcut.css` | `1.3 KB` | atalho global de mensagens injetado por notificações |
| `assets/css/kc-theme-boot.css` | `5.8 KB` | CSS crítico anti-FOUC |
| `assets/css/product-lightbox.css` | `7.9 KB` | lightbox de mídia da página de produto |

Inventario CSS-A: `npm run audit:css` e
`docs/planning/v76-css-ownership-inventory.md` classificam ownership antes de qualquer split.
Baseline CSS-B/C: `npm run audit:css-baseline` e
`docs/planning/v76-css-visual-baseline.md` capturam evidência visual/cascade anônima antes/depois de mudanças CSS pequenas.

Inventario JS-I: `npm run audit:kcapi-residual` e
`docs/planning/v76-kcapi-residual-inventory.md` classificam os buckets residuais da fachada `KCAPI`
antes de novas extracoes runtime. Em JS-I.4, o mesmo comando valida o dossiê do
`bootstrap-driver-core`, seus cinco domínios e 15 gates. Em JS-I.5, a saída passa a rastrear
4 gates cobertos e 11 pendentes com evidência executável.

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
- **v76.6.0 (2026-06-12):** `kc-api.posts-normalize.js` extraido para `window._KCAPI.postsNormalize`, mantendo `KCAPI.normalizePost` como delegacao publica; `assets/js/` sobe para 154 arquivos, `assets/js/api/` para 22 arquivos e Jest sobe para 174 suites / 3567 testes.
- **v76.7.0 (2026-06-12):** `kc-api.ratings.js` passa a concentrar os normalizadores `normalizeUserRating*`, mantendo `KCAPI.normalizeUserRating*` como wrappers publicos; `kc-api.client.js` reduz para 1.508 linhas / 58.290 bytes e Jest sobe para 174 suites / 3570 testes.
- **v76.8.0 (2026-06-12):** CSS-A adiciona `scripts/audit-css-ownership.js`, `npm run audit:css` e `docs/planning/v76-css-ownership-inventory.md`; `styles.css` permanece sem alteracao de cascade, com 1.774 regras / 1.995 seletores parseados.
- **v76.9.0 (2026-06-12):** CSS-B adiciona `scripts/capture-css-visual-baseline.js`, `npm run audit:css-baseline` e `docs/planning/v76-css-visual-baseline.md`; a rodada local capturou 24 screenshots em 12 rotas x 2 viewports, com 0 respostas falhas, 0 overflow horizontal e 0 carregamentos de `future-split/`.
- **v76.10.0 (2026-06-12):** JS-I adiciona `scripts/audit-kcapi-facade-residual.js`, `npm run audit:kcapi-residual` e `docs/planning/v76-kcapi-residual-inventory.md`; a rodada local mediu 107 membros publicos, 145 declaracoes `function`, 98 wrappers exportados/globais, 17 namespaces `_KCAPI.*` e 13 buckets residuais sem alterar runtime.
- **v76.11.0 (2026-06-13):** JS-I.1 move a decisão de driver de external access admin para `assets/js/api/kc-api.help.js`, preserva `KCAPI.listExternalAccessRequests`/`KCAPI.decideExternalAccessRequest`, remove o bucket direto `admin-external-access-direct-driver` do inventário residual e adiciona `tests/contract/kc-api-external-access-contract.test.js`; Jest sobe para 175 suites / 3574 testes.
- **v76.12.0 (2026-06-15):** JS-I.2 remove `buildFallbackNotificationPreferences` e `buildFallbackNotificationChannelTargets` da fachada `KCAPI`; os defaults canônicos permanecem em `assets/js/api/kc-api.notifications.js`, o inventário residual cai para 143 declarações `function` e 11 buckets, e Jest permanece em 175 suites / 3574 testes.
- **v76.13.0 (2026-06-15):** JS-I.3 remove `emitPostMutation`, `isPostMutationOk` e `getPostMutationData` da fachada `KCAPI`; a ponte de freshness de mutações passa para `assets/js/api/kc-api.posts-write.js`, o inventário residual cai para 141 declarações `function` e 10 buckets, e Jest sobe para 175 suites / 3577 testes.
- **v76.14.0 (2026-06-15):** CSS-C move `.kc-admin-nav*` de `styles.css` para `admin-shell.css`; `styles.css` reduz para 12.161 linhas / 284.046 bytes, `admin-shell.css` sobe para 1.399 linhas / 36.459 bytes, e o bucket `Admin overlap` cai para 12 regras / 12 seletores / 63 linhas.
- **v76.15.0 (2026-06-15):** CSS-C.2 move `.kc-admin-tab*`, `.kc-admin-tab-refresh*`, `.kc-admin-invite-feedback.is-*` e o ajuste mobile de `.kc-admin-wrapper` para `admin-shell.css`; `styles.css` reduz para 12.089 linhas / 281.919 bytes, `admin-shell.css` sobe para 1.471 linhas / 38.565 bytes, e o bucket `Admin overlap` cai para 0 regras / 0 seletores / 0 linhas.
- **v76.17.0 (2026-06-15):** CSS-C.3 move o atalho global de mensagens para `assets/css/kc-chat-shortcut.css`, carregado nas 27 páginas com `kc-notifications.js`; `styles.css` reduz para 12.028 linhas / 280.599 bytes, 1.734 regras / 1.954 seletores, e o bucket `Chat overlap` cai para 0 regras / 0 seletores / 0 linhas.
- **v76.26.0 (2026-06-18):** CSS-C.4 move `.kc-legal-*` para `kc-public-shell.css`; `styles.css` reduz para 12.005 linhas / 280.551 bytes e 1.731 regras / 1.948 seletores, o bucket público cai para 119 regras / 117 seletores / 752 linhas e o baseline passa a 17 rotas / 34 capturas.
- **v76.27.0 (2026-06-19):** CSS-C.5 move `.kc-profile-rank-badges*` para `kc-public-shell.css`, corrige o baseline para um perfil público determinístico e reduz `styles.css` para 11.982 linhas / 279.971 bytes e 1.728 regras / 1.945 seletores.
- **v76.28.0 (2026-06-19):** CSS-B.1 inclui 404, ajuda, callback e onboarding no baseline, fecha cobertura das 12 páginas de `kc-public-shell.css` e eleva a matriz para 21 rotas / 42 capturas sem alterar CSS/runtime.
- **v76.29.0 (2026-06-19):** JS-I.4 transforma o `bootstrap-driver-core` em dossiê automatizado de 12 funções / 131 linhas, cinco domínios e 15 gates; a decisão é No-Go para extração runtime.
- **v76.30.0 (2026-06-19):** JS-I.5 adiciona oito contratos comportamentais para `transport-config`, cobre 4/15 gates do núcleo e mantém as quatro funções na fachada.
- `frontendRuntimeVersion` atual é `8.6.1` (constante canônica do runtime).
- Para detalhes completos de cada módulo, ver: `docs/architecture/module-catalog.md`, `docs/architecture/controllers-catalog.md`, `docs/architecture/repository-structure.md`.
