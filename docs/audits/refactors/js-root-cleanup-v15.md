# Retrospectiva: Limpeza da Raiz assets/js/ — V15

**Data**: 2026-04-26
**Versão**: 15.0.0
**Branch base**: kinocampus-V15.0-foundations

---

## Objetivo

Eliminar todos os arquivos `.js` da raiz de `assets/js/` reorganizando-os em
subdiretorios canônicos: `boot/`, `core/`, `api/`, `features/`, `features/create-post/`,
`shared/`, `legacy-shims/`.

---

## Métricas Finais

| Métrica | Antes (V14) | Depois (V15) |
|---|---|---|
| Arquivos JS na raiz `assets/js/` | 57 | 0 ✅ |
| Subdirs com JS | `utils/`, `adapters/`, `controllers/` | +`boot/`, `core/`, `api/`, `features/`, `features/create-post/`, `shared/`, `legacy-shims/` |
| Jest suites | 134/134 | 134/134 ✅ |
| Jest testes | 3046/3046 | 3046/3046 ✅ |
| Validators (`check:all`) | 5/5 ✅ | 5/5 ✅ |
| CANONICAL_JS no validador | 20 entradas | 69 entradas ✅ |
| Itens em `validate-repository-structure.js` | 96 | 144 ✅ |

---

## Iterações de Movimento

| Iteração | Grupo | Arquivos movidos | PR |
|---|---|---|---|
| v15.2.0 | Boot: kc-theme-boot.js | 1 | #465 |
| v15.3.0 | Boot: kc-sw-register.js + kc-telemetry.js | 2 | #466 |
| v15.4.0 | Boot: kc-constants.js + kc-feature-flags.js | 2 | #467 |
| v15.5.0 | Boot: kc-env.js (CRÍTICO — inject-env.js) | 1 | #468 |
| v15.6.0 | Core: kc-theme.js + kc-notifications.js + kc-post-model.js | 3 | #469 |
| v15.7.0 | Core: kc-i18n.js + kc-core.js + kc-core-widgets.js + kc-user-posts.js | 4 | #470 |
| v15.8.0 | Core: kc-auth.ui.js + kc-profiles.client.js + kc-auth-callback.js + kc-public-shell.js | 4 | #472 |
| v15.9.0 | API: kc-supabase.*.js (3 arquivos) | 3 | #473 |
| v15.10.0 | API: kc-api.*.js (12 sub-módulos) + admin-shell.js | 13 | #474 |
| v15.11.0 | API: kc-api.client.js (facade central, 2411L) | 1 | #478 |
| v15.12.0 | Features: kc-create-post.*.js (7) + kc-comments.js | 8 | #479 |
| v15.13.0 | Features: search, ranking, filters, banners, lazy, pull-to-refresh (9) + legacy-shims | 10 | #480 |
| v15.14.0 | Shared: 7 arquivos *.shared.js | 7 | #481 |
| v15.15.0 | Gate estrutural: CANONICAL_JS 20→69 + gate raiz vazia | 0 | #482 |
| **TOTAL** | | **59 arquivos movidos** | |

---

## Estrutura Final de `assets/js/`

```
assets/js/
├── boot/                    (6 arquivos — cadeia de inicialização)
│   ├── kc-theme-boot.js
│   ├── kc-constants.js
│   ├── kc-env.js
│   ├── kc-feature-flags.js
│   ├── kc-sw-register.js
│   └── kc-telemetry.js
├── core/                    (11 arquivos — módulos core do runtime)
│   ├── kc-i18n.js
│   ├── kc-auth.ui.js
│   ├── kc-profiles.client.js
│   ├── kc-theme.js
│   ├── kc-notifications.js
│   ├── kc-auth-callback.js
│   ├── kc-core.js
│   ├── kc-post-model.js
│   ├── kc-user-posts.js
│   ├── kc-core-widgets.js
│   └── kc-public-shell.js
├── api/                     (16 arquivos — drivers e facade KCAPI)
│   ├── kc-supabase.client.js
│   ├── kc-supabase.posts.js
│   ├── kc-supabase.ratings.js
│   ├── kc-api.auth.js
│   ├── kc-api.comments-votes.js
│   ├── kc-api.help.js
│   ├── kc-api.notifications.js
│   ├── kc-api.posts-feed.js
│   ├── kc-api.posts-read.js
│   ├── kc-api.posts-write.js
│   ├── kc-api.profiles.js
│   ├── kc-api.ratings.js
│   ├── kc-api.related.js
│   ├── kc-api.saved.js
│   ├── kc-api.client.js     ← facade central (2411L)
│   └── admin-shell.js
├── features/                (10 arquivos + subdir create-post/)
│   ├── create-post/         (7 arquivos — feature isolada)
│   │   ├── kc-create-post.js
│   │   ├── kc-create-post.schema.js
│   │   ├── kc-create-post.fields.js
│   │   ├── kc-create-post.render.js
│   │   ├── kc-create-post.media.js
│   │   ├── kc-create-post.resolvers.js
│   │   └── kc-create-post.submit.js
│   ├── kc-comments.js
│   ├── kc-search.js
│   ├── kc-search-modal.js
│   ├── kc-ranking.js
│   ├── kc-filters.js
│   ├── kc-feed-filters.js
│   ├── kc-banners.js
│   ├── kc-home-categories.js
│   ├── kc-lazy-loader.js
│   └── kc-pull-to-refresh.js
├── shared/                  (7 arquivos — módulos compartilhados)
│   ├── account-profile.shared.js
│   ├── help.shared.js
│   ├── home-categories.shared.js
│   ├── kc-comments.shared.js
│   ├── kc-search.shared.js
│   ├── ods.shared.js
│   └── search-analytics.shared.js
├── legacy-shims/            (1 arquivo — migração assistida)
│   └── kc-migrate.myposts.js
├── utils/                   (8 arquivos — movidos em V14.7.0)
│   └── ...
├── adapters/                (movidos em V14.8.0)
│   ├── local/
│   └── supabase/
└── controllers/             (movidos em V14.9.0)
    ├── public/
    └── admin/
```

---

## Decisões Técnicas

### kc-env.js — inject-env.js POSSIBLE_PATHS (v15.5.0)
O arquivo `kc-env.js` é lido pelo script `inject-env.js` no build do Vercel.
Foi necessário adicionar `assets/js/boot/kc-env.js` como PRIMEIRA entrada em
`POSSIBLE_PATHS` antes do path legado `assets/js/kc-env.js` (mantido como fallback).
Teste de validação: `KC_ALLOW_LOCAL_INJECT=1 node scripts/inject-env.js` ✅

### admin-shell.js — permanência em api/ (v15.10.0)
Confirmado por grep: `admin-shell.js` é carregado em 5 HTMLs admin. Movido para `api/`.

### kc-migrate.myposts.js → legacy-shims/ (v15.13.0)
Arquivo de migração assistida (766L). Isolado em `legacy-shims/` para indicar
caráter transitório.

### Gate automático de raiz vazia (v15.15.0)
`validate-repository-structure.js` agora falha explicitamente se qualquer
arquivo `.js` for adicionado à raiz de `assets/js/`. Isso impede regressão.

---

## Contratos Preservados

Todos os contratos `window.*` foram preservados — apenas git mv + atualização de
referências. Zero alterações em lógica de negócio:

- `window.KCFF` — kc-feature-flags.js ✅
- `window.KCSupabase` — kc-supabase.client.js ✅
- `window.KCAPI` — kc-api.client.js ✅
- `window.KCAccountProfileUtils` — core/kc-auth.ui.js ✅

---

## Erros Encontrados e Corrigidos

| Iteração | Problema | Correção |
|---|---|---|
| v15.0.0 | `version-map.test.js` tinha 2 hardcodes de branch antiga | Atualizado ambos |
| v15.0.0 | `hygiene-check.js` tinha branch hardcoded | Atualizado linha 153 |
| v15.5.0 | inject-env.js modificou kc-env.js durante teste | `git checkout assets/js/boot/kc-env.js` |
| v15.7.0 | `sw.test.js` esperava paths antigos de kc-i18n/kc-core | sw.js SHELL_ASSETS atualizado |
| v15.10.0 | 53 falhas: `kc-api-client.test.js` não atualizado | Encontrado e corrigido por scan adicional |
| v15.11.0 | `hygiene-check.js` tinha 2 refs residuais a `kc-env.js` | Corrigido versionFiles + token check |
