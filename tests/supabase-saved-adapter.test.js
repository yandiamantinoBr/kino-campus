/**
 * @file supabase-saved-adapter.test.js
 * @description Static contract tests for supabase.saved.adapter.js (v11.30.6)
 * Verifica estrutura IIFE, namespace _KCSA.saved, helpers internos e
 * todos os métodos da API de saved_posts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../assets/js/adapters/supabase.saved.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.saved.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.saved no final do IIFE', () => {
    expect(source).toContain('window._KCSA.saved = {');
  });

  test('define UUID_RE localmente', () => {
    expect(source).toContain('const UUID_RE =');
    expect(source).toContain('[0-9a-f]{8}-[0-9a-f]{4}');
  });
});

describe('supabase.saved.adapter.js — acesso lazy a getClient e getCurrentUser', () => {
  test('define getSupabaseClient lendo window._KCSA.getClient', () => {
    expect(source).toContain('function getSupabaseClient()');
    expect(source).toContain('window._KCSA.getClient');
  });

  test('define getCurrentUser lendo window._KCSA.getCurrentUser', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });

  test('não usa getSupabaseClient de escopo externo (sem require/import)', () => {
    expect(source).not.toMatch(/require\s*\(/);
  });
});

describe('supabase.saved.adapter.js — resolvePostUuidForSavedPosts', () => {
  test('define resolvePostUuidForSavedPosts async', () => {
    expect(source).toContain('async function resolvePostUuidForSavedPosts(');
  });

  test('usa UUID_RE para validar UUID diretamente', () => {
    expect(source).toContain('UUID_RE.test(raw)');
  });

  test('referencia window._KCSA.posts.getPostById de forma lazy', () => {
    expect(source).toContain('window._KCSA.posts.getPostById');
    expect(source).toContain('getPostByIdFn');
  });

  test('retorna null se getPostByIdFn não estiver disponível', () => {
    expect(source).toContain('if (!getPostByIdFn) return null');
  });
});

describe('supabase.saved.adapter.js — helpers internos', () => {
  test('define normalizeSaveKind com valores favorite/later/highlight', () => {
    expect(source).toContain('function normalizeSaveKind(');
    expect(source).toContain("'favorite'");
    expect(source).toContain("'later'");
    expect(source).toContain("'highlight'");
  });

  test('define normalizeSaveKinds usando Array.from + Set', () => {
    expect(source).toContain('function normalizeSaveKinds(');
    expect(source).toContain('Array.from(new Set(');
  });

  test('define mapSavedSummaryRow com campos id/uuid/title/save_kinds/saved_at', () => {
    expect(source).toContain('function mapSavedSummaryRow(');
    expect(source).toContain('save_kinds');
    expect(source).toContain('saved_at');
    expect(source).toContain("'Sem título'");
  });

  test('define aggregateSavedRows com opções includeStatus e onlyPublished', () => {
    expect(source).toContain('function aggregateSavedRows(');
    expect(source).toContain('includeStatus');
    expect(source).toContain('onlyPublished');
    expect(source).toContain('const byPost = new Map()');
  });

  test('define paginateList com slice', () => {
    expect(source).toContain('function paginateList(');
    expect(source).toContain('items.slice(from, from + limit)');
  });

  test('define fetchSavedRowsFallback consultando saved_posts com join posts', () => {
    expect(source).toContain('async function fetchSavedRowsFallback(');
    expect(source).toContain("'saved_posts'");
    expect(source).toContain('saved_posts_post_id_fkey');
  });
});

describe('supabase.saved.adapter.js — getSavedPostStateMulti', () => {
  test('define getSavedPostStateMulti async', () => {
    expect(source).toContain('async function getSavedPostStateMulti(');
  });

  test('retorna { kinds: [] } em caso de erro ou usuário ausente', () => {
    expect(source).toContain('return { kinds: [] }');
  });

  test('chama resolvePostUuidForSavedPosts', () => {
    expect(source).toContain('resolvePostUuidForSavedPosts(postId)');
  });

  test('loga erro com prefixo [KCAPI][saved_posts]', () => {
    expect(source).toContain("'[KCAPI][saved_posts] getSavedPostStateMulti:'");
  });
});

describe('supabase.saved.adapter.js — clearSavedPostStateMulti', () => {
  test('define clearSavedPostStateMulti async', () => {
    expect(source).toContain('async function clearSavedPostStateMulti(');
  });

  test('usa .delete() na tabela saved_posts', () => {
    expect(source).toContain('.delete()');
  });

  test('retorna { ok: true, cleared: saveKind || "all" }', () => {
    expect(source).toContain("cleared: saveKind || 'all'");
  });

  test('loga erro com prefixo [KCAPI][saved_posts]', () => {
    expect(source).toContain("'[KCAPI][saved_posts] clearSavedPostStateMulti:'");
  });
});

describe('supabase.saved.adapter.js — setSavedPostStateMulti', () => {
  test('define setSavedPostStateMulti async', () => {
    expect(source).toContain('async function setSavedPostStateMulti(');
  });

  test('usa onConflict user_id,post_id,kind', () => {
    expect(source).toContain("onConflict: 'user_id,post_id,kind'");
  });

  test('chama clearSavedPostStateMulti quando enabled === false', () => {
    expect(source).toContain('clearSavedPostStateMulti(postId, saveKind)');
  });

  test('retorna { enabled: true } no caminho de sucesso', () => {
    expect(source).toContain('enabled: true');
  });

  test('loga erro com prefixo [KCAPI][saved_posts]', () => {
    expect(source).toContain("'[KCAPI][saved_posts] setSavedPostStateMulti:'");
  });
});

describe('supabase.saved.adapter.js — getMySavedPostsMulti', () => {
  test('define getMySavedPostsMulti async', () => {
    expect(source).toContain('async function getMySavedPostsMulti(');
  });

  test('tenta RPC kc_get_my_saved_posts', () => {
    expect(source).toContain("'kc_get_my_saved_posts'");
  });

  test('usa fetchSavedRowsFallback como fallback', () => {
    expect(source).toContain('fetchSavedRowsFallback(client, user.id');
  });

  test('usa paginateList e aggregateSavedRows', () => {
    expect(source).toContain('paginateList(aggregateSavedRows(');
  });
});

describe('supabase.saved.adapter.js — getMySavedPostsCount', () => {
  test('define getMySavedPostsCount async', () => {
    expect(source).toContain('async function getMySavedPostsCount(');
  });

  test('tenta RPC kc_get_my_saved_posts_count', () => {
    expect(source).toContain("'kc_get_my_saved_posts_count'");
  });

  test('retorna 0 em caso de erro', () => {
    expect(source).toContain('return 0');
  });
});

describe('supabase.saved.adapter.js — getProfileHighlightsMulti', () => {
  test('define getProfileHighlightsMulti async', () => {
    expect(source).toContain('async function getProfileHighlightsMulti(');
  });

  test('tenta RPC kc_get_profile_highlights', () => {
    expect(source).toContain("'kc_get_profile_highlights'");
  });

  test('usa onlyPublished: true no fallback', () => {
    expect(source).toContain('onlyPublished: true');
  });
});

describe('supabase.saved.adapter.js — getProfileHighlightsCount', () => {
  test('define getProfileHighlightsCount async', () => {
    expect(source).toContain('async function getProfileHighlightsCount(');
  });

  test('tenta RPC kc_get_profile_highlights_count', () => {
    expect(source).toContain("'kc_get_profile_highlights_count'");
  });
});

describe('supabase.saved.adapter.js — exports window._KCSA.saved', () => {
  test('exporta getSavedPostState (alias getSavedPostStateMulti)', () => {
    expect(source).toContain('getSavedPostState: getSavedPostStateMulti');
  });

  test('exporta setSavedPostState (alias setSavedPostStateMulti)', () => {
    expect(source).toContain('setSavedPostState: setSavedPostStateMulti');
  });

  test('exporta clearSavedPostState (alias clearSavedPostStateMulti)', () => {
    expect(source).toContain('clearSavedPostState: clearSavedPostStateMulti');
  });

  test('exporta getMySavedPosts (alias getMySavedPostsMulti)', () => {
    expect(source).toContain('getMySavedPosts: getMySavedPostsMulti');
  });

  test('exporta getMySavedPostsCount', () => {
    expect(source).toContain('getMySavedPostsCount,');
  });

  test('exporta getProfileHighlights (alias getProfileHighlightsMulti)', () => {
    expect(source).toContain('getProfileHighlights: getProfileHighlightsMulti');
  });

  test('exporta getProfileHighlightsCount', () => {
    expect(source).toContain('getProfileHighlightsCount,');
  });
});
