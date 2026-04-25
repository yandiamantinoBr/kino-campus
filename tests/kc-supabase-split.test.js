/**
 * tests/kc-supabase-split.test.js — v13.5.1
 *
 * Valida o split de kc-supabase.client.js em sub-módulos:
 *   - window.KCSupabase._posts   (kc-supabase.posts.js)
 *   - window.KCSupabase._ratings (kc-supabase.ratings.js)
 *
 * Testes:
 *   1. Contrato estático de kc-supabase.posts.js   (funções exportadas)
 *   2. Contrato estático de kc-supabase.ratings.js (funções exportadas)
 *   3. kc-supabase.client.js — facade preserva todos os métodos públicos originais
 *   4. kc-supabase.client.js — exposição de _KCSupabaseInternal
 *   5. Ordem de scripts nos HTMLs consumidores (posts + ratings após client)
 *   6. Gate de tamanho: kc-supabase.client.js < 700L
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const CLIENT  = path.join(ROOT, 'assets/js/kc-supabase.client.js');
const POSTS   = path.join(ROOT, 'assets/js/kc-supabase.posts.js');
const RATINGS = path.join(ROOT, 'assets/js/kc-supabase.ratings.js');

const HTML_FILES = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, '_product.html'),
  path.join(ROOT, 'search-results.html'),
  path.join(ROOT, 'oportunidades.html'),
  path.join(ROOT, 'profile.html'),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineCount(filePath) {
  return readFile(filePath).split('\n').length;
}

// ── 1. kc-supabase.posts.js — contrato estático ──────────────────────────────

describe('kc-supabase.posts.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(POSTS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(POSTS)).toBe(true);
  });

  test('expõe window.KCSupabase._posts via Object.freeze', () => {
    expect(code).toContain('window.KCSupabase._posts = Object.freeze(');
  });

  const POSTS_EXPORTS = [
    'normalizeGetPostsParams',
    'normalizeSearchPostsParams',
    'normalizeGetFeedCursorParams',
    'getPostById',
    'getPosts',
    'searchPosts',
    'getFeedCursor',
    'buildOrILike',
    'getSearchShared',
    'buildExpandedSearchTerms',
  ];

  POSTS_EXPORTS.forEach(fn => {
    test('exporta ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('usa _client() helper (não chama getClient diretamente)', () => {
    expect(code).toContain('function _client()');
    expect(code).toContain('_client()');
  });

  test('usa _readEnv() helper', () => {
    expect(code).toContain('function _readEnv()');
  });

  test('guarda window.KCSupabase no início', () => {
    expect(code).toContain('window.KCSupabase = window.KCSupabase || {}');
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });
});

// ── 2. kc-supabase.ratings.js — contrato estático ────────────────────────────

describe('kc-supabase.ratings.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(RATINGS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(RATINGS)).toBe(true);
  });

  test('expõe window.KCSupabase._ratings via Object.freeze', () => {
    expect(code).toContain('window.KCSupabase._ratings = Object.freeze(');
  });

  const RATINGS_EXPORTS = [
    'normalizeUserRatingSummaryPayload',
    'normalizeUserRatingEntryPayload',
    'normalizeUserRatingStatePayload',
    'normalizeUserRatingListPayload',
    'normalizeUserRatingStateParams',
    'normalizeUpsertUserRatingPayload',
    'getUserRatingSummary',
    'getUserRatingState',
    'listUserRatings',
    'upsertUserRating',
  ];

  RATINGS_EXPORTS.forEach(fn => {
    test('exporta ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('usa _client() helper', () => {
    expect(code).toContain('function _client()');
    expect(code).toContain('_client()');
  });

  test('usa _readEnv() helper', () => {
    expect(code).toContain('function _readEnv()');
  });

  test('guarda window.KCSupabase no início', () => {
    expect(code).toContain('window.KCSupabase = window.KCSupabase || {}');
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });
});

// ── 3. kc-supabase.client.js — facade preserva métodos públicos ───────────────

describe('kc-supabase.client.js — facade pública preservada', () => {
  let code;
  beforeAll(() => { code = readFile(CLIENT); });

  const PUBLIC_METHODS = [
    'init',
    'getClient',
    'refreshSession',
    'getSession',
    'getUser',
    'getCurrentUser',
    'signIn',
    'signUp',
    'resendSignUp',
    'requestPasswordReset',
    'updatePassword',
    'signOut',
    'onAuthStateChange',
    'subscribeNewPosts',
  ];

  PUBLIC_METHODS.forEach(fn => {
    test('facade mantém ' + fn, () => {
      // Shorthand properties use `fn,` — longhand use `fn:` — accept either
      expect(code.includes(fn + ':') || code.includes(fn + ',')).toBe(true);
    });
  });

  const DELEGATION_METHODS = [
    'getPosts',
    'getPostById',
    'searchPosts',
    'getFeedCursor',
    'getUserRatingSummary',
    'getUserRatingState',
    'listUserRatings',
    'upsertUserRating',
  ];

  DELEGATION_METHODS.forEach(fn => {
    test('facade delega ' + fn + ' para sub-módulo', () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('delegação de _posts referencia window.KCSupabase._posts', () => {
    expect(code).toContain('window.KCSupabase._posts');
  });

  test('delegação de _ratings referencia window.KCSupabase._ratings', () => {
    expect(code).toContain('window.KCSupabase._ratings');
  });

  test('searchPosts delega para _posts (não _ratings)', () => {
    // searchPosts belongs in _posts (it uses normalizeSearchPostsParams from posts.js)
    expect(code).toContain('_posts.searchPosts');
  });

  test('getFeedCursor delega para _posts (não _ratings)', () => {
    expect(code).toContain('_posts.getFeedCursor');
  });

  test('funções de posts NÃO estão definidas inline no client.js', () => {
    expect(code).not.toContain('function normalizeGetPostsParams(');
    expect(code).not.toContain('function getPosts(');
    expect(code).not.toContain('function getPostById(');
  });

  test('funções de ratings NÃO estão definidas inline no client.js', () => {
    expect(code).not.toContain('function getUserRatingSummary(');
    expect(code).not.toContain('function upsertUserRating(');
    expect(code).not.toContain('function normalizeUserRatingSummaryPayload(');
  });
});

// ── 4. kc-supabase.client.js — _KCSupabaseInternal ────────────────────────────

describe('kc-supabase.client.js — _KCSupabaseInternal exposto', () => {
  let code;
  beforeAll(() => { code = readFile(CLIENT); });

  test('expõe window._KCSupabaseInternal', () => {
    expect(code).toContain('window._KCSupabaseInternal');
  });

  test('_KCSupabaseInternal contém getClient', () => {
    expect(code).toContain('getClient: getClient');
  });

  test('_KCSupabaseInternal contém readEnv', () => {
    expect(code).toContain('readEnv: readEnv');
  });
});

// ── 5. HTMLs consumidores — ordem de carregamento ─────────────────────────────

describe('HTMLs consumidores — scripts carregados na ordem correta', () => {
  HTML_FILES.forEach(htmlPath => {
    const rel = path.relative(ROOT, htmlPath);
    const isAdmin = rel.startsWith('admin');
    const prefix = isAdmin ? '../' : '';

    describe(rel, () => {
      let html;
      beforeAll(() => { html = readFile(htmlPath); });

      test('carrega kc-supabase.client.js', () => {
        expect(html).toContain('kc-supabase.client.js');
      });

      test('carrega kc-supabase.posts.js', () => {
        expect(html).toContain('kc-supabase.posts.js');
      });

      test('carrega kc-supabase.ratings.js', () => {
        expect(html).toContain('kc-supabase.ratings.js');
      });

      test('kc-supabase.posts.js aparece após kc-supabase.client.js', () => {
        const idxClient = html.indexOf('kc-supabase.client.js');
        const idxPosts  = html.indexOf('kc-supabase.posts.js');
        expect(idxPosts).toBeGreaterThan(idxClient);
      });

      test('kc-supabase.ratings.js aparece após kc-supabase.posts.js', () => {
        const idxPosts   = html.indexOf('kc-supabase.posts.js');
        const idxRatings = html.indexOf('kc-supabase.ratings.js');
        expect(idxRatings).toBeGreaterThan(idxPosts);
      });
    });
  });
});

// ── 6. Gate de tamanho ────────────────────────────────────────────────────────

describe('Gate de tamanho — kc-supabase.client.js < 700L', () => {
  test('kc-supabase.client.js existe', () => {
    expect(fs.existsSync(CLIENT)).toBe(true);
  });

  test('kc-supabase.posts.js existe', () => {
    expect(fs.existsSync(POSTS)).toBe(true);
  });

  test('kc-supabase.ratings.js existe', () => {
    expect(fs.existsSync(RATINGS)).toBe(true);
  });

  test('kc-supabase.client.js tem menos de 700 linhas', () => {
    const lines = lineCount(CLIENT);
    expect(lines).toBeLessThan(700);
  });

  test('kc-supabase.posts.js existe e tem pelo menos 100 linhas', () => {
    const lines = lineCount(POSTS);
    expect(lines).toBeGreaterThan(100);
  });

  test('kc-supabase.ratings.js existe e tem pelo menos 50 linhas', () => {
    const lines = lineCount(RATINGS);
    expect(lines).toBeGreaterThan(50);
  });
});
