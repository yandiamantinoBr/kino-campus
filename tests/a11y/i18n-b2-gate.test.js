/**
 * tests/i18n-b2-gate.test.js — v12.7.3 gate formal da trilha B2 i18n runtime
 *
 * Garante que os pisos de regressao da trilha B2 nao regridam em iteracoes futuras.
 * Qualquer reducao abaixo dos valores declarados indica remocao intencional ou
 * acidental de cobertura e deve ser investigada antes de merge.
 *
 * Pisos estabelecidos em v12.7.3:
 *   kc-i18n.js: >= 800 linhas, >= 440 chaves unicas, 9 metodos no contrato
 *   Markings nos 22 HTMLs: aria >= 189, placeholder >= 59, tooltip >= 55, alt >= 5
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const MODULE_PATH = path.join(ROOT_DIR, 'assets/js/kc-i18n.js');
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

const B2_GATE = {
  minLines: 800,
  minKeys: 440,
  publicMethods: 9,
  minAriaMarkings: 189,
  minPlaceholderMarkings: 59,
  minTooltipMarkings: 55,
  minAltMarkings: 5,
};

function resetAndLoad() {
  jest.resetModules();
  global.window = global.window || global;
  delete window.KCi18n;
  delete global.KCi18n;
  require(MODULE_PATH);
  return window.KCi18n || global.KCi18n;
}

function readHtml(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Suíte 1 — integridade do modulo kc-i18n.js
// ---------------------------------------------------------------------------

describe('v12.7.3 — gate B2: kc-i18n.js integridade', () => {
  test(`kc-i18n.js tem pelo menos ${B2_GATE.minLines} linhas`, () => {
    const lineCount = source.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(B2_GATE.minLines);
  });

  test(`kc-i18n.js tem pelo menos ${B2_GATE.minKeys} chaves unicas no dicionario`, () => {
    const matches = [...source.matchAll(/'[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*'\s*:/g)];
    const keyCount = new Set(
      matches.map((m) => m[0].replace(/'\s*:$/, '').replace(/'/g, ''))
    ).size;
    expect(keyCount).toBeGreaterThanOrEqual(B2_GATE.minKeys);
  });

  test(`contrato publico KCi18n expoe exatamente ${B2_GATE.publicMethods} metodos`, () => {
    const i18n = resetAndLoad();
    expect(Object.keys(i18n)).toHaveLength(B2_GATE.publicMethods);
  });

  test('contrato publico KCi18n contem todos os 9 metodos esperados', () => {
    const i18n = resetAndLoad();
    const expected = [
      'locale',
      't',
      'n',
      'keys',
      'applyDocumentMetadata',
      'applyStaticAlts',
      'applyAriaLabels',
      'applyPlaceholders',
      'applyTooltips',
    ];
    expected.forEach((method) => {
      expect(Object.keys(i18n)).toContain(method);
    });
  });

  test('keys() retorna pelo menos 440 chaves unicas', () => {
    const i18n = resetAndLoad();
    const allKeys = i18n.keys();
    expect(allKeys.length).toBeGreaterThanOrEqual(B2_GATE.minKeys);
    // sem duplicatas
    const unique = new Set(allKeys);
    expect(allKeys.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// Suíte 2 — totais de markings nos 22 HTMLs
// ---------------------------------------------------------------------------

describe('v12.7.3 — gate B2: totais de markings nos 22 HTMLs', () => {
  test('os 22 HTMLs canonicos estao listados', () => {
    expect(htmlFiles).toHaveLength(22);
  });

  test(`data-i18n-aria-label: pelo menos ${B2_GATE.minAriaMarkings} marcacoes nos 22 HTMLs`, () => {
    let total = 0;
    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      total += (html.match(/data-i18n-aria-label=/g) || []).length;
    });
    expect(total).toBeGreaterThanOrEqual(B2_GATE.minAriaMarkings);
  });

  test(`data-i18n-placeholder: pelo menos ${B2_GATE.minPlaceholderMarkings} marcacoes nos 22 HTMLs`, () => {
    let total = 0;
    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      total += (html.match(/data-i18n-placeholder=/g) || []).length;
    });
    expect(total).toBeGreaterThanOrEqual(B2_GATE.minPlaceholderMarkings);
  });

  test(`data-i18n-tooltip: pelo menos ${B2_GATE.minTooltipMarkings} marcacoes nos 22 HTMLs`, () => {
    let total = 0;
    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      total += (html.match(/data-i18n-tooltip=/g) || []).length;
    });
    expect(total).toBeGreaterThanOrEqual(B2_GATE.minTooltipMarkings);
  });

  test(`data-i18n-alt: pelo menos ${B2_GATE.minAltMarkings} marcacoes nos 22 HTMLs`, () => {
    let total = 0;
    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      total += (html.match(/data-i18n-alt=/g) || []).length;
    });
    expect(total).toBeGreaterThanOrEqual(B2_GATE.minAltMarkings);
  });
});

// ---------------------------------------------------------------------------
// Suíte 3 — presenca de infraestrutura no codigo-fonte
// ---------------------------------------------------------------------------

describe('v12.7.3 — gate B2: infraestrutura no kc-i18n.js', () => {
  test('fonte define translateWithFallback', () => {
    expect(source).toMatch(/function\s+translateWithFallback\s*\(/);
  });

  test('fonte define applyRuntimeI18n', () => {
    expect(source).toMatch(/function\s+applyRuntimeI18n\s*\(/);
  });

  test('fonte define todos os 5 helpers de superficie', () => {
    expect(source).toMatch(/function\s+applyDocumentMetadata\s*\(/);
    expect(source).toMatch(/function\s+applyStaticAlts\s*\(/);
    expect(source).toMatch(/function\s+applyAriaLabels\s*\(/);
    expect(source).toMatch(/function\s+applyPlaceholders\s*\(/);
    expect(source).toMatch(/function\s+applyTooltips\s*\(/);
  });

  test('fonte expoe todos os helpers no objeto KCi18n', () => {
    expect(source).toMatch(/applyDocumentMetadata\s*:\s*applyDocumentMetadata/);
    expect(source).toMatch(/applyStaticAlts\s*:\s*applyStaticAlts/);
    expect(source).toMatch(/applyAriaLabels\s*:\s*applyAriaLabels/);
    expect(source).toMatch(/applyPlaceholders\s*:\s*applyPlaceholders/);
    expect(source).toMatch(/applyTooltips\s*:\s*applyTooltips/);
  });

  test('fonte contem as 6 categorias de runtime (aria-label, placeholder, tooltip, alt, meta-title, meta-description)', () => {
    expect(source).toMatch(/'aria-label\.[a-z]/);
    expect(source).toMatch(/'placeholder\.[a-z]/);
    expect(source).toMatch(/'tooltip\.[a-z]/);
    expect(source).toMatch(/'alt\.[a-z]/);
    expect(source).toMatch(/'meta-title\.[a-z]/);
    expect(source).toMatch(/'meta-description\.[a-z]/);
  });

  test('fonte registra o contrato em window.KCi18n', () => {
    expect(source).toMatch(/window\.KCi18n\s*=/);
  });
});
