'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = 'supabase/migrations/20260710012022_reconcile_caronas_cadu_schema.sql';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadLocationDefinitions() {
  const context = { window: {} };
  vm.runInNewContext(read('assets/js/boot/kc-constants.js'), context);
  return Array.from(context.window.KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS);
}

describe('caronas and Cadu schema reconciliation', () => {
  const sql = read(MIGRATION);
  const match = sql.match(/\$seed\$(\[[\s\S]*\])\$seed\$/);

  test('migration carries a parseable canonical location seed', () => {
    expect(match).toBeTruthy();
    expect(() => JSON.parse(match[1])).not.toThrow();
  });

  test('database seed stays synchronized with frontend location definitions', () => {
    const expected = loadLocationDefinitions().map((row) => ({
      key: row.key,
      label: row.label,
      icon: row.icon,
      zoneKey: row.zoneKey,
      zoneLabel: row.zoneLabel,
      isCampus: row.isCampus,
      aliases: Array.from(row.aliases),
      abbreviations: Array.from(row.abbreviations),
    }));
    const seeded = JSON.parse(match[1]);

    expect(seeded).toEqual(expected);
    expect(seeded).toHaveLength(57);
    expect(seeded.every((row) => !row.key.startsWith('custom-'))).toBe(true);
  });

  test('migration preserves production rows and applies least privilege', () => {
    expect(sql).toContain('on conflict (key) do nothing');
    expect(sql).toContain('revoke all on table public.caronas_locations');
    expect(sql).toContain('grant select on public.caronas_locations to anon, authenticated');
    expect(sql).toContain('idx_kc_unit_meta_updated_by');
    expect(sql).toContain('public.kc_is_admin((select auth.uid()))');
    expect(sql).toContain('security invoker');
  });
});
