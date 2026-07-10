/*
 * KinoCampus - Privacy Analytics
 * Eventos opcionais, agregáveis e sem cookies crus.
 */
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KCPrivacyAnalytics = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
  'use strict';

  const VERSION = '2026-05-22';
  const SESSION_KEY = 'kc_privacy_analytics_session_v1';
  const CONSENT_SIGNATURE_KEY = 'kc_privacy_consent_recorded_v1';
  const EVENT_NAMES = Object.freeze([
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'ad_impression',
    'ad_click',
    'help_open',
    'help_submit',
    'report_submit',
  ]);
  const ALLOWED_METADATA_KEYS = Object.freeze([
    'source',
    'value',
    'status',
    'reason',
    'module_key',
    'module',
    'category_key',
    'category',
    'entity_label',
    'href',
    'period',
    'consent_source',
  ]);
  const SENSITIVE_KEY_RE = /(cookie|token|password|secret|authorization|session|email|user_agent|useragent|ip|jwt|supabase|refresh)/i;

  const memoryStorage = (function () {
    const state = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
      },
      setItem(key, value) {
        state[key] = String(value);
      },
      removeItem(key) {
        delete state[key];
      }
    };
  }());

  function getStorage() {
    try {
      const key = '__kc_privacy_analytics_storage__';
      root.localStorage.setItem(key, '1');
      root.localStorage.removeItem(key);
      return root.localStorage;
    } catch (_) {
      return memoryStorage;
    }
  }

  function getClient() {
    try {
      if (root.KCSupabase && typeof root.KCSupabase.getClient === 'function') {
        return root.KCSupabase.getClient();
      }
    } catch (_) { }
    return null;
  }

  function hasAnalyticsConsent() {
    try {
      return !!(root.KCConsent
        && typeof root.KCConsent.hasConsent === 'function'
        && root.KCConsent.hasConsent('analytics'));
    } catch (_) {
      return false;
    }
  }

  function randomToken() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') {
        return root.crypto.randomUUID();
      }
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        root.crypto.getRandomValues(bytes);
        return Array.from(bytes).map((n) => n.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { }
    return String(Date.now()) + '-' + String(Math.random()).slice(2);
  }

  function getSessionId() {
    const storage = getStorage();
    const current = storage.getItem(SESSION_KEY);
    if (current && current.length >= 12 && current.length <= 128) return current;
    const next = 'pa_' + randomToken();
    try { storage.setItem(SESSION_KEY, next); } catch (_) { }
    return next;
  }

  function sanitizeEventName(value) {
    const eventName = String(value || '').trim().toLowerCase();
    return EVENT_NAMES.indexOf(eventName) >= 0 ? eventName : '';
  }

  function sanitizeScalar(value, maxLength) {
    if (value == null) return '';
    if (typeof value === 'object') return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength || 120);
  }

  function sanitizePath(value) {
    const fallback = root.location && root.location.pathname ? root.location.pathname : '/';
    const raw = value ? String(value) : fallback;
    try {
      const url = new URL(raw, root.location && root.location.origin ? root.location.origin : 'https://kinocampus.com.br');
      return sanitizeScalar(url.pathname || '/', 180) || '/';
    } catch (_) {
      const path = raw.split('?')[0].split('#')[0];
      return sanitizeScalar(path || fallback, 180) || '/';
    }
  }

  function sanitizeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value), root.location && root.location.origin ? root.location.origin : 'https://kinocampus.com.br');
      url.hash = '';
      url.search = '';
      return sanitizeScalar(url.href, 260);
    } catch (_) {
      return '';
    }
  }

  function sanitizeMetadata(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const output = {};
    ALLOWED_METADATA_KEYS.forEach((key) => {
      if (SENSITIVE_KEY_RE.test(key)) return;
      const value = source[key];
      if (value == null || value === '') return;
      if (key === 'href') {
        const href = sanitizeUrl(value);
        if (href) output.href = href;
        return;
      }
      output[key] = sanitizeScalar(value, key === 'value' || key === 'entity_label' ? 180 : 80);
    });

    if (!output.module_key && source.moduleKey) output.module_key = sanitizeScalar(source.moduleKey, 64);
    if (!output.category_key && source.categoryKey) output.category_key = sanitizeScalar(source.categoryKey, 64);
    return output;
  }

  async function track(eventName, payload) {
    const name = sanitizeEventName(eventName);
    if (!name) return { ok: false, code: 'INVALID_EVENT' };
    if (!hasAnalyticsConsent()) return { ok: false, code: 'CONSENT_REQUIRED' };

    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return { ok: false, code: 'NO_CLIENT' };

    const source = payload && typeof payload === 'object' ? payload : {};
    const args = {
      p_event_name: name,
      p_session_id: getSessionId(),
      p_page_path: sanitizePath(source.page_path || source.pagePath),
      p_entity_type: sanitizeScalar(source.entity_type || source.entityType, 64) || null,
      p_entity_id: sanitizeScalar(source.entity_id || source.entityId, 128) || null,
      p_module_key: sanitizeScalar(source.module_key || source.moduleKey || source.module, 64) || null,
      p_metadata: sanitizeMetadata(source),
    };

    try {
      const response = await client.rpc('kc_track_privacy_event', args);
      if (response && response.error) return { ok: false, error: response.error };
      const data = response && response.data;
      if (data && data.ok === false) return { ok: false, code: data.code || 'RPC_REJECTED', data };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function buildConsentSignature(preferences) {
    const prefs = preferences && typeof preferences === 'object' ? preferences : {};
    return [
      prefs.version || '',
      prefs.preferences === true ? '1' : '0',
      prefs.analytics === true ? '1' : '0',
      prefs.advertising === true ? '1' : '0',
      prefs.source || '',
      String(prefs.updatedAt || '').slice(0, 19),
    ].join('|');
  }

  async function recordConsent(preferences) {
    const prefs = preferences && typeof preferences === 'object' ? preferences : null;
    if (!prefs) return { ok: false, code: 'NO_CONSENT_STATE' };

    const signature = buildConsentSignature(prefs);
    const storage = getStorage();
    if (storage.getItem(CONSENT_SIGNATURE_KEY) === signature) {
      return { ok: true, skipped: true };
    }

    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return { ok: false, code: 'NO_CLIENT' };

    try {
      const response = await client.rpc('kc_record_privacy_consent', {
        p_session_id: getSessionId(),
        p_consent_version: sanitizeScalar(prefs.version || VERSION, 32),
        p_preferences: prefs.preferences === true,
        p_analytics: prefs.analytics === true,
        p_source: sanitizeScalar(prefs.source || 'user', 48),
      });
      if (response && response.error) return { ok: false, error: response.error };
      const data = response && response.data;
      if (data && data.ok === false) return { ok: false, code: data.code || 'RPC_REJECTED', data };
      try { storage.setItem(CONSENT_SIGNATURE_KEY, signature); } catch (_) { }
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function recordCurrentConsent() {
    try {
      if (root.KCConsent && typeof root.KCConsent.getPreferences === 'function') {
        const prefs = root.KCConsent.getPreferences();
        if (prefs) recordConsent(prefs).catch(function () { });
      }
    } catch (_) { }
  }

  function bindConsentListener() {
    if (!root.addEventListener || root.__kcPrivacyConsentBound) return;
    root.__kcPrivacyConsentBound = true;
    root.addEventListener('kc:consentchange', function (event) {
      const prefs = event && event.detail && event.detail.preferences;
      recordConsent(prefs).catch(function () { });
    });
  }

  function trackBannerFromElement(eventName, banner, cta) {
    if (!banner) return;
    const title = banner.querySelector('h1');
    track(eventName, {
      entity_type: 'banner',
      entity_id: banner.getAttribute('data-kc-banner-id') || banner.getAttribute('data-kc-banner-title') || '',
      entity_label: title ? title.textContent : banner.getAttribute('data-kc-banner-title') || '',
      href: cta ? cta.getAttribute('href') : '',
      page_path: sanitizePath(),
      source: 'hero',
    }).catch(function () { });
  }

  function bindBannerTracking() {
    const doc = root.document;
    if (!doc || doc.__kcPrivacyBannerBound) return;
    doc.__kcPrivacyBannerBound = true;
    const seen = new Set();

    function scanActiveBanner() {
      const banner = doc.querySelector('.kc-hero-carousel .kc-hero-banner.active');
      if (!banner) return;
      const key = banner.getAttribute('data-kc-banner-id') || banner.getAttribute('data-kc-banner-title') || banner.textContent.slice(0, 80);
      if (!key || seen.has(key)) return;
      seen.add(key);
      trackBannerFromElement('banner_impression', banner, banner.querySelector('.kc-btn-primary'));
    }

    doc.addEventListener('click', function (event) {
      const cta = event.target && event.target.closest && event.target.closest('.kc-hero-carousel .kc-btn-primary');
      if (!cta) return;
      trackBannerFromElement('banner_click', cta.closest('.kc-hero-banner'), cta);
    }, true);

    if (root.MutationObserver) {
      try {
        const target = doc.getElementById('kc-hero-slides') || doc.body;
        const observer = new root.MutationObserver(function () { scanActiveBanner(); });
        observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-kc-banners-signature'] });
      } catch (_) { }
    }
    setTimeout(scanActiveBanner, 800);
  }

  function init() {
    bindConsentListener();
    recordCurrentConsent();
    bindBannerTracking();
  }

  if (root && root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  return Object.freeze({
    VERSION,
    EVENT_NAMES,
    STORAGE_KEYS: Object.freeze({ SESSION_KEY, CONSENT_SIGNATURE_KEY }),
    hasAnalyticsConsent,
    sanitizeEventName,
    sanitizePath,
    sanitizeMetadata,
    track,
    recordConsent,
    init,
  });
}));
