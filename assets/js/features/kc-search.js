/**
 * KinoCampus - Sistema de Busca Global
 * Busca local/offline-first, pagina de resultados e analytics de buscas.
 */

(function () {
  'use strict';

  const KCUtils = (typeof window !== 'undefined' && window.KCUtils) ? window.KCUtils : null;
  const KCAPI = (typeof window !== 'undefined' && window.KCAPI) ? window.KCAPI : null;
  const KCSearchAnalytics = (typeof window !== 'undefined' && window.KCSearchAnalytics) ? window.KCSearchAnalytics : null;

  const DB_FALLBACK_URL = 'data/database.json';
  const TRACK_BATCH_SIZE = 12;
  const TRACKED_TERM_MAX_LENGTH = 160;
  const SENSITIVE_SEARCH_TERM_RE = /(?:[\w.%+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[^a-z0-9_-]|$)|(?:access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)\s*[:=]|[A-Za-z0-9_-]{32,})/i;
  const SEARCH_SCRIPT_SRC = (document.currentScript && document.currentScript.src)
    ? String(document.currentScript.src)
    : '';
  const STRUCTURED_SEARCH_ASSETS = [
    { file: 'kc-search-registry.generated.js', global: 'KCSearchFieldRegistrySnapshot' },
    { file: 'kc-search-fields.shared.js', global: 'KCSearchFieldRegistry' },
    { file: 'kc-search-query-parser.shared.js', global: 'KCSearchQueryParser' },
    { file: 'kc-search-shadow-pipeline.shared.js', global: 'KCSearchShadowPipeline' }
  ];
  const PERSONALIZATION_PREFERENCES_ASSET =
    { file: 'kc-search-preferences.shared.js', global: 'KCSearchPreferences' };
  const PERSONALIZATION_ASSETS = [
    { file: 'kc-search-registry.generated.js', global: 'KCSearchFieldRegistrySnapshot' },
    { file: 'kc-search-affinity.shared.js', global: 'KCSearchAffinity' }
  ];

  let kcDbPosts = null;
  let dropdownDebounceTimer = null;
  let searchFlushTimer = null;
  let searchResultsRequestSeq = 0;
  let dropdownRequestSeq = 0;
  let searchResultsRequest = null;
  let dropdownRequest = null;
  let dropdownActiveIndex = -1;
  let dropdownRenderSeq = 0;
  let structuredSearchRuntimePromise = null;
  let searchPersonalizationRuntimePromise = null;
  let structuredDismissalQuery = '';
  let structuredDismissedSignals = new Set();
  let lastStructuredResultsView = null;
  let lastRenderedSearchResults = new Map();
  let searchPersonalizationContextQuery = '';
  let searchPersonalizationSuppressed = false;
  const structuredAssetPromises = {};
  const comboboxInputs = new Set();
  const searchPerformanceSamples = [];

  const SEARCH_RESULTS_LIMIT = 120;
  const SEARCH_PERFORMANCE_SAMPLE_LIMIT = 40;
  const SEARCH_DROPDOWN_ID = 'kcSearchDropdown';
  const SEARCH_DROPDOWN_LIST_ID = 'kcSearchDropdownList';
  const SEARCH_RESULTS_MODULES = [
    { key: '', label: 'Todos' },
    { key: 'eventos', label: 'Eventos' },
    { key: 'oportunidades', label: 'Oportunidades' },
    { key: 'moradia', label: 'Moradia' },
    { key: 'compra-venda', label: 'Compra e venda' },
    { key: 'caronas', label: 'Caronas' },
    { key: 'achados-perdidos', label: 'Achados/Perdidos' }
  ];
  const STRUCTURED_FILTER_LABELS = Object.freeze({
    area: 'Área', areaText: 'Área informada', category: 'Categoria', condition: 'Condição',
    destination: 'Destino', employmentType: 'Vínculo', dayOfMonth: 'Dia do mês',
    features: 'Características', free: 'Gratuito', housingType: 'Tipo de moradia',
    itemType: 'Tipo de item', locationAlias: 'Local', locationText: 'Local informado',
    origin: 'Origem', price: 'Preço', priceMax: 'Preço máximo', region: 'Região',
    relativeDate: 'Data relativa', registrationStatus: 'Inscrições', rewardMin: 'Recompensa',
    seatsMin: 'Vagas mínimas', time: 'Horário',
    timePeriod: 'Período', weekday: 'Dia da semana', workMode: 'Modalidade'
  });
  const STRUCTURED_VALUE_LABELS = Object.freeze({
    remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial', clt: 'CLT',
    tecnologia: 'Tecnologia', usado: 'Usado', 'semi-novo': 'Seminovo', novo: 'Novo',
    night: 'Noturno', saturday: 'Sábado', sunday: 'Domingo', monday: 'Segunda-feira',
    tuesday: 'Terça-feira', wednesday: 'Quarta-feira', thursday: 'Quinta-feira',
    friday: 'Sexta-feira', 'campus-samambaia': 'Câmpus Samambaia', centro: 'Centro',
    'setor-universitario': 'Setor Universitário', 'aceita-pets': 'Aceita pets',
    mobiliado: 'Mobiliado', documentos: 'Documentos', eletronicos: 'Eletrônicos',
    livros: 'Livros', ingressos: 'Ingressos', estagios: 'Estágios', empregos: 'Empregos',
    editais: 'Editais', concursos: 'Concursos', bolsas: 'Bolsas', 'cursos-capacitacoes': 'Cursos e capacitações',
    academicos: 'Acadêmicos', palestras: 'Palestras', congressos: 'Congressos', cursos: 'Cursos', workshops: 'Workshops', encontrados: 'Encontrados',
    perdidos: 'Perdidos', compro: 'Compra', vendo: 'Venda', procuro: 'Procura',
    ofereco: 'Oferta', procurando: 'Procura', oferta: 'Oferta'
  });

  const MEMORY_STORAGE = (function () {
    const state = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
      },
      setItem(key, value) {
        state[key] = String(value);
      },
      removeItem(key) {
        delete state[key];
      }
    };
  })();

  function performanceNow() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
  }

  function recordSearchPerformance(request, outcome, resultCount) {
    if (!request || request.finished) return;
    request.finished = true;
    searchPerformanceSamples.push(Object.freeze({
      surface: request.surface,
      durationMs: Math.max(0, Math.round((performanceNow() - request.startedAt) * 100) / 100),
      outcome: String(outcome || 'ok'),
      resultCount: Math.max(0, Math.min(120, Number(resultCount) || 0))
    }));
    if (searchPerformanceSamples.length > SEARCH_PERFORMANCE_SAMPLE_LIMIT) {
      searchPerformanceSamples.splice(0, searchPerformanceSamples.length - SEARCH_PERFORMANCE_SAMPLE_LIMIT);
    }
  }

  function getSearchPerformanceSnapshot() {
    const snapshot = {};
    ['dropdown', 'results'].forEach((surface) => {
      const samples = searchPerformanceSamples.filter((sample) => sample.surface === surface);
      const completed = samples.filter((sample) => sample.outcome === 'ok');
      const durations = completed.map((sample) => sample.durationMs);
      snapshot[surface] = Object.freeze({
        count: samples.length,
        completed: completed.length,
        aborted: samples.filter((sample) => sample.outcome === 'aborted').length,
        stale: samples.filter((sample) => sample.outcome === 'stale').length,
        errors: samples.filter((sample) => sample.outcome === 'error').length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maxMs: durations.length ? Math.max.apply(null, durations) : 0
      });
    });
    return Object.freeze(snapshot);
  }

  function cancelSearchRequest(surface) {
    const request = surface === 'dropdown' ? dropdownRequest : searchResultsRequest;
    if (!request || request.finished) return;
    if (request.controller) request.controller.abort();
    recordSearchPerformance(request, 'aborted', 0);
  }

  function startSearchRequest(surface) {
    cancelSearchRequest(surface);
    const controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    const request = {
      surface,
      seq: surface === 'dropdown' ? ++dropdownRequestSeq : ++searchResultsRequestSeq,
      controller,
      signal: controller ? controller.signal : null,
      startedAt: performanceNow(),
      finished: false
    };
    if (surface === 'dropdown') dropdownRequest = request;
    else searchResultsRequest = request;
    return request;
  }

  function isCurrentSearchRequest(request) {
    if (!request || (request.signal && request.signal.aborted)) return false;
    return request.surface === 'dropdown'
      ? dropdownRequest === request && request.seq === dropdownRequestSeq
      : searchResultsRequest === request && request.seq === searchResultsRequestSeq;
  }

  function isAbortError(error, request) {
    return !!((request && request.signal && request.signal.aborted) ||
      (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')));
  }

  function throwIfSearchAborted(signal) {
    if (!signal || !signal.aborted) return;
    const error = new Error('KC_SEARCH_ABORTED');
    error.name = 'AbortError';
    throw error;
  }

  function getSearchShared() {
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.searchCollection === 'function') return shared;
    return null;
  }

  function isStructuredSearchRuntimeEnabled() {
    return !!(window.KCFF && typeof window.KCFF.isEnabled === 'function' &&
      window.KCFF.isEnabled('search.structuredRuntime', false));
  }

  function isStructuredSearchPilotEnabled() {
    return !!(window.KCFF && typeof window.KCFF.isEnabled === 'function' &&
      window.KCFF.isEnabled('search.structuredPilot', false));
  }

  function isSearchPersonalizationEnabled() {
    return !!(window.KCFF && typeof window.KCFF.isEnabled === 'function' &&
      window.KCFF.isEnabled('search.personalization', true));
  }

  function resolveStructuredSearchAsset(file) {
    let src = `/assets/js/shared/${file}`;
    if (SEARCH_SCRIPT_SRC) {
      try { src = new URL(`../shared/${file}`, SEARCH_SCRIPT_SRC).toString(); } catch (_) {}
    }
    const version = String((window.KC_ENV && (window.KC_ENV.version || window.KC_ENV.APP_VERSION)) || '').trim();
    if (version && !/[?&]v=/.test(src)) {
      src += `${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
    }
    return src;
  }

  function loadStructuredSearchAsset(asset) {
    if (window[asset.global]) return Promise.resolve(window[asset.global]);
    const src = resolveStructuredSearchAsset(asset.file);
    if (structuredAssetPromises[src]) return structuredAssetPromises[src];
    structuredAssetPromises[src] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(() => reject(new Error(`KC_SEARCH_RUNTIME_TIMEOUT:${asset.file}`)), 6000);
      script.src = src;
      script.async = false;
      script.dataset.kcSearchRuntime = asset.file;
      script.onload = function () {
        window.clearTimeout(timer);
        if (window[asset.global]) resolve(window[asset.global]);
        else reject(new Error(`KC_SEARCH_RUNTIME_GLOBAL_MISSING:${asset.global}`));
      };
      script.onerror = function () {
        window.clearTimeout(timer);
        reject(new Error(`KC_SEARCH_RUNTIME_LOAD_FAILED:${asset.file}`));
      };
      (document.head || document.documentElement).appendChild(script);
    });
    return structuredAssetPromises[src];
  }

  function buildStructuredSearchRuntime() {
    const snapshot = window.KCSearchFieldRegistrySnapshot;
    const projector = window.KCSearchFieldRegistry;
    const parser = window.KCSearchQueryParser;
    const pipeline = window.KCSearchShadowPipeline;
    if (!snapshot || !snapshot.registry || !projector || typeof projector.projectCollection !== 'function' ||
        !parser || typeof parser.parse !== 'function' || !pipeline || typeof pipeline.runShadow !== 'function') {
      throw new Error('KC_SEARCH_RUNTIME_CONTRACT_INVALID');
    }
    return Object.freeze({
      snapshotVersion: snapshot.snapshotVersion,
      sourceHash: snapshot.sourceHash,
      registry: snapshot.registry,
      projector,
      parser,
      pipeline
    });
  }

  function loadStructuredSearchRuntime() {
    if (!isStructuredSearchRuntimeEnabled()) return Promise.resolve(null);
    if (structuredSearchRuntimePromise) return structuredSearchRuntimePromise;
    structuredSearchRuntimePromise = STRUCTURED_SEARCH_ASSETS.reduce(
      (promise, asset) => promise.then(() => loadStructuredSearchAsset(asset)),
      Promise.resolve()
    ).then(buildStructuredSearchRuntime).catch((error) => {
      try { console.warn('[KinoCampus] Runtime estruturado indisponível; busca legada preservada.', error); } catch (_) {}
      return null;
    });
    return structuredSearchRuntimePromise;
  }

  function buildSearchPersonalizationRuntime() {
    const preferences = window.KCSearchPreferences;
    const affinity = window.KCSearchAffinity;
    const snapshot = window.KCSearchFieldRegistrySnapshot;
    if (!preferences || typeof preferences.load !== 'function' ||
        !affinity || typeof affinity.rerank !== 'function' ||
        !snapshot || !snapshot.registry) {
      throw new Error('KC_SEARCH_PERSONALIZATION_CONTRACT_INVALID');
    }
    return Object.freeze({ preferences, affinity, registry: snapshot });
  }

  function loadSearchPersonalizationRuntime() {
    if (!isSearchPersonalizationEnabled()) return Promise.resolve(null);
    if (searchPersonalizationRuntimePromise) return searchPersonalizationRuntimePromise;
    searchPersonalizationRuntimePromise = loadStructuredSearchAsset(PERSONALIZATION_PREFERENCES_ASSET)
      .then((preferences) => {
        const state = preferences.load();
        if (!preferences.isPersonalized(state)) return null;
        return PERSONALIZATION_ASSETS.reduce(
          (promise, asset) => promise.then(() => loadStructuredSearchAsset(asset)),
          Promise.resolve()
        ).then(buildSearchPersonalizationRuntime);
      }).catch((error) => {
      try { console.warn('[KinoCampus] Personalização local indisponível; ranking comum preservado.', error); } catch (_) {}
      return null;
    });
    return searchPersonalizationRuntimePromise;
  }

  async function applySearchPersonalization(results, options = {}) {
    const source = Array.isArray(results) ? results : [];
    if (options.disabled === true) return source.slice();
    const runtime = await loadSearchPersonalizationRuntime();
    if (!runtime) return source;
    const preferences = runtime.preferences.load({ registry: runtime.registry });
    if (!runtime.preferences.isPersonalized(preferences)) return source;
    return runtime.affinity.rerank(source, {
      preferences,
      registry: runtime.registry,
      sortBy: options.sortBy || 'relevance'
    });
  }

  function recordSearchResultInteraction(post, source) {
    if (!post || !isSearchPersonalizationEnabled()) return;
    loadSearchPersonalizationRuntime().then((runtime) => {
      if (!runtime) return;
      const preferences = runtime.preferences.load({ registry: runtime.registry });
      runtime.affinity.recordInteraction(post, {
        preferences,
        registry: runtime.registry,
        source,
        automated: !!(window.navigator && window.navigator.webdriver)
      });
    }).catch(() => {});
  }

  function getStructuredPostId(post) {
    return String((post && (post.id || post.uuid || post.legacy_id || post.legacyId)) || '');
  }

  function notifyStructuredPilotState(options, state) {
    if (!options || typeof options.onState !== 'function') return;
    try { options.onState(state); } catch (_) {}
  }

  function formatStructuredNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
  }

  function humanizeStructuredValue(value) {
    const key = String(value == null ? '' : value).trim();
    if (!key) return '';
    if (STRUCTURED_VALUE_LABELS[key]) return STRUCTURED_VALUE_LABELS[key];
    return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 48);
  }

  function formatStructuredFilterLabel(key, value) {
    const base = STRUCTURED_FILTER_LABELS[key] || 'Critério';
    if (key === 'free') return 'Gratuito';
    if (key === 'priceMax') return `Até R$ ${formatStructuredNumber(value)}`;
    if (key === 'price') return `Preço: R$ ${formatStructuredNumber(value)}`;
    if (key === 'rewardMin') return `Recompensa: R$ ${formatStructuredNumber(value)} ou mais`;
    if (key === 'seatsMin') return `${formatStructuredNumber(value)} vaga(s) ou mais`;
    if (key === 'dayOfMonth') return `Dia ${formatStructuredNumber(value)}`;
    if (key === 'time') return `Horário: ${String(value || '').slice(0, 5)}`;
    if (key === 'features') {
      const values = (Array.isArray(value) ? value : [value]).map(humanizeStructuredValue).filter(Boolean);
      return values.length ? `${base}: ${values.join(', ')}` : base;
    }
    if (key === 'areaText' || key === 'locationText') return base;
    const display = humanizeStructuredValue(value);
    return display ? `${base}: ${display}` : base;
  }

  function countIgnoredSignals(ignored) {
    if (!ignored || typeof ignored !== 'object') return 0;
    return Number(ignored.module === true) + Number(ignored.intent === true) +
      (Array.isArray(ignored.filters) ? ignored.filters.length : 0);
  }

  function buildStructuredSearchView(result, parsedPlan, options = {}) {
    const plan = result && result.plan ? result.plan : {};
    const comparison = result && result.comparison ? result.comparison : {};
    const parsedFilters = parsedPlan && parsedPlan.filters && typeof parsedPlan.filters === 'object'
      ? parsedPlan.filters
      : {};
    const chips = [];
    if (plan.module && !options.moduleOverride) {
      chips.push({ signal: 'module', label: `Módulo: ${getModuleLabel(plan.module)}` });
    }
    if (comparison.intentApplied === true && plan.intent) {
      chips.push({ signal: 'intent', label: `Tipo: ${humanizeStructuredValue(plan.intent)}` });
    }
    (Array.isArray(comparison.supportedFilters) ? comparison.supportedFilters : []).forEach((key) => {
      chips.push({ signal: `filter:${key}`, label: formatStructuredFilterLabel(key, parsedFilters[key]) });
    });
    const facets = result && result.facets && typeof result.facets === 'object' ? result.facets : {};
    const modules = facets.modules && typeof facets.modules === 'object' ? facets.modules : {};
    return Object.freeze({
      available: true,
      active: chips.length > 0,
      chips: chips.map((chip) => Object.freeze(chip)),
      deferred: (Array.isArray(comparison.deferredFilters) ? comparison.deferredFilters : [])
        .map((key) => STRUCTURED_FILTER_LABELS[key] || 'Critério adicional'),
      dismissedCount: countIgnoredSignals(options.ignoredSignals),
      legacyCount: Array.isArray(result && result.legacy) ? result.legacy.length : 0,
      candidateCount: Array.isArray(result && result.candidate) ? result.candidate.length : 0,
      facets: Object.freeze({ modules: Object.freeze(Object.assign({}, modules)), total: Number(facets.total || 0) })
    });
  }

  async function applyStructuredSearchPilot(query, posts, options = {}) {
    const source = Array.isArray(posts) ? posts : [];
    if (!isStructuredSearchPilotEnabled()) {
      notifyStructuredPilotState(options, Object.freeze({ available: false, active: false, chips: [] }));
      return source;
    }
    const runtime = await loadStructuredSearchRuntime();
    if (!runtime) {
      notifyStructuredPilotState(options, Object.freeze({ available: false, active: false, chips: [] }));
      return source;
    }
    try {
      const parsedPlan = runtime.parser.parse(query, { registry: runtime.registry });
      const result = runtime.pipeline.runShadow(query, source, {
        parser: runtime.parser,
        registry: runtime.registry,
        projector: runtime.projector,
        searchShared: getSearchShared(),
        limit: Math.max(1, Math.min(120, Number(options.limit) || source.length || 1)),
        surface: options.surface === 'dropdown' ? 'dropdown' : 'results',
        hideClosed: options.hideClosed === true,
        ignoredSignals: options.ignoredSignals,
        moduleOverride: options.moduleOverride,
        now: options.now
      });
      const plan = result && result.plan ? result.plan : {};
      const comparison = result && result.comparison ? result.comparison : {};
      const view = buildStructuredSearchView(result, parsedPlan, options);
      notifyStructuredPilotState(options, view);
      const hasStructuredSignal = !!plan.module || comparison.intentApplied === true ||
        (Array.isArray(comparison.supportedFilters) && comparison.supportedFilters.length > 0);
      if (!hasStructuredSignal) return source;

      const byId = new Map(source.map((post) => [getStructuredPostId(post), post]));
      const candidateRows = result && Array.isArray(result.candidate) ? result.candidate : [];
      if (!candidateRows.length) return [];
      const selected = candidateRows.map((row) => {
        const post = byId.get(String(row.id || ''));
        return post ? Object.assign({}, post, { relevanceScore: Number(row.relevanceScore || 0) }) : null;
      }).filter(Boolean);
      if (selected.length === candidateRows.length) return selected;
      notifyStructuredPilotState(options, Object.freeze({ available: false, active: false, chips: [], fallback: true }));
      return source;
    } catch (_) {
      notifyStructuredPilotState(options, Object.freeze({ available: false, active: false, chips: [], fallback: true }));
      try { console.warn('[KinoCampus] Piloto estruturado falhou; resultados legados preservados.'); } catch (_) {}
      return source;
    }
  }

  function hasAnalyticsConsent() {
    if (window.KCConsent && typeof window.KCConsent.hasConsent === 'function') {
      return window.KCConsent.hasConsent('analytics');
    }
    return false;
  }

  function normalizeText(text) {
    if (KCUtils && typeof KCUtils.normalizeText === 'function') return KCUtils.normalizeText(text);
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSearchStorage() {
    try {
      const testKey = '__kc_search_storage_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    } catch (_) {
      return MEMORY_STORAGE;
    }
  }

  function getSearchSessionId(storage) {
    const bag = storage || getSearchStorage();
    if (KCSearchAnalytics && typeof KCSearchAnalytics.ensureSessionId === 'function') {
      return KCSearchAnalytics.ensureSessionId(bag, function () {
        return Math.random().toString(36).slice(2);
      }, Date.now);
    }

    let sid = '';
    try {
      sid = bag.getItem('kc_search_session_id') || '';
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        bag.setItem('kc_search_session_id', sid);
      }
    } catch (_) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return sid;
  }

  function getQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      const value = url.searchParams.get(name);
      return value ? String(value) : '';
    } catch (_) {
      return '';
    }
  }

  function getUserPostsRaw() {
    try {
      const list = window.kcUserPosts && window.kcUserPosts.list ? window.kcUserPosts.list() : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeAnyPost(raw) {
    if (KCAPI && typeof KCAPI.normalizePost === 'function') {
      const normalized = KCAPI.normalizePost(raw);
      if (raw && raw._kcUserPost === true) normalized._kcUserPost = true;
      return normalized;
    }
    return Object.assign({}, raw || {});
  }

  function normalizeUserPost(raw) {
    const base = raw || {};
    const fixed = {
      ...base,
      modulo: base.modulo || 'publicacao',
      titulo: base.titulo || '',
      descricao: base.descricao || '',
      tags: Array.isArray(base.tags) ? base.tags : [],
      emoji: base.emoji || '✨',
      verificado: !!base.verificado,
      votos: base.votos ?? 0,
      comentarios: base.comentarios ?? 0,
      timestamp: base.timestamp || 'Agora',
      autor: base.autor || 'Voce',
      autorAvatar: base.autorAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '')
    };
    fixed._kcUserPost = true;
    return normalizeAnyPost(fixed);
  }

  async function loadDbPosts() {
    if (kcDbPosts) return kcDbPosts;

    try {
      if (KCAPI && typeof KCAPI.getDatabaseNormalized === 'function') {
        const db = await KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        kcDbPosts = posts.map(normalizeAnyPost);
        return kcDbPosts;
      }

      const res = await fetch(DB_FALLBACK_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      const list = Array.isArray(db && db.anuncios) ? db.anuncios : [];
      kcDbPosts = list.map(normalizeAnyPost);
      return kcDbPosts;
    } catch (err) {
      console.error('[KinoCampus] Erro ao carregar database para busca:', err);
      kcDbPosts = [];
      return kcDbPosts;
    }
  }

  async function getAllPosts() {
    const db = await loadDbPosts();
    const user = getUserPostsRaw().map(normalizeUserPost);
    return [...user, ...db];
  }

  function expandSearchTerm(term) {
    const shared = getSearchShared();
    if (shared && typeof shared.expandSynonyms === 'function') {
      return shared.expandSynonyms(term);
    }

    const normalized = normalizeText(term);
    return normalized ? [normalized] : [];
  }

  async function searchPosts(query, options = {}) {
    const q = String(query || '').trim();
    if (!q) return [];

    throwIfSearchAborted(options.signal);
    const all = await getAllPosts();
    throwIfSearchAborted(options.signal);
    const searchShared = getSearchShared();
    if (searchShared) {
      return searchShared.searchCollection(all, {
        q,
        module: options.module || options.modulo || null,
        category: options.category || options.categoria || null,
        subcategory: options.subcategory || options.subcategoria || null,
        limit: options.limit != null ? options.limit : 50,
        minScore: options.minScore != null ? options.minScore : 0.3,
        publicOnly: options.publicOnly === true,
        hideClosed: options.hideClosed === true,
        hideEnded: options.hideEnded === true,
        sortBy: options.sortBy || options.sort_by || 'relevance'
      });
    }

    return [];
  }

  function filterCurrentPageCards(query) {
    const cards = document.querySelectorAll('.kc-card');
    const q = String(query || '').trim();
    const normalizedQuery = normalizeText(q);
    const searchShared = getSearchShared();
    const expandedTerms = q
      ? ((searchShared && typeof searchShared.expandQueryTerms === 'function')
        ? searchShared.expandQueryTerms(normalizedQuery)
        : expandSearchTerm(normalizedQuery))
      : [];

    let visibleCount = 0;

    cards.forEach((card) => {
      const title = card.querySelector('.kc-card__title') ? card.querySelector('.kc-card__title').textContent : '';
      const description = card.querySelector('.kc-card__description-preview') ? card.querySelector('.kc-card__description-preview').textContent : '';
      const categorySource = card.querySelector('.kc-card__category-source') ? card.querySelector('.kc-card__category-source').textContent : '';

      const normalizedTitle = normalizeText(title);
      const normalizedDescription = normalizeText(description);
      const normalizedCategory = normalizeText(categorySource);

      let matches = false;
      if (!q) {
        matches = true;
      } else if (searchShared && typeof searchShared.matchesQueryText === 'function') {
        matches = searchShared.matchesQueryText([title, description, categorySource].join(' '), q, {
          expandedTerms: expandedTerms,
        });
      } else {
        expandedTerms.forEach((term) => {
          if (matches) return;
          if (normalizedTitle.includes(term) || normalizedDescription.includes(term) || normalizedCategory.includes(term)) {
            matches = true;
          }
        });
      }

      card.style.display = matches ? '' : 'none';
      if (matches) visibleCount += 1;
    });

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';

    return visibleCount;
  }

  async function insertTrackedTerms(entries) {
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient() : null;
    if (!client || !entries || !entries.length) return false;

    const storage = getSearchStorage();
    const sessionId = getSearchSessionId(storage);
    const payload = entries
      .map((entry) => String(entry && entry.term || '').replace(/\s+/g, ' ').trim())
      .filter(isTrackableSearchTerm)
      .slice(0, TRACK_BATCH_SIZE)
      .map((term) => ({ term }));

    // Invalid/sensitive legacy queue items are consumed without transmission.
    if (!payload.length) return true;

    try {
      const res = await client.rpc('kc_ingest_search_queries', {
        p_session_id: sessionId,
        p_entries: payload,
      });
      if (res && res.error) return false;
      return !(res && res.data && res.data.ok === false);
    } catch (_) {
      return false;
    }
  }

  async function flushPendingTrackedSearches() {
    if (!hasAnalyticsConsent()) return false;
    if (!KCSearchAnalytics) return false;
    const storage = getSearchStorage();
    const pending = KCSearchAnalytics.consumeQueuedTerms(storage, TRACK_BATCH_SIZE);
    if (!pending.length) return true;

    const ok = await insertTrackedTerms(pending);
    if (ok) {
      KCSearchAnalytics.markTermsFlushed(storage, pending, Date.now());
      const remaining = KCSearchAnalytics.consumeQueuedTerms(storage, TRACK_BATCH_SIZE);
      if (remaining.length) scheduleTrackedSearchFlush(80);
    }
    return ok;
  }

  function scheduleTrackedSearchFlush(delay = 120) {
    if (searchFlushTimer) clearTimeout(searchFlushTimer);
    searchFlushTimer = setTimeout(() => {
      flushPendingTrackedSearches().catch(() => {});
    }, delay);
  }

  function searchLengthBucket(length) {
    const size = Math.max(0, Number(length) || 0);
    if (size <= 4) return '2_4';
    if (size <= 8) return '5_8';
    if (size <= 16) return '9_16';
    if (size <= 32) return '17_32';
    return '33_plus';
  }

  function isTrackableSearchTerm(value) {
    const rawTerm = String(value || '');
    const term = rawTerm.replace(/\s+/g, ' ').trim();
    if (/[\u0000-\u001F\u007F-\u009F]/.test(rawTerm)) return false;
    if (term.length < 2 || term.length > TRACKED_TERM_MAX_LENGTH) return false;
    if (SENSITIVE_SEARCH_TERM_RE.test(term)) return false;
    if (/[0-9](?:[+() .-]*[0-9]){7,14}/.test(term)) return false;
    return true;
  }

  function normalizeSearchAnalyticsSource(value) {
    const source = String(value || '').trim().toLowerCase();
    const allowed = ['dropdown-item', 'results-load', 'results-submit'];
    return allowed.indexOf(source) !== -1 ? source : 'search';
  }

  function trackSearch(term, meta = {}) {
    if (!hasAnalyticsConsent()) return false;
    const q = String(term || '').replace(/\s+/g, ' ').trim();
    if (!q || q.length < 2) return false;

    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent('search', { term: q, meta });
      }
    } catch (_) {}

    try {
      if (window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
        const privacySource = normalizeSearchAnalyticsSource(meta && meta.source);
        window.KCPrivacyAnalytics.track('search', {
          source: privacySource,
          query_length_bucket: searchLengthBucket(q.length),
        }).catch(function () {});
      }
    } catch (_) {}

    try {
      if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        var source = normalizeSearchAnalyticsSource(meta && meta.source);
        window.KCEvents.track('kc_search', {
          search_source: source,
          query_length_bucket: searchLengthBucket(q.length),
        });
      }
    } catch (_) {}

    if (!KCSearchAnalytics) {
      insertTrackedTerms([{ term: q }]).catch(() => {});
      return true;
    }

    // Search still works and aggregate events still fire, but a sensitive term
    // never enters the raw-term analytics queue.
    if (!isTrackableSearchTerm(q)) return true;

    const entry = KCSearchAnalytics.queueSearchTerm(
      getSearchStorage(),
      q,
      meta,
      Date.now(),
      KCSearchAnalytics.DEFAULT_DEDUPE_WINDOW_MS
    );

    if (!entry) return false;
    scheduleTrackedSearchFlush(meta && meta.navigate ? 220 : 60);
    return true;
  }

  function navigateToResults(query, meta = {}) {
    const q = String(query || '').trim();
    if (!q) return;
    // trackSearch() is called on search-results.html load to avoid the async
    // insert being aborted by page navigation before the request completes.
    window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
  }

  function globalSearch(query, redirectToResults = false) {
    const q = String(query || '').trim();
    if (!q) return;

    if (redirectToResults) {
      navigateToResults(q, { source: 'global-search' });
      return;
    }

    if (typeof window.filterPosts === 'function') {
      window.filterPosts(q);
    } else {
      filterCurrentPageCards(q);
    }
  }

  function isResultsPage() {
    const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return file === 'search-results.html' || !!document.getElementById('searchResultsList');
  }

  function normalizeModuleKey(value) {
    return normalizeText(value)
      .replace(/\s+/g, '-')
      .replace(/^compra-e-venda$/, 'compra-venda')
      .replace(/^achados-perdidos$/, 'achados-perdidos');
  }

  function getPostModuleKey(post) {
    const meta = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
    return normalizeModuleKey(
      (post && (post.module || post.modulo || post.moduloKey || post.moduleKey)) ||
      meta.module || meta.modulo || ''
    );
  }

  function getModuleLabel(key) {
    const normalized = normalizeModuleKey(key);
    const option = SEARCH_RESULTS_MODULES.find((item) => item.key === normalized);
    return option ? option.label : (key ? String(key) : 'Todos');
  }

  function getResultControls() {
    return {
      module: document.getElementById('searchResultsModuleFilter'),
      hideClosed: document.getElementById('searchResultsHideClosed'),
      sort: document.getElementById('searchResultsSort'),
      clear: document.getElementById('searchResultsClearFilters'),
      active: document.getElementById('searchResultsActiveFilters'),
      count: document.getElementById('searchResultsVisibleSummary'),
      structured: document.getElementById('searchResultsStructured'),
      structuredChips: document.getElementById('searchResultsStructuredChips'),
      structuredNote: document.getElementById('searchResultsStructuredNote'),
      structuredRestore: document.getElementById('searchResultsStructuredRestore'),
      personalization: document.getElementById('searchResultsPersonalization'),
      personalizationTitle: document.getElementById('searchResultsPersonalizationTitle'),
      personalizationText: document.getElementById('searchResultsPersonalizationText'),
      personalizationToggle: document.getElementById('searchResultsPersonalizationToggle'),
      noResultsMessage: document.getElementById('noResultsMessage'),
      noResultsRelax: document.getElementById('searchResultsRelaxStructured'),
      noResultsRestore: document.getElementById('searchResultsRestoreStructured')
    };
  }

  function readResultFilters() {
    const controls = getResultControls();
    const urlModule = getQueryParam('module') || getQueryParam('modulo') || '';
    const urlSort = getQueryParam('sort') || '';
    const urlClosed = getQueryParam('closed');
    const urlHideClosed = getQueryParam('hideClosed');
    const hideClosedFromUrl = urlClosed === '1' || urlHideClosed === '1' || urlHideClosed === 'true';

    return {
      module: normalizeModuleKey(controls.module ? controls.module.value : urlModule),
      hideClosed: controls.hideClosed ? controls.hideClosed.checked : hideClosedFromUrl,
      sortBy: controls.sort ? controls.sort.value : (urlSort || 'relevance')
    };
  }

  function initializeResultControlsFromUrl() {
    const controls = getResultControls();
    const moduleParam = getQueryParam('module') || getQueryParam('modulo') || '';
    const sortParam = getQueryParam('sort') || 'relevance';
    const closedParam = getQueryParam('closed');
    const hideClosedParam = getQueryParam('hideClosed');

    if (controls.module) controls.module.value = normalizeModuleKey(moduleParam);
    if (controls.sort) controls.sort.value = ['relevance', 'recent', 'engagement'].includes(sortParam) ? sortParam : 'relevance';
    if (controls.hideClosed) {
      controls.hideClosed.checked = closedParam === '1' || hideClosedParam === '1' || hideClosedParam === 'true';
    }
  }

  function writeResultFiltersToUrl(query, filters) {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    const url = new URL(window.location.href);
    const q = String(query || '').trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');

    if (filters.module) url.searchParams.set('module', filters.module);
    else url.searchParams.delete('module');
    url.searchParams.delete('modulo');

    if (filters.sortBy && filters.sortBy !== 'relevance') url.searchParams.set('sort', filters.sortBy);
    else url.searchParams.delete('sort');

    if (filters.hideClosed) url.searchParams.set('closed', '1');
    else url.searchParams.delete('closed');
    url.searchParams.delete('hideClosed');

    window.history.replaceState({}, '', url.toString());
  }

  function syncStructuredDismissalQuery(query) {
    const normalized = String(query || '').trim();
    if (normalized === structuredDismissalQuery) return;
    structuredDismissalQuery = normalized;
    structuredDismissedSignals = new Set();
  }

  function syncSearchPersonalizationContext(query) {
    const normalized = String(query || '').trim();
    if (normalized !== searchPersonalizationContextQuery) {
      searchPersonalizationContextQuery = normalized;
      searchPersonalizationSuppressed = false;
    }
    return searchPersonalizationSuppressed;
  }

  function setSearchPersonalizationSuppressed(query, suppressed) {
    searchPersonalizationContextQuery = String(query || '').trim();
    searchPersonalizationSuppressed = suppressed === true && !!searchPersonalizationContextQuery;
  }

  function getStructuredIgnoredSignals(query) {
    syncStructuredDismissalQuery(query);
    return Object.freeze({
      module: structuredDismissedSignals.has('module'),
      intent: structuredDismissedSignals.has('intent'),
      filters: Object.freeze(Array.from(structuredDismissedSignals)
        .filter((signal) => signal.startsWith('filter:'))
        .map((signal) => signal.slice(7)))
    });
  }

  function dismissStructuredSignal(query, signal) {
    syncStructuredDismissalQuery(query);
    const key = String(signal || '');
    if (key === 'module' || key === 'intent' || /^filter:[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      structuredDismissedSignals.add(key);
    }
  }

  function restoreStructuredSignals(query) {
    syncStructuredDismissalQuery(query);
    structuredDismissedSignals.clear();
  }

  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function renderStructuredSearchState(state) {
    const controls = getResultControls();
    lastStructuredResultsView = state && typeof state === 'object' ? state : null;
    if (!controls.structured || !controls.structuredChips) return;
    const visible = !!(state && state.available && (state.active || state.dismissedCount > 0));
    controls.structured.hidden = !visible;
    clearElement(controls.structuredChips);
    if (!visible) return;

    (Array.isArray(state.chips) ? state.chips : []).forEach((chip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kc-search-structured-chip';
      button.dataset.kcStructuredSignal = chip.signal;
      button.setAttribute('aria-label', `Remover critério ${chip.label}`);
      const label = document.createElement('span');
      label.textContent = chip.label;
      const icon = document.createElement('i');
      icon.className = 'fas fa-xmark';
      icon.setAttribute('aria-hidden', 'true');
      button.appendChild(label);
      button.appendChild(icon);
      controls.structuredChips.appendChild(button);
    });

    if (controls.structuredNote) {
      const deferred = Array.isArray(state.deferred) ? state.deferred : [];
      controls.structuredNote.hidden = deferred.length === 0;
      controls.structuredNote.textContent = deferred.length
        ? `${deferred.join(', ')} ainda não funciona como filtro automático.`
        : '';
    }
    if (controls.structuredRestore) controls.structuredRestore.hidden = !(state.dismissedCount > 0);
  }

  function renderSearchPersonalizationState(results, sortBy, options = {}) {
    const controls = getResultControls();
    if (!controls.personalization) return;
    const suppressed = options.suppressed === true && sortBy === 'relevance';
    const personalized = (Array.isArray(results) ? results : []).filter((post) =>
      post && post._kcPersonalization && post._kcPersonalization.boost > 0
    );
    const visible = suppressed || (sortBy === 'relevance' && personalized.length > 0);
    controls.personalization.hidden = !visible;
    if (!visible || !controls.personalizationText) return;
    if (controls.personalizationTitle) {
      controls.personalizationTitle.textContent = suppressed
        ? 'Ordem padrão nesta busca.'
        : 'Ordem personalizada neste navegador.';
    }
    if (controls.personalizationToggle) {
      controls.personalizationToggle.setAttribute('aria-pressed', suppressed ? 'true' : 'false');
    }
    if (suppressed) {
      controls.personalizationText.textContent = 'A personalização local foi ignorada somente para esta consulta.';
      return;
    }
    const reasonLabels = [];
    personalized.forEach((post) => {
      (post._kcPersonalization.reasons || []).forEach((reason) => {
        if (reason && reason.label && reasonLabels.indexOf(reason.label) === -1) reasonLabels.push(reason.label);
      });
    });
    controls.personalizationText.textContent = reasonLabels.length
      ? `Ordem ajustada por: ${reasonLabels.slice(0, 3).join(' · ')}.`
      : 'A ordem considera apenas preferências locais autorizadas.';
  }

  function updateNoResultsState(noElement, results, state) {
    const controls = getResultControls();
    const hasResults = Array.isArray(results) && results.length > 0;
    if (noElement) noElement.style.display = hasResults ? 'none' : 'block';
    if (hasResults) return;

    let message = 'Nenhuma publicação corresponde à busca. Revise os termos ou consulte os módulos do KinoCampus.';
    if (state && state.available && state.active) {
      message = state.legacyCount > 0
        ? 'Há publicações para o texto, mas nenhuma atende a todos os critérios entendidos. Remova um chip para ampliar a busca.'
        : 'Nenhuma publicação atende aos critérios entendidos. Remova um chip ou simplifique a busca.';
    } else if (state && state.dismissedCount > 0) {
      message = 'Ainda não encontramos publicações após ampliar os critérios. Tente um termo mais geral ou reaplique os filtros.';
    }
    if (controls.noResultsMessage) controls.noResultsMessage.textContent = message;
    if (controls.noResultsRelax) controls.noResultsRelax.hidden = !(state && state.active);
    if (controls.noResultsRestore) controls.noResultsRestore.hidden = !(state && state.dismissedCount > 0);
  }

  function scoreResultsForQuery(results, query) {
    const searchShared = getSearchShared();
    const list = Array.isArray(results) ? results : [];
    if (!searchShared || typeof searchShared.scorePost !== 'function') {
      return list.map((post) => Object.assign({}, post));
    }
    const expandedTerms = typeof searchShared.expandQueryTerms === 'function'
      ? searchShared.expandQueryTerms(query)
      : null;
    return list.map((post) => {
      const current = Number(post && post.relevanceScore);
      const score = Number.isFinite(current) && current > 0
        ? current
        : searchShared.scorePost(post, { q: query, expandedTerms });
      return Object.assign({}, post, { relevanceScore: score });
    });
  }

  function filterAndSortResults(rawResults, query, filters) {
    const searchShared = getSearchShared();
    let list = scoreResultsForQuery(rawResults, query)
      .filter((post) => {
        if (!post) return false;
        if (filters.module && getPostModuleKey(post) !== filters.module) return false;
        if (searchShared && typeof searchShared.isPostHiddenFromPublic === 'function' && searchShared.isPostHiddenFromPublic(post)) return false;
        if (filters.hideClosed && searchShared && typeof searchShared.isPostClosedOrEnded === 'function') {
          return !searchShared.isPostClosedOrEnded(post);
        }
        return true;
      });

    if (searchShared && typeof searchShared.sortSearchResults === 'function') {
      list = searchShared.sortSearchResults(list, { sortBy: filters.sortBy });
    }
    return list;
  }

  function updateResultsControlsState(rawResults, filteredResults, filters, structuredState) {
    const controls = getResultControls();
    const rawList = Array.isArray(rawResults) ? rawResults : [];
    const visibleList = Array.isArray(filteredResults) ? filteredResults : [];
    const fallbackModuleCounts = rawList.reduce((acc, post) => {
      const key = getPostModuleKey(post);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const structuredFacets = structuredState && structuredState.facets;
    const moduleCounts = structuredFacets && structuredFacets.modules
      ? structuredFacets.modules
      : fallbackModuleCounts;
    const facetTotal = structuredFacets && Number.isFinite(Number(structuredFacets.total))
      ? Number(structuredFacets.total)
      : rawList.length;

    if (controls.module) {
      SEARCH_RESULTS_MODULES.forEach((item) => {
        const option = controls.module.querySelector(`option[value="${item.key}"]`);
        if (!option) return;
        const count = item.key ? (moduleCounts[item.key] || 0) : facetTotal;
        option.textContent = item.key ? `${item.label} (${count})` : `${item.label} (${facetTotal})`;
        option.disabled = !!item.key && count === 0 && filters.module !== item.key;
      });
    }

    if (controls.count) {
      const total = rawList.length;
      const visible = visibleList.length;
      controls.count.textContent = total === visible
        ? `${visible} resultado(s)`
        : `${visible} de ${total} resultado(s)`;
    }

    if (controls.active) {
      const parts = [];
      if (filters.module) parts.push(`Módulo: ${getModuleLabel(filters.module)}`);
      if (filters.hideClosed) parts.push('Encerradas ocultas');
      if (filters.sortBy === 'recent') parts.push('Mais recentes');
      if (filters.sortBy === 'engagement') parts.push('Maior engajamento');
      controls.active.textContent = parts.length
        ? parts.join(' · ')
        : 'Todos os módulos · Mais relevantes';
    }
  }

  function bindResultsControls() {
    const controls = getResultControls();
    const searchInput = document.getElementById('searchInput');
    const rerender = () => renderResultsToPage(searchInput ? searchInput.value : getQueryParam('q'));

    ['module', 'hideClosed', 'sort'].forEach((key) => {
      const el = controls[key];
      if (!el || el.dataset.kcSearchBound === '1') return;
      el.dataset.kcSearchBound = '1';
      el.addEventListener('change', rerender);
    });

    if (controls.clear && controls.clear.dataset.kcSearchBound !== '1') {
      controls.clear.dataset.kcSearchBound = '1';
      controls.clear.addEventListener('click', () => {
        if (controls.module) controls.module.value = '';
        if (controls.hideClosed) controls.hideClosed.checked = false;
        if (controls.sort) controls.sort.value = 'relevance';
        rerender();
      });
    }

    if (controls.structured && controls.structured.dataset.kcSearchBound !== '1') {
      controls.structured.dataset.kcSearchBound = '1';
      controls.structured.addEventListener('click', (event) => {
        const button = event.target.closest && event.target.closest('[data-kc-structured-signal]');
        if (!button) return;
        dismissStructuredSignal(searchInput ? searchInput.value : getQueryParam('q'), button.dataset.kcStructuredSignal);
        rerender();
      });
    }

    const restore = () => {
      restoreStructuredSignals(searchInput ? searchInput.value : getQueryParam('q'));
      rerender();
    };
    [controls.structuredRestore, controls.noResultsRestore].forEach((button) => {
      if (!button || button.dataset.kcSearchBound === '1') return;
      button.dataset.kcSearchBound = '1';
      button.addEventListener('click', restore);
    });

    if (controls.noResultsRelax && controls.noResultsRelax.dataset.kcSearchBound !== '1') {
      controls.noResultsRelax.dataset.kcSearchBound = '1';
      controls.noResultsRelax.addEventListener('click', () => {
        (lastStructuredResultsView && Array.isArray(lastStructuredResultsView.chips)
          ? lastStructuredResultsView.chips
          : []).forEach((chip) => dismissStructuredSignal(
            searchInput ? searchInput.value : getQueryParam('q'), chip.signal
          ));
        rerender();
      });
    }

    if (controls.personalizationToggle && controls.personalizationToggle.dataset.kcSearchBound !== '1') {
      controls.personalizationToggle.dataset.kcSearchBound = '1';
      controls.personalizationToggle.addEventListener('click', () => {
        const query = searchInput ? searchInput.value : getQueryParam('q');
        const suppressed = syncSearchPersonalizationContext(query);
        setSearchPersonalizationSuppressed(query, !suppressed);
        rerender();
      });
    }

    const list = document.getElementById('searchResultsList');
    if (list && list.dataset.kcSearchAffinityBound !== '1') {
      list.dataset.kcSearchAffinityBound = '1';
      list.addEventListener('click', (event) => {
        const link = event.target.closest && event.target.closest('a[href*="id="]');
        const card = link && link.closest('[data-kc-search-result-id]');
        if (!card) return;
        const post = lastRenderedSearchResults.get(card.dataset.kcSearchResultId);
        if (post) recordSearchResultInteraction(post, 'results-click');
      });
    }
  }

  function decorateResultCard(html, post) {
    const source = String(html || '');
    const id = getStructuredPostId(post);
    if (!id || !/<article\b/i.test(source)) return source;
    const personalization = post && post._kcPersonalization;
    const reason = personalization && Array.isArray(personalization.reasons)
      ? personalization.reasons.map((item) => item && item.label).filter(Boolean).slice(0, 2).join(' · ')
      : '';
    let decorated = source.replace(/<article\b/i, `<article data-kc-search-result-id="${escapeHtml(id)}"`);
    if (reason && /<\/article>\s*$/i.test(decorated)) {
      const explanation = `<div class="kc-search-personalization-reason"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Priorizado: ${escapeHtml(reason)}</span></div>`;
      decorated = decorated.replace(/<\/article>\s*$/i, `${explanation}</article>`);
    }
    return decorated;
  }

  function buildResultCard(raw) {
    const post = normalizeAnyPost(raw);
    if (raw && raw._kcPersonalization) post._kcPersonalization = raw._kcPersonalization;
    const modeled = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(post, {})
      : post;

    modeled._kcAuthorPrefix = 'Por';
    modeled._kcCompactComments = true;

    if (KCUtils && typeof KCUtils.renderPostCard === 'function') {
      return decorateResultCard(KCUtils.renderPostCard(modeled), post);
    }

    const href = `product.html?id=${encodeURIComponent(post.id ?? '')}`;
    return decorateResultCard(`
      <article class="kc-card">
        <div class="kc-card__main">
          <div class="kc-card__image-wrapper" style="font-size: 3em; display:flex; align-items:center; justify-content:center;">${escapeHtml(post.emoji || '✨')}</div>
          <div class="kc-card__content">
            <div class="kc-card__header"><div class="kc-card__category-source">${escapeHtml(post.modulo || '')}</div><div class="kc-card__timestamp">${escapeHtml(post.timestamp || '')}</div></div>
            <a class="kc-card__title" href="${href}">${escapeHtml(post.titulo || '')}</a>
            <div class="kc-card__description-preview">${escapeHtml(post.descricao || '')}</div>
            <div class="kc-card__author"><span>Por <strong>${escapeHtml(post.autor || 'Autor')}</strong></span></div>
          </div>
        </div>
      </article>
    `.trim(), post);
  }

  async function renderResultsToPage(query) {
    const request = startSearchRequest('results');
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) {
      recordSearchPerformance(request, 'ok', 0);
      return;
    }

    const q = String(query || '').trim();
    const personalizationSuppressed = syncSearchPersonalizationContext(q);
    const titleEl = document.getElementById('searchQueryText');
    const noEl = document.getElementById('noResults');
    const countEl = document.getElementById('resultsCount');

    if (titleEl) titleEl.textContent = q ? `"${q}"` : '';

    if (!q) {
      listEl.innerHTML = '';
      lastRenderedSearchResults = new Map();
      if (countEl) countEl.textContent = '0';
      updateResultsControlsState([], [], readResultFilters());
      renderStructuredSearchState(null);
      renderSearchPersonalizationState([], 'relevance', { suppressed: false });
      updateNoResultsState(noEl, [], null);
      recordSearchPerformance(request, 'ok', 0);
      return;
    }

    const categoryParam = getQueryParam('category') || getQueryParam('categoria');
    const subcategoryParam = getQueryParam('subcategory') || getQueryParam('subcategoria');

    let results = [];
    try {
      if (KCAPI && typeof KCAPI.searchPosts === 'function') {
        const params = { q, limit: SEARCH_RESULTS_LIMIT, signal: request.signal };
        if (categoryParam) params.category = categoryParam;
        if (subcategoryParam) params.subcategory = subcategoryParam;
        results = await KCAPI.searchPosts(params);
      } else {
        results = await searchPosts(q, { limit: SEARCH_RESULTS_LIMIT, minScore: 0.2, signal: request.signal });
      }
    } catch (error) {
      if (isAbortError(error, request)) {
        recordSearchPerformance(request, 'aborted', 0);
        return;
      }
      console.error('[KinoCampus] Busca falhou:', error);
      recordSearchPerformance(request, 'error', 0);
      results = [];
    }

    if (!isCurrentSearchRequest(request)) {
      recordSearchPerformance(request, 'stale', 0);
      return;
    }

    const safeResults = Array.isArray(results) ? results : [];
    const filters = readResultFilters();
    const ignoredSignals = getStructuredIgnoredSignals(q);
    let structuredState = null;
    const pilotResults = await applyStructuredSearchPilot(q, safeResults, {
      surface: 'results',
      hideClosed: filters.hideClosed,
      limit: SEARCH_RESULTS_LIMIT,
      ignoredSignals,
      moduleOverride: filters.module,
      onState: (state) => { structuredState = state; }
    });
    if (!isCurrentSearchRequest(request)) {
      recordSearchPerformance(request, 'stale', 0);
      return;
    }
    writeResultFiltersToUrl(q, filters);
    let filteredResults = filterAndSortResults(pilotResults, q, filters);
    filteredResults = await applySearchPersonalization(filteredResults, {
      sortBy: filters.sortBy,
      disabled: personalizationSuppressed
    });
    if (!isCurrentSearchRequest(request)) {
      recordSearchPerformance(request, 'stale', 0);
      return;
    }
    renderStructuredSearchState(structuredState);
    renderSearchPersonalizationState(filteredResults, filters.sortBy, {
      suppressed: personalizationSuppressed
    });
    updateResultsControlsState(pilotResults, filteredResults, filters, structuredState);
    lastRenderedSearchResults = new Map(filteredResults.map((post) => [getStructuredPostId(post), post]));
    listEl.innerHTML = filteredResults.map(buildResultCard).join('\n');

    updateNoResultsState(noEl, filteredResults, structuredState);
    if (countEl) countEl.textContent = String(filteredResults.length);
    recordSearchPerformance(request, 'ok', filteredResults.length);
  }

  function getOrCreateDropdown() {
    let dropdown = document.getElementById(SEARCH_DROPDOWN_ID);
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = SEARCH_DROPDOWN_ID;
      dropdown.className = 'kc-search-dropdown';
      dropdown.setAttribute('role', 'presentation');
      document.body.appendChild(dropdown);
    }
    getDropdownList(dropdown);
    return dropdown;
  }

  function getDropdownList(dropdown) {
    if (!dropdown) return null;
    let list = dropdown.querySelector(`#${SEARCH_DROPDOWN_LIST_ID}`);
    if (!list) {
      list = document.createElement('div');
      list.id = SEARCH_DROPDOWN_LIST_ID;
      list.className = 'kc-search-dropdown__list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', 'Sugestões de busca');
      dropdown.appendChild(list);
    }
    return list;
  }

  function setupComboboxInput(input) {
    if (!input || input.nodeType !== 1) return;
    comboboxInputs.add(input);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', SEARCH_DROPDOWN_LIST_ID);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('aria-activedescendant');
  }

  function syncComboboxState(dropdown) {
    const expanded = !!(dropdown && dropdown.classList.contains('active'));
    const options = dropdown ? Array.from(dropdown.querySelectorAll('[role="option"]')) : [];
    const active = dropdownActiveIndex >= 0 ? options[dropdownActiveIndex] : null;
    Array.from(comboboxInputs).forEach((input) => {
      if (!input || !input.isConnected) {
        comboboxInputs.delete(input);
        return;
      }
      input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (expanded && active && active.id) input.setAttribute('aria-activedescendant', active.id);
      else input.removeAttribute('aria-activedescendant');
    });
  }

  function setActiveDropdownIndex(dropdown, index) {
    const options = dropdown ? Array.from(dropdown.querySelectorAll('[role="option"]')) : [];
    if (!options.length) dropdownActiveIndex = -1;
    else dropdownActiveIndex = Math.max(0, Math.min(options.length - 1, Number(index) || 0));
    options.forEach((option, optionIndex) => {
      const selected = optionIndex === dropdownActiveIndex;
      option.classList.toggle('is-active', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const active = dropdownActiveIndex >= 0 ? options[dropdownActiveIndex] : null;
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
    syncComboboxState(dropdown);
  }

  function bindDropdownOptions(dropdown) {
    const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
    options.forEach((option, index) => {
      option.setAttribute('tabindex', '-1');
      option.setAttribute('aria-selected', 'false');
      option.addEventListener('mouseenter', () => setActiveDropdownIndex(dropdown, index));
    });
    dropdownActiveIndex = -1;
    syncComboboxState(dropdown);
  }

  function handleComboboxKeydown(event, sourceInput) {
    if (!event) return false;
    const dropdown = document.getElementById(SEARCH_DROPDOWN_ID);
    const expanded = !!(dropdown && dropdown.classList.contains('active'));
    const options = expanded ? Array.from(dropdown.querySelectorAll('[role="option"]')) : [];

    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      closeDropdown();
      return true;
    }
    if (event.key === 'Tab' && expanded) {
      closeDropdown();
      return false;
    }
    if (event.key === 'Enter' && expanded && dropdownActiveIndex >= 0 && options[dropdownActiveIndex]) {
      event.preventDefault();
      options[dropdownActiveIndex].click();
      return true;
    }
    if (expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      if (event.key === 'Home') setActiveDropdownIndex(dropdown, 0);
      else if (event.key === 'End') setActiveDropdownIndex(dropdown, options.length - 1);
      else if (event.key === 'ArrowDown') {
        setActiveDropdownIndex(dropdown, dropdownActiveIndex < 0 ? 0 : (dropdownActiveIndex + 1) % options.length);
      } else {
        setActiveDropdownIndex(dropdown, dropdownActiveIndex < 0 ? options.length - 1 : (dropdownActiveIndex - 1 + options.length) % options.length);
      }
      return true;
    }
    if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const input = sourceInput || document.getElementById('searchInput');
      const q = input ? input.value : '';
      if (String(q || '').trim().length < 2) return false;
      event.preventDefault();
      clearTimeout(dropdownDebounceTimer);
      const bar = input.closest('.kc-search-bar, .kc-search-modal-card__bar');
      updateDropdown(q, getOrCreateDropdown(), bar).then(() => {
        const optionCount = getOrCreateDropdown().querySelectorAll('[role="option"]').length;
        setActiveDropdownIndex(getOrCreateDropdown(), event.key === 'ArrowUp' ? optionCount - 1 : 0);
      });
      return true;
    }
    return false;
  }

  function positionDropdown(dropdown, searchBarEl) {
    if (!dropdown || !searchBarEl) return;
    const rect = searchBarEl.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;

    let width = Math.max(rect.width, 280);
    let left = rect.left;

    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    if (left < 8) left = 8;
    if (width > vw - 16) width = vw - 16;

    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${width}px`;
  }

  function formatPrice(post) {
    if (post.precoTexto) return post.precoTexto;
    if (post.preco === 0 || post.preco === '0') return 'Gratis';
    if (post.preco) return `R$ ${Number(post.preco).toFixed(2).replace('.', ',')}`;
    return '';
  }

  function getPostHref(post) {
    return post && post.id ? `product.html?id=${encodeURIComponent(post.id)}` : '#';
  }

  function renderDropdown(dropdown, results, query, structuredState) {
    dropdown.innerHTML = '';
    dropdownRenderSeq += 1;
    const list = getDropdownList(dropdown);

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'kc-search-dropdown__empty';
      empty.setAttribute('role', 'status');
      empty.setAttribute('aria-live', 'polite');
      empty.textContent = structuredState && structuredState.active
        ? 'Nenhum resultado com os critérios entendidos.'
        : 'Nenhum resultado encontrado.';
      dropdown.insertBefore(empty, list);
      if (structuredState && structuredState.active) {
        const summary = document.createElement('div');
        summary.className = 'kc-search-dropdown__meta';
        summary.textContent = structuredState.chips.slice(0, 3).map((chip) => chip.label).join(' · ');
        dropdown.insertBefore(summary, list);
        const adjust = document.createElement('button');
        adjust.type = 'button';
        adjust.className = 'kc-search-dropdown__footer';
        adjust.id = `kc-search-option-${dropdownRenderSeq}-0`;
        adjust.setAttribute('role', 'option');
        adjust.textContent = 'Ajustar filtros na busca →';
        adjust.addEventListener('click', () => navigateToResults(query, { source: 'dropdown-empty-adjust' }));
        list.appendChild(adjust);
      }
      dropdown.classList.add('active');
      bindDropdownOptions(dropdown);
      syncComboboxState(dropdown);
      return;
    }

    const shown = results.slice(0, 8);

    shown.forEach((post, index) => {
      const item = document.createElement('a');
      item.className = 'kc-search-dropdown__item';
      item.id = `kc-search-option-${dropdownRenderSeq}-${index}`;
      item.href = getPostHref(post);
      item.setAttribute('role', 'option');
      item.addEventListener('click', () => {
        trackSearch(query, { source: 'dropdown-item' });
        recordSearchResultInteraction(post, 'dropdown-click');
      });

      const emoji = document.createElement('span');
      emoji.className = 'kc-search-dropdown__emoji';
      emoji.textContent = post.emoji || '✨';

      const info = document.createElement('div');
      info.className = 'kc-search-dropdown__info';

      const title = document.createElement('div');
      title.className = 'kc-search-dropdown__title';
      title.textContent = post.titulo || '(sem titulo)';

      const meta = document.createElement('div');
      meta.className = 'kc-search-dropdown__meta';
      const parts = [post.categoria || post.modulo || ''].filter(Boolean);
      if (post.autor) parts.push(`por ${post.autor}`);
      const personalization = post && post._kcPersonalization;
      const firstReason = personalization && Array.isArray(personalization.reasons)
        ? personalization.reasons.find((reason) => reason && reason.label)
        : null;
      if (firstReason) parts.unshift(`Prioridade: ${firstReason.label}`);
      meta.textContent = parts.join(' · ');

      info.appendChild(title);
      info.appendChild(meta);

      item.appendChild(emoji);
      item.appendChild(info);

      const priceStr = formatPrice(post);
      if (priceStr) {
        const price = document.createElement('span');
        price.className = 'kc-search-dropdown__price';
        price.textContent = priceStr;
        item.appendChild(price);
      }

      list.appendChild(item);
    });

    if (results.length > shown.length) {
      const footer = document.createElement('button');
      footer.type = 'button';
      footer.className = 'kc-search-dropdown__footer';
      footer.id = `kc-search-option-${dropdownRenderSeq}-${shown.length}`;
      footer.setAttribute('role', 'option');
      footer.textContent = `Ver todos os ${results.length} resultados →`;
      footer.addEventListener('click', () => {
        navigateToResults(query, { source: 'dropdown-footer' });
      });
      list.appendChild(footer);
    }

    dropdown.classList.add('active');
    bindDropdownOptions(dropdown);
    syncComboboxState(dropdown);
  }

  function closeDropdown(options = {}) {
    clearTimeout(dropdownDebounceTimer);
    if (options.cancelRequest !== false) cancelSearchRequest('dropdown');
    const dropdown = document.getElementById(SEARCH_DROPDOWN_ID);
    dropdownActiveIndex = -1;
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.querySelectorAll('[role="option"]').forEach((option) => {
        option.classList.remove('is-active');
        option.setAttribute('aria-selected', 'false');
      });
    }
    syncComboboxState(dropdown);
  }

  async function updateDropdown(query, dropdown, searchBarEl) {
    loadStructuredSearchRuntime();
    const q = String(query || '').trim();
    if (q.length < 2) {
      cancelSearchRequest('dropdown');
      closeDropdown({ cancelRequest: false });
      return;
    }

    const request = startSearchRequest('dropdown');
    try {
      let results = [];
      if (KCAPI && typeof KCAPI.searchPosts === 'function') {
        results = await KCAPI.searchPosts({ q, limit: 8, signal: request.signal });
      } else {
        results = await searchPosts(q, { limit: 8, minScore: 0.2, signal: request.signal });
      }
      if (!isCurrentSearchRequest(request)) {
        recordSearchPerformance(request, 'stale', 0);
        return;
      }
      if (!Array.isArray(results)) results = [];
      let structuredState = null;
      results = await applyStructuredSearchPilot(q, results, {
        surface: 'dropdown',
        hideClosed: true,
        limit: 8,
        onState: (state) => { structuredState = state; }
      });
      if (!isCurrentSearchRequest(request)) {
        recordSearchPerformance(request, 'stale', 0);
        return;
      }
      results = filterAndSortResults(results, q, { module: '', hideClosed: true, sortBy: 'relevance' }).slice(0, 8);
      results = await applySearchPersonalization(results, { sortBy: 'relevance' });
      if (!isCurrentSearchRequest(request)) {
        recordSearchPerformance(request, 'stale', 0);
        return;
      }
      positionDropdown(dropdown, searchBarEl);
      renderDropdown(dropdown, results, q, structuredState);
      recordSearchPerformance(request, 'ok', results.length);
    } catch (error) {
      if (isAbortError(error, request)) {
        recordSearchPerformance(request, 'aborted', 0);
        return;
      }
      recordSearchPerformance(request, 'error', 0);
      if (isCurrentSearchRequest(request)) closeDropdown({ cancelRequest: false });
    }
  }

  function bindSearchFlushLifecycle() {
    scheduleTrackedSearchFlush(0);
    window.addEventListener('online', () => scheduleTrackedSearchFlush(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleTrackedSearchFlush(0);
      }
    });
  }

  function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBarEl = searchInput ? searchInput.closest('.kc-search-bar') : null;
    const searchButton = document.querySelector('.kc-search-bar button');
    const resultsPage = isResultsPage();
    const dropdown = (!resultsPage && searchBarEl) ? getOrCreateDropdown() : null;

    if (dropdown && searchInput) setupComboboxInput(searchInput);

    bindSearchFlushLifecycle();

    if (resultsPage) {
      loadStructuredSearchRuntime();
      const qParam = getQueryParam('q');
      if (searchInput && qParam) searchInput.value = qParam;
      initializeResultControlsFromUrl();
      bindResultsControls();
      renderResultsToPage(searchInput ? searchInput.value : qParam);
      if (qParam && qParam.trim().length >= 2) {
        trackSearch(qParam.trim(), { source: 'results-load' });
      }
    }

    if (dropdown) {
      document.addEventListener('click', function (event) {
        const insideBar = searchBarEl && searchBarEl.contains(event.target);
        const insideDropdown = dropdown.contains(event.target);
        if (!insideBar && !insideDropdown) closeDropdown();
      }, true);

      window.addEventListener('resize', function () {
        if (dropdown.classList.contains('active')) {
          positionDropdown(dropdown, searchBarEl);
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function (event) {
        const q = event.target.value;

        if (resultsPage) {
          renderResultsToPage(q);
          return;
        }

        if (dropdown) {
          clearTimeout(dropdownDebounceTimer);
          dropdownDebounceTimer = setTimeout(() => updateDropdown(q, dropdown, searchBarEl), 180);
        }
      });

      searchInput.addEventListener('keydown', function (event) {
        if (dropdown && handleComboboxKeydown(event, this)) return;
        if (event.key === 'Escape') {
          closeDropdown();
          return;
        }
        if (event.key !== 'Enter') return;

        event.preventDefault();
        closeDropdown();
        const q = this.value;

        if (resultsPage) {
          trackSearch(q, { source: 'results-submit' });
          renderResultsToPage(q);
          return;
        }

        navigateToResults(q, { source: 'search-enter' });
      });

      searchInput.addEventListener('focus', function () {
        if (dropdown && this.value.trim().length >= 2) {
          updateDropdown(this.value, dropdown, searchBarEl);
        }
      });
    }

    if (searchButton) {
      searchButton.addEventListener('click', function (event) {
        event.preventDefault();
        closeDropdown();
        const q = searchInput ? searchInput.value : '';

        if (resultsPage) {
          trackSearch(q, { source: 'results-submit' });
          renderResultsToPage(q);
          return;
        }

        navigateToResults(q, { source: 'search-button' });
      });
    }
  }

  window.addEventListener('storage', (event) => {
    if (!event || event.key === 'kc_search_preferences_v1' || event.key === 'kc_search_affinity_v1') {
      searchPersonalizationRuntimePromise = null;
    }
  });
  window.addEventListener('kc:search-preferences-change', () => {
    searchPersonalizationRuntimePromise = null;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }

  window.kcSearch = {
    search: (q, opts) => searchPosts(q, opts),
    filter: filterCurrentPageCards,
    globalSearch,
    loadDatabase: loadDbPosts,
    loadStructuredRuntime: loadStructuredSearchRuntime,
    loadPersonalizationRuntime: loadSearchPersonalizationRuntime,
    applyStructuredPilot: applyStructuredSearchPilot,
    navigateToResults,
    attachComboboxInput: setupComboboxInput,
    handleComboboxKeydown,
    getPerformanceSnapshot: getSearchPerformanceSnapshot,
    track: trackSearch,
    flushPending: flushPendingTrackedSearches,
    __internals: {
      flushPendingTrackedSearches,
      getSearchSessionId,
      getSearchStorage,
      insertTrackedTerms,
      isTrackableSearchTerm,
      applyStructuredSearchPilot,
      isStructuredSearchRuntimeEnabled,
      isStructuredSearchPilotEnabled,
      loadStructuredSearchRuntime,
      loadSearchPersonalizationRuntime,
      applySearchPersonalization,
      recordSearchResultInteraction,
      resolveStructuredSearchAsset,
      getSearchPerformanceSnapshot,
      handleComboboxKeydown,
      setupComboboxInput,
      updateDropdown,
      closeDropdown,
      navigateToResults,
      trackSearch
    }
  };
})();
