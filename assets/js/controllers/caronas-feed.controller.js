/* KinoCampus - Caronas Feed Controller (V8.6.0.0)
   Filtros: tipo, câmpus, período, origem/destino, características.
   Rail mobile: abre seções do sidebar como modal (padrão housing).
*/
(function () {
  'use strict';

  function norm(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') return window.KCUtils.normalizeText(value);
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function getFeedFilterUtils() {
    return (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
  }

  /* ── Localizações (do KC_CONSTANTS, com fallback) ───── */
  function getLocationDefs() {
    return (typeof KC_CONSTANTS !== 'undefined' && Array.isArray(KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS))
      ? KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS : [];
  }

  /* Cache de localizações populares do Supabase */
  var _locationsCache = null;
  var _locationsCacheTs = 0;
  var LOCATIONS_TTL = 10 * 60 * 1000; // 10 min

  function fetchPopularLocations(callback) {
    var now = Date.now();
    if (_locationsCache && (now - _locationsCacheTs) < LOCATIONS_TTL) {
      callback(_locationsCache);
      return;
    }
    // Tentar sessionStorage
    try {
      var cached = sessionStorage.getItem('kc-caronas-locations');
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.ts && (now - parsed.ts) < LOCATIONS_TTL && Array.isArray(parsed.data)) {
          _locationsCache = parsed.data;
          _locationsCacheTs = parsed.ts;
          callback(_locationsCache);
          return;
        }
      }
    } catch (_) {}

    // Fetch do Supabase
    var client = (typeof KCSupabase !== 'undefined' && typeof KCSupabase.getClient === 'function') ? KCSupabase.getClient() : null;
    if (!client) {
      callback(getLocationDefs());
      return;
    }
    client.from('caronas_locations')
      .select('key,label,icon,zone_key,zone_label,aliases,abbreviations,is_campus,usage_count')
      .order('usage_count', { ascending: false })
      .then(function (res) {
        if (res && res.data && res.data.length > 0) {
          _locationsCache = res.data;
          _locationsCacheTs = Date.now();
          try { sessionStorage.setItem('kc-caronas-locations', JSON.stringify({ ts: _locationsCacheTs, data: _locationsCache })); } catch (_) {}
          callback(_locationsCache);
        } else {
          callback(getLocationDefs());
        }
      })
      .catch(function () {
        callback(getLocationDefs());
      });
  }

  var FEATURE_OPTIONS = [
    { key: 'ar-condicionado',  label: 'Ar condicionado',  emoji: '❄️' },
    { key: 'aceita-pets',      label: 'Aceita pets',      emoji: '🐾' },
    { key: 'som-musica',       label: 'Som/Música',       emoji: '🎵' },
    { key: 'sem-fumar',        label: 'Sem fumar',        emoji: '🚭' },
    { key: 'somente-mulheres', label: 'Somente mulheres', emoji: '👩' },
    { key: '4-mais-lugares',   label: '4+ lugares',       emoji: '💺' },
    { key: 'ida-e-volta',      label: 'Ida e volta',      emoji: '🔄' },
    { key: 'pontualidade',     label: 'Pontualidade',     emoji: '⏰' },
    { key: 'preco-fixo',       label: 'Preço fixo',       emoji: '🏷️' },
  ];

  /* ── Estado dos filtros ─────────────────────────────── */
  var state = {
    tipos: new Set(['ofereco', 'procuro']),
    campi: new Set(),
    verified: false,
    periods: new Set(),
    features: new Set(),
    origemFilter: '',
    destinoFilter: '',
    feedPager: null,
  };

  /* ── Helpers ────────────────────────────────────────── */
  function cardTags(card) {
    var tags = card.getAttribute('data-kc-tags') || '';
    var cat  = card.getAttribute('data-category') || '';
    return norm(tags + ' ' + cat);
  }

  function campusMatchesText(campus, text) {
    // Find definition by key
    var defs = getLocationDefs();
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].key === campus) {
        var aliases = [norm(defs[i].label), norm(defs[i].key)].concat(
          (Array.isArray(defs[i].aliases) ? defs[i].aliases : []).map(function(a) { return norm(a); })
        );
        for (var j = 0; j < aliases.length; j++) {
          if (aliases[j] && text.includes(aliases[j])) return true;
        }
        return false;
      }
    }
    // Legacy fallback
    if (campus === 'campus-ii') return text.includes('campus ii') || text.includes('samambaia');
    return text.includes(norm(campus));
  }

  function classifyPeriod(timeStr) {
    var match = String(timeStr || '').match(/(\d{1,2})[h:.]?(\d{2})?/);
    if (!match) return null;
    var hour = parseInt(match[1], 10);
    if (hour >= 5 && hour < 12) return 'matutino';
    if (hour >= 12 && hour < 18) return 'vespertino';
    return 'noturno';
  }

  /* ── Predicado de filtro ────────────────────────────── */
  function buildExtraPredicate() {
    return function (card) {
      var text = cardTags(card);
      // Tipo
      var tiposAtivos = Array.from(state.tipos);
      if (tiposAtivos.length > 0 && tiposAtivos.length < 2) {
        if (tiposAtivos.includes('ofereco') && !text.includes('ofereco')) return false;
        if (tiposAtivos.includes('procuro') && !text.includes('procuro')) return false;
      }
      // Câmpus
      if (state.campi.size > 0) {
        var matches = Array.from(state.campi).some(function (c) { return campusMatchesText(c, text); });
        if (!matches) return false;
      }
      // Verificados
      if (state.verified && card.getAttribute('data-verified') !== 'true') return false;
      // Período
      if (state.periods.size > 0) {
        var horario = card.getAttribute('data-kc-carona-horario') || '';
        var period = classifyPeriod(horario);
        if (!period || !state.periods.has(period)) return false;
      }
      // Origem
      if (state.origemFilter) {
        var cardOrigem = norm(card.getAttribute('data-kc-carona-origem') || '');
        var origemMatch = cardOrigem && cardOrigem.includes(norm(state.origemFilter));
        if (!origemMatch) {
          // Fallback: busca no texto completo (tags + título)
          if (!text.includes(norm(state.origemFilter))) return false;
        }
      }
      // Destino
      if (state.destinoFilter) {
        var cardDestino = norm(card.getAttribute('data-kc-carona-destino') || '');
        var destinoMatch = cardDestino && cardDestino.includes(norm(state.destinoFilter));
        if (!destinoMatch) {
          if (!text.includes(norm(state.destinoFilter))) return false;
        }
      }
      // Características
      if (state.features.size > 0) {
        var cardFeatures = (card.getAttribute('data-kc-carona-features') || '').split(' ').filter(Boolean);
        var allMatch = Array.from(state.features).every(function (f) { return cardFeatures.indexOf(f) !== -1; });
        if (!allMatch) return false;
      }
      return true;
    };
  }

  function getFeedRequestParams() {
    var params = {};
    if (state.tipos.size > 0 && state.tipos.size < 2) params.rideType = Array.from(state.tipos);
    if (state.campi.size > 0) params.rideCampus = Array.from(state.campi);
    if (state.periods.size > 0) params.ridePeriod = Array.from(state.periods);
    if (state.features.size > 0) params.rideFeatures = Array.from(state.features);
    if (state.verified) params.rideVerified = true;
    if (state.origemFilter) params.rideOrigin = state.origemFilter;
    if (state.destinoFilter) params.rideDestination = state.destinoFilter;
    return params;
  }

  function refreshFeed() {
    if (!state.feedPager || typeof state.feedPager.refresh !== 'function') return;
    state.feedPager.refresh({ requestParams: getFeedRequestParams() });
  }

  function applyFilters() {
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
      window.kcFilters.setExtraPredicate(buildExtraPredicate());
    }
    refreshFeed();
  }

  function restoreUrlState() {
    var utils = getFeedFilterUtils();
    if (!utils || typeof utils.getSearchParams !== 'function') return false;
    var params = utils.getSearchParams();
    var hasState = false;

    if (params && typeof params.has === 'function' && params.has('rideType')) {
      hasState = true;
      var typeSet = new Set(utils.readListParam(params, 'rideType').map(function (value) { return String(value || '').trim(); }).filter(Boolean));
      document.querySelectorAll('[data-kc-carona-type]').forEach(function (input) {
        input.checked = typeSet.size ? typeSet.has(input.getAttribute('data-kc-carona-type')) : true;
      });
    }

    if (params && typeof params.has === 'function' && params.has('rideCampus')) {
      hasState = true;
      var campusSet = new Set(utils.readListParam(params, 'rideCampus').map(function (value) { return String(value || '').trim(); }).filter(Boolean));
      document.querySelectorAll('[data-kc-carona-campus]').forEach(function (input) {
        input.checked = campusSet.has(input.getAttribute('data-kc-carona-campus'));
      });
    }

    if (params && typeof params.has === 'function' && params.has('ridePeriod')) {
      hasState = true;
      var periodSet = new Set(utils.readListParam(params, 'ridePeriod').map(function (value) { return String(value || '').trim(); }).filter(Boolean));
      document.querySelectorAll('[data-kc-carona-period]').forEach(function (input) {
        input.checked = periodSet.has(input.getAttribute('data-kc-carona-period'));
      });
    }

    if (params && typeof params.has === 'function' && params.has('rideFeatures')) {
      hasState = true;
      var featureSet = new Set(utils.readListParam(params, 'rideFeatures').map(function (value) { return String(value || '').trim(); }).filter(Boolean));
      document.querySelectorAll('[data-kc-carona-feature]').forEach(function (input) {
        input.checked = featureSet.has(input.getAttribute('data-kc-carona-feature'));
      });
    }

    if (params && typeof params.has === 'function' && params.has('rideVerified')) {
      hasState = true;
      var verifiedInput = document.querySelector('[data-kc-carona-verified]');
      if (verifiedInput) verifiedInput.checked = utils.readBooleanParam(params, 'rideVerified');
    }

    if (params && typeof params.has === 'function' && params.has('rideOrigin')) {
      hasState = true;
      var origemInput = document.querySelector('[data-kc-caronas-filter-origem]');
      if (origemInput) origemInput.value = utils.readTextParam(params, 'rideOrigin');
    }

    if (params && typeof params.has === 'function' && params.has('rideDestination')) {
      hasState = true;
      var destinoInput = document.querySelector('[data-kc-caronas-filter-destino]');
      if (destinoInput) destinoInput.value = utils.readTextParam(params, 'rideDestination');
    }

    return hasState;
  }

  function syncUrlState() {
    var utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      var rideTypes = state.tipos.size === 2 ? [] : Array.from(state.tipos);
      utils.writeListParam(params, 'rideType', rideTypes);
      utils.writeListParam(params, 'rideCampus', Array.from(state.campi));
      utils.writeListParam(params, 'ridePeriod', Array.from(state.periods));
      utils.writeListParam(params, 'rideFeatures', Array.from(state.features));
      utils.writeBooleanParam(params, 'rideVerified', state.verified);
      utils.writeTextParam(params, 'rideOrigin', state.origemFilter || '');
      utils.writeTextParam(params, 'rideDestination', state.destinoFilter || '');
    });
  }

  /* ── Sync filtros dos inputs ────────────────────────── */
  function syncFiltersFromInputs() {
    state.tipos.clear();
    document.querySelectorAll('[data-kc-carona-type]').forEach(function (input) {
      if (input.checked) state.tipos.add(input.getAttribute('data-kc-carona-type'));
    });
    state.campi.clear();
    document.querySelectorAll('[data-kc-carona-campus]').forEach(function (input) {
      if (input.checked) state.campi.add(input.getAttribute('data-kc-carona-campus'));
    });
    var verifiedInput = document.querySelector('[data-kc-carona-verified]');
    state.verified = verifiedInput ? verifiedInput.checked : false;
    // Períodos
    state.periods.clear();
    document.querySelectorAll('[data-kc-carona-period]').forEach(function (input) {
      if (input.checked) state.periods.add(input.getAttribute('data-kc-carona-period'));
    });
    // Características
    state.features.clear();
    document.querySelectorAll('[data-kc-carona-feature]').forEach(function (input) {
      if (input.checked) state.features.add(input.getAttribute('data-kc-carona-feature'));
    });
    // Origem/Destino
    var origemInput = document.querySelector('[data-kc-caronas-filter-origem]');
    state.origemFilter = origemInput ? origemInput.value.trim() : '';
    var destinoInput = document.querySelector('[data-kc-caronas-filter-destino]');
    state.destinoFilter = destinoInput ? destinoInput.value.trim() : '';
    syncUrlState();
    applyFilters();
  }

  /* ── Limpar filtros ─────────────────────────────────── */
  function bindClearFilters() {
    var btn = document.querySelector('[data-kc-caronas-clear-filters]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-kc-carona-type]').forEach(function (i) { i.checked = true; });
      document.querySelectorAll('[data-kc-carona-campus]').forEach(function (i) { i.checked = false; });
      document.querySelectorAll('[data-kc-carona-period]').forEach(function (i) { i.checked = false; });
      document.querySelectorAll('[data-kc-carona-feature]').forEach(function (i) { i.checked = false; });
      var v = document.querySelector('[data-kc-carona-verified]');
      if (v) v.checked = false;
      var origemInput = document.querySelector('[data-kc-caronas-filter-origem]');
      if (origemInput) origemInput.value = '';
      var destinoInput = document.querySelector('[data-kc-caronas-filter-destino]');
      if (destinoInput) destinoInput.value = '';
      state.tipos = new Set(['ofereco', 'procuro']);
      state.campi.clear();
      state.periods.clear();
      state.features.clear();
      state.verified = false;
      state.origemFilter = '';
      state.destinoFilter = '';
      syncUrlState();
      applyFilters();
    });
  }

  /* ── Bind filtros ───────────────────────────────────── */
  function bindFilters() {
    document.querySelectorAll('[data-kc-carona-type], [data-kc-carona-campus], [data-kc-carona-verified], [data-kc-carona-period], [data-kc-carona-feature]').forEach(function (input) {
      input.addEventListener('change', syncFiltersFromInputs);
    });
    // Origem/Destino inputs
    var origemInput = document.querySelector('[data-kc-caronas-filter-origem]');
    if (origemInput) origemInput.addEventListener('input', syncFiltersFromInputs);
    var destinoInput = document.querySelector('[data-kc-caronas-filter-destino]');
    if (destinoInput) destinoInput.addEventListener('input', syncFiltersFromInputs);
    bindClearFilters();
  }

  /* ── Render pills no sidebar (Origem/Destino + Features) ── */
  function renderRoutePills() {
    fetchPopularLocations(function (locations) {
      // Top 8 populares + datalist com todos
      var top = locations.slice(0, 8);
      var html = top.map(function (opt) {
        var icon = opt.icon || 'fas fa-map-pin';
        return '<button type="button" class="kc-field-pill" data-kc-caronas-route-pill="' + (opt.key || '') + '"><i class="' + icon + '"></i><span>' + (opt.label || '') + '</span></button>';
      }).join('');
      var datalistHtml = locations.map(function (opt) {
        return '<option value="' + (opt.label || '') + '"></option>';
      }).join('');

      var origemPills = document.querySelector('[data-kc-caronas-origem-pills]');
      if (origemPills) origemPills.innerHTML = html;
      var destinoPills = document.querySelector('[data-kc-caronas-destino-pills]');
      if (destinoPills) destinoPills.innerHTML = html;
      var origemList = document.getElementById('kcCaronasOrigemList');
      if (origemList) origemList.innerHTML = datalistHtml;
      var destinoList = document.getElementById('kcCaronasDestinoList');
      if (destinoList) destinoList.innerHTML = datalistHtml;

      // Bind pill clicks
      document.querySelectorAll('[data-kc-caronas-origem-pills] [data-kc-caronas-route-pill]').forEach(function (pill) {
        pill.addEventListener('click', function () {
          var input = document.querySelector('[data-kc-caronas-filter-origem]');
          if (input) { input.value = pill.querySelector('span').textContent; syncFiltersFromInputs(); }
        });
      });
      document.querySelectorAll('[data-kc-caronas-destino-pills] [data-kc-caronas-route-pill]').forEach(function (pill) {
        pill.addEventListener('click', function () {
          var input = document.querySelector('[data-kc-caronas-filter-destino]');
          if (input) { input.value = pill.querySelector('span').textContent; syncFiltersFromInputs(); }
        });
      });
    });
  }

  function renderFeatureCheckboxes() {
    var container = document.querySelector('[data-kc-caronas-feature-filters]');
    if (!container) return;
    container.innerHTML = FEATURE_OPTIONS.map(function (feat) {
      return '<label class="kc-sidebar-check"><input type="checkbox" data-kc-carona-feature="' + feat.key + '" /><span>' + feat.emoji + ' ' + feat.label + '</span></label>';
    }).join('');
  }

  /* ── Mobile rail — seções do sidebar como modal ───────── */
  var CARONAS_SECTIONS = [
    { key: 'filters',  title: 'Filtros',               icon: 'fas fa-filter'    },
    { key: 'routes',   title: 'Rotas',                 icon: 'fas fa-route'     },
    { key: 'features', title: 'Características',       icon: 'fas fa-tags'      },
    { key: 'tips',     title: 'Dicas para Caroneiros', icon: 'fas fa-lightbulb' },
    { key: 'ranking',  title: 'Top Contribuidores',    icon: 'fas fa-trophy'    },
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
    if (!caronasRailState.activeKey) { actions.innerHTML = ''; return; }

    if (caronasRailState.activeKey === 'filters') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-caronas-modal-clear>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-apply>Aplicar e fechar</button></div>';
      var clearBtn = actions.querySelector('[data-kc-caronas-modal-clear]');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        document.querySelectorAll('[data-kc-carona-type]').forEach(function (i) { i.checked = true; });
        document.querySelectorAll('[data-kc-carona-campus]').forEach(function (i) { i.checked = false; });
        document.querySelectorAll('[data-kc-carona-period]').forEach(function (i) { i.checked = false; });
        var v = document.querySelector('[data-kc-carona-verified]');
        if (v) v.checked = false;
        state.tipos = new Set(['ofereco', 'procuro']);
        state.campi.clear();
        state.periods.clear();
        state.verified = false;
        state.origemFilter = '';
        state.destinoFilter = '';
        syncUrlState();
        applyFilters();
      });
      var applyBtn = actions.querySelector('[data-kc-caronas-modal-apply]');
      if (applyBtn) applyBtn.addEventListener('click', function () { syncFiltersFromInputs(); closeCaronasSection(); });
    } else if (caronasRailState.activeKey === 'routes') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-action-close>Aplicar e fechar</button></div>';
      var routeClose = actions.querySelector('[data-kc-caronas-modal-action-close]');
      if (routeClose) routeClose.addEventListener('click', function () { syncFiltersFromInputs(); closeCaronasSection(); });
    } else if (caronasRailState.activeKey === 'features') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-caronas-modal-feat-clear>Limpar</button><button class="kc-opportunity-apply" type="button" data-kc-caronas-modal-feat-apply>Aplicar e fechar</button></div>';
      var featClear = actions.querySelector('[data-kc-caronas-modal-feat-clear]');
      if (featClear) featClear.addEventListener('click', function () {
        document.querySelectorAll('[data-kc-carona-feature]').forEach(function (i) { i.checked = false; });
        state.features.clear();
        syncUrlState();
        applyFilters();
      });
      var featApply = actions.querySelector('[data-kc-caronas-modal-feat-apply]');
      if (featApply) featApply.addEventListener('click', function () { syncFiltersFromInputs(); closeCaronasSection(); });
    } else {
      // tips
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

    // Re-bind filters inside modal (events don't persist after DOM transplant in some browsers)
    node.querySelectorAll('[data-kc-carona-type], [data-kc-carona-campus], [data-kc-carona-verified], [data-kc-carona-period], [data-kc-carona-feature]').forEach(function (input) {
      input.addEventListener('change', syncFiltersFromInputs);
    });
    // Origem/Destino inputs inside modal
    var origemInput = node.querySelector('[data-kc-caronas-filter-origem]');
    if (origemInput) origemInput.addEventListener('input', syncFiltersFromInputs);
    var destinoInput = node.querySelector('[data-kc-caronas-filter-destino]');
    if (destinoInput) destinoInput.addEventListener('input', syncFiltersFromInputs);

    var closeBtn = overlay.querySelector('[data-kc-caronas-close-section="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeCaronasSection() {
    var overlay = document.getElementById(CARONAS_MODAL_ID);
    var slot = overlay ? overlay.querySelector('[data-kc-caronas-section-slot="true"]') : null;
    var actions = overlay ? overlay.querySelector('[data-kc-caronas-section-actions="true"]') : null;
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
    if (actions) actions.innerHTML = '';
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

  /* ── Feed injection ─────────────────────────────────── */
  function injectFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    var pending = window.KCControllers.injectFeed({
      module: 'caronas',
      pageModule: 'caronas',
      sortBy: sortBy || 'votos',
      getRequestParams: getFeedRequestParams,
      onReady: function () {
        bindFilters();
        syncFiltersFromInputs();
      },
      onAfterAppend: function () {},
    });
    Promise.resolve(pending).then(function (pager) {
      state.feedPager = pager || null;
    }).catch(function () {
      state.feedPager = null;
    });
    return pending;
  }

  /* ── Init ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    renderRoutePills();
    renderFeatureCheckboxes();
    restoreUrlState();
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
