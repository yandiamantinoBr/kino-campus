/**
 * @file kc-api-saved-module.test.js
 * @description Static contract tests for assets/js/api/kc-api.saved.js (v11.32.3)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.saved.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => page !== 'admin/cadu.html'));

let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

describe('kc-api.saved.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno _KCAPI', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.saved = {');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada publica nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });
});

describe('kc-api.saved.js - exported saved/highlights domain', () => {
  test('exporta apenas o grupo de saved/highlights', () => {
    [
      'getSavedPostState,',
      'setSavedPostState,',
      'clearSavedPostState,',
      'getMySavedPosts,',
      'getMySavedPostsCount,',
      'getProfileHighlights,',
      'getProfileHighlightsCount,',
    ].forEach((token) => expect(source).toContain(token));
  });

  test('mantem helpers de deps (driver ativo, ENV e invalidacao de analytics)', () => {
    expect(source).toContain('function getActiveDriverOrNull(deps) {');
    expect(source).toContain('function getEnv(deps) {');
    expect(source).toContain('function invalidateAnalytics(deps, postId) {');
    expect(source).toContain('if (!deps || typeof deps.getActiveDriver !== \'function\') return null;');
    expect(source).toContain('if (deps && deps.ENV && typeof deps.ENV === \'object\') return deps.ENV;');
    expect(source).toContain('if (!deps || typeof deps.invalidatePostAnalyticsCache !== \'function\') return;');
  });

  test('mantem branches ENV.driver !== supabase preservando semantica local/supabase', () => {
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getSavedPostState === 'function') return driver.getSavedPostState(postId);");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.setSavedPostState === 'function') {");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.clearSavedPostState === 'function') {");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPosts === 'function') return driver.getMySavedPosts(params);");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPostsCount === 'function') return driver.getMySavedPostsCount(params);");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getProfileHighlights === 'function') {");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getProfileHighlightsCount === 'function') {");
  });

  test('mantem fallbacks canonicos quando o driver nao expoe a operacao', () => {
    expect(source).toContain('return { kinds: [] };');
    expect(source).toContain("return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };");
    expect(source).toContain('return [];');
    expect(source).toContain('return 0;');
  });

  test('mantem invalidacao de analytics apos mutacoes de saved com sucesso', () => {
    expect(source).toContain('if (result && result.ok) invalidateAnalytics(deps, postId);');
    // Mutacoes de saved (set/clear) propagam invalidacao; leituras nao propagam.
    const occurrences = source.match(/invalidateAnalytics\(deps, postId\)/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('kc-api.saved.js - html loading order', () => {
  test('os carregadores reais incluem kc-api.saved.js antes de kc-api.client.js', () => {
    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const savedIdx = html.indexOf('kc-api.saved.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(savedIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(savedIdx).toBeLessThan(clientIdx);
    });
  });

  test('os carregadores reais mantem kc-api.notifications.js antes de kc-api.saved.js', () => {
    HTML_FILES.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const notificationsIdx = html.indexOf('kc-api.notifications.js');
      const savedIdx = html.indexOf('kc-api.saved.js');

      expect(notificationsIdx).toBeGreaterThan(-1);
      expect(savedIdx).toBeGreaterThan(-1);
      expect(notificationsIdx).toBeLessThan(savedIdx);
    });
  });
});
