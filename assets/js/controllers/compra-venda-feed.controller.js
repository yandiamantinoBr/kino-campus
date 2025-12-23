/*
  KinoCampus - Compra e Venda Feed Controller (V8.1.2.4.3)
  - Consumo dinâmico (KCAPI.getPosts) com fallback estático
  - Regras centrais via KCPostModel + KCUtils.applyPresentationRules
  - Filtros unificados (kc-filters) + filtros avançados (checkboxes: categoria/condição/verificado)
*/

(function () {
  'use strict';

  const CATEGORY_KEYS = ['eletronicos', 'livros', 'moveis', 'vestuario', 'outros'];

  function getQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function $(id) { return document.getElementById(id); }

  function getCategoryChecks() {
    return {
      eletronicos: $('filterEletronicos'),
      livros: $('filterLivros'),
      moveis: $('filterMoveis'),
      vestuario: $('filterVestuario'),
      outros: $('filterOutros'),
    };
  }

  function getSelectedCategories() {
    const checks = getCategoryChecks();
    const selected = [];
    for (const k of CATEGORY_KEYS) {
      const el = checks[k];
      if (el && el.checked) selected.push(k);
    }
    return selected;
  }

  function syncTabsFromCategoryChecks() {
    if (!window.kcFilters || typeof window.kcFilters.setCategory !== 'function') return;
    const selected = getSelectedCategories();
    if (selected.length === 0) return; // deixa como está
    if (selected.length === CATEGORY_KEYS.length) window.kcFilters.setCategory('todas');
    else if (selected.length === 1) window.kcFilters.setCategory(selected[0]);
    else window.kcFilters.setCategory('todas');
  }

  function setAllCategoriesChecked(value) {
    const checks = getCategoryChecks();
    CATEGORY_KEYS.forEach((k) => {
      if (checks[k]) checks[k].checked = !!value;
    });
  }


  function syncCategoryChecksFromTab(categoryKey) {
    // IMPORTANTE: aqui NÃO pode usar canonicalCategory (que remove plural 's'),
    // senão 'eletronicos' vira 'eletronico' e desmarca tudo, resultando em 0 cards.
    const KCUtils = window.KCUtils || null;
    const normalizeNoPlural = (v) => {
      if (KCUtils && typeof KCUtils.normalizeText === 'function') {
        return KCUtils.normalizeText(v).replace(/^#/, '');
      }
      return String(v || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/^#/, '')
        .trim();
    };

    const key = normalizeNoPlural(categoryKey);

    if (!key || key === 'todas' || key === 'toda') {
      setAllCategoriesChecked(true);
      return;
    }

    setAllCategoriesChecked(false);
    const checks = getCategoryChecks();

    // tenta direto (plural)
    if (checks[key]) {
      checks[key].checked = true;
      return;
    }

    // fallback: singular/plural
    const trySing = (key.length > 3 && key.endsWith('s')) ? key.slice(0, -1) : key;
    if (checks[trySing]) {
      checks[trySing].checked = true;
      return;
    }

    const tryPlural = key + 's';
    if (checks[tryPlural]) {
      checks[tryPlural].checked = true;
    }
  }


  function setupAdvancedFilters() {
    if (!window.kcFilters || typeof window.kcFilters.setExtraPredicate !== 'function') return;

    const chkNovo = $('filterNovo');
    const chkSemi = $('filterSeminovo');
    const chkVer = $('filterVerificado');

    // Filtro extra baseado em checkboxes (condição/verificado/categorias múltiplas)
    window.kcFilters.setExtraPredicate(function (card) {
      const cat = String(card.getAttribute('data-category') || '');
      const selectedCatsRaw = getSelectedCategories();

      // Categorias: se todas marcadas => nao restringe; se nenhuma => nao mostra nada
      if (selectedCatsRaw.length === 0) return false;

      const KCUtils = window.KCUtils || null;
      const canonical = (KCUtils && typeof KCUtils.canonicalCategory === 'function')
        ? KCUtils.canonicalCategory
        : (s) => String(s || '').toLowerCase();

      const selectedCats = selectedCatsRaw.map((k) => canonical(k));

      if (selectedCatsRaw.length !== CATEGORY_KEYS.length) {
        const c = canonical(cat);
        if (!selectedCats.includes(c)) return false;
      }












      // Condição
      const wantsNovo = !!(chkNovo && chkNovo.checked);
      const wantsSemi = !!(chkSemi && chkSemi.checked);
      if (wantsNovo || wantsSemi) {
        const cond = String(card.getAttribute('data-condition') || '').toLowerCase();
        if (wantsNovo && cond === 'novo') return true;
        if (wantsSemi && cond === 'seminovo') return true;
        return false;
      }

      // Verificado
      if (chkVer && chkVer.checked) {
        return String(card.getAttribute('data-verified') || '').toLowerCase() === 'true';
      }

      return true;
    });

    function applyNow() {
      if (window.kcFilters && typeof window.kcFilters.apply === 'function') window.kcFilters.apply();
      else if (typeof window.filterPosts === 'function') window.filterPosts();
    }

    // Listeners: categorias
    const checks = getCategoryChecks();
    CATEGORY_KEYS.forEach((k) => {
      const el = checks[k];
      if (!el) return;
      el.addEventListener('change', function () {
        syncTabsFromCategoryChecks();
        applyNow();
      });
    });

    // Listeners: condição/verificado
    [chkNovo, chkSemi, chkVer].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', applyNow);
    });

    // Botão "Limpar filtros" no noResults
    const clearBtn = document.querySelector('#noResults .kc-btn-primary');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();

        const input = $('searchInput');
        if (input) input.value = '';

        // reset filtros
        setAllCategoriesChecked(true);
        if (chkNovo) chkNovo.checked = false;
        if (chkSemi) chkSemi.checked = false;
        if (chkVer) chkVer.checked = false;

        if (window.kcFilters) {
          if (typeof window.kcFilters.setQuery === 'function') window.kcFilters.setQuery('');
          if (typeof window.kcFilters.setCategory === 'function') window.kcFilters.setCategory('todas');
        }
        applyNow();
      });
    }

    // Clique em tabs: sincroniza checkboxes (mantém UX antiga)
    document.querySelectorAll('.kc-feed-tabs a').forEach((tab) => {
      tab.addEventListener('click', function () {
        const hrefCat = (tab.getAttribute('href') || '').replace('#', '');
        const dataCat = tab.getAttribute('data-category') || '';
        const cat = dataCat || hrefCat || 'todas';
        syncCategoryChecksFromTab(cat);
        // aplica depois da mudança (kc-filters aplica primeiro)
        setTimeout(applyNow, 0);
      });
    });

    // Clique nas "categorias populares" (cards)
    document.querySelectorAll('.kc-category-card[href^=\"#\"]').forEach((link) => {
      link.addEventListener('click', function (e) {
        const hrefCat = (link.getAttribute('href') || '').replace('#', '');
        const cat = hrefCat || 'todas';
        e.preventDefault();

        if (window.kcFilters && typeof window.kcFilters.setCategory === 'function') {
          window.kcFilters.setCategory(cat);
        }
        syncCategoryChecksFromTab(cat);
        applyNow();
      });
    });
  }

  function init() {
    // Suporte: ?filter=livros (deep link)
    const qp = String(getQueryParam('filter') || '').toLowerCase();
    if (qp && window.kcFilters && typeof window.kcFilters.setCategory === 'function') {
      if (CATEGORY_KEYS.includes(qp) || qp === 'todas') {
        window.kcFilters.setCategory(qp);
        syncCategoryChecksFromTab(qp);
      }
    }

    // URL param: ?filter=livros/eletronicos/etc
    try {
      const params = new URLSearchParams(window.location.search || "");
      const filterParam = params.get("filter");
      if (filterParam) {
        const f = String(filterParam).toLowerCase().replace("#", "");
        if (window.kcFilters && typeof window.kcFilters.setCategory === "function") {
          window.kcFilters.setCategory(f);
        }
        syncCategoryChecksFromTab(f);
      }
    } catch (_) {}


    // Dinâmico: compra-venda + livros (para manter conteúdo de Livros no feed)
    if (window.KCControllers && typeof window.KCControllers.injectFeed === 'function') {
      window.KCControllers.injectFeed({
        module: ['compra-venda', 'livros'],
        pageModule: 'compra-venda',
        containerSelector: '.kc-feed-list',
        onAfterInject: function () {
          setupAdvancedFilters();
          // reaplicar após configuração (garante que predicate já está em vigor)
          if (window.kcFilters && typeof window.kcFilters.apply === 'function') window.kcFilters.apply();
        }
      });
    } else {
      setupAdvancedFilters();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
