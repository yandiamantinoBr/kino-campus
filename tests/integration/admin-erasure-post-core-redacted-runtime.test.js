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

const ADMIN_A = { id: '11111111-1111-4111-8111-111111111111' };
const ADMIN_B = { id: '22222222-2222-4222-8222-222222222222' };
const HELP_REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ERASURE_REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBJECT_HASH = 'c'.repeat(64);
const ERASED_AT = '2026-07-29T12:00:00.000Z';
const REDACTED_EMAIL = `lgpd-${SUBJECT_HASH.slice(0, 12)}@redacted.kinocampus.local`;
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
  for (let index = 0; index < 40 && mock.mock.calls.length < count; index += 1) {
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

function makeCanonicalRedactedRow() {
  return {
    id: HELP_REQUEST_ID,
    user_id: null,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_deletion',
    subject: 'Solicitacao LGPD atendida',
    message: 'Conteudo removido por solicitacao LGPD.',
    priority: 'normal',
    status: 'resolved',
    page_path: null,
    contact_email: REDACTED_EMAIL,
    allow_contact: false,
    admin_status: 'na',
    admin_decided_at: null,
    admin_decided_by: null,
    admin_note: null,
    metadata: {
      request_kind: 'account_erasure',
      lgpd_erasure: {
        request_id: ERASURE_REQUEST_ID,
        subject_hash: SUBJECT_HASH,
        erased_at: ERASED_AT,
        contact_redacted: true,
        content_redacted: true,
        postcondition_version: 2,
      },
    },
    created_at: '2026-07-28T10:00:00.000Z',
  };
}

function makeOtherAdminRow() {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    user_id: ADMIN_B.id,
    type: 'question',
    topic: 'other',
    subtopic: null,
    subject: 'Fila exclusiva do administrador B',
    message: 'O retorno do administrador anterior não pode substituir esta linha.',
    priority: 'normal',
    status: 'new',
    page_path: '/help.html',
    contact_email: 'novo-admin@example.test',
    allow_contact: true,
    metadata: {},
    created_at: '2026-07-29T13:00:00.000Z',
  };
}

function sanitizedDiagnostics() {
  return {
    counts: {
      profiles: 0,
      posts: 0,
      help_requests: 1,
    },
    identity_assurance: {
      verified: true,
      source: 'stored_verified_identity',
      requires_manual_evidence: false,
    },
    external_processors: [{
      provider: 'processor_for_runtime_test',
      treatment: 'delete_or_document_retention',
      status: 'manual_policy_follow_up',
    }],
    warnings: [],
    blockers: [],
  };
}

function postCoreDiagnosticResponse() {
  return {
    ok: true,
    action: 'diagnose',
    request: {
      status: 'failed',
      erased_at: ERASED_AT,
      metadata: {
        auth_deleted: true,
        failure_stage: 'final_workflow',
        notification_pending: false,
      },
    },
    diagnostics: sanitizedDiagnostics(),
    target: {
      subject_hash: SUBJECT_HASH,
      user_found: false,
    },
  };
}

function finalWorkflowFailureAdapterResponse() {
  return {
    ok: false,
    error: {
      message: 'final_workflow_failed',
      body: {
        ok: false,
        error: 'final_workflow_failed',
        retryable: true,
        next_action: 'retry_finalize',
        request: {
          status: 'failed',
          erased_at: ERASED_AT,
          metadata: {
            auth_deleted: true,
            failure_stage: 'final_workflow',
            notification_pending: false,
          },
        },
      },
    },
  };
}

function postCoreNotificationDiagnosticResponse() {
  return {
    ok: true,
    action: 'diagnose',
    request: {
      status: 'erased',
      erased_at: ERASED_AT,
      metadata: {
        auth_deleted: true,
        retryable: true,
        failure_stage: null,
        notification_pending: true,
        completion_email_status: 'draft_only',
      },
    },
    diagnostics: sanitizedDiagnostics(),
    target: {
      subject_hash: SUBJECT_HASH,
      user_found: false,
    },
  };
}

function completionNotificationPendingDirectResponse() {
  return {
    ok: false,
    error: 'completion_notification_pending',
    retryable: true,
    next_action: 'retry_finalize',
    request: postCoreNotificationDiagnosticResponse().request,
  };
}

function sanitizedErasedResponse(action = 'retry_finalize') {
  const receipt = {
    request_id: ERASURE_REQUEST_ID,
    subject_hash: SUBJECT_HASH,
    status: 'erased',
    result: 'account_erased',
    erased_at: ERASED_AT,
    finalized_at: '2026-07-29T12:05:00.000Z',
  };
  return {
    ok: true,
    action,
    request: {
      status: 'erased',
      erased_at: ERASED_AT,
      metadata: {
        auth_deleted: true,
        notification_pending: false,
        retryable: false,
        failure_stage: null,
        completion_email_status: 'sent',
      },
      receipt,
    },
    receipt,
    diagnostics: sanitizedDiagnostics(),
    target: {
      subject_hash: SUBJECT_HASH,
      user_found: false,
    },
    warnings: [],
  };
}

function createHarness(initialRows, processImplementation) {
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
  let currentRows = initialRows;
  let currentUser = ADMIN_A;
  const listAdminHelpRequests = jest.fn(async () => currentRows);
  const processAccountErasure = jest.fn(
    processImplementation || (async ({ action }) => sanitizedErasedResponse(action)),
  );
  const exportReportPDF = jest.fn(async () => ({ ok: true }));
  const showToast = jest.fn();

  window.showToast = showToast;
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.KCHelpUtils = {};
  window.KCAdminExport = {
    exportReportPDF,
    exportReportXLSX: jest.fn(async () => ({ ok: true })),
  };
  window.KCAPI = {
    ENV: { driver: 'supabase' },
    getCurrentUser: jest.fn(async () => currentUser),
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
              data: {
                is_admin: userId === ADMIN_A.id || userId === ADMIN_B.id,
              },
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
    listAdminHelpRequests,
    processAccountErasure,
    updateAdminHelpRequest: window.KCAPI.updateAdminHelpRequest,
    exportReportPDF,
    showToast,
    setRows(nextRows) {
      currentRows = nextRows;
    },
    setCurrentUser(nextUser) {
      currentUser = nextUser;
    },
    async ready() {
      await waitForAtLeastCalls(listAdminHelpRequests, 1);
      await settle();
    },
  };
}

function getCard(harness) {
  return harness.document.querySelector(`[data-help-id="${HELP_REQUEST_ID}"]`);
}

function getAction(card, action) {
  return card.querySelector(`[data-lgpd-action="${action}"]`);
}

function expectActionEnabled(card, action) {
  const button = getAction(card, action);
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);
}

function expectActionBlocked(card, action) {
  const button = getAction(card, action);
  expect(button === null || button.disabled).toBe(true);
}

function ensureDataControl(card, attribute, options = {}) {
  let control = card.querySelector(`[${attribute}]`);
  if (!control) {
    control = card.ownerDocument.createElement(options.tag || 'input');
    control.setAttribute(attribute, '');
    if (options.type) control.type = options.type;
    card.appendChild(control);
  }
  if (control.tagName === 'SELECT' && options.value) {
    let option = Array.from(control.options).find((item) => item.value === options.value);
    if (!option) {
      option = card.ownerDocument.createElement('option');
      option.value = options.value;
      option.textContent = options.value;
      control.appendChild(option);
    }
  }
  if (Object.prototype.hasOwnProperty.call(options, 'value')) {
    control.value = options.value;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'checked')) {
    control.checked = options.checked;
  }
  return control;
}

function primeAllPreCoreEvidence(card) {
  const recent = toLocalDateTimeInput(new Date(Date.now() - 60 * 1000));
  ensureDataControl(card, 'data-lgpd-account-email', {
    type: 'email',
    value: REDACTED_EMAIL,
  });
  ensureDataControl(card, 'data-lgpd-identity-channel', {
    tag: 'select',
    value: 'support_mailbox_reply',
  });
  ensureDataControl(card, 'data-lgpd-identity-reference', {
    value: 'identity-evidence-runtime-20260729',
  });
  ensureDataControl(card, 'data-lgpd-identity-at', {
    type: 'datetime-local',
    value: recent,
  });
  ensureDataControl(card, 'data-lgpd-identity-attested', {
    type: 'checkbox',
    checked: true,
  });
  ensureDataControl(card, 'data-lgpd-delivery-reference', {
    value: 'delivery-evidence-runtime-20260729',
  });
  ensureDataControl(card, 'data-lgpd-delivery-at', {
    type: 'datetime-local',
    value: recent,
  });
  ensureDataControl(card, 'data-lgpd-delivery-attested', {
    type: 'checkbox',
    checked: true,
  });
  ensureDataControl(card, 'data-lgpd-cancellation-reason', {
    value: 'cancelamento programático que deve ser bloqueado',
  });
  ensureDataControl(card, 'data-lgpd-evidence-reference', {
    value: 'erasure-evidence-runtime-20260729',
  });
  ensureDataControl(card, 'data-lgpd-evidence-at', {
    type: 'datetime-local',
    value: recent,
  });
  ensureDataControl(card, 'data-lgpd-evidence-attested', {
    type: 'checkbox',
    checked: true,
  });
  ensureDataControl(card, 'data-lgpd-confirmation', {
    value: `EXCLUIR ${REDACTED_EMAIL}`,
  });
  ensureDataControl(card, 'data-lgpd-copy-decision', {
    tag: 'select',
    value: 'no_copy_needed',
  });
  ensureDataControl(card, 'data-lgpd-copy-reference', {
    value: 'copy-decision-runtime-20260729',
  });
  ensureDataControl(card, 'data-lgpd-copy-at', {
    type: 'datetime-local',
    value: recent,
  });
  ensureDataControl(card, 'data-lgpd-copy-attested', {
    type: 'checkbox',
    checked: true,
  });
}

function dispatchForgedAction(harness, action) {
  const card = getCard(harness);
  primeAllPreCoreEvidence(card);
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

function fillProviderEvidence(card) {
  const recent = toLocalDateTimeInput(new Date(Date.now() - 60 * 1000));
  const outcome = card.querySelector(
    '[data-lgpd-provider-outcome][data-provider="processor_for_runtime_test"]',
  );
  expect(outcome).not.toBeNull();
  outcome.value = 'deleted';
  ensureDataControl(card, 'data-lgpd-provider-reference', {
    value: 'provider-review-runtime-20260729',
  });
  ensureDataControl(card, 'data-lgpd-provider-at', {
    type: 'datetime-local',
    value: recent,
  });
  ensureDataControl(card, 'data-lgpd-provider-attested', {
    type: 'checkbox',
    checked: true,
  });
}

afterEach(() => {
  while (activeHarnesses.length) {
    activeHarnesses.pop().window.close();
  }
});

describe('admin account erasure post-core redacted runtime gate', () => {
  test('canonical redacted Help never offers relinking and exposes only post-core operations', async () => {
    const harness = createHarness([makeCanonicalRedactedRow()]);
    await harness.ready();

    const card = getCard(harness);
    expect(card).not.toBeNull();
    expect(card.querySelector('[data-lgpd-action="link_verified_identity"]')).toBeNull();
    expect(card.querySelector('[data-lgpd-account-email]')).toBeNull();

    ['apply_reversible', 'record_confirmation_delivery', 'cancel_reversible', 'erase_confirmed']
      .forEach((action) => expectActionBlocked(card, action));
    ['diagnose', 'generate_receipt']
      .forEach((action) => expectActionEnabled(card, action));
    expectActionBlocked(card, 'retry_finalize');

    const exportButton = card.querySelector('[data-lgpd-export]');
    expect(exportButton).not.toBeNull();
    expect(exportButton.disabled).toBe(false);
  });

  test.each([
    'link_verified_identity',
    'apply_reversible',
    'record_confirmation_delivery',
    'cancel_reversible',
    'erase_confirmed',
  ])('programmatic %s dispatch cannot cross the post-core gate', async (action) => {
    const harness = createHarness([makeCanonicalRedactedRow()]);
    await harness.ready();

    dispatchForgedAction(harness, action);
    await settle(12);

    expect(harness.processAccountErasure).not.toHaveBeenCalled();
  });

  test('diagnose, receipt and export remain usable while sanitized erased status is preserved', async () => {
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      async ({ action }) => (
        action === 'diagnose'
          ? postCoreDiagnosticResponse()
          : sanitizedErasedResponse(action)
      ),
    );
    await harness.ready();

    let card = getCard(harness);
    getAction(card, 'diagnose').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await settle(8);

    card = getCard(harness);
    expectActionEnabled(card, 'generate_receipt');
    getAction(card, 'generate_receipt').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 2);
    await settle(8);

    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual(['diagnose', 'generate_receipt']);
    card = getCard(harness);
    expect(card.querySelector('[data-lgpd-action="link_verified_identity"]')).toBeNull();
    expect(card.textContent).toMatch(/Exclusão executada/i);
    expect(card.textContent).toMatch(/Núcleo excluído\s*Sim/i);
    expect(card.textContent).toMatch(/Fluxo integral finalizado\s*Sim/i);
    ['apply_reversible', 'record_confirmation_delivery', 'cancel_reversible', 'erase_confirmed']
      .forEach((action) => expectActionBlocked(card, action));

    const exportButton = card.querySelector('[data-lgpd-export]');
    expect(exportButton.disabled).toBe(false);
    const archive = card.querySelector('[data-help-status-set="archived"]');
    expect(archive).not.toBeNull();
    expect(archive.disabled).toBe(false);
    expect(archive.hasAttribute('data-help-status-locked')).toBe(false);
    exportButton.click();
    await waitForAtLeastCalls(harness.exportReportPDF, 1);
    await settle(4);

    expect(harness.processAccountErasure).toHaveBeenCalledTimes(2);
    const [fileName, report] = harness.exportReportPDF.mock.calls[0];
    expect(fileName).toMatch(/^kc-lgpd-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(report.filters.status_lgpd).toMatch(/Exclusão confirmada executada/i);
    const receiptSection = report.sections.find(
      (section) => section && section.title === 'Recibo interno',
    );
    expect(receiptSection).toBeDefined();
    expect(receiptSection.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        campo: 'Status LGPD',
        valor: 'Exclusão confirmada executada',
      }),
      expect.objectContaining({
        campo: 'Identificador pseudônimo do titular',
        valor: SUBJECT_HASH,
      }),
    ]));
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toContain('auth_delete_checkpoint');
    expect(serializedReport).not.toContain('target_user_id');
    expect(serializedReport).not.toContain('accountEmail');
  });

  test('direct post-core export obtains authoritative diagnostics instead of fabricating zeros', async () => {
    const response = sanitizedErasedResponse('diagnose');
    response.diagnostics.counts.posts = 7;
    response.diagnostics.counts.post_media = 11;
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      async ({ action }) => {
        if (action !== 'diagnose') throw new Error(`unexpected action: ${action}`);
        return response;
      },
    );
    await harness.ready();

    getCard(harness).querySelector('[data-lgpd-export]').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await waitForAtLeastCalls(harness.exportReportPDF, 1);
    await settle(4);

    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual(['diagnose']);
    const report = harness.exportReportPDF.mock.calls[0][1];
    expect(report.kpis.publicacoes).toBe(7);
    expect(report.kpis.midias).toBe(11);
    expect(JSON.stringify(report)).not.toContain('post_core_export');
  });

  test('notification pending blocks manual Help closure after core erasure', async () => {
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      async ({ action }) => {
        if (action === 'diagnose') return postCoreNotificationDiagnosticResponse();
        throw new Error(`unexpected action: ${action}`);
      },
    );
    await harness.ready();

    getAction(getCard(harness), 'diagnose').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await settle(8);
    const archive = getCard(harness).querySelector('[data-help-status-set="archived"]');
    expect(archive).not.toBeNull();
    expect(archive.disabled).toBe(true);
    expect(archive.getAttribute('data-help-status-locked')).toBe('1');
    expect(archive.getAttribute('title')).toMatch(/comprovante final/i);
    archive.click();
    await settle(8);

    expect(harness.updateAdminHelpRequest).not.toHaveBeenCalled();
  });

  test('final_workflow_failed with auth_deleted keeps retry available without relinking', async () => {
    let retryAttempt = 0;
    let finalized = false;
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      async ({ action }) => {
        if (action === 'diagnose') {
          return finalized
            ? sanitizedErasedResponse(action)
            : postCoreDiagnosticResponse();
        }
        if (action === 'retry_finalize') {
          retryAttempt += 1;
          if (retryAttempt === 1) return finalWorkflowFailureAdapterResponse();
          finalized = true;
          return sanitizedErasedResponse(action);
        }
        throw new Error(`unexpected action: ${action}`);
      },
    );
    await harness.ready();

    getAction(getCard(harness), 'diagnose').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await settle(8);

    let card = getCard(harness);
    fillProviderEvidence(card);
    getAction(card, 'retry_finalize').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 3);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);

    card = getCard(harness);
    expect(card.querySelector('[data-lgpd-action="link_verified_identity"]')).toBeNull();
    expectActionEnabled(card, 'retry_finalize');
    ['apply_reversible', 'cancel_reversible', 'erase_confirmed']
      .forEach((action) => expectActionBlocked(card, action));
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/final_workflow_failed/i),
      'error',
      2600,
    );

    fillProviderEvidence(card);
    getAction(card, 'retry_finalize').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 5);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 3);
    await settle(8);

    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual([
        'diagnose',
        'retry_finalize',
        'diagnose',
        'retry_finalize',
        'diagnose',
      ]);
    card = getCard(harness);
    expect(card.querySelector('[data-lgpd-action="link_verified_identity"]')).toBeNull();
    expect(card.textContent).toMatch(/Exclusão executada/i);
  });

  test('2xx retryable notification response remains recoverable only after matching diagnose', async () => {
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      async ({ action }) => {
        if (action === 'diagnose') return postCoreNotificationDiagnosticResponse();
        if (action === 'retry_finalize') {
          return completionNotificationPendingDirectResponse();
        }
        throw new Error(`unexpected action: ${action}`);
      },
    );
    await harness.ready();

    getAction(getCard(harness), 'diagnose').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);
    await settle(8);

    let card = getCard(harness);
    fillProviderEvidence(card);
    getAction(card, 'retry_finalize').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 3);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);

    expect(harness.processAccountErasure.mock.calls.map(([payload]) => payload.action))
      .toEqual(['diagnose', 'retry_finalize', 'diagnose']);
    card = getCard(harness);
    expectActionEnabled(card, 'retry_finalize');
    expect(card.textContent).not.toMatch(/resultado indeterminado/i);
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/SMTP|entrega/i),
      'error',
      2600,
    );
  });

  test('admin switch discards a late post-core response without repainting the new queue', async () => {
    const lateResponse = deferred();
    const harness = createHarness(
      [makeCanonicalRedactedRow()],
      () => lateResponse.promise,
    );
    await harness.ready();

    getAction(getCard(harness), 'diagnose').click();
    await waitForAtLeastCalls(harness.processAccountErasure, 1);

    harness.setRows([makeOtherAdminRow()]);
    harness.setCurrentUser(ADMIN_B);
    harness.document.dispatchEvent(
      new harness.window.CustomEvent('kc:authchange', {
        detail: { user: ADMIN_B },
      }),
    );
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);
    expect(harness.document.body.textContent).toContain('Fila exclusiva do administrador B');

    const response = sanitizedErasedResponse('diagnose');
    response.warnings = ['RETORNO_TARDIO_NAO_DEVE_APARECER'];
    lateResponse.resolve(response);
    await settle(12);

    expect(harness.document.body.textContent).toContain('Fila exclusiva do administrador B');
    expect(harness.document.body.textContent).not.toContain('RETORNO_TARDIO_NAO_DEVE_APARECER');
    expect(harness.document.body.textContent).not.toContain('Exclusão executada');
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'success',
      2600,
    );
    expect(harness.processAccountErasure).toHaveBeenCalledTimes(1);
  });
});
