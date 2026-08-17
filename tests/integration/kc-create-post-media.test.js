/**
 * @file kc-create-post-media.test.js
 * @description Static contract tests for assets/js/features/create-post/kc-create-post.media.js (v11.31.3)
 * Verifica estrutura IIFE, namespace, constantes, leitura/compressão, gerenciamento
 * de imagens e HTML da seção de imagens.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/features/create-post/kc-create-post.media.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

// ── Estrutura IIFE e namespace ────────────────────────────────────────────────

describe('kc-create-post.media — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function(){})()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCCreatePost', () => {
    expect(source).toContain('window._KCCreatePost = window._KCCreatePost || {};');
  });

  test('registra window._KCCreatePost.media no final do IIFE', () => {
    expect(source).toContain('window._KCCreatePost.media = {');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/^import\s/m);
  });
});

// ── Utilitário local esc ─────────────────────────────────────────────────────

describe('kc-create-post.media — utilitário _esc', () => {
  test('define _esc() delegando a window.KCUtils.escapeHtml', () => {
    expect(source).toContain('function _esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });
});

// ── Acesso defensivo ao estado ────────────────────────────────────────────────

describe('kc-create-post.media — acesso ao estado compartilhado', () => {
  test('define _getState() lendo window._KCCreatePost._state', () => {
    expect(source).toContain('function _getState()');
    expect(source).toContain('window._KCCreatePost._state');
  });

  test('define _rerender() delegando a window.kcRenderCreateModal', () => {
    expect(source).toContain('function _rerender()');
    expect(source).toContain('window.kcRenderCreateModal');
  });
});

// ── Constante KC_CREATE_MAX_IMAGES ───────────────────────────────────────────

describe('kc-create-post.media — constante de limite', () => {
  test('define KC_CREATE_MAX_IMAGES = 12', () => {
    expect(source).toContain('var KC_CREATE_MAX_IMAGES = 12;');
  });

  test('exporta MAX_IMAGES no namespace', () => {
    expect(source).toContain('MAX_IMAGES: KC_CREATE_MAX_IMAGES,');
  });
});

// ── Leitura e compressão ─────────────────────────────────────────────────────

describe('kc-create-post.media — leitura de arquivo', () => {
  test('define kcReadFileAsDataUrl usando FileReader', () => {
    expect(source).toContain('function kcReadFileAsDataUrl(file)');
    expect(source).toContain('new FileReader()');
    expect(source).toContain('reader.readAsDataURL(file)');
    expect(source).toContain("new Error('Falha ao ler imagem')");
  });

  test('exporta readFile no namespace', () => {
    expect(source).toContain('readFile: kcReadFileAsDataUrl,');
  });
});

describe('kc-create-post.media — compressão de imagem', () => {
  test('define kcReadAndCompressImage com canvas e qualidade configurável', () => {
    expect(source).toContain('async function kcReadAndCompressImage(file, opts)');
    expect(source).toContain("canvas.toDataURL('image/jpeg', quality)");
    expect(source).toContain("'image/gif'");
  });

  test('respeita maxSide e quality via opts', () => {
    expect(source).toContain("var maxSide = (opts && typeof opts.maxSide === 'number') ? opts.maxSide : 1200;");
    expect(source).toContain("var quality = (opts && typeof opts.quality === 'number') ? opts.quality : 0.82;");
  });

  test('exporta compressImage no namespace', () => {
    expect(source).toContain('compressImage: kcReadAndCompressImage,');
  });
});

// ── Gerenciamento de imagens ──────────────────────────────────────────────────

describe('kc-create-post.media — adicionar imagens', () => {
  test('define kcAddImagesFromFiles como função async', () => {
    expect(source).toContain('async function kcAddImagesFromFiles(fileList)');
  });

  test('usa _getState() para acessar o estado', () => {
    const fnMatch = source.indexOf('async function kcAddImagesFromFiles');
    expect(fnMatch).toBeGreaterThan(-1);
    expect(source.slice(fnMatch, fnMatch + 400)).toContain('_getState()');
  });

  test('respeita KC_CREATE_MAX_IMAGES', () => {
    expect(source).toContain('KC_CREATE_MAX_IMAGES - state.images.length');
  });

  test('filtra apenas arquivos de imagem', () => {
    expect(source).toContain("f.type.startsWith('image/')");
  });

  test('protege contra arquivos maiores que 8MB', () => {
    expect(source).toContain('file.size > 8 * 1024 * 1024');
    expect(source).toContain("'Imagem muito grande (máx ~8MB). Use uma menor.'");
  });

  test('define coverImageId na primeira imagem adicionada', () => {
    expect(source).toContain('if (!state.coverImageId) state.coverImageId = id;');
  });

  test('chama _rerender() após adicionar', () => {
    const fnStart = source.indexOf('async function kcAddImagesFromFiles');
    const nextFn = source.indexOf('\nfunction kcRemoveCreateImageById');
    const fnBody = source.slice(fnStart, nextFn);
    expect(fnBody).toContain('_rerender()');
  });

  test('exporta addFromFiles no namespace', () => {
    expect(source).toContain('addFromFiles: kcAddImagesFromFiles,');
  });
});

describe('kc-create-post.media — remover imagem', () => {
  test('define kcRemoveCreateImageById', () => {
    expect(source).toContain('function kcRemoveCreateImageById(id)');
  });

  test('atualiza coverImageId quando a capa é removida', () => {
    expect(source).toContain('state.coverImageId = state.images.length ? state.images[0].id : null;');
  });

  test('chama _rerender() após remover', () => {
    const fnStart = source.indexOf('function kcRemoveCreateImageById');
    const nextFn = source.indexOf('\nfunction kcSetCreateCoverImageById');
    const fnBody = source.slice(fnStart, nextFn);
    expect(fnBody).toContain('_rerender()');
  });

  test('exporta removeById no namespace', () => {
    expect(source).toContain('removeById: kcRemoveCreateImageById,');
  });
});

describe('kc-create-post.media — definir capa', () => {
  test('define kcSetCreateCoverImageById', () => {
    expect(source).toContain('function kcSetCreateCoverImageById(id)');
  });

  test('verifica existência da imagem antes de definir capa', () => {
    expect(source).toContain('var exists = state.images.some(');
  });

  test('atualiza state.coverImageId', () => {
    expect(source).toContain('state.coverImageId = id;');
  });

  test('exporta setCoverById no namespace', () => {
    expect(source).toContain('setCoverById: kcSetCreateCoverImageById,');
  });
});

describe('kc-create-post.media — obter imagens ordenadas', () => {
  test('define kcGetOrderedCreateImages colocando capa em primeiro', () => {
    expect(source).toContain('function kcGetOrderedCreateImages()');
    expect(source).toContain('var coverId = state.coverImageId;');
  });

  test('retorna array de dataUrls', () => {
    expect(source).toContain('.map(function (i) { return i.dataUrl; })');
  });

  test('exporta getOrdered no namespace', () => {
    expect(source).toContain('getOrdered: kcGetOrderedCreateImages,');
  });
});

// ── HTML da seção de imagens ──────────────────────────────────────────────────

describe('kc-create-post.media — HTML da seção de imagens', () => {
  test('define kcCreateImagesSectionHtml', () => {
    expect(source).toContain('function kcCreateImagesSectionHtml()');
  });

  test('usa _esc() para escapar dataUrl e id', () => {
    const fnStart = source.indexOf('function kcCreateImagesSectionHtml');
    const fnBody = source.slice(fnStart, fnStart + 1200);
    expect(fnBody).toContain('_esc(img.dataUrl)');
    expect(fnBody).toContain('_esc(img.id)');
  });

  test('renderiza kc-img-dropzone e kc-create-images', () => {
    expect(source).toContain('kc-img-dropzone');
    expect(source).toContain('kc-create-images');
    expect(source).toContain('kc-img-grid');
  });

  test('marca a imagem de capa com is-cover', () => {
    expect(source).toContain('is-cover');
    expect(source).toContain('kc-img-badge');
  });

  test('inclui botões de ação cover e remove', () => {
    expect(source).toContain('data-kc-img-action="cover"');
    expect(source).toContain('data-kc-img-action="remove"');
    expect(source).toContain('data-kc-img-id="');
  });

  test('renderiza input de arquivo com id kcImagesInput', () => {
    expect(source).toContain('id="kcImagesInput"');
    expect(source).toContain('accept="image/*"');
  });

  test('exibe contagem count/MAX e dica de capa', () => {
    expect(source).toContain('KC_CREATE_MAX_IMAGES');
    expect(source).toContain('Dica: arraste para reordenar');
    expect(source).toContain('A primeira imagem é a');
  });

  test('exporta sectionHtml no namespace', () => {
    expect(source).toContain('sectionHtml: kcCreateImagesSectionHtml,');
  });
});
