# Auditoria de Migração JS Root — V15

**Data:** 2026-04-26  
**Branch:** `kinocampus-V15.0-foundations`  
**Escopo:** 58 arquivos `.js` em `assets/js/` raiz → subdirs organizados  
**Estado anterior:** Raiz contém 58 arquivos JS (utils/, adapters/, controllers/ já foram migrados em V14)

---

## Sumário Executivo

| Grupo | Destino | Arquivos | Linhas aprox. | Risco |
|---|---|---|---|---|
| Boot | `assets/js/boot/` | 6 | 1.035 | Médio-Alto (`kc-env.js` = inject-env.js) |
| Core | `assets/js/core/` | 11 | 4.302 | Médio |
| API | `assets/js/api/` | 16 | 6.152 | Alto (`kc-api.client.js` = 2.411L) |
| Features | `assets/js/features/` | 18 | 8.419 | Baixo-Médio |
| Shared | `assets/js/shared/` | 7 | 3.053 | Baixo |
| **TOTAL** | | **58** | **~22.961** | |

---

## Inventário Completo (58 arquivos)

### Grupo Boot → `assets/js/boot/` (6 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-theme-boot.js` | 21L | 22/22 | v15.2.0 | Baixo |
| `kc-constants.js` | 435L | 22/22 | v15.4.0 | Médio (jest.config.js collectCoverageFrom) |
| `kc-env.js` | 245L | 22/22 | v15.5.0 | **ALTO** (inject-env.js POSSIBLE_PATHS) |
| `kc-feature-flags.js` | 171L | 22/22 | v15.4.0 | Médio (boot chain) |
| `kc-sw-register.js` | 42L | 22/22 | v15.3.0 | Baixo |
| `kc-telemetry.js` | 125L | 22/22 | v15.3.0 | Baixo |

**Nota `kc-env.js`:** `scripts/inject-env.js` tem `POSSIBLE_PATHS` que inclui `assets/js/kc-env.js` mas NÃO `assets/js/boot/kc-env.js`. Em v15.5.0 o novo path deve ser adicionado ANTES do antigo para que seja encontrado primeiro.

---

### Grupo Core → `assets/js/core/` (11 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-theme.js` | 140L | 22/22 | v15.6.0 | Baixo |
| `kc-notifications.js` | 619L | 22/22 | v15.6.0 | Baixo |
| `kc-post-model.js` | 122L | 12/22 | v15.6.0 | Baixo |
| `kc-i18n.js` | 816L | 22/22 | v15.7.0 | Médio (hygiene-check I18N_B2_GATE minLines:800) |
| `kc-core.js` | 648L | 12/22 | v15.7.0 | Médio |
| `kc-core-widgets.js` | 245L | 12/22 | v15.7.0 | Baixo |
| `kc-user-posts.js` | 234L | 12/22 | v15.7.0 | Baixo |
| `kc-auth.ui.js` | 910L | 22/22 | v15.8.0 | Médio (contrato `window.KCAuth`) |
| `kc-profiles.client.js` | 394L | 22/22 | v15.8.0 | Médio (contrato `window.KCAccountProfileUtils`) |
| `kc-auth-callback.js` | 281L | 1/22 | v15.8.0 | Baixo (apenas auth-callback.html) |
| `kc-public-shell.js` | 362L | 5/22 | v15.8.0 | Baixo |

---

### Grupo API → `assets/js/api/` (16 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-supabase.client.js` | 555L | 22/22 | v15.9.0 | Médio (contrato `window.KCSupabase`) |
| `kc-supabase.posts.js` | 682L | 22/22 | v15.9.0 | Médio |
| `kc-supabase.ratings.js` | 247L | 22/22 | v15.9.0 | Baixo |
| `kc-api.auth.js` | 150L | 22/22 | v15.10.0 | Baixo |
| `kc-api.comments-votes.js` | 230L | 22/22 | v15.10.0 | Baixo |
| `kc-api.help.js` | 78L | 22/22 | v15.10.0 | Baixo |
| `kc-api.notifications.js` | 162L | 22/22 | v15.10.0 | Baixo |
| `kc-api.posts-feed.js` | 122L | 22/22 | v15.10.0 | Baixo |
| `kc-api.posts-read.js` | 174L | 22/22 | v15.10.0 | Baixo |
| `kc-api.posts-write.js` | 115L | 22/22 | v15.10.0 | Baixo |
| `kc-api.profiles.js` | 139L | 22/22 | v15.10.0 | Baixo |
| `kc-api.ratings.js` | 114L | 22/22 | v15.10.0 | Baixo |
| `kc-api.related.js` | 241L | 22/22 | v15.10.0 | Baixo |
| `kc-api.saved.js` | 126L | 22/22 | v15.10.0 | Baixo |
| `kc-api.client.js` | 2.411L | 22/22 | v15.11.0 | **ALTO** (facade central; contrato `window.KCAPI`) |
| `admin-shell.js` | 137L | 5/22 (admin) | v15.10.0 | Baixo |

**Nota `admin-shell.js`:** Carregado por 5 páginas admin (banners, help-requests, index, moderation, reports). Destino confirmado: `assets/js/api/`.

---

### Grupo Features → `assets/js/features/` (18 arquivos)

#### Sub-grupo `features/create-post/` (7 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-create-post.js` | 648L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.schema.js` | 178L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.fields.js` | 203L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.render.js` | 733L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.media.js` | 267L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.resolvers.js` | 448L | 12/22 | v15.12.0 | Baixo |
| `kc-create-post.submit.js` | 757L | 12/22 | v15.12.0 | Baixo |

#### Sub-grupo `features/` (10 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-comments.js` | 1.069L | 1/22 (profile) | v15.12.0 | Baixo |
| `kc-search.js` | 712L | 12/22 | v15.13.0 | Baixo |
| `kc-search-modal.js` | 225L | 12/22 | v15.13.0 | Baixo |
| `kc-ranking.js` | 582L | 9/22 | v15.13.0 | Baixo (jest.config.js collectCoverageFrom) |
| `kc-filters.js` | 340L | 6/22 | v15.13.0 | Baixo (jest.config.js collectCoverageFrom) |
| `kc-feed-filters.js` | 523L | 6/22 | v15.13.0 | Baixo |
| `kc-banners.js` | 280L | 1/22 (index) | v15.13.0 | Baixo |
| `kc-home-categories.js` | 390L | 11/22 | v15.13.0 | Baixo |
| `kc-lazy-loader.js` | 69L | 7/22 | v15.13.0 | Baixo |
| `kc-pull-to-refresh.js` | 236L | 11/22 | v15.13.0 | Baixo |

#### Sub-grupo `legacy-shims/` (1 arquivo)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `kc-migrate.myposts.js` | 767L | 0/22 (**não carregado**) | v15.13.0 | Baixo |

**Nota `kc-migrate.myposts.js`:** Não carregado por nenhum HTML — migração legada. Destino: `assets/js/legacy-shims/`.

---

### Grupo Shared → `assets/js/shared/` (7 arquivos)

| Arquivo | Linhas | Páginas | Iteração | Risco |
|---|---|---|---|---|
| `account-profile.shared.js` | 963L | 7/22 | v15.14.0 | Baixo (jest.config.js) |
| `home-categories.shared.js` | 612L | 11/22 | v15.14.0 | Baixo |
| `help.shared.js` | 453L | 2/22 | v15.14.0 | Baixo |
| `ods.shared.js` | 276L | 1/22 (ods) | v15.14.0 | Baixo |
| `search-analytics.shared.js` | 196L | 12/22 | v15.14.0 | Baixo |
| `kc-comments.shared.js` | 174L | 0/22 (**não carregado diretamente**) | v15.14.0 | Baixo (jest.config.js) |
| `kc-search.shared.js` | 304L | 12/22 | v15.14.0 | Baixo (jest.config.js) |

---

## Mapa HTML × Scripts (22 páginas)

### Scripts carregados por TODAS as 22 páginas

```
kc-theme-boot.js        → boot/
kc-constants.js         → boot/
kc-env.js               → boot/
kc-feature-flags.js     → boot/
kc-sw-register.js       → boot/
kc-telemetry.js         → boot/
kc-i18n.js              → core/
kc-auth.ui.js           → core/
kc-profiles.client.js   → core/
kc-theme.js             → core/
kc-notifications.js     → core/
kc-supabase.client.js   → api/
kc-supabase.posts.js    → api/
kc-supabase.ratings.js  → api/
kc-api.notifications.js → api/
kc-api.saved.js         → api/
kc-api.help.js          → api/
kc-api.posts-read.js    → api/
kc-api.comments-votes.js→ api/
kc-api.ratings.js       → api/
kc-api.posts-feed.js    → api/
kc-api.posts-write.js   → api/
kc-api.profiles.js      → api/
kc-api.related.js       → api/
kc-api.auth.js          → api/
kc-api.client.js        → api/
```

### Scripts carregados por 12/22 páginas (feeds + create-post)

Páginas: `_product.html`, `achados-perdidos.html`, `caronas-feed.html`, `compra-venda-feed.html`, `create-post.html`, `eventos.html`, `moradia.html`, `my-posts.html`, `ods.html`, `oportunidades.html`, `search-results.html` + 1 extra

```
kc-core.js              → core/
kc-core-widgets.js      → core/
kc-post-model.js        → core/
kc-user-posts.js        → core/
kc-create-post.schema.js→ features/create-post/
kc-create-post.js       → features/create-post/
kc-create-post.media.js → features/create-post/
kc-create-post.resolvers.js → features/create-post/
kc-create-post.fields.js→ features/create-post/
kc-create-post.submit.js→ features/create-post/
kc-create-post.render.js→ features/create-post/
kc-search.js            → features/
kc-search-modal.js      → features/
kc-search.shared.js     → shared/
search-analytics.shared.js → shared/
```

### Scripts por número de páginas (< 12)

| Script | Páginas | Destino |
|---|---|---|
| `home-categories.shared.js` | 11 | shared/ |
| `kc-home-categories.js` | 11 | features/ |
| `kc-pull-to-refresh.js` | 11 | features/ |
| `kc-ranking.js` | 9 | features/ |
| `account-profile.shared.js` | 7 | shared/ |
| `kc-lazy-loader.js` | 7 | features/ |
| `kc-filters.js` | 6 | features/ |
| `kc-feed-filters.js` | 6 | features/ |
| `admin-shell.js` | 5 (admin) | api/ |
| `kc-public-shell.js` | 5 | core/ |
| `help.shared.js` | 2 | shared/ |
| `kc-auth-callback.js` | 1 (auth-callback) | core/ |
| `kc-banners.js` | 1 (index) | features/ |
| `kc-comments.js` | 1 (profile) | features/ |
| `ods.shared.js` | 1 (ods) | shared/ |
| `kc-migrate.myposts.js` | 0 (não carregado) | legacy-shims/ |

---

## Cadeia de Boot Atual (validada por validate-script-chains.js)

```
assets/js/kc-constants.js
→ assets/js/kc-env.js
→ assets/js/kc-feature-flags.js
→ assets/js/kc-sw-register.js
→ assets/js/kc-telemetry.js
```

**Cadeia alvo pós-V15:**

```
assets/js/boot/kc-constants.js
→ assets/js/boot/kc-env.js
→ assets/js/boot/kc-feature-flags.js
→ assets/js/boot/kc-sw-register.js
→ assets/js/boot/kc-telemetry.js
```

---

## Arquivos Críticos a Modificar por Iteração

| Arquivo | Motivo | Iterações |
|---|---|---|
| `scripts/inject-env.js` | POSSIBLE_PATHS não tem `boot/kc-env.js` | v15.5.0 |
| `scripts/validate-script-chains.js` | BOOT_CHAIN referencia caminhos antigos | v15.3.0–v15.5.0 |
| `scripts/hygiene-check.js` | Leituras diretas de arquivo por path | v15.2.0–v15.14.0 |
| `scripts/validate-repository-structure.js` | CANONICAL_JS e REQUIRED_DIRS | cada iteração |
| `jest.config.js` | `collectCoverageFrom` paths | v15.4.0, v15.11.0, v15.13.0, v15.14.0 |
| 22 HTMLs | `<script src>` paths | cada iteração |
| ~134 test files | `require()` paths | por arquivo afetado |

---

## Confirmações de Risco

### ✅ admin-shell.js — CONFIRMADO para `api/`
Carregado por 5 páginas admin: `admin/banners.html`, `admin/help-requests.html`, `admin/index.html`, `admin/moderation.html`, `admin/reports.html`.

### ✅ kc-migrate.myposts.js — CONFIRMADO para `legacy-shims/`
Não carregado por nenhum HTML. É uma migração assistida legada.

### ⚠️ inject-env.js POSSIBLE_PATHS — PENDENTE v15.5.0
Deve incluir `assets/js/boot/kc-env.js` ANTES de `assets/js/kc-env.js`.

### ⚠️ kc-api.client.js — ITERAÇÃO DEDICADA v15.11.0
Arquivo maior (2.411L), facade central `window.KCAPI`, carregado em 22/22 páginas. Requer validação de contrato isolada.

---

## Estado dos Diretórios Existentes

| Diretório | Estado |
|---|---|
| `assets/js/utils/` | ✅ 8 arquivos (V14.7.0) |
| `assets/js/adapters/local/` | ✅ 8 arquivos (V14.8.0) |
| `assets/js/adapters/supabase/` | ✅ 11 arquivos (V14.8.0) |
| `assets/js/controllers/public/` | ✅ 31 arquivos (V14.9.0) |
| `assets/js/controllers/admin/` | ✅ 10 arquivos (V14.9.0) |
| `assets/js/components/` | ✅ 3 arquivos (carousel, toast, voting) |
| `assets/js/boot/` | 🔲 Existe — apenas README.md |
| `assets/js/core/` | 🔲 Existe — apenas README.md |
| `assets/js/api/` | 🔲 Existe — apenas README.md |
| `assets/js/features/` | 🔲 NÃO existe — criar em v15.12.0 |
| `assets/js/features/create-post/` | 🔲 NÃO existe — criar em v15.12.0 |
| `assets/js/shared/` | 🔲 NÃO existe — criar em v15.14.0 |
| `assets/js/legacy-shims/` | 🔲 NÃO existe — criar em v15.13.0 |

---

## Tabela de Iterações

| Iteração | Arquivos movidos | Destino | Observações |
|---|---|---|---|
| v15.2.0 | `kc-theme-boot.js` | boot/ | 22 HTMLs |
| v15.3.0 | `kc-sw-register.js`, `kc-telemetry.js` | boot/ | validate-script-chains update |
| v15.4.0 | `kc-constants.js`, `kc-feature-flags.js` | boot/ | jest.config.js update |
| v15.5.0 | `kc-env.js` | boot/ | inject-env.js POSSIBLE_PATHS |
| v15.6.0 | `kc-theme.js`, `kc-notifications.js`, `kc-post-model.js` | core/ | |
| v15.7.0 | `kc-i18n.js`, `kc-core.js`, `kc-core-widgets.js`, `kc-user-posts.js` | core/ | hygiene I18N gate |
| v15.8.0 | `kc-auth.ui.js`, `kc-profiles.client.js`, `kc-auth-callback.js`, `kc-public-shell.js` | core/ | contratos auth |
| v15.9.0 | `kc-supabase.client.js`, `kc-supabase.posts.js`, `kc-supabase.ratings.js` | api/ | |
| v15.10.0 | 12× `kc-api.*.js` + `admin-shell.js` | api/ | 13 arquivos |
| v15.11.0 | `kc-api.client.js` | api/ | **CRÍTICO** — iteração dedicada |
| v15.12.0 | 7× `kc-create-post.*.js` + `kc-comments.js` | features/create-post/ + features/ | criar features/ |
| v15.13.0 | 10 features + `kc-migrate.myposts.js` | features/ + legacy-shims/ | criar legacy-shims/ |
| v15.14.0 | 7× `*.shared.js` | shared/ | jest.config.js update |
