/**
 * @file supabase-posts-read.adapter.test.js
 * @description Static contract tests for supabase.posts-read.adapter.js (v11.30.7)
 * Verifica estrutura IIFE, namespace _KCSA.posts, helpers internos e
 * todas as funções da API de leitura de posts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase/supabase.posts-read.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.posts-read.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.posts no final do IIFE', () => {
    expect(source).toContain('window._KCSA.posts = {');
  });

  test('define UUID_RE localmente', () => {
    expect(source).toContain('const UUID_RE =');
    expect(source).toContain('[0-9a-f]{8}-[0-9a-f]{4}');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });
});

describe('supabase.posts-read.adapter.js — acesso lazy a getClient e getCurrentUser', () => {
  test('define getSupabaseClient lendo window._KCSA.getClient', () => {
    expect(source).toContain('function getSupabaseClient()');
    expect(source).toContain('window._KCSA.getClient');
  });

  test('define getCurrentUser lendo window._KCSA.getCurrentUser', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
  });
});

describe('supabase.posts-read.adapter.js — doNormalizePost', () => {
  test('define doNormalizePost lendo window.KCAPI.normalizePost de forma lazy', () => {
    expect(source).toContain('function doNormalizePost(p)');
    expect(source).toContain('window.KCAPI.normalizePost');
  });

  test('retorna p sem transformação quando normalizePost não estiver disponível', () => {
    expect(source).toContain('return fn ? fn(p) : p');
  });
});

describe('supabase.posts-read.adapter.js — logAuthorDiagnosticsDev', () => {
  test('define logAuthorDiagnosticsDev', () => {
    expect(source).toContain('function logAuthorDiagnosticsDev(payload)');
  });

  test('lê window.KCAPI.ENV de forma lazy (não no topo do IIFE)', () => {
    expect(source).toContain('const ENV = window.KCAPI && window.KCAPI.ENV');
  });

  test('usa prefixo de log [KCAPI][Author][diagnostics]', () => {
    expect(source).toContain('[KCAPI][Author][diagnostics]');
  });
});

describe('supabase.posts-read.adapter.js — helpers de mapeamento', () => {
  test('define mergeMetadataSafe', () => {
    expect(source).toContain('function mergeMetadataSafe(');
  });

  test('define pickFirstNonEmpty iterando sobre array', () => {
    expect(source).toContain('function pickFirstNonEmpty(');
    expect(source).toContain('if (!Array.isArray(values)) return');
  });

  test('define resolveNormalizedAuthorName com fallback "Autor"', () => {
    expect(source).toContain('function resolveNormalizedAuthorName(');
    expect(source).toContain("'Autor'");
  });

  test('define resolveNormalizedAuthorAvatar usando KC_CONSTANTS.DEFAULT_AVATAR_SVG', () => {
    expect(source).toContain('function resolveNormalizedAuthorAvatar(');
    expect(source).toContain('KC_CONSTANTS');
    expect(source).toContain('DEFAULT_AVATAR_SVG');
  });
});

describe('supabase.posts-read.adapter.js — mapSupabasePost', () => {
  test('define mapSupabasePost', () => {
    expect(source).toContain('function mapSupabasePost(row, options)');
  });

  test('suporta post_media e post_images como variantes do schema', () => {
    expect(source).toContain('post_media');
    expect(source).toContain('post_images');
  });

  test('ordena por sort_order quando disponível', () => {
    expect(source).toContain('sort_order');
    expect(source).toContain('sortOrder');
    expect(source).toContain('hasSortOrder');
  });

  test('prioriza item com is_cover quando não há sort_order', () => {
    expect(source).toContain('is_cover');
  });

  test('retorna saída híbrida com campos PT-BR e camelCase', () => {
    expect(source).toContain('autor:');
    expect(source).toContain('autorAvatar:');
    expect(source).toContain('imagens:');
    expect(source).toContain('timestamp:');
  });

  test('preserva expires_at tipado para a politica temporal do feed', () => {
    expect(source).toContain('expiresAt: row.expires_at || row.expiresAt || null');
    expect(source).toContain('expires_at: row.expires_at || row.expiresAt || null');
  });

  test('chama logAuthorDiagnosticsDev quando perfil do autor está incompleto', () => {
    expect(source).toContain('logAuthorDiagnosticsDev(');
  });

  test('chama mergeMetadataSafe para injetar campos extras de metadata', () => {
    expect(source).toContain('mergeMetadataSafe(out, metadata)');
  });
});

describe('supabase.posts-read.adapter.js — normalizeSupabasePost', () => {
  test('define normalizeSupabasePost', () => {
    expect(source).toContain('function normalizeSupabasePost(row)');
  });

  test('chama mapSupabasePost internamente', () => {
    expect(source).toContain('mapSupabasePost(row)');
  });

  test('chama doNormalizePost (não normalizePost diretamente)', () => {
    expect(source).toContain('return doNormalizePost(raw)');
  });

  test('preserva UUID original em raw.uuid antes de trocar id por legacy_id', () => {
    expect(source).toContain('raw.uuid = raw.id');
    expect(source).toContain('raw.id = legacy');
  });
});

describe('supabase.posts-read.adapter.js — buildSupabasePostSelect', () => {
  test('define buildSupabasePostSelect', () => {
    expect(source).toContain('function buildSupabasePostSelect(');
  });

  test('inclui profiles e post_media no select', () => {
    expect(source).toContain("profiles:author_id");
    expect(source).toContain('post_media');
  });

  test('define buildSupabasePostSelectFallback chamando buildSupabasePostSelect', () => {
    expect(source).toContain('function buildSupabasePostSelectFallback(');
    expect(source).toContain('buildSupabasePostSelect(client, false');
  });

  test('inclui campo .limit(1) para uso em getPostById', () => {
    expect(source).toContain('.limit(1)');
  });
});

describe('supabase.posts-read.adapter.js — isMissingCommentsEmbedError', () => {
  test('define isMissingCommentsEmbedError', () => {
    expect(source).toContain('function isMissingCommentsEmbedError(err)');
  });

  test('verifica se a mensagem inclui "comments" e "does not exist" ou "relationship"', () => {
    expect(source).toContain("'comments'");
    expect(source).toContain("'does not exist'");
    expect(source).toContain("'relationship'");
  });
});

describe('supabase.posts-read.adapter.js — getPostById', () => {
  test('define getPostById async', () => {
    expect(source).toContain('async function getPostById(id)');
  });

  test('retorna null imediatamente para IDs locais (u_*)', () => {
    expect(source).toContain('startsWith("u_")');
    expect(source).toContain('return null');
  });

  test('tenta window.KCSupabase.getPostById primeiro', () => {
    expect(source).toContain('window.KCSupabase.getPostById');
  });

  test('usa UUID_RE para detectar se o argumento é UUID', () => {
    expect(source).toContain('UUID_RE.test(key)');
  });

  test('loga erro com prefixo [KCAPI][Supabase] getPostById', () => {
    expect(source).toContain('[KCAPI][Supabase] getPostById');
  });
});

describe('supabase.posts-read.adapter.js — buildSupabasePostsQuery', () => {
  test('define buildSupabasePostsQuery', () => {
    expect(source).toContain('function buildSupabasePostsQuery(');
  });

  test('define buildSupabasePostsQueryFallback chamando buildSupabasePostsQuery', () => {
    expect(source).toContain('function buildSupabasePostsQueryFallback(');
    expect(source).toContain('buildSupabasePostsQuery(client, false');
  });

  test('define isMissingVerifiedColumnError verificando "verified" e "does not exist"', () => {
    expect(source).toContain('function isMissingVerifiedColumnError(err)');
    expect(source).toContain("'verified'");
    expect(source).toContain("'does not exist'");
  });
});

describe('supabase.posts-read.adapter.js — normalizeSupabaseFilters e buildOrILike', () => {
  test('define normalizeSupabaseFilters com suporte a modulo/module, categoria/category', () => {
    expect(source).toContain('function normalizeSupabaseFilters(filters)');
    expect(source).toContain('f.modulo');
    expect(source).toContain('f.categoria');
  });

  test('define buildOrILike gerando expressão ilike para título e descrição', () => {
    expect(source).toContain('function buildOrILike(q)');
    expect(source).toContain('title.ilike');
    expect(source).toContain('description.ilike');
  });
});

describe('supabase.posts-read.adapter.js — getPosts', () => {
  test('define getPosts async', () => {
    expect(source).toContain('async function getPosts(');
  });

  test('tenta window.KCSupabase.getPosts primeiro', () => {
    expect(source).toContain('window.KCSupabase.getPosts');
  });

  test('retorna [] em caso de erro', () => {
    expect(source).toContain('[KCAPI][Supabase] getPosts (via KCSupabase) falhou:');
    expect(source).toContain('return [];');
  });
});

describe('supabase.posts-read.adapter.js — searchPosts', () => {
  test('define searchPosts async', () => {
    expect(source).toContain('async function searchPosts(');
  });

  test('tenta window.KCSupabase.searchPosts primeiro', () => {
    expect(source).toContain('window.KCSupabase.searchPosts');
  });

  test('loga erro com prefixo [KCAPI][Supabase] searchPosts', () => {
    expect(source).toContain('[KCAPI][Supabase] searchPosts falhou:');
  });
});

describe('supabase.posts-read.adapter.js — getFeedCursor', () => {
  test('define getFeedCursor async', () => {
    expect(source).toContain('async function getFeedCursor(');
  });

  test('tenta window.KCSupabase.getFeedCursor primeiro', () => {
    expect(source).toContain('window.KCSupabase.getFeedCursor');
  });

  test('retorna { posts: [], nextCursor: null, hasMore: false } no fallback', () => {
    expect(source).toContain('nextCursor: null');
    expect(source).toContain('hasMore: false');
  });

  test('relança exceção via throw e', () => {
    expect(source).toContain('[KCAPI][Supabase] getFeedCursor falhou:');
    expect(source).toContain('throw e;');
  });
});

describe('supabase.posts-read.adapter.js — getMyPosts', () => {
  test('define getMyPosts async', () => {
    expect(source).toContain('async function getMyPosts(params = {})');
  });

  test('usa .range(from, to) para paginação', () => {
    expect(source).toContain('.range(from, to)');
  });

  test('loga erro com prefixo [KCAPI][profile] getMyPosts', () => {
    expect(source).toContain('[KCAPI][profile] getMyPosts:');
  });
});

describe('supabase.posts-read.adapter.js — getPostsByAuthorId', () => {
  test('define getPostsByAuthorId async', () => {
    expect(source).toContain('async function getPostsByAuthorId(');
  });

  test('loga erro com prefixo [KCAPI][profile] getPostsByAuthorId', () => {
    expect(source).toContain('[KCAPI][profile] getPostsByAuthorId:');
  });
});

describe('supabase.posts-read.adapter.js — fetchRelatedPostsByIds', () => {
  test('define fetchRelatedPostsByIds async', () => {
    expect(source).toContain('async function fetchRelatedPostsByIds(client, ids)');
  });

  test('usa .in("id", orderedIds) para buscar em lote', () => {
    expect(source).toContain(".in('id', orderedIds)");
  });

  test('chama doNormalizePost nos itens mapeados', () => {
    expect(source).toContain('doNormalizePost(mapped)');
  });

  test('loga erro com prefixo [KCAPI][product] fetchRelatedPostsByIds', () => {
    expect(source).toContain('[KCAPI][product] fetchRelatedPostsByIds');
  });
});

describe('supabase.posts-read.adapter.js — getRelatedPosts', () => {
  test('define getRelatedPosts async', () => {
    expect(source).toContain('async function getRelatedPosts(postId, options = {})');
  });

  test('tenta RPC kc_related_posts', () => {
    expect(source).toContain("'kc_related_posts'");
  });

  test('chama doNormalizePost no currentPost quando opts.currentPost está presente', () => {
    expect(source).toContain('doNormalizePost(opts.currentPost)');
  });

  test('chama getPostById como fallback para resolver currentPost', () => {
    expect(source).toContain('await getPostById(postId)');
  });

  test('usa window.KCAPI.rankRelatedPosts para ranquear candidatos', () => {
    expect(source).toContain('window.KCAPI.rankRelatedPosts');
  });
});

describe('supabase.posts-read.adapter.js — exports window._KCSA.posts', () => {
  test('exporta getPostById', () => {
    expect(source).toContain('getPostById,');
  });

  test('exporta getPosts', () => {
    expect(source).toContain('getPosts,');
  });

  test('exporta searchPosts', () => {
    expect(source).toContain('searchPosts,');
  });

  test('exporta getFeedCursor', () => {
    expect(source).toContain('getFeedCursor,');
  });

  test('exporta getMyPosts', () => {
    expect(source).toContain('getMyPosts,');
  });

  test('exporta getPostsByAuthorId', () => {
    expect(source).toContain('getPostsByAuthorId,');
  });

  test('exporta getRelatedPosts', () => {
    expect(source).toContain('getRelatedPosts,');
  });
});
