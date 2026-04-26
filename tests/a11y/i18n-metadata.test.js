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

function extractHtmlAttr(content, attr) {
  const match = String(content).match(new RegExp(`\\s${attr}="([^"]+)"`));
  return match ? match[1] : '';
}

describe('kc-i18n.js - metadata runtime contract', () => {
  test('mantem IIFE browser-safe sem require/import', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s+/);
  });

  test('expoe helpers de metadata e alt no contrato publico', () => {
    const i18n = resetAndLoad();

    expect(Object.keys(i18n).sort()).toEqual([
      'applyAriaLabels',
      'applyDocumentMetadata',
      'applyPlaceholders',
      'applyStaticAlts',
      'applyTooltips',
      'keys',
      'locale',
      'n',
      't',
    ].sort());
    expect(typeof i18n.applyDocumentMetadata).toBe('function');
    expect(typeof i18n.applyStaticAlts).toBe('function');
    expect(typeof i18n.applyAriaLabels).toBe('function');
    expect(typeof i18n.applyPlaceholders).toBe('function');
    expect(typeof i18n.applyTooltips).toBe('function');
  });

  test('dicionario contem chaves de title, description e alt da v12.7.0', () => {
    const i18n = resetAndLoad();

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const titleKey = extractHtmlAttr(html, 'data-i18n-title');
      const descriptionKey = extractHtmlAttr(html, 'data-i18n-description');

      expect(titleKey).toMatch(/^meta-title\.[a-z0-9-]+$/);
      expect(descriptionKey).toMatch(/^meta-description\.[a-z0-9-]+$/);
      expect(i18n.keys()).toContain(titleKey);
      expect(i18n.keys()).toContain(descriptionKey);
      expect(i18n.t(titleKey)).not.toBe(titleKey);
      expect(i18n.t(descriptionKey)).not.toBe(descriptionKey);
    });

    ['alt.avatar-preview', 'alt.profile-avatar', 'alt.product-image', 'alt.author-avatar', 'alt.comment-user-avatar']
      .forEach((key) => {
        expect(i18n.keys()).toContain(key);
        expect(i18n.t(key)).not.toBe(key);
      });
  });
});

describe('HTML - marcacao declarativa de metadata e alt', () => {
  test('os 22 HTMLs declaram title e description i18n no elemento raiz', () => {
    expect(htmlFiles).toHaveLength(22);

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);

      expect(html).toMatch(/<html\b[^>]*\sdata-i18n-title="meta-title\.[a-z0-9-]+"/);
      expect(html).toMatch(/<html\b[^>]*\sdata-i18n-description="meta-description\.[a-z0-9-]+"/);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
    });
  });

  test('imagens com alt estatico nao vazio declaram data-i18n-alt', () => {
    const markedImages = [];

    htmlFiles.forEach((relPath) => {
      const html = readHtml(relPath);
      const images = [...html.matchAll(/<img\b[^>]*>/gi)];

      images.forEach((match) => {
        const tag = match[0];
        const altMatch = tag.match(/\salt="([^"]*)"/i);
        const alt = altMatch ? altMatch[1] : '';

        if (alt) {
          expect(tag).toMatch(/\sdata-i18n-alt="alt\.[a-z0-9-]+"/);
          markedImages.push(`${relPath}:${alt}`);
        }
      });
    });

    expect(markedImages).toHaveLength(5);
  });
});

describe('KCi18n metadata runtime', () => {
  test('applyDocumentMetadata atualiza title e meta description a partir do html', () => {
    document.documentElement.setAttribute('data-i18n-title', 'meta-title.index');
    document.documentElement.setAttribute('data-i18n-description', 'meta-description.index');
    document.head.innerHTML = '<title>Fallback</title><meta name="description" content="Fallback description">';

    const i18n = resetAndLoad();
    const result = i18n.applyDocumentMetadata();

    expect(result).toBe(true);
    expect(document.title).toBe('KinoCampus - Comunidade UFG');
    expect(document.querySelector('meta[name="description"]').getAttribute('content'))
      .toBe('KinoCampus é a plataforma da comunidade universitária da UFG. Compra e venda, caronas, moradia, eventos, oportunidades e achados/perdidos entre estudantes.');
  });

  test('applyDocumentMetadata cria meta description quando a pagina ainda nao tem uma', () => {
    document.documentElement.setAttribute('data-i18n-title', 'meta-title.auth-callback');
    document.documentElement.setAttribute('data-i18n-description', 'meta-description.auth-callback');
    document.head.innerHTML = '<title>Fallback</title>';

    const i18n = resetAndLoad();
    i18n.applyDocumentMetadata();

    expect(document.title).toBe('KinoCampus - Confirmando sua conta');
    expect(document.querySelector('meta[name="description"]').getAttribute('content'))
      .toBe('Confirme sua conta no KinoCampus com segurança e finalize o acesso à comunidade universitária da UFG.');
  });

  test('applyDocumentMetadata preserva fallback quando a chave nao existe', () => {
    document.documentElement.setAttribute('data-i18n-title', 'meta-title.inexistente');
    document.documentElement.setAttribute('data-i18n-description', 'meta-description.inexistente');
    document.head.innerHTML = '<title>Fallback</title><meta name="description" content="Fallback description">';

    const i18n = resetAndLoad();
    i18n.applyDocumentMetadata();

    expect(document.title).toBe('Fallback');
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('Fallback description');
  });

  test('applyStaticAlts atualiza apenas imagens marcadas', () => {
    document.body.innerHTML = `
      <img id="marked" alt="Fallback" data-i18n-alt="alt.product-image">
      <img id="decorative" alt="">
      <img id="plain" alt="Sem marca">
    `;

    const i18n = resetAndLoad();
    const count = i18n.applyStaticAlts();

    expect(count).toBe(1);
    expect(document.getElementById('marked').getAttribute('alt')).toBe('Imagem da publicação');
    expect(document.getElementById('decorative').getAttribute('alt')).toBe('');
    expect(document.getElementById('plain').getAttribute('alt')).toBe('Sem marca');
  });
});
