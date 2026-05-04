/**
 * KinoCampus - Pull-to-Refresh (V1.0.0)
 * Provides native-like pull-to-refresh experience on mobile
 */

(function () {
  'use strict';

  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let currentX = 0;
  let pulling = false;
  let pullingContainer = null;
  let refreshCallback = null;
  let indicator = null;
  let refreshing = false;

  const THRESHOLD = 120; // px to pull before triggering refresh
  const MAX_PULL  = 220; // max pull distance for visual feedback
  const HORIZONTAL_DRAG_THRESHOLD = 12;

  function isOverlayGestureBlocked(target) {
    if (window.KCOverlayLock && typeof window.KCOverlayLock.isLocked === 'function' && window.KCOverlayLock.isLocked()) {
      return true;
    }
    if (document.documentElement.classList.contains('kc-scroll-locked')) return true;
    if (document.body.classList.contains('kc-scroll-locked')) return true;
    if (document.body.classList.contains('kc-modal-open')) return true;
    if (document.body.classList.contains('kc-admin-modal-open')) return true;

    if (!(target instanceof Element)) return false;

    return !!target.closest(
      '.kc-mobile-menu,' +
      '.kc-mobile-menu-drawer,' +
      '.kc-mobile-menu-content,' +
      '.kc-mobile-menu-header,' +
      '.kc-auth-overlay,' +
      '.kc-auth-modal,' +
      '.kc-auth-card,' +
      '.kc-auth-card__body,' +
      '.kc-create-modal,' +
      '.kc-create-modal__body,' +
      '.kc-search-modal,' +
      '.kc-search-modal-card,' +
      '.kc-modal-overlay.active,' +
      '.kc-modal-overlay,' +
      '.kc-modal-backdrop,' +
      '.kc-modal-card,' +
      '.kc-admin-chart-modal,' +
      '.kc-admin-chart-modal__dialog,' +
      '[role="dialog"]'
    );
  }

  function isHorizontalGestureSurface(target) {
    if (!(target instanceof Element)) return false;

    return !!target.closest(
      '.kc-hero-carousel,' +
      '.kc-ranking-users,' +
      '.kc-feed-tabs,' +
      '.kc-opportunity-mobile-rail,' +
      '.kc-marketplace-mobile-rail,' +
      '.kc-housing-mobile-rail,' +
      '.kc-lostfound-mobile-rail,' +
      '.kc-caronas-mobile-rail,' +
      '.kc-eventos-mobile-rail,' +
      '[data-kc-ranking-container],' +
      '[data-kc-opp-mobile-rail=\"true\"],' +
      '[data-kc-market-mobile-rail=\"true\"],' +
      '[data-kc-housing-mobile-rail=\"true\"],' +
      '[data-kc-achados-mobile-rail=\"true\"],' +
      '[data-kc-caronas-mobile-rail=\"true\"],' +
      '[data-kc-eventos-mobile-rail=\"true\"]'
    );
  }

  function createIndicator() {
    const ind = document.createElement('div');
    ind.className = 'kc-pull-to-refresh-indicator';
    ind.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
    ind.innerHTML = '<i class="fas fa-arrow-down" style="font-size: 1.2em; color: var(--kc-primary-brand);" aria-hidden="true"></i>';
    document.body.appendChild(ind);
    return ind;
  }

  function updateIndicator(progress) {
    if (!indicator) indicator = createIndicator();
    const opacity = Math.min(progress / THRESHOLD, 1);
    indicator.style.opacity = opacity;
    if (progress >= THRESHOLD) {
      indicator.innerHTML = '<i class="fas fa-check" style="font-size: 1.2em; color: var(--kc-primary-brand);" aria-hidden="true"></i>';
    } else {
      indicator.innerHTML = '<i class="fas fa-arrow-down" style="font-size: 1.2em; color: var(--kc-primary-brand);" aria-hidden="true"></i>';
    }
  }

  function hideIndicator() {
    if (indicator) {
      indicator.style.opacity = '0';
    }
  }

  function handleTouchStart(e) {
    if (isOverlayGestureBlocked(e.target)) {
      pulling = false;
      hideIndicator();
      return;
    }
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollTop === 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = startX;
      currentY = startY;

      if (isHorizontalGestureSurface(e.target)) {
        pulling = false;
        hideIndicator();
        return;
      }

      pulling = true;
    }
  }

  function handleTouchMove(e) {
    if (!pulling) return;
    if (isOverlayGestureBlocked(e.target)) {
      pulling = false;
      hideIndicator();
      return;
    }
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    if (Math.abs(deltaX) > HORIZONTAL_DRAG_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      pulling = false;
      hideIndicator();
      return;
    }
    const diff = deltaY;

    if (diff > 0) {
      // Prevent default browser pull-to-refresh on some mobile browsers
      e.preventDefault();
      const limitedDiff = Math.min(diff, MAX_PULL);
      updateIndicator(limitedDiff);
    }
  }

  function handleTouchEnd(e) {
    if (!pulling) return;
    if (isOverlayGestureBlocked(e.target)) {
      pulling = false;
      hideIndicator();
      startY = 0;
      startX = 0;
      currentY = 0;
      currentX = 0;
      return;
    }
    pulling = false;
    const diff = currentY - startY;

    if (diff > THRESHOLD && refreshCallback && !refreshing) {
      // Trigger refresh
      hideIndicator();
      refreshing = true;
      Promise.resolve()
        .then(function () { return refreshCallback(); })
        .catch(function () { })
        .finally(function () {
          refreshing = false;
        });
    } else {
      hideIndicator();
    }

    startY = 0;
    startX = 0;
    currentY = 0;
    currentX = 0;
  }

  function init(options) {
    options = options || {};
    destroy();
    const container = options.container || document.body;
    pullingContainer = container;
    refreshCallback = options.onRefresh || (() => {});

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return {
      destroy: destroy,
    };
  }

  function destroy() {
    const container = pullingContainer || document.body;
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
    indicator = null;
    refreshCallback = null;
    pullingContainer = null;
    refreshing = false;
    pulling = false;
    startY = 0;
    startX = 0;
    currentY = 0;
    currentX = 0;
  }

  window.KCPullToRefresh = Object.freeze({ init, destroy });
})();
