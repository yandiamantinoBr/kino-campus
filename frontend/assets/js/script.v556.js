/*
  KinoCampus V5.5.6 - Edge Mobile Fit (Responsive Engine)
  Principal função: aplicar variáveis CSS responsivas (gutter / media size)
  e reforçar comportamento de scrollers horizontais em qualquer preset mobile.

  Observação: este script não substitui o script.v554.js; apenas complementa.
*/

(function () {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function updateHeaderHeightVar() {
    const header = document.querySelector('header') || document.querySelector('.kc-header');
    const h = header ? header.offsetHeight : 0;
    if (h) document.documentElement.style.setProperty('--kc-header-height', `${h}px`);
  }

  function applyResponsiveVars() {
    const vw = (document.documentElement && document.documentElement.clientWidth) ? document.documentElement.clientWidth : (window.innerWidth || 0);
    const w = clamp(vw || 0, 240, 820);

    // gutter consistente em qualquer preset mobile do Edge
    const gutter = Math.round(clamp(w * 0.035, 10, 16));
    document.documentElement.style.setProperty('--kc-page-gutter', `${gutter}px`);

    // tamanho do media do card: 62..92
    const media = Math.round(clamp(w * 0.21, 62, 92));
    document.documentElement.style.setProperty('--kc-card-media', `${media}px`);

    // pequenos ajustes extras (telas MUITO estreitas)
    if (w <= 320) {
      document.documentElement.style.setProperty('--kc-chip-pad-x', '12px');
      document.documentElement.style.setProperty('--kc-chip-pad-y', '8px');
    } else {
      document.documentElement.style.removeProperty('--kc-chip-pad-x');
      document.documentElement.style.removeProperty('--kc-chip-pad-y');
    }
  }

  function enableDragToScroll(el) {
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    const THRESHOLD = 8;

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;

      if (!moved && Math.abs(dx) > THRESHOLD) {
        moved = true;
        el.classList.add('is-dragging');
        document.documentElement.classList.add('kc-no-select');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }

      if (!moved) return;
      el.scrollLeft = startScrollLeft - dx;
    };

    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      setTimeout(() => {
        el.classList.remove('is-dragging');
        document.documentElement.classList.remove('kc-no-select');
      }, 0);
    };

    const onClickCapture = (e) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
    el.addEventListener('lostpointercapture', onUp, { passive: true });
    el.addEventListener('click', onClickCapture, true);
  }

  function initHorizontalAreas() {
    document.querySelectorAll('.kc-feed-tabs, .kc-ranking-users').forEach(enableDragToScroll);
  }

  function init() {
    updateHeaderHeightVar();
    applyResponsiveVars();
    initHorizontalAreas();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();

    const onResize = debounce(() => {
      updateHeaderHeightVar();
      applyResponsiveVars();
    }, 120);

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  });
})();
