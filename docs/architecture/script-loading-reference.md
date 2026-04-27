# Referência de Carregamento de Scripts — KinoCampus

**Versão:** v16.0.0  
**Data:** 2026-04-26  
**Criado em:** v16.6.0  
**Gerado a partir de:** leitura real dos 22 HTMLs via Node.js

> **Dados ao vivo:** Este documento foi gerado lendo os `<script src="...">` de cada HTML em ordem
> exata de carregamento. Os números de posição são determinísticos — o browser executa os scripts
> `defer` na ordem em que aparecem no HTML.

---

## 1. Cadeia Base Comum (posições 1–49)

**Idêntica nos 22 HTMLs** (admin usa `../assets/js/` em vez de `assets/js/`).

| Pos | Script | Grupo |
|-----|--------|-------|
| 1 | `boot/kc-theme-boot.js?v=8.6.0` | boot |
| 2 | `boot/kc-constants.js` | boot |
| 3 | `core/kc-i18n.js` | core |
| 4 | `utils/kc-utils.string.js` | utils |
| 5 | `utils/kc-utils.format.js` | utils |
| 6 | `utils/kc-utils.dom.js` | utils |
| 7 | `utils/kc-utils.identity.js` | utils |
| 8 | `utils/kc-utils.taxonomy.js` | utils |
| 9 | `utils/kc-utils.location.js` | utils |
| 10 | `utils/kc-utils.presentation.js` | utils |
| 11 | `utils/kc-utils.js` | utils (facade) |
| 12 | `boot/kc-env.js` | boot |
| 13 | `boot/kc-feature-flags.js` | boot |
| 14 | `boot/kc-sw-register.js` | boot |
| 15 | `boot/kc-telemetry.js` | boot |
| 16 | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | CDN externo |
| 17 | `api/kc-supabase.client.js` | api |
| 18 | `api/kc-supabase.posts.js` | api |
| 19 | `api/kc-supabase.ratings.js` | api |
| 20 | `api/kc-api.notifications.js` | api |
| 21 | `api/kc-api.saved.js` | api |
| 22 | `api/kc-api.help.js` | api |
| 23 | `api/kc-api.posts-read.js` | api |
| 24 | `api/kc-api.comments-votes.js` | api |
| 25 | `api/kc-api.ratings.js` | api |
| 26 | `api/kc-api.posts-feed.js` | api |
| 27 | `api/kc-api.posts-write.js` | api |
| 28 | `api/kc-api.profiles.js` | api |
| 29 | `api/kc-api.related.js` | api |
| 30 | `api/kc-api.auth.js` | api |
| 31 | `api/kc-api.client.js` | api (facade KCAPI) |
| 32 | `adapters/local/local.notifications.adapter.js` | local |
| 33 | `adapters/local/local.ratings.adapter.js` | local |
| 34 | `adapters/local/local.saved.adapter.js` | local |
| 35 | `adapters/local/local.posts-read.adapter.js` | local |
| 36 | `adapters/local/local.posts-write.adapter.js` | local |
| 37 | `adapters/local/local.profile.adapter.js` | local |
| 38 | `adapters/local/local.help.adapter.js` | local |
| 39 | `adapters/supabase/supabase.analytics.adapter.js` | supabase |
| 40 | `adapters/supabase/supabase.admin.adapter.js` | supabase |
| 41 | `adapters/supabase/supabase.comments.adapter.js` | supabase |
| 42 | `adapters/supabase/supabase.votes.adapter.js` | supabase |
| 43 | `adapters/supabase/supabase.media.adapter.js` | supabase |
| 44 | `adapters/supabase/supabase.posts-read.adapter.js` | supabase |
| 45 | `adapters/supabase/supabase.saved.adapter.js` | supabase |
| 46 | `adapters/supabase/supabase.notifications.adapter.js` | supabase |
| 47 | `adapters/supabase/supabase.posts-write.adapter.js` | supabase |
| 48 | `adapters/supabase/supabase.profiles.adapter.js` | supabase |
| 49 | `adapters/supabase/supabase.adapter.js` | supabase (base) |

**Observações da cadeia base:**
- `kc-i18n.js` é carregado na posição 3 — antes dos utils — porque é uma dependência precoce do shell
- Os submódulos `kc-utils.*.js` (4–10) são carregados ANTES da facade `kc-utils.js` (11)
- `kc-env.js` (12) é carregado APÓS os utils — ao contrário do que o nome "boot" sugere. A ordem real é: kc-theme-boot → kc-constants → utils → kc-env → kc-feature-flags → kc-sw-register → kc-telemetry
- `kc-api.client.js` (31) é sempre o **último** script da camada API
- `local.adapter.js` (base) **não aparece** na cadeia — apenas os adapters específicos
- `supabase.adapter.js` (49) é carregado **por último** entre os adapters — é a base dos adapters supabase

---

## 2. Scripts Específicos por Página

### Cadeia Padrão de Feed (posições 50–80)

Usada por: `achados-perdidos.html`, `caronas-feed.html`, `compra-venda-feed.html`,
`eventos.html`, `moradia.html` (80 scripts cada)

| Pos | Script | Grupo |
|-----|--------|-------|
| 50 | `core/kc-profiles.client.js` | core |
| 51 | `components/toast.js` | components |
| 52 | `components/carousel.js` | components |
| 53 | `components/voting.js` | components |
| 54 | `core/kc-post-model.js` | core |
| 55 | `core/kc-user-posts.js` | core |
| 56 | `core/kc-core-widgets.js` | core |
| 57 | `core/kc-core.js` | core |
| 58 | `features/create-post/kc-create-post.schema.js` | create-post |
| 59 | `features/create-post/kc-create-post.js` | create-post |
| 60 | `features/create-post/kc-create-post.media.js` | create-post |
| 61 | `features/create-post/kc-create-post.resolvers.js` | create-post |
| 62 | `features/create-post/kc-create-post.fields.js` | create-post |
| 63 | `features/create-post/kc-create-post.submit.js` | create-post |
| 64 | `features/create-post/kc-create-post.render.js` | create-post |
| 65 | `core/kc-auth.ui.js` | core |
| 66 | `core/kc-notifications.js` | core |
| 67 | `features/kc-pull-to-refresh.js` | features |
| 68 | `controllers/public/kc-feed.controller.js` | controller |
| 69 | `controllers/public/<modulo>-feed.controller.js` | controller |
| 70 | `core/kc-theme.js` | core |
| 71 | `features/kc-filters.js` | features |
| 72 | `features/kc-feed-filters.js` | features |
| 73 | `shared/search-analytics.shared.js` | shared |
| 74 | `shared/home-categories.shared.js` | shared |
| 75 | `features/kc-home-categories.js` | features |
| 76 | `shared/kc-search.shared.js` | shared |
| 77 | `features/kc-search.js` | features |
| 78 | `features/kc-search-modal.js` | features |
| 79 | `features/kc-lazy-loader.js` | features |
| 80 | `features/kc-ranking.js` | features |

> **Observação:** O create-post inline (posições 58–64) está presente em **todos** os feeds
> porque cada página tem um modal de "nova publicação". O controller do feed (69) é carregado
> ANTES de kc-theme, kc-filters e o bloco de search.

---

### `index.html` (79 scripts)

Scripts após a cadeia base (posição 50+):

| Pos | Script |
|-----|--------|
| 50 | `core/kc-profiles.client.js` |
| 51 | `controllers/public/create-post.controller.js` ← carregado antes dos components! |
| 52 | `components/toast.js` |
| 53 | `components/carousel.js` |
| 54 | `components/voting.js` |
| 55–64 | *(core e create-post — igual ao feed padrão)* |
| 65 | `core/kc-auth.ui.js` |
| 66 | `core/kc-notifications.js` |
| 67 | `core/kc-theme.js` |
| 68 | `shared/search-analytics.shared.js` |
| 69 | `shared/home-categories.shared.js` |
| 70 | `features/kc-home-categories.js` |
| 71 | `shared/kc-search.shared.js` |
| 72 | `features/kc-search.js` |
| 73 | `features/kc-pull-to-refresh.js` |
| 74 | `features/kc-ranking.js` |
| 75 | `controllers/public/kc-feed.controller.js` |
| 76 | `controllers/public/index.controller.js` |
| 77 | `features/kc-banners.js` |
| 78 | `features/kc-search-modal.js` |

> **Observação:** `create-post.controller.js` aparece em `index.html` na posição 51 — para
> o modal de quick-create da home. A home NÃO carrega kc-filters nem kc-feed-filters (sem filtros
> de módulo na home — o filtro é por category grid). `kc-banners.js` é carregado por último.

---

### `_product.html` (86 scripts)

Scripts após a cadeia base (posição 50+):

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `core/kc-profiles.client.js` |
| 52 | `components/toast.js` |
| 53 | `components/carousel.js` |
| 54 | `components/voting.js` |
| 55–65 | *(core e create-post inline — igual ao feed padrão)* |
| 66 | `features/kc-lazy-loader.js` |
| 67 | `core/kc-auth.ui.js` |
| 68 | `core/kc-notifications.js` |
| 69 | `controllers/public/product.controller.js` |
| 70 | `controllers/public/product.render.js` |
| 71 | `controllers/public/product.load.js` |
| 72 | `controllers/public/product.report.js` |
| 73 | `controllers/public/product.related.js` |
| 74 | `controllers/public/product.calendar.js` |
| 75 | `controllers/public/product.save.js` |
| 76 | `controllers/public/product.ratings.js` |
| 77 | `controllers/public/product.edit.js` |
| 78 | `controllers/public/product.analytics.js` |
| 79 | `controllers/public/product.popovers.js` |
| 80 | `core/kc-theme.js` |
| 81 | `shared/search-analytics.shared.js` |
| 82 | `shared/home-categories.shared.js` |
| 83 | `features/kc-home-categories.js` |
| 84 | `shared/kc-search.shared.js` |
| 85 | `features/kc-search.js` |
| 86 | `features/kc-search-modal.js` |

> **Observação:** Os 9 auxiliares do produto (69–79) são carregados antes de `kc-theme.js`
> e do bloco de search. `kc-comments.js` não aparece explicitamente — o sistema de comentários
> é inicializado pelo `product.controller.js` via `KCComments.init()`.

---

### `oportunidades.html` (81 scripts)

Igual ao feed padrão + `oportunidades.normalize.js` entre o feed controller e o controller principal:

| Pos | Script |
|-----|--------|
| 76 | `controllers/public/kc-feed.controller.js` |
| 77 | `controllers/public/oportunidades.normalize.js` |
| 78 | `controllers/public/oportunidades.controller.js` |
| 79 | `features/kc-search-modal.js` |
| 80 | `features/kc-lazy-loader.js` |
| 81 | `features/kc-ranking.js` |

---

### `create-post.html` (71 scripts)

| Pos | Script |
|-----|--------|
| 50–64 | *(cadeia padrão: kc-profiles.client → toast/carousel/voting → core → create-post.*)* |
| 65 | `core/kc-auth.ui.js` |
| 66 | `core/kc-notifications.js` |
| 67 | `core/kc-theme.js` |
| 68 | `shared/search-analytics.shared.js` |
| 69 | `shared/kc-search.shared.js` |
| 70 | `features/kc-search.js` |
| 71 | `features/kc-search-modal.js` |

> **Observação:** `create-post.html` **não carrega** `controllers/public/create-post.controller.js`
> explicitamente. Os módulos `features/create-post/*.js` atuam como o controller desta página.
> `create-post.controller.js` é carregado apenas em `index.html` (modal quick-create).
> Também ausente: kc-filters, kc-feed-filters, kc-pull-to-refresh, kc-ranking, kc-banners.

---

### `profile.html` (63 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `features/kc-comments.js` |
| 52 | `core/kc-profiles.client.js` |
| 53 | `features/kc-pull-to-refresh.js` |
| 54 | `core/kc-public-shell.js` |
| 55 | `core/kc-auth.ui.js` |
| 56 | `core/kc-notifications.js` |
| 57 | `core/kc-theme.js` |
| 58 | `features/kc-ranking.js` |
| 59 | `controllers/public/profile.presentation.js` |
| 60 | `controllers/public/profile.collections.js` |
| 61 | `controllers/public/profile.ratings.js` |
| 62 | `controllers/public/profile.flow.js` |
| 63 | `controllers/public/profile.controller.js` |

> **Observação:** `profile.html` carrega `kc-public-shell.js` (posição 54) e `kc-comments.js`
> (51) mas NÃO carrega toast/carousel/voting/kc-core/create-post. É uma das páginas mais leves
> em termos de scripts carregados (63 no total).

---

### `my-posts.html` (75 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `core/kc-profiles.client.js` |
| 52–64 | *(toast/carousel/voting + core + create-post.*)* |
| 65 | `core/kc-auth.ui.js` |
| 66 | `core/kc-notifications.js` |
| 67 | `legacy-shims/kc-migrate.myposts.js` ← shim de migração |
| 68 | `controllers/public/my-posts.controller.js` |
| 69 | `core/kc-theme.js` |
| 70 | `shared/search-analytics.shared.js` |
| 71 | `shared/home-categories.shared.js` |
| 72 | `features/kc-home-categories.js` |
| 73 | `shared/kc-search.shared.js` |
| 74 | `features/kc-search.js` |
| 75 | `features/kc-search-modal.js` |

---

### `settings.html` (57 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `core/kc-profiles.client.js` |
| 52 | `features/kc-pull-to-refresh.js` |
| 53 | `core/kc-public-shell.js` |
| 54 | `core/kc-auth.ui.js` |
| 55 | `core/kc-notifications.js` |
| 56 | `core/kc-theme.js` |
| 57 | `controllers/public/settings.controller.js` |

---

### `account-setup.html` (56 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `core/kc-profiles.client.js` |
| 52 | `core/kc-public-shell.js` |
| 53 | `core/kc-auth.ui.js` |
| 54 | `core/kc-notifications.js` |
| 55 | `core/kc-theme.js` |
| 56 | `controllers/public/account-setup.controller.js` |

---

### `ajuda.html` (58 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/help.shared.js` |
| 51 | `shared/account-profile.shared.js` |
| 52 | `core/kc-profiles.client.js` |
| 53 | `features/kc-pull-to-refresh.js` |
| 54 | `core/kc-public-shell.js` |
| 55 | `core/kc-auth.ui.js` |
| 56 | `core/kc-notifications.js` |
| 57 | `core/kc-theme.js` |
| 58 | `controllers/public/help.controller.js` |

---

### `auth-callback.html` (56 scripts)

| Pos | Script |
|-----|--------|
| 50 | `shared/account-profile.shared.js` |
| 51 | `core/kc-profiles.client.js` |
| 52 | `core/kc-public-shell.js` |
| 53 | `core/kc-auth.ui.js` |
| 54 | `core/kc-notifications.js` |
| 55 | `core/kc-theme.js` |
| 56 | `core/kc-auth-callback.js` |

---

### `ods.html` (75 scripts)

| Pos | Script |
|-----|--------|
| 50–66 | *(cadeia padrão sem pull-to-refresh e sem account-profile)* |
| 67 | `core/kc-theme.js` |
| 68 | `shared/search-analytics.shared.js` |
| 69 | `shared/home-categories.shared.js` |
| 70 | `features/kc-home-categories.js` |
| 71 | `shared/kc-search.shared.js` |
| 72 | `features/kc-search.js` |
| 73 | `features/kc-search-modal.js` |
| 74 | `shared/ods.shared.js` |
| 75 | `controllers/public/ods.controller.js` |

---

### `search-results.html` (73 scripts)

| Pos | Script |
|-----|--------|
| 50–66 | *(cadeia padrão)* |
| 67 | `core/kc-theme.js` |
| 68 | `shared/home-categories.shared.js` |
| 69 | `features/kc-home-categories.js` |
| 70 | `shared/search-analytics.shared.js` |
| 71 | `shared/kc-search.shared.js` |
| 72 | `features/kc-search.js` |
| 73 | `features/kc-search-modal.js` |

> **Observação:** Sem controller separado — `kc-search.js` age como controller desta página.

---

### `admin/index.html` (61 scripts)

| Pos | Script |
|-----|--------|
| 1–49 | *(cadeia base com `../assets/js/` prefix)* |
| 50 | `../assets/js/core/kc-profiles.client.js` |
| 51 | `../assets/js/features/kc-pull-to-refresh.js` |
| 52 | `../assets/js/core/kc-auth.ui.js` |
| 53 | `../assets/js/core/kc-notifications.js` |
| 54 | `../assets/js/core/kc-theme.js` |
| 55 | `../assets/js/api/admin-shell.js?v=8.6.0` |
| 56 | `../assets/js/controllers/admin/admin-dashboard.shared.js` |
| 57 | `../assets/js/controllers/admin/admin-dashboard.metrics.js` |
| 58 | `../assets/js/controllers/admin/admin-dashboard.audit.js` |
| 59 | `../assets/js/controllers/admin/admin-dashboard.charts.js` |
| 60 | `../assets/js/features/kc-ranking.js` |
| 61 | `../assets/js/controllers/admin/admin-dashboard.controller.js?v=8.6.0` |

---

### `admin/banners.html` (55 scripts)

| Pos | Script |
|-----|--------|
| 50–53 | *(kc-profiles.client, kc-auth.ui, kc-notifications, kc-theme)* |
| 54 | `../assets/js/api/admin-shell.js?v=8.6.0` |
| 55 | `../assets/js/controllers/admin/admin-banners.controller.js?v=8.6.0` |

---

### `admin/help-requests.html` (56 scripts)

| Pos | Script |
|-----|--------|
| 50 | `../assets/js/shared/help.shared.js` |
| 51–53 | *(kc-profiles.client, kc-auth.ui, kc-notifications, kc-theme)* |
| 55 | `../assets/js/api/admin-shell.js?v=8.6.0` |
| 56 | `../assets/js/controllers/admin/admin-help-requests.controller.js` |

---

### `admin/moderation.html` (56 scripts)

| Pos | Script |
|-----|--------|
| 50–53 | *(kc-profiles.client, kc-auth.ui, kc-notifications, kc-theme)* |
| 54 | `../assets/js/api/admin-shell.js?v=8.6.0` |
| 55 | `../assets/js/controllers/admin/admin-moderation.controller.js` |
| 56 | `../assets/js/controllers/admin/admin-invite.controller.js` |

> **Observação:** `admin-invite.controller.js` é carregado junto com `admin-moderation.controller.js`
> na página de moderação (posição 56).

---

### `admin/reports.html` (55 scripts)

| Pos | Script |
|-----|--------|
| 50–53 | *(kc-profiles.client, kc-auth.ui, kc-notifications, kc-theme)* |
| 54 | `../assets/js/api/admin-shell.js?v=8.6.0` |
| 55 | `../assets/js/controllers/admin/admin-reports.controller.js` |

---

## 3. Tabela Resumo — Scripts por Página

| HTML | Total Scripts | Controller Principal | Scripts Únicos (após posição 49) |
|------|---------------|---------------------|-----------------------------------|
| `index.html` | 79 | `index.controller.js` | create-post.controller (51), banners (77) |
| `_product.html` | 86 | `product.controller.js` + 8 aux | 9 auxiliares de produto (69–79) |
| `account-setup.html` | 56 | `account-setup.controller.js` | kc-public-shell (52) |
| `achados-perdidos.html` | 80 | `achados-perdidos.controller.js` | feed padrão |
| `ajuda.html` | 58 | `help.controller.js` | help.shared (50), kc-public-shell (54) |
| `auth-callback.html` | 56 | `kc-auth-callback.js` | kc-public-shell (52) |
| `caronas-feed.html` | 80 | `caronas-feed.controller.js` | feed padrão |
| `compra-venda-feed.html` | 80 | `compra-venda-feed.controller.js` | feed padrão |
| `create-post.html` | 71 | *(kc-create-post.js)* | sem filters/rank/shell |
| `eventos.html` | 80 | `eventos.controller.js` | feed padrão |
| `moradia.html` | 80 | `moradia.controller.js` | feed padrão |
| `my-posts.html` | 75 | `my-posts.controller.js` | kc-migrate.myposts.js (67) |
| `ods.html` | 75 | `ods.controller.js` | ods.shared (74) |
| `oportunidades.html` | 81 | `oportunidades.controller.js` | oportunidades.normalize (77) |
| `profile.html` | 63 | `profile.controller.js` + 4 aux | kc-comments (51), kc-public-shell (54) |
| `search-results.html` | 73 | *(kc-search.js)* | sem pull-to-refresh/rank/banners |
| `settings.html` | 57 | `settings.controller.js` | kc-public-shell (53) |
| `admin/index.html` | 61 | `admin-dashboard.controller.js` + 4 aux | admin-shell (55), 4 aux dashboard |
| `admin/banners.html` | 55 | `admin-banners.controller.js` | admin-shell (54) |
| `admin/help-requests.html` | 56 | `admin-help-requests.controller.js` | help.shared (50), admin-shell (55) |
| `admin/moderation.html` | 56 | `admin-moderation.controller.js` | admin-shell (54), admin-invite (56) |
| `admin/reports.html` | 55 | `admin-reports.controller.js` | admin-shell (54) |

---

## 4. Padrões Notáveis

### 4.1 Scripts presentes em TODOS os 22 HTMLs (posições 1–49)
A cadeia base de 49 scripts é universal. Qualquer modificação nela impacta os 22 HTMLs.

### 4.2 Scripts presentes em páginas específicas

| Script | Páginas |
|--------|---------|
| `core/kc-public-shell.js` | auth-callback, ajuda, account-setup, profile, settings |
| `features/kc-pull-to-refresh.js` | todos os feeds + profile + ajuda + settings + admin/index |
| `features/kc-ranking.js` | todos os feeds + index + profile + admin/index |
| `features/kc-banners.js` | apenas `index.html` |
| `features/kc-comments.js` | apenas `profile.html` |
| `features/kc-filters.js` | feeds temáticos + oportunidades |
| `components/carousel.js` | feeds + index + _product + create-post + my-posts + ods + search |
| `api/admin-shell.js` | todas as 5 páginas admin |
| `legacy-shims/kc-migrate.myposts.js` | apenas `my-posts.html` |
| `shared/ods.shared.js` | apenas `ods.html` |

### 4.3 Regra de adição de scripts
Ao adicionar um novo `<script>` a um HTML:
1. Nunca inserir ANTES da posição 31 (kc-api.client.js) sem análise das dependências
2. Scripts de feature: inserir após a posição 66 (`kc-notifications.js`)
3. Controllers: sempre o ÚLTIMO ou um dos últimos scripts do HTML
4. Atualizar `scripts/validate-script-chains.js` se a cadeia de boot for afetada

### 4.4 Versioning via query string
Alguns scripts admin usam `?v=8.6.0` na URL para controle de cache:
- `kc-theme-boot.js?v=8.6.0` — presente em todos os HTMLs
- `admin-shell.js?v=8.6.0` — apenas admin
- `admin-dashboard.controller.js?v=8.6.0` — apenas admin/index.html
- `admin-banners.controller.js?v=8.6.0` — apenas admin/banners.html
