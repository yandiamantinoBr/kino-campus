'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'assets', 'js', 'boot', 'kc-events.js'),
  'utf8'
);

function loadEvents() {
  window.eval(source);
  return window.KCEvents;
}

describe('KCEvents privacy and queue robustness', () => {
  beforeEach(() => {
    delete window.KCEvents;
    delete window.KCConsent;
    delete window.gtag;
  });

  test('queues safely when gtag is unavailable and clearQueue works on the frozen API', () => {
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(Object.isFrozen(events)).toBe(true);
    expect(() => events.track('kc_search', { search_source: 'search', query_length_bucket: '2_4' })).not.toThrow();
    expect(events.track('kc_logout', {})).toBe(false);
    expect(events.getQueue()).toHaveLength(2);
    expect(events.getQueue()[0]).toMatchObject({
      name: 'kc_search',
      dropped_reason: 'gtag_unavailable',
    });

    expect(() => events.clearQueue()).not.toThrow();
    expect(events.getQueue()).toEqual([]);
  });

  test('queues safely when analytics consent is denied', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => false };
    const events = loadEvents();

    expect(events.track('kc_search', { search_source: 'search', query_length_bucket: '2_4' })).toBe(false);
    expect(window.gtag).not.toHaveBeenCalled();
    expect(events.getQueue()).toHaveLength(1);
    expect(events.getQueue()[0].dropped_reason).toBe('no_consent');
    expect(() => events.trackTiming('load', 25, 'test')).not.toThrow();
    expect(events.getQueue()).toHaveLength(2);
  });

  test('accepts apenas os buckets anônimos de resultado de busca', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(events.track('kc_search_outcome', {
      search_source: 'results',
      search_outcome: 'zero_results',
      result_count_bucket: 'zero',
      search_latency_bucket: '250ms_1s',
      term: 'nunca deve sair',
    })).toBe(true);
    expect(window.gtag).toHaveBeenCalledWith('event', 'kc_search_outcome', {
      search_source: 'results',
      search_outcome: 'zero_results',
      result_count_bucket: 'zero',
      search_latency_bucket: '250ms_1s',
    });
  });

  test('trackOnce keeps its state in the closure without mutating the frozen API', () => {
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(() => events.trackOnce('kc_logout', {})).not.toThrow();
    expect(events.trackOnce('kc_logout', {})).toBe(false);
    expect(events.getQueue()).toHaveLength(1);
    expect(events._once).toBeUndefined();
    expect(events.queue).toBeUndefined();
  });

  test('drops private identifiers and obvious PII values while preserving public post_id', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    const publicPostId = 'post-5562999999999';
    expect(events.track('kc_post_create', {
      item_id: publicPostId,
      module: 'eventos',
      content_type: 'post',
      publication_status: 'published',
      comment_id: 'comment-public-1',
      conversation_id: 'conversation-private-1',
      peer_id: 'peer-private-1',
      user_id: 'user-private-1',
      other_user_id: 'other-user-private-1',
      search_term: 'moradia',
      term: 'livros',
      q: 'carona',
      detail_a: 'ana.silva@ufg.br',
      detail_b: '+55 (62) 99999-9999',
      detail_c: 'access_token=abcdef1234567890',
      detail_d: 'token=abcdef1234567890',
      safe_date: '2026-07-14',
      auth_state: 'member',
      audiences: ['member', 'ana.silva@ufg.br', '+55 (62) 99999-9999'],
    })).toBe(true);

    const params = window.gtag.mock.calls[0][2];
    expect(params).toMatchObject({
      item_id: publicPostId,
      module: 'eventos',
      content_type: 'post',
      publication_status: 'published',
    });
    expect(params).not.toHaveProperty('post_id');
    expect(params).not.toHaveProperty('comment_id');
    expect(params).not.toHaveProperty('safe_date');
    expect(params).not.toHaveProperty('auth_state');
    expect(params).not.toHaveProperty('audiences');
    expect(params).not.toHaveProperty('conversation_id');
    expect(params).not.toHaveProperty('peer_id');
    expect(params).not.toHaveProperty('user_id');
    expect(params).not.toHaveProperty('other_user_id');
    expect(params).not.toHaveProperty('search_term');
    expect(params).not.toHaveProperty('term');
    expect(params).not.toHaveProperty('q');
    expect(params).not.toHaveProperty('detail_a');
    expect(params).not.toHaveProperty('detail_b');
    expect(params).not.toHaveProperty('detail_c');
    expect(params).not.toHaveProperty('detail_d');
    expect(events.track('kc_future_unreviewed', { source: 'ga4-dashboard' })).toBe(false);
    expect(window.gtag).toHaveBeenCalledTimes(1);
  });

  test('sends only allowlisted GA4 recommended events without a kc_ prefix', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(events.trackRecommended('login', { method: 'email' })).toBe(true);
    expect(window.gtag).toHaveBeenCalledWith('event', 'login', expect.objectContaining({ method: 'email' }));
    expect(events.trackRecommended('purchase', { value: 1 })).toBe(false);
    expect(window.gtag).toHaveBeenCalledTimes(1);
  });

  test('rejects PII disguised as a public content identifier', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(events.trackRecommended('share', {
      item_id: 'ana.silva@ufg.br',
      content_type: 'post',
    })).toBe(true);

    expect(window.gtag.mock.calls[0][2]).toMatchObject({ content_type: 'post' });
    expect(window.gtag.mock.calls[0][2]).not.toHaveProperty('item_id');
  });

  test('applies the same value filtering to timing and manual page-view helpers', () => {
    window.gtag = jest.fn();
    window.KCConsent = { hasConsent: () => true };
    const events = loadEvents();

    expect(events.trackTiming('load', 25, 'ana.silva@ufg.br')).toBe(true);
    expect(events.trackPageView('/profile', 'Contato +55 (62) 99999-9999')).toBe(true);

    const timingParams = window.gtag.mock.calls[0][2];
    const pageViewParams = window.gtag.mock.calls[1][2];
    expect(timingParams).not.toHaveProperty('event_label');
    expect(pageViewParams).toMatchObject({ page_path: '/profile' });
    expect(pageViewParams).not.toHaveProperty('page_title');
  });

  test('flushes queued product events after analytics consent is granted', () => {
    window.gtag = jest.fn();
    let analytics = false;
    window.KCConsent = { hasConsent: (key) => key === 'analytics' ? analytics : false };
    const events = loadEvents();

    expect(events.track('kc_search', { search_source: 'search', query_length_bucket: '2_4' })).toBe(false);
    expect(events.track('kc_post_view', {
      post_id: '11111111-1111-4111-8111-111111111111',
      module: 'eventos',
      content_type: 'post',
    })).toBe(false);
    expect(events.getQueue()).toHaveLength(2);
    expect(window.gtag).not.toHaveBeenCalled();

    analytics = true;
    window.dispatchEvent(new CustomEvent('kc:consentchange', {
      detail: { preferences: { analytics: true } },
    }));

    expect(events.getQueue()).toHaveLength(0);
    // At least the two queued product events; module_view may also fire once for the path.
    expect(window.gtag.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'kc_search',
      expect.objectContaining({ search_source: 'search', query_length_bucket: '2_4' }),
    );
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'kc_post_view',
      expect.objectContaining({
        post_id: '11111111-1111-4111-8111-111111111111',
        module: 'eventos',
        content_type: 'post',
      }),
    );
    expect(typeof events.flushQueue).toBe('function');
  });
});
