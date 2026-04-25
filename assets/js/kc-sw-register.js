/**
 * KinoCampus — kc-sw-register.js v12.11.0
 *
 * Registra o Service Worker (/sw.js) somente quando:
 *   1. O navegador suporta Service Workers (navigator.serviceWorker).
 *   2. KCFF está disponível (window.KCFF).
 *   3. A feature flag 'sw.enabled' está ativa (padrão: false — kill-switch).
 *
 * Para ativar em desenvolvimento:
 *   KC_ENV.flags = KC_ENV.flags || {};
 *   KC_ENV.flags.sw = { enabled: true };
 *
 * Dependências (devem ser carregadas antes):
 *   - kc-constants.js
 *   - kc-env.js
 *   - kc-feature-flags.js
 */

(function () {
  'use strict';

  // Guard 1: suporte nativo
  if (!('serviceWorker' in navigator)) return;

  // Guard 2: KCFF disponível
  if (typeof window.KCFF === 'undefined') return;

  // Guard 3: flag habilitada (padrão false — seguro por omissão)
  if (!window.KCFF.isEnabled('sw.enabled')) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        console.info('[KCSWRegister] SW registrado com sucesso — scope:', reg.scope);
      })
      .catch(function (err) {
        console.warn('[KCSWRegister] Falha ao registrar o Service Worker:', err);
      });
  });
})();
