/** KinoCampus 404 interactions (V76.23). */
(function initKcErrorPage() {
  'use strict';

  function canReturnToReferrer() {
    if (window.history.length <= 1 || !document.referrer) return false;
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function init() {
    document.documentElement.classList.remove('kc-loading');
    var backLink = document.querySelector('[data-kc-error-back]');
    if (!backLink) return;

    if (!canReturnToReferrer()) {
      backLink.hidden = true;
      return;
    }

    backLink.addEventListener('click', function (event) {
      event.preventDefault();
      window.history.back();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
