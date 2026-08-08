'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(
  path.join(
    ROOT,
    'supabase/migrations/20260806090000_cadu_published_cache_index.sql',
  ),
  'utf8',
);
const proof = fs.readFileSync(
  path.join(ROOT, 'tests/sql/cadu-published-cache-index-replay-proof.sql'),
  'utf8',
);
const runner = fs.readFileSync(
  path.join(ROOT, 'scripts/test-cadu-published-cache-index-migration.js'),
  'utf8',
);
const auditDoc = fs.readFileSync(
  path.join(ROOT, 'docs/auditoria/feed-filters-taxonomy-2026-08-08.md'),
  'utf8',
);

describe('Cadu published cache index migration', () => {
  test('bounds DDL locks and validates homonyms before accepting them', () => {
    expect(migration).not.toMatch(/^\s*begin;\s*$/im);
    expect(migration).not.toMatch(/^\s*commit;\s*$/im);
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '2min'");
    expect(migration).toMatch(/create index if not exists posts_cadu_published_cache_idx/i);
    expect(migration).toMatch(/create index if not exists posts_cadu_published_created_idx/i);

    const cacheCreation = migration.indexOf(
      'CREATE INDEX IF NOT EXISTS posts_cadu_published_cache_idx',
    );
    const structuralPostcondition = migration.indexOf(
      'do $cache_index_postcondition$',
    );
    const comments = migration.indexOf(
      'COMMENT ON INDEX public.posts_cadu_published_cache_idx',
    );
    expect(cacheCreation).toBeGreaterThan(-1);
    expect(structuralPostcondition).toBeGreaterThan(cacheCreation);
    expect(comments).toBeGreaterThan(structuralPostcondition);
    expect(migration).toContain("errcode = 'P8601'");
    expect(migration).toContain("errcode = 'P8602'");
    expect(migration).toContain("errcode = 'P8603'");
  });

  test('derives catalog identities and requires the exact two btree layouts', () => {
    expect(migration).toContain("pg_catalog.to_regclass('public.posts')");
    expect(migration).toContain("attribute.attname = 'id'");
    expect(migration).toContain("attribute.attname = 'created_at'");
    expect(migration).toContain("operator_class.opcname = 'uuid_ops'");
    expect(migration).toContain("operator_class.opcname = 'timestamptz_ops'");
    expect(migration).toContain("access_method.amname = 'btree'");
    expect(migration).toContain('index_metadata.indrelid = v_posts_oid');
    expect(migration).toContain('index_metadata.indnkeyatts = 1');
    expect(migration).toContain('index_metadata.indnatts = 1');
    expect(migration).toContain('index_metadata.indnkeyatts = 2');
    expect(migration).toContain('index_metadata.indnatts = 2');
    expect(migration).toContain('index_metadata.indkey::text = v_id_attnum::text');
    expect(migration).toContain('v_created_at_attnum');
    expect(migration).toContain('index_metadata.indclass::text = v_uuid_ops::text');
    expect(migration).toContain('v_timestamptz_ops');
    expect(migration).toContain("index_metadata.indoption::text = '0'");
    expect(migration).toContain("index_metadata.indoption::text = '3 3'");
    expect(migration).toContain("index_metadata.indcollation::text = '0'");
    expect(migration).toContain("index_metadata.indcollation::text = '0 0'");
    expect(migration.match(/index_metadata\.indexprs is null/g)).toHaveLength(2);
    expect(migration.match(/index_metadata\.indisvalid is true/g)).toHaveLength(2);
    expect(migration.match(/index_metadata\.indisready is true/g)).toHaveLength(2);
    expect(migration.match(/index_metadata\.indislive is true/g)).toHaveLength(2);
    expect(migration.match(/index_metadata\.indisunique is false/g)).toHaveLength(2);
    expect(migration).toContain('pg_catalog.pg_get_expr(');
    expect(migration).toContain("= '(status = ''published''::text)'");
    expect(migration).toContain('pg_catalog.pg_get_indexdef(');
    expect(migration).toContain(
      "CREATE INDEX posts_cadu_published_cache_idx ON public.posts USING btree (id) WHERE (status = ''published''::text)",
    );
    expect(migration).toContain(
      "CREATE INDEX posts_cadu_published_created_idx ON public.posts USING btree (created_at DESC, id DESC) WHERE (status = ''published''::text)",
    );

    // Operator class and attribute OIDs must come from the active catalog,
    // never from installation-specific numeric constants.
    expect(migration).not.toMatch(/indclass::text\s*=\s*'[0-9]/);
    expect(migration).not.toMatch(/indkey::text\s*=\s*'[0-9]/);
  });

  test('proves exact first run and idempotence inside a rollback-only transaction', () => {
    const includes = proof.match(
      /\\ir \.\.\/\.\.\/supabase\/migrations\/20260806090000_cadu_published_cache_index\.sql/g,
    ) || [];
    expect(includes).toHaveLength(2);
    expect(proof).toMatch(/^\\set ON_ERROR_STOP on/m);
    expect(proof).toMatch(/\bbegin;\s/i);
    expect(proof).toMatch(/\brollback;\s*$/i);
    expect(proof).not.toMatch(/\bcommit\s*;/i);
    expect(proof).not.toMatch(/^\\(?:connect|c)\b/im);
    expect(proof).toContain('v_exact_indexes = 2');
    expect(proof).toContain('v_unchanged_indexes = 2');
    expect(proof).toContain('index_metadata.indnkeyatts = index_metadata.indnatts');
    expect(proof).toContain("index_metadata.indoption::text = '3 3'");
    expect(proof).toContain('snapshot.indexrelid = index_metadata.indexrelid');
  });

  test('runs only against the resolved local container and proves rollback after mutations', () => {
    expect(runner).toContain('supabase_db_${project[1]}');
    expect(runner).toContain("['inspect', '--format', '{{.State.Running}}', container]");
    expect(runner).toContain("options.database || 'postgres'");
    expect(runner).toContain('assertSafeBaseline(before)');
    expect(runner).toContain('assertRolledBack(');
    expect(runner).not.toContain('stripMigrationTransaction');
    expect(runner).toContain('Expected exactly 2 cache-index migration includes');
    expect(runner).toContain(`create index \${CACHE_INDEX} on public.posts (title)`);
    expect(runner).toContain(
      `create index \${CREATED_INDEX} on public.posts (created_at, id desc)`,
    );
    expect(runner).toContain("sqlstate: 'P8601'");
    expect(runner).toContain("sqlstate: 'P8602'");
    expect(runner).not.toMatch(/SUPABASE_DB_URL|DATABASE_URL|migration repair/i);
  });

  test('proves CLI 2.105.0 migration and ledger atomicity in disposable local databases', () => {
    expect(runner).toContain("version !== '2.105.0'");
    expect(runner).toContain('fs.mkdtempSync(');
    expect(runner).toContain("startsWith('kino-cadu-cache-index-')");
    expect(runner).toContain("'--db-url'");
    expect(runner).toContain("'--include-all'");
    expect(runner).toContain("'--yes'");
    expect(runner).toContain("localUrl.includes('@127.0.0.1:')");
    expect(runner).toContain("args.includes('--linked')");
    expect(runner).toContain('forced post-DDL atomicity failure');
    expect(runner).toContain("errcode = 'P8699'");
    expect(runner).toContain('target_ledger: 0, indexes: 0');
    expect(runner).toContain('target_ledger: 1, indexes: 2');
    expect(runner).toContain("'dropdb'");
    expect(runner).toContain('removeDisposableWorkdir(workdir)');
    expect(runner).toContain('proveCliAtomicity(target, migration)');
  });

  test('documents a single-operator, exact-project dry-run and apply gate', () => {
    const section = auditDoc.match(
      /### Auditoria histórica de `20260806090000`([\s\S]*?)\n## Ordem de rollout e checklist/,
    );
    expect(section).not.toBeNull();
    const runbook = section[1];

    expect(runbook).toContain('wacyrkwhkvzwkqpolrbg');
    expect(runbook).toContain('Supabase CLI `2.105.0`');
    expect(runbook).toMatch(/operador único/i);
    expect(runbook).toContain("lock_timeout = '5s'");
    expect(runbook).toContain("statement_timeout = '2min'");
    expect(runbook).toContain(
      'supabase db push --linked --dry-run --include-all',
    );
    expect(runbook).toContain('supabase db push --linked --include-all --yes');
    expect(runbook).toMatch(
      /somente\s+`20260806090000_cadu_published_cache_index\.sql`/i,
    );
    expect(runbook).toMatch(/mesmo diretório isolado/i);
    expect(runbook).toMatch(/homônimo/i);
    expect(runbook).toMatch(/transação\s+inteira/i);
    expect(runbook).toMatch(/indisvalid.*indisready/is);
    expect(runbook).toMatch(/por statement/i);
    expect(runbook).toMatch(/janela inteira/i);
    expect(runbook).toMatch(/migration repair --status applied/i);
  });
});
