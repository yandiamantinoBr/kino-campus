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

  function hasAdvertisingConsent() {
    try {
      return !!(
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
    if (document.getElementById(SCRIPT_ID)) return;
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
  }

  function updateConsent() {
    var analyticsGranted = hasAnalyticsConsent();
    var advertisingGranted = hasAdvertisingConsent();
    gtag('consent', 'update', consentPayload(analyticsGranted, advertisingGranted));
    if (analyticsGranted && !window.__KC_GTAG_CONFIGURED__) {
      window.__KC_GTAG_CONFIGURED__ = true;
      gtag('config', MEASUREMENT_ID, {
        anonymize_ip: true,
        send_page_view: true,
      });
    }
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || gtag;
  window.gtag('consent', 'default', consentPayload(false, false));
  window.gtag('js', new Date());

  loadScriptOnce();
  updateConsent();

  window.addEventListener('kc:consentchange', updateConsent);

  window.KCGoogleTag = Object.freeze({
    measurementId: MEASUREMENT_ID,
    hasAnalyticsConsent: hasAnalyticsConsent,
    hasAdvertisingConsent: hasAdvertisingConsent,
    updateConsent: updateConsent,
  });
}());
