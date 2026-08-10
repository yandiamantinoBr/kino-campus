/**
 * KinoCampus - Filtros unificados (tabs + busca) para feeds simples
 * Objetivo: evitar conflito entre filtros locais e search.js e corrigir
 * matching de categorias com acentos / singular-plural.
 *
 * Ativado em páginas com <body data-kc-filters="tab-search">
 */
(function () {
  const KCUtils = (typeof window !== 'undefined' && window.KCUtils) ? window.KCUtils : null;
  const DEFAULTS = {
    tabsSelector: ".kc-feed-tabs a",
    searchInputId: "kcLocalSearchInput",
    cardSelector: ".kc-card",
    titleSelector: ".kc-card__title",
    descSelector: ".kc-card__description-preview",
    categorySelector: ".kc-card__category-source",
    noResultsId: "noResults",
  };

  const state = {
    ready: false,
    category: "todas",
    query: "",
    extraPredicate: null,
    opts: { ...DEFAULTS },
  };

  function getFeedFilterUtils() {
    return (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
  }

  function syncCoreUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.writeCoreState !== 'function') return;
    utils.writeCoreState({
      query: state.query,
      category: state.category,
    });
  }

  function getSearchInput() {
    return document.getElementById(state.opts.searchInputId) || document.getElementById('searchInput');
  }

  function notifyCoreFilterChange(reason) {
    const detail = {
      category: state.category,
      query: state.query,
      reason: String(reason || 'apply'),
    };
    try {
      document.dispatchEvent(new CustomEvent('kc:feed-core-filter-change', { detail }));
    } catch (_) {
      try {
        const event = document.createEvent('CustomEvent');
        event.initCustomEvent('kc:feed-core-filter-change', false, false, detail);
        document.dispatchEvent(event);
      } catch (_ignored) { /* unsupported legacy DOM */ }
    }
  }

  function normalizeText(str) {
    if (KCUtils && typeof KCUtils.normalizeText === 'function') return KCUtils.normalizeText(str);
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function canonicalCategory(str) {
    if (KCUtils && typeof KCUtils.canonicalCategory === 'function') return KCUtils.canonicalCategory(str);
    let s = normalizeText(str);
    s = s.replace(/^#/, "");
    const key = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const aliases = {
      todas: 'toda', todos: 'toda', toda: 'toda', todo: 'toda',
      academicos: 'academico', academicas: 'academico', academica: 'academico',
      palestras: 'palestra', congressos: 'congresso', cursos: 'curso',
      culturais: 'cultural', esportivos: 'esportivo', workshops: 'workshop', festas: 'festa',
      editais: 'edital', concursos: 'concurso', bolsas: 'bolsa', estagios: 'estagio', empregos: 'emprego',
      'cursos-capacitacoes': 'curso-capacitacao', 'curso-capacitacao': 'curso-capacitacao',
      republicas: 'republica', quartos: 'quarto', apartamentos: 'apartamento', casas: 'casa',
      eletronicos: 'eletronico', livros: 'livro', ingressos: 'ingresso', moveis: 'movel',
      documentos: 'documento', outros: 'outro', perdidos: 'perdido',
      achado: 'encontrado', achados: 'encontrado', encontrados: 'encontrado',
      'ofereco-carona': 'ofereco', 'procuro-carona': 'procuro', campus: 'campus',
    };
    if (aliases[key]) return aliases[key];
    // plural básico (pt-BR) para reduzir falsos "sumiços" ao clicar em tabs
    if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
    return s;
  }

  function getCurrentFeedModuleKey() {
    const utils = getFeedFilterUtils();
    const explicit = (document.body && document.body.getAttribute('data-module')) || '';
    if (utils && typeof utils.normalizeFeedModuleKey === 'function') {
      const moduleKey = utils.normalizeFeedModuleKey(explicit);
      if (moduleKey) return moduleKey;
    }
    if (utils && typeof utils.inferFeedModuleFromPath === 'function') {
      return utils.inferFeedModuleFromPath((window.location && window.location.pathname) || '');
    }
    return explicit;
  }

  function canonicalFeedCategory(value, moduleKey) {
    const utils = getFeedFilterUtils();
    if (utils && typeof utils.canonicalCategoryKey === 'function') {
      return utils.canonicalCategoryKey(moduleKey || getCurrentFeedModuleKey(), value);
    }
    return canonicalCategory(value);
  }

  function categoryMatches(cardCategories, selectedCategory, moduleKey) {
    const sources = (cardCategories && typeof cardCategories === 'object' && !Array.isArray(cardCategories))
      ? cardCategories
      : { primaryCategory: cardCategories };
    const utils = getFeedFilterUtils();
    if (utils && typeof utils.categoryMatches === 'function') {
      return utils.categoryMatches({
        moduleKey,
        selectedCategory,
        primaryCategory: sources.primaryCategory,
        tagCategories: sources.tagCategories,
        fallbackCategory: sources.fallbackCategory,
      });
    }

    const sel = canonicalCategory(selectedCategory);
    if (!sel || sel === "toda" || sel === "todas") return true;

    const primary = String(sources.primaryCategory || '').trim();
    const fallbackSource = primary || String(sources.tagCategories || '').trim() || String(sources.fallbackCategory || '').trim();
    if (!fallbackSource) return false;
    const candidates = [fallbackSource].concat(fallbackSource.split(/[\s,;|\u2022]+/));
    return candidates.some((candidate) => canonicalCategory(candidate) === sel);
  }

  function queryMatches(text, query) {
    const q = normalizeText(query);
    if (!q) return true;
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.matchesQueryText === 'function') return shared.matchesQueryText(text, q);
    const t = normalizeText(text);
    return t.includes(q);
  }

  function decodeCategoryValue(value) {
    const raw = String(value || '').replace(/^#/, '').trim();
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }

  function apply() {
    if (!state.ready) return;

    const cards = document.querySelectorAll(state.opts.cardSelector);
    let visible = 0;
    const hideClosed = !!(window.KCHideClosed && typeof window.KCHideClosed.getState === 'function' && window.KCHideClosed.getState());

    cards.forEach((card) => {
      const titleEl = card.querySelector(state.opts.titleSelector);
      const descEl = card.querySelector(state.opts.descSelector);
      const catEl = card.querySelector(state.opts.categorySelector);

      const title = titleEl ? titleEl.textContent : "";
      const desc = descEl ? descEl.textContent : "";
      // Prefer data-* (mais confiável / sem ruído) e cai para o texto do card
      const primaryCategory = card.getAttribute('data-category') || '';
      const tagCategories = card.getAttribute('data-kc-tags') || card.getAttribute('data-tags') || '';
      const fallbackCategory = catEl ? catEl.textContent : "";
      const cat = tagCategories || primaryCategory || fallbackCategory;
      const moduleKey = card.getAttribute('data-module') || (document.body && document.body.getAttribute('data-module')) || '';

      const matchesCategory = categoryMatches({ primaryCategory, tagCategories, fallbackCategory }, state.category, moduleKey);
      const matchesQuery =
        queryMatches(title, state.query) ||
        queryMatches(desc, state.query) ||
        queryMatches(cat, state.query);

      const matchesExtra = (typeof state.extraPredicate === 'function') ? !!state.extraPredicate(card, state) : true;
      const closedOrEnded = card.getAttribute('data-kc-closed-or-ended') === 'true'
        || ['closed', 'expired', 'ended', 'encerrado'].includes(String(card.getAttribute('data-status') || '').toLowerCase());
      const matchesLifecycle = !hideClosed || !closedOrEnded;
      const show = matchesCategory && matchesQuery && matchesExtra && matchesLifecycle;
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });

    const noResults = document.getElementById(state.opts.noResultsId);
    if (noResults) {
      noResults.style.display = visible === 0 ? "" : "none";
      const reveal = noResults.querySelector('[data-kc-hide-closed-reveal]');
      if (reveal) reveal.hidden = !(visible === 0 && hideClosed);
    }
  }

  function categoryKeyFromLink(el) {
    if (!el || !el.getAttribute) return '';
    const dataCat = decodeCategoryValue(el.getAttribute('data-category'));
    if (dataCat) return dataCat;
    return decodeCategoryValue(el.getAttribute('href'));
  }

  function setActiveTab(category) {
    const moduleKey = getCurrentFeedModuleKey();
    const selected = canonicalFeedCategory(category, moduleKey);
    const selectedAll = !selected || selected === 'toda' || selected === 'todas';
    document.querySelectorAll(state.opts.tabsSelector).forEach((t) => {
      // Keep sort buttons (Destaques/Recentes/Comentados) independent.
      if (t.matches && t.matches('[data-feed-tab]')) return;
      const tabCat = categoryKeyFromLink(t);
      const tabCanonical = canonicalFeedCategory(tabCat, moduleKey);
      const tabIsAll = tabCanonical === 'toda' || tabCanonical === 'todas';
      const isActive = selectedAll ? tabIsAll : tabCanonical === selected;
      t.classList.toggle('active', !!isActive);
    });
    document.querySelectorAll('.kc-category-item, [data-kc-category-filter]').forEach((item) => {
      const tabCat = categoryKeyFromLink(item);
      const tabCanonical = canonicalFeedCategory(tabCat, moduleKey);
      const tabIsAll = tabCanonical === 'toda' || tabCanonical === 'todas';
      const isActive = selectedAll ? tabIsAll : tabCanonical === selected;
      item.classList.toggle('active', !!isActive);
      item.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
    try {
      const tabs = document.querySelectorAll(state.opts.tabsSelector);
      const activeTab = Array.from(tabs).find((t) => t.classList.contains('active') && categoryKeyFromLink(t));
      if (activeTab && typeof activeTab.scrollIntoView === 'function') {
        activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      }
      const tabsScroller = activeTab && activeTab.closest && activeTab.closest('.kc-feed-tabs');
      if (selectedAll && tabsScroller && typeof tabsScroller.scrollTo === 'function') {
        tabsScroller.scrollTo({ left: 0, behavior: 'smooth' });
      }
      const rail = activeTab && activeTab.closest && activeTab.closest('[data-kc-scroll-rail]');
      if (rail && typeof rail.__kcScrollRailUpdate === 'function') {
        requestAnimationFrame(function () { rail.__kcScrollRailUpdate(); });
      }
    } catch (_) { /* ignore */ }
  }

  function selectCategory(category, options) {
    const opts = options || {};
    const requested = decodeCategoryValue(category || 'todas') || 'todas';
    const next = canonicalFeedCategory(requested, getCurrentFeedModuleKey()) || requested;
    state.category = next;
    setActiveTab(state.category);
    if (opts.updateHash !== false) {
      try {
        const clean = canonicalFeedCategory(next, getCurrentFeedModuleKey());
        if (!clean || clean === 'toda' || clean === 'todas') {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
          history.replaceState(null, '', '#' + next.replace(/^#/, ''));
        }
      } catch (_) { /* ignore */ }
    }
    syncCoreUrlState();
    apply();
    notifyCoreFilterChange('category');
  }

  function bindCategoryLink(el) {
    if (!el || el.__kcCategoryBound) return;
    el.__kcCategoryBound = true;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      selectCategory(categoryKeyFromLink(el) || 'todas');
    });
  }

  // API pública precisa ser configurada em setActiveTab, logo faremos o bind no init.

  async function renderDynamicTabs() {
    const tabsContainer = document.querySelector('.kc-feed-tabs');
    if (!tabsContainer) return;
    // Module feeds keep fixed sort buttons + static category chips.
    if (tabsContainer.querySelector('[data-feed-tab]')) return;

    if (!window.KCHomeCategories || typeof window.KCHomeCategories.getSidebarRows !== 'function') return;
    if (typeof window.KCHomeCategories.inferModuleFromHref !== 'function') return;

    // Detect the current module from href
    let moduleKey = window.KCHomeCategories.inferModuleFromHref(window.location.href);
    if (!moduleKey) {
      // fallback just in case href inference fails, infer from the selected tab link if possible
      const firstHref = document.querySelector(state.opts.tabsSelector)?.getAttribute('href');
      moduleKey = firstHref ? window.KCHomeCategories.inferModuleFromHref(firstHref) : '';
    }
    
    // Only continue if we found the module context
    if (!moduleKey) return;
    
    try {
      // Force refresh to get exact numbers
      const result = await window.KCHomeCategories.getSidebarRows({ limit: 50, force: true });
      if (!result || !result.rows || result.rows.length === 0) return;

      // Filter rows by current module and sort by score (if rankingScore is present)
      const moduleRows = result.rows
        .filter(row => row.moduleKey === moduleKey)
        .sort((a, b) => b.rankingScore - a.rankingScore);

      if (moduleRows.length === 0) return;

      const tabsHTML = [
        `<a data-category="todas" href="#todas" class="${state.category === 'todas' || !state.category ? 'active' : ''}">
          <i class="fas fa-fire" aria-hidden="true"></i>
          <span>Todas</span>
        </a>`
      ];

      moduleRows.forEach(row => {
        const catValue = String(row.categoryKey || '').trim() || canonicalCategory(row.categoryKey);
        const isActive = canonicalFeedCategory(state.category, moduleKey) === canonicalFeedCategory(catValue, moduleKey) ? 'active' : '';
        tabsHTML.push(`
          <a data-category="${catValue}" href="#${catValue}" class="${isActive}">
            <i class="${row.icon}"></i>
            <span>${row.label}</span>
          </a>
        `);
      });

      tabsContainer.innerHTML = tabsHTML.join('');
      document.querySelectorAll(state.opts.tabsSelector).forEach(bindCategoryLink);
      const rail = tabsContainer.closest && tabsContainer.closest('[data-kc-scroll-rail]');
      if (rail && typeof rail.__kcScrollRailUpdate === 'function') {
        requestAnimationFrame(function () { rail.__kcScrollRailUpdate(); });
      }
    } catch (e) {
      console.error('Falha ao instanciar categorias dinâmicas pro feed: ', e);
    }
  }

  function init(options) {
    if (state.ready) return;

    state.opts = { ...DEFAULTS, ...(options || {}) };

    const searchInput = getSearchInput();
    let originalTabs = document.querySelectorAll(state.opts.tabsSelector);

    // Sem tabs, não é esse modo
    if (!originalTabs || originalTabs.length === 0) return;

    // Category chips (never sort buttons).
    originalTabs.forEach(bindCategoryLink);
    // Sidebar Categorias must apply the same filter as top chips.
    document.querySelectorAll('.kc-category-item, [data-kc-category-filter]').forEach(bindCategoryLink);

    // Input
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.query = e.target.value || "";
        syncCoreUrlState();
        apply();
        notifyCoreFilterChange('query');
      });
    }

    // Categoria inicial (?tag > hash > tab ativa > "todas")
    let urlTag = '';
    let urlQuery = '';
    const feedFilterUtils = getFeedFilterUtils();
    if (feedFilterUtils && typeof feedFilterUtils.readCoreState === 'function') {
      const coreState = feedFilterUtils.readCoreState();
      urlTag = coreState && coreState.category ? coreState.category : '';
      urlQuery = coreState && coreState.query ? coreState.query : '';
    } else {
      try { urlTag = new URLSearchParams(window.location.search).get('tag') || ''; } catch (_) {}
    }

    const reservedHashes = new Set(['destaques', 'recentes', 'comentados', 'todas', 'toda']);
    const tabCats = Array.from(originalTabs).map((t) => categoryKeyFromLink(t)).filter(Boolean);
    document.querySelectorAll('.kc-category-item, [data-kc-category-filter]').forEach((item) => {
      const key = categoryKeyFromLink(item);
      if (key) tabCats.push(key);
    });

    if (urlQuery) {
      state.query = urlQuery;
      if (searchInput) searchInput.value = urlQuery;
    }

    if (urlTag) {
      const moduleKey = getCurrentFeedModuleKey();
      const requested = canonicalFeedCategory(urlTag, moduleKey);
      const match = tabCats.find(c => canonicalFeedCategory(c, moduleKey) === requested);
      state.category = match || requested || urlTag;
      setActiveTab(state.category);
    }

    const hashCat = decodeCategoryValue(window.location.hash);
    if (!urlTag && hashCat && !reservedHashes.has(String(hashCat).toLowerCase())) {
      const moduleKey = getCurrentFeedModuleKey();
      const requested = canonicalFeedCategory(hashCat, moduleKey);
      const match = tabCats.find(c => canonicalFeedCategory(c, moduleKey) === requested);
      state.category = match || requested || hashCat;
      setActiveTab(state.category);
    }

    if (!urlTag && (!hashCat || reservedHashes.has(String(hashCat).toLowerCase()))) {
      const active = document.querySelector(`${state.opts.tabsSelector}.active:not([data-feed-tab])`);
      if (active) state.category = categoryKeyFromLink(active) || "todas";
    }

    window.addEventListener('hashchange', function () {
      const next = decodeCategoryValue(window.location.hash);
      if (!next || reservedHashes.has(String(next).toLowerCase())) {
        if (!next || next === 'todas' || next === 'toda' || next === 'destaques') {
          selectCategory('todas', { updateHash: false });
        }
        return;
      }
      selectCategory(next, { updateHash: false });
    });

    // Dynamic tabs only on pages without sort buttons.
    renderDynamicTabs();

    state.ready = true;
    apply();
    notifyCoreFilterChange('init');
  }

  // API pública
  window.kcFilters = {
    normalizeText,
    canonicalCategory,
    canonicalFeedCategory,
    apply,
    initTabSearchFilter: init,

    // Permite filtros adicionais por página (ex.: compra-venda: condição/verificado/categorias múltiplas)
    setExtraPredicate: function (fn) {
      state.extraPredicate = (typeof fn === 'function') ? fn : null;
      apply();
    },

    setCategory: function (categoryKey) {
      selectCategory(categoryKey || 'todas');
    },

    setQuery: function (q) {
      state.query = q || '';
      const input = getSearchInput();
      if (input && input.value !== (q || '')) input.value = q || '';
      syncCoreUrlState();
      apply();
      notifyCoreFilterChange('query');
    },

    getState: function () {
      return { ...state };
    }
  };

  // Importante: expõe filterPosts cedo para o search.js reconhecer que a página tem filtro próprio
  window.filterPosts = function (queryOverride) {
    if (typeof queryOverride === "string") {
      state.query = queryOverride;
      const input = getSearchInput();
      if (input && input.value !== queryOverride) input.value = queryOverride;
    } else {
      const input = getSearchInput();
      if (input) state.query = input.value || "";
    }
    syncCoreUrlState();
    apply();
    notifyCoreFilterChange('query');
  };

  // Auto-init por atributo no body
  document.addEventListener("DOMContentLoaded", () => {
    const mode = (document.body && document.body.getAttribute("data-kc-filters")) || "";
    if (mode === "tab-search") {
      init();
    }
  });
  document.addEventListener('kc:hide-closed-change', () => apply());
})();
