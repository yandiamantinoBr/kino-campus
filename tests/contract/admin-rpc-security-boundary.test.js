'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260710164556_preserve_admin_banner_invoker_boundary.sql'
);
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/\r\n?/g, '\n');

describe('admin RPC security boundary', () => {
  test('keeps privileged banner writes in the private schema', () => {
    expect(sql).toContain('create or replace function kc_private.kc_admin_save_banner(p_data jsonb)');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('if v_admin is null or not public.kc_is_admin(v_admin) then');
  });

  test('exposes an invoker wrapper with explicit minimal grants', () => {
    expect(sql).toContain('create or replace function public.kc_admin_save_banner(p_data jsonb)');
    expect(sql).toContain('language sql\nsecurity invoker');
    expect(sql).toContain('select kc_private.kc_admin_save_banner($1)');
    expect(sql).toContain(
      'revoke all on function public.kc_admin_save_banner(jsonb)\n' +
      '  from public, anon, authenticated, service_role;'
    );
    expect(sql).toContain(
      'grant execute on function public.kc_admin_save_banner(jsonb)\n' +
      '  to authenticated, service_role;'
    );
  });

  test('keeps unknown updates fail-closed and audits successful writes', () => {
    expect(sql).toContain("raise exception 'Banner não encontrado.' using errcode = 'P0002';");
    expect(sql).toContain('insert into public.hero_banner_audit');
    expect(sql).toContain('values (v_result.id, v_action, v_admin, to_jsonb(v_result));');
  });
});
