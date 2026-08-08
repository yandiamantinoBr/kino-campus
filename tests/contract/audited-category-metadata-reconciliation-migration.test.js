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
const productionPreflight = fs.readFileSync(
  path.join(ROOT, 'tests/sql/audited-category-metadata-reconciliation-production-preflight.sql'),
  'utf8'
);
const runner = fs.readFileSync(
  path.join(ROOT, 'scripts/test-audited-category-metadata-reconciliation.js'),
  'utf8'
);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const auditDoc = fs.readFileSync(
  path.join(ROOT, 'docs/auditoria/feed-filters-taxonomy-2026-08-08.md'),
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
    expect(migration).toContain("'oportunidades', 'bolsas', 'published', 'public', 0");
    expect(migration).toContain("'pesquisa', 'Pesquisa'");
    expect(migration).toContain("'bolsas', 'Bolsas'");
    expect(migration).toContain("'eventos', 'congressos', 'published', 'public', 0");
    expect(migration).toContain("'academicos', 'Academicos'");
    expect(migration).toContain("'congressos', 'Congressos'");
    expect(migration).not.toMatch(/similarity|levenshtein|regexp_matches|websearch|ts_rank/i);
  });

  test('requires exact cardinality, triggers and NULL-safe states before writing', () => {
    const validationIndex = migration.indexOf('if (v_audited_posts = v_spec_rows) is not true then');
    const updateIndex = migration.indexOf('update public.posts p');
    const invocationIndex = migration.indexOf('select pg_temp.kc_run_category_metadata_reconciliation_20260808();');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(validationIndex);
    expect(invocationIndex).toBeGreaterThan(updateIndex);
    expect(migration).toContain('for update;');
    expect(migration).toContain('if (v_spec_rows = 2) is not true then');
    expect(migration).toContain('if (v_required_triggers = 2) is not true then');
    expect(migration).toContain('if (v_is_source or v_is_target) is not true then');
    expect(migration).toContain('if (v_updated_posts = v_source_posts) is not true then');
    expect(migration).toContain('get diagnostics v_updated_posts = row_count');
    expect(migration).toContain("errcode = 'P8503'");
    expect(migration).toContain('p.visibility = v.expected_visibility');
    expect(migration).toContain('p.price is not distinct from v.expected_price');
    expect(migration).toContain('expected both audited posts, found %');
    expect(migration).toContain('disappeared after preflight');
    expect(migration).toContain('unexpected state for post %');
  });

  test('synchronizes every category identity field read by the feed', () => {
    for (const field of ['category', 'categoryKey', 'categoriaKey', 'categoryLabel', 'categoria', 'categoriaLabel']) {
      expect(migration).toContain(`'{${field}}'`);
    }
    expect(migration).toContain('failed postcondition: expected 2 targets, found %');
  });

  test('ships a read-only real-row preflight with visibility and state cardinality', () => {
    expect(productionPreflight).toMatch(/begin transaction read only;/i);
    expect(productionPreflight).toMatch(/\brollback;\s*$/i);
    expect(productionPreflight).toContain('audited_spec_cardinality');
    expect(productionPreflight).toContain('audited_uuid_cardinality');
    expect(productionPreflight).toContain('audited_base_identity');
    expect(productionPreflight).toContain('audited_source_or_target_state');
    expect(productionPreflight).toContain('audited_update_triggers');
    expect(productionPreflight).toContain('audited_category_metadata_ready');
    expect(productionPreflight).toContain('pg_catalog.count(distinct id) = 2');
    expect(productionPreflight).toContain('pg_catalog.count(distinct observed_id) = 2');
    expect(productionPreflight).toContain('2c139f6c-8d05-43f6-b242-85980428e0d7');
    expect(productionPreflight).toContain('ce24a542-294c-4048-b0ea-2f2b4a435fe2');
    expect(productionPreflight).toContain("'public'::text");
    expect(productionPreflight).toContain('p.visibility = expected.expected_visibility');
    expect(productionPreflight).toContain('p.price is not distinct from expected.expected_price');
    expect(productionPreflight).toContain('(source_metadata_ok or target_metadata_ok) is true');
    expect(productionPreflight).not.toContain('\\ir ../../supabase/migrations/');
  });

  test('ships a transaction-scoped trigger/price/timestamp/idempotence/drift proof', () => {
    const includes = proof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152850_audited_category_metadata_reconciliation\.sql/g) || [];

    expect(proof).toMatch(/\bbegin;\s/i);
    expect(proof).toMatch(/\brollback;\s*$/i);
    expect(includes).toHaveLength(3);
    expect(proof).toContain('requires an empty local posts table');
    expect(proof).toContain('complete audited set did not reach the target');
    expect(proof).toContain('idempotent rerun changed the target');
    expect(proof).toContain('drifted source state was accepted');
    expect(proof).toContain('set local session_replication_role = replica');
    expect(proof).toContain('set local session_replication_role = origin');
    expect(proof).not.toMatch(/alter table public\.posts disable trigger/i);
    expect(proof).toContain('p.price is not distinct from snapshot.price');
    expect(proof).toContain('p.updated_at > snapshot.updated_at');
    expect(proof).toContain('p.updated_at is not distinct from snapshot.updated_at');
    expect(proof).toContain("when sqlstate 'P8503'");
    expect(proof).toContain('get stacked diagnostics v_message = message_text');
    expect(proof).not.toMatch(/when\s+raise_exception/i);
    expect(proof).not.toMatch(/when\s+others/i);
  });

  test('runs the replay proof only in the resolved local container and verifies rollback', () => {
    expect(packageJson.scripts['test:db:audited-category-metadata']).toBe(
      'node scripts/test-audited-category-metadata-reconciliation.js'
    );
    expect(runner).toContain('supabase_db_${project[1]}');
    expect(runner).toContain("['inspect', '--format', '{{.State.Running}}', container]");
    expect(runner).toContain("'docker'");
    expect(runner).toContain("'psql'");
    expect(runner).toContain("'ON_ERROR_STOP=1'");
    expect(runner).toContain('assertSafeInitialState(before)');
    expect(runner).toContain('assertRolledBack(before, readState(container))');
    expect(runner).toContain('Expected exactly 3 audited migration includes');
    expect(runner).not.toMatch(/--linked|SUPABASE_DB_URL|DATABASE_URL|migration repair/i);
  });

  test('documents the real pending cache-index history without repairing it falsely', () => {
    const sectionMatch = auditDoc.match(
      /### Auditoria histórica de `20260806090000`([\s\S]*?)\n## Ordem de rollout e checklist/
    );
    expect(sectionMatch).not.toBeNull();
    const cacheAudit = sectionMatch[1];

    expect(cacheAudit).toContain('20260806090000_cadu_published_cache_index.sql');
    expect(cacheAudit).toMatch(/não\s+consta no ledger remoto/);
    expect(cacheAudit).toMatch(/os dois índices também não existem em produção/);
    expect(cacheAudit).toMatch(/não usar `migration repair --status applied`/i);
    expect(cacheAudit).toContain('aplicar o SQL real da migration');
    expect(cacheAudit).toContain('supabase migration fetch --linked');
    expect(cacheAudit).toContain('supabase db push --linked --dry-run --include-all');
    expect(cacheAudit).toMatch(/`--include-all`[\s\S]+?\*\*somente nesse diretório isolado\*\*/i);
    expect(cacheAudit).toMatch(/clone completo[\s\S]+`--include-all`[\s\S]+proibido/i);
    expect(cacheAudit).toMatch(/dry-run isolado de `06090000`[\s\S]+exatamente o arquivo esperado/i);
    expect(cacheAudit).toMatch(/`IF NOT EXISTS`[\s\S]+não valida a definição/i);
    expect(cacheAudit).toContain('(id) WHERE status = \'published\'');
    expect(cacheAudit).toContain('(created_at DESC, id DESC) WHERE status = \'published\'');
  });
});
