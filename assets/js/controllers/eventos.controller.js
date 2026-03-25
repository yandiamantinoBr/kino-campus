/* KinoCampus - eventos controller (V8.1.2.4.5) */
(function () {
  'use strict';

  function injectFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({ module: 'eventos', pageModule: 'eventos', sortBy: sortBy || 'votos' });
  }

// Calendário dinâmico: inicia no mês atual, permite navegar 18 meses à frente
  const _now = new Date();
  const MIN_Y = _now.getFullYear();
  const MIN_M = _now.getMonth();
  const _maxDate = new Date(_now.getFullYear(), _now.getMonth() + 18, 1);
  const MAX_Y = _maxDate.getFullYear();
  const MAX_M = _maxDate.getMonth();
  const DEFAULT_Y = _now.getFullYear();
  const DEFAULT_M = _now.getMonth();
  const STORAGE_KEY = 'kc_events_calendar_month';

  const MONTHS_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];

  function clampMonth(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    if (d.getFullYear() < MIN_Y || (d.getFullYear() === MIN_Y && d.getMonth() < MIN_M)) {
      return new Date(MIN_Y, MIN_M, 1);
    }
    if (d.getFullYear() > MAX_Y || (d.getFullYear() === MAX_Y && d.getMonth() > MAX_M)) {
      return new Date(MAX_Y, MAX_M, 1);
    }
    return d;
  }

  function formatMonthYear(d) {
    const m = d.getMonth();
    const y = d.getFullYear();
    return `${MONTHS_PT[m]} / ${y}`;
  }

  function readStoredMonth() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s && /^\d{4}-\d{2}$/.test(s)) {
        const parts = s.split('-');
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        if (Number.isFinite(y) && Number.isFinite(m)) return clampMonth(new Date(y, m, 1));
      }
    } catch (_) {}
    return clampMonth(new Date(DEFAULT_Y, DEFAULT_M, 1));
  }

  function storeMonth(d) {
    try {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      localStorage.setItem(STORAGE_KEY, `${y}-${m}`);
    } catch (_) {}
  }

  function initCalendarClamp() {
    const monthEl = document.querySelector('[data-kc-cal-month]');
    const prevBtn = document.querySelector('[data-kc-cal-prev]');
    const nextBtn = document.querySelector('[data-kc-cal-next]');
    if (!monthEl) return;

    let month = readStoredMonth();
    monthEl.textContent = formatMonthYear(month);

    function setMonth(d) {
      month = clampMonth(d);
      storeMonth(month);
      monthEl.textContent = formatMonthYear(month);

      // estado visual dos botões (desabilita nas bordas)
      const atMin = (month.getFullYear() === MIN_Y && month.getMonth() === MIN_M);
      const atMax = (month.getFullYear() === MAX_Y && month.getMonth() === MAX_M);
      if (prevBtn) prevBtn.disabled = atMin;
      if (nextBtn) nextBtn.disabled = atMax;
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
      });
    }

    setMonth(month);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCalendarClamp();
    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: injectFeed });
    } else {
      injectFeed();
    }
  });
})();