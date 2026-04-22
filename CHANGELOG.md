# Changelog

---

## [Unreleased]

### Added

- `v12.3.3`: criado `assets/js/controllers/admin-dashboard.charts.js` com IIFE browser-safe registrado em `window._KCAD.charts`, concentrando 10 exports do dominio visual do dashboard admin: tendencias e agrupamento (`aggregateTrendsByModule`, `renderSearchTrends`), pulso diario (`renderDailyActivitySummary`, `bindDailyActivityChartModal`, `renderDailyActivityChart`), share/alertas (`renderModuleShareTable`, `renderOperationalAlerts`) e ranking (`mapPeriodToRanking`, `loadAdminRanking`, `bindAdminRanking`). O submodulo consome o core via injecao explicita de dependencias/estado (`buildChartsDeps()`), mantendo `_data`, foco de retorno do modal e sequencia de requests do ranking fora do escopo global publico.
- `v12.3.3`: criado `tests/admin-dashboard.charts.test.js` com **22 testes** cobrindo contrato estatico de `window._KCAD.charts`, ordem de scripts em `admin/index.html`, wrappers do controller, agrupamento de tendencias, renderizacao do resumo/graph modal, tabela de share, alertas e ranking com mocks. Baseline expandida de `108/108 suites / 2248/2248 testes` para **`109/109 suites / 2270/2270 testes`**.

- `v12.3.2`: criado `assets/js/controllers/admin-dashboard.audit.js` com IIFE browser-safe registrado em `window._KCAD.audit`, concentrando 9 exports do domínio audit log + export do dashboard admin: resolução de atores (`loadActorsById`, `getActorDisplay`), fetch/paginação/filtro (`loadAuditLog`, `renderAuditRows`, `loadMoreAudit`, `filterAudit`) e exportação (`enableExport`, `exportXLSX`, `exportPDF`). O submódulo encapsula o carregamento sob demanda de `XLSX`/`jsPDF`, preserva o shape de `_data` e consome o core via injeção explícita de dependências/estado (`buildAuditDeps()`).
- `v12.3.2`: criado `tests/admin-dashboard.audit.test.js` com **18 testes** cobrindo contrato estático de `window._KCAD.audit`, ordem de scripts em `admin/index.html`, wrappers do controller, resolução de atores, query/fallback de audit log, renderização de linhas, paginação/filtro e exportação XLSX/PDF com mocks. Baseline expandida de `107/107 suites / 2230/2230 testes` para **`108/108 suites / 2248/2248 testes`**.
- `v12.3.1`: criado `assets/js/controllers/admin-dashboard.metrics.js` com IIFE browser-safe registrado em `window._KCAD.metrics`, concentrando 17 exports do domínio metrics/loaders do dashboard admin: gate de acesso (`checkAccess`), classificação compartilhada de tendências (`classifyTermToModule`) e 15 loaders/fetchers (`loadReportMetrics`, `loadPostStatusMetrics`, `loadPostsCreated`, `loadPostsEdited`, `loadCommentsCount`, `loadSearchCount`, `loadPostsTotal`, `loadUsersTotal`, `loadUsersNew`, `loadVotesCount`, `loadSavedPostsCount`, `loadAuditEventRows`, `loadSearchTrendsData`, `queryCreatedAtRows`, `loadDailyMetrics`). O submódulo reutiliza `window.KCAdminDashboardUtils`, `window.KCAPI`, `window.KCSupabase` e `window.KC_CONSTANTS` via accessors locais, preservando os contratos públicos do dashboard.
- `v12.3.1`: criado `tests/admin-dashboard.metrics.test.js` com **18 testes** cobrindo contrato estático de `window._KCAD.metrics`, ordem de scripts em `admin/index.html`, wrappers do controller e comportamento dos loaders com mocks de `KCAPI`/`KCSupabase`. Baseline expandida de `106/106 suites / 2212/2212 testes` para **`107/107 suites / 2230/2230 testes`**.
- `v12.2.6`: criado `assets/js/kc-utils.presentation.js` com IIFE autossuficiente e namespace `window._KCU.presentation = Object.freeze({...})` exportando 9 funcoes do dominio presentation extraidas de `kc-utils.js`: helpers/inferencias (`cssEscape`, `inferCaronasRoute`, `inferAchadosLocation`, `inferOportunidadesSubcategory`, `inferEventosCategory`), regras visuais (`applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags`) e renderizacao (`renderPostCard`). Dependencias cross-domain resolvidas via lazy accessors `_str()`, `_fmt()`, `_tax()` e `_loc()`.
- `v12.2.6`: criado `tests/kc-utils-presentation.test.js` com **27 testes** cobrindo contrato estatico de `window._KCU.presentation`, inferencias, shape de `applyPresentationRules`, marker tags e HTML retornado por `renderPostCard`. Baseline expandida de `105/105 suites / 2185/2185 testes` para **`106/106 suites / 2212/2212 testes`**.
- `v12.2.5`: criado `assets/js/kc-utils.location.js` com IIFE autossuficiente e namespace `window._KCU.location = Object.freeze({...})` exportando 32 funções do domínio location extraídas de `kc-utils.js`: definições (`getHousingRegionDefinitions`, `getHousingRegionInfoByKey`, `getHousingFeatureDefinitions`, `getHousingFeatureInfoByKey`, `getLostFoundLocationDefinitions`, `getLostFoundLocationInfoByKey`); helpers de texto (`toStringArray`, `scoreHousingLabel`, `pickPreferredHousingLabel`, `formatHousingLabel`, `buildDefinitionAliasMap`, `buildHousingTextParts`, `buildLostFoundTextParts`); emojis (`getHousingFeatureEmoji`, `getLostFoundLocationEmoji`); fuzzy matching (`getHousingFuzzyThreshold`, `getHousingSimilarityScore`, `isCloseHousingAlias`, `findBestFuzzyHousingEntry`); resolvers (`extractHousingRegionHistoryEntries`, `buildHousingRegionHistoryMaps`, `resolveHousingRegion`, `extractHousingFeatureHistoryEntries`, `buildHousingFeatureHistoryMaps`, `resolveSingleHousingFeature`, `resolveHousingFeatures`, `resolveHousingTypeKey`, `resolveHousingTypeFromCandidates`, `resolveCaronasLocation`, `extractLostFoundLocationHistoryEntries`, `buildLostFoundHistoryMaps`, `resolveLostFoundLocation`). Acesso lazy a `_KCU.string` via `_str()` e a `KC_CONSTANTS` via `_const()`; `firstNonEmptyValue` duplicado localmente para evitar dependência cruzada com `_KCU.taxonomy`. Script de patch `scripts/patch-location-split.py` com brace-counting robusto (pula parâmetros via contagem de parênteses antes de buscar `{` do corpo) — resolve o caso `options = {}` como valor default de parâmetro.
- `v12.2.5`: criado `tests/kc-utils-location.test.js` com **101 testes** em 33 `describe` blocks: §1 contrato estático (frozen, exatamente 32 chaves, helpers internos não expostos); §2–§33 comportamento de cada função — cobertura de `resolveHousingRegion` com shape completo, official-exact, alias fuzzy, empty; `resolveCaronasLocation` com campus vs. não-campus; `resolveLostFoundLocation` com emoji; `resolveHousingFeatures` com multi-feature; `buildHousingTextParts` com regiões + features explícitas; fallbacks corretos quando `_KCU.location` ausente. Baseline expandida de `104/104 suites · 2084/2084 testes` para **`105/105 suites · 2185/2185 testes`**.

- `v12.2.4`: criado `assets/js/kc-utils.taxonomy.js` com IIFE autossuficiente e namespace `window._KCU.taxonomy = Object.freeze({...})` exportando 22 funções do domínio taxonomy extraídas de `kc-utils.js`: rótulos de módulo/categoria/subcategoria (`getModuleLabel`, `getModuleIconClass`, `getCategoryLabel`, `getSubcategoryLabel`); utilitários puros (`firstNonEmptyValue`, `formatOpportunityAreaLabel`, `scoreOpportunityAreaLabel`, `pickPreferredOpportunityAreaLabel`, `getOpportunityAreaFuzzyThreshold`, `getOpportunityAreaSimilarityScore`, `isCloseOpportunityAreaAlias`, `getOpportunityAreaEmoji`); definições (`getOpportunityAreaDefinitions`, `getOpportunityAreaInfoByKey`, `buildOfficialOpportunityAreaMaps`, `buildOpportunityTextParts`); resolvers completos (`extractOpportunityAreaHistoryEntries`, `buildHistoryOpportunityAreaMaps`, `findBestOfficialOpportunityArea`, `findBestFuzzyOpportunityArea`, `findBestOfficialContextArea`, `resolveOpportunityArea`). Acesso lazy a `_KCU.string` via `_str()` e a `KC_CONSTANTS` via `_const()` — constantes avaliadas no momento da chamada, não no carregamento do IIFE, permitindo mocking nos testes. Script de patch `scripts/patch-taxonomy-split.py` criado para uso como modelo em splits futuros.
- `v12.2.4`: criado `tests/kc-utils-taxonomy.test.js` com **78 testes** em 23 `describe` blocks: §1 contrato estático (frozen, exatamente 22 chaves em ordem alfabética, helpers internos não expostos); §2–§22 comportamento de cada função — cobertura de `resolveOpportunityArea` com 6 cenários (official-exact, objeto com campo area, empty, custom, shape completo, alias); `buildOfficialOpportunityAreaMaps` com verificação de Map.size e entrada esperada; `getOpportunityAreaFuzzyThreshold` com 3 thresholds; `isCloseOpportunityAreaAlias` com idêntico/distante/vazio; `buildHistoryOpportunityAreaMaps` distinguindo áreas oficiais vs. novas; `findBestOfficialContextArea` com substring e texto vazio. Baseline expandida de `103/103 suites · 2006/2006 testes` para **`104/104 suites · 2084/2084 testes`**.

- `v12.2.3`: criado `assets/js/kc-utils.identity.js` (~85L) com IIFE autossuficiente e namespace `window._KCU.identity = Object.freeze({...})` exportando 5 funções do domínio identity: `normalizeEmail` (trim + lowercase), `getEmailDomain` (extrai domínio após último `@`), `normalizeAllowedDomains` (deduplicação + normalização de lista), `isInstitutionalEmailAllowed` (gate de domínio institucional com fallback permissivo quando lista vazia — padrão UFG), `buildPublicHandle` (slug ≤32 chars com prefixo `@` configurável). Dependência de `buildPublicHandle` em `slugifyText` resolvida via lazy `_str()` sobre `_KCU.string`.
- `v12.2.3`: criado `tests/kc-utils-identity.test.js` com 29 testes em 6 `describe` blocks: §1 contrato estático (frozen, 5 chaves, sem helpers internos); §2 `normalizeEmail` (maiúsculas, espaços, null); §3 `getEmailDomain` (domínio, último @, sem @); §4 `normalizeAllowedDomains` (dedup, null → [], string → []); §5 `isInstitutionalEmailAllowed` (gate UFG completo: domínio na lista, fora da lista, lista vazia = permissivo, email sem @, case-insensitive); §6 `buildPublicHandle` (acentos, limite 32 chars, prefix=false, inputs inválidos). Baseline expandida de `102/102 suites · 1977/1977 testes` para **`103/103 suites · 2006/2006 testes`**.

- `v12.2.2`: criado `assets/js/kc-utils.dom.js` (~110L) com IIFE autossuficiente e namespace `window._KCU.dom = Object.freeze({...})` exportando 4 funções do domínio dom/async extraídas de `kc-utils.js`: `debounce` (debounce clássico com `setTimeout`, wait padrão 120 ms, encaminha args/contexto), `canSelectInputLike` (detecta INPUT/TEXTAREA via `tagName`; helper privado usado em `fallbackCopyText`), `fallbackCopyText` (cópia via `document.execCommand('copy')` com criação de `textarea` temporário, restauração de seleção e foco — v11.13.1 heritage), `copyTextToClipboard` (async: tenta `navigator.clipboard.writeText`, cai para `fallbackCopyText` em caso de negação ou indisponibilidade). Módulo autossuficiente — sem dependência de outros sub-módulos `_KCU.*`. Dependências internas (`fallbackCopyText → canSelectInputLike`, `copyTextToClipboard → fallbackCopyText`) resolvidas no escopo fechado do IIFE.
- `v12.2.2`: criado `tests/kc-utils-dom.test.js` com 23 testes em 5 `describe` blocks: §1 contrato estático (`window._KCU.dom` é frozen, tem exatamente 4 chaves, variáveis internas não expostas); §2 `debounce` (agrupamento de chamadas, encaminhamento de argumentos, delay configurável, padrão 120 ms); §3 `canSelectInputLike` (INPUT/TEXTAREA vs DIV/BUTTON, nodeType, case-insensitive); §4 `fallbackCopyText` (texto vazio, ausência de execCommand, chamada real via mock de document); §5 `copyTextToClipboard` (Clipboard API mock, fallback quando Clipboard falha). Baseline expandida de `101/101 suites · 1954/1954 testes` para **`102/102 suites · 1977/1977 testes`**.

- `v12.2.1`: criado `assets/js/kc-utils.format.js` (151L) com IIFE autossuficiente e namespace `window._KCU.format = Object.freeze({...})` exportando 7 funções do domínio format extraídas de `kc-utils.js`: `timeAgo` (formatação relativa de datas em pt-BR com suporte a min/horas/dias/meses/anos + fallback "Agora mesmo" para desvios de relógio até 5 min), `formatCurrencyBRL` (formata número para moeda pt-BR via `Intl.NumberFormat` com fallback para ambientes sem suporte), `parseBRLNumber` (parseia string "R$ 1.234,56" para número), `clamp` (limitação numérica a intervalo `[min, max]`), `buildProductDetailHref` (constrói URL canônica `_product.html?id=...` com `encodeURIComponent`), `getConditionLabel` (mapeia condição raw para rótulo pt-BR — "Semi-novo", "Novo" ou `beautifyKey` via dependência lazy a `_KCU.string`), `splitPriceText` (divide texto de preço em `{ main, small }` detectando quebras por `\n`, parênteses, separadores `" - "/"•"/"|"` e unidades `/trecho`/`/mês`/etc.). A dependência cruzada de `getConditionLabel` em `_KCU.string.normalizeText` e `_KCU.string.beautifyKey` é resolvida via accessor lazy `_str()` — sem acoplamento em tempo de carregamento.
- `v12.2.1`: criado `tests/kc-utils-format.test.js` com 51 testes em 8 `describe` blocks: §1 contrato estático (`window._KCU.format` é frozen, tem exatamente 7 chaves, helpers privados `_str`/`_normalizeText`/`_beautifyKey` não expostos); §2–8 comportamento de cada função (cobertura completa de `timeAgo` com 12 cenários de data — incluindo futuro, recente, min/horas/dias/meses/anos e data inválida; `formatCurrencyBRL` com locale pt-BR e NaN; `parseBRLNumber` com R$/ponto/vírgula; `clamp` com limites negativos; `buildProductDetailHref` com UUID e `encodeURIComponent`; `getConditionLabel` com semi, novo, desconhecido e null; `splitPriceText` com todos os separadores). Baseline expandida de `100/100 suites · 1903/1903 testes` para **`101/101 suites · 1954/1954 testes`**.

- `v12.2.0`: criado `assets/js/kc-utils.string.js` (133L) com IIFE autossuficiente e namespace `window._KCU.string = Object.freeze({...})` exportando 8 funções do domínio string extraídas de `kc-utils.js`: `titleCase` (capitalização de palavras), `beautifyKey` (snake/kebab → Title Case), `normalizeText` (remove acentos + lowercase + trim), `canonicalCategory` (normaliza + remove `#` + singular pt-BR básico), `slugifyText` (gera slug URL-safe via `normalizeText`), `levenshteinDistance` (algoritmo O(n×m) de distância de edição, helper de fuzzy matching), `escapeHtml` (escapa os 5 caracteres HTML perigosos `& < > " '`), `renderMarkdownInline` (converte markdown inline — bold, italic, code, strikethrough, underline, links, blockquote, list — para HTML, com anti-XSS via `escapeHtml` antes de processar). O namespace `window._KCU` é inicializado em `kc-utils.string.js`, que deve ser o primeiro sub-módulo carregado da cadeia `_KCU.*`.
- `v12.2.0`: criado `tests/kc-utils-string.test.js` com 29 testes em 9 `describe` blocks: §1 contrato estático (`window._KCU.string` é frozen, tem exatamente 8 chaves, nenhuma função interna exposta); §2–9 comportamento de cada função (normalização de acentos, null/undefined sem erro, anti-XSS, renderização de markdown, cálculo de distância de Levenshtein, etc.). Baseline expandida de `99/99 suites · 1874/1874 testes` para **`100/100 suites · 1903/1903 testes`**.

### Changed

- `v12.3.3`: `assets/js/controllers/admin-dashboard.controller.js` reduzido de `1172L` para `738L` (`-434L`, `32 706` bytes), substituindo todo o dominio residual de charts/renderers/ranking por wrappers finos para `window._KCAD.charts` e introduzindo `buildChartsDeps()` para injetar estado compartilhado (`_data`, foco de retorno do modal e sequencia de ranking) sem quebrar o contrato publico do dashboard.
- `v12.3.3`: `admin/index.html` passou a carregar `../assets/js/controllers/admin-dashboard.charts.js` entre `admin-dashboard.audit.js` e `kc-ranking.js`, formalizando a cadeia `shared -> metrics -> audit -> charts -> kc-ranking -> controller`; `tests/admin-dashboard.metrics.test.js` e `tests/admin-dashboard.audit.test.js` foram atualizados para essa ordem. `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` foram sincronizados para registrar `v12.3.3` como concluida, formalizar a nova baseline `109/109 suites / 2270/2270 testes` e apontar `v12.3.4` como proxima iteracao.

- `v12.3.2`: `assets/js/controllers/admin-dashboard.controller.js` reduzido de `1859L` para `1172L` (`-687L`, `48 589` bytes), substituindo o domínio audit log + exportação por wrappers finos para `window._KCAD.audit` e introduzindo `buildAuditDeps()` para injetar estado compartilhado (`_data`, offsets, actor cache e promises de script loader) sem quebrar o contrato público do dashboard.
- `v12.3.2`: `admin/index.html` passou a carregar `../assets/js/controllers/admin-dashboard.audit.js` entre `admin-dashboard.metrics.js` e `kc-ranking.js`, formalizando a cadeia `shared -> metrics -> audit -> kc-ranking -> controller`; `tests/admin-dashboard.metrics.test.js` foi atualizado para essa ordem. `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` foram sincronizados para registrar `v12.3.2` como concluída, formalizar a nova baseline `108/108 suites / 2248/2248 testes` e apontar `v12.3.3` como próxima iteração.
- `v12.3.1`: `assets/js/controllers/admin-dashboard.controller.js` reduzido de `2251L` para `1859L` (`-392L`, `76 473` bytes), substituindo o domínio metrics/loaders por wrappers finos para `window._KCAD.metrics` e reaproveitando `window.KCAdminDashboardUtils` para eliminar o drift local de `classifyTermToModule`, `SERIES_KEYS`, labels e ícones dos módulos nas trilhas de tendências, exportação e resumo diário.
- `v12.3.1`: `admin/index.html` passou a carregar `../assets/js/controllers/admin-dashboard.metrics.js` entre `admin-dashboard.shared.js` e `kc-ranking.js`, preservando a ordem canônica `shared -> metrics -> kc-ranking -> controller`; `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` foram sincronizados para registrar `v12.3.1` como concluída, formalizar a nova baseline `107/107 suites / 2230/2230 testes` e apontar `v12.3.2` como próxima iteração. A rodada também documenta o drift entre o snapshot docs-only de `2034L` em `v12.3.0` e o footprint real de `2251L` encontrado no início do split funcional.
- `v12.3.0`: criado `docs/admin-dashboard-audit-v12.3.md` com auditoria docs-only de `assets/js/controllers/admin-dashboard.controller.js`, medindo o footprint real do hotspot admin em `2034L` e `93 641` bytes, inventariando `104` funcoes top-level (`29` async), 1 HTML consumidor (`admin/index.html`), 1 export publico (`window.KCAdminDashboardRefresh`) e o boundary ja extraido em `admin-dashboard.shared.js` (`382L`, 14 exports, 1 suite com 4 testes). A auditoria organiza o arquivo em 6 grupos naturais (core/access/refresh, loaders Supabase, trends/charts/renderers, audit log, exportacao XLSX/PDF, ranking), lista contratos externos (`KCSupabase`, `KCAPI`, `KCAdminShell`, `KCPullToRefresh`, `KCUtils`, `KC_CONSTANTS`, `XLSX`, `jspdf`, `KCRanking`) e recalibra o plano `v12.3.1`–`v12.3.4` para `window._KCAD.metrics`, `window._KCAD.audit` e `window._KCAD.charts`.
- `v12.3.0`: `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` atualizados para marcar a auditoria do admin como concluida, registrar o snapshot documental então medido em `2034L` e apontar `v12.3.1` como proxima iteracao.
- `v12.2.7`: `scripts/hygiene-check.js` passou a validar, em todos os HTMLs publicos e admin cobertos por `htmlFiles`, a cadeia canonica de `<script defer src="...kc-utils*.js"></script>` na ordem `string -> format -> dom -> identity -> taxonomy -> location -> presentation -> kc-utils.js`, com prefixo `assets/js/` na raiz e `../assets/js/` em `admin/`. A checagem agora falha se houver item faltando, duplicado, extra ou fora de ordem, exibindo `expected` vs `found` por arquivo.
- `v12.2.7`: `README.md`, `RELATORIO-KINOCAMPUS-V12.md` e `CHANGELOG.md` atualizados para formalizar o gate estrutural de `assets/js/kc-utils.js` abaixo de `900L` com valor real `440L`, preservar a baseline `106/106 suites / 2212/2212 testes` e apontar `v12.3.0` como proxima iteracao.
- `v12.2.6`: `assets/js/kc-utils.js` reduzido de `1168L` -> `440L` (`-728L`): 9 corpos do dominio presentation substituidos por delegation wrappers (`cssEscape`, `inferCaronasRoute`, `inferAchadosLocation`, `inferOportunidadesSubcategory`, `inferEventosCategory`, `applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags`, `renderPostCard`). Acumulado desde o monolito original: `2445L` -> `440L` (`-2005L` em 7 splits); gate estrutural `<900L` atingido.
- `v12.2.6`: 22 HTMLs, 12 suites existentes e `RELATORIO-KINOCAMPUS-V12.md`/`README.md`/`CHANGELOG.md` atualizados para inserir `kc-utils.presentation.js` na ordem canonica `string -> format -> dom -> identity -> taxonomy -> location -> presentation -> kc-utils.js`.
- `v12.2.5`: `assets/js/kc-utils.js` reduzido de 1950L → 1168L (−782L): 32 corpos do domínio location substituídos por delegation wrappers; bloco `const { HOUSING_REGION_DEFINITIONS, HOUSING_FEATURE_DEFINITIONS, LOST_FOUND_LOCATION_DEFINITIONS }` removido. Acumulado: 2445L → 1168L (−1277L em 6 splits).
- `v12.2.5`: 22 HTMLs, 12 suites existentes e RELATORIO/README/CHANGELOG atualizados.

- `v12.2.4`: `assets/js/kc-utils.js` reduzido de 2231L → 1950L (−281L): 22 corpos do domínio taxonomy substituídos por delegation wrappers; destructuring de `KC_CONSTANTS` reduzido de 8 para 3 entradas locais. Acumulado: 2445L → 1950L (−495L em 5 splits).
- `v12.2.4`: 22 HTMLs, 12 suites existentes e RELATORIO/README/CHANGELOG atualizados.

- `v12.2.3`: `assets/js/kc-utils.js` reduzido de 2242L → 2231L (−11L): 5 corpos do domínio identity substituídos por thin wrappers. Acumulado: 2445L → 2231L (−214L em 4 splits).
- `v12.2.3`: 22 HTMLs, 12 suites existentes e RELATORIO/README/CHANGELOG atualizados.

- `v12.2.2`: `assets/js/kc-utils.js` reduzido de 2310L → 2242L (−68L): 4 corpos de função do domínio dom substituídos por thin wrappers (`(window._KCU && window._KCU.dom) ? window._KCU.dom.fn(args) : fallback`). Acumulado desde v12.2.0: 2445L → 2242L (−203L). Facade `window.KCUtils` preservado intacto.
- `v12.2.2`: 22 HTMLs atualizados com `<script defer src="kc-utils.dom.js">` entre `kc-utils.format.js` e `kc-utils.js`. Ordem canônica: `string → format → dom → kc-utils.js`.
- `v12.2.2`: 12 arquivos de teste existentes atualizados com `require('../assets/js/kc-utils.dom.js')` na ordem correta.
- `v12.2.2`: `RELATORIO-KINOCAMPUS-V12.md` — §5.1 v12.2.2 marcada ✅; §8.4 adicionada; cabeçalho atualizado para 102/1977.
- `v12.2.2`: `README.md` — nova linha v12.2.2 em "Entregas Recentes"; "Status atual" atualizado.

- `v12.2.1`: `assets/js/kc-utils.js` reduzido de 2380L → 2310L (−70L): 7 corpos de função do domínio format substituídos por thin wrappers de uma linha (`(window._KCU && window._KCU.format) ? window._KCU.format.fn(args) : fallback`) com comentário explícito de delegação. Facade `window.KCUtils = Object.freeze({...})` preservado intacto com as mesmas 42 chaves — zero breaking change para consumidores. Acumulado de redução em `kc-utils.js` desde v12.2.0: 2445L → 2310L (−135L).
- `v12.2.1`: 22 HTMLs atualizados com `<script defer src="kc-utils.format.js">` inserido entre `<script defer src="kc-utils.string.js">` e `<script defer src="kc-utils.js">` (17 páginas raiz + 5 páginas admin com path `../assets/js/`), garantindo a ordem de carregamento obrigatória `string → format → kc-utils.js`.
- `v12.2.1`: 12 arquivos de teste existentes atualizados para adicionar `require('../assets/js/kc-utils.format.js')` após `require('../assets/js/kc-utils.string.js')` e antes de `require('../assets/js/kc-utils.js')` em seus `beforeAll`/`beforeEach`: `kc-utils.test.js`, `kc-utils-expanded.test.js`, `kc-utils-resolvers.test.js`, `kc-filters.test.js`, `a11y.test.js`, `anti-spam.test.js`, `kc-api-client.test.js`, `kc-api-notification-preferences-contract.test.js`, `kc-api-notifications-contract.test.js`, `kc-api-session-swr.test.js`, `local-adapter.test.js`, `post-analytics.test.js`.
- `v12.2.1`: `RELATORIO-KINOCAMPUS-V12.md` atualizado — cabeçalho `Estado desta fase` reflete v12.2.1 concluída e próxima iteração v12.2.2; §5.1 linha `v12.2.1` marcada ✅; nova §8.3 adicionada com objetivo, escopo entregue, tabela de funções extraídas, validação e próxima iteração.
- `v12.2.1`: `README.md` atualizado — nova linha `v12.2.1` no topo de "Entregas Recentes"; "Status atual" reflete conclusão do segundo split e próxima iteração `v12.2.2`.

- `v12.2.0`: `assets/js/kc-utils.js` reduzido de 2445L → 2380L (−65L): 8 corpos de função do domínio string substituídos por thin wrappers de uma linha (`(window._KCU && window._KCU.string) ? window._KCU.string.fn(args) : fallback`) com comentário explícito de delegação. Facade `window.KCUtils = Object.freeze({...})` preservado intacto com as mesmas 42 chaves — zero breaking change para consumidores.
- `v12.2.0`: 22 HTMLs atualizados com `<script defer src="kc-utils.string.js">` inserido imediatamente antes de `<script defer src="kc-utils.js">` (17 páginas raiz + 5 páginas admin com path `../assets/js/`), garantindo a ordem de carregamento obrigatória `string → kc-utils.js`.
- `v12.2.0`: 10 arquivos de teste existentes atualizados para adicionar `require('../assets/js/kc-utils.string.js')` antes de `require('../assets/js/kc-utils.js')` em seus `beforeAll`/`beforeEach`: `kc-utils.test.js`, `kc-utils-expanded.test.js`, `kc-utils-resolvers.test.js`, `kc-filters.test.js`, `a11y.test.js`, `anti-spam.test.js`, `kc-api-client.test.js`, `kc-api-notification-preferences-contract.test.js`, `kc-api-notifications-contract.test.js`, `kc-api-session-swr.test.js`, `local-adapter.test.js`, `post-analytics.test.js`.
- `v12.2.0`: `RELATORIO-KINOCAMPUS-V12.md` atualizado — cabeçalho `Estado desta fase` reflete v12.2.0 concluída, baseline expandida para 100/1903; §5.1 linha `v12.2.0` marcada ✅ com entregáveis reais; nova §8.2 adicionada com objetivo, escopo entregue, tabela de funções extraídas, validação, correções diagnosticadas e próxima iteração.
- `v12.2.0`: `README.md` atualizado — nova linha `v12.2.0` no topo de "Entregas Recentes"; "Status atual" e "Progresso atual" refletem a conclusão do split e a próxima iteração `v12.2.1`.

### Docs

- `v12.1.0`: criado `docs/kc-utils-audit-v12.1.md` com auditoria doc-only formal de `assets/js/kc-utils.js` (2445L, ~100KB, ~95 funções das quais 42 públicas congeladas no facade `window.KCUtils`, 17 HTMLs consumidores diretos, 30 arquivos JS com dependência, 136+ callsites, 1106L de cobertura de testes distribuída em 3 suites). O documento mapeia 7 domínios internos com footprint por linha (`string` ~180L, `format` ~120L, `dom` ~100L, `identity` ~60L, `taxonomy` ~420L, `location` ~1050L, `presentation` ~600L), inventaria consumers com contagem de métodos, e expande o plano original de 5 splits para 7 iterações v12.2.0–v12.2.6 + gate v12.2.7 (justificado pelo tamanho real dos domínios `location` e `presentation`, antes subestimados). Entrega ainda matriz de risco por domínio, grafo de dependência entre sub-módulos `window._KCU.*`, ordem obrigatória de carregamento HTML (`constants → string → format → dom → identity → taxonomy → location → presentation → facade`), padrão de teste de contrato estático reutilizável e DoD explícito da iteração. Nenhum arquivo JS, HTML ou teste foi alterado — baseline Jest preservada em `99/99` suites · `1874/1874` testes, hygiene `8.6.0` ✓.
- `v12.1.0`: `RELATORIO-KINOCAMPUS-V12.md` atualizado — cabeçalho "Estado desta fase" passou a refletir a conclusão de `v12.1.0` e a próxima iteração `v12.2.0`, tabela do roadmap `§5.1 Camada A` expandida de 5 para 7 linhas (mais gate) com entregáveis numéricos concretos por iteração (ex.: `v12.2.0 string — 8 funções, ~180L movidas, ~12 testes novos`), `§8.0` marcada como concluída com referência ao PR `#393`, nova seção `§8.1` adicionada com tabela de descobertas da auditoria, justificativa das decisões (7 vs 5 splits), escopo explícito e plano de validação.
- `v12.1.0`: `README.md` atualizado — nova linha no topo da tabela "Entregas Recentes" descrevendo os achados da auditoria (2445L · 17 HTMLs · 30 consumers · 7 domínios · 7 splits planejados), linha `v12.0.0` anotada com o PR `#393` de merge, seção "Progresso atual" reescrita para apontar v12.1.0 concluída e v12.2.0 como próxima iteração com escopo definido.

---

## [12.0.0-planning] - 2026-04-20 — Abertura do ciclo v12 (*Consolidação & Qualidade Sistêmica*)

Abertura formal da trilha v12 em modo docs-only, estabelecendo a continuidade controlada da plataforma pós-v11.33.7. Nenhum arquivo JS, HTML ou teste foi alterado nesta iteração. Baseline preservada em `99/99` suites e `1874/1874` testes.

### Docs

- `v12.0.0`: criado `RELATORIO-KINOCAMPUS-V12.md` espelhando a estrutura do `RELATORIO-KINOCAMPUS-V11.md`: cabeçalho com tabela de abertura (data `2026-04-20`, linha-base `kinocampus-V11.0-foundations`, versão-alvo `v12`, escopo macro declarado), resumo executivo com o tema "Consolidação & Qualidade Sistêmica" em três camadas paralelas (A/continuação tática de splits IIFE dos hotspots remanescentes, B/qualidade sistêmica com feature flags + Playwright E2E + Lighthouse CI + a11y + i18n runtime, C/resiliência com Service Worker e telemetria cliente), seção de fontes obrigatórias de verdade herdadas da v11, inventário atual dos namespaces congelados (`_KCAPI.*` com 11 módulos, `_KCSA.*` com 10 sub-adapters), tabela dos hotspots JS remanescentes (>1000L) com prioridade de split, tabela dos gaps estruturais (E2E, Lighthouse, Service Worker, feature flags, i18n), premissas operacionais (branch-per-iteração, gate Jest/hygiene obrigatório, comunicação pt-BR), roadmap completo com ~30 iterações mapeadas de `v12.0.0` a `v12.13.0`, análise de risco × mitigação por camada e Definition of Done com 4 blocos de critérios verdes exigidos para encerrar a v12.
- `v12.0.0`: `README.md` atualizado — linha "Status atual" referencia a abertura da trilha `v12.0.0`, tabela "Entregas Recentes" recebe primeira linha da v12, seção "Progresso atual" reescrita para refletir o estado v12 (iteração corrente, v11 encerrada, baseline verde, sub-módulos operacionais, próxima iteração `v12.1.0`), nova seção "Planejamento v12" adicionada com as três camadas resumidas e link para o novo relatório, seção "Planejamento v11" preservada como histórico sob cabeçalho explícito.
- `v12.0.0`: `CHANGELOG.md` recebe esta entrada de abertura `[12.0.0-planning]`, alinhando com o padrão usado em `[11.0.0]` (entrada formal consolidada no release gate final, `v12.13.0`).

---

## [11.0.0] - 2026-04-12 — Trilha v11: Auditoria, Hardening e i18n (v11.1.0–v11.25.0)

Consolidação de 25 iterações da trilha v11 (v11.1.0–v11.25.0), cobrindo: auditoria e hardening dos controllers, paridade de contratos KCAPI/adapters, persistência incremental SWR, notificações in-app e multicanal (email, WhatsApp), módulo de i18n e aplicação nos componentes core. Estado final: `52/52` suites, `565/565` testes, hygiene `8.6.0`, produção `dpl_9Pm65XqZSx26BWRNAkWu59zR8A1C` (`www.kinocampus.com.br`).

### Added
- `v11.24.1`: módulo `kc-i18n.js` com `window.KCi18n` — dicionário pt-BR de 120+ entradas em 10 categorias (`common`, `nav`, `form`, `error`, `feedback`, `time`, `empty`, `a11y`, `module`, `uxw`), `KCi18n.t(key, params)` com interpolação `{chave}` e fallback à chave crua, `KCi18n.n(value, opts)` via `Intl.NumberFormat` para moeda BRL/percentual/compacto, `KCi18n.keys()` para auditoria. Suite `kc-i18n.test.js` com 35 testes. Nenhum arquivo existente modificado.

### Changed
- `v11.24.2`: `kc-notifications.js` passou a usar `window.KCi18n.t()` com graceful degradation para 10 strings em `timeAgo`, `getDropdownCountLabel`, `buildDropdownHTML` e `clearAllNotifications`; `kc-auth.ui.js` passou a usar `window.KCi18n.t()` para 28 chamadas `setStatus()` + 1 `showToast()` + 2 `userMeta`; 22 HTMLs passaram a carregar `kc-i18n.js` após `kc-constants.js`. Dicionário expandido com 11 chaves `notif.*` e 26 chaves `auth.*`.
- `v11.24.3`: templates HTML dinâmicos de `kc-auth.ui.js` (`ensureModal()`, `buildDropdownContent()`) passaram a usar helper `_t(key, fallback)` para 24 substituições em painéis forgot (5), resend (6), user (6) e dropdown (7); dicionário expandido com 30 chaves `auth.modal-*` e 5 chaves `auth.dropdown-*`.

### Fixed
- `v11.23.0`: `tests/post-analytics.test.js` passou a invalidar o cache de analytics no `beforeEach` e a forcar o caminho do driver ativo com `force: true`, eliminando a fragilidade introduzida pela hidratacao de sessao e revalidacao silenciosa da trilha de analytics.
- `v11.23.0`: `package.json` deixou de anunciar a linha antiga `V8.2.x`, alinhando a metadata do repositorio ao estado real da base funcional e documental atual.
- `v11.23.0`: o release gate final da rodada principal da v11 foi consolidado com `51/51` suites, hygiene verde no runtime canonico `8.6.0`, smoke remoto no dominio publicado e residuals operacionais do Supabase documentados sem abrir refactor novo.
- `v11.22.0`: criada a migration `v11.22.0.0_notification_dispatch_scheduler.sql`, adicionando a tabela privada `notification_dispatch_runs`, o helper `kc_trigger_notification_dispatch(...)` e o job `pg_cron` `kc-dispatch-notification-outbox` para consumo versionado da outbox externa.
- `v11.22.0`: `kc-dispatch-notification-outbox` passou a persistir `execution_id`, `source`, `provider_ready`, `provider_issues` e resumos de `dry_run`/`dispatch` em `notification_dispatch_runs`, endurecendo a observabilidade operacional sem alterar o contrato de entrega por canal.
- `v11.22.0`: atualizados `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/env-vars.md` e `docs/ops/vercel-supabase-invariants.md` para registrar o scheduler, os novos settings de banco e a próxima trilha obrigatória da v11.
- `v11.21.1`: criada a migration `v11.21.1.0_notification_whatsapp_channel.sql`, adicionando a tabela privada `notification_channel_targets`, o helper `kc_count_recent_notification_deliveries(...)` e a ampliacao de `kc_resolve_notification_delivery_destination(...)` para resolver destinos privados de WhatsApp com consentimento explicito.
- `v11.21.1`: `settings.html`, `settings.controller.js`, `account-profile.shared.js`, `kc-api.client.js`, `supabase.adapter.js` e `local.adapter.js` passaram a expor configuracao privada de WhatsApp com normalizacao E.164, preview seguro e persistencia separada do WhatsApp publico do perfil.
- `v11.21.1`: `kc-dispatch-notification-outbox` passou a despachar `whatsapp` via Twilio, com rate limit por usuario, masking do destino, previews em `dry_run` e gating operacional quando `KC_NOTIFICATION_WHATSAPP_*` ainda nao existirem no projeto.
- `v11.21.0`: adicionada a migration `v11.21.0.0_notification_email_channel.sql`, criando os helpers `kc_claim_notification_delivery_batch(...)` e `kc_record_notification_delivery_attempt(...)` para claim atomico da fila externa e registro consistente de tentativas.
- `v11.21.0`: `kc-dispatch-notification-outbox` passou a gerar preview de envelope em `dry_run` e a despachar o canal `email` via `Resend` quando `dryRun=false` e os segredos `KC_NOTIFICATION_EMAIL_*` estiverem configurados.
- `v11.21.0`: o dispatcher de email passou a registrar sucesso/falha em `notification_delivery_attempts`, manter backoff por `next_attempt_at` e devolver gating explicito (`email_provider_not_configured`) quando o provider ainda nao estiver operacional no projeto.
- `v11.20.2`: criada a fundacao assincrona de entrega externa com as tabelas privadas `notification_delivery_outbox` e `notification_delivery_attempts`, separando fila e historico de tentativas da trilha canonica `public.notifications`.
- `v11.20.2`: os triggers de comentario, reply, voto e expiracao passaram a emitir eventos via `kc_emit_notification_event(...)`, preservando a notificacao in-app quando `in_app` esta ligado e criando rows de outbox para canais externos sem acoplar provider aos triggers.
- `v11.20.2`: `kc_notify_on_vote()` foi corrigida para o contrato real de `post_votes`, usando `new.voter_id` e voto positivo `direction = 'hot'` em vez da semantica antiga `user_id` / `up`.
- `v11.20.1`: criada a camada privada `notification_preferences` com defaults canônicos e backfill-safe, permitindo persistir preferências por evento/canal sem acoplar isso a `profiles.social_links`, `contact_primary_method` ou ao WhatsApp público do perfil.
- `v11.20.1`: `settings.html` e `settings.controller.js` passaram a expor uma UI dedicada para configurar notificações por evento e por canal, com salvamento via `KCAPI.getNotificationPreferences()` e `KCAPI.updateNotificationPreferences()`.
- `v11.20.1`: `supabase.adapter.js` e `local.adapter.js` passaram a suportar leitura/escrita das preferências de notificação, enquanto os triggers atuais de comentário, reply, voto positivo e expiração de post passaram a respeitar o canal `in_app`.
- `v11.20.0`: `kc-notifications.js` passou a manter um root estavel do dropdown com reposicionamento explicito, `aria-expanded`, fechamento consistente e delegacao unica de clique, evitando drift apos rerenders e deixando o sino visualmente menos apertado no shell publico.
- `v11.20.0`: o dropdown passou a suportar a acao `Limpar` com confirmacao explicita, preservando `Marcar todas`, badge e a trilha in-app como fonte canonica em `public.notifications`.
- `v11.20.0`: `KCAPI`, `local.adapter.js` e `supabase.adapter.js` passaram a expor `clearNotifications()`, enquanto o subscribe realtime do Supabase foi endurecido para tratar envelopes `INSERT`, `UPDATE` e `DELETE`.
- `v11.19.0`: adicionada a migration `v9.3.3.0_supabase_operational_rls_fk.sql` para otimizar as policies de `notifications`, `post_view_events` e `kc_invited_emails` com `initplan` (`(select auth.uid())`) e eliminar overlap de policies SELECT permissivas nas trilhas de analytics e convites.
- `v11.19.0`: adicionados os índices `idx_kc_invited_emails_invited_by` e `idx_post_view_events_user_id`, cobrindo os foreign keys ainda sinalizados pelo Advisor do Supabase.
- `v11.18.0`: `KCAPI.getProfileHighlightsCount(...)` passou a aceitar `params` e a encaminhá-los corretamente para o driver ativo, eliminando o drift de assinatura em relação a `getProfileHighlights(...)` e `getMySavedPostsCount(...)`.
- `v11.18.0`: `local.adapter.js` e `supabase.adapter.js` passaram a aceitar a mesma assinatura de `getProfileHighlightsCount(profileId, params = {})`, preservando a semântica highlight-only e a paridade de fallback entre os drivers.
- `v11.17.0`: `admin-banners.controller.js` passou a validar acesso administrativo via `KCAPI.getCurrentUser()` + consulta a `profiles.is_admin`, alinhando a tela de banners ao mesmo contrato moderno já usado nas outras superfícies admin.
- `v11.17.0`: a tela admin de banners deixou de carregar a listagem após timeout sem sessão validada, substituindo o fallback implícito por uma espera controlada de hidratação de auth e por mensagens explícitas de erro/acesso negado.
- `v11.16.0`: o preload do shell administrativo passou a ser liberado por `admin-shell.js`, removendo a duplicação de scripts inline que faziam `document.documentElement.classList.remove('kc-loading')` em cada uma das 5 páginas admin.
- `v11.16.0`: as 5 telas administrativas passaram a compartilhar o mesmo bootstrap HTML com `kc-loading kc-theme-preload`, enquanto `admin-shell.css` assumiu a regra de congelar transições durante o preload em vez de depender de blocos inline divergentes.
- `v11.15.2`: `account-setup.controller.js` passou a normalizar `social_links` e `social_visibility` durante `populateForm()`, reaproveitando os helpers shared e evitando que toggles de visibilidade antigos vazem entre hidratações parciais do onboarding.
- `v11.15.2`: a coleta e hidratação das redes sociais do onboarding agora dependem de listas canônicas de chaves derivadas de `SOCIAL_ORDER`, com reset determinístico de todos os checkboxes e preservação do default de WhatsApp apenas quando o perfil ainda não possui configuração salva de visibilidade.
- `v11.15.1`: `account-setup.controller.js` passou a gerar a prévia de contato do onboarding via `buildContactAction`, alinhando o bloco de conta ao comportamento real do CTA público dos anúncios.
- `v11.15.1`: a prévia do onboarding agora reage corretamente ao toggle `Permitir contato público nos anúncios`, exibindo a alternativa segura de `Ver perfil` quando o contato público está desligado.
- `v11.15.0`: `settings.controller.js` passou a gerar o `postUrl` da prévia de contato a partir de `KCUtils.buildProductDetailHref('demo')`, alinhando o bloco de conta/perfil ao caminho canônico `_product.html?id=...` e removendo o drift residual com `product.html?id=demo`.
- `v11.15.0`: adicionada regressão estática em `tests/settings-contact-preview-links.test.js` para impedir que o preview de contato em `settings` volte a fabricar URLs humanas legadas fora do helper canônico.
- `v11.14.0`: `profile.controller.js` e `my-posts.controller.js` passaram a usar a rota canônica `_product.html?id=...` nas navegações humanas para detalhe de publicação, removendo o drift residual com `product.html?id=...` nessas superfícies.
- `v11.14.0`: `KCUtils` passou a expor `buildProductDetailHref(...)`, permitindo que perfil e listagens do usuário compartilhem a mesma construção de URL para o detalhe da publicação.
- `v11.13.1`: `product.controller.js` passou a reutilizar um helper compartilhado de cópia com fallback para `document.execCommand('copy')`, deixando o compartilhamento por cópia funcional mesmo em navegadores com restrição à Clipboard API.
- `v11.13.1`: os popovers de `Compartilhar`, `Salvar` e `Marcar na Agenda` na página de produto passaram a depender de um único listener global de `Escape`, reduzindo wiring duplicado e drift interno entre as três ações.
- `v11.13.1`: o fluxo de `Copiar link` passou a registrar tracking de compartilhamento também quando a cópia é concluída com sucesso, alinhando a ação de link ao caminho já existente do WhatsApp.
- `v11.13.0`: `kc-notifications.js` passou a manter o dropdown operacional após rerenders internos, movendo as ações de `Marcar todas como lidas` e clique dos itens para delegação no root estável do componente.
- `v11.13.0`: o dropdown agora reaplica o agendamento de leitura visível após rerenders e limpa timers pendentes no fechamento, evitando que a UI perca ações quando novas notificações chegam em realtime.
- `v11.12.0`: `kc-create-post.js` passou a derivar um conjunto canônico de campos ativos antes de montar o payload final, impedindo que valores condicionais antigos como `condicao`, `orcamento`, `recompensa`, `entrega`, `vagas`, `regimeContratacao` e `preco` vazem entre combinações diferentes do formulário.
- `v11.12.0`: adicionadas regressões em `tests/kc-create-post-active-fields.test.js` para compra e venda, caronas e eventos, travando o comportamento de campos ativos sem apagar o rascunho preservado no modal.
- `v11.11.0`: removidas as implementações sombreadas de `addComment`, `normalizeCommentForRender`, `_renderCommentList`, `deleteComment` e `submitComment` em `kc-comments.js`, reduzindo drift interno sem alterar contratos públicos de comentários, replies ou renderização.
- `v11.11.0`: adicionadas regressões para reply local com `parentId`, exclusão local em cascata e prevenção de reintrodução de declarations duplicadas em `tests/kc-comments-shadow-cleanup.test.js`.
- `v11.10.0`: `KCAPI` passou a expor snapshot de sessão, refresh silencioso e invalidação explícita para analytics de produto e comentários Supabase, reduzindo spinner e fetch redundante na página de detalhe sem mexer em contratos públicos.
- `v11.10.0`: `product.controller.js` reaproveita analytics do autor a partir de cache de sessão e só rerenderiza o painel quando os números realmente mudam.
- `v11.10.0`: `kc-comments.js` passou a hidratar a lista de comentários do produto a partir de snapshot local antes do refresh em segundo plano, com invalidação após criação, like, edição e exclusão.
- `v11.9.0`: `Top Contribuidores` passou a reutilizar snapshot de sessão com revalidação silenciosa e deduplicação de request em `kc-ranking.js`, evitando spinner e rerender integral desnecessários na home e nas sidebars dos módulos ao recarregar a página ou alternar o período.
- `v11.9.0`: `voting.js` passou a persistir score e direção de voto por sessão, reaplicando `kc-vote-score` e estado ativo imediatamente após reload e deixando o refresh visível condicionado à expiração ou ausência do snapshot local.
- `v11.8.0`: removido o bloco redundante de normalização dentro de `localCreatePost`, deixando `prepareLocalPostForPersistence(...)` como fonte única de preparação do payload local, com teste direto de regressão para criação de post em `compra-venda`.
- `v11.7.0`: endurecida a paridade entre `local.adapter.js` e `kc-api.client.js`, adicionando suporte local para perfil, mutações de post, posts do usuário, salvos, highlights, notificações e convites, com testes de contrato para evitar regressões entre `KCAPI`, `LocalAdapter` e `SupabaseAdapter`.
- `v11.6.0`: endurecido o mobile em iOS Safari ao impedir que `kc-pull-to-refresh.js` sequestre gestos horizontais do hero, `kc-ranking-users`, `kc-feed-tabs` e `kc-*-mobile-rail`, além de liberar `pinch-zoom` no auth modal e no `kc-create-modal` e fixar `font-size: 16px` nos inputs do auth card para evitar auto-zoom.
- `v11.5.0`: restaurado o `Top Contribuidores` dos 6 módulos públicos ao substituir o bootstrap inline de `kc-ranking.js` por carregamento externo deferido, compatível com a `Content-Security-Policy` de produção em `vercel.json`.

### Docs
- `v11.25.0`: `docs/roadmap-v11.25-v11.30.md` criado com 16 iterações planejadas em ordem crescente de risco: drift documental (v11.25.x), cobertura de testes (v11.26.x), hardening iOS/Safari (v11.27.x), paridade entre equivalentes (v11.28.x), extensão SWR (v11.29.x) e refactor de hotspots monolíticos (v11.30.x).
- `v11.24.0`: `docs/i18n-a11y-uxwriting-plan.md` criado com estratégia incremental de i18n em 3 fases (infraestrutura, componentes core, templates dinâmicos), análise de risco de expansão textual, impacto SEO e critérios QA por subfase.
- `v11.23.0`: adicionados `docs/qa/report-v11.23.0-run1.md` e o novo mapa limpo de `docs/qa/README.md`, registrando o release gate final da rodada principal da v11 e deixando `v11.24.0` como proxima fase obrigatoria em modo planejamento-only.
- `v11.22.0`: consolidado o fechamento documental da fase com a PR `#278`, preview `dpl_DueeQMVYa9FVFeRvgYCH1D6Kg98c`, deploy de produção `dpl_HMTvL1ET8uLgW8NNwitLN5of3HyW` e validação publicada em `www.kinocampus.com.br`.
- `v11.22.0`: o `RELATORIO-KINOCAMPUS-V11.md` passou a reservar a trilha futura `v11.24.x` para i18n, acessibilidade e UX Writing, exigindo um relatório inicial em `ETAPA 1`, `ETAPA 2` e `ETAPA 3` antes de qualquer implementação dessa frente.
- `v11.21.1`: atualizados `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/api-contract.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/env-vars.md` e `docs/ops/vercel-supabase-invariants.md` para registrar a trilha privada de WhatsApp, os novos metodos de `KCAPI`, a tabela `notification_channel_targets`, os segredos do provider e a continuidade da v11 em `v11.22.0`.
- `v11.21.0`: atualizados `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/db-schema.md`, `docs/rpc-catalog.md` e `docs/ops/vercel-supabase-invariants.md` para registrar o canal de email, os helpers SQL novos, o dispatcher via `Resend` e o gating operacional por segredos de provider.
- `v11.21.0`: fechamento documental consolidado com a PR `#275`, preview `dpl_8sNm4iyBp1i63ekFfmT3CJ2Pmigm`, deploy pós-merge `dpl_ES6C1Z3PbMd9HzWDZ5DaS3hLy3KU` e validação publicada em `www.kinocampus.com.br`.
- `v11.20.2`: atualizados `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/db-schema.md`, `docs/rpc-catalog.md` e `docs/ops/vercel-supabase-invariants.md` para registrar a nova fundacao de outbox, a Edge Function `kc-dispatch-notification-outbox`, a correcao do trigger de voto e a continuidade da v11 em `v11.21.0`.
- `v11.20.1`: atualizado o `README.md` e o relatório v11 para registrar a conclusão da fase de preferências por evento/canal, a PR `#271`, o preview `dpl_HrWK6p9ugp8LZ9PSfKgLbJ4m8Q7U` e o deploy de produção `dpl_BGPST16nsxuGXP4gbgWzAPDbmTSz`.
- `v11.20.1`: atualizados `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `docs/api-contract.md` e `docs/db-schema.md` para refletir a nova trilha de preferências por evento/canal, a migration `v11.20.1.0_notification_preferences.sql` e a continuidade da v11 em `v11.20.2`.
- `v11.20.0`: atualizado o `README.md` e o relatorio v11 para registrar o fechamento do shell in-app de notificacoes e deixar `v11.20.1` explicita como proxima fase da trilha multicanal.
- `v11.20.0`: sincronizado `docs/api-contract.md` com o novo contrato de notificacoes, incluindo `KCAPI.clearNotifications()` e o envelope de realtime usado pelos consumers do dropdown.
- `v11.19.1`: registrado o diagnóstico de que o sino de notificações não está sendo cortado por `overflow`, mas visualmente apertado pela geometria atual do shell e pela sobreposição do badge.
- `v11.19.1`: o relatório v11 e o README passaram a desdobrar a trilha futura de notificações em `v11.20.0` a `v11.23.0`, separando hardening in-app, preferências por canal, fundação assíncrona, e-mail, WhatsApp e release gate final.
- `v11.19.1`: fechamento documental sincronizado com o merge da PR `#267` e o deploy de produção `dpl_DaSid6uAaMKpnLqGMnc88hhCZkeZ`, já publicado em `www.kinocampus.com.br`.
- `v11.19.0`: `docs/db-schema.md`, `docs/rpc-catalog.md` e `docs/ops/vercel-supabase-invariants.md` passaram a refletir a trilha real de convites externos, os novos índices de cobertura e os residuals operacionais do Supabase que seguem fora do escopo da migration.
- `v11.19.0`: atualizado o `README.md` e o relatório v11 para registrar a auditoria operacional do Supabase como fase concluída da rodada e abrir explicitamente a continuidade em `v11.20.0`.
- `v11.19.0`: fechamento documental consolidado com preview `dpl_YyTeTEZ3gnxYYCc2a2TL3FXVV4Ff`, deploy de produção `dpl_J8VA2ur4bwJn4uffHV8eNuVouh3G` e validação publicada em `www.kinocampus.com.br`.
- `v11.18.0`: atualizado o `README.md` e o relatório v11 para registrar o fechamento da rodada contratual pequena entre `KCAPI` e adapters e abrir explicitamente a continuidade em `v11.19.0`.
- `v11.18.0`: fechamento documental consolidado com a PR funcional `#263`, preview `dpl_3GNRcm9EzwCwgcWRFkZrN8j4kSpv` e deploy automático pós-merge `dpl_3LstWGN6dbR65McLd9hoEZiDQUdk`, todos homologados via Vercel MCP.
- `v11.17.0`: atualizado o `README.md` e o relatório v11 para registrar a primeira fatia de controller do admin pós-v10 e abrir explicitamente a continuidade em `v11.18.0`.
- `v11.17.0`: fechamento documental consolidado com a PR funcional `#261`, preview `dpl_EHA4UFZkbLASBPiQTFc45mfWJUnx`, deploy de produção `dpl_EAzPU5vMhD6wmyYyWPBYxgjRj44R` e validação publicada em `www.kinocampus.com.br`.
- `v11.16.0`: atualizado o `README.md` e o relatório v11 para registrar o início da consolidação do admin pós-v10 e abrir explicitamente a continuidade em `v11.17.0`.
- `v11.16.0`: fechamento documental consolidado com a PR `#259`, preview `dpl_Cxd3cRgJHpqfRNXC9wR1zdZ8rSch`, deploy de produção `dpl_JQL419g5PzKoNrr5uDi386YVwQzK` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.2`: atualizado o `README.md` e o relatório v11 para registrar a terceira fatia de `account-setup`, fechar a macrofase atual de conta/onboarding/settings e abrir explicitamente a continuidade em `v11.16.0`.
- `v11.15.2`: fechamento documental consolidado com a PR `#257`, preview `dpl_CPiGz5Y1hnGzSg58ean6GRimAj3d`, deploy de produção `dpl_9UDrj8vb3NkJzqDPPFZmeqAgUasq` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.1`: atualizado o `README.md` e o relatório v11 para registrar esta segunda fatia de `account-setup`/onboarding e abrir explicitamente a continuidade em `v11.15.2`.
- `v11.15.1`: fechamento documental consolidado com a PR `#255`, preview `dpl_5cAB1wgjGki748PKLeYFqEAgp83J`, deploy de produção `dpl_4YBqUWRySXoXdeFVU5pjQk34qbfY` e validação publicada em `www.kinocampus.com.br`.
- `v11.15.0`: atualizado o `README.md` e o relatório v11 para registrar esta primeira fatia de `settings`/conta e abrir explicitamente a continuidade em `v11.15.1`.
- `v11.15.0`: fechamento documental consolidado com a PR `#253`, preview `dpl_7iH9AyEcMsviriav3hwCQUfuv1g6`, deploy de produção `dpl_4iiQjG2zjNUhYyo6Z3n9M6D3yhGp` e validação publicada em `www.kinocampus.com.br`.
- `v11.14.0`: atualizado o `README.md` e o relatório v11 para registrar a rodada inicial de perfil/`my-posts`, deixando `v11.15.0` como próxima iteração sugerida da sequência.
- `v11.13.1`: atualizado o `README.md` e o relatório v11 para registrar o hardening dos popovers da página de produto como continuidade da macrofase `v11.13.x`, deixando `v11.14.0` explícita como próxima iteração sugerida.
- `v11.13.0`: atualizado o `README.md` e o relatório v11 para registrar esta fatia como início da macrofase de produto/interações sociais e abrir explicitamente a continuidade em `v11.13.1`.
- `v11.12.0`: atualizado `docs/module-schemas.md` para refletir a categoria `Ingressos` em `compra-venda` e sincronizado o `README.md` com o novo estado da fase ativa da v11.
- `v11.11.1`: reformulado o roadmap da v11 no relatório para uma sequência contínua e executável de fases `v11.12.0` a `v11.21.0`, deixando explícita a próxima iteração sugerida e o fechamento esperado da rodada.
- `v11.1.0`: baseline documental da v11 iniciada com sincronização entre `README.md`, `RELATORIO-KINOCAMPUS-V11.md`, `CHANGELOG.md` e as docs técnicas estruturais (`docs/index.md`, `docs/architecture.md`, `docs/db-schema.md`, `docs/rpc-catalog.md`, `docs/api-contract.md`, `docs/design-system.md`, `docs/env-vars.md`).
- Registrado explicitamente o drift entre a linha funcional/documental `v10/v11` e a versão canônica embutida `8.6.0` que ainda governa parte do frontend e o `scripts/hygiene-check.js`.

---

## [10.0.0] - 2026-04-08 - Admin Panel Overhaul (PRs #215-#222)

### Changed
- Shell administrativo unificado com navegação consistente, active-link mais robusto e responsividade consolidada em `assets/css/admin-shell.css`.
- Controllers admin endurecidos com guardas de estado, paginação mais segura, UX defensiva e redução de listeners duplicados.
- Fluxos administrativos de ajuda e moderação migrados para caminhos server-side mais consistentes, preservando a fachada pública da `KCAPI`.

### Added
- Migration `v10.0.0.0_admin_search_posts_full.sql` com a RPC `public.kc_admin_search_posts_full(...)`.
- Migration `v10.0.1.0_admin_help_requests_pagination.sql` com a RPC `public.kc_admin_list_help_requests_paged(...)`.

### Fixed
- Dashboard admin com debounce/cancelamento mais previsíveis, correções em audit log, export, ranking e modal.
- Reports admin com paginação progressiva, confirmação explícita para exclusão e fechamento consistente de modal.
- Help requests admin paginadas sobre `public.help_requests`, com bind único, validação de enums e fallback seguro.
- Invite admin com feedback de clipboard centralizado e cleanup de polling.

---

## [9.4.4] - 2026-04-07 — fix/v9.4.4 (PR #213)

### Fixed
- `product.controller.js`: os 3 pontos de chamada de `kc-comments.js` (`renderComments`, `submitComment`, `formatText`) agora usam `KCLazyLoader.load('assets/js/kc-comments.js', callback)` em vez de checar `typeof window.xxx === 'function'` diretamente. Garante que o script seja carregado antes de executar, independente de o usuário ter scrollado até a seção de comentários ou não.
- `kc-comments.js`: removida a linha `window.renderComments = renderComments` adicionada erroneamente no v9.4.3 (redundante — scripts clássicos não-IIFE expõem funções em `window` automaticamente via hoisting).

### Root Cause
`kc-comments.js` é carregado via `IntersectionObserver` (v9.4.0). Se o usuário não rolar até `.kc-comments-section`, o script nunca é carregado e os 3 checks `typeof window.xxx === 'function'` sempre retornam `false` — comentários não aparecem, preview não funciona, submit e formatação não respondem.

---

## [9.4.3] - 2026-04-07 — fix/v9.4.3 (PR #212)

### Fixed
- `kc-comments.js`: adicionado `window.renderComments = renderComments` para garantir que o símbolo esteja acessível após lazy loading via `KCLazyLoader.onVisible` (correção parcial — root cause resolvido em v9.4.4).
- `profile.controller.js`: adicionado `if (empty) empty.style.display = 'block'` nos blocos `catch` de `loadPosts`, `loadComments`, `loadRatings` e `loadSaved` — painel de tabs não ficava mais em branco quando a chamada de API falhava.

---

## [9.4.2] - 2026-04-07 — Acessibilidade A11y (PR #211)

### Added
- `index.html`: skip-link `<a href="#kc-main">Pular para o conteúdo principal</a>` + `id="kc-main"` no `<main>`; `aria-label` nos botões do carrossel; `aria-hidden` nos chevrons decorativos.
- 17 arquivos HTML: `aria-label="Alternar tema claro/escuro"` no theme-toggle; `aria-label="Pesquisar"` no searchInput.
- `_product.html`: `aria-hidden` no sharePopover (estado inicial); `aria-label` em 8 botões de formatação e no input de autor; `aria-label` nos botões de compartilhamento.
- `kc-utils.js`: `aria-label` nos botões de voto; `aria-hidden` nos ícones decorativos; `aria-live="polite"` no score de votos.
- `product.controller.js`: `openSharePopover` / `closeSharePopover` gerenciam `aria-hidden`.
- `styles.css`: `.kc-skip-link` (visível no foco via Tab); `:focus:not(:focus-visible)` para dropdown e botão mobile.
- `tests/a11y.test.js`: 17 novos testes de acessibilidade.

---

## [9.4.1] - 2026-04-07 — Otimização de Imagens (PR #210)

### Added
- `supabase.adapter.js`: `compressImage(blob, maxWidth, maxHeight, quality)` via Canvas API — JPEG/PNG/WebP comprimidos para 85%, max 1200×900 (posts) / 400×400 (avatares); GIF: pass-through; fallback para blob original se Canvas falhar. `window.KCCompressImage` exposta para testes.
- `_product.html`: `fetchpriority="high"` na imagem principal (melhora LCP).
- `product.controller.js`: thumbnails com `loading="lazy"` + `decoding="async"`.
- `tests/image-compression.test.js`: 10 novos testes.

---

## [9.4.0] - 2026-04-07 — Lazy Loading JS (PR #209)

### Added
- `assets/js/kc-lazy-loader.js` (novo): `KCLazyLoader` com `load(src, cb)`, `onVisible(selector, src, cb)` (IntersectionObserver, `rootMargin: 200px`) e `onInteraction(selector, events, src, cb)`. Idempotente com cache interno.
- `kc-ranking.js` + `kc-search.js`: init migrado para `readyState` check (suporta carregamento tardio).
- 6 páginas de feed: `kc-ranking.js` substituído por `KCLazyLoader.onVisible('[data-kc-ranking-sidebar]', ...)`.
- `_product.html`: `kc-comments.js` substituído por `KCLazyLoader.onVisible('.kc-comments-section', ...)`.
- `tests/lazy-loader.test.js`: 14 novos testes.

---

## [9.3.2] - 2026-04-07 — Moderação Automática Anti-Spam (PR #208)

### Added
- Migration `v9.3.2.0_anti_spam_moderation.sql`: `kc_check_and_create_post_moderated()` com flood control (3 posts em 10 min → status `pending`), detecção de link spam (≥3 URLs no body → pending), new user trust (conta <24h + primeiro post → pending). Trigger `posts_auto_moderate_on_insert`. Audit log automático. Index `idx_posts_author_created_desc`.
- `supabase.adapter.js`: detecção de `flood_limit_exceeded` → `{ _kcError: 'FLOOD_LIMIT' }`; flag `_kcPending`.
- `kc-create-post.js`: toast de aviso para posts em análise.
- `product.controller.js`: badge "Em análise" azul para posts `pending`; toggle/bump ocultos.
- `tests/anti-spam.test.js`: 18 novos testes.

---

## [9.3.1] - 2026-04-06 — Analytics de Post para Autores (PR #207)

### Added
- Migration `v9.3.1.0_post_analytics.sql`: tabela `post_view_events`, `kc_track_view()`, `kc_get_post_analytics()`, pg_cron `kc_prune_old_analytics()` mensal.
- `product.controller.js`: rastreia visualizações via `kc_track_view` (throttle 30 min por post/usuário); mini-stats de views para autores no modal de ações.
- `kc-api.client.js`: `KCAPI.trackView()` + `KCAPI.getPostAnalytics()`.

---

## [9.1.0.3] - 2026-04-06 — Convites Externos (PRs #203–#206)

### Added
- Edge Function `kc-invite-user`: envia convite por e-mail via Supabase Auth `admin.inviteUserByEmail()`. Verificação HMAC, rate limiting, audit log.
- Tabela `invited_users`: whitelist de e-mails convidados com status de aceite.
- `admin/`: UI de gerenciamento de convites (lista, link copiável, revogar).
- Fixes: CORS expandido, `verify_jwt: false`, audit log paginado.

---

## [9.1.2] - 2026-04-06 — Avaliações de Usuários (PR #202)

### Added
- Tabela `user_ratings`: avaliações 1–5 estrelas entre usuários com campos `category` e `comment`.
- RPCs: `kc_rate_user()`, `kc_get_user_rating()`, `kc_get_user_rating_summary()`.
- UI em `profile.html`: exibição de nota média + histórico de avaliações recebidas.

---

## [9.2.1] - 2026-04-06 — Filtros Avançados nos Feeds (PR #201)

### Added
- `datePreset` nos 6 módulos de feed incremental: `today`, `last7d`, `last30d` (feeds de marketplace); `today`, `next7d`, `thisMonth`, `past` (eventos); `today`, `last3d`, `last7d` (caronas).
- Persistência em URL via `kc-feed-filters.js` (allowlist por módulo).
- Migration `v9.2.1.3_feed_date_presets.sql`: `kc_feed_local_date()`, `kc_feed_event_local_date()`, `kc_feed_matches_date_preset()`, extensão de `kc_get_feed_cursor()` com filtro server-side por data em `America/Sao_Paulo`.

---

## [9.1.0] - 2026-04-04 — Notificações In-App (PRs #198–#200)

### Added
- Tabela `notifications` com Realtime habilitado; triggers automáticos para voto positivo, novo comentário, reply e avaliação recebida.
- RPCs: `kc_get_notifications()`, `kc_mark_notifications_read()`, `kc_mark_all_notifications_read()`.
- UI: sino no header com badge de contagem; dropdown de notificações com link direto ao post; polling + Realtime para atualização em tempo real.
- Fixes: race condition na detecção de auth (#199); CSS `display:none` sobrescrevia JS (#200).

---

## [9.0.4] - 2026-04-04 — Dívida Técnica DB (PR #197)

### Added
- Migration `v9.0.4.0_analytics_retention.sql`: `kc_prune_old_analytics()` — purga `search_queries` > 6 meses e `audit_log` > 1 ano; pg_cron job mensal.
- Migration `v9.0.4.1_legacy_id_soft_deprecate.sql`: `COMMENT ON COLUMN posts.legacy_id` deprecated; `kc_admin_legacy_id_stats()` com métricas de segurança para remoção futura.

---

## [9.0.2] - 2026-04-03 — Cobertura de Testes (PR #196)

### Added
- 12 arquivos de teste novos em `tests/`; `kc-comments.shared.js` e `kc-search.shared.js` (UMD dual-export para funções puras testáveis em Node).
- Cobertura expandida de <5% para 45%+ de linhas (meta: 40%). Total: 333 testes iniciais, crescendo cumulativamente para 447 testes em 26 suites.

---

## [9.0.0] - 2026-04-02 — Fundações v9 (PR #194)

### Added
- 8 arquivos de documentação técnica em `docs/`: `architecture.md`, `api-contract.md`, `db-schema.md`, `rpc-catalog.md`, `module-schemas.md`, `env-vars.md`, `design-system.md`, `index.md`.

### Security
- Bloqueio de SVG em uploads (XSS via SVG inline): removido `image/svg+xml` dos tipos aceitos.
- Validação de magic bytes: `checkImageMagicBytes(blob)` valida os primeiros 12 bytes do arquivo.
- `SESSION_STORE_VERSION` atualizado para `'9.0.0'` (invalida caches de sessão de versões anteriores).

---

## [8.6.0] - 2026-03-30

### Objetivo
- Saneamento de segurança, unificação de versão e hardening de infraestrutura baseado no Relatório Completo de Diagnóstico v8.5.4.

### Security
- `admin-dashboard.controller.js`: corrigido `escHtmlAdmin()` — agora delega para `window.KCUtils.escapeHtml()` com escape completo de 5 caracteres (incluindo aspas simples).
- `vercel.json`: adicionado header `Strict-Transport-Security` (HSTS, max-age 2 anos, preload).
- `vercel.json`: adicionado header `Permissions-Policy` (bloqueia camera, microphone, geolocation, interest-cohort).

### Changed
- Bump coordenado da versão canônica para `8.6.0` em `kc-env.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-auth.ui.js`, `kc-profiles.client.js` e `hygiene-check.js`.
- Cache busters atualizados de `?v=8.4.2` para `?v=8.6.0` em todos os 21 HTMLs.

### Infrastructure
- Habilitado `pg_cron` no Supabase com job `kc-expire-old-posts` (diário às 03:00 UTC).
- Verificado configuração SMTP e Leaked Password Protection no Supabase Auth.

---

## [8.2.6.2] - 2026-03-19

### Objetivo
- Patch técnico pós-release focado em contrato operacional Vercel/Supabase, higiene de release e guardrails de regressão.

### Changed
- Bump coordenado da versão canônica do frontend para `8.2.6.2` em `README.md`, `assets/js/kc-env.js`, `assets/js/kc-api.client.js`, `assets/js/kc-supabase.client.js`, `assets/js/kc-auth.ui.js` e `assets/js/kc-profiles.client.js`.
- `kc-profiles.client.js` e o fallback de sync em `kc-api.client.js` deixaram de persistir `email` no `upsert` de `profiles`.
- `auth-callback.html`, `create-post.html` e `search-results.html` passaram a carregar `assets/css/kc-theme-boot.css` junto de `assets/js/kc-theme-boot.js`.

### Added
- `docs/qa/README.md`: mapa curto dos artefatos históricos e canônicos de QA.
- `docs/ops/vercel-supabase-invariants.md`: resumo operacional dos invariantes entre Vercel, `inject-env.js`, `kc-env.js`, manual avatar policy e Edge Function.
- `scripts/hygiene-check.js`: checagem local mínima para drift de versão, theme boot, inline handlers, contrato de `profiles` e invariantes estáticos de deploy.

### Fixed
- Contrato de perfil alinhado para não tratar `profiles.email` como parte do perfil público sincronizado.
- Drift de release metadata no escopo ativo do frontend.

---

## [8.2.5.0] - 2026-02-25

### Objetivo
- Segurança CSP: remoção de `'unsafe-inline'` da diretiva `script-src` (BUG-003 do Deep Code Review V8.2.2.0).

### Changed
- `vercel.json`: removido `'unsafe-inline'` de `script-src`; mantido `'strict-dynamic'` e `https://cdn.jsdelivr.net`
- `auth-callback.html`: scripts inline substituídos por `kc-theme-boot.js` (theme boot) e novo `kc-auth-callback.js` (handler de confirmação)
- `create-post.html`, `search-results.html`, `moradia.html`, `eventos.html`, `oportunidades.html`: bloco inline de theme boot substituído por `<script src="assets/js/kc-theme-boot.js">`

### Added
- `assets/js/kc-auth-callback.js`: handler de confirmação de e-mail extraído de `auth-callback.html`; lógica idêntica, agora em arquivo externo para conformidade com CSP

### Fixed
- BUG-003 (P1): CSP com `'unsafe-inline'` — eliminado; browsers modernos usam `'strict-dynamic'`
- BUG-010 (P2): `auth-callback.html` criava script inline independente — agora externalizado

---

## [8.2.4.0] - 2026-02-25

### Objetivo
- Micro-sprint de confiabilidade e Rate Limiting do formulário de publicação (`v8.2.4.0 - Form Reliability & Rate Limiting`).
- Foco exclusivo no formulário de criação de post e suas consequências no front-end.

### Status das Entregas

**8.2.4.1 — Blindagem de múltiplos cliques (Anti-Spam) — VERIFICADO/JÁ IMPLEMENTADO**
- A proteção contra submissão concorrente (`kcCreateState.submitting` flag + `submitBtn.disabled = true` + texto "Publicando..." + bloco `finally {}` de reset) já estava operacional em `kc-core.js` (função `kcHandleCreateSubmit`) desde a V8.2.0.0.
- O modal é criado uma única vez via `kcEnsureCreateModal()`, sem memory leak de listeners.
- Nenhuma alteração necessária — comportamento P0 bloqueado conforme planejado.

**8.2.4.2 — Limites e tipagem no DOM — VERIFICADO/JÁ IMPLEMENTADO**
- `maxlength="80"` no campo Título: já renderizado via schema (`maxLength: 80` em `kcBuildFieldsForModule`).
- Campo Preço com `inputmode="decimal"` + `pattern` BRL: já implementado via `moneyFieldMeta` em `kc-core.js`.
- Validação em Português: `setCustomValidity()` com mensagens PT-BR já presentes no `kcHandleCreateSubmit`.
- `word-break: break-word` + `-webkit-line-clamp` nos cards do feed: já presentes em `.kc-card__title` e `.kc-card__description-preview`.
- Nenhuma alteração necessária — comportamento P1 sanado conforme planejado.

**8.2.4.3 — Refinamento de UI (Espaçamentos Modal) — APLICADO**
- `assets/css/styles.css` — `.kc-create-form`: gap atualizado de `14px` para `16px` (respiração uniforme entre grupos).
- `assets/css/styles.css` — `.kc-create-group`: adicionado `margin-bottom: 24px` (respiro visual abaixo de cada bloco de campos).
- `assets/css/styles.css` — `.kc-create-submit`: adicionado `margin-top: 16px` (descolamento do botão da dica/grupo acima).

### Arquivos Alterados
- `assets/css/styles.css` — 3 regras de espaçamento no modal de criação (`.kc-create-form`, `.kc-create-group`, `.kc-create-submit`)

### Branch
- `kinocampus-V8.2.4-CREATE-POST-FIX`

### Mini-changelog
- `fix(form):` Estado de loading (disabled + "Publicando...") no botão de criação já operacional — confirmado via auditoria V8.2.4.1.
- `sec(form):` Limites `maxlength`, `inputmode` e validação PT-BR já operacionais — confirmado via auditoria V8.2.4.2.
- `fix(ui):` Ajustados espaçamentos internos do modal (gap 16px, margin-bottom 24px nos grupos, margin-top 16px no submit) — entregue V8.2.4.3.

---

## [8.2.2.0.x] - 2026-02-23

### Fixed
- Fix regressão de feed vazio causada por conflito Git não resolvido em scripts críticos (`kc-api.client.js`/`kc-core.js`).

### Impacto funcional
- Arquivos afetados: `assets/js/kc-api.client.js` e `assets/js/kc-core.js`.
- Impacto observado antes do saneamento: Home e páginas de feed (`index.html`, `explore.html`, `community.html`) podiam abrir com feed vazio por quebra de execução JavaScript.
- Resultado após saneamento: inicialização do fluxo de feed restabelecida, com renderização normal de posts conforme disponibilidade de dados.

## [8.2.2.0.3] - 2026-02-23

### Added
- QA kit atualizado para a esteira Cleanroom V8.2.2.0:
  - `docs/qa/rls-smoke.sql` com placeholders padronizados (`__POST_ID__`, `__OTHER_PROFILE_ID__`) e blocos guiados para seleção de dados reais.
  - `docs/qa/e2e-checklist.md` revisado para versão `V8.2.2.0` com placeholders explícitos de URL Vercel (`__VERCEL_PROD_URL__`, `__VERCEL_PREVIEW_URL__`).
  - Templates operacionais de QA consolidados em `docs/qa/report-v8.2.2-run1.md` e `docs/qa/report-v8.2-final.md`.

## [8.2.2.0] - 2026-02-23

### Objetivo
- Release candidate cleanroom de fechamento dos LOTEs 1-3: remover bloqueadores de interação, estabilizar escrita/persistência no Supabase e concluir QA/documentação final.

### Changed
- Bump em lote para `8.2.2.0` nos módulos centrais: `assets/js/kc-env.js`, `assets/js/kc-api.client.js`, `assets/js/kc-supabase.client.js`, `assets/js/kc-auth.ui.js`.
- `KCAPI.votePost(postId, direction, options?)` atualizado para fluxo idempotente em Supabase (delete+insert com recuperação de conflito) e logs estruturados `[KCAPI][votes]`.
- `kc-core` com lock de voto por post (`in-flight`) para evitar corrida de cliques e rollback de UI em falha.
- `product.html`/`product.controller.js` mantidos em binding via `data-action` + listeners (`Compartilhar`, `Denunciar`, `Enviar comentário`, `Like comentário`) com logs temporários `[RC-8220][L1]`.
- Varredura de handlers inline (`onclick/onchange/onsubmit/oninput`) sem evidência de handler inline ativo em runtime (somente ocorrências em comentário/doc legados).
- `KCAPI.createPost` reestruturado por etapa (`AUTH_SESSION`, `VALIDATE_FORM`, `INSERT_POST`, `UPLOAD_STORAGE`, `INSERT_POST_MEDIA`, `FETCH_CREATED_POST`) com log padronizado `[KC][CREATE_POST]`.
- `kc-core` passou a exibir feedback de erro com `step` quando houver diagnóstico (`Falha no passo <STEP>...`).
- `admin-reports.controller.js` removeu confirmação otimista: sucesso apenas após verificação de persistência no Supabase (`verifyActionPersistence`).
- `admin/reports.html` alinhado ao comportamento real de persistência confirmada.
- `docs/qa/rls-smoke.sql` robustecido para evitar falso bug de colisão (`gen_random_uuid()` no Test 3).
- QA kit: rls-smoke + e2e checklist + report templates.
- Referência: Cobre validação pós-rescue fix anterior (regressão de feed vazio em script crítico).

### Known Issues
- Warnings de navegador vistos no vídeo (Tracking Prevention, autocomplete e aviso de `aria-hidden`) permanecem de baixo impacto funcional e não bloqueiam fluxos core.

## [8.2.0.0] - 2026-02-22

### Objetivo da V8.2
- Cutover de saneamento cleanroom + QA, sem adição de features, com foco em disciplina de versão e risco mínimo de regressão.

### Gates / Critérios de sucesso
- Versão única dos módulos centrais alinhada em `8.2.0.0` (`kc-env`, `kc-api.client`, `kc-supabase.client`, `kc-auth.ui`).
- `README.md` e `CHANGELOG.md` refletindo o estágio V8.2 e a microentrega `8.2.0.0`.
- Validação estática sem drift de versão nos módulos centrais e smoke de navegação/auth sem erros novos no console.

### Changed
- Bump em lote das constantes `VERSION` para `8.2.0.0` nos módulos centrais de front.
- Documentação de cutover V8.2 registrada no `README.md` e neste `CHANGELOG.md`.

## [8.1.12.0] - 2026-02-22

### Added
- Realtime opcional de feed via `KCSupabase.subscribeNewPosts({ filter, onPost })` e fachada `KCRealtime.subscribeNewPosts`.
- Banner de buffer no feed (“Novo post disponível”) com botão para inserir cards no topo sem reload.
- Cleanup explícito em `KCControllers.createFeedPager()` com `destroy()` e unsubscribe no `pagehide`.

### Changed
- Controller de feed com anti-duplicação reforçada (aliases de ID + buffer IDs) para paginação + realtime.
- Estilos para banner realtime e highlight temporário de novos cards (`.kc-card--new`), incluindo ajuste para mobile 360px.
- Bump da versão dos módulos de front para `8.1.12.0` (`kc-env`, `kc-api.client`, `kc-supabase.client`, `kc-auth.ui`).
- README atualizado com mapa de versão corrente e nota de realtime opcional no feed.

## [8.1.11.1] - 2026-02-21

### Added
- Migration `supabase/migrations/v8.1.11.1_admin_reports_threshold_notify.sql` com estratégia event-driven (trigger em `public.reports` -> HTTP assinado para Edge Function).
- Edge Function `supabase/functions/notify-admin-reports-threshold/index.ts` para:
  - validar `post_id` e assinatura HMAC,
  - contar reports abertos,
  - agregar motivos (`reason`),
  - enviar webhook admin com link do post,
  - aplicar anti-spam por janela usando `public.audit_log` (`reports_threshold_notified`).
- Guia operacional/QA em `docs/qa/v8.1.11.1-admin-reports-threshold.md`.

### Changed
- README atualizado com ordem de migrations até `v8.1.11.1` e com seção de configuração/deploy da nova Edge Function.

## [8.1.8.2] - 2026-02-21

### Changed
- Movido `backend/` para `docs/legacy/backend-placeholder/` como referência histórica/placeholder.
- Adicionado `docs/legacy/backend-placeholder/README.md` com status de legado e esclarecimento de que o runtime oficial é front estático + Supabase.
- Atualizadas notas de readiness para apontar o novo local legado e evitar entendimento de backend ativo no fluxo atual.
- Adicionada política de governança SQL no `README.md` com seção **Fonte Única de Verdade (Banco)**.
- Definida regra explícita de que mudanças críticas de banco (auth, `verified`, policies, triggers, RLS, storage policies, grants/revokes) só podem existir em `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
- Formalizado procedimento obrigatório para SQL fora do fluxo oficial: mover para `docs/legacy/sql/` e registrar motivo de legado no `docs/legacy/sql/README.md`.
- Ajustado texto de nota histórica para reduzir ambiguidade, deixando explícito que se trata de **ajuste histórico já consolidado** na esteira oficial.

## [8.1.8.1] - 2026-02-21

### Changed
- Unificação da versão dos módulos de front para uma versão-alvo única `8.1.8.1`.
- Atualizadas as constantes `VERSION` em:
  - `assets/js/kc-env.js` → `8.1.8.1`
  - `assets/js/kc-api.client.js` → `8.1.8.1`
  - `assets/js/kc-supabase.client.js` → `8.1.8.1`
  - `assets/js/kc-auth.ui.js` → `8.1.8.1`
- Revisada a referência visual de versão no modal de autenticação (`Auth UI v8.1.8.1`).

### Release policy
- Para evitar drift entre módulos, todo release de front deve aplicar **bump em lote** das constantes `VERSION` dos arquivos mapeados no README e neste changelog.
