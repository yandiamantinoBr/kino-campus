/**
 * kc-speed-insights.js — Vercel Speed Insights (+ quiet Analytics boot)
 *
 * Injects Vercel performance telemetry. Failures from content blockers are
 * expected and must not spam the console or affect app functionality.
 *
 * @see https://vercel.com/docs/speed-insights
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var DEBUG = false;
  try {
    DEBUG = !!(window.localStorage && window.localStorage.getItem('kc_debug_telemetry') === '1');
  } catch (_) {
    DEBUG = false;
  }

  function logDebug(message) {
    if (!DEBUG || !console || typeof console.debug !== 'function') return;
    console.debug('[KinoCampus][telemetry]', message);
  }

  function isDevelopment() {
    try {
      var host = window.location.hostname || '';
      return host === 'localhost' || host === '127.0.0.1' || host.indexOf('preview') !== -1;
    } catch (_) {
      return false;
    }
  }

  function ensureQueue(name, queueName) {
    if (typeof window[name] === 'function') return;
    window[name] = function () {
      var q = window[queueName] || (window[queueName] = []);
      q.push(arguments);
    };
  }

  function alreadyInjected(srcFragment) {
    return !!(document.head && document.head.querySelector('script[src*="' + srcFragment + '"]'));
  }

  function injectScript(src, meta) {
    if (!document.head || alreadyInjected(src)) return;
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    if (meta && meta.sdkn) script.dataset.sdkn = meta.sdkn;
    if (meta && meta.sdkv) script.dataset.sdkv = meta.sdkv;
    // Content blockers (uBlock, etc.) produce net::ERR_BLOCKED_BY_CLIENT.
    // That is expected and not an application fault — stay silent by default.
    script.onerror = function () {
      logDebug('Blocked or failed to load: ' + src);
    };
    script.onload = function () {
      logDebug('Loaded: ' + src);
    };
    document.head.appendChild(script);
  }

  function injectSpeedInsights() {
    ensureQueue('si', 'siq');
    var src = isDevelopment()
      ? 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
      : '/_vercel/speed-insights/script.js';
    injectScript(src, {
      sdkn: '@vercel/speed-insights/vanilla',
      sdkv: '2.0.0'
    });
  }

  // Static <script src="/_vercel/insights/script.js"> tags also get blocked by
  // ad blockers. Prefer this quiet injector when the page has not already loaded it.
  function injectWebAnalytics() {
    ensureQueue('va', 'vaq');
    if (alreadyInjected('/_vercel/insights/script.js') || alreadyInjected('vercel-insights')) return;
    injectScript('/_vercel/insights/script.js', {
      sdkn: '@vercel/analytics/vanilla',
      sdkv: '1.0.0'
    });
  }

  function hasAnalyticsConsent() {
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

  function bootIfConsented() {
    // Speed Insights and Web Analytics are optional telemetry. They must not
    // establish a network connection until the visitor explicitly allows
    // analytics in the KinoCampus consent manager.
    if (!hasAnalyticsConsent()) return;
    injectSpeedInsights();
    injectWebAnalytics();
  }

  function handleConsentChange(event) {
    var preferences = event && event.detail && event.detail.preferences;
    if (preferences && preferences.analytics !== true) return;
    bootIfConsented();
  }

  window.addEventListener('kc:consentchange', handleConsentChange);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootIfConsented);
  } else {
    bootIfConsented();
  }
})();
