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

      const voteEl = event.target.closest('[data-kc-vote]');
      if (voteEl) {
        const voteType = String(voteEl.dataset.kcVote || '').trim().toLowerCase();
        if ((voteType === 'hot' || voteType === 'cold') && typeof window.vote === 'function') {
          window.vote(voteEl, voteType);
        }
        return;
      }

      const mobileEl = event.target.closest('[data-kc-mobile-menu]');
      if (mobileEl) {
        const menuAction = String(mobileEl.dataset.kcMobileMenu || '').trim().toLowerCase();
        if (menuAction === 'open') {
          if (typeof window.openMobileMenu === 'function') window.openMobileMenu();
          return;
        }
        if (menuAction === 'close') {
          if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.KCControllers && typeof window.KCControllers.injectFeed === 'function') {
      window.KCControllers.injectFeed({ module: null, pageModule: '' });
    }
    bindIndexInteractions();
  });
})();
