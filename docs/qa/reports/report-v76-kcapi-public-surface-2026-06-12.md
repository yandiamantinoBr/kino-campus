# Report V76 - KCAPI Public Surface Snapshot

**Data:** 2026-06-12
**Escopo:** JS-A do plano `docs/planning/v76-hotspot-decomposition-plan.md`
**Tipo:** contrato estatico + analise documental
**Runtime alterado:** nao
**Follow-up:** JS-B extraido em `report-v76-kcapi-diagnostics-extraction-2026-06-12.md`

---

## 1. Objetivo

Registrar a superficie publica atual de `window.KCAPI` antes de qualquer nova decomposicao de
`assets/js/api/kc-api.client.js`.

Esta etapa reduz o risco de uma extracao futura remover, renomear ou reinterpretar membros publicos
sem decisao explicita. O resultado tambem atualiza o teste de contrato existente para tornar o
snapshot executavel.

---

## 2. Fontes verificadas

| Fonte | Evidencia |
|---|---|
| `assets/js/api/kc-api.client.js` | 2.846 linhas / 120.212 bytes no baseline JS-A; 2.809 linhas / 119.106 bytes apos JS-B |
| Export principal | `window.KCAPI = Object.freeze({` inicia na linha 2706 |
| Bloco exportado | linhas 2706-2840 |
| Aliases globais de diagnostico | linhas 2841-2844 |
| Teste reforcado | `tests/contract/kc-api-facade-contract.test.js` |

---

## 3. Superficie publica

`window.KCAPI` expoe **107 membros publicos** no snapshot de 2026-06-12.

| Grupo no facade | Quantidade | Membros |
|---|---:|---|
| Core/config | 7 | `VERSION`, `ENV`, `config`, `registerAdapter`, `activeDriver`, `setConfig`, `fetchJSON` |
| Data access | 29 | `getDatabaseRaw`, `getDatabaseNormalized`, `getPosts`, `searchPosts`, `getFeedCursor`, `getPersonalizedTabs`, `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`, `getPostById`, `createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost`, `closePost`, `reactivatePost`, `getTopContributors`, `trackCouponClick`, `trackShare`, `trackView`, `getCachedPostAnalytics`, `refreshPostAnalytics`, `invalidatePostAnalyticsCache`, `getPostAnalytics`, `checkDuplicatePost` |
| Comments | 6 | `getCachedComments`, `refreshComments`, `invalidateCommentsCache`, `getComments`, `addComment`, `likeComment` |
| Votes/profile/saved/help/admin-notification prefs | 25 | `votePost`, `getMyVote`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar`, `getMyPosts`, `getPostsByAuthorId`, `getRelatedPosts`, `getSavedPostState`, `setSavedPostState`, `clearSavedPostState`, `getMySavedPosts`, `getMySavedPostsCount`, `getProfileHighlights`, `getProfileHighlightsCount`, `createHelpRequest`, `listAdminHelpRequests`, `updateAdminHelpRequest`, `processAccountErasure`, `listExternalAccessRequests`, `decideExternalAccessRequest`, `getNotificationPreferences`, `updateNotificationPreferences`, `getNotificationChannelTargets`, `updateNotificationChannelTargets` |
| Notifications | 7 | `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`, `clearNotifications`, `getUnreadNotificationCount`, `subscribeNotifications`, `unsubscribeNotifications` |
| Direct messages | 1 | `chat` |
| External invites | 3 | `inviteExternalUser`, `getInvites`, `revokeInvite` |
| Auth | 6 | `getCurrentUser`, `signIn`, `signUp`, `resendConfirmation`, `requestPasswordReset`, `updatePassword` |
| Compat auth | 2 | `login`, `logout` |
| Profiles/diagnostics/related | 8 | `getCurrentProfile`, `getProfileById`, `syncProfile`, `getLastCreatePostError`, `setLastCreatePostError`, `clearLastCreatePostError`, `summarizeCreatePayloadForDiagnostics`, `rankRelatedPosts` |
| Users/static helpers | 6 | `MOCK_USERS`, `apiURL`, `DEFAULTS`, `MOCK_USERS_BY_ID`, `MOCK_USERS_LIST`, `getAuthorById` |
| Utils/normalizers | 7 | `filterPosts`, `normalizePost`, `normalizeUserRatingSummary`, `normalizeUserRatingEntry`, `normalizeUserRatingState`, `normalizeUserRatingList`, `isBackendEnabled` |

---

## 4. Delegacoes existentes

O facade ja delega para submodulos `_KCAPI.*`; o problema residual nao e ausencia total de split,
mas sim o volume de responsabilidades ainda residentes no arquivo central.

| Namespace | Arquivo esperado | Estado |
|---|---|---|
| `window._KCAPI.related` | `assets/js/api/kc-api.related.js` | delegado |
| `window._KCAPI.postsFeed` | `assets/js/api/kc-api.posts-feed.js` | delegado |
| `window._KCAPI.ratings` | `assets/js/api/kc-api.ratings.js` | delegado |
| `window._KCAPI.postsWrite` | `assets/js/api/kc-api.posts-write.js` | delegado |
| `window._KCAPI.postsRead` | `assets/js/api/kc-api.posts-read.js` | delegado |
| `window._KCAPI.auth` | `assets/js/api/kc-api.auth.js` | delegado |
| `window._KCAPI.profiles` | `assets/js/api/kc-api.profiles.js` | delegado |
| `window._KCAPI.commentsVotes` | `assets/js/api/kc-api.comments-votes.js` | delegado |
| `window._KCAPI.saved` | `assets/js/api/kc-api.saved.js` | delegado |
| `window._KCAPI.help` | `assets/js/api/kc-api.help.js` | delegado |
| `window._KCAPI.notifications` | `assets/js/api/kc-api.notifications.js` | delegado |
| `window._KCAPI.chat` | `assets/js/api/kc-api.chat.js` | passthrough via `chat` |
| `window._KCAPI.diagnostics` | `assets/js/api/kc-api.diagnostics.js` | delegado apos JS-B |

---

## 5. Blocos residuais no facade

| Bloco | Linhas | Responsabilidade | Risco de extracao |
|---|---:|---|---|
| Env/bootstrap | 20-78 | `readEnv`, normalizacao de `KC_ENV`, aliases Supabase e fallback local | Medio: toca boot e modo local/prod |
| Diagnostico create-post | 81-141 | normalizacao de erro e `lastCreatePostError` | Baixo/medio: bom primeiro candidato com teste dedicado |
| Filtros avancados/feed | 172-778 | normalizacao de filtros, presets de data, matching por modulo | Medio/alto: muito codigo puro, mas amplo impacto nos 6 feeds |
| Session cache/SWR | 801-890 e 1176-1212 | `KCSessionStore`, cache stale-while-revalidate, pending requests | Medio: storage keys e deduplicacao precisam de contrato |
| Post freshness/broadcast | 925-1168 | eventos cross-tab, localStorage, BroadcastChannel, Supabase Realtime broadcast | Alto: side effects e eventos entre abas |
| Mock users/author index | 1228-1346 | usuarios mockados, lista congelada e indice legado de autor | Medio: fallback local e fixtures |
| `normalizePost` | 1361-1526 | contrato canonico de post, aliases legados e midia | Alto: muitos consumidores e testes dependentes |
| Rating normalizers | 1535-1583 | normalizacao de rating summary/state/list | Medio: contrato publico, mas recorte menor |
| `filterPosts` e utilitarios | 1598-1682 | filtro local e helpers internos | Medio: usado por modo local e fallback |
| Static database/adapters | 1695-1736 | database JSON, registry e driver ativo | Alto: base de toda chamada KCAPI |
| Wrappers delegados | 1739-2704 | ponte para `_KCAPI.*`, fallbacks e guards | Baixo por wrapper individual; alto se agrupado demais |
| Export/aliases finais | 2706-2844 | `Object.freeze(window.KCAPI)` + globals de diagnostico | Alto: contrato publico congelado |

---

## 6. Mudanca de teste nesta entrega

`tests/contract/kc-api-facade-contract.test.js` agora:

- extrai estaticamente os membros do bloco `window.KCAPI = Object.freeze({ ... })`;
- compara a lista extraida com o snapshot canonico de 107 membros;
- valida que a lista canonica tem exatamente 107 entradas;
- adicionou guarda de crescimento para manter `kc-api.client.js` com no maximo 2.900 linhas no JS-A;
- apos JS-B, o limite contratual foi reduzido para 2.825 linhas e o bloco de diagnostics saiu da fachada.

Isso torna a proxima extracao mais segura: qualquer remocao, rename, alias ou crescimento relevante
do facade passa a exigir atualizacao explicita do teste de contrato.

---

## 7. Decisao analitica

**Nao extrair `normalizePost` primeiro.** Apesar de ser o maior valor tecnico, ele e o contrato mais
sensivel do facade e alimenta cards, produto, busca, analytics, saved posts e modo local.

Melhor primeira extracao real, agora executada em JS-B:

1. `normalizeErrorForDiagnostics`, `summarizeCreatePayloadForDiagnostics` e helpers de create-post diagnostics;
2. depois `KCSessionStore`, apenas com contrato explicito de storage keys e deduplicacao;
3. depois filtros/presets de feed, com testes por modulo;
4. por ultimo `normalizePost`, depois de snapshot de casos reais e aliases legados.

---

## 8. Validacao executada

```text
npm test -- --runInBand tests/contract/kc-api-facade-contract.test.js
npm test -- --runInBand
```

Resultado: **passou**.

Contrato KCAPI: 1 suite / 23 testes passed.

Jest completo: 169 suites / 3524 testes passed.

Gates completos do PR devem incluir `npm run check:all` antes do merge.

---

## 9. Follow-up JS-B

`docs/qa/reports/report-v76-kcapi-diagnostics-extraction-2026-06-12.md` registra a primeira
extracao real do plano: `window._KCAPI.diagnostics`, 27 HTMLs reais com script antes da fachada,
107 membros publicos preservados e contagem documentada em 169 suites / 3524 testes.
