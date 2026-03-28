/* KinoCampus - oportunidades controller (V8.4.0.0) */
(function () {
  'use strict';

  const DEFAULT_AREAS = [
    { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
    { key: 'marketing', label: 'Marketing', icon: 'fas fa-bullhorn' },
    { key: 'design', label: 'Design', icon: 'fas fa-palette' },
    { key: 'educacao', label: 'Educação', icon: 'fas fa-graduation-cap' },
    { key: 'musica', label: 'Música', icon: 'fas fa-music' },
  ];

  const MOBILE_SECTION_MODAL_ID = 'kcOpportunitySectionOverlay';
  const SECTION_CACHE_KEY = 'oportunidades:index';
  const SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10;

  const state = {
    selectedTypeFilters: new Set(),
    selectedModeFilters: new Set(),
    selectedArea: '',
    posts: new Map(),
    sections: [],
    refreshQueued: false,
    fetchStarted: false,
    applyWrapped: false,
    activeSectionKey: '',
    activeSectionNode: null,
    activeSectionPlaceholder: null,
    lastMobileTrigger: null,
    modalDraft: null,
  };

  function normalizeText(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
      return window.KCUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function canonicalCategory(value) {
    if (window.kcFilters && typeof window.kcFilters.canonicalCategory === 'function') {
      return window.kcFilters.canonicalCategory(value);
    }
    const normalized = normalizeText(value).replace(/^#/, '');
    if (normalized.length > 3 && normalized.endsWith('s')) return normalized.slice(0, -1);
    return normalized;
  }

  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cloneSet(set) {
    return new Set(Array.from(set || []));
  }

  function isMobileViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function restoreCachedPosts() {
    const store = getSessionStore();
    if (!store) return false;
    const cached = store.get('feed-index', SECTION_CACHE_KEY, { maxAge: SECTION_CACHE_MAX_AGE_MS });
    const posts = cached && cached.value && Array.isArray(cached.value.posts) ? cached.value.posts : [];
    if (!posts.length) return false;
    upsertPosts(posts);
    queueRefresh();
    return true;
  }

  function persistCachedPosts(posts) {
    const store = getSessionStore();
    if (!store || typeof store.set !== 'function') return;
    store.set('feed-index', SECTION_CACHE_KEY, {
      posts: Array.isArray(posts) ? posts.slice(0, 600) : [],
    });
  }

  function getFilterState() {
    if (window.kcFilters && typeof window.kcFilters.getState === 'function') {
      const current = window.kcFilters.getState();
      return {
        category: current && current.category ? current.category : 'todas',
        query: current && current.query ? current.query : '',
      };
    }

    const activeTab = document.querySelector('.kc-feed-tabs a.active');
    const input = document.getElementById('searchInput');
    return {
      category: activeTab ? ((activeTab.getAttribute('data-category') || activeTab.getAttribute('href') || '').replace('#', '') || 'todas') : 'todas',
      query: input ? String(input.value || '') : '',
    };
  }

  function getAreaDefinitions() {
    if (window.KCUtils && typeof window.KCUtils.getOpportunityAreaDefinitions === 'function') {
      return window.KCUtils.getOpportunityAreaDefinitions();
    }
    return DEFAULT_AREAS.slice();
  }

  function getPostIdentity(post) {
    if (!post) return '';
    const uuid = String(post.uuid || '').trim();
    if (uuid) return 'uuid:' + uuid;
    const id = String(post.id || post.legacy_id || post.legacyId || '').trim();
    if (id) return 'id:' + id;
    return [
      String(post.modulo || post.module || '').trim(),
      String(post.titulo || post.title || '').trim(),
      String(post.timestamp || post.created_at || '').trim()
    ].join('|');
  }

  function normalizeOpportunityType(value, sourceText) {
    const direct = canonicalCategory(value);
    if (direct.includes('estag')) return 'estagio';
    if (direct.includes('empreg')) return 'emprego';
    if (direct.includes('freela') || direct.includes('freelancer')) return 'freelancer';
    if (direct.includes('monitor')) return 'monitoria';
    if (direct.includes('volunt')) return 'voluntariado';

    const haystack = normalizeText(sourceText);
    if (haystack.includes('freelancer') || haystack.includes('freela')) return 'freelancer';
    if (haystack.includes('monitoria') || haystack.includes('monitor ')) return 'monitoria';
    if (haystack.includes('volunt')) return 'voluntariado';
    if (haystack.includes('estagio') || haystack.includes('trainee')) return 'estagio';
    if (haystack.includes('emprego') || haystack.includes('clt') || haystack.includes('vaga')) return 'emprego';
    return direct || '';
  }

  function resolveWorkModeValue(value) {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    if (normalized.includes('hibrid') || normalized.includes('hybrid')) {
      return { key: 'hibrido', label: 'Híbrido', remote: true, presencial: true };
    }
    if (normalized.includes('remot') || normalized.includes('home office') || normalized.includes('home-office')) {
      return { key: 'remoto', label: 'Remoto', remote: true, presencial: false };
    }
    if (normalized.includes('presencial') || normalized.includes('onsite') || normalized.includes('on site') || normalized.includes('on-site')) {
      return { key: 'presencial', label: 'Presencial', remote: false, presencial: true };
    }
    return null;
  }

  function resolveWorkMode(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    const explicitMatch = [
      meta.workModeLabel,
      meta.workMode,
      meta.modalidadeTrabalho,
      post && post.modalidadeTrabalho,
      post && post.workMode,
    ].map(resolveWorkModeValue).find(Boolean);
    if (explicitMatch) return explicitMatch;

    const textMatch = resolveWorkModeValue([
      post && post.titulo,
      post && post.descricao,
      ...(Array.isArray(post && post.tags) ? post.tags : []),
      ...(Array.isArray(post && post.tagKeys) ? post.tagKeys : []),
      ...(Array.isArray(meta.tags) ? meta.tags : []),
      ...(Array.isArray(meta.tagKeys) ? meta.tagKeys : []),
    ].filter(Boolean).join(' '));
    if (textMatch) return textMatch;

    return { key: '', label: '', remote: false, presencial: false };
    const text = normalizeText([
      meta.workModeLabel,
      meta.workMode,
      meta.modalidadeTrabalho,
      post && post.modalidadeTrabalho,
      post && post.titulo,
      post && post.descricao,
      ...(Array.isArray(post && post.tags) ? post.tags : []),
      ...(Array.isArray(post && post.tagKeys) ? post.tagKeys : []),
      ...(Array.isArray(meta.tags) ? meta.tags : []),
      ...(Array.isArray(meta.tagKeys) ? meta.tagKeys : []),
    ].filter(Boolean).join(' '));

    const isHybrid = text.includes('hibrido') || text.includes('hybrid');
    const isRemote = isHybrid || text.includes('remoto') || text.includes('home office') || text.includes('home-office');
    const isPresential = isHybrid || text.includes('presencial') || text.includes('onsite') || text.includes('on site');

    if (isHybrid) return { key: 'hibrido', label: 'Híbrido', remote: true, presencial: true };
    if (isRemote) return { key: 'remoto', label: 'Remoto', remote: true, presencial: false };
    if (isPresential) return { key: 'presencial', label: 'Presencial', remote: false, presencial: true };
    return { key: '', label: '', remote: false, presencial: false };
  }

  function resolveEmploymentTypeValue(value) {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    if (normalized.includes('jovem aprendiz') || normalized.includes('aprendiz')) {
      return { key: 'jovem-aprendiz', label: 'Jovem Aprendiz' };
    }
    if (normalized.includes('temporario')) {
      return { key: 'temporario', label: 'Temporário' };
    }
    if (normalized.includes('clt')) return { key: 'clt', label: 'CLT' };
    if (normalized.includes('pj') || normalized.includes('pessoa juridica')) {
      return { key: 'pj', label: 'PJ' };
    }
    return null;
  }

  function resolveEmploymentType(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    const explicitMatch = [
      meta.employmentTypeLabel,
      meta.employmentType,
      meta.regimeContratacao,
      post && post.regimeContratacao,
      post && post.employmentType,
    ].map(resolveEmploymentTypeValue).find(Boolean);
    if (explicitMatch) return explicitMatch;

    const textMatch = resolveEmploymentTypeValue([
      post && post.titulo,
      post && post.descricao,
      ...(Array.isArray(post && post.tags) ? post.tags : []),
      ...(Array.isArray(post && post.tagKeys) ? post.tagKeys : []),
      ...(Array.isArray(meta.tags) ? meta.tags : []),
      ...(Array.isArray(meta.tagKeys) ? meta.tagKeys : []),
    ].filter(Boolean).join(' '));
    if (textMatch) return textMatch;

    return { key: '', label: '' };
    const text = normalizeText([
      meta.employmentTypeLabel,
      meta.employmentType,
      meta.regimeContratacao,
      post && post.regimeContratacao,
      post && post.titulo,
      post && post.descricao,
      ...(Array.isArray(post && post.tags) ? post.tags : []),
      ...(Array.isArray(post && post.tagKeys) ? post.tagKeys : []),
      ...(Array.isArray(meta.tags) ? meta.tags : []),
      ...(Array.isArray(meta.tagKeys) ? meta.tagKeys : []),
    ].filter(Boolean).join(' '));

    if (text.includes('jovem aprendiz') || text.includes('aprendiz')) {
      return { key: 'jovem-aprendiz', label: 'Jovem Aprendiz' };
    }
    if (text.includes('temporario')) {
      return { key: 'temporario', label: 'Temporário' };
    }
    if (text.includes('clt')) return { key: 'clt', label: 'CLT' };
    if (text.includes('pj') || text.includes('pessoa juridica')) return { key: 'pj', label: 'PJ' };
    return { key: '', label: '' };
  }

  function resolveArea(post) {
    if (window.KCUtils && typeof window.KCUtils.resolveOpportunityArea === 'function') {
      const info = window.KCUtils.resolveOpportunityArea(post);
      if (info) return info;
    }
    return { key: '', label: '', icon: 'fas fa-briefcase' };
  }

  function summarizePost(rawPost) {
    if (!rawPost) return null;
    const post = (window.KCAPI && typeof window.KCAPI.normalizePost === 'function')
      ? window.KCAPI.normalizePost(rawPost)
      : rawPost;
    if (!post || normalizeText(post.modulo || post.module) !== 'oportunidades') return null;

    const meta = (post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    const aggregateText = [
      post.titulo,
      post.descricao,
      post.categoriaLabel,
      post.categoria,
      post.subcategoriaLabel,
      post.subcategoria,
      post.area,
      meta.areaLabel,
      meta.area,
      meta.workModeLabel,
      meta.workMode,
      meta.regimeContratacao,
      meta.employmentTypeLabel,
      post.modalidadeTrabalho,
      post.regimeContratacao,
    ].filter(Boolean).join(' ');

    const type = normalizeOpportunityType(post.categoriaKey || post.categoria || meta.categoryKey || meta.category, aggregateText);
    const areaInfo = resolveArea(post);
    const workMode = resolveWorkMode(post);
    const regime = resolveEmploymentType(post);
    const fallbackAreaKey = areaInfo && areaInfo.key ? areaInfo.key : 'outras-areas';
    const fallbackAreaLabel = areaInfo && areaInfo.label ? areaInfo.label : 'Outras áreas';

    return {
      identity: getPostIdentity(post),
      id: String(post.id || '').trim(),
      type,
      areaKey: fallbackAreaKey,
      areaLabel: fallbackAreaLabel,
      areaIcon: (areaInfo && areaInfo.icon) ? areaInfo.icon : 'fas fa-briefcase',
      regimeKey: regime.key || '',
      workModeKey: workMode.key || '',
      isRemote: !!workMode.remote,
      isPresential: !!workMode.presencial,
      searchText: normalizeText(aggregateText),
    };
  }

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

  function applyCardDataset(card, summary) {
    if (!card || !summary) return;
    card.setAttribute('data-kc-opp-type', summary.type || '');
    card.setAttribute('data-kc-opp-area', summary.areaKey || '');
    card.setAttribute('data-kc-opp-regime', summary.regimeKey || '');
    card.setAttribute('data-kc-opp-work-mode', summary.workModeKey || '');
    card.setAttribute('data-kc-opp-remote', String(!!summary.isRemote));
    card.setAttribute('data-kc-opp-presencial', String(!!summary.isPresential));
  }

  function decorateFreshCards(payload) {
    const container = payload && payload.container;
    const posts = payload && Array.isArray(payload.posts) ? payload.posts : [];
    if (!container || !posts.length) return;

    upsertPosts(posts);

    const cards = Array.from(container.querySelectorAll('.kc-card'));
    const freshCards = cards.slice(-posts.length);
    freshCards.forEach((card, index) => {
      const summary = summarizePost(posts[index]);
      if (!summary) return;
      applyCardDataset(card, summary);
    });
  }

  function getSelectedInputs(kind) {
    return Array.from(document.querySelectorAll('[data-kc-opp-filter-kind="' + kind + '"]'))
      .filter((input) => input && input.checked)
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function syncStateFromInputs() {
    state.selectedTypeFilters = new Set(getSelectedInputs('type'));
    state.selectedModeFilters = new Set(getSelectedInputs('mode'));
  }

  function syncFilterInputs(typeFilters, modeFilters) {
    const types = typeFilters || new Set();
    const modes = modeFilters || new Set();

    document.querySelectorAll('[data-kc-opp-filter-kind="type"]').forEach((input) => {
      input.checked = types.has(String(input.value || '').trim());
    });

    document.querySelectorAll('[data-kc-opp-filter-kind="mode"]').forEach((input) => {
      input.checked = modes.has(String(input.value || '').trim());
    });
  }

  function hasTypeModeSelection(typeFilters, modeFilters) {
    return !!((typeFilters && typeFilters.size) || (modeFilters && modeFilters.size));
  }

  function isTypeMatch(filterKey, type, regimeKey) {
    if (filterKey === 'emprego-clt') {
      return type === 'emprego' && regimeKey === 'clt';
    }
    return type === filterKey;
  }

  function isModeMatch(filterKey, workModeKey, isRemote, isPresential) {
    if (filterKey === 'hibrido') return workModeKey === 'hibrido';
    if (filterKey === 'remoto') return isRemote;
    if (filterKey === 'presencial') return isPresential;
    return false;
  }

  function cardMatchesSidebarFilters(card) {
    const type = String(card.getAttribute('data-kc-opp-type') || '');
    const area = String(card.getAttribute('data-kc-opp-area') || '');
    const regime = String(card.getAttribute('data-kc-opp-regime') || '');
    const workModeKey = String(card.getAttribute('data-kc-opp-work-mode') || '');
    const isRemote = String(card.getAttribute('data-kc-opp-remote') || '').toLowerCase() === 'true';
    const isPresential = String(card.getAttribute('data-kc-opp-presencial') || '').toLowerCase() === 'true';

    if (state.selectedTypeFilters.size) {
      let typeMatches = false;
      state.selectedTypeFilters.forEach((filterKey) => {
        if (isTypeMatch(filterKey, type, regime)) typeMatches = true;
      });
      if (!typeMatches) return false;
    }

    if (state.selectedModeFilters.size) {
      let modeMatches = false;
      state.selectedModeFilters.forEach((filterKey) => {
        if (isModeMatch(filterKey, workModeKey, isRemote, isPresential)) modeMatches = true;
      });
      if (!modeMatches) return false;
    }

    if (state.selectedArea && area !== state.selectedArea) return false;
    return true;
  }

  function categoryMatches(summary, selectedCategory) {
    const selected = canonicalCategory(selectedCategory);
    if (!selected || selected === 'toda' || selected === 'todas') return true;
    const item = canonicalCategory(summary.type);
    if (!item) return false;
    return item.includes(selected) || selected.includes(item);
  }

  function queryMatches(summary, query) {
    const normalized = normalizeText(query);
    if (!normalized) return true;
    return String(summary.searchText || '').includes(normalized);
  }

  function matchesSummary(summary, options) {
    const cfg = options || {};
    const filterState = getFilterState();

    if (!categoryMatches(summary, filterState.category)) return false;
    if (!queryMatches(summary, filterState.query)) return false;

    if (state.selectedTypeFilters.size && !cfg.ignoreType) {
      let typeMatches = false;
      state.selectedTypeFilters.forEach((filterKey) => {
        if (isTypeMatch(filterKey, summary.type, summary.regimeKey)) typeMatches = true;
      });
      if (!typeMatches) return false;
    }

    if (state.selectedModeFilters.size && !cfg.ignoreMode) {
      let modeMatches = false;
      state.selectedModeFilters.forEach((filterKey) => {
        if (isModeMatch(filterKey, summary.workModeKey, summary.isRemote, summary.isPresential)) modeMatches = true;
      });
      if (!modeMatches) return false;
    }

    if (state.selectedArea && !cfg.ignoreArea && summary.areaKey !== state.selectedArea) return false;
    return true;
  }

  function getAreaCatalog(countMap) {
    const definitions = getAreaDefinitions();
    const catalog = new Map();

    definitions.forEach((entry, index) => {
      catalog.set(entry.key, {
        key: entry.key,
        label: entry.label,
        icon: entry.icon || 'fas fa-briefcase',
        order: index,
        isKnown: true,
      });
    });

    state.posts.forEach((summary) => {
      if (!summary.areaKey) return;
      if (!catalog.has(summary.areaKey)) {
        catalog.set(summary.areaKey, {
          key: summary.areaKey,
          label: summary.areaLabel || summary.areaKey,
          icon: summary.areaIcon || 'fas fa-briefcase',
          order: definitions.length + catalog.size,
          isKnown: false,
        });
      }
    });

    return Array.from(catalog.values()).sort((left, right) => {
      const countDiff = (countMap.get(right.key) || 0) - (countMap.get(left.key) || 0);
      if (countDiff !== 0) return countDiff;
      if (left.isKnown !== right.isKnown) return left.isKnown ? -1 : 1;
      return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR');
    });
  }

  function getRenderedAreaSelection() {
    if (state.modalDraft && state.activeSectionKey === 'areas') {
      return state.modalDraft.area || '';
    }
    return state.selectedArea || '';
  }

  function getAreaLabel(areaKey) {
    if (!areaKey) return 'Todas as áreas';
    const known = getAreaDefinitions().find((entry) => entry.key === areaKey);
    if (known && known.label) return known.label;
    const summary = Array.from(state.posts.values()).find((entry) => entry.areaKey === areaKey);
    return summary && summary.areaLabel ? summary.areaLabel : areaKey;
  }

  function renderAreaButtons() {
    const list = document.querySelector('[data-kc-opp-area-list="true"]');
    if (!list) return;

    const allSummaries = Array.from(state.posts.values());
    const baseSummaries = allSummaries.filter((summary) => matchesSummary(summary, { ignoreArea: true }));
    const countMap = new Map();
    baseSummaries.forEach((summary) => {
      const current = countMap.get(summary.areaKey) || 0;
      countMap.set(summary.areaKey, current + 1);
    });

    const areas = getAreaCatalog(countMap);
    const total = baseSummaries.length;
    const renderedArea = getRenderedAreaSelection();
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
      const isDisabled = !isActive && count === 0;
      items.push(
        '<button class="kc-category-item ' + (isActive ? 'is-active ' : '') + (isDisabled ? 'is-disabled' : '') + '" type="button" data-kc-opp-area="' + escapeHtml(area.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '"' + (isDisabled ? ' disabled' : '') + '>' +
          '<i class="' + escapeHtml(area.icon || 'fas fa-briefcase') + '"></i>' +
          '<span>' + escapeHtml(area.label || area.key) + '</span>' +
          '<span class="kc-category-count">' + count + '</span>' +
        '</button>'
      );
    });

    list.innerHTML = items.join('');
  }

  function syncClearButtonState() {
    const clearButton = document.querySelector('[data-kc-opp-clear-filters="true"]');
    if (!clearButton) return;
    const hasFilters = hasTypeModeSelection(state.selectedTypeFilters, state.selectedModeFilters);
    clearButton.disabled = !hasFilters;
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

  function renderMobileRail() {
    const rail = document.querySelector('[data-kc-opp-mobile-rail="true"]');
    if (!rail) return;

    const sections = getSidebarSections();
    if (!sections.length) return;

    rail.innerHTML = sections.map((section) => {
      const isActive = state.activeSectionKey === section.key;
      return (
        '<button class="kc-opportunity-mobile-rail__button ' + (isActive ? 'is-active' : '') + '" type="button" data-kc-opp-open-section="' + escapeHtml(section.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' +
          '<i class="' + escapeHtml(section.icon || 'fas fa-layer-group') + '"></i>' +
          '<span>' + escapeHtml(section.title) + '</span>' +
        '</button>'
      );
    }).join('');
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
      };
      const canClear = hasTypeModeSelection(draft.typeFilters, draft.modeFilters);
      actions.innerHTML = [
        '<div class="kc-opportunity-section-modal__action-group">',
        '  <button class="kc-opportunity-clear" type="button" data-kc-opp-modal-clear-filters="true"' + (canClear ? '' : ' disabled') + '>Limpar filtros</button>',
        '  <button class="kc-opportunity-apply" type="button" data-kc-opp-modal-apply="filters">Aplicar filtros</button>',
        '</div>'
      ].join('');
      return;
    }

    if (state.activeSectionKey === 'areas') {
      actions.innerHTML = [
        '<div class="kc-opportunity-section-modal__action-group">',
        '  <p class="kc-opportunity-section-modal__caption">Área selecionada: <strong>' + escapeHtml(getAreaLabel((state.modalDraft && state.modalDraft.area) || '')) + '</strong></p>',
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
    };

    title.textContent = sectionMeta.title;
    titleIcon.className = sectionMeta.icon || 'fas fa-layer-group';
    syncFilterInputs(state.modalDraft.typeFilters, state.modalDraft.modeFilters);
    renderAreaButtons();
    renderSectionActions();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('opportunities-section-modal');
    }

    renderMobileRail();

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
      syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters);
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
    renderMobileRail();
    syncClearButtonState();

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
      renderAreaButtons();
      renderMobileRail();
      renderSectionActions();
      syncClearButtonState();
    });
  }

  function applyCurrentFilters() {
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
      renderSectionActions();
      return;
    }

    syncStateFromInputs();
    applyCurrentFilters();
  }

  function bindSidebarEvents() {
    document.querySelectorAll('[data-kc-opp-filter-kind]').forEach((input) => {
      input.addEventListener('change', applySidebarFilters);
    });

    const clearButton = document.querySelector('[data-kc-opp-clear-filters="true"]');
    if (clearButton) {
      clearButton.addEventListener('click', function () {
        document.querySelectorAll('[data-kc-opp-filter-kind]').forEach((input) => {
          input.checked = false;
        });
        applySidebarFilters();
      });
    }

    document.addEventListener('click', function (event) {
      const clearDraftButton = event.target.closest('[data-kc-opp-modal-clear-filters="true"]');
      if (clearDraftButton && state.modalDraft) {
        state.modalDraft.typeFilters = new Set();
        state.modalDraft.modeFilters = new Set();
        syncFilterInputs(state.modalDraft.typeFilters, state.modalDraft.modeFilters);
        renderSectionActions();
        return;
      }

      const applyButton = event.target.closest('[data-kc-opp-modal-apply]');
      if (applyButton) {
        const action = String(applyButton.getAttribute('data-kc-opp-modal-apply') || '').trim();
        if (action === 'filters' && state.modalDraft) {
          state.selectedTypeFilters = cloneSet(state.modalDraft.typeFilters);
          state.selectedModeFilters = cloneSet(state.modalDraft.modeFilters);
          syncFilterInputs(state.selectedTypeFilters, state.selectedModeFilters);
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

  async function fetchAllPosts() {
    if (state.fetchStarted) return;
    state.fetchStarted = true;

    const collected = [];

    try {
      if (window.KCAPI && typeof window.KCAPI.getPosts === 'function') {
        const limit = 100;
        for (let page = 1; page <= 20; page += 1) {
          const batch = await window.KCAPI.getPosts({ module: 'oportunidades', page, limit });
          if (!Array.isArray(batch) || batch.length === 0) break;
          collected.push(...batch);
          if (batch.length < limit) break;
        }
      } else if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        const db = await window.KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        collected.push(...posts.filter((post) => normalizeText(post && post.modulo) === 'oportunidades'));
      }
    } catch (_) { }

    try {
      if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
        const userPosts = window.kcUserPosts.list();
        if (Array.isArray(userPosts)) {
          collected.push(...userPosts.filter((post) => normalizeText(post && post.modulo) === 'oportunidades'));
        }
      }
    } catch (_) { }

    upsertPosts(collected);
    persistCachedPosts(collected);
    queueRefresh();
  }

  function setupExtraPredicate() {
    if (!window.kcFilters || typeof window.kcFilters.setExtraPredicate !== 'function') return;
    window.kcFilters.setExtraPredicate(function (card) {
      return cardMatchesSidebarFilters(card);
    });
  }

  function initFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({
      module: 'oportunidades',
      pageModule: 'oportunidades',
      sortBy: sortBy || 'votos',
      onAfterAppend: function (payload) {
        decorateFreshCards(payload);
        queueRefresh();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    collectSidebarSections();
    ensureMobileSectionModal();
    wrapFilterApply();
    syncStateFromInputs();
    bindSidebarEvents();
    setupExtraPredicate();
    restoreCachedPosts();
    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: initFeed });
    } else {
      initFeed();
    }
    fetchAllPosts();
    queueRefresh();
  });
})();
