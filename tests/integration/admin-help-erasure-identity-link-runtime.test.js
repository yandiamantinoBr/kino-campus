'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const CONTROLLER = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../assets/js/controllers/admin/admin-help-requests.controller.js',
  ),
  'utf8',
);

const ADMIN_USER = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
});
const HELP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const DATA_SUBJECT_REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const VALID_PROTOCOL = 'KC-DSR-20260729-AAAABBBBCCCCDDDD';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function recentLocalDateTimeInput(minutesAgo = 30) {
  const date = new Date(Date.now() - (minutesAgo * 60 * 1000));
  const localTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return localTime.toISOString().slice(0, 16);
}

async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
  await wait(0);
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  throw new Error(`condition_not_met_within_${timeoutMs}ms`);
}

function anonymousErasureTicket(overrides = {}) {
  return {
    id: HELP_ID,
    user_id: null,
    type: 'account_access',
    topic: 'onboarding_settings',
    subtopic: 'account_deletion',
    status: 'new',
    priority: 'normal',
    subject: 'Excluir minha conta e meus dados',
    message: 'Pedido legado sem titular Auth vinculado.',
    contact_email: 'verified.owner@example.test',
    allow_contact: true,
    page_path: '/settings.html',
    created_at: '2026-07-29T12:00:00.000Z',
    metadata: {
      request_kind: 'account_erasure',
      account_email: 'verified.owner@example.test',
      export_before_erasure: 'no_copy_needed',
    },
    ...overrides,
  };
}

function linkedErasureTicket() {
  return anonymousErasureTicket({
    user_id: TARGET_USER_ID,
    status: 'in_progress',
    metadata: {
      ...anonymousErasureTicket().metadata,
      identity_source: 'admin_verified_anonymous_erasure',
      protocol: VALID_PROTOCOL,
      data_subject_request_id: DATA_SUBJECT_REQUEST_ID,
    },
  });
}

function pageMarkup() {
  return `<!doctype html><html><body>
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
  </body></html>`;
}

async function createPage(options = {}) {
  const dom = new JSDOM(pageMarkup(), {
    url: 'https://www.kinocampus.com.br/admin/help-requests.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  let currentUser = ADMIN_USER;
  const showToast = jest.fn();
  const listAdminHelpRequests = jest.fn(
    options.listAdminHelpRequests
      || (async () => [anonymousErasureTicket()]),
  );
  const processAccountErasure = jest.fn(
    options.processAccountErasure
      || (async () => ({
        ok: true,
        linked: true,
        protocol: VALID_PROTOCOL,
      })),
  );
  const getCurrentUser = jest.fn(async () => currentUser);
  const profileMaybeSingle = jest.fn(async (_column, userId) => ({
    data: userId === ADMIN_USER.id ? { is_admin: true } : { is_admin: false },
    error: null,
  }));

  window.showToast = showToast;
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.console.error = jest.fn();
  window.KCHelpUtils = {};
  window.KCAPI = {
    ENV: { driver: 'supabase' },
    getCurrentUser,
    listAdminHelpRequests,
    processAccountErasure,
    updateAdminHelpRequest: jest.fn(async () => ({ ok: true })),
  };
  window.KCSupabase = {
    getClient: () => ({
      from: () => ({
        select: () => ({
          eq: (column, userId) => ({
            maybeSingle: () => profileMaybeSingle(column, userId),
          }),
        }),
      }),
    }),
  };

  window.eval(CONTROLLER);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await waitFor(() => listAdminHelpRequests.mock.calls.length === 1);
  await waitFor(() => window.document.querySelector(`[data-help-id="${HELP_ID}"]`));

  return {
    dom,
    window,
    showToast,
    listAdminHelpRequests,
    processAccountErasure,
    getCurrentUser,
    profileMaybeSingle,
    setCurrentUser(user) {
      currentUser = user;
    },
  };
}

function identityControls(window) {
  const card = window.document.querySelector(`[data-help-id="${HELP_ID}"]`);
  return {
    card,
    panel: card.querySelector('[data-lgpd-panel]'),
    email: card.querySelector('[data-lgpd-account-email]'),
    channel: card.querySelector('[data-lgpd-identity-channel]'),
    reference: card.querySelector('[data-lgpd-identity-reference]'),
    verifiedAt: card.querySelector('[data-lgpd-identity-at]'),
    attested: card.querySelector('[data-lgpd-identity-attested]'),
    link: card.querySelector('[data-lgpd-action="link_verified_identity"]'),
  };
}

function fillIdentityEvidence(window, overrides = {}) {
  const controls = identityControls(window);
  controls.email.value = overrides.email || 'Verified.Owner@Example.Test';
  controls.channel.value = overrides.channel || 'support_mailbox_reply';
  controls.reference.value = overrides.reference || 'mailbox-message-id-identity-123';
  controls.verifiedAt.value = overrides.verifiedAt || recentLocalDateTimeInput();
  controls.attested.checked = overrides.attested !== false;
  return controls;
}

describe('admin Help runtime - verified identity link for anonymous erasure tickets', () => {
  test('shows only the identity-link entry point and blocks every later workflow action', async () => {
    const page = await createPage({
      listAdminHelpRequests: async () => [anonymousErasureTicket({
        metadata: {
          ...anonymousErasureTicket().metadata,
          account_email: 'untrusted.metadata@example.test',
        },
      })],
    });
    try {
      const controls = identityControls(page.window);
      expect(controls.email.value).toBe('verified.owner@example.test');
      expect(controls.link).not.toBeNull();
      expect(controls.link.disabled).toBe(false);

      const laterActions = Array.from(
        controls.card.querySelectorAll('[data-lgpd-action]'),
      ).filter((button) => button.dataset.lgpdAction !== 'link_verified_identity');
      expect(laterActions).toHaveLength(0);
      expect(controls.card.querySelector('[data-lgpd-export]')).toBeNull();

      const forged = page.window.document.createElement('button');
      forged.type = 'button';
      forged.dataset.lgpdAction = 'diagnose';
      controls.card.appendChild(forged);
      forged.click();
      await settle();
      expect(page.processAccountErasure).not.toHaveBeenCalled();
    } finally {
      page.dom.window.close();
    }
  });

  test('coalesces concurrent clicks and sends the exact account/evidence payload', async () => {
    const pending = deferred();
    const page = await createPage({
      processAccountErasure: () => pending.promise,
    });
    try {
      const controls = fillIdentityEvidence(page.window);
      const click = () => controls.link.dispatchEvent(
        new page.window.MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      click();
      click();

      await waitFor(() => page.processAccountErasure.mock.calls.length === 1);
      expect(page.processAccountErasure).toHaveBeenCalledTimes(1);
      expect(controls.panel.getAttribute('aria-busy')).toBe('true');
      expect(Array.from(
        controls.panel.querySelectorAll('button, input, select, textarea'),
      ).every((control) => control.disabled)).toBe(true);

      const payload = page.processAccountErasure.mock.calls[0][0];
      const expectedVerifiedAt = new page.window.Date(
        controls.verifiedAt.value,
      ).toISOString();
      expect(payload).toMatchObject({
        action: 'link_verified_identity',
        actionKey: 'link_verified_identity',
        help_request_id: HELP_ID,
        helpRequestId: HELP_ID,
        account_email: 'verified.owner@example.test',
        accountEmail: 'verified.owner@example.test',
        target_email: 'verified.owner@example.test',
        targetEmail: 'verified.owner@example.test',
        identity_evidence: {
          channel: 'support_mailbox_reply',
          reference: 'mailbox-message-id-identity-123',
          verified_at: expectedVerifiedAt,
          attested: true,
        },
      });

      pending.resolve({ ok: true, linked: false, protocol: 'invalid' });
      await settle();
    } finally {
      page.dom.window.close();
    }
  });

  test('keeps destructive actions locked when the server response does not prove a valid link', async () => {
    const page = await createPage({
      processAccountErasure: async () => ({
        ok: true,
        linked: true,
        protocol: 'malformed-protocol',
        request: { status: 'diagnosed' },
      }),
    });
    try {
      const controls = fillIdentityEvidence(page.window);
      controls.link.click();
      await waitFor(() => page.processAccountErasure.mock.calls.length === 1);
      await waitFor(() => page.showToast.mock.calls.some(
        ([message, type]) => type === 'error'
          && /protocolo/i.test(String(message)),
      ));

      expect(page.listAdminHelpRequests).toHaveBeenCalledTimes(2);
      const rerendered = identityControls(page.window);
      // Protocol creation remains retryable; diagnose stays unavailable.
      expect(rerendered.link).not.toBeNull();
      expect(rerendered.link.disabled).toBe(false);
      expect(rerendered.card.querySelector('[data-lgpd-action="diagnose"]')).toBeNull();
      expect(page.showToast.mock.calls.some(([, type]) => type === 'success')).toBe(false);
    } finally {
      page.dom.window.close();
    }
  });

  test('allows protocol retry when the authoritative list has not confirmed the owner yet', async () => {
    const page = await createPage({
      processAccountErasure: async () => ({
        ok: true,
        linked: true,
        protocol: VALID_PROTOCOL,
        request: { status: 'diagnosed' },
      }),
    });
    try {
      fillIdentityEvidence(page.window).link.click();
      await waitFor(
        () => page.showToast.mock.calls.some(
          ([message, type]) => type === 'error'
            && /protocolo/i.test(String(message)),
        ),
        5000,
      );

      const rerendered = identityControls(page.window);
      expect(rerendered.link).not.toBeNull();
      // Do not trap the moderator: link stays available; diagnose stays closed.
      expect(rerendered.link.disabled).toBe(false);
      expect(rerendered.card.querySelector('[data-lgpd-action="diagnose"]')).toBeNull();
      expect(rerendered.card.querySelector('[data-lgpd-export]')).toBeNull();
      expect(page.showToast.mock.calls.some(([, type]) => type === 'success')).toBe(false);
    } finally {
      page.dom.window.close();
    }
  });

  test('shows the real server error without trapping protocol creation', async () => {
    const page = await createPage({
      processAccountErasure: async () => ({
        ok: false,
        error: { message: 'ERASURE_IDENTITY_DSR_NOT_UNIQUE' },
      }),
    });
    try {
      fillIdentityEvidence(page.window).link.click();
      await waitFor(() => page.processAccountErasure.mock.calls.length === 1);
      await waitFor(() => page.showToast.mock.calls.some(
        ([message, type]) => type === 'error'
          && /legado autenticado|protocolo DSR|materializ/i.test(String(message)),
      ));
      const rerendered = identityControls(page.window);
      expect(rerendered.link).not.toBeNull();
      expect(rerendered.link.disabled).toBe(false);
      expect(String(page.window.document.body.textContent || '')).not.toMatch(
        /Resultado anterior indeterminado/
      );
    } finally {
      page.dom.window.close();
    }
  });

  test('accepts a valid proof, reloads the authoritative ticket and unlocks later actions', async () => {
    let listAttempt = 0;
    const page = await createPage({
      listAdminHelpRequests: async () => {
        listAttempt += 1;
        return listAttempt === 1
          ? [anonymousErasureTicket()]
          : [linkedErasureTicket()];
      },
      processAccountErasure: async () => ({
        ok: true,
        linked: true,
        idempotent: false,
        protocol: VALID_PROTOCOL,
        data_subject_request_status: 'received',
        workflow_status: 'diagnosed',
        request: {
          status: 'diagnosed',
          metadata: {
            identity_assurance: {
              verified: true,
              source: 'admin_verified_anonymous_erasure',
            },
          },
        },
      }),
    });
    try {
      fillIdentityEvidence(page.window).link.click();
      await waitFor(() => page.listAdminHelpRequests.mock.calls.length === 2);
      await waitFor(() => (
        !page.window.document.querySelector(
          `[data-help-id="${HELP_ID}"] [data-lgpd-action="link_verified_identity"]`,
        )
      ));

      expect(page.showToast).toHaveBeenCalledWith(
        `Identidade vinculada ao protocolo ${VALID_PROTOCOL}.`,
        'success',
        2600,
      );
      const card = page.window.document.querySelector(`[data-help-id="${HELP_ID}"]`);
      expect(card.querySelector('[data-lgpd-action="link_verified_identity"]')).toBeNull();
      expect(card.querySelector('[data-lgpd-action="diagnose"]').disabled).toBe(false);
      expect(card.querySelector('[data-lgpd-export]').disabled).toBe(false);
    } finally {
      page.dom.window.close();
    }
  });

  test.each([
    ['logout', null],
    ['account switch', { id: '33333333-3333-4333-8333-333333333333' }],
  ])('ignores a late valid response after %s', async (_label, nextUser) => {
    const pending = deferred();
    const page = await createPage({
      processAccountErasure: () => pending.promise,
    });
    try {
      fillIdentityEvidence(page.window).link.click();
      await waitFor(() => page.processAccountErasure.mock.calls.length === 1);

      page.setCurrentUser(nextUser);
      page.window.document.dispatchEvent(new page.window.CustomEvent(
        'kc:authchange',
        { detail: { user: nextUser } },
      ));
      expect(page.window.document.querySelector('#helpRequestsList').children).toHaveLength(0);
      expect(page.window.document.querySelector('#admin-content').style.display).toBe('none');

      pending.resolve({
        ok: true,
        linked: true,
        protocol: VALID_PROTOCOL,
        request: { status: 'diagnosed' },
      });
      await settle(12);

      expect(page.listAdminHelpRequests).toHaveBeenCalledTimes(1);
      expect(page.window.document.querySelector('#helpRequestsList').children).toHaveLength(0);
      expect(page.window.document.body.textContent).not.toContain(VALID_PROTOCOL);
      expect(page.showToast.mock.calls.some(([, type]) => type === 'success')).toBe(false);
    } finally {
      page.dom.window.close();
    }
  });
});
