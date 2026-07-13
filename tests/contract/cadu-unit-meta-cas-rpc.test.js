'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260713183000_cadu_unit_meta_cas_rpc.sql',
);

describe('Cadu unit metadata transactional CAS boundary', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ').trim();

  test('adds a database-managed monotonic revision', () => {
    expect(normalized).toContain(
      'add column if not exists revision bigint not null default 1',
    );
    expect(normalized).toContain(
      'add constraint kc_unit_meta_revision_positive check (revision > 0)',
    );
    expect(normalized).toContain("if tg_op = 'INSERT' then new.revision := 1;");
    expect(normalized).toContain('new.revision := old.revision + 1;');
    expect(normalized).toContain(
      'before insert or update on public.kc_unit_meta',
    );
  });

  test('stable RPC is invoker-only, validated and revision-CAS protected', () => {
    expect(normalized).toContain(
      'create or replace function public.kc_cadu_upsert_source_override( p_source_id text, p_tier integer, p_note text, p_expected_exists boolean, p_expected_revision bigint, p_expected_meta_revisions jsonb )',
    );
    expect(normalized).not.toContain('security definer');
    expect((normalized.match(/security invoker set search_path = ''/g) || [])).toHaveLength(3);
    expect(normalized).toContain(
      "v_source_id !~ '^(web|ig)\\.[a-z0-9][a-z0-9._-]{0,190}$'",
    );
    expect(normalized).toContain('meta.revision = p_expected_revision');
    expect(normalized).toContain(
      'pg_catalog.jsonb_object_agg(meta.unit_id, meta.revision)',
    );
    expect(normalized).toContain(
      'v_meta_revisions is distinct from p_expected_meta_revisions',
    );
    expect(normalized).toContain("raise sqlstate 'PT412'");
    expect(normalized).toContain('on conflict (unit_id) do nothing');
    expect(sql).toContain(
      "p_note ~ E'[\\\\x01-\\\\x08\\\\x0B\\\\x0C\\\\x0E-\\\\x1F\\\\x7F]'",
    );
  });

  test('stable and resolved legacy writes share one pre-DML lock domain', () => {
    expect((normalized.match(/pg_catalog\.pg_advisory_xact_lock\(/g) || [])).toHaveLength(2);
    expect(normalized).toContain(
      "'kino-campus:cadu-source:v1:' || v_source_id",
    );
    expect(normalized).toContain(
      "then 'kino-campus:cadu-source:v1:' || v_source_id else 'kino-campus:cadu-legacy:v1:' || v_unit_id",
    );
    const stableLock = normalized.indexOf('pg_catalog.pg_advisory_xact_lock(');
    const stableDml = normalized.indexOf('update public.kc_unit_meta as meta', stableLock);
    expect(stableLock).toBeGreaterThan(-1);
    expect(stableDml).toBeGreaterThan(stableLock);
  });

  test('legacy RPC quarantines stable-shadowed and stale writes', () => {
    expect(normalized).toContain(
      'create or replace function public.kc_cadu_upsert_legacy_override( p_unit_id text, p_resolved_source_id text, p_tier integer, p_note text, p_expected_exists boolean, p_expected_revision bigint )',
    );
    expect(normalized).toContain("v_unit_id ~* '^(web|ig)\\.'");
    expect(normalized).toContain(
      'where stable.unit_id = v_source_id ) then raise sqlstate \'PT409\'',
    );
    expect(normalized).toContain('LEGACY_OVERRIDE_SHADOWED_BY_STABLE_SOURCE');
    expect(normalized).toContain('LEGACY_OVERRIDE_PRECONDITION_FAILED');
  });

  test('browser roles lose write bypass and only service_role executes RPCs', () => {
    expect(normalized).toContain(
      'drop policy if exists kc_unit_meta_insert_admin on public.kc_unit_meta',
    );
    expect(normalized).toContain(
      'revoke all on table public.kc_unit_meta from public, anon, authenticated, service_role',
    );
    expect(normalized).toContain(
      'on public.kc_unit_meta from anon, authenticated',
    );
    expect(normalized).toContain(
      'grant select on public.kc_unit_meta to anon, authenticated',
    );
    for (const signature of [
      'public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb)',
      'public.kc_cadu_upsert_legacy_override(text, text, integer, text, boolean, bigint)',
    ]) {
      expect(normalized).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`,
      );
      expect(normalized).toContain(
        `grant execute on function ${signature} to service_role`,
      );
    }
  });

  test('phase-A service_role compatibility is explicit and temporary', () => {
    expect(sql).toContain('Phase A of the rollout');
    expect(sql).toContain(
      'Phase B must first move the implementation behind a narrowly',
    );
    expect(sql).toContain(
      'Revoking DML while these public wrappers remain SECURITY INVOKER would also',
    );
    expect(sql).toContain(
      'Phase B replaces the invoker implementation before',
    );
    expect(normalized).toContain(
      'grant select, insert, update on table public.kc_unit_meta to service_role',
    );
    expect(normalized).toContain(
      'DELETE/TRUNCATE/REFERENCES/TRIGGER remain revoked',
    );
    expect(normalized).not.toContain(
      'grant all on table public.kc_unit_meta to service_role',
    );
  });
});
