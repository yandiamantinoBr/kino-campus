'use strict';

const fs = require('fs');
const path = require('path');

const CONTROLLER = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../assets/js/controllers/admin/admin-help-requests.controller.js',
  ),
  'utf8',
);

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

async function waitForCall(mock, count) {
  for (let index = 0; index < 30 && mock.mock.calls.length < count; index += 1) {
    await settle(2);
  }
  expect(mock).toHaveBeenCalledTimes(count);
}

describe('admin help auth-bound PII isolation', () => {
  test('purges PII immediately and ignores late list/action results after logout or account switch', async () => {
    document.body.innerHTML = `
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
    `;

    const adminUser = { id: '11111111-1111-4111-8111-111111111111' };
    const sensitiveRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      user_id: adminUser.id,
      type: 'question',
      status: 'new',
      priority: 'normal',
      subject: 'Assunto pessoal sigiloso',
      message: 'Mensagem privada que deve sumir no logout',
      contact_email: 'titular@example.test',
      page_path: '/settings.html',
      allow_contact: true,
      metadata: {},
      created_at: '2026-07-29T12:00:00.000Z',
    };
    let currentUser = adminUser;
    let listMode = 'resolved';
    let lateList = deferred();
    let lateUpdate = deferred();

    const listAdminHelpRequests = jest.fn(() => {
      if (listMode === 'pending') return lateList.promise;
      return Promise.resolve([sensitiveRow]);
    });
    const updateAdminHelpRequest = jest.fn(() => lateUpdate.promise);
    const showToast = jest.fn();
    window.showToast = showToast;
    window.KCHelpUtils = {};
    window.KCAPI = {
      ENV: { driver: 'supabase' },
      getCurrentUser: jest.fn(async () => currentUser),
      listAdminHelpRequests,
      updateAdminHelpRequest,
    };
    window.KCSupabase = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: (_column, userId) => ({
              maybeSingle: async () => ({
                data: userId === adminUser.id ? { is_admin: true } : { is_admin: false },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    window.eval(CONTROLLER);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expect(document.body.textContent).toContain('Assunto pessoal sigiloso');
    expect(document.body.textContent).toContain('titular@example.test');
    expect(document.querySelector('#admin-content').style.display).toBe('block');

    listMode = 'pending';
    document.querySelector('#helpRefreshButton').click();
    await waitForCall(listAdminHelpRequests, 2);
    // Deliberately leave getCurrentUser() stale to prove event.detail.user is
    // the authoritative boundary for immediate logout isolation.
    document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user: null } }));

    expect(document.querySelector('#helpRequestsList').children).toHaveLength(0);
    expect(document.querySelector('#helpSummary').children).toHaveLength(0);
    expect(document.querySelector('#admin-content').style.display).toBe('none');
    expect(document.body.textContent).not.toContain('Assunto pessoal sigiloso');
    expect(document.body.textContent).not.toContain('titular@example.test');

    lateList.resolve([{
      ...sensitiveRow,
      subject: 'Resposta tardia da listagem',
    }]);
    await settle();
    expect(document.body.textContent).not.toContain('Resposta tardia da listagem');
    expect(document.querySelector('#admin-content').style.display).toBe('none');

    currentUser = adminUser;
    listMode = 'resolved';
    document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user: adminUser } }));
    await waitForCall(listAdminHelpRequests, 3);
    await settle();
    expect(document.body.textContent).toContain('Assunto pessoal sigiloso');

    const statusChip = document.querySelector('[data-help-status-set="triaged"]');
    expect(statusChip).not.toBeNull();
    statusChip.click();
    await waitForCall(updateAdminHelpRequest, 1);
    expect(updateAdminHelpRequest).toHaveBeenCalledWith(
      sensitiveRow.id,
      expect.objectContaining({ status: 'triaged', priority: 'normal' })
    );
    const nonAdminUser = { id: '22222222-2222-4222-8222-222222222222' };
    document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user: nonAdminUser } }));

    expect(document.querySelector('#helpRequestsList').children).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Mensagem privada que deve sumir no logout');
    lateUpdate.resolve({ ok: true });
    await settle();

    expect(document.body.textContent).not.toContain('Assunto pessoal sigiloso');
    expect(document.querySelector('#admin-content').style.display).toBe('none');
    // Chip triage is quiet on success; late update after logout must not toast either.
    expect(showToast).not.toHaveBeenCalledWith('Triagem atualizada.', 'success', 2600);
    expect(showToast.mock.calls.some((args) => String(args[0] || '').indexOf('Triagem atualizada') === 0)).toBe(false);
  });
});
