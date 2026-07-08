/*
  KinoCampus - kc-events.js v8.6.4

  Helper padronizado para enviar eventos customizados ao Google Analytics 4
  (carregado por kc-google-tag.js).

  - SEMPRE respeita consentimento LGPD: se o usuario nao aceitou "Metricas"
    em KCConsent, o evento e descartado silenciosamente.
  - API publica: window.KCEvents.track(name, params) / trackOnce / trackTiming
  - Eventos sao prefixados com 'kc_' para evitar conflito com eventos reservados
    do Google (login, purchase, sign_up, etc.).
  - Parametros em snake_case; valores em lowercase.
  - Buffer local (max 50) em window.KCEvents.queue para debug quando consent
    for negado (nao e enviado pro GA, mas fica em memoria).
*/
(function () {
  'use strict';

  var MAX_BUFFER = 50;
  var DEBUG = false;

  function hasConsent() {
    try {
      return !!(
        window.KCConsent &&
        typeof window.KCConsent.hasConsent === 'function' &&
        window.KCConsent.hasConsent('analytics')
      );
    } catch (_) {
      return false;
    }
  }

  function gtagAvailable() {
    return typeof window.gtag === 'function';
  }

  function sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    var out = Object.create(null);
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      // Privacy: nunca envie PII (email, telefone, cpf, etc.)
      var lowerKey = String(k).toLowerCase();
      if (/email|phone|cpf|senha|password|token|secret|auth|whatsapp|number/.test(lowerKey)) {
        if (DEBUG) console.warn('[KCEvents] drop PII param:', k);
        return;
      }
      if (typeof v === 'string') {
        out[k] = v.slice(0, 120); // cap strings
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else if (Array.isArray(v)) {
        out[k] = v.slice(0, 20).map(function (x) {
          return typeof x === 'string' ? x.slice(0, 60) : String(x);
        });
      } else {
        out[k] = String(v).slice(0, 200);
      }
    });
    return out;
  }

  function pushToQueue(name, params, reason) {
    if (!window.KCEvents.queue) window.KCEvents.queue = [];
    if (window.KCEvents.queue.length >= MAX_BUFFER) window.KCEvents.queue.shift();
    window.KCEvents.queue.push({
      name: name,
      params: params,
      timestamp: Date.now(),
      dropped_reason: reason,
    });
  }

  function track(name, params) {
    if (!name || typeof name !== 'string') return false;
    var safeName = String(name).toLowerCase().slice(0, 40);
    if (safeName.indexOf('kc_') !== 0) safeName = 'kc_' + safeName;
    var safeParams = sanitizeParams(params);
    if (!gtagAvailable()) {
      pushToQueue(safeName, safeParams, 'gtag_unavailable');
      if (DEBUG) console.warn('[KCEvents] gtag not loaded, queued:', safeName);
      return false;
    }
    if (!hasConsent()) {
      pushToQueue(safeName, safeParams, 'no_consent');
      if (DEBUG) console.warn('[KCEvents] no analytics consent, queued:', safeName);
      return false;
    }
    try {
      window.gtag('event', safeName, safeParams);
      return true;
    } catch (e) {
      pushToQueue(safeName, safeParams, 'gtag_threw');
      if (DEBUG) console.warn('[KCEvents] gtag threw:', e);
      return false;
    }
  }

  // Track only first occurrence per session
  function trackOnce(name, params) {
    if (!window.KCEvents._once) window.KCEvents._once = Object.create(null);
    var key = String(name).toLowerCase();
    if (window.KCEvents._once[key]) return false;
    window.KCEvents._once[key] = true;
    return track(name, params);
  }

  // Track timing (uses gtag timing API)
  function trackTiming(name, valueMs, label) {
    if (!gtagAvailable() || !hasConsent()) {
      pushToQueue('timing_' + name, { value_ms: valueMs, label: label }, 'timing_no_consent');
      return false;
    }
    try {
      window.gtag('event', 'timing_complete', {
        name: 'kc_' + String(name).toLowerCase().slice(0, 30),
        value: Math.round(valueMs),
        event_category: 'kc_performance',
        event_label: String(label || '').slice(0, 60),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Wrap a function to track duration
  function trackEngagement(name, fn) {
    var start = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    var done = function (result) {
      var end = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
      track(name, { duration_ms: Math.round(end - start) });
      return result;
    };
    try {
      var ret = fn();
      if (ret && typeof ret.then === 'function') {
        return ret.then(done, function (err) {
          track(name, { duration_ms: Math.round(((window.performance && window.performance.now) || Date.now()) - start), status: 'error' });
          throw err;
        });
      }
      done(ret);
      return ret;
    } catch (e) {
      track(name, { duration_ms: Math.round(((window.performance && window.performance.now) || Date.now()) - start), status: 'error' });
      throw e;
    }
  }

  // Helper for sending page_view with custom title (for SPA-like navigation)
  function trackPageView(path, title) {
    if (!gtagAvailable() || !hasConsent()) return false;
    try {
      window.gtag('event', 'page_view', {
        page_path: String(path || '').slice(0, 200),
        page_title: String(title || document.title || '').slice(0, 200),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Auto-update consent on kc:consentchange (already wired by kc-google-tag)
  // (no-op here — kept in one place)

  window.KCEvents = Object.freeze({
    track: track,
    trackOnce: trackOnce,
    trackTiming: trackTiming,
    trackEngagement: trackEngagement,
    trackPageView: trackPageView,
    hasConsent: hasConsent,
    enableDebug: function () { DEBUG = true; },
    getQueue: function () { return (window.KCEvents.queue || []).slice(); },
    clearQueue: function () { window.KCEvents.queue = []; },
  });
})();