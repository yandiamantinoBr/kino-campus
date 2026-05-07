/**
 * KinoCampus — kc-telemetry.js v12.12.0
 *
 * Error boundary global + telemetria cliente:
 *   - Captura window.onerror (erros síncronos não tratados)
 *   - Captura unhandledrejection (promises rejeitadas sem catch)
 *   - Armazena em window._KCT.errors (buffer circular — máx 50 entradas)
 *   - Disponibiliza window._KCT.flush() para envio via sendBeacon
 *
 * Ativado somente quando KCFF.isEnabled('telemetry.enabled') === true.
 * Por padrão disabled; habilitar via KC_ENV.flags.telemetry.enabled = true.
 *
 * Endpoint de envio (opcional):
 *   KC_ENV.telemetryEndpoint = '/api/telemetry' (ou URL completa)
 *   Se não configurado, erros ficam apenas em memória.
 *
 * Dependências (devem ser carregadas antes):
 *   - kc-constants.js
 *   - kc-env.js
 *   - kc-feature-flags.js
 */

(function () {
  'use strict';

  // Guard 1: KCFF disponível
  if (typeof window.KCFF === 'undefined') return;

  // Guard 2: flag habilitada (padrão false — kill-switch seguro)
  if (!window.KCFF.isEnabled('telemetry.enabled')) return;

  // Guard 3: telemetria cliente é opcional e exige consentimento LGPD.
  if (
    window.KCConsent &&
    typeof window.KCConsent.hasConsent === 'function' &&
    !window.KCConsent.hasConsent('analytics')
  ) return;

  var MAX_ERRORS = 50;

  /** Endpoint de telemetria — configurável via KC_ENV. */
  var ENDPOINT = (
    typeof window.KC_ENV !== 'undefined' &&
    typeof window.KC_ENV.telemetryEndpoint === 'string' &&
    window.KC_ENV.telemetryEndpoint.length > 0
  ) ? window.KC_ENV.telemetryEndpoint : null;

  /** Constrói uma entrada de erro com tipo e timestamp. */
  function buildEntry(type, data) {
    return Object.assign({ type: type, timestamp: Date.now() }, data);
  }

  // ── Namespace público _KCT ───────────────────────────────────────────────

  window._KCT = {
    /** Buffer circular de erros capturados. */
    errors: [],

    /**
     * Adiciona uma entrada ao buffer.
     * Remove a mais antiga quando MAX_ERRORS é atingido.
     */
    push: function (entry) {
      if (window._KCT.errors.length >= MAX_ERRORS) {
        window._KCT.errors.shift();
      }
      window._KCT.errors.push(entry);
    },

    /** Retorna cópia imutável do buffer de erros. */
    getErrors: function () {
      return window._KCT.errors.slice();
    },

    /** Limpa o buffer de erros. */
    clear: function () {
      window._KCT.errors = [];
    },

    /**
     * Envia o buffer de erros para o endpoint configurado via sendBeacon.
     * Sem-op se ENDPOINT não está configurado ou o buffer está vazio.
     */
    flush: function () {
      if (!ENDPOINT || !window._KCT.errors.length) return;
      var payload = JSON.stringify({ errors: window._KCT.getErrors() });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([payload], { type: 'application/json' })
        );
      }
    },
  };

  // ── window.onerror — erros síncronos não tratados ────────────────────────

  var _prevOnError = window.onerror;

  window.onerror = function (message, source, lineno, colno, error) {
    window._KCT.push(buildEntry('onerror', {
      message: String(message || ''),
      source:  String(source  || ''),
      lineno:  lineno || 0,
      colno:   colno  || 0,
      stack:   error && error.stack ? String(error.stack) : '',
    }));
    if (typeof _prevOnError === 'function') {
      return _prevOnError.apply(this, arguments);
    }
    return false;
  };

  // ── unhandledrejection — promises rejeitadas sem catch ───────────────────

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    window._KCT.push(buildEntry('unhandledrejection', {
      message: reason instanceof Error ? reason.message : String(reason || ''),
      stack:   reason instanceof Error && reason.stack ? String(reason.stack) : '',
    }));
  });

  // ── Diagnóstico: flush automático antes do unload ────────────────────────

  window.addEventListener('beforeunload', function () {
    window._KCT.flush();
  });

  console.info('[KCTelemetry] Ativo — capturando onerror + unhandledrejection');
})();
