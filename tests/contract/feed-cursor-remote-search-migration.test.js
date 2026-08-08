'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PREVIOUS = path.join(
  ROOT,
  'supabase/migrations/20260718224609_optimize_feed_search_and_cadu_identity.sql'
);
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260808134510_align_feed_cursor_remote_search.sql'
);
const PROOF = path.join(ROOT, 'tests/sql/feed-cursor-remote-search-proof.sql');
const LOCAL_FILTERS = path.join(ROOT, 'assets/js/api/kc-api.filters.js');

const previous = fs.readFileSync(PREVIOUS, 'utf8');
const migration = fs.readFileSync(MIGRATION, 'utf8');
const proof = fs.readFileSync(PROOF, 'utf8');
const localFilters = fs.readFileSync(LOCAL_FILTERS, 'utf8');

function cursorSignature(source) {
  const match = source.match(
    /create or replace function public\.kc_get_feed_cursor\(([\s\S]*?)\)\s*returns jsonb/i
  );
  if (!match) throw new Error('kc_get_feed_cursor signature not found');
  return match[1].replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('feed cursor remote search migration', () => {
  test('runs after taxonomy work and preserves the full RPC signature', () => {
    expect(BigInt(path.basename(MIGRATION).slice(0, 14))).toBeGreaterThan(20260808123000n);
    expect(cursorSignature(migration)).toBe(cursorSignature(previous));
    expect(migration).toContain(') returns jsonb');
    expect(migration).toContain('language plpgsql');
    expect(migration).toContain('stable');
    expect(migration).toContain("set search_path to 'public'");
  });

  test('preserves pagination, advanced filters and the public response shape', () => {
    [
      'v_cursor_status_priority',
      'public.kc_matches_feed_request_params(',
      'public.kc_feed_matches_date_preset(',
      'base_candidates as not materialized',
      'filtered as (',
      'limited as materialized',
      'kept as materialized',
      "'hasMore', coalesce(v_has_more, false)",
      "'has_more', coalesce(v_has_more, false)",
      "'nextCursor', v_next_cursor",
      "'next_cursor', v_next_cursor",
    ].forEach((fragment) => expect(migration).toContain(fragment));
    expect(migration).not.toMatch(/drop\s+function\s+.*kc_get_feed_cursor/i);
    expect(migration).not.toMatch(/security\s+definer/i);
  });

  test('indexes the browser-equivalent document without mutating the existing FTS contract', () => {
    expect(migration).toContain('kc_posts_search_document() / idx_posts_fts contract remains');
    expect(migration).toContain('function public.kc_posts_feed_search_text');
    expect(migration).toMatch(/immutable\s+parallel safe\s+set search_path = ''/i);
    expect(migration).toContain('idx_posts_feed_cursor_search_trgm');
    expect(migration).toContain('extensions.gin_trgm_ops');
    expect(migration).toContain('where legacy_id is null');
    expect(migration).not.toMatch(/drop\s+index\s+.*idx_posts_fts/i);
    expect(migration).not.toContain('function public.kc_posts_search_document(');
  });

  test('allowlists searchable metadata values and never serializes JSON', () => {
    expect(migration).toContain('function public.kc_posts_feed_normalize_search_text');
    expect(migration).toContain('function public.kc_posts_feed_search_value');
    expect(migration).toContain('function public.kc_posts_feed_metadata_search_text');
    [
      "->'category'",
      "->'subcategory'",
      "->'location'",
      "->'origem'",
      "->'destino'",
      "->'areaLabel'",
      "->'tagKeys'",
      "->'housingFeatureKeys'",
      "->'caronasFeatureKeys'",
    ].forEach((fragment) => expect(migration).toContain(fragment));
    expect(migration).not.toMatch(/(?:p_)?metadata\s*::\s*text/i);
    expect(migration).not.toMatch(/jsonb_(?:each|object_keys)/i);
  });

  test('makes normalized substring semantics authoritative and trigram-indexable', () => {
    expect(migration).toContain('v_search_text text := public.kc_posts_feed_normalize_search_text(p_q)');
    expect(migration).toContain("'[^a-z0-9]+'");
    expect(migration).toContain('v_search_like_pattern text :=');
    expect(migration).toContain('like v_search_like_pattern escape');
    expect(migration).toContain('position(');
    expect(migration).toMatch(/where v_search_text = ''[\s\S]*union all[\s\S]*where v_search_text <> ''/i);
    expect(migration).toContain('function public.kc_posts_feed_search_text');
    expect(migration).not.toContain('v_search_query');
    expect(migration).not.toContain('v_search_uses_fallback');
  });

  test('pins the same punctuation and slug normalization in the browser filter', () => {
    expect(localFilters).toContain('function normalizeSearchText(value)');
    expect(localFilters).toContain(".replace(/[^a-z0-9]+/g, ' ')");
    expect(localFilters).toContain("const q = normalizeSearchText(p.q || p.query || '')");
    expect(localFilters).toContain("return normalizeSearchText(collectPostTextParts(post).join(' '))");
  });

  test('keeps every helper invoker-only with explicit role grants', () => {
    [
      'kc_posts_feed_normalize_search_text(text)',
      'kc_posts_feed_search_value(jsonb)',
      'kc_posts_feed_metadata_search_text(jsonb)',
      'kc_posts_feed_search_text(text, text, text, text, jsonb)',
    ].forEach((signature) => {
      expect(migration).toContain(`revoke all on function public.${signature} from public;`);
    });
    expect((migration.match(/to anon, authenticated, service_role;/g) || [])).toHaveLength(4);
  });

  test('ships a rollback-only SQL proof for positive and adversarial search cases', () => {
    expect(proof).toContain('begin;');
    expect(proof).toContain('rollback;');
    expect(proof).toContain('20260808134510_align_feed_cursor_remote_search.sql');
    expect(proof).toContain('category-only feed search failed');
    expect(proof).toContain('cursos capacitações');
    expect(proof).toContain('cursos-capacitacoes');
    expect(proof).toContain('location-only feed search failed');
    expect(proof).toContain('tag-only feed search failed');
    expect(proof).toContain('accent-insensitive metadata feed search failed');
    expect(proof).toContain('JSON key name produced a false-positive feed match');
    expect(proof).toContain('stopword substring feed search failed');
    expect(proof).toContain('short-query substring feed search failed');
    expect(proof).toContain('substring prefix camp-to-campus feed search failed');
    expect(proof).toContain('literal LIKE escape feed search failed');
    expect(proof).toContain('empty-query cursor behavior or response shape changed');
    expect(proof).toContain('multi-term cross-field feed search failed');
    expect(proof).toContain('multi-term feed search diverged from local substring order');
    expect(proof).toContain('idx_posts_fts');
    expect(proof).toContain('idx_posts_feed_cursor_search_trgm');
    expect(proof).toContain('transaction_rollback=pass');
  });
});
