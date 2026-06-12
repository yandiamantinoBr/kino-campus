# Estratégia de Testes — KinoCampus

**Versão:** v76.3.0 · **Atualizado em:** 2026-06-12

> Documenta as 171 suites Jest + 9 specs Playwright: o que cada uma cobre,
> como adicionar novos testes e as regras de manutenção.

---

## Índice

1. [Filosofia](#1-filosofia)
2. [Métricas atuais](#2-métricas-atuais)
3. [Diretório unit/ — 25 suites](#3-diretório-unit--25-suites)
4. [Diretório integration/ — 121 suites](#4-diretório-integration--121-suites)
5. [Diretório contract/ — 8 suites](#5-diretório-contract--8-suites)
6. [Diretório structure/ — 12 suites](#6-diretório-structure--12-suites)
7. [Diretório a11y/ — 5 suites](#7-diretório-a11y--5-suites)
8. [E2E com Playwright — 9 specs](#8-e2e-com-playwright--9-specs)
9. [Como adicionar novos testes](#9-como-adicionar-novos-testes)
10. [Regras de manutenção](#10-regras-de-manutenção)

---

## 1. Filosofia

### Princípios centrais

| Princípio | Aplicação |
|-----------|-----------|
| **Regressão estrutural** | Toda mudança de estrutura (mover arquivo, alterar namespace, modificar cadeia de scripts) deve ser coberta por um teste que falhe se a estrutura mudar |
| **Contrato público, não implementação** | Os testes verificam `window.KCAPI.getFeedCursor` existe e retorna o tipo correto — não como está implementado internamente |
| **Zero mocks de negócio** | Os adapters locais (`local.adapter.js` + sub-módulos) funcionam como implementação real em testes, não como mocks. Isso garante que o driver local seja sempre uma implementação funcional |
| **Gates B2** | Thresholds mínimos de i18n (≥440 chaves, ≥189 `data-i18n-aria-label`, etc.) são validados como testes, impedindo regressão silenciosa |
| **Execução rápida** | Todos os 171 suites Jest rodam sem network, sem browser e sem Supabase real |

### O que os testes NÃO fazem

- Não testam o Supabase real (sem chamadas de rede nos testes Jest)
- Não testam a UI visual (CSS, layout, responsive) — isso é coberto pelos E2E
- Não testam Edge Functions do Supabase (validadas em ambiente separado)
- Não testam o comportamento do `vercel.json` em produção

---

## 2. Métricas atuais

### Distribuição por diretório

| Diretório | Suites | Domínio principal |
|-----------|--------|------------------|
| `tests/unit/` | **25** | Módulos utilitários individuais |
| `tests/integration/` | **121** | Controllers, adapters, sub-módulos KCAPI |
| `tests/contract/` | **8** | Contratos públicos e formas de exports |
| `tests/structure/` | **12** | Estrutura HTML, namespaces, cadeia de scripts |
| `tests/a11y/` | **5** | Acessibilidade WCAG 2.1 AA |
| `tests/e2e/` | **9** | Playwright (browser real, HTTP real) |
| **Total** | **180** | (171 Jest + 9 Playwright specs) |

### Contagem canônica

```
Jest: 171 suites · 3545 testes
Playwright: 9 specs · 59 testes listados
```

**Regra imutável:** `npm test` DEVE sempre retornar `≥171 passed, 171 total` e `≥3545 passed, 3545 total`.

### Gate CI essencial

O workflow `.github/workflows/essential-validation.yml` roda em pull requests e pushes para `kinocampus-V75.0-foundations`:

- `npm run check:version`
- `npm run check:structure`
- `npm run check:scripts`
- `npm run check:routes`
- `npm run check:hygiene`
- `npm test -- --runInBand`
- `npx playwright test --list`

Esse gate cobre validação estrutural, Jest completo e inventário Playwright sem exigir browser real ou deploy.

---

## 3. Diretório unit/ — 25 suites

Cobre módulos utilitários individuais — funções puras, sem dependências de DOM ou browser.

A tabela abaixo destaca as suites principais; a contagem canônica vem do filesystem e do resultado do Jest.

| Suite | Módulo testado | O que cobre |
|-------|---------------|------------|
| `anti-spam.test.js` | lógica de anti-spam | Detecção de spam em conteúdo de posts |
| `image-compression.test.js` | compressão canvas | Redimensionamento e compressão de imagens antes do upload |
| `kc-constants.test.js` | `kc-constants.js` | Namespace `window.KC_CONSTANTS`, campos obrigatórios, Object.freeze |
| `kc-feature-flags.test.js` | `kc-feature-flags.js` | `window.KCFF.get`, `isEnabled`, defaults `sw.enabled`/`telemetry.enabled` |
| `kc-feed-filters.test.js` | filtros do feed | Filtros de módulo, categoria, subcategoria e busca |
| `kc-filters.test.js` | `kc-filters.js` | Lógica de filtragem de posts no frontend |
| `kc-i18n.test.js` | `kc-i18n.js` | `window.KCI18n`, dicionário pt-BR, `applyRuntimeI18n`, helpers de tradução |
| `kc-ranking.test.js` | `kc-ranking.js` | `window.KCRanking`, cálculo de pontuação, ranking de contribuidores |
| `kc-utils-dom.test.js` | `kc-utils.dom.js` | `debounce`, `copyTextToClipboard`, `canSelectInputLike` |
| `kc-utils-expanded.test.js` | `kc-utils.js` (geral) | Funções de KCUtils não cobertas por sub-módulos |
| `kc-utils-format.test.js` | `kc-utils.format.js` | `timeAgo`, `formatCurrencyBRL`, `buildProductDetailHref`, `clamp` |
| `kc-utils-identity.test.js` | `kc-utils.identity.js` | `normalizeEmail`, `isInstitutionalEmailAllowed`, `buildPublicHandle` |
| `kc-utils-location.test.js` | `kc-utils.location.js` | Resolver de regiões, caronas, achados-e-perdidos, features de moradia |
| `kc-utils-presentation.test.js` | `kc-utils.presentation.js` | `renderPostCard`, `applyPresentationRules`, `getDisplayMarkerTags` |
| `kc-utils-resolvers.test.js` | resolvers utilitários | Normalização de campos de módulos específicos |
| `kc-utils-string.test.js` | `kc-utils.string.js` | `escapeHtml`, `normalizeText`, `slugifyText`, `levenshteinDistance`, `renderMarkdownInline` |
| `kc-utils-taxonomy.test.js` | `kc-utils.taxonomy.js` | `resolveOpportunityArea`, rótulos de módulo/categoria/subcategoria |
| `kc-utils.test.js` | `kc-utils.js` (contrato) | Shape do objeto `window.KCUtils`, presença de todos os métodos públicos |
| `lazy-loader.test.js` | `kc-lazy-loader.js` | Carregamento lazy de componentes e módulos opcionais |
| `sw.test.js` | `sw.js` + `kc-sw-register.js` | Service Worker: cache-first, shell assets, guards de registro |
| `telemetry.test.js` | `kc-telemetry.js` | Buffer de erros, `sendBeacon`, kill-switch via KCFF |
| `voting.test.js` | `components/voting.js` | Lógica de votos (positivo/negativo), estado de votação Supabase Realtime |

---

## 4. Diretório integration/ — 121 suites

Cobre fluxos completos: controllers, adapters, sub-módulos KCAPI — onde módulos interagem entre si.

A tabela abaixo é agrupada por domínio e não lista todos os 121 arquivos individualmente.

### Sub-grupo: Controllers públicos (6 suites)

| Suite | Controller | O que cobre |
|-------|-----------|------------|
| `achados-perdidos.controller.test.js` | `achados-perdidos.controller.js` | Carregamento de feed, filtros de localização, renderização de posts |
| `caronas-feed.controller.test.js` | `caronas-feed.controller.js` | Feed de caronas, filtros origem/destino, SWR |
| `eventos.controller.test.js` | `eventos.controller.js` | Feed de eventos, filtros de data/categoria |
| `moradia.controller.test.js` | `moradia.controller.js` | Feed de moradia, filtros de região/preço |
| `index.controller.test.js` | `index.controller.js` | Página principal, carousel, módulos de destaque |
| `kc-feed.controller.test.js` | `kc-feed.controller.js` | Controller de feed compartilhado entre 6 páginas |

### Sub-grupo: Controllers auxiliares de product (8 suites)

| Suite | Sub-módulo | O que cobre |
|-------|-----------|------------|
| `product.analytics.test.js` | `product.analytics.js` | Painel de analytics do vendedor |
| `product.calendar.test.js` | `product.calendar.js` | Popover de calendário de eventos |
| `product.edit.test.js` | `product.edit.js` | Modal de edição e ações de owner |
| `product.popovers.test.js` | `product.popovers.js` | Posicionamento de popovers, share, copy link |
| `product.ratings.test.js` | `product.ratings.js` | Avaliação do vendedor, modal de rating, auth gate |
| `product.related.test.js` | `product.related.js` | Posts relacionados, score de relevância |
| `product.report.test.js` | `product.report.js` | Botão de report, popover, 7 motivos |
| `product.save.test.js` | `product.save.js` | Salvar/desfavoritar post, estado sincronizado |

### Sub-grupo: Controllers de profile (4 suites)

| Suite | Sub-módulo | O que cobre |
|-------|-----------|------------|
| `profile.collections.test.js` | `profile.collections.js` | Tabs de posts/comentários/salvos/atividades |
| `profile.flow.test.js` | `profile.flow.js` | Lifecycle de carregamento e edição de perfil |
| `profile.presentation.test.js` | `profile.presentation.js` | Header de perfil, avatar, badges de reputação |
| `profile.ratings.test.js` | `profile.ratings.js` | Avaliações recebidas, renderização de estrelas |

### Sub-grupo: Controllers admin (4 suites)

| Suite | Sub-módulo | O que cobre |
|-------|-----------|------------|
| `admin-dashboard.audit.test.js` | `admin-dashboard.audit.js` | Audit log, paginação, exportação XLSX/PDF |
| `admin-dashboard.charts.test.js` | `admin-dashboard.charts.js` | Gráficos de tendência, search trends, ranking admin |
| `admin-dashboard.metrics.test.js` | `admin-dashboard.metrics.js` | Métricas de posts, usuários, relatórios |
| `admin-dashboard.shared.test.js` | `admin-dashboard.shared.js` | Utilitários compartilhados do dashboard admin |

### Sub-grupo: KCAPI sub-módulos (15 suites)

| Suite | Sub-módulo | O que cobre |
|-------|-----------|------------|
| `kc-api-auth-module.test.js` | `kc-api.auth.js` | `signIn`, `signUp`, `getCurrentUser`, `logout` |
| `kc-api-client.test.js` | `kc-api.client.js` | Fachada principal: `registerAdapter`, `getActiveDriver`, diagnósticos |
| `kc-api-comments-votes-module.test.js` | `kc-api.comments-votes.js` | Comentários, votos, SWR de comments |
| `kc-api-diagnostics-module.test.js` | `kc-api.diagnostics.js` | Estado de diagnóstico de create-post, resumo de payload e ordem HTML |
| `kc-api-session-module.test.js` | `kc-api.session.js` | `KCSessionStore`, `KCPostFreshness`, storage keys, dedupe e ordem HTML |
| `kc-api-filters-module.test.js` | `kc-api.filters.js` | `filterPosts`, requestParams avancados, date presets e ordem HTML |
| `kc-api-help-module.test.js` | `kc-api.help.js` | Pedidos de ajuda, convites externos |
| `kc-api-notifications-module.test.js` | `kc-api.notifications.js` | Preferências, subscribe/unsubscribe, contador |
| `kc-api-posts-feed-module.test.js` | `kc-api.posts-feed.js` | `getFeedCursor`, `getPosts`, `searchPosts`, `getPostById` |
| `kc-api-posts-read-module.test.js` | `kc-api.posts-read.js` | `getPostAnalytics`, SWR de analytics, `trackView` |
| `kc-api-posts-write-module.test.js` | `kc-api.posts-write.js` | `createPost`, `updatePost`, `deletePost`, `reportPost` |
| `kc-api-profiles-module.test.js` | `kc-api.profiles.js` | `getCurrentProfile`, `getProfileById`, `syncProfile` |
| `kc-api-ratings-module.test.js` | `kc-api.ratings.js` | `getUserRatingSummary`, `upsertUserRating` |
| `kc-api-related-module.test.js` | `kc-api.related.js` | `rankRelatedPosts`, algoritmo de scoring |
| `kc-api-saved-module.test.js` | `kc-api.saved.js` | `getSavedPostState`, `getMySavedPosts`, highlights |
| `kc-api-session-swr.test.js` | sessão + SWR | Cache de sessão, invalidação, TTL |

### Sub-grupo: Adapters locais (8 suites)

| Suite | Adapter | O que cobre |
|-------|---------|------------|
| `local-adapter.test.js` | `local.adapter.js` | Facade do driver local, registro em KCAPI |
| `local-help.adapter.test.js` | `local.help.adapter.js` | `createHelpRequest`, `listAdminHelpRequests` |
| `local-notifications.adapter.test.js` | `local.notifications.adapter.js` | 14 exports do domínio notifications |
| `local-posts-read.adapter.test.js` | `local.posts-read.adapter.js` | Feed, busca, paginação cursor em localStorage |
| `local-posts-write.adapter.test.js` | `local.posts-write.adapter.js` | CRUD de posts em localStorage |
| `local-profile.adapter.test.js` | `local.profile.adapter.js` | `readProfile`, `updateMyProfile`, `uploadProfileAvatar` |
| `local-ratings.adapter.test.js` | `local.ratings.adapter.js` | `upsertUserRating`, `enrichPostsWithRatings` |
| `local-saved.adapter.test.js` | `local.saved.adapter.js` | `getSavedPostState`, `getMySavedPosts`, highlights |

### Sub-grupo: Adapters Supabase (11 suites)

| Suite | Adapter | O que cobre |
|-------|---------|------------|
| `supabase-adapter.test.js` | `supabase.adapter.js` | Facade do driver Supabase, inicialização do client |
| `supabase-admin-adapter.test.js` | `supabase.admin.adapter.js` | Operações administrativas (moderação, banners) |
| `supabase-analytics-adapter.test.js` | `supabase.analytics.adapter.js` | `trackView`, `getPostAnalytics`, eventos de interação |
| `supabase-comments-adapter.test.js` | `supabase.comments.adapter.js` | `getComments`, `addComment`, `likeComment` |
| `supabase-media-adapter.test.js` | `supabase.media.adapter.js` | Upload de imagens, Storage bucket `kino-media` |
| `supabase-notifications-adapter.test.js` | `supabase.notifications.adapter.js` | Realtime, preferências, `subscribeNotifications` |
| `supabase-posts-read.adapter.test.js` | `supabase.posts-read.adapter.js` | Feed, busca full-text, `getFeedCursor` |
| `supabase-posts-write.adapter.test.js` | `supabase.posts-write.adapter.js` | `createPost` com auth + profile sync + Storage |
| `supabase-profiles.adapter.test.js` | `supabase.profiles.adapter.js` | `getMyProfile`, `updateMyProfile`, sync |
| `supabase-saved-adapter.test.js` | `supabase.saved.adapter.js` | `setSavedPostState`, highlights |
| `supabase-votes-adapter.test.js` | `supabase.votes.adapter.js` | Upvote/downvote, `getMyVote` |

### Sub-grupo: Módulos compartilhados e outros (20 suites)

| Suite | O que cobre |
|-------|------------|
| `account-profile.shared.test.js` | `account-profile.shared.js`: utilitários de perfil/conta compartilhados |
| `account-setup-contact-preview.test.js` | Preview de links de contato na configuração de conta |
| `account-setup-social-hydration.test.js` | Hidratação de campos de redes sociais no setup |
| `compra-venda-ingressos.test.js` | Campos específicos de Compra e Venda / Ingressos |
| `create-post.controller.test.js` | Controller principal de criação de post |
| `help.shared.test.js` | `help.shared.js`: utilitários de pedidos de ajuda |
| `home-categories.shared.test.js` | `home-categories.shared.js`: categorias da homepage |
| `ios-gesture-hardening.test.js` | Comportamentos de gestos iOS/Safari |
| `kc-banners.test.js` | `kc-banners.js`: sistema de banners admin |
| `kc-comments-session.test.js` | Sessão de comentários, autenticação |
| `kc-comments-shadow-cleanup.test.js` | Limpeza de shadow DOM em comentários |
| `kc-comments.shared.test.js` | `kc-comments.shared.js`: utilitários de comentários |
| `kc-create-post-active-fields.test.js` | Lógica de campos ativos por módulo no create-post |
| `kc-create-post-fields.test.js` | `kc-create-post.fields.js`: geração de campos dos 6 módulos |
| `kc-create-post-media.test.js` | `kc-create-post.media.js`: upload e compressão de imagens |
| `kc-create-post-render.test.js` | `kc-create-post.render.js`: renderização do modal de criação |
| `kc-create-post-resolvers.test.js` | `kc-create-post.resolvers.js`: 25 resolvers de domínio |
| `kc-create-post-schema.test.js` | `kc-create-post.schema.js`: constantes e schema dos módulos |
| `kc-create-post-submit.test.js` | `kc-create-post.submit.js`: pipeline completo de submit |
| `kc-notifications-dropdown.test.js` | Dropdown de notificações, marcação como lida |
| `kc-ranking-session.test.js` | Sessão de ranking, cache SWR |
| `kc-search.shared.test.js` | `kc-search.shared.js`: busca compartilhada entre páginas |
| `kc-supabase-client.test.js` | `kc-supabase.client.js`: client facade Supabase |
| `my-posts-swr.test.js` | `my-posts.controller.js`: SWR de "Meus Posts" |
| `notification-delivery-foundation.test.js` | Fundação do sistema de entrega de notificações |
| `notification-dispatch-ops.test.js` | Operações de dispatch de notificações |
| `notification-email-channel.test.js` | Canal de e-mail para notificações |
| `notification-whatsapp-channel.test.js` | Canal de WhatsApp para notificações |
| `ods.shared.test.js` | `ods.shared.js`: badges ODS (Objetivos de Desenvolvimento Sustentável) |
| `post-analytics.test.js` | Analytics de posts (views, shares, coupon clicks) |
| `profile-my-posts-detail-links.test.js` | Links de detalhe de posts na aba "Meus Posts" do perfil |
| `profile-swr.test.js` | Cache SWR do perfil |
| `search-analytics.shared.test.js` | Analytics de buscas |
| `settings-contact-preview-links.test.js` | Preview de links de contato nas configurações |
| `settings-notification-preferences.test.js` | Preferências de notificação nas configurações |
| `voting-session-hydration.test.js` | Hidratação do estado de votação na sessão |

---

## 5. Diretório contract/ — 8 suites

Trava formas públicas (shapes) de módulos críticos. Um teste de contrato falha se um método for removido ou renomeado, mesmo sem quebrar a funcionalidade aparente.

| Suite | O que trava |
|-------|------------|
| `admin-banners-access-contract.test.js` | Shape do contrato de acesso admin a banners |
| `chat-continuity-contract.test.js` | Contrato de continuidade de conversa/chat |
| `kc-api-facade-contract.test.js` | Snapshot dos 107 membros exportados de `window.KCAPI` e guarda de crescimento do facade |
| `kc-api-notification-preferences-contract.test.js` | Contrato de preferências de notificação (6 tipos, 3 canais) |
| `kc-api-notifications-contract.test.js` | Contrato do sub-módulo `window._KCAPI.notifications` |
| `kc-create-post-contract.test.js` | Exports públicos do módulo de criação de post |
| `product.controller-split-contract.test.js` | Cadeia de scripts do `_product.html` e namespaces `_KCProduct.*` |
| `version-map.test.js` | Campos de `VERSION.json` e consistência de `frontendRuntimeVersion` |

---

## 6. Diretório structure/ — 12 suites

Verifica estrutura de HTML, namespaces de módulos e cadeias de scripts — sem rodar código de negócio.

| Suite | O que verifica |
|-------|---------------|
| `admin-shell-preload-markup.test.js` | Markup de preload no shell admin, `<link rel="preload">` |
| `check-scripts.test.js` | Cadeia de scripts em cada um dos 26 HTMLs canônicos (ordem, prefixos, `?v=8.6.1`) |
| `feed-empty-clear-markup.test.js` | Markup de estado vazio nos feeds |
| `header-responsive.test.js` | Estrutura responsiva do header publico |
| `kc-core-split.test.js` | Namespaces `_KCCore.*` no split do core |
| `kc-ranking-markup.test.js` | Markup HTML do componente de ranking |
| `kc-supabase-split.test.js` | Namespaces `_KCSA.*` no split do adapter Supabase |
| `oportunidades-split.test.js` | Namespaces `_KCOpNormalize.*` no split do normalizador de oportunidades |
| `product-controller-split.test.js` | Namespaces `_KCProduct.*` e ordem dos scripts em `_product.html` |
| `product-lightbox.test.js` | Markup e contrato estrutural do lightbox de produto |
| `product-popover-hardening.test.js` | Hardening de popovers na página de produto |
| `structural-validators.test.js` | Os 5 validators: chamadas e contratos das funções principais |

---

## 7. Diretório a11y/ — 5 suites

Verifica conformidade com WCAG 2.1 AA: estrutura de documento, marcações i18n, aria-labels.

| Suite | O que verifica |
|-------|---------------|
| `a11y.test.js` | `<h1>` único por página, skip link `<a href="#kc-main">`, `<main id="kc-main">`, `<nav aria-label>` |
| `i18n-aria-placeholder.test.js` | ≥189 marcações `data-i18n-aria-label` + ≥59 `data-i18n-placeholder` nos HTMLs canônicos |
| `i18n-b2-gate.test.js` | Gate B2: `kc-i18n.js` ≥440 chaves únicas, ≥800 linhas; thresholds dos 5 tipos de marcação |
| `i18n-metadata.test.js` | `data-i18n-title` + `data-i18n-description` nos HTMLs canônicos; `data-i18n-alt` em imagens |
| `i18n-tooltip.test.js` | ≥55 marcações `data-i18n-tooltip` nos HTMLs canônicos |

---

## 8. E2E com Playwright — 9 specs

Rodam no browser real (Chromium) contra um servidor HTTP local (`http-server` na porta 4000). Não fazem chamadas reais ao Supabase — usam o driver local.

| Suite | Páginas cobertas | O que testa |
|-------|-----------------|------------|
| `smoke.spec.js` | `/` (homepage) | Status 200, `<h1>` único, skip link, href `#kc-main`, `<main id="kc-main">` |
| `pages-load.spec.js` | home, compra-venda, caronas, eventos, busca | Status 200 + estrutura WCAG básica por página |
| `a11y-e2e.spec.js` | homepage (DOM vivo) | `lang="pt-BR"`, nav aria-label, theme-toggle, skip link no Tab, carousel, `kc-ranking-info-btn` |
| `create-post.spec.js` | `/create-post` | Status 200, h1/skip/main, lang, nav aria-label, busca, theme-toggle |
| `header-responsive.spec.js` | paginas publicas principais | Responsividade e navegacao do header |
| `product-detail.spec.js` | `/_product.html` | Editor rich-text (Negrito/Itálico aria-label), input do autor, sharePopover, `renderPostCard` |
| `admin-pages.spec.js` | 6 páginas admin | Dashboard, Moderação, Banners, Denúncias, Ajuda, Privacidade/Analytics — 200 + skip link + h1 + main |
| `admin-moderation.spec.js` | `/admin/moderation.html` | Status 200, estrutura, 3 selects A5 com `aria-label`, nav com `aria-label` |
| `remaining-pages.spec.js` | moradia, oportunidades, achados-perdidos, ods, my-posts, profile, settings | Status 200 + estrutura WCAG |

### Como rodar os E2E

```bash
# Rodar todos os E2E (Playwright Chromium)
npm run test:e2e

# Ver relatório HTML após rodar
npm run test:e2e:report

# Rodar apenas uma suite específica
npx playwright test tests/e2e/smoke.spec.js
```

**Pré-requisito:** o servidor local deve estar disponível na porta 4000. O `playwright.config.js` configura `http-server` automaticamente.

---

## 9. Como adicionar novos testes

### Escolha o diretório correto

| Tipo de mudança | Diretório | Exemplo |
|----------------|-----------|---------|
| Novo módulo utilitário (função pura) | `tests/unit/` | `kc-utils-meu-helper.test.js` |
| Novo controller ou fluxo de integração | `tests/integration/` | `minha-pagina.controller.test.js` |
| Novo adapter (local ou Supabase) | `tests/integration/` | `local-meu.adapter.test.js` |
| Novo sub-módulo KCAPI | `tests/integration/` | `kc-api-meu-modulo.test.js` |
| Novo contrato de export público | `tests/contract/` | `meu-modulo-contract.test.js` |
| Nova estrutura HTML ou cadeia de scripts | `tests/structure/` | `meu-html-estrutura.test.js` |
| Nova marcação de acessibilidade | `tests/a11y/` | `minha-feature-a11y.test.js` |
| Novo fluxo de usuário no browser | `tests/e2e/` | `minha-pagina.spec.js` |

### Estrutura de uma suite Jest (padrão)

```javascript
// tests/unit/meu-modulo.test.js
'use strict';

const fs = require('fs');
const path = require('path');

// 1. Configurar globals necessários (simular browser)
global.window = {};
global.window.KC_CONSTANTS = require(path.join(__dirname, '../../assets/js/boot/kc-constants.js'));
// ... outras dependências que o módulo usa

// 2. Carregar o módulo sendo testado via eval
eval(fs.readFileSync(
  path.join(__dirname, '../../assets/js/utils/meu-modulo.js'),
  'utf8'
));

describe('MeuModulo', () => {
  // 3. Teste de contrato estático — OBRIGATÓRIO
  describe('contrato estático', () => {
    it('deve estar exposto em window.MeuModulo', () => {
      expect(window.MeuModulo).toBeDefined();
    });

    it('deve ser um objeto frozen', () => {
      expect(Object.isFrozen(window.MeuModulo)).toBe(true);
    });

    it('deve expor metodo1', () => {
      expect(typeof window.MeuModulo.metodo1).toBe('function');
    });
  });

  // 4. Testes de comportamento
  describe('metodo1', () => {
    it('deve processar entrada válida', () => {
      expect(window.MeuModulo.metodo1('entrada')).toBe('resultado esperado');
    });

    it('deve retornar fallback para entrada inválida', () => {
      expect(window.MeuModulo.metodo1(null)).toBe('');
    });
  });
});
```

### Estrutura de uma suite de contrato

```javascript
// tests/contract/meu-modulo-contract.test.js
'use strict';

describe('MeuModulo — Contrato Público', () => {
  it('window.MeuModulo deve ter os métodos do contrato', () => {
    // Trava a forma pública — falha se qualquer método for removido
    const EXPECTED_METHODS = ['metodo1', 'metodo2', 'metodo3'];
    EXPECTED_METHODS.forEach((method) => {
      expect(typeof window.MeuModulo[method]).toBe('function');
    });
  });
});
```

### Estrutura de uma suite de estrutura HTML

```javascript
// tests/structure/meu-html-estrutura.test.js
'use strict';

const fs = require('fs');
const path = require('path');

const HTML_FILES = [
  path.join(__dirname, '../../index.html'),
  path.join(__dirname, '../../_eventos.html'),
  // ... outros HTMLs relevantes
];

describe('Estrutura HTML — meu componente', () => {
  HTML_FILES.forEach((htmlPath) => {
    const fileName = path.basename(htmlPath);

    it(`${fileName} deve carregar meu-script.js`, () => {
      const content = fs.readFileSync(htmlPath, 'utf8');
      expect(content).toContain('assets/js/meu-grupo/meu-script.js');
    });

    it(`${fileName} deve ter meu-script.js após kc-utils.js`, () => {
      const content = fs.readFileSync(htmlPath, 'utf8');
      const posUtils = content.indexOf('kc-utils.js');
      const posMeu = content.indexOf('meu-script.js');
      expect(posUtils).toBeLessThan(posMeu);
    });
  });
});
```

### Adicionar ao `jest.config.js`

Cada nova suite deve ser listada em `jest.config.js` (se o projeto usar lista explícita de test files):

```javascript
// jest.config.js — adicionar na lista testMatch ou testPathPattern
// Se usa detecção automática por diretório, nenhuma mudança é necessária
module.exports = {
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
  ],
  // ...
};
```

---

## 10. Regras de manutenção

### Regra de ouro — nunca reduzir

```
npm test deve SEMPRE retornar:
  Test Suites: ≥171 passed, 171 total
  Tests:       ≥3545 passed, 3545 total
```

Qualquer commit que reduza esses números é inválido e deve ser corrigido antes de ser mergeado.

### Quando atualizar testes existentes

| Situação | Ação |
|----------|------|
| Método renomeado em KCAPI | Atualizar o teste de contrato correspondente E o teste de integração |
| Novo método adicionado a um módulo | Adicionar teste no describe existente do módulo |
| HTML recebe novo script | Atualizar `check-scripts.test.js` + suite de estrutura do HTML específico |
| Novo campo em `VERSION.json` | Atualizar `version-map.test.js` |
| Novo threshold de i18n | Atualizar `i18n-b2-gate.test.js` |
| Refactor interno sem mudança de contrato | Não alterar os testes de contrato — apenas verificar que passam |

### Como lidar com testes frágeis

Um teste frágil é aquele que falha por razões não relacionadas à lógica que está testando (ex: depende de data/hora atual, de número aleatório, de ordem de execução):

```javascript
// ❌ FRÁGIL — depende da data atual
it('deve formatar data corretamente', () => {
  expect(KCUtils.timeAgo(new Date())).toBe('agora mesmo');  // falha amanhã
});

// ✅ ROBUSTO — usa data fixada
it('deve formatar data corretamente', () => {
  const fixedDate = new Date('2026-01-01T12:00:00Z');
  const result = KCUtils.timeAgo(fixedDate, new Date('2026-01-01T12:00:30Z'));
  expect(result).toBe('agora mesmo');
});
```

**Regras para testes frágeis:**
1. Identificar a causa raiz (data, aleatoriedade, ordem, network)
2. Fixar o input — não usar valores dinâmicos em assertions
3. Nunca usar `it.skip` como solução permanente
4. Se o módulo em si for não-determinístico, o problema está no design do módulo

### Nomenclatura de novos arquivos de teste

```
tests/unit/         → nome-do-modulo.test.js
tests/integration/  → nome.responsabilidade.test.js
tests/contract/     → nome-do-modulo-contract.test.js
tests/structure/    → nome-descritivo-estrutura.test.js
tests/a11y/         → nome-feature-a11y.test.js
tests/e2e/          → nome-fluxo.spec.js   (Playwright usa .spec.js)
```
