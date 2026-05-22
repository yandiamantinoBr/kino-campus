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
      value: 'edital bolsa',
      href: 'https://kinocampus.com.br/eventos.html',
      module_key: 'eventos',
    });
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('email');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('token');
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
});
