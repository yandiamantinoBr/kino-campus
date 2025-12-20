/*
  KinoCampus - Shared Utils (V6.0.0)

  Principal função:
  - Centralizar utilitários repetidos (normalize/escape/currency/debounce)
  - Evitar divergência entre scripts (search, filters, etc.)

  Exposição:
  - window.KCUtils
*/

(function () {
  'use strict';

  function normalizeText(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function canonicalCategory(str) {
    let s = normalizeText(str);
    s = s.replace(/^#/, '');
    // plural básico (pt-BR)
    if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
    return s;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cssEscape(str) {
    // fallback simples (suficiente para ids/classes gerados localmente)
    return String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function formatCurrencyBRL(value) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return 'R$ 0,00';
    try {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      // fallback
      const fixed = (Math.round(num * 100) / 100).toFixed(2).replace('.', ',');
      return 'R$ ' + fixed;
    }
  }

  function parseBRLNumber(input) {
    const s = String(input ?? '')
      .replace(/\s/g, '')
      .replace(/R\$/i, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.KCUtils = Object.freeze({
    normalizeText,
    canonicalCategory,
    escapeHtml,
    cssEscape,
    formatCurrencyBRL,
    parseBRLNumber,
    clamp,
    debounce,
  });
})();
