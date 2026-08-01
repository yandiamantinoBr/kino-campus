const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const edge = read('supabase/functions/kc-data-export-retention/index.ts');
const config = read('supabase/config.toml');
const migration = read(
  'supabase/migrations/20260729003000_data_export_retention_automation.sql',
);
const preflight = read('scripts/verify-privacy-schema.sql');
const runtimePreflight = read(
  'scripts/verify-data-export-retention-runtime.sql',
);
const runtimeConfiguration = read(
  'scripts/configure-supabase-privacy-runtime.ps1',
);

describe('data export retention worker', () => {
  test('uses a dedicated constant-time machine secret without exposing service role', () => {
    expect(config).toMatch(
      /\[functions\.kc-data-export-retention\]\s*verify_jwt\s*=\s*false/,
    );
    expect(edge).toContain('KC_DATA_EXPORT_RETENTION_SECRET');
    expect(edge).toContain('function constantTimeEqual(');
    expect(edge).toContain('"x-kc-signature"');
    expect(edge).toContain('"x-kc-timestamp"');
    expect(edge).toContain('"x-kc-nonce"');
    expect(edge).toContain('hmacSha256Hex(');
    expect(edge).not.toContain('"x-kc-retention-secret"');
    expect(edge).not.toMatch(/console\.(?:log|warn|error)\([^)]*(?:expectedSecret|serviceKey)/);
    expect(edge).not.toContain('SUPABASE_SERVICE_ROLE_KEY:');
  });

  test('removes Storage first, retries, and finalizes metadata with CAS', () => {
    const removeAt = edge.indexOf('await removeObjectWithRetry(');
    const finalizeAt = edge.indexOf(
      '"kc_purge_data_export_artifact"',
      removeAt,
    );
    expect(removeAt).toBeGreaterThan(0);
    expect(finalizeAt).toBeGreaterThan(removeAt);
    expect(edge).toContain('MAX_REMOVE_ATTEMPTS = 3');
    expect(edge).toContain('p_expected_version: version');
    expect(edge).toContain('"kc_claim_expired_data_export_artifacts"');
    expect(edge).toContain('"kc_begin_data_export_retention_run"');
    expect(edge).toContain('"kc_finish_data_export_retention_run"');
    expect(edge).toContain('metadata_retained_for_retry');
    expect(edge).toContain('p_request_nonce: nonce');
    expect(edge).toContain('replay_ignored: true');
  });

  test('recovers stale upload claims independent of cancellation and keeps active requests rebuildable', () => {
    expect(migration).toMatch(
      /artifact_row\.status = 'claimed'\s+and artifact_row\.claim_expires_at <= now\(\)/,
    );
    expect(migration).toContain("'EXPORT_STALE_CLAIM_CLEANUP'");
    expect(migration).toContain("'EXPORT_STALE_CLAIM_REBUILD_REQUIRED'");
    expect(migration).toContain(
      'and artifact_row.row_version = v_candidate.row_version',
    );
    expect(migration).toContain(
      "and artifact_row.last_error_code = 'EXPORT_STALE_CLAIM_CLEANUP'",
    );
    expect(migration).toContain("'rebuild_after_cleanup'");
  });

  test('versions cron, Vault configuration, watchdog alerts, and strict preflights', () => {
    expect(migration).toContain("'kc-data-export-retention-purge'");
    expect(migration).toContain("'kc-data-export-retention-monitor'");
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).toContain(
      "'kc_data_export_retention_project_ref'",
    );
    expect(migration).toContain(
      'kc_data_export_retention_vault_acl_safe',
    );
    expect(migration).toContain(
      'EXPORT_RETENTION_VAULT_ACL_UNSAFE',
    );
    expect(migration).toContain(
      "'kc:data-export-retention-alert:' || v_code",
    );
    expect(migration).toContain('v_audit_entity_id');
    expect(migration).toContain(
      '.supabase.co/functions/v1/kc-data-export-retention',
    );
    expect(migration).toContain("'x-kc-signature'");
    expect(migration).toContain('extensions.hmac(');
    expect(migration).toContain('on conflict (request_nonce) do nothing');
    expect(migration).not.toContain("'x-kc-retention-secret'");
    expect(migration).toContain('kc_monitor_data_export_retention');
    expect(migration).toContain('data_export_retention_alerts');
    expect(preflight).toContain(
      'kc_data_export_retention_configuration_status',
    );
    expect(preflight).toContain('data_export_retention_rpc_acl');
    expect(preflight).toContain('file_size_limit = 16777216');
    expect(preflight).toContain(
      "allowed_mime_types = array['application/json']::text[]",
    );
    expect(preflight).toContain(
      'storage_data_exports_deny_browser_access',
    );
    expect(preflight).toContain('vault.decrypted_secrets');
    expect(preflight).toContain('__KC_EXPECTED_PROJECT_REF__');
    expect(runtimePreflight).toContain('recent_success_recorded');
    expect(runtimePreflight).toContain('__KC_EXPECTED_PROJECT_REF__');
    expect(runtimePreflight).toContain('no_active_retention_alert');
  });

  test('initializes privacy runtime idempotently without logging secret values', () => {
    expect(runtimeConfiguration).toContain(
      '[Collections.Generic.HashSet[string]]::new(',
    );
    expect(runtimeConfiguration).toContain(
      'Outbox encryption already configured; key rotation skipped.',
    );
    expect(runtimeConfiguration).toContain(
      'throw "outbox_edge_configuration_is_partial"',
    );
    expect(runtimeConfiguration).toContain(
      'Retention secret already configured; rotation skipped.',
    );
    expect(runtimeConfiguration).toContain(
      "raise exception 'retention_vault_configuration_is_partial'",
    );
    expect(runtimeConfiguration).toContain(
      'KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64',
    );
    expect(runtimeConfiguration).toContain(
      'KC_DATA_EXPORT_RETENTION_SECRET',
    );
    expect(runtimeConfiguration).toContain(
      'https://api.supabase.com/v1/projects/$ProjectRef/database/query',
    );
    expect(runtimeConfiguration).not.toMatch(
      /Write-(?:Host|Output)[^\n]*(?:\$outboxKey|\$retentionSecret)/,
    );
  });
});
