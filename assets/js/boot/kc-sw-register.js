/**
 * KinoCampus — kc-sw-register.js v12.22.0
 *
 * Registra o Service Worker (/sw.js) somente quando:
 *   1. O navegador suporta Service Workers (navigator.serviceWorker).
 *   2. KCFF está disponível (window.KCFF).
 *   3. A feature flag 'sw.enabled' está ativa (padrão: true — base da
 *      instalação PWA; kill-switch disponível).
 *
 * Registro IMEDIATO (sem aguardar o evento load): quanto antes a página
 * passar a ser controlada pelo SW, mais cedo o Chromium considera o site
 * instalável e dispara beforeinstallprompt — requisito do card "Instalar
 * o KinoCampus" nas primeiras visitas.
 *
 * Para desativar (kill-switch):
 *   KC_ENV.flags = KC_ENV.flags || {};
 *   KC_ENV.flags['sw.enabled'] = false;
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

  // Guard 3: flag habilitada (kill-switch)
  if (!window.KCFF.isEnabled('sw.enabled')) return;

  function register() {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        console.info('[KCSWRegister] SW registrado com sucesso — scope:', reg.scope);
      })
      .catch(function (err) {
        console.warn('[KCSWRegister] Falha ao registrar o Service Worker:', err);
      });
  }

  // HTTPS/localhost é pré-requisito de Service Workers; em outros esquemas o
  // registro é simplesmente evitado (o navegador rejeitaria o registro).
  if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    register();
  }
})();
