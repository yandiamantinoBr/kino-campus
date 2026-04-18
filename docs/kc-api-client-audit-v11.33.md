# Auditoria do Hotspot `kc-api.client.js` - v11.33.0

**Data:** 18 de abril de 2026
**Escopo:** `assets/js/kc-api.client.js`
**Objetivo:** mapear os domínios residuais da fachada `window.KCAPI` pós-trilha `v11.32.x`, identificar acoplamentos internos remanescentes e definir a sequência segura para a trilha `v11.33.x`.

---

## 1. Estado atual do arquivo

| Campo | Valor |
|---|---|
| Arquivo | `assets/js/kc-api.client.js` |
| Linhas | `2536` |
| Padrão estrutural | IIFE com `'use strict'` |
| HTMLs da base que carregam o arquivo | `22` |
| Export principal | `window.KCAPI = Object.freeze({...})` |
| Sub-módulos já extraídos | `5` (`notifications`, `saved`, `help`, `postsRead`, `commentsVotes`) |
| Namespace interno em uso | `window._KCAPI.*` |

### Sub-módulos operacionais (extraídos na trilha v11.32.x)

| Arquivo | Namespace | Métodos |
|---|---|---|
| `kc-api.notifications.js` | `window._KCAPI.notifications` | 9 |
| `kc-api.saved.js` | `window._KCAPI.saved` | 7 |
| `kc-api.help.js` | `window._KCAPI.help` | 6 |
| `kc-api.posts-read.js` | `window._KCAPI.postsRead` | 7 |
| `kc-api.comments-votes.js` | `window._KCAPI.commentsVotes` | 8 |

### Ordem de carregamento HTML atual

```
notifications.js → saved.js → help.js → posts-read.js → comments-votes.js → client.js
```

---

## 2. Domínios residuais no facade

Os grupos a seguir ainda têm implementação completa dentro de `kc-api.client.js`.
Nenhum deles foi extraído na trilha `v11.32.x`.

### 2.1. Ratings — RISCO BAIXO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating` |
| Normalizers co-locados | `normalizeUserRatingSummary`, `normalizeUserRatingEntry`, `normalizeUserRatingState`, `normalizeUserRatingList` |
| Linhas aprox. | ~1409–1471 (normalizers) · ~1711–1755 (funções públicas) |
| Deps runtime | driver (`getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`) |
| Estado do SWR | nenhum — delegação direta ao driver + normalização |
| Exposição no facade | `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`, `normalizeUserRatingSummary`, `normalizeUserRatingEntry`, `normalizeUserRatingState`, `normalizeUserRatingList` |

**Observação:** domínio mais autônomo do facade. Os normalizers podem ser co-locados no sub-módulo sem impacto em outros grupos. Candidato ideal para a primeira extração da trilha.

---

### 2.2. Posts-read-feed — RISCO BAIXO-MÉDIO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId`, `checkDuplicatePost`, `getTopContributors` |
| Linhas aprox. | ~1689–1806 · ~1847–1848 · ~2117–2128 |
| Deps runtime | driver (delegação direta) |
| Caso especial | `searchPosts` tem fallback para `driver.getPosts` quando o driver não implementa `searchPosts` |
| Estado do SWR | nenhum — delegações simples |
| Exposição no facade | `getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId`, `checkDuplicatePost`, `getTopContributors` |

**Observação:** feed principal do produto. Implementações são delegações simples. O fallback de `searchPosts` → `getPosts` deve ser preservado no sub-módulo. `getMyPosts` e `getPostsByAuthorId` estão distantes no arquivo (linha ~2117) mas pertencem semanticamente a este grupo.

---

### 2.3. Posts-write — RISCO MÉDIO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost` |
| Linhas aprox. | ~1757–1800 |
| Deps runtime | driver, `enforceSupabaseOnProduction`, `lastCreatePostError`, `setLastCreatePostError`, `summarizeCreatePayloadForDiagnostics` |
| Caso especial | `createPost` verifica `enforceSupabaseOnProduction('createPost')` e registra erros de diagnóstico via `lastCreatePostError` |
| Estado do SWR | nenhum — mutações sem cache |
| Exposição no facade | `createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost`, `getLastCreatePostError`, `setLastCreatePostError`, `clearLastCreatePostError`, `summarizeCreatePayloadForDiagnostics` |

**Observação:** o método `createPost` carrega a maior complexidade do grupo — policy gate de produção e infra de diagnóstico. O sub-módulo deve receber `enforceSupabaseOnProduction` como dep ou reimplementá-la localmente (padrão já estabelecido em `kc-api.comments-votes.js`). Os globals `window.getLastCreatePostError`, `window.setLastCreatePostError`, `window.clearLastCreatePostError`, `window.summarizeCreatePayloadForDiagnostics` devem migrar junto com o sub-módulo.

---

### 2.4. Profiles — RISCO MÉDIO-ALTO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `getCurrentProfile`, `getProfileById`, `syncProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar` |
| Linhas aprox. | ~1942–2115 |
| Deps runtime | `window.KCProfiles` (módulo externo), driver, `getAuthorById` (fallback de mocks para `getProfileById`) |
| Caso especial | `getProfileById` tem lógica de fallback em dois níveis: (1) `window.KCProfiles.getProfileById`, (2) `getAuthorById` para mocks legados |
| Estado do SWR | nenhum |
| Exposição no facade | `getCurrentProfile`, `getProfileById`, `syncProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar` |

**Observação:** o padrão de delegação a `window.KCProfiles` espelha o de `window.KCAccountProfileUtils` já usado pelo módulo de notifications. A extração requer atenção ao fallback de mocks em `getProfileById`. O sub-módulo deve receber `getAuthorById` como dep para manter o fallback.

---

### 2.5. Related — RISCO BAIXO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `getRelatedPosts`, `rankRelatedPosts` |
| Algoritmo interno | `rankRelatedPosts` é uma função de scoring pura (~120 linhas) + conjunto de helpers (`buildRelatedTokenSet`, `getRelatedPostScore`, `normalizeRelatedToken`, `getRelatedPostAuthorId`, etc.) |
| Linhas aprox. | ~157–345 (helpers + algoritmo) · ~2130–2134 (`getRelatedPosts`) · ~2508 (`rankRelatedPosts` no facade) |
| Deps runtime | driver (apenas `getRelatedPosts`) — `rankRelatedPosts` é puro |
| Estado do SWR | nenhum |
| Exposição no facade | `getRelatedPosts`, `rankRelatedPosts` |

**Observação:** `rankRelatedPosts` é função de scoring pura sem side effects — a extração mais segura do grupo. O sub-módulo carregará todos os helpers de scoring consigo, reduzindo o preâmbulo de `kc-api.client.js` em ~120 linhas líquidas.

---

### 2.6. Auth — RISCO ALTO

| Campo | Detalhe |
|---|---|
| Métodos públicos | `getCurrentUser`, `signIn`, `signUp`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`, `login`, `logout` |
| Wrappers internos | `supabaseGetCurrentUser`, `supabaseLogin`, `supabaseSignUp`, `supabaseResendConfirmation`, `supabaseRequestPasswordReset`, `supabaseUpdatePassword`, `supabaseLogout` |
| Linhas aprox. | ~1597–1939 |
| Deps runtime | `window.KCSupabase` (módulo externo), `ENV.driver` |
| Caso especial | todos os métodos têm guard `if (ENV.driver !== 'supabase')` — auth é exclusivamente Supabase |
| Estado do SWR | nenhum |
| Exposição no facade | `getCurrentUser`, `signIn`, `signUp`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`, `login`, `logout` |

**Observação:** caminho mais crítico do produto — qualquer regressão aqui causa falha total de login/cadastro. O sub-módulo deve ser carregado antes de `kc-api.client.js` e receber `ENV` como dep. Os wrappers supabase* podem ser co-locados no sub-módulo, simplificando o core significativamente. Extração adiada para a última posição da trilha.

---

## 3. Itens que permanecem no core

Os grupos a seguir **não são candidatos a split** na trilha `v11.33.x`:

| Item | Motivo para manter no core |
|---|---|
| Infraestrutura SWR (`getCachedSessionPayload`, `persistSessionPayload`, `removeSessionCache`, `clearSessionCachePrefix`, `withPendingSessionRequest`, `getSessionCache`, `setSessionCache`) | compartilhada por todos os sub-módulos via deps injection |
| `filterPosts` | utilitário amplo usado por consumers externos |
| `normalizePost` | normalizador central do produto |
| `getAuthorById`, `MOCK_USERS*` | fallback legado usado por consumers externos |
| `enforceSupabaseOnProduction` | helper de policy — co-localização planejada quando posts-write for extraído |
| `getDatabaseRaw`, `getDatabaseNormalized` | acesso de baixo nível raramente chamado |
| `readEnv`, `setConfig`, `fetchJSON`, `apiURL` | bootstrap — permanecem no core |

---

## 4. Acoplamentos inter-módulos conhecidos

### 4.1. `invalidatePostAnalyticsCache` como dep compartilhada

Já estabelecido na trilha v11.32.x: `addComment` e `votePost` (em `kc-api.comments-votes.js`) recebem `invalidatePostAnalyticsCache` como dep injetada. O mesmo padrão se aplica a qualquer mutação futura que precise invalidar analytics.

### 4.2. `getAuthorById` como dep de profiles

`getProfileById` usa `getAuthorById` como fallback de mocks. Quando profiles for extraído, `getAuthorById` deve ser passado como dep — não referenciado globalmente pelo sub-módulo.

### 4.3. Auth como pré-requisito transitivo

`signIn`/`signUp`/`logout` são chamados por consumers que também usam profiles e notifications. A extração de auth deve ser validada com regressão completa contra `kc-auth.ui.js`, `settings.controller.js` e `account-setup.controller.js`.

---

## 5. Resumo de footprint residual por domínio

| Domínio | Métodos públicos | Helpers/wrappers internos | Linhas estimadas | Risco |
|---|---|---|---|---|
| Ratings | 4 | 4 normalizers | ~110 | baixo |
| Posts-read-feed | 8 | — | ~70 | baixo-médio |
| Posts-write | 7 | 4 diagnósticos | ~60 | médio |
| Profiles | 6 | — | ~90 | médio-alto |
| Related | 2 | ~10 helpers de scoring | ~200 | baixo |
| Auth | 8 | 7 wrappers supabase | ~120 | alto |
| **Total** | **35** | **~25** | **~650** | — |

---

## 6. Sequência recomendada da trilha v11.33.x

| Iteração | Objetivo | Artefato central |
|---|---|---|
| `v11.33.0` | auditoria | `docs/kc-api-client-audit-v11.33.md` |
| `v11.33.1` | split `ratings` + normalizers | `assets/js/kc-api.ratings.js` → `window._KCAPI.ratings` |
| `v11.33.2` | split `posts-read-feed` | `assets/js/kc-api.posts-feed.js` → `window._KCAPI.postsFeed` |
| `v11.33.3` | split `posts-write` + diagnósticos | `assets/js/kc-api.posts-write.js` → `window._KCAPI.postsWrite` |
| `v11.33.4` | split `profiles` | `assets/js/kc-api.profiles.js` → `window._KCAPI.profiles` |
| `v11.33.5` | split `related` + algoritmo de ranking | `assets/js/kc-api.related.js` → `window._KCAPI.related` |
| `v11.33.6` | split `auth` | `assets/js/kc-api.auth.js` → `window._KCAPI.auth` |
| `v11.33.7` | release gate da trilha | `docs/qa/report-v11.33.7-run1.md` |

### Ordem de carregamento HTML esperada ao final da trilha

```
notifications.js → saved.js → help.js → posts-read.js → comments-votes.js
→ ratings.js → posts-feed.js → posts-write.js → profiles.js → related.js → auth.js
→ client.js
```

---

## 7. Invariantes obrigatórios da trilha v11.33.x

1. `window.KCAPI` continua sendo a única API pública.
2. Nenhum nome de método público muda.
3. Nenhuma aridade prática muda.
4. Nenhum retorno muda de shape sem camada de compatibilidade.
5. Cada sub-módulo novo é carregado antes de `kc-api.client.js`.
6. O core sempre mantém guards defensivos caso um sub-módulo falhe ao carregar.
7. Testes de delegação devem cobrir: fallback quando sub-módulo ausente + delegação correta quando presente.

---

## 8. Critérios de aceite da trilha

Toda iteração `v11.33.x` deve passar:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

E manter smoke HTTP `200` nos endpoints críticos de produção após cada deploy.
