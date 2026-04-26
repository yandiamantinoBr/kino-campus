# Auditoria do Hotspot `kc-api.client.js` - v11.32.0

**Data:** 17 de abril de 2026  
**Escopo:** `assets/js/kc-api.client.js`  
**Objetivo:** mapear a fachada publica `window.KCAPI`, seu footprint atual, seus grupos de dominio, os acoplamentos com drivers/consumers e a estrategia segura para iniciar a trilha `v11.32.x` sem quebrar contratos.

---

## 1. Metricas

| Campo | Valor |
|---|---|
| Arquivo | `assets/js/kc-api.client.js` |
| Linhas | `2520` |
| Tamanho | `105563` bytes (~105 KB) |
| Padrao estrutural | IIFE com `'use strict'` |
| HTMLs da base principal que carregam o arquivo | `22` |
| Export principal | `window.KCAPI = Object.freeze({...})` |
| Membros exportados no facade | `100` |
| Membros callable no facade | `91` |
| Membros nao-callable no facade | `9` (`VERSION`, `ENV`, `config`, `activeDriver`, `MOCK_USERS`, `apiURL`, `DEFAULTS`, `MOCK_USERS_BY_ID`, `MOCK_USERS_LIST`) |
| Globals auxiliares adicionais | `window.getLastCreatePostError`, `window.setLastCreatePostError`, `window.clearLastCreatePostError`, `window.summarizeCreatePayloadForDiagnostics` |

### HTMLs impactados na base principal

- `account-setup.html`
- `achados-perdidos.html`
- `ajuda.html`
- `auth-callback.html`
- `caronas-feed.html`
- `compra-venda-feed.html`
- `create-post.html`
- `eventos.html`
- `index.html`
- `moradia.html`
- `my-posts.html`
- `ods.html`
- `oportunidades.html`
- `profile.html`
- `search-results.html`
- `settings.html`
- `_product.html`
- `admin/banners.html`
- `admin/help-requests.html`
- `admin/index.html`
- `admin/moderation.html`
- `admin/reports.html`

---

## 2. Mapa do facade publico

O arquivo nao e um monolito "cego". Ele ja possui uma divisao semantica interna razoavelmente clara, mas ainda esta tudo no mesmo runtime e no mesmo export `window.KCAPI`.

### 2.1. Blocos internos principais

| Faixa aprox. | Grupo | Responsabilidade dominante |
|---|---|---|
| `1-324` | bootstrap + diagnosticos + ranking related | `readEnv()`, normalize de erros de create, score de posts relacionados |
| `325-967` | mock/static fallback + normalizacao base | mocks, defaults, normalizadores, filtros utilitarios |
| `968-1237` | caches de sessao / SWR | analytics e comments cache helpers, pending requests |
| `1238-1735` | bootstrap operacional | `setConfig`, `fetchJSON`, raw DB, adapters, policy gates, auth delegates |
| `1736-1923` | data access facade | feed, detalhe, create/update/delete, report, owner actions, analytics |
| `1931-2026` | auth + profiles facade | login/logout compat, sign-in/sign-up, profile sync |
| `2037-2118` | comments + votes facade | comments cache, refresh, voto e estado do voto |
| `2120-2248` | account/posts/saved/help | profile, avatar, my-posts, related, saved/highlights, help requests |
| `2257-2386` | notifications + invites | preferencias, channel targets, notifications, convites |
| `2389-2520` | export final | `window.KCAPI = Object.freeze({...})` + globals diagnosticos |

### 2.2. Dominios de split sugeridos

| Dominio | Metodos principais | Risco de split |
|---|---|---|
| notifications | `getNotificationPreferences`, `updateNotificationPreferences`, `getNotificationChannelTargets`, `updateNotificationChannelTargets`, `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`, `clearNotifications`, `getUnreadNotificationCount`, `subscribeNotifications`, `unsubscribeNotifications` | baixo |
| saved/highlights | `getSavedPostState`, `setSavedPostState`, `clearSavedPostState`, `getMySavedPosts`, `getMySavedPostsCount`, `getProfileHighlights`, `getProfileHighlightsCount` | baixo-medio |
| help/invites | `createHelpRequest`, `listAdminHelpRequests`, `updateAdminHelpRequest`, `inviteExternalUser`, `getInvites`, `revokeInvite` | baixo |
| posts-read | `getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId`, `getRelatedPosts` | medio |
| comments/votes | `getComments`, `refreshComments`, `invalidateCommentsCache`, `addComment`, `likeComment`, `votePost`, `getMyVote` | medio |
| profile/auth | `getCurrentUser`, `signIn`, `signUp`, `login`, `logout`, `getCurrentProfile`, `getProfileById`, `syncProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar` | alto |

---

## 3. Acoplamentos criticos

### 3.1. Com os drivers

O hotspot nao funciona sozinho. Ele depende da equivalencia pratica entre:

- `assets/js/adapters/local.adapter.js`
- `assets/js/adapters/supabase.adapter.js`

Pontos mais sensiveis:

- `getActiveDriver()` como unica porta de dispatch real
- fallbacks de driver local vs Supabase por metodo
- policy gates `enforceSupabaseOnProduction(...)`
- shape de erro e shape de retorno em create/update/saved/notifications

### 3.2. Com caches e estado de sessao

O arquivo concentra a politica de revalidacao silenciosa em alguns pontos relevantes:

- analytics do produto
- comments do produto
- requests pendentes deduplicadas
- identity de cache baseada em usuario/post

Isso significa que um split ruim pode quebrar:

- hidratação otimista
- stale-while-revalidate
- invalidacao apos mutacoes
- deduplicacao de request

### 3.3. Consumers runtime mais sensiveis

Contagem simples de referencias `KCAPI.` no runtime atual:

| Arquivo | Referencias |
|---|---:|
| `assets/js/kc-comments.js` | `36` |
| `assets/js/controllers/profile.controller.js` | `28` |
| `assets/js/controllers/settings.controller.js` | `26` |
| `assets/js/controllers/product.controller.js` | `20` |
| `assets/js/controllers/account-setup.controller.js` | `18` |
| `assets/js/kc-auth.ui.js` | `15` |
| `assets/js/controllers/create-post.controller.js` | `14` |
| `assets/js/kc-create-post.submit.js` | `13` |
| `assets/js/kc-core.js` | `12` |
| `assets/js/kc-search.js` | `10` |
| `assets/js/kc-notifications.js` | `9` |

Conclusao pratica:

- `profile`, `settings`, `product`, `comments`, `notifications` e `create-post` formam a malha de regressao minima da trilha `v11.32.x`
- qualquer mudanca no facade deve ser tratada como contrato publico, nao como helper interno

---

## 4. Decisao arquitetural da trilha v11.32.x

### 4.1. Namespace interno

O padrao escolhido para a trilha e:

```javascript
window._KCAPI = window._KCAPI || {};
```

Cada submodulo novo deve ser um IIFE com `'use strict'`, registrando apenas o grupo que lhe pertence:

- `window._KCAPI.notifications`
- `window._KCAPI.saved`
- `window._KCAPI.help`
- `window._KCAPI.posts`
- `window._KCAPI.commentsVotes`
- `window._KCAPI.profileAuth`

### 4.2. Invariantes obrigatorios

1. `window.KCAPI` continua sendo a unica API publica.
2. Nenhum nome de metodo publico muda.
3. Nenhuma aridade pratica muda.
4. Nenhum retorno muda de shape sem camada de compatibilidade.
5. O core `kc-api.client.js` vira thin facade gradualmente, nunca de uma vez.
6. Cada submodulo novo deve ser carregado antes do core quando o split comecar.
7. O core sempre precisa de guards defensivos caso um submodulo falhe ao carregar.

---

## 5. Sequencia recomendada de execucao

| Iteracao | Objetivo | Resultado esperado |
|---|---|---|
| `v11.32.0` | auditoria + smoke gate | mapa do hotspot fechado, docs sincronizadas, gate operacional formalizado |
| `v11.32.1` | contrato da fachada `KCAPI` | suite estatica dedicada ao facade publico |
| `v11.32.2` | split `notifications` | primeiro grupo folha extraido com risco baixo |
| `v11.32.3` | split `saved/highlights` | segundo grupo folha, ainda sem tocar auth |
| `v11.32.4` | split `help/invites` | terceiro grupo folha e fechamento da faixa de menor risco |
| `v11.32.5` | split `posts-read` | primeira extracao media, com consumers publicos fortes |
| `v11.32.6` | split `comments/votes` + hardening | consolidacao do core com guards e ordem de scripts |
| `v11.32.7` | release gate da trilha | regressao completa, hygiene, smoke publicado, baseline final |

### Ordem explicitamente adiada

- `kc-utils.js` fica fora da `v11.32.x`
- `admin-dashboard.controller.js` fica fora da `v11.32.x`
- profile/auth de `KCAPI` nao entra antes de haver contrato blindado e pelo menos 3 grupos folha extraidos com estabilidade

---

## 6. Criterios de aceite da trilha

Toda iteracao `v11.32.x` deve passar:

- `npx jest --passWithNoTests --runInBand`
- `node scripts/hygiene-check.js`
- `git diff --check`

E tambem o gate operacional documentado em:

- `docs/qa/operational-smoke-gate-v11.32.md`

Sem isso, a trilha nao avanca para o proximo split.
