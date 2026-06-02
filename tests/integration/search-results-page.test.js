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
    expect(html).toContain('data-i18n-aria-label="aria-label.search-results-filters"');
  });

  test('loads the updated shared search assets', () => {
    const html = read('search-results.html');

    expect(html).toContain('assets/js/shared/kc-search.shared.js?v=8.6.2');
    expect(html).toContain('assets/js/features/kc-search.js?v=8.6.2');
  });
});

describe('kc-search.js search results controller', () => {
  test('keeps result filtering and stale async response protection in the results page', () => {
    const source = read('assets/js/features/kc-search.js');

    expect(source).toContain('let searchResultsRequestSeq = 0');
    expect(source).toContain('function filterAndSortResults');
    expect(source).toContain('isPostClosedOrEnded');
    expect(source).toContain('writeResultFiltersToUrl(q, filters)');
    expect(source).toContain('SEARCH_RESULTS_LIMIT = 120');
  });
});
