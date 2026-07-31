'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LEGACY_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/_archive-v75/20260525143000_lgpd_account_erasure_requests.sql'),
  'utf8'
);
const DSR_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728183022_data_subject_requests_and_export.sql'),
  'utf8'
);
const AUDIT_REDACTION_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728184500_account_erasure_audit_identifier_redaction.sql'),
  'utf8'
);
const COMPLETION_OUTBOX_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728185000_account_erasure_completion_outbox.sql'),
  'utf8'
);
const PRIVACY_POSTCONDITIONS_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728233000_harden_account_erasure_privacy_postconditions.sql'),
  'utf8'
);
const DATA_EXPORT_SUPPLEMENT_MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260728220000_data_export_supplement_workflow.sql'),
  'utf8'
);
const ERASURE_CLOSURE_MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    'supabase/migrations/20260729004000_close_erasure_races_and_renew_leases.sql'
  ),
  'utf8'
);
const ATOMIC_AUTH_DELETE_MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    'supabase/migrations/20260729007000_atomic_erasure_dsr_and_auth_delete_recovery.sql'
  ),
  'utf8'
);
const IDENTITY_LINK_MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    'supabase/migrations/20260729009000_harden_erasure_identity_link_and_projection.sql'
  ),
  'utf8'
);
const PROCESSOR_MATRIX = fs.readFileSync(
  path.join(ROOT, 'supabase/functions/_shared/data-processors.ts'),
  'utf8'
);
const EDGE = fs.readFileSync(path.join(ROOT, 'supabase/functions/kc-account-erasure/index.ts'), 'utf8');
const EMAIL_TEMPLATE = fs.readFileSync(
  path.join(ROOT, 'supabase/templates/kino-account-erasure-confirmation-email.html'),
  'utf8'
);
const HELP_CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'),
  'utf8'
);
const RUNBOOK = fs.readFileSync(path.join(ROOT, 'docs/privacy/account-erasure-runbook.md'), 'utf8');
const DEPLOY = fs.readFileSync(
  path.join(ROOT, 'docs/privacy/account-erasure-supabase-deploy.md'),
  'utf8'
);
const IDENTITY_LINK_DOC = fs.readFileSync(
  path.join(ROOT, 'docs/privacy/account-erasure-identity-link-and-projection.md'),
  'utf8'
);

function loadEdgeResponseProjector() {
  const start = EDGE.indexOf('function projectIdentityAssuranceForResponse');
  const end = EDGE.indexOf('function json(', start);
  const source = EDGE.slice(start, end)
    .replace(
      'function projectIdentityAssuranceForResponse(value: unknown): JsonObject',
      'function projectIdentityAssuranceForResponse(value)'
    )
    .replace('function isPrivateResponseKey(key: string)', 'function isPrivateResponseKey(key)')
    .replace(
      'function sanitizeResponseValue(value: unknown, key = ""): unknown',
      'function sanitizeResponseValue(value, key = "")'
    )
    .replace(
      'function projectEdgeResponse(body: Record<string, unknown>)',
      'function projectEdgeResponse(body)'
    )
    .replaceAll(': JsonObject', '')
    .replaceAll(' as JsonObject', '')
    .replace(' as Record<string, unknown>', '');

  return new Function(
    'UUID_RE',
    'PRIVATE_RESPONSE_KEYS',
    'WORKFLOW_RESPONSE_FIELDS',
    'asObject',
    'safeString',
    `${source}\nreturn projectEdgeResponse;`
  )(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    new Set(),
    new Set([
      'status',
      'metadata',
      'receipt',
      'counts',
      'email_hash',
      'target_email_domain',
    ]),
    (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
    (value, maxLength = 200) => String(value || '').slice(0, maxLength)
  );
}

describe('account erasure - schema e contratos atomicos', () => {
  test('mantem recibo legado sem e-mail bruto e adiciona estados parciais', () => {
    expect(LEGACY_MIGRATION).toContain('email_hash text not null');
    expect(LEGACY_MIGRATION).not.toMatch(/\bemail text\b/i);
    [
      'diagnosed',
      'pending_confirmation',
      'confirmed',
      'reversible_applied',
      'partial_failure',
      'erased',
      'cancelled',
      'failed',
    ].forEach((status) => expect(DSR_MIGRATION).toContain(`'${status}'`));
  });

  test('liga DSR e implementa claim por status, versao e token', () => {
    expect(DSR_MIGRATION).toContain('data_subject_request_id uuid');
    expect(DSR_MIGRATION).toContain('operation_version integer not null default 1');
    expect(DSR_MIGRATION).toContain('operation_claim_token uuid');
    expect(DSR_MIGRATION).toContain('kc_claim_account_erasure_operation');
    expect(DSR_MIGRATION).toContain('ERASURE_VERSION_CONFLICT');
    expect(EDGE).toContain('const claimRpc = action === "erase_confirmed"');
    expect(EDGE).toContain('"kc_claim_account_erasure_operation"');
    expect(EDGE).toContain('.eq("operation_claim_token", claim.token)');
    expect(EDGE).toContain('.eq("operation_version", claim.version)');
    expect(EDGE).toContain('operation_claim_expires_at = null');
  });

  test('aceita UUID canonico 8-4-4-4-12 em ids e tokens de claim', () => {
    const canonicalUuidPattern =
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    expect(EDGE).toContain(canonicalUuidPattern);
    expect(EDGE).not.toContain(
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}'
    );
  });

  test('sincroniza DSR por CAS + evento e trata cancelamento como terminal', () => {
    expect(DSR_MIGRATION).toContain('kc_transition_data_subject_request');
    expect(DSR_MIGRATION).toContain('DSR_STATUS_CONFLICT');
    expect(DSR_MIGRATION).toContain("'reversible_restore_required', true");
    expect(EDGE).toContain('loadLinkedDataSubjectRequest');
    expect(EDGE).toContain('transitionDataSubjectRequest');
    expect(EDGE).toContain('data_subject_request_cancelled');
    expect(EDGE).toContain('legacy_without_data_subject_request');
  });

  test('publica capabilities service-role e exige quiescencia de escrita', () => {
    [
      'chat_preserving_delete',
      'cadu_set_null',
      'unit_meta_set_null',
      'community_content_preserving_delete',
      'safety_records_preserving_delete',
      'write_quiescence',
    ].forEach((flag) => {
      expect(DSR_MIGRATION).toContain(`'${flag}'`);
      expect(EDGE).toContain(`capabilities.${flag}`);
    });
    expect(DSR_MIGRATION).toContain('kc_account_erasure_capabilities');
    expect(DSR_MIGRATION).toContain('kc_active_session_guard_coverage');
    expect(DSR_MIGRATION).toContain('pgrst.db_pre_request');
    expect(DSR_MIGRATION).toContain('to service_role');
    expect(COMPLETION_OUTBOX_MIGRATION).toContain("'version', 3");
    expect(COMPLETION_OUTBOX_MIGRATION).toContain("'encrypted_completion_outbox', true");
    expect(EDGE).toContain('capabilities.encrypted_completion_outbox');
    expect(ERASURE_CLOSURE_MIGRATION).toContain("'version', 4");
    expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain("'version', 5");
    expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(
      "'atomic_irreversible_dsr_transition', true"
    );
    expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(
      "'durable_auth_delete_checkpoint', true"
    );
    expect(EDGE).toContain('capabilities.version >= 5');
    expect(EDGE).toContain('capabilities.atomic_irreversible_dsr_transition');
    expect(EDGE).toContain('capabilities.durable_auth_delete_checkpoint');
  });

  test('fecha o titular atomicamente e bloqueia DSR/export depois do claim irreversivel', () => {
    [
      'kc_private.account_erasure_subject_closures',
      'kc_lock_privacy_subject(v_user_id)',
      'trg_guard_dsr_against_erasure_closure',
      'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING',
      'kc_data_export_subject_is_eligible',
      "'closure_persisted', true",
    ].forEach((text) => expect(ERASURE_CLOSURE_MIGRATION).toContain(text));
    const irreversibleClaim = ERASURE_CLOSURE_MIGRATION.slice(
      ERASURE_CLOSURE_MIGRATION.indexOf(
        'create or replace function public.kc_claim_account_erasure_irreversible_operation'
      ),
      ERASURE_CLOSURE_MIGRATION.indexOf(
        'create or replace function kc_private.kc_renew_account_erasure_operation'
      )
    );
    expect(irreversibleClaim.indexOf('kc_lock_privacy_subject(v_user_id)')).toBeLessThan(
      irreversibleClaim.indexOf('insert into kc_private.account_erasure_subject_closures')
    );
  });

  test('faz claim, CAS da DSR e closure em uma unica transacao recuperavel', () => {
    [
      'kc_claim_account_erasure_irreversible_operation_v2',
      'ERASURE_ATOMIC_DSR_STATUS_CONFLICT',
      'ERASURE_ATOMIC_DSR_TERMINAL',
      'kc_transition_data_subject_request',
      'out_data_subject_request_status',
    ].forEach((text) => expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(text));
    const atomicClaim = ATOMIC_AUTH_DELETE_MIGRATION.slice(
      ATOMIC_AUTH_DELETE_MIGRATION.indexOf(
        'create or replace function public.kc_claim_account_erasure_irreversible_operation_v2'
      ),
      ATOMIC_AUTH_DELETE_MIGRATION.indexOf(
        'create or replace function\n  public.kc_checkpoint_account_erasure_auth_delete_intent'
      )
    );
    expect(atomicClaim.indexOf('kc_claim_account_erasure_irreversible_operation(')).toBeLessThan(
      atomicClaim.indexOf('kc_transition_data_subject_request(')
    );
    expect(EDGE).toContain('"kc_claim_account_erasure_irreversible_operation_v2"');
    expect(EDGE).toContain('claim.dataSubjectRequestStatus === "processing"');
    expect(EDGE).toContain('the same transaction that acquired the workflow lease');
  });

  test('checkpoint precede delete Auth e erro ambiguo e desambiguado por UUID', () => {
    [
      'auth_delete_intent_token uuid',
      'auth_delete_target_user_id uuid',
      'kc_checkpoint_account_erasure_auth_delete_intent',
      'kc_account_erasure_auth_delete_recovery_status',
      'kc_confirm_account_erasure_auth_deleted',
      'ERASURE_AUTH_USER_STILL_PRESENT',
      "auth_delete_state = 'confirmed_absent'",
    ].forEach((text) => expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(text));

    const erase = EDGE.slice(
      EDGE.indexOf('async function eraseConfirmed'),
      EDGE.indexOf('async function retryFinalize')
    );
    const checkpoint = erase.indexOf('checkpointAuthDeleteIntent(');
    const deleteUser = erase.indexOf('auth.admin.deleteUser');
    const inspectById = erase.indexOf('inspectAuthUserById', deleteUser);
    const recoveryProof = erase.indexOf('readAuthDeleteRecoveryStatus', inspectById);
    const confirmAbsent = erase.indexOf('confirmAuthDeleteAbsence', recoveryProof);
    const postconditions = erase.indexOf('verifyCorePostconditions', confirmAbsent);
    const clearCheckpoint = erase.indexOf('auth_delete_target_user_id: null', postconditions);
    expect(checkpoint).toBeGreaterThan(-1);
    expect(checkpoint).toBeLessThan(deleteUser);
    expect(deleteUser).toBeLessThan(inspectById);
    expect(inspectById).toBeLessThan(recoveryProof);
    expect(recoveryProof).toBeLessThan(confirmAbsent);
    expect(confirmAbsent).toBeLessThan(postconditions);
    expect(postconditions).toBeLessThan(clearCheckpoint);
    expect(erase).toContain('catch (_error)');
    expect(erase).toContain('deleteUser(\n      opts.userId,\n      false,');
    expect(erase).toContain('"auth_delete_outcome_unknown"');
    expect(erase).toContain('"auth_delete_failed"');
    expect(erase).toContain('authRecoveryProof.authUserPresent === false');
  });

  test('retry sem Auth confia somente no checkpoint com identity e closure', () => {
    const handler = EDGE.slice(EDGE.indexOf('Deno.serve'));
    expect(handler).toContain('authDeleteCheckpointFromWorkflow(existingWorkflow)');
    expect(handler).toContain('readAuthDeleteRecoveryStatus');
    expect(handler).toContain('inspectAuthUserById');
    expect(handler).toContain('"auth_delete_recovery_proof_invalid"');
    expect(handler).toContain('"auth_delete_outcome_unresolved"');
    expect(handler).toContain('reconcileAuthDeleteAbsence');
    expect(handler).toContain('"auth_delete_reconciled_retry_finalize_required"');
    expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(
      "v_workflow.metadata #>> '{identity_assurance,verified}' <> 'true'"
    );
    expect(ATOMIC_AUTH_DELETE_MIGRATION).toContain(
      'kc_private.account_erasure_subject_closures'
    );
  });

  test('vincula claim a sessao ativa, renova lease e falha fechado em updates', () => {
    [
      'operation_claim_session_id uuid',
      'kc_assert_active_admin_session',
      'kc_renew_account_erasure_operation',
      'ERASURE_OPERATION_LEASE_EXPIRED',
      'trg_account_erasure_claim_update_guard',
      'operation_claim_expires_at >',
    ].forEach((text) => expect(ERASURE_CLOSURE_MIGRATION).toContain(text));
    expect(EDGE).toContain('sessionIdFromAuthorization');
    expect(EDGE).toContain('p_actor_session_id: adminSessionId');
    expect(EDGE).toContain('"kc_renew_account_erasure_operation"');
    expect(EDGE).toContain('.eq("operation_claim_session_id", claim.sessionId)');
    expect(EDGE).toContain('.gt("operation_claim_expires_at", new Date().toISOString())');
  });

  test('upsert de workflow e recuperacao de export aberto sao idempotentes sob lock', () => {
    [
      'account_erasure_requests_canonical_help_uidx',
      'kc_upsert_account_erasure_workflow',
      'kc_erasure_help:',
      'data_subject_requests_one_open_export_kind_per_user_uidx',
      "'reuse_reason', v_reuse_reason",
    ].forEach((text) => expect(ERASURE_CLOSURE_MIGRATION).toContain(text));
    expect(EDGE).toContain('"kc_upsert_account_erasure_workflow"');
    expect(EDGE).not.toContain('.insert(insertPayload)');
  });

  test('revoga leitura bruta do workflow e publica binder somente service-role', () => {
    expect(IDENTITY_LINK_MIGRATION).toContain(
      'drop policy if exists account_erasure_requests_select_admin'
    );
    expect(IDENTITY_LINK_MIGRATION).toContain(
      'revoke all on table public.account_erasure_requests'
    );
    expect(IDENTITY_LINK_MIGRATION).toContain(
      'grant all on table public.account_erasure_requests'
    );
    expect(IDENTITY_LINK_MIGRATION).toContain(
      'kc_link_verified_help_request_to_account_erasure'
    );
    expect(IDENTITY_LINK_MIGRATION).toContain(
      'from public, anon, authenticated'
    );
    expect(IDENTITY_LINK_MIGRATION).toContain('to service_role');
    expect(IDENTITY_LINK_MIGRATION).not.toContain(
      'grant select on table public.account_erasure_requests'
    );
  });

  test('binder anonimo e transacional, hash-only, idempotente e fail-closed', () => {
    [
      'kc_private.account_erasure_ticket_identity_links',
      'kc_assert_active_admin_session',
      'ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE',
      'ERASURE_IDENTITY_DSR_NOT_UNIQUE',
      'ERASURE_IDENTITY_SUBJECT_CLOSED',
      'ERASURE_IDENTITY_LINK_CONFLICT',
      "'idempotent', true",
      "'identity_attestation_hash', v_attestation_hash",
      "'reference_hash', v_attestation_hash",
    ].forEach((text) => expect(IDENTITY_LINK_MIGRATION).toContain(text));
    expect(IDENTITY_LINK_MIGRATION).not.toMatch(
      /\b(account_email|identity_reference|raw_reference)\s+text\b/i
    );

    const binder = IDENTITY_LINK_MIGRATION.slice(
      IDENTITY_LINK_MIGRATION.indexOf(
        'public.kc_link_verified_help_request_to_account_erasure'
      ),
      IDENTITY_LINK_MIGRATION.indexOf(
        'revoke all on function',
        IDENTITY_LINK_MIGRATION.indexOf(
          'public.kc_link_verified_help_request_to_account_erasure'
        )
      )
    );
    const subjectLock = binder.indexOf(
      'kc_lock_privacy_subject(v_target_user_id)'
    );
    const helpLock = binder.indexOf(
      "'kc_erasure_help:' || p_help_request_id::text"
    );
    const dsrLock = binder.indexOf("'kc_erasure_dsr:' || v_dsr_id::text");
    const workflowLock = binder.indexOf("'kc_erasure_workflow:' ||");
    expect(subjectLock).toBeGreaterThan(-1);
    expect(subjectLock).toBeLessThan(helpLock);
    expect(helpLock).toBeLessThan(dsrLock);
    expect(dsrLock).toBeLessThan(workflowLock);
  });

  test('ignora account_email do payload e normaliza pelo Auth vinculado', () => {
    [
      'kc_normalize_authenticated_privacy_help_email',
      'trg_normalize_authenticated_privacy_help_email',
      "coalesce(new.metadata, '{}'::jsonb)",
      "- 'account_email'",
      "'account_email',",
      'v_auth_email',
      'PRIVACY_HELP_AUTH_ACCOUNT_NOT_UNIQUE',
    ].forEach((text) => expect(IDENTITY_LINK_MIGRATION).toContain(text));

    const binder = IDENTITY_LINK_MIGRATION.slice(
      IDENTITY_LINK_MIGRATION.indexOf(
        'public.kc_link_verified_help_request_to_account_erasure'
      ),
      IDENTITY_LINK_MIGRATION.indexOf(
        'revoke all on function',
        IDENTITY_LINK_MIGRATION.indexOf(
          'public.kc_link_verified_help_request_to_account_erasure'
        )
      )
    );
    expect(binder).toContain("'account_email', v_email");
    expect(binder).not.toContain(
      "v_help.metadata ->> 'account_email'\n       ) <> v_email"
    );
  });

  test('retry terminal usa a mesma chave antes de closure/open e devolve projecao segura', () => {
    const start = IDENTITY_LINK_MIGRATION.indexOf(
      'create or replace function kc_private.kc_create_data_subject_request_v2'
    );
    const end = IDENTITY_LINK_MIGRATION.indexOf(
      'revoke all on function kc_private.kc_create_data_subject_request_v2',
      start
    );
    const creator = IDENTITY_LINK_MIGRATION.slice(start, end);
    const subjectLock = creator.indexOf(
      'kc_lock_privacy_subject(v_uid)'
    );
    const exactKeyLookup = creator.indexOf(
      'request_row.idempotency_key = v_idempotency_key'
    );
    const exactKeyReturn = creator.indexOf(
      "'reuse_reason', 'idempotency_key'",
      exactKeyLookup
    );
    const closureBarrier = creator.indexOf(
      'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING'
    );
    const openReuse = creator.indexOf(
      "v_request_kind in ('data_access_copy', 'data_portability')"
    );

    expect(subjectLock).toBeGreaterThan(-1);
    expect(subjectLock).toBeLessThan(exactKeyLookup);
    expect(exactKeyLookup).toBeLessThan(exactKeyReturn);
    expect(exactKeyReturn).toBeLessThan(closureBarrier);
    expect(closureBarrier).toBeLessThan(openReuse);
    expect(creator).toContain("- 'user_id'");
    expect(creator).toContain("- 'subject_hash'");
    expect(creator).toContain("- 'idempotency_key'");
    expect(creator).not.toContain("status = 'received'");
  });

  test('revoga refresh tokens por usuario/sessao e pos-condiciona zero', () => {
    const start = DSR_MIGRATION.indexOf(
      'create or replace function kc_private.kc_revoke_user_sessions_for_erasure'
    );
    const end = DSR_MIGRATION.indexOf(
      'create or replace function public.kc_revoke_user_sessions_for_erasure',
      start
    );
    const revoke = DSR_MIGRATION.slice(start, end);
    expect(revoke).toContain('returns jsonb');
    expect(revoke).toContain('token_row.user_id = p_user_id::text');
    expect(revoke).toContain('token_row.session_id = any(v_session_ids)');
    expect(revoke).toContain('SESSION_REVOCATION_INCOMPLETE');
    expect(revoke).toContain("'sessions_deleted', v_sessions_deleted");
    expect(revoke).toContain("'refresh_tokens_deleted', v_refresh_tokens_deleted");
    expect(EDGE).toContain('result.ok !== true');
  });
});

describe('account erasure - autenticacao, identidade e classificacao', () => {
  test('exige sessao administrativa ativa e origem permitida', () => {
    expect(EDGE).toContain('kc_is_current_session_active');
    expect(EDGE).toContain('session_not_active');
    expect(EDGE).toContain('KC_ALLOWED_ORIGINS');
    expect(EDGE).toContain('isAllowedOrigin(req)');
    expect(EDGE).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(EDGE).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  test('classificador exige tuple coerente e nao usa LGPD isoladamente', () => {
    for (const source of [EDGE, HELP_CONTROLLER]) {
      expect(source).toContain('account_access');
      expect(source).toContain('onboarding_settings');
      expect(source).toContain('account_deletion');
      expect(source).toContain('data_access_copy');
      expect(source).toContain('data_portability');
      expect(source).toContain('requestKind');
    }
    expect(EDGE).toContain('requestKind === CANONICAL_ERASURE_KIND && canonicalTuple');
    // Admin panel: canonical privacy tuple + fail-closed on non-erasure kinds;
    // bare "LGPD" text never opens destructive controls.
    expect(HELP_CONTROLLER).toContain("subtopic === 'account_deletion'");
    expect(HELP_CONTROLLER).toContain(
      "if (canonicalTuple && (!requestKind || requestKind === 'account_erasure')) return true"
    );
    expect(HELP_CONTROLLER).toContain(
      "if (requestKind && requestKind !== 'account_erasure') return false"
    );
    expect(HELP_CONTROLLER).toContain('A bare "LGPD" mention never opens destructive controls');
  });

  test('usa token opaco aleatorio e estavel, nunca hash de e-mail/UUID', () => {
    expect(EDGE).toMatch(
      /deriveSubjectHash\(\s*dataSubjectRequest,\s*existingWorkflow,\s*\)/
    );
    expect(EDGE).toContain('dataSubjectRequest?.subject_hash');
    expect(EDGE).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(EDGE).not.toContain('sha256Hex(email)');
    expect(EDGE).not.toContain('sha256Hex(userId');
    expect(DSR_MIGRATION).toContain("encode(extensions.gen_random_bytes(32), 'hex')");
    expect(HELP_CONTROLLER).toContain('target.subject_hash');
  });

  test('vincula identidade, ticket, DSR e alvo antes de ocultar', () => {
    expect(EDGE).toContain('assessIdentityBinding');
    expect(EDGE).toContain('identity_target_mismatch');
    expect(EDGE).toContain('safeString(helpRequest.user_id, 80) !== userId');
    expect(EDGE).toContain('legacy_anonymous_manual_verification_required');
    expect(EDGE).toContain('verified_email_challenge');
    expect(EDGE).toContain('if (!helpRequestId)');
    expect(HELP_CONTROLLER).toContain('data-lgpd-identity-reference');
    expect(HELP_CONTROLLER).toContain('identity_evidence');
    expect(HELP_CONTROLLER).not.toMatch(/help_request\s*:\s*row/);
  });

  test('mantem UUID Help/DSR/Auth como autoridade e usa imediatamente o e-mail Auth atual', () => {
    const handler = EDGE.slice(EDGE.indexOf('Deno.serve'));
    const ownerId = handler.indexOf(
      'const helpOwnerId = extractUuidFromText(helpRequest.user_id) || null'
    );
    const ownerLookup = handler.indexOf(
      'inspectAuthUserById(\n        adminClient,\n        helpOwnerId'
    );
    const currentAuthEmail = handler.indexOf(
      'const currentAuthEmail = normalizeEmail(authUser?.email)'
    );
    const canonicalTuple = handler.indexOf('helpOwnerId !== userId');

    expect(ownerId).toBeGreaterThan(-1);
    expect(ownerLookup).toBeGreaterThan(ownerId);
    expect(currentAuthEmail).toBeGreaterThan(ownerLookup);
    expect(canonicalTuple).toBeGreaterThan(currentAuthEmail);
    expect(handler).toMatch(
      /const email =[\s\S]{0,240}currentAuthEmail/
    );

    const fallbackStart = handler.indexOf('const submittedOrHelpEmail');
    const fallbackEnd = handler.indexOf('const currentAuthEmail', fallbackStart);
    const emailFallback = handler.slice(fallbackStart, fallbackEnd);
    expect(fallbackStart).toBeGreaterThan(-1);
    expect(emailFallback).toMatch(/helpOwnerId/);
    if (emailFallback.includes('resolveTargetEmail(')) {
      expect(emailFallback).toMatch(/resolveTargetEmail\(body, helpRequest\)/);
    }

    const rotationStart = handler.indexOf('const accountEmailChanged');
    const rotationEnd = handler.indexOf(
      'const dataSubjectLink = await loadLinkedDataSubjectRequest',
      rotationStart
    );
    const rotationPolicy = rotationStart >= 0
      ? handler.slice(rotationStart, rotationEnd)
      : '';
    expect(rotationPolicy).not.toContain(
      'throw new WorkflowError(409, "identity_email_revalidation_required")'
    );
  });

  test('prova armazenada pos-core usa allowlist explicita e fonte forjada falha fechada', () => {
    const start = EDGE.indexOf('function storedIdentityAssurance(');
    const end = EDGE.indexOf('async function requireIdentityAssurance(', start);
    const storedPolicy = EDGE.slice(start, end);
    const allowlistMatch = EDGE.match(
      /const\s+([A-Z0-9_]*(?:IDENTITY|ASSURANCE|SOURCE)[A-Z0-9_]*)\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );

    expect(start).toBeGreaterThan(-1);
    expect(allowlistMatch).not.toBeNull();
    const allowlistName = allowlistMatch ? allowlistMatch[1] : '';
    const allowlistValues = allowlistMatch ? allowlistMatch[2] : '';
    [
      'linked_authenticated_data_subject_request',
      'admin_verified_anonymous_erasure',
      'authenticated_help_request_owner_match',
      'legacy_manual_identity_verification',
    ].forEach((source) => expect(allowlistValues).toContain(`"${source}"`));
    expect(storedPolicy).toContain(`${allowlistName}.has(source)`);
    expect(storedPolicy).toMatch(new RegExp(
      `if\\s*\\(\\s*!${allowlistName}\\.has\\(source\\)\\s*\\)\\s*return null`
    ));
    expect(storedPolicy).not.toMatch(
      /if\s*\(\s*!source\s*\)\s*return null;\s*return\s*\{/
    );
  });

  test('prova pos-core e coerente com checkpoint e vinculos ainda disponiveis', () => {
    const start = EDGE.indexOf('function storedIdentityAssurance(');
    const end = EDGE.indexOf('async function requireIdentityAssurance(', start);
    const storedPolicy = EDGE.slice(start, end);
    const handler = EDGE.slice(EDGE.indexOf('Deno.serve'));
    const callStart = handler.indexOf('storedIdentityAssurance(');
    const callContext = handler.slice(callStart, callStart + 900);

    expect(storedPolicy).toMatch(/checkpoint/i);
    expect(storedPolicy).toMatch(/helpRequest/i);
    expect(storedPolicy).toMatch(/dataSubjectRequest/i);
    expect(storedPolicy).toContain('return null');

    expect(callStart).toBeGreaterThan(-1);
    expect(callContext).toMatch(/checkpointHint|authDeleteRecovery/);
    expect(callContext).toContain('helpRequest');
    expect(callContext).toContain('dataSubjectRequest');
  });

  test('acao dedicada recupera Help/DSR legacy-null antes do fluxo estrito', () => {
    expect(EDGE).toContain('"link_verified_identity"');
    expect(EDGE).toContain(
      '"kc_link_verified_help_request_to_account_erasure"'
    );
    expect(EDGE).toContain('linkVerifiedAccountErasureIdentity');
    expect(EDGE).toContain('p_actor_session_id: opts.actorSessionId');
    expect(EDGE).toContain('"kc:account-erasure-identity:v1"');
    expect(EDGE).toContain('opts.helpRequestId');
    expect(EDGE).toContain('evidence.channel');
    expect(EDGE).toContain('evidence.reference_hash');
    expect(EDGE).toContain('p_attestation_sha256: contextualAttestationHash');
    expect(EDGE).toContain('"ERASURE_IDENTITY_DSR_MATERIALIZATION_CONFLICT"');
    expect(IDENTITY_LINK_DOC).toContain(
      'kc:account-erasure-identity:v1'
    );

    const handler = EDGE.slice(EDGE.indexOf('Deno.serve'));
    const dedicatedAction = handler.indexOf(
      'if (action === "link_verified_identity")'
    );
    const legacyLoader = handler.indexOf('loadLinkedDataSubjectRequest(');
    const checkpointRecovery = handler.indexOf(
      'authDeleteCheckpointFromWorkflow(existingWorkflow)'
    );
    expect(dedicatedAction).toBeGreaterThan(-1);
    expect(dedicatedAction).toBeLessThan(legacyLoader);
    expect(dedicatedAction).toBeLessThan(checkpointRecovery);
  });

  test('toda resposta projeta workflow e elimina checkpoint/UUIDs internos', () => {
    const jsonBoundary = EDGE.slice(
      EDGE.indexOf('function json('),
      EDGE.indexOf('function getEnv(')
    );
    expect(jsonBoundary).toContain('JSON.stringify(projectEdgeResponse(body))');
    expect(jsonBoundary).not.toContain('JSON.stringify(body)');
    [
      'WORKFLOW_RESPONSE_FIELDS',
      'projectIdentityAssuranceForResponse',
      'projectEdgeResponse',
      'auth_delete_checkpoint',
      'checkpoint_state',
      'core_inventory',
      'repair_target_user_id',
      'operation_claim_token',
      'recorded_by',
    ].forEach((text) => expect(EDGE).toContain(text));
    expect(EDGE).toContain('normalized.startsWith("auth_delete_")');
    expect(EDGE).toContain('normalized.endsWith("_id")');
    expect(EDGE).toContain('normalized.endsWith("_ids")');
    expect(EDGE).toContain('normalized.endsWith("_by")');
    expect(EDGE).toContain('UUID_RE.test(value.trim())');
    expect(EDGE).toContain('if (key === "request")');
    expect(EDGE).not.toMatch(
      /projectIdentityAssuranceForResponse[\s\S]*?projected\.target_user_id\s*=/
    );
    expect(EDGE).not.toMatch(
      /projectIdentityAssuranceForResponse[\s\S]*?projected\.help_user_id\s*=/
    );
  });

  test('projecao recursiva falha fechada para IDs futuros sem remover campos publicos', () => {
    const projectEdgeResponse = loadEdgeResponseProjector();
    const firstUuid = '11111111-1111-4111-8111-111111111111';
    const secondUuid = '22222222-2222-4222-8222-222222222222';
    const artifactRef = `KEA-${'A'.repeat(32)}`;
    const subjectHash = 'b'.repeat(64);
    const contextualHash = 'c'.repeat(64);

    const projected = projectEdgeResponse({
      ok: true,
      identity_assurance: {
        verified: true,
        source: 'admin_verified_anonymous_erasure',
        evidence: {
          channel: 'support_mailbox_reply',
          reference_hash: contextualHash,
          event_at: { arbitrary_workflow_id: firstUuid },
          recorded_at: '2026-07-29T12:00:00.000Z',
          unlisted_evidence: secondUuid,
        },
      },
      request: {
        status: 'failed',
        metadata: {
          nested: {
            arbitrary_workflow_id: firstUuid,
            cancelled_by: secondUuid,
            raw_ids: [firstUuid, secondUuid],
            future_key: firstUuid,
            arbitrary_values: [secondUuid, 'public-value'],
            artifact_ref: artifactRef,
            subject_hash: subjectHash,
          },
        },
      },
    });

    expect(projected).toEqual({
      ok: true,
      identity_assurance: {
        verified: true,
        source: 'admin_verified_anonymous_erasure',
        evidence: {
          channel: 'support_mailbox_reply',
          reference_hash: contextualHash,
          recorded_at: '2026-07-29T12:00:00.000Z',
        },
      },
      request: {
        status: 'failed',
        metadata: {
          nested: {
            arbitrary_values: ['public-value'],
            artifact_ref: artifactRef,
            subject_hash: subjectHash,
          },
        },
      },
    });
  });
});

describe('account erasure - state machine e efeitos', () => {
  test('expoe acoes, confirmacao e cancelamento/restauracao', () => {
    [
      'link_verified_identity',
      'diagnose',
      'apply_reversible',
      'record_confirmation_delivery',
      'cancel_reversible',
      'generate_receipt',
      'erase_confirmed',
      'retry_finalize',
    ].forEach((action) => expect(EDGE).toContain(`"${action}"`));
    expect(EDGE).toContain('EXCLUIR ${opts.email}');
    expect(EDGE).toContain('confirmation_evidence_hash');
    expect(EDGE).toContain('status: "confirmed"');
    expect(EDGE).toContain('restoreReversibleChanges');
    expect(EDGE).toContain('reversible_snapshot');
  });

  test('claim atomico do DSR antecede workflow confirmed e libera claim em corrida', () => {
    const eraseStart = EDGE.indexOf('async function eraseConfirmed');
    const eraseEnd = EDGE.indexOf('let operationalDiagnostics', eraseStart);
    const section = EDGE.slice(eraseStart, eraseEnd);
    const atomicClaim = section.indexOf('const claim = await claimWorkflowAction');
    const confirmed = section.indexOf('status: "confirmed"');
    expect(atomicClaim).toBeGreaterThan(-1);
    expect(atomicClaim).toBeLessThan(confirmed);
    expect(section).toContain('"erase_confirmed"');
    expect(section).toContain('opts.dataSubjectRequest');
    expect(section).toContain('claim.dataSubjectRequestStatus === "processing"');
    expect(section).toContain('releaseWorkflowClaim(adminClient, claim, "confirmation_cas")');
  });

  test('distingue rascunho de entrega comprovada', () => {
    expect(EDGE).toContain('emailStatus = "draft_only"');
    expect(EDGE).toContain('requires_manual_delivery');
    expect(EDGE).toContain('recordConfirmationDelivery');
    expect(EDGE).toContain('confirmation_delivery_not_proven');
    expect(EDGE).toContain('reference_hash: await sha256Hex(reference)');
  });

  test('inventa, bane, revoga, reinventa sob barreira e so entao remove', () => {
    const inventory = EDGE.indexOf('const initialStorageScan = await collectStoragePaths');
    const ban = EDGE.indexOf('const accountBan = await banTargetAccount');
    const revoke = EDGE.indexOf('const sessionRevocation = await revokeTargetSessions');
    const lockedDb = EDGE.indexOf('operationalDiagnostics = await buildDiagnostics');
    const removal = EDGE.indexOf('const storageCleanup = await removeStoragePaths');
    const authDelete = EDGE.indexOf('deleteUser(\n      opts.userId,\n      false,');
    expect(inventory).toBeGreaterThan(-1);
    expect(inventory).toBeLessThan(ban);
    expect(ban).toBeLessThan(revoke);
    expect(revoke).toBeLessThan(lockedDb);
    expect(lockedDb).toBeLessThan(removal);
    expect(removal).toBeLessThan(authDelete);
    expect(EDGE).toContain('ban_duration: "876000h"');
    expect(EDGE).toContain('database_quiescence_verification_failed');
    expect(EDGE).not.toContain('auth.admin.signOut(');
  });

  test('falha fechado no Storage e varre bucket privado + legado', () => {
    expect(EDGE).toContain('listStoragePrefix');
    expect(EDGE).toContain('profile-avatars/${userId}');
    expect(EDGE).toContain('post-media/${userId}');
    expect(EDGE).toContain('chat-media/${conversationId}/${userId}');
    expect(EDGE).toContain('KC_CHAT_STORAGE_BUCKET');
    expect(EDGE).toContain('"kino-chat-media"');
    expect(EDGE).toContain('paths.push({ bucket: mediaBucket, path })');
    expect(EDGE).toContain('storage_inventory_incomplete');
    expect(EDGE).toContain('storage_verification_failed');
    expect(EDGE).toContain('storage_objects_still_present');
  });

  test('preserva terceiros e elimina dados comportamentais linkaveis', () => {
    expect(EDGE).toContain('sanitizeAuthoredComments');
    expect(EDGE).toContain('sanitizeAuthoredReports');
    expect(EDGE).toContain('sanitizeOwnedChat');
    expect(EDGE).toContain('third_party_chat_message_ids');
    expect(EDGE).toContain('received_rating_ids');
    expect(EDGE).toContain('received_block_ids');
    expect(EDGE).toContain('third_party_chat_messages_lost');
    expect(EDGE).toContain('received_blocks_lost');
    expect(EDGE).toContain('deleteBehavioralAndConsentData');
    expect(EDGE).toContain('privacy_analytics_events');
    expect(EDGE).toContain('privacy_consent_events');
    expect(EDGE).toContain('behavioralRowIds');
    expect(EDGE).toContain('repairFailedPostconditions');
    const sanitizePosts = EDGE.slice(
      EDGE.indexOf('async function sanitizeOwnedPosts'),
      EDGE.indexOf('function stripHelpRequestPersonalMetadata')
    );
    expect(sanitizePosts).not.toContain('request_id');
    expect(sanitizePosts).toContain('.select("id")');
    expect(sanitizePosts).toContain('affectedIds.length !== 1');
    expect(sanitizePosts).toContain('sanitized !== postIds.length');
    expect(EDGE).toContain('inventoried_posts_not_preserved');
  });

  test('redige UUID exato nos tres historicos por RPC transacional fail-closed', () => {
    expect(AUDIT_REDACTION_MIGRATION).toContain('kc_redact_exact_json_string');
    expect(AUDIT_REDACTION_MIGRATION).toContain('lock table public.audit_log');
    expect(AUDIT_REDACTION_MIGRATION).toContain('lock table public.ad_campaign_audit');
    expect(AUDIT_REDACTION_MIGRATION).toContain('lock table public.hero_banner_audit');
    expect(AUDIT_REDACTION_MIGRATION).toContain('AUDIT_LOG_CARDINALITY_MISMATCH');
    expect(AUDIT_REDACTION_MIGRATION).toContain('AD_CAMPAIGN_AUDIT_CARDINALITY_MISMATCH');
    expect(AUDIT_REDACTION_MIGRATION).toContain('HERO_BANNER_AUDIT_CARDINALITY_MISMATCH');
    expect(AUDIT_REDACTION_MIGRATION).toContain('AUDIT_EVENT_INTEGRITY_MISMATCH');
    expect(AUDIT_REDACTION_MIGRATION).toContain('AUDIT_IDENTIFIER_REDACTION_INCOMPLETE');
    expect(AUDIT_REDACTION_MIGRATION).toContain('extensions.gen_random_uuid()');
    expect(AUDIT_REDACTION_MIGRATION).toContain("'inventory_digest', v_inventory_digest");
    expect(AUDIT_REDACTION_MIGRATION).not.toContain("'audit_log_ids',");
    expect(AUDIT_REDACTION_MIGRATION).not.toContain("'ad_campaign_audit_ids',");
    expect(AUDIT_REDACTION_MIGRATION).not.toContain("'hero_banner_audit_ids',");
    expect(EDGE).toMatch(
      /adminClient\.rpc\(\s*"kc_account_audit_identifier_inventory"/
    );
    expect(EDGE).toMatch(
      /adminClient\.rpc\(\s*"kc_redact_account_audit_identifiers"/
    );
    expect(EDGE).toContain('audit_identifier_still_present');
    expect(EDGE).toContain('inventory_digest');
    expect(EDGE).not.toContain('auditLogIds');
    expect(EDGE).not.toContain('adCampaignAuditIds');
    expect(EDGE).not.toContain('heroBannerAuditIds');
    expect(EDGE).not.toContain('"audit_log",\n      "id,actor_id,entity_id,payload"');
  });

  test('nunca conclui nucleo parcial como erased', () => {
    expect(EDGE).toContain('status: "partial_failure"');
    expect(EDGE).toContain('failure_stage: "external_processors"');
    expect(EDGE).toContain('external_processor_follow_up_required');
    expect(PROCESSOR_MATRIX).toContain('processor: "cadu_openclaw_hostinger_vps"');
    expect(EDGE).toContain('cadu_openclaw_hostinger_vps:');
    expect(EDGE).toContain('Object.entries(outcomes)');
    expect(EDGE).toContain('completion_notification_pending');
    expect(EDGE).toContain('help_redaction_failed');
    expect(EDGE).toContain('result: "erased"');
  });

  test('falha recuperavel de retry_finalize publica um proximo passo explicito', () => {
    const handlerStart = EDGE.indexOf('if (action === "retry_finalize")');
    const handlerEnd = EDGE.indexOf('const erase = await eraseConfirmed', handlerStart);
    const handler = EDGE.slice(handlerStart, handlerEnd);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain('if (!result.ok)');
    expect(handler).toContain('retryable: true');
    expect(handler).toContain('next_action: "retry_finalize"');
  });

  test('cifra o destinatario, redige e so entao conclui DSR/workflow e comunica', () => {
    const retryStart = EDGE.indexOf('async function retryFinalize');
    const retryEnd = EDGE.indexOf('Deno.serve', retryStart);
    const retry = EDGE.slice(retryStart, retryEnd);
    const stage = retry.indexOf('await ensureCompletionOutbox');
    const finalization = retry.slice(stage);
    const dsr = finalization.indexOf('transitionDataSubjectThroughProcessing');
    const redact = finalization.indexOf('redactTargetHelpRequests');
    const erased = finalization.indexOf('status: "erased"');
    const send = finalization.indexOf('await deliverCompletionEmailFromOutbox');
    expect(stage).toBeGreaterThan(-1);
    expect(dsr).toBeGreaterThan(-1);
    expect(redact).toBeGreaterThan(-1);
    expect(erased).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(redact).toBeLessThan(erased);
    expect(erased).toBeLessThan(dsr);
    expect(erased).toBeLessThan(send);
    expect(retry).toContain('notification_pending: true');
    expect(retry).toContain('completionDeliveryEvidence');
    const helpRedaction = EDGE.slice(
      EDGE.indexOf('async function redactTargetHelpRequests'),
      EDGE.indexOf('async function verifyCorePostconditions')
    );
    expect(helpRedaction).toContain('kc_redact_account_help_requests');
    expect(helpRedaction).toContain('help_redaction_postcondition_failed');
  });

  test('minimiza integralmente tickets e bloqueia conclusao antes da pos-condicao', () => {
    [
      'admin_note = null',
      'page_path = null',
      'allow_contact = false',
      "admin_status = 'na'",
      'HELP_REDACTION_POSTCONDITION_FAILED',
      "'personal_fields_remaining', v_remaining",
      "'postcondition_version', 2",
    ].forEach((text) => expect(PRIVACY_POSTCONDITIONS_MIGRATION).toContain(text));
    const retry = EDGE.slice(EDGE.indexOf('async function retryFinalize'), EDGE.indexOf('Deno.serve'));
    const firstFinalization = retry.slice(retry.indexOf('await ensureCompletionOutbox'));
    expect(firstFinalization.indexOf('redactTargetHelpRequests')).toBeLessThan(
      firstFinalization.indexOf('transitionDataSubjectThroughProcessing')
    );
  });

  test('retentativa de workflow ja apagado repara DSR antes de comunicar conclusao', () => {
    const retry = EDGE.slice(EDGE.indexOf('async function retryFinalize'), EDGE.indexOf('Deno.serve'));
    const erasedBranch = retry.slice(
      retry.indexOf('if (safeString(opts.request.status, 80) === "erased")'),
      retry.indexOf(
        'const tasks =',
        retry.indexOf('if (safeString(opts.request.status, 80) === "erased")')
      )
    );
    const repair = erasedBranch.indexOf('transitionDataSubjectThroughProcessing');
    const deliver = erasedBranch.indexOf('deliverCompletionEmailFromOutbox');
    expect(repair).toBeGreaterThan(-1);
    expect(deliver).toBeGreaterThan(-1);
    expect(repair).toBeLessThan(deliver);
    expect(erasedBranch).toContain('"data_subject_finalization_retry"');
    expect(erasedBranch).toContain('error: "data_subject_finalization_failed"');
  });

  test('exige copia entregue ou decisao orientada antes do claim irreversivel', () => {
    [
      'kc_claim_account_erasure_irreversible_operation',
      'kc_lock_privacy_subject',
      'ERASURE_COPY_GUIDANCE_DECISION_REQUIRED',
      'ERASURE_COPY_REQUEST_NOT_LINKED',
      'ERASURE_COPY_NOT_PROVEN_DELIVERED',
      "event_row.event_type = 'downloaded'",
      "v_copy.status <> 'completed'",
    ].forEach((text) => expect(PRIVACY_POSTCONDITIONS_MIGRATION).toContain(text));
    expect(EDGE).toContain('action === "erase_confirmed"');
    expect(EDGE).toContain('"kc_claim_account_erasure_irreversible_operation_v2"');
    expect(EDGE).toContain('readPreErasureCopyGate');
    expect(HELP_CONTROLLER).toContain('data-lgpd-copy-decision');
    expect(HELP_CONTROLLER).toContain('copy_gate_decision');
    expect(HELP_CONTROLLER).toContain(
      "const copyDecisionRequired = (!copyPreference || copyPreference === 'need_guidance')"
    );
    expect(HELP_CONTROLLER).toContain(
      "'Este ticket legado não registrou a preferência de cópia.'"
    );
  });

  test('purga artefatos privados de exportacao antes de limpar banco/Auth', () => {
    [
      'kc_claim_data_export_artifacts_for_erasure',
      'kc_authorize_data_export_artifact_upload',
      'kc_complete_data_export_artifact_erasure_purge',
      'kc_release_data_export_artifact_erasure_purge',
      "purge_reason = 'account_erasure'",
      "'blocked_active_claim_count', v_blocked_active_claim_count",
      "artifact_row.claim_expires_at > now()",
      "owner_user_id = null",
      "manifest = '{}'::jsonb",
      'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT',
    ].forEach((text) => expect(DATA_EXPORT_SUPPLEMENT_MIGRATION).toContain(text));
    const helper = EDGE.slice(
      EDGE.indexOf('async function purgeDataExportArtifactsForErasure'),
      EDGE.indexOf('function uniqStorageRefs')
    );
    expect(helper).toContain('"kino-data-exports"');
    expect(helper).toContain('EXPORT_ARTIFACT_PATH_RE');
    expect(helper).toContain('"kc_claim_data_export_artifacts_for_erasure"');
    expect(helper).toContain('"kc_complete_data_export_artifact_erasure_purge"');
    expect(helper).toContain('"data_export_artifact_active_build_in_progress"');
    expect(helper).toContain('blocked_active_claim_count');
    expect(helper).toContain('retry_after');
    expect(EDGE).toContain('"kc_release_data_export_artifact_erasure_purge"');
    const erase = EDGE.slice(EDGE.indexOf('async function eraseConfirmed'), EDGE.indexOf('async function retryFinalize'));
    expect(erase.indexOf('purgeDataExportArtifactsForErasure')).toBeLessThan(
      erase.indexOf('sanitizeOwnedPosts')
    );
    expect(erase.indexOf('purgeDataExportArtifactsForErasure')).toBeLessThan(
      erase.indexOf('adminClient.auth.admin.deleteUser')
    );
    expect(PRIVACY_POSTCONDITIONS_MIGRATION).toContain(
      "'export_artifact_erasure_purge', true"
    );
    expect(EDGE).toContain('capabilities.export_artifact_erasure_purge');
  });

  test('remove e-mail historico do audit e pseudonimiza revogacao de convite', () => {
    [
      "audit_row.action = 'invite_revoked'",
      "audit_row.entity_type = 'invites'",
      "audit_row.payload - 'email'",
      "'email_hash', v_email_hash",
      'kc_account_audit_email_inventory',
      'kc_redact_account_audit_emails',
      'AUDIT_EMAIL_REDACTION_INCOMPLETE',
    ].forEach((text) => expect(PRIVACY_POSTCONDITIONS_MIGRATION).toContain(text));
    expect(EDGE).toContain('audit_personal_email_still_present');
    expect(EDGE).toContain('audit_emails_sanitized');
  });

  test('outbox final usa AES-GCM, CAS, retry e wipe por aceite/TTL', () => {
    [
      'AES-256-GCM',
      'recipient_ciphertext = null',
      'recipient_nonce = null',
      'delivery_claim_token = p_delivery_claim_token',
      'COMPLETION_OUTBOX_ACCEPT_CONFLICT',
      'COMPLETION_OUTBOX_DELIVERY_ALREADY_CLAIMED',
      'kc_release_account_erasure_completion_delivery',
      'kc_purge_expired_account_erasure_completion_outbox',
      'expires_at <= pg_catalog.clock_timestamp()',
      "'status', 'expired'",
    ].forEach((text) => expect(COMPLETION_OUTBOX_MIGRATION).toContain(text));
    expect(COMPLETION_OUTBOX_MIGRATION).not.toContain("message = 'COMPLETION_OUTBOX_EXPIRED'");
    expect(COMPLETION_OUTBOX_MIGRATION).toContain('from public, anon, authenticated, service_role');
    expect(EDGE).toContain('KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64');
    expect(EDGE).toContain('KC_ERASURE_OUTBOX_KEY_VERSION');
    expect(EDGE).toContain('KC_ERASURE_OUTBOX_TTL_SECONDS');
    expect(EDGE).toContain('crypto.subtle.encrypt');
    expect(EDGE).toContain('crypto.subtle.decrypt');
    expect(EDGE).toContain('completion_outbox_encryption_unavailable');
    expect(EDGE).toContain('completion_outbox_expired_manual_delivery_required');
    expect(EDGE).toContain('completion_outbox_delivery_ambiguous');
    expect(HELP_CONTROLLER).toContain('Verifique mailbox/log do provedor antes de reenviar');
    expect(EDGE).toMatch(
      /email:\s*\{\s*status:\s*completionDelivery\.alreadyAccepted\s*\?\s*"accepted_previously"\s*:\s*"sent",?\s*\}/
    );
    expect(EDGE).not.toMatch(/console\.(?:log|warn|error)\([^\\n]*(?:recipient_ciphertext|recipient_nonce|recipient\b)/i);
  });

  test('falha SMTP libera o claim e recarga repete sem expor destinatario ao painel', () => {
    const deliveryStart = EDGE.indexOf('async function deliverCompletionEmailFromOutbox');
    const deliveryEnd = EDGE.indexOf('function completionNotificationPendingCode', deliveryStart);
    const delivery = EDGE.slice(deliveryStart, deliveryEnd);
    const claim = delivery.indexOf('kc_claim_account_erasure_completion_outbox');
    const decrypt = delivery.indexOf('decryptCompletionRecipient');
    const send = delivery.indexOf('await sendEmail');
    const accept = delivery.indexOf('kc_accept_account_erasure_completion_delivery');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(decrypt);
    expect(decrypt).toBeLessThan(send);
    expect(send).toBeLessThan(accept);
    expect(delivery).toContain('kc_release_account_erasure_completion_delivery');
    expect(delivery).toContain('throw error');
    expect(HELP_CONTROLLER).toContain('deixe todos vazios para tentar o reenvio automático');
    expect(HELP_CONTROLLER).toContain('destinatário cifrado');
  });
});

describe('account erasure - painel, provedores e documentacao', () => {
  test('painel oferece evidencia, cancelamento e finalizacao explicita', () => {
    [
      'Preparar diagn',
      'Ocultar conta e pedir confirma',
      'Registrar envio manual',
      'Cancelar e restaurar',
      'Executar exclus',
      'Finalizar operadores e recibo',
      'Exportar relat',
    ].forEach((label) => expect(HELP_CONTROLLER).toContain(label));
    expect(HELP_CONTROLLER).toContain('data-lgpd-provider-outcome');
    expect(HELP_CONTROLLER).toContain('providerOutcomes');
    expect(HELP_CONTROLLER).toContain('providerRetentions');
    expect(HELP_CONTROLLER).toContain('retentions: providerRetentions');
    expect(EDGE).toContain('provider_retention_basis_required');
    expect(EDGE).toContain('provider_retention_review_must_be_future');
    expect(EDGE).toContain('notification_provider_retention_required');
    expect(EDGE).toContain('import { buildDataProcessorMatrix } from "../_shared/data-processors.ts"');
    expect(EDGE).toContain('provider: entry.processor');
    expect(HELP_CONTROLLER).toContain('Retenção pré-conclusão e entrega documentada');
  });

  test('documenta claim, DSR, JWT residual, collateral e provedores', () => {
    [
      'operation_claim_token',
      'kc_transition_data_subject_request',
      'partial_failure',
      'access JWT',
      'mensagens de terceiros',
      'bloqueios recebidos',
      'operadores externos',
      'Rollback funcional existe apenas antes de `confirmed`',
    ].forEach((text) => expect(RUNBOOK).toContain(text));
    expect(DEPLOY).toContain('não autoriza executar exclusão real');
    expect(DEPLOY).toContain('kc_account_erasure_capabilities()');
    expect(DEPLOY).toContain('Não use conta de usuário real');
  });

  test('documenta o vinculo legacy-null e a fronteira de projecao', () => {
    [
      'link_verified_identity',
      'kc_lock_privacy_subject',
      'idempotent: true',
      'account_erasure_ticket_identity_links',
      'auth_delete_*',
      'core_inventory',
      'repair_target_user_id',
      '20260729009000_harden_erasure_identity_link_and_projection.sql',
      '20260729012000_bridge_anonymous_help_to_erasure_dsr.sql',
      'kc_materialize_anonymous_erasure_dsr',
    ].forEach((text) => expect(IDENTITY_LINK_DOC).toContain(text));
    expect(IDENTITY_LINK_DOC).toMatch(/somente esse hash/i);
    expect(IDENTITY_LINK_DOC).toContain('RLS não seria suficiente');
  });

  test('mantem template versionado para confirmacao', () => {
    expect(EMAIL_TEMPLATE).toContain('Confirme a remo');
    expect(EMAIL_TEMPLATE).toContain('KinoCampus');
    expect(EMAIL_TEMPLATE).toContain('{{ email }}');
  });
});
