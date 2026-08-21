'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('search-results.html', () => {
  test('exposes module, status and sort controls for public search results', () => {
    const html = read('search-results.html');

    expect(html).toContain('id="searchResultsModuleFilter"');
    expect(html).toContain('id="searchResultsSort"');
    expect(html).toContain('id="searchResultsHideClosed"');
    expect(html).toContain('id="searchResultsActiveFilters"');
    expect(html).toContain('id="searchResultsVisibleSummary"');
    expect(html).toContain('id="searchResultsStructured"');
    expect(html).toContain('id="searchResultsStructuredChips"');
    expect(html).toContain('id="searchResultsStructuredRestore"');
    expect(html).toContain('id="searchResultsRelaxStructured"');
    expect(html).toContain('id="searchResultsRetry"');
    expect(html).toContain('id="noResultsMessage"');
    expect(html).toContain('kc-search-results-controls__summary');
    expect(html).toContain('kc-search-results-controls__toolbar');
    expect(html).toContain('id="searchResultsPersonalizationSlot"');
    expect(html).toContain('id="searchResultsPersonalization"');
    // Personalization lives inside the filters toolbar, not as a loose sibling block.
    expect(html).toMatch(/kc-search-results-controls[\s\S]*searchResultsPersonalization[\s\S]*<\/section>/);
    expect(html).toContain('data-i18n-aria-label="aria-label.search-results-filters"');
  });

  test('loads the updated shared search assets', () => {
    const html = read('search-results.html');

    expect(html).toContain('assets/js/shared/kc-search.shared.js?v=8.6.4');
    expect(html).toContain('assets/js/features/kc-search.js?v=8.6.16');
  });
});

describe('kc-search.js search results controller', () => {
  test('keeps result filtering and stale async response protection in the results page', () => {
    const source = read('assets/js/features/kc-search.js');

    expect(source).toContain('let searchResultsRequestSeq = 0');
    expect(source).toContain('function filterAndSortResults');
    expect(source).toContain('isPostClosedOrEnded');
    expect(source).toContain('writeResultFiltersToUrl(q, filters)');
    expect(source).toContain('function dismissStructuredSignal');
    expect(source).toContain('function renderStructuredSearchState');
    expect(source).toContain('function formatVisibleResultsLabel');
    expect(source).toContain('moduleOverride: filters.module');
    expect(source).toContain('SEARCH_RESULTS_LIMIT = 120');
    expect(source).toContain('function scheduleSearchResultsLifecycleBoundary');
    expect(source).toContain('renderResultsToPage(searchInput ? searchInput.value : query)');
    expect(source).toContain("window.addEventListener('pageshow', onSearchResultsPageShow)");
    expect(source).toContain('function shouldRevalidateSearchResults');
    expect(source).toContain('startSearchResultsFreshness()');
    // Visible summary must track the rendered feed list, not a pre-filter pool.
    expect(source).toContain('formatVisibleResultsLabel(visible)');
    expect(source).toContain('let searchError = null');
    expect(source).toContain('if (searchError)');
    expect(source).toContain('context.error === true');
    expect(source).toContain('noResultsRetry');
  });

  test('keeps the header search global outside the results page', () => {
    const source = read('assets/js/features/kc-search.js');

    expect(source).not.toContain('const hasPageFilter');
    expect(source).not.toContain("source: 'page-filter-submit'");
    expect(source).toContain("navigateToResults(q, { source: 'search-enter' })");
    expect(source).toContain("navigateToResults(q, { source: 'search-button' })");
  });
});
