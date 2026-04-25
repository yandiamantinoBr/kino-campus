# Auditoria `assets/js/controllers/admin-dashboard.controller.js` — v12.3.0

**Data:** 21 de abril de 2026  
**Iteração:** `v12.3.0` (doc-only)  
**Linha-base:** `kinocampus-V11.0-foundations` pós-`v12.2.7`  
**Objetivo desta auditoria:** mapear o estado real de `admin-dashboard.controller.js` antes dos splits `v12.3.1`–`v12.3.3`, identificando footprint, contratos externos, fronteiras já modularizadas, grupos naturais de extração e a sequência recomendada para `window._KCAD.*`.

---

## 1. Footprint real

| Métrica | Valor |
|---|---|
| Arquivo auditado | `assets/js/controllers/admin-dashboard.controller.js` |
| Linhas totais | **2 034L** |
| Tamanho no disco | **93 641 bytes (~91,5 KB)** |
| Funções top-level | **104** |
| Funções `async` | **29** |
| HTML consumidor direto | **1** (`admin/index.html`) |
| Export público direto | **1** (`window.KCAdminDashboardRefresh = refreshDashboard`) |
| Suites diretas do controller | **0** |
| Suite do helper compartilhado | **1** (`tests/admin-dashboard.shared.test.js`, 4 testes) |
| RPCs Supabase usados | **4** (`kc_admin_list_reports`, `kc_admin_list_audit_logs`, `kc_admin_search_trends`, `kc_admin_dashboard_daily_metrics`) |
| Tabelas consultadas diretamente | **8** (`reports`, `posts`, `comments`, `search_queries`, `profiles`, `post_votes`, `saved_posts`, `audit_log`) |
| Globals externos principais | `window.KCSupabase`, `window.KCAPI`, `window.KCAdminShell`, `window.KCPullToRefresh`, `window.KCUtils`, `window.KC_CONSTANTS`, `window.XLSX`, `window.jspdf`, `window.KCRanking` |

### 1.1. Boundary já extraído

O dashboard **não parte de um monolito puro**: existe um helper prévio, `assets/js/controllers/admin-dashboard.shared.js`, com:

- **382L** e **14 395 bytes**
- **14 exports** congelados em `window.KCAdminDashboardUtils`
- **1 suite Jest** já existente (`tests/admin-dashboard.shared.test.js`)

Hoje o controller principal consome apenas **5** exports desse helper:

- `buildDailyMetricsFromEventSets`
- `buildDailyMetricsSeries`
- `buildModuleShareRows`
- `buildActivityPulseSummary`
- `buildOperationalAlerts`

Isso reduz parte do risco, mas também revela um boundary ainda incompleto: o controller mantém lógica local de classificação/canonicalização de termos que já existe, em forma semelhante, no helper compartilhado.

---

## 2. Estrutura interna atual

O arquivo se organiza em **6 grupos naturais**. A divisão abaixo usa linhas reais e serve como base para os splits `v12.3.1`–`v12.3.3`.

### 2.1. Base de tela, acesso e ciclo de refresh — ~650L

**Faixas principais:** `L33–L370`, `L1814–L2128`

**Responsabilidades:**

- helpers de DOM e estado visual (`$`, `showError`, `clearError`, toast, loading, grid loading)
- contrato de acesso admin (`getClient`, `checkAccess`, redirect para `../index.html`)
- período selecionado (`getSelectedPeriodDays`, `getPeriodRange`, `getPeriodLabel`, `getPeriodShortLabel`)
- UX de shell/admin header (`stabilizeHeaderActions`, `setLastSync`)
- orquestração central (`loadMetrics`, `refreshDashboard`, `boot`)
- controle de concorrência (`AbortController`, `_refreshRequestSeq`, `_rankingRequestSeq`, debounce de período)

**Funções-chave:**

| Função | Linha | Papel |
|---|---|---|
| `checkAccess()` | L248 | Gate de sessão/admin |
| `getSelectedPeriodDays()` | L293 | Fonte canônica do filtro de período |
| `getPeriodRange()` | L335 | Calcula `since/until/label` |
| `updateTitles()` | L317 | Atualiza títulos e subtítulos do dashboard |
| `loadMetrics()` | L1814 | Orquestra os 14 loaders em paralelo e monta `_data` |
| `refreshDashboard()` | L1970 | Refresh abortável + ranking |
| `boot()` | L2067 | Wiring inicial da página |

### 2.2. Loaders de métricas e consultas Supabase — ~520L

**Faixas principais:** `L531–L1023`

**Responsabilidades:**

- loaders pontuais de moderação, atividade e comunidade
- fetch híbrido via RPC + fallback para query direta
- resolução de atores do audit log
- consolidação diária de atividade

**Loaders principais (14):**

| Grupo | Funções |
|---|---|
| Moderação | `loadReportMetrics`, `loadPostStatusMetrics` |
| Atividade | `loadPostsCreated`, `loadPostsEdited`, `loadCommentsCount`, `loadSearchCount`, `loadDailyMetrics` |
| Comunidade | `loadPostsTotal`, `loadUsersTotal`, `loadUsersNew`, `loadVotesCount`, `loadSavedPostsCount` |
| Audit log | `loadActorsById`, `loadAuditLog`, `loadAuditEventRows` |
| Busca | `loadSearchTrendsData` |

**Observações estruturais:**

- os loaders já aceitam bem isolamento por domínio; o acoplamento maior está em `_data` e nos helpers de período
- `loadDailyMetrics()` já depende do helper compartilhado quando disponível, o que favorece split futuro
- a faixa concentra boa parte da dependência operacional em Supabase/RPCs

### 2.3. Tendências, resumo diário e renderers de UI — ~420L

**Faixas principais:** `L414–L511`, `L918–L1223`

**Responsabilidades:**

- canonicalização e classificação de termos de busca
- render das tendências e do share por módulo
- resumo de pulso diário
- SVG/chart renderer e modal de expansão
- alertas operacionais

**Funções-chave:**

| Função | Linha | Papel |
|---|---|---|
| `canonicalizeTerm()` | L414 | Normalização local de termos |
| `classifyTermToModule()` | L467 | Classificação por módulo |
| `renderSearchTrends()` | L943 | Lista principal de termos |
| `renderDailyActivitySummary()` | L1024 | Cartões de pulso diário |
| `buildDailyActivityChartSvg()` | L1079 | SVG principal do gráfico |
| `renderChartInto()` | L1114 | Renderiza gráfico em container arbitrário |
| `bindDailyActivityChartModal()` | L1152 | Wiring do modal expandido |
| `renderModuleShareTable()` | L1203 | Tabela de share por módulo |
| `renderOperationalAlerts()` | L1223 | Painel de alertas |

**Drift já visível:**

- `canonicalizeTerm()` e `classifyTermToModule()` existem tanto aqui quanto em `admin-dashboard.shared.js`
- `SERIES_KEYS` aparece no controller e no helper compartilhado
- esse drift não quebra runtime hoje, mas aumenta o custo de manutenção e deve ser resolvido durante os splits

### 2.4. Audit log — ~210L

**Faixas principais:** `L707–L811`, `L1240–L1252`, `L2009–L2065`

**Responsabilidades:**

- resolver nomes de ator (`loadActorsById`, `getActorDisplay`)
- carregar audit log com fallback entre query direta e RPC
- badge de ação, render de linhas, paginação incremental e filtro por ação

**Funções-chave:**

- `loadActorsById`
- `getActorDisplay`
- `loadAuditLog`
- `loadAuditEventRows`
- `auditActionBadge`
- `renderAuditRows`
- `setAuditLoadMoreState`
- `loadMoreAudit`
- `filterAudit`

### 2.5. Exportação XLSX/PDF — ~480L

**Faixas principais:** `L1299–L1775`

**Responsabilidades:**

- carregamento lazy de bibliotecas com fallback local/CDN
- geração das linhas exportáveis a partir de `_data`
- geração de XLSX
- geração de PDF com desenho manual
- binding dos botões de export na toolbar

**Funções-chave:**

| Grupo | Funções |
|---|---|
| Loader de libs | `loadScript`, `loadScriptWithFallback`, `ensureXLSX`, `ensureJsPDF` |
| Preparação de rows | `buildSummarySheetRows`, `buildTrendRows`, `buildDailyRows`, `buildSeriesTotalsRows`, `buildModuleRows`, `buildAlertRows`, `buildAuditRows` |
| PDF renderer | `checkPage`, `drawSectionHeader`, `drawMetricCards`, `drawDailyChart`, `drawWrappedList` |
| Orquestração | `exportXLSX`, `exportPDF`, `enableExport` |

**Observação crítica:** esse bloco depende fortemente do shape de `_data`, mas é quase todo auto-contido fora disso. É um alvo de split muito favorável.

### 2.6. Ranking admin — ~120L

**Faixa principal:** `L2130–L2249`

**Responsabilidades:**

- mapear período do dashboard para o contrato de ranking
- carregar Top Contribuidores via `KCAPI.getTopContributors`
- renderizar a tabela, alternar top 10 vs. expandido e abrir modal de ajuda do ranking

**Funções-chave:**

- `mapPeriodToRanking`
- `loadAdminRanking`
- `bindAdminRanking`

O ranking é o bloco mais independente do arquivo depois de exportação e audit log. Ele cabe naturalmente em um submódulo de UI/charts.

---

## 3. Consumers e contratos externos

### 3.1. HTML consumidor

`admin/index.html` é o único HTML que carrega o controller, via:

- `../assets/js/controllers/admin-dashboard.shared.js`
- `../assets/js/kc-ranking.js`
- `../assets/js/controllers/admin-dashboard.controller.js?v=8.6.0`

Isso implica:

- o helper compartilhado já é um pré-requisito formal
- o split de `v12.3.x` não precisa propagar novos scripts para 22 páginas; só para `admin/index.html`
- a ordem de carregamento do admin ficará tão crítica quanto a cadeia `_KCU.*` ficou para `kc-utils.js`

### 3.2. Globals e dependências de runtime

| Dependência | Uso no controller |
|---|---|
| `window.KCSupabase.getClient()` | acesso ao cliente Supabase |
| `window.KCAPI.getCurrentUser()` | gate de acesso admin |
| `window.KCAPI.getTopContributors()` | ranking |
| `window.KCAdminShell.syncHeader()` / `setModalOpen()` | integração com shell e modal |
| `window.KCPullToRefresh.init()` | refresh por gesto |
| `window.KCUtils.escapeHtml()` | escape HTML em `escHtmlAdmin()` |
| `window.KC_CONSTANTS.CATEGORY_LABELS` | classificação de termos |
| `window.XLSX` / `window.jspdf.jsPDF` | exportação |
| `window.KCRanking` | modal de ajuda do ranking |

### 3.3. Contrato público do controller

Hoje o controller expõe apenas:

- `window.KCAdminDashboardRefresh = refreshDashboard`

Não há outros consumers JS conhecidos desse export. Busca global no repositório não encontrou callsites externos para `KCAdminDashboardRefresh`.

### 3.4. Cobertura de testes atual

**Existe hoje:**

- `tests/admin-dashboard.shared.test.js` com **4 testes** do helper compartilhado
- suites indiretas que referenciam `admin/index.html` para contratos de markup/shell

**Não existe hoje:**

- suíte direta de `admin-dashboard.controller.js`
- teste estático travando o shape do controller, o export `window.KCAdminDashboardRefresh` ou o wiring de `boot()`
- suíte focada em `_data` como contrato de exportação

Isso eleva o risco do primeiro split. A partir de `v12.3.1`, a trilha precisa abrir cobertura direta do controller/submódulos.

---

## 4. Achados principais da auditoria

1. **O hotspot real é menor que o planejado no roadmap inicial:** `2034L`, não `2251L`. Continua acima do limiar de split e segue como 2º maior hotspot JS ativo da v12.
2. **O arquivo já tem uma fundação modular parcial:** `admin-dashboard.shared.js` absorveu parte da lógica de classificação e séries, mas o controller ainda retém duplicações relevantes.
3. **`loadMetrics()` é o ponto de maior risco funcional:** ele coordena 14 loaders, atualiza títulos, monta `_data`, chama renderers e alimenta exportação. Qualquer split precisa preservar esse shape.
4. **Exportação é o grupo mais fácil de extrair:** depende de `_data`, mas quase não depende do restante da UI.
5. **Audit log é o segundo grupo mais isolável:** loader, render, paginação e filtro estão concentrados e têm pouco acoplamento com charts/ranking.
6. **Ranking cabe melhor ao lado de charts/renderers do que de metrics:** compartilha natureza visual, wiring de UI e dependência em `KCAPI`, mas quase não toca `_data`.
7. **A lacuna de testes é o principal risco operacional da trilha `v12.3.x`:** sem cobertura direta, o split deve começar por contrato estático + smoke lógico do controller.

---

## 5. Plano de decomposição recomendado (`v12.3.1`–`v12.3.4`)

### 5.1. Ordem recomendada

| Iteração | Alvo | Responsabilidade | Redução estimada no core |
|---|---|---|---|
| `v12.3.1` | `assets/js/controllers/admin-dashboard.metrics.js` → `window._KCAD.metrics` | acesso, período, loaders, `loadMetrics`, `refreshDashboard`, wiring do refresh | **−750L a −900L** |
| `v12.3.2` | `assets/js/controllers/admin-dashboard.audit.js` → `window._KCAD.audit` | audit log + exportação + script loaders + helpers PDF/XLSX | **−500L a −650L** |
| `v12.3.3` | `assets/js/controllers/admin-dashboard.charts.js` → `window._KCAD.charts` | trends, charts, modal, tables de share, alerts e ranking | **−300L a −450L** |
| `v12.3.4` | gate formal | controller residual < `900L`, docs e hygiene específicos do admin | — |

### 5.2. Recomendação arquitetural

Para manter o split estável, o controller residual deve virar um **thin core** com:

- estado mínimo compartilhado (`_data`, offsets, timers, request seq, controller abortável)
- wrappers de delegação para `window._KCAD.metrics`, `window._KCAD.audit`, `window._KCAD.charts`
- helpers de dependência via builders locais (`getDashboardState()`, `buildDashboardDeps()`, `setDashboardState()` ou equivalente)
- preservação do contrato público `window.KCAdminDashboardRefresh`

### 5.3. Cobertura mínima a abrir em `v12.3.1`

- teste estático do controller residual: IIFE, export `window.KCAdminDashboardRefresh`, fallbacks defensivos
- teste do shape mínimo de `_data` após `loadMetrics()`
- teste de wiring de período / debounce / abort controller
- teste do bloco `_KCAD.metrics` com mocks de loaders

---

## 6. Verificação da iteração `v12.3.0`

Esta auditoria é **docs-only**. Nenhum JS, HTML ou teste funcional foi alterado.

**Validação executada:**

- `node scripts/hygiene-check.js`
- `npm test`

**Estado preservado:**

- `106/106` suites
- `2212/2212` testes
- hygiene `8.6.0`

---

## 7. Próxima iteração

**`v12.3.1` — split admin-dashboard domínio metrics/loaders**

Escopo recomendado:

- extrair loaders, período, access gate e `refreshDashboard/loadMetrics`
- introduzir `window._KCAD.metrics`
- abrir a primeira suíte direta do dashboard controller/submódulo
- manter `admin/index.html` como único HTML consumidor, agora com `admin-dashboard.metrics.js` antes do controller residual
