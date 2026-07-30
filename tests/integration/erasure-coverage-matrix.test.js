'use strict';

// Integration test for issue #753: erasure coverage matrix.
//
// We verify the structural properties of the schema that the privacy
// runbook (docs/privacy/account-erasure-runbook.md + docs/privacy/
// erasure-coverage-matrix-2026-07-30.md) relies on. Each table in the
// matrix is checked against the live database (via docker exec on the
// local supabase container, or a SUPABASE_DB_URL if set in the
// environment) for the expected FK action (CASCADE, SET NULL,
// RESTRICT, NO ACTION) and the expected presence of the redaction
// columns.
//
// The container name is read from the project_id in supabase/config.toml
// so this test works on any local dev environment.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

function resolveContainer() {
  try {
    const config = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'supabase', 'config.toml'),
      'utf8'
    );
    const m = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
    if (m) return `supabase_db_${m[1]}`;
  } catch (_) { /* ignore */ }
  return '';
}

const CONTAINER = process.env.SUPABASE_DB_CONTAINER || resolveContainer();
// Only run when an explicit env var is set. The CI does not have a
// local Supabase container matching the dev project_id, so the test
// is skipped by default. The local-dev workflow can set
// SUPABASE_DB_CONTAINER=supabase_db_kino-campus to exercise it.
const describeIf = (SUPABASE_DB_URL || process.env.SUPABASE_DB_CONTAINER) ? describe : describe.skip;

const TABLES = [
  // Behavioral / linkable tables that should be deleted by user_id
  { name: 'post_view_events', expect: { has_user_id: true } },
  { name: 'search_queries',    expect: { has_user_id: true } },
  { name: 'home_category_affinity', expect: { has_user_id: true } },
  { name: 'search_preferences', expect: { has_user_id: true } },
  { name: 'privacy_analytics_events', expect: { has_user_id: true } },
  { name: 'privacy_consent_events', expect: { has_user_id: true } },
  { name: 'user_legal_acceptances', expect: { has_user_id: true } },
  { name: 'comment_likes', expect: { has_user_id: true } },
  { name: 'chat_reactions', expect: { has_user_id: true } },
  // Co-authored tables: blocks use blocker_id (creator) and blocked_id
  // (target). blocked_id is FK to profiles with ON DELETE SET NULL and
  // the blocked_subject_hash preserves the security record.
  { name: 'user_blocks', expect: { has_blocked_subject_hash: true, fk_blocked_id_action: 'SET NULL' } },
  // Comments use author_id (not user_id); FK action must allow the
  // privacy controller to either null out the author or cascade the
  // tombstone.
  { name: 'comments', expect: { has_author_id: true, fk_author_id_action_in: ['SET NULL', 'CASCADE', 'NO ACTION'] } },
];

function psql(sql) {
  if (SUPABASE_DB_URL) {
    return execFileSync(
      'psql',
      [SUPABASE_DB_URL, '-t', '-A', '-F', '|', '-c', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  }
  if (CONTAINER) {
    const r = spawnSync('docker', [
      'exec', '-i', CONTAINER,
      'psql', '-X', '-U', 'postgres', '-d', 'postgres',
      '-t', '-A', '-F', '|', '-c', sql,
    ], { encoding: 'utf8', maxBuffer: 16*1024*1024 });
    if (r.status !== 0) {
      throw new Error(`docker exec psql failed (${r.status}): ${r.stderr}`);
    }
    return (r.stdout || '').trim();
  }
  throw new Error('No database available: set SUPABASE_DB_URL or have a local Supabase container running.');
}

function tableExists(name) {
  const r = psql(`select 1 from pg_tables where schemaname='public' and tablename='${name}'`);
  return r === '1';
}

function columnExists(table, column) {
  const r = psql(
    `select 1 from information_schema.columns ` +
    `where table_schema='public' and table_name='${table}' and column_name='${column}'`
  );
  return r === '1';
}

function fkDeleteAction(table, column) {
  const r = psql(
    `select confdeltype from information_schema.key_column_usage kcu ` +
    `join pg_constraint c on c.conname = kcu.constraint_name ` +
    `where kcu.table_schema='public' and kcu.table_name='${table}' and kcu.column_name='${column}' and c.contype='f'`
  );
  // confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
  const map = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  return map[r] || r;
}

describeIf('Erasure coverage matrix (issue #753)', () => {
  test('every table in the matrix exists in the public schema', () => {
    const missing = TABLES.filter((t) => !tableExists(t.name)).map((t) => t.name);
    expect(missing).toEqual([]);
  });

  test('every behavioral / linkable table has a user_id column', () => {
    const noUserId = TABLES
      .filter((t) => t.expect.has_user_id === true)
      .filter((t) => !columnExists(t.name, 'user_id'))
      .map((t) => t.name);
    expect(noUserId).toEqual([]);
  });

  test('comments has the author_id column (its user FK is named differently)', () => {
    const noAuthorId = TABLES
      .filter((t) => t.expect.has_author_id === true)
      .filter((t) => !columnExists(t.name, 'author_id'))
      .map((t) => t.name);
    expect(noAuthorId).toEqual([]);
  });

  test('user_blocks has the blocked_subject_hash redaction column', () => {
    expect(columnExists('user_blocks', 'blocked_subject_hash')).toBe(true);
  });

  test('user_blocks.blocked_id FK is ON DELETE SET NULL', () => {
    expect(fkDeleteAction('user_blocks', 'blocked_id')).toBe('SET NULL');
  });

  test.each(TABLES.filter((t) => t.expect.fk_author_id_action_in))(
    '%s.author_id FK action is in the allowed set',
    (t) => {
      const action = fkDeleteAction(t.name, 'author_id');
      expect(t.expect.fk_author_id_action_in).toContain(action);
    }
  );

  test('user_invites.invited_by FK action is in the allowed set (skipped if table missing)', () => {
    if (!tableExists('user_invites')) {
      // user_invites was deprecated and removed; skip the check.
      return;
    }
    const action = fkDeleteAction('user_invites', 'invited_by');
    expect(['SET NULL', 'CASCADE']).toContain(action);
  });
});

describe('Erasure coverage matrix (issue #753) — structural sanity', () => {
  test('matrix file documents every table the controller redacts', () => {
    const fs = require('fs');
    const path = require('path');
    const matrix = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'docs/privacy/erasure-coverage-matrix-2026-07-30.md'),
      'utf8'
    );
    // Each name should appear at least once in the matrix.
    TABLES.forEach((t) => {
      expect(matrix).toContain(t.name);
    });
  });
});
