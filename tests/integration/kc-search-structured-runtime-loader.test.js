'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/features/kc-search.js'), 'utf8');

function createPage(enabled, failureFile) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.kinocampus.com.br/index.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'loading' });
  Object.defineProperty(window.document, 'currentScript', {
    configurable: true,
    value: { src: 'https://www.kinocampus.com.br/assets/js/features/kc-search.js?v=8.6.13' }
  });
  window.KC_ENV = { version: '8.6.1' };
  window.KCFF = { isEnabled: jest.fn((name) => name === 'search.structuredRuntime' && enabled) };
  window.console.warn = jest.fn();
  const appended = [];
  const globals = {
    'kc-search-registry.generated.js': ['KCSearchFieldRegistrySnapshot', { snapshotVersion: '1.0.0', sourceHash: 'abc', registry: { modules: {} } }],
    'kc-search-fields.shared.js': ['KCSearchFieldRegistry', { projectCollection() {} }],
    'kc-search-query-parser.shared.js': ['KCSearchQueryParser', { parse() {} }],
    'kc-search-shadow-pipeline.shared.js': ['KCSearchShadowPipeline', { runShadow() {} }]
  };
  const append = window.document.head.appendChild.bind(window.document.head);
  jest.spyOn(window.document.head, 'appendChild').mockImplementation((node) => {
    if (!node.dataset || !node.dataset.kcSearchRuntime) return append(node);
    const file = node.dataset.kcSearchRuntime;
    appended.push(file);
    Promise.resolve().then(() => {
      if (file === failureFile) {
        node.onerror(new window.Event('error'));
        return;
      }
      const [globalName, value] = globals[file];
      window[globalName] = value;
      node.onload(new window.Event('load'));
    });
    return node;
  });
  window.eval(SOURCE);
  return { appended, dom, window };
}

describe('lazy loader do runtime estruturado de busca', () => {
  test('flag desligada produz zero scripts e retorna fallback nulo', async () => {
    const page = createPage(false);
    await expect(page.window.kcSearch.loadStructuredRuntime()).resolves.toBeNull();
    expect(page.appended).toEqual([]);
    expect(page.window.KCFF.isEnabled).toHaveBeenCalledWith('search.structuredRuntime', false);
    page.dom.window.close();
  });

  test('flag ligada carrega os quatro contratos em ordem e monta runtime congelado', async () => {
    const page = createPage(true);
    const runtime = await page.window.kcSearch.loadStructuredRuntime();
    expect(page.appended).toEqual([
      'kc-search-registry.generated.js',
      'kc-search-fields.shared.js',
      'kc-search-query-parser.shared.js',
      'kc-search-shadow-pipeline.shared.js'
    ]);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(runtime).toMatchObject({ snapshotVersion: '1.0.0', sourceHash: 'abc', registry: { modules: {} } });
    page.dom.window.close();
  });

  test('chamadas concorrentes são idempotentes', async () => {
    const page = createPage(true);
    const first = page.window.kcSearch.loadStructuredRuntime();
    const second = page.window.kcSearch.loadStructuredRuntime();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(page.appended).toHaveLength(4);
    page.dom.window.close();
  });

  test('falha de asset retorna nulo e preserva busca legada', async () => {
    const page = createPage(true, 'kc-search-fields.shared.js');
    await expect(page.window.kcSearch.loadStructuredRuntime()).resolves.toBeNull();
    expect(page.appended).toEqual(['kc-search-registry.generated.js', 'kc-search-fields.shared.js']);
    expect(page.window.console.warn).toHaveBeenCalledWith(
      '[KinoCampus] Runtime estruturado indisponível; busca legada preservada.',
      expect.objectContaining({ message: 'KC_SEARCH_RUNTIME_LOAD_FAILED:kc-search-fields.shared.js' })
    );
    page.dom.window.close();
  });

  test('URLs são locais, versionadas e não alteram HTML estaticamente', () => {
    const page = createPage(false);
    const resolve = page.window.kcSearch.__internals.resolveStructuredSearchAsset;
    expect(resolve('kc-search-registry.generated.js')).toBe('https://www.kinocampus.com.br/assets/js/shared/kc-search-registry.generated.js?v=8.6.13');
    expect(SOURCE).toContain("window.KCFF.isEnabled('search.structuredRuntime', false)");
    expect(SOURCE).toContain("window.KCFF.isEnabled('search.structuredPilot', false)");
    expect((SOURCE.match(/runtime\.pipeline\.runShadow/g) || [])).toHaveLength(1);
    page.dom.window.close();
  });
});
