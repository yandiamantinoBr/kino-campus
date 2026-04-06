/* KinoCampus - Moradia Controller (V8.6.0.0) */
(function () {
  'use strict';

  const DEFAULT_REGIONS = [
    { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-university', zoneKey: 'campus-samambaia' },
    { key: 'vila-itatiaia', label: 'Vila Itatiaia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia' },
    { key: 'sao-judas-tadeu', label: 'São Judas Tadeu', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia' },
    { key: 'chacaras-california', label: 'Chácaras Califórnia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia' },
    { key: 'jardim-pompeia', label: 'Jardim Pompéia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia' },
    { key: 'campus-colemar', label: 'Campus Colemar', icon: 'fas fa-university', zoneKey: 'campus-colemar' },
    { key: 'setor-universitario', label: 'Setor Universitário', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar' },
    { key: 'setor-leste-universitario', label: 'Setor Leste Universitário', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar' },
    { key: 'setor-leste-vila-nova', label: 'Setor Leste Vila Nova', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar' },
    { key: 'centro', label: 'Centro', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar' },
  ];

  const DEFAULT_FEATURES = [
    { key: 'aceita-pets', label: 'Aceita pets' },
    { key: 'lgbtqiapn', label: 'LGBTQIAPN+' },
    { key: 'apenas-mulheres', label: 'Apenas mulheres' },
    { key: 'apenas-homens', label: 'Apenas homens' },
    { key: 'mobiliado', label: 'Mobiliado' },
    { key: 'contas-inclusas', label: 'Contas inclusas' },
    { key: 'internet-inclusa', label: 'Internet inclusa' },
    { key: 'banheiro-privativo', label: 'Banheiro privativo' },
    { key: 'vaga-de-garagem', label: 'Vaga de garagem' },
    { key: 'ambiente-familiar', label: 'Ambiente familiar' },
    { key: 'nao-fumantes', label: 'Não fumantes' },
    { key: 'proximo-ao-campus', label: 'Próximo ao campus' },
  ];

  const MODAL_ID = 'kcHousingSectionOverlay';
  const SECTION_CACHE_KEY = 'moradia:index';
  const SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
  const state = {
    features: new Set(),
    region: '',
    datePreset: '',
    priceMin: null,
    priceMax: null,
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
  function sanitizePriceValue(value) {
    if (value == null || value === '') return null;
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  function normalizePriceRange(minPrice, maxPrice) {
    let nextMin = sanitizePriceValue(minPrice);
    let nextMax = sanitizePriceValue(maxPrice);
    if (nextMin != null && nextMax != null && nextMax < nextMin) {
      const swap = nextMin;
      nextMin = nextMax;
      nextMax = swap;
    }
    return { min: nextMin, max: nextMax };
  }
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
      ? utils.getAllowedDatePresets('moradia')
      : ['today', 'last7d', 'last30d'];
  }

  function normalizeDatePreset(value) {
    const utils = getFeedFilterUtils();
    if (utils && typeof utils.normalizeDatePreset === 'function') {
      return utils.normalizeDatePreset('moradia', value);
    }
    const normalized = norm(value);
    const allowed = getAllowedDatePresets();
    return allowed.includes(normalized) ? normalized : '';
  }

  function readSelectedDatePreset() {
    const selected = document.querySelector('[data-kc-housing-date-preset]:checked');
    return normalizeDatePreset(selected ? selected.value : '');
  }

  function renderDateInputs() {
    const selected = (state.draft && state.activeKey === 'dates')
      ? normalizeDatePreset(state.draft.datePreset)
      : normalizeDatePreset(state.datePreset);
    document.querySelectorAll('[data-kc-housing-date-preset]').forEach((input) => {
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

  function normType(value) {
    if (window.KCUtils && typeof window.KCUtils.resolveHousingTypeKey === 'function') {
      return window.KCUtils.resolveHousingTypeKey(value);
    }
    const normalized = norm(value);
    if (normalized.includes('republic')) return 'republica';
    if (normalized.includes('quart') || normalized.includes('suite')) return 'quarto';
    if (normalized.includes('apart') || normalized.includes('kitnet')) return 'apartamento';
    if (normalized.includes('casa')) return 'casa';
    if (normalized.includes('procur')) return 'procurando';
    return normalized;
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
    const selected = normType(selectedCategory);
    if (!selected || selected === 'toda' || selected === 'todas') return true;
    const item = normType(summary.typeKey);
    return !!item && (item.includes(selected) || selected.includes(item));
  }

  function queryMatches(summary, query) {
    const normalizedQuery = norm(query);
    if (!normalizedQuery) return true;
    return String(summary.searchText || '').includes(normalizedQuery);
  }

  function getRegionDefinitions() {
    if (window.KCUtils && typeof window.KCUtils.getHousingRegionDefinitions === 'function') {
      return window.KCUtils.getHousingRegionDefinitions();
    }
    return DEFAULT_REGIONS.slice();
  }

  function getFeatureDefinitions() {
    if (window.KCUtils && typeof window.KCUtils.getHousingFeatureDefinitions === 'function') {
      return window.KCUtils.getHousingFeatureDefinitions();
    }
    return DEFAULT_FEATURES.slice();
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
      ? window.KCUtils.applyPresentationRules(normalized, { pageModule: 'moradia' })
      : normalized;
    if (norm(post && (post.modulo || post.module)) !== 'moradia') return null;

    const housingInfo = (post && post._kcHousingInfo && typeof post._kcHousingInfo === 'object') ? post._kcHousingInfo : {};
    const region = housingInfo.region || ((window.KCUtils && typeof window.KCUtils.resolveHousingRegion === 'function') ? window.KCUtils.resolveHousingRegion(post) : null) || {};
    const featureEntries = Array.isArray(housingInfo.features) && housingInfo.features.length
      ? housingInfo.features
      : ((window.KCUtils && typeof window.KCUtils.resolveHousingFeatures === 'function') ? window.KCUtils.resolveHousingFeatures(post) : []);

    return {
      identity: postId(post),
      typeKey: normType(housingInfo.typeKey || post.categoriaKey || post.categoria),
      regionKey: String(region.key || post.regionKey || '').trim(),
      regionLabel: String(region.label || post.regionLabel || '').trim(),
      regionIcon: String(region.icon || 'fas fa-map-pin').trim(),
      zoneKey: String(region.zoneKey || post.regionZoneKey || '').trim(),
      zoneLabel: String(region.zoneLabel || post.regionZoneLabel || '').trim(),
      featureKeys: featureEntries.map((entry) => String(entry && entry.key || '').trim()).filter(Boolean),
      featureEntries: featureEntries.map((entry) => ({
        key: String(entry && entry.key || '').trim(),
        label: String(entry && entry.label || '').trim(),
        emoji: String(entry && entry.emoji || '').trim(),
        isKnown: !!(entry && entry.isKnown),
      })).filter((entry) => entry.key && entry.label),
      createdAt: post && (post.created_at || post.createdAt || post.timestamp || null),
      priceValue: sanitizePriceValue(post && (post.preco != null ? post.preco : post.price)),
      searchText: norm([
        post && post.titulo,
        post && post.descricao,
        post && post.categoriaLabel,
        post && post.subcategoriaLabel,
        region && region.label,
        region && region.zoneLabel,
        ...(featureEntries || []).map((entry) => entry && entry.label),
        post && post.localizacao,
      ].filter(Boolean).join(' '))
    };
  }

  function syncHistoryCaches() {
    window.__KC_HOUSING_REGION_HISTORY = Array.from(state.posts.values())
      .filter((summary) => summary && summary.regionKey && summary.regionLabel)
      .map((summary) => ({
        key: summary.regionKey,
        label: summary.regionLabel,
        icon: summary.regionIcon || 'fas fa-map-pin',
        zoneKey: summary.zoneKey || '',
        zoneLabel: summary.zoneLabel || '',
      }));

    const features = [];
    state.posts.forEach((summary) => {
      (summary.featureEntries || []).forEach((entry) => {
        features.push({
          key: entry.key,
          label: entry.label,
          emoji: entry.emoji || '',
        });
      });
    });
    window.__KC_HOUSING_FEATURE_HISTORY = features;
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
      if (!card.getAttribute('data-category') && summary.typeKey) card.setAttribute('data-category', summary.typeKey);
      if (!card.getAttribute('data-kc-housing-type') && summary.typeKey) card.setAttribute('data-kc-housing-type', summary.typeKey);
      if (!card.getAttribute('data-kc-housing-region') && summary.regionKey) card.setAttribute('data-kc-housing-region', summary.regionKey);
      if (!card.getAttribute('data-kc-housing-zone') && summary.zoneKey) card.setAttribute('data-kc-housing-zone', summary.zoneKey);
      if (!card.getAttribute('data-kc-housing-features') && summary.featureKeys.length) card.setAttribute('data-kc-housing-features', summary.featureKeys.join(' '));
      if (!card.getAttribute('data-kc-created-at') && summary.createdAt) card.setAttribute('data-kc-created-at', String(summary.createdAt));
      if (!card.getAttribute('data-kc-price') && summary.priceValue != null) card.setAttribute('data-kc-price', String(summary.priceValue));
    });
  }

  function readSelectedFeatureInputs() {
    return Array.from(document.querySelectorAll('[data-kc-housing-filter-kind="feature"]'))
      .filter((input) => input && input.checked)
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function readInputs() {
    state.features = new Set(readSelectedFeatureInputs());
    state.datePreset = readSelectedDatePreset();
    const range = normalizePriceRange(
      document.querySelector('[data-kc-housing-price-min]') && document.querySelector('[data-kc-housing-price-min]').value,
      document.querySelector('[data-kc-housing-price-max]') && document.querySelector('[data-kc-housing-price-max]').value
    );
    state.priceMin = range.min;
    state.priceMax = range.max;
  }

  function readDraftInputs() {
    if (!state.draft) return;
    state.draft.features = new Set(readSelectedFeatureInputs());
    state.draft.datePreset = readSelectedDatePreset();
    const range = normalizePriceRange(
      document.querySelector('[data-kc-housing-price-min]') && document.querySelector('[data-kc-housing-price-min]').value,
      document.querySelector('[data-kc-housing-price-max]') && document.querySelector('[data-kc-housing-price-max]').value
    );
    state.draft.priceMin = range.min;
    state.draft.priceMax = range.max;
  }

  function getFeedRequestParams() {
    const params = {};
    if (state.features.size) params.housingFeatures = Array.from(state.features);
    if (state.region) params.housingRegion = state.region;
    if (state.datePreset) params.datePreset = state.datePreset;
    if (state.priceMin != null) params.priceMin = state.priceMin;
    if (state.priceMax != null) params.priceMax = state.priceMax;
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
    const hasFeatures = !!(params && typeof params.has === 'function' && params.has('housingFeatures'));
    const hasRegion = !!(params && typeof params.has === 'function' && params.has('housingRegion'));
    const hasDatePreset = !!(params && typeof params.has === 'function' && params.has('datePreset'));
    const hasPriceMin = !!(params && typeof params.has === 'function' && params.has('priceMin'));
    const hasPriceMax = !!(params && typeof params.has === 'function' && params.has('priceMax'));
    if (!hasFeatures && !hasRegion && !hasDatePreset && !hasPriceMin && !hasPriceMax) return false;

    if (hasFeatures) {
      state.features = new Set(utils.readListParam(params, 'housingFeatures').map((value) => String(value || '').trim()).filter(Boolean));
    }
    if (hasRegion) {
      state.region = utils.readTextParam(params, 'housingRegion');
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
    const minInput = document.querySelector('[data-kc-housing-price-min]');
    const maxInput = document.querySelector('[data-kc-housing-price-max]');
    if (minInput) minInput.value = state.priceMin != null ? String(state.priceMin) : '';
    if (maxInput) maxInput.value = state.priceMax != null ? String(state.priceMax) : '';
    renderDateInputs();
    return true;
  }

  function syncUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      utils.writeListParam(params, 'housingFeatures', Array.from(state.features));
      utils.writeTextParam(params, 'housingRegion', state.region || '');
      if (typeof utils.writePresetParam === 'function') utils.writePresetParam(params, 'datePreset', state.datePreset, getAllowedDatePresets());
      else utils.writeTextParam(params, 'datePreset', state.datePreset || '');
      utils.writeNumberParam(params, 'priceMin', state.priceMin);
      utils.writeNumberParam(params, 'priceMax', state.priceMax);
    });
  }

  function matchesRegion(summary, regionKey) {
    const selected = String(regionKey || '').trim();
    if (!selected) return true;
    return summary.regionKey === selected || summary.zoneKey === selected;
  }

  function matchesSummary(summary, options) {
    const cfg = options || {};
    const current = filterState();

    if (!categoryMatches(summary, current.category)) return false;
    if (!queryMatches(summary, current.query)) return false;

    if (state.features.size && !cfg.ignoreFeatures) {
      const featureSet = new Set(summary.featureKeys || []);
      const hasAll = Array.from(state.features).every((key) => featureSet.has(key));
      if (!hasAll) return false;
    }

    if (!cfg.ignoreDate && state.datePreset) {
      const utils = getFeedFilterUtils();
      if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'moradia', preset: state.datePreset, createdAt: summary.createdAt })) return false;
    }

    if (!cfg.ignorePrice) {
      if ((state.priceMin != null || state.priceMax != null) && summary.priceValue == null) return false;
      if (state.priceMin != null && summary.priceValue < state.priceMin) return false;
      if (state.priceMax != null && summary.priceValue > state.priceMax) return false;
    }

    if (!cfg.ignoreRegion && !matchesRegion(summary, state.region)) return false;
    return true;
  }

  function getRenderedFeatureSelection() {
    if (state.draft && state.activeKey === 'filters') return cloneSet(state.draft.features);
    return cloneSet(state.features);
  }

  function getRenderedRegionSelection() {
    if (state.draft && state.activeKey === 'regions') return state.draft.region || '';
    return state.region || '';
  }

  function getFeatureCatalog() {
    const official = getFeatureDefinitions();
    const catalog = new Map();

    official.forEach((entry, index) => {
      catalog.set(entry.key, {
        key: entry.key,
        label: entry.label,
        emoji: '',
        isKnown: true,
        order: index,
      });
    });

    state.posts.forEach((summary) => {
      (summary.featureEntries || []).forEach((entry) => {
        if (!entry || !entry.key || catalog.has(entry.key)) return;
        catalog.set(entry.key, {
          key: entry.key,
          label: entry.label,
          emoji: entry.emoji || '\u{1F3F7}\uFE0F',
          isKnown: false,
          order: official.length + catalog.size,
        });
      });
    });

    return Array.from(catalog.values()).sort((left, right) => {
      if (left.isKnown !== right.isKnown) return left.isKnown ? -1 : 1;
      return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR');
    });
  }

  function renderFeatures() {
    const list = document.querySelector('[data-kc-housing-feature-list="true"]');
    if (!list) return;

    const selected = getRenderedFeatureSelection();
    const items = getFeatureCatalog().map((entry) => {
      const checked = selected.has(entry.key);
      const label = entry.isKnown ? entry.label : `${entry.emoji || '\u{1F3F7}\uFE0F'} ${entry.label}`;
      return (
        '<label class="kc-sidebar-check">' +
          '<input data-kc-housing-filter-kind="feature" type="checkbox" value="' + esc(entry.key) + '"' + (checked ? ' checked' : '') + ' />' +
          '<span>' + esc(label) + '</span>' +
        '</label>'
      );
    });

    list.innerHTML = items.join('');
  }

  function getRegionCatalog(countMap) {
    const definitions = getRegionDefinitions();
    const catalog = new Map();

    definitions.forEach((entry, index) => {
      catalog.set(entry.key, {
        key: entry.key,
        label: entry.label,
        icon: entry.icon || 'fas fa-map-pin',
        zoneKey: entry.zoneKey || entry.key,
        isKnown: true,
        order: index,
      });
    });

    state.posts.forEach((summary) => {
      if (!summary.regionKey || catalog.has(summary.regionKey)) return;
      catalog.set(summary.regionKey, {
        key: summary.regionKey,
        label: summary.regionLabel || summary.regionKey,
        icon: summary.regionIcon || 'fas fa-map-pin',
        zoneKey: summary.zoneKey || '',
        isKnown: false,
        order: definitions.length + catalog.size,
      });
    });

    return Array.from(catalog.values()).sort((left, right) => {
      const countDiff = (countMap.get(right.key) || 0) - (countMap.get(left.key) || 0);
      if (countDiff !== 0) return countDiff;
      if (left.isKnown !== right.isKnown) return left.isKnown ? -1 : 1;
      return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR');
    });
  }

  function getRegionLabel(regionKey) {
    if (!regionKey) return 'Todas as regiões';
    const known = getRegionDefinitions().find((entry) => entry.key === regionKey);
    if (known && known.label) return known.label;
    const summary = Array.from(state.posts.values()).find((entry) => entry.regionKey === regionKey || entry.zoneKey === regionKey);
    if (summary) return summary.regionKey === regionKey ? summary.regionLabel : (summary.zoneLabel || regionKey);
    return regionKey;
  }

  function renderRegions() {
    const list = document.querySelector('[data-kc-housing-region-list="true"]');
    if (!list) return;

    const base = Array.from(state.posts.values()).filter((summary) => matchesSummary(summary, { ignoreRegion: true }));
    const counts = new Map();
    base.forEach((summary) => {
      if (summary.zoneKey) counts.set(summary.zoneKey, (counts.get(summary.zoneKey) || 0) + 1);
      if (summary.regionKey && summary.regionKey !== summary.zoneKey) counts.set(summary.regionKey, (counts.get(summary.regionKey) || 0) + 1);
      if (summary.regionKey && !summary.zoneKey) counts.set(summary.regionKey, (counts.get(summary.regionKey) || 0) + 1);
    });

    const active = getRenderedRegionSelection();
    const items = [
      '<button class="kc-category-item ' + (!active ? 'is-active' : '') + '" type="button" data-kc-housing-region="" aria-pressed="' + (!active ? 'true' : 'false') + '">' +
        '<i class="fas fa-layer-group"></i><span>Todas as regiões</span><span class="kc-category-count">' + base.length + '</span>' +
      '</button>'
    ];

    getRegionCatalog(counts).forEach((entry) => {
      const count = counts.get(entry.key) || 0;
      const isActive = active === entry.key;
      const isDisabled = !isActive && count === 0;
      items.push(
        '<button class="kc-category-item ' + (isActive ? 'is-active ' : '') + (isDisabled ? 'is-disabled' : '') + '" type="button" data-kc-housing-region="' + esc(entry.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '"' + (isDisabled ? ' disabled' : '') + '>' +
          '<i class="' + esc(entry.icon || 'fas fa-map-pin') + '"></i>' +
          '<span>' + esc(entry.label) + '</span>' +
          '<span class="kc-category-count">' + count + '</span>' +
        '</button>'
      );
    });

    list.innerHTML = items.join('');
  }

  function collectSections() {
    state.sections = Array.from(document.querySelectorAll('[data-kc-housing-sidebar="true"] .kc-sidebar-section[data-kc-housing-section]')).map((node, index) => {
      const key = String(node.getAttribute('data-kc-housing-section') || ('section-' + index)).trim();
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
    overlay.className = 'kc-modal-overlay kc-housing-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kc-create-modal kc-housing-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcHousingSectionTitle">',
      '  <div class="kc-create-modal__header">',
      '    <h2 id="kcHousingSectionTitle"><i class="fas fa-home"></i><span>Seção</span></h2>',
      '    <button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-housing-close-section-modal="true"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-create-modal__body">',
      '    <div class="kc-housing-section-modal__content" data-kc-housing-section-modal-slot="true"></div>',
      '  </div>',
      '  <div class="kc-housing-section-modal__actions" data-kc-housing-section-modal-actions="true"></div>',
      '</div>'
    ].join('');
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-kc-housing-close-section-modal="true"]')) closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderRail() {
    const rail = document.querySelector('[data-kc-housing-mobile-rail="true"]');
    if (!rail || !state.sections.length) return;
    rail.innerHTML = state.sections.map((section) => (
      '<button class="kc-housing-mobile-rail__button ' + (state.activeKey === section.key ? 'is-active' : '') + '" type="button" data-kc-housing-open-section="' + esc(section.key) + '" aria-pressed="' + (state.activeKey === section.key ? 'true' : 'false') + '">' +
        '<i class="' + esc(section.icon) + '"></i><span>' + esc(section.title) + '</span>' +
      '</button>'
    )).join('');
  }

  function renderActions() {
    const overlay = document.getElementById(MODAL_ID);
    const actions = overlay ? overlay.querySelector('[data-kc-housing-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-housing-section-modal') : null;
    if (!actions || !modal) return;

    if (!state.activeKey) {
      modal.removeAttribute('data-kc-housing-section-view');
      actions.innerHTML = '';
      return;
    }

    modal.setAttribute('data-kc-housing-section-view', state.activeKey);

    if (state.activeKey === 'filters') {
      const draft = state.draft || { features: cloneSet(state.features), region: state.region || '', datePreset: state.datePreset, priceMin: state.priceMin, priceMax: state.priceMax };
      const canClear = draft.features.size > 0 || draft.priceMin != null || draft.priceMax != null || !!normalizeDatePreset(draft.datePreset);
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-housing-modal-clear="true"' + (canClear ? '' : ' disabled') + '>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-housing-modal-apply="filters">Aplicar filtros</button></div>';
      return;
    }

    if (state.activeKey === 'dates') {
      const labels = { '': 'Todas as datas', today: 'Hoje', last7d: 'Últimos 7 dias', last30d: 'Últimos 30 dias' };
      const selectedLabel = labels[(state.draft && typeof state.draft.datePreset === 'string') ? state.draft.datePreset : state.datePreset] || 'Todas as datas';
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><p class="kc-housing-section-modal__caption">Data selecionada: <strong>' + esc(selectedLabel) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-housing-modal-apply="dates">Ver moradias</button></div>';
      return;
    }

    if (state.activeKey === 'regions') {
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><p class="kc-housing-section-modal__caption">Região selecionada: <strong>' + esc(getRegionLabel((state.draft && state.draft.region) || '')) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-housing-modal-apply="regions">Ver moradias</button></div>';
      return;
    }

    actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-housing-modal-apply="tips">Entendido!</button></div>';
  }

  function openModal(key, trigger) {
    const section = state.sections.find((entry) => entry.key === key);
    if (!section || !section.node) return;
    const overlay = ensureModal();
    const slot = overlay.querySelector('[data-kc-housing-section-modal-slot="true"]');
    const title = overlay.querySelector('#kcHousingSectionTitle span');
    const titleIcon = overlay.querySelector('#kcHousingSectionTitle i');
    if (!slot || !title || !titleIcon) return;

    closeModal();

    const placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-housing-section-placeholder', section.key);
    section.node.parentNode.insertBefore(placeholder, section.node);
    slot.innerHTML = '';
    slot.appendChild(section.node);

    state.activeKey = section.key;
    state.activeNode = section.node;
    state.activePlaceholder = placeholder;
    state.lastTrigger = trigger || null;
    state.draft = {
      features: cloneSet(state.features),
      region: state.region || '',
      datePreset: state.datePreset,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
    };

    title.textContent = section.title;
    titleIcon.className = section.icon || 'fas fa-home';
    const minInput = document.querySelector('[data-kc-housing-price-min]');
    const maxInput = document.querySelector('[data-kc-housing-price-max]');
    if (minInput) minInput.value = state.draft.priceMin != null ? String(state.draft.priceMin) : '';
    if (maxInput) maxInput.value = state.draft.priceMax != null ? String(state.draft.priceMax) : '';
    renderFeatures();
    renderDateInputs();
    renderRegions();
    renderActions();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('housing-section-modal');
    }
    renderRail();

    const closeBtn = overlay.querySelector('[data-kc-housing-close-section-modal="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    const slot = overlay ? overlay.querySelector('[data-kc-housing-section-modal-slot="true"]') : null;
    const actions = overlay ? overlay.querySelector('[data-kc-housing-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-housing-section-modal') : null;
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
    if (modal) modal.removeAttribute('data-kc-housing-section-view');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) {
      document.body.classList.remove('kc-modal-open');
      if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
        window.KCOverlayLock.unlock('housing-section-modal');
      }
    }

    const minInput = document.querySelector('[data-kc-housing-price-min]');
    const maxInput = document.querySelector('[data-kc-housing-price-max]');
    if (minInput) minInput.value = state.priceMin != null ? String(state.priceMin) : '';
    if (maxInput) maxInput.value = state.priceMax != null ? String(state.priceMax) : '';

    renderFeatures();
    renderDateInputs();
    renderRegions();
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
      renderFeatures();
      renderDateInputs();
      renderRegions();
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
    const button = document.querySelector('[data-kc-housing-clear-filters="true"]');
    if (button) button.disabled = state.features.size === 0 && !state.region && !state.datePreset && state.priceMin == null && state.priceMax == null;
  }

  function resetApplied(clearSearch) {
    state.features = new Set();
    state.region = '';
    state.datePreset = '';
    state.priceMin = null;
    state.priceMax = null;
    renderFeatures();
    renderDateInputs();
    renderRegions();
    const minInput = document.querySelector('[data-kc-housing-price-min]');
    const maxInput = document.querySelector('[data-kc-housing-price-max]');
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';
    if (clearSearch && window.kcFilters && typeof window.kcFilters.setQuery === 'function') {
      window.kcFilters.setQuery('');
    } else if (clearSearch) {
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
    }
    if (clearSearch && window.kcFilters && typeof window.kcFilters.setCategory === 'function') {
      window.kcFilters.setCategory('todas');
    }
    apply();
  }

  function matchCard(card) {
    const regionKey = String(card.getAttribute('data-kc-housing-region') || '').trim();
    const zoneKey = String(card.getAttribute('data-kc-housing-zone') || '').trim();
    const featureKeys = String(card.getAttribute('data-kc-housing-features') || '').split(/\s+/).map((value) => value.trim()).filter(Boolean);
    const createdAt = card.getAttribute('data-kc-created-at') || '';
    const priceValue = sanitizePriceValue(card.getAttribute('data-kc-price'));

    if (state.features.size) {
      const featureSet = new Set(featureKeys);
      const hasAll = Array.from(state.features).every((key) => featureSet.has(key));
      if (!hasAll) return false;
    }
    if (state.datePreset) {
      const utils = getFeedFilterUtils();
      if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'moradia', preset: state.datePreset, createdAt: createdAt })) return false;
    }
    if (state.priceMin != null && (priceValue == null || priceValue < state.priceMin)) return false;
    if (state.priceMax != null && (priceValue == null || priceValue > state.priceMax)) return false;
    if (state.region && !(regionKey === state.region || zoneKey === state.region)) return false;
    return true;
  }

  function bind() {
    const clear = document.querySelector('[data-kc-housing-clear-filters="true"]');
    if (clear) clear.addEventListener('click', function () {
      if (state.draft && state.activeKey === 'filters' && isMobile()) {
        state.draft.features = new Set();
        state.draft.datePreset = '';
        state.draft.priceMin = null;
        state.draft.priceMax = null;
        const minInput = document.querySelector('[data-kc-housing-price-min]');
        const maxInput = document.querySelector('[data-kc-housing-price-max]');
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        renderFeatures();
        renderDateInputs();
        renderActions();
        return;
      }
      state.features = new Set();
      state.datePreset = '';
      state.priceMin = null;
      state.priceMax = null;
      const minInput = document.querySelector('[data-kc-housing-price-min]');
      const maxInput = document.querySelector('[data-kc-housing-price-max]');
      if (minInput) minInput.value = '';
      if (maxInput) maxInput.value = '';
      renderDateInputs();
      apply();
    });

    document.querySelectorAll('.kc-feed-tabs a').forEach((tab) => {
      tab.addEventListener('click', function () {
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
      if (!target || !target.matches) return;
      if (!target.matches('[data-kc-housing-filter-kind="feature"], [data-kc-housing-price-min], [data-kc-housing-price-max], [data-kc-housing-date-preset]')) return;
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
      apply();
    });

    document.addEventListener('click', function (event) {
      const applyButton = event.target.closest('[data-kc-housing-modal-apply]');
      if (applyButton) {
        const action = String(applyButton.getAttribute('data-kc-housing-modal-apply') || '').trim();
        if (action === 'filters' && state.draft) {
          state.features = cloneSet(state.draft.features);
          state.datePreset = normalizeDatePreset(state.draft.datePreset);
          state.priceMin = state.draft.priceMin != null ? state.draft.priceMin : null;
          state.priceMax = state.draft.priceMax != null ? state.draft.priceMax : null;
          const minInput = document.querySelector('[data-kc-housing-price-min]');
          const maxInput = document.querySelector('[data-kc-housing-price-max]');
          if (minInput) minInput.value = state.priceMin != null ? String(state.priceMin) : '';
          if (maxInput) maxInput.value = state.priceMax != null ? String(state.priceMax) : '';
          renderFeatures();
          renderDateInputs();
          closeModal();
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
        if (action === 'regions' && state.draft) {
          state.region = state.draft.region || '';
          closeModal();
          apply();
          return;
        }
        if (action === 'tips') {
          closeModal();
          return;
        }
      }

      const clearDraft = event.target.closest('[data-kc-housing-modal-clear="true"]');
      if (clearDraft && state.draft) {
        state.draft.features = new Set();
        state.draft.datePreset = '';
        state.draft.priceMin = null;
        state.draft.priceMax = null;
        const minInput = document.querySelector('[data-kc-housing-price-min]');
        const maxInput = document.querySelector('[data-kc-housing-price-max]');
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        renderFeatures();
        renderDateInputs();
        renderActions();
        return;
      }

      const regionButton = event.target.closest('[data-kc-housing-region]');
      if (regionButton) {
        const selectedKey = String(regionButton.getAttribute('data-kc-housing-region') || '').trim();
        if (state.draft && state.activeKey === 'regions' && isMobile()) {
          state.draft.region = selectedKey;
          renderRegions();
          renderActions();
        } else {
          state.region = selectedKey;
          apply();
        }
        return;
      }

      const sectionButton = event.target.closest('[data-kc-housing-open-section]');
      if (sectionButton && isMobile()) {
        openModal(String(sectionButton.getAttribute('data-kc-housing-open-section') || '').trim(), sectionButton);
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
          const batch = await window.KCAPI.getPosts({ module: 'moradia', page, limit: 100 });
          if (!Array.isArray(batch) || !batch.length) break;
          collected.push(...batch);
          if (batch.length < 100) break;
        }
      } else if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        const db = await window.KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        collected.push(...posts.filter((post) => norm(post && (post.modulo || post.module)) === 'moradia'));
      }
    } catch (_) { }

    try {
      if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
        const userPosts = window.kcUserPosts.list();
        if (Array.isArray(userPosts)) collected.push(...userPosts.filter((post) => norm(post && (post.modulo || post.module)) === 'moradia'));
      }
    } catch (_) { }

    upsert(collected);
    persistCachedPosts(collected);
    queue();
  }

  function initFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    const pending = window.KCControllers.injectFeed({
      module: 'moradia',
      pageModule: 'moradia',
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
