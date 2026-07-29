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
const ARTIFACT_REF = 'KEA-ABCDEF0123456789ABCDEF0123456789';
const NOW_ISO = '2026-07-29T12:00:00.000Z';
const FUTURE_ISO = '2099-07-29T12:00:00.000Z';
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

function makeLinkedRow(status = 'queued', overrides = {}) {
  const row = {
    id: HELP_REQUEST_ID,
    user_id: TARGET_USER_ID,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_data_copy',
    status: 'in_progress',
    priority: 'normal',
    subject: 'Cópia integral dos dados',
    message: 'Identidade e protocolo já validados.',
    contact_email: 'titular@example.test',
    page_path: '/settings.html',
    allow_contact: true,
    metadata: {
      request_kind: 'data_access_copy',
      data_subject_request_id: DATA_SUBJECT_REQUEST_ID,
      identity_source: 'authenticated_account',
      export_artifact_ref: ARTIFACT_REF,
      export_artifact_status: status,
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

function makeCleanupRow(status = 'delivered', overrides = {}) {
  const row = makeLinkedRow(status, overrides);
  return {
    ...row,
    user_id: null,
    status: 'resolved',
    contact_email: 'lgpd-redacted@redacted.kinocampus.local',
    page_path: null,
    allow_contact: false,
  };
}

function makeReconciledHelpRow(action) {
  if (action === 'record_processor') {
    return makeLinkedRow('queued', {
      metadata: {
        export_artifact_version: 2,
        export_processor_evidence_updated_at: NOW_ISO,
      },
    });
  }
  if (action === 'build' || action === 'retry') {
    return makeLinkedRow('ready', {
      metadata: {
        export_artifact_version: 2,
        export_artifact_ready_at: NOW_ISO,
        export_artifact_expires_at: FUTURE_ISO,
      },
    });
  }
  return makeCleanupRow('purged', {
    metadata: {
      export_artifact_version: 2,
      export_artifact_purged_at: NOW_ISO,
    },
  });
}

function recordProcessorSeedResponse() {
  return {
    ok: true,
    action: 'diagnose',
    artifact: {
      artifact_ref: ARTIFACT_REF,
      status: 'queued',
      version: 1,
      processors: [{
        processor: 'runtime_processor',
        treatment: 'manual_export',
        status: 'manual_follow_up',
      }],
    },
  };
}

function reconciledDiagnoseResponse(action) {
  if (action === 'record_processor') {
    return {
      ok: true,
      action: 'diagnose',
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'queued',
        version: 2,
        processors: [{
          processor: 'runtime_processor',
          treatment: 'manual_export',
          status: 'no_account_data',
          outcome: 'no_account_data',
          evidence_sha256: 'c'.repeat(64),
          resolved_at: NOW_ISO,
        }],
      },
    };
  }
  if (action === 'build' || action === 'retry') {
    return {
      ok: true,
      action: 'diagnose',
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'ready',
        version: 2,
        ready_at: NOW_ISO,
        expires_at: FUTURE_ISO,
        sha256: 'd'.repeat(64),
        byte_size: 4096,
        processors: [],
      },
    };
  }
  return {
    ok: true,
    action: 'diagnose',
    artifact: {
      artifact_ref: ARTIFACT_REF,
      status: 'purged',
      version: 2,
      purged_at: NOW_ISO,
      object_path: null,
      sha256: null,
      byte_size: null,
      processors: [],
    },
  };
}

function wrongDiagnoseResponse(action) {
  if (action === 'record_processor') {
    return {
      ok: true,
      action: 'diagnose',
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'queued',
        version: 1,
        processors: [{
          processor: 'runtime_processor',
          treatment: 'manual_export',
          status: 'no_account_data',
          outcome: 'no_account_data',
          evidence_sha256: 'c'.repeat(64),
          resolved_at: NOW_ISO,
        }],
      },
    };
  }
  if (action === 'build') {
    return {
      ok: true,
      action: 'diagnose',
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'claimed',
        version: 2,
        processors: [],
      },
    };
  }
  if (action === 'retry') {
    return {
      ok: true,
      action: 'diagnose',
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'failed',
        version: 2,
        processors: [],
      },
    };
  }
  return {
    ok: true,
    action: 'diagnose',
    artifact: {
      artifact_ref: ARTIFACT_REF,
      status: 'delivered',
      version: 2,
      processors: [],
    },
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
  const processDataExportSupplement = jest.fn();
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
    processDataExportSupplement,
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
    processDataExportSupplement,
    showToast,
    async ready() {
      await waitForAtLeastCalls(listAdminHelpRequests, 1);
      await settle();
    },
    installAmbiguousMutation(action, ambiguity, diagnoseResponse) {
      processDataExportSupplement.mockReset();
      processDataExportSupplement.mockImplementation((payload) => {
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
  return card.querySelector(`[data-export-action="${action}"]`);
}

async function seedProcessorState(harness) {
  harness.processDataExportSupplement.mockResolvedValueOnce(
    recordProcessorSeedResponse(),
  );
  getAction(getCard(harness), 'diagnose').click();
  await waitForAtLeastCalls(harness.processDataExportSupplement, 1);
  await settle(8);
  harness.processDataExportSupplement.mockReset();
  harness.showToast.mockClear();
}

function prepareMutationControl(harness, action) {
  const card = getCard(harness);
  if (action === 'record_processor') {
    const processorRow = card.querySelector('[data-export-processor-row]');
    expect(processorRow).not.toBeNull();
    processorRow.querySelector('[data-export-outcome]').value = 'no_account_data';
    processorRow.querySelector('[data-export-evidence]').value =
      'processor-evidence-runtime-20260729';
    return processorRow.querySelector('[data-export-processor-save]');
  }
  const button = getAction(card, action);
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);
  return button;
}

function dispatchProgrammaticAction(harness, action) {
  const card = getCard(harness);
  let button;
  if (action === 'record_processor') {
    button = card.querySelector('[data-export-processor-save]');
    if (!button) {
      button = harness.document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-export-processor-save', '');
      card.appendChild(button);
    }
  } else {
    button = getAction(card, action);
    if (!button) {
      button = harness.document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-export-action', action);
      card.appendChild(button);
    }
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
  if (action === 'record_processor') {
    expect(card.querySelector('[data-export-processor-save]')).toBeNull();
  } else if (action === 'build' || action === 'retry') {
    expect(card.textContent).toMatch(/\bready\b/i);
    const buildOrRetry = card.querySelector(
      '[data-export-action="build"], [data-export-action="retry"]',
    );
    expect(buildOrRetry).not.toBeNull();
    expect(buildOrRetry.disabled).toBe(true);
  } else {
    expect(card.textContent).toMatch(/\bpurged\b/i);
    const purge = getAction(card, 'purge');
    expect(purge).not.toBeNull();
    expect(purge.disabled).toBe(true);
  }
  expect(harness.showToast).toHaveBeenCalledWith(
    expect.any(String),
    'success',
    2600,
  );
}

function expectMutationControlLocked(harness, action) {
  const card = getCard(harness);
  const control = action === 'record_processor'
    ? card.querySelector('[data-export-processor-save]')
    : getAction(card, action);
  expect(control === null || control.disabled).toBe(true);
}

afterEach(() => {
  while (activeHarnesses.length) {
    activeHarnesses.pop().window.close();
  }
});

describe('admin data-export ambiguous post-commit reconciliation', () => {
  test.each([
    ['record_processor', 'ok:false'],
    ['record_processor', 'throw'],
    ['build', 'ok:false'],
    ['build', 'throw'],
    ['retry', 'ok:false'],
    ['retry', 'throw'],
    ['purge', 'ok:false'],
    ['purge', 'throw'],
  ])('%s reconciles %s through exact Help lookup and read-only diagnose', async (action, ambiguity) => {
    const initialRow = action === 'purge'
      ? makeCleanupRow('delivered')
      : makeLinkedRow(action === 'retry' ? 'failed' : 'queued');
    const harness = createHarness(initialRow);
    await harness.ready();
    if (action === 'record_processor') await seedProcessorState(harness);
    harness.installAmbiguousMutation(
      action,
      ambiguity,
      reconciledDiagnoseResponse(action),
    );

    prepareMutationControl(harness, action).click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);

    dispatchProgrammaticAction(harness, action);
    await settle(6);
    expect(countActionCalls(harness.processDataExportSupplement, action)).toBe(1);
    expect(harness.processDataExportSupplement).toHaveBeenCalledTimes(1);

    harness.lookup.resolve([makeReconciledHelpRow(action)]);
    await waitForAtLeastCalls(harness.processDataExportSupplement, 2);
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processDataExportSupplement.mock.calls.map(([payload]) => payload.action))
      .toEqual([action, 'diagnose']);
    expect(harness.processDataExportSupplement.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        action: 'diagnose',
        help_request_id: HELP_REQUEST_ID,
      }),
    );
    if (action === 'purge') {
      expect(harness.processDataExportSupplement.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          artifact_ref: ARTIFACT_REF,
        }),
      );
    }
    expectPositivePostconditionUi(harness, action);
  });

  test.each([
    'record_processor',
    'build',
    'retry',
    'purge',
  ])('%s remains locked when diagnose does not prove its own postcondition', async (action) => {
    const initialRow = action === 'purge'
      ? makeCleanupRow('delivered')
      : makeLinkedRow(action === 'retry' ? 'failed' : 'queued');
    const harness = createHarness(initialRow);
    await harness.ready();
    if (action === 'record_processor') await seedProcessorState(harness);
    harness.installAmbiguousMutation(
      action,
      'ok:false',
      wrongDiagnoseResponse(action),
    );

    prepareMutationControl(harness, action).click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.resolve([makeReconciledHelpRow(action)]);
    await waitForAtLeastCalls(harness.processDataExportSupplement, 2);
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
    expectMutationControlLocked(harness, action);

    dispatchProgrammaticAction(harness, action);
    await settle(8);
    expect(countActionCalls(harness.processDataExportSupplement, action)).toBe(1);
    expect(harness.processDataExportSupplement.mock.calls.map(([payload]) => payload.action))
      .toEqual([action, 'diagnose']);
  });

  test('failed exact Help lookup leaves a thrown build outcome indeterminate and locked', async () => {
    const harness = createHarness(makeLinkedRow('queued'));
    await harness.ready();
    harness.installAmbiguousMutation(
      'build',
      'throw',
      reconciledDiagnoseResponse('build'),
    );

    prepareMutationControl(harness, 'build').click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.reject(new Error('help_lookup_unavailable'));
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processDataExportSupplement.mock.calls.map(([payload]) => payload.action))
      .toEqual(['build']);
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
    expectMutationControlLocked(harness, 'build');

    dispatchProgrammaticAction(harness, 'build');
    await settle(8);
    expect(countActionCalls(harness.processDataExportSupplement, 'build')).toBe(1);
  });

  test('failed read-only diagnose leaves an ok:false purge outcome indeterminate and locked', async () => {
    const harness = createHarness(makeCleanupRow('delivered'));
    await harness.ready();
    harness.installAmbiguousMutation(
      'purge',
      'ok:false',
      new Error('diagnose_unavailable'),
    );

    prepareMutationControl(harness, 'purge').click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    harness.lookup.resolve([makeReconciledHelpRow('purge')]);
    await waitForAtLeastCalls(harness.processDataExportSupplement, 2);
    await settle(12);

    expectExactLookup(harness);
    expect(harness.processDataExportSupplement.mock.calls.map(([payload]) => payload.action))
      .toEqual(['purge', 'diagnose']);
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
    expectMutationControlLocked(harness, 'purge');

    dispatchProgrammaticAction(harness, 'purge');
    await settle(8);
    expect(countActionCalls(harness.processDataExportSupplement, 'purge')).toBe(1);
  });
});
