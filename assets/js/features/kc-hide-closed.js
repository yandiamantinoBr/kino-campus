/* KinoCampus - shared "Ocultar encerrados" switch and URL state. */
(function () {
  'use strict';

  const EVENT_NAME = 'kc:hide-closed-change';
  const CANONICAL_PARAM = 'closed';
  const LEGACY_PARAM = 'hideClosed';
  let initialized = false;
  let hideClosed = false;
  let busy = false;
  let hiddenCount = null;

  function readUrlState() {
    try {
      const params = new URL(window.location.href).searchParams;
      const canonical = String(params.get(CANONICAL_PARAM) || '').trim().toLowerCase();
      const legacy = String(params.get(LEGACY_PARAM) || '').trim().toLowerCase();
      return canonical === '1' || canonical === 'true' || legacy === '1' || legacy === 'true';
    } catch (_) {
      return false;
    }
  }

  function writeUrlState(next) {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(CANONICAL_PARAM, '1');
      else url.searchParams.delete(CANONICAL_PARAM);
      url.searchParams.delete(LEGACY_PARAM);
      window.history.replaceState(window.history.state || {}, '', url.toString());
    } catch (_) { }
  }

  function allToggles() {
    return Array.from(document.querySelectorAll('[data-kc-hide-closed-toggle]'));
  }

  function inputFor(toggle) {
    return toggle && toggle.querySelector('[data-kc-hide-closed-input]');
  }

  function statusText(next, hiddenCount) {
    if (!next) return 'Encerrados visíveis';
    const count = Number(hiddenCount);
    if (Number.isFinite(count) && count > 0) {
      return count === 1 ? '1 encerrado oculto' : `${count} encerrados ocultos`;
    }
    return 'Encerrados ocultos';
  }

  function syncDom(options) {
    const opts = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(opts, 'busy')) busy = opts.busy === true;
    if (Object.prototype.hasOwnProperty.call(opts, 'hiddenCount')) {
      const count = Number(opts.hiddenCount);
      hiddenCount = Number.isFinite(count) && count >= 0 ? count : null;
    }
    allToggles().forEach((toggle) => {
      const input = inputFor(toggle);
      if (input) {
        input.checked = hideClosed;
        input.setAttribute('aria-checked', hideClosed ? 'true' : 'false');
        input.setAttribute('aria-busy', busy ? 'true' : 'false');
      }
      toggle.classList.toggle('is-active', hideClosed);
      toggle.classList.toggle('is-loading', busy);
      const status = toggle.querySelector('[data-kc-hide-closed-status]');
      if (status) status.textContent = statusText(hideClosed, hiddenCount);
    });
    if (document.body) document.body.toggleAttribute('data-kc-hide-closed-active', hideClosed);
  }

  function emit(reason, source) {
    document.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: {
        hideClosed,
        reason: String(reason || 'change'),
        source: source || null,
      }
    }));
  }

  function setState(next, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const normalized = next === true;
    const changed = normalized !== hideClosed;
    hideClosed = normalized;
    if (opts.updateUrl !== false) writeUrlState(hideClosed);
    syncDom(opts);
    if (opts.emit !== false && (changed || opts.forceEmit === true)) {
      emit(opts.reason || 'programmatic', opts.source || null);
    }
    return hideClosed;
  }

  function setBusy(busy) {
    syncDom({ busy: busy === true });
  }

  function setHiddenCount(count) {
    syncDom({ hiddenCount: count });
  }

  function setRevealVisible(visible) {
    document.querySelectorAll('[data-kc-hide-closed-reveal]').forEach((button) => {
      button.hidden = !(visible === true && hideClosed);
    });
  }

  function bindToggle(toggle) {
    if (!toggle || toggle.dataset.kcHideClosedBound === '1') return;
    const input = inputFor(toggle);
    if (!input) return;
    toggle.dataset.kcHideClosedBound = '1';
    input.addEventListener('change', () => {
      setState(input.checked, { reason: 'toggle', source: input });
    });
  }

  function bindReveal(button) {
    if (!button || button.dataset.kcHideClosedBound === '1') return;
    button.dataset.kcHideClosedBound = '1';
    button.addEventListener('click', () => {
      setState(false, { reason: 'reveal', source: button });
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    hideClosed = readUrlState();
    allToggles().forEach(bindToggle);
    document.querySelectorAll('[data-kc-hide-closed-reveal]').forEach(bindReveal);
    writeUrlState(hideClosed);
    syncDom();
    document.dispatchEvent(new CustomEvent('kc:hide-closed-ready', { detail: { hideClosed } }));
  }

  window.addEventListener('popstate', () => {
    setState(readUrlState(), { updateUrl: false, reason: 'popstate', forceEmit: true });
  });

  window.KCHideClosed = Object.freeze({
    EVENT_NAME,
    init,
    getState: () => hideClosed,
    readUrlState,
    setState,
    setBusy,
    setHiddenCount,
    setRevealVisible,
    sync: syncDom,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
