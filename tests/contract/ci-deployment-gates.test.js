'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const essential = read('.github/workflows/essential-validation.yml');
const edgeDeploy = read('.github/workflows/edge-deploy.yml');
const privacyDeployScript = read('scripts/deploy-supabase-lgpd.ps1');
const privacySchemaContract = read('scripts/verify-privacy-schema.sql');
const emailCheck = read('.github/workflows/email-check.yml');
const lighthouse = read('.github/workflows/lighthouse-ci.yml');
const supabaseConfig = read('supabase/config.toml');
const dispatchFunction = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');
const inviteFunction = read('supabase/functions/kc-invite-user/index.ts');
const retentionFunction = read('supabase/functions/kc-data-export-retention/index.ts');
const privacyHelpGuestFunction = read(
  'supabase/functions/kc-create-privacy-help-guest/index.ts'
);
const caduFunction = read('supabase/functions/cadu-publish/index.ts');
const caduPublisher = read('services/cadu-ufg-publisher/src/publisher.js');
const baseline = read('supabase/migrations/00000000000001_baseline_v76.sql');
const workflows = [essential, edgeDeploy, emailCheck, lighthouse];

describe('CI and deployment safety contracts', () => {
  test('uses the same Node major configured in the Vercel project', () => {
    expect(packageJson.engines.node).toBe('24.x');
    [essential, emailCheck, lighthouse].forEach((workflow) => {
      expect(workflow).toContain("node-version: '24'");
      expect(workflow).not.toMatch(/node-version:\s*['\"]?20/);
    });
  });

  test('rebuilds and tests the active Supabase migration chain in CI', () => {
    expect(essential).toContain('database-contracts:');
    expect(essential).toContain('version: 2.105.0');
    expect(essential).toContain('supabase db reset --local --no-seed');
    expect(essential).toContain('supabase db lint --local --level error --fail-on error');
    expect(essential).toContain('supabase test db --local supabase/tests');
    expect(essential).toContain('supabase db query --local');
    expect(essential).toContain('--file scripts/verify-privacy-schema.sql');
    expect(essential).toContain('Privacy schema query parsed locally with');
    expect(essential).toContain('supabase stop --no-backup');
  });

  test('type-checks every Edge Function with its deployment-specific Deno config', () => {
    expect(essential).toContain('edge-functions:');
    expect(essential).toContain('uses: denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed');
    expect(essential).toContain('deno-version: v2.8.0');
    expect(essential).toContain('entrypoints=(supabase/functions/*/index.ts)');
    expect(essential).toContain('--config "$config"');
    expect(essential).toContain('deno check --no-lock --node-modules-dir=none');
  });

  test('pins every third-party GitHub Action to an immutable commit', () => {
    const uses = workflows.flatMap((workflow) => (
      [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1])
    ));

    expect(uses.length).toBeGreaterThanOrEqual(14);
    uses.forEach((action) => expect(action).toMatch(/^[^@]+@[0-9a-f]{40}$/));
  });

  test('deploys Edge Functions only after a successful validated base push', () => {
    expect(edgeDeploy).toContain('workflow_run:');
    expect(edgeDeploy).toContain('workflows: [Essential Validation]');
    expect(edgeDeploy).toContain("github.event.workflow_run.event == 'push'");
    expect(edgeDeploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(edgeDeploy).toContain('github.event.workflow_run.head_sha');
    expect(edgeDeploy).not.toMatch(/^\s{2}push:/m);
    expect(edgeDeploy).not.toContain('workflow_dispatch:');
  });

  test('rebuilds the complete function set and serializes production rollouts', () => {
    expect(edgeDeploy).toContain('CHANGED=$(list_all_functions | paste -sd, -)');
    expect(edgeDeploy).toContain('cannot strand older function changes undeployed');
    expect(edgeDeploy).not.toContain('git diff --name-only "${HEAD_SHA}^" "$HEAD_SHA"');
    expect(edgeDeploy).toContain('group: kino-campus-production-edge-deploy');
    expect(edgeDeploy).toContain('cancel-in-progress: false');
    expect(edgeDeploy).toContain('environment: production');
    expect(edgeDeploy).toContain('max-parallel: 3');
    expect(edgeDeploy).toContain('version: 2.105.0');
    expect(edgeDeploy).not.toContain('version: latest');
    expect(edgeDeploy).not.toMatch(/supabase link[^\n]*\|\|\s*true/);
  });

  test('versions the internal-auth mode of Edge Functions that bypass gateway JWT checks', () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-dispatch-notification-outbox\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-invite-user\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-data-export-retention\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-create-privacy-help-guest\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig.match(/verify_jwt\s*=\s*false/g)).toHaveLength(4);

    expect(baseline).toContain("'x-kc-dispatch-secret', v_dispatch_secret");
    expect(dispatchFunction).toContain('req.headers.get("x-kc-dispatch-secret")');
    expect(dispatchFunction).toContain('timingSafeEqual(providedSecret, secret)');
    expect(retentionFunction).toContain(
      'request.headers.get("x-kc-signature")'
    );
    expect(retentionFunction).toContain(
      'constantTimeEqual(suppliedSignature, expectedSignature)'
    );
    expect(retentionFunction).not.toContain('"x-kc-retention-secret"');
    expect(inviteFunction).toContain('userClient.auth.getUser()');
    expect(inviteFunction).toContain('.select("is_admin, display_name")');
    expect(inviteFunction).toContain('safeErrorCode');
    expect(inviteFunction).not.toContain('JSON.stringify(linkData)');
    expect(inviteFunction).not.toContain(
      'error: `Falha ao gerar link de convite: ${linkError.message}`'
    );
    expect(privacyHelpGuestFunction).toContain(
      'KC_TURNSTILE_SECRET_KEY'
    );
    expect(privacyHelpGuestFunction).toContain(
      '"kc_create_privacy_help_guest_v1"'
    );
  });

  test('deploys the validated function configuration and rejects remote auth drift', () => {
    expect(edgeDeploy).toContain('import tomllib');
    expect(edgeDeploy).toContain('EXPECTED_VERIFY_JWT');
    expect(edgeDeploy).toContain('ACTUAL_VERIFY_JWT');
    expect(edgeDeploy).toContain('JWT verification drift');
    expect(edgeDeploy).toContain('curl --fail-with-body --retry 3 --retry-all-errors');
    expect(edgeDeploy).not.toContain('|| echo "?"');
  });

  test('gates every Edge deploy once on the canonical privacy schema and secrets', () => {
    const guardedFunctions = [
      'cadu-publish',
      'kc-account-erasure',
      'kc-analytics-subject-id',
      'kc-create-privacy-help-guest',
      'kc-data-subject-request',
      'kc-data-export-admin',
      'kc-data-export-retention',
      'kc-external-access-decide',
      'kc-ga4-reports',
      'kc-help-request-notify',
      'kc-invite-user',
      'kc-search-console-reports',
    ];

    guardedFunctions.forEach((functionName) => {
      expect(privacyDeployScript).toContain(`"${functionName}"`);
    });

    expect(edgeDeploy).toContain('preflight:');
    expect(edgeDeploy).toContain('needs: [detect-changes, preflight]');
    expect(edgeDeploy).toContain('test -s scripts/verify-privacy-schema.sql');
    expect(edgeDeploy).toContain('Required migration history is present.');
    expect(edgeDeploy).toContain('"20260729003000"');
    expect(privacyDeployScript).toContain('"20260729003000"');
    [
      '20260729005000',
      '20260729006000',
      '20260729007000',
      '20260729008000',
      '20260729009000',
      '20260729011000',
      '20260729012000',
      '20260729172316',
      '20260729190653',
      '20260729203000',
      '20260731193000',
    ].forEach((migrationVersion) => {
      expect(edgeDeploy).toContain(`"${migrationVersion}"`);
      expect(privacyDeployScript).toContain(`"${migrationVersion}"`);
    });
    expect(edgeDeploy.indexOf('"20260729005000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729006000"')
    );
    expect(edgeDeploy.indexOf('"20260729006000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729007000"')
    );
    expect(edgeDeploy.indexOf('"20260729007000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729008000"')
    );
    expect(edgeDeploy.indexOf('"20260729008000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729009000"')
    );
    expect(edgeDeploy.indexOf('"20260729009000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729011000"')
    );
    expect(edgeDeploy.indexOf('"20260729011000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729012000"')
    );
    expect(edgeDeploy.indexOf('"20260729012000"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729172316"')
    );
    expect(edgeDeploy.indexOf('"20260729172316"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729190653"')
    );
    expect(edgeDeploy.indexOf('"20260729190653"')).toBeLessThan(
      edgeDeploy.indexOf('"20260729203000"')
    );
    expect(privacyDeployScript.indexOf('"20260729011000"')).toBeLessThan(
      privacyDeployScript.indexOf('"20260729012000"')
    );
    expect(privacyDeployScript.indexOf('"20260729012000"')).toBeLessThan(
      privacyDeployScript.indexOf('"20260729172316"')
    );
    expect(privacyDeployScript.indexOf('"20260729172316"')).toBeLessThan(
      privacyDeployScript.indexOf('"20260729190653"')
    );
    expect(privacyDeployScript.indexOf('"20260729190653"')).toBeLessThan(
      privacyDeployScript.indexOf('"20260729203000"')
    );
    expect(edgeDeploy).toContain('missing = sorted(required - present)');
    expect(edgeDeploy).toContain('str(row["version"])');
    expect(edgeDeploy).not.toContain('serialized = json.dumps');
    expect(edgeDeploy).not.toContain('version not in serialized');
    expect(edgeDeploy).toContain('QUERY_FILE="$(mktemp)"');
    expect(edgeDeploy).toContain('begin transaction read only;');
    expect(edgeDeploy).toContain('supabase db query --linked');
    expect(edgeDeploy).toContain('--file "$QUERY_FILE"');
    expect(edgeDeploy).not.toContain('database/query/read-only');
    expect(edgeDeploy).not.toContain('--data "$REQUEST_BODY"');
    expect(edgeDeploy).not.toContain('QUERY=$(python3');
    expect(edgeDeploy).not.toContain('REQUEST_BODY=$(QUERY=');
    expect(edgeDeploy).toContain('if: ${{ !cancelled() }}');
    expect(edgeDeploy).toContain('Required secret names are present; values were not read.');
    [
      'account_erasure_completion_outbox',
      'account_erasure_ticket_identity_links',
      'help_request_notification_claims',
      'help_privacy_submission_idempotency',
      'help_privacy_recovery_rate_buckets',
      'help_privacy_guest_rate_buckets',
      'kc_privacy_help_metadata_v1',
      'kc_account_erasure_capabilities',
      'erasure_capabilities_v5',
      'durable_subject_closure',
      'renewable_operation_lease',
      'admin_session_bound_claims',
      'atomic_workflow_upsert',
      'kc_active_session_write_guard',
      'kc_active_session_restrictive',
      'kc_enforce_active_session_pre_request',
      'kc_chat_set_conversation_archived',
      'kc_chat_legacy_archive_update_guard',
      'storage_chat_media_select_participant',
      'storage_kino_chat_media_select_participant',
      'kino-chat-media',
      'kino-data-exports',
    ].forEach((prerequisite) => expect(privacySchemaContract).toContain(prerequisite));
    expect(privacySchemaContract).toContain('pg_catalog.pg_get_functiondef');
    expect(privacySchemaContract).toContain(
      'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
    );
    expect(privacySchemaContract).toContain('help_request_expected_auth_state_bound');
    expect(privacySchemaContract).toContain(
      'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,uuid,text,text,timestamptz,jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_claim_data_export_artifact(text,bigint,uuid,uuid,integer)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_authorize_data_export_artifact_upload(text,bigint,text,integer)'
    );
    [
      'account_erasure_browser_acl_revoked',
      'account_erasure_identity_binder_safe',
      'anonymous_erasure_help_bridge_safe',
      'terminal_dsr_idempotency_replay',
      'privacy_help_idempotency_schema_safe',
      'privacy_help_idempotency_fk_indexes',
      'privacy_help_idempotency_rpc_safe',
      'privacy_help_guest_gateway_bridge_safe',
      'privacy_help_guest_gateway_acl_phase_safe',
      'privacy_help_idempotency_retention_safe',
      'postgrest_active_session_barrier_strict',
      'session_bound_data_export_admin_rpcs',
      'legacy_data_export_admin_compatibility_guarded',
      'private_data_export_workers_closed',
      'data_export_continuation_session_guards',
      'hardened_data_export_delivery',
      'verified_help_ticket_canonical_reuse',
      'legacy_chat_archive_update_guarded',
      'chat_media_expand_compatibility_policies',
      'data_subject_request_retention_schedule_configured',
      'account_erasure_outbox_schedule_configured',
      'help_notification_retention_schedule_configured',
    ].forEach((capability) => {
      expect(privacySchemaContract).toContain(`as ${capability}`);
    });
    expect(privacySchemaContract).toContain(
      'kc_private.kc_resolve_legacy_data_export_admin_session(uuid)'
    );
    expect(privacySchemaContract).toContain(
      'kc_private.kc_bind_or_assert_data_export_claim_session(text,bigint,text)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_create_privacy_help_request_v1(jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_create_privacy_help_guest_v1(jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'public.kc_recover_privacy_help_request_v1(jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'privacy_help_guest_gateway_acl_phase_safe below'
    );
    expect(privacySchemaContract).toContain(
      'kc_private.kc_assert_current_authenticated_session_active()'
    );
    [
      'from auth.users user_row',
      'join auth.sessions session_row',
      'coalesce(user_row.is_anonymous, false) is false',
      'user_row.deleted_at is null',
      'session_row.id = v_session_id::uuid',
      'session_row.not_after > pg_catalog.clock_timestamp()',
      'for share of user_row, session_row',
    ].forEach((sessionGuard) => {
      expect(privacySchemaContract).toContain(sessionGuard);
    });
    expect(privacySchemaContract).toContain(
      'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
    );
    expect(privacySchemaContract).toContain(
      'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED'
    );
    expect(privacySchemaContract).toContain(
      'kc_drop_privacy_help_replay_after_redaction'
    );
    expect(privacySchemaContract).toContain('CONTRACT DEFERRED:');
    expect(privacySchemaContract).toContain('abandonment-only');
    [
      'kc-dsr-retention-purge-daily',
      'kc-erasure-completion-outbox-purge-hourly',
      'kc-help-notification-claim-purge-daily',
    ].forEach((jobName) => expect(privacySchemaContract).toContain(jobName));
    expect(privacySchemaContract).toContain('pg_catalog.query_to_xml');
    expect(privacySchemaContract).not.toContain(
      'as direct_chat_conversation_update_denied'
    );
    expect(privacySchemaContract).toContain('has_any_column_privilege');
    expect(privacySchemaContract).toContain('vault.decrypted_secrets');
    expect(privacySchemaContract).toContain('__KC_EXPECTED_PROJECT_REF__');
    expect(edgeDeploy).toContain('/postgrest');
    expect(edgeDeploy).toContain('forbidden = {"net", "vault"}');
    expect(edgeDeploy).toContain(
      'query.replace(placeholder, os.environ["PROJECT_REF"])'
    );
    expect(privacySchemaContract).not.toContain(
      "public.kc_account_erasure_capabilities() ->> 'version'"
    );
    [
      'KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64',
      'KC_NOTIFY_HMAC_SECRET',
      'KC_DATA_EXPORT_RETENTION_SECRET',
      'ADMIN_REPORTS_WEBHOOK_URL',
      'KC_PRIVACY_HELP_ALLOWED_ORIGINS',
      'KC_TURNSTILE_ENVIRONMENT',
      'KC_TURNSTILE_EXPECTED_HOSTNAMES',
      'KC_TURNSTILE_SECRET_KEY',
    ].forEach((secretName) => expect(edgeDeploy).toContain(secretName));
  });

  test('keeps the manual privacy rollout validator non-mutating by default', () => {
    expect(privacyDeployScript).toContain('[switch]$DeployFunctions');
    expect(privacyDeployScript).toContain('$SupabaseCliPackage = "supabase@2.105.0"');
    expect(privacyDeployScript).not.toContain('$SupabaseCliPackage db push');
    expect(privacyDeployScript).not.toContain('migration repair');
    expect(privacyDeployScript).not.toContain('--include-all');
    expect(privacyDeployScript).toContain('supabase/.temp/project-ref');
    expect(privacyDeployScript).toContain('$linkedProjectRef -ne $ProjectRef');
    expect(privacyDeployScript).toContain('--config $denoConfig');
    expect(privacyDeployScript).toContain('$RequiredSecretsByFunction');
    expect(privacyDeployScript).toContain('Get-MigrationVersionSet');
    expect(privacyDeployScript).toContain(
      '$remoteMigrationVersions -cnotcontains $_'
    );
    expect(privacyDeployScript).not.toContain('$historyJson');
    expect(privacyDeployScript).toContain(
      '$schemaQuery.Replace($projectRefPlaceholder, $ProjectRef)'
    );
    expect(privacyDeployScript).toContain('begin transaction read only;');
    expect(privacyDeployScript).toContain('$SupabaseCliPackage db query');
    expect(privacyDeployScript).toContain('--file $queryPath');
    expect(privacyDeployScript).toContain('[System.IO.File]::Delete($queryPath)');
    expect(privacyDeployScript).not.toContain('database/query/read-only');
    expect(privacyDeployScript).toContain(
      '-Path "/v1/projects/$ProjectRef/postgrest"'
    );
    [
      'KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64',
      'KC_SMTP_USER',
      'KC_SMTP_PASS',
      'KC_ANALYTICS_ID_SECRET',
      'KC_DATA_EXPORT_RETENTION_SECRET',
      'KC_GA4_SA_KEY',
      'KC_GA4_PROPERTY_ID',
      'KC_SEARCH_CONSOLE_SA_KEY',
      'KC_SEARCH_CONSOLE_SITE_URL',
      'KC_PRIVACY_HELP_ALLOWED_ORIGINS',
      'KC_TURNSTILE_ENVIRONMENT',
      'KC_TURNSTILE_EXPECTED_HOSTNAMES',
      'KC_TURNSTILE_SECRET_KEY',
    ].forEach((secretName) => expect(privacyDeployScript).toContain(secretName));
    expect(privacyDeployScript).not.toContain('--output json 2>&1');
    expect(privacyDeployScript).toContain('if (-not $DeployFunctions)');
    expect(privacyDeployScript).toContain(
      'Nenhuma funcao foi publicada. Use -DeployFunctions somente depois'
    );
    expect(privacyDeployScript).not.toContain('_archive-v75');
    expect(privacyDeployScript).not.toMatch(
      /\/database\/query(?!\/read-only)/
    );
    expect(privacyDeployScript).toContain('scripts/verify-privacy-schema.sql');
    expect(privacySchemaContract).toContain('pg_catalog.pg_get_functiondef');
    expect(privacySchemaContract).not.toContain(
      "public.kc_account_erasure_capabilities() ->> 'version'"
    );
    expect(
      privacyDeployScript.indexOf('if (-not $DeployFunctions)')
    ).toBeLessThan(
      privacyDeployScript.indexOf(
        '& npx --yes $SupabaseCliPackage functions deploy'
      )
    );
  });

  test('keeps gateway JWT enabled by default for the authenticated Cadu publisher', () => {
    expect(supabaseConfig).not.toMatch(
      /\[functions\.cadu-publish\]\s*verify_jwt\s*=\s*false/
    );
    expect(caduPublisher).toContain('authorization: `Bearer ${token || this.session.access_token}`');
    expect(caduFunction).toContain('userClient.auth.getUser()');
    expect(caduFunction).toContain('.from("kc_trusted_publishers")');
  });
});
