/* KinoCampus — kc-lazy-loader.js (v9.4.0)
   Utilitário de lazy loading para módulos JS não-críticos.
   Expõe window.KCLazyLoader com três métodos:
     load(src, cb)               — carrega src dinamicamente (idempotente)
     onVisible(selector, src, cb)— carrega quando elemento entra no viewport
     onInteraction(sel, evs, src, cb) — carrega na primeira interação
*/
(function () {
  'use strict';

  var _loaded = {};
  var _pending = {};

  function load(src, callback) {
    if (_loaded[src]) {
      if (callback) callback();
      return;
    }
    if (_pending[src]) {
      if (callback) _pending[src].push(callback);
      return;
    }
    _pending[src] = callback ? [callback] : [];
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () {
      _loaded[src] = true;
      var cbs = _pending[src] || [];
      delete _pending[src];
      cbs.forEach(function (cb) { try { cb(); } catch (e) { /* silenciar */ } });
    };
    s.onerror = function () {
      delete _pending[src];
    };
    document.head.appendChild(s);
  }

  function onVisible(selector, src, callback) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      load(src, callback);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        load(src, callback);
      }
    }, { rootMargin: '200px 0px' });
    observer.observe(el);
  }

  function onInteraction(selector, events, src, callback) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    var done = false;
    function handler() {
      if (done) return;
      done = true;
      events.forEach(function (ev) { el.removeEventListener(ev, handler); });
      load(src, callback);
    }
    events.forEach(function (ev) { el.addEventListener(ev, handler, { once: true, passive: true }); });
  }

  window.KCLazyLoader = Object.freeze({ load: load, onVisible: onVisible, onInteraction: onInteraction });
}());
