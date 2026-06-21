'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('search local personalization integration contract', () => {
  test('flag é segura por opt-in e runtime permanece lazy', () => {
    const env = read('assets/js/boot/kc-env.js');
    const html = read('search-results.html');
    const search = read('assets/js/features/kc-search.js');
    expect(env).toContain("'search.personalization': true");
    expect(html).not.toContain('<script defer src="assets/js/shared/kc-search-affinity.shared.js');
    expect(search).toContain("{ file: 'kc-search-affinity.shared.js', global: 'KCSearchAffinity' }");
    expect(search).toContain("window.KCFF.isEnabled('search.personalization', true)");
  });

  test('reranking acontece depois de candidato/filtro nas duas superfícies', () => {
    const search = read('assets/js/features/kc-search.js');
    const resultsFilter = search.indexOf('let filteredResults = filterAndSortResults(pilotResults');
    const resultsRerank = search.indexOf('filteredResults = await applySearchPersonalization');
    const dropdownFilter = search.lastIndexOf("results = filterAndSortResults(results, q, { module: '', hideClosed: true, sortBy: 'relevance' })");
    const dropdownRerank = search.lastIndexOf("results = await applySearchPersonalization(results, { sortBy: 'relevance' })");
    expect(resultsFilter).toBeGreaterThan(-1);
    expect(resultsRerank).toBeGreaterThan(resultsFilter);
    expect(dropdownFilter).toBeGreaterThan(-1);
    expect(dropdownRerank).toBeGreaterThan(dropdownFilter);
  });

  test('explicação, opt-out e coleta apenas em clique deliberado estão expostos', () => {
    const html = read('search-results.html');
    const search = read('assets/js/features/kc-search.js');
    expect(html).toContain('id="searchResultsPersonalization"');
    expect(html).toContain('settings.html#settingsSearchPreferences');
    expect(search).toContain("recordSearchResultInteraction(post, 'dropdown-click')");
    expect(search).toContain("recordSearchResultInteraction(post, 'results-click')");
    expect(search).not.toMatch(/recordSearchResultInteraction\([^)]*impression/);
    expect(search).not.toMatch(/recordSearchResultInteraction\([^)]*hover/);
  });

  test('inventário administrativo e declaração pública registram finalidade e retenção', () => {
    const admin = read('assets/js/controllers/admin/admin-privacy-analytics.controller.js');
    const privacy = read('privacidade.html');
    expect(admin).toContain("name: 'kc_search_preferences_v1'");
    expect(admin).toContain("name: 'kc_search_affinity_v1'");
    expect(admin).toContain("consent: 'Personalização — opt-in separado'");
    expect(privacy).toContain('Preferências e personalização da busca');
    expect(privacy).toContain('expira em até 90 dias');
    expect(privacy).toContain('Não guarda o texto pesquisado');
  });
});
