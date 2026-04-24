const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../assets/js/kc-feature-flags.js');
const ROOT_DIR = path.resolve(__dirname, '..');
const source = fs.readFileSync(MODULE_PATH, 'utf8');

const htmlFiles = [
  'account-setup.html',
  'achados-perdidos.html',
  'ajuda.html',
  'auth-callback.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'index.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'profile.html',
  'search-results.html',
  'settings.html',
  '_product.html',
  'admin/banners.html',
  'admin/help-requests.html',
  'admin/index.html',
  'admin/moderation.html',
  'admin/reports.html',
];

function resetAndLoad(env) {
  jest.resetModules();
  global.window = global.window || global;
  delete window.KCFF;
  delete global.KCFF;

  if (env === undefined) {
    delete window.KC_ENV;
    delete global.KC_ENV;
  } else {
    window.KC_ENV = env;
    global.KC_ENV = env;
  }

  require(MODULE_PATH);
  return window.KCFF || global.KCFF;
}

function extractDeferredScriptSrcs(content) {
  return [...String(content).matchAll(/<script\b[^>]*>\s*<\/script>/gi)]
    .map((match) => String(match[0] || ''))
    .filter((tag) => /\bdefer\b/i.test(tag))
    .map((tag) => {
      const srcMatch = tag.match(/\bsrc=(['"])([^'"]+)\1/i);
      return srcMatch ? srcMatch[2].split(/[?#]/, 1)[0].replace(/\\/g, '/') : '';
    })
    .filter(Boolean);
}

describe('kc-feature-flags.js - contrato estatico', () => {
  test('mantem IIFE sem require/import', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s+/);
  });

  test('expoe window.KCFF como Object.freeze', () => {
    expect(source).toContain('getRoot().KCFF = Object.freeze({');
    expect(source).toContain('get: get');
    expect(source).toContain('getAll: getAll');
    expect(source).toContain('isEnabled: isEnabled');
  });

  test('mantem exatamente 3 exports publicos', () => {
    const kcff = resetAndLoad({ flags: {} });
    expect(Object.keys(kcff).sort()).toEqual(['get', 'getAll', 'isEnabled'].sort());
    expect(Object.isFrozen(kcff)).toBe(true);
  });
});

describe('KCFF - leitura de flags', () => {
  test('funciona sem KC_ENV e respeita fallback', () => {
    const kcff = resetAndLoad(undefined);
    expect(kcff.get('missing.flag', 'fallback')).toBe('fallback');
    expect(kcff.isEnabled('missing.flag')).toBe(false);
    expect(kcff.isEnabled('missing.flag', true)).toBe(true);
  });

  test('le flags planas a partir de KC_ENV.flags', () => {
    const kcff = resetAndLoad({
      flags: {
        'profile.experimental': true,
        'search.rollout': 'on',
        'admin.disabled': 'off',
      },
    });

    expect(kcff.get('profile.experimental')).toBe(true);
    expect(kcff.isEnabled('profile.experimental')).toBe(true);
    expect(kcff.isEnabled('search.rollout')).toBe(true);
    expect(kcff.isEnabled('admin.disabled')).toBe(false);
  });

  test('le flags aninhadas com dot path', () => {
    const kcff = resetAndLoad({
      flags: {
        sw: { enabled: false },
        telemetry: { enabled: true },
      },
    });

    expect(kcff.get('sw.enabled')).toBe(false);
    expect(kcff.isEnabled('sw.enabled')).toBe(false);
    expect(kcff.isEnabled('telemetry.enabled')).toBe(true);
  });

  test('mescla featureFlags com flags mantendo flags como fonte preferencial', () => {
    const kcff = resetAndLoad({
      featureFlags: {
        'beta.feed': false,
        'legacy.only': true,
      },
      flags: {
        'beta.feed': true,
      },
    });

    expect(kcff.isEnabled('legacy.only')).toBe(true);
    expect(kcff.isEnabled('beta.feed')).toBe(true);
  });

  test('retorna clones para objetos e arrays', () => {
    const env = {
      flags: {
        group: { enabled: true, owners: ['admin'] },
      },
    };
    const kcff = resetAndLoad(env);
    const value = kcff.get('group');

    value.enabled = false;
    value.owners.push('mutated');

    expect(env.flags.group.enabled).toBe(true);
    expect(env.flags.group.owners).toEqual(['admin']);
  });

  test('getAll retorna snapshot defensivo congelado', () => {
    const env = {
      flags: {
        nested: { enabled: true },
      },
    };
    const kcff = resetAndLoad(env);
    const all = kcff.getAll();

    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all.nested)).toBe(true);
    expect(all['nested.enabled']).toBe(true);
    try {
      all.extra = true;
    } catch (_) {}
    expect(all.extra).toBeUndefined();
    expect(kcff.get('extra', 'missing')).toBe('missing');
  });

  test('expoe derivados seguros de ambiente', () => {
    const kcff = resetAndLoad({
      driver: 'supabase',
      environment: 'production',
      APP_ENV: 'production',
      isProduction: true,
      debug: false,
      flags: {},
    });

    expect(kcff.get('env.driver')).toBe('supabase');
    expect(kcff.isEnabled('env.driver.supabase')).toBe(true);
    expect(kcff.isEnabled('env.driver.local')).toBe(false);
    expect(kcff.isEnabled('env.isProduction')).toBe(true);
    expect(kcff.isEnabled('env.debug')).toBe(false);
  });

  test('permite leitura explicita de KC_ENV por prefixo env', () => {
    const kcff = resetAndLoad({
      supabase: { storageBucket: 'kino-media' },
      flags: {},
    });

    expect(kcff.get('env.supabase.storageBucket')).toBe('kino-media');
  });
});

describe('HTML - ordem canonica KCFF', () => {
  test('os 22 HTMLs carregam kc-feature-flags.js imediatamente apos kc-env.js', () => {
    expect(htmlFiles).toHaveLength(22);

    htmlFiles.forEach((relPath) => {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      const srcs = extractDeferredScriptSrcs(content);
      const prefix = relPath.startsWith('admin/') ? '../assets/js' : 'assets/js';
      const envSrc = `${prefix}/kc-env.js`;
      const flagsSrc = `${prefix}/kc-feature-flags.js`;
      const envIndex = srcs.indexOf(envSrc);

      expect(envIndex).toBeGreaterThanOrEqual(0);
      expect(srcs[envIndex + 1]).toBe(flagsSrc);
      expect(srcs.filter((src) => src === flagsSrc)).toHaveLength(1);
    });
  });
});
