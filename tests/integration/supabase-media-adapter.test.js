/**
 * @file supabase-media-adapter.test.js
 * @description Static contract tests for supabase.media.adapter.js (v11.30.5)
 * Verifica estrutura IIFE, namespace _KCSA.media, helpers utilitários,
 * acesso lazy ao ENV via window.KCAPI.ENV e todos os métodos da API de media.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase.media.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.media.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.media no final do IIFE', () => {
    expect(source).toContain('window._KCSA.media = {');
  });

  test('expõe window.KCCompressImage', () => {
    expect(source).toContain('window.KCCompressImage = compressImage');
  });
});

describe('supabase.media.adapter.js — ENV lazy via window.KCAPI', () => {
  test('acessa ENV lazily via window.KCAPI.ENV (não via argumento)', () => {
    expect(source).toContain('window.KCAPI && window.KCAPI.ENV');
  });

  test('não acessa ENV diretamente como variável de escopo externo', () => {
    // ENV deve ser lido lazily, não via closure de outro IIFE
    expect(source).not.toMatch(/^const \{ ENV/m);
    expect(source).not.toMatch(/^  const \{ ENV/m);
  });

  test('getPostMediaStorageBucket lê ENV lazily', () => {
    expect(source).toContain('function getPostMediaStorageBucket()');
    expect(source).toContain('STORAGE_BUCKET_POST_MEDIA');
    expect(source).toContain("'kino-media'");
  });

  test('uploadImagesToSupabaseStorage lê ENV lazily para maxImageBytes', () => {
    expect(source).toContain('window.KCAPI && window.KCAPI.ENV');
    expect(source).toContain('maxImageBytes');
    expect(source).toContain('5 * 1024 * 1024');
  });
});

describe('supabase.media.adapter.js — utilitários blob/mime', () => {
  test('define dataUrlToBlob com parse de data:URL', () => {
    expect(source).toContain('function dataUrlToBlob(');
    expect(source).toContain('application/octet-stream');
    expect(source).toContain('atob(');
  });

  test('define extFromMime mapeando jpeg/png/webp/gif', () => {
    expect(source).toContain('function extFromMime(');
    expect(source).toContain("'jpg'");
    expect(source).toContain("'png'");
    expect(source).toContain("'webp'");
    expect(source).toContain("'gif'");
    expect(source).toContain("'bin'");
  });

  test('define sanitizeFilename limitando a 80 chars', () => {
    expect(source).toContain('function sanitizeFilename(');
    expect(source).toContain('.slice(0, 80)');
    expect(source).toContain("'image'");
  });

  test('define checkImageMagicBytes verificando JPEG/PNG/GIF/WEBP', () => {
    expect(source).toContain('async function checkImageMagicBytes(');
    expect(source).toContain('0xFF && b[1] === 0xD8 && b[2] === 0xFF');
    expect(source).toContain('0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47');
    expect(source).toContain('0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38');
    expect(source).toContain('WEBP');
  });

  test('define compressImage com GIF pass-through', () => {
    expect(source).toContain('function compressImage(');
    expect(source).toContain("blob.type === 'image/gif'");
    expect(source).toContain('Promise.resolve(blob)');
    expect(source).toContain("'image/jpeg'");
    expect(source).toContain('canvas.getContext');
  });
});

describe('supabase.media.adapter.js — helpers de bucket e path', () => {
  test('define escapeRegExp', () => {
    expect(source).toContain('function escapeRegExp(');
    expect(source).toContain('\\\\$&');
  });

  test('define stripSearchAndHash removendo query e hash', () => {
    expect(source).toContain('function stripSearchAndHash(');
    expect(source).toContain("indexOf('#')");
    expect(source).toContain("indexOf('?')");
  });

  test('define safeDecodeUriComponent com fallback', () => {
    expect(source).toContain('function safeDecodeUriComponent(');
    expect(source).toContain('decodeURIComponent(');
  });

  test('define extractStoragePathFromPostMediaValue com padrões storage/v1', () => {
    expect(source).toContain('function extractStoragePathFromPostMediaValue(');
    expect(source).toContain('/storage/v1/object/public/');
    expect(source).toContain('/storage/v1/object/sign/');
    expect(source).toContain('/storage/v1/object/authenticated/');
  });

  test('define buildPostMediaCleanupContext com campos managedPaths/removedPaths/failedPaths', () => {
    expect(source).toContain('function buildPostMediaCleanupContext(');
    expect(source).toContain('managedPaths');
    expect(source).toContain('removedPaths');
    expect(source).toContain('failedPaths');
    expect(source).toContain('skippedItems');
  });
});

describe('supabase.media.adapter.js — cleanupManagedPostMediaStorage', () => {
  test('define cleanupManagedPostMediaStorage async', () => {
    expect(source).toContain('async function cleanupManagedPostMediaStorage(');
  });

  test('usa scopePrefix post-media/{userId}/{postId}/', () => {
    expect(source).toContain('post-media/${userId}/${postId}/');
  });

  test('rejeita paths com reason missing_scope e unmanaged_path', () => {
    expect(source).toContain("'missing_scope'");
    expect(source).toContain("'unmanaged_path'");
    expect(source).toContain("'empty_or_unparseable'");
  });

  test('chama client.storage.from(bucket).remove()', () => {
    expect(source).toContain('storage.remove(');
  });

  test('loga erro com prefixo [KCAPI][Supabase]', () => {
    expect(source).toContain("'[KCAPI][Supabase] post-media cleanup falhou:'");
  });
});

describe('supabase.media.adapter.js — uploadImagesToSupabaseStorage', () => {
  test('define uploadImagesToSupabaseStorage async', () => {
    expect(source).toContain('async function uploadImagesToSupabaseStorage(');
  });

  test('limita a 5 imagens (maxImages)', () => {
    expect(source).toContain('const maxImages = 5');
  });

  test('permite tipos jpeg/png/webp/gif (allowedTypes)', () => {
    expect(source).toContain("'image/jpeg'");
    expect(source).toContain("'image/png'");
    expect(source).toContain("'image/webp'");
    expect(source).toContain("'image/gif'");
    expect(source).toContain('allowedTypes');
  });

  test('usa path controlado post-media/{userId}/{postId}/', () => {
    expect(source).toContain('post-media/${userId}/${postId}/');
    expect(source).toContain('hasStrongPath');
  });

  test('chama cleanupManagedPostMediaStorage em caso de falha de upload', () => {
    expect(source).toContain('cleanupManagedPostMediaStorage(client, uploaded');
    expect(source).toContain("'STORAGE_UPLOAD_FAILED'");
  });

  test('chama storage.getPublicUrl para obter URL pública', () => {
    expect(source).toContain('storage.getPublicUrl(path)');
    expect(source).toContain('publicUrl');
  });

  test('reutiliza URLs http(s) existentes sem re-upload', () => {
    expect(source).toContain('/^https?:\\/\\//i.test(item)');
    expect(source).toContain('is_cover: i === 0');
  });
});

describe('supabase.media.adapter.js — exports window._KCSA.media', () => {
  test('exporta compressImage', () => {
    expect(source).toContain('compressImage,');
  });

  test('exporta checkImageMagicBytes', () => {
    expect(source).toContain('checkImageMagicBytes,');
  });

  test('exporta dataUrlToBlob', () => {
    expect(source).toContain('dataUrlToBlob,');
  });

  test('exporta extFromMime', () => {
    expect(source).toContain('extFromMime,');
  });

  test('exporta sanitizeFilename', () => {
    expect(source).toContain('sanitizeFilename,');
  });

  test('exporta getStorageBucket (alias getPostMediaStorageBucket)', () => {
    expect(source).toContain('getStorageBucket: getPostMediaStorageBucket');
  });

  test('exporta extractStoragePath (alias extractStoragePathFromPostMediaValue)', () => {
    expect(source).toContain('extractStoragePath: extractStoragePathFromPostMediaValue');
  });

  test('exporta buildCleanupContext (alias buildPostMediaCleanupContext)', () => {
    expect(source).toContain('buildCleanupContext: buildPostMediaCleanupContext');
  });

  test('exporta cleanupStorage (alias cleanupManagedPostMediaStorage)', () => {
    expect(source).toContain('cleanupStorage: cleanupManagedPostMediaStorage');
  });

  test('exporta uploadImages (alias uploadImagesToSupabaseStorage)', () => {
    expect(source).toContain('uploadImages: uploadImagesToSupabaseStorage');
  });
});
