# Catálogo de Módulos JS — KinoCampus

**Versão:** v16.0.0  
**Data:** 2026-04-26  
**Criado em:** v16.3.0 (Parte 1) + v16.4.0 (Parte 2)

> **Como ler este catálogo (para IA):**  
> Cada módulo tem grupo, namespace `window.*`, padrão JS, páginas que o carregam,  
> responsabilidade, exports, dependências em runtime, quem o consome e quais testes o cobrem.  
> Use este catálogo como fonte primária antes de ler o código-fonte.  
> Arquivo complementar: `docs/architecture/script-loading-reference.md` (ordem exata por HTML).

---

## Índice

- [Grupo boot/](#grupo-boot) — 6 módulos
- [Grupo core/](#grupo-core) — 11 módulos
- [Grupo api/](#grupo-api) — 18 módulos
- [Grupo utils/](#grupo-utils) — 8 módulos
- [Grupo features/](#grupo-features) — 10 módulos *(v16.4.0)*
- [Grupo features/create-post/](#grupo-featurescreate-post) — 7 módulos *(v16.4.0)*
- [Grupo shared/](#grupo-shared) — 7 módulos *(v16.4.0)*
- [Grupo legacy-shims/](#grupo-legacy-shims) — 1 módulo *(v16.4.0)*
- [Grupo components/](#grupo-components) — 3 módulos *(v16.4.0)*
- [Grupo adapters/local/](#grupo-adapterslocal) — 8 módulos *(v16.4.0)*
- [Grupo adapters/supabase/](#grupo-adapterssupabase) — 11 módulos *(v16.4.0)*
- [Apêndice A — Tabela-índice completa](#apêndice-a--tabela-índice-completa) *(v16.4.0)*
- [Apêndice B — Diagrama de dependências](#apêndice-b--diagrama-de-dependências) *(v16.4.0)*

---

## Grupo boot/

> **Cadeia de inicialização obrigatória.** Os 26 HTMLs canônicos validados carregam a cadeia de boot nesta
> ordem. Nenhum outro módulo do projeto pode ser carregado antes deles.

---

### `boot/kc-constants.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | `window.KC_CONSTANTS` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Define todas as constantes globais imutáveis da plataforma: nomes dos 6
módulos temáticos, URLs de rotas, limites de upload, tamanhos de paginação, configurações de
cache e identificadores de módulo. É a fonte de verdade para qualquer valor constante do sistema.

**Exports públicos:**
- `window.KC_CONSTANTS.modules` — array com os 6 nomes de módulos (`['compra-venda', 'caronas', ...]`)
- `window.KC_CONSTANTS.routes` — mapa de rotas canônicas
- `window.KC_CONSTANTS.limits` — limites (upload, paginação, etc.)
- `window.KC_CONSTANTS.cache` — configurações de TTL de cache

**Dependências em runtime:** Nenhuma (primeiro da cadeia de boot)

**Consumido por:** Praticamente todos os módulos do projeto — kc-feature-flags, kc-env, KCAPI, controllers, adapters

**Testes:** `tests/unit/kc-constants.test.js`

---

### `boot/kc-env.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | `window.KC_ENV` |
| Padrão | Script imperativo + atribuição direta |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Configura o ambiente de runtime: driver de dados (`'supabase'` ou `'local'`),
endpoints do Supabase, chave pública, flags de ambiente e modo de desenvolvimento. É injetado
pelo script de build `scripts/inject-env.js` na Vercel antes do deploy.

**Exports públicos:**
- `window.KC_ENV.driver` — `'supabase'` | `'local'`
- `window.KC_ENV.supabaseUrl` — URL do projeto Supabase
- `window.KC_ENV.supabaseKey` — chave pública (anon key)
- `window.KC_ENV.flags` — flags de feature por ambiente
- `window.KC_ENV.isDev` — boolean

**Dependências em runtime:** `window.KC_CONSTANTS` (segundo da cadeia, após kc-constants)

**Consumido por:** kc-feature-flags, kc-supabase.client, KCAPI, adapters, controllers

**Testes:** Coberto indiretamente por `tests/unit/kc-constants.test.js` e `tests/contract/version-map.test.js`

**Observações:** O path canônico para inject-env.js é `assets/js/boot/kc-env.js` (primeira
entrada em `POSSIBLE_PATHS`). O path legado `assets/js/kc-env.js` existe como fallback mas
o arquivo físico foi removido em v15.5.0.

---

### `boot/kc-feature-flags.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | `window.KCFF` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Gerencia feature flags booleanos que controlam comportamentos opcionais da
plataforma por ambiente. Lê os flags de `window.KC_ENV.flags` e os expõe como propriedades
booleanas imutáveis via `window.KCFF`.

**Exports públicos:**
- `window.KCFF.<flagName>` — boolean por flag (ex: `window.KCFF.enableRanking`)
- `window.KCFF.isEnabled(flagName)` — função helper

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KC_ENV`

**Consumido por:** kc-sw-register, controllers (decidem se renderizam features opcionais)

**Testes:** `tests/unit/kc-feature-flags.test.js`

---

### `boot/kc-sw-register.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo IIFE |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Registra o Service Worker (`sw.js`) no browser se `serviceWorker` estiver
disponível. Verifica se KCFF permite o SW antes de registrar. Emite evento
`sw-registered` no `document` após registro bem-sucedido.

**Exports públicos:** Nenhum (efeito colateral puro)

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KC_ENV`, `window.KCFF`

**Consumido por:** *(sem consumidores diretos — efeito colateral para o browser)*

**Testes:** `tests/unit/sw.test.js`

---

### `boot/kc-telemetry.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo IIFE |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Captura erros não tratados (`window.onerror`, `unhandledrejection`) e os
registra via console estruturado (e futuramente via endpoint de telemetria). Protege a UX de
falhas silenciosas.

**Exports públicos:** Nenhum (efeito colateral puro)

**Dependências em runtime:** `window.KC_ENV` (para saber se está em dev/prod)

**Consumido por:** *(efeito colateral global — captura erros de todos os módulos)*

**Testes:** `tests/unit/telemetry.test.js`

---

### `boot/kc-theme-boot.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo (sem IIFE — executa imediatamente) |
| Páginas | **Todos os 26 HTMLs canônicos** (boot obrigatório) |

**Responsabilidade:** Aplica o tema (claro/escuro) imediatamente ao carregar, antes do render da
página, evitando flash de tema incorreto (FOUC). Lê a preferência do `localStorage` e da media
query `prefers-color-scheme`. Define `data-theme` no `<html>`.

**Exports públicos:** Nenhum

**Dependências em runtime:** Nenhuma (executa antes de qualquer outro módulo)

**Consumido por:** *(efeito colateral direto no DOM — lido por core/kc-theme.js depois)*

**Testes:** Coberto indiretamente por `tests/a11y/a11y.test.js`

---

## Grupo core/

> **Módulos core do runtime.** Carregados após a cadeia de boot e utils. Implementam as
> funcionalidades fundamentais da plataforma: autenticação, temas, notificações, shell público.

---

### `core/kc-i18n.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCi18n` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas públicas (17) |

**Responsabilidade:** Sistema de internacionalização. Fornece traduções de strings da interface,
formatação de datas e números conforme locale, e validação de gates de acessibilidade (B2 gates).
Garante consistência textual entre páginas.

**Exports públicos:**
- `window.KCi18n.t(key)` — traduz uma string por chave
- `window.KCi18n.formatDate(date)` — formata data
- `window.KCi18n.locale` — locale atual

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** Controllers, kc-notifications, kc-public-shell

**Testes:** `tests/unit/kc-i18n.test.js`, `tests/a11y/i18n-b2-gate.test.js`,
`tests/a11y/i18n-aria-placeholder.test.js`, `tests/a11y/i18n-metadata.test.js`,
`tests/a11y/i18n-tooltip.test.js`

**Observações:** O gate B2 de i18n é verificado por `check:hygiene`. Se `KCi18n.t` não estiver
disponível nas páginas corretas, o validator falha.

---

### `core/kc-auth.ui.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCAccountProfileUtils` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Funções de UI relacionadas à autenticação e perfil do usuário: exibir
avatar, nome, badge de verificação, menu de conta. Compartilha estado via
`window.KCAccountProfileUtils`.

**Exports públicos:**
- `window.KCAccountProfileUtils.getDisplayName(user)` — nome de exibição
- `window.KCAccountProfileUtils.getAvatarUrl(user)` — URL do avatar
- `window.KCAccountProfileUtils.isVerified(user)` — boolean

**Dependências em runtime:** `window.KC_ENV`, `window.KCUtils`

**Consumido por:** kc-profiles.client, kc-auth-callback, kc-public-shell, controllers de perfil

**Testes:** `tests/integration/profile.presentation.test.js`

---

### `core/kc-profiles.client.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCProfilesClient` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Cache e operações de perfil no lado do cliente. Mantém o perfil do usuário
logado em memória (SWR pattern), sincroniza com Supabase e expõe métodos para leitura/escrita
de dados de perfil.

**Exports públicos:**
- `window.KCProfilesClient.getProfile(userId)` — retorna perfil (com cache)
- `window.KCProfilesClient.updateProfile(data)` — atualiza perfil
- `window.KCProfilesClient.clearCache()` — limpa cache local

**Dependências em runtime:** `window.KC_ENV`, `window.KCAccountProfileUtils`, `window.KCAPI`

**Consumido por:** Controllers de perfil, account-profile.shared

**Testes:** `tests/integration/profile.presentation.test.js`

---

### `core/kc-theme.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | *(sem namespace global — manipula DOM diretamente)* |
| Padrão | Script imperativo IIFE |
| Páginas | Todas as páginas (public + admin) |

**Responsabilidade:** Gerencia a troca de tema (claro/escuro) pelo usuário. Lê a preferência do
`localStorage`, aplica `data-theme` no `<html>`, e escuta o toggle de tema. Complementa
`kc-theme-boot.js` (que aplica o tema no boot antes do render).

**Exports públicos:** Nenhum (manipula DOM diretamente)

**Dependências em runtime:** `window.KC_CONSTANTS` (para chave do localStorage)

**Consumido por:** *(efeito colateral — lido pelo CSS via `[data-theme]`)*

**Testes:** Coberto indiretamente por `tests/a11y/a11y.test.js`

---

### `core/kc-notifications.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCNotifications` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Sistema de notificações in-app: busca notificações não lidas, renderiza
o dropdown de notificações, marca como lidas, e escuta novos eventos via Supabase Realtime.

**Exports públicos:**
- `window.KCNotifications.init()` — inicializa o sistema
- `window.KCNotifications.markAllRead()` — marca todas como lidas
- `window.KCNotifications.getUnreadCount()` — retorna contagem

**Dependências em runtime:** `window.KCUtils`, `window.KCAPI`, `window.KCSupabase`

**Consumido por:** kc-public-shell (exibe badge no ícone de sino)

**Testes:** `tests/integration/kc-notifications-dropdown.test.js`,
`tests/contract/kc-api-notifications-contract.test.js`,
`tests/contract/kc-api-notification-preferences-contract.test.js`

---

### `core/kc-auth-callback.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo IIFE |
| Páginas | `auth-callback.html` (exclusivo) |

**Responsabilidade:** Processa o callback OAuth após login com Google/provedor. Extrai o token
da URL, completa a autenticação no Supabase, e redireciona o usuário para a página de destino
ou setup de conta.

**Exports públicos:** Nenhum (executa e redireciona)

**Dependências em runtime:** `window.KC_ENV`, `window.KCAccountProfileUtils`, `window.KCSupabase`

**Consumido por:** *(executa em auth-callback.html — não consumido por outros módulos)*

**Testes:** Coberto indiretamente por `tests/integration/kc-api-auth-module.test.js`

---

### `core/kc-core.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCCore` |
| Padrão | IIFE + objeto literal (augmenta `window.KCCore` de kc-core-widgets) |
| Páginas | Todas as páginas públicas |

**Responsabilidade:** Core runtime do frontend: inicializa tabs de navegação, scroll behavior,
sistema de popover, controle de cache do Service Worker e utilitários de UI compartilhados.
É o "glue" entre os submódulos de UI.

**Exports públicos:**
- `window.KCCore.initTabs(container)` — inicializa sistema de tabs
- `window.KCCore.initPopovers()` — inicializa popovers
- `window.KCCore.initWhatsAppShare()` — botão de compartilhamento
- `window.KCCore.clearSWCache()` — limpa cache do SW

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCi18n`, e
`window.KCCore` (parcialmente inicializado por kc-core-widgets antes)

**Consumido por:** Controllers de feed, kc-public-shell

**Testes:** `tests/structure/kc-core-split.test.js`

---

### `core/kc-post-model.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCPostModel` |
| Padrão | Objeto literal global (sem IIFE) |
| Páginas | Páginas de feed e produto |

**Responsabilidade:** Define o model de uma publicação: campos, tipos, valores padrão, funções
de validação e normalização. É a fonte de verdade para a estrutura de dados de uma `post`.

**Exports públicos:**
- `window.KCPostModel.create(data)` — cria post com defaults
- `window.KCPostModel.validate(post)` — valida campos obrigatórios
- `window.KCPostModel.normalize(raw)` — normaliza dados vindos da API

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** Controllers de feed, kc-api.posts-write, kc-create-post

**Testes:** Coberto por `tests/integration/kc-api-posts-write-module.test.js`

---

### `core/kc-user-posts.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.kcUserPosts` |
| Padrão | IIFE + objeto literal |
| Páginas | `my-posts.html`, `profile.html` |

**Responsabilidade:** Gerencia o estado das publicações do usuário logado: lista, paginação,
deleção, e sincronização com o backend. Encapsula a lógica de "minhas publicações".

**Exports públicos:**
- `window.kcUserPosts.init(userId)` — inicializa e carrega posts
- `window.kcUserPosts.deletePost(postId)` — deleta post com confirmação
- `window.kcUserPosts.loadMore()` — paginação

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCAPI`, `window.KCUtils`

**Consumido por:** Controller de my-posts.html, controller de profile.html

**Testes:** Coberto por `tests/integration/kc-api-posts-read-module.test.js`

---

### `core/kc-core-widgets.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | `window.KCCore` (augmenta o objeto — carregado antes de kc-core.js) |
| Padrão | IIFE + augmenta `window.KCCore` |
| Páginas | Todas as páginas públicas |

**Responsabilidade:** Widgets UI compartilhados: dialogs de confirmação, spinners de loading,
estados vazios (empty states), alerts e banners de erro genéricos. É carregado antes de
`kc-core.js` para que o core possa usar os widgets.

**Exports públicos:** Augmenta `window.KCCore` com:
- `window.KCCore.showConfirm(msg, onConfirm)` — dialog de confirmação
- `window.KCCore.showSpinner(el)` / `hideSpinner(el)` — loading state
- `window.KCCore.showEmptyState(el, msg)` — empty state

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`

**Consumido por:** kc-core.js (augmenta o mesmo objeto), controllers

**Testes:** `tests/structure/kc-core-split.test.js`

---

### `core/kc-public-shell.js`

| Campo | Valor |
|-------|-------|
| Grupo | core |
| Namespace | *(sem namespace global — manipula DOM do shell)* |
| Padrão | Script imperativo IIFE |
| Páginas | Todas as páginas públicas (17) |

**Responsabilidade:** Inicializa o shell público: navbar, header com avatar do usuário, footer,
menu mobile, e link de voltar. Injeta a identidade do usuário no header e configura o logout.

**Exports públicos:** Nenhum (manipula DOM do shell)

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KC_ENV`, `window.KCUtils`,
`window.KCAccountProfileUtils`, `window.KCSupabase`

**Consumido por:** *(efeito colateral — não consumido por outros módulos)*

**Testes:** `tests/structure/admin-shell-preload-markup.test.js` (via kc-core-split)

---

## Grupo api/

> **Drivers Supabase + facade KCAPI.** Carregados após boot e utils. Os submódulos `kc-api.*.js`
> são registros parciais que `kc-api.client.js` agrega. Os submódulos Supabase são drivers de
> baixo nível.

---

### `api/kc-supabase.client.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window.KCSupabase` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Cliente Supabase principal: gerencia sessão do usuário (login, logout,
refresh de token), executa queries PostgreSQL via PostgREST, subscreve a canais Realtime e
acessa o Storage.

**Exports públicos:**
- `window.KCSupabase.getUser()` — usuário atual
- `window.KCSupabase.getSession()` — sessão atual
- `window.KCSupabase.query(table, filters)` — query genérica
- `window.KCSupabase.rpc(fnName, params)` — chama RPC PostgreSQL
- `window.KCSupabase.subscribe(channel, callback)` — Realtime

**Dependências em runtime:** `window.KC_ENV` (supabaseUrl, supabaseKey)

**Consumido por:** Todos os adapters supabase, kc-notifications, kc-public-shell, voting.js

**Testes:** `tests/integration/kc-supabase-client.test.js`,
`tests/structure/kc-supabase-split.test.js`

---

### `api/kc-supabase.posts.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCSPosts` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Páginas que exibem feeds de publicações |

**Responsabilidade:** Queries especializadas de publicações no Supabase: busca com cursor,
filtros por módulo, ordenação, fulltext search. Submódulo de baixo nível usado pelo adapter
supabase.

**Exports públicos:** `window._KCSPosts.getFeedCursor()`, `window._KCSPosts.getById()`, etc.

**Dependências em runtime:** `window.KC_ENV`, `window.KCSupabase`

**Consumido por:** `adapters/supabase/supabase.posts-read.adapter.js`

**Testes:** `tests/structure/kc-supabase-split.test.js`, `tests/integration/kc-api-client.test.js`

---

### `api/kc-supabase.ratings.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCSRatings` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Páginas de produto (`_product.html`) |

**Responsabilidade:** Queries de ratings (avaliações) de publicações no Supabase: buscar ratings,
submeter avaliação, calcular médias.

**Exports públicos:** `window._KCSRatings.getRatings()`, `window._KCSRatings.submitRating()`

**Dependências em runtime:** `window.KC_ENV`, `window.KCSupabase`

**Consumido por:** `adapters/supabase/supabase.votes.adapter.js`

**Testes:** `tests/structure/kc-supabase-split.test.js`

---

### `api/kc-api.auth.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_auth` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Submódulo KCAPI de autenticação: login, logout, verificação de sessão,
refresh de token, obter usuário atual.

**Exports públicos:** `window._KCAPI_auth.login()`, `window._KCAPI_auth.logout()`,
`window._KCAPI_auth.getUser()`, `window._KCAPI_auth.getSession()`

**Dependências em runtime:** `window.KC_ENV`, `window.KCSupabase`

**Consumido por:** `window.KCAPI` (kc-api.client.js agrega este submódulo)

**Testes:** `tests/integration/kc-api-auth-module.test.js`

---

### `api/kc-api.comments-votes.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_cv` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Páginas de produto e feed |

**Responsabilidade:** Submódulo KCAPI de comentários e votos: listar comentários, criar, deletar,
votar em comentários, listar votos de um post.

**Exports públicos:** `window._KCAPI_cv.listComments()`, `window._KCAPI_cv.createComment()`,
`window._KCAPI_cv.voteComment()`

**Dependências em runtime:** `window.KC_ENV`, `window.KCSupabase`, adapters

**Consumido por:** `window.KCAPI`, `features/kc-comments.js`

**Testes:** `tests/integration/kc-api-comments-votes-module.test.js`

---

### `api/kc-api.help.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_help` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `ajuda.html`, páginas admin |

**Responsabilidade:** Submódulo KCAPI de pedidos de ajuda: criar ticket de ajuda, listar pedidos,
atualizar status (para admins), responder pedido.

**Exports públicos:** `window._KCAPI_help.createHelpRequest()`,
`window._KCAPI_help.listAdminHelpRequests()`, `window._KCAPI_help.updateHelpStatus()`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, `shared/help.shared.js`

**Testes:** `tests/integration/kc-api-help-module.test.js`

---

### `api/kc-api.notifications.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_notif` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Submódulo KCAPI de notificações: buscar notificações não lidas, marcar como
lidas, preferências de notificação do usuário.

**Exports públicos:** `window._KCAPI_notif.getNotifications()`,
`window._KCAPI_notif.markRead()`, `window._KCAPI_notif.updatePreferences()`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, `core/kc-notifications.js`

**Testes:** `tests/integration/kc-api-notifications-module.test.js`,
`tests/contract/kc-api-notification-preferences-contract.test.js`

---

### `api/kc-api.posts-feed.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_feed` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Páginas de feed (6 módulos + index) |

**Responsabilidade:** Submódulo KCAPI de feed de publicações: busca com cursor (paginação
incremental), filtros, ordenação, contagem de novos posts.

**Exports públicos:** `window._KCAPI_feed.getFeedCursor()`,
`window._KCAPI_feed.getNewPostsCount()`, `window._KCAPI_feed.searchPosts()`

**Dependências em runtime:** `window.KC_ENV`, `window.KC_CONSTANTS`, adapters

**Consumido por:** `window.KCAPI`, controllers de feed

**Testes:** `tests/integration/kc-api-posts-feed-module.test.js`

---

### `api/kc-api.posts-read.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_read` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Página de produto e feeds |

**Responsabilidade:** Submódulo KCAPI de leitura de publicações individuais: buscar post por ID,
posts relacionados, posts salvos do usuário, histórico de visualizações.

**Exports públicos:** `window._KCAPI_read.getPostById()`,
`window._KCAPI_read.getUserSavedPosts()`, `window._KCAPI_read.getRelatedPosts()`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, controller de produto

**Testes:** `tests/integration/kc-api-posts-read-module.test.js`

---

### `api/kc-api.posts-write.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_write` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `create-post.html`, `my-posts.html` |

**Responsabilidade:** Submódulo KCAPI de escrita de publicações: criar, editar, deletar post,
upload de mídia, moderação básica (report).

**Exports públicos:** `window._KCAPI_write.createPost()`, `window._KCAPI_write.updatePost()`,
`window._KCAPI_write.deletePost()`, `window._KCAPI_write.reportPost()`

**Dependências em runtime:** `window.KC_ENV`, `window.KC_CONSTANTS`, adapters

**Consumido por:** `window.KCAPI`, features/create-post, kc-user-posts

**Testes:** `tests/integration/kc-api-posts-write-module.test.js`

---

### `api/kc-api.profiles.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_prof` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `profile.html`, `account-setup.html`, `settings.html` |

**Responsabilidade:** Submódulo KCAPI de perfis: buscar perfil por ID, atualizar perfil, setup
inicial de conta, atualizar avatar.

**Exports públicos:** `window._KCAPI_prof.getProfile()`, `window._KCAPI_prof.updateProfile()`,
`window._KCAPI_prof.setupAccount()`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, kc-profiles.client

**Testes:** `tests/integration/kc-api-profiles-module.test.js`

---

### `api/kc-api.ratings.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_rat` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `_product.html` |

**Responsabilidade:** Submódulo KCAPI de ratings: buscar rating de um post, submeter avaliação
do usuário, calcular média de ratings.

**Exports públicos:** `window._KCAPI_rat.getPostRating()`,
`window._KCAPI_rat.submitRating()`, `window._KCAPI_rat.getUserRating()`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, controller de produto

**Testes:** `tests/integration/kc-api-ratings-module.test.js`

---

### `api/kc-api.related.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_rel` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `_product.html` |

**Responsabilidade:** Submódulo KCAPI de posts relacionados: buscar posts similares com base em
tags, módulo e localização do post atual.

**Exports públicos:** `window._KCAPI_rel.getRelated(postId, module)`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, controller de produto

**Testes:** `tests/integration/kc-api-related-module.test.js`

---

### `api/kc-api.saved.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI_saved` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `_product.html`, `my-posts.html` |

**Responsabilidade:** Submódulo KCAPI de posts salvos: salvar/desalvar um post, listar posts
salvos do usuário.

**Exports públicos:** `window._KCAPI_saved.savePost()`, `window._KCAPI_saved.unsavePost()`,
`window._KCAPI_saved.getSavedPosts(userId)`

**Dependências em runtime:** `window.KC_ENV`, adapters

**Consumido por:** `window.KCAPI`, controller de produto

**Testes:** `tests/integration/kc-api-saved-module.test.js`

---

### `api/kc-api.chat.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI.chat` |
| Padrão | IIFE + facade compartilhado |
| Páginas | `mensagens.html` e páginas autenticadas que expõem chat |

**Responsabilidade:** Facade de chat 1-a-1. Delega para o driver ativo local/Supabase e mantém
`window.KCAPI.chat.*` como a superfície pública usada por controllers e UI.

**Exports públicos:** `startConversation`, `sendMessage`, `uploadChatImage`, `deleteUploadedMedia`,
`listConversations`, `listMessages`, `markRead`, `unreadTotal`, `subscribeChat` e helpers correlatos.

**Dependências em runtime:** `window.KCAPI.ENV`, `window._KCSA.chat`, `window._KCAL.chat`

**Consumido por:** `window.KCAPI.chat`, UI de mensagens e notificações de conversa.

**Testes:** `tests/contract/chat-continuity-contract.test.js`,
`tests/integration/kc-api-client.test.js`

---

### `api/kc-api.diagnostics.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI.diagnostics` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas as páginas que carregam `kc-api.client.js` |

**Responsabilidade:** Estado e helpers de diagnóstico de create-post: normalização de erro,
resumo seguro de payload e leitura/limpeza do último erro reportado pelo fluxo de publicação.

**Exports públicos:** `normalizeErrorForDiagnostics()`, `summarizeCreatePayloadForDiagnostics()`,
`setLastCreatePostError()`, `clearLastCreatePostError()`, `getLastCreatePostError()`

**Dependências em runtime:** `window._KCAPI`

**Consumido por:** `window.KCAPI` e aliases globais de diagnóstico mantidos pela fachada.

**Testes:** `tests/integration/kc-api-diagnostics-module.test.js`,
`tests/contract/kc-api-facade-contract.test.js`,
`tests/integration/kc-api-client.test.js`

---

### `api/kc-api.session.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window._KCAPI.session`, `window.KCSessionStore`, `window.KCPostFreshness` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas as páginas que carregam `kc-api.client.js` |

**Responsabilidade:** Cache de sessão, helpers SWR e barramento de freshness de posts. Mantém
as chaves `kc:9.0.0:*`, o evento `kc:post-freshness`, o canal `kc-post-freshness-v1` e o
broadcast Realtime `kc-posts-changes`.

**Exports públicos:** `window.KCSessionStore.*`, `window.KCPostFreshness.*` e helpers internos em
`window._KCAPI.session` usados pela fachada.

**Dependências em runtime:** `window._KCAPI`, `window.sessionStorage`, `window.localStorage`,
`window.KCSupabase` quando Realtime está disponível.

**Consumido por:** `window.KCAPI`, controllers com SWR, feed/produto/my-posts/profile e listeners
de atualização de conteúdo.

**Testes:** `tests/integration/kc-api-session-module.test.js`,
`tests/integration/kc-api-session-swr.test.js`,
`tests/contract/kc-api-facade-contract.test.js`

---

### `api/kc-api.client.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window.KCAPI` |
| Padrão | IIFE + `Object.freeze` (2433 linhas — facade central) |
| Páginas | **Todas as páginas autenticadas** |

**Responsabilidade:** Facade central da API do KinoCampus. Agrega submódulos KCAPI
(`_KCAPI.*`) e expõe uma interface pública unificada com roteamento para o driver correto
(`local` ou `supabase`) via padrão Strategy. É o único ponto de acesso à camada de dados para
controllers e features.

**Exports públicos (principais):**
- `window.KCAPI.getFeedCursor(params)` — feed incremental com cursor
- `window.KCAPI.getPostById(id)` — busca post por ID
- `window.KCAPI.createPost(data)` — cria publicação
- `window.KCAPI.updatePost(id, data)` — edita publicação
- `window.KCAPI.deletePost(id)` — deleta publicação
- `window.KCAPI.searchPosts(params)` — busca fulltext
- `window.KCAPI.getTopContributors(period, module, limit)` — ranking
- `window.KCAPI.listComments(postId)` — comentários de um post
- `window.KCAPI.getUser()` — usuário logado
- `window.KCAPI.login()` / `logout()` — autenticação

**Dependências em runtime:** Todos os `window._KCAPI.*` submódulos, `window.KC_ENV`,
adapters local e supabase

**Consumido por:** Todos os controllers públicos e admin, features, shared modules

**Testes:** `tests/integration/kc-api-client.test.js`,
`tests/contract/kc-api-facade-contract.test.js`,
`tests/integration/kc-api-session-swr.test.js`

**Observações:** Arquivo JS mais longo do projeto (2809 linhas). Nunca alterar sem rodar `check:all`
+ `npm test`. O padrão Driver é implementado aqui: cada método delega para o adapter correto
baseado em `window.KC_ENV.driver`.

---

### `api/admin-shell.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo IIFE |
| Páginas | `admin/index.html`, `admin/banners.html`, `admin/help-requests.html`, `admin/moderation.html`, `admin/reports.html` |

**Responsabilidade:** Shell admin: navbar, header com identidade do admin, menu de navegação
entre seções admin, logout. Equivalente a `kc-public-shell.js` mas para as 6 páginas admin.

**Exports públicos:** Nenhum (manipula DOM do shell admin)

**Dependências em runtime:** `window.KC_ENV`, `window.KCUtils`, `window.KCSupabase`

**Consumido por:** *(efeito colateral — carregado pelo HTML admin)*

**Testes:** `tests/structure/admin-shell-preload-markup.test.js`

---

## Grupo utils/

> **Utilitários puros.** Sem efeitos colaterais. Carregados após boot. Os submódulos
> `kc-utils.*.js` são carregados antes de `kc-utils.js` (que os agrega).

---

### `utils/kc-utils.string.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_str` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Manipulação de strings: sanitização (escapeHtml), truncamento, slugify,
capitalização, remoção de acentos, formatação de texto.

**Exports públicos:**
- `window._KCU_str.escapeHtml(s)` — **CRÍTICO** — sanitizar antes de `innerHTML`
- `window._KCU_str.truncate(s, len)` — truncar com reticências
- `window._KCU_str.slugify(s)` — transformar em slug URL-safe
- `window._KCU_str.capitalize(s)` — capitalizar primeira letra

**Dependências em runtime:** Nenhuma (puro)

**Consumido por:** `kc-utils.js` (agrega), virtualmente todos os módulos que manipulam texto

**Testes:** `tests/unit/kc-utils-expanded.test.js`

---

### `utils/kc-utils.format.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_fmt` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Formatação de valores para exibição: datas relativas ("há 2 horas"), moeda
(R$), tamanhos de arquivo (KB/MB), números com separador de milhar.

**Exports públicos:**
- `window._KCU_fmt.formatRelativeDate(date)` — "há X tempo"
- `window._KCU_fmt.formatCurrency(value)` — "R$ 1.234,56"
- `window._KCU_fmt.formatFileSize(bytes)` — "1,2 MB"

**Dependências em runtime:** Nenhuma (puro)

**Consumido por:** `kc-utils.js` (agrega), controllers de feed e produto

**Testes:** `tests/unit/kc-utils-format.test.js`

---

### `utils/kc-utils.dom.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_dom` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Helpers DOM: seleção de elementos, manipulação de classes, eventos,
scroll programático, detecção de visibilidade (Intersection Observer helper).

**Exports públicos:**
- `window._KCU_dom.qs(selector, root)` — `querySelector` com root opcional
- `window._KCU_dom.qsa(selector, root)` — `querySelectorAll`
- `window._KCU_dom.on(el, event, fn)` — addEventListener com cleanup
- `window._KCU_dom.scrollTo(el, options)` — scroll suave

**Dependências em runtime:** Nenhuma (puro DOM)

**Consumido por:** `kc-utils.js` (agrega), controllers, kc-core

**Testes:** `tests/unit/kc-utils-dom.test.js`

---

### `utils/kc-utils.identity.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_id` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Geração de identificadores: UUIDs v4, hashes simples, tokens temporários,
verificação de formato de UUID.

**Exports públicos:**
- `window._KCU_id.generateUUID()` — UUID v4
- `window._KCU_id.isUUID(s)` — valida formato UUID
- `window._KCU_id.hashString(s)` — hash simples

**Dependências em runtime:** Nenhuma (puro)

**Consumido por:** `kc-utils.js` (agrega), adapters, create-post

**Testes:** `tests/unit/kc-utils-identity.test.js`

---

### `utils/kc-utils.taxonomy.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_tax` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Taxonomia de módulos: mapeia nomes de módulos (`'compra-venda'`) para
labels de exibição ("Compra e Venda"), cores de tema, ícones, e rotas canônicas.

**Exports públicos:**
- `window._KCU_tax.getLabel(module)` — label de exibição
- `window._KCU_tax.getColor(module)` — cor do módulo
- `window._KCU_tax.getIcon(module)` — ícone emoji/SVG
- `window._KCU_tax.getRoute(module)` — rota HTML canônica

**Dependências em runtime:** `window.KC_CONSTANTS` (lista de módulos)

**Consumido por:** `kc-utils.js` (agrega), controllers de feed, kc-filters

**Testes:** `tests/unit/kc-utils-taxonomy.test.js`

---

### `utils/kc-utils.location.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_loc` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Páginas de feed com filtro geográfico |

**Responsabilidade:** Geolocalização e parsing de endereços: detectar cidade/estado do usuário,
formatar endereço para exibição, calcular distância aproximada entre pontos.

**Exports públicos:**
- `window._KCU_loc.getCurrentCity()` — cidade atual do usuário
- `window._KCU_loc.formatAddress(addr)` — formatar endereço
- `window._KCU_loc.parseLocation(str)` — parsear string de localização

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** `kc-utils.js` (agrega), kc-filters, kc-feed-filters

**Testes:** `tests/unit/kc-utils-location.test.js`

---

### `utils/kc-utils.presentation.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window._KCU_pres` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | Todas que carregam kc-utils.js |

**Responsabilidade:** Funções de apresentação de dados: gerar HTML de cards de feed, formatar
preview de post, gerar badges de status, formatar metadados de publicação para exibição.

**Exports públicos:**
- `window._KCU_pres.renderPostCard(post)` — HTML de card de feed
- `window._KCU_pres.renderPostMeta(post)` — metadados de exibição
- `window._KCU_pres.getStatusBadge(status)` — badge de status

**Dependências em runtime:** `window._KCU_str` (para escapeHtml), `window._KCU_fmt`,
`window._KCU_tax`

**Consumido por:** `kc-utils.js` (agrega), controllers de feed

**Testes:** `tests/unit/kc-utils-presentation.test.js`

---

### `utils/kc-utils.js`

| Campo | Valor |
|-------|-------|
| Grupo | utils |
| Namespace | `window.KCUtils` |
| Padrão | IIFE + `Object.freeze` (facade — agrega todos os submódulos) |
| Páginas | **Todas as páginas** (carregado antes de kc-api.client) |

**Responsabilidade:** Facade de utilitários. Agrega todos os submódulos `_KCU_*` em um único
namespace `window.KCUtils`, expondo os métodos mais usados diretamente. É o único ponto de
acesso que outros módulos devem usar.

**Exports públicos (principais):**
- `window.KCUtils.escapeHtml(s)` — **CRÍTICO** — delega para `_KCU_str.escapeHtml`
- `window.KCUtils.formatRelativeDate(d)` — delega para `_KCU_fmt`
- `window.KCUtils.generateUUID()` — delega para `_KCU_id`
- `window.KCUtils.getModuleLabel(m)` — delega para `_KCU_tax`
- `window.KCUtils.qs(s, r)` — delega para `_KCU_dom`

**Dependências em runtime:** Todos os `window._KCU_*` submódulos (devem ser carregados antes)

**Consumido por:** Virtualmente todos os módulos do projeto

**Testes:** `tests/unit/kc-utils.test.js`, `tests/unit/kc-utils-expanded.test.js`

**Observações:** `window.KCUtils.escapeHtml()` é **obrigatório** antes de qualquer
`el.innerHTML = userContent`. O check:hygiene valida usos inline de `innerHTML` sem escapeHtml.

---

## Grupo features/

> **Features de interface.** Módulos que implementam funcionalidades específicas da UX:
> busca, comentários, ranking, filtros, banners, etc. Carregados após boot, utils e KCAPI.

---

### `features/kc-comments.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCComments` |
| Padrão | IIFE + objeto literal |
| Páginas | `_product.html` e páginas de feed com comentários habilitados |

**Responsabilidade:** Sistema completo de comentários: renderiza a thread de comentários de um
post, gerencia criação/deleção, paginação de comentários, e integração com o sistema de votos
em comentários. Usa Realtime do Supabase para comentários ao vivo.

**Exports públicos:**
- `window.KCComments.init(postId, container)` — inicializa thread
- `window.KCComments.refresh()` — recarrega comentários
- `window.KCComments.destroy()` — limpa listeners e estado

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCAPI`,
`window.KCSupabase`

**Consumido por:** Controller de produto

**Testes:** `tests/integration/kc-comments-session.test.js`,
`tests/integration/kc-comments-shadow-cleanup.test.js`,
`tests/integration/kc-comments.shared.test.js`

---

### `features/kc-search.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCSearch` |
| Padrão | IIFE + objeto literal |
| Páginas | `search-results.html` |

**Responsabilidade:** Feature de busca global: processa query de busca, exibe resultados
paginados com highlight de termos, gerencia histórico de busca e analytics de busca.

**Exports públicos:**
- `window.KCSearch.init(query)` — inicializa com query da URL
- `window.KCSearch.search(query)` — executa nova busca
- `window.KCSearch.loadMore()` — paginação de resultados

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCAPI`,
`window.KCSearchShared`

**Consumido por:** Controller de search-results.html

**Testes:** `tests/integration/kc-search.shared.test.js`

---

### `features/kc-search-modal.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCSearchModal` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas públicas (via kc-public-shell) |

**Responsabilidade:** Modal de busca rápida acessível pelo header. Exibe sugestões em tempo
real enquanto o usuário digita, histórico de buscas recentes, e navega para search-results.html
ao submeter.

**Exports públicos:**
- `window.KCSearchModal.open()` — abre o modal
- `window.KCSearchModal.close()` — fecha o modal
- `window.KCSearchModal.getSuggestions(q)` — busca sugestões

**Dependências em runtime:** `window.KCUtils`, `window.KCAPI`, `window.KCSearchShared`

**Consumido por:** kc-public-shell (liga o botão de busca ao modal)

**Testes:** `tests/integration/kc-search.shared.test.js`

---

### `features/kc-ranking.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCRanking` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de feed (sidebar de ranking) |

**Responsabilidade:** Widget de ranking de contribuidores: busca top contributors por período
e módulo, renderiza a lista com avatars e contagens, e atualiza periodicamente.

**Exports públicos:**
- `window.KCRanking.init(container, module)` — inicializa widget
- `window.KCRanking.refresh(period)` — atualiza dados (mês/semana/todo)

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCAPI`

**Consumido por:** Controllers de feed

**Testes:** `tests/unit/kc-ranking.test.js`, `tests/integration/kc-ranking-session.test.js`,
`tests/structure/kc-ranking-markup.test.js`

---

### `features/kc-filters.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCFilters` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de feed com filtros |

**Responsabilidade:** Sistema de filtros genérico: gerencia estado de filtros ativos (módulo,
localização, tipo, data), gera query params para URL, e dispara re-fetch do feed ao aplicar.

**Exports públicos:**
- `window.KCFilters.init(container)` — inicializa UI de filtros
- `window.KCFilters.getActive()` — retorna filtros ativos
- `window.KCFilters.reset()` — limpa todos os filtros

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window._KCU_loc`

**Consumido por:** kc-feed-filters, controllers de feed

**Testes:** `tests/unit/kc-filters.test.js`

---

### `features/kc-feed-filters.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCFeedFilters` |
| Padrão | IIFE + objeto literal |
| Páginas | `index.html`, páginas de feed temático |

**Responsabilidade:** Filtros específicos de feeds: combinação de KCFilters com UI de chips de
filtro e integração com o cursor de feed. Persiste filtros na URL (query params) e no
sessionStorage.

**Exports públicos:**
- `window.KCFeedFilters.init(feedEl)` — inicializa
- `window.KCFeedFilters.applyFilter(key, value)` — aplica filtro específico
- `window.KCFeedFilters.getParams()` — retorna params para KCAPI.getFeedCursor

**Dependências em runtime:** `window.KCFilters`, `window.KCUtils`, `window.KC_CONSTANTS`

**Consumido por:** Controllers de feed

**Testes:** `tests/unit/kc-feed-filters.test.js`

---

### `features/kc-banners.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCBanners` |
| Padrão | IIFE + objeto literal |
| Páginas | `index.html`, páginas de feed temático |

**Responsabilidade:** Busca e gerencia os dados dos banners promocionais do hero carousel.
Fornece os banners ativos via KCAPI e os entrega ao `carousel.js` para exibição.

**Exports públicos:**
- `window.KCBanners.load(module)` — carrega banners do módulo
- `window.KCBanners.getActive()` — retorna banners ativos
- `window.KCBanners.refresh()` — atualiza banners

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCAPI`

**Consumido por:** Controllers de feed (inicializa o carousel com os dados)

**Testes:** `tests/integration/kc-banners.test.js`

---

### `features/kc-home-categories.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCHomeCategories` |
| Padrão | IIFE + objeto literal |
| Páginas | `index.html` |

**Responsabilidade:** Renderiza a grade de categorias (6 módulos temáticos) na home com
contagem de posts ativos, ícones e links. Atualiza as contagens periodicamente.

**Exports públicos:**
- `window.KCHomeCategories.init(container)` — renderiza grade
- `window.KCHomeCategories.refresh()` — atualiza contagens

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCAPI`,
`window.KCHomeCategoriesShared`

**Consumido por:** Controller de index.html

**Testes:** `tests/integration/home-categories.shared.test.js`

---

### `features/kc-lazy-loader.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCLazyLoader` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas com imagens de feed |

**Responsabilidade:** Carregamento lazy de imagens via Intersection Observer. Substitui `src`
de `<img data-lazy-src="...">` ao entrar no viewport, com placeholder e skeleton loading.

**Exports públicos:**
- `window.KCLazyLoader.init(root)` — inicializa observer
- `window.KCLazyLoader.observe(img)` — observa imagem específica
- `window.KCLazyLoader.disconnect()` — para o observer

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** Controllers de feed (após renderizar cards)

**Testes:** `tests/unit/lazy-loader.test.js`

---

### `features/kc-pull-to-refresh.js`

| Campo | Valor |
|-------|-------|
| Grupo | features |
| Namespace | `window.KCPullToRefresh` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de feed (mobile) |

**Responsabilidade:** Gesto de pull-to-refresh para atualizar o feed em dispositivos móveis.
Detecta o gesto de arrastar para baixo no topo da lista e dispara o reload do feed.

**Exports públicos:**
- `window.KCPullToRefresh.init(container, onRefresh)` — inicializa gesto
- `window.KCPullToRefresh.destroy()` — remove listeners

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** Controllers de feed

**Testes:** `tests/integration/ios-gesture-hardening.test.js`

---

## Grupo features/create-post/

> **Feature isolada de criação de publicações.** 7 módulos colaborativos carregados exclusivamente
> em `create-post.html`. O orchestrador é `kc-create-post.js`.

---

### `features/create-post/kc-create-post.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePost` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Orchestrador do formulário de criação: inicializa os submódulos, gerencia
o estado global do formulário (módulo selecionado, campos preenchidos, mídia), e coordena
a submissão.

**Exports públicos:**
- `window.KCCreatePost.init()` — inicializa o formulário completo
- `window.KCCreatePost.getState()` — retorna estado atual
- `window.KCCreatePost.reset()` — reseta o formulário

**Dependências em runtime:** Todos os submódulos KCCreatePost.*, `window.KCAPI`, `window.KCUtils`

**Consumido por:** Controller de create-post.html

**Testes:** `tests/integration/create-post.controller.test.js`,
`tests/contract/kc-create-post-contract.test.js`

---

### `features/create-post/kc-create-post.schema.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostSchema` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Schema de validação por módulo: define quais campos são obrigatórios,
opcionais, seus tipos, limites de caracteres e regras de validação para cada um dos 6 módulos.

**Exports públicos:**
- `window.KCCreatePostSchema.get(module)` — retorna schema do módulo
- `window.KCCreatePostSchema.validate(module, data)` — valida dados

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** `kc-create-post.js`, `kc-create-post.submit.js`

**Testes:** `tests/integration/kc-create-post-schema.test.js`

---

### `features/create-post/kc-create-post.fields.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostFields` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Definição e gerenciamento dos campos do formulário por módulo: campo de
título, descrição, preço, localização, categoria — cada módulo ativa campos diferentes.

**Exports públicos:**
- `window.KCCreatePostFields.getFields(module)` — lista de campos do módulo
- `window.KCCreatePostFields.getValue(fieldName)` — lê valor de campo
- `window.KCCreatePostFields.setValue(fieldName, value)` — define valor

**Dependências em runtime:** `window.KCCreatePostSchema`, `window.KC_CONSTANTS`

**Consumido por:** `kc-create-post.js`, `kc-create-post.render.js`

**Testes:** `tests/integration/kc-create-post-fields.test.js`,
`tests/integration/kc-create-post-active-fields.test.js`

---

### `features/create-post/kc-create-post.render.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostRender` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Renderização dinâmica do formulário: gera HTML dos campos com base no
módulo selecionado, aplica validação visual em tempo real, e atualiza o preview do post.

**Exports públicos:**
- `window.KCCreatePostRender.renderForm(module, container)` — renderiza form
- `window.KCCreatePostRender.renderPreview(data)` — atualiza preview
- `window.KCCreatePostRender.showFieldError(field, msg)` — exibe erro

**Dependências em runtime:** `window.KCCreatePostFields`, `window.KCUtils`

**Consumido por:** `kc-create-post.js`

**Testes:** `tests/integration/kc-create-post-render.test.js`

---

### `features/create-post/kc-create-post.media.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostMedia` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Upload e preview de mídia (imagens): seleção de arquivo, compressão
client-side antes do upload, preview imediato, remoção de imagens e integração com o Storage
do Supabase.

**Exports públicos:**
- `window.KCCreatePostMedia.init(container)` — inicializa área de upload
- `window.KCCreatePostMedia.getFiles()` — retorna arquivos selecionados
- `window.KCCreatePostMedia.uploadAll()` — faz upload de todas as imagens

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`, `window.KCAPI`

**Consumido por:** `kc-create-post.js`, `kc-create-post.submit.js`

**Testes:** `tests/integration/kc-create-post-media.test.js`,
`tests/unit/image-compression.test.js`

---

### `features/create-post/kc-create-post.resolvers.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostResolvers` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Resolvers de campos dinâmicos: lógica específica de cada módulo para
campos especiais (ex: campo de rota de carona, número de vagas, tipo de oportunidade). Isola
a lógica de negócio dos campos do renderer.

**Exports públicos:**
- `window.KCCreatePostResolvers.resolve(module, field, context)` — resolve campo
- `window.KCCreatePostResolvers.getOptions(module, field)` — opções de select

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCCreatePostSchema`

**Consumido por:** `kc-create-post.fields.js`

**Testes:** `tests/integration/kc-create-post-resolvers.test.js`,
`tests/unit/kc-utils-resolvers.test.js`

---

### `features/create-post/kc-create-post.submit.js`

| Campo | Valor |
|-------|-------|
| Grupo | features/create-post |
| Namespace | `window.KCCreatePostSubmit` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` (exclusivo) |

**Responsabilidade:** Submissão e validação final do formulário: coleta todos os campos, valida
pelo schema, faz upload das mídias pendentes, chama `KCAPI.createPost()`, e redireciona para
o post criado após sucesso.

**Exports públicos:**
- `window.KCCreatePostSubmit.submit()` — executa submissão completa
- `window.KCCreatePostSubmit.validate()` — apenas valida sem submeter

**Dependências em runtime:** `window.KCCreatePostSchema`, `window.KCCreatePostFields`,
`window.KCCreatePostMedia`, `window.KCAPI`, `window.KCUtils`

**Consumido por:** `kc-create-post.js`

**Testes:** `tests/integration/kc-create-post-submit.test.js`,
`tests/integration/compra-venda-ingressos.test.js`

---

## Grupo shared/

> **Módulos compartilhados.** Estado e lógica compartilhados entre controllers de páginas
> diferentes. Carregados nas páginas que precisam do estado compartilhado.

---

### `shared/account-profile.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCAccountProfile` |
| Padrão | IIFE + objeto literal |
| Páginas | `profile.html`, `account-setup.html`, `settings.html` |

**Responsabilidade:** Estado compartilhado de perfil de conta entre as páginas de perfil e
configurações: dados do usuário logado, preferências, histórico de publicações e coleções.

**Exports públicos:**
- `window.KCAccountProfile.get()` — retorna dados do perfil atual
- `window.KCAccountProfile.set(data)` — atualiza estado
- `window.KCAccountProfile.clear()` — limpa estado

**Dependências em runtime:** `window.KCAPI`, `window.KCUtils`

**Consumido por:** Controllers de profile, account-setup, settings

**Testes:** `tests/integration/account-profile.shared.test.js`

---

### `shared/help.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCHelpShared` |
| Padrão | IIFE + objeto literal |
| Páginas | `ajuda.html`, páginas admin de help-requests |

**Responsabilidade:** Dados e lógica compartilhados do módulo de ajuda: categorias de ajuda,
estados possíveis de tickets, formatação de pedidos de ajuda.

**Exports públicos:**
- `window.KCHelpShared.getCategories()` — categorias de ajuda
- `window.KCHelpShared.formatRequest(req)` — formata pedido para exibição

**Dependências em runtime:** `window.KC_CONSTANTS`, `window.KCUtils`

**Consumido por:** Controllers de ajuda.html e admin/help-requests.html

**Testes:** `tests/integration/help.shared.test.js`

---

### `shared/home-categories.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCHomeCategoriesShared` |
| Padrão | IIFE + objeto literal |
| Páginas | `index.html` |

**Responsabilidade:** Dados compartilhados das categorias da home: configuração das 6 categorias
(ícone, label, cor, rota) usada tanto pelo widget KCHomeCategories quanto pelo controller da home.

**Exports públicos:**
- `window.KCHomeCategoriesShared.getAll()` — todas as categorias com metadados

**Dependências em runtime:** `window.KC_CONSTANTS`, `window._KCU_tax`

**Consumido por:** `features/kc-home-categories.js`, controller de index.html

**Testes:** `tests/integration/home-categories.shared.test.js`

---

### `shared/kc-comments.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCCommentsShared` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas que usam comentários |

**Responsabilidade:** Estado e lógica compartilhados de comentários: cache de comentários já
carregados, estado de edição em andamento, e helpers de formatação de comentários.

**Exports públicos:**
- `window.KCCommentsShared.cache` — cache de comentários por postId
- `window.KCCommentsShared.formatComment(c)` — formata comentário

**Dependências em runtime:** `window.KCUtils`

**Consumido por:** `features/kc-comments.js`

**Testes:** `tests/integration/kc-comments.shared.test.js`

---

### `shared/kc-search.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCSearchShared` |
| Padrão | IIFE + objeto literal |
| Páginas | `search-results.html`, header (via kc-search-modal) |

**Responsabilidade:** Estado compartilhado de busca: histórico de buscas recentes, query atual,
filtros de busca ativos. Persiste histórico no localStorage.

**Exports públicos:**
- `window.KCSearchShared.getHistory()` — histórico de buscas
- `window.KCSearchShared.addToHistory(q)` — adiciona ao histórico
- `window.KCSearchShared.getCurrentQuery()` — query atual da URL

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** `features/kc-search.js`, `features/kc-search-modal.js`

**Testes:** `tests/integration/kc-search.shared.test.js`

---

### `shared/ods.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCODSShared` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | `ods.html` |

**Responsabilidade:** Dados compartilhados dos ODS (Objetivos de Desenvolvimento Sustentável):
mapeamento dos 17 ODS com ícones, cores e descrições, e integração com os módulos temáticos.

**Exports públicos:**
- `window.KCODSShared.getAll()` — todos os 17 ODS
- `window.KCODSShared.getByModule(module)` — ODS do módulo

**Dependências em runtime:** `window.KC_CONSTANTS`

**Consumido por:** Controller de ods.html

**Testes:** `tests/integration/ods.shared.test.js`

---

### `shared/search-analytics.shared.js`

| Campo | Valor |
|-------|-------|
| Grupo | shared |
| Namespace | `window.KCSearchAnalytics` |
| Padrão | IIFE + objeto literal |
| Páginas | `search-results.html` |

**Responsabilidade:** Analytics de busca: registra buscas realizadas, cliques em resultados,
e CTR (click-through rate). Compartilhado entre kc-search.js e o controller de resultados.

**Exports públicos:**
- `window.KCSearchAnalytics.trackSearch(q, resultCount)` — registra busca
- `window.KCSearchAnalytics.trackClick(postId, position)` — registra clique

**Dependências em runtime:** `window.KCAPI`

**Consumido por:** `features/kc-search.js`, controller de search-results.html

**Testes:** `tests/integration/search-analytics.shared.test.js`

---

## Grupo legacy-shims/

> **Shims de migração assistida.** Arquivos com caráter transitório. Removidos quando a
> migração for concluída.

---

### `legacy-shims/kc-migrate.myposts.js`

| Campo | Valor |
|-------|-------|
| Grupo | legacy-shims |
| Namespace | *(sem namespace global)* |
| Padrão | Script imperativo IIFE (766 linhas) |
| Páginas | `my-posts.html` (durante migração) |

**Responsabilidade:** Migração assistida do módulo "minhas publicações" de formato antigo
(localStorage v1) para o novo formato (Supabase + formato v2). Executa uma vez por usuário
e marca a migração como concluída.

**Exports públicos:** Nenhum (efeito colateral puro)

**Dependências em runtime:** `window.KC_ENV`, `window.KCAPI`, `window.KCUtils`

**Consumido por:** *(carregado pelo HTML apenas enquanto necessário)*

**Testes:** Coberto indiretamente por `tests/integration/local-adapter.test.js`

**Observações:** Arquivo isolado em `legacy-shims/` para indicar caráter transitório.
Removível quando toda a base de usuários tiver migrado.

---

## Grupo components/

> **Componentes UI reutilizáveis.** Carregados via `<script defer>` após KCAPI e core.
> Não expõem namespace `window.*` — usam funções/variáveis globais de módulo.

---

### `components/carousel.js`

| Campo | Valor |
|-------|-------|
| Grupo | components |
| Namespace | *(funções globais: `showSlide`, `changeSlide`, `goToSlide`, `refreshHeroCarousel`)* |
| Padrão | Funções globais (sem IIFE explícita) |
| Páginas | `index.html`, `_product.html`, e todas as páginas de feed temático |

**Responsabilidade:** Hero carousel de banners promocionais: controla slides, auto-rotação
temporizada, navegação por botões e swipe, e indicadores de posição.

**Dependências em runtime:** `window.KC_ENV` (detecta driver)

**Consumido por:** `features/kc-banners.js` (fornece dados), controllers de feed (inicializa)

**Testes:** Coberto por `tests/integration/kc-banners.test.js`

---

### `components/toast.js`

| Campo | Valor |
|-------|-------|
| Grupo | components |
| Namespace | *(função global: `showToast(message, type, duration)`)* |
| Padrão | Função global |
| Páginas | Todas as páginas públicas e admin |

**Responsabilidade:** Notificações toast (snackbar) temporárias para feedback de ações do
usuário. Tipos: `'success'`, `'error'`, `'warning'`, `'info'`. Auto-desaparece após `duration` ms.

**Dependências em runtime:** Nenhuma (CSS puro para animação)

**Consumido por:** Todos os controllers (após ações de escrita ou erro)

**Testes:** Coberto indiretamente por controllers tests

---

### `components/voting.js`

| Campo | Valor |
|-------|-------|
| Grupo | components |
| Namespace | *(variáveis de módulo: `kcVotesRealtimeChannel`, timers)* |
| Padrão | Variáveis de módulo globais |
| Páginas | `index.html`, `_product.html`, páginas de feed |

**Responsabilidade:** Sistema de votos (upvote/downvote) em publicações com sincronização via
Supabase Realtime ou polling de fallback. Persiste votos da sessão no `KCSessionStore`.

**Dependências em runtime:** `window.KCSupabase`, `window.KCAPI`, `window.KCSessionStore`

**Consumido por:** Controllers de feed e produto (renderizam os botões de voto)

**Testes:** Coberto por `tests/integration/kc-api-comments-votes-module.test.js`

---

## Grupo adapters/local/

> **Adapters de persistência local (localStorage).** Implementam a interface de dados
> usando localStorage como backend. Usados quando `KC_ENV.driver === 'local'`.

---

### `adapters/local/local.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas (quando driver = 'local') |

**Responsabilidade:** Adapter base localStorage: CRUD genérico em localStorage com serialização
JSON, TTL opcional, e namespacing por chave. Base para todos os adapters locais específicos.

**Testes:** `tests/integration/local-adapter.test.js`

---

### `adapters/local/local.help.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalHelpAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `ajuda.html` (quando driver = 'local') |

**Responsabilidade:** Persistência local de pedidos de ajuda: simula criação, listagem e
atualização de tickets de ajuda em localStorage.

**Testes:** `tests/integration/local-help.adapter.test.js`

---

### `adapters/local/local.notifications.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalNotificationsAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas autenticadas (quando driver = 'local') |

**Responsabilidade:** Persistência local de notificações: armazena e retorna notificações de
teste em localStorage para desenvolvimento offline.

**Testes:** `tests/integration/local-notifications.adapter.test.js`

---

### `adapters/local/local.posts-read.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalPostsReadAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de feed (quando driver = 'local') |

**Responsabilidade:** Leitura de posts do localStorage: retorna dados de fixtures locais,
simula paginação com cursor e filtros.

**Testes:** `tests/integration/local-posts-read.adapter.test.js`

---

### `adapters/local/local.posts-write.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalPostsWriteAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html`, `my-posts.html` (quando driver = 'local') |

**Responsabilidade:** Escrita de posts no localStorage: cria, edita e deleta posts localmente,
gerando IDs temporários.

**Testes:** `tests/integration/local-posts-write.adapter.test.js`

---

### `adapters/local/local.profile.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalProfileAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de perfil (quando driver = 'local') |

**Responsabilidade:** Persistência local de perfil: armazena dados de perfil no localStorage
para desenvolvimento offline.

**Testes:** `tests/integration/local-profile.adapter.test.js`

---

### `adapters/local/local.ratings.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalRatingsAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `_product.html` (quando driver = 'local') |

**Responsabilidade:** Persistência local de ratings: armazena e retorna ratings de posts
do usuário no localStorage.

**Testes:** `tests/integration/local-ratings.adapter.test.js`

---

### `adapters/local/local.saved.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/local |
| Namespace | `window.KCLocalSavedAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `_product.html`, `my-posts.html` (quando driver = 'local') |

**Responsabilidade:** Persistência local de posts salvos: armazena IDs de posts salvos pelo
usuário no localStorage.

**Testes:** `tests/integration/local-saved.adapter.test.js`

---

## Grupo adapters/supabase/

> **Adapters de persistência Supabase.** Implementam a interface de dados usando Supabase
> como backend. Usados quando `KC_ENV.driver === 'supabase'` (produção).

---

### `adapters/supabase/supabase.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas em produção |

**Responsabilidade:** Adapter base Supabase: wrappers genéricos para queries PostgREST,
chamadas RPC, e tratamento de erros Supabase. Base para todos os adapters supabase específicos.

**Testes:** `tests/integration/supabase-adapter.test.js`

---

### `adapters/supabase/supabase.admin.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseAdminAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas admin |

**Responsabilidade:** Operações admin via Supabase: moderar posts, gerenciar banners, dashboard
de métricas, listagem de relatórios.

**Testes:** `tests/integration/supabase-admin-adapter.test.js`

---

### `adapters/supabase/supabase.analytics.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseAnalyticsAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `search-results.html`, admin |

**Responsabilidade:** Analytics via Supabase: registra eventos de busca, visualizações e CTR
na tabela `analytics_events`.

**Testes:** `tests/integration/supabase-analytics-adapter.test.js`

---

### `adapters/supabase/supabase.comments.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseCommentsAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `_product.html` e feeds com comentários |

**Responsabilidade:** CRUD de comentários no Supabase: listar, criar, deletar, votar em
comentários com RLS garantindo autorização por usuário.

**Testes:** `tests/integration/supabase-comments-adapter.test.js`

---

### `adapters/supabase/supabase.media.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseMediaAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html` |

**Responsabilidade:** Upload de mídia para o Supabase Storage: faz upload de imagens
comprimidas, retorna URLs públicas, e deleta mídia ao deletar posts.

**Testes:** `tests/integration/supabase-media-adapter.test.js`

---

### `adapters/supabase/supabase.notifications.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseNotificationsAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Todas as páginas autenticadas |

**Responsabilidade:** Notificações via Supabase: buscar não lidas, marcar como lidas,
preferências de notificação, e subscrição Realtime para novos eventos.

**Testes:** `tests/integration/supabase-notifications-adapter.test.js`

---

### `adapters/supabase/supabase.posts-read.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabasePostsReadAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de feed e produto |

**Responsabilidade:** Leitura de posts via Supabase: feed com cursor, busca fulltext, post por
ID, posts do usuário, posts relacionados — todos via PostgREST + RPCs.

**Testes:** `tests/integration/supabase-posts-read.adapter.test.js`

---

### `adapters/supabase/supabase.posts-write.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabasePostsWriteAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `create-post.html`, `my-posts.html` |

**Responsabilidade:** Escrita de posts via Supabase: criar, editar, deletar posts com RLS,
report de posts, e operações de moderação.

**Testes:** `tests/integration/supabase-posts-write.adapter.test.js`

---

### `adapters/supabase/supabase.profiles.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseProfilesAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | Páginas de perfil e account-setup |

**Responsabilidade:** CRUD de perfis via Supabase: buscar perfil por ID, atualizar dados,
upload de avatar, setup inicial de conta, e validação de e-mail @ufg.br.

**Testes:** `tests/integration/supabase-profiles.adapter.test.js`

---

### `adapters/supabase/supabase.saved.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseSavedAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `_product.html`, `my-posts.html` |

**Responsabilidade:** Posts salvos via Supabase: salvar/desalvar post, listar posts salvos do
usuário com paginação.

**Testes:** `tests/integration/supabase-saved-adapter.test.js`

---

### `adapters/supabase/supabase.votes.adapter.js`

| Campo | Valor |
|-------|-------|
| Grupo | adapters/supabase |
| Namespace | `window.KCSupabaseVotesAdapter` |
| Padrão | IIFE + objeto literal |
| Páginas | `index.html`, `_product.html`, feeds |

**Responsabilidade:** Votos via Supabase: registrar voto (up/down), cancelar voto, buscar
contagem de votos de um post e voto atual do usuário.

**Testes:** `tests/integration/supabase-votes-adapter.test.js`

---

## Apêndice A — Tabela-índice Completa

| Arquivo | Grupo | Namespace | Páginas | Testes |
|---------|-------|-----------|---------|--------|
| boot/kc-constants.js | boot | `window.KC_CONSTANTS` | todas 22 | unit/kc-constants.test.js |
| boot/kc-env.js | boot | `window.KC_ENV` | todas 22 | contract/version-map |
| boot/kc-feature-flags.js | boot | `window.KCFF` | todas 22 | unit/kc-feature-flags.test.js |
| boot/kc-sw-register.js | boot | *(nenhum)* | todas 22 | unit/sw.test.js |
| boot/kc-telemetry.js | boot | *(nenhum)* | todas 22 | unit/telemetry.test.js |
| boot/kc-theme-boot.js | boot | *(nenhum)* | todas 22 | a11y/a11y.test.js |
| core/kc-i18n.js | core | `window.KCi18n` | públicas | unit/kc-i18n.test.js |
| core/kc-auth.ui.js | core | `window.KCAccountProfileUtils` | autenticadas | integration/profile.* |
| core/kc-profiles.client.js | core | `window.KCProfilesClient` | autenticadas | integration/profile.* |
| core/kc-theme.js | core | *(nenhum)* | todas | a11y/a11y.test.js |
| core/kc-notifications.js | core | `window.KCNotifications` | autenticadas | integration/kc-notifications-dropdown |
| core/kc-auth-callback.js | core | *(nenhum)* | auth-callback.html | integration/kc-api-auth-module |
| core/kc-core.js | core | `window.KCCore` | públicas | structure/kc-core-split |
| core/kc-post-model.js | core | `window.KCPostModel` | feed+produto | integration/kc-api-posts-write |
| core/kc-user-posts.js | core | `window.kcUserPosts` | my-posts, profile | integration/kc-api-posts-read |
| core/kc-core-widgets.js | core | `window.KCCore` (augmenta) | públicas | structure/kc-core-split |
| core/kc-public-shell.js | core | *(nenhum)* | públicas selecionadas | structure/admin-shell-preload |
| api/kc-supabase.client.js | api | `window.KCSupabase` | autenticadas | integration/kc-supabase-client |
| api/kc-supabase.posts.js | api | `window._KCSPosts` | feeds | structure/kc-supabase-split |
| api/kc-supabase.ratings.js | api | `window._KCSRatings` | _product.html | structure/kc-supabase-split |
| api/kc-api.auth.js | api | `window._KCAPI_auth` | autenticadas | integration/kc-api-auth-module |
| api/kc-api.comments-votes.js | api | `window._KCAPI_cv` | feed+produto | integration/kc-api-comments-votes |
| api/kc-api.help.js | api | `window._KCAPI_help` | ajuda+admin | integration/kc-api-help-module |
| api/kc-api.notifications.js | api | `window._KCAPI_notif` | autenticadas | integration/kc-api-notifications-module |
| api/kc-api.posts-feed.js | api | `window._KCAPI_feed` | feeds | integration/kc-api-posts-feed-module |
| api/kc-api.posts-read.js | api | `window._KCAPI_read` | feed+produto | integration/kc-api-posts-read-module |
| api/kc-api.posts-write.js | api | `window._KCAPI_write` | create+my-posts | integration/kc-api-posts-write-module |
| api/kc-api.profiles.js | api | `window._KCAPI_prof` | profile+setup | integration/kc-api-profiles-module |
| api/kc-api.ratings.js | api | `window._KCAPI_rat` | _product.html | integration/kc-api-ratings-module |
| api/kc-api.related.js | api | `window._KCAPI_rel` | _product.html | integration/kc-api-related-module |
| api/kc-api.saved.js | api | `window._KCAPI_saved` | produto+my-posts | integration/kc-api-saved-module |
| api/kc-api.chat.js | api | `window._KCAPI.chat` | mensagens+autenticadas | contract/chat-continuity |
| api/kc-api.diagnostics.js | api | `window._KCAPI.diagnostics` | create+autenticadas | integration/kc-api-diagnostics-module |
| api/kc-api.session.js | api | `window._KCAPI.session` | autenticadas+feeds | integration/kc-api-session-module |
| api/kc-api.client.js | api | `window.KCAPI` | autenticadas | integration/kc-api-client |
| api/admin-shell.js | api | *(nenhum)* | 6 admin | structure/admin-shell-preload |
| utils/kc-utils.string.js | utils | `window._KCU_str` | todas | unit/kc-utils-expanded |
| utils/kc-utils.format.js | utils | `window._KCU_fmt` | todas | unit/kc-utils-format |
| utils/kc-utils.dom.js | utils | `window._KCU_dom` | todas | unit/kc-utils-dom |
| utils/kc-utils.identity.js | utils | `window._KCU_id` | todas | unit/kc-utils-identity |
| utils/kc-utils.taxonomy.js | utils | `window._KCU_tax` | todas | unit/kc-utils-taxonomy |
| utils/kc-utils.location.js | utils | `window._KCU_loc` | feeds com geo | unit/kc-utils-location |
| utils/kc-utils.presentation.js | utils | `window._KCU_pres` | feeds | unit/kc-utils-presentation |
| utils/kc-utils.js | utils | `window.KCUtils` | todas | unit/kc-utils.test.js |
| features/kc-comments.js | features | `window.KCComments` | produto+feeds | integration/kc-comments-session |
| features/kc-search.js | features | `window.KCSearch` | search-results | integration/kc-search.shared |
| features/kc-search-modal.js | features | `window.KCSearchModal` | todas públicas | integration/kc-search.shared |
| features/kc-ranking.js | features | `window.KCRanking` | feeds | unit/kc-ranking, integration/kc-ranking-session |
| features/kc-filters.js | features | `window.KCFilters` | feeds | unit/kc-filters |
| features/kc-feed-filters.js | features | `window.KCFeedFilters` | feeds | unit/kc-feed-filters |
| features/kc-banners.js | features | `window.KCBanners` | feeds | integration/kc-banners |
| features/kc-home-categories.js | features | `window.KCHomeCategories` | index.html | integration/home-categories.shared |
| features/kc-lazy-loader.js | features | `window.KCLazyLoader` | feeds | unit/lazy-loader |
| features/kc-pull-to-refresh.js | features | `window.KCPullToRefresh` | feeds | integration/ios-gesture-hardening |
| features/create-post/kc-create-post.js | create-post | `window.KCCreatePost` | create-post.html | integration/create-post.controller |
| features/create-post/kc-create-post.schema.js | create-post | `window.KCCreatePostSchema` | create-post.html | integration/kc-create-post-schema |
| features/create-post/kc-create-post.fields.js | create-post | `window.KCCreatePostFields` | create-post.html | integration/kc-create-post-fields |
| features/create-post/kc-create-post.render.js | create-post | `window.KCCreatePostRender` | create-post.html | integration/kc-create-post-render |
| features/create-post/kc-create-post.media.js | create-post | `window.KCCreatePostMedia` | create-post.html | integration/kc-create-post-media |
| features/create-post/kc-create-post.resolvers.js | create-post | `window.KCCreatePostResolvers` | create-post.html | integration/kc-create-post-resolvers |
| features/create-post/kc-create-post.submit.js | create-post | `window.KCCreatePostSubmit` | create-post.html | integration/kc-create-post-submit |
| shared/account-profile.shared.js | shared | `window.KCAccountProfile` | profile+setup+settings | integration/account-profile.shared |
| shared/help.shared.js | shared | `window.KCHelpShared` | ajuda+admin | integration/help.shared |
| shared/home-categories.shared.js | shared | `window.KCHomeCategoriesShared` | index.html | integration/home-categories.shared |
| shared/kc-comments.shared.js | shared | `window.KCCommentsShared` | produto+feeds | integration/kc-comments.shared |
| shared/kc-search.shared.js | shared | `window.KCSearchShared` | search+modal | integration/kc-search.shared |
| shared/ods.shared.js | shared | `window.KCODSShared` | ods.html | integration/ods.shared |
| shared/search-analytics.shared.js | shared | `window.KCSearchAnalytics` | search-results | integration/search-analytics.shared |
| legacy-shims/kc-migrate.myposts.js | legacy | *(nenhum)* | my-posts.html | integration/local-adapter |
| components/carousel.js | components | *(funções globais)* | feeds | integration/kc-banners |
| components/toast.js | components | `showToast()` | todas | controllers tests |
| components/voting.js | components | *(var. módulo)* | feeds+produto | integration/kc-api-comments-votes |
| adapters/local/local.adapter.js | local | `window.KCLocalAdapter` | todas (local) | integration/local-adapter |
| adapters/local/local.help.adapter.js | local | `window.KCLocalHelpAdapter` | ajuda (local) | integration/local-help.adapter |
| adapters/local/local.notifications.adapter.js | local | `window.KCLocalNotificationsAdapter` | auth (local) | integration/local-notifications.adapter |
| adapters/local/local.posts-read.adapter.js | local | `window.KCLocalPostsReadAdapter` | feeds (local) | integration/local-posts-read.adapter |
| adapters/local/local.posts-write.adapter.js | local | `window.KCLocalPostsWriteAdapter` | create (local) | integration/local-posts-write.adapter |
| adapters/local/local.profile.adapter.js | local | `window.KCLocalProfileAdapter` | profile (local) | integration/local-profile.adapter |
| adapters/local/local.ratings.adapter.js | local | `window.KCLocalRatingsAdapter` | produto (local) | integration/local-ratings.adapter |
| adapters/local/local.saved.adapter.js | local | `window.KCLocalSavedAdapter` | produto (local) | integration/local-saved.adapter |
| adapters/supabase/supabase.adapter.js | supabase | `window.KCSupabaseAdapter` | todas (prod) | integration/supabase-adapter |
| adapters/supabase/supabase.admin.adapter.js | supabase | `window.KCSupabaseAdminAdapter` | admin | integration/supabase-admin-adapter |
| adapters/supabase/supabase.analytics.adapter.js | supabase | `window.KCSupabaseAnalyticsAdapter` | search+admin | integration/supabase-analytics-adapter |
| adapters/supabase/supabase.comments.adapter.js | supabase | `window.KCSupabaseCommentsAdapter` | produto+feeds | integration/supabase-comments-adapter |
| adapters/supabase/supabase.media.adapter.js | supabase | `window.KCSupabaseMediaAdapter` | create-post | integration/supabase-media-adapter |
| adapters/supabase/supabase.notifications.adapter.js | supabase | `window.KCSupabaseNotificationsAdapter` | autenticadas | integration/supabase-notifications-adapter |
| adapters/supabase/supabase.posts-read.adapter.js | supabase | `window.KCSupabasePostsReadAdapter` | feeds | integration/supabase-posts-read.adapter |
| adapters/supabase/supabase.posts-write.adapter.js | supabase | `window.KCSupabasePostsWriteAdapter` | create+my-posts | integration/supabase-posts-write.adapter |
| adapters/supabase/supabase.profiles.adapter.js | supabase | `window.KCSupabaseProfilesAdapter` | profile+setup | integration/supabase-profiles.adapter |
| adapters/supabase/supabase.saved.adapter.js | supabase | `window.KCSupabaseSavedAdapter` | produto+my-posts | integration/supabase-saved-adapter |
| adapters/supabase/supabase.votes.adapter.js | supabase | `window.KCSupabaseVotesAdapter` | feeds+produto | integration/supabase-votes-adapter |

**Inventario atual:** 149 arquivos JS em `assets/js/`. Este catalogo documenta os grupos, contratos e modulos principais; use `docs/architecture/repository-structure.md` para contagens completas.

*Controllers (33 public + 15 admin = 48) documentados em `docs/architecture/controllers-catalog.md`*

---

## Apêndice B — Diagrama de Dependências

```
ORDEM DE CARREGAMENTO (boot → utils → api → core → adapters → features → components → controllers)

┌─────────────────────────────────────────────────────────────────────┐
│ BOOT (obrigatório nos 26 HTMLs canônicos)                           │
│  kc-constants → kc-env → kc-feature-flags → kc-sw-register         │
│  → kc-telemetry → kc-theme-boot                                     │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ UTILS (submódulos → facade)                                         │
│  kc-utils.string + kc-utils.format + kc-utils.dom                  │
│  + kc-utils.identity + kc-utils.taxonomy + kc-utils.location        │
│  + kc-utils.presentation → kc-utils.js (facade)                    │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SUPABASE CLIENT                                                     │
│  kc-supabase.client → kc-supabase.posts + kc-supabase.ratings       │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ KCAPI (submódulos → facade)                                         │
│  kc-api.auth + kc-api.comments-votes + kc-api.help                 │
│  + kc-api.notifications + kc-api.posts-feed + kc-api.posts-read     │
│  + kc-api.posts-write + kc-api.profiles + kc-api.ratings            │
│  + kc-api.related + kc-api.saved → kc-api.client (facade)          │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│ ADAPTERS LOCAL            │  │ ADAPTERS SUPABASE                    │
│ (quando driver='local')  │  │ (quando driver='supabase' — prod)    │
│ local.adapter.js          │  │ supabase.adapter.js                  │
│ + local.*.adapter.js      │  │ + supabase.*.adapter.js              │
└──────────────────────────┘  └──────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CORE (módulos de runtime)                                           │
│  kc-i18n + kc-auth.ui + kc-profiles.client + kc-theme              │
│  + kc-notifications + kc-auth-callback + kc-core-widgets            │
│  + kc-core + kc-post-model + kc-user-posts + kc-public-shell        │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SHARED (estado compartilhado entre controllers)                     │
│  account-profile.shared + help.shared + home-categories.shared      │
│  + kc-comments.shared + kc-search.shared + ods.shared               │
│  + search-analytics.shared                                          │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FEATURES (funcionalidades de UX)                                    │
│  kc-comments + kc-search + kc-search-modal + kc-ranking             │
│  + kc-filters + kc-feed-filters + kc-banners + kc-home-categories   │
│  + kc-lazy-loader + kc-pull-to-refresh                              │
│  [create-post/]: kc-create-post.schema → .fields → .resolvers       │
│                  → .render → .media → .submit → kc-create-post.js  │
│  [legacy]: kc-migrate.myposts.js                                    │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ COMPONENTS (UI reutilizável)                                        │
│  carousel.js + toast.js + voting.js                                 │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CONTROLLERS (um por página)                                         │
│  controllers/public/<pagina>.controller.js (33 arquivos)            │
│  controllers/admin/<pagina>.controller.js  (15 arquivos)            │
│  [documentados em controllers-catalog.md]                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Regra de ouro:** Um módulo nunca deve depender de um módulo em camada superior neste diagrama.
Controllers são folhas — nunca são importados por outros módulos.
