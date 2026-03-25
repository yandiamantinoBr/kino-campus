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
    document.querySelectorAll('[data-kc-carona-route-campus]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-kc-carona-route-campus') === campus);
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
    bindClearFilters();
  }

  /* ── Mobile rail — seções do sidebar como modal ───────── */
  var CARONAS_SECTIONS = [
    { key: 'filters', title: 'Filtros',             icon: 'fas fa-filter'    },
    { key: 'routes',  title: 'Rotas Populares',     icon: 'fas fa-route'     },
    { key: 'tips',    title: 'Dicas para Caroneiros', icon: 'fas fa-lightbulb' },
  ];
  var CARONAS_MODAL_ID = 'kcCaronasSectionOverlay';
  var caronasRailState = { activeKey: '', activeNode: null, activePlaceholder: null, lastTrigger: null };

  function ensureCaronasModal() {
    var overlay = document.getElementById(CARONAS_MODAL_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = CARONAS_MODAL_ID;
    overlay.className = 'kc-modal-overlay kc-caronas-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kc-create-modal kc-caronas-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcCaronasSectionTitle">',
      '  <div class="kc-create-modal__header">',
      '    <h2 id="kcCaronasSectionTitle"><i class="fas fa-car"></i><span>Seção</span></h2>',
      '    <button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-caronas-close-section="true"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-create-modal__body">',
      '    <div class="kc-caronas-section-modal__content" data-kc-caronas-section-slot="true"></div>',
      '  </div>',
      '  <div class="kc-caronas-section-modal__actions" data-kc-caronas-section-actions="true"></div>',
      '</div>',
    ].join('');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-kc-caronas-close-section="true"]')) closeCaronasSection();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderCaronasActions() {
    var overlay = document.getElementById(CARONAS_MODAL_ID);
    var actions = overlay ? overlay.querySelector('[data-kc-caronas-section-actions="true"]') : null;
    if (!actions) return;
    if (caronasRailState.activeKey === 'filters') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-caronas-modal-clear>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-apply>Aplicar e fechar</button></div>';
      var clearBtn = actions.querySelector('[data-kc-caronas-modal-clear]');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        document.querySelectorAll('[data-kc-carona-type]').forEach(function (i) { i.checked = true; });
        document.querySelectorAll('[data-kc-carona-campus]').forEach(function (i) { i.checked = false; });
        var v = document.querySelector('[data-kc-carona-verified]');
        if (v) v.checked = false;
        state.tipos = new Set(['ofereco', 'procuro']);
        state.campi.clear();
        state.verified = false;
        applyFilters();
      });
      var applyBtn = actions.querySelector('[data-kc-caronas-modal-apply]');
      if (applyBtn) applyBtn.addEventListener('click', function () { syncFiltersFromInputs(); closeCaronasSection(); });
    } else if (caronasRailState.activeKey === 'routes') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-routes-close>Fechar</button></div>';
      var routeClose = actions.querySelector('[data-kc-caronas-modal-routes-close]');
      if (routeClose) routeClose.addEventListener('click', closeCaronasSection);
    } else {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-tips-close>Entendido!</button></div>';
      var tipsClose = actions.querySelector('[data-kc-caronas-modal-tips-close]');
      if (tipsClose) tipsClose.addEventListener('click', closeCaronasSection);
    }
  }

  function openCaronasSection(key, trigger) {
    var secDef = CARONAS_SECTIONS.filter(function (s) { return s.key === key; })[0];
    if (!secDef) return;
    var node = document.querySelector('[data-kc-caronas-section="' + key + '"]');
    if (!node) return;

    var overlay = ensureCaronasModal();
    closeCaronasSection();

    var slot = overlay.querySelector('[data-kc-caronas-section-slot="true"]');
    var titleSpan = overlay.querySelector('#kcCaronasSectionTitle span');
    var titleIcon = overlay.querySelector('#kcCaronasSectionTitle i');

    var placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-caronas-section-placeholder', key);
    node.parentNode.insertBefore(placeholder, node);
    slot.innerHTML = '';
    slot.appendChild(node);

    caronasRailState.activeKey = key;
    caronasRailState.activeNode = node;
    caronasRailState.activePlaceholder = placeholder;
    caronasRailState.lastTrigger = trigger || null;

    if (titleSpan) titleSpan.textContent = secDef.title;
    if (titleIcon) titleIcon.className = secDef.icon;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    renderCaronasActions();

    // Re-bind filters inside modal
    node.querySelectorAll('[data-kc-carona-type], [data-kc-carona-campus], [data-kc-carona-verified]').forEach(function (input) {
      input.addEventListener('change', syncFiltersFromInputs);
    });
    node.querySelectorAll('[data-kc-carona-route-campus]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyRouteFilter(btn.getAttribute('data-kc-carona-route-campus'));
      });
    });

    var closeBtn = overlay.querySelector('[data-kc-caronas-close-section="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeCaronasSection() {
    var overlay = document.getElementById(CARONAS_MODAL_ID);
    var slot = overlay ? overlay.querySelector('[data-kc-caronas-section-slot="true"]') : null;
    var wasActive = !!(overlay && overlay.classList.contains('active'));

    if (caronasRailState.activeNode && caronasRailState.activePlaceholder && caronasRailState.activePlaceholder.parentNode) {
      caronasRailState.activePlaceholder.parentNode.replaceChild(caronasRailState.activeNode, caronasRailState.activePlaceholder);
    }

    var returnFocus = caronasRailState.lastTrigger;
    caronasRailState.activeKey = '';
    caronasRailState.activeNode = null;
    caronasRailState.activePlaceholder = null;
    caronasRailState.lastTrigger = null;

    if (slot) slot.innerHTML = '';
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) document.body.classList.remove('kc-modal-open');
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
  }

  function bindCaronasRail() {
    document.querySelectorAll('[data-kc-caronas-open-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCaronasSection(btn.getAttribute('data-kc-caronas-open-section'), btn);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && caronasRailState.activeKey) closeCaronasSection();
    });
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
    bindCaronasRail();

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
