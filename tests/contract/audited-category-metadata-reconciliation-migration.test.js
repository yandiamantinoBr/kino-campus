'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_NAME = '20260808152850_audited_category_metadata_reconciliation.sql';
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations', MIGRATION_NAME), 'utf8');
const proof = fs.readFileSync(
  path.join(ROOT, 'tests/sql/audited-category-metadata-reconciliation-replay-proof.sql'),
  'utf8'
);

describe('audited category metadata reconciliation migration', () => {
  test('runs after remote-aligned taxonomy/search and before the semantic ledger', () => {
    expect(MIGRATION_NAME > '20260808152845_align_feed_cursor_remote_search_20260808.sql').toBe(true);
    expect(MIGRATION_NAME < '20260808152900_semantic_post_reclassification.sql').toBe(true);
    expect(migration).toContain('2c139f6c-8d05-43f6-b242-85980428e0d7');
    expect(migration).toContain('ce24a542-294c-4048-b0ea-2f2b4a435fe2');
  });

  test('uses exact audited source and target identities', () => {
    expect(migration).toContain("'oportunidades', 'bolsas', 'published'");
    expect(migration).toContain("'pesquisa', 'Pesquisa'");
    expect(migration).toContain("'bolsas', 'Bolsas'");
    expect(migration).toContain("'eventos', 'congressos', 'published'");
    expect(migration).toContain("'academicos', 'Academicos'");
    expect(migration).toContain("'congressos', 'Congressos'");
    expect(migration).not.toMatch(/similarity|levenshtein|regexp_matches|websearch|ts_rank/i);
  });

  test('requires both rows, validates before writing and fails closed on third state', () => {
    const validationIndex = migration.indexOf('if v_audited_posts <> 2 then');
    const updateIndex = migration.indexOf('update public.posts p');
    const invocationIndex = migration.indexOf('select pg_temp.kc_run_category_metadata_reconciliation_20260808();');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(validationIndex);
    expect(invocationIndex).toBeGreaterThan(updateIndex);
    expect(migration).toContain('for update;');
    expect(migration).toContain('expected both audited posts, found %');
    expect(migration).toContain('audited post % disappeared after preflight');
    expect(migration).toContain('unexpected state for post %');
  });

  test('synchronizes every category identity field read by the feed', () => {
    for (const field of ['category', 'categoryKey', 'categoriaKey', 'categoryLabel', 'categoria', 'categoriaLabel']) {
      expect(migration).toContain(`'{${field}}'`);
    }
    expect(migration).toContain('failed postcondition: expected 2 targets, found %');
  });

  test('ships a transaction-scoped empty/full-set/idempotence/drift proof', () => {
    const includes = proof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152850_audited_category_metadata_reconciliation\.sql/g) || [];

    expect(proof).toMatch(/\bbegin;\s/i);
    expect(proof).toMatch(/\brollback;\s*$/i);
    expect(includes).toHaveLength(3);
    expect(proof).toContain('requires an isolated database');
    expect(proof).toContain('complete audited set did not reach the target');
    expect(proof).toContain('idempotent rerun changed the target');
    expect(proof).toContain('drifted source state was accepted');
  });
});
