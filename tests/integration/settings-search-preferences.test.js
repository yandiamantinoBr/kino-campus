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
    expect(html).not.toContain('id="settingsExportSearchPreferences"');
    expect(html).not.toContain('Exportar JSON');
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

  test('assuntos e temas renderizam divisões por módulo com emoji alinhado ao create-modal', () => {
    const controller = read('assets/js/controllers/public/search-preferences.controller.js');
    const schema = read('assets/js/features/create-post/kc-create-post.schema.js');
    expect(controller).toContain('kc-search-preference-module-block');
    expect(controller).toContain('moduleEmoji');
    expect(controller).toContain('option.emoji');
    expect(schema).toContain("emoji: '🎓'");
    expect(schema).toContain("emoji: '🚗'");
  });
});
