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
- [Grupo api/](#grupo-api) — 16 módulos
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

> **Cadeia de inicialização obrigatória.** Todos os 22 HTMLs carregam os 6 módulos nesta
> ordem. Nenhum outro módulo do projeto pode ser carregado antes deles.

---

### `boot/kc-constants.js`

| Campo | Valor |
|-------|-------|
| Grupo | boot |
| Namespace | `window.KC_CONSTANTS` |
| Padrão | IIFE + `Object.freeze` |
| Páginas | **Todas as 22** (boot obrigatório) |

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
| Páginas | **Todas as 22** (boot obrigatório) |

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
| Páginas | **Todas as 22** (boot obrigatório) |

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
| Páginas | **Todas as 22** (boot obrigatório) |

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
| Páginas | **Todas as 22** (boot obrigatório) |

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
| Páginas | **Todas as 22** (boot obrigatório) |

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

### `api/kc-api.client.js`

| Campo | Valor |
|-------|-------|
| Grupo | api |
| Namespace | `window.KCAPI` |
| Padrão | IIFE + `Object.freeze` (2410 linhas — facade central) |
| Páginas | **Todas as páginas autenticadas** |

**Responsabilidade:** Facade central da API do KinoCampus. Agrega todos os 14 submódulos KCAPI
(`_KCAPI_*`) e expõe uma interface pública unificada com roteamento para o driver correto
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

**Dependências em runtime:** Todos os `window._KCAPI_*` submódulos, `window.KC_ENV`,
adapters local e supabase

**Consumido por:** Todos os controllers públicos e admin, features, shared modules

**Testes:** `tests/integration/kc-api-client.test.js`,
`tests/contract/kc-api-facade-contract.test.js`,
`tests/integration/kc-api-session-swr.test.js`

**Observações:** Arquivo mais longo do projeto (2410 linhas). Nunca alterar sem rodar `check:all`
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
entre seções admin, logout. Equivalente a `kc-public-shell.js` mas para as 5 páginas admin.

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
