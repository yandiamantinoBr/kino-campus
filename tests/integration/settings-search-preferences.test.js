'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('settings search personalization controls', () => {
  test('expõe modo padrão, escolhas explícitas, consentimento separado e direitos', () => {
    const html = read('settings.html');
    expect(html).toContain('id="settingsSearchPreferences"');
    expect(html).toContain('id="settingsSearchPersonalized"');
    expect(html).toContain('id="settingsSearchAffinity"');
    expect(html).toContain('id="settingsSaveSearchPreferences"');
    expect(html).toContain('id="settingsExportSearchPreferences"');
    expect(html).toContain('id="settingsClearSearchPreferences"');
    expect(html).toContain('id="settingsSearchPreferencesSyncHint"');
    expect(html).toContain('sincronizam');
    expect(html.indexOf('settingsSearchPreferences')).toBeLessThan(html.indexOf('settingsGuest'));
  });

  test('registry canônico permanece lazy e controller não coleta query nem campos de identidade', () => {
    const html = read('settings.html');
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    expect(html).not.toContain('<script defer src="assets/js/shared/kc-search-registry.generated.js');
    expect(controller).toContain("REGISTRY_SRC = 'assets/js/shared/kc-search-registry.generated.js");
    expect(controller).toContain('window.KCSearchPreferences.preferenceCatalog(registry)');
    expect(controller).not.toMatch(/searchInput|account_id/);
    expect(controller).toContain('getSearchPreferences');
    expect(controller).toContain('updateSearchPreferences');
  });

  test('desativar personalização também desativa afinidade e save emite mudança', () => {
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    expect(controller).toContain('if (affinity && !personalized) affinity.checked = false;');
    expect(controller).toContain("new CustomEvent('kc:search-preferences-change'");
    expect(controller).toContain('window.KCSearchPreferences.clear()');
    expect(controller).toContain('hydrateFromAccount');
  });
});
