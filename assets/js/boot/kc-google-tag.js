/*
  KinoCampus - Google tag integration (GA4)

  Carrega a Google tag com Consent Mode defensivo:
  - estados opcionais comecam como "denied";
  - analytics_storage so muda para "granted" quando o usuario aceita
    "Metricas" no banner LGPD do KinoCampus;
  - ad_storage so muda para "granted" quando o usuario aceita "Publicidade";
  - personalizacao individual permanece negada nesta fase.
*/
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-P9RKYHPB7Z';
  var SCRIPT_ID = 'kcGoogleTagScript';
  var pageViewSent = false;
  var pseudonymousUserId = null;
  var currentInternalUserId = '';
  var authenticatedUserPresent = false;
  var userIdRequestVersion = 0;
  var userIdRequest = null;

  var SAFE_CAMPAIGN_PARAMS = Object.freeze({
    utm_id: 'campaign_id',
    utm_source: 'campaign_source',
    utm_medium: 'campaign_medium',
    utm_campaign: 'campaign_name',
  });

  var SAFE_CAMPAIGN_SOURCES = Object.freeze({
    google: true, bing: true, newsletter: true, email: true, whatsapp: true,
    instagram: true, facebook: true, linkedin: true, qr: true, partner: true,
    internal: true, ufg: true, kinocampus: true,
  });
  var SAFE_CAMPAIGN_MEDIA = Object.freeze({
    organic: true, cpc: true, referral: true, email: true, social: true,
    paid_social: true, qr: true, partner: true, display: true, internal: true,
  });

  function currentLocationPart(part) {
    try {
      var location = window.location || {};
      if (location[part]) return String(location[part]);
      if (location.href) return String(new URL(location.href)[part] || '');
    } catch (_) { }
    return '';
  }

  function isCollectionContextAllowed() {
    var hostname = currentLocationPart('hostname').toLowerCase();
    var pathname = currentLocationPart('pathname') || '/';
    var isProductionHost = hostname === 'kinocampus.com.br' || hostname === 'www.kinocampus.com.br';
    var isAdminPath = /^\/admin(?:\/|$)/i.test(pathname);
    return isProductionHost && !isAdminPath;
  }

  function looksSensitive(value) {
    var text = String(value || '');
    return (
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
      /(?:\+?\d[\s().-]*){8,}/.test(text) ||
      /(?:access|refresh|id)?_?token|authorization|password|secret|session|code_verifier/i.test(text)
    );
  }

  function safeParamValue(value, maxLength) {
    var text = String(value || '').trim();
    if (!text || looksSensitive(text)) return '';
    return text.slice(0, maxLength || 100);
  }

  function readCampaignConfig(input) {
    var config = Object.create(null);
    try {
      var url = new URL(String(input || ''), window.location && window.location.origin);
      Object.keys(SAFE_CAMPAIGN_PARAMS).forEach(function (queryKey) {
        var value = safeParamValue(url.searchParams.get(queryKey), 64).toLowerCase();
        if (!value) return;
        if (queryKey === 'utm_source' && !SAFE_CAMPAIGN_SOURCES[value]) return;
        if (queryKey === 'utm_medium' && !SAFE_CAMPAIGN_MEDIA[value]) return;
        if ((queryKey === 'utm_id' || queryKey === 'utm_campaign') && !/^kc-[a-z0-9][a-z0-9_-]{0,60}$/.test(value)) return;
        config[SAFE_CAMPAIGN_PARAMS[queryKey]] = value;
      });
    } catch (_) { }
    return config;
  }

  function isPublicPostPath(pathname) {
    return /\/(?:_?product)\.html$/i.test(String(pathname || ''));
  }

  function sanitizePageUrl(input) {
    try {
      var base = window.location && window.location.origin
        ? window.location.origin
        : 'https://www.kinocampus.com.br';
      var url = new URL(String(input || base), base);
      var clean = new URL(url.origin + url.pathname);

      if (isPublicPostPath(url.pathname)) {
        var postId = String(url.searchParams.get('id') || '').trim();
        var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId);
        var isLegacyNumericId = /^\d{1,12}$/.test(postId);
        if (isUuid || isLegacyNumericId) clean.searchParams.set('id', postId);
      }

      return clean.toString();
    } catch (_) {
      return '';
    }
  }

  function sanitizeReferrer(input) {
    try {
      if (!input) return '';
      var url = new URL(String(input));
      var currentOrigin = window.location && window.location.origin ? window.location.origin : '';
      if (currentOrigin && url.origin === currentOrigin) return sanitizePageUrl(url.toString());
      return url.origin + '/';
    } catch (_) {
      return '';
    }
  }

  function isValidPseudonymousUserId(value) {
    return /^kc_[0-9a-f]{32}$/.test(String(value || ''));
  }

  function normalizeInternalUserId(value) {
    var text = String(value || '').trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
      ? text
      : '';
  }

  function safePageTitle() {
    var pathname = currentLocationPart('pathname');
    if (isPublicPostPath(pathname)) return 'KinoCampus \u2014 Publica\u00e7\u00e3o';
    if (/\/(?:profile|user)\.html$/i.test(pathname)) return 'KinoCampus \u2014 Perfil';
    if (/\/(?:chat-inbox|mensagens)\.html$/i.test(pathname)) return 'KinoCampus \u2014 Mensagens';
    if (/\/search-results\.html$/i.test(pathname)) return 'KinoCampus \u2014 Busca';

    var title = String((document && document.title) || '').trim();
    if (!title || looksSensitive(title)) return 'KinoCampus';
    return title.slice(0, 120);
  }

  function applyUserId() {
    if (!isCollectionContextAllowed() || !window.__KC_GTAG_CONFIGURED__ || !hasAnalyticsConsent()) return false;
    gtag('set', { user_id: pseudonymousUserId || null });
    return true;
  }

  function clearPseudonymousUserId() {
    userIdRequestVersion += 1;
    userIdRequest = null;
    pseudonymousUserId = null;
    if (isCollectionContextAllowed() && window.__KC_GTAG_CONFIGURED__) {
      gtag('set', { user_id: null });
    }
    return Promise.resolve(null);
  }

  function requestPseudonymousUserId() {
    if (!isCollectionContextAllowed() || !authenticatedUserPresent || !hasAnalyticsConsent()) {
      return clearPseudonymousUserId();
    }
    if (pseudonymousUserId) return Promise.resolve(pseudonymousUserId);
    if (userIdRequest) return userIdRequest;

    var client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client || !client.functions || typeof client.functions.invoke !== 'function') {
      return Promise.resolve(null);
    }

    var requestVersion = ++userIdRequestVersion;
    var pending = Promise.resolve(client.functions.invoke('kc-analytics-subject-id', { body: {} }))
      .then(function (result) {
        var subjectId = result && !result.error && result.data ? result.data.subjectId : null;
        if (
          requestVersion !== userIdRequestVersion ||
          !authenticatedUserPresent ||
          !hasAnalyticsConsent() ||
          !isValidPseudonymousUserId(subjectId)
        ) return null;
        pseudonymousUserId = subjectId;
        applyUserId();
        return subjectId;
      }, function () { return null; })
      .then(function (subjectId) {
        if (requestVersion === userIdRequestVersion) userIdRequest = null;
        return subjectId;
      });
    userIdRequest = pending;
    return pending;
  }

  function setUserId(internalUserId) {
    var nextInternalUserId = normalizeInternalUserId(internalUserId);
    var userChanged = nextInternalUserId !== currentInternalUserId;
    currentInternalUserId = nextInternalUserId;
    authenticatedUserPresent = !!currentInternalUserId;
    if (userChanged) clearPseudonymousUserId();
    if (!authenticatedUserPresent) return clearPseudonymousUserId();
    return requestPseudonymousUserId();
  }

  function hasAnalyticsConsent() {
    try {
      return !!(
        isCollectionContextAllowed() &&
        window.KCConsent &&
        typeof window.KCConsent.hasConsent === 'function' &&
        window.KCConsent.hasConsent('analytics')
      );
    } catch (_) {
      return false;
    }
  }

  function hasAdvertisingConsent() {
    try {
      return !!(
        isCollectionContextAllowed() &&
        window.KCConsent &&
        typeof window.KCConsent.hasConsent === 'function' &&
        window.KCConsent.hasConsent('advertising')
      );
    } catch (_) {
      return false;
    }
  }

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function consentPayload(analyticsGranted, advertisingGranted) {
    return {
      ad_storage: advertisingGranted ? 'granted' : 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: analyticsGranted ? 'granted' : 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted',
    };
  }

  function loadScriptOnce() {
    if (!isCollectionContextAllowed()) return false;
    if (document.getElementById(SCRIPT_ID)) return true;
    var script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    var firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
    return true;
  }

  function sendPageViewOnce() {
    if (!isCollectionContextAllowed() || pageViewSent) return false;
    var pageLocation = sanitizePageUrl(window.location && window.location.href);
    if (!pageLocation) return false;
    pageViewSent = true;
    gtag('event', 'page_view', {
      page_location: pageLocation,
      page_referrer: sanitizeReferrer(document.referrer),
      page_title: safePageTitle(),
    });
    return true;
  }

  function updateConsent() {
    if (!isCollectionContextAllowed()) return false;
    var analyticsGranted = hasAnalyticsConsent();
    var advertisingGranted = hasAdvertisingConsent();
    gtag('consent', 'update', consentPayload(analyticsGranted, advertisingGranted));
    if (!analyticsGranted) {
      clearPseudonymousUserId();
      return true;
    }

    loadScriptOnce();
    if (!window.__KC_GTAG_CONFIGURED__) {
      window.__KC_GTAG_CONFIGURED__ = true;
      var config = {
        allow_ad_personalization_signals: false,
        allow_google_signals: false,
        anonymize_ip: true,
        page_location: sanitizePageUrl(window.location && window.location.href),
        send_page_view: false,
      };
      Object.assign(config, readCampaignConfig(window.location && window.location.href));
      if (pseudonymousUserId) config.user_id = pseudonymousUserId;
      gtag('config', MEASUREMENT_ID, config);
      sendPageViewOnce();
    }
    if (authenticatedUserPresent) requestPseudonymousUserId();
    else applyUserId();
    return true;
  }

  if (isCollectionContextAllowed()) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || gtag;
    window.gtag('consent', 'default', consentPayload(false, false));
    window.gtag('js', new Date());

    updateConsent();

    window.addEventListener('kc:consentchange', updateConsent);
    if (document && typeof document.addEventListener === 'function') {
      document.addEventListener('kc:authchange', function (event) {
        var detail = event && event.detail ? event.detail : {};
        var user = detail.user || null;
        setUserId(user && user.id ? user.id : null);
      });
    }
  }

  window.KCGoogleTag = Object.freeze({
    measurementId: MEASUREMENT_ID,
    isCollectionContextAllowed: isCollectionContextAllowed,
    hasAnalyticsConsent: hasAnalyticsConsent,
    hasAdvertisingConsent: hasAdvertisingConsent,
    sanitizePageUrl: sanitizePageUrl,
    sanitizeReferrer: sanitizeReferrer,
    readCampaignConfig: readCampaignConfig,
    safePageTitle: safePageTitle,
    sendPageViewOnce: sendPageViewOnce,
    setUserId: setUserId,
    updateConsent: updateConsent,
  });
}());
