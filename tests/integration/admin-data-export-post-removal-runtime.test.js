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
const DATA_SUBJECT_REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

function makeCleanupRow(options = {}) {
  return {
    id: HELP_REQUEST_ID,
    user_id: null,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_data_copy',
    status: 'resolved',
    priority: 'normal',
    subject: 'Solicitação de dados atendida',
    message: 'Conta removida; resta somente a retenção controlada do artefato.',
    contact_email: 'lgpd-redacted@redacted.kinocampus.local',
    page_path: null,
    allow_contact: false,
    metadata: {
      request_kind: 'data_access_copy',
      data_subject_request_id: DATA_SUBJECT_REQUEST_ID,
      identity_source: 'admin_verified_anonymous_ticket',
      export_artifact_ref: String(options.artifactRef || ARTIFACT_REF).toLowerCase(),
      export_artifact_status: options.status || 'delivered',
      ...(options.expiresAt
        ? { export_artifact_expires_at: options.expiresAt }
        : {}),
    },
    created_at: '2026-07-29T10:00:00.000Z',
  };
}

function makeOtherAdminRow() {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    user_id: ADMIN_B.id,
    type: 'question',
    topic: 'other',
    subtopic: null,
    status: 'new',
    priority: 'normal',
    subject: 'Fila nova do administrador B',
    message: 'O retorno tardio do expurgo anterior não pode substituir esta fila.',
    contact_email: 'admin-b-ticket@example.test',
    page_path: '/help.html',
    allow_contact: true,
    metadata: {},
    created_at: '2026-07-29T13:00:00.000Z',
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
  const listAdminHelpRequests = jest.fn(async (filters = {}) => {
    const requestId = String(filters.requestId || filters.request_id || '').trim();
    return requestId
      ? currentRows.filter((row) => String(row && row.id || '') === requestId)
      : currentRows;
  });
  const processDataExportSupplement = jest.fn(
    processImplementation || (async () => ({
      ok: true,
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'purged',
      },
    })),
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

function getCard(harness) {
  return harness.document.querySelector(`[data-help-id="${HELP_REQUEST_ID}"]`);
}

function expectCleanupOnlyPanel(harness, purgeEnabled) {
  const card = getCard(harness);
  expect(card).not.toBeNull();
  expect(card.querySelector('[data-export-identity-link]')).toBeNull();
  expect(card.querySelector('[data-export-action="link_verified_ticket"]')).toBeNull();

  const diagnose = card.querySelector('[data-export-action="diagnose"]');
  const buildOrRetry = card.querySelector(
    '[data-export-action="build"], [data-export-action="retry"]',
  );
  const purge = card.querySelector('[data-export-action="purge"]');
  expect(diagnose).not.toBeNull();
  expect(diagnose.disabled).toBe(true);
  expect(buildOrRetry).not.toBeNull();
  expect(buildOrRetry.disabled).toBe(true);
  expect(card.querySelector('[data-export-processor-save]')).toBeNull();
  expect(purge).not.toBeNull();
  expect(purge.disabled).toBe(!purgeEnabled);

  const enabledSupplementControls = Array.from(card.querySelectorAll(
    '[data-export-action], [data-export-processor-save]',
  )).filter((control) => !control.disabled);
  expect(enabledSupplementControls).toEqual(purgeEnabled ? [purge] : []);
  return { card, purge };
}

function dispatchForgedSupplementAction(harness, action) {
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
    button = card.querySelector(`[data-export-action="${action}"]`);
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

afterEach(() => {
  while (activeHarnesses.length) {
    activeHarnesses.pop().window.close();
  }
});

describe('admin data-export post-removal cleanup-only runtime gate', () => {
  test.each([
    ['failed', undefined],
    ['expired', undefined],
    ['delivered', undefined],
    ['ready', new Date(Date.now() - 60 * 60 * 1000).toISOString()],
    ['download_reserved', new Date(Date.now() - 60 * 60 * 1000).toISOString()],
  ])('status %s permite somente purge e envia artifact_ref canônico', async (status, expiresAt) => {
    const harness = createHarness([makeCleanupRow({ status, expiresAt })]);
    await harness.ready();

    const { purge } = expectCleanupOnlyPanel(harness, true);
    purge.click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);

    expect(harness.processDataExportSupplement).toHaveBeenCalledTimes(2);
    expect(harness.processDataExportSupplement.mock.calls[0][0]).toEqual({
      action: 'purge',
      help_request_id: HELP_REQUEST_ID,
      artifact_ref: ARTIFACT_REF,
    });
    expect(harness.processDataExportSupplement.mock.calls[1][0]).toEqual({
      action: 'diagnose',
      help_request_id: HELP_REQUEST_ID,
      artifact_ref: ARTIFACT_REF,
    });
    expect(harness.listAdminHelpRequests.mock.calls[1][0]).toMatchObject({
      requestId: HELP_REQUEST_ID,
      limit: 1,
      offset: 0,
    });
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Expurgo do artefato.*confirmado/i),
      'success',
      2600,
    );
  });

  test.each([
    ['queued', undefined],
    ['ready', new Date(Date.now() + 60 * 60 * 1000).toISOString()],
    ['download_reserved', new Date(Date.now() + 60 * 60 * 1000).toISOString()],
  ])('status %s ainda não elegível bloqueia purge até por dispatch', async (status, expiresAt) => {
    const harness = createHarness([makeCleanupRow({ status, expiresAt })]);
    await harness.ready();

    const { purge } = expectCleanupOnlyPanel(harness, false);
    purge.dispatchEvent(new harness.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }));
    await settle(12);

    expect(harness.processDataExportSupplement).not.toHaveBeenCalled();
    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(1);
  });

  test('forged relink, diagnose, build, retry and processor evidence remain blocked', async () => {
    const harness = createHarness([makeCleanupRow({ status: 'delivered' })]);
    await harness.ready();

    expectCleanupOnlyPanel(harness, true);
    for (const action of [
      'link_verified_ticket',
      'diagnose',
      'build',
      'retry',
      'record_processor',
    ]) {
      dispatchForgedSupplementAction(harness, action);
      await settle(6);
    }

    expect(harness.processDataExportSupplement).not.toHaveBeenCalled();
    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(1);
  });

  test('troca de administrador ignora retorno tardio do purge e não reconcilia a fila antiga', async () => {
    const lateResponse = deferred();
    const harness = createHarness(
      [makeCleanupRow({ status: 'delivered' })],
      () => lateResponse.promise,
    );
    await harness.ready();

    const { purge } = expectCleanupOnlyPanel(harness, true);
    purge.click();
    await waitForAtLeastCalls(harness.processDataExportSupplement, 1);

    harness.setRows([makeOtherAdminRow()]);
    harness.setCurrentUser(ADMIN_B);
    harness.document.dispatchEvent(
      new harness.window.CustomEvent('kc:authchange', {
        detail: { user: ADMIN_B },
      }),
    );
    await waitForAtLeastCalls(harness.listAdminHelpRequests, 2);
    await settle(8);
    expect(harness.document.body.textContent).toContain('Fila nova do administrador B');

    lateResponse.resolve({
      ok: true,
      artifact: {
        artifact_ref: ARTIFACT_REF,
        status: 'purged',
        warning: 'RETORNO_TARDIO_NAO_DEVE_APARECER',
      },
    });
    await settle(12);

    expect(harness.processDataExportSupplement).toHaveBeenCalledWith({
      action: 'purge',
      help_request_id: HELP_REQUEST_ID,
      artifact_ref: ARTIFACT_REF,
    });
    expect(harness.listAdminHelpRequests).toHaveBeenCalledTimes(2);
    expect(harness.listAdminHelpRequests.mock.calls.some(
      ([filters]) => filters && filters.requestId === HELP_REQUEST_ID,
    )).toBe(false);
    expect(harness.document.body.textContent).toContain('Fila nova do administrador B');
    expect(harness.document.body.textContent).not.toContain('RETORNO_TARDIO_NAO_DEVE_APARECER');
    expect(harness.showToast).not.toHaveBeenCalledWith(
      expect.any(String),
      'success',
      2600,
    );
  });
});
