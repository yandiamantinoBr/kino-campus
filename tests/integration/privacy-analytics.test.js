'use strict';

function loadPrivacyAnalytics() {
  const path = '../../assets/js/features/kc-privacy-analytics.js';
  delete window.KCPrivacyAnalytics;
  delete require.cache[require.resolve(path)];
  return require(path);
}

describe('kc-privacy-analytics.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/search-results.html?q=token');
    delete window.KCPrivacyAnalytics;
    delete window.KCSupabase;
    delete window.KCConsent;
  });

  test('bloqueia eventos opcionais sem consentimento analytics', async () => {
    const rpc = jest.fn();
    window.KCConsent = { hasConsent: jest.fn(() => false) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('search', { value: 'monitoria' });

    expect(result).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('sanitiza payload e envia evento opcional com sessao protegida', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    window.KCConsent = { hasConsent: jest.fn(() => true) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('search', {
      value: 'edital bolsa',
      query_length_bucket: '9_16',
      email: 'nao@exportar.test',
      token: 'secret',
      href: 'https://kinocampus.com.br/eventos.html?token=secret#x',
      page_path: '/search-results.html?q=edital',
      module_key: 'eventos',
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('kc_track_privacy_event');
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_event_name: 'search',
      p_page_path: '/search-results.html',
      p_module_key: 'eventos',
    });
    expect(rpc.mock.calls[0][1].p_session_id).toMatch(/^pa_/);
    expect(rpc.mock.calls[0][1].p_metadata).toMatchObject({
      module_key: 'eventos',
      query_length_bucket: '9_16',
    });
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('href');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('value');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('email');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('token');
  });

  test('nunca encaminha termo bruto em evento de busca', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    window.KCConsent = { hasConsent: jest.fn(() => true) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('search', {
      value: 'termo que nao pode sair',
      term: 'outro termo',
      query: 'consulta',
      source: 'results-submit',
      query_length_bucket: '17_32',
    });

    expect(result.ok).toBe(true);
    expect(rpc.mock.calls[0][1].p_metadata).toEqual({
      source: 'results-submit',
      query_length_bucket: '17_32',
    });
  });

  test('aceita eventos agregados de anuncios sem dados sensiveis', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    window.KCConsent = { hasConsent: jest.fn(() => true) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('ad_click', {
      entity_type: 'ad_campaign',
      entity_id: 'ad-1',
      entity_label: 'Campanha teste',
      source: 'feed_inline',
      token: 'nao-exportar',
      email: 'nao@exportar.test',
    });

    expect(result.ok).toBe(true);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_event_name: 'ad_click',
      p_entity_type: 'ad_campaign',
      p_entity_id: 'ad-1',
    });
    expect(rpc.mock.calls[0][1].p_metadata).toMatchObject({
      entity_label: 'Campanha teste',
      source: 'feed_inline',
    });
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('token');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('email');
  });

  test('descarta telefone, token longo e destino arbitrario antes da RPC', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    window.KCConsent = { hasConsent: jest.fn(() => true) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('ad_click', {
      entity_type: 'ad_campaign',
      entity_id: '11 99999-9999',
      entity_label: 'Contato 11 99999-9999',
      source: 'feed_inline',
      reason: 'A'.repeat(40),
      href: 'javascript:alert(1)',
    });

    expect(result.ok).toBe(true);
    expect(rpc.mock.calls[0][1].p_entity_id).toBeNull();
    expect(rpc.mock.calls[0][1].p_metadata).toEqual({ source: 'feed_inline' });
  });

  test('registra consentimento uma vez por assinatura de preferencias', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const prefs = {
      version: '2026-05-07',
      preferences: true,
      analytics: false,
      updatedAt: '2026-05-22T12:00:00.000Z',
      source: 'reject_optional',
    };

    await api.recordConsent(prefs);
    await api.recordConsent(prefs);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('kc_record_privacy_consent');
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_preferences: true,
      p_analytics: false,
      p_source: 'reject_optional',
    });
  });

  test('propaga rejeicao de dominio da RPC de analytics', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: false, code: 'INVALID_METADATA' }, error: null }));
    window.KCConsent = { hasConsent: jest.fn(() => true) };
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const result = await api.track('search', { value: 'edital' });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_METADATA' });
  });

  test('nao memoriza consentimento rejeitado pela RPC', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: { ok: false, code: 'INVALID_SESSION' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    window.KCSupabase = { getClient: () => ({ rpc }) };

    const api = loadPrivacyAnalytics();
    const prefs = {
      version: '2026-05-07',
      preferences: true,
      analytics: false,
      updatedAt: '2026-07-09T12:00:00.000Z',
      source: 'custom',
    };

    const first = await api.recordConsent(prefs);
    const second = await api.recordConsent(prefs);

    expect(first).toMatchObject({ ok: false, code: 'INVALID_SESSION' });
    expect(second).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
