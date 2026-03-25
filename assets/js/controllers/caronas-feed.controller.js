/* KinoCampus - Caronas Feed Controller (V8.5.0.0) */
(function () {
  'use strict';

  function norm(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') return window.KCUtils.normalizeText(value);
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const state = {
    tipos: new Set(['ofereco', 'procuro']),
    campi: new Set(),
    verified: false,
  };

  function cardTags(card) {
    const tags = card.getAttribute('data-kc-tags') || '';
    const cat  = card.getAttribute('data-category') || '';
    return norm(tags + ' ' + cat);
  }

  function campusMatchesText(campus, text) {
    if (campus === 'samambaia') return text.includes('samambaia');
    if (campus === 'campus-ii') return text.includes('campus ii') || text.includes('colemar ii');
    if (campus === 'colemar') return text.includes('colemar');
    return text.includes(campus);
  }

  function buildExtraPredicate() {
    return function (card) {
      const text = cardTags(card);
      const tiposAtivos = Array.from(state.tipos);
      if (tiposAtivos.length > 0 && tiposAtivos.length < 2) {
        if (tiposAtivos.includes('ofereco') && !text.includes('ofereco')) return false;
        if (tiposAtivos.includes('procuro') && !text.includes('procuro')) return false;
      }
      if (state.campi.size > 0) {
        const matches = Array.from(state.campi).some((c) => campusMatchesText(c, text));
        if (!matches) return false;
      }
      if (state.verified && card.getAttribute('data-verified') !== 'true') return false;
      return true;
    };
  }

  function applyFilters() {
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
      window.kcFilters.setExtraPredicate(buildExtraPredicate());
    }
  }

  function syncFiltersFromInputs() {
    // Tipos — lê dentro da sidebar (novo markup usa kc-marketplace-filter-group__options)
    state.tipos.clear();
    document.querySelectorAll('[data-kc-carona-type]').forEach((input) => {
      if (input.checked) state.tipos.add(input.getAttribute('data-kc-carona-type'));
    });
    // Campi
    state.campi.clear();
    document.querySelectorAll('[data-kc-carona-campus]').forEach((input) => {
      if (input.checked) state.campi.add(input.getAttribute('data-kc-carona-campus'));
    });
    // Verificados
    const verifiedInput = document.querySelector('[data-kc-carona-verified]');
    state.verified = verifiedInput ? verifiedInput.checked : false;
    applyFilters();
  }

  // Atualiza contadores de cards visíveis por campus na sidebar
  function updateRouteCounts() {
    const cards = Array.from(document.querySelectorAll('.kc-feed-list .kc-card'));
    const routeBtns = document.querySelectorAll('[data-kc-carona-route-campus]');
    routeBtns.forEach(function (btn) {
      const campus = btn.getAttribute('data-kc-carona-route-campus');
      const countEl = btn.querySelector('.kc-category-count');
      if (!countEl) return;
      if (!campus) {
        countEl.textContent = cards.length;
      } else {
        const n = cards.filter(function (c) { return campusMatchesText(campus, cardTags(c)); }).length;
        countEl.textContent = n;
      }
    });
  }

  // Bind do botão "Limpar filtros"
  function bindClearFilters() {
    const btn = document.querySelector('[data-kc-caronas-clear-filters]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-kc-carona-type]').forEach((i) => { i.checked = true; });
      document.querySelectorAll('[data-kc-carona-campus]').forEach((i) => { i.checked = false; });
      const v = document.querySelector('[data-kc-carona-verified]');
      if (v) v.checked = false;
      state.tipos = new Set(['ofereco', 'procuro']);
      state.campi.clear();
      state.verified = false;
      applyFilters();
      setActiveRoute('');
    });
  }

  function setActiveRoute(campus) {
    // sidebar
    document.querySelectorAll('[data-kc-carona-route-campus]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-kc-carona-route-campus') === campus);
    });
    // mobile rail
    document.querySelectorAll('[data-kc-carona-rail-campus]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-kc-carona-rail-campus') === campus);
    });
  }

  function applyRouteFilter(campus) {
    setActiveRoute(campus);
    state.campi.clear();
    if (campus) state.campi.add(campus);
    // sync checkboxes na sidebar
    document.querySelectorAll('[data-kc-carona-campus]').forEach(function (input) {
      input.checked = (campus === input.getAttribute('data-kc-carona-campus'));
    });
    applyFilters();
  }

  function applyTypeFilter(tipo) {
    // Botão de tipo no rail: toggle exclusivo
    document.querySelectorAll('[data-kc-carona-rail-type]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-kc-carona-rail-type') === tipo);
    });
    if (!tipo) {
      state.tipos = new Set(['ofereco', 'procuro']);
    } else {
      state.tipos = new Set([tipo]);
    }
    document.querySelectorAll('[data-kc-carona-type]').forEach(function (input) {
      input.checked = (tipo ? input.getAttribute('data-kc-carona-type') === tipo : true);
    });
    applyFilters();
  }

  function bindFilters() {
    // Sidebar checkboxes
    document.querySelectorAll('[data-kc-carona-type], [data-kc-carona-campus], [data-kc-carona-verified]').forEach(function (input) {
      input.addEventListener('change', syncFiltersFromInputs);
    });
    // Sidebar route buttons
    document.querySelectorAll('[data-kc-carona-route-campus]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyRouteFilter(btn.getAttribute('data-kc-carona-route-campus'));
      });
    });
    // Mobile rail campus buttons
    document.querySelectorAll('[data-kc-carona-rail-campus]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyRouteFilter(btn.getAttribute('data-kc-carona-rail-campus'));
      });
    });
    // Mobile rail type buttons
    document.querySelectorAll('[data-kc-carona-rail-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tipo = btn.getAttribute('data-kc-carona-rail-type');
        // Toggle: clique duplo volta a "Todos"
        const isActive = btn.classList.contains('is-active');
        applyTypeFilter(isActive ? '' : tipo);
      });
    });
    bindClearFilters();
  }

  function injectFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({
      module: 'caronas',
      pageModule: 'caronas',
      sortBy: sortBy || 'votos',
      onReady: function () {
        bindFilters();
        syncFiltersFromInputs();
        updateRouteCounts();
      },
      onAfterAppend: function () {
        updateRouteCounts();
      },
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;

    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: injectFeed });
    } else {
      injectFeed();
    }

    // Fallback: bind filtros após kc-filters inicializar
    var waitFilters = setInterval(function () {
      if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
        clearInterval(waitFilters);
        bindFilters();
        syncFiltersFromInputs();
      }
    }, 100);
    setTimeout(function () { clearInterval(waitFilters); }, 5000);
  });
})();
