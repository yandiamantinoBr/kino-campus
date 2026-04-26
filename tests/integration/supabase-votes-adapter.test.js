/**
 * @file supabase-votes-adapter.test.js
 * @description Static contract tests for supabase.votes.adapter.js (v11.30.4)
 * Verifica estrutura IIFE, namespace _KCSA.votes, helpers internos
 * e todos os métodos da API de votes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase/supabase.votes.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.votes.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.votes no final do IIFE', () => {
    expect(source).toContain('window._KCSA.votes = {');
  });
});

describe('supabase.votes.adapter.js — helpers getClient / getCurrentUser', () => {
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

describe('supabase.votes.adapter.js — helpers utilitários locais', () => {
  test('define UUID_RE localmente', () => {
    expect(source).toContain('const UUID_RE =');
    expect(source).toContain('UUID_RE.test(');
  });

  test('define normalizeErrorForDiagnostics localmente', () => {
    expect(source).toContain('function normalizeErrorForDiagnostics(');
    expect(source).toContain('Erro desconhecido.');
  });
});

describe('supabase.votes.adapter.js — helpers internos de votes', () => {
  test('define logVoteError com normalizeErrorForDiagnostics', () => {
    expect(source).toContain('function logVoteError(');
    expect(source).toContain("'[KCAPI][votes]'");
    expect(source).toContain('normalizeErrorForDiagnostics(error)');
  });

  test('define isVoteConflict detectando 23505 e chave única', () => {
    expect(source).toContain('function isVoteConflict(');
    expect(source).toContain("code === '23505'");
    expect(source).toContain('post_votes_post_id_voter_id_key');
  });

  test('define voteFail delegando para logVoteError', () => {
    expect(source).toContain('function voteFail(');
    expect(source).toContain('logVoteError(step');
  });

  test('define fetchPostScore lendo tabela posts', () => {
    expect(source).toContain('function fetchPostScore(');
    expect(source).toContain("from('posts')");
    expect(source).toContain('votos');
  });

  test('define deleteVoteByPostAndVoter com delete por post_id e voter_id', () => {
    expect(source).toContain('function deleteVoteByPostAndVoter(');
    expect(source).toContain("from('post_votes')");
    expect(source).toContain('.delete()');
  });

  test('define resolveLegacyPostUuid via window._KCSA.posts (lazy)', () => {
    expect(source).toContain('function resolveLegacyPostUuid(');
    expect(source).toContain('window._KCSA.posts');
    expect(source).toContain('getPostById');
    expect(source).not.toContain('supabaseGetPostById(');
  });
});

describe('supabase.votes.adapter.js — método getMyVote', () => {
  test('exporta getMyVote', () => {
    expect(source).toContain('getMyVote,');
  });

  test('busca na tabela post_votes', () => {
    expect(source).toContain("from('post_votes')");
    expect(source).toContain('voter_id');
  });

  test('retorna null se usuário não logado', () => {
    expect(source).toContain('if (!user) return null');
  });
});

describe('supabase.votes.adapter.js — método votePost', () => {
  test('exporta votePost', () => {
    expect(source).toContain('votePost,');
  });

  test('valida direção hot/cold', () => {
    expect(source).toContain("direction !== 'hot' && direction !== 'cold'");
  });

  test('implementa toggle off (shouldToggleOff)', () => {
    expect(source).toContain('shouldToggleOff');
    expect(source).toContain('TOGGLE_DELETE');
  });

  test('implementa recovery de conflito de concorrência', () => {
    expect(source).toContain('INSERT_CONFLICT_RECOVERY_START');
    expect(source).toContain('RECOVERY_DELETE');
    expect(source).toContain('RECOVERY_INSERT');
  });

  test('usa getMyVote() internamente para verificar voto existente', () => {
    expect(source).toContain('await getMyVote(uuid)');
    expect(source).not.toContain('supabaseGetMyVote(');
  });
});
