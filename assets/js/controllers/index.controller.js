/* KinoCampus - index controller (V8.1.9.0) */
(function () {
  'use strict';

  let interactionsBound = false;

  function bindIndexInteractions() {
    if (interactionsBound) return;
    interactionsBound = true;

    document.body.addEventListener('click', function (event) {
      const slideEl = event.target.closest('[data-kc-slide]');
      if (slideEl) {
        const action = String(slideEl.dataset.kcSlide || '').trim();
        if (action === 'prev') {
          if (typeof window.changeSlide === 'function') window.changeSlide(-1);
          return;
        }
        if (action === 'next') {
          if (typeof window.changeSlide === 'function') window.changeSlide(1);
          return;
        }
        if (/^-?\d+$/.test(action)) {
          if (typeof window.goToSlide === 'function') window.goToSlide(Number(action));
          return;
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.KCControllers && typeof window.KCControllers.injectFeed === 'function') {
      // P1-B fix: lê ?q= da URL para filtrar feed via busca no Supabase
      var urlQ = '';
      try { urlQ = new URLSearchParams(window.location.search).get('q') || ''; } catch (_) {}
      window.KCControllers.injectFeed({ module: null, pageModule: '', q: urlQ });
    }
    bindIndexInteractions();
  });
})();
