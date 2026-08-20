/*
  KinoCampus - kc-events.js v8.6.7

  Helper padronizado para enviar eventos customizados ao Google Analytics 4
  (carregado por kc-google-tag.js).

  - SEMPRE respeita consentimento LGPD: se o usuario nao aceitou "Metricas"
    em KCConsent, o evento e descartado silenciosamente.
  - API publica: window.KCEvents.track(name, params) / trackRecommended / trackOnce / trackTiming
  - Eventos especificos sao prefixados com 'kc_'. Eventos recomendados do GA4
    usam seus nomes oficiais por uma allowlist pequena e explicita.
  - Parametros em snake_case; valores em lowercase.
  - Buffer local (max 50) em closure para debug quando consent for negado
    (nao e enviado pro GA, mas fica em memoria via getQueue()).
*/
(function () {
  'use strict';

  var MAX_BUFFER = 50;
  var DEBUG = false;
  var eventQueue = [];
  var onceEvents = Object.create(null);
  var RECOMMENDED_EVENT_NAMES = Object.freeze({
    generate_lead: true,
    login: true,
    share: true,
    sign_up: true,
  });
  var EVENT_PARAM_SCHEMAS = Object.freeze({
    generate_lead: Object.freeze({ item_id: true, content_type: true, contact_type: true, channel: true }),
    login: Object.freeze({ method: true }),
    share: Object.freeze({ item_id: true, content_type: true, method: true }),
    sign_up: Object.freeze({ method: true, needs_confirmation: true }),
    kc_chat_inbox_open: Object.freeze({ conversation_count: true }),
    kc_chat_open: Object.freeze({ is_new: true, context: true }),
    kc_contact_click: Object.freeze({ post_id: true, contact_type: true, channel: true }),
    kc_contact_form_open: Object.freeze({ item_id: true, content_type: true }),
    kc_coupon_click: Object.freeze({ post_id: true }),
    kc_csv_export: Object.freeze({ source: true }),
    kc_external_cta_click: Object.freeze({ item_id: true, content_type: true }),
    kc_login: Object.freeze({ method: true }),
    kc_logout: Object.freeze({}),
    kc_message_send: Object.freeze({ message_type: true, has_attachment: true, has_text: true, is_reply: true, context: true }),
    kc_post_create: Object.freeze({ item_id: true, module: true, content_type: true, publication_status: true }),
    kc_module_view: Object.freeze({ module: true }),
    kc_post_view: Object.freeze({ post_id: true, module: true, content_type: true }),
    kc_profile_cta_click: Object.freeze({ item_id: true, content_type: true }),
    kc_search: Object.freeze({ search_source: true, query_length_bucket: true }),
    kc_search_outcome: Object.freeze({ search_source: true, search_outcome: true, result_count_bucket: true, search_latency_bucket: true }),
    kc_share: Object.freeze({ post_id: true, method: true }),
    kc_sign_up: Object.freeze({ method: true, needs_confirmation: true }),
    kc_sign_up_submit: Object.freeze({ method: true, needs_confirmation: true }),
  });
  var PARAM_ENUMS = Object.freeze({
    channel: Object.freeze({ whatsapp: true, email: true, phone: true, chat_internal: true, external: true }),
    contact_type: Object.freeze({ whatsapp: true, email_public: true, instagram: true, linkedin: true, facebook: true, chat_internal: true, external_contact: true }),
    content_type: Object.freeze({ post: true }),
    context: Object.freeze({ member_to_member: true }),
    message_type: Object.freeze({ text: true, file: true, image: true, audio: true, document: true }),
    method: Object.freeze({ email: true, google: true, apple: true, github: true, azure: true, sso: true, whatsapp: true, copy_link: true, native_share: true, unknown: true }),
    module: Object.freeze({ 'achados-perdidos': true, caronas: true, 'compra-venda': true, eventos: true, moradia: true, oportunidades: true, editorial: true, ods: true, unknown: true }),
    publication_status: Object.freeze({ published: true, pending_review: true }),
    query_length_bucket: Object.freeze({ '2_4': true, '5_8': true, '9_16': true, '17_32': true, '33_plus': true }),
    result_count_bucket: Object.freeze({ zero: true, '1_5': true, '6_20': true, '21_plus': true }),
    search_latency_bucket: Object.freeze({ under_250ms: true, '250ms_1s': true, '1s_5s': true, '5s_plus': true }),
    search_outcome: Object.freeze({ success: true, zero_results: true, error: true }),
    search_source: Object.freeze({ 'dropdown-item': true, 'results-load': true, 'results-submit': true, results: true, search: true }),
    source: Object.freeze({ 'ga4-dashboard': true }),
  });

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

  function isPublicContentIdKey(key) {
    var compactKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return compactKey === 'postid' || compactKey === 'itemid';
  }

  function isValidPublicContentId(value) {
    var text = String(value == null ? '' : value).trim();
    return /^\d{1,12}$/.test(text) ||
      /^post-\d{1,16}$/i.test(text) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
  }

  function isSensitiveKey(key) {
    var lowerKey = String(key || '').toLowerCase();
    var compactKey = lowerKey.replace(/[^a-z0-9]/g, '');

    // post_id identifica conteudo publico e e intencionalmente permitido.
    if (isPublicContentIdKey(lowerKey)) return false;

    if (/email|e_mail|phone|telefone|celular|cpf|cnpj|senha|password|passcode|token|secret|authorization|auth_code|whatsapp/.test(lowerKey)) {
      return true;
    }
    if (/^(?:ip|ip_address|cookie|user_agent|address|display_name|full_name|name|matricula|registration)$/.test(lowerKey)) return true;
    if (/^(q|query|term|search_term)$/.test(lowerKey)) return true;

    // IDs de pessoas, sessoes e conversas sao privados e geram alta cardinalidade.
    return /(peer|conversation|user|profile|account|member|author|owner|sender|recipient|participant|session|message|customer|client)id$/.test(compactKey);
  }

  function containsObviousPrivateValue(value) {
    var text = String(value || '').trim();
    if (!text) return false;

    var hasEmail = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i.test(text);
    if (hasEmail) return true;

    // Telefone evidente: 10 a 15 digitos, ou formato local 0000-0000/00000-0000.
    // O piso maior evita confundir datas ISO e metricas numericas com telefone.
    var phoneCandidates = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    var hasPhone = phoneCandidates.some(function (candidate) {
      var digits = candidate.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) return true;
      return digits.length >= 8 && digits.length <= 9 && /^\d{4,5}-\d{4}$/.test(candidate.trim());
    });
    if (hasPhone) return true;

    var hasBearer = /\bbearer\s+[a-z0-9._~+/=-]{12,}/i.test(text);
    var hasJwt = /\beyj[a-z0-9_-]{8,}\.eyj[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i.test(text);
    var hasNamedToken = /(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|auth(?:orization)?[_-]?code|secret)\s*[:=]\s*[a-z0-9._~+/=-]{8,}/i.test(text);
    return hasBearer || hasJwt || hasNamedToken;
  }

  function sanitizeParams(params, allowedKeys) {
    if (!params || typeof params !== 'object') return {};
    var out = Object.create(null);
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      var lowerKey = String(k).toLowerCase();
      if (!allowedKeys || !allowedKeys[lowerKey]) return;
      if (isSensitiveKey(lowerKey)) {
        if (DEBUG) console.warn('[KCEvents] drop PII param:', k);
        return;
      }
      if (isPublicContentIdKey(lowerKey)) {
        if (isValidPublicContentId(v)) out[k] = String(v).trim();
        else if (DEBUG) console.warn('[KCEvents] drop invalid public content id:', k);
        return;
      }
      if (typeof v === 'string') {
        if (containsObviousPrivateValue(v)) {
          if (DEBUG) console.warn('[KCEvents] drop PII value:', k);
          return;
        }
        var normalized = v.slice(0, 120);
        if (PARAM_ENUMS[lowerKey] && !PARAM_ENUMS[lowerKey][normalized.toLowerCase()]) return;
        out[k] = normalized;
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else if (Array.isArray(v)) {
        var safeValues = v.slice(0, 20).map(function (x) {
          var item = typeof x === 'string' ? x : String(x);
          if (containsObviousPrivateValue(item)) return null;
          return item.slice(0, 60);
        }).filter(function (x) {
          return x !== null;
        });
        if (safeValues.length) out[k] = safeValues;
      } else {
        var serialized = String(v);
        if (containsObviousPrivateValue(serialized)) {
          if (DEBUG) console.warn('[KCEvents] drop PII value:', k);
          return;
        }
        out[k] = serialized.slice(0, 200);
      }
    });
    return out;
  }

  function pushToQueue(name, params, reason) {
    if (eventQueue.length >= MAX_BUFFER) eventQueue.shift();
    eventQueue.push({
      name: name,
      params: params,
      timestamp: Date.now(),
      dropped_reason: reason,
    });
  }

  function dispatchEvent(name, params, recommended) {
    if (!name || typeof name !== 'string') return false;
    var safeName = String(name).toLowerCase().slice(0, 40);
    if (recommended) {
      if (!RECOMMENDED_EVENT_NAMES[safeName]) return false;
    } else if (safeName.indexOf('kc_') !== 0) {
      safeName = 'kc_' + safeName;
    }
    var schema = EVENT_PARAM_SCHEMAS[safeName];
    if (!schema) return false;
    var safeParams = sanitizeParams(params, schema);
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

  function track(name, params) {
    return dispatchEvent(name, params, false);
  }

  function trackRecommended(name, params) {
    return dispatchEvent(name, params, true);
  }

  function trackRecommendedOnce(name, params) {
    var key = 'recommended:' + String(name).toLowerCase();
    if (onceEvents[key]) return false;
    onceEvents[key] = true;
    return trackRecommended(name, params);
  }

  // Track only first occurrence per session
  function trackOnce(name, params) {
    var key = String(name).toLowerCase();
    if (onceEvents[key]) return false;
    onceEvents[key] = true;
    return track(name, params);
  }

  // Track timing (uses gtag timing API)
  function trackTiming(name, valueMs, label) {
    var safeTimingParams = sanitizeParams({ value_ms: valueMs, label: label }, { value_ms: true, label: true });
    if (!gtagAvailable() || !hasConsent()) {
      pushToQueue('timing_' + name, safeTimingParams, 'timing_no_consent');
      return false;
    }
    try {
      window.gtag('event', 'timing_complete', sanitizeParams({
        name: 'kc_' + String(name).toLowerCase().slice(0, 30),
        value: Math.round(valueMs),
        event_category: 'kc_performance',
        event_label: String(label || '').slice(0, 60),
      }, { name: true, value: true, event_category: true, event_label: true }));
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
      window.gtag('event', 'page_view', sanitizeParams({
        page_path: String(path || '').slice(0, 200),
        page_title: String(title || document.title || '').slice(0, 200),
      }, { page_path: true, page_title: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Reenvia eventos enfileirados quando gtag + consentimento analytics passam a
   * estar disponiveis (ex.: usuario aceita "Metricas" no banner LGPD).
   * Timing/page_view auxiliares nao usam schema allowlist e nao sao reenviados.
   */
  function flushQueue() {
    if (!gtagAvailable() || !hasConsent() || !eventQueue.length) return 0;
    var pending = eventQueue.slice();
    eventQueue.length = 0;
    var sent = 0;
    pending.forEach(function (entry) {
      if (!entry || !entry.name) return;
      var name = String(entry.name).toLowerCase().slice(0, 40);
      var schema = EVENT_PARAM_SCHEMAS[name];
      if (!schema) return;
      var safeParams = sanitizeParams(entry.params || {}, schema);
      try {
        window.gtag('event', name, safeParams);
        sent += 1;
      } catch (_) {
        pushToQueue(name, safeParams, 'gtag_threw');
      }
    });
    if (DEBUG) console.info('[KCEvents] flushed queue, sent=', sent);
    return sent;
  }

  function detectModuleFromPath() {
    try {
      var path = String((window.location && window.location.pathname) || '').toLowerCase();
      if (/eventos/.test(path)) return 'eventos';
      if (/oportunidades/.test(path)) return 'oportunidades';
      if (/caronas/.test(path)) return 'caronas';
      if (/moradia/.test(path)) return 'moradia';
      if (/compra-venda/.test(path)) return 'compra-venda';
      if (/achados-perdidos/.test(path)) return 'achados-perdidos';
      if (/editorial/.test(path)) return 'editorial';
      if (/(^|\/)ods(\.html)?$/.test(path) || /\/ods\.html$/.test(path)) return 'ods';
    } catch (_) { }
    return '';
  }

  function maybeTrackModuleView() {
    var moduleName = detectModuleFromPath();
    if (!moduleName) return false;
    return trackOnce('kc_module_view', { module: moduleName });
  }

  // Google tag also listens for this event; we only retry product events.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('kc:consentchange', function () {
      if (hasConsent()) {
        flushQueue();
        maybeTrackModuleView();
      }
    });
  }

  // If consent already exists on first paint, record the module feed landing once.
  if (hasConsent()) {
    maybeTrackModuleView();
  }

  window.KCEvents = Object.freeze({
    track: track,
    trackRecommended: trackRecommended,
    trackRecommendedOnce: trackRecommendedOnce,
    trackOnce: trackOnce,
    trackTiming: trackTiming,
    trackEngagement: trackEngagement,
    trackPageView: trackPageView,
    flushQueue: flushQueue,
    hasConsent: hasConsent,
    enableDebug: function () { DEBUG = true; },
    getQueue: function () { return eventQueue.slice(); },
    clearQueue: function () { eventQueue.length = 0; },
  });
})();
