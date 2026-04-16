/**
 * @file supabase-posts-write.adapter.test.js
 * @description Static contract tests for supabase.posts-write.adapter.js (v11.30.8)
 * Verifica estrutura IIFE, namespace _KCSA.postsWrite, lazy accessors, helpers e
 * todas as funções da API de escrita de posts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../assets/js/adapters/supabase.posts-write.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.posts-write.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.postsWrite no final do IIFE', () => {
    expect(source).toContain('window._KCSA.postsWrite = {');
  });

  test('define UUID_RE localmente', () => {
    expect(source).toContain('const UUID_RE =');
    expect(source).toContain('[0-9a-f]{8}-[0-9a-f]{4}');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });
});

describe('supabase.posts-write.adapter.js — lazy accessors', () => {
  test('define getSupabaseClient lendo window._KCSA.getClient', () => {
    expect(source).toContain('function getSupabaseClient()');
    expect(source).toContain('window._KCSA.getClient');
  });

  test('define getCurrentUser lendo window._KCSA.getCurrentUser', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });

  test('define getENV lendo window.KCAPI.ENV', () => {
    expect(source).toContain('function getENV()');
    expect(source).toContain('(window.KCAPI && window.KCAPI.ENV) || {}');
  });

  test('define doNormalizePost lendo window.KCAPI.normalizePost de forma lazy', () => {
    expect(source).toContain('function doNormalizePost(p)');
    expect(source).toContain('window.KCAPI.normalizePost');
  });

  test('doNormalizePost retorna p sem transformação quando normalizePost não estiver disponível', () => {
    expect(source).toContain('return fn ? fn(p) : p');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
  });
});

describe('supabase.posts-write.adapter.js — createPostDiagnostics', () => {
  test('define createPostDiagnostics com Object.freeze', () => {
    expect(source).toContain('const createPostDiagnostics = Object.freeze(');
  });

  test('tem método clear() chamando window.KCAPI.clearLastCreatePostError', () => {
    expect(source).toContain('clear()');
    expect(source).toContain('window.KCAPI.clearLastCreatePostError');
  });

  test('tem método set() chamando window.KCAPI.setLastCreatePostError', () => {
    expect(source).toContain('set(stage, error, context)');
    expect(source).toContain('window.KCAPI.setLastCreatePostError');
  });

  test('tem método get() chamando window.KCAPI.getLastCreatePostError', () => {
    expect(source).toContain('get()');
    expect(source).toContain('window.KCAPI.getLastCreatePostError');
  });
});

describe('supabase.posts-write.adapter.js — helpers de perfil e payload', () => {
  test('define summarizeCreatePayloadForCreateDiagnostics delegando a window.KCAPI.summarizeCreatePayloadForDiagnostics', () => {
    expect(source).toContain('function summarizeCreatePayloadForCreateDiagnostics(');
    expect(source).toContain('window.KCAPI.summarizeCreatePayloadForDiagnostics');
  });

  test('summarizeCreatePayloadForCreateDiagnostics retorna imagesCount a partir de Array.isArray(payload.images)', () => {
    expect(source).toContain('imagesCount');
    expect(source).toContain('Array.isArray(payload.images)');
  });

  test('define getUserDisplayNameForProfile com fallback "Usuário"', () => {
    expect(source).toContain('function getUserDisplayNameForProfile(');
    expect(source).toContain("'Usuário'");
  });

  test('getUserDisplayNameForProfile lê display_name, full_name, name, username, preferred_username', () => {
    expect(source).toContain('display_name');
    expect(source).toContain('full_name');
    expect(source).toContain('preferred_username');
  });

  test('define getUserAvatarForProfile lendo user.profile.avatar_url', () => {
    expect(source).toContain('function getUserAvatarForProfile(');
    expect(source).toContain('avatar_url');
  });
});

describe('supabase.posts-write.adapter.js — ensureSupabaseProfileForCreate', () => {
  test('define ensureSupabaseProfileForCreate async', () => {
    expect(source).toContain('async function ensureSupabaseProfileForCreate(');
  });

  test('tenta window.KCProfiles.ensureSynced primeiro', () => {
    expect(source).toContain('window.KCProfiles');
    expect(source).toContain('ensureSynced');
  });

  test('usa upsert na tabela profiles como fallback', () => {
    expect(source).toContain("from('profiles')");
    expect(source).toContain(".upsert(");
    expect(source).toContain("onConflict: 'id'");
  });

  test('retorna { ok: false } com PROFILE_SYNC_PRECONDITION_FAILED quando pré-condição inválida', () => {
    expect(source).toContain('PROFILE_SYNC_PRECONDITION_FAILED');
  });

  test('loga aviso quando KCProfiles.ensureSynced falha', () => {
    expect(source).toContain('[KCAPI][Supabase] ensureSynced (KCProfiles) falhou');
  });
});

describe('supabase.posts-write.adapter.js — parsePriceMaybe e toSlug', () => {
  test('define parsePriceMaybe retornando null para valor vazio', () => {
    expect(source).toContain('function parsePriceMaybe(');
    expect(source).toContain('return null');
  });

  test('parsePriceMaybe normaliza formato BRL (remove pontos, troca vírgula por ponto)', () => {
    expect(source).toContain(".replace(/\\./g, '')");
    expect(source).toContain(".replace(/,/g, '.')");
  });

  test('define toSlug com normalize NFD e slice(0, 60)', () => {
    expect(source).toContain('function toSlug(');
    expect(source).toContain("normalize('NFD')");
    expect(source).toContain('.slice(0, 60)');
  });
});

describe('supabase.posts-write.adapter.js — clampCreatedAtISO', () => {
  test('define clampCreatedAtISO', () => {
    expect(source).toContain('function clampCreatedAtISO()');
  });

  test('usa getENV() para ler ENV.clamp (não acesso direto)', () => {
    expect(source).toContain('const ENV = getENV()');
    expect(source).toContain('ENV.clamp');
  });

  test('define MONTH_MAP com os 12 meses em inglês', () => {
    expect(source).toContain('january:1');
    expect(source).toContain('december:12');
  });
});

describe('supabase.posts-write.adapter.js — normalizeCreatePayload', () => {
  test('define normalizeCreatePayload', () => {
    expect(source).toContain('function normalizeCreatePayload(');
  });

  test('suporta modulo e module como aliases', () => {
    expect(source).toContain('d.modulo');
    expect(source).toContain('d.module');
  });

  test('suporta categoriaKey e categoryKey como aliases', () => {
    expect(source).toContain('d.categoriaKey');
    expect(source).toContain('d.categoryKey');
  });

  test('suporta preco e price como aliases', () => {
    expect(source).toContain('d.preco');
    expect(source).toContain('d.price');
  });

  test('suporta imagens e images como aliases', () => {
    expect(source).toContain('d.imagens');
    expect(source).toContain('d.images');
  });

  test('normaliza visibility para community ou public', () => {
    expect(source).toContain("'community'");
    expect(source).toContain("'public'");
  });

  test('trata compra-venda com subKey de ação (vendo, compro, troco…)', () => {
    expect(source).toContain("'compra-venda'");
    expect(source).toContain("'vendo'");
    expect(source).toContain("'compro'");
  });

  test('devolve moduleDB, categoryDB, subcategoryDB, images, metadata, raw', () => {
    expect(source).toContain('moduleDB,');
    expect(source).toContain('categoryDB,');
    expect(source).toContain('subcategoryDB,');
    expect(source).toContain('images,');
    expect(source).toContain('metadata,');
    expect(source).toContain('raw:');
  });
});

describe('supabase.posts-write.adapter.js — kcApiError e enforceSupabaseOnProduction', () => {
  test('define kcApiError retornando { ok: false, error: { message } }', () => {
    expect(source).toContain('function kcApiError(message)');
    expect(source).toContain('ok: false');
    expect(source).toContain('message: String(message');
  });

  test('define enforceSupabaseOnProduction usando getENV()', () => {
    expect(source).toContain('function enforceSupabaseOnProduction(');
    expect(source).toContain('const env = getENV()');
    expect(source).toContain('env.isProduction');
    expect(source).toContain("env.driver === 'supabase'");
  });

  test('enforceSupabaseOnProduction retorna PRODUCTION_REQUIRES_SUPABASE quando bloqueado', () => {
    expect(source).toContain('PRODUCTION_REQUIRES_SUPABASE');
  });
});

describe('supabase.posts-write.adapter.js — normalizeUpdatePayload', () => {
  test('define normalizeUpdatePayload chamando normalizeCreatePayload internamente', () => {
    expect(source).toContain('function normalizeUpdatePayload(');
    expect(source).toContain('normalizeCreatePayload(data)');
  });

  test('valida presença de title, description, moduleDB, categoryDB', () => {
    expect(source).toContain("'Título é obrigatório.'");
    expect(source).toContain("'Descrição é obrigatória.'");
    expect(source).toContain("'Módulo é obrigatório.'");
    expect(source).toContain("'Categoria é obrigatória.'");
  });

  test('devolve { ok: true, data: { ... }, images }', () => {
    expect(source).toContain('ok: true,');
    expect(source).toContain('images: parsed.images,');
  });
});

describe('supabase.posts-write.adapter.js — resolvePostUuid', () => {
  test('define resolvePostUuid async', () => {
    expect(source).toContain('async function resolvePostUuid(');
  });

  test('retorna o próprio postId quando já for UUID válido', () => {
    expect(source).toContain('UUID_RE.test(postId)');
  });

  test('usa window._KCSA.posts.getPostById como fallback', () => {
    expect(source).toContain('window._KCSA.posts.getPostById');
  });

  test('retorna null quando não consegue resolver', () => {
    expect(source).toContain('return null;');
  });
});

describe('supabase.posts-write.adapter.js — createPost', () => {
  test('define createPost async', () => {
    expect(source).toContain('async function createPost(');
  });

  test('chama createPostDiagnostics.clear() no início', () => {
    expect(source).toContain('createPostDiagnostics.clear()');
  });

  test('usa await getCurrentUser() (não supabaseGetCurrentUser)', () => {
    expect(source).toContain('await getCurrentUser()');
  });

  test('verifica limite de posts via kc_check_post_limit RPC', () => {
    expect(source).toContain("'kc_check_post_limit'");
    expect(source).toContain('POST_LIMIT_REACHED');
  });

  test('detecta flood_limit_exceeded e retorna _kcError FLOOD_LIMIT', () => {
    expect(source).toContain('flood_limit_exceeded');
    expect(source).toContain("'FLOOD_LIMIT'");
  });

  test('faz INSERT em posts e lê o id retornado', () => {
    expect(source).toContain("from('posts')");
    expect(source).toContain('.insert(insertPayload)');
    expect(source).toContain('.select(\'id\')');
    expect(source).toContain('POST_INSERT_NO_ID');
  });

  test('usa window._KCSA.media.uploadImages para upload de imagens', () => {
    expect(source).toContain('window._KCSA.media.uploadImages');
  });

  test('faz INSERT em post_media com sort_order e is_cover', () => {
    expect(source).toContain("from('post_media')");
    expect(source).toContain('is_cover:');
    expect(source).toContain('sort_order:');
  });

  test('tenta fallback sem sort_order quando coluna não existir', () => {
    expect(source).toContain("'sort_order'");
    expect(source).toContain('mediaRowsCompat');
  });

  test('usa doNormalizePost(raw) no objeto final (não normalizePost diretamente)', () => {
    expect(source).toContain('doNormalizePost(raw)');
  });

  test('sinaliza _kcPending quando post.status === pending', () => {
    expect(source).toContain("_kcPending = true");
    expect(source).toContain("_kcPendingReason");
  });

  test('usa rollbackCreatedPostSafely quando upload falha', () => {
    expect(source).toContain('rollbackCreatedPostSafely');
  });

  test('loga aviso com [KCAPI][Supabase] kc_check_post_limit quando limite falha gracefully', () => {
    expect(source).toContain('[KCAPI][Supabase] kc_check_post_limit falhou');
  });
});

describe('supabase.posts-write.adapter.js — syncPostMediaForUpdate', () => {
  test('define syncPostMediaForUpdate async', () => {
    expect(source).toContain('async function syncPostMediaForUpdate(');
  });

  test('busca post_media atual com .select("id, url, is_cover, sort_order")', () => {
    expect(source).toContain("'id, url, is_cover, sort_order'");
  });

  test('distingue URLs https existentes de novos data: URLs', () => {
    expect(source).toContain('/^https?:\\/\\//i');
    expect(source).toContain("startsWith('data:')");
  });

  test('usa window._KCSA.media.uploadImages para novos data URLs', () => {
    expect(source).toContain('window._KCSA.media.uploadImages');
  });

  test('usa window._KCSA.media.cleanupStorage para imagens removidas', () => {
    expect(source).toContain('window._KCSA.media.cleanupStorage');
  });

  test('deleta todas as linhas de post_media antes de reinserir', () => {
    expect(source).toContain(".delete().eq('post_id', postUuid)");
  });
});

describe('supabase.posts-write.adapter.js — updatePost', () => {
  test('define updatePost async', () => {
    expect(source).toContain('async function updatePost(');
  });

  test('faz ownership check lendo author_id antes de atualizar', () => {
    expect(source).toContain('author_id');
    expect(source).toContain('[KCAPI][Supabase] updatePost');
  });

  test('chama resolvePostUuid para obter UUID', () => {
    expect(source).toContain('await resolvePostUuid(postId)');
  });

  test('chama syncPostMediaForUpdate após atualizar texto', () => {
    expect(source).toContain('await syncPostMediaForUpdate(');
  });

  test('recarrega o post via window._KCSA.posts.getPostById após update', () => {
    expect(source).toContain('getPostByIdFn2');
    expect(source).toContain('await getPostByIdFn2(postUuid)');
  });

  test('retorna { ok: true, data: updated } em caso de sucesso', () => {
    expect(source).toContain('ok: true, data: updated');
  });
});

describe('supabase.posts-write.adapter.js — deletePost', () => {
  test('define deletePost async', () => {
    expect(source).toContain('async function deletePost(');
  });

  test('faz ownership check antes de excluir', () => {
    expect(source).toContain('[KCAPI][Supabase] deletePost');
  });

  test('chama resolvePostUuid para obter UUID', () => {
    expect(source).toContain('await resolvePostUuid(postId)');
  });

  test('lê post_media e chama cleanupStorage antes de deletar o post', () => {
    expect(source).toContain("from('post_media').select('id, url')");
    expect(source).toContain('window._KCSA.media.cleanupStorage');
  });

  test('bloqueia exclusão quando cleanup de storage falha (POST_MEDIA_STORAGE_CLEANUP_FAILED)', () => {
    expect(source).toContain('POST_MEDIA_STORAGE_CLEANUP_FAILED');
    expect(source).toContain('failedPaths');
  });

  test('retorna { ok: true } em caso de sucesso', () => {
    expect(source).toContain('return { ok: true };');
  });
});

describe('supabase.posts-write.adapter.js — reportPost', () => {
  test('define reportPost async', () => {
    expect(source).toContain('async function reportPost(');
  });

  test('valida reason contra lista de valores permitidos (spam, scam, inappropriate…)', () => {
    expect(source).toContain("'spam'");
    expect(source).toContain("'scam'");
    expect(source).toContain("'inappropriate'");
  });

  test('tenta RPC kc_report_post primeiro', () => {
    expect(source).toContain("'kc_report_post'");
  });

  test('detecta ALREADY_REPORTED e retorna meta: { duplicate: true }', () => {
    expect(source).toContain('ALREADY_REPORTED');
    expect(source).toContain('duplicate: true');
  });

  test('tem fallback para INSERT direto em reports', () => {
    expect(source).toContain("from('reports')");
    expect(source).toContain('reporter_id');
  });

  test('detecta unique constraint (23505) no fallback INSERT', () => {
    expect(source).toContain("'23505'");
    expect(source).toContain('reports_unique_open_post_reporter');
  });

  test('limita details a 1000 caracteres', () => {
    expect(source).toContain('.slice(0, 1000)');
  });
});

describe('supabase.posts-write.adapter.js — togglePostStatus', () => {
  test('define togglePostStatus async', () => {
    expect(source).toContain('async function togglePostStatus(');
  });

  test('usa RPC kc_toggle_post_status', () => {
    expect(source).toContain("'kc_toggle_post_status'");
  });

  test('retorna { ok: true, new_status, message } em caso de sucesso', () => {
    expect(source).toContain('new_status: data.new_status,');
  });
});

describe('supabase.posts-write.adapter.js — renewPost', () => {
  test('define renewPost async', () => {
    expect(source).toContain('async function renewPost(');
  });

  test('usa RPC kc_renew_post', () => {
    expect(source).toContain("'kc_renew_post'");
  });

  test('detecta LIMIT_REACHED e retorna _kcError POST_LIMIT_REACHED', () => {
    expect(source).toContain("'LIMIT_REACHED'");
    expect(source).toContain("'POST_LIMIT_REACHED'");
  });

  test('retorna expires_at em caso de sucesso', () => {
    expect(source).toContain('expires_at: data.expires_at,');
  });
});

describe('supabase.posts-write.adapter.js — bumpPost', () => {
  test('define bumpPost async', () => {
    expect(source).toContain('async function bumpPost(');
  });

  test('usa RPC kc_bump_post', () => {
    expect(source).toContain("'kc_bump_post'");
  });

  test('retorna next_bump_at em caso de erro (para o caller saber quando tentar de novo)', () => {
    expect(source).toContain('next_bump_at: data && data.next_bump_at,');
  });

  test('retorna { ok: true, bumped_at, next_bump_at, message } em caso de sucesso', () => {
    expect(source).toContain('bumped_at: data.bumped_at,');
    expect(source).toContain('next_bump_at: data.next_bump_at,');
  });
});

describe('supabase.posts-write.adapter.js — exports window._KCSA.postsWrite', () => {
  test('exporta createPost', () => {
    expect(source).toContain('createPost,');
  });

  test('exporta updatePost', () => {
    expect(source).toContain('updatePost,');
  });

  test('exporta deletePost', () => {
    expect(source).toContain('deletePost,');
  });

  test('exporta reportPost', () => {
    expect(source).toContain('reportPost,');
  });

  test('exporta togglePostStatus', () => {
    expect(source).toContain('togglePostStatus,');
  });

  test('exporta renewPost', () => {
    expect(source).toContain('renewPost,');
  });

  test('exporta bumpPost', () => {
    expect(source).toContain('bumpPost,');
  });
});
