'use strict';

/**
 * Busca pública de produção tolerante a typos: o RPC kc_search_posts_fts (FTS)
 * passa a anexar um caminho fuzzy por trigrama (pg_trgm word_similarity sobre o
 * título), rankeado ABAIXO dos matches exatos do FTS (que ficam idênticos).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260531220000_search_posts_fts_fuzzy.sql'),
  'utf8'
);

describe('Busca de produção — fuzzy no kc_search_posts_fts', () => {
  test('faz create or replace preservando a assinatura', () => {
    expect(sql).toContain('create or replace function public.kc_search_posts_fts');
    expect(sql).toContain('returns setof jsonb');
    expect(sql).toContain("set search_path to 'public'");
  });

  test('mantém o FTS exato (search_document @@ v_query) como caminho principal', () => {
    expect(sql).toContain('ranked.search_document @@ v_query');
    expect(sql).toContain('ts_rank_cd(ranked.search_document, v_query)');
  });

  test('anexa o caminho fuzzy por trigrama (word_similarity no título, gate >= 4)', () => {
    expect(sql).toContain('extensions.word_similarity(t, COALESCE(ranked.title');
    expect(sql).toContain('>= 0.5');
    expect(sql).toContain('length(t) >= 4');
    // fuzzy é OR com o FTS (acrescenta, não substitui)
    expect(sql).toMatch(/WHERE ranked\.search_document @@ v_query\s*[\s\S]*OR EXISTS/);
  });

  test('ordena os matches exatos do FTS acima dos só-fuzzy', () => {
    expect(sql).toContain('(ranked.search_document @@ v_query) AS is_fts');
    expect(sql).toContain('ORDER BY matched.is_fts DESC, matched.search_rank DESC, matched.fuzzy_sim DESC');
  });
});
