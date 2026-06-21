'use strict';

/**
 * Production public search: kc_search_posts_fts keeps exact FTS as the primary
 * path and appends a fuzzy pg_trgm path for typo tolerance.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/_archive-v75/20260601172451_search_fuzzy_query_terms_threshold.sql'),
  'utf8'
);

describe('Busca de producao - fuzzy no kc_search_posts_fts', () => {
  test('faz create or replace preservando a assinatura', () => {
    expect(sql).toContain('create or replace function public.kc_search_posts_fts');
    expect(sql).toContain('returns setof jsonb');
    expect(sql).toContain("set search_path to 'public'");
  });

  test('mantem o FTS exato (search_document @@ v_query) como caminho principal', () => {
    expect(sql).toContain('ranked.search_document @@ v_query');
    expect(sql).toContain('ts_rank_cd(ranked.search_document, v_query)');
  });

  test('anexa o caminho fuzzy por trigrama em campos semanticos, com gate >= 4', () => {
    expect(sql).toContain('AS fuzzy_text');
    expect(sql).toContain('public.kc_posts_search_tags_text');
    expect(sql).toContain('public.kc_posts_search_subcategory');
    expect(sql).toContain('extensions.word_similarity(t, ranked.fuzzy_text)');
    expect(sql).toContain('v_fuzzy_terms');
    expect(sql).toContain('>= 0.68');
    expect(sql).toContain('length(t) >= 4');
    expect(sql).toMatch(/WHERE ranked\.search_document @@ v_query\s*[\s\S]*OR EXISTS/);
  });

  test('ordena os matches exatos do FTS acima dos so-fuzzy', () => {
    expect(sql).toContain('(ranked.search_document @@ v_query) AS is_fts');
    expect(sql).toContain('ORDER BY matched.is_fts DESC, matched.search_rank DESC, matched.fuzzy_sim DESC');
  });
});
