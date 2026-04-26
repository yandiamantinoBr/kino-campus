# RELATÓRIO KINOCAMPUS — V15
## JS Root → Subdirs Completo + Branch Rename + README Fix

**Status:** v15 em execução — v15.0.0 (abertura + branch rename)
**Abertura:** 2026-04-26
**Base:** `kinocampus-V15.0-foundations` (branch renomeada em v15.0.0)
**Antecessor:** v14.11.0 (PR #466) — v14 ENCERRADA
**Tema:** JS Root Cleanup — mover todos os 57 arquivos JS restantes da raiz `assets/js/` para subdirs organizados (boot/, core/, api/, features/, shared/)

---

## 1. Contexto & Motivação

### 1.1 Estado ao abrir V15

A trilha **v14 foi encerrada** com todos os critérios da Definition of Done atendidos:

| Métrica | Baseline V14 | Entrega V14 |
|---|---|---|
| Jest suites | 134 | 134 (inalterado) |
| Jest testes | 3046 | 3046 (inalterado) |
| check:all | 5 validators | ✅ 5 validators verdes |
| Arquivos JS movidos | 0 | 68 (utils + adapters + controllers) |
| Subdirs criados | 0 | 9 novos diretórios |
| validate-repository-structure | 89 itens | 96 itens |
| Lighthouse thresholds | warn | error (perf 0.80, a11y 0.90) |

### 1.2 O que V15 resolve

**Problemas identificados ao abrir V15:**

1. **Branch name desatualizada**: `kinocampus-V11.0-foundations` (projeto está em v15)
   → Renomear para `kinocampus-V15.0-foundations`

2. **README título desatualizado**: `# Kino Campus - v10.0.0`
   → Atualizar para `# Kino Campus - v15.0.0`

3. **Bug em jest.config.js**: `collectCoverageFrom` referencia `assets/js/kc-utils.js`
   mas o arquivo foi movido para `assets/js/utils/kc-utils.js` em V14.7.0
   → Corrigir path no mesmo commit

4. **57 arquivos JS restantes na raiz de `assets/js/`**: Os diretórios `boot/`, `core/`,
   `api/` foram criados em V14.2.0 com apenas READMEs. V15 os povoa com os arquivos canônicos.

5. **Novos subdirs `features/` e `shared/`**: Para os restantes que não se encaixam em
   boot/core/api (kc-create-post.*.js, kc-comments.js, kc-search.js, *.shared.js, etc.)

**Meta final V15**: `assets/js/` raiz completamente vazia de arquivos .js — apenas subdiretórios.

### 1.3 O que V15 NÃO faz

- Não muda stack (sem React, Vite, TS, bundler)
- Não cria novas funcionalidades
- Não move HTMLs públicos (preserva rotas)
- Não altera `vercel.json` rewrites ou CSP (exceto se necessário)
- Não quebra nenhum contrato público `window.*`
- Não altera comportamento funcional de nenhuma feature

---

## 2. Auditoria real (estado verificado pós-V14)

### 2.1 57 arquivos JS na raiz de `assets/js/`

**Grupo Boot** → `assets/js/boot/` (6 arquivos — 1033L)

| Arquivo | Linhas | Namespace | Páginas |
|---|---|---|---|
| kc-theme-boot.js | 20 | `window.matchMedia` | Todas (22) |
| kc-constants.js | 434 | `window.KC_CONSTANTS` | Todas (22) — 1° na boot chain |
| kc-env.js | 244 | `window.KC_ENV` | Todas (22) — ⚠️ inject-env.js |
| kc-feature-flags.js | 170 | `window.KCFF` | Todas (22) — 3° na boot chain |
| kc-sw-register.js | 41 | `window.KCFF` | Todas (22) — 4° na boot chain |
| kc-telemetry.js | 124 | `window.onerror` | Todas (22) — 5° na boot chain |

**Grupo Core** → `assets/js/core/` (11 arquivos — 4301L)

| Arquivo | Linhas | Namespace | Páginas |
|---|---|---|---|
| kc-i18n.js | 815 | `window.KCi18n` | Todas (22) |
| kc-auth.ui.js | 909 | `window.KCAccountProfileUtils` | Todas (22) |
| kc-profiles.client.js | 393 | `window.KCAccountProfileUtils` | Todas (22) |
| kc-theme.js | 139 | `window.matchMedia` | Todas (22) |
| kc-notifications.js | 618 | `window.KCUtils` | Todas (22) |
| kc-auth-callback.js | 280 | `window.KCAccountProfileUtils` | auth-callback.html |
| kc-core.js | 647 | — | ~12 páginas |
| kc-post-model.js | 121 | `window.KCPostModel` | ~12 páginas |
| kc-user-posts.js | 233 | `window.kcUserPosts` | ~12 páginas |
| kc-core-widgets.js | 244 | — | ~12 páginas |
| kc-public-shell.js | 361 | `window.KCUtils` | ~5 páginas |

**Grupo API** → `assets/js/api/` (16 arquivos — 6011L)

| Arquivo | Linhas | Namespace | Páginas |
|---|---|---|---|
| kc-supabase.client.js | 554 | `window.KC_ENV` | Todas (22) |
| kc-supabase.posts.js | 681 | `window.KCSupabase` | Todas (22) |
| kc-supabase.ratings.js | 246 | `window.KCSupabase` | Algumas |
| kc-api.auth.js | 149 | `window._KCAPI` | Todas (22) |
| kc-api.comments-votes.js | 229 | `window._KCAPI` | Todas (22) |
| kc-api.help.js | 77 | `window._KCAPI` | Todas (22) |
| kc-api.notifications.js | 161 | `window._KCAPI` | Todas (22) |
| kc-api.posts-feed.js | 121 | `window._KCAPI` | Todas (22) |
| kc-api.posts-read.js | 173 | `window._KCAPI` | Todas (22) |
| kc-api.posts-write.js | 114 | `window._KCAPI` | Todas (22) |
| kc-api.profiles.js | 138 | `window._KCAPI` | Todas (22) |
| kc-api.ratings.js | 113 | `window._KCAPI` | Todas (22) |
| kc-api.related.js | 240 | `window._KCAPI` | Todas (22) |
| kc-api.saved.js | 125 | `window._KCAPI` | Todas (22) |
| kc-api.client.js | 2410 | `window.KCAPI` | Todas (22) — ⚠️ facade central |
| admin-shell.js | 136 | — | A confirmar em v15.1.0 |

**Grupo Features** → `assets/js/features/` (NOVO — 18 arquivos)

| Arquivo | Linhas | Destino |
|---|---|---|
| kc-create-post.js | 647 | features/create-post/ |
| kc-create-post.schema.js | 177 | features/create-post/ |
| kc-create-post.fields.js | 202 | features/create-post/ |
| kc-create-post.render.js | 732 | features/create-post/ |
| kc-create-post.media.js | 266 | features/create-post/ |
| kc-create-post.resolvers.js | 447 | features/create-post/ |
| kc-create-post.submit.js | 756 | features/create-post/ |
| kc-comments.js | 1068 | features/ |
| kc-search.js | 711 | features/ |
| kc-search-modal.js | 224 | features/ |
| kc-ranking.js | 581 | features/ |
| kc-filters.js | 339 | features/ |
| kc-feed-filters.js | 522 | features/ |
| kc-banners.js | 279 | features/ |
| kc-home-categories.js | 389 | features/ |
| kc-lazy-loader.js | 68 | features/ |
| kc-pull-to-refresh.js | 235 | features/ |
| kc-migrate.myposts.js | 766 | legacy-shims/ (migração) |

**Grupo Shared** → `assets/js/shared/` (NOVO — 7 arquivos)

| Arquivo | Linhas |
|---|---|
| account-profile.shared.js | 962 |
| home-categories.shared.js | 611 |
| help.shared.js | 452 |
| ods.shared.js | 275 |
| search-analytics.shared.js | 195 |
| kc-comments.shared.js | 173 |
| kc-search.shared.js | 303 |

---

## 3. Sequência de iterações V15

| Iter | Escopo | Status | PR | Testes |
|---|---|---|---|---|
| v15.0.0 | Abertura + branch rename + README + jest bugfix | 🔄 Em execução | — | 134/3046 |
| v15.1.0 | Auditoria completa (doc-only) | ⏳ Pendente | — | — |
| v15.2.0 | Boot: kc-theme-boot.js | ⏳ Pendente | — | — |
| v15.3.0 | Boot: kc-sw-register.js + kc-telemetry.js | ⏳ Pendente | — | — |
| v15.4.0 | Boot: kc-constants.js + kc-feature-flags.js | ⏳ Pendente | — | — |
| v15.5.0 | Boot: kc-env.js (CRÍTICO — inject-env.js) | ⏳ Pendente | — | — |
| v15.6.0 | Core: kc-theme.js + kc-notifications.js + kc-post-model.js | ⏳ Pendente | — | — |
| v15.7.0 | Core: kc-i18n.js + kc-core.js + kc-core-widgets.js + kc-user-posts.js | ⏳ Pendente | — | — |
| v15.8.0 | Core: kc-auth.ui.js + kc-profiles.client.js + kc-auth-callback.js + kc-public-shell.js | ⏳ Pendente | — | — |
| v15.9.0 | API: kc-supabase.*.js (3 arquivos) | ⏳ Pendente | — | — |
| v15.10.0 | API: kc-api.*.js (12 sub-módulos) + admin-shell.js | ⏳ Pendente | — | — |
| v15.11.0 | API: kc-api.client.js (CRÍTICO — facade central) | ⏳ Pendente | — | — |
| v15.12.0 | Features: kc-create-post.*.js (7) + kc-comments.js | ⏳ Pendente | — | — |
| v15.13.0 | Features: search, ranking, filters, banners, lazy, pull-to-refresh + legacy-shims | ⏳ Pendente | — | — |
| v15.14.0 | Shared: *.shared.js (7 arquivos) | ⏳ Pendente | — | — |
| v15.15.0 | Cleanup + gate estrutural final + docs/architecture update | ⏳ Pendente | — | — |
| v15.16.0 | QA docs + smoke checklist | ⏳ Pendente | — | — |
| v15.17.0 | Release gate v15 | ⏳ Pendente | — | — |

---

## 4. Definition of Done — V15

### Boot group
- [ ] `assets/js/boot/` contém: kc-theme-boot.js, kc-constants.js, kc-env.js, kc-feature-flags.js, kc-sw-register.js, kc-telemetry.js
- [ ] `inject-env.js` encontra `kc-env.js` no novo path (`boot/kc-env.js` em POSSIBLE_PATHS)
- [ ] Vercel `buildCommand` funciona (inject-env.js resolve kc-env.js em `boot/`)

### Core group
- [ ] `assets/js/core/` contém: kc-i18n.js, kc-auth.ui.js, kc-profiles.client.js, kc-theme.js, kc-notifications.js, kc-auth-callback.js, kc-core.js, kc-post-model.js, kc-user-posts.js, kc-core-widgets.js, kc-public-shell.js

### API group
- [ ] `assets/js/api/` contém: kc-api.client.js, todos kc-api.*.js (12), kc-supabase.client.js, kc-supabase.posts.js, kc-supabase.ratings.js

### Features group
- [ ] `assets/js/features/create-post/` contém 7 arquivos kc-create-post.*.js
- [ ] `assets/js/features/` contém 10 arquivos de features restantes
- [ ] `assets/js/legacy-shims/` contém: kc-migrate.myposts.js

### Shared group
- [ ] `assets/js/shared/` contém 7 arquivos *.shared.js

### Raiz limpa
- [ ] `assets/js/` raiz NÃO contém nenhum arquivo .js (apenas subdiretórios)

### Governança
- [ ] Branch `kinocampus-V15.0-foundations` existe e é a branch principal
- [ ] `README.md` título: `# Kino Campus - v15.0.0`
- [ ] `VERSION.json` appVersion: `15.0.0`, branch: `kinocampus-V15.0-foundations`
- [ ] `.github/workflows/lighthouse-ci.yml` trigger: `kinocampus-V15.0-foundations`
- [ ] `jest.config.js` bugfix: `assets/js/utils/kc-utils.js`

### Qualidade
- [ ] `npm test` ≥ 134 suites / 3046 testes verdes
- [ ] `check:all` verde (todos os 5 validators)
- [ ] `hygiene-check.js` verde (8.6.0)
- [ ] Nenhum HTML com `<script src>` apontando para arquivo inexistente
- [ ] Nenhum arquivo .js na raiz de `assets/js/`
- [ ] Contratos `window.*` preservados (zero quebras)
- [ ] `CHANGELOG.md` com entrada formal `## [15.0.0]`

---

## 5. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `inject-env.js` não encontra `kc-env.js` após move | Alta | Adicionar novo path ANTES do commit; testar com KC_ALLOW_LOCAL_INJECT=1 |
| HTML com `<script src>` quebrado | Alta | Script Node.js atômico + validate-script-chains.js antes do commit |
| `window.KCAPI` contrato quebrado | Média | Apenas git mv + update refs; não alterar APIs |
| hygiene-check.js falha por path antigo | Média | Auditar leituras diretas de arquivo antes de cada move |
| Branch rename quebra Vercel deploy | Baixa | Atualizar branch no Vercel ANTES de deletar a branch antiga |

---

*Documento atualizado a cada iteração do ciclo V15.*
