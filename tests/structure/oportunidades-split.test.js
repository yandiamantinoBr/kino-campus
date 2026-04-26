/**
 * tests/oportunidades-split.test.js — v13.7.1
 *
 * Valida o split de oportunidades.controller.js em sub-módulos:
 *   - oportunidades.normalize.js → funções globais + window._KCOpNormalize
 *
 * Testes:
 *   1. Contrato estático de oportunidades.normalize.js (funções exportadas)
 *   2. oportunidades.controller.js residual NÃO define summarizePost inline
 *   3. oportunidades.controller.js residual NÃO define normalizeOpportunityType inline
 *   4. Ordem de scripts no HTML consumidor (normalize antes de controller)
 *   5. Gate de tamanho: oportunidades.controller.js < 700L
 *   6. Testes funcionais: normalizeOpportunityType, resolveWorkMode, summarizePost
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '../..');
const CONTROLLER = path.join(ROOT, 'assets/js/controllers/public/oportunidades.controller.js');
const NORMALIZE  = path.join(ROOT, 'assets/js/controllers/public/oportunidades.normalize.js');
const HTML_FILE  = path.join(ROOT, 'oportunidades.html');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineCount(filePath) {
  return readFile(filePath).split('\n').length;
}

// ── 1. oportunidades.normalize.js — contrato estático ────────────────────────

describe('oportunidades.normalize.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(NORMALIZE); });

  test('arquivo existe', () => {
    expect(fs.existsSync(NORMALIZE)).toBe(true);
  });

  test('expõe window._KCOpNormalize', () => {
    expect(code).toContain('window._KCOpNormalize');
  });

  test('usa Object.freeze no namespace', () => {
    expect(code).toContain('Object.freeze(');
  });

  const PURE_EXPORTS = [
    'normalizeText',
    'canonicalCategory',
    'escapeHtml',
    'cloneSet',
    'sanitizePriceValue',
    'normalizePriceRange',
    'isMobileViewport',
    'normalizeDatePreset',
    'persistCachedPosts',
    'getFilterState',
    'getAreaDefinitions',
    'getPostIdentity',
    'normalizeOpportunityType',
    'resolveWorkModeValue',
    'resolveWorkMode',
    'resolveEmploymentTypeValue',
    'resolveEmploymentType',
    'resolveArea',
    'summarizePost',
    'applyCardDataset',
    'getSelectedInputs',
    'syncFilterInputs',
    'hasTypeModeSelection',
    'isTypeMatch',
    'isModeMatch',
    'categoryMatches',
    'queryMatches',
  ];

  PURE_EXPORTS.forEach(fn => {
    test('exporta função pura ' + fn, () => {
      expect(code).toContain('function ' + fn + '(');
    });
  });

  const STATE_REF_EXPORTS = [
    'matchesSummary',
    'cardMatchesSidebarFilters',
    'getAreaCatalog',
    'getRenderedAreaSelection',
    'getAreaLabel',
    'syncClearButtonState',
    'renderMobileRail',
  ];

  STATE_REF_EXPORTS.forEach(fn => {
    test('exporta função com stateRef ' + fn, () => {
      expect(code).toContain('function ' + fn + '(');
    });
  });

  test('matchesSummary aceita stateRef como 3º parâmetro', () => {
    expect(code).toMatch(/function matchesSummary\s*\(\s*summary\s*,\s*options\s*,\s*stateRef\s*\)/);
  });

  test('cardMatchesSidebarFilters aceita stateRef como 2º parâmetro', () => {
    expect(code).toMatch(/function cardMatchesSidebarFilters\s*\(\s*card\s*,\s*stateRef\s*\)/);
  });

  test('getAreaCatalog aceita stateRef como 2º parâmetro', () => {
    expect(code).toMatch(/function getAreaCatalog\s*\(\s*countMap\s*,\s*stateRef\s*\)/);
  });

  test('DEFAULT_AREAS definido como variável global', () => {
    expect(code).toContain('var DEFAULT_AREAS');
  });

  test('não usa IIFE (funções são globais)', () => {
    expect(code).not.toMatch(/^\s*\(function\s*\(\)\s*\{/m);
  });

  test('tem mais de 500 linhas', () => {
    expect(lineCount(NORMALIZE)).toBeGreaterThan(500);
  });
});

// ── 2. oportunidades.controller.js residual — grupos extraídos removidos ──────

describe('oportunidades.controller.js residual — funções extraídas não existem inline', () => {
  let code;
  beforeAll(() => { code = readFile(CONTROLLER); });

  test('NÃO define function summarizePost inline', () => {
    expect(code).not.toContain('function summarizePost(');
  });

  test('NÃO define function normalizeOpportunityType inline', () => {
    expect(code).not.toContain('function normalizeOpportunityType(');
  });

  test('NÃO define function normalizeText inline', () => {
    expect(code).not.toContain('function normalizeText(');
  });

  test('NÃO define function resolveWorkMode inline', () => {
    expect(code).not.toContain('function resolveWorkMode(');
  });

  test('NÃO define function applyCardDataset inline', () => {
    expect(code).not.toContain('function applyCardDataset(');
  });

  test('NÃO define function categoryMatches inline', () => {
    expect(code).not.toContain('function categoryMatches(');
  });

  test('NÃO define function matchesSummary inline (sem stateRef)', () => {
    // matchesSummary no controller NÃO deve existir como definição de função
    expect(code).not.toContain('function matchesSummary(');
  });

  test('NÃO define function cardMatchesSidebarFilters inline', () => {
    expect(code).not.toContain('function cardMatchesSidebarFilters(');
  });

  test('NÃO define var DEFAULT_AREAS inline', () => {
    expect(code).not.toContain('DEFAULT_AREAS = [');
  });

  test('mantém function upsertPosts', () => {
    expect(code).toContain('function upsertPosts(');
  });

  test('mantém function fetchAllPosts', () => {
    expect(code).toContain('function fetchAllPosts(');
  });

  test('mantém function bindSidebarEvents', () => {
    expect(code).toContain('function bindSidebarEvents(');
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test('chama matchesSummary com state como 3º argumento', () => {
    expect(code).toMatch(/matchesSummary\s*\([^)]+,\s*state\s*\)/);
  });

  test('chama cardMatchesSidebarFilters com state como 2º argumento', () => {
    expect(code).toMatch(/cardMatchesSidebarFilters\s*\(\s*card\s*,\s*state\s*\)/);
  });

  test('chama renderMobileRail com state', () => {
    expect(code).toContain('renderMobileRail(state)');
  });

  test('chama syncClearButtonState com state', () => {
    expect(code).toContain('syncClearButtonState(state)');
  });

  test('chama getAreaCatalog com state', () => {
    expect(code).toContain('getAreaCatalog(countMap, state)');
  });
});

// ── 3. HTML consumidor — ordem de carregamento ────────────────────────────────

describe('oportunidades.html — scripts carregados na ordem correta', () => {
  let html;
  beforeAll(() => { html = readFile(HTML_FILE); });

  test('carrega oportunidades.normalize.js', () => {
    expect(html).toContain('oportunidades.normalize.js');
  });

  test('carrega oportunidades.controller.js', () => {
    expect(html).toContain('oportunidades.controller.js');
  });

  test('oportunidades.normalize.js aparece antes de oportunidades.controller.js', () => {
    const idxNorm = html.indexOf('oportunidades.normalize.js');
    const idxCtrl = html.indexOf('oportunidades.controller.js');
    expect(idxNorm).toBeGreaterThan(-1);
    expect(idxCtrl).toBeGreaterThan(-1);
    expect(idxNorm).toBeLessThan(idxCtrl);
  });
});

// ── 4. Gate de tamanho ────────────────────────────────────────────────────────

describe('Gate de tamanho — oportunidades.controller.js < 700L', () => {
  test('oportunidades.controller.js existe', () => {
    expect(fs.existsSync(CONTROLLER)).toBe(true);
  });

  test('oportunidades.normalize.js existe', () => {
    expect(fs.existsSync(NORMALIZE)).toBe(true);
  });

  test('oportunidades.controller.js tem menos de 700 linhas', () => {
    const lines = lineCount(CONTROLLER);
    expect(lines).toBeLessThan(700);
  });

  test('oportunidades.normalize.js tem mais de 500 linhas', () => {
    const lines = lineCount(NORMALIZE);
    expect(lines).toBeGreaterThan(500);
  });
});

// ── 5. Testes funcionais ──────────────────────────────────────────────────────

describe('normalizeOpportunityType — funcional', () => {
  // Simular ambiente de browser mínimo
  beforeAll(() => {
    if (typeof window === 'undefined') {
      global.window = {
        KCUtils: null,
        kcFilters: null,
        KCFeedFilters: null,
        KCSessionStore: null,
        KCAPI: null,
        matchMedia: () => ({ matches: false }),
      };
    }
    // Carregar normalize.js em contexto Node
    // As funções ficam no global por serem declarações de função de nível global
    const code = readFile(NORMALIZE);
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', code + '\nreturn { normalizeOpportunityType, resolveWorkMode, summarizePost };');
    const exports = fn(global.window);
    global._testNormalizeOp = exports.normalizeOpportunityType;
    global._testResolveWorkMode = exports.resolveWorkMode;
    global._testSummarizePost = exports.summarizePost;
  });

  test('classifica estagio corretamente', () => {
    const result = global._testNormalizeOp('estágio', '');
    expect(result).toBe('estagio');
  });

  test('classifica emprego corretamente', () => {
    const result = global._testNormalizeOp('emprego', '');
    expect(result).toBe('emprego');
  });

  test('classifica freelancer corretamente', () => {
    const result = global._testNormalizeOp('freelancer', '');
    expect(result).toBe('freelancer');
  });

  test('classifica via sourceText quando value vazio', () => {
    const result = global._testNormalizeOp('', 'vaga de estágio remoto');
    expect(result).toBe('estagio');
  });
});

describe('resolveWorkMode — funcional', () => {
  test('detecta remoto via metadata', () => {
    const post = { metadata: { workMode: 'remoto' } };
    const result = global._testResolveWorkMode(post);
    expect(result.key).toBe('remoto');
    expect(result.remote).toBe(true);
  });

  test('detecta hibrido via titulo', () => {
    const post = { titulo: 'Vaga Híbrida de TI', metadata: {} };
    const result = global._testResolveWorkMode(post);
    expect(result.key).toBe('hibrido');
  });

  test('retorna key vazio quando não encontrado', () => {
    const post = { titulo: 'Vaga de TI', metadata: {} };
    const result = global._testResolveWorkMode(post);
    expect(result.key).toBe('');
  });
});
