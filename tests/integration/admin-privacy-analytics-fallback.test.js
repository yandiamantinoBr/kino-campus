'use strict';

const controller = require('../../assets/js/controllers/admin/admin-privacy-analytics.controller.js');

function queryBuilder(result) {
  const builder = {};
  ['select', 'gte', 'order', 'limit', 'eq'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function filters() {
  return {
    since: '2026-06-01T00:00:00.000Z',
    eventName: 'all',
    pagePath: 'all',
    moduleKey: 'all',
    limit: 1000,
    offset: 0,
  };
}

describe('admin privacy analytics - disponibilidade do consentimento', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="privacySummary"></div>';
  });

  test('nao transforma tabela de consentimento ausente em zero confirmado', async () => {
    const analytics = queryBuilder({
      data: [{
        created_at: '2026-07-09T12:00:00.000Z',
        event_name: 'search',
        page_path: '/eventos.html',
        session_hash: 'session-1',
      }],
      error: null,
    });
    const consent = queryBuilder({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'privacy_consent_events'" },
    });
    const client = { from: jest.fn().mockReturnValueOnce(analytics).mockReturnValueOnce(consent) };

    const data = await controller.loadDirectPrivacyRows(client, filters());

    expect(data.totals.events).toBe(1);
    expect(data.consent).toMatchObject({
      data_available: false,
      analytics_accepted: 0,
      analytics_rejected: 0,
    });
    expect(data.notice).toContain('Histórico de consentimento indisponível');

    controller.renderSummary(data);
    expect(document.getElementById('privacySummary').textContent).toContain('N/D');
    expect(document.getElementById('privacySummary').textContent).toContain('histórico indisponível');
  });

  test('preserva zero quando a fonte existe e retorna conjunto vazio', async () => {
    const analytics = queryBuilder({ data: [], error: null });
    const consent = queryBuilder({ data: [], error: null });
    const client = { from: jest.fn().mockReturnValueOnce(analytics).mockReturnValueOnce(consent) };

    const data = await controller.loadDirectPrivacyRows(client, filters());

    expect(data.consent).toMatchObject({
      data_available: true,
      updates: 0,
      analytics_accepted: 0,
      analytics_rejected: 0,
    });
    expect(controller.consentExportValue(data.consent, 'updates')).toBe(0);
  });

  test('marca dados da RPC administrativa como disponiveis', async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          ok: true,
          totals: { events: 12 },
          consent: { updates: 3, analytics_accepted: 2, analytics_rejected: 1 },
        },
        error: null,
      }),
    };

    const data = await controller.loadDataViaRpcFallbackAware(client, filters());

    expect(data.consent).toEqual({
      data_available: true,
      updates: 3,
      analytics_accepted: 2,
      analytics_rejected: 1,
    });
  });

  test('exporta indisponivel em vez de inventar contagem', () => {
    const consent = { data_available: false, updates: 0 };
    expect(controller.consentExportValue(consent, 'updates')).toBe('Indisponível');
  });
});
