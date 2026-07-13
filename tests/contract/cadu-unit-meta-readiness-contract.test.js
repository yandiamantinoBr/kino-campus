'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260713184500_cadu_metadata_contract_probe.sql',
);

describe('Cadu metadata deployment readiness contract', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ').trim();

  test('is a read-only stable invoker RPC with an empty search path', () => {
    expect(normalized).toContain(
      'create or replace function public.kc_cadu_metadata_contract() returns jsonb language sql stable security invoker set search_path = \'\'',
    );
    expect(normalized).not.toMatch(/\b(insert|update|delete|truncate)\s+(?:into|from|public\.)/i);
    expect(normalized).toContain('from pg_catalog.pg_attribute as attribute');
    expect(normalized).toContain('from pg_catalog.pg_constraint as constraint_row');
    expect(normalized).toContain('from pg_catalog.pg_trigger as trigger_row');
  });

  test('proves revision, trigger, RPC and exact phase-A ACL prerequisites', () => {
    for (const check of [
      'metadataTable',
      'revisionColumn',
      'revisionConstraint',
      'touchTrigger',
      'stableRpc',
      'legacyRpc',
      'browserWritesRevoked',
      'legacyReadsPreserved',
      'serviceRolePhaseA',
    ]) {
      expect(normalized).toContain(`'${check}'`);
    }
    expect(normalized).toContain("'contractVersion', 'cadu-unit-meta-cas-v1'");
    expect(normalized).toContain("'phase', 'phase-a'");
    expect(normalized).toContain("function_row.proconfig = array['search_path=\"\"']");
    expect(normalized).toContain("function_row.proargnames = array[ 'p_source_id'");
    expect(normalized).toContain("function_row.proargnames = array[ 'p_unit_id'");
    expect(normalized).toContain('function_row.pronargdefaults = 0');
    expect(normalized).toContain('function_row.provariadic = 0');
    expect(normalized).toContain("identity_constraint.contype in ('p', 'u')");
    expect(normalized).toContain('not identity_constraint.condeferrable');
    expect(normalized).toContain('identity_index.indimmediate');
    expect(normalized).toContain('service_role_row.rolbypassrls');
    expect(normalized).toContain('not service_role_row.rolsuper');
    expect(normalized).toContain("'service_role', 'public.kc_unit_meta', 'references'");
    expect(normalized).toContain("policy_row.polname = 'kc_unit_meta_select_public'");
    expect(normalized).toContain("policy_row.polcmd = 'r'");
    expect(normalized).toContain('live_attribute.attnum > 0');
    expect(normalized).toContain(') = 7 and not exists');
    expect(normalized).toContain('kc_unit_meta_updated_by_fkey|f|true|false|false');
    expect(normalized).toContain('pg_catalog.pg_get_indexdef(index_meta.indexrelid)');
    expect(normalized).toContain('from pg_catalog.pg_rewrite as rewrite_row');
    expect(normalized).toContain(
      "'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'",
    );
    expect(normalized).toContain(
      "'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)'",
    );
    expect(normalized).toContain(
      "pg_catalog.pg_get_constraintdef( constraint_row.oid, true ) = 'CHECK (revision > 0)'",
    );
    expect(normalized).toContain('trigger_row.tgtype = 23');
    for (const bodyHash of [
      'f62c2001b838efab4de4985b6a9e4fc1',
      '7326c723f5eba96059ed69c959d2c4a8',
      'd42bfede3b7399d16b647e26004eedf2',
    ]) {
      expect(normalized).toContain(`'${bodyHash}'`);
    }
  });

  test('detects column grants, disabled RLS and browser write policies', () => {
    expect((normalized.match(/pg_catalog\.has_any_column_privilege\(/g) || []))
      .toHaveLength(7);
    expect(normalized).toContain('select table_row.relrowsecurity');
    expect(normalized).toContain('not anon_role.rolbypassrls');
    expect(normalized).toContain('not authenticated_role.rolbypassrls');
    expect(normalized).toContain(
      "policy_row.polcmd in ('a', 'w', 'd', '*')",
    );
  });

  test('is service-role-only and refreshes the PostgREST schema cache', () => {
    expect(normalized).toContain(
      'revoke all on function public.kc_cadu_metadata_contract() from public, anon, authenticated, service_role',
    );
    expect(normalized).toContain(
      'grant execute on function public.kc_cadu_metadata_contract() to service_role',
    );
    expect(normalized).toContain("notify pgrst, 'reload schema'");
  });
});
