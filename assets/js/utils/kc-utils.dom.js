/*
  KinoCampus - Utils / DOM Domain (v12.2.2)

  Sub-módulo do kc-utils.js — domínio de interação com o DOM
  (debounce, detecção de inputs selecionáveis, cópia via Clipboard API
  com fallback legacy execCommand).
  Expõe window._KCU.dom com 4 funções.

  Carregamento: deve ser incluído APÓS kc-utils.format.js e
  ANTES de kc-utils.js em todos os HTMLs.
  Dependências: nenhuma (módulo autossuficiente).
  Contrato: window._KCU.dom é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Funções do domínio dom ────────────────────────────────────────────────

  function debounce(fn, wait) {
    var delay = typeof wait === 'number' ? wait : 120;
    var t = null;
    return function () {
      var args = arguments;
      var ctx = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  function canSelectInputLike(target) {
    if (!target || target.nodeType !== 1) return false;
    var tagName = String(target.tagName || '').toUpperCase();
    return tagName === 'INPUT' || tagName === 'TEXTAREA';
  }

  function fallbackCopyText(text, options) {
    var normalized = String(text || '');
    var doc = (options && options.document) || (typeof document !== 'undefined' ? document : null);
    if (!normalized || !doc || !doc.body || typeof doc.execCommand !== 'function') return false;

    var target = options && canSelectInputLike(options.target) ? options.target : null;
    var activeElement = doc.activeElement;
    var selection = typeof doc.getSelection === 'function' ? doc.getSelection() : null;
    var previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

    var tempField = null;
    var field = target;
    if (!field) {
      tempField = doc.createElement('textarea');
      tempField.value = normalized;
      tempField.setAttribute('readonly', 'readonly');
      tempField.setAttribute('aria-hidden', 'true');
      tempField.style.position = 'fixed';
      tempField.style.opacity = '0';
      tempField.style.pointerEvents = 'none';
      tempField.style.top = '0';
      tempField.style.left = '0';
      tempField.style.width = '1px';
      tempField.style.height = '1px';
      doc.body.appendChild(tempField);
      field = tempField;
    } else if (field.value !== normalized) {
      field.value = normalized;
    }

    var copied = false;
    try {
      field.focus();
      if (typeof field.select === 'function') field.select();
      if (typeof field.setSelectionRange === 'function') {
        field.setSelectionRange(0, normalized.length);
      }
      copied = doc.execCommand('copy') === true;
    } catch (_) {
      copied = false;
    } finally {
      if (tempField && tempField.parentNode) tempField.parentNode.removeChild(tempField);
      if (selection && typeof selection.removeAllRanges === 'function') {
        selection.removeAllRanges();
        if (previousRange && typeof selection.addRange === 'function') {
          selection.addRange(previousRange);
        }
      }
      if (activeElement && typeof activeElement.focus === 'function' && activeElement !== field) {
        try { activeElement.focus(); } catch (_) { /* restauração de foco silenciosa */ }
      }
    }

    return copied;
  }

  async function copyTextToClipboard(text, options) {
    var normalized = String(text || '');
    if (!normalized) return false;

    if (typeof navigator !== 'undefined'
      && navigator.clipboard
      && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (_) {
        // cai para fallback legado abaixo
      }
    }

    return fallbackCopyText(normalized, options);
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.dom = Object.freeze({
    debounce,
    canSelectInputLike,
    fallbackCopyText,
    copyTextToClipboard,
  });
})();
