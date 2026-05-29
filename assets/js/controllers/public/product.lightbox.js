/**
 * @file product.lightbox.js
 * @description Visualizador de imagem em tela cheia (lightbox) da pagina de produto (v8.6.1)
 *
 * Recurso self-contained: le a galeria existente (#mainImage + #thumbnails) direto
 * do DOM, sem acoplar a product.render.js. Abre um overlay fullscreen com:
 *   - zoom (pinch no mobile, scroll/double-click no desktop, duplo-toque, botoes +/-)
 *   - pan (arrastar quando ampliado)
 *   - navegacao entre imagens (swipe, setas do teclado, botoes prev/next)
 *   - lock de scroll do body, focus trap e fechamento por Esc / toque fora / swipe-down
 *
 * Convencoes: IIFE + window._KCProduct.lightbox. Sem dependencia de ordem de carga
 * (le o DOM no momento do clique). Sem HTML inline injetado com dados de usuario.
 *
 * Carregado via <script defer> em _product.html.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  // ── Constantes de comportamento ─────────────────────────────────────────────
  var MIN_SCALE = 1;
  var MAX_SCALE = 4;
  var DOUBLE_TAP_SCALE = 2.5;
  var SWIPE_THRESHOLD = 50;   // px para trocar de imagem
  var CLOSE_DRAG_THRESHOLD = 90; // px (swipe vertical para fechar)
  var TAP_MOVE_TOL = 10;      // px — abaixo disso o gesto e considerado toque
  var DOUBLE_TAP_MS = 300;

  // ── Refs do overlay (construido sob demanda) ────────────────────────────────
  var overlayEl = null;
  var stageEl = null;
  var imgEl = null;
  var counterEl = null;
  var prevBtn = null;
  var nextBtn = null;
  var closeBtn = null;
  var zoomInBtn = null;
  var zoomOutBtn = null;
  var built = false;

  // ── Estado do visualizador ──────────────────────────────────────────────────
  var isOpen = false;
  var images = [];
  var index = 0;
  var scale = 1;
  var tx = 0;
  var ty = 0;
  var lastFocused = null;
  var savedScrollY = 0;
  var hideTimer = null;

  // ── Estado de gestos ────────────────────────────────────────────────────────
  var pointers = new Map();
  var gestureMode = 'idle'; // idle | pan | swipe | pinch
  var startX = 0, startY = 0, startTime = 0, movedDist = 0;
  var panStartTx = 0, panStartTy = 0;
  var pinchStartDist = 0, pinchStartScale = 1, pinchStartTx = 0, pinchStartTy = 0;
  var pinchMidX = 0, pinchMidY = 0;
  var lastTapTime = 0, lastTapX = 0, lastTapY = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampScale(s) { return clamp(s, MIN_SCALE, MAX_SCALE); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function isMainVisible() {
    var img = document.getElementById('mainImage');
    if (!img) return false;
    var src = img.getAttribute('src');
    if (!src) return false;
    try {
      var cs = window.getComputedStyle(img);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch (_) { }
    return true;
  }

  function collectImages() {
    var list = [];
    var thumbs = document.querySelectorAll('#thumbnails .kc-thumbnail');
    thumbs.forEach(function (t) {
      var src = t.getAttribute('data-full-src') || t.getAttribute('src');
      if (src) list.push(src);
    });
    if (!list.length) {
      var main = document.getElementById('mainImage');
      var s = main && main.getAttribute('src');
      if (s) list.push(s);
    }
    return list;
  }

  function currentStartIndex(list) {
    var thumbs = document.querySelectorAll('#thumbnails .kc-thumbnail');
    var active = -1;
    thumbs.forEach(function (t, i) { if (t.classList.contains('active')) active = i; });
    if (active >= 0) return active;
    var main = document.getElementById('mainImage');
    if (main) {
      var src = main.getAttribute('src');
      var i = list.indexOf(src);
      if (i >= 0) return i;
    }
    return 0;
  }

  // ── Construcao do overlay (uma unica vez) ───────────────────────────────────
  function build() {
    if (built) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'kc-lightbox';
    overlayEl.id = 'kcLightbox';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-label', 'Imagem em tela cheia');
    overlayEl.hidden = true;
    overlayEl.innerHTML = [
      '<div class="kc-lightbox__backdrop" data-kc-lb="close"></div>',
      '<div class="kc-lightbox__stage" id="kcLightboxStage">',
      '  <img class="kc-lightbox__img" id="kcLightboxImg" alt="Imagem ampliada" draggable="false" />',
      '</div>',
      '<div class="kc-lightbox__toolbar">',
      '  <span class="kc-lightbox__counter" id="kcLightboxCounter" aria-live="polite"></span>',
      '  <span class="kc-lightbox__tools">',
      '    <button type="button" class="kc-lightbox__btn" data-kc-lb="zoom-out" aria-label="Diminuir zoom"><i class="fas fa-minus" aria-hidden="true"></i></button>',
      '    <button type="button" class="kc-lightbox__btn" data-kc-lb="zoom-in" aria-label="Aumentar zoom"><i class="fas fa-plus" aria-hidden="true"></i></button>',
      '    <button type="button" class="kc-lightbox__btn kc-lightbox__close" data-kc-lb="close" aria-label="Fechar (Esc)"><i class="fas fa-times" aria-hidden="true"></i></button>',
      '  </span>',
      '</div>',
      '<button type="button" class="kc-lightbox__nav kc-lightbox__nav--prev" data-kc-lb="prev" aria-label="Imagem anterior"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>',
      '<button type="button" class="kc-lightbox__nav kc-lightbox__nav--next" data-kc-lb="next" aria-label="Proxima imagem"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>'
    ].join('');

    document.body.appendChild(overlayEl);

    stageEl = overlayEl.querySelector('#kcLightboxStage');
    imgEl = overlayEl.querySelector('#kcLightboxImg');
    counterEl = overlayEl.querySelector('#kcLightboxCounter');
    prevBtn = overlayEl.querySelector('[data-kc-lb="prev"]');
    nextBtn = overlayEl.querySelector('[data-kc-lb="next"]');
    closeBtn = overlayEl.querySelector('.kc-lightbox__close');
    zoomInBtn = overlayEl.querySelector('[data-kc-lb="zoom-in"]');
    zoomOutBtn = overlayEl.querySelector('[data-kc-lb="zoom-out"]');

    // Acoes dos botoes / backdrop
    overlayEl.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-kc-lb]') : null;
      if (!trigger) return;
      var act = trigger.getAttribute('data-kc-lb');
      if (act === 'close') { e.preventDefault(); close(); }
      else if (act === 'prev') { e.preventDefault(); prev(); }
      else if (act === 'next') { e.preventDefault(); next(); }
      else if (act === 'zoom-in') { e.preventDefault(); zoomTo(scale * 1.4); }
      else if (act === 'zoom-out') { e.preventDefault(); zoomTo(scale / 1.4); }
    });

    // Gestos no palco
    stageEl.addEventListener('pointerdown', onPointerDown);
    stageEl.addEventListener('pointermove', onPointerMove);
    stageEl.addEventListener('pointerup', onPointerUp);
    stageEl.addEventListener('pointercancel', onPointerUp);
    stageEl.addEventListener('wheel', onWheel, { passive: false });
    stageEl.addEventListener('dblclick', onDblClick);
    // impede o "fantasma" de drag de imagem no desktop
    imgEl.addEventListener('dragstart', function (e) { e.preventDefault(); });

    built = true;
  }

  // ── Transform / zoom / pan ──────────────────────────────────────────────────
  function applyTransform() {
    if (!imgEl) return;
    imgEl.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + scale + ')';
    var zoomed = scale > 1.001;
    if (stageEl) stageEl.classList.toggle('is-zoomed', zoomed);
    updateZoomButtons();
  }

  function clampPan() {
    if (!stageEl || !imgEl) return;
    var sw = stageEl.clientWidth;
    var sh = stageEl.clientHeight;
    var bw = imgEl.offsetWidth * scale;
    var bh = imgEl.offsetHeight * scale;
    var maxX = Math.max(0, (bw - sw) / 2);
    var maxY = Math.max(0, (bh - sh) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }

  // Zoom mantendo fixo o ponto (px,py) em coords de viewport. Sem px/py -> centro.
  function zoomTo(targetScale, px, py) {
    if (!stageEl) return;
    var s2 = clampScale(targetScale);
    var rect = stageEl.getBoundingClientRect();
    var ox = (typeof px === 'number') ? (px - rect.left - rect.width / 2) : 0;
    var oy = (typeof py === 'number') ? (py - rect.top - rect.height / 2) : 0;
    // t2 = o - (o - t) * (s2/s)
    tx = ox - (ox - tx) * (s2 / scale);
    ty = oy - (oy - ty) * (s2 / scale);
    scale = s2;
    clampPan();
    applyTransform();
  }

  function resetZoom() {
    scale = 1; tx = 0; ty = 0;
    applyTransform();
  }

  function toggleZoomAt(px, py) {
    if (scale > 1.001) resetZoom();
    else zoomTo(DOUBLE_TAP_SCALE, px, py);
  }

  function updateZoomButtons() {
    if (zoomOutBtn) zoomOutBtn.disabled = scale <= MIN_SCALE + 0.001;
    if (zoomInBtn) zoomInBtn.disabled = scale >= MAX_SCALE - 0.001;
  }

  function pointInImage(x, y) {
    if (!imgEl) return false;
    var r = imgEl.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // ── Navegacao ────────────────────────────────────────────────────────────────
  function show(i) {
    if (!images.length) return;
    index = clamp(i, 0, images.length - 1);
    resetZoom();
    var src = images[index];
    if (imgEl) {
      imgEl.classList.add('is-switching');
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        if (!imgEl) return;
        imgEl.src = src;
        window.requestAnimationFrame(function () {
          if (imgEl) imgEl.classList.remove('is-switching');
        });
      };
      pre.src = src;
    }
    updateCounter();
    updateNav();
    preloadNeighbors();
  }

  function next() { if (index < images.length - 1) show(index + 1); }
  function prev() { if (index > 0) show(index - 1); }

  function updateCounter() {
    if (!counterEl) return;
    counterEl.textContent = images.length > 1 ? ((index + 1) + ' / ' + images.length) : '';
  }

  function updateNav() {
    var multi = images.length > 1;
    if (prevBtn) { prevBtn.hidden = !multi; prevBtn.disabled = index <= 0; }
    if (nextBtn) { nextBtn.hidden = !multi; nextBtn.disabled = index >= images.length - 1; }
  }

  function preloadNeighbors() {
    [index - 1, index + 1].forEach(function (i) {
      if (i >= 0 && i < images.length) { var im = new Image(); im.src = images[i]; }
    });
  }

  // ── Scroll lock (iOS-safe) ───────────────────────────────────────────────────
  function lockScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = (-savedScrollY) + 'px';
    document.body.classList.add('kc-lightbox-lock');
  }

  function unlockScroll() {
    document.body.classList.remove('kc-lightbox-lock');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  // ── Sincroniza a galeria com a imagem vista ao fechar ────────────────────────
  function syncGalleryToIndex(i) {
    var src = images[i];
    if (!src) return;
    var main = document.getElementById('mainImage');
    if (main && main.getAttribute('src') !== src) main.src = src;
    var thumbs = document.querySelectorAll('#thumbnails .kc-thumbnail');
    thumbs.forEach(function (t, idx) { t.classList.toggle('active', idx === i); });
  }

  // ── Abrir / Fechar ────────────────────────────────────────────────────────────
  function open(opts) {
    build();
    var list = collectImages();
    if (!list.length) return;
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
    images = list;
    index = (opts && typeof opts.index === 'number')
      ? clamp(opts.index, 0, images.length - 1)
      : currentStartIndex(list);
    lastFocused = document.activeElement;
    lockScroll();
    overlayEl.hidden = false;
    // reflow para a transicao de opacidade aplicar
    void overlayEl.offsetWidth;
    overlayEl.classList.add('is-open');
    isOpen = true;
    bindGlobal();
    show(index);
    if (closeBtn) { try { closeBtn.focus(); } catch (_) { } }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlayEl.classList.remove('is-open');
    unbindGlobal();
    syncGalleryToIndex(index);
    unlockScroll();
    try { if (lastFocused && lastFocused.focus) lastFocused.focus(); } catch (_) { }
    pointers.clear();
    gestureMode = 'idle';
    resetZoom();
    hideTimer = window.setTimeout(function () {
      if (!isOpen && overlayEl) { overlayEl.hidden = true; if (imgEl) imgEl.removeAttribute('src'); }
    }, 240);
  }

  // ── Gestos: pointer events ───────────────────────────────────────────────────
  function onPointerDown(e) {
    if (!isOpen) return;
    try { stageEl.setPointerCapture(e.pointerId); } catch (_) { }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (imgEl) imgEl.classList.add('is-gesturing');

    if (pointers.size === 1) {
      gestureMode = scale > 1.001 ? 'pan' : 'idle';
      startX = e.clientX; startY = e.clientY; startTime = Date.now(); movedDist = 0;
      panStartTx = tx; panStartTy = ty;
    } else if (pointers.size === 2) {
      gestureMode = 'pinch';
      var pts = Array.from(pointers.values());
      pinchStartDist = dist(pts[0], pts[1]) || 1;
      pinchStartScale = scale;
      pinchStartTx = tx; pinchStartTy = ty;
      var rect = stageEl.getBoundingClientRect();
      pinchMidX = (pts[0].x + pts[1].x) / 2 - rect.left - rect.width / 2;
      pinchMidY = (pts[0].y + pts[1].y) / 2 - rect.top - rect.height / 2;
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gestureMode === 'pinch' && pointers.size >= 2) {
      var pts = Array.from(pointers.values());
      var curDist = dist(pts[0], pts[1]);
      var s2 = clampScale(pinchStartScale * (curDist / pinchStartDist));
      var rect = stageEl.getBoundingClientRect();
      var midXnow = (pts[0].x + pts[1].x) / 2 - rect.left - rect.width / 2;
      var midYnow = (pts[0].y + pts[1].y) / 2 - rect.top - rect.height / 2;
      var cX = (pinchMidX - pinchStartTx) / pinchStartScale;
      var cY = (pinchMidY - pinchStartTy) / pinchStartScale;
      tx = midXnow - cX * s2;
      ty = midYnow - cY * s2;
      scale = s2;
      clampPan();
      applyTransform();
      e.preventDefault();
      return;
    }

    if (pointers.size === 1) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      movedDist = Math.max(movedDist, Math.hypot(dx, dy));
      if (scale > 1.001) {
        gestureMode = 'pan';
        if (stageEl) stageEl.classList.add('is-panning');
        tx = panStartTx + dx;
        ty = panStartTy + dy;
        clampPan();
        applyTransform();
        e.preventDefault();
      } else if (movedDist > TAP_MOVE_TOL) {
        gestureMode = 'swipe';
      }
    }
  }

  function onPointerUp(e) {
    var hadPointer = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    try { stageEl.releasePointerCapture(e.pointerId); } catch (_) { }

    if (gestureMode === 'pinch') {
      if (pointers.size < 2) {
        if (scale <= 1.001) resetZoom();
        else { clampPan(); applyTransform(); }
        if (pointers.size === 1) {
          var rem = Array.from(pointers.values())[0];
          startX = rem.x; startY = rem.y; startTime = Date.now(); movedDist = 0;
          panStartTx = tx; panStartTy = ty;
          gestureMode = scale > 1.001 ? 'pan' : 'idle';
        } else {
          gestureMode = 'idle';
        }
      }
      if (pointers.size === 0 && imgEl) imgEl.classList.remove('is-gesturing');
      return;
    }

    if (pointers.size > 0) return; // ainda ha dedos na tela

    if (imgEl) imgEl.classList.remove('is-gesturing');
    if (stageEl) stageEl.classList.remove('is-panning');

    if (!hadPointer) { gestureMode = 'idle'; return; }

    var dt = Date.now() - startTime;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (gestureMode === 'swipe' && scale <= 1.001) {
      if (Math.abs(dy) > CLOSE_DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx) * 1.3) {
        close(); return;
      }
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) next(); else prev();
        return;
      }
    }

    var isTap = movedDist < TAP_MOVE_TOL && dt < 500;
    if (isTap) {
      var inside = pointInImage(e.clientX, e.clientY);
      if (!inside && scale <= 1.001) { close(); return; }
      if (inside && e.pointerType !== 'mouse') {
        var now = Date.now();
        if (now - lastTapTime < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
          lastTapTime = 0;
          toggleZoomAt(e.clientX, e.clientY);
        } else {
          lastTapTime = now; lastTapX = e.clientX; lastTapY = e.clientY;
        }
      }
    }
    gestureMode = scale > 1.001 ? 'pan' : 'idle';
  }

  function onWheel(e) {
    if (!isOpen) return;
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
    zoomTo(scale * factor, e.clientX, e.clientY);
  }

  function onDblClick(e) {
    if (!isOpen) return;
    e.preventDefault();
    toggleZoomAt(e.clientX, e.clientY);
  }

  // ── Teclado / resize ─────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!isOpen) return;
    switch (e.key) {
      case 'Escape': e.preventDefault(); close(); break;
      case 'ArrowLeft': e.preventDefault(); prev(); break;
      case 'ArrowRight': e.preventDefault(); next(); break;
      case '+': case '=': e.preventDefault(); zoomTo(scale * 1.4); break;
      case '-': case '_': e.preventDefault(); zoomTo(scale / 1.4); break;
      case '0': e.preventDefault(); resetZoom(); break;
      case 'Tab': trapFocus(e); break;
      default: break;
    }
  }

  function trapFocus(e) {
    if (!overlayEl) return;
    var nodes = overlayEl.querySelectorAll('button:not([hidden]):not([disabled])');
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onResize() {
    if (!isOpen) return;
    clampPan();
    applyTransform();
  }

  function bindGlobal() {
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  }

  function unbindGlobal() {
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
  }

  // ── Afford ância no main image + gatilhos de abertura ────────────────────────
  function initAffordance() {
    var galleryMain = document.querySelector('.kc-gallery-main');
    var main = document.getElementById('mainImage');
    if (!galleryMain || !main) return;

    main.setAttribute('tabindex', '0');
    main.setAttribute('role', 'button');
    if (!main.getAttribute('aria-label')) {
      main.setAttribute('aria-label', 'Ampliar imagem em tela cheia');
    }

    if (!galleryMain.querySelector('.kc-zoom-hint')) {
      var hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'kc-zoom-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.setAttribute('tabindex', '-1');
      hint.title = 'Ampliar';
      hint.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i>';
      galleryMain.appendChild(hint);
    }

    var syncZoomable = function () {
      galleryMain.classList.toggle('kc-zoomable', isMainVisible());
    };
    syncZoomable();
    try {
      var mo = new MutationObserver(syncZoomable);
      mo.observe(main, { attributes: true, attributeFilter: ['style', 'src'] });
    } catch (_) { }
  }

  function wireOpenTriggers() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var hit = t.closest('.kc-zoom-hint') || (t.id === 'mainImage' ? t : t.closest('#mainImage'));
      if (!hit) return;
      if (!isMainVisible()) return;
      e.preventDefault();
      open();
    });

    document.addEventListener('keydown', function (e) {
      if (isOpen) return;
      var t = e.target;
      if (!t || t.id !== 'mainImage') return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      if (!isMainVisible()) return;
      e.preventDefault();
      open();
    });
  }

  function init() {
    initAffordance();
    wireOpenTriggers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── API publica ───────────────────────────────────────────────────────────────
  window._KCProduct.lightbox = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; }
  };
})();
