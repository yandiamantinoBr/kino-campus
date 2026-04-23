# Kino Campus - v10.0.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `kinocampus-V11.0-foundations`  
**Status atual:** v11 concluída (v11.1.0–v11.33.7); v12 em execução (*Consolidação & Qualidade Sistêmica*) — `v12.5.0` concluída com a auditoria docs-only de `assets/js/controllers/profile.controller.js`: footprint real travado em **`1463L`** e **`56 497` bytes**, com `67` funcoes top-level (`14` async), `1` HTML consumidor direto (`profile.html`), `1` export publico (`window.KCProfileRefresh`) e boundary compartilhado previo em `assets/js/account-profile.shared.js` (`962L`, `45` funcoes); o roadmap foi recalibrado para `window._KCPR.presentation`, `window._KCPR.collections`, `window._KCPR.ratings`, `window._KCPR.flow` e gate `v12.5.5`; nenhuma mudanca funcional em runtime e baseline preservada em **116/116 suites · 2428/2428 testes**; proxima iteracao: `v12.5.1` (split `window._KCPR.presentation`).

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel |
| Domínio | `kinocampus.com.br` |
| Build | `node scripts/inject-env.js` |
| Testes | Jest: 116 suites de regressão e contrato |

---

## Entregas Recentes

| Fase | Entrega | PRs |
|------|---------|-----|
| v12.5.0 | **auditoria docs-only de `assets/js/controllers/profile.controller.js`**: criado `docs/profile-controller-audit-v12.5.md` com footprint real do hotspot (`1463L`, `56 497` bytes, `67` funcoes top-level, `14` async, `1` HTML consumidor direto, `1` export publico `window.KCProfileRefresh`), boundary previo em `assets/js/account-profile.shared.js` (`962L`, `45` funcoes, `10` testes) e sequencia recomendada recalibrada para `v12.5.1`-`v12.5.5` com `window._KCPR.presentation`, `collections`, `ratings`, `flow` e gate `<600L`; zero mudanca funcional em runtime e baseline preservada em **116/116 suites · 2428/2428 testes** | — |
| v12.4.8 | **gate formal de `local.adapter.js` `<500L` + hygiene `_KCLA.*`**: `assets/js/adapters/local.adapter.js` reduzido de `697L` → `473L` (`-224L`, `21 898` bytes) via refactor do residual de bootstrap/delegação, preservando o registro do `driverLocal` e os contratos do adapter; `scripts/hygiene-check.js` passou a validar a cadeia canônica `local.notifications -> local.ratings -> local.saved -> local.posts-read -> local.posts-write -> local.profile -> local.help` nos `22` HTMLs públicos/admin e a falhar se `local.adapter.js` voltar a `>=500L`; zero novos HTMLs ou suites editados nesta rodada e baseline preservada em **116/116 suites · 2428/2428 testes** | — |
| v12.4.7 | **split `window._KCLA.help`**: novo `assets/js/adapters/local.help.adapter.js` com IIFE + `Object.freeze({...})` concentrando 3 exports do domínio help/admin (`createHelpRequest`, `listAdminHelpRequests`, `updateAdminHelpRequest`); `assets/js/adapters/local.adapter.js` reduzido de `850L` → `697L` (`-153L`) com wrappers finos, `getLocalHelpModule()`, `buildLocalHelpDeps()` e fallback paginado para admin; `22` HTMLs + `9` arquivos de teste existentes sincronizados com a cadeia local de sub-adapters; nova suíte `tests/local-help.adapter.test.js` (20 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **116/116 suites · 2428/2428 testes** | — |
| v12.4.6 | **split `window._KCLA.profile`**: novo `assets/js/adapters/local.profile.adapter.js` com IIFE + `Object.freeze({...})` concentrando 4 exports do domínio profile/avatar (`readProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar`); `assets/js/adapters/local.adapter.js` reduzido de `1031L` → `850L` (`-181L`) com wrappers finos, `getLocalProfileModule()`, `buildLocalProfileDeps()` e `readLocalProfileSnapshot()`; `22` HTMLs + `8` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-profile.adapter.test.js` (25 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **115/115 suites · 2408/2408 testes** | — |
| v12.4.5 | **split `window._KCLA.postsWrite`**: novo `assets/js/adapters/local.posts-write.adapter.js` com IIFE + `Object.freeze({...})` concentrando 7 exports do domínio posts write/drafts (`createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost`); `assets/js/adapters/local.adapter.js` reduzido de `1119L` → `1031L` (`-88L`) com wrappers finos, `getLocalPostsWriteModule()` e `buildLocalPostsWriteDeps()`; `22` HTMLs + `7` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-posts-write.adapter.test.js` (24 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **114/114 suites · 2383/2383 testes** | — |
| v12.4.4 | **split `window._KCLA.postsRead`**: novo `assets/js/adapters/local.posts-read.adapter.js` com IIFE + `Object.freeze({...})` concentrando 8 exports do domínio posts read/feed/related + ranking (`getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getMyPosts`, `getPostsByAuthorId`, `getRelatedPosts`, `getTopContributors`); `assets/js/adapters/local.adapter.js` reduzido de `1480L` → `1119L` (`-361L`) com wrappers finos, `getLocalPostsReadModule()` e `buildLocalPostsReadDeps()`; `22` HTMLs + `6` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-posts-read.adapter.test.js` (22 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **113/113 suites · 2359/2359 testes** | — |
| v12.4.3 | **split `window._KCLA.saved`**: novo `assets/js/adapters/local.saved.adapter.js` com IIFE + `Object.freeze({...})` concentrando 7 exports do domínio saved/highlights (`getSavedPostState`, `setSavedPostState`, `clearSavedPostState`, `getMySavedPosts`, `getMySavedPostsCount`, `getProfileHighlights`, `getProfileHighlightsCount`); `assets/js/adapters/local.adapter.js` reduzido de `1570L` → `1480L` (`-90L`) com wrappers finos e `buildLocalSavedDeps()`; `22` HTMLs + `5` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-saved.adapter.test.js` (22 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **112/112 suites · 2337/2337 testes** | — |
| v12.4.2 | **split `window._KCLA.ratings`**: novo `assets/js/adapters/local.ratings.adapter.js` com IIFE + `Object.freeze({...})` concentrando 6 exports do domínio ratings (`enrichPostWithRatings`, `enrichPostsWithRatings`, `getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`); `assets/js/adapters/local.adapter.js` reduzido de `1780L` → `1570L` (`-210L`) com wrappers finos e `buildLocalRatingsDeps()`; `22` HTMLs + `4` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-ratings.adapter.test.js` (23 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **111/111 suites · 2315/2315 testes** | — |
| v12.4.1 | **split `window._KCLA.notifications`**: novo `assets/js/adapters/local.notifications.adapter.js` com IIFE + `Object.freeze({...})` concentrando 14 exports do domínio notifications/private targets/invites (`getNotificationPreferences`, `updateNotificationPreferences`, `getNotificationChannelTargets`, `updateNotificationChannelTargets`, `getNotifications`, `markNotificationsRead`, `markAllNotificationsRead`, `clearNotifications`, `getUnreadNotificationCount`, `subscribeNotifications`, `unsubscribeNotifications`, `inviteExternalUser`, `getInvites`, `revokeInvite`); `assets/js/adapters/local.adapter.js` reduzido de `1862L` → `1780L` (`-82L`) com wrappers finos para `_KCLA.notifications`; `22` HTMLs + `3` suites diretas atualizados para a nova ordem de scripts; nova suíte `tests/local-notifications.adapter.test.js` (22 testes) e `jest.config.js` sincronizado para cobertura do submódulo; baseline expandida para **110/110 suites · 2292/2292 testes** | — |
| v12.4.0 | **auditoria docs-only de `local.adapter.js`**: criado `docs/local-adapter-audit-v12.4.md` com footprint real do driver local (`1862L`, `75 712` bytes, `100` funções top-level, `47` async, `57` chaves no objeto `driverLocal`, `22` HTMLs consumidores diretos, `1` suíte direta + `5` indiretas / `114` testes mapeados), mapa por 7 grupos naturais (notifications/targets/invites, ratings, saved/highlights, posts read/feed/related + ranking, posts write/drafts, profile, help/admin), leitura do boundary residual (fallback/glue/registry) e sequência recomendada recalibrada para `v12.4.1`–`v12.4.8` com `window._KCLA.notifications`, `ratings`, `saved`, `postsRead`, `postsWrite`, `profile`, `help` e gate final `<500L`; zero mudança funcional em runtime; baseline preservada em **109/109 suites · 2270/2270 testes** | — |
| v12.3.4 | **gate formal do dashboard admin `<900L` + hygiene `_KCAD.*`**: `scripts/hygiene-check.js` passou a validar a cadeia exata de `<script defer src="...admin-dashboard*.js">` em `admin/index.html` na ordem `shared → metrics → audit → charts → kc-ranking → controller`, falhando por item faltando, duplicado, extra ou fora de ordem; `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` sincronizados para formalizar o marco estrutural já atingido, corrigindo o drift documental da `v12.3.3` e registrando os valores medidos de `admin-dashboard.controller.js` (**835L**, `32 802` bytes) e `admin-dashboard.charts.js` (**642L**, `27 895` bytes); zero mudança funcional em runtime, zero HTML editado nesta rodada; baseline preservada em **109/109 suites · 2270/2270 testes** | — |
| v12.3.3 | **split `window._KCAD.charts`**: novo `assets/js/controllers/admin-dashboard.charts.js` com IIFE + 10 exports cobrindo tendências de busca, resumo diário, renderização SVG do pulso, modal expandido do gráfico, tabela de share por módulo, alertas operacionais e ranking admin (`aggregateTrendsByModule`, `renderSearchTrends`, `renderDailyActivitySummary`, `bindDailyActivityChartModal`, `renderDailyActivityChart`, `renderModuleShareTable`, `renderOperationalAlerts`, `mapPeriodToRanking`, `loadAdminRanking`, `bindAdminRanking`); `admin-dashboard.controller.js` reduzido de `1172L` → `835L` (−337L) com `buildChartsDeps()` e wrappers finos para `_KCAD.charts`; `admin/index.html` atualizado para a ordem `shared → metrics → audit → charts → kc-ranking → controller`; nova suíte direta `tests/admin-dashboard.charts.test.js` (22 testes: contrato estático, script order, wrappers, tendências, chart modal e ranking), além do ajuste das suítes `tests/admin-dashboard.metrics.test.js` e `tests/admin-dashboard.audit.test.js`; baseline expandida para **109/109 suites · 2270/2270 testes** | — |
| v12.3.2 | **split `window._KCAD.audit`**: novo `assets/js/controllers/admin-dashboard.audit.js` com IIFE + 9 exports cobrindo audit log, cache/lookup de atores, paginação incremental, filtro por ação, carregamento sob demanda das libs de exportação e geração de XLSX/PDF (`loadActorsById`, `getActorDisplay`, `loadAuditLog`, `renderAuditRows`, `loadMoreAudit`, `filterAudit`, `enableExport`, `exportXLSX`, `exportPDF`); `admin-dashboard.controller.js` reduzido de `1859L` → `1172L` (−687L) com builders explícitos de dependência/estado e wrappers finos para `_KCAD.audit`; `admin/index.html` atualizado para a ordem `shared → metrics → audit → kc-ranking → controller`; nova suíte direta `tests/admin-dashboard.audit.test.js` (18 testes: contrato estático, script order, audit log, exportação XLSX/PDF e bindings), além do ajuste da suíte `tests/admin-dashboard.metrics.test.js`; baseline expandida para **108/108 suites · 2248/2248 testes** | — |
| v12.3.1 | **split `window._KCAD.metrics`**: novo `assets/js/controllers/admin-dashboard.metrics.js` com IIFE + 17 exports cobrindo gate de acesso admin (`checkAccess`), classificação de tendências (`classifyTermToModule`) e 15 loaders/fetchers (`loadReportMetrics`, `loadPostStatusMetrics`, `loadPostsCreated`, `loadPostsEdited`, `loadCommentsCount`, `loadSearchCount`, `loadPostsTotal`, `loadUsersTotal`, `loadUsersNew`, `loadVotesCount`, `loadSavedPostsCount`, `loadAuditEventRows`, `loadSearchTrendsData`, `queryCreatedAtRows`, `loadDailyMetrics`); `admin-dashboard.controller.js` reduzido de `2251L` → `1859L` (−392L) com delegação fina para `_KCAD.metrics` e reaproveitamento de `KCAdminDashboardUtils` para eliminar o drift de `classifyTermToModule`/`SERIES_KEYS`; `admin/index.html` atualizado com o novo script na ordem `shared → metrics → kc-ranking → controller`; nova suíte direta `tests/admin-dashboard.metrics.test.js` (18 testes: contrato estático, script order e comportamento com mocks de KCAPI/Supabase); baseline expandida para **107/107 suites · 2230/2230 testes** | — |
| v12.3.0 | **auditoria docs-only de `admin-dashboard.controller.js`**: criado `docs/admin-dashboard-audit-v12.3.md` com footprint real do hotspot admin (`2034L`, `93 641` bytes, `104` funções top-level, `29` async), boundary já modularizado em `admin-dashboard.shared.js` (`382L`, 14 exports, 1 suite com 4 testes), mapa por 6 grupos naturais (core/access/refresh, loaders Supabase, trends/charts/renderers, audit log, exportação XLSX/PDF, ranking), inventário dos contratos externos (`KCSupabase`, `KCAPI`, `KCAdminShell`, `KCPullToRefresh`, `KCUtils.escapeHtml`, `KC_CONSTANTS`, `XLSX`, `jspdf`, `KCRanking`), lacuna de cobertura direta do controller e plano recomendado para `v12.3.1`–`v12.3.4` com `window._KCAD.metrics`, `window._KCAD.audit` e `window._KCAD.charts`; zero mudança funcional em runtime; baseline preservada em **106/106 suites · 2212/2212 testes** | — |
| v12.2.7 | **gate formal `<900L` de `kc-utils.js` + hygiene `_KCU.*`**: `scripts/hygiene-check.js` passou a validar, nos 22 HTMLs canônicos (17 raiz + 5 admin), a ordem exata de `<script defer src="...kc-utils*.js"></script>`: `string → format → dom → identity → taxonomy → location → presentation → kc-utils.js`, com prefixos corretos por superfície; a checagem agora falha em caso de item faltando, duplicado, extra ou fora de ordem, mostrando `expected` vs `found` por arquivo; `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` atualizados para formalizar o marco estrutural já atingido (`kc-utils.js` em `440L`, abaixo do gate `<900L`); zero mudança funcional em runtime, zero HTML editado nesta rodada; baseline preservada em **106/106 suites · 2212/2212 testes** | — |
| v12.2.6 | **split `window._KCU.presentation`**: novo `assets/js/kc-utils.presentation.js` com IIFE + 9 funções extraídas de `kc-utils.js` (`cssEscape`, `inferCaronasRoute`, `inferAchadosLocation`, `inferOportunidadesSubcategory`, `inferEventosCategory`, `applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags`, `renderPostCard`); dependências cross-domain resolvidas via lazy accessors para `_KCU.string`, `_KCU.format`, `_KCU.taxonomy` e `_KCU.location`; `kc-utils.js` reduzido de 1168L → 440L (−728L); acumulado 2445L → 440L (−2005L), com gate `<900L` já atingido; 22 HTMLs atualizados; 12 suites existentes atualizadas; nova suite `tests/kc-utils-presentation.test.js` (27 testes); baseline expandida para **106/106 suites · 2212/2212 testes** | — |
| v12.2.5 | **split `window._KCU.location`**: novo `assets/js/kc-utils.location.js` com IIFE + 32 funções extraídas de `kc-utils.js` (moradia/região, moradia/features, caronas, achados-e-perdidos: `resolveHousingRegion`, `resolveCaronasLocation`, `resolveLostFoundLocation`, `resolveHousingFeatures`, `resolveHousingTypeKey`, `resolveHousingTypeFromCandidates` e 26 helpers); acesso lazy a `_KCU.string` via `_str()` e a `KC_CONSTANTS` via `_const()`; `firstNonEmptyValue` duplicado localmente para evitar dependência cruzada com `_KCU.taxonomy`; bloco `KC_CONSTANTS` removido de `kc-utils.js`; `kc-utils.js` reduzido de 1950L → 1168L (−782L); acumulado 2445L → 1168L (−1277L); 22 HTMLs atualizados; 12 suites existentes atualizadas; nova suite `tests/kc-utils-location.test.js` (101 testes); baseline expandida para **105/105 suites · 2185/2185 testes** | — |
| v12.2.4 | **split `window._KCU.taxonomy`**: novo `assets/js/kc-utils.taxonomy.js` com IIFE + 22 funções extraídas de `kc-utils.js` (rótulos de módulo/categoria/subcategoria + pipeline completo de resolução de área de oportunidade: `resolveOpportunityArea`, `findBestOfficialOpportunityArea`, `findBestFuzzyOpportunityArea`, `findBestOfficialContextArea` etc.); acesso lazy a KC_CONSTANTS via `_const()` e a `_KCU.string` via `_str()`; destructuring de KC_CONSTANTS em `kc-utils.js` reduzido de 8 → 3 constantes; `kc-utils.js` reduzido de 2231L → 1950L (−281L); acumulado 2445L → 1950L (−495L); 22 HTMLs atualizados; 12 suites existentes atualizadas; nova suite `tests/kc-utils-taxonomy.test.js` (78 testes: contrato + 22 funções); baseline expandida para **104/104 suites · 2084/2084 testes** | — |
| v12.2.3 | **split `window._KCU.identity`**: novo `assets/js/kc-utils.identity.js` (~85L) com IIFE + 5 funções extraídas de `kc-utils.js` (`normalizeEmail`, `getEmailDomain`, `normalizeAllowedDomains`, `isInstitutionalEmailAllowed`, `buildPublicHandle`); `buildPublicHandle` acessa `_KCU.string.slugifyText` via lazy `_str()`; `kc-utils.js` reduzido de 2242L → 2231L (−11L); 22 HTMLs atualizados; nova suite `tests/kc-utils-identity.test.js` (29 testes: contrato + gate institucional UFG + handle); baseline expandida para **103/103 suites · 2006/2006 testes** | — |
| v12.2.2 | **split `window._KCU.dom`**: novo `assets/js/kc-utils.dom.js` (~110L) com IIFE + 4 funções extraídas de `kc-utils.js` (`debounce`, `canSelectInputLike`, `fallbackCopyText`, `copyTextToClipboard`); módulo autossuficiente (sem dependências externas); dependências internas (`fallbackCopyText → canSelectInputLike`, `copyTextToClipboard → fallbackCopyText`) resolvidas no escopo do IIFE; `kc-utils.js` reduzido de 2310L → 2242L (−68L); acumulado 2445L → 2242L (−203L); 22 HTMLs atualizados; nova suite `tests/kc-utils-dom.test.js` (23 testes); baseline expandida para **102/102 suites · 1977/1977 testes** | — |
| v12.2.1 | **split `window._KCU.format`**: novo `assets/js/kc-utils.format.js` (151L) com IIFE + 7 funções extraídas de `kc-utils.js` (`timeAgo`, `formatCurrencyBRL`, `parseBRLNumber`, `clamp`, `buildProductDetailHref`, `getConditionLabel`, `splitPriceText`); dependência cross-domain de `getConditionLabel` em `_KCU.string` resolvida via accessor lazy `_str()`; `kc-utils.js` reduzido de 2380L → 2310L (−70L); 22 HTMLs com `<script>` do sub-módulo entre `kc-utils.string.js` e `kc-utils.js`; 12 arquivos de teste existentes atualizados; nova suite `tests/kc-utils-format.test.js` (51 testes: contrato estático + 7 funções); baseline expandida para **101/101 suites · 1954/1954 testes** | — |
| v12.2.0 | **split `window._KCU.string`**: novo `assets/js/kc-utils.string.js` (133L) com IIFE + 8 funções extraídas de `kc-utils.js` (`titleCase`, `beautifyKey`, `normalizeText`, `canonicalCategory`, `slugifyText`, `levenshteinDistance`, `escapeHtml`, `renderMarkdownInline`); `kc-utils.js` reduzido de 2445L → 2380L (−65L) como thin wrapper; 22 HTMLs com `<script>` do sub-módulo antes de `kc-utils.js`; 10 suites de teste existentes atualizadas com require do sub-módulo; nova suite `tests/kc-utils-string.test.js` (29 testes: contrato estático + 8 funções); baseline expandida para **100/100 suites · 1903/1903 testes** | — |
| v12.1.0 | **auditoria doc-only de `kc-utils.js`**: novo `docs/kc-utils-audit-v12.1.md` (~450L) com footprint real medido (2 445L · ~100 KB · ~95 funções · 42 públicas via `window.KCUtils` frozen · dependência única de `window.KC_CONSTANTS`), mapa por 7 domínios lógicos (string, format, dom, identity, taxonomy, location, presentation) com linhas exatas e visibilidade pública/privada, análise de consumers (30 arquivos JS · 136+ callsites · 22 HTMLs · 3 arquivos de teste totalizando 1 106L), plano de decomposição expandido de 5 para **7 splits** (`v12.2.0`–`v12.2.6`) + gate `v12.2.7` refletindo o footprint real medido, grafo de dependências entre sub-módulos `_KCU.*` com ordem obrigatória no HTML, matriz de risco por domínio com destaque para `presentation` (~600L, `applyPresentationRules` 313L + `renderPostCard` 279L); `RELATORIO-KINOCAMPUS-V12.md` §5.1 expandida e §8.1 adicionada; `CHANGELOG.md` atualizado; zero mudança JS/HTML/teste; baseline preservada em `99/99` suites e `1874/1874` testes | `#394` |
| v12.0.0 | **abertura docs-only do ciclo v12 — *Consolidação & Qualidade Sistêmica***: novo `RELATORIO-KINOCAMPUS-V12.md` mirrando a estrutura do V11 (tabela de cabeçalho, resumo executivo, fontes obrigatórias, inventário atual, premissas operacionais, roadmap em 3 camadas — A/continuação tática de splits IIFE, B/qualidade sistêmica com feature flags + E2E + Lighthouse + a11y + i18n, C/resiliência com Service Worker + telemetria); `README.md` atualizado com nova seção "Planejamento v12" e linha de status v12.0.0; `CHANGELOG.md` recebe entrada `[12.0.0-planning] - 2026-04-20`; zero mudança JS/HTML/teste; baseline preservada em `99/99` suites e `1874/1874` testes | `#393` |
| v11.33.7 | gate formal da trilha `v11.33.x`: todos os 6 domínios residuais extraídos do facade `window.KCAPI`; `kc-api.client.js` reduzido de `2536L` para `2410L`; 11 sub-módulos `window._KCAPI.*` operacionais (acumulando as trilhas `v11.32.x` + `v11.33.x`); baseline verde em `99/99` suites e `1874/1874` testes; hygiene `8.6.0` ✓ | `#392` |
| v11.33.6 | sexto split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.auth.js` registrado em `window._KCAPI.auth`, concentrando 8 métodos do domínio auth (`getCurrentUser`, `signIn`, `signUp`, `resendConfirmation`, `requestPasswordReset`, `updatePassword`, `login`, `logout`); 7 wrappers `supabase*()` (~80L) + implementações públicas (~45L) removidos do facade; `window.KCSupabase` acessado diretamente como global (padrão `kc-api.profiles.js`); deps `{ ENV }`; facade delega via `getAuthModule()`/`buildAuthDeps()`; 22 HTMLs: `related.js → auth.js → client.js`; 20 novos testes; baseline `99/99` suites · `1874/1874` testes | `#391` |
| v11.33.5 | quinto split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.related.js` registrado em `window._KCAPI.related`, concentrando `getRelatedPosts` e `rankRelatedPosts` com algoritmo de scoring puro (~190L de helpers movidos); `getNormalizedPostValue` internalizado no sub-módulo; `normalizePost` recebida via deps; ~200L removidas do facade; 22 HTMLs: `profiles.js → related.js → client.js`; 16 novos testes; baseline `98/98` suites · `1854/1854` testes | `#390` |
| v11.33.4 | quarto split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.profiles.js` registrado em `window._KCAPI.profiles`, concentrando 6 métodos do domínio profiles (`getCurrentProfile`, `getProfileById`, `syncProfile`, `getMyProfile`, `updateMyProfile`, `uploadProfileAvatar`); `getProfileById` com fallback em dois níveis (Supabase → mock legado via `deps.getAuthorById`); guards `getEnvDriver !== 'supabase'`; deps `{ getActiveDriver, ENV, getAuthorById }`; 22 HTMLs: `posts-write.js → profiles.js → client.js`; 19 novos testes; baseline `97/97` suites · `1837/1837` testes | `#389` |
| v11.33.3 | terceiro split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.posts-write.js` registrado em `window._KCAPI.postsWrite`, concentrando 7 métodos de escrita (`createPost`, `updatePost`, `deletePost`, `reportPost`, `togglePostStatus`, `renewPost`, `bumpPost`); `enforceSupabaseOnProduction` e `kcApiError` reimplementados localmente; globals de diagnóstico (`lastCreatePostError`, `setLastCreatePostError`, etc.) preservados no facade; deps `{ getActiveDriver, ENV }`; 22 HTMLs: `posts-feed.js → posts-write.js → client.js`; 22 novos testes; baseline `96/96` suites · `1818/1818` testes | `#388` |
| v11.33.2 | segundo split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.posts-feed.js` registrado em `window._KCAPI.postsFeed`, concentrando 8 métodos de leitura de feed (`getPosts`, `searchPosts`, `getFeedCursor`, `getPostById`, `getTopContributors`, `checkDuplicatePost`, `getMyPosts`, `getPostsByAuthorId`); fallback `driver.getPosts` quando driver sem `searchPosts`; deps `{ getActiveDriver, ENV }`; 22 HTMLs: `ratings.js → posts-feed.js → client.js`; 23 novos testes; baseline `95/95` suites · `1796/1796` testes | `#387` |
| v11.33.1 | primeiro split da trilha `v11.33.x`: novo IIFE `assets/js/kc-api.ratings.js` registrado em `window._KCAPI.ratings`, concentrando 4 métodos do domínio ratings (`getUserRatingSummary`, `getUserRatingState`, `listUserRatings`, `upsertUserRating`) e inline fallback dos 4 normalizers; deps `{ getActiveDriver, normalizeUserRatingSummary, normalizeUserRatingEntry, normalizeUserRatingState, normalizeUserRatingList }`; 22 HTMLs: `comments-votes.js → ratings.js → client.js`; 19 novos testes; baseline `94/94` suites · `1773/1773` testes | `#386` |
| v11.33.0 | abertura formal da trilha `v11.33.x` — split dos domínios residuais do facade `window.KCAPI`: auditoria dedicada em `docs/kc-api-client-audit-v11.33.md` mapeando 6 domínios remanescentes (`ratings`, `posts-read-feed`, `posts-write`, `profiles`, `related`, `auth`), 35 métodos públicos + ~25 helpers/wrappers, ~650 linhas estimadas, tabela de risco por domínio e sequência recomendada `v11.33.1`–`v11.33.7`; baseline mantido em `93/93` suites e `1754/1754` testes | `#385` |
| v11.32.7 | release gate formal da trilha `v11.32.x`: regressão verde (`93/93` suites · `1754/1754` testes), hygiene `8.6.0` ✓, smoke HTTP `200` em todos os sub-módulos e assets críticos, artefato `docs/qa/report-v11.32.7-run1.md` registrando o estado final de `kc-api.client.js` e os domínios candidatos a trilhas futuras | `#384` |
| v11.32.6 | quinto split por domínio da trilha `KCAPI`: novo IIFE `assets/js/kc-api.comments-votes.js` registrado em `window._KCAPI.commentsVotes`, concentrando 8 métodos do grupo comments/votes (`getCachedComments`, `invalidateCommentsCache`, `refreshComments`, `getComments`, `addComment`, `likeComment`, `votePost`, `getMyVote`); estado SWR de comments (`_pendingProductCommentsRequests`, TTL constants) auto-contido no submódulo; `assets/js/kc-api.client.js` ganha `getCommentsVotesModule()` + `buildCommentsVotesDeps()` e delega os 8 métodos com fallback canônico; dead code removido do facade (constantes e helpers de analytics/comments já movidos para sub-módulos v11.32.5/v11.32.6); `22` HTMLs carregam o novo asset entre `kc-api.posts-read.js` e `kc-api.client.js`; nova suíte `tests/kc-api-comments-votes-module.test.js` (20 testes) e realinhamento do contrato em `tests/kc-api-facade-contract.test.js`; 6 test bootstraps atualizados; baseline sobe para `93/93` suites e `1754/1754` testes | `#382` |
| v11.32.5 | quarto split por domínio da trilha `KCAPI`: novo IIFE `assets/js/kc-api.posts-read.js` registrado em `window._KCAPI.postsRead`, concentrando 7 métodos do grupo posts-read/analytics (`trackCouponClick`, `trackShare`, `trackView`, `getCachedPostAnalytics`, `invalidatePostAnalyticsCache`, `refreshPostAnalytics`, `getPostAnalytics`); estado SWR de analytics (`_pendingProductAnalyticsRequests`, constantes de TTL) auto-contido no submódulo; `assets/js/kc-api.client.js` ganha `getPostsReadModule()` + `buildPostsReadDeps()` e delega os 7 métodos com fallback canônico; `22` HTMLs carregam o novo asset entre `kc-api.help.js` e `kc-api.client.js`; nova suíte `tests/kc-api-posts-read-module.test.js` (20 testes) e realinhamento do contrato em `tests/kc-api-facade-contract.test.js`; 6 test bootstraps atualizados; baseline sobe para `92/92` suites e `1731/1731` testes | `#380` |
| v11.32.4 | terceiro split por domínio da trilha `KCAPI`: novo IIFE `assets/js/kc-api.help.js` registrado em `window._KCAPI.help`, concentrando 6 métodos do grupo help-requests/invites (`createHelpRequest`, `listAdminHelpRequests`, `updateAdminHelpRequest`, `inviteExternalUser`, `getInvites`, `revokeInvite`); `assets/js/kc-api.client.js` ganha `getHelpModule()` (espelha `getNotificationsModule()`) e delega os 6 métodos com fallback canônico; `22` HTMLs carregam o novo asset entre `kc-api.saved.js` e `kc-api.client.js`; nova suíte `tests/kc-api-help-module.test.js` (8 testes) e realinhamento do contrato em `tests/kc-api-facade-contract.test.js`; 6 test bootstraps atualizados; baseline sobe para `91/91` suites e `1711/1711` testes | `#378` |
| v11.32.3 | segundo split por domínio da trilha `KCAPI`: novo IIFE `assets/js/kc-api.saved.js` registrado em `window._KCAPI.saved`, concentrando 7 métodos do grupo saved/highlights (`getSavedPostState`, `setSavedPostState`, `clearSavedPostState`, `getMySavedPosts`, `getMySavedPostsCount`, `getProfileHighlights`, `getProfileHighlightsCount`); `assets/js/kc-api.client.js` ganha `getSavedModule()` (espelha `getNotificationsModule()`) e delega os 7 métodos com fallback canônico preservando `ENV.driver !== 'supabase'` e invalidação de analytics após mutações; `22` HTMLs carregam o novo asset antes do facade; nova suíte `tests/kc-api-saved-module.test.js` (9 testes) e realinhamento do contrato em `tests/kc-api-facade-contract.test.js`; 6 test bootstraps que carregam o facade atualizados para carregar também o novo submódulo; baseline sobe para `90/90` suites e `1703/1703` testes | `#376` |
| v11.32.2 | primeiro split por domínio da trilha `KCAPI`: novo IIFE `assets/js/kc-api.notifications.js` registrado em `window._KCAPI.notifications`, centralizando preferencias, targets privados, leitura/mark-read/clear, contador unread e subscribe/unsubscribe; `assets/js/kc-api.client.js` passa a delegar todo o domínio `notifications` com guards defensivos e fallbacks preservados; `22` HTMLs carregam o novo asset antes do facade; nova suíte `tests/kc-api-notifications-module.test.js` (11 testes) e realinhamento do contrato em `tests/kc-api-facade-contract.test.js`; baseline sobe para `89/89` suites e `1694/1694` testes | `#374` |
| v11.32.1 | congelamento do contrato público de `window.KCAPI` antes do primeiro split da trilha: nova suíte estática `tests/kc-api-facade-contract.test.js` (16 testes) travando shape IIFE/facade, registry de adapters, getter `activeDriver`, export dos domínios públicos, fallbacks de driver/indisponibilidade, hooks críticos de cache/SWR e globals de diagnóstico; `assets/js/kc-api.client.js` permanece sem mudança de runtime nesta fase; baseline sobe para `88/88` suites e `1688/1688` testes | `#372` |
| v11.32.0 | abertura formal da nova trilha de hotspot em `assets/js/kc-api.client.js`: auditoria dedicada em `docs/kc-api-client-audit-v11.32.md` com footprint real (`2520L`, `105563` bytes, `100` membros exportados, `91` callable), mapa dos domínios internos, consumers críticos e sequência recomendada `v11.32.1`–`v11.32.7`; formalização do gate operacional mínimo em `docs/qa/operational-smoke-gate-v11.32.md` sem adicionar nova stack E2E ao repo; correção do drift documental do estado/progresso pós-`v11.31.7` e hardening pontual do teste estático `kc-create-post-render.test.js` para remover a fragilidade do `slice(...)` no bloco de namespace | `#370` |
| v11.31.7 | sexta (e última) extração estrutural de `assets/js/kc-create-post.js`: 6 funções de render/modal (`_kcFormatDescriptionField`, `_kcUpdateDescPreview`, `kcCreateSustainSectionHtml`, `kcCreateVisibilitySectionHtml`, `kcEnsureCreateModal`, `kcRenderCreateModal`) movidas para o novo IIFE `assets/js/kc-create-post.render.js` via `window._KCCreatePost.render`; lazy accessors `_getModalId()`, `_getModules()`, `_getVisibilityOptions()` desacoplam render module das `const` locais do core; `_getState()` usado em cada handler de evento para acesso seguro ao estado compartilhado; stubs `_kcRenderModule()` no core; nova suíte `tests/kc-create-post-render.test.js` (87 testes); `kc-create-post.js` reduzido de `1260L` para `648L` (meta <700L ✓); `12` HTMLs carregam o novo asset; baseline sobe para `87/87` suites e `1672/1672` testes | `#369` |
| v11.31.6 | quinta extração estrutural de `assets/js/kc-create-post.js`: `kcHandleCreateSubmit` (pipeline completo de submit/edição — 707L) movido para o novo IIFE `assets/js/kc-create-post.submit.js` via `window._KCCreatePost.submit`; acesso a `kcCreateState` via `_getState()`; todos os globals de API e resolvers acessados diretamente do scope do browser; stubs `_kcSubmitModule()` + delegação lazy async no core; `tests/kc-create-post-contract.test.js` e `tests/kc-create-post-active-fields.test.js` atualizados para verificar contratos no sub-módulo; nova suíte `tests/kc-create-post-submit.test.js` (68 testes); `kc-create-post.js` reduzido de `1959L` para `1260L` (−699L); `12` HTMLs carregam o novo asset; baseline sobe para `86/86` suites e `1598/1598` testes | `#368` |
| v11.31.5 | quarta extração estrutural de `assets/js/kc-create-post.js`: `kcBuildFieldsForModule` (geração de campos dos 6 módulos — 163L) movida para o novo IIFE `assets/js/kc-create-post.fields.js` via `window._KCCreatePost.fields`; acesso defensivo a `window._KCCreatePost.resolvers` via `_getResolvers()` com fallbacks `[]`; stub `_kcFieldsModule()` + delegação lazy no core; `tests/kc-create-post-active-fields.test.js` atualizado para carregar o sub-módulo via eval; nova suíte `tests/kc-create-post-fields.test.js` (71 testes); `kc-create-post.js` reduzido de `2113L` para `1959L` (−154L); `12` HTMLs carregam o novo asset; baseline sobe para `85/85` suites e `1530/1530` testes | `#367` |
| v11.31.4 | terceira extração estrutural de `assets/js/kc-create-post.js`: 25 resolvers e normalizadores de domínio (oportunidades, moradia, caronas, achados/perdidos) movidos para o novo IIFE `assets/js/kc-create-post.resolvers.js` via `window._KCCreatePost.resolvers`; 3 funções de sync DOM acessam estado via `_getState()`; stubs de delegação com fallbacks seguros mantêm nomes de função originais intactos; nova suíte `tests/kc-create-post-resolvers.test.js` (81 testes); `kc-create-post.js` reduzido de `2342L` para `2113L` (−229L); `12` HTMLs carregam o novo asset; baseline sobe para `84/84` suites e `1459/1459` testes | `#365` |
| v11.31.3 | segunda extração estrutural de `assets/js/kc-create-post.js`: grupo de mídia/imagens (leitura, compressão canvas, gerenciamento de capa, ordenação e HTML da seção) movido para o novo IIFE `assets/js/kc-create-post.media.js` via `window._KCCreatePost.media`; core expõe estado compartilhado em `window._KCCreatePost._state` (referência por objeto); stubs de delegação mantêm nomes de função originais intactos; nova suíte `tests/kc-create-post-media.test.js` (43 testes); `kc-create-post.js` reduzido de `2239L` para `~2095L` (−144L); `12` HTMLs carregam o novo asset após o core; baseline sobe para `83/83` suites e `1378/1378` testes | `#363` |
| v11.31.2 | primeira extração estrutural de `assets/js/kc-create-post.js`: `KC_CREATE_MODAL_ID`, `KC_POST_VISIBILITY_OPTIONS` e `KC_CREATE_SCHEMA` movidos para o novo asset `assets/js/kc-create-post.schema.js`, carregado antes do runtime em `12` HTMLs; `kc-create-post.js` passa a consumir `window._KCCreatePost.schema` com fallback defensivo e guard de indisponibilidade; nova suíte `tests/kc-create-post-schema.test.js` (16 testes) e realinhamento do contrato do hotspot e da regressão de `Ingressos`; baseline sobe para `82/82` suites e `1335/1335` testes | `#361` |
| v11.31.1 | suíte estática ampliada para `assets/js/kc-create-post.js`: novo arquivo `tests/kc-create-post-contract.test.js` com 17 testes cobrindo shape global atual, exports públicos, schema dos 6 módulos, modal bootstrap, render dinâmico, submit pipeline, side channels `window.__KC_*` e wiring de `DOMContentLoaded`; baseline sobe para `81/81` suites e `1320/1320` testes sem alterar runtime | `#359` |
| v11.31.0 | auditoria formal do próximo hotspot monolítico: `assets/js/kc-create-post.js` mapeado em `2610L`, `~114KB`, `55` funções top-level, `12` HTMLs impactados e `4` exports públicos; estratégia de decomposição segura registrada em `docs/kc-create-post-audit-v11.31.md`, com sequência recomendada `v11.31.1`–`v11.31.7`; handoff externo ampliado para Claude Code em `docs/handoff-claude-code-v11.31.0.md`; baseline de testes mantido em `80/80` suites e `1303/1303` testes | `#357` |
| v11.30.18 | hardening final do split de `product.controller.js`: nova suíte estática `product.controller-split-contract.test.js` (7 testes) trava guards de namespace, delegação do `renderPost`, wiring do `DOMContentLoaded`, ausência das implementações já extraídas no core e a ordem canônica dos scripts do detalhe em `_product.html`; bloco de scripts do `_product.html` normalizado; baseline sobe para 80/80 suites e 1303/1303 testes; trilha `v11.30.x` encerrada sem abrir nova extração de runtime | `#355` |
| v11.30.17 | split `product.controller.js` (1473L → 1298L, −175L): extração do residual de share/popovers (posicionamento desktop, viewport sync, `Escape` global, copy link e tracking de share → `product.popovers.js`) via `window._KCProduct.popovers`; `DOMContentLoaded` agora delega `bindProductGlobalKeydown()` e `wireSharePopover({ getCurrentPost })` com guard defensivo; `_product.html` atualizado (+1 tag defer); 1 nova suite (9 testes) e alinhamento da regressão legada `product-popover-hardening.test.js` — baseline sobe para 79/79 suites e 1296/1296 testes; split `product.controller.js` avança para 8/9 grupos, deixando apenas o hardening final residual para a próxima fase | `#353` |
| v11.30.16 | split `product.controller.js` (1540L → 1473L, −67L): extração do grupo analytics do autor (`buildAuthorAnalyticsSignature` + `_statBadge`/`statBadge` + `setAuthorAnalyticsMarkup` + `renderAuthorAnalytics` → `product.analytics.js`) via `window._KCProduct.analytics`; `renderPost` agora delega o painel de analytics com guard defensivo; `_product.html` atualizado (+1 tag defer); 1 nova suite (8 testes) — baseline sobe para 78/78 suites e 1287/1287 testes; split `product.controller.js` avança para 7/9 grupos, com popovers/core residual isolado para a próxima fase | `#351` |
| v11.30.15 | split `product.controller.js` (2233L → 1540L, −693L): extração do grupo edit/owner actions (edit modal fallback + `markPostAsEdited` + `buildEditPayload` + `buildEditUI` + `upsertOwnerActions` → `product.edit.js`) via `window._KCProduct.edit`; `renderPost` agora delega owner actions com guard defensivo e contexto explícito (`renderPost`, `getCurrentUser`); `_product.html` atualizado (+1 tag defer); 1 nova suite (14 testes) — baseline sobe para 77/77 suites e 1279/1279 testes; split `product.controller.js` avança para 6/9 grupos, com fechamento residual do controller isolado para a próxima fase | `#349` |
| v11.30.14 | split `product.controller.js` (2559L → 2233L, −326L): extração do grupo ratings (resumo de avaliações do vendedor + modal + auth gate + submit `upsertUserRating` → `product.ratings.js`) via `window._KCProduct.ratings`; `setSeller` e `loadSellerAuthorStats` agora delegam refresh/summary com guard defensivo e contexto explícito (`currentUser`, `currentPost`); `_product.html` atualizado (+1 tag defer); 1 nova suite (12 testes) — baseline sobe para 76/76 suites e 1265/1265 testes; split `product.controller.js` avança para 5/9 grupos, com `edit/owner actions` isolado para a próxima fase | `#347` |
| v11.30.13 | split `product.controller.js` (2727L → 2559L, −168L): extração do grupo save (save popover + `savedPostState` + `updateSavedButtonsUI` + `refreshSavedState` + `bindSavedActions` → `product.save.js`) via `window._KCProduct.save`; `renderPost`, `Escape` global e `DOMContentLoaded` agora delegam wiring/refresh com guard defensivo; `_product.html` atualizado (+1 tag defer); 1 nova suite (15 testes) — baseline sobe para 75/75 suites e 1253/1253 testes; split `product.controller.js` avança para 4/9 grupos, com `ratings` isolado para a próxima fase | `#345` |
| v11.30.12 | split `product.controller.js` (2886L → 2727L, −159L): extração do grupo calendar (open/close/wire popover + `setEventCalendar` → `product.calendar.js`) via `window._KCProduct.calendar`; `renderPost`, `Escape` global e interações share/save agora delegam o fechamento do calendário com guard defensivo; `_product.html` atualizado (+1 tag defer); 1 nova suite (14 testes) — baseline sobe para 74/74 suites e 1238/1238 testes; split `product.controller.js` avança para 3/9 grupos, com `save` isolado para a próxima fase | `#343` |
| v11.30.11 | split `product.controller.js` (3007L → 2886L, −121L): extração do grupo related (request token + `getRelatedReasonLabel` + `getRelatedImageHtml` + `getRelatedPriceLabel` + `renderRelatedPosts` + `setRelated` → `product.related.js`) via `window._KCProduct.related`; `renderPost` agora delega com guard defensivo e `viewerAuthenticated`; `_product.html` atualizado (+1 tag defer); 1 nova suite (17 testes) — baseline sobe para 73/73 suites e 1224/1224 testes; split `product.controller.js` avança para 2/9 grupos | `#341` |
| v11.30.10 | split `product.controller.js` (3368L → 3007L, −361L): extração do grupo report (wireReportButton + buildReportPopover + REPORT_REASONS 7 motivos → `product.report.js`) via `window._KCProduct.report`; `_product.html` atualizado (+1 tag defer); 1 nova suite (28 testes) — baseline sobe para 72/72 suites e 1207/1207 testes; split product.controller.js iniciado (1/9 grupos) | `#339` |
| v11.30.9 | split `supabase.adapter.js` (613L → 420L, −193L; acumulado −3621L): extração do grupo profiles (3 funções + helpers → `supabase.profiles.adapter.js`) via `window._KCSA.profiles`; lazy accessors `getProfileShared()` + `getOwnerProfileFields()`; 22 HTMLs atualizados; 1 nova suite (61 testes) — baseline sobe para 71/71 suites e 1178/1178 testes; split concluído (10/10 grupos) | `#337` |
| v11.30.8 | split `supabase.adapter.js` (1517L → 613L, −904L; acumulado −3428L): extração do grupo posts-write (7 funções + helpers → `supabase.posts-write.adapter.js`) via `window._KCSA.postsWrite`; `getENV()` lazy; `doNormalizePost` lazy; 22 HTMLs atualizados; 1 nova suite (106 testes) — baseline sobe para 70/70 suites e 1117/1117 testes | `#335` |
| v11.30.7 | split `supabase.adapter.js` (2187L → 1517L, −670L): extração do grupo posts-read (7 funções + 14 helpers → `supabase.posts-read.adapter.js`) via `window._KCSA`; `doNormalizePost` lazy; 4 callers posts-write atualizados; 22 HTMLs atualizados; 1 nova suite (69 testes) — baseline sobe para 69/69 suites e 1011/1011 testes | `#333` |
| v11.30.6 | split `supabase.adapter.js` (2619L → 2187L, −432L): extração do grupo saved (19 funções → `supabase.saved.adapter.js`) via `window._KCSA`; acesso lazy a `posts.getPostById`; 22 HTMLs atualizados; 1 nova suite (50 testes) — baseline sobe para 68/68 suites e 935/935 testes | `#331` |
| v11.30.5 | split `supabase.adapter.js` (3006L → 2619L, −387L): extração do grupo media (13 funções → `supabase.media.adapter.js`) via `window._KCSA`; `window.KCCompressImage` movido; 22 HTMLs atualizados; 1 nova suite (41 testes) — baseline sobe para 67/67 suites e 885/885 testes | `#329` |
| v11.30.4 | split `supabase.adapter.js` (3157L → 3006L, −151L): extração de votes (2 funções + 6 helpers → `supabase.votes.adapter.js`) via `window._KCSA`; 22 HTMLs atualizados; 1 nova suite (22 testes) — baseline sobe para 66/66 suites e 844/844 testes | `#327` |
| v11.30.3 | split `supabase.adapter.js` (3382L → 3157L, −225L): extração de comments (3 funções + 6 helpers → `supabase.comments.adapter.js`) via `window._KCSA`; 22 HTMLs atualizados; 1 nova suite (24 testes) — baseline sobe para 65/65 suites e 822/822 testes | `#325` |
| v11.30.2 | split `supabase.adapter.js` (3626L → 3382L, −244L): extração de admin/help-requests (3 funções + 3 helpers → `supabase.admin.adapter.js`) via `window._KCSA`; 22 HTMLs atualizados; 1 nova suite (20 testes) — baseline sobe para 64/64 suites e 798/798 testes | `#323` |
| v11.30.1 | split `supabase.adapter.js` (4041L → 3626L, −415L): extração de analytics (6 funções → `supabase.analytics.adapter.js`) e notifications (11 funções + 6 helpers → `supabase.notifications.adapter.js`) via `window._KCSA`; 22 HTMLs atualizados; 2 novas suites (34 testes) — baseline sobe para 63/63 suites e 778/778 testes | `#321` |
| v11.30.0 | auditoria dos dois monolitos: `supabase.adapter.js` (4041 linhas, 162KB — 20 seções, 11 grupos de domínio, 46 métodos públicos) e `product.controller.js` (3368 linhas, 143KB — 18 seções, 9 grupos); estratégia de split incremental com `window._KCSA` e `window._KCProduct`; sequência de 17 sub-entregas mapeada em `docs/monolith-audit-v11.30.md` | `#319` |
| v11.29.1 | SWR/KCSessionStore em `my-posts.controller.js` (`SECTION_CACHE_KEY='my-posts:index'`, TTL 10 min, cap 200, `restoreCachedPosts`/`persistCachedPosts`, `forceRefresh` em `reloadPosts`) e `profile.controller.js` (`profileCacheKey()` separado por `isPublicView+profileId`, `restoreCachedProfile`/`persistCachedProfile`, `loadProfile()` retorna imediatamente do cache); 2 novas suites (15 testes) — baseline sobe para 61/61 suites e 739/739 testes | `#317` |
| v11.29.0 | auditoria SWR residual: confirma completude de SWR em 6/6 module feed controllers; mapeia residuos — `profile.controller.js` (fetch:45) e `my-posts.controller.js` (fetch:15) como candidatos para v11.29.1; `product.controller.js` (fetch:61, ~139KB) adiado para pós v11.30.2 (split primeiro); admins e outros: SWR nao aplicavel — `docs/swr-audit-v11.29.md` | `#315` |
| v11.28.2 | feat JS SWR M2+M4: `KCSessionStore` adicionado em `eventos.controller.js` (cache calendário: `SECTION_CACHE_KEY='eventos:calendar'`, `restoreCachedEvents`/`persistCachedEvents`) e `caronas-feed.controller.js` (cache localizações: `LOCATIONS_STORE_KEY='caronas:locations'`, upgrade de `sessionStorage` raw para `KCSessionStore`); 9 testes novos — baseline sobe para 59/59 suites e 724/724 testes; todos os 6 module controllers em paridade arquitetural | `#313` |
| v11.28.1 | fix JS iOS/Safari M1+M3: KCOverlayLock adicionado em `caronas-feed.controller.js` (seção modal, linhas 629/668) e `eventos.controller.js` (seção modal filtros, linhas 244/309) — alinha com padrão de achados-perdidos/compra-venda/moradia/oportunidades; 4 testes novos — baseline sobe para 59/59 suites e 715/715 testes | `#311` |
| v11.28.0 | auditoria de paridade entre 6 module controllers: 4 gaps mapeados em caronas-feed (sem KCOverlayLock seção + sem SWR) e eventos (sem KCOverlayLock seção + sem SWR); admins sem gaps críticos; plano de correcao v11.28.1 (KCOverlayLock) + v11.28.2 (SWR) em `docs/controller-parity-audit-v11.28.md` | `#309` |
| v11.27.3 | 2 fixes CSS iOS/Safari: B5 `max-height: 100dvh` adicionado abaixo de `100vh` em `.kc-modal` e `.kc-admin-chart-modal` (`admin-shell.css:231,334`); C6 `min-height: 100dvh` adicionado abaixo de `100vh` em `body.kc-shell-page` (`kc-public-shell.css:2`); 3 testes novos — baseline sobe para 59/59 suites e 711/711 testes; trilha iOS/Safari v11.27.x encerrada (6/6 issues) | `#307` |
| v11.27.2 | fix JS iOS/Safari A3: scroll lock incompleto em `eventos.controller.js` — `openCalModal` e `closeCalModal` migrados de `classList.add/remove('kc-scroll-locked')` no documentElement para `KCOverlayLock.lock/unlock('eventos-cal-modal')`; 2 testes novos — baseline sobe para 59/59 suites e 708/708 testes | `#305` |
| v11.27.1 | 3 fixes CSS iOS/Safari: A1 `-webkit-backdrop-filter: blur(10px)` adicionado em `.kc-hero-pill` (`styles.css:656`); A2 `font-size: 12px` → `1rem` em `.kc-search-bar input` @media 420px (elimina zoom automatico iOS); B4 `-webkit-backdrop-filter: none` adicionado em reset account-setup (`kc-public-shell.css:126`) | `#303` |
| v11.27.0 | auditoria iOS/Safari: 6 issues identificados (3 alta: A1 backdrop-filter sem webkit em .kc-hero-pill, A2 font-size:12px no search input mobile @420px, A3 scroll lock incompleto em eventos.controller; 2 media: B4 backdrop-filter:none sem webkit, B5 100vh sem dvh em modais admin; 1 baixa: C6 min-height:100vh) + plano de correcao v11.27.1–v11.27.3 em `docs/ios-safari-audit-v11.27.md` | `#302` |
| v11.26.2 | suites de testes estaticas para 5 module controllers: `index.controller.js` (14 testes: getCurrentUser, getMySavedPostsCount ×3, modals, KCOverlayLock), `achados-perdidos.controller.js` (19 testes: cache key, date presets today/last7d/last30d, dataset attrs, getSessionStore, normalizePost), `caronas-feed.controller.js` (18 testes: date presets today/last3d/last7d, KCSupabase caronas_locations, feature options), `moradia.controller.js` (23 testes: cache key, 6 features, 2 regioes, date presets, getSessionStore), `eventos.controller.js` (23 testes: date presets today/next7d/thisMonth/past, 6 categorias, KCSupabase posts, calendario) — baseline sobe para 59/59 suites e 706/706 testes | `#300` |
| v11.26.1 | suites de testes estaticas para `create-post.controller.js` (20 testes: wrapper KCActions, WRAP_FLAG, 4 stages de erro, idempotencia, fallback) e `kc-feed.controller.js` (24 testes: KCControllers API, constantes POSTS_LIMIT=12/UUID_RE/FEED_CACHE_MAX_AGE_MS, contratos KCAPI, KCSessionStore, banner realtime, anti-duplicacao seenIds) — baseline sobe para 54/54 suites e 609/609 testes | `#298` |
| v11.26.0 | planejamento de cobertura de testes: auditoria dos 7 controllers sem cobertura direta; padroes transversais mapeados (KCAPI contracts, KCFeedFilters, session cache, modal/overlay, dataset attrs); estrategia detalhada para v11.26.1 (create-post + kc-feed) e v11.26.2 (5 modulos) — `docs/test-coverage-plan-v11.26.md` criado | `#296` |
| v11.25.2 | correcao de drift documental: nota de estado `v11.25.x` adicionada em `api-contract.md`; contagem de migrations corrigida (82→83) e nota de estado adicionada em `db-schema.md`; convencao de `search_path` atualizada para indicar continuidade v11 em `rpc-catalog.md` | `#294` |
| v11.25.1 | consolidacao do CHANGELOG: entradas `v11.24.0`–`v11.25.0` adicionadas; entrada formal `[11.0.0] - 2026-04-12` criada com resumo consolidado de todas as 25 iteracoes da trilha v11; `[Unreleased]` zerado | `#292` |
| v11.25.0 | planejamento formal do backlog v11.25–v11.30: roadmap de 16 iteracoes cobrindo drift documental, cobertura de testes, hardening iOS/Safari, paridade entre equivalentes, extensao SWR e refactor de hotspots monoliticos — `docs/roadmap-v11.25-v11.30.md` criado | `#290` |
| v11.24.3 | templates HTML dinamicos de `kc-auth.ui.js` migrados para `KCi18n.t()` via helper `_t(key, fallback)`: 30 chaves `auth.modal-*` e 5 chaves `auth.dropdown-*` adicionadas ao dicionario; painel forgot (5 strings), painel resend (6 strings), painel user (6 strings) e `buildDropdownContent()` (7 strings) migrados; regressao mantida em 52/52 suites e 565/565 testes | `#288` |
| v11.24.2 | componentes core integrados ao `KCi18n.t()`: dicionario expandido com 11 chaves `notif.*` e 26 chaves `auth.*`; 10 strings substituidas em `kc-notifications.js`; 28 `setStatus()` + 1 `showToast()` + 2 `userMeta` substituidos em `kc-auth.ui.js`; tag `<script defer src="assets/js/kc-i18n.js">` adicionada nos 22 HTMLs; `kc-notifications-dropdown.test.js` atualizado; regressao mantida em 52/52 suites e 565/565 testes | `#286` |
| v11.24.1 | infraestrutura base de i18n: modulo `kc-i18n.js` (IIFE, `window.KCi18n`) com dicionario pt-BR de 120+ entradas em 10 categorias (`common`, `nav`, `form`, `error`, `feedback`, `time`, `empty`, `a11y`, `module`, `uxw`), helpers `KCi18n.t(key, params)` com interpolacao `{chave}` e `KCi18n.n(value, opts)` via `Intl.NumberFormat`; suite `tests/kc-i18n.test.js` com 35 testes; regressao mantida em 52/52 suites e 565/565 testes | `#284` |
| v11.24.0 | planejamento estruturado de i18n, acessibilidade e UX Writing: inventario textual de ~250-300 strings em 22 HTMLs e 61 JS, mapeamento de 65+ instancias `white-space: nowrap`, analise de fragilidade de testes (12 arquivos com strings literais) e estrategia incremental em 3 subfases (v11.24.1 infra, v11.24.2 componentes core, v11.24.3 paginas+SEO) | `#282` |
| v11.23.0 | release gate final da rodada principal da v11: endurecimento do teste de analytics frente ao cache/SWR atual, artefato formal `docs/qa/report-v11.23.0-run1.md`, hygiene `8.6.0`, smoke remoto em producao e residuals do Supabase consolidados sem abrir refactor novo | `#280` |
| v11.22.0 | scheduler versionado do dispatcher externo: migration `v11.22.0.0_notification_dispatch_scheduler.sql`, tabela privada `notification_dispatch_runs`, helper `kc_trigger_notification_dispatch(...)`, job `pg_cron` `kc-dispatch-notification-outbox` e Edge Function endurecida com `execution_id`/`source` e persistencia de runs | `#278` |
| v11.21.1 | canal privado de WhatsApp implementado sobre a trilha de outbox: tabela `notification_channel_targets`, preferencia/consentimento separados do perfil publico, novos metodos `KCAPI.getNotificationChannelTargets()`/`updateNotificationChannelTargets()` e dispatcher `kc-dispatch-notification-outbox` ampliado para Twilio com rate limit por usuario | `#277` |
| v11.21.0 | canal de e-mail implementado sobre a outbox: helpers SQL `kc_claim_notification_delivery_batch(...)`/`kc_record_notification_delivery_attempt(...)`, template HTML/texto, envio por `Resend` na Edge Function `kc-dispatch-notification-outbox` e observabilidade de preview/dispatch mantendo `public.notifications` como trilha canonica | `#275` |
| v11.20.2 | fundação assincrona de entrega externa com `notification_delivery_outbox`, `notification_delivery_attempts`, helper canônico `kc_emit_notification_event(...)`, correção do trigger de voto para o contrato real `post_votes(voter_id, direction='hot'|'cold')` e Edge Function `kc-dispatch-notification-outbox` publicada em dry-run | `#273` |
| v11.20.1 | preferências de notificações persistidas por evento e canal, com camada privada separada em `notification_preferences`, UI de configuração em `settings`, novos métodos `KCAPI.getNotificationPreferences()`/`updateNotificationPreferences()` e triggers in-app passando a respeitar o canal `in_app` sem ainda ativar entrega externa | `#271` |
| v11.20.0 | hardening do sino e do dropdown de notificações: geometria mais estável do `kcNotifBell`, ação explícita de `Limpar` no `kcNotifDropdown`, contrato `KCAPI.clearNotifications()` e realtime endurecido para `INSERT`/`UPDATE`/`DELETE`, sem alterar a fonte canônica in-app em `public.notifications` | `#269` |
| v11.19.0 | auditoria operacional do Supabase com migration versionada para eliminar warnings ativos de RLS/performance em `notifications`, `post_view_events` e `kc_invited_emails`, cobrindo `initplan`, policies permissivas redundantes e índices de FK faltantes, além de sincronizar `docs/db-schema.md`, `docs/rpc-catalog.md` e invariantes operacionais | `#265` |
| v11.18.0 | aprofundamento da rodada de contratos entre `KCAPI` e adapters: `getProfileHighlightsCount(...)` passou a aceitar `params` e a encaminhá-los com paridade entre `kc-api.client.js`, `local.adapter.js` e `supabase.adapter.js`, preservando a semântica highlight-only e adicionando regressões diretas de dispatch/paridade | `#263` |
| v11.17.0 | primeira fatia de controller do admin pós-v10: `admin-banners.controller.js` passou a validar acesso via `KCAPI.getCurrentUser()` + `profiles.is_admin`, aguardando hidratação de auth e removendo o fallback que carregava a tela sem sessão/autorização validadas | `#261` |
| v11.16.0 | primeira fatia do admin pós-v10: preload do shell administrativo foi centralizado em `admin-shell.js`, com `kc-loading` e `kc-theme-preload` padronizados nas 5 telas admin e regressão estática de marcação | `#259` |
| v11.15.2 | terceira fatia de `account-setup`: hidratação de redes sociais e visibilidade passou a ser normalizada pelos helpers shared, com reset determinístico de todos os toggles e preservação do default de WhatsApp só quando não existe configuração salva | `#257` |
| v11.15.1 | segunda fatia de `account-setup`: a prévia de contato do onboarding passa a reutilizar `buildContactAction`, reage ao toggle de contato público e fica coerente com o CTA real exibido nos anúncios | `#255` |
| v11.15.0 | primeira fatia de `settings`/conta: preview de contato passa a gerar o link de anúncio de demonstração pela rota canônica `_product.html`, reaproveitando `KCUtils.buildProductDetailHref(...)` e travando a regressão em teste estático e shared | `#253` |
| v11.14.0 | normalização da rota canônica do detalhe nas superfícies de perfil e `my-posts`, com helper compartilhado em `KCUtils` e remoção do drift `product.html?id=` nessas páginas | `#251` |
| v11.13.1 | hardening dos popovers de ação da página de produto, com fallback compartilhado para copiar link, tracking também no compartilhamento por cópia e centralização do fechamento por `Escape` entre compartilhar, salvar e calendário | `#249` |
| v11.13.0 | hardening do dropdown de notificações para manter `Marcar todas como lidas` e o clique dos itens funcionais mesmo após rerenders por realtime/mark-read | `#247` |
| v11.12.0 | endurecimento do fluxo de criação para ignorar no payload final campos condicionais que deixaram de estar ativos, preservando o rascunho no modal e alinhando `docs/module-schemas.md` ao estado real da categoria `Ingressos` | `#245` |
| v11.11.1 | reformulação do roadmap da v11 em uma sequência contínua de fases `v11.12.0` a `v11.21.0`, preparando a continuidade controlada da rodada | `#244` |
| v11.11.0 | limpeza estrutural de `kc-comments.js`, removendo helpers sombreados de comentário/resposta/renderização e adicionando regressões para reply local, exclusão em cascata local e prevenção de duplicidade de declarations | `#242` |
| v11.10.0 | extensão do snapshot+SWR para a página de produto, com hidratação de sessão para analytics do autor e comentários Supabase, invalidação segura após mutações e refresh silencioso sem spinner integral | `#240` |
| v11.9.0 | hidratação persistente e revalidação silenciosa para `Top Contribuidores` e `kc-vote-score`, reaproveitando `KCSessionStore` para evitar spinner/reprocessamento desnecessário em reload e troca de período | `#238` |
| v11.8.0 | remoção do bloco redundante de normalização em `localCreatePost`, centralizando a persistência local em `prepareLocalPostForPersistence` e adicionando regressão direta para criação local em `compra-venda` | `#237` |
| v11.7.0 | paridade endurecida entre `local.adapter.js`, `kc-api.client.js` e o contrato moderno do driver local, cobrindo perfil, posts do usuário, salvos, highlights, notificações e convites sem alterar Supabase ou banco | `#236` |
| v11.6.0 | hardening de iOS Safari: `pull-to-refresh` deixa de sequestrar gestos horizontais no topo, superfícies horizontais preservam `pinch-zoom` e o auth/modal deixa de induzir auto-zoom/travamento por `touch-action` e `font-size` inadequados | `#235` |
| v11.5.0 | restauração transversal do `Top Contribuidores` nos 6 módulos, removendo o bootstrap inline bloqueado pela CSP e normalizando o carregamento externo de `kc-ranking.js` | `#233` |
| v11.4.0 | correção transversal da sidebar desktop, restauração do preset canônico `Todas as datas` em `eventos` e inclusão funcional da categoria `Ingressos` em compra e venda | `#232` |
| v11.3.0 | paridade do `Limpar filtros` no empty state dos 6 feeds públicos e clear explícito de data no módulo `eventos` | `#231` |
| v11.2.1 | reativação do Vercel MCP no Codex, homologação de time/projeto/deployments/logs e fechamento da validação pós-merge da `v11.2.0` | `#230` |
| v11.2.0 | consistência de shell público: estados ativos da navegação, menu móvel coerente em páginas secundárias e busca mobile adicionada na `create-post.html` | `#229` |
| v11.1.0 | baseline documental da v11: sincronização de README, changelog e docs técnicas com o estado real da base | `#228` |
| docs | Sincronização do `README.md` com o estado real da v10 e nota operacional das migrations SQL da v10 | `#223` |
| v10.0 | Admin Panel Overhaul: navegação unificada, hardening dos controllers admin, busca e paginação server-side no admin, responsividade consolidada e ajustes de UX | `#215` a `#222` |
| v9.4.4 | Hotfix de comentários com `KCLazyLoader.load()` nos pontos críticos | `#213` |
| v9.4.3 | Hotfix de comentários e empty state do perfil | `#212` |
| v9.4.2 | Acessibilidade A11y em 17 HTMLs | `#211` |
| v9.4.1 | Otimização de imagens e ajustes de LCP | `#210` |
| v9.4.0 | Lazy loading de módulos grandes via `KCLazyLoader` | `#209` |
| v9.3.2 | Moderação automática anti-spam | `#208` |
| v9.3.1 | Analytics de post para autores | `#207` |
| v9.1.x | Notificações in-app, convites externos e avaliações de usuários | `#198` a `#206` |
| v9.0.x | Documentação técnica, segurança e expansão de testes | `#194` a `#197` |

---

## Planejamento v12

O planejamento detalhado da próxima fase está em [RELATORIO-KINOCAMPUS-V12.md](./RELATORIO-KINOCAMPUS-V12.md).

**Tema:** *Consolidação & Qualidade Sistêmica*. A v12 herda a linha-base `kinocampus-V11.0-foundations`, o rito operacional e os contratos públicos consolidados na v11, mas muda o eixo narrativo: de "quebrar monolitos isolados" para "consolidar o que foi fatiado + elevar a maturidade sistêmica da plataforma".

As iterações são organizadas em **três camadas paralelas**:

- **Camada A — Continuação tática v11** (splits IIFE dos hotspots remanescentes):
  - `v12.1.0`–`v12.2.7`: `kc-utils.js` (2445L → <900L) em 7 sub-módulos `window._KCU.*` + gate formal
  - `v12.3.0`–`v12.3.4`: `admin-dashboard.controller.js` (2034L → <900L) em `window._KCAD.*`
  - `v12.4.0`–`v12.4.8`: `local.adapter.js` (1862L → <500L) em `window._KCLA.*`, restaurando paridade com `supabase.adapter.js` (420L)
  - `v12.5.0`–`v12.5.5`: `assets/js/controllers/profile.controller.js` (1463L → <600L) em `window._KCPR.*`

- **Camada B — Qualidade sistêmica** (gaps não cobertos na v11):
  - `v12.6.0`: feature flags formais `window.KCFF`
  - `v12.7.0`–`v12.7.3`: i18n runtime fase 1–3 + locale switcher pt-BR/en-US
  - `v12.8.0`–`v12.8.1`: a11y audit estrutural + correções
  - `v12.9.0`–`v12.9.2`: Playwright E2E (smoke → expansão admin)
  - `v12.10.0`: Lighthouse CI

- **Camada C — Resiliência & observabilidade**:
  - `v12.11.0`: Service Worker atrás de flag `sw.enabled`
  - `v12.12.0`: error boundary global + telemetria cliente (`kc-telemetry.js`)

- **Gate final:**
  - `v12.13.0`: release gate v12, CHANGELOG `## [12.0.0]`, smoke geral

Regras desta fase (herdadas da v11, sem reinterpretação):

- nenhuma implementação da v12 deve começar sem autorização explícita
- toda iteração da v12 deve atualizar este `README.md` e o `RELATORIO-KINOCAMPUS-V12.md`
- cada iteração aprovada segue a esteira completa: branch própria a partir de `kinocampus-V11.0-foundations`, commit, push, PR, merge squash, delete branch, pull, validação Supabase/Vercel (quando aplicável) e testes de regressão verdes

### Progresso atual

- iteração encerrada: `v12.5.0` — **auditoria docs-only de `assets/js/controllers/profile.controller.js` concluida** (`1463L` / `56 497` bytes; `67` funcoes top-level; roadmap recalibrado para `_KCPR.*`)
- v12.1.0 concluída: auditoria doc-only de `kc-utils.js` (PR #394)
- v12.0.0 concluída: abertura docs-only do ciclo v12 (PR #393)
- v11 encerrada: `v11.33.7` (trilha `v11.33.x` concluída)
- regressão: `116/116` suites, `2428/2428` testes verdes, hygiene `8.6.0`
- deploy de produção ativo: `dpl_Dxajob4FbnLs64iBN2he6vsVta1y` (`www.kinocampus.com.br`)
- sub-módulos `window._KCAPI.*` operacionais: `notifications`, `saved`, `help`, `postsRead`, `commentsVotes`, `ratings`, `postsFeed`, `postsWrite`, `profiles`, `related`, `auth` (11 total)
- sub-adapters `window._KCSA.*` operacionais: `profiles`, `postsWrite`, `postsRead`, `saved`, `media`, `votes`, `comments`, `admin`, `analytics`, `notifications` (10 total)
- sub-adapters `window._KCLA.*` operacionais: `notifications`, `ratings`, `saved`, `postsRead`, `postsWrite`, `profile`, `help` (7 total)
- kc-api.client.js: `2536L` (pré-v11.33) → `2410L` (pós-v11.33.7), piso natural como registry/wiring
- `kc-utils.js`: 2445L → 440L (−2005L pós-v12.2.6); 7 sub-módulos `window._KCU.*` operacionais e gate `<900L` formalizado em `v12.2.7`
- `admin-dashboard.controller.js`: após `v12.3.1` o core estava em `1859L`; após `v12.3.2`, caiu para `1172L` / `48 589` bytes; o gate formal `v12.3.4` consolidou o footprint real atual em `835L` / `32 802` bytes, enquanto `admin-dashboard.charts.js` ficou formalizado em `642L` / `27 895` bytes
- `local.adapter.js`: após `v12.4.8`, o core caiu de `1862L` / `75 712` bytes para `473L` / `21 898` bytes; `assets/js/adapters/local.notifications.adapter.js` segue com `250L`, `14` exports, `assets/js/adapters/local.ratings.adapter.js` com `339L`, `6` exports, `assets/js/adapters/local.saved.adapter.js` com `252L`, `7` exports, `assets/js/adapters/local.posts-read.adapter.js` com `687L`, `8` exports, `assets/js/adapters/local.posts-write.adapter.js` com `300L`, `7` exports, `assets/js/adapters/local.profile.adapter.js` com `157L`, `4` exports, e `assets/js/adapters/local.help.adapter.js` com `201L`, `3` exports; o gate `<500L` foi formalizado e o `scripts/hygiene-check.js` agora valida a cadeia local `notifications -> ratings -> saved -> posts-read -> posts-write -> profile -> help` nos `22` HTMLs canônicos
- `assets/js/controllers/profile.controller.js`: auditoria `v12.5.0` confirmou `1463L` / `56 497` bytes, `67` funcoes top-level (`14` async), `1` HTML consumidor direto (`profile.html`) e boundary previo em `assets/js/account-profile.shared.js` (`962L`, `45` funcoes); a trilha foi recalibrada para `window._KCPR.presentation`, `collections`, `ratings`, `flow` e gate `<600L`
- próxima iteração: `v12.5.1` — split `window._KCPR.presentation`

---

## Planejamento v11 (histórico)

O planejamento detalhado da trilha v11 (encerrada) está em [RELATORIO-KINOCAMPUS-V11.md](./RELATORIO-KINOCAMPUS-V11.md).

Regras aplicadas na fase v11:

- nenhuma implementação da v11 deveria começar sem autorização explícita
- toda iteração da v11 atualizou `README.md` e `RELATORIO-KINOCAMPUS-V11.md`
- cada iteração seguiu a esteira completa: branch própria, commit, push, PR, merge, delete branch, pull, validação no Supabase/Vercel e testes de regressão

### Progresso final da v11

- iteração encerrada: `v11.33.7` — **trilha `v11.33.x` CONCLUÍDA**
- gate formal: todos os 6 domínios residuais extraídos do facade `window.KCAPI`
- regressão: `99/99` suites, `1874/1874` testes, hygiene `8.6.0`
- sub-módulos `window._KCAPI.*`: 11 operacionais (lista completa acima)
- kc-api.client.js: `2536L` (pré-v11.33) → `2410L` (pós-v11.33.7), −126L de implementações, +∼160L de delegation stubs

---

## Mapa de Versão Canônica do Frontend

versão-alvo única atual: **`8.6.0`**

Este mapa existe para manter coerência com o `scripts/hygiene-check.js`, que ainda valida a versão canônica embutida do frontend. Isso não substitui a linha funcional/documental `v10` nem a execução da `v11`; apenas registra o estado real dos arquivos versionados.

| Arquivo | Referência atual |
|---------|------------------|
| `assets/js/kc-env.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-api.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-supabase.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-auth.ui.js` | auth UI v8.6.0 |
| `assets/js/kc-profiles.client.js` | `const VERSION = '8.6.0';` |
| `scripts/hygiene-check.js` | `canonicalVersion = '8.6.0'` |

O drift entre a linha funcional `v10` e a linha canônica embutida `8.6.0` foi oficialmente incorporado ao backlog da v11 para tratamento coordenado, nunca parcial.

---

## Admin v10

O painel admin foi reorganizado e endurecido em 8 PRs sequenciais:

| PR | Branch | Resultado |
|----|--------|-----------|
| `#215` | `fix/admin-v10-shell-nav` | navegação admin unificada, `active-link` robusto, `resize debounce`, `aria-label` nos toggles |
| `#216` | `fix/admin-v10-dashboard` | debounce/cancelamento do filtro de período, correções em audit log, export, ranking e modal |
| `#217` | `fix/admin-v10-moderation` | busca server-side no admin, debounce de busca, lock de ações e confirmação destrutiva |
| `#218` | `fix/admin-v10-reports` | paginação progressiva, contador, confirmação de exclusão e escaping consistente |
| `#219` | `fix/admin-v10-banners` | drag and drop sem listeners duplicados, preview com debounce e modal endurecida |
| `#220` | `fix/admin-v10-help-requests` | paginação server-side total-aware, guard de bind único, validação de enums e fallback seguro |
| `#221` | `fix/admin-v10-invite` | clipboard centralizado, cleanup de polling e null checks defensivos |
| `#222` | `fix/admin-v10-mobile-css` | breakpoints unificados, CSS compartilhado, `data-label` real e responsividade consolidada |

### Migrations novas da v10

Estas migrations já estão no repositório e **já foram aplicadas no banco principal atual**. Para ambientes novos, staging paralelo ou bancos recriados, aplique manualmente em ordem:

| Arquivo | Função criada | Status |
|---------|---------------|--------|
| `supabase/migrations/v10.0.0.0_admin_search_posts_full.sql` | `public.kc_admin_search_posts_full(...)` | aplicada no banco principal atual |
| `supabase/migrations/v10.0.1.0_admin_help_requests_pagination.sql` | `public.kc_admin_list_help_requests_paged(...)` | aplicada no banco principal atual |

### Importante

- No banco principal atual, essas migrations já estão ativas.
- A aplicação continua sendo feita **uma vez por banco/ambiente**.
- Se o seu banco de produção e o de staging forem diferentes, aplique em ambos.
- Depois de aplicar o SQL, **não é necessário redeploy do frontend** apenas por isso; um reload da página basta.

---

## Regra de release

Sempre que houver release de frontend:

1. Definir uma versão-alvo única para todos os módulos de frontend.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI.
4. Registrar a mudança em `README.md` e `CHANGELOG.md`.

---

## Fonte única de verdade do banco

A fonte oficial de verdade para banco é a esteira SQL do Supabase:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

Para artefatos legados e critérios de remoção, consulte `docs/legacy/README.md`.

### Regra explícita para mudanças críticas

Qualquer mudança crítica de banco, incluindo auth, `verified`, policies, triggers, RLS, storage policies e grants/revokes, deve existir somente em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Se surgir SQL fora do fluxo oficial:

1. Mover para `docs/legacy/sql/`.
2. Documentar em `docs/legacy/README.md`.
3. Não usar operacionalmente em deploy ou setup.
4. Não recriar diretório `sql/` na raiz.

---

## Como rodar localmente

### Opção A - VS Code Live Server

1. Abra a pasta `kino-campus/` no VS Code.
2. Clique em `Go Live`.
3. Acesse `index.html`.

### Opção B - Python

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500/index.html`.

---

## Ativação Supabase

### 1) Migrations

Aplique todas as migrations em `supabase/migrations/` em ordem alfabética. Atualmente o diretório contém **83 arquivos**, incluindo as 2 migrations da v10, a migration operacional `v9.3.3.0_supabase_operational_rls_fk.sql`, a trilha `v11.20.1.0_notification_preferences.sql`, a fundação `v11.20.2.0_notification_delivery_outbox.sql`, a promoção do canal de e-mail `v11.21.0.0_notification_email_channel.sql`, a camada privada do canal WhatsApp `v11.21.1.0_notification_whatsapp_channel.sql` e o scheduler `v11.22.0.0_notification_dispatch_scheduler.sql`.

No banco principal atual, as 2 migrations da v10 já foram aplicadas. Use a lista abaixo para ambientes novos, bancos recriados ou staging separado.

Se estiver atualizando um ambiente que já estava em v9, garanta pelo menos a aplicação destas novas migrations:

1. `v10.0.0.0_admin_search_posts_full.sql`
2. `v10.0.1.0_admin_help_requests_pagination.sql`
3. `v11.20.1.0_notification_preferences.sql`
4. `v11.20.2.0_notification_delivery_outbox.sql`
5. `v11.21.0.0_notification_email_channel.sql`
6. `v11.21.1.0_notification_whatsapp_channel.sql`
7. `v11.22.0.0_notification_dispatch_scheduler.sql`

Você pode aplicar pelo SQL Editor do Supabase ou pela CLI.

### 2) Schema bootstrap

Para um projeto novo, aplique antes:

1. `supabase/schema-bootstrap-v8.1.2.3.sql`
2. `supabase/schema-update-v8.1.3.2.sql`
3. Depois as migrations em ordem

### 3) Storage

Bucket esperado: `kino-media`.

- `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`
- `avatars/{uid}.{ext}`

### 4) KC_ENV

Edite `assets/js/kc-env.js`:

```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media"
}
```

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 5) Edge Functions

**notify-admin-reports-threshold**

```bash
supabase functions deploy notify-admin-reports-threshold
```

**kc-invite-user**

```bash
supabase functions deploy kc-invite-user
```

**kc-dispatch-notification-outbox**

```bash
supabase functions deploy kc-dispatch-notification-outbox
```

Segredos obrigatórios desta função:

- `KC_NOTIFICATION_DISPATCH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Segredos adicionais para o canal de e-mail (`v11.21.0`):

- `KC_NOTIFICATION_EMAIL_PROVIDER` (`resend`)
- `KC_NOTIFICATION_EMAIL_API_KEY`
- `KC_NOTIFICATION_EMAIL_FROM`
- opcionalmente `KC_NOTIFICATION_EMAIL_REPLY_TO`
- opcionalmente `KC_APP_BASE_URL`
- opcionalmente `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`

Segredos adicionais para o canal de WhatsApp (`v11.21.1`):

- `KC_NOTIFICATION_WHATSAPP_PROVIDER`
- `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
- `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
- `KC_NOTIFICATION_WHATSAPP_FROM`
- `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW`

Observações:

- a `v11.21.0` publica essa função com envio real por e-mail via `Resend`, mas o projeto Supabase principal ainda precisa receber os segredos `KC_NOTIFICATION_EMAIL_*` para sair do gating operacional
- a `v11.21.1` implementa o canal privado de WhatsApp sem reutilizar o contato publico do perfil; o envio real depende dos segredos `KC_NOTIFICATION_WHATSAPP_*`
- a invocação exige o header `x-kc-dispatch-secret`
- a `v11.22.0` adiciona um scheduler no banco para consumir a outbox automaticamente; a função continua segura porque o disparo depende da camada privada `notification_dispatch_runtime` e os providers continuam gated por canal

### 6) Settings de banco fora do git

- `public.notification_dispatch_runtime.slot = 'primary'`
- `public.notification_dispatch_runtime.function_url`
- `public.notification_dispatch_runtime.dispatch_secret`
- opcionalmente `public.notification_dispatch_runtime.batch_limit`
- `app.settings.kc_notify_function_url`
- `app.settings.kc_notify_function_auth_token`
- `app.settings.kc_notify_hmac_secret`
- opcionalmente `app.settings.kc_notification_dispatch_function_url` como fallback
- opcionalmente `app.settings.kc_notification_dispatch_secret` como fallback
- opcionalmente `app.settings.kc_notification_dispatch_batch_limit` como fallback

---

## Testes

```bash
npm test
npm test -- --runInBand
node scripts/hygiene-check.js
```

---

## QA

- `docs/qa/e2e-checklist.md`
- `docs/qa/rls-smoke.sql`
- `docs/qa/xss-payloads.md`
- `docs/qa/v8.1.11.1-admin-reports-threshold.md`
- `docs/ops/vercel-supabase-invariants.md`

---

## Documentação técnica

| Arquivo | Conteúdo |
|---------|----------|
| `docs/architecture.md` | mapa de dependências JS e padrão IIFE |
| `docs/api-contract.md` | contrato da `KCAPI` |
| `docs/db-schema.md` | tabelas, RLS, triggers e storage |
| `docs/rpc-catalog.md` | catálogo de RPCs |
| `docs/module-schemas.md` | schemas dos 6 módulos |
| `docs/env-vars.md` | variáveis de ambiente |
| `docs/design-system.md` | design system e breakpoints |
| `docs/kc-create-post-audit-v11.31.md` | auditoria formal do hotspot `kc-create-post.js` e plano seguro de decomposição da trilha `v11.31.x` |
| `docs/handoff-claude-code-v11.30.18.md` | prompt estruturado de continuidade para Claude Code após o fechamento da trilha `v11.30.x` |
| `docs/handoff-claude-code-v11.31.0.md` | handoff ampliado para Claude Code após a auditoria do hotspot `kc-create-post.js` |
| `RELATORIO-KINOCAMPUS-V9.md` | relatório técnico consolidado da v9 |
| `CHANGELOG.md` | histórico de releases e fixes |
