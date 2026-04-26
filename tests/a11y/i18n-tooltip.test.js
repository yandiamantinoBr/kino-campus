/**
 * tests/i18n-tooltip.test.js - v12.7.2 fase 3 i18n runtime
 *
 * Contrato: window.KCi18n.applyTooltips(root) le [data-i18n-tooltip],
 * substitui o atributo title do elemento usando o dicionario pt-BR, e
 * preserva o fallback (texto atual do atributo) quando a chave nao existe.
 *
 * Marcacao declarativa nos 22 HTMLs:
 *   data-i18n-tooltip="tooltip.<nome>"
 *
 * Garantia: o helper e idempotente (pode ser chamado varias vezes) e nao
 * quebra se o elemento nao tiver o atributo title.
 *
 * Nota: data-i18n-tooltip NAO conflita com data-i18n-title (usado apenas no
 * elemento <html> para o page-title de metadata).
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

describe('v12.7.2 — helper applyTooltips', () => {
  test('applyTooltips existe no contrato publico KCi18n', () => {
    const i18n = resetAndLoad();
    expect(typeof i18n.applyTooltips).toBe('function');
  });

  test('applyTooltips traduz elementos marcados preservando os nao marcados', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <button id="marked" title="Fallback" data-i18n-tooltip="tooltip.theme-toggle"></button>
      <button id="marked2" title="Fallback2" data-i18n-tooltip="tooltip.how-it-works"></button>
      <button id="plain" title="Sem marcacao"></button>
    `;

    const count = i18n.applyTooltips();

    expect(count).toBeGreaterThanOrEqual(2);
    expect(document.getElementById('marked').getAttribute('title')).toBe('Alternar tema');
    expect(document.getElementById('marked2').getAttribute('title')).toBe('Como funciona?');
    expect(document.getElementById('plain').getAttribute('title')).toBe('Sem marcacao');
  });

  test('applyTooltips preserva fallback quando a chave nao existe', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <button id="missing" title="Texto preservado" data-i18n-tooltip="tooltip.inexistente-xyz"></button>
    `;

    i18n.applyTooltips();

    expect(document.getElementById('missing').getAttribute('title')).toBe('Texto preservado');
  });

  test('applyTooltips e idempotente (chamadas repetidas produzem mesmo resultado)', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <button id="btn" title="Fallback" data-i18n-tooltip="tooltip.theme-toggle"></button>
    `;

    i18n.applyTooltips();
    expect(document.getElementById('btn').getAttribute('title')).toBe('Alternar tema');

    // segunda chamada nao deve mudar nem quebrar
    i18n.applyTooltips();
    expect(document.getElementById('btn').getAttribute('title')).toBe('Alternar tema');
  });

  test('applyTooltips aceita root escopado', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <div id="scope">
        <button id="inner" title="Fallback" data-i18n-tooltip="tooltip.theme-toggle"></button>
      </div>
      <button id="outside" title="Fallback fora" data-i18n-tooltip="tooltip.how-it-works"></button>
    `;

    const scope = document.getElementById('scope');
    const count = i18n.applyTooltips(scope);

    expect(count).toBe(1);
    expect(document.getElementById('inner').getAttribute('title')).toBe('Alternar tema');
    expect(document.getElementById('outside').getAttribute('title')).toBe('Fallback fora');
  });

  test('applyTooltips retorna 0 quando nao ha elementos marcados', () => {
    document.body.innerHTML = '<div><p>Sem marcacao i18n</p></div>';

    const i18n = resetAndLoad();
    expect(i18n.applyTooltips()).toBe(0);
  });

  test('applyTooltips traduz tooltip.format-bold e tooltip.format-italic corretamente', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <button id="bold" title="Fallback" data-i18n-tooltip="tooltip.format-bold"></button>
      <button id="italic" title="Fallback" data-i18n-tooltip="tooltip.format-italic"></button>
      <button id="strike" title="Fallback" data-i18n-tooltip="tooltip.format-strike"></button>
    `;

    i18n.applyTooltips();

    expect(document.getElementById('bold').getAttribute('title')).toBe('Negrito');
    expect(document.getElementById('italic').getAttribute('title')).toBe('Itálico');
    expect(document.getElementById('strike').getAttribute('title')).toBe('Tachado');
  });

  test('applyTooltips traduz tooltip de admin filters', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <select id="s1" title="Fallback" data-i18n-tooltip="tooltip.filter-status"></select>
      <select id="s2" title="Fallback" data-i18n-tooltip="tooltip.filter-category"></select>
      <select id="s3" title="Fallback" data-i18n-tooltip="tooltip.filter-urgency"></select>
    `;

    i18n.applyTooltips();

    expect(document.getElementById('s1').getAttribute('title')).toBe('Filtrar por status');
    expect(document.getElementById('s2').getAttribute('title')).toBe('Filtrar por categoria');
    expect(document.getElementById('s3').getAttribute('title')).toBe('Filtrar por urgência');
  });

  test('applyTooltips traduz tooltip.ods-* corretamente', () => {
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <a id="ods4" title="Fallback" data-i18n-tooltip="tooltip.ods-04" href="#"></a>
      <a id="ods13" title="Fallback" data-i18n-tooltip="tooltip.ods-13" href="#"></a>
    `;

    i18n.applyTooltips();

    expect(document.getElementById('ods4').getAttribute('title')).toBe('ODS 04: Educação de Qualidade');
    expect(document.getElementById('ods13').getAttribute('title')).toBe('ODS 13: Ação Contra a Mudança Global do Clima');
  });
});

describe('v12.7.2 — marcacao declarativa nos 22 HTMLs', () => {
  test('os 22 HTMLs canonicos estao listados', () => {
    expect(htmlFiles).toHaveLength(22);
  });

  test('toda tag com title estatico nao-vazio tem data-i18n-tooltip correspondente', () => {
    // A mesma regex do hygiene-check.js: exclui <title> e o elemento <html>
    const tagWithTitleRe = /<(?!title\b)[^>]*\s+title="[^"]+"[^>]*>/gi;

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const tags = [...html.matchAll(tagWithTitleRe)]
        .map((match) => match[0])
        .filter((tag) => !/^<html\b/i.test(tag.trim()));

      tags.forEach((tag) => {
        expect(tag).toMatch(/\sdata-i18n-tooltip="tooltip\.[a-z][a-z0-9-]*"/);
      });
    });
  });

  test('todas as chaves data-i18n-tooltip usadas existem no dicionario KCi18n', () => {
    const i18n = resetAndLoad();
    const seen = new Set();

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const matches = [...html.matchAll(/data-i18n-tooltip="(tooltip\.[a-z0-9-]+)"/g)];
      matches.forEach((m) => seen.add(m[1]));
    });

    seen.forEach((key) => {
      const value = i18n.t(key);
      expect(typeof value).toBe('string');
      expect(value).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    });

    expect(seen.size).toBeGreaterThan(0);
  });

  test('os 22 HTMLs contem ao menos 1 marcacao data-i18n-tooltip cada', () => {
    // Pelo menos theme-toggle esta em todos os 22 HTMLs
    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      expect(html).toMatch(/data-i18n-tooltip="tooltip\.[a-z][a-z0-9-]*"/);
    });
  });
});

describe('v12.7.2 — kc-i18n.js contrato de codigo', () => {
  test('fonte define applyTooltips', () => {
    expect(source).toMatch(/function\s+applyTooltips\s*\(/);
  });

  test('fonte expoe applyTooltips em KCi18n', () => {
    expect(source).toMatch(/applyTooltips\s*:\s*applyTooltips/);
  });

  test('fonte preserva fallback via translateWithFallback', () => {
    expect(source).toMatch(/translateWithFallback/);
  });

  test('fonte contem chaves tooltip.theme-toggle e tooltip.how-it-works', () => {
    expect(source).toMatch(/'tooltip\.theme-toggle'/);
    expect(source).toMatch(/'tooltip\.how-it-works'/);
    expect(source).toMatch(/'tooltip\.ods-04'/);
  });

  test('fonte contem a categoria tooltip com pelo menos 25 chaves', () => {
    const tooltipKeys = (source.match(/'tooltip\.[a-z][a-z0-9-]*'\s*:/g) || []);
    expect(tooltipKeys.length).toBeGreaterThanOrEqual(25);
  });
});
