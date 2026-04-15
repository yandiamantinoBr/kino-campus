/**
 * @file supabase-comments-adapter.test.js
 * @description Static contract tests for supabase.comments.adapter.js (v11.30.3)
 * Verifica estrutura IIFE, namespace _KCSA.comments, helpers internos
 * e todos os métodos da API de comments.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../assets/js/adapters/supabase.comments.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.comments.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.comments no final do IIFE', () => {
    expect(source).toContain('window._KCSA.comments = {');
  });
});

describe('supabase.comments.adapter.js — helpers getClient / getCurrentUser', () => {
  test('define getClient() via window._KCSA.getClient (lazy)', () => {
    expect(source).toContain('function getClient()');
    expect(source).toContain('window._KCSA.getClient');
    expect(source).not.toContain('getSupabaseClient()');
  });

  test('define getCurrentUser() via window._KCSA.getCurrentUser (lazy)', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
    expect(source).not.toContain('supabaseGetCurrentUser()');
  });
});

describe('supabase.comments.adapter.js — helpers utilitários locais', () => {
  test('define UUID_RE localmente', () => {
    expect(source).toContain('const UUID_RE =');
    expect(source).toContain('UUID_RE.test(');
  });

  test('define isMissingTokenError localmente', () => {
    expect(source).toContain('function isMissingTokenError(');
    expect(source).toContain("msg.includes('does not exist')");
  });

  test('define getUserDisplayNameForProfile localmente', () => {
    expect(source).toContain('function getUserDisplayNameForProfile(');
    expect(source).toContain('user_metadata');
  });
});

describe('supabase.comments.adapter.js — helpers internos de comentários', () => {
  test('define resolveCommentParentIdFromOptions', () => {
    expect(source).toContain('function resolveCommentParentIdFromOptions(');
    expect(source).toContain('parentId');
    expect(source).toContain('parent_id');
  });

  test('define resolveCommentMutationErrorMessage', () => {
    expect(source).toContain('function resolveCommentMutationErrorMessage(');
    expect(source).toContain('resposta deve pertencer');
  });

  test('define isCommentLikeAlreadyLiked com detecção de duplicata', () => {
    expect(source).toContain('function isCommentLikeAlreadyLiked(');
    expect(source).toContain("code === '23505'");
    expect(source).toContain('comment_likes_comment_user_unique');
  });
});

describe('supabase.comments.adapter.js — método getComments', () => {
  test('exporta getComments', () => {
    expect(source).toContain('getComments,');
  });

  test('busca na tabela comments', () => {
    expect(source).toContain("from('comments')");
    expect(source).toContain('.select(');
  });

  test('ordena por created_at ascending', () => {
    expect(source).toContain("order('created_at'");
    expect(source).toContain('ascending: true');
  });

  test('enriquece liked_by_me via comment_likes', () => {
    expect(source).toContain("from('comment_likes')");
    expect(source).toContain('liked_by_me');
  });

  test('faz fallback sem join de profiles quando embed falha', () => {
    const count = (source.match(/from\('comments'\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('supabase.comments.adapter.js — método addComment', () => {
  test('exporta addComment', () => {
    expect(source).toContain('addComment,');
  });

  test('insere na tabela comments', () => {
    expect(source).toContain('.insert(');
    expect(source).toContain('post_id');
    expect(source).toContain('author_id');
    expect(source).toContain('author_name');
    expect(source).toContain('body');
  });

  test('usa resolveCommentParentIdFromOptions', () => {
    expect(source).toContain('resolveCommentParentIdFromOptions(options)');
  });

  test('usa getCurrentUser() para obter o usuário', () => {
    expect(source).toContain('await getCurrentUser()');
  });
});

describe('supabase.comments.adapter.js — método likeComment', () => {
  test('exporta likeComment', () => {
    expect(source).toContain('likeComment,');
  });

  test('chama RPC increment_comment_likes', () => {
    expect(source).toContain("'increment_comment_likes'");
    expect(source).toContain('comment_uuid');
  });

  test('usa isCommentLikeAlreadyLiked para detectar like duplo', () => {
    expect(source).toContain('isCommentLikeAlreadyLiked(');
    expect(source).toContain('alreadyLiked: true');
  });
});
