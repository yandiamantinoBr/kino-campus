/* KinoCampus - Achados e Perdidos Controller (V8.7.0.0) */
(function () {
  'use strict';

  const DEFAULT_LOCATIONS = [
    { key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '📚' },
    { key: 'restaurante-universitario', label: 'Restaurante Universitário', icon: 'fas fa-utensils', emoji: '🍽️' },
    { key: 'estacionamento', label: 'Estacionamento', icon: 'fas fa-parking', emoji: '🅿️' },
    { key: 'salas-de-aula', label: 'Salas de Aula', icon: 'fas fa-door-open', emoji: '🚪' },
    { key: 'blocos-e-laboratorios', label: 'Blocos e Laboratórios', icon: 'fas fa-flask', emoji: '🧪' },
    { key: 'centro-de-aulas', label: 'Centro de Aulas', icon: 'fas fa-school', emoji: '🏫' },
    { key: 'praca-universitaria', label: 'Praça Universitária', icon: 'fas fa-landmark', emoji: '🏛️' },
    { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-tree', emoji: '🌳' },
    { key: 'campus-colemar', label: 'Campus Colemar', icon: 'fas fa-graduation-cap', emoji: '🎓' },
  ];

  const MODAL_ID = 'kcLostFoundSectionOverlay';
  const SECTION_CACHE_KEY = 'achados-perdidos:index';
  const SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
  const state = {
    statuses: new Set(),
    types: new Set(),
    location: '',
    datePreset: '',
    feedPager: null,
    posts: new Map(),
    sections: [],
    queued: false,
    wrapped: false,
    fetched: false,
    activeKey: '',
    activeNode: null,
    activePlaceholder: null,
    lastTrigger: null,
    draft: null,
  };

  function norm(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') return window.KCUtils.normalizeText(value);
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(value);
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cloneSet(set) { return new Set(Array.from(set || [])); }
  function isMobile() { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function getFeedFilterUtils() {
    return (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
  }

  function getAllowedDatePresets() {
    const utils = getFeedFilterUtils();
    return utils && typeof utils.getAllowedDatePresets === 'function'
      ? utils.getAllowedDatePresets('achados-perdidos')
      : ['today', 'last7d', 'last30d'];
  }

  function normalizeDatePreset(value) {
    const utils = getFeedFilterUtils();
    if (utils && typeof utils.normalizeDatePreset === 'function') {
      return utils.normalizeDatePreset('achados-perdidos', value);
    }
    const normalized = norm(value);
    const allowed = getAllowedDatePresets();
    return allowed.includes(normalized) ? normalized : '';
  }

  function readSelectedDatePreset() {
    const selected = document.querySelector('[data-kc-achados-date-preset]:checked');
    return normalizeDatePreset(selected ? selected.value : '');
  }

  function renderDateInputs() {
    const selected = (state.draft && state.activeKey === 'dates')
      ? normalizeDatePreset(state.draft.datePreset)
      : normalizeDatePreset(state.datePreset);
    document.querySelectorAll('[data-kc-achados-date-preset]').forEach((input) => {
      input.checked = normalizeDatePreset(input.value) === selected;
    });
  }

  function restoreCachedPosts() {
    const store = getSessionStore();
    if (!store) return false;
    const cached = store.get('feed-index', SECTION_CACHE_KEY, { maxAge: SECTION_CACHE_MAX_AGE_MS });
    const posts = cached && cached.value && Array.isArray(cached.value.posts) ? cached.value.posts : [];
    if (!posts.length) return false;
    upsert(posts);
    queue();
    return true;
  }

  function persistCachedPosts(posts) {
    const store = getSessionStore();
    if (!store || typeof store.set !== 'function') return;
    store.set('feed-index', SECTION_CACHE_KEY, {
      posts: Array.isArray(posts) ? posts.slice(0, 600) : [],
    });
  }

  function normStatus(value) {
    const normalized = norm(value);
    if (!normalized) return '';
    if (normalized.includes('perd')) return 'perdido';
    if (normalized.includes('encontr') || normalized.includes('achad')) return 'encontrado';
    return normalized;
  }

  function normType(value) {
    const normalized = norm(value);
    if (!normalized) return '';
    if (normalized.includes('document')) return 'documento';
    if (normalized.includes('eletron')) return 'eletronico';
    if (normalized.includes('outro')) return 'outro';
    return normalized;
  }

  function statusTabKey(value) {
    const key = normStatus(value);
    if (key === 'perdido') return 'perdidos';
    if (key === 'encontrado') return 'encontrados';
    return key;
  }

  function typeTabKey(value) {
    const key = normType(value);
    if (key === 'documento') return 'documentos';
    if (key === 'eletronico') return 'eletronicos';
    if (key === 'outro') return 'outros';
    return key;
  }

  function statusLabel(value) {
    const key = normStatus(value);
    if (key === 'perdido') return 'Perdidos';
    if (key === 'encontrado') return 'Encontrados';
    return value || '';
  }

  function typeLabel(value) {
    const key = normType(value);
    if (key === 'documento') return 'Documentos';
    if (key === 'eletronico') return 'Eletrônicos';
    if (key === 'outro') return 'Outros';
    return value || '';
  }

  function filterState() {
    if (window.kcFilters && typeof window.kcFilters.getState === 'function') {
      const current = window.kcFilters.getState();
      return {
        category: current && current.category ? current.category : 'todas',
        query: current && current.query ? current.query : '',
      };
    }

    const tab = document.querySelector('.kc-feed-tabs a.active');
    const input = document.getElementById('searchInput');
    return {
      category: tab ? (tab.getAttribute('data-category') || tab.getAttribute('href') || '').replace('#', '') || 'todas' : 'todas',
      query: input ? String(input.value || '') : '',
    };
  }

  function categoryMatches(summary, selectedCategory) {
    const selected = norm(selectedCategory);
    if (!selected || selected === 'toda' || selected === 'todas') return true;
    return summary.categoryDataNorm.includes(selected);
  }

  function queryMatches(summary, query) {
    const normalizedQuery = norm(query);
    if (!normalizedQuery) return true;
    return String(summary.searchText || '').includes(normalizedQuery);
  }

  function getLocationDefinitions() {
    if (window.KCUtils && typeof window.KCUtils.getLostFoundLocationDefinitions === 'function') {
      return window.KCUtils.getLostFoundLocationDefinitions();
    }
    return DEFAULT_LOCATIONS.slice();
  }

  function postId(post) {
    const uuid = String(post && (post.uuid || post.post_uuid) || '').trim();
    if (uuid) return 'uuid:' + uuid;
    const legacy = String(post && (post.legacyId || post.legacy_id || post.id) || '').trim();
    if (legacy) return 'id:' + legacy;
    return [String(post && (post.modulo || post.module) || ''), String(post && (post.titulo || post.title) || ''), String(post && (post.timestamp || post.created_at) || '')].join('|');
  }

  function summarize(raw) {
    if (!raw) return null;
    const normalized = (window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw;
    const post = (window.KCUtils && typeof window.KCUtils.applyPresentationRules === 'function')
      ? window.KCUtils.applyPresentationRules(normalized, { pageModule: 'achados-perdidos' })
      : normalized;
    if (norm(post && (post.modulo || post.module)) !== 'achados-perdidos') return null;

    const meta = (post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    const location = (post._kcLostFoundInfo && post._kcLostFoundInfo.location)
      || ((window.KCUtils && typeof window.KCUtils.resolveLostFoundLocation === 'function') ? window.KCUtils.resolveLostFoundLocation(post) : null)
      || {};
    const statusKey = normStatus(post.categoriaKey || post.categoria || meta.categoriaKey || meta.categoria || '');
    const typeKey = normType(post.subcategoriaKey || post.subcategoria || meta.subcategory || meta.subcategoria || '');
    const statusTab = statusTabKey(statusKey);
    const typeTab = typeTabKey(typeKey);
    const categoryData = [statusTab, typeTab].filter(Boolean).join(' ');

    return {
      identity: postId(post),
      statusKey,
      statusLabel: statusLabel(statusKey),
      typeKey,
      typeLabel: typeLabel(typeKey),
      createdAt: post && (post.created_at || post.createdAt || post.timestamp || null),
      locationKey: String(location.key || post.lostFoundLocationKey || meta.lostFoundLocationKey || '').trim(),
      locationLabel: String(location.label || post.lostFoundLocationLabel || meta.lostFoundLocationLabel || '').trim(),
      locationIcon: String(location.icon || post.lostFoundLocationIcon || meta.lostFoundLocationIcon || 'fas fa-map-marker-alt').trim(),
      locationEmoji: String(location.emoji || post.lostFoundLocationEmoji || meta.lostFoundLocationEmoji || '📍').trim(),
      categoryData,
      categoryDataNorm: norm(categoryData),
      searchText: norm([
        post && post.titulo,
        post && post.descricao,
        statusLabel(statusKey),
        typeLabel(typeKey),
        location && location.label,
        post && post.localizacao,
      ].filter(Boolean).join(' ')),
    };
  }

  function syncHistoryCaches() {
    window.__KC_LOST_FOUND_LOCATION_HISTORY = Array.from(state.posts.values())
      .filter((summary) => summary && summary.locationKey && summary.locationLabel)
      .map((summary) => ({
        key: summary.locationKey,
        label: summary.locationLabel,
        icon: summary.locationIcon || 'fas fa-map-marker-alt',
        emoji: summary.locationEmoji || '📍',
      }));
  }

  function upsert(list) {
    if (!Array.isArray(list)) return;
    list.forEach((post) => {
      const summary = summarize(post);
      if (summary && summary.identity) state.posts.set(summary.identity, summary);
    });
    syncHistoryCaches();
  }

  function decorate(payload) {
    const container = payload && payload.container;
    const posts = payload && Array.isArray(payload.posts) ? payload.posts : [];
    if (!container || !posts.length) return;
    upsert(posts);
    Array.from(container.querySelectorAll('.kc-card')).slice(-posts.length).forEach((card, index) => {
      const summary = summarize(posts[index]);
      if (!summary) return;
      card.setAttribute('data-category', summary.categoryData || '');
      if (summary.statusKey) card.setAttribute('data-kc-lostfound-status', summary.statusKey);
      if (summary.typeKey) card.setAttribute('data-kc-lostfound-type', summary.typeKey);
      if (summary.createdAt) card.setAttribute('data-kc-created-at', String(summary.createdAt));
      if (summary.locationKey) card.setAttribute('data-kc-lostfound-location', summary.locationKey);
    });
  }

  function readSelected(kind) {
    return Array.from(document.querySelectorAll(`[data-kc-achados-filter-kind="${kind}"]`))
      .filter((input) => input && input.checked)
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function readInputs() {
    state.statuses = new Set(readSelected('status').map((value) => normStatus(value)).filter(Boolean));
    state.types = new Set(readSelected('type').map((value) => normType(value)).filter(Boolean));
    state.datePreset = readSelectedDatePreset();
  }

  function readDraftInputs() {
    if (!state.draft) return;
    state.draft.statuses = new Set(readSelected('status').map((value) => normStatus(value)).filter(Boolean));
    state.draft.types = new Set(readSelected('type').map((value) => normType(value)).filter(Boolean));
    state.draft.datePreset = readSelectedDatePreset();
  }

  function getFeedRequestParams() {
    const params = {};
    if (state.statuses.size) params.lfStatus = Array.from(state.statuses);
    if (state.types.size) params.lfType = Array.from(state.types);
    if (state.location) params.lfLocation = state.location;
    if (state.datePreset) params.datePreset = state.datePreset;
    return params;
  }

  function refreshFeed() {
    if (!state.feedPager || typeof state.feedPager.refresh !== 'function') return;
    state.feedPager.refresh({ requestParams: getFeedRequestParams() });
  }

  function restoreUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.getSearchParams !== 'function') return false;
    const params = utils.getSearchParams();
    const hasStatuses = !!(params && typeof params.has === 'function' && params.has('lfStatus'));
    const hasTypes = !!(params && typeof params.has === 'function' && params.has('lfType'));
    const hasLocation = !!(params && typeof params.has === 'function' && params.has('lfLocation'));
    const hasDatePreset = !!(params && typeof params.has === 'function' && params.has('datePreset'));
    if (!hasStatuses && !hasTypes && !hasLocation && !hasDatePreset) return false;

    if (hasStatuses) {
      state.statuses = new Set(utils.readListParam(params, 'lfStatus').map((value) => normStatus(value)).filter(Boolean));
    }
    if (hasTypes) {
      state.types = new Set(utils.readListParam(params, 'lfType').map((value) => normType(value)).filter(Boolean));
    }
    if (hasLocation) {
      state.location = utils.readTextParam(params, 'lfLocation');
    }
    if (hasDatePreset) {
      state.datePreset = typeof utils.readPresetParam === 'function'
        ? utils.readPresetParam(params, 'datePreset', getAllowedDatePresets())
        : normalizeDatePreset(utils.readTextParam(params, 'datePreset'));
    }
    renderFilterInputs();
    renderDateInputs();
    syncTabPresetFromAppliedState();
    return true;
  }

  function syncUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      utils.writeListParam(params, 'lfStatus', Array.from(state.statuses));
      utils.writeListParam(params, 'lfType', Array.from(state.types));
      utils.writeTextParam(params, 'lfLocation', state.location || '');
      if (typeof utils.writePresetParam === 'function') utils.writePresetParam(params, 'datePreset', state.datePreset, getAllowedDatePresets());
      else utils.writeTextParam(params, 'datePreset', state.datePreset || '');
    });
  }

  function matchesLocation(summary, locationKey) {
    const selected = String(locationKey || '').trim();
    if (!selected) return true;
    return summary.locationKey === selected;
  }

  function matchesSummary(summary, options) {
    const cfg = options || {};
    const current = filterState();

    if (!categoryMatches(summary, current.category)) return false;
    if (!queryMatches(summary, current.query)) return false;

    if (!cfg.ignoreStatuses && state.statuses.size && !state.statuses.has(summary.statusKey)) return false;
    if (!cfg.ignoreTypes && state.types.size && !state.types.has(summary.typeKey)) return false;
    if (!cfg.ignoreDate && state.datePreset) {
      const utils = getFeedFilterUtils();
      if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'achados-perdidos', preset: state.datePreset, createdAt: summary.createdAt })) return false;
    }
    if (!cfg.ignoreLocation && !matchesLocation(summary, state.location)) return false;
    return true;
  }

  function getRenderedStatusSelection() {
    return (state.draft && state.activeKey === 'filters') ? cloneSet(state.draft.statuses) : cloneSet(state.statuses);
  }

  function getRenderedTypeSelection() {
    return (state.draft && state.activeKey === 'filters') ? cloneSet(state.draft.types) : cloneSet(state.types);
  }

  function getRenderedLocationSelection() {
    return (state.draft && state.activeKey === 'locations') ? (state.draft.location || '') : (state.location || '');
  }

  function renderFilterInputs() {
    const selectedStatuses = getRenderedStatusSelection();
    const selectedTypes = getRenderedTypeSelection();

    document.querySelectorAll('[data-kc-achados-filter-kind="status"]').forEach((input) => {
      input.checked = selectedStatuses.has(normStatus(input.value));
    });
    document.querySelectorAll('[data-kc-achados-filter-kind="type"]').forEach((input) => {
      input.checked = selectedTypes.has(normType(input.value));
    });
    renderDateInputs();
  }

  function getLocationCatalog(countMap) {
    const official = getLocationDefinitions();
    const officialKeys = new Set(official.map((entry) => entry.key));
    const custom = Array.from(state.posts.values())
      .filter((summary) => summary.locationKey && summary.locationLabel && !officialKeys.has(summary.locationKey))
      .reduce((map, summary) => {
        if (map.has(summary.locationKey)) return map;
        map.set(summary.locationKey, {
          key: summary.locationKey,
          label: summary.locationLabel,
          icon: summary.locationIcon || 'fas fa-map-marker-alt',
          emoji: summary.locationEmoji || '📍',
        });
        return map;
      }, new Map());

    const customList = Array.from(custom.values()).sort((left, right) => {
      const countDiff = (countMap.get(right.key) || 0) - (countMap.get(left.key) || 0);
      if (countDiff !== 0) return countDiff;
      return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR');
    });

    return official.concat(customList);
  }

  function getLocationLabel(locationKey) {
    if (!locationKey) return 'Todos os locais';
    const official = getLocationDefinitions().find((entry) => entry.key === locationKey);
    if (official && official.label) return official.label;
    const summary = Array.from(state.posts.values()).find((entry) => entry.locationKey === locationKey);
    return summary ? summary.locationLabel : locationKey;
  }

  function renderLocations() {
    const list = document.querySelector('[data-kc-achados-location-list="true"]');
    if (!list) return;

    const base = Array.from(state.posts.values()).filter((summary) => matchesSummary(summary, { ignoreLocation: true }));
    const counts = new Map();
    base.forEach((summary) => {
      if (!summary.locationKey) return;
      counts.set(summary.locationKey, (counts.get(summary.locationKey) || 0) + 1);
    });

    const active = getRenderedLocationSelection();
    const items = [
      '<button class="kc-category-item ' + (!active ? 'is-active' : '') + '" type="button" data-kc-achados-location="" aria-pressed="' + (!active ? 'true' : 'false') + '">' +
      '<i class="fas fa-layer-group"></i><span>Todos os locais</span><span class="kc-category-count">' + base.length + '</span>' +
      '</button>'
    ];

    getLocationCatalog(counts).forEach((entry) => {
      const count = counts.get(entry.key) || 0;
      const isActive = active === entry.key;
      const isDisabled = !isActive && count === 0;
      items.push(
        '<button class="kc-category-item ' + (isActive ? 'is-active ' : '') + (isDisabled ? 'is-disabled' : '') + '" type="button" data-kc-achados-location="' + esc(entry.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '"' + (isDisabled ? ' disabled' : '') + '>' +
        '<i class="' + esc(entry.icon || 'fas fa-map-marker-alt') + '"></i>' +
        '<span>' + esc(entry.label) + '</span>' +
        '<span class="kc-category-count">' + count + '</span>' +
        '</button>'
      );
    });

    list.innerHTML = items.join('');
  }

  function collectSections() {
    state.sections = Array.from(document.querySelectorAll('[data-kc-achados-sidebar="true"] .kc-sidebar-section[data-kc-achados-section]')).map((node, index) => {
      const key = String(node.getAttribute('data-kc-achados-section') || ('section-' + index)).trim();
      const heading = node.querySelector('h3');
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
      return { key, title, icon, node };
    });
  }

  function ensureModal() {
    let overlay = document.getElementById(MODAL_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'kc-modal-overlay kc-lostfound-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kc-create-modal kc-lostfound-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcLostFoundSectionTitle">',
      '  <div class="kc-create-modal__header">',
      '    <h2 id="kcLostFoundSectionTitle"><i class="fas fa-search"></i><span>Seção</span></h2>',
      '    <button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-achados-close-section-modal="true"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-create-modal__body">',
      '    <div class="kc-lostfound-section-modal__content" data-kc-achados-section-modal-slot="true"></div>',
      '  </div>',
      '  <div class="kc-lostfound-section-modal__actions" data-kc-achados-section-modal-actions="true"></div>',
      '</div>'
    ].join('');
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-kc-achados-close-section-modal="true"]')) closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderRail() {
    const rail = document.querySelector('[data-kc-achados-mobile-rail="true"]');
    if (!rail || !state.sections.length) return;
    rail.innerHTML = state.sections.map((section) => (
      '<button class="kc-lostfound-mobile-rail__button ' + (state.activeKey === section.key ? 'is-active' : '') + '" type="button" data-kc-achados-open-section="' + esc(section.key) + '" aria-pressed="' + (state.activeKey === section.key ? 'true' : 'false') + '">' +
      '<i class="' + esc(section.icon) + '"></i><span>' + esc(section.title) + '</span>' +
      '</button>'
    )).join('');
  }

  function renderActions() {
    const overlay = document.getElementById(MODAL_ID);
    const actions = overlay ? overlay.querySelector('[data-kc-achados-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-lostfound-section-modal') : null;
    if (!actions || !modal) return;

    if (!state.activeKey) {
      modal.removeAttribute('data-kc-achados-section-view');
      actions.innerHTML = '';
      return;
    }

    modal.setAttribute('data-kc-achados-section-view', state.activeKey);

    if (state.activeKey === 'filters') {
      const draft = state.draft || { statuses: cloneSet(state.statuses), types: cloneSet(state.types), location: state.location || '', datePreset: state.datePreset };
      const canClear = draft.statuses.size > 0 || draft.types.size > 0 || !!normalizeDatePreset(draft.datePreset);
      actions.innerHTML = '<div class="kc-lostfound-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-achados-modal-clear="true"' + (canClear ? '' : ' disabled') + '>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-achados-modal-apply="filters">Aplicar filtros</button></div>';
      return;
    }

    if (state.activeKey === 'dates') {
      const labels = { '': 'Todas as datas', today: 'Hoje', last7d: 'Últimos 7 dias', last30d: 'Últimos 30 dias' };
      const selectedLabel = labels[(state.draft && typeof state.draft.datePreset === 'string') ? state.draft.datePreset : state.datePreset] || 'Todas as datas';
      actions.innerHTML = '<div class="kc-lostfound-section-modal__action-group"><p class="kc-lostfound-section-modal__caption">Data selecionada: <strong>' + esc(selectedLabel) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-achados-modal-apply="dates">Ver publicações</button></div>';
      return;
    }

    if (state.activeKey === 'locations') {
      actions.innerHTML = '<div class="kc-lostfound-section-modal__action-group"><p class="kc-lostfound-section-modal__caption">Local selecionado: <strong>' + esc(getLocationLabel((state.draft && state.draft.location) || '')) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-achados-modal-apply="locations">Ver publicações</button></div>';
      return;
    }

    actions.innerHTML = '<div class="kc-lostfound-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-achados-modal-apply="tips">Entendido!</button></div>';
  }

  function openModal(key, trigger) {
    const section = state.sections.find((entry) => entry.key === key);
    if (!section || !section.node) return;
    const overlay = ensureModal();
    const slot = overlay.querySelector('[data-kc-achados-section-modal-slot="true"]');
    const title = overlay.querySelector('#kcLostFoundSectionTitle span');
    const titleIcon = overlay.querySelector('#kcLostFoundSectionTitle i');
    if (!slot || !title || !titleIcon) return;

    closeModal();

    const placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-achados-section-placeholder', section.key);
    section.node.parentNode.insertBefore(placeholder, section.node);
    slot.innerHTML = '';
    slot.appendChild(section.node);

    state.activeKey = section.key;
    state.activeNode = section.node;
    state.activePlaceholder = placeholder;
    state.lastTrigger = trigger || null;
    state.draft = {
      statuses: cloneSet(state.statuses),
      types: cloneSet(state.types),
      location: state.location || '',
      datePreset: state.datePreset,
    };

    title.textContent = section.title;
    titleIcon.className = section.icon || 'fas fa-search';
    renderFilterInputs();
    renderLocations();
    renderActions();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('achados-section-modal');
    }
    renderRail();

    const closeBtn = overlay.querySelector('[data-kc-achados-close-section-modal="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    const slot = overlay ? overlay.querySelector('[data-kc-achados-section-modal-slot="true"]') : null;
    const actions = overlay ? overlay.querySelector('[data-kc-achados-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-lostfound-section-modal') : null;
    const target = state.lastTrigger && typeof state.lastTrigger.focus === 'function' ? state.lastTrigger : null;
    const wasActive = !!(overlay && overlay.classList.contains('active'));
    let focusHandled = false;

    if (overlay && document.activeElement && overlay.contains(document.activeElement)) {
      if (target) {
        try {
          target.focus();
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

    if (state.activeNode && state.activePlaceholder && state.activePlaceholder.parentNode) {
      state.activePlaceholder.parentNode.replaceChild(state.activeNode, state.activePlaceholder);
    }

    state.activeKey = '';
    state.activeNode = null;
    state.activePlaceholder = null;
    state.draft = null;

    if (slot) slot.innerHTML = '';
    if (actions) actions.innerHTML = '';
    if (modal) modal.removeAttribute('data-kc-achados-section-view');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) {
      document.body.classList.remove('kc-modal-open');
      if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
        window.KCOverlayLock.unlock('achados-section-modal');
      }
    }

    renderFilterInputs();
    renderLocations();
    renderRail();
    syncClear();

    if (!focusHandled && target) {
      try { target.focus(); } catch (_) { }
    }
    state.lastTrigger = null;
  }

  function queue() {
    if (state.queued) return;
    state.queued = true;
    (window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); })(function () {
      state.queued = false;
      renderFilterInputs();
      renderLocations();
      renderRail();
      renderActions();
      syncClear();
    });
  }

  function apply() {
    syncUrlState();
    refreshFeed();
    if (window.kcFilters && typeof window.kcFilters.apply === 'function') window.kcFilters.apply();
    else queue();
  }

  function syncClear() {
    const button = document.querySelector('[data-kc-achados-clear-filters="true"]');
    if (button) button.disabled = state.statuses.size === 0 && state.types.size === 0 && !state.datePreset;
  }

  function syncTabPresetFromAppliedState() {
    if (!window.kcFilters || typeof window.kcFilters.setCategory !== 'function') return;
    let preset = 'todas';
    if (state.statuses.size === 1 && state.types.size === 0) preset = statusTabKey(Array.from(state.statuses)[0]);
    else if (state.statuses.size === 0 && state.types.size === 1) preset = typeTabKey(Array.from(state.types)[0]);
    window.kcFilters.setCategory(preset);
  }

  function resetApplied(clearSearch) {
    state.statuses = new Set();
    state.types = new Set();
    state.location = '';
    state.datePreset = '';
    renderFilterInputs();
    renderLocations();
    if (clearSearch && window.kcFilters && typeof window.kcFilters.setQuery === 'function') {
      window.kcFilters.setQuery('');
    } else if (clearSearch) {
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
    }
    if (clearSearch) syncTabPresetFromAppliedState();
    apply();
  }

  function matchCard(card) {
    const statusKey = normStatus(card.getAttribute('data-kc-lostfound-status') || '');
    const typeKey = normType(card.getAttribute('data-kc-lostfound-type') || '');
    const locationKey = String(card.getAttribute('data-kc-lostfound-location') || '').trim();
    const createdAt = card.getAttribute('data-kc-created-at') || '';

    if (state.statuses.size && !state.statuses.has(statusKey)) return false;
    if (state.types.size && !state.types.has(typeKey)) return false;
    if (state.datePreset) {
      const utils = getFeedFilterUtils();
      if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'achados-perdidos', preset: state.datePreset, createdAt: createdAt })) return false;
    }
    if (state.location && locationKey !== state.location) return false;
    return true;
  }

  function bind() {
    const clear = document.querySelector('[data-kc-achados-clear-filters="true"]');
    if (clear) clear.addEventListener('click', function () {
      if (state.draft && state.activeKey === 'filters' && isMobile()) {
        state.draft.statuses = new Set();
        state.draft.types = new Set();
        state.draft.datePreset = '';
        renderFilterInputs();
        renderActions();
        return;
      }
      state.statuses = new Set();
      state.types = new Set();
      state.datePreset = '';
      syncTabPresetFromAppliedState();
      apply();
    });

    document.querySelectorAll('.kc-feed-tabs a').forEach((tab) => {
      tab.addEventListener('click', function () {
        const category = String(tab.getAttribute('data-category') || tab.getAttribute('href') || '').replace('#', '').trim();
        const status = normStatus(category);
        const type = normType(category);

        if (status === 'perdido' || status === 'encontrado') {
          state.statuses = new Set([status]);
          state.types = new Set();
        } else if (type === 'documento' || type === 'eletronico' || type === 'outro') {
          state.types = new Set([type]);
          state.statuses = new Set();
        } else {
          state.statuses = new Set();
          state.types = new Set();
        }
        renderFilterInputs();
        syncUrlState();
        refreshFeed();
        queue();
      });
    });

    const emptyClear = document.querySelector('#noResults .kc-btn-primary');
    if (emptyClear) {
      emptyClear.addEventListener('click', function (event) {
        event.preventDefault();
        resetApplied(true);
      });
    }

    document.addEventListener('change', function (event) {
      const target = event.target;
      if (!target || !target.matches || !target.matches('[data-kc-achados-filter-kind], [data-kc-achados-date-preset]')) return;
      if (state.draft && state.activeKey === 'filters' && isMobile()) {
        readDraftInputs();
        renderActions();
        return;
      }
      if (state.draft && state.activeKey === 'dates' && isMobile()) {
        state.draft.datePreset = readSelectedDatePreset();
        renderActions();
        return;
      }
      readInputs();
      syncTabPresetFromAppliedState();
      apply();
    });

    document.addEventListener('click', function (event) {
      const applyButton = event.target.closest('[data-kc-achados-modal-apply]');
      if (applyButton) {
        const action = String(applyButton.getAttribute('data-kc-achados-modal-apply') || '').trim();
        if (action === 'filters' && state.draft) {
          state.statuses = cloneSet(state.draft.statuses);
          state.types = cloneSet(state.draft.types);
          state.datePreset = normalizeDatePreset(state.draft.datePreset);
          closeModal();
          syncTabPresetFromAppliedState();
          apply();
          return;
        }
        if (action === 'dates' && state.draft) {
          state.datePreset = normalizeDatePreset(state.draft.datePreset);
          renderDateInputs();
          closeModal();
          apply();
          return;
        }
        if (action === 'locations' && state.draft) {
          state.location = state.draft.location || '';
          closeModal();
          apply();
          return;
        }
        if (action === 'tips') {
          closeModal();
          return;
        }
      }

      const clearDraft = event.target.closest('[data-kc-achados-modal-clear="true"]');
      if (clearDraft && state.draft) {
        state.draft.statuses = new Set();
        state.draft.types = new Set();
        state.draft.datePreset = '';
        renderFilterInputs();
        renderActions();
        return;
      }

      const locationButton = event.target.closest('[data-kc-achados-location]');
      if (locationButton) {
        const selectedKey = String(locationButton.getAttribute('data-kc-achados-location') || '').trim();
        if (state.draft && state.activeKey === 'locations' && isMobile()) {
          state.draft.location = selectedKey;
          renderLocations();
          renderActions();
        } else {
          state.location = selectedKey;
          apply();
        }
        return;
      }

      const sectionButton = event.target.closest('[data-kc-achados-open-section]');
      if (sectionButton && isMobile()) {
        openModal(String(sectionButton.getAttribute('data-kc-achados-open-section') || '').trim(), sectionButton);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });

    window.addEventListener('resize', function () {
      if (!isMobile()) closeModal();
    });
  }

  function wrapApply() {
    if (state.wrapped || !window.kcFilters || typeof window.kcFilters.apply !== 'function') return;
    const original = window.kcFilters.apply;
    window.kcFilters.apply = function () {
      const result = original.apply(this, arguments);
      queue();
      return result;
    };
    state.wrapped = true;
  }

  async function fetchAll() {
    if (state.fetched) return;
    state.fetched = true;
    const collected = [];

    try {
      if (window.KCAPI && typeof window.KCAPI.getPosts === 'function') {
        for (let page = 1; page <= 20; page += 1) {
          const batch = await window.KCAPI.getPosts({ module: 'achados-perdidos', page, limit: 100 });
          if (!Array.isArray(batch) || !batch.length) break;
          collected.push(...batch);
          if (batch.length < 100) break;
        }
      } else if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        const db = await window.KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        collected.push(...posts.filter((post) => norm(post && (post.modulo || post.module)) === 'achados-perdidos'));
      }
    } catch (_) { }

    try {
      if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
        const userPosts = window.kcUserPosts.list();
        if (Array.isArray(userPosts)) collected.push(...userPosts.filter((post) => norm(post && (post.modulo || post.module)) === 'achados-perdidos'));
      }
    } catch (_) { }

    upsert(collected);
    persistCachedPosts(collected);
    queue();
  }

  function initFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    const pending = window.KCControllers.injectFeed({
      module: 'achados-perdidos',
      pageModule: 'achados-perdidos',
      sortBy: sortBy || 'votos',
      getRequestParams: getFeedRequestParams,
      onAfterAppend: function (payload) {
        decorate(payload);
        queue();
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
    collectSections();
    ensureModal();
    wrapApply();
    restoreUrlState();
    bind();
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
      window.kcFilters.setExtraPredicate(function (card) { return matchCard(card); });
    }
    restoreCachedPosts();
    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({ initFeedFn: initFeed });
    } else {
      initFeed();
    }
    fetchAll();
    queue();
  });
})();
