'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/features/kc-search.js'), 'utf8');
const ENV_SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/boot/kc-env.js'), 'utf8');

function createPilotPage(flags, runShadow) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.kinocampus.com.br/index.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'loading' });
  window.KC_ENV = { version: '8.6.1' };
  window.KCFF = { isEnabled: jest.fn((name) => flags[name] === true) };
  window.KCSearchShared = { searchCollection() {} };
  window.KCSearchFieldRegistrySnapshot = { snapshotVersion: '1.0.0', sourceHash: 'abc', registry: { modules: {} } };
  window.KCSearchFieldRegistry = { projectCollection() {} };
  window.KCSearchQueryParser = { parse() {} };
  window.KCSearchShadowPipeline = { runShadow: jest.fn(runShadow) };
  window.console.warn = jest.fn();
  window.eval(SOURCE);
  return { dom, window };
}

const enabledFlags = { 'search.structuredRuntime': true, 'search.structuredPilot': true };
const posts = [
  { id: 'legacy-a', title: 'Resultado A' },
  { id: 'structured-b', title: 'Resultado B' }
];

describe('piloto estruturado da busca', () => {
  test('flag do piloto desligada preserva a mesma coleção sem executar pipeline', async () => {
    const page = createPilotPage({ 'search.structuredRuntime': true }, () => { throw new Error('não deve executar'); });
    const result = await page.window.kcSearch.applyStructuredPilot('evento', posts, { surface: 'results' });
    expect(result).toBe(posts);
    expect(page.window.KCSearchShadowPipeline.runShadow).not.toHaveBeenCalled();
    expect(ENV_SOURCE).toContain("'search.structuredRuntime': false");
    expect(ENV_SOURCE).toContain("'search.structuredPilot': false");
    page.dom.window.close();
  });

  test('sinal estruturado seleciona e ordena candidatos com pontuação sanitizada', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: 'eventos' },
      comparison: { intentApplied: false, supportedFilters: [] },
      candidate: [{ id: 'structured-b', relevanceScore: 17 }, { id: 'legacy-a', relevanceScore: 4 }]
    }));
    const result = await page.window.kcSearch.applyStructuredPilot('evento', posts, {
      surface: 'dropdown', hideClosed: true, limit: 8
    });
    expect(result.map((post) => [post.id, post.relevanceScore])).toEqual([
      ['structured-b', 17], ['legacy-a', 4]
    ]);
    expect(page.window.KCSearchShadowPipeline.runShadow).toHaveBeenCalledWith(
      'evento', posts, expect.objectContaining({ surface: 'dropdown', hideClosed: true, limit: 8 })
    );
    page.dom.window.close();
  });

  test('entrega chips e facetas sanitizados sem expor a consulta', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: 'oportunidades', intent: 'estagios' },
      comparison: { intentApplied: true, supportedFilters: ['workMode'], deferredFilters: [] },
      candidate: [{ id: 'structured-b', relevanceScore: 17 }],
      legacy: [{ id: 'legacy-a', relevanceScore: 4 }],
      facets: { modules: { oportunidades: 1 }, total: 1 }
    }));
    page.window.KCSearchQueryParser.parse = jest.fn(() => ({ filters: { workMode: 'remoto' } }));
    const onState = jest.fn();
    const result = await page.window.kcSearch.applyStructuredPilot('estágio remoto computação', posts, { onState });
    expect(result.map((post) => post.id)).toEqual(['structured-b']);
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      chips: expect.arrayContaining([
        { signal: 'module', label: 'Módulo: Oportunidades' },
        { signal: 'intent', label: 'Tipo: Estágios' },
        { signal: 'filter:workMode', label: 'Modalidade: Remoto' }
      ]),
      facets: { modules: { oportunidades: 1 }, total: 1 }
    }));
    expect(JSON.stringify(onState.mock.calls)).not.toContain('estágio remoto computação');
    page.dom.window.close();
  });

  test('consulta estruturada sem candidatos ainda produz estado explicável', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: 'eventos', intent: 'academicos' },
      comparison: { intentApplied: true, supportedFilters: [], deferredFilters: ['registrationStatus'] },
      candidate: [], legacy: [], facets: { modules: {}, total: 0 }
    }));
    page.window.KCSearchQueryParser.parse = jest.fn(() => ({ filters: { registrationStatus: 'open' } }));
    const onState = jest.fn();
    await expect(page.window.kcSearch.applyStructuredPilot('evento acadêmico inscrições abertas', [], { onState }))
      .resolves.toEqual([]);
    expect(page.window.KCSearchShadowPipeline.runShadow).toHaveBeenCalled();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({
      active: true, candidateCount: 0, deferred: ['Inscrições']
    }));
    page.dom.window.close();
  });

  test('consulta sem módulo, intenção ou filtro mantém resultados legados', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: null },
      comparison: { intentApplied: false, supportedFilters: [] },
      candidate: [{ id: 'structured-b', relevanceScore: 10 }]
    }));
    await expect(page.window.kcSearch.applyStructuredPilot('xyz', posts)).resolves.toBe(posts);
    page.dom.window.close();
  });

  test('zero candidato com sinal confiável produz estado vazio real', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: 'moradia' },
      comparison: { intentApplied: false, supportedFilters: ['priceMax'] },
      candidate: []
    }));
    await expect(page.window.kcSearch.applyStructuredPilot('quarto até 500', posts)).resolves.toEqual([]);
    page.dom.window.close();
  });

  test('ID inconsistente no contrato falha para a coleção legada', async () => {
    const page = createPilotPage(enabledFlags, () => ({
      plan: { module: 'eventos' },
      comparison: { intentApplied: false, supportedFilters: [] },
      candidate: [{ id: 'missing', relevanceScore: 10 }]
    }));
    await expect(page.window.kcSearch.applyStructuredPilot('evento', posts)).resolves.toBe(posts);
    page.dom.window.close();
  });

  test('exceção do pipeline preserva legado e emite aviso sem consulta', async () => {
    const page = createPilotPage(enabledFlags, () => { throw new Error('PIPELINE_FAILED'); });
    await expect(page.window.kcSearch.applyStructuredPilot('consulta privada', posts)).resolves.toBe(posts);
    expect(page.window.console.warn).toHaveBeenCalledWith(
      '[KinoCampus] Piloto estruturado falhou; resultados legados preservados.'
    );
    expect(JSON.stringify(page.window.console.warn.mock.calls)).not.toContain('consulta privada');
    page.dom.window.close();
  });
});
