const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.resolve(
  __dirname,
  '../../supabase/migrations/20260714193000_cadu_source_override_collision_cas.sql'
), 'utf8').toLowerCase().replace(/\s+/g, ' ');

describe('Cadu stable override collision CAS', () => {
  test('requires and compares the non-stable revision snapshot for create and update', () => {
    expect(migration).toContain("jsonb_typeof(p_expected_meta_revisions) is distinct from 'object'");
    expect(migration).toContain('where meta.unit_id <> v_source_id');
    expect(migration).toContain('if v_meta_revisions is distinct from p_expected_meta_revisions then');
    expect(migration).not.toContain('p_expected_exists and p_expected_meta_revisions is not null');
  });

  test('keeps source-scoped serialization, row revision CAS and service-role-only execution', () => {
    expect(migration).toContain("'kino-campus:cadu-source:v1:' || v_source_id");
    expect(migration).toContain('and meta.revision = p_expected_revision');
    expect(migration).toContain("raise sqlstate 'pt412'");
    expect(migration).toContain('revoke all on function public.kc_cadu_upsert_source_override');
    expect(migration).toContain('grant execute on function public.kc_cadu_upsert_source_override');
    expect(migration).toContain('to service_role');
  });
});
