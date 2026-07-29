const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const EDGE = read('supabase/functions/kc-data-subject-request/index.ts');
const MIGRATION = read(
  'supabase/migrations/20260728183022_data_subject_requests_and_export.sql',
);
const SUPPLEMENT_MIGRATION = read(
  'supabase/migrations/20260728220000_data_export_supplement_workflow.sql',
);
const DELIVERY_HARDENING_MIGRATION = read(
  'supabase/migrations/20260729008000_harden_data_export_delivery.sql',
);
const ERASURE_CLOSURE_MIGRATION = read(
  'supabase/migrations/20260729004000_close_erasure_races_and_renew_leases.sql',
);
const ADMIN_EDGE = read('supabase/functions/kc-data-export-admin/index.ts');
const PROCESSORS = read('supabase/functions/_shared/data-processors.ts');
const ACTIVE_SESSION = read('supabase/functions/_shared/active-session.ts');
const SUPPLEMENT_MEDIA_SIGNING = read(
  'supabase/functions/_shared/supplement-media-signing.ts',
);
const CONFIG = read('supabase/config.toml');
const SUPABASE_ADAPTER = read(
  'assets/js/adapters/supabase/supabase.admin.adapter.js',
);
const LOCAL_ADAPTER = read('assets/js/adapters/local/local.help.adapter.js');
const HELP_API = read('assets/js/api/kc-api.help.js');
const HELP_CONTROLLER = read('assets/js/controllers/public/help.controller.js');
const SETTINGS_CONTROLLER = read(
  'assets/js/controllers/public/settings.controller.js',
);

describe('authenticated data-subject request backend', () => {
  test('requires platform JWT verification and revalidates user plus live session', () => {
    expect(CONFIG).toMatch(
      /\[functions\.kc-data-subject-request\][\s\S]*?verify_jwt\s*=\s*true/,
    );
    expect(EDGE).toContain('userClient.auth.getUser');
    expect(EDGE).toContain('isCurrentSessionActive');
    expect(ACTIVE_SESSION).toContain('"kc_is_current_session_active"');
    expect(EDGE).toContain('"SESSION_NOT_ACTIVE"');
    expect(EDGE).toContain('body.expected_user_id');
    expect(EDGE).toContain('"ACCOUNT_CHANGED"');
    expect(EDGE).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  test('binds browser mutations to the account captured before the request starts', () => {
    expect(SETTINGS_CONTROLLER).toContain('expected_user_id: userId');
    expect(SUPABASE_ADAPTER).toContain(
      'payload.expected_user_id || payload.user_id',
    );
    expect(SUPABASE_ADAPTER).toContain("code: 'ACCOUNT_CHANGED'");
    expect(SUPABASE_ADAPTER).toContain(
      "expected_user_id: String(input.expected_user_id || '').trim()",
    );
    expect(SUPPLEMENT_MIGRATION).toContain("p_payload ->> 'expected_user_id'");
    expect(SUPPLEMENT_MIGRATION).toContain("message = 'AUTH_ACCOUNT_CHANGED'");
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.listDataSubjectRequests({\n        limit: requestedLimit,\n        expected_user_id: userId,',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.getDataSubjectRequest(request.protocol, {\n            expected_user_id: userId,',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.downloadDataSubjectExport(protocol, {\n        expected_user_id: userId,',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.downloadDataSubjectSupplement(protocol, artifactRef, {\n        expected_user_id: userId,',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.cancelDataSubjectRequest(protocol, {\n        expected_user_id: userId,',
    );
    expect(SUPABASE_ADAPTER).toContain(
      "async function getDataSubjectRequest(protocol, options = {})",
    );
    expect(SUPABASE_ADAPTER).toContain(
      "async function downloadDataSubjectSupplement(protocol, artifactRef, options = {})",
    );
  });

  test('uses atomic RPCs and accurately distinguishes direct from temporary supplement storage', () => {
    expect(EDGE).toContain('"kc_create_data_subject_request_v2"');
    expect(EDGE).toContain('"kc_transition_data_subject_request"');
    expect(EDGE).toContain('"kc_reserve_data_subject_download"');
    expect(EDGE).not.toMatch(/\.from\("data_subject_requests"\)\s*\.update\(/);
    expect(SUPPLEMENT_MIGRATION).toContain("'kino-data-exports'");
    expect(EDGE).toContain(
      'O pacote JSON direto e gerado sob demanda e nao e persistido',
    );
    expect(EDGE).toContain(
      'O complemento JSON e armazenado temporariamente em bucket privado',
    );
  });

  test('renews an expired canonical ready window on the first retry and maps closure safely', () => {
    expect(ERASURE_CLOSURE_MIGRATION).toContain("v_existing.status = 'ready'");
    expect(ERASURE_CLOSURE_MIGRATION).toContain(
      "expires_at = v_now + interval '15 minutes'",
    );
    expect(ERASURE_CLOSURE_MIGRATION).toContain("'_ready_window_renewed'");
    expect(ERASURE_CLOSURE_MIGRATION).toContain(
      'kc_create_data_subject_request_v2_20260728_base',
    );
    expect(EDGE).toContain(
      'message.includes("PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING")',
    );
    expect(EDGE).toContain('code: "ACCOUNT_ERASURE_IN_PROGRESS"');
    expect(EDGE).toContain('status: 409');
  });

  test('uses opaque per-export references and random non-derivable receipt tokens', () => {
    expect(EDGE).toContain(
      '`${kind}-${String(references.size + 1).padStart(4, "0")}`',
    );
    expect(EDGE).toContain(
      'raw_source_identifiers_embedded_in_references: false',
    );
    expect(EDGE).not.toMatch(/localRef[\s\S]{0,120}sha256Hex/);
    expect(MIGRATION).toContain(
      "encode(extensions.gen_random_bytes(32), 'hex')",
    );
    expect(MIGRATION).not.toContain(
      "extensions.digest(convert_to(v_uid::text, 'UTF8'), 'sha256')",
    );
  });

  test('allowlists user-facing auth and post metadata and blocks camelCase secrets', () => {
    expect(EDGE).toContain('AUTH_USER_METADATA_ALLOWLIST');
    expect(EDGE).toContain('POST_METADATA_ALLOWLIST');
    expect(EDGE).toContain('sanitizeAllowedObject(');
    expect(EDGE).toContain('.replace(/([a-z0-9])([A-Z])/g, "$1_$2")');

    const authAllowlist = EDGE.slice(
      EDGE.indexOf('const AUTH_USER_METADATA_ALLOWLIST'),
      EDGE.indexOf('const POST_METADATA_ALLOWLIST'),
    );
    const postAllowlist = EDGE.slice(
      EDGE.indexOf('const POST_METADATA_ALLOWLIST'),
      EDGE.indexOf('const OPTIONAL_SCHEMA_ERROR_CODES'),
    );
    for (const forbidden of [
      'admin_note',
      'invite_note',
      'external_access_request_id',
      'invited_by_admin_id',
    ]) {
      expect(authAllowlist).not.toContain(`"${forbidden}"`);
    }
    for (const forbidden of [
      'action_evidence',
      'action_fingerprints',
      'closed_by',
      'deleted_by',
      'hidden_by_audit',
      'reactivated_by',
    ]) {
      expect(postAllowlist).not.toContain(`"${forbidden}"`);
    }
    for (const canary of ['accessToken', 'credential', 'jwt', 'otp']) {
      const normalized = canary
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();
      expect(normalized).toMatch(/access_token|credential|jwt|otp/);
    }
  });

  test('bounds source allocation before final serialization', () => {
    expect(EDGE).toContain('MAX_EXPORT_SOURCE_ROWS');
    expect(EDGE).toContain('MAX_EXPORT_SOURCE_BYTES');
    expect(EDGE).toContain(
      'budget.sourceBytes + encoded > budget.maximumSourceBytes',
    );
    expect(EDGE).toContain('budget.sourceRows + 1 > budget.maximumSourceRows');
    expect(EDGE).toContain('budget.exhausted = true');
    expect(EDGE).toContain('source_budget_exhausted: exportBudget.exhausted');
    expect(EDGE).toContain('MAX_EXPORT_BYTES');
    expect(EDGE).toContain('"EXPORT_TOO_LARGE"');
    expect(EDGE).toContain(
      'const MAX_SUPPLEMENT_SOURCE_BYTES = 12 * 1024 * 1024',
    );
    expect(EDGE).toContain(
      'const MAX_SUPPLEMENT_ARTIFACT_BYTES = 16 * 1024 * 1024',
    );
    expect(ADMIN_EDGE).toContain('const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024');
    expect(SUPPLEMENT_MIGRATION).toContain('16777216');
    expect(SUPPLEMENT_MIGRATION).not.toContain('52428800');
  });

  test('rejects oversized stored supplements before allocating an ArrayBuffer', () => {
    const supplementAt = EDGE.indexOf('if (action === "download_supplement")');
    const expectedSizeAt = EDGE.indexOf(
      'expectedByteSize > MAX_SUPPLEMENT_ARTIFACT_BYTES',
      supplementAt,
    );
    const blobSizeAt = EDGE.indexOf(
      'objectData.size > MAX_SUPPLEMENT_ARTIFACT_BYTES',
      expectedSizeAt,
    );
    const arrayBufferAt = EDGE.indexOf('objectData.arrayBuffer()', blobSizeAt);

    expect(expectedSizeAt).toBeGreaterThan(supplementAt);
    expect(blobSizeAt).toBeGreaterThan(expectedSizeAt);
    expect(arrayBufferAt).toBeGreaterThan(blobSizeAt);
    expect(EDGE).toContain('"EXPORT_ARTIFACT_SIZE_INVALID"');
    expect(EDGE).toContain('"EXPORT_ARTIFACT_SIZE_MISMATCH"');
  });

  test('delivers owned private chat attachments with short-lived signed URLs', () => {
    expect(EDGE).toContain('const CHAT_MEDIA_SIGNED_URL_MAX_SECONDS = 10 * 60');
    expect(EDGE).toContain('const CHAT_MEDIA_BUCKET = "kino-chat-media"');
    expect(EDGE).toContain('const LEGACY_CHAT_MEDIA_BUCKET = "kino-media"');
    expect(EDGE).toContain('.createSignedUrl(rawPath, expiresIn)');
    expect(EDGE).toContain('rawPath.startsWith(expectedPrefix)');
    expect(EDGE).toContain('validConversationIds.has(conversationId)');
    expect(EDGE).toContain('delivery: "manual_supplement_required"');
    expect(EDGE).toContain('download_expires_at: signedExpiresAt');
    expect(EDGE).not.toMatch(
      /console\.(?:log|warn|error)[\s\S]{0,120}signedUrl/,
    );
  });

  test('caps only media signing and does not cap the authored message query at 100', () => {
    const messageBlock = EDGE.slice(
      EDGE.indexOf('const chatMessages = await loadCategory('),
      EDGE.indexOf('const readStates = await fetchRows('),
    );
    expect(messageBlock).not.toContain('maximumRows: MAX_CHAT_MEDIA_ROWS');
    expect(EDGE).toContain('partitionChatMediaCandidates(');
    expect(EDGE).toContain(
      'signed: mediaCandidates.slice(0, maximumSignedMedia)',
    );
    expect(EDGE).toContain(
      'deferred: mediaCandidates.slice(maximumSignedMedia)',
    );
    expect(EDGE).toContain('"direct_signed_url_limit_reached"');
  });

  test('fails closed before oversized supplement media signing and batches by bucket', () => {
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain(
      'MAX_SUPPLEMENT_MEDIA_REFERENCES = 100',
    );
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain(
      'SUPPLEMENT_MEDIA_SIGNED_URL_SECONDS = 10 * 60',
    );
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain(
      'if (targets.length > MAX_SUPPLEMENT_MEDIA_REFERENCES)',
    );
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain('Promise.all(');
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain(
      '!objectPaths.includes(item.objectPath)',
    );
    expect(SUPPLEMENT_MEDIA_SIGNING).toContain(
      'signedByPath.has(item.objectPath)',
    );
    expect(EDGE).toContain('.createSignedUrls(objectPaths, expiresInSeconds)');
    expect(EDGE).not.toMatch(
      /rehydrateSupplementMediaForDownload[\s\S]*?\.createSignedUrl\(/,
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      'EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED',
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      'v_media_ref_count > 100',
    );
  });

  test('rechecks after build and uses the atomic session transition as the completion gate', () => {
    const buildAt = EDGE.indexOf(
      'const built = await buildDataExport(admin, user, row)',
    );
    const postBuildCheck = EDGE.indexOf(
      'await isCurrentSessionActive(userClient)',
      buildAt,
    );
    const transitionAt = EDGE.indexOf(
      'completedData = await transitionRequestForActiveSession(',
      buildAt,
    );
    const preTransitionCheck = EDGE.lastIndexOf(
      'await isCurrentSessionActive(userClient)',
      transitionAt,
    );
    const responseAt = EDGE.indexOf('return json(', transitionAt);
    const preResponseCheck = EDGE.lastIndexOf(
      'await isCurrentSessionActive(userClient)',
      responseAt,
    );
    expect(postBuildCheck).toBeGreaterThan(buildAt);
    expect(preTransitionCheck).toBeGreaterThan(buildAt);
    expect(preTransitionCheck).toBeLessThan(transitionAt);
    expect(preResponseCheck).toBeGreaterThan(transitionAt);
    expect(EDGE).toContain(
      '(row.status === "completed" || targetStatus === "partial_failure")',
    );
    expect(EDGE).toContain(
      '"kc_transition_data_subject_request_for_active_session"',
    );
  });

  test('validates supplement JSON before the atomic consume and never withholds after completion', () => {
    const supplementAt = EDGE.indexOf('if (action === "download_supplement")');
    const parseAt = EDGE.indexOf(
      'const parsed = JSON.parse(new TextDecoder().decode(objectBytes))',
      supplementAt,
    );
    const integrityAt = EDGE.indexOf(
      'exportIntegrityIsValid(storedExportPayload)',
      parseAt,
    );
    const mediaRefsAt = EDGE.indexOf(
      '"kc_read_data_export_media_refs_for_download"',
      integrityAt,
    );
    const rehydrateAt = EDGE.indexOf(
      'rehydrateSupplementMediaForDownload(',
      mediaRefsAt,
    );
    const consumeAt = EDGE.indexOf(
      '"kc_consume_data_export_artifact_download"',
      supplementAt,
    );
    const postSigningSessionCheck = EDGE.indexOf(
      'if (!(await isCurrentSessionActive(userClient)))',
      rehydrateAt,
    );
    const filenameAt = EDGE.indexOf('kino-campus-dados-completos-', consumeAt);
    const afterConsume = EDGE.slice(consumeAt, filenameAt);

    expect(parseAt).toBeGreaterThan(supplementAt);
    expect(integrityAt).toBeGreaterThan(parseAt);
    expect(mediaRefsAt).toBeGreaterThan(integrityAt);
    expect(rehydrateAt).toBeGreaterThan(mediaRefsAt);
    expect(consumeAt).toBeGreaterThan(parseAt);
    expect(consumeAt).toBeGreaterThan(rehydrateAt);
    expect(postSigningSessionCheck).toBeGreaterThan(rehydrateAt);
    expect(postSigningSessionCheck).toBeLessThan(consumeAt);
    expect(filenameAt).toBeGreaterThan(consumeAt);
    expect(afterConsume).not.toContain('isCurrentSessionActive(userClient)');
  });

  test('uses a private CAS supplement workflow and opaque object paths', () => {
    expect(CONFIG).toMatch(
      /\[functions\.kc-data-export-admin\][\s\S]*?verify_jwt\s*=\s*true/,
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'data_subject_requests_one_open_erasure_per_user_uidx',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      "object_path ~ '^objects/[a-f0-9]{64}[.]json$'",
    );
    expect(SUPPLEMENT_MIGRATION).toContain('kc_claim_data_export_artifact');
    expect(SUPPLEMENT_MIGRATION).toContain('kc_finalize_data_export_artifact');
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_reserve_data_export_artifact_download',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_claim_data_export_artifact_purge',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_claim_expired_data_export_artifacts',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_recover_expired_data_export_artifact',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_claim_data_export_artifacts_for_erasure',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_complete_data_export_artifact_erasure_purge',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_release_data_export_artifact_erasure_purge',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT',
    );
    expect(SUPPLEMENT_MIGRATION).toContain('kc_purge_data_export_artifact');
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_lock_privacy_subject(p_user_id uuid)',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'row_version = artifact_row.row_version + 1',
    );
    expect(ADMIN_EDGE).toContain('buildDataExport(');
    expect(ADMIN_EDGE).toContain('EXPORT_BUILD_PARTIAL');
    expect(ADMIN_EDGE).toContain('"https://www.kinocampus.com.br"');
    expect(ADMIN_EDGE).not.toMatch(
      /console\.error\([^)]*(?:ownerUserId|objectPath|artifactRef)/,
    );
  });

  test('links a verified anonymous help ticket without persisting raw evidence or exposing an account oracle', () => {
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_link_verified_help_request_to_data_export',
    );
    expect(SUPPLEMENT_MIGRATION).toContain('data_export_ticket_identity_links');
    expect(SUPPLEMENT_MIGRATION).toContain(
      'EXPORT_TICKET_IDENTITY_NOT_VERIFIED',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      "'identity_source', 'admin_verified_anonymous_ticket'",
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      'v_artifact := kc_private.kc_enqueue_data_export_artifact',
    );
    expect(ADMIN_EDGE).toContain('action === "link_verified_ticket"');
    expect(ADMIN_EDGE).toContain('"kc-data-export-ticket-link-v1"');
    expect(ADMIN_EDGE).toContain('identityReference');
    expect(ADMIN_EDGE).toContain('attestationSha256');
    expect(ADMIN_EDGE).not.toContain('p_identity_reference');
  });

  test('atomically gives an authenticated privacy form submission a DSR protocol', () => {
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_create_help_request_with_notification_claim_v2',
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      "'authenticated-help:' || replace(out_id::text, '-', '')",
    );
    expect(SUPPLEMENT_MIGRATION).toContain(
      "'identity_source', 'authenticated_account'",
    );
    expect(SUPABASE_ADAPTER).toContain(
      "client.rpc('kc_create_help_request_with_notification_claim_v2'",
    );
    expect(SUPABASE_ADAPTER).toContain('out_data_subject_request');
    expect(SUPABASE_ADAPTER).toContain('out_protocol');
    expect(HELP_CONTROLLER).toContain('Protocolo do titular:');
  });

  test('authorizes immediately before upload and makes erasure wait for an active build lease', () => {
    const authorizeAt = ADMIN_EDGE.indexOf(
      '"kc_authorize_data_export_artifact_upload"',
    );
    const uploadAt = ADMIN_EDGE.indexOf(
      '.upload(objectPath, bytes,',
      authorizeAt,
    );
    expect(authorizeAt).toBeGreaterThan(0);
    expect(uploadAt).toBeGreaterThan(authorizeAt);
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_authorize_data_export_artifact_upload',
    );
    expect(SUPPLEMENT_MIGRATION).toContain('blocked_active_claim_count');
    expect(SUPPLEMENT_MIGRATION).toContain("artifact_row.status = 'claimed'");
    expect(SUPPLEMENT_MIGRATION).toContain(
      'artifact_row.claim_expires_at > now()',
    );
  });

  test('revalidates the administrator session throughout export build and delivery', () => {
    const adminCheckpoint =
      'await assertAdminWorkAuthorized(userClient, actor.id);';
    const storeAt = ADMIN_EDGE.indexOf('"kc_store_data_export_media_refs"');
    const authorizeAt = ADMIN_EDGE.indexOf(
      '"kc_authorize_data_export_artifact_upload"',
      storeAt,
    );
    const uploadAt = ADMIN_EDGE.indexOf(
      '.upload(objectPath, bytes,',
      authorizeAt,
    );
    const uploadCompletedAt = ADMIN_EDGE.indexOf('uploaded = true;', uploadAt);
    const finalizeAt = ADMIN_EDGE.indexOf(
      '"kc_finalize_data_export_artifact"',
      uploadCompletedAt,
    );

    expect(ADMIN_EDGE).toContain(
      'authorizationCheckpoint: buildAuthorizationCheckpoint',
    );
    expect(ADMIN_EDGE).not.toContain('lastBuildAuthorizationCheckAt');
    expect(ADMIN_EDGE).not.toContain('BUILD_AUTHORIZATION_CHECK_INTERVAL');

    const preStoreAt = ADMIN_EDGE.lastIndexOf(adminCheckpoint, storeAt);
    const preAuthorizeAt = ADMIN_EDGE.lastIndexOf(adminCheckpoint, authorizeAt);
    const postAuthorizeAt = ADMIN_EDGE.indexOf(adminCheckpoint, authorizeAt);
    const postUploadAt = ADMIN_EDGE.indexOf(adminCheckpoint, uploadCompletedAt);
    const preFinalizeAt = ADMIN_EDGE.lastIndexOf(adminCheckpoint, finalizeAt);

    expect(storeAt).toBeGreaterThan(0);
    expect(preStoreAt).toBeGreaterThan(
      ADMIN_EDGE.indexOf('const built = await buildDataExport'),
    );
    expect(preStoreAt).toBeLessThan(storeAt);
    expect(preAuthorizeAt).toBeGreaterThan(storeAt);
    expect(preAuthorizeAt).toBeLessThan(authorizeAt);
    expect(postAuthorizeAt).toBeGreaterThan(authorizeAt);
    expect(postAuthorizeAt).toBeLessThan(uploadAt);
    expect(uploadCompletedAt).toBeGreaterThan(uploadAt);
    expect(postUploadAt).toBeGreaterThan(uploadCompletedAt);
    expect(postUploadAt).toBeLessThan(finalizeAt);
    expect(preFinalizeAt).toBeGreaterThan(postUploadAt);
    expect(preFinalizeAt).toBeLessThan(finalizeAt);

    const fetchRowsBody = EDGE.slice(
      EDGE.indexOf('async function fetchRows('),
      EDGE.indexOf('async function countMatchingRows('),
    );
    const queryAt = fetchRowsBody.indexOf(
      'const { data, error } = await query;',
    );
    expect(
      fetchRowsBody.lastIndexOf('await authorizationCheckpoint?.();', queryAt),
    ).toBeGreaterThan(fetchRowsBody.indexOf('while (offset <= maximumRows)'));
    expect(
      fetchRowsBody.indexOf('await authorizationCheckpoint?.();', queryAt),
    ).toBeGreaterThan(queryAt);

    const signedChunksBody = EDGE.slice(
      EDGE.indexOf(
        'for (let index = 0; index < signedMediaCandidates.length; index += 10)',
      ),
      EDGE.indexOf('if (chatMediaDeliveryFailures > 0) partial = true;'),
    );
    const signedChunkQueryAt = signedChunksBody.indexOf(
      'const signedResults = await Promise.all',
    );
    expect(
      signedChunksBody.lastIndexOf(
        'await authorizationCheckpoint?.();',
        signedChunkQueryAt,
      ),
    ).toBeGreaterThan(signedChunksBody.indexOf('const chunk ='));
    expect(
      signedChunksBody.indexOf(
        'await authorizationCheckpoint?.();',
        signedChunkQueryAt,
      ),
    ).toBeGreaterThan(signedChunkQueryAt);

    const administrativeLoopBody = EDGE.slice(
      EDGE.indexOf('for (const check of administrativeChecks)'),
      EDGE.indexOf('const administrativeRelationships = administrativeCounts'),
    );
    const countAt = administrativeLoopBody.indexOf(
      'match_count: await countMatchingRows',
    );
    expect(
      administrativeLoopBody.lastIndexOf(
        'await authorizationCheckpoint?.();',
        countAt,
      ),
    ).toBeGreaterThan(
      administrativeLoopBody.indexOf(
        'for (const check of administrativeChecks)',
      ),
    );
    expect(
      administrativeLoopBody.indexOf(
        'await authorizationCheckpoint?.();',
        countAt,
      ),
    ).toBeGreaterThan(countAt);
  });

  test('allows cancelling a partial supplement and queues its artifact for storage-first purge', () => {
    expect(SUPPLEMENT_MIGRATION).toMatch(
      /v_result\.status in \([\s\S]*?'partial_failure'[\s\S]*?\)/,
    );
    expect(SUPPLEMENT_MIGRATION).toContain("'export_artifact_purge_queued'");
    expect(SUPPLEMENT_MIGRATION).toContain("request_row.status = 'cancelled'");
    expect(SETTINGS_CONTROLLER).toContain(
      "['received', 'processing', 'ready', 'failed', 'partial_failure']",
    );
  });

  test('shares one external processor inventory and blocks pending operators', () => {
    for (const provider of [
      'supabase_backups_logs',
      'vercel_access_runtime_logs',
      'hostinger_smtp_mailbox',
      'resend',
      'twilio',
      'ga4_pseudonymous_user_id',
    ]) {
      expect(PROCESSORS).toContain(`processor: "${provider}"`);
    }
    expect(PROCESSORS).toContain('manual_policy_follow_up');
    expect(SUPPLEMENT_MIGRATION).toContain(
      "task_row.status = 'manual_follow_up'",
    );
    expect(SUPPLEMENT_MIGRATION).toContain('EXPORT_PROCESSORS_PENDING');
    expect(SUPPLEMENT_MIGRATION).toContain("'sanitized_disclosure'");
    expect(SUPPLEMENT_MIGRATION).toContain('EXPORT_PROCESSOR_OUTCOMES_INVALID');
    expect(ADMIN_EDGE).toContain('processorOutcomes');
    expect(ADMIN_EDGE).not.toContain('processorReviewComplete');
  });

  test('never equates external delivery with processor content included in JSON', () => {
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      "'supplied_out_of_band'",
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      'delivery_attested is true',
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      "'content_in_export', task_row.status = 'automated'",
    );
    expect(PROCESSORS).toContain('content_in_export: false');
    expect(PROCESSORS).toContain('delivery_mode: "out_of_band"');
    expect(ADMIN_EDGE).toContain('"PROCESSOR_CONTENT_FORBIDDEN"');
    expect(ADMIN_EDGE).toContain('PROCESSOR_EVIDENCE_INPUT_KEYS');
    expect(ADMIN_EDGE).toContain(
      'containsUnexpectedProcessorEvidenceInput(input)',
    );
    for (const forbidden of [
      '"bundle"',
      '"external_bundle"',
      '"processor_data"',
      '"processor_payload"',
      '"records"',
      '"content"',
    ]) {
      expect(ADMIN_EDGE).toContain(forbidden);
    }
    expect(ADMIN_EDGE).toContain('if (depth > 5) return true;');
    expect(ADMIN_EDGE).toContain('persistedProcessorOutcomes');
  });

  test('keeps delivered supplements downloadable and restores terminal state after abandonment', () => {
    expect(EDGE).toContain(
      '!["ready", "delivered"].includes(asString(artifact.status, 40))',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      "!['ready', 'delivered'].includes(String(supplement.status || ''))",
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'PRIVACY_SUPPLEMENT_DETAIL_STATUSES',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'window.KCAPI.getDataSubjectRequest(request.protocol, {',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'privacyDownloadsInFlight: Object.create(null)',
    );
    expect(SETTINGS_CONTROLLER).toContain(
      'delete downloadsInFlight[protocol]',
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      "download_return_status = 'delivered'",
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      'delivery_count = artifact_row.delivery_count + 1',
    );
    expect(DELIVERY_HARDENING_MIGRATION).toContain(
      'Nova copia do complemento foi entregue',
    );
  });

  test('exports protocol timeline without actor IDs and detects manual admin supplements', () => {
    expect(EDGE).toContain('"data_subject_request_events"');
    expect(EDGE).toContain(
      '"id,request_id,status,event_type,public_message,created_at"',
    );
    expect(EDGE).toContain('omitted_fields: ["actor_user_id", "request_id"]');
    expect(EDGE).toContain('administrative_relationships');
    expect(EDGE).toContain('countMatchingRows');
    expect(EDGE).toContain('"manual_supplement_required"');
    expect(EDGE).toContain('"partial_manual_supplement_required"');
    expect(MIGRATION).toContain("'manual_supplement_required', true");
  });

  test('publishes integrity scope and explicit retention/media disclosures', () => {
    expect(EDGE).toContain(
      'scope: "all_top_level_fields_except_integrity_serialized_as_utf8_json"',
    );
    expect(EDGE).toContain('payload_sha256: await sha256Hex(canonical)');
    expect(EDGE).toContain('retention_disclosures: retentionDisclosures');
    expect(EDGE).toContain(
      'signed_urls_embedded: supplement ? false : signedChatMediaCount > 0',
    );
    expect(EDGE).toContain('delivery: "signed_at_download"');
    expect(EDGE).toContain('containsPersistedDeliveryCapability');
    expect(EDGE).toContain(
      'if (depth > 12) return Array.isArray(value) || isPlainObject(value);',
    );
    expect(SUPPLEMENT_MIGRATION).toContain('data_export_media_refs');
    expect(SUPPLEMENT_MIGRATION).toContain(
      'kc_read_data_export_media_refs_for_download',
    );
    expect(ADMIN_EDGE).toContain('SUPPLEMENT_READY_TTL_SECONDS');
    expect(ADMIN_EDGE).toContain('7 * 24 * 60 * 60');
    expect(EDGE).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(EDGE).toContain('.limit(limit + 1)');
    expect(EDGE).toContain('has_more: hasMore');
  });

  test('exposes one consistent adapter/API contract and rejects local persistence', () => {
    for (const method of [
      'createDataSubjectRequest',
      'listDataSubjectRequests',
      'getDataSubjectRequest',
      'downloadDataSubjectExport',
      'downloadDataSubjectSupplement',
      'cancelDataSubjectRequest',
    ]) {
      expect(SUPABASE_ADAPTER).toContain(method);
      expect(HELP_API).toContain(method);
      expect(LOCAL_ADAPTER).toContain(method);
    }
    expect(SUPABASE_ADAPTER).toContain(
      "client.functions.invoke('kc-data-subject-request'",
    );
    expect(LOCAL_ADAPTER).toContain("code: 'BACKEND_REQUIRED'");
  });
});
