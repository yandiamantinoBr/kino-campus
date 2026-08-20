/* KinoCampus - oportunidades controller (V8.4.0.0) */
(function () {
  'use strict';

  const MOBILE_SECTION_MODAL_ID = 'kcOpportunitySectionOverlay';
  let opportunityCatalog = null;

  const state = {
    selectedTypeFilters: new Set(),
    selectedModeFilters: new Set(),
    selectedArea: '',
    datePreset: '',
    priceMin: null,
    priceMax: null,
    feedPager: null,
    posts: new Map(),
    sections: [],
    refreshQueued: false,
    applyWrapped: false,
    activeSectionKey: '',
    activeSectionNode: null,
    activeSectionPlaceholder: null,
    lastMobileTrigger: null,
    modalDraft: null,
  };

  function syncAreaHistoryCache() {
    window.__KC_OPPORTUNITY_AREA_HISTORY = Array.from(state.posts.values())
      .filter((summary) => summary && summary.areaKey && summary.areaLabel)
      .map((summary) => ({
        key: summary.areaKey,
        label: summary.areaLabel,
        icon: summary.areaIcon || 'fas fa-briefcase',
      }));
  }

  function upsertPosts(list) {
    if (!Array.isArray(list)) return;
    list.forEach((post) => {
      const summary = summarizePost(post);
      if (!summary || !summary.identity) return;
      state.posts.set(summary.identity, summary);
    });
    syncAreaHistoryCache();
  }

  function restoreCachedPosts() {
    const catalog = getOpportunityCatalog();
    const posts = catalog ? catalog.restore() : [];
    if (!posts.length) return false;
    upsertPosts(posts);
    queueRefresh();
    return true;
  }

  function getOpportunityCatalog() {
    if (opportunityCatalog) return opportunityCatalog;
    if (!window._KCOpCatalog || typeof window._KCOpCatalog.createCatalog !== 'function') return null;
    opportunityCatalog = window._KCOpCatalog.createCatalog();
    return opportunityCatalog;
  }

  function syncCatalogPosts(posts) {
    if (!Array.isArray(posts) || !posts.length) return;
    upsertPosts(posts);
    queueRefresh();
  }

  function decorateFreshCards(payload) {
    const container = payload && payload.container;
    const posts = payload && Array.isArray(payload.posts) ? payload.posts : [];
    if (!container || !posts.length) return;

    upsertPosts(posts);

    const cards = Array.from(container.querySelectorAll('.kc-card'));
    const freshCards = payload.mode === 'prepend' ? cards.slice(0, posts.length) : cards.slice(-posts.length);
    freshCards.forEach((card, index) => {
      const summary = summarizePost(posts[index]);
      if (!summary) return;
      applyCardDataset(card, summary);
    });
  }

  function syncStateFromInputs() {
    state.selectedTypeFilters = new Set(getSelectedInputs('type'));
    state.selectedModeFilters = new Set(getSelectedInputs('mode'));
    state.datePreset = readSelectedDatePreset();
    const range = normalizePriceRange(
      document.querySelector('[data-kc-opp-price-min]') && document.querySelector('[data-kc-opp-price-min]').value,
      document.querySelector('[data-kc-opp-price-max]') && document.querySelector('[data-kc-opp-price-max]').value
    );
    state.priceMin = range.min;
    state.priceMax = range.max;
  }

  function restoreUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.getSearchParams !== 'function') return false;
    const params = utils.getSearchParams();
    const hasTypes = !!(params && typeof params.has === 'function' && params.has('oppType'));
    const hasModes = !!(params && typeof params.has === 'function' && params.has('oppMode'));
    const hasArea = !!(params && typeof params.has === 'function' && params.has('oppArea'));
    const hasDatePreset = !!(params && typeof params.has === 'function' && params.has('datePreset'));
    const hasPriceMin = !!(params && typeof params.has === 'function' && params.has('priceMin'));
    const hasPriceMax = !!(params && typeof params.has === 'function' && params.has('priceMax'));
    if (!hasTypes && !hasModes && !hasArea && !hasDatePreset && !hasPriceMin && !hasPriceMax) return false;

    if (hasTypes) {
      state.selectedTypeFilters = new Set(utils.readListParam(params, 'oppType').map((value) => String(value || '').trim()).filter(Boolean));
    }
    if (hasModes) {
      state.selectedModeFilters = new Set(utils.readListParam(params, 'oppMode').map((value) => String(value || '').trim()).filter(Boolean));
    }
    if (hasArea) {
      state.selectedArea = utils.readTextParam(params, 'oppArea');
    }
    if (hasDatePreset) {
      state.datePreset = typeof utils.readPresetParam === 'function'
        ? utils.readPresetParam(params, 'datePreset', getAllowedDatePresets())
        : normalizeDatePreset(utils.readTextParam(params, 'datePreset'));
    }
    if (hasPriceMin || hasPriceMax) {
      const range = normalizePriceRange(
        hasPriceMin ? utils.readNumberParam(params, 'priceMin') : state.priceMin,
        hasPriceMax ? utils.readNumberParam(params, 'priceMax') : state.priceMax
      );
      state.priceMin = range.min;
      state.priceMax = range.max;
    }
    syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
    return true;
  }

  function syncUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      utils.writeListParam(params, 'oppType', Array.from(state.selectedTypeFilters));
      utils.writeListParam(params, 'oppMode', Array.from(state.selectedModeFilters));
      utils.writeTextParam(params, 'oppArea', state.selectedArea || '');
      if (typeof utils.writePresetParam === 'function') utils.writePresetParam(params, 'datePreset', state.datePreset, getAllowedDatePresets());
      else utils.writeTextParam(params, 'datePreset', state.datePreset || '');
      utils.writeNumberParam(params, 'priceMin', state.priceMin);
      utils.writeNumberParam(params, 'priceMax', state.priceMax);
    });
  }

  function renderAreaButtons() {
    const list = document.querySelector('[data-kc-opp-area-list="true"]');
    if (!list) return;

    const allSummaries = Array.from(state.posts.values());
    const baseSummaries = allSummaries.filter((summary) => matchesSummary(summary, { ignoreArea: true }, state));
    const countMap = new Map();
    baseSummaries.forEach((summary) => {
      const current = countMap.get(summary.areaKey) || 0;
      countMap.set(summary.areaKey, current + 1);
    });

    const areas = getAreaCatalog(countMap, state);
    const total = baseSummaries.length;
    const renderedArea = getRenderedAreaSelection(state);
    const items = [];

    items.push(
      '<button class="kc-category-item ' + (!renderedArea ? 'is-active' : '') + '" type="button" data-kc-opp-area="" aria-pressed="' + (!renderedArea ? 'true' : 'false') + '">' +
        '<i class="fas fa-layer-group"></i>' +
        '<span>Todas as áreas</span>' +
        '<span class="kc-category-count">' + total + '</span>' +
      '</button>'
    );

    areas.forEach((area) => {
      const count = countMap.get(area.key) || 0;
      const isActive = renderedArea === area.key;
      items.push(
        '<button class="kc-category-item ' + (isActive ? 'is-active' : '') + '" type="button" data-kc-opp-area="' + escapeHtml(area.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '" title="' + count + ' publicacoes no lote carregado; o filtro consulta todo o feed">' +
          '<i class="' + escapeHtml(area.icon || 'fas fa-briefcase') + '"></i>' +
          '<span>' + escapeHtml(area.label || area.key) + '</span>' +
          '<span class="kc-category-count">' + count + '</span>' +
        '</button>'
      );
    });

    list.innerHTML = items.join('');
  }

  function getSidebarSections() {
    return state.sections.slice();
  }

  function collectSidebarSections() {
    const nodes = Array.from(document.querySelectorAll('[data-kc-opp-sidebar="true"] .kc-sidebar-section[data-kc-opp-section]'));
    state.sections = nodes.map((section, index) => {
      const key = String(section.getAttribute('data-kc-opp-section') || ('section-' + index)).trim();
      const heading = section.querySelector('h3');
      let title = 'Seção';
      let icon = 'fas fa-layer-group';

      if (heading) {
        const iconEl = heading.querySelector('i');
        if (iconEl && iconEl.className) icon = iconEl.className;
        const clone = heading.cloneNode(true);
        const clonedIcon = clone.querySelector('i');
        if (clonedIcon) clonedIcon.remove();
        title = String(clone.textContent || '').trim() || title;
      }

      return { key, title, icon, node: section };
    });
  }

  function ensureMobileSectionModal() {
    let overlay = document.getElementById(MOBILE_SECTION_MODAL_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = MOBILE_SECTION_MODAL_ID;
    overlay.className = 'kc-modal-overlay kc-opportunity-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kc-create-modal kc-opportunity-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcOpportunitySectionTitle">',
      '  <div class="kc-create-modal__header">',
      '    <h2 id="kcOpportunitySectionTitle"><i class="fas fa-layer-group"></i><span>Seção</span></h2>',
      '    <button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-opp-close-section-modal="true"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-create-modal__body">',
      '    <div class="kc-opportunity-section-modal__content" data-kc-opp-section-modal-slot="true"></div>',
      '  </div>',
      '  <div class="kc-opportunity-section-modal__actions" data-kc-opp-section-modal-actions="true"></div>',
      '</div>'
    ].join('');

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-kc-opp-close-section-modal="true"]')) {
        closeMobileSectionModal();
      }
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function renderSectionActions() {
    const overlay = document.getElementById(MOBILE_SECTION_MODAL_ID);
    const actions = overlay ? overlay.querySelector('[data-kc-opp-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-opportunity-section-modal') : null;
    if (!actions || !modal) return;

    if (!state.activeSectionKey) {
      modal.removeAttribute('data-kc-opp-section-view');
      actions.innerHTML = '';
      return;
    }

    modal.setAttribute('data-kc-opp-section-view', state.activeSectionKey);

    if (state.activeSectionKey === 'filters') {
      const draft = state.modalDraft || {
        typeFilters: cloneSet(state.selectedTypeFilters),
        modeFilters: cloneSet(state.selectedModeFilters),
        datePreset: state.datePreset,
        priceMin: state.priceMin,
        priceMax: state.priceMax,
      };
      const canClear = hasTypeModeSelection(draft.typeFilters, draft.modeFilters)
        || !!normalizeDatePreset(draft.datePreset)
        || draft.priceMin != null
        || draft.priceMax != null;
      actions.innerHTML = [
        '<div class="kc-opportunity-section-modal__action-group">',
        '  <button class="kc-opportunity-clear" type="button" data-kc-opp-modal-clear-filters="true"' + (canClear ? '' : ' disabled') + '>Limpar filtros</button>',
        '  <button class="kc-opportunity-apply" type="button" data-kc-opp-modal-apply="filters">Aplicar filtros</button>',
        '</div>'
      ].join('');
      return;
    }

    if (state.activeSectionKey === 'dates') {
      const labels = { '': 'Todas as datas', today: 'Hoje', last7d: 'Últimos 7 dias', last30d: 'Últimos 30 dias' };
      const selectedLabel = labels[(state.modalDraft && typeof state.modalDraft.datePreset === 'string') ? state.modalDraft.datePreset : state.datePreset] || 'Todas as datas';
      actions.innerHTML = [
        '<div class="kc-opportunity-section-modal__action-group">',
        '  <p class="kc-opportunity-section-modal__caption">Data selecionada: <strong>' + escapeHtml(selectedLabel) + '</strong></p>',
        '  <button class="kc-opportunity-apply" type="button" data-kc-opp-modal-apply="dates">Ver oportunidades</button>',
        '</div>'
      ].join('');
      return;
    }

    if (state.activeSectionKey === 'areas') {
      actions.innerHTML = [
        '<div class="kc-opportunity-section-modal__action-group">',
        '  <p class="kc-opportunity-section-modal__caption">Área selecionada: <strong>' + escapeHtml(getAreaLabel((state.modalDraft && state.modalDraft.area) || '', state)) + '</strong></p>',
        '  <button class="kc-opportunity-apply" type="button" data-kc-opp-modal-apply="areas">Ver oportunidades</button>',
        '</div>'
      ].join('');
      return;
    }

    actions.innerHTML = [
      '<div class="kc-opportunity-section-modal__action-group">',
      '  <button class="kc-opportunity-apply" type="button" data-kc-opp-modal-apply="tips">Entendido!</button>',
      '</div>'
    ].join('');
  }

  function openMobileSectionModal(sectionKey, trigger) {
    const sectionMeta = getSidebarSections().find((entry) => entry.key === sectionKey);
    if (!sectionMeta || !sectionMeta.node) return;
    if (sectionKey === 'areas') fetchAllPosts({ targetPages: 4 });

    const overlay = ensureMobileSectionModal();
    const slot = overlay.querySelector('[data-kc-opp-section-modal-slot="true"]');
    const title = overlay.querySelector('#kcOpportunitySectionTitle span');
    const titleIcon = overlay.querySelector('#kcOpportunitySectionTitle i');
    if (!slot || !title || !titleIcon) return;

    closeMobileSectionModal();

    const placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-opp-section-placeholder', sectionMeta.key);

    sectionMeta.node.parentNode.insertBefore(placeholder, sectionMeta.node);
    slot.innerHTML = '';
    slot.appendChild(sectionMeta.node);

    state.activeSectionKey = sectionMeta.key;
    state.activeSectionNode = sectionMeta.node;
    state.activeSectionPlaceholder = placeholder;
    state.lastMobileTrigger = trigger || null;
    state.modalDraft = {
      typeFilters: cloneSet(state.selectedTypeFilters),
      modeFilters: cloneSet(state.selectedModeFilters),
      area: state.selectedArea || '',
      datePreset: state.datePreset,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
    };

    title.textContent = sectionMeta.title;
    titleIcon.className = sectionMeta.icon || 'fas fa-layer-group';
    syncFilterInputs(state.modalDraft.typeFilters, state.modalDraft.modeFilters, state.modalDraft.priceMin, state.modalDraft.priceMax, state.modalDraft.datePreset);
    renderAreaButtons();
    renderSectionActions();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('opportunities-section-modal');
    }

    renderMobileRail(state);

    const closeBtn = overlay.querySelector('[data-kc-opp-close-section-modal="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeMobileSectionModal(options) {
    const cfg = options || {};
    const overlay = document.getElementById(MOBILE_SECTION_MODAL_ID);
    const slot = overlay ? overlay.querySelector('[data-kc-opp-section-modal-slot="true"]') : null;
    const actions = overlay ? overlay.querySelector('[data-kc-opp-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-opportunity-section-modal') : null;
    const wasActive = !!(overlay && overlay.classList.contains('active'));
    const focusTarget = state.lastMobileTrigger && typeof state.lastMobileTrigger.focus === 'function'
      ? state.lastMobileTrigger
      : null;
    let focusHandled = false;

    if (overlay && document.activeElement && overlay.contains(document.activeElement)) {
      if (focusTarget) {
        try {
          focusTarget.focus();
          focusHandled = true;
        } catch (_) { }
      }

      if (!focusHandled && typeof document.activeElement.blur === 'function') {
        try {
          document.activeElement.blur();
          focusHandled = true;
        } catch (_) { }
      }
    }

    if (!cfg.commit) {
      syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
    }

    if (state.activeSectionNode && state.activeSectionPlaceholder && state.activeSectionPlaceholder.parentNode) {
      state.activeSectionPlaceholder.parentNode.replaceChild(state.activeSectionNode, state.activeSectionPlaceholder);
    }

    state.activeSectionKey = '';
    state.activeSectionNode = null;
    state.activeSectionPlaceholder = null;
    state.modalDraft = null;

    if (slot) slot.innerHTML = '';
    if (actions) actions.innerHTML = '';
    if (modal) modal.removeAttribute('data-kc-opp-section-view');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) {
      document.body.classList.remove('kc-modal-open');
      if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
        window.KCOverlayLock.unlock('opportunities-section-modal');
      }
    }
    renderAreaButtons();
    renderMobileRail(state);
    syncClearButtonState(state);

    if (!focusHandled && focusTarget) {
      try { focusTarget.focus(); } catch (_) { }
    }
    state.lastMobileTrigger = null;
  }

  function queueRefresh() {
    if (state.refreshQueued) return;
    state.refreshQueued = true;
    const schedule = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); };
    schedule(function () {
      state.refreshQueued = false;
      syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
      renderAreaButtons();
      renderMobileRail(state);
      renderSectionActions();
      syncClearButtonState(state);
    });
  }

  function getFeedRequestParams() {
    const params = {};
    if (state.selectedTypeFilters.size) params.oppType = Array.from(state.selectedTypeFilters);
    if (state.selectedModeFilters.size) params.oppMode = Array.from(state.selectedModeFilters);
    if (state.selectedArea) params.oppArea = state.selectedArea;
    if (state.datePreset) params.datePreset = state.datePreset;
    if (state.priceMin != null) params.priceMin = state.priceMin;
    if (state.priceMax != null) params.priceMax = state.priceMax;
    return params;
  }

  function refreshFeed() {
    if (!state.feedPager || typeof state.feedPager.refresh !== 'function') return;
    state.feedPager.refresh({ requestParams: getFeedRequestParams() });
  }

  function applyCurrentFilters() {
    syncUrlState();
    refreshFeed();
    if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
      window.kcFilters.apply();
      return;
    }
    queueRefresh();
  }

  function applySidebarFilters() {
    if (state.modalDraft && state.activeSectionKey === 'filters' && isMobileViewport()) {
      state.modalDraft.typeFilters = new Set(getSelectedInputs('type'));
      state.modalDraft.modeFilters = new Set(getSelectedInputs('mode'));
      state.modalDraft.datePreset = readSelectedDatePreset();
      const range = normalizePriceRange(
        document.querySelector('[data-kc-opp-price-min]') && document.querySelector('[data-kc-opp-price-min]').value,
        document.querySelector('[data-kc-opp-price-max]') && document.querySelector('[data-kc-opp-price-max]').value
      );
      state.modalDraft.priceMin = range.min;
      state.modalDraft.priceMax = range.max;
      renderSectionActions();
      return;
    }

    if (state.modalDraft && state.activeSectionKey === 'dates' && isMobileViewport()) {
      state.modalDraft.datePreset = readSelectedDatePreset();
      renderSectionActions();
      return;
    }

    syncStateFromInputs();
    applyCurrentFilters();
  }

  function clearAppliedFilters(event) {
    if (event) event.preventDefault();
    document.querySelectorAll('[data-kc-opp-filter-kind]').forEach((input) => {
      input.checked = false;
    });
    state.selectedTypeFilters = new Set();
    state.selectedModeFilters = new Set();
    state.selectedArea = '';
    state.datePreset = '';
    state.priceMin = null;
    state.priceMax = null;
    const minInput = document.querySelector('[data-kc-opp-price-min]');
    const maxInput = document.querySelector('[data-kc-opp-price-max]');
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';
    syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
    applySidebarFilters();
  }

  function bindSidebarEvents() {
    document.querySelectorAll('[data-kc-opp-filter-kind], [data-kc-opp-price-min], [data-kc-opp-price-max], [data-kc-opp-date-preset]').forEach((input) => {
      input.addEventListener('change', applySidebarFilters);
    });

    document.querySelectorAll('[data-kc-opp-clear-filters="true"], [data-kc-opp-empty-clear="true"]').forEach((button) => {
      button.addEventListener('click', clearAppliedFilters);
    });

    document.addEventListener('click', function (event) {
      const clearDraftButton = event.target.closest('[data-kc-opp-modal-clear-filters="true"]');
      if (clearDraftButton && state.modalDraft) {
        state.modalDraft.typeFilters = new Set();
        state.modalDraft.modeFilters = new Set();
        state.modalDraft.area = '';
        state.modalDraft.datePreset = '';
        state.modalDraft.priceMin = null;
        state.modalDraft.priceMax = null;
        syncFilterInputs(state.modalDraft.typeFilters, state.modalDraft.modeFilters, state.modalDraft.priceMin, state.modalDraft.priceMax, state.modalDraft.datePreset);
        renderSectionActions();
        return;
      }

      const applyButton = event.target.closest('[data-kc-opp-modal-apply]');
      if (applyButton) {
        const action = String(applyButton.getAttribute('data-kc-opp-modal-apply') || '').trim();
        if (action === 'filters' && state.modalDraft) {
          state.selectedTypeFilters = cloneSet(state.modalDraft.typeFilters);
          state.selectedModeFilters = cloneSet(state.modalDraft.modeFilters);
          state.selectedArea = state.modalDraft.area || '';
          state.datePreset = normalizeDatePreset(state.modalDraft.datePreset);
          state.priceMin = state.modalDraft.priceMin != null ? state.modalDraft.priceMin : null;
          state.priceMax = state.modalDraft.priceMax != null ? state.modalDraft.priceMax : null;
          syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
          closeMobileSectionModal({ commit: true });
          applyCurrentFilters();
          return;
        }
        if (action === 'dates' && state.modalDraft) {
          state.datePreset = normalizeDatePreset(state.modalDraft.datePreset);
          syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
          closeMobileSectionModal({ commit: true });
          applyCurrentFilters();
          return;
        }
        if (action === 'areas' && state.modalDraft) {
          state.selectedArea = state.modalDraft.area || '';
          closeMobileSectionModal({ commit: true });
          applyCurrentFilters();
          return;
        }
        if (action === 'tips') {
          closeMobileSectionModal({ commit: true });
          return;
        }
      }

      const areaButton = event.target.closest('button[data-kc-opp-area]');
      if (areaButton) {
        const selectedArea = String(areaButton.getAttribute('data-kc-opp-area') || '').trim();
        if (state.modalDraft && state.activeSectionKey === 'areas' && isMobileViewport()) {
          state.modalDraft.area = selectedArea;
          renderAreaButtons();
          renderSectionActions();
        } else {
          state.selectedArea = selectedArea;
          applyCurrentFilters();
        }
        return;
      }

      const sectionButton = event.target.closest('[data-kc-opp-open-section]');
      if (sectionButton && isMobileViewport()) {
        openMobileSectionModal(String(sectionButton.getAttribute('data-kc-opp-open-section') || '').trim(), sectionButton);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMobileSectionModal();
    });

    window.addEventListener('resize', function () {
      if (!isMobileViewport()) closeMobileSectionModal();
    });
  }

  function wrapFilterApply() {
    if (state.applyWrapped) return;
    if (!window.kcFilters || typeof window.kcFilters.apply !== 'function') return;

    const originalApply = window.kcFilters.apply;
    if (typeof originalApply !== 'function') return;

    window.kcFilters.apply = function () {
      const result = originalApply.apply(this, arguments);
      queueRefresh();
      return result;
    };
    state.applyWrapped = true;
  }

  function fetchAllPosts(options) {
    const catalog = getOpportunityCatalog();
    if (!catalog) return Promise.resolve([]);
    return catalog.fetch(options).then(function (posts) {
      syncCatalogPosts(posts);
      return posts;
    });
  }

  function scheduleCatalogExpansion() {
    const catalog = getOpportunityCatalog();
    if (!catalog) return;
    catalog.scheduleExpansion(syncCatalogPosts);
  }

  function setupExtraPredicate() {
    if (!window.kcFilters || typeof window.kcFilters.setExtraPredicate !== 'function') return;
    window.kcFilters.setExtraPredicate(function (card) {
      return cardMatchesSidebarFilters(card, state);
    });
  }

  function initFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    const pending = window.KCControllers.injectFeed({
      module: 'oportunidades',
      pageModule: 'oportunidades',
      sortBy: sortBy || 'votos',
      getRequestParams: getFeedRequestParams,
      onAfterAppend: function (payload) {
        decorateFreshCards(payload);
        queueRefresh();
      }
    });
    Promise.resolve(pending).then(function (pager) {
      state.feedPager = pager || null;
    }).catch(function () {
      state.feedPager = null;
    });
    return pending;
  }

  document.addEventListener('DOMContentLoaded', function () {
    collectSidebarSections();
    ensureMobileSectionModal();
    wrapFilterApply();
    syncStateFromInputs();
    restoreUrlState();
    syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters, state.priceMin, state.priceMax, state.datePreset);
    bindSidebarEvents();
    setupExtraPredicate();
    const restoredCatalog = restoreCachedPosts();
    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: initFeed });
    } else {
      initFeed();
    }
    if (!restoredCatalog) {
      fetchAllPosts({ targetPages: 1 }).finally(scheduleCatalogExpansion);
    } else {
      scheduleCatalogExpansion();
    }
    queueRefresh();
  });
})();
