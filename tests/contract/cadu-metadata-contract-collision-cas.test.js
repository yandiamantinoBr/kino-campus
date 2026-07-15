'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const collisionMigration = read(
  'supabase/migrations/20260714193000_cadu_source_override_collision_cas.sql',
);
const contractMigration = read(
  'supabase/migrations/20260714224000_cadu_metadata_contract_collision_cas.sql',
);
const legacyUpgradeProof = read('scripts/test-cadu-phase-a-legacy-upgrade.js');
const postgrestProof = read('scripts/test-cadu-phase-a-postgrest.js');

function normalizedBodyMd5(sql) {
  const match = sql.match(
    /create or replace function public\.kc_cadu_upsert_source_override\([\s\S]*?as \$\$([\s\S]*?)\$\$;/i,
  );
  if (!match) throw new Error('Unable to extract the stable override RPC body.');
  return crypto
    .createHash('md5')
    .update(match[1].replace(/\r\n?/g, '\n'))
    .digest('hex');
}

describe('Cadu collision-aware metadata readiness reconciliation', () => {
  test('pins the exact reviewed collision-aware RPC body across migrations', () => {
    const bodyHash = normalizedBodyMd5(collisionMigration);
    expect(bodyHash).toBe('0b786e3dc708c2388fe5987c8c007753');
    expect(contractMigration).toContain(
      "v_new_literal constant text := '0b786e3dc708c2388fe5987c8c007753'",
    );
    expect(contractMigration).toContain(
      "v_old_literal constant text := '7326c723f5eba96059ed69c959d2c4a8'",
    );
    expect(contractMigration).toContain(
      "v_migrated_probe_hash constant text := '21d2a9c82cbc45968c58598ff28406ee'",
    );
  });

  test('fails closed on drift and restores the least-privilege probe boundary', () => {
    const normalized = contractMigration.replace(/\s+/g, ' ').toLowerCase();
    expect(normalized).toContain("set local lock_timeout = '5s'");
    expect(normalized).toContain("set local statement_timeout = '60s'");
    expect(normalized).toContain('set local search_path = pg_catalog');
    expect(normalized).toContain("procedure_row.provolatile = 's'");
    expect(normalized).toContain("language_row.lanname = 'sql'");
    expect(normalized).toContain("procedure_row.proconfig = array['search_path=\"\"']");
    expect(normalized).toContain("named_function.proname = 'kc_cadu_metadata_contract'");
    expect(normalized).toContain('cadu_metadata_contract_unexpected_probe');
    expect(normalized).toContain('cadu_metadata_contract_hash_literal_ambiguous');
    expect(normalized).toContain(
      'revoke all on function public.kc_cadu_metadata_contract() from public, anon, authenticated, service_role',
    );
    expect(normalized).toContain(
      'grant execute on function public.kc_cadu_metadata_contract() to service_role',
    );
    expect(normalized).toContain('cadu_metadata_contract_not_ready_after_reconciliation');
  });

  test('exercises the new migration twice and sends a real revision snapshot', () => {
    expect(
      legacyUpgradeProof.match(
        /20260714224000_cadu_metadata_contract_collision_cas\.sql/g,
      ),
    ).toHaveLength(2);
    expect(postgrestProof).toContain(
      'p_expected_meta_revisions: revisionSnapshot',
    );
    expect(postgrestProof).not.toContain(
      'p_expected_meta_revisions: null',
    );
  });
});
