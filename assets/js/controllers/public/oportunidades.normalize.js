/* KinoCampus - oportunidades.normalize.js (v13.7.1) */
/* Funções puras e normalizadores extraídos de oportunidades.controller.js. */
/* Este arquivo deve ser carregado ANTES de oportunidades.controller.js.   */

var DEFAULT_AREAS = [
  { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
  { key: 'marketing', label: 'Marketing', icon: 'fas fa-bullhorn' },
  { key: 'design', label: 'Design', icon: 'fas fa-palette' },
  { key: 'educacao', label: 'Educação', icon: 'fas fa-graduation-cap' },
  { key: 'musica', label: 'Música', icon: 'fas fa-music' },
];

// ── Utilitários ──────────────────────────────────────────────────────────────

function normalizeText(value) {
  if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
    return window.KCUtils.normalizeText(value);
  }
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

// ── Store / filter utils ─────────────────────────────────────────────────────

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
    ? utils.getAllowedDatePresets('oportunidades')
    : ['today', 'last7d', 'last30d'];
}

function normalizeDatePreset(value) {
  const utils = getFeedFilterUtils();
  if (utils && typeof utils.normalizeDatePreset === 'function') {
    return utils.normalizeDatePreset('oportunidades', value);
  }
  const normalized = normalizeText(value);
  const allowed = getAllowedDatePresets();
  return allowed.includes(normalized) ? normalized : '';
}

function readSelectedDatePreset() {
  const selected = document.querySelector('[data-kc-opp-date-preset]:checked');
  return normalizeDatePreset(selected ? selected.value : '');
}

function persistCachedPosts(posts) {
  const store = getSessionStore();
  if (!store || typeof store.set !== 'function') return;
  store.set('feed-index', 'oportunidades:index', {
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

// ── Normalização de post ──────────────────────────────────────────────────────

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
  const directRaw = normalizeText(value);
  const directText = directRaw + ' ' + direct;
  if (directText.includes('edital') || directText.includes('editai') || directText.includes('chamada')) return 'edital';
  if (directText.includes('concurso') || directText.includes('processo seletivo') || directText.includes('selecao')) return 'concurso';
  if (directText.includes('bolsa') || directText.includes('auxilio') || directText.includes('fomento')) return 'bolsa';
  if (directText.includes('curso') || directText.includes('capacit') || directText.includes('qualific') || directText.includes('formacao')) return 'curso-capacitacao';
  if (direct.includes('estag')) return 'estagio';
  if (direct.includes('empreg')) return 'emprego';
  if (direct.includes('freela') || direct.includes('freelancer')) return 'freelancer';
  if (direct.includes('monitor')) return 'monitoria';
  if (direct.includes('pesquis') || direct.includes('pibic') || direct.includes('pivic')) return 'pesquisa';
  if (direct.includes('volunt')) return 'voluntariado';

  const haystack = normalizeText(sourceText);
  if (haystack.includes('edital') || haystack.includes('editai') || haystack.includes('chamada publica') || haystack.includes('chamada pública')) return 'edital';
  if (haystack.includes('concurso') || haystack.includes('processo seletivo') || haystack.includes('selecao')) return 'concurso';
  if (haystack.includes('bolsa') || haystack.includes('auxilio') || haystack.includes('fomento')) return 'bolsa';
  if (haystack.includes('curso') || haystack.includes('capacit') || haystack.includes('qualific') || haystack.includes('formacao')) return 'curso-capacitacao';
  if (haystack.includes('freelancer') || haystack.includes('freela')) return 'freelancer';
  if (haystack.includes('monitoria') || haystack.includes('monitor ')) return 'monitoria';
  if (haystack.includes('pesquisa') || haystack.includes('pibic') || haystack.includes('pivic') || haystack.includes('iniciacao cientifica')) return 'pesquisa';
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
    createdAt: post && (post.created_at || post.createdAt || post.timestamp || null),
    priceValue: sanitizePriceValue(post && (post.preco != null ? post.preco : post.price)),
    searchText: normalizeText(aggregateText),
  };
}

// ── Card dataset ──────────────────────────────────────────────────────────────

function applyCardDataset(card, summary) {
  if (!card || !summary) return;
  card.setAttribute('data-kc-opp-type', summary.type || '');
  card.setAttribute('data-kc-opp-area', summary.areaKey || '');
  card.setAttribute('data-kc-opp-regime', summary.regimeKey || '');
  card.setAttribute('data-kc-opp-work-mode', summary.workModeKey || '');
  card.setAttribute('data-kc-opp-remote', String(!!summary.isRemote));
  card.setAttribute('data-kc-opp-presencial', String(!!summary.isPresential));
  if (summary.createdAt) card.setAttribute('data-kc-created-at', String(summary.createdAt));
  if (summary.priceValue != null) card.setAttribute('data-kc-price', String(summary.priceValue));
}

function getSelectedInputs(kind) {
  return Array.from(document.querySelectorAll('[data-kc-opp-filter-kind="' + kind + '"]'))
    .filter((input) => input && input.checked)
    .map((input) => String(input.value || '').trim())
    .filter(Boolean);
}

function syncFilterInputs(typeFilters, modeFilters, priceMin, priceMax, datePreset) {
  const types = typeFilters || new Set();
  const modes = modeFilters || new Set();

  document.querySelectorAll('[data-kc-opp-filter-kind="type"]').forEach((input) => {
    input.checked = types.has(String(input.value || '').trim());
  });

  document.querySelectorAll('[data-kc-opp-filter-kind="mode"]').forEach((input) => {
    input.checked = modes.has(String(input.value || '').trim());
  });

  const minInput = document.querySelector('[data-kc-opp-price-min]');
  const maxInput = document.querySelector('[data-kc-opp-price-max]');
  if (minInput) minInput.value = priceMin != null ? String(priceMin) : '';
  if (maxInput) maxInput.value = priceMax != null ? String(priceMax) : '';
  const selectedPreset = normalizeDatePreset(datePreset);
  document.querySelectorAll('[data-kc-opp-date-preset]').forEach((input) => {
    input.checked = normalizeDatePreset(input.value) === selectedPreset;
  });
}

// ── Filter matching ───────────────────────────────────────────────────────────

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

function categoryMatches(summary, selectedCategory) {
  const selected = normalizeOpportunityType(selectedCategory, selectedCategory);
  if (!selected || selected === 'toda' || selected === 'todas') return true;
  const item = normalizeOpportunityType(summary.type, summary.type);
  if (!item) return false;
  return item.includes(selected) || selected.includes(item);
}

function queryMatches(summary, query) {
  const normalized = normalizeText(query);
  if (!normalized) return true;
  if (window.KCSearchShared && typeof window.KCSearchShared.matchesQueryText === 'function') {
    return window.KCSearchShared.matchesQueryText(summary.searchText || '', normalized);
  }
  return String(summary.searchText || '').includes(normalized);
}

// ── State-refactored: aceitam stateRef em vez de closure ─────────────────────

function matchesSummary(summary, options, stateRef) {
  const s = stateRef || {};
  const cfg = options || {};
  const filterState = getFilterState();

  if (!categoryMatches(summary, filterState.category)) return false;
  if (!queryMatches(summary, filterState.query)) return false;

  const selectedTypeFilters = s.selectedTypeFilters || new Set();
  const selectedModeFilters = s.selectedModeFilters || new Set();

  if (selectedTypeFilters.size && !cfg.ignoreType) {
    let typeMatches = false;
    selectedTypeFilters.forEach((filterKey) => {
      if (isTypeMatch(filterKey, summary.type, summary.regimeKey)) typeMatches = true;
    });
    if (!typeMatches) return false;
  }

  if (selectedModeFilters.size && !cfg.ignoreMode) {
    let modeMatches = false;
    selectedModeFilters.forEach((filterKey) => {
      if (isModeMatch(filterKey, summary.workModeKey, summary.isRemote, summary.isPresential)) modeMatches = true;
    });
    if (!modeMatches) return false;
  }

  if (s.selectedArea && !cfg.ignoreArea && summary.areaKey !== s.selectedArea) return false;
  if (!cfg.ignoreDate && s.datePreset) {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'oportunidades', preset: s.datePreset, createdAt: summary.createdAt })) return false;
  }
  if (!cfg.ignorePrice) {
    if ((s.priceMin != null || s.priceMax != null) && summary.priceValue == null) return false;
    if (s.priceMin != null && summary.priceValue < s.priceMin) return false;
    if (s.priceMax != null && summary.priceValue > s.priceMax) return false;
  }
  return true;
}

function cardMatchesSidebarFilters(card, stateRef) {
  const s = stateRef || {};
  const type = String(card.getAttribute('data-kc-opp-type') || '');
  const area = String(card.getAttribute('data-kc-opp-area') || '');
  const regime = String(card.getAttribute('data-kc-opp-regime') || '');
  const workModeKey = String(card.getAttribute('data-kc-opp-work-mode') || '');
  const isRemote = String(card.getAttribute('data-kc-opp-remote') || '').toLowerCase() === 'true';
  const isPresential = String(card.getAttribute('data-kc-opp-presencial') || '').toLowerCase() === 'true';
  const createdAt = card.getAttribute('data-kc-created-at') || '';
  const priceValue = sanitizePriceValue(card.getAttribute('data-kc-price'));
  const selectedTypeFilters = s.selectedTypeFilters || new Set();
  const selectedModeFilters = s.selectedModeFilters || new Set();

  if (selectedTypeFilters.size) {
    let typeMatches = false;
    selectedTypeFilters.forEach((filterKey) => {
      if (isTypeMatch(filterKey, type, regime)) typeMatches = true;
    });
    if (!typeMatches) return false;
  }

  if (selectedModeFilters.size) {
    let modeMatches = false;
    selectedModeFilters.forEach((filterKey) => {
      if (isModeMatch(filterKey, workModeKey, isRemote, isPresential)) modeMatches = true;
    });
    if (!modeMatches) return false;
  }

  if (s.selectedArea && area !== s.selectedArea) return false;
  if (s.datePreset) {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.matchesDatePreset !== 'function' || !utils.matchesDatePreset({ moduleKey: 'oportunidades', preset: s.datePreset, createdAt: createdAt })) return false;
  }
  if (s.priceMin != null && (priceValue == null || priceValue < s.priceMin)) return false;
  if (s.priceMax != null && (priceValue == null || priceValue > s.priceMax)) return false;
  return true;
}

function getAreaCatalog(countMap, stateRef) {
  const s = stateRef || {};
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

  const posts = s.posts || new Map();
  posts.forEach((summary) => {
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
    if (left.isKnown !== right.isKnown) return left.isKnown ? -1 : 1;
    if (left.isKnown && right.isKnown && left.order !== right.order) return left.order - right.order;
    return String(left.label || '').localeCompare(String(right.label || ''), 'pt-BR');
  });
}

function getRenderedAreaSelection(stateRef) {
  const s = stateRef || {};
  if (s.modalDraft && s.activeSectionKey === 'areas') {
    return s.modalDraft.area || '';
  }
  return s.selectedArea || '';
}

function getAreaLabel(areaKey, stateRef) {
  const s = stateRef || {};
  if (!areaKey) return 'Todas as áreas';
  const known = getAreaDefinitions().find((entry) => entry.key === areaKey);
  if (known && known.label) return known.label;
  const posts = s.posts || new Map();
  const summary = Array.from(posts.values()).find((entry) => entry.areaKey === areaKey);
  return summary && summary.areaLabel ? summary.areaLabel : areaKey;
}

function syncClearButtonState(stateRef) {
  const s = stateRef || {};
  const clearButton = document.querySelector('[data-kc-opp-clear-filters="true"]');
  if (!clearButton) return;
  const hasFilters = hasTypeModeSelection(s.selectedTypeFilters, s.selectedModeFilters)
    || !!s.selectedArea
    || !!s.datePreset
    || s.priceMin != null
    || s.priceMax != null;
  clearButton.disabled = !hasFilters;
}

function renderMobileRail(stateRef) {
  const s = stateRef || {};
  const rail = document.querySelector('[data-kc-opp-mobile-rail="true"]');
  if (!rail) return;

  const sections = (s.sections || []).slice();
  if (!sections.length) return;

  rail.innerHTML = sections.map((section) => {
    const isActive = s.activeSectionKey === section.key;
    return (
      '<button class="kc-opportunity-mobile-rail__button ' + (isActive ? 'is-active' : '') + '" type="button" data-kc-opp-open-section="' + escapeHtml(section.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' +
        '<i class="' + escapeHtml(section.icon || 'fas fa-layer-group') + '"></i>' +
        '<span>' + escapeHtml(section.title) + '</span>' +
      '</button>'
    );
  }).join('');
}

// ── Namespace público (opcional — para testes) ────────────────────────────────

window._KCOpNormalize = Object.freeze({
  normalizeText: normalizeText,
  canonicalCategory: canonicalCategory,
  escapeHtml: escapeHtml,
  cloneSet: cloneSet,
  sanitizePriceValue: sanitizePriceValue,
  normalizePriceRange: normalizePriceRange,
  isMobileViewport: isMobileViewport,
  getSessionStore: getSessionStore,
  getFeedFilterUtils: getFeedFilterUtils,
  getAllowedDatePresets: getAllowedDatePresets,
  normalizeDatePreset: normalizeDatePreset,
  readSelectedDatePreset: readSelectedDatePreset,
  persistCachedPosts: persistCachedPosts,
  getFilterState: getFilterState,
  getAreaDefinitions: getAreaDefinitions,
  getPostIdentity: getPostIdentity,
  normalizeOpportunityType: normalizeOpportunityType,
  resolveWorkModeValue: resolveWorkModeValue,
  resolveWorkMode: resolveWorkMode,
  resolveEmploymentTypeValue: resolveEmploymentTypeValue,
  resolveEmploymentType: resolveEmploymentType,
  resolveArea: resolveArea,
  summarizePost: summarizePost,
  applyCardDataset: applyCardDataset,
  getSelectedInputs: getSelectedInputs,
  syncFilterInputs: syncFilterInputs,
  hasTypeModeSelection: hasTypeModeSelection,
  isTypeMatch: isTypeMatch,
  isModeMatch: isModeMatch,
  categoryMatches: categoryMatches,
  queryMatches: queryMatches,
  matchesSummary: matchesSummary,
  cardMatchesSidebarFilters: cardMatchesSidebarFilters,
  getAreaCatalog: getAreaCatalog,
  getRenderedAreaSelection: getRenderedAreaSelection,
  getAreaLabel: getAreaLabel,
  syncClearButtonState: syncClearButtonState,
  renderMobileRail: renderMobileRail,
});
