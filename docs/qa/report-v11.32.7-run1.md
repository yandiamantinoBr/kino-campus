# v11.32.7 Release Gate — Trilha v11.32.x

| Campo | Valor |
|---|---|
| Data | 18 de abril de 2026 |
| Linha-base | `kinocampus-V11.0-foundations` |
| Branch de trabalho | `codex/v11-32-7-release-gate` |
| Objetivo | fechar o release gate formal da trilha `v11.32.x` — split por domínio do facade `window.KCAPI` |

---

## Escopo

- regressão completa da base (93/93 suites, 1754/1754 testes)
- hygiene check do frontend canônico
- smoke remoto do domínio público
- auditoria do estado final de `kc-api.client.js`
- encerramento formal da trilha `v11.32.x`

---

## Ajustes aplicados nesta rodada

Nenhum. Esta iteração é documentação-only — todos os artefatos de runtime foram entregues nas iterações v11.32.1 a v11.32.6.

---

## Comandos executados

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

---

## Resultado da regressão

- suites Jest: `93/93` aprovadas
- testes individuais: `1754/1754` aprovados
- `scripts/hygiene-check.js`: aprovado (versão canônica `8.6.0`)
- `git diff --check`: aprovado

---

## Smoke remoto

Validação por HTTP da produção publicada (`dpl_Dxajob4FbnLs64iBN2he6vsVta1y`):

| URL | Status |
|-----|--------|
| `https://www.kinocampus.com.br/` | `200 OK` |
| `https://www.kinocampus.com.br/compra-venda-feed.html` | `200 OK` |
| `https://www.kinocampus.com.br/create-post.html` | `200 OK` |
| `https://www.kinocampus.com.br/assets/js/kc-api.comments-votes.js` | `200 OK` |
| `https://www.kinocampus.com.br/assets/js/kc-api.posts-read.js` | `200 OK` |
| `https://www.kinocampus.com.br/assets/js/kc-api.client.js` | `200 OK` |

---

## Resumo da trilha v11.32.x

### Iterações entregues

| Iteração | Tipo | Artefato central | PR |
|---|---|---|---|
| v11.32.0 | auditoria | `docs/kc-api-client-audit-v11.32.md` | `#370` |
| v11.32.1 | suite estática de contrato | `tests/kc-api-facade-contract.test.js` | `#372` |
| v11.32.2 | split `notifications` | `assets/js/kc-api.notifications.js` → `window._KCAPI.notifications` | `#374` |
| v11.32.3 | split `saved/highlights` | `assets/js/kc-api.saved.js` → `window._KCAPI.saved` | `#376` |
| v11.32.4 | split `help/invites` | `assets/js/kc-api.help.js` → `window._KCAPI.help` | `#378` |
| v11.32.5 | split `posts-read/analytics` | `assets/js/kc-api.posts-read.js` → `window._KCAPI.postsRead` | `#380` |
| v11.32.6 | split `comments/votes` + hardening | `assets/js/kc-api.comments-votes.js` → `window._KCAPI.commentsVotes` | `#382` |
| v11.32.7 | release gate | `docs/qa/report-v11.32.7-run1.md` | `#384` |

### Evolução do baseline

| Fase | Suites | Testes |
|---|---|---|
| v11.32.0 (pré-trilha) | 87/87 | 1672/1672 |
| v11.32.1 | 88/88 | 1688/1688 |
| v11.32.2 | 89/89 | 1694/1694 |
| v11.32.3 | 90/90 | 1703/1703 |
| v11.32.4 | 91/91 | 1711/1711 |
| v11.32.5 | 92/92 | 1731/1731 |
| v11.32.6 | 93/93 | 1754/1754 |
| v11.32.7 | **93/93** | **1754/1754** |

### Sub-módulos criados

| Arquivo | Namespace | Métodos | Deps SWR auto-contidas |
|---|---|---|---|
| `kc-api.notifications.js` | `window._KCAPI.notifications` | 9 | não |
| `kc-api.saved.js` | `window._KCAPI.saved` | 7 | não |
| `kc-api.help.js` | `window._KCAPI.help` | 6 | não |
| `kc-api.posts-read.js` | `window._KCAPI.postsRead` | 7 | sim (`_pendingProductAnalyticsRequests`, TTL) |
| `kc-api.comments-votes.js` | `window._KCAPI.commentsVotes` | 8 | sim (`_pendingProductCommentsRequests`, TTL) |

### Estado de `kc-api.client.js`

- Linhas: `2536` (era `2520` na abertura da trilha — +16L líquido pelas 5 delegações)
- Dead code removido: constantes e helpers de analytics/comments (`PRODUCT_ANALYTICS_*`, `PRODUCT_COMMENTS_*`, `getPostAnalyticsCacheKey`, `buildPostAnalyticsSignature`, `getCommentsCacheKey`, `getCommentsCacheIdentity`, `normalizeCommentsPayload`, `buildCommentsSignature`)
- Padrão de carregamento HTML: `notifications.js → saved.js → help.js → posts-read.js → comments-votes.js → client.js`

### Domínios ainda no facade (candidatos a trilhas futuras)

| Grupo | Métodos | Observação |
|---|---|---|
| Auth | `signIn`, `signUp`, `logout`, `signUp`, `resendConfirmation`, `requestPasswordReset`, `updatePassword` | dependência direta de `supabaseLogin` etc; separação requer cuidado |
| Profiles | `getProfileById`, `syncProfile`, `getCurrentProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar` | parte do fluxo de onboarding crítico |
| Posts-write | `createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost` | pipeline de criação muito usado |
| Posts-read | `getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId` | feed principal |
| Ratings | `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating` | domínio autônomo |
| Related | `getRelatedPosts`, `rankRelatedPosts` | lógica de ranking interna ao facade |

---

## Drift ainda conhecido

- a linha funcional e documental do projeto está em `v11`, mas o runtime canônico do frontend continua mapeado em `8.6.0` — preservado intencionalmente para não introduzir um version bump parcial de alto risco
- `local.adapter.js` e `supabase.adapter.js` ainda não foram auditados para paridade de contratos com os novos sub-módulos; candidatos a uma trilha de paridade futura

---

## PR e deploys

- PR funcional da última iteração: `#382` — squash merge `7054114`
- Deploy de produção ativo: `dpl_Dxajob4FbnLs64iBN2he6vsVta1y` (`www.kinocampus.com.br`)
- PR de release gate: `#384`

---

## Fechamento

Esta rodada fecha o release gate formal da trilha `v11.32.x` com a base regressivamente verde, todos os 5 sub-módulos publicados em produção e evidências HTTP registradas.

A próxima trilha de split do facade (`v11.33.x`) pode atacar os domínios restantes listados acima na ordem que melhor atender à prioridade operacional.
