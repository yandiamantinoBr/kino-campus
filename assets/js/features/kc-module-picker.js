/**
 * Kino Campus module picker.
 *
 * The catalog comes from the publishing schema already loaded by every feed,
 * so adding a module there (with label, emoji and redirect) automatically
 * exposes it here. The picker is intentionally mobile-only in CSS because the
 * desktop header already provides the same module navigation.
 */
(function initKcModulePicker(global) {
  'use strict';

  var MODAL_ID = 'kcModulePickerModal';
  var LOCK_KEY = 'module-picker-modal';
  var initialized = false;
  var pageLocked = false;
  var lastTrigger = null;
  var fallbackOverflow = '';
  var inertSnapshot = [];

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function normalizePageKey(pathname) {
    var clean = String(pathname || '').trim();
    try {
      clean = decodeURIComponent(clean);
    } catch (_) {
      // Keep the encoded path as a stable comparison key.
    }
    clean = clean.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    if (!clean.startsWith('/')) clean = '/' + clean;
    clean = clean.toLowerCase();
    if (clean.endsWith('/')) clean += 'index.html';
    return clean.replace(/\/index\.html$/, '/') || '/';
  }

  function resolveModuleUrl(redirect) {
    if (typeof redirect !== 'string' || !redirect.trim()) return null;
    try {
      var url = new URL(redirect.trim(), document.baseURI);
      if (url.origin !== global.location.origin) return null;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (url.username || url.password) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function navigationRanks() {
    var ranks = Object.create(null);
    Array.prototype.forEach.call(document.querySelectorAll('.kc-nav-links a[href]'), function (link) {
      var url = resolveModuleUrl(link.getAttribute('href'));
      if (!url) return;
      var key = normalizePageKey(url.pathname);
      if (ranks[key] === undefined) ranks[key] = Object.keys(ranks).length;
    });
    return ranks;
  }

  function getModules() {
    var schema = global._KCCreatePost && global._KCCreatePost.schema;
    var definitions = schema && schema.modules;
    if (!definitions || typeof definitions !== 'object') return [];

    var ranks = navigationRanks();
    return Object.keys(definitions).map(function (key, sourceIndex) {
      var definition = definitions[key];
      if (!definition || typeof definition !== 'object') return null;
      var label = typeof definition.label === 'string' ? definition.label.trim() : '';
      var url = resolveModuleUrl(definition.redirect);
      if (!label || !url) return null;
      var pageKey = normalizePageKey(url.pathname);
      return {
        key: key,
        label: label,
        emoji: typeof definition.emoji === 'string' && definition.emoji.trim()
          ? definition.emoji.trim()
          : '📌',
        url: url,
        pageKey: pageKey,
        rank: ranks[pageKey] === undefined ? Number.MAX_SAFE_INTEGER : ranks[pageKey],
        sourceIndex: sourceIndex,
      };
    }).filter(Boolean).sort(function (left, right) {
      return left.rank - right.rank || left.sourceIndex - right.sourceIndex;
    });
  }

  function shouldPreserveClosed() {
    if (global.KCHideClosed && typeof global.KCHideClosed.getState === 'function') {
      return global.KCHideClosed.getState() === true;
    }
    var input = document.querySelector('[data-kc-hide-closed-input]');
    if (input && input.checked) return true;
    var params = new URLSearchParams(global.location.search || '');
    return params.get('closed') === '1' || params.get('closed') === 'true'
      || params.get('hideClosed') === '1' || params.get('hideClosed') === 'true';
  }

  function moduleHref(module) {
    var url = new URL(module.url.href);
    url.searchParams.delete('hideClosed');
    url.searchParams.delete('hide_closed');
    if (shouldPreserveClosed()) url.searchParams.set('closed', '1');
    else url.searchParams.delete('closed');
    return url.pathname + url.search + url.hash;
  }

  function createModal() {
    var existing = getModal();
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'kc-sidebar-context-modal kc-module-picker-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = [
      '<div class="kc-sidebar-context-modal__backdrop" data-kc-module-picker-close aria-hidden="true"></div>',
      '<section class="kc-sidebar-context-modal__dialog kc-module-picker-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="kcModulePickerTitle" tabindex="-1">',
      '  <header class="kc-sidebar-context-modal__header">',
      '    <h2 class="kc-sidebar-context-modal__title" id="kcModulePickerTitle"><i class="fas fa-layer-group" aria-hidden="true"></i><span>Escolher Módulo</span></h2>',
      '    <button class="kc-sidebar-context-modal__close" type="button" data-kc-module-picker-close aria-label="Fechar seletor de módulos"><span class="kc-module-picker-close__glyph" aria-hidden="true">×</span></button>',
      '  </header>',
      '  <div class="kc-sidebar-context-modal__body kc-module-picker-modal__body">',
      '    <label class="kc-module-picker-search">',
      '      <span class="kc-sr-only">Buscar módulo</span>',
      '      <input type="search" inputmode="search" autocomplete="off" placeholder="Buscar módulo" data-kc-module-picker-search>',
      '      <i class="fas fa-search" aria-hidden="true"></i>',
      '    </label>',
      '    <nav class="kc-module-picker-nav" aria-label="Módulos do Kino Campus">',
      '      <ul class="kc-module-picker-list" data-kc-module-picker-list></ul>',
      '    </nav>',
      '    <p class="kc-module-picker-empty" role="status" data-kc-module-picker-empty hidden>Nenhum módulo encontrado.</p>',
      '  </div>',
      '</section>',
    ].join('');
    document.body.appendChild(modal);
    return modal;
  }

  function renderModules(modal) {
    var modules = getModules();
    var list = modal.querySelector('[data-kc-module-picker-list]');
    var empty = modal.querySelector('[data-kc-module-picker-empty]');
    var search = modal.querySelector('[data-kc-module-picker-search]');
    var currentPage = normalizePageKey(global.location.pathname);
    list.textContent = '';
    search.value = '';

    modules.forEach(function (module) {
      var item = document.createElement('li');
      item.className = 'kc-module-picker-list__item';
      item.dataset.moduleSearch = module.label.toLocaleLowerCase('pt-BR');

      var link = document.createElement('a');
      link.className = 'kc-module-picker-option';
      link.href = moduleHref(module);
      link.dataset.kcModulePickerOption = module.key;

      var emoji = document.createElement('span');
      emoji.className = 'kc-module-picker-option__emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = module.emoji;

      var label = document.createElement('span');
      label.className = 'kc-module-picker-option__label';
      label.textContent = module.label;

      link.appendChild(emoji);
      link.appendChild(label);
      if (module.pageKey === currentPage) {
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
        var current = document.createElement('span');
        current.className = 'kc-module-picker-option__current';
        current.setAttribute('aria-hidden', 'true');
        current.textContent = 'Atual';
        link.appendChild(current);
      }
      item.appendChild(link);
      list.appendChild(item);
    });

    empty.hidden = modules.length > 0;
    return modules.length;
  }

  function setBackgroundInert(modal) {
    inertSnapshot = [];
    Array.prototype.forEach.call(document.body.children, function (element) {
      if (element === modal) return;
      inertSnapshot.push({
        element: element,
        hadAttribute: element.hasAttribute('inert'),
        propertyValue: element.inert === true,
      });
      element.setAttribute('inert', '');
      element.inert = true;
    });
  }

  function restoreBackgroundInert() {
    inertSnapshot.forEach(function (entry) {
      if (!entry.element || !entry.element.isConnected) return;
      if (!entry.hadAttribute) entry.element.removeAttribute('inert');
      entry.element.inert = entry.propertyValue;
    });
    inertSnapshot = [];
  }

  function lockPage(modal) {
    if (pageLocked) return;
    pageLocked = true;
    setBackgroundInert(modal);
    if (global.KCOverlayLock && typeof global.KCOverlayLock.lock === 'function') {
      global.KCOverlayLock.lock(LOCK_KEY);
      return;
    }
    fallbackOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function unlockPage() {
    if (!pageLocked) return;
    pageLocked = false;
    restoreBackgroundInert();
    if (global.KCOverlayLock && typeof global.KCOverlayLock.unlock === 'function') {
      global.KCOverlayLock.unlock(LOCK_KEY);
      return;
    }
    document.body.style.overflow = fallbackOverflow;
  }

  function isFocusable(element) {
    if (!element || element.disabled || element.hidden) return false;
    if (element.getAttribute('tabindex') === '-1') return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (!global.getComputedStyle) return true;
    var current = element;
    while (current && current.nodeType === 1) {
      var style = global.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      current = current.parentElement;
    }
    return true;
  }

  function getFocusable(modal) {
    var dialog = modal.querySelector('.kc-module-picker-modal__dialog');
    return Array.prototype.slice.call(dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(isFocusable);
  }

  function visibleDesktopFallback() {
    var currentPage = normalizePageKey(global.location.pathname);
    var links = Array.prototype.slice.call(document.querySelectorAll('.kc-nav-links a[href]'));
    var current = links.find(function (link) {
      var url = resolveModuleUrl(link.getAttribute('href'));
      return url && normalizePageKey(url.pathname) === currentPage && isFocusable(link);
    });
    return current || links.find(isFocusable) || null;
  }

  function setExpanded(activeTrigger) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-kc-module-picker-open]'), function (trigger) {
      trigger.setAttribute('aria-expanded', trigger === activeTrigger ? 'true' : 'false');
    });
  }

  function closeModal(options) {
    var modal = getModal();
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    var restoreFocus = !options || options.restoreFocus !== false;
    var trigger = lastTrigger;
    if (modal.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    modal.setAttribute('aria-hidden', 'true');
    setExpanded(null);
    unlockPage();
    lastTrigger = null;
    if (restoreFocus) {
      var focusTarget = trigger && trigger.isConnected && isFocusable(trigger)
        ? trigger
        : visibleDesktopFallback();
      if (focusTarget) focusTarget.focus();
    }
  }

  function openModal(trigger) {
    var modal = createModal();
    if (!renderModules(modal)) return;
    lastTrigger = trigger;
    modal.setAttribute('aria-hidden', 'false');
    setExpanded(trigger);
    lockPage(modal);
    var closeButton = modal.querySelector('.kc-sidebar-context-modal__close');
    if (closeButton) closeButton.focus();
  }

  function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function filterModules(modal, query) {
    var needle = normalizeSearch(query);
    var visible = 0;
    Array.prototype.forEach.call(modal.querySelectorAll('.kc-module-picker-list__item'), function (item) {
      var match = !needle || normalizeSearch(item.dataset.moduleSearch).indexOf(needle) !== -1;
      item.hidden = !match;
      if (match) visible += 1;
    });
    var empty = modal.querySelector('[data-kc-module-picker-empty]');
    empty.hidden = visible > 0;
  }

  function onClick(event) {
    var opener = event.target.closest && event.target.closest('[data-kc-module-picker-open]');
    if (opener) {
      event.preventDefault();
      openModal(opener);
      return;
    }

    var close = event.target.closest && event.target.closest('[data-kc-module-picker-close]');
    if (close) {
      event.preventDefault();
      closeModal();
      return;
    }

    var option = event.target.closest && event.target.closest('[data-kc-module-picker-option]');
    if (!option) return;
    if (option.getAttribute('aria-current') === 'page') {
      event.preventDefault();
      closeModal();
      return;
    }
    closeModal({ restoreFocus: false });
  }

  function onInput(event) {
    if (!event.target.matches || !event.target.matches('[data-kc-module-picker-search]')) return;
    var modal = getModal();
    if (modal) filterModules(modal, event.target.value);
  }

  function onKeydown(event) {
    var modal = getModal();
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    var dialog = modal.querySelector('.kc-module-picker-modal__dialog');
    var focusable = getFocusable(modal);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function syncTriggers() {
    var available = getModules().length > 0;
    var modal = getModal();
    var modalOpen = Boolean(modal && modal.getAttribute('aria-hidden') === 'false');
    if (!available && modalOpen) {
      closeModal({ restoreFocus: false });
      modalOpen = false;
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-kc-module-picker-open]'), function (trigger) {
      trigger.hidden = !available;
      trigger.disabled = !available;
      trigger.setAttribute('aria-expanded', available && modalOpen && trigger === lastTrigger ? 'true' : 'false');
    });
    return available;
  }

  function onViewportModeChange(event) {
    var modal = getModal();
    if (!event.matches && modal && modal.getAttribute('aria-hidden') === 'false') {
      closeModal();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (!document.querySelector('[data-kc-module-picker-open]')) return;
    createModal();
    syncTriggers();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown, true);
    if (typeof global.matchMedia === 'function') {
      var mobileViewport = global.matchMedia('(max-width: 768px)');
      if (typeof mobileViewport.addEventListener === 'function') {
        mobileViewport.addEventListener('change', onViewportModeChange);
      } else if (typeof mobileViewport.addListener === 'function') {
        mobileViewport.addListener(onViewportModeChange);
      }
    }
    global.addEventListener('pagehide', function () {
      closeModal({ restoreFocus: false });
    });
    global.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        closeModal({ restoreFocus: false });
        syncTriggers();
      }
    });
  }

  global.KCModulePicker = {
    init: init,
    open: openModal,
    close: closeModal,
    getModules: getModules,
    sync: syncTriggers,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
