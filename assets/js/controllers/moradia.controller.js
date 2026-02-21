/* KinoCampus - moradia controller (V8.1.9.0) */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({ module: 'moradia', pageModule: 'moradia' });
  });
})();
