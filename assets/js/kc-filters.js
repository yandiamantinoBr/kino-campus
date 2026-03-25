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
    searchInputId: "searchInput",
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
    // plural básico (pt-BR) para reduzir falsos "sumiços" ao clicar em tabs
    if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
    return s;
  }

  function categoryMatches(cardCategory, selectedCategory) {
    const sel = canonicalCategory(selectedCategory);
    if (!sel || sel === "toda" || sel === "todas") return true;

    const card = canonicalCategory(cardCategory);
    if (!card) return false;

    // cobre casos como: "ofereco" vs "ofereco carona" e "perdidos" vs "perdido"
    return card.includes(sel) || sel.includes(card);
  }

  function queryMatches(text, query) {
    const q = normalizeText(query);
    if (!q) return true;
    const t = normalizeText(text);
    return t.includes(q);
  }

  function apply() {
    if (!state.ready) return;

    const cards = document.querySelectorAll(state.opts.cardSelector);
    let visible = 0;

    cards.forEach((card) => {
      const titleEl = card.querySelector(state.opts.titleSelector);
      const descEl = card.querySelector(state.opts.descSelector);
      const catEl = card.querySelector(state.opts.categorySelector);

      const title = titleEl ? titleEl.textContent : "";
      const desc = descEl ? descEl.textContent : "";
      // Prefer data-* (mais confiável / sem ruído) e cai para o texto do card
      const catData = card.getAttribute('data-kc-tags') || card.getAttribute('data-tags') || card.getAttribute('data-category') || '';
      const cat = catData || (catEl ? catEl.textContent : "");

      const matchesCategory = categoryMatches(cat, state.category);
      const matchesQuery =
        queryMatches(title, state.query) ||
        queryMatches(desc, state.query) ||
        queryMatches(cat, state.query);

      const matchesExtra = (typeof state.extraPredicate === 'function') ? !!state.extraPredicate(card, state) : true;
      const show = matchesCategory && matchesQuery && matchesExtra;
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });

    const noResults = document.getElementById(state.opts.noResultsId);
    if (noResults) noResults.style.display = visible === 0 ? "" : "none";
  }

  function setActiveTab(category) {
    const tabs = document.querySelectorAll(state.opts.tabsSelector);
    tabs.forEach((t) => t.classList.remove("active"));

    // tenta achar pelo href (#categoria) ou data-category
    tabs.forEach((t) => {
      const hrefCat = (t.getAttribute("href") || "").replace("#", "");
      const dataCat = t.getAttribute("data-category") || "";
      const tabCat = dataCat || hrefCat || "";
      if (canonicalCategory(tabCat) === canonicalCategory(category)) {
        t.classList.add("active");
      }
    });
  }

  // API pública precisa ser configurada em setActiveTab, logo faremos o bind no init.

  async function renderDynamicTabs() {
    const tabsContainer = document.querySelector(state.opts.tabsSelector)?.parentElement;
    if (!tabsContainer || !tabsContainer.classList.contains('kc-feed-tabs')) return;

    if (!window.KCHomeCategories || typeof window.KCHomeCategories.getSidebarRows !== 'function') return;

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

      // Ensure "todas" is always the first tab and keep layout format
      const tabsHTML = [
        `<a data-category="todas" href="#todas" class="${state.category === 'todas' || !state.category ? 'active' : ''}">
          <i class="fas fa-fire"></i>
          <span>Todas</span>
        </a>`
      ];

      moduleRows.forEach(row => {
        const catValue = canonicalCategory(row.categoryKey);
        const isActive = canonicalCategory(state.category) === catValue ? 'active' : '';
        tabsHTML.push(`
          <a data-category="${catValue}" href="#${catValue}" class="${isActive}">
            <i class="${row.icon}"></i>
            <span>${row.label}</span>
          </a>
        `);
      });

      tabsContainer.innerHTML = tabsHTML.join('');
      
      // Re-bind listeners to the newly created tabs
      const newTabs = document.querySelectorAll(state.opts.tabsSelector);
      newTabs.forEach((tab) => {
        tab.addEventListener("click", (e) => {
          e.preventDefault();
          const hrefCat = (tab.getAttribute("href") || "").replace("#", "");
          const dataCat = tab.getAttribute("data-category") || "";
          state.category = dataCat || hrefCat || "todas";
          setActiveTab(state.category);
          apply();
        });
      });
      
    } catch (e) {
      console.error('Falha ao instanciar categorias dinâmicas pro feed: ', e);
    }
  }

  function init(options) {
    if (state.ready) return;

    state.opts = { ...DEFAULTS, ...(options || {}) };

    const searchInput = document.getElementById(state.opts.searchInputId);
    let originalTabs = document.querySelectorAll(state.opts.tabsSelector);

    // Sem tabs, não é esse modo
    if (!originalTabs || originalTabs.length === 0) return;

    // Clique nas tabs iniciais
    originalTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const hrefCat = (tab.getAttribute("href") || "").replace("#", "");
        const dataCat = tab.getAttribute("data-category") || "";
        state.category = dataCat || hrefCat || "todas";
        setActiveTab(state.category);
        apply();
      });
    });

    // Input
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.query = e.target.value || "";
        apply();
      });
    }

    // Categoria inicial (?tag > hash > tab ativa > "todas")
    let urlTag = '';
    try { urlTag = new URLSearchParams(window.location.search).get('tag') || ''; } catch (_) {}

    const tabCats = Array.from(originalTabs).map(t => {
      const hrefCat = (t.getAttribute('href') || '').replace('#', '');
      const dataCat = t.getAttribute('data-category') || '';
      return dataCat || hrefCat || '';
    }).filter(Boolean);

    if (urlTag) {
      const match = tabCats.find(c => canonicalCategory(c) === canonicalCategory(urlTag));
      state.category = match || urlTag;
      setActiveTab(state.category);
    }

    const hashCat = (window.location.hash || '').replace('#', '');
    if (!urlTag && hashCat) {
      const match = tabCats.find(c => canonicalCategory(c) === canonicalCategory(hashCat));
      if (match) {
        state.category = match;
        setActiveTab(state.category);
      }
    }

    if (!urlTag && !hashCat) {
      const active = document.querySelector(`${state.opts.tabsSelector}.active`);
      if (active) {
        const hrefCat = (active.getAttribute("href") || "").replace("#", "");
        const dataCat = active.getAttribute("data-category") || "";
        state.category = dataCat || hrefCat || "todas";
      }
    }

    // Inicia a re-renderização assíncrona para deixar as tags dinâmicas
    renderDynamicTabs();

    state.ready = true;
    apply();
  }

  // API pública
  window.kcFilters = {
    normalizeText,
    canonicalCategory,
    apply,
    initTabSearchFilter: init,

    // Permite filtros adicionais por página (ex.: compra-venda: condição/verificado/categorias múltiplas)
    setExtraPredicate: function (fn) {
      state.extraPredicate = (typeof fn === 'function') ? fn : null;
      apply();
    },

    setCategory: function (categoryKey) {
      state.category = categoryKey || 'todas';
      setActiveTab(state.category);
      apply();
    },

    setQuery: function (q) {
      state.query = q || '';
      const input = document.getElementById(state.opts.searchInputId);
      if (input && input.value !== (q || '')) input.value = q || '';
      apply();
    },

    getState: function () {
      return { ...state };
    }
  };

  // Importante: expõe filterPosts cedo para o search.js reconhecer que a página tem filtro próprio
  window.filterPosts = function (queryOverride) {
    if (typeof queryOverride === "string") {
      state.query = queryOverride;
      const input = document.getElementById(state.opts.searchInputId);
      if (input && input.value !== queryOverride) input.value = queryOverride;
    } else {
      const input = document.getElementById(state.opts.searchInputId);
      if (input) state.query = input.value || "";
    }
    apply();
  };

  // Auto-init por atributo no body
  document.addEventListener("DOMContentLoaded", () => {
    const mode = (document.body && document.body.getAttribute("data-kc-filters")) || "";
    if (mode === "tab-search") {
      init();
    }
  });
})();
