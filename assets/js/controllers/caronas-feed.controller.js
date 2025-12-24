/* KinoCampus - Caronas Feed Controller (V8.1.2.4.5) */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({ module: 'caronas', pageModule: 'caronas' });
  });
})();
