/* KinoCampus - eventos controller (V8.1.2.4.5) */
(function () {
  'use strict';

  const MODULE = 'eventos';
  const LIMIT = null;

  function reapplyFiltersAndSearch() {
    try {
      const input = document.getElementById('searchInput');
      const q = input && input.value ? String(input.value) : '';

      if (typeof window.filterPosts === 'function') {
        if (q) window.filterPosts(q); else window.filterPosts();
        return;
      }

      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      }
    } catch (_) {}
  }

  async function injectFeed() {
    try {
      if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return;
      if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') return;

      const feed = document.querySelector('.kc-feed-list');
      if (!feed) return;

      const params = MODULE ? { module: MODULE } : {};
      const posts = await window.KCAPI.getPosts(params);
      if (!Array.isArray(posts) || posts.length === 0) return;

      const slice = (Number.isFinite(LIMIT) && LIMIT > 0) ? posts.slice(0, LIMIT) : posts;

      const prepared = slice.map((raw) => {
        const p = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(raw, { module: MODULE })
          : raw;

        if (window.KCUtils && typeof window.KCUtils.applyPresentationRules === 'function') {
          window.KCUtils.applyPresentationRules(p, { module: MODULE, view: 'eventos' });
        }
        return p;
      });

      feed.innerHTML = prepared.map(window.KCUtils.renderPostCard).join('\n');

      setTimeout(reapplyFiltersAndSearch, 0);
      window.addEventListener('load', reapplyFiltersAndSearch, { once: true });
    } catch (e) {
      console.warn('[KinoCampus] Falha ao carregar feed dinâmico (eventos). Usando fallback estático.', e);
    }
  }

// Calendário clamp (Jan/26..Dez/26) + default Fev/26 (persistido)
  const MIN_Y = 2026;
  const MIN_M = 0;  // Jan
  const MAX_Y = 2026;
  const MAX_M = 11; // Dez
  const DEFAULT_Y = 2026;
  const DEFAULT_M = 1; // Fev
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
    injectFeed();
  });
})();