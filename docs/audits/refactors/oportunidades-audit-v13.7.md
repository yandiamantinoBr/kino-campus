# Auditoria — oportunidades.controller.js (v13.7.0)

**Data:** 2026-04-25  
**Versão:** v13.7.0 (doc-only)  
**Arquivo:** `assets/js/controllers/oportunidades.controller.js`

---

## 1. Footprint atual

| Métrica | Valor |
|---|---|
| Linhas | 1246L |
| Estrutura | IIFE única com `'use strict'` |
| Funções internas | ~58 funções |
| Estado interno | `state { selectedTypeFilters, selectedModeFilters, selectedArea, datePreset, priceMin, priceMax, feedPager, posts, sections, refreshQueued, fetchStarted, applyWrapped, ... }` |
| Namespace público | nenhum (auto-inicializado via DOMContentLoaded) |
| Deps externas | `window.KCControllers`, `window.KCUtils`, `window.kcFilters`, `window.KCCore.bindModuleSortTabs` |

---

## 2. Análise de pureza funcional

### Funções puras (PURE — 0 referências a `state.*`)

| Grupo | Funções | Linhas |
|---|---|---|
| Utilitários | `normalizeText`, `canonicalCategory`, `escapeHtml`, `cloneSet`, `sanitizePriceValue`, `normalizePriceRange`, `isMobileViewport` | 37–89, ~53L |
| Store/filter utils | `getSessionStore`, `getFeedFilterUtils`, `getAllowedDatePresets`, `normalizeDatePreset`, `readSelectedDatePreset`, `restoreCachedPosts`, `persistCachedPosts`, `getFilterState` | 95–162, ~68L |
| Normalização de post | `getAreaDefinitions`, `getPostIdentity`, `normalizeOpportunityType`, `resolveWorkModeValue`, `resolveWorkMode`, `resolveEmploymentTypeValue`, `resolveEmploymentType`, `resolveArea`, `summarizePost` | 163–379, ~217L |
| Card dataset | `applyCardDataset`, `decorateFreshCards`, `getSelectedInputs`, `syncFilterInputs` | 400–468, ~57L |
| Filter matching | `hasTypeModeSelection`, `isTypeMatch`, `isModeMatch`, `categoryMatches`, `queryMatches` | 521–588, ~39L |
| Modal | `ensureMobileSectionModal` | 770–800, ~31L |
| Feed control | `applyCurrentFilters`, `setupExtraPredicate` | 1010–1019, 1201–1207, ~17L |
| **Total puro** | | **~482L** |

### Funções state-dependentes (STATE — lêem/escrevem `state.*`)

| Funções | `state.*` refs | Linhas |
|---|---|---|
| `syncAreaHistoryCache`, `upsertPosts` | 2 | ~20L |
| `syncStateFromInputs`, `restoreUrlState`, `syncUrlState` | 25 | ~64L |
| `cardMatchesSidebarFilters` | 12 | ~36L |
| `matchesSummary` | 14 | ~36L |
| `getAreaCatalog`, `getRenderedAreaSelection`, `getAreaLabel`, `renderAreaButtons`, `syncClearButtonState` | 9 | ~100L |
| `getSidebarSections`, `collectSidebarSections`, `renderMobileRail` | 3 | ~43L |
| `renderSectionActions`, `openMobileSectionModal`, `closeMobileSectionModal` | 52 | ~179L |
| `queueRefresh`, `getFeedRequestParams`, `refreshFeed`, `applySidebarFilters`, `clearAppliedFilters` | 44 | ~79L |
| `bindSidebarEvents`, `wrapFilterApply`, `fetchAllPosts`, `initFeed` | 58 | ~178L |
| **Total state-dependente** | | **~735L** |

---

## 3. Estratégia de split (v13.7.1)

### Problema: pure extraction only dá residual ~764L (> 700L)

| Extração | Linhas extraídas | Residual estimado |
|---|---|---|
| Apenas puras (A+B+utils) | ~482L | ~764L ✗ |
| Puras + matchesSummary + cardMatchesSidebarFilters (com injeção de state) | ~554L | ~692L ✓ |

**Recomendação:** Extrair todas as puras + converter `matchesSummary` e `cardMatchesSidebarFilters` para aceitar `stateRef` como parâmetro.

### oportunidades.normalize.js

Conteúdo:
- `DEFAULT_AREAS` constante
- Todos os grupos puros (~482L)
- `matchesSummary(summary, options, stateRef)` — refatorado para não depender de closure
- `cardMatchesSidebarFilters(card, stateRef)` — refatorado

Exposição: funções globais no IIFE + `window._KCOpNormalize` opcional para testes.

**Estimativa:** ~560L

### oportunidades.controller.js (residual)

Mantém:
- Constantes locais + `state` object
- `syncAreaHistoryCache`, `upsertPosts` (usam `state.posts`)
- Toda lógica de UI (render, modal, sidebar)
- Feed control + boot DOMContentLoaded
- Call sites de `matchesSummary` e `cardMatchesSidebarFilters` atualizados para passar `state`

**Estimativa residual:** ~692L < 700L ✓

---

## 4. Padrão de extração

```javascript
// oportunidades.normalize.js — IIFE autocontido
(function () {
  'use strict';

  var DEFAULT_AREAS = [
    { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
    // ...
  ];

  function normalizeText(value) { ... }
  // ... todas as funções puras ...

  // Refatoradas: agora aceitam stateRef em vez de closure
  function matchesSummary(summary, options, stateRef) {
    var s = stateRef || {};
    // usa s.selectedTypeFilters em vez de state.selectedTypeFilters
    // ...
  }

  function cardMatchesSidebarFilters(card, stateRef) {
    var s = stateRef || {};
    // ...
  }

  // Exposição interna (para oportunidades.controller.js acessar via window)
  window._KCOpNormalize = Object.freeze({
    normalizeText: normalizeText,
    summarizePost: summarizePost,
    matchesSummary: matchesSummary,
    cardMatchesSidebarFilters: cardMatchesSidebarFilters,
    // ... outros
  });
})();
```

```javascript
// oportunidades.controller.js (residual) — atualiza call sites:
// ANTES: matchesSummary(summary, filterConfig)
// DEPOIS: window._KCOpNormalize.matchesSummary(summary, filterConfig, state)
```

---

## 5. HTML consumidores

```bash
grep -rl "oportunidades.controller.js" *.html admin/*.html
```

Após split, adicionar em cada HTML:
```html
<script defer src="assets/js/controllers/oportunidades.normalize.js"></script>
<script defer src="assets/js/controllers/oportunidades.controller.js"></script>
```

---

## 6. Gate formal (v13.7.2)

Meta: `oportunidades.controller.js` < **700L**

```bash
wc -l assets/js/controllers/oportunidades.controller.js
```

---

## 7. Testes a criar (v13.7.1)

**`tests/oportunidades-split.test.js`**
- Contrato estático de `oportunidades.normalize.js` (funções exportadas via `_KCOpNormalize`)
- `oportunidades.controller.js` residual NÃO define `summarizePost` inline
- Gate de tamanho: `oportunidades.controller.js` < 700L
- Testes funcionais: `normalizeOpportunityType`, `resolveWorkMode`, `summarizePost`
