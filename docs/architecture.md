# KinoCampus - Arquitetura do Frontend

## Visão geral

O KinoCampus continua operando como aplicação estática hospedada na Vercel, com backend Supabase e sem bundler. Cada página HTML carrega explicitamente os scripts de que precisa via `<script defer>`, e a composição entre módulos acontece por meio de IIFEs e contratos expostos em `window.*`.

## Estado atual do repositório

> **Atualizado em v16.11.0** — contagens pós-V15 (reorganização completa de `assets/js/`).

| Item | Quantidade atual |
|------|------------------|
| páginas HTML públicas na raiz | `17` |
| páginas HTML administrativas | `5` |
| total de páginas HTML | `22` |
| módulos JS em `assets/js/` (13 grupos canônicos) | `~84` |
| controllers em `assets/js/controllers/` (public + admin) | `41` |
| adapters em `assets/js/adapters/` (local + supabase) | `19` |
| componentes em `assets/js/components/` | `3` |
| arquivos CSS em `assets/css/` (produção) | `5` |
| suites de teste Jest em `tests/` | `135` |
| testes Jest totais | `3073` |
| suites E2E Playwright | `8` |

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

### Camada 1 - bootstrap (`assets/js/boot/`, 6 módulos)

- `assets/js/boot/kc-constants.js`
- `assets/js/boot/kc-env.js`
- `assets/js/boot/kc-feature-flags.js`
- `assets/js/boot/kc-sw-register.js`
- `assets/js/boot/kc-telemetry.js`
- `assets/js/boot/kc-theme-boot.js`
- `assets/css/kc-theme-boot.css`

### Camada 2 - utils e API (`assets/js/utils/` + `assets/js/api/`, 24 módulos)

- `assets/js/utils/kc-utils.js` + sub-módulos `kc-utils.string.js`, `kc-utils.format.js`, `kc-utils.dom.js`, `kc-utils.identity.js`, `kc-utils.taxonomy.js`, `kc-utils.location.js`, `kc-utils.presentation.js`
- `assets/js/api/kc-api.client.js` (fachada) + sub-módulos `kc-api.posts-feed.js`, `kc-api.posts-read.js`, `kc-api.posts-write.js`, `kc-api.auth.js`, `kc-api.profiles.js`, `kc-api.notifications.js`, `kc-api.comments-votes.js`, `kc-api.ratings.js`, `kc-api.related.js`, `kc-api.saved.js`, `kc-api.help.js`, `kc-supabase-facade.js`, `kc-i18n.js`

### Camada 3 - adapters (`assets/js/adapters/`, 19 módulos)

- Local (8): `local.adapter.js`, `local.posts-read.adapter.js`, `local.posts-write.adapter.js`, `local.notifications.adapter.js`, `local.ratings.adapter.js`, `local.saved.adapter.js`, `local.profile.adapter.js`, `local.help.adapter.js`
- Supabase (11): `supabase.adapter.js`, `supabase.posts-read.adapter.js`, `supabase.posts-write.adapter.js`, `supabase.profiles.adapter.js`, `supabase.notifications.adapter.js`, `supabase.comments.adapter.js`, `supabase.votes.adapter.js`, `supabase.saved.adapter.js`, `supabase.media.adapter.js`, `supabase.analytics.adapter.js`, `supabase.admin.adapter.js`

### Camada 4 - core e features compartilhadas (`assets/js/core/` + `assets/js/features/` + `assets/js/shared/`)

- Core (11): `kc-auth-callback.js`, `kc-auth.ui.js`, `kc-core.js`, `kc-core-widgets.js`, `kc-notifications.js`, `kc-post-model.js`, `kc-profiles.client.js`, `kc-public-shell.js`, `kc-theme.js`, `kc-user-posts.js`, `kc-supabase.client.js`
- Features (17): `kc-create-post.js` + 6 sub-módulos; `kc-feed.controller.js`, `kc-search.shared.js`, `kc-lazy-loader.js`, outros
- Shared (7): `kc-banners.js`, `kc-comments.shared.js`, `kc-ranking.js`, outros

### Camada 5 - controllers de página (`assets/js/controllers/`, 41 controllers)

Públicos (31): um controller principal por página pública + auxiliares (`product.*.js` ×8, `profile.*.js` ×4)

Admin (10): `admin-dashboard.controller.js` + 3 auxiliares (`metrics`, `audit`, `charts`, `shared`) + `admin-moderation.controller.js`, `admin-reports.controller.js`, `admin-banners.controller.js`, `admin-help-requests.controller.js`, `admin-invite.controller.js`

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

> **Atualizado em v16.11.0** — todos os monolitos abaixo foram decompostos entre v11 e v15.

| Área | Arquivo principal | Status pós-V15 | Risco residual |
|------|-----------------|----------------|---------------|
| fachada de API | `assets/js/api/kc-api.client.js` (~2410L) | ✅ Decomposto em 11 sub-módulos `_KCAPI.*` | compatibilidade entre drivers e contrato público |
| adapter Supabase | `assets/js/adapters/supabase/supabase.adapter.js` (~420L) | ✅ Decomposto em 11 sub-adapters `_KCSA.*` | acoplamento com banco, RLS, RPCs |
| detalhe de publicação | `assets/js/controllers/public/product.controller.js` | ✅ Decomposto em 8 auxiliares `_KCProduct.*` | UI crítica e estado compartilhado |
| criação de publicação | `assets/js/features/create-post/kc-create-post.js` | ✅ Decomposto em 6 sub-módulos `_KCCreatePost.*` | formulário central, schemas dinâmicos |
| utilitários globais | `assets/js/utils/kc-utils.js` (~440L) | ✅ Decomposto em 7 sub-módulos `_KCU.*` | impacto transversal amplo |
| admin dashboard | `assets/js/controllers/admin/admin-dashboard.controller.js` | ✅ Decomposto em 3 auxiliares `_KCAD.*` | KPIs, ranking, audit log e export |
| design system global | `assets/css/styles.css` (~10.582L) | ⚠️ Monolito preservado (stubs em `future-split/`) | alto risco de regressão visual transversal |

## Arquitetura CSS

| Arquivo | Tamanho aprox. | Papel |
|---------|----------------|-------|
| `assets/css/styles.css` | `235.4 KB` | base global de layout, componentes e tema |
| `assets/css/product.css` | `43.4 KB` | especificidades da página de produto |
| `assets/css/admin-shell.css` | `26.3 KB` | shell e responsividade do admin |
| `assets/css/kc-public-shell.css` | `16.8 KB` | páginas públicas compartilhadas e superfícies de perfil |
| `assets/css/kc-theme-boot.css` | `5.6 KB` | CSS crítico anti-FOUC |

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
- `frontendRuntimeVersion` permanece em `8.6.0` (constante canônica imutável).
- Para detalhes completos de cada módulo, ver: `docs/architecture/module-catalog.md`, `docs/architecture/controllers-catalog.md`, `docs/architecture/repository-structure.md`.
