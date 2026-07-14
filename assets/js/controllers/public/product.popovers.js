/**
 * @file product.popovers.js
 * @description Sub-modulo de popovers da pagina de produto (v11.30.17)
 * Extraido de product.controller.js. Registra window._KCProduct.popovers.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCUtils     - copyTextToClipboard
 *   - window.KCAPI       - trackShare
 *   - window.showToast   - feedback visual
 *
 * Carregado apos product.analytics.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.popovers disponivel antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  var PRODUCT_POPOVER_DESKTOP_BREAKPOINT = 640;
  var PRODUCT_POPOVER_VIEWPORT_MARGIN = 12;
  var PRODUCT_POPOVER_GAP = 8;
  var productPopoverViewportBound = false;
  var productGlobalKeydownBound = false;
  var currentPostGetter = null;

  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }

  function getCurrentPost() {
    try {
      return typeof currentPostGetter === 'function' ? currentPostGetter() : null;
    } catch (_) {
      return null;
    }
  }

  function getProductPopoverConfig(popoverId) {
    switch (String(popoverId || '')) {
      case 'sharePopover':
        return { anchorId: 'shareButton', desktopWidth: 220 };
      default:
        return null;
    }
  }

  function clearProductPopoverPosition(popover) {
    if (!popover) return;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    popover.style.removeProperty('right');
    popover.style.removeProperty('bottom');
    popover.style.removeProperty('width');
    popover.style.removeProperty('max-width');
  }

  function positionProductPopover(popoverId, anchorBtn) {
    var popover = document.getElementById(popoverId);
    var config = getProductPopoverConfig(popoverId);
    var anchor = anchorBtn || (config ? document.getElementById(config.anchorId) : null);
    if (!popover || !config || !anchor) return;

    if (window.innerWidth <= PRODUCT_POPOVER_DESKTOP_BREAKPOINT) {
      clearProductPopoverPosition(popover);
      return;
    }

    var rect = anchor.getBoundingClientRect();
    var viewportMargin = PRODUCT_POPOVER_VIEWPORT_MARGIN;
    var maxWidth = Math.max(180, window.innerWidth - (viewportMargin * 2));
    var preferredWidth = Math.min(config.desktopWidth, maxWidth);
    var popoverHeight = Math.min(
      popover.scrollHeight || popover.offsetHeight || 0,
      Math.floor(window.innerHeight * 0.84)
    );

    var left = rect.left;
    if ((left + preferredWidth) > (window.innerWidth - viewportMargin)) {
      left = window.innerWidth - preferredWidth - viewportMargin;
    }
    if (left < viewportMargin) left = viewportMargin;

    var top = rect.bottom + PRODUCT_POPOVER_GAP;
    if ((top + popoverHeight) > (window.innerHeight - viewportMargin)) {
      top = rect.top - popoverHeight - PRODUCT_POPOVER_GAP;
      if (top < viewportMargin) top = viewportMargin;
    }

    popover.style.width = preferredWidth + 'px';
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.top = Math.round(top) + 'px';
    popover.style.left = Math.round(left) + 'px';
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
  }

  function scheduleProductPopoverPosition(popoverId, anchorBtn) {
    window.requestAnimationFrame(function () {
      var popover = document.getElementById(popoverId);
      if (!popover || !popover.classList.contains('active')) return;
      positionProductPopover(popoverId, anchorBtn);
    });
  }

  function syncActiveProductPopovers() {
    ['sharePopover'].forEach(function (popoverId) {
      var popover = document.getElementById(popoverId);
      var config;
      if (!popover || !popover.classList.contains('active')) return;
      config = getProductPopoverConfig(popoverId);
      positionProductPopover(popoverId, config ? document.getElementById(config.anchorId) : null);
    });
  }

  function ensureProductPopoverViewportBinding() {
    if (productPopoverViewportBound) return;
    productPopoverViewportBound = true;

    var syncScheduled = false;
    var scheduleSync = function () {
      if (syncScheduled) return;
      syncScheduled = true;
      window.requestAnimationFrame(function () {
        syncScheduled = false;
        syncActiveProductPopovers();
      });
    };

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
  }

  function closeSharePopover() {
    var popover = document.getElementById('sharePopover');
    var backdrop = document.getElementById('shareBackdrop');
    var btn = document.getElementById('shareButton');
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearProductPopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function handleProductGlobalKeydown(event) {
    if (!event || event.key !== 'Escape') return;
    closeSharePopover();
    if (window._KCProduct.save && typeof window._KCProduct.save.closeSavePopover === 'function') {
      window._KCProduct.save.closeSavePopover();
    }
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.closeCalendarPopover === 'function') {
      window._KCProduct.calendar.closeCalendarPopover();
    }
  }

  function bindProductGlobalKeydown() {
    if (productGlobalKeydownBound) return;
    productGlobalKeydownBound = true;
    document.addEventListener('keydown', handleProductGlobalKeydown, { passive: true });
  }

  function trackCurrentPostShare(method) {
    try {
      var post = getCurrentPost();
      var postId = post && (post.uuid || post.id);
      if (postId && window.KCAPI && typeof window.KCAPI.trackShare === 'function') {
        window.KCAPI.trackShare(postId, method).catch(function () { });
      }
    } catch (_) { }
  }

  function copyCurrentPostLink(options) {
    if (!window.KCUtils || typeof window.KCUtils.copyTextToClipboard !== 'function') {
      return Promise.resolve(false);
    }
    return window.KCUtils.copyTextToClipboard(window.location.href, options);
  }

  function openSharePopover(btn) {
    var popover = document.getElementById('sharePopover');
    var backdrop = document.getElementById('shareBackdrop');
    if (!popover) return;
    if (window._KCProduct.save && typeof window._KCProduct.save.closeSavePopover === 'function') {
      window._KCProduct.save.closeSavePopover();
    }
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.closeCalendarPopover === 'function') {
      window._KCProduct.calendar.closeCalendarPopover();
    }
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    scheduleProductPopoverPosition('sharePopover', btn);
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function wireSharePopover(context) {
    var shareBtn = document.getElementById('shareButton');
    var backdrop = document.getElementById('shareBackdrop');
    var waBtn = document.getElementById('shareWhatsApp');
    var copyBtn = document.getElementById('shareCopyLink');
    if (!shareBtn) return;

    currentPostGetter = context && typeof context.getCurrentPost === 'function'
      ? context.getCurrentPost
      : null;

    ensureProductPopoverViewportBinding();

    shareBtn.addEventListener('click', function (e) {
      var popover;
      e.stopPropagation();
      popover = document.getElementById('sharePopover');
      if (popover && popover.classList.contains('active')) {
        closeSharePopover();
      } else {
        openSharePopover(shareBtn);
      }
    });

    if (backdrop) backdrop.addEventListener('click', closeSharePopover);

    if (waBtn) {
      waBtn.addEventListener('click', function () {
        var post = getCurrentPost();
        var title;
        var url;
        var text;
        closeSharePopover();
        title = (post && (post.titulo || post.title)) || document.title;
        url = window.location.href;
        text = title + '\n' + url;
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        trackCurrentPostShare('whatsapp');
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        closeSharePopover();
        copyCurrentPostLink().then(function (copied) {
          if (!copied) throw new Error('copy_unavailable');
          trackCurrentPostShare('copy_link');
          toast('Link copiado!', 'info', 1800);
        }).catch(function () {
          toast('N\u00E3o foi poss\u00EDvel copiar automaticamente. Tente novamente ou copie o link pela barra do navegador.', 'error', 2600);
        });
      });
    }
  }

  window._KCProduct.popovers = {
    bindProductGlobalKeydown: bindProductGlobalKeydown,
    wireSharePopover: wireSharePopover,
    closeSharePopover: closeSharePopover,
  };
})();
