'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { JSDOM } = require('jsdom');

const CONTROLLER = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../assets/js/controllers/admin/admin-help-requests.controller.js',
  ),
  'utf8',
);

const ADMIN_USER = { id: '11111111-1111-4111-8111-111111111111' };
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const HELP_REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DATA_SUBJECT_REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WORKFLOW_REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUBJECT_HASH = 'd'.repeat(64);
const TARGET_EMAIL = 'titular@example.test';
const NOW_ISO = '2026-07-29T12:00:00.000Z';
const activeHarnesses = [];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForAtLeastCalls(mock, count) {
  for (let index = 0; index < 60 && mock.mock.calls.length < count; index += 1) {
    await settle(2);
  }
  expect(mock.mock.calls.length).toBeGreaterThanOrEqual(count);
}

function toLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function makeCanonicalLinkedRow(overrides = {}) {
  const row = {
    id: HELP_REQUEST_ID,
    user_id: TARGET_USER_ID,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_deletion',
    status: 'in_progress',
    priority: 'normal',
    subject: 'Excluir minha conta',
    message: 'Solicitação confirmada pelo titular.',
    contact_email: TARGET_EMAIL,
    page_path: '/settings.html',
    allow_contact: true,
    metadata: {
      request_kind: 'account_erasure',
      data_subject_request_id: DATA_SUBJECT_REQUEST_ID,
      identity_source: 'authenticated_account',
      protocol: 'KC-DSR-20260729-ABCDEF0123456789',
      export_before_erasure: 'no_copy_needed',
      ...(overrides.metadata || {}),
    },
    created_at: '2026-07-28T10:00:00.000Z',
  };
  return {
    ...row,
    ...overrides,
    metadata: row.metadata,
  };
}

function makeReconciledHelpRow(action) {
  if (action === 'apply_reversible') {
    return makeCanonicalLinkedRow({
      status: 'in_progress',
      metadata: {
        lgpd_erasure: {
          request_id: WORKFLOW_REQUEST_ID,
          stage: 'pending_confirmation',
          confirmation_email_status: 'sent',
          updated_at: NOW_ISO,
        },
      },
    });
  }
  if (action === 'cancel_reversible') {
    return makeCanonicalLinkedRow({
      status: 'resolved',
      metadata: {
        reversible_restore_required: false,
        cancellation_requested: false,
        lgpd_erasure: {
          request_id: WORKFLOW_REQUEST_ID,
          stage: 'cancelled',
          cancelled_at: NOW_ISO,
          reason_hash: 'e'.repeat(64),
        },
      },
    });
  }
  return {
    id: HELP_REQUEST_ID,
    user_id: null,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_deletion',
    status: 'resolved',
    priority: 'normal',
    subject: 'Solicitacao LGPD atendida',
    message: 'Conteudo removido por solicitacao LGPD.',
    contact_email: `lgpd-${SUBJECT_HASH.slice(0, 12)}@redacted.kinocampus.local`,
    page_path: null,
    allow_contact: false,
    metadata: {
      request_kind: 'account_erasure',
      lgpd_erasure: {
        request_id: WORKFLOW_REQUEST_ID,
        subject_hash: SUBJECT_HASH,
        erased_at: NOW_ISO,
        contact_redacted: true,
        content_redacted: true,
        postcondition_version: 2,
      },
    },
    created_at: '2026-07-28T10:00:00.000Z',
  };
}

function baseDiagnostics() {
  return {
    counts: {
      profiles: 0,
      posts: 0,
      help_requests: 1,
    },
    identity_assurance: {
      verified: true,
      source: 'authenticated_account',
      requires_manual_evidence: false,
    },
    external_processors: [],
    warnings: [],
    blockers: [],
  };
}

function reconciledDiagnoseResponse(action) {
  if (action === 'apply_reversible') {
    return {
      ok: true,
      action: 'diagnose',
      request: {
        status: 'pending_confirmation',
        reversible_applied_at: NOW_ISO,
        confirmation_requested_at: NOW_ISO,
        metadata: {
          auth_deleted: false,
          confirmation_email_status: 'sent',
          retryable: false,
        },
      },
      diagnostics: baseDiagnostics(),
      target: { subject_hash: SUBJECT_HASH, user_found: true },
    };
  }
  if (action === 'cancel_reversible') {
    return {
      ok: true,
      action: 'diagnose',
      request: {
        status: 'cancelled',
        metadata: {
          auth_deleted: false,
          retryable: false,
          cancelled: {
            reason_hash: 'e'.repeat(64),
            cancelled_at: NOW_ISO,
          },
        },
      },
      diagnostics: baseDiagnostics(),
      target: { subject_hash: SUBJECT_HASH, user_found: true },
    };
  }
  if (action === 'erase_confirmed') {
    return {
      ok: true,
      action: 'diagnose',
      request: {
        status: 'failed',
        erased_at: NOW_ISO,
        metadata: {
          auth_deleted: true,
          retryable: true,
          failure_stage: 'external_processors',
        },
        receipt: {
          result: 'core_erased',
          erased_at: NOW_ISO,
          subject_hash: SUBJECT_HASH,
        },
      },
      receipt: {
        result: 'core_erased',
        erased_at: NOW_ISO,
        subject_hash: SUBJECT_HASH,
      },
      diagnostics: baseDiagnostics(),
      target: { subject_hash: SUBJECT_HASH, user_found: false },
    };
  }
  return {
    ok: true,
    action: 'diagnose',
    request: {
      status: 'erased',
      erased_at: NOW_ISO,
      metadata: {
        auth_deleted: true,
        retryable: false,
        notification_pending: false,
        completion_email_status: 'sent',
      },
      receipt: {
        result: 'erased',
        erased_at: NOW_ISO,
        subject_hash: SUBJECT_HASH,
      },
    },
    receipt: {
      result: 'erased',
      erased_at: NOW_ISO,
      subject_hash: SUBJECT_HASH,
    },
    diagnostics: baseDiagnostics(),
    target: { subject_hash: SUBJECT_HASH, user_found: false },
  };
}

function wrongDiagnoseResponse(action) {
  const wrongByAction = {
    apply_reversible: {
      status: 'diagnosed',
      metadata: { auth_deleted: false },
    },
    cancel_reversible: {
      status: 'reversible_applied',
      metadata: { auth_deleted: false },
    },
    erase_confirmed: {
      status: 'pending_confirmation',
      metadata: { auth_deleted: false },
    },
    retry_finalize: {
      status: 'failed',
      erased_at: NOW_ISO,
      metadata: {
        auth_deleted: true,
        retryable: true,
        failure_stage: 'final_workflow',
      },
    },
  };
  return {
    ok: true,
    action: 'diagnose',
    request: wrongByAction[action],
    diagnostics: baseDiagnostics(),
    target: {
      subject_hash: SUBJECT_HASH,
      user_found: action !== 'erase_confirmed' && action !== 'retry_finalize',
    },
  };
}

function retrySeedResponse() {
  return {
    ok: true,
    action: 'diagnose',
    request: {
      status: 'failed',
      erased_at: NOW_ISO,
      metadata: {
        auth_deleted: true,
        retryable: true,
        failure_stage: 'external_processors',
      },
    },
    diagnostics: {
      ...baseDiagnostics(),
      external_processors: [{
        provider: 'runtime_processor',
        treatment: 'delete_or_document_retention',
        status: 'manual_policy_follow_up',
      }],
    },
    target: { subject_hash: SUBJECT_HASH, user_found: false },
  };
}

function createHarness(initialRow) {
  const lookup = deferred();
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="admin-loading"><span>Verificando acesso...</span></div>
          <div id="admin-error"></div>
          <div id="admin-content">
            <select id="helpStatusFilter"><option value="all">Todos</option></select>
            <select id="helpTypeFilter"><option value="all">Todas</option></select>
            <select id="helpPriorityFilter"><option value="all">Todas</option></select>
            <input id="helpQueryFilter" />
            <button id="helpRefreshButton" type="button">Atualizar</button>
            <button id="helpExportXlsx" type="button">XLSX</button>
            <button id="helpExportPdf" type="button">PDF</button>
            <div id="helpSummary"></div>
            <div id="helpRequestsList"></div>
          </div>
        </body>
      </html>`,
    {
      url: 'https://kino.example/admin/help-requests.html',
      runScripts: 'outside-only',
    },
  );
  activeHarnesses.push(dom);

  const { window } = dom;
  const processAccountErasure = jest.fn();
  const listAdminHelpRequests = jest.fn(async (filters = {}) => (
    filters.requestId ? lookup.promise : [initialRow]
  ));
  const showToast = jest.fn();

  window.showToast = showToast;
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.KCHelpUtils = {};
  window.KCAPI = {
    ENV: { driver: 'supabase' },
    getCurrentUser: jest.fn(async () => ADMIN_USER),
    listAdminHelpRequests,
    updateAdminHelpRequest: jest.fn(async () => ({ ok: true })),
    processAccountErasure,
  };
  window.KCSupabase = {
    getClient: () => ({
      from: () => ({
        select: () => ({
          eq: (_column, userId) => ({
            maybeSingle: async () => ({
              data: { is_admin: userId === ADMIN_USER.id },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  window.eval(CONTROLLER);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  return {
    dom,
    window,
    document: window.document,
    lookup,
    listAdminHelpRequests,
    processAccountErasure,
    showToast,
    async ready() {
      await waitForAtLeastCalls(listAdminHelpRequests, 1);
      await settle();
    },
    installAmbiguousMutation(action, ambiguity, diagnoseResponse) {
      processAccountErasure.mockReset();
      processAccountErasure.mockImplementation((payload) => {
        if (payload && payload.action === 'diagnose') {
          if (diagnoseResponse instanceof Error) {
            return Promise.reject(diagnoseResponse);
          }
          return Promise.resolve(diagnoseResponse);
        }
        if (!payload || payload.action !== action) {
          return Promise.reject(new Error(`unexpected action: ${payload && payload.action}`));
        }
        if (ambiguity === 'throw') {
          return Promise.reject(new Error('transport_failed_after_possible_commit'));
        }
        return Promise.resolve({
          ok: false,
          error: {
            message: 'timeout_after_possible_commit',
          },
        });
      });
      showToast.mockClear();
    },
  };
}

function getCard(harness) {
  return harness.document.querySelector(`[data-help-id="${HELP_REQUEST_ID}"]`);
}

function getAction(card, action) {
  return card.querySelector(`[data-lgpd-action="${action}"]`);
}

function fillActionEvidence(card, action) {
  const recent = toLocalDateTimeInput(new Date(Date.now() - 60 * 1000));
  if (action === 'cancel_reversible') {
    card.querySelector('[data-lgpd-cancellation-reason]').value =
      'cancelamento confirmado pelo titular';
  }
  if (action === 'erase_confirmed') {
    card.querySelector('[data-lgpd-confirmation]').value = `EXCLUIR ${TARGET_EMAIL}`;
    card.querySelector('[data-lgpd-evidence-reference]').value =
      'erasure-confirmation-runtime-20260729';
    card.querySelector('[data-lgpd-evidence-at]').value = recent;
    card.querySelector('[data-lgpd-evidence-attested]').checked = true;
  }
  if (action === 'retry_finalize') {
    const outcome = card.querySelector(
      '[data-lgpd-provider-outcome][data-provider="runtime_processor"]',
    );
    expect(outcome).not.toBeNull();
    outcome.value = 'deleted';
    card.querySelector('[data-lgpd-provider-reference]').value =
      'provider-review-runtime-20260729';
    card.querySelector('[data-lgpd-provider-at]').value = recent;
    card.querySelector('[data-lgpd-provider-attested]').checked = true;
  }
}

async function seedRetryState(harness) {
  harness.processAccountErasure.mockResolvedValueOnce(retrySeedResponse());
  getAction(getCard(harness), 'diagnose').click();
  await waitForAtLeastCalls(harness.processAccountErasure, 1);
  await settle(8);
  harness.processAccountErasure.mockReset();
  harness.showToast.mockClear();
}

function dispatchProgrammaticAction(harness, action) {
  const card = getCard(harness);
  let button = getAction(card, action);
  if (!button) {
    button = harness.document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-lgpd-action', action);
    card.appendChild(button);
  }
  button.dispatchEvent(new harness.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  }));
}

function countActionCalls(mock, action) {
  return mock.mock.calls.filter(([payload]) => payload && payload.action === action).length;
}

function expectExactLookup(harness) {
  expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(2);
  expect(harness.listAdminHelpRequests.mock.calls[1][0]).toEqual({
    requestId: HELP_REQUEST_ID,
    limit: 1,
    offset: 0,
  });
}

function expectPositivePostconditionUi(harness, action) {
  const card = getCard(harness);
  expect(card).not.toBeNull();
  if (action === 'apply_reversible') {
    expect(card.textContent).toMatch(/Aguardando confirmação|Ocultação reversível aplicada/i);
  } else if (action === 'cancel_reversible') {
    expect(card.textContent).toMatch(/Cancelado/i);
  } else if (action === 'erase_confirmed') {
    expect(card.textContent).toMatch(/Núcleo excluído\s*Sim/i);
  } else {
    expect(card.textContent).toMatch(/Exclusão executada/i);
    expect(card.textContent).toMatch(/Fluxo integral finalizado\s*Sim/i);
  }
  expect(harness.showToast).toHaveBeenCalledWith(
    expect.any(String),
    'success',
    2600,
  );
}

afterEach(() => {
  while (activeHarnesses.length) {
    activeHarnesses.pop().window.close();
  }
});

describe('admin erasure ambiguous post-commit reconciliation', () => {
  test.each([
    ['apply_reversible', 'ok:false'],
    ['apply_reversible', 'throw'],
    ['erase_confirmed', 'ok:false'],
    ['erase_confirmed', 'throw'],
    ['cancel_reversible', 'ok:false'],
    ['cancel_reversible', 'throw'],
    ['retry_finalize', 'ok:false'],
    ['retry_finalize', 'throw'],
  ])('%s reconciles %s through exact Help lookup and read-only diagnose', async (action, ambiguity) => {
    const harness = createHarness(makeCanonicalLinkedRow());
    await harness.ready();
    if (action === 'retry_finalize') await seedRetryState(harness);
    harness.installAmbiguousMutation(
      action,
      ambiguity,
      reconciledDiagnoseResponse(action),
    );

    let card = getCard(harness);
    fillActionEvidence(card, action);
    getAction(card, action).click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);

    dispatchProgrammaticAction(harness, action);
    await settle(6);
    expect(countActionCalls(harness.processAccountErasure, action)).toBe(1);
    expect(harness.processAccountErasure).toHaveBeenCalledTimes(1);

    harness.lookup.resolve([makeReconciledHelpRow(action)]);
    await waitForAtLeastCalls(harness.processAccountErasure, 2);
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual([action, 'diagnose']);
    expect(harness.processAccountErasure.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        action: 'diagnose',
        help_request_id: HELP_REQUEST_ID,
      }),
    );
    expectPositivePostconditionUi(harness, action);
  });

  test.each([
    'apply_reversible',
    'erase_confirmed',
    'cancel_reversible',
    'retry_finalize',
  ])('%s remains locked when diagnose does not prove its own postcondition', async (action) => {
    const harness = createHarness(makeCanonicalLinkedRow());
    await harness.ready();
    if (action === 'retry_finalize') await seedRetryState(harness);
    harness.installAmbiguousMutation(
      action,
      'ok:false',
      wrongDiagnoseResponse(action),
    );

    const card = getCard(harness);
    fillActionEvidence(card, action);
    getAction(card, action).click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.resolve([makeReconciledHelpRow(action)]);
    await waitForAtLeastCalls(harness.processAccountErasure, 2);
    await settle(12);

    expectExactLookup(harness);
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'success',
      2600,
    );
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/indetermin|não confirmou|não repita|nao repita/i),
      'error',
      2600,
    );
    const liveButton = getAction(getCard(harness), action);
    expect(liveButton === null || liveButton.disabled).toBe(true);

    dispatchProgrammaticAction(harness, action);
    await settle(8);
    expect(countActionCalls(harness.processAccountErasure, action)).toBe(1);
    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual([action, 'diagnose']);
  });

  test('failed exact Help lookup leaves a thrown reversible outcome indeterminate and locked', async () => {
    const harness = createHarness(makeCanonicalLinkedRow());
    await harness.ready();
    harness.installAmbiguousMutation(
      'apply_reversible',
      'throw',
      reconciledDiagnoseResponse('apply_reversible'),
    );

    const card = getCard(harness);
    fillActionEvidence(card, 'apply_reversible');
    getAction(card, 'apply_reversible').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.reject(new Error('help_lookup_unavailable'));
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual(['apply_reversible']);
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'success',
      2600,
    );
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/indetermin|nÃ£o confirmou|nÃ£o repita|nao repita/i),
      'error',
      2600,
    );
    const liveButton = getAction(getCard(harness), 'apply_reversible');
    expect(liveButton === null || liveButton.disabled).toBe(true);

    dispatchProgrammaticAction(harness, 'apply_reversible');
    await settle(8);
    expect(countActionCalls(harness.processAccountErasure, 'apply_reversible')).toBe(1);
  });

  test('failed read-only diagnose leaves an ok:false core erasure outcome indeterminate and locked', async () => {
    const harness = createHarness(makeCanonicalLinkedRow());
    await harness.ready();
    harness.installAmbiguousMutation(
      'erase_confirmed',
      'ok:false',
      new Error('diagnose_unavailable'),
    );

    const card = getCard(harness);
    fillActionEvidence(card, 'erase_confirmed');
    getAction(card, 'erase_confirmed').click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.resolve([makeReconciledHelpRow('erase_confirmed')]);
    await waitForAtLeastCalls(harness.processAccountErasure, 2);
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual(['erase_confirmed', 'diagnose']);
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'success',
      2600,
    );
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/indetermin|nÃ£o confirmou|nÃ£o repita|nao repita/i),
      'error',
      2600,
    );
    const liveButton = getAction(getCard(harness), 'erase_confirmed');
    expect(liveButton === null || liveButton.disabled).toBe(true);

    dispatchProgrammaticAction(harness, 'erase_confirmed');
    await settle(8);
    expect(countActionCalls(harness.processAccountErasure, 'erase_confirmed')).toBe(1);
  });
});
