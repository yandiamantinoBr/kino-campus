'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_NAME = '20260808225424_canonical_category_label_reconciliation.sql';
const MIGRATION_PATH = path.join(ROOT, 'supabase/migrations', MIGRATION_NAME);
const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
const replay = fs.readFileSync(
  path.join(ROOT, 'tests/sql/canonical-category-label-reconciliation-replay-proof.sql'),
  'utf8',
);
const productionPreflight = fs.readFileSync(
  path.join(ROOT, 'tests/sql/canonical-category-label-reconciliation-production-preflight.sql'),
  'utf8',
);
const productionProof = fs.readFileSync(
  path.join(ROOT, 'tests/sql/canonical-category-label-reconciliation-production-proof.sql'),
  'utf8',
);
const runner = fs.readFileSync(
  path.join(ROOT, 'scripts/test-canonical-category-label-reconciliation.js'),
  'utf8',
);
const cliPushRunner = fs.readFileSync(
  path.join(ROOT, 'scripts/test-canonical-category-label-reconciliation-cli-push.js'),
  'utf8',
);
const auditDoc = fs.readFileSync(
  path.join(ROOT, 'docs/auditoria/feed-filters-taxonomy-2026-08-08.md'),
  'utf8',
);
const edgeSchema = fs.readFileSync(
  path.join(ROOT, 'supabase/functions/cadu-publish/schema.ts'),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const uniqueUuids = (source) => [...new Set(source.match(uuidPattern) || [])].sort();

function forbiddenEncodingCodepoints(source) {
  return [...source].filter((character) => {
    const codepoint = character.codePointAt(0);
    return codepoint === 0x00c3 || codepoint === 0x00c2 || codepoint === 0xfffd;
  });
}

function splitSqlValues(source) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'" && quoted && source[index + 1] === "'") {
      value += "''";
      index += 1;
      continue;
    }
    if (character === "'") {
      quoted = !quoted;
      value += character;
      continue;
    }
    if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
      continue;
    }
    value += character;
  }
  if (value.trim()) values.push(value.trim());
  return values;
}

function sqlScalar(token) {
  const withoutCast = token.trim().replace(/::(?:uuid|numeric|text)$/i, '').trim();
  if (/^null$/i.test(withoutCast)) return null;
  const quoted = withoutCast.match(/^'((?:''|[^'])*)'$/);
  if (quoted) return quoted[1].replace(/''/g, "'");
  if (/^-?\d+(?:\.\d+)?$/.test(withoutCast)) return withoutCast;
  throw new Error(`Unsupported SQL scalar in category-label contract: ${token}`);
}

function parenthesizedRows(source) {
  const rows = [];
  let depth = 0;
  let quoted = false;
  let rowStart = -1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'" && quoted && source[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (character === "'") {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === '(') {
      if (depth === 0) rowStart = index + 1;
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0 && rowStart >= 0) {
        rows.push(source.slice(rowStart, index));
        rowStart = -1;
      }
    }
  }
  if (depth !== 0 || quoted) throw new Error('Unbalanced SQL values in category-label contract.');
  return rows;
}

function normalizedSpec(row) {
  return {
    id: row.id,
    module: row.expected_module,
    category: row.expected_category,
    label: row.expected_label,
    status: row.expected_status || 'published',
    visibility: row.expected_visibility || 'public',
    price: row.expected_price === null ? null : String(row.expected_price ?? '0'),
    sourceVariant: row.source_variant,
    sourceCategoryLabel: row.source_category_label,
    sourceCategoria: row.source_categoria,
  };
}

function sortedSpecs(rows) {
  return rows.map(normalizedSpec).sort((left, right) => left.id.localeCompare(right.id));
}

function parseMigrationSpecs() {
  const region = migration.match(
    /-- Each INSERT below([\s\S]*?)-- Freeze the non-zero and NULL prices/,
  );
  if (!region) throw new Error('Migration specification region is absent.');

  const rows = [];
  const insertPattern = /insert into pg_temp\.kc_category_label_reconciliation_20260808\s*\(([\s\S]*?)\)\s*(select[\s\S]*?|values[\s\S]*?);/gi;
  for (const match of region[1].matchAll(insertPattern)) {
    const columns = match[1].split(',').map((column) => column.trim());
    const body = match[2].trim();
    if (/^select\b/i.test(body)) {
      const selected = body.match(
        /^select\s+id\s*,([\s\S]*?)\s+from pg_catalog\.unnest\(array\[([\s\S]*?)\]\)\s+ids\(id\)$/i,
      );
      if (!selected) throw new Error(`Unsupported grouped migration specification: ${body}`);
      const constants = splitSqlValues(selected[1]).map(sqlScalar);
      const ids = selected[2].match(uuidPattern) || [];
      for (const id of ids) {
        const row = { id: id.toLowerCase() };
        columns.slice(1).forEach((column, index) => {
          row[column] = constants[index];
        });
        rows.push(row);
      }
    } else {
      const values = body.replace(/^values\s*/i, '');
      for (const sqlRow of parenthesizedRows(values)) {
        const scalars = splitSqlValues(sqlRow).map(sqlScalar);
        const row = {};
        columns.forEach((column, index) => {
          row[column] = scalars[index];
        });
        row.id = row.id.toLowerCase();
        rows.push(row);
      }
    }
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const nullPrices = migration.match(
    /set expected_price = null\s+where id in \(([\s\S]*?)\);/i,
  );
  if (!nullPrices) throw new Error('NULL price specification is absent.');
  for (const id of nullPrices[1].match(uuidPattern) || []) {
    byId.get(id.toLowerCase()).expected_price = null;
  }
  for (const match of migration.matchAll(
    /set expected_price = (\d+(?:\.\d+)?)\s+where id = '([0-9a-f-]{36})'::uuid;/gi,
  )) {
    byId.get(match[2].toLowerCase()).expected_price = match[1];
  }
  return sortedSpecs([...byId.values()]);
}

function parsePreflightSpecs(registryRows) {
  const seed = productionPreflight.match(
    /\), spec_seed\([\s\S]*?\) as \(\s*values([\s\S]*?)\n\), spec as \(/,
  );
  if (!seed) throw new Error('Production preflight specification is absent.');
  const labels = new Map(registryRows.map((row) => [`${row.module}/${row.category}`, row.label]));
  const columns = [
    'id', 'expected_module', 'expected_category', 'expected_visibility',
    'expected_price', 'source_variant', 'source_category_label', 'source_categoria',
  ];
  const rows = parenthesizedRows(seed[1]).map((sqlRow) => {
    const scalars = splitSqlValues(sqlRow).map(sqlScalar);
    const row = {};
    columns.forEach((column, index) => {
      row[column] = scalars[index];
    });
    row.id = row.id.toLowerCase();
    row.expected_label = labels.get(`${row.expected_module}/${row.expected_category}`);
    return row;
  });
  return sortedSpecs(rows);
}

function parseSqlRegistry(source) {
  const registry = source.match(
    /with registry\(module, category, label\) as \(\s*values([\s\S]*?)\n\s*\)(?=\s*(?:select|, spec_seed))/,
  );
  if (!registry) throw new Error('SQL category registry is absent.');
  return parenthesizedRows(registry[1]).map((sqlRow) => {
    const [module, category, label] = splitSqlValues(sqlRow).map(sqlScalar);
    return { module, category, label };
  }).sort((left, right) =>
    `${left.module}/${left.category}`.localeCompare(`${right.module}/${right.category}`));
}

function decodeJavaScriptString(value) {
  return JSON.parse(`"${value}"`);
}

function parseEdgeRegistry() {
  const definitions = edgeSchema.match(
    /export const CATEGORY_DEFINITIONS = \{([\s\S]*?)\n\} as const satisfies/,
  );
  if (!definitions) throw new Error('Edge CATEGORY_DEFINITIONS is absent.');
  const rows = [];
  const modulePattern = /^\s{2}(?:"([^"]+)"|([a-z-]+)):\s*\[([\s\S]*?)^\s{2}\],/gm;
  for (const moduleMatch of definitions[1].matchAll(modulePattern)) {
    const module = moduleMatch[1] || moduleMatch[2];
    const entryPattern = /\{\s*key:\s*"((?:\\.|[^"])*)",\s*label:\s*"((?:\\.|[^"])*)"/g;
    for (const entry of moduleMatch[3].matchAll(entryPattern)) {
      rows.push({
        module,
        category: decodeJavaScriptString(entry[1]),
        label: decodeJavaScriptString(entry[2]),
      });
    }
  }
  return rows.sort((left, right) =>
    `${left.module}/${left.category}`.localeCompare(`${right.module}/${right.category}`));
}

const migrationRegistry = parseSqlRegistry(migration);
const preflightRegistry = parseSqlRegistry(productionPreflight);
const edgeRegistry = parseEdgeRegistry();
const migrationSpecs = parseMigrationSpecs();
const preflightSpecs = parsePreflightSpecs(preflightRegistry);

describe('canonical category label reconciliation migration', () => {
  test('is versioned after the semantic rollout and binds exactly 87 audited UUIDs', () => {
    expect(MIGRATION_NAME > '20260808152900_semantic_post_reclassification.sql').toBe(true);
    expect(uniqueUuids(migration)).toHaveLength(87);
    expect(uniqueUuids(productionPreflight)).toEqual(uniqueUuids(migration));
    expect(migration).toContain('if (v_spec_rows = 87) is not true then');
    expect(migration).toContain('v_price_rows = 76');
    expect(migration).toContain('expected_price is null');
    expect(migration).toContain("expected_visibility in ('public', 'community')");
    expect(migrationSpecs.filter(({ visibility }) => visibility === 'public')).toHaveLength(84);
    expect(migrationSpecs.filter(({ visibility }) => visibility === 'community')).toHaveLength(3);
    for (const id of [
      '4b39baaf-996b-49ca-a603-b122066946dd',
      '55008a05-3d79-5fbd-8aa2-666e2a0b71ff',
      '9d8b952f-c44b-5a66-804e-fdc4dd1be80e',
      'ffd27f1a-91ba-5295-848c-eb940113d72c',
    ]) {
      expect(migration).toContain(id);
    }
  });

  test('materializes a 34-pair module-scoped registry and complete explicit aliases', () => {
    expect(migrationRegistry).toHaveLength(34);
    expect(preflightRegistry).toEqual(migrationRegistry);
    expect(edgeRegistry).toEqual(migrationRegistry);

    for (const alias of [
      "when 'academicas' then 'academicos'",
      "when 'monitorias' then 'monitoria'",
      "when 'curso-capacitacoes' then 'cursos-capacitacoes'",
      "when 'cursos-capacitacao' then 'cursos-capacitacoes'",
      "when 'curso-e-capacitacao' then 'cursos-capacitacoes'",
      "when 'cursos-e-capacitacoes' then 'cursos-capacitacoes'",
      "when 'voluntariados' then 'voluntariado'",
      "when 'freelancers' then 'freelancer'",
      "when 'procurando-moradia' then 'procurando'",
      "when 'achados' then 'encontrados'",
    ]) {
      expect(migration).toContain(alias);
    }
    expect(migration).toContain("public.kc_feed_category_label('eventos', 'empregos') is not null");
    expect(migration).toContain("public.kc_feed_category_label('oportunidades', 'academicos') is not null");
  });

  test('keeps all 87 audited tuples identical between migration, preflight and proof', () => {
    expect(migrationSpecs).toHaveLength(87);
    expect(new Set(migrationSpecs.map(({ id }) => id)).size).toBe(87);
    expect(preflightSpecs).toEqual(migrationSpecs);
    expect(productionProof).toContain(
      '\\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql',
    );
    expect(productionProof).toContain('v_spec_rows = 87');
    expect(productionProof).toContain("v_expected_state = 'source'");
    expect(productionProof).toContain("v_expected_state = 'target'");
  });

  test('serializes writers before public function replacement and validates everything before the write', () => {
    const lockSql = 'lock table public.posts in share row exclusive mode';
    const lockIndex = migration.indexOf(lockSql);
    const lockOccurrences = migration.match(/lock table public\.posts in share row exclusive mode/g) || [];
    const firstPublicFunction = migration.indexOf('create or replace function public.');
    const mainRoutine = migration.indexOf('create or replace function pg_temp.kc_run_category_label_reconciliation_20260808()');
    const mainLock = migration.indexOf(
      "execute 'lock table public.posts in share row exclusive mode';",
      mainRoutine,
    );
    const firstMainRead = migration.indexOf('select pg_catalog.count(*)', mainRoutine);
    const lockedCardinality = migration.indexOf('if (v_locked_rows = v_spec_rows) is not true then');
    const globalPreflight = migration.indexOf('v_published_rows = 134');
    const driftPreflight = migration.indexOf('v_global_drift_rows = v_source_rows');
    const updateIndex = migration.indexOf('update public.posts p\n  set metadata =');

    expect(migration).toContain("set lock_timeout = '5s'");
    expect(migration).toContain("set statement_timeout = '60s'");
    expect(migration).toContain('reset statement_timeout;\nreset lock_timeout;');
    expect(lockIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(firstPublicFunction);
    expect(lockOccurrences).toHaveLength(2);
    expect(mainLock).toBeGreaterThan(mainRoutine);
    expect(mainLock).toBeLessThan(firstMainRead);
    expect(migration).toContain('order by p.id\n    for update of p');
    expect(globalPreflight).toBeGreaterThan(lockedCardinality);
    expect(driftPreflight).toBeGreaterThan(globalPreflight);
    expect(updateIndex).toBeGreaterThan(driftPreflight);
    expect((migration.match(/update public\.posts p/g) || [])).toHaveLength(1);
  });

  test('requires object metadata, exact source or target and disjoint fingerprints', () => {
    expect(migration).toContain("pg_catalog.jsonb_typeof(v_post.metadata) = 'object'");
    expect(migration).toContain('v_is_source := v_fingerprint = v_post.source_touched_fingerprint');
    expect(migration).toContain('v_is_target := v_fingerprint = v_post.target_touched_fingerprint');
    expect(migration).toContain('if (v_is_source or v_is_target) is not true then');
    expect(migration).toContain('spec.source_touched_fingerprint <> spec.target_touched_fingerprint');
    expect(migration).toContain('p.price is not distinct from spec.expected_price');
    expect(migration).toContain("p.status = 'published'");
    expect(migration).not.toMatch(/similarity|levenshtein|regexp_matches|websearch|ts_rank/i);

    for (let index = 1; index <= 16; index += 1) {
      expect(migration).toContain(`'KL${String(index).padStart(3, '0')}'`);
    }
  });

  test('updates only six category surfaces and proves row/metadata/timestamp preservation', () => {
    const update = migration.match(
      /update public\.posts p\n  set metadata =([\s\S]*?)\n  from pg_temp\.kc_category_label_reconciliation_20260808 spec/,
    );
    expect(update).not.toBeNull();

    for (const field of [
      'category', 'categoryKey', 'categoriaKey',
      'categoryLabel', 'categoria', 'categoriaLabel',
    ]) {
      expect(update[1]).toContain(`'${field}'`);
    }
    expect(update[1]).not.toMatch(/tags|tagKeys|price|secondary|dates/);
    expect(migration).toContain("pg_catalog.to_jsonb(p) - array['metadata', 'updated_at']::text[]");
    expect(migration).toContain('snapshot.untouched_metadata');
    expect(migration).toContain('v_updated_rows = v_source_rows');
    expect(migration).toContain('not snapshot.was_source');
    expect(migration).toContain('v_admissible_published_rows = 134');
  });

  test('hardens the trigger without breaking unchanged unknown legacy pairs', () => {
    expect(migration).toContain('v_surface_changed boolean');
    expect(migration).toContain('if v_category_label is null then');
    expect(migration).toContain('if v_pair_changed or v_surface_changed then');
    expect(migration).toContain('elsif (v_pair_changed or v_surface_changed)');
    expect(migration).toContain('new.module := v_module');
    expect(migration).toContain('new.category := v_category');
    expect(migration).toContain("errcode = '22023'");
    expect(migration).toContain('v_module is distinct from public.kc_feed_slug_key(old.module)');

    for (const field of [
      'category', 'categoryKey', 'categoriaKey',
      'categoryLabel', 'categoria', 'categoriaLabel',
    ]) {
      expect(replay).toContain(`'${field}'`);
    }
    expect(replay).toContain('legacy_surface_mutation_assertion');
    expect(replay).toContain('missing_category_surface_mutation_assertion');
    expect(replay).toContain('module alias insert fixture');
    expect(replay).toContain('module casing canonicalization incorrectly derived opportunity price');
    expect(replay).toContain('module transition did not preserve canonical label/price inference');
  });

  test('guards trigger identity, origin state, full shape, columns and no WHEN clause', () => {
    expect(migration).toContain('trigger_row.tgfoid =');
    expect(migration).toContain("pg_catalog.to_regprocedure('public.kc_canonicalize_post_feed_fields()')");
    expect(migration).toContain('trigger_row.tgqual is null');
    expect(migration).toContain('trigger_row.tgtype = 23');
    expect(migration).toContain("'category', 'metadata', 'module', 'price'");
    expect(migration).toContain("trigger_row.tgenabled = 'O'");
    expect(replay).toContain('canonical trigger WHEN mutant');
    expect(replay).toContain('canonical trigger shape mutant');
    expect(replay).toContain('disabled active-session guard');
    expect(replay).toContain('disabled updated-at trigger');
    expect(replay).toContain('disabled canonical trigger');
    expect(replay).toContain('p_expected_message_like');
  });

  test('runs exhaustive local source/mixed/target/fixed-point and mutant proofs', () => {
    const includes = replay.match(
      /\\ir \.\.\/\.\.\/supabase\/migrations\/20260808225424_canonical_category_label_reconciliation\.sql/g,
    ) || [];
    expect(includes).toHaveLength(4);
    expect(replay).toMatch(/^begin;$/m);
    expect(replay).toMatch(/\brollback;\s*$/i);
    expect(replay).toMatch(
      /v_targets = 87\s+and v_preserved = 87\s+and v_timestamps = 87/,
    );
    expect(replay).toContain('v_sources = 44 and v_targets = 43');
    expect(replay).toContain('target replay was not a fixed point');
    expect(replay).toContain('v_canonical_identical = 47');
    expect(replay).toContain('v_published = 134');
    expect(replay).toContain('published outside-registry control mutant');
    expect(replay).toContain('unexpected 135th published row mutant');
    expect(replay).toContain("'KL009'");
    expect(replay).toContain("'KL008'");
    expect(replay).toContain("'KL007'");
    expect(replay).toContain("'KL006'");
    expect(replay).not.toMatch(/\bcommit\s*;/i);
  });

  test('ships independent read-only preflight and explicit source/target production proof', () => {
    expect(productionPreflight).toMatch(/begin transaction read only;/i);
    expect(productionPreflight).toMatch(/\brollback;\s*$/i);
    expect(productionPreflight).not.toContain('\\ir ../../supabase/migrations/');
    expect(productionPreflight).not.toMatch(/^\s*(?:create|insert|update|delete|alter|drop|lock)\b/im);
    expect(productionPreflight).toContain('spec_87_exact_and_disjoint');
    expect(productionPreflight).toContain('spec_predeploy_source_state');
    expect(productionPreflight).toContain('published_134_admissible');
    expect(productionPreflight).toContain('canonical_trigger_shape');
    expect(productionPreflight).toContain('canonical_category_labels_ready');

    expect(productionProof).toContain('\\set kc_expected_state source');
    expect(productionProof).toContain("v_expected_state not in ('source', 'target')");
    expect(productionProof).toContain("v_expected_state = 'source' and v_source_before = 87 and v_target_before = 0");
    expect(productionProof).toContain("v_expected_state = 'target' and v_source_before = 0 and v_target_before = 87");
    expect(productionProof).toContain('lock table public.posts in share row exclusive mode');
    expect(productionProof).toContain('kc_category_label_production_before_20260808');
    expect(productionProof).toContain('v_control_rows = 47');
    expect(productionProof).toContain('v_global_exact = 134');
    expect(productionProof.match(/\\ir \.\.\/\.\.\/supabase\/migrations\/20260808225424_canonical_category_label_reconciliation\.sql/g)).toHaveLength(1);
    expect(productionProof).toMatch(
      /\\ir \.\.\/\.\.\/supabase\/migrations\/20260808225424_canonical_category_label_reconciliation\.sql\s+--[\s\S]*?set local lock_timeout = '5s';\s+set local statement_timeout = '60s';/,
    );
    expect(productionProof).toMatch(/\brollback;\s*$/i);
    expect(productionProof).not.toMatch(/\bcommit\s*;|session_replication_role|^\\(?:connect|c)\b/im);
  });

  test('runs only against the resolved local Docker database and verifies exact rollback', () => {
    expect(packageJson.scripts['test:db:canonical-category-labels']).toBe(
      'node scripts/test-canonical-category-label-reconciliation.js',
    );
    expect(packageJson.scripts['test:db:canonical-category-labels:reset-local']).toBe(
      'node scripts/test-canonical-category-label-reconciliation.js --supabase-reset',
    );
    expect(packageJson.scripts['test:db:canonical-category-labels:cli-push']).toBe(
      'node scripts/test-canonical-category-label-reconciliation-cli-push.js',
    );
    expect(runner).toContain('supabase_db_${project[1]}');
    expect(runner).toContain("['inspect', '--format', '{{.State.Running}}', container]");
    expect(runner).toContain("'docker'");
    expect(runner).toContain("'psql'");
    expect(runner).toContain("'ON_ERROR_STOP=1'");
    expect(runner).toContain('Expected exactly 4 category label migration includes');
    expect(runner).toContain('assertSafeInitialState(before)');
    expect(runner).toContain('assertRolledBack(before, readState(container))');
    expect(runner).toContain("['db', 'reset', '--local', '--no-seed', '--yes']");
    expect(runner).toContain('supabase.cmd db reset --local --no-seed --yes');
    expect(runner).toContain("migration_row.version = '20260808225424'");
    expect(runner).toContain("process.argv.includes('--supabase-reset')");
    expect(runner).not.toContain('process.env.DATABASE_URL');
    expect(runner).not.toContain('process.env.SUPABASE_DB_URL');
    expect(runner).not.toMatch(/\[\s*['"]--linked['"]|\[\s*['"]migration['"]\s*,\s*['"]repair['"]/i);
    expect(cliPushRunner).toContain("const REQUIRED_CLI_VERSION = '2.105.0'");
    expect(cliPushRunner).toContain("'db', 'push', '--db-url'");
    expect(cliPushRunner).toContain("'--include-all', '--yes'");
    expect(cliPushRunner).toContain("errcode = 'PZ901'");
    expect(cliPushRunner).toContain('Mutant migration does not preserve the verbatim source prefix');
    expect(cliPushRunner).toContain('success.ledger !== 1');
    expect(cliPushRunner).toContain('JSON.stringify(failure) !== JSON.stringify(failureSentinel)');
    expect(cliPushRunner).toContain("dropdb', '--if-exists', '--force'");
    expect(cliPushRunner).toContain('cleanupResources(container, [successDatabase, failureDatabase], temporaryRoot)');
    expect(cliPushRunner).toContain('for (const database of ownedDatabases)');
    expect(cliPushRunner).toContain('temporary directory cleanup postcondition');
    expect(cliPushRunner).toContain('if (primaryError) throw primaryError');
    expect(cliPushRunner).not.toMatch(/--linked|migration\s+repair|SUPABASE_ACCESS_TOKEN/i);
  });

  test('documents current rollout state, structural scope and open editorial exception', () => {
    expect(auditDoc).toContain('134 `published`, 301 `hidden`, 341 `closed` e 15 `deleted`');
    expect(auditDoc).toContain('## Reconciliação estrutural das seis superfícies — `20260808225424`');
    expect(auditDoc).toContain('87 UUIDs');
    expect(auditDoc).toContain('84 alvos `public` e 3 alvos `community`');
    expect(auditDoc).toContain('47 controles já canônicos');
    expect(auditDoc).toContain('4b39baaf-996b-49ca-a603-b122066946dd');
    expect(auditDoc).toContain('permanece uma **revisão editorial aberta**');
    expect(auditDoc).toContain('ainda não foi aplicada');
    expect(auditDoc).toContain('O hotfix dos filtros segue em trilha paralela');
    expect(auditDoc).toContain('npm run test:db:canonical-category-labels');
  });

  test('contains no replacement or double-decoding codepoints in new artifacts', () => {
    for (const source of [
      migration, replay, productionPreflight, productionProof, runner, cliPushRunner,
    ]) {
      expect(forbiddenEncodingCodepoints(source)).toHaveLength(0);
    }
  });
});
