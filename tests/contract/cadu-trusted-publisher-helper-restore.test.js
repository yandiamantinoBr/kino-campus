const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'supabase/migrations/00000000000001_baseline_v76.sql');
const RESTORE = path.join(
  ROOT,
  'supabase/migrations/20260714204000_restore_trusted_publisher_helper.sql',
);

function normalized(file) {
  return fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('trusted publisher helper on fresh V76 databases', () => {
  test('restores the private function required by the baseline trigger', () => {
    const baseline = normalized(BASELINE);
    const migration = normalized(RESTORE);

    expect(baseline).toContain('v_trusted := kc_private.kc_is_trusted_publisher(new.author_id)');
    expect(migration).toContain(
      'create or replace function kc_private.kc_is_trusted_publisher(p_user_id uuid)',
    );
    expect(migration).toContain('from public.kc_trusted_publishers as trusted');
    expect(migration).toContain('where trusted.user_id = p_user_id');
  });

  test('keeps the helper private, stable and search-path hardened', () => {
    const migration = normalized(RESTORE);

    expect(migration).toContain("language sql stable security definer set search_path = ''");
    expect(migration).toContain(
      'revoke all on function kc_private.kc_is_trusted_publisher(uuid) from public, anon, authenticated',
    );
    expect(migration).toContain(
      'grant execute on function kc_private.kc_is_trusted_publisher(uuid) to service_role',
    );
    expect(migration).not.toMatch(/execute\s+format\s*\(/);
  });
});
