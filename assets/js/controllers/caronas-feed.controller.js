/* KinoCampus - Caronas Feed Controller (V8.4.2.0) */
(function () {
  'use strict';

  function norm(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') return window.KCUtils.normalizeText(value);
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const state = {
    tipos: new Set(['ofereco', 'procuro']), // tipos ativos (ofereco/procuro)
    campi: new Set(),                       // filtros de campus ativos (vazio = todos)
    verified: false,
  };

  // Lê os dados do card: data-category e data-kc-tags
  function cardTags(card) {
    const tags = card.getAttribute('data-kc-tags') || '';
    const cat  = card.getAttribute('data-category') || '';
    return norm(tags + ' ' + cat);
  }

  function buildExtraPredicate() {
    return function (card) {
      const text = cardTags(card);

      // Filtro de tipo (Ofereço / Procuro)
      const tiposAtivos = Array.from(state.tipos);
      if (tiposAtivos.length > 0 && tiposAtivos.length < 2) {
        // Se só um tipo ativo: o card precisa ter aquele tipo no texto
        const hasOfereco = tiposAtivos.includes('ofereco');
        const hasProcuro = tiposAtivos.includes('procuro');
        if (hasOfereco && !text.includes('ofereco')) return false;
        if (hasProcuro && !text.includes('procuro')) return false;
      }

      // Filtro de campus (pelo menos um deve bater se algum estiver ativo)
      if (state.campi.size > 0) {
        const campiAtivos = Array.from(state.campi);
        const matches = campiAtivos.some((campus) => {
          if (campus === 'samambaia') return text.includes('samambaia');
          if (campus === 'campus-ii') return text.includes('campus ii') || text.includes('colemar ii');
          if (campus === 'colemar') return text.includes('colemar');
          return text.includes(campus);
        });
        if (!matches) return false;
      }

      // Filtro de verificados
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
    const container = document.getElementById('kc-caronas-filters');
    if (!container) return;

    // Tipos
    state.tipos.clear();
    container.querySelectorAll('[data-kc-carona-type]').forEach((input) => {
      if (input.checked) state.tipos.add(input.getAttribute('data-kc-carona-type'));
    });

    // Campi
    state.campi.clear();
    container.querySelectorAll('[data-kc-carona-campus]').forEach((input) => {
      if (input.checked) state.campi.add(input.getAttribute('data-kc-carona-campus'));
    });

    // Verificados
    const verifiedInput = container.querySelector('[data-kc-carona-verified]');
    state.verified = verifiedInput ? verifiedInput.checked : false;

    applyFilters();
  }

  function bindFilters() {
    const container = document.getElementById('kc-caronas-filters');
    if (!container) return;
    container.addEventListener('change', syncFiltersFromInputs);
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
      },
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;

    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: injectFeed });
    } else {
      injectFeed();
    }

    // Fallback: bind filtros após kc-filters inicializar
    const waitFilters = setInterval(() => {
      if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
        clearInterval(waitFilters);
        bindFilters();
        syncFiltersFromInputs();
      }
    }, 100);
    setTimeout(() => clearInterval(waitFilters), 5000);
  });
})();
