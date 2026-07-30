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
const OTHER_USER = { id: '22222222-2222-4222-8222-222222222222' };
const COPY_REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PORTABILITY_REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DATA_SUBJECT_REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ARTIFACT_REF = 'KEA-ABCDEF0123456789ABCDEF0123456789';

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

function makeRequestRow(options = {}) {
  const subtopic = options.subtopic || 'account_data_copy';
  const requestKind = subtopic === 'account_data_portability'
    ? 'data_portability'
    : 'data_access_copy';
  return {
    id: options.id || COPY_REQUEST_ID,
    user_id: Object.prototype.hasOwnProperty.call(options, 'user_id')
      ? options.user_id
      : null,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic,
    status: 'new',
    priority: 'normal',
    subject: options.subject || 'Solicitação LGPD',
    message: options.message || 'Quero receber todos os meus dados.',
    contact_email: options.contact_email || 'Titular.Canonico@Example.test',
    page_path: '/settings.html',
    allow_contact: true,
    metadata: {
      request_kind: requestKind,
      account_email: 'metadata-envenenada@attacker.test',
      email: 'outro-metadado@attacker.test',
      ...(options.metadata || {}),
    },
    created_at: '2026-07-29T12:00:00.000Z',
  };
}

function validLinkResponse() {
  return {
    ok: true,
    linked: true,
    request: {
      protocol: 'KC-DSR-20260729-ABCDEF0123456789',
    },
    artifact: {
      artifact_ref: ARTIFACT_REF,
      status: 'queued',
      blocking_processor_count: 0,
    },
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
  let currentUser = ADMIN_USER;
  const listAdminHelpRequests = jest.fn(async () => currentRows);
  const processDataExportSupplement = jest.fn(
    processImplementation || (async () => validLinkResponse()),
  );
  const showToast = jest.fn();

  window.showToast = showToast;
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.KCHelpUtils = {};
  window.KCAPI = {
    ENV: { driver: 'supabase' },
    getCurrentUser: jest.fn(async () => currentUser),
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
    listAdminHelpRequests,
    processDataExportSupplement,
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

function getRequestCard(harness, id = COPY_REQUEST_ID) {
  return harness.document.querySelector(`[data-help-id="${id}"]`);
}

function fillIdentityEvidence(harness, id = COPY_REQUEST_ID) {
  const card = getRequestCard(harness, id);
  expect(card).not.toBeNull();
  const panel = card.querySelector('[data-export-identity-link]');
  expect(panel).not.toBeNull();

  const identityChannel = panel.querySelector('[data-export-identity-channel]');
  const identityReference = panel.querySelector('[data-export-identity-reference]');
  const identityAt = panel.querySelector('[data-export-identity-at]');
  const identityAttested = panel.querySelector('[data-export-identity-attested]');
  const verifiedAtInput = toLocalDateTimeInput(new Date(Date.now() - 60 * 1000));

  identityChannel.value = 'support_mailbox_reply';
  identityReference.value = 'support-message-id-20260729';
  identityAt.value = verifiedAtInput;
  identityAttested.checked = true;

  return {
    card,
    button: panel.querySelector('[data-export-action="link_verified_ticket"]'),
    expectedVerifiedAt: new Date(verifiedAtInput).toISOString(),
  };
}

function expectSupplementStillBlocked(harness, id = COPY_REQUEST_ID) {
  const card = getRequestCard(harness, id);
  expect(card).not.toBeNull();
  expect(card.querySelector('[data-export-identity-link]')).not.toBeNull();
  expect(card.querySelector('[data-export-action="link_verified_ticket"]')).not.toBeNull();
  expect(card.querySelector('[data-export-action="diagnose"]')).toBeNull();
  expect(card.querySelector('[data-export-action="build"]')).toBeNull();
  expect(card.querySelector('[data-export-action="retry"]')).toBeNull();
  expect(card.querySelector('[data-export-action="purge"]')).toBeNull();
}

afterEach(() => {
  while (activeHarnesses.length) {
    activeHarnesses.pop().window.close();
  }
});

describe('admin data-export supplement canonical runtime gate', () => {
  test('anonymous copy and portability tickets only expose identity linking and trust contact_email', async () => {
    const copyRow = makeRequestRow();
    const portabilityRow = makeRequestRow({
      id: PORTABILITY_REQUEST_ID,
      subtopic: 'account_data_portability',
      contact_email: 'Portabilidade.Canonica@Example.test',
    });
    const harness = createHarness([copyRow, portabilityRow]);
    await harness.ready();

    const expectations = [
      {
        id: COPY_REQUEST_ID,
        email: 'titular.canonico@example.test',
        kind: 'data_access_copy',
      },
      {
        id: PORTABILITY_REQUEST_ID,
        email: 'portabilidade.canonica@example.test',
        kind: 'data_portability',
      },
    ];

    expectations.forEach(({ id, email, kind }) => {
      const card = getRequestCard(harness, id);
      const panel = card.querySelector('[data-export-supplement-panel]');
      expect(panel).not.toBeNull();
      expect(panel.querySelector('[data-export-account-email]').value).toBe(email);
      expect(panel.querySelector('[data-export-request-kind]').value).toBe(kind);
      expect(panel.querySelectorAll('[data-export-action]')).toHaveLength(1);
      expectSupplementStillBlocked(harness, id);
    });
    expect(harness.processDataExportSupplement).not.toHaveBeenCalled();
  });

  test('sends canonical account and complete identity evidence, but malformed success cannot reload or unlock', async () => {
    const response = deferred();
    const harness = createHarness(
      [makeRequestRow()],
      () => response.promise,
    );
    await harness.ready();

    const { button, expectedVerifiedAt } = fillIdentityEvidence(harness);
    button.click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);

    expect(harness.processDataExportSupplement).toHaveBeenCalledTimes(1);
    expect(harness.processDataExportSupplement).toHaveBeenCalledWith({
      action: 'link_verified_ticket',
      help_request_id: COPY_REQUEST_ID,
      account_email: 'titular.canonico@example.test',
      request_kind: 'data_access_copy',
      identity_channel: 'support_mailbox_reply',
      identity_reference: 'support-message-id-20260729',
      identity_verified_at: expectedVerifiedAt,
      identity_attested: true,
    });
    expect(
      harness.document.querySelector(
        `[data-help-id="${COPY_REQUEST_ID}"] [data-export-action="link_verified_ticket"]`,
      ).disabled,
    ).toBe(true);

    response.resolve({
      ok: true,
      linked: true,
      request: { protocol: 'protocolo-malformado' },
      artifact: { artifact_ref: 'artefato-malformado' },
    });
    await settle(12);

    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(2);
    expectSupplementStillBlocked(harness);
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/não confirmou o vínculo completo/i),
      'error',
      2600,
    );
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/Identidade vinculada ao protocolo/i),
      'success',
      2600,
    );
  });

  test('coalesces a synchronous double click into one identity-link request', async () => {
    const response = deferred();
    const harness = createHarness(
      [makeRequestRow()],
      () => response.promise,
    );
    await harness.ready();

    const { button } = fillIdentityEvidence(harness);
    button.click();
    button.click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);
    await settle(4);

    response.resolve({
      ok: true,
      linked: false,
      request: {},
      artifact: {},
    });
    await settle(8);

    expect(harness.processDataExportSupplement).toHaveBeenCalledTimes(1);
    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(2);
    expectSupplementStillBlocked(harness);
  });

  test('valid response stays blocked on anonymous reload, then canonical owner and DSR UUID unlock operations', async () => {
    const anonymousRow = makeRequestRow();
    const canonicalRow = makeRequestRow({
      user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      metadata: {
        data_subject_request_id: DATA_SUBJECT_REQUEST_ID,
        identity_source: 'admin_verified_anonymous_ticket',
        export_artifact_ref: ARTIFACT_REF,
        export_artifact_status: 'queued',
      },
    });
    const harness = createHarness(
      [anonymousRow],
      async () => validLinkResponse(),
    );
    await harness.ready();

    let identity = fillIdentityEvidence(harness);
    identity.button.click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);

    expectSupplementStillBlocked(harness);
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/não confirmou o vínculo completo/i),
      'error',
      2600,
    );
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/Identidade vinculada ao protocolo/i),
      'success',
      2600,
    );

    harness.setRows([canonicalRow]);
    harness.document.querySelector('#helpRefreshButton').click();
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 3);
    await settle(8);

    const refreshedCard = getRequestCard(harness);
    expect(refreshedCard.querySelector('[data-export-identity-link]')).toBeNull();
    expect(refreshedCard.querySelector('[data-export-action="link_verified_ticket"]')).toBeNull();
    expect(refreshedCard.querySelector('[data-export-action="diagnose"]').disabled).toBe(false);
    expect(refreshedCard.querySelector('[data-export-action="build"]').disabled).toBe(false);
    expect(refreshedCard.textContent).not.toMatch(/resultado indeterminado/i);
  });

  test.each([
    ['logout', null],
    ['account switch', OTHER_USER],
  ])('%s ignores a late successful identity-link response', async (_label, nextUser) => {
    const response = deferred();
    const harness = createHarness(
      [makeRequestRow()],
      () => response.promise,
    );
    await harness.ready();

    const { button } = fillIdentityEvidence(harness);
    button.click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);

    harness.document.dispatchEvent(
      new harness.window.CustomEvent('kc:authchange', {
        detail: { user: nextUser },
      }),
    );
    expect(harness.document.querySelector('#helpRequestsList').children).toHaveLength(0);
    expect(harness.document.querySelector('#admin-content').style.display).toBe('none');

    response.resolve(validLinkResponse());
    await settle(12);

    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(1);
    expect(harness.document.querySelector('#helpRequestsList').children).toHaveLength(0);
    expect(harness.document.querySelector('#admin-content').style.display).toBe('none');
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/Identidade vinculada ao protocolo/i),
      'success',
      2600,
    );
  });
});
