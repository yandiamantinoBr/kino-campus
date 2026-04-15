# Auditoria de Monolitos — v11.30.0

**Data:** 15 de abril de 2026  
**Escopo:** `supabase.adapter.js` (4041 linhas, 162KB) e `product.controller.js` (3368 linhas, 143KB)  
**Objetivo:** mapear estrutura interna, grupos de responsabilidade, dependências externas e estratégia de split seguro

---

## 1. `supabase.adapter.js`

### 1.1. Métricas

| Campo | Valor |
|---|---|
| Linhas | 4041 |
| Tamanho | 162KB |
| Métodos públicos registrados em `driverSupabase` | 46 |
| Funções privadas internas | ~90 |
| Presente em HTMLs | **22/22** (todos os HTMLs carregam este arquivo) |
| Globals expostos | `window.KCAPI.registerAdapter('supabase', driverSupabase)` + `window.KCCompressImage` |

### 1.2. Mapa de seções internas

| Seção | Linhas | Funções principais |
|---|---|---|
| **Preâmbulo / diagnósticos** | 1–58 | `createPostDiagnostics`, `summarizeCreatePayloadForCreateDiagnostics`, `normalizeProfilePatchForAdapter` |
| **Bootstrap do cliente** | 59–104 | `hasSupabaseLib`, `getSupabaseClient` |
| **Auth** | 106–276 | `supabaseGetCurrentUser`, `supabaseLogin`, `supabaseSignUp`, `supabaseLogout`, `getUserDisplayNameForProfile`, `getUserAvatarForProfile`, `ensureSupabaseProfileForCreate` |
| **Media / Storage** | 277–711 | `dataUrlToBlob`, `extFromMime`, `sanitizeFilename`, `checkImageMagicBytes`, `compressImage`, `uploadImagesToSupabaseStorage`, `uploadProfileAvatarToSupabaseStorage`, helpers de storage path |
| **Normalização de posts** | 712–1052 | `mapSupabasePost`, `normalizeSupabasePost`, `buildSupabasePostSelect`, `supabaseGetPostById` |
| **Feed / Leitura de posts** | 1053–1180 | `supabaseGetPosts`, `supabaseSearchPosts`, `supabaseGetFeedCursor`, `normalizeSupabaseFilters`, `buildOrILike` |
| **Ratings de posts** | 1181–1257 | `supabaseGetUserRatingSummary`, `supabaseGetUserRatingState`, `supabaseListUserRatings`, `supabaseUpsertUserRating` |
| **Escrita de posts** | 1258–1892 | `normalizeCreatePayload`, `supabaseCreatePost`, `supabaseUpdatePost`, `supabaseDeletePost`, `syncPostMediaForUpdate`, `resolvePostUuid` |
| **Reports** | 1893–1980 | `supabaseReportPost` |
| **Comentários** | 1981–2152 | `supabaseGetComments`, `supabaseAddComment`, `supabaseLikeComment` |
| **Perfis** | 2153–2253 | `supabaseGetMyProfile`, `syncCurrentProfileCache`, `supabaseUpdateMyProfile`, `supabaseUploadProfileAvatar` |
| **Help requests (admin)** | 2254–2501 | `supabaseCreateHelpRequest`, `supabaseListAdminHelpRequests`, `supabaseUpdateAdminHelpRequest` |
| **Posts do usuário / autor** | 2502–2593 | `supabaseGetMyPosts`, `supabaseGetPostsByAuthorId` |
| **Posts relacionados** | 2594–2721 | `supabaseGetRelatedPosts`, `fetchRelatedPostsByIds` |
| **Saved posts** | 2722–3208 | `supabaseGetSavedPostStateMulti`, `supabaseSetSavedPostStateMulti`, `supabaseClearSavedPostStateMulti`, `supabaseGetMySavedPostsMulti`, `supabaseGetMySavedPostsCount`, `supabaseGetProfileHighlightsMulti`, `supabaseGetProfileHighlightsCount`, helpers internos |
| **Votos** | 3267–3423 | `supabaseVotePost`, `supabaseGetMyVote`, helpers internos |
| **Gerenciamento de posts (owner)** | 3424–3499 | `supabaseTogglePostStatus`, `supabaseRenewPost`, `supabaseBumpPost` |
| **Analytics / tracking** | 3500–3582 | `supabaseGetTopContributors`, `supabaseTrackCouponClick`, `supabaseTrackShare`, `supabaseTrackView`, `supabaseGetPostAnalytics`, `supabaseCheckDuplicatePost` |
| **Notificações** | 3583–3927 | `supabaseGetNotificationPreferences`, `supabaseUpdateNotificationPreferences`, `supabaseGetNotificationChannelTargets`, `supabaseUpdateNotificationChannelTargets`, `supabaseGetNotifications`, `supabaseMarkNotificationsRead`, `supabaseMarkAllNotificationsRead`, `supabaseClearNotifications`, `supabaseGetUnreadNotificationCount`, `supabaseSubscribeNotifications`, `supabaseUnsubscribeNotifications` |
| **Convites** | 3928–3969 | `supabaseInviteExternalUser`, `supabaseGetInvites`, `supabaseRevokeInvite` |
| **Registro do adapter** | 3970–4040 | `driverSupabase` (Object.freeze) + `registerAdapter` + expõe `KCCompressImage` |

### 1.3. Grupos de domínio para split

| Grupo proposto | Arquivo destino | Linhas aprox. | Métodos públicos |
|---|---|---|---|
| Bootstrap + Auth | `supabase.auth.adapter.js` | ~300 | `getCurrentUser`, `login`, `signUp`, `logout` |
| Media / Storage | `supabase.media.adapter.js` | ~450 | `compressImage` (+ `KCCompressImage`), upload helpers |
| Posts (leitura + normalização) | `supabase.posts.adapter.js` | ~900 | `getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId`, `getRelatedPosts` |
| Posts (escrita) | `supabase.posts-write.adapter.js` | ~650 | `createPost`, `updatePost`, `deletePost`, `togglePostStatus`, `renewPost`, `bumpPost`, `reportPost`, `checkDuplicatePost` |
| Votos + Ratings | `supabase.votes.adapter.js` | ~350 | `votePost`, `getMyVote`, `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating` |
| Comentários | `supabase.comments.adapter.js` | ~200 | `getComments`, `addComment`, `likeComment` |
| Perfis | `supabase.profiles.adapter.js` | ~350 | `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar`, `getPostsByAuthorId` |
| Saved / Highlights | `supabase.saved.adapter.js` | ~500 | `getSavedPostState`, `setSavedPostState`, `clearSavedPostState`, `getMySavedPosts`, `getMySavedPostsCount`, `getProfileHighlights`, `getProfileHighlightsCount` |
| Analytics | `supabase.analytics.adapter.js` | ~150 | `trackCouponClick`, `trackShare`, `trackView`, `getPostAnalytics`, `getTopContributors` |
| Notificações | `supabase.notifications.adapter.js` | ~350 | `getNotificationPreferences`, `updateNotificationPreferences`, `getNotificationChannelTargets`, `updateNotificationChannelTargets`, `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`, `clearNotifications`, `getUnreadNotificationCount`, `subscribeNotifications`, `unsubscribeNotifications` |
| Admin / Help | `supabase.admin.adapter.js` | ~300 | `createHelpRequest`, `listAdminHelpRequests`, `updateAdminHelpRequest`, `inviteExternalUser`, `getInvites`, `revokeInvite` |

### 1.4. Dependências internas críticas

- **`getSupabaseClient()`** é usada por praticamente todos os grupos — deve permanecer no arquivo principal ou ser exposta via namespace interno antes de qualquer sub-adapter ser carregado
- **`mapSupabasePost` / `normalizeSupabasePost`** são usadas pelos grupos de leitura e escrita — devem ser extraídas junto com posts-read ou em arquivo de utilitários compartilhados
- **`resolvePostUuid`** é usada por posts-write, saved e votos — deve ser resolvida antes do split ou duplicada com cautela
- **`compressImage`** é exposta via `window.KCCompressImage` para uso externo — o arquivo que a contiver deve manter `window.KCCompressImage = compressImage` na linha de exportação
- **`uploadImagesToSupabaseStorage`** é chamada internamente por `createPost` e `updatePost` — os dois devem permanecer no mesmo arquivo ou o de escrita deve depender do de media

### 1.5. Estratégia de split para supabase.adapter.js

**Abordagem:** Extração incremental com namespace de passagem interno.

Cada sub-adapter é um IIFE que registra suas funções em `window._KCSA` (namespace privado interno — prefixo `_` indica não ser API pública). O arquivo principal `supabase.adapter.js` passa a ser um **thin orchestrator** que:
1. Inicializa o cliente e expõe `getSupabaseClient` via `window._KCSA.getClient`
2. Lê as funções dos sub-adapters já carregados via `window._KCSA.*`
3. Monta e registra `driverSupabase`

Os HTMLs recebem as novas tags `<script defer>` antes do `supabase.adapter.js`.

**Ordem de extração segura (menor acoplamento primeiro):**
1. `supabase.notifications.adapter.js` — zero dependência de outros grupos, autocontido
2. `supabase.analytics.adapter.js` — só depende de `getSupabaseClient` + `resolvePostUuid`
3. `supabase.admin.adapter.js` — zero dependência de outros grupos
4. `supabase.comments.adapter.js` — só depende de `getSupabaseClient` e `getCurrentUser`
5. `supabase.votes.adapter.js` — depende de `getSupabaseClient` e `getCurrentUser`
6. `supabase.media.adapter.js` — autocontido; expõe `compressImage` + `window.KCCompressImage`
7. `supabase.saved.adapter.js` — depende de `getSupabaseClient`, `getCurrentUser`, `resolvePostUuid`
8. `supabase.posts.adapter.js` — depende de `getSupabaseClient`, `mapSupabasePost`, `normalizeSupabasePost`
9. `supabase.posts-write.adapter.js` — maior acoplamento; depende de `getSupabaseClient`, `getCurrentUser`, `uploadImagesToSupabaseStorage`, `resolvePostUuid`
10. `supabase.profiles.adapter.js` — depende de `getSupabaseClient`, `uploadProfileAvatarToSupabaseStorage`

---

## 2. `product.controller.js`

### 2.1. Métricas

| Campo | Valor |
|---|---|
| Linhas | 3368 |
| Tamanho | 143KB |
| Presente em HTMLs | **1** (`_product.html`) |
| Globals expostos | Nenhum — tudo privado na IIFE |
| Estado compartilhado | `currentPost`, `currentUser`, `currentProfile`, `editUI`, `savedPostState`, `sellerRatingModal` |

### 2.2. Mapa de seções internas

| Seção | Linhas | Responsabilidade |
|---|---|---|
| **Estado e constantes** | 8–25 | State vars, popover breakpoints |
| **Infraestrutura de popovers** | 26–220 | Posicionamento dinâmico de 3 popovers (share, save, calendar), resize binding, keyboard |
| **Share popover** | 137–220 | `trackCurrentPostShare`, `copyCurrentPostLink`, `openSharePopover`, `closeSharePopover`, `wireSharePopover` |
| **Save popover** | 221–265 | `openSavePopover`, `closeSavePopover`, `wireSavePopover` |
| **Utilitários gerais** | 266–605 | `getParam`, `esc`, `moduleLabel`, `formatCurrency`, `setText/setHTML/show/hide`, `toast`, `buildPostContactIntent`, `buildProfileHref`, resolvers de user/profile, `getPostContactAction`, `setCTA` |
| **Calendar popover** | 606–773 | `openCalendarPopover`, `closeCalendarPopover`, `wireCalendarPopover`, `setEventCalendar` (gera HTML de botão add-to-calendar) |
| **Comment composer / static bindings** | 774–968 | `maybeResumeQueuedContact`, `applyCommentComposerSessionState`, `wireCreateSimilarBtn`, `bindStaticInteractions` |
| **Renderização do post** | 969–1306 | `showNotFound`, `setBreadcrumb`, `setBadges`, legacy markers, `setGallery`, `setPrice`, `setDescription`, `addSpec`, `setSpecs`, `buildTagEntries`, `setOpenGraphTags`, `setLegacyBanner` |
| **Renderização de eventos** | 1307–1370 | Overloads de `setDescription` e `setSpecs` para módulo eventos |
| **Seller ratings (modal)** | 1371–1716 | `normalizeSellerRatingSummary`, `buildSellerRatingSummaryHtml`, `openAuthForUserRating`, `ensureSellerRatingModal` (500+ linhas de modal inline), `refreshSellerRatingUI` |
| **Seller / autor section** | 1717–1876 | `setSeller`, `loadSellerAuthorStats`, `enrichPostAuthorFromProfile` |
| **CTA / Contact legacy** | 1877–2025 | `normalizeWhatsAppPhone`, `getPostContactActionLegacy`, `reportCtaError`, `setCTALegacy` |
| **Save / bookmark interactions** | 2026–2205 | `getSavedButtons`, `getSaveKindLabel`, `getSaveKinds`, `updateSavedButtonsUI`, `refreshViewerState`, `refreshSavedState`, `bindSavedActions` |
| **Posts relacionados** | 2206–2329 | `getRelatedReasonLabel`, `getRelatedImageHtml`, `getRelatedPriceLabel`, `renderRelatedPosts`, `setRelated` |
| **Edit / Owner actions** | 2330–2672 | `isAuthor`, `buildEditPayload`, `upsertOwnerActions` (300+ linhas — bind completo do formulário de edição inline) |
| **Render orchestration** | 2673–2788 | `renderPost`, `buildAuthorAnalyticsSignature`, `renderAuthorAnalytics`, `_statBadge` |
| **Carregamento principal** | 2789–2852 | `loadPost` (fetch via KCAPI, aplica regras, renderiza) |
| **Edit UI builder** | 2853–2993 | `buildEditUI` — gera HTML completo do formulário de edição |
| **Report button / popover** | 2994–3368 | `wireReportButton`, `buildReportPopover`, entry `DOMContentLoaded` |

### 2.3. Grupos para split

| Grupo proposto | Arquivo destino | Linhas aprox. | Acoplamento com estado global |
|---|---|---|---|
| Infraestrutura de popovers | `product.popovers.js` | ~250 | Precisa de `currentPost` |
| Gallery e price | `product.gallery.js` | ~180 | Precisa de `currentPost` |
| Seller ratings modal | `product.ratings.js` | ~400 | Precisa de `currentPost`, `currentUser` |
| Edit / Owner actions | `product.edit.js` | ~350 | Precisa de `currentPost`, `currentUser`, `editUI` |
| Save / bookmark interactions | `product.save.js` | ~200 | Precisa de `currentPost`, `savedPostState` |
| Posts relacionados | `product.related.js` | ~130 | Precisa de `currentPost` |
| Calendar popover | `product.calendar.js` | ~170 | Precisa de `currentPost` |
| Analytics de autor | `product.analytics.js` | ~120 | Precisa de `currentPost`, `currentUser` |
| Report button | `product.report.js` | ~380 | Precisa de `currentPost`, `currentUser` |
| **Core (orquestrador)** | `product.controller.js` | ~800 | Mantém estado, `loadPost`, `renderPost`, `DOMContentLoaded` |

### 2.4. Desafio de acoplamento — estado compartilhado

Ao contrário do adapter (que opera via funções puras com parâmetros), `product.controller.js` usa **estado mutable compartilhado** (`currentPost`, `currentUser`, etc.) entre todos os grupos.

Isso significa que o split de `product.controller.js` exige um dos padrões:

**Opção A — Event-driven (recomendada):** O core emite custom events (`kc:product:loaded`, `kc:product:userloaded`) e os sub-módulos escutam para inicializar. Sub-módulos são IIFEs carregados após o core.

**Opção B — Namespace de estado:** O core expõe `window._KCProduct = { state, renderPost, ... }` e os sub-módulos leem/escrevem via esse namespace.

**Opção B é mais segura para esta codebase** por ser síncrona e não depender de ordem de eventos.

### 2.5. Estratégia de split para product.controller.js

1. O core cria `window._KCProduct` com o estado e as funções de render/load antes do `DOMContentLoaded`
2. Sub-módulos são carregados após `product.controller.js` no HTML de `_product.html` (apenas 1 HTML afetado)
3. Sub-módulos leem de `window._KCProduct.state` e usam `window._KCProduct.renderPost()` quando precisam forçar re-render
4. **Ordem de extração segura:**
   - Primeiro: `product.report.js` (zero dependência de outros sub-módulos)
   - Depois: `product.related.js` (leitura do estado, sem side effects no render principal)
   - Depois: `product.calendar.js` e `product.save.js`
   - Depois: `product.ratings.js` (maior sub-módulo isolável)
   - Por último: `product.edit.js` e `product.popovers.js` (maior acoplamento com core)

---

## 3. Comparação e sequência recomendada de entregas

| Iteração | Arquivo | Seção extraída | Risco | HTMLs impactados |
|---|---|---|---|---|
| v11.30.1-a | `supabase.adapter.js` | notifications | Baixo | 22 (adicionar 1 `<script>` em cada) |
| v11.30.1-b | `supabase.adapter.js` | analytics | Baixo | 22 |
| v11.30.1-c | `supabase.adapter.js` | admin + convites | Baixo | 22 |
| v11.30.1-d | `supabase.adapter.js` | comments | Baixo | 22 |
| v11.30.1-e | `supabase.adapter.js` | votes + ratings | Médio | 22 |
| v11.30.1-f | `supabase.adapter.js` | media / storage | Médio | 22 |
| v11.30.1-g | `supabase.adapter.js` | saved / highlights | Médio | 22 |
| v11.30.1-h | `supabase.adapter.js` | posts-read | Alto | 22 |
| v11.30.1-i | `supabase.adapter.js` | posts-write | Alto | 22 |
| v11.30.1-j | `supabase.adapter.js` | profiles | Médio | 22 |
| v11.30.2-a | `product.controller.js` | report | Baixo | 1 |
| v11.30.2-b | `product.controller.js` | related | Baixo | 1 |
| v11.30.2-c | `product.controller.js` | calendar + save | Médio | 1 |
| v11.30.2-d | `product.controller.js` | ratings | Médio | 1 |
| v11.30.2-e | `product.controller.js` | edit | Alto | 1 |
| v11.30.2-f | `product.controller.js` | popovers + core | Alto | 1 |
| v11.30.3 | `product.controller.js` | SWR após split | Baixo | 0 |

**Nota de escopo:** Cada "sub-iteração" acima pode ser agrupada em PRs maiores ou executada individualmente conforme nível de risco e preferência. O recomendado é agrupar as baixo/médio risco do adapter em 2-3 PRs e tratar alto risco individualmente.

---

## 4. Invariantes a preservar durante todo o split

1. `window.KCAPI.registerAdapter('supabase', driverSupabase)` — todos os 46 métodos do `driverSupabase` devem continuar registrados com os mesmos nomes de propriedade
2. `window.KCCompressImage = compressImage` — exposto globalmente para uso externo; deve seguir para `supabase.media.adapter.js`
3. Nenhum contrato de `window.KCAPI.*` pode mudar de assinatura
4. `npx jest --runInBand` — 61/61 suites verdes após cada extração
5. `node scripts/hygiene-check.js` — `8.6.0` após cada extração
6. Smoke HTTP 200 após cada deploy de extração

---

## 5. Decisão: v11.30.1 — primeiro PR

**Escopo aprovado para v11.30.1:** extrair as seções de **menor acoplamento** do `supabase.adapter.js`:
- Notificações (linhas 3583–3927) → `supabase.notifications.adapter.js`
- Analytics/tracking (linhas 3500–3582) → `supabase.analytics.adapter.js`

Essas duas seções são as mais autocontidas: não exportam funções usadas por outros grupos, não dependem de funções de outros grupos além de `getSupabaseClient()` e `supabaseGetCurrentUser()`, e somam ~400 linhas de redução imediata.

A `getSupabaseClient` permanece no arquivo principal durante v11.30.1 — a extração do client bootstrap vem por último, depois que todos os sub-adapters estiverem estabilizados.
