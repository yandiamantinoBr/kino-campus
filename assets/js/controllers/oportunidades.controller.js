/* KinoCampus - oportunidades controller (V8.2.0.0) */
(function () {
  'use strict';

  const DEFAULT_AREAS = [
    { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
    { key: 'marketing', label: 'Marketing', icon: 'fas fa-bullhorn' },
    { key: 'design', label: 'Design', icon: 'fas fa-palette' },
    { key: 'educacao', label: 'Educa\u00e7\u00e3o', icon: 'fas fa-graduation-cap' },
  ];

  const state = {
    selectedTypeFilters: new Set(),
    selectedModeFilters: new Set(),
    selectedArea: '',
    posts: new Map(),
    refreshQueued: false,
    fetchStarted: false,
    applyWrapped: false,
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

  function resolveWorkMode(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
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

    if (isHybrid) return { key: 'hibrido', label: 'H\u00edbrido', remote: true, presencial: true };
    if (isRemote) return { key: 'remoto', label: 'Remoto', remote: true, presencial: false };
    if (isPresential) return { key: 'presencial', label: 'Presencial', remote: false, presencial: true };
    return { key: '', label: '', remote: false, presencial: false };
  }

  function resolveEmploymentType(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
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
      return { key: 'temporario', label: 'Tempor\u00e1rio' };
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
    ].filter(Boolean).join(' ');

    const type = normalizeOpportunityType(post.categoriaKey || post.categoria || meta.categoryKey || meta.category, aggregateText);
    const areaInfo = resolveArea(post);
    const workMode = resolveWorkMode(post);
    const regime = resolveEmploymentType(post);
    const fallbackAreaKey = areaInfo && areaInfo.key ? areaInfo.key : 'outras-areas';
    const fallbackAreaLabel = areaInfo && areaInfo.label ? areaInfo.label : 'Outras \u00e1reas';

    return {
      identity: getPostIdentity(post),
      id: String(post.id || '').trim(),
      type,
      areaKey: fallbackAreaKey,
      areaLabel: fallbackAreaLabel,
      areaIcon: (areaInfo && areaInfo.icon) ? areaInfo.icon : 'fas fa-briefcase',
      regimeKey: regime.key || '',
      isRemote: !!workMode.remote,
      isPresential: !!workMode.presencial,
      searchText: normalizeText(aggregateText),
    };
  }

  function upsertPosts(list) {
    if (!Array.isArray(list)) return;
    list.forEach((post) => {
      const summary = summarizePost(post);
      if (!summary || !summary.identity) return;
      state.posts.set(summary.identity, summary);
    });
  }

  function applyCardDataset(card, summary) {
    if (!card || !summary) return;
    card.setAttribute('data-kc-opp-type', summary.type || '');
    card.setAttribute('data-kc-opp-area', summary.areaKey || '');
    card.setAttribute('data-kc-opp-regime', summary.regimeKey || '');
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

  function cardMatchesSidebarFilters(card) {
    const type = String(card.getAttribute('data-kc-opp-type') || '');
    const area = String(card.getAttribute('data-kc-opp-area') || '');
    const regime = String(card.getAttribute('data-kc-opp-regime') || '');
    const isRemote = String(card.getAttribute('data-kc-opp-remote') || '').toLowerCase() === 'true';
    const isPresential = String(card.getAttribute('data-kc-opp-presencial') || '').toLowerCase() === 'true';

    if (state.selectedTypeFilters.size) {
      let typeMatches = false;
      state.selectedTypeFilters.forEach((filterKey) => {
        if (filterKey === 'emprego-clt') {
          if (type === 'emprego' && regime === 'clt') typeMatches = true;
          return;
        }
        if (type === filterKey) typeMatches = true;
      });
      if (!typeMatches) return false;
    }

    if (state.selectedModeFilters.size) {
      let modeMatches = false;
      state.selectedModeFilters.forEach((filterKey) => {
        if (filterKey === 'remoto' && isRemote) modeMatches = true;
        if (filterKey === 'presencial' && isPresential) modeMatches = true;
      });
      if (!modeMatches) return false;
    }

    if (state.selectedArea && area !== state.selectedArea) return false;
    return true;
  }

  function queueRefresh() {
    if (state.refreshQueued) return;
    state.refreshQueued = true;
    const schedule = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); };
    schedule(function () {
      state.refreshQueued = false;
      renderAreaButtons();
      syncClearButtonState();
    });
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
        if (filterKey === 'emprego-clt') {
          if (summary.type === 'emprego' && summary.regimeKey === 'clt') typeMatches = true;
          return;
        }
        if (summary.type === filterKey) typeMatches = true;
      });
      if (!typeMatches) return false;
    }

    if (state.selectedModeFilters.size && !cfg.ignoreMode) {
      let modeMatches = false;
      state.selectedModeFilters.forEach((filterKey) => {
        if (filterKey === 'remoto' && summary.isRemote) modeMatches = true;
        if (filterKey === 'presencial' && summary.isPresential) modeMatches = true;
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

  function renderAreaButtons() {
    const list = document.querySelector('[data-kc-opp-area-list="true"]');
    if (!list) return;

    const allSummaries = Array.from(state.posts.values());
    if (!allSummaries.length) return;

    const baseSummaries = allSummaries.filter((summary) => matchesSummary(summary, { ignoreArea: true }));
    const countMap = new Map();
    baseSummaries.forEach((summary) => {
      const current = countMap.get(summary.areaKey) || 0;
      countMap.set(summary.areaKey, current + 1);
    });

    const areas = getAreaCatalog(countMap);
    const total = baseSummaries.length;
    const items = [];

    items.push(
      '<button class="kc-category-item ' + (!state.selectedArea ? 'is-active' : '') + '" type="button" data-kc-opp-area="" aria-pressed="' + (!state.selectedArea ? 'true' : 'false') + '">' +
        '<i class="fas fa-layer-group"></i>' +
        '<span>Todas as \u00e1reas</span>' +
        '<span class="kc-category-count">' + total + '</span>' +
      '</button>'
    );

    areas.forEach((area) => {
      const count = countMap.get(area.key) || 0;
      const isActive = state.selectedArea === area.key;
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
    const hasFilters = state.selectedTypeFilters.size > 0 || state.selectedModeFilters.size > 0 || !!state.selectedArea;
    clearButton.disabled = !hasFilters;
  }

  function applySidebarFilters() {
    syncStateFromInputs();
    if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
      window.kcFilters.apply();
      return;
    }
    queueRefresh();
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
        state.selectedArea = '';
        applySidebarFilters();
      });
    }

    document.addEventListener('click', function (event) {
      const areaButton = event.target.closest('[data-kc-opp-area]');
      if (!areaButton) return;
      state.selectedArea = String(areaButton.getAttribute('data-kc-opp-area') || '').trim();
      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      } else {
        queueRefresh();
      }
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
    queueRefresh();
  }

  function setupExtraPredicate() {
    if (!window.kcFilters || typeof window.kcFilters.setExtraPredicate !== 'function') return;
    window.kcFilters.setExtraPredicate(function (card) {
      return cardMatchesSidebarFilters(card);
    });
  }

  function initFeed() {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({
      module: 'oportunidades',
      pageModule: 'oportunidades',
      onAfterAppend: function (payload) {
        decorateFreshCards(payload);
        queueRefresh();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wrapFilterApply();
    syncStateFromInputs();
    bindSidebarEvents();
    setupExtraPredicate();
    initFeed();
    fetchAllPosts();
    queueRefresh();
  });
})();
