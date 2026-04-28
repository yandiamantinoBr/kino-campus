# Auditoria — kc-supabase.client.js (v13.5.0)

**Data:** 2026-04-25  
**Versão:** v13.5.0 (doc-only)  
**Arquivo:** `assets/js/kc-supabase.client.js`

---

## 1. Footprint atual

| Métrica | Valor |
|---|---|
| Linhas | 1364L |
| Tamanho | 52 723 bytes |
| Funções top-level | 50 (9 async) |
| Consumidores diretos | HTMLs que carregam kc-supabase.client.js antes de `window.KCSupabase` |
| Export público | `window.KCSupabase` (facade com ~20 métodos delegados) |
| Estado interno | `state { inited, client, session, user, lastError, authSub }` |

---

## 2. Grupos naturais de funções

### Grupo A — Core / Configuração (~71L)
> `readEnv`, `hasSupabaseLib`, `isConfigured`, `safeDispatchAuthChange`, `getClient`

Estado `state.*` e `VERSION` pertence a este grupo.
Todas as demais funções dependem de `getClient()` para acessar o cliente Supabase.

### Grupo B — Sessão (~47L)
> `refreshSession`, `getCurrentUser`

Gerenciam `state.session`, `state.user`. Chamam `getClient()`.

### Grupo C — Auth (~210L)
> `emailAllowed`, `buildAuthOptions`, `signIn`, `signUp`, `resendSignUp`
> `requestPasswordReset`, `updatePassword`, `signOut`

Chamam `getClient()`, `emailAllowed()`, `buildAuthOptions()`.
`signIn` e `signUp` despacham `safeDispatchAuthChange`.

### Grupo D — Posts / Normalização (~303L)
> `normalizeGetPostsParams`, `normalizeCursorRequestParamValue`, `normalizeCursorRequestParams`
> `normalizeGetFeedCursorParams`, `getSearchShared`, `buildExpandedSearchTerms`
> `normalizeSearchPostsParams`, `normalizeModuleKey`, `rowModuleMatches`
> `isMissingTokenError`, `isMissingCommentsEmbedError`, `buildOrILike`
> `buildPostsSelect`, `buildPostDetailSelect`, `isMaybySingleMissing`

Sem dependência de `state.*`. Apenas transformações de parâmetros.

### Grupo E — Posts / CRUD (~246L)
> `getPostById`, `getPosts`, `searchPosts`, `getFeedCursor`

Chamam `getClient()` + todos os helpers do Grupo D.

### Grupo F — Avaliações (~269L)
> `normalizeUserRatingSummaryPayload`, `normalizeUserRatingEntryPayload`
> `normalizeUserRatingStatePayload`, `normalizeUserRatingListPayload`
> `normalizeUserRatingListParams`, `normalizeUserRatingStateParams`
> `normalizeUpsertUserRatingPayload`
> `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`

Chamam `getClient()`. Helpers de normalização são autocontidos.

### Grupo G — Realtime (~109L)
> `noopSubscription`, `normalizeModuleFilter`, `subscribeNewPosts`

Chama `getClient()`.

### Grupo H — Inicialização / Facade (~88L)
> `onAuthStateChange`, `init`, `window.KCSupabase = { ... }`, boot automático

`init` chama `getClient()`, `getCurrentUser()`, `onAuthStateChange()`.

---

## 3. Análise de dependências

| Grupo | Depende de |
|---|---|
| A (Core) | `window.KC_ENV`, `window.supabase` CDN |
| B (Sessão) | A → `getClient()` |
| C (Auth) | A → `getClient()`, B → `safeDispatchAuthChange()` |
| D (Posts/Norm) | — (funções puras, sem deps internas) |
| E (Posts/CRUD) | A → `getClient()`, D (todos os helpers) |
| F (Avaliações) | A → `getClient()` |
| G (Realtime) | A → `getClient()` |
| H (Init/Facade) | Todos os grupos acima |

**Padrão de dependência:** todos os grupos dependem de `getClient()` do Grupo A.
O façada (`window.KCSupabase`) deve permanecer como ponto de entrada único.

---

## 4. Estratégia de split (v13.5.1)

### Problema: gate < 700L requer extração de ≥ 2 grupos

| Extração | Linhas extraídas | Residual estimado |
|---|---|---|
| Apenas B+C (auth+session) | ~257L | ~1107L ✗ |
| B+C + F (auth+ratings) | ~526L | ~838L ✗ |
| B+C + E+D (auth+posts) | ~806L | ~558L ✓ |
| B+C + F + G | ~635L | ~729L ✗ |

**Recomendação:** extrair **Grupo C+B (auth+session)** + **Grupos D+E (posts)**:

### kc-supabase.auth.js → `window.KCSupabase._auth`
- Funções: emailAllowed, buildAuthOptions, signIn, signUp, resendSignUp, requestPasswordReset, updatePassword, signOut + refreshSession, getCurrentUser
- Deps: `init(deps)` com `deps.getClient`, `deps.dispatch`, `deps.state`
- **Estimativa:** ~260L

### kc-supabase.posts.js → `window.KCSupabase._posts`
- Funções: todos os normalize* do Grupo D + getPostById, getPosts, searchPosts, getFeedCursor
- Deps: `init(deps)` com `deps.getClient`
- **Estimativa:** ~560L

### Controller residual
- Mantém: Grupo A (core/config), Grupo F (ratings), Grupo G (realtime), Grupo H (init/facade)
- Residual estimado: **~558L < 700L** ✓

---

## 5. Padrão de injeção de deps (v13.5.1)

```javascript
// kc-supabase.auth.js
(function () {
  'use strict';
  window.KCSupabase = window.KCSupabase || {};
  var _deps = null;
  function init(deps) { _deps = deps; }
  async function signIn(email, password) {
    const client = _deps.getClient();
    // ...
  }
  window.KCSupabase._auth = Object.freeze({ init, signIn, signUp, ... });
})();
```

```javascript
// kc-supabase.client.js (residual) — no init():
if (window.KCSupabase._auth && typeof window.KCSupabase._auth.init === 'function') {
  window.KCSupabase._auth.init({ getClient, state, dispatch: safeDispatchAuthChange });
}
```

O facade público (`window.KCSupabase.signIn`) delega para `window.KCSupabase._auth.signIn`.

---

## 6. HTML consumidores

Arquivos que carregam `kc-supabase.client.js`:

```
assets/js/kc-supabase.client.js (atual, único arquivo)
```

Após split (v13.5.1), adicionar em cada HTML que já carrega kc-supabase.client.js:
```html
<script defer src="assets/js/kc-supabase.client.js"></script>
<script defer src="assets/js/kc-supabase.auth.js"></script>
<script defer src="assets/js/kc-supabase.posts.js"></script>
```

---

## 7. Gate formal (v13.5.2)

Meta: `kc-supabase.client.js` < **700L**

Validar com:
```bash
wc -l assets/js/kc-supabase.client.js
```

---

## 8. Testes a criar (v13.5.1)

**`tests/kc-supabase-split.test.js`**
- Contrato estático de `window.KCSupabase._auth` (funções exportadas)
- Contrato estático de `window.KCSupabase._posts` (funções exportadas)
- `window.KCSupabase` facade preserva todas as funções públicas originais
- Ordem de scripts nos HTMLs consumidores (auth + posts após client)
- Gate de tamanho: kc-supabase.client.js < 700L
