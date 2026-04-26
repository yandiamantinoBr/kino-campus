/**
 * tests/i18n-aria-placeholder.test.js - v12.7.1 fase 2 i18n runtime
 *
 * Contrato: window.KCi18n.applyAriaLabels(root) e applyPlaceholders(root) leem
 * [data-i18n-aria-label] e [data-i18n-placeholder], substituem o valor do atributo
 * correspondente usando o dicionário pt-BR, e preservam o fallback (texto atual
 * do atributo) quando a chave não existe.
 *
 * Marcação declarativa nos 22 HTMLs:
 *   data-i18n-aria-label="aria-label.<nome>"
 *   data-i18n-placeholder="placeholder.<nome>"
 *
 * Garantia: os helpers são idempotentes (podem ser chamados várias vezes) e não
 * quebram se o elemento não tiver o atributo alvo.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const MODULE_PATH = path.join(ROOT_DIR, 'assets/js/core/kc-i18n.js');
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

describe('v12.7.1 — helpers applyAriaLabels e applyPlaceholders', () => {
  test('applyAriaLabels existe no contrato publico KCi18n', () => {
    const i18n = resetAndLoad();
    expect(typeof i18n.applyAriaLabels).toBe('function');
  });

  test('applyPlaceholders existe no contrato publico KCi18n', () => {
    const i18n = resetAndLoad();
    expect(typeof i18n.applyPlaceholders).toBe('function');
  });

  test('applyAriaLabels traduz elementos marcados preservando os nao marcados', () => {
    document.body.innerHTML = `
      <button id="marked" aria-label="Fallback" data-i18n-aria-label="aria-label.menu-open"></button>
      <button id="marked-close" aria-label="Fallback Close" data-i18n-aria-label="aria-label.menu-close"></button>
      <button id="plain" aria-label="Sem marcação"></button>
    `;

    const i18n = resetAndLoad();
    const count = i18n.applyAriaLabels();

    expect(count).toBeGreaterThanOrEqual(2);
    expect(document.getElementById('marked').getAttribute('aria-label')).toBe('Abrir menu');
    expect(document.getElementById('marked-close').getAttribute('aria-label')).toBe('Fechar menu');
    expect(document.getElementById('plain').getAttribute('aria-label')).toBe('Sem marcação');
  });

  test('applyAriaLabels preserva fallback quando a chave nao existe', () => {
    document.body.innerHTML = `
      <button id="missing" aria-label="Texto preservado" data-i18n-aria-label="aria-label.inexistente-xyz"></button>
    `;

    const i18n = resetAndLoad();
    i18n.applyAriaLabels();

    expect(document.getElementById('missing').getAttribute('aria-label')).toBe('Texto preservado');
  });

  test('applyPlaceholders traduz inputs marcados preservando os nao marcados', () => {
    document.body.innerHTML = `
      <input id="marked" placeholder="Fallback input" data-i18n-placeholder="placeholder.search-main" />
      <textarea id="marked-comment" placeholder="Fallback textarea" data-i18n-placeholder="placeholder.comment"></textarea>
      <input id="plain" placeholder="Sem marcação" />
    `;

    const i18n = resetAndLoad();
    const count = i18n.applyPlaceholders();

    expect(count).toBeGreaterThanOrEqual(2);
    expect(document.getElementById('marked').getAttribute('placeholder')).toBe('Busque por itens, eventos, vagas na UFG...');
    expect(document.getElementById('marked-comment').getAttribute('placeholder')).toBe('Deixe o seu comentário');
    expect(document.getElementById('plain').getAttribute('placeholder')).toBe('Sem marcação');
  });

  test('applyPlaceholders preserva fallback quando a chave nao existe', () => {
    document.body.innerHTML = `
      <input id="missing" placeholder="Fallback preservado" data-i18n-placeholder="placeholder.inexistente-xyz" />
    `;

    const i18n = resetAndLoad();
    i18n.applyPlaceholders();

    expect(document.getElementById('missing').getAttribute('placeholder')).toBe('Fallback preservado');
  });

  test('helpers sao idempotentes (chamadas repetidas produzem mesmo resultado)', () => {
    document.body.innerHTML = `
      <button id="btn" aria-label="Fallback" data-i18n-aria-label="aria-label.menu-open"></button>
      <input id="inp" placeholder="Fallback" data-i18n-placeholder="placeholder.search-main" />
    `;

    const i18n = resetAndLoad();
    i18n.applyAriaLabels();
    i18n.applyPlaceholders();

    expect(document.getElementById('btn').getAttribute('aria-label')).toBe('Abrir menu');
    expect(document.getElementById('inp').getAttribute('placeholder')).toBe('Busque por itens, eventos, vagas na UFG...');

    // segunda chamada não deve mudar nem quebrar
    i18n.applyAriaLabels();
    i18n.applyPlaceholders();

    expect(document.getElementById('btn').getAttribute('aria-label')).toBe('Abrir menu');
    expect(document.getElementById('inp').getAttribute('placeholder')).toBe('Busque por itens, eventos, vagas na UFG...');
  });

  test('applyAriaLabels aceita root escopado', () => {
    // limpa DOM e carrega modulo ANTES de montar o HTML escopado, para evitar
    // que applyRuntimeI18n traduza o elemento "outside" no bootstrap do modulo.
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <div id="scope">
        <button id="inner" aria-label="Fallback" data-i18n-aria-label="aria-label.menu-open"></button>
      </div>
      <button id="outside" aria-label="Fallback fora" data-i18n-aria-label="aria-label.menu-close"></button>
    `;

    const scope = document.getElementById('scope');
    const count = i18n.applyAriaLabels(scope);

    expect(count).toBe(1);
    expect(document.getElementById('inner').getAttribute('aria-label')).toBe('Abrir menu');
    expect(document.getElementById('outside').getAttribute('aria-label')).toBe('Fallback fora');
  });

  test('applyPlaceholders aceita root escopado', () => {
    // mesmo motivo do teste anterior: limpa DOM e carrega modulo ANTES de
    // montar o HTML escopado.
    document.body.innerHTML = '';
    const i18n = resetAndLoad();

    document.body.innerHTML = `
      <div id="scope">
        <input id="inner" placeholder="Fallback" data-i18n-placeholder="placeholder.search-main" />
      </div>
      <input id="outside" placeholder="Fallback fora" data-i18n-placeholder="placeholder.comment" />
    `;

    const scope = document.getElementById('scope');
    const count = i18n.applyPlaceholders(scope);

    expect(count).toBe(1);
    expect(document.getElementById('inner').getAttribute('placeholder')).toBe('Busque por itens, eventos, vagas na UFG...');
    expect(document.getElementById('outside').getAttribute('placeholder')).toBe('Fallback fora');
  });

  test('helpers retornam 0 quando nao ha elementos marcados', () => {
    document.body.innerHTML = '<div><p>Sem marcacao i18n</p></div>';

    const i18n = resetAndLoad();
    expect(i18n.applyAriaLabels()).toBe(0);
    expect(i18n.applyPlaceholders()).toBe(0);
  });
});

describe('v12.7.1 — marcacao declarativa nos 22 HTMLs', () => {
  test('os 22 HTMLs canonicos estao listados', () => {
    expect(htmlFiles).toHaveLength(22);
  });

  test('toda tag com aria-label estatico tem data-i18n-aria-label correspondente', () => {
    const tagWithAriaLabelRe = /<[^>]*\saria-label="[^"]+"[^>]*>/gi;

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const tags = [...html.matchAll(tagWithAriaLabelRe)].map((match) => match[0]);

      tags.forEach((tag) => {
        expect(tag).toMatch(/\sdata-i18n-aria-label="aria-label\.[a-z][a-z0-9-]*"/);
      });
    });
  });

  test('toda tag com placeholder estatico tem data-i18n-placeholder correspondente', () => {
    const tagWithPlaceholderRe = /<[^>]*\splaceholder="[^"]+"[^>]*>/gi;

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const tags = [...html.matchAll(tagWithPlaceholderRe)].map((match) => match[0]);

      tags.forEach((tag) => {
        expect(tag).toMatch(/\sdata-i18n-placeholder="placeholder\.[a-z][a-z0-9-]*"/);
      });
    });
  });

  test('todas as chaves data-i18n-aria-label usadas existem no dicionario KCi18n', () => {
    const i18n = resetAndLoad();
    const seen = new Set();

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const matches = [...html.matchAll(/data-i18n-aria-label="(aria-label\.[a-z0-9-]+)"/g)];
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

  test('todas as chaves data-i18n-placeholder usadas existem no dicionario KCi18n', () => {
    const i18n = resetAndLoad();
    const seen = new Set();

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const matches = [...html.matchAll(/data-i18n-placeholder="(placeholder\.[a-z0-9-]+)"/g)];
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
});

describe('v12.7.1 — kc-i18n.js contrato de codigo', () => {
  test('fonte define applyAriaLabels e applyPlaceholders', () => {
    expect(source).toMatch(/function\s+applyAriaLabels\s*\(/);
    expect(source).toMatch(/function\s+applyPlaceholders\s*\(/);
  });

  test('fonte expoe applyAriaLabels e applyPlaceholders em KCi18n', () => {
    expect(source).toMatch(/applyAriaLabels\s*:\s*applyAriaLabels/);
    expect(source).toMatch(/applyPlaceholders\s*:\s*applyPlaceholders/);
  });

  test('fonte preserva valor original quando chave nao existe (fallback)', () => {
    // checa que applyAriaLabels/applyPlaceholders usam translateWithFallback
    expect(source).toMatch(/translateWithFallback/);
  });
});
