/* KinoCampus - Compra e Venda Feed Controller (V8.5.0.0) */
(function () {
  'use strict';

  const CATS = [
    { key: 'eletronicos', label: 'Eletrônicos', icon: 'fas fa-laptop' },
    { key: 'livros', label: 'Livros', icon: 'fas fa-book' },
    { key: 'moveis', label: 'Móveis', icon: 'fas fa-couch' },
    { key: 'vestuario', label: 'Vestuário', icon: 'fas fa-tshirt' },
    { key: 'outros', label: 'Outros', icon: 'fas fa-box' },
  ];
  const CAT_KEYS = CATS.map((entry) => entry.key);
  const MODAL_ID = 'kcMarketplaceSectionOverlay';
  const MODULES = new Set(['compra-venda', 'livros']);
  const SECTION_CACHE_KEY = 'compra-venda:index';
  const SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
  const state = {
    cats: new Set(CAT_KEYS),
    conds: new Set(),
    verified: false,
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
  function getParam(name) { try { return new URL(window.location.href).searchParams.get(name); } catch (_) { return null; } }
  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function getFeedFilterUtils() {
    return (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
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
      posts: Array.isArray(posts) ? posts.slice(0, 800) : [],
    });
  }

  function normCat(value) {
    const key = norm(value).replace(/^#/, '');
    if (!key) return '';
    if (CAT_KEYS.includes(key)) return key;
    if (!key.endsWith('s') && CAT_KEYS.includes(key + 's')) return key + 's';
    if (key.includes('eletron')) return 'eletronicos';
    if (key.includes('livr')) return 'livros';
    if (key.includes('mov') || key.includes('mobil')) return 'moveis';
    if (key.includes('vest') || key.includes('roup')) return 'vestuario';
    if (key.includes('outro')) return 'outros';
    return key;
  }

  function normCond(value) {
    const key = norm(value);
    if (!key) return '';
    if (key.includes('semi')) return 'seminovo';
    if (key.includes('novo')) return 'novo';
    if (key.includes('usado')) return 'usado';
    return key.replace(/\s+/g, '');
  }

  function filterState() {
    if (window.kcFilters && typeof window.kcFilters.getState === 'function') {
      const current = window.kcFilters.getState();
      return { category: normCat(current && current.category ? current.category : 'todas') || 'todas', query: current && current.query ? current.query : '' };
    }
    const tab = document.querySelector('.kc-feed-tabs a.active');
    const input = document.getElementById('searchInput');
    return { category: tab ? normCat(tab.getAttribute('data-category') || tab.getAttribute('href') || '') || 'todas' : 'todas', query: input ? String(input.value || '') : '' };
  }

  function selected(kind) {
    return Array.from(document.querySelectorAll('[data-kc-market-filter-kind="' + kind + '"]')).filter((input) => input && input.checked).map((input) => String(input.value || '').trim()).filter(Boolean);
  }

  function verifiedInput() { return document.querySelector('[data-kc-market-filter-kind="verified"]'); }

  function syncInputs(cats, conds, verified) {
    document.querySelectorAll('[data-kc-market-filter-kind="category"]').forEach((input) => { input.checked = cats.has(normCat(input.value)); });
    document.querySelectorAll('[data-kc-market-filter-kind="condition"]').forEach((input) => { input.checked = conds.has(normCond(input.value)); });
    const checked = verifiedInput();
    if (checked) checked.checked = !!verified;
  }

  function restoreUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.getSearchParams !== 'function') return false;
    const params = utils.getSearchParams();
    const hasCats = !!(params && typeof params.has === 'function' && params.has('marketCats'));
    const hasConds = !!(params && typeof params.has === 'function' && params.has('marketConds'));
    const hasVerified = !!(params && typeof params.has === 'function' && params.has('marketVerified'));
    if (!hasCats && !hasConds && !hasVerified) return false;

    if (hasCats) {
      const nextCats = utils.readListParam(params, 'marketCats').map(normCat).filter(Boolean);
      state.cats = new Set(nextCats.length ? nextCats : CAT_KEYS);
    }
    if (hasConds) {
      state.conds = new Set(utils.readListParam(params, 'marketConds').map(normCond).filter(Boolean));
    }
    if (hasVerified) {
      state.verified = utils.readBooleanParam(params, 'marketVerified');
    }

    syncInputs(state.cats, state.conds, state.verified);
    setTabFromCats(state.cats);
    return true;
  }

  function syncUrlState() {
    const utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      const activeCats = state.cats.size === CAT_KEYS.length ? [] : Array.from(state.cats);
      utils.writeListParam(params, 'marketCats', activeCats);
      utils.writeListParam(params, 'marketConds', Array.from(state.conds));
      utils.writeBooleanParam(params, 'marketVerified', state.verified);
    });
  }

  function readInputs() {
    state.cats = new Set(selected('category').map(normCat).filter(Boolean));
    state.conds = new Set(selected('condition').map(normCond).filter(Boolean));
    state.verified = !!(verifiedInput() && verifiedInput().checked);
  }

  function quickCat(set) {
    if (!set) return '';
    if (set.size === CAT_KEYS.length) return '';
    if (set.size === 1) return Array.from(set)[0];
    return null;
  }

  function modalDraft() {
    return { cats: cloneSet(state.cats), conds: cloneSet(state.conds), verified: state.verified, quick: quickCat(state.cats) };
  }

  function readDraftInputs() {
    if (!state.draft) return;
    state.draft.cats = new Set(selected('category').map(normCat).filter(Boolean));
    state.draft.conds = new Set(selected('condition').map(normCond).filter(Boolean));
    state.draft.verified = !!(verifiedInput() && verifiedInput().checked);
    state.draft.quick = quickCat(state.draft.cats);
  }

  function isDefault(cats, conds, verified) {
    return cats && conds && cats.size === CAT_KEYS.length && conds.size === 0 && !verified;
  }

  function setTabFromCats(cats) {
    if (!window.kcFilters || typeof window.kcFilters.setCategory !== 'function') return;
    if (!cats || cats.size === 0 || cats.size > 1 || cats.size === CAT_KEYS.length) window.kcFilters.setCategory('todas');
    else window.kcFilters.setCategory(Array.from(cats)[0] || 'todas');
  }

  function catsFromQuick(key) {
    const normalized = normCat(key);
    if (!normalized || normalized === 'todas' || normalized === 'toda') return new Set(CAT_KEYS);
    return normalized ? new Set([normalized]) : new Set(CAT_KEYS);
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
    const post = (window.KCUtils && typeof window.KCUtils.applyPresentationRules === 'function') ? window.KCUtils.applyPresentationRules(normalized, { pageModule: 'compra-venda' }) : normalized;
    const moduleKey = norm(post && (post.modulo || post.module));
    if (!MODULES.has(moduleKey)) return null;
    const meta = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    let categoryKey = normCat(post && (post._kcTabCategoryKey || post.categoriaKey || post.categoria || post.categoryKey || post.category));
    if (!CAT_KEYS.includes(categoryKey)) categoryKey = normCat(meta.categoryKey || meta.categoriaKey || meta.category || meta.categoria);
    if (!CAT_KEYS.includes(categoryKey)) categoryKey = moduleKey === 'livros' ? 'livros' : normCat([post && post.titulo, post && post.descricao, post && post.categoriaLabel, post && post.subcategoriaLabel].filter(Boolean).join(' '));
    if (!CAT_KEYS.includes(categoryKey)) categoryKey = 'outros';
    const definition = CATS.find((entry) => entry.key === categoryKey) || CATS[CATS.length - 1];
    const conditionKey = normCond(post && post.condicao ? post.condicao : meta.condicao);
    return {
      identity: postId(post),
      categoryKey,
      categoryLabel: definition.label,
      categoryIcon: definition.icon,
      conditionKey,
      verified: !!(post && (post.authorVerified === true || post.verificado === true || meta.verificado === true)),
      searchText: norm([post && post.titulo, post && post.descricao, post && post.categoriaLabel, post && post.subcategoriaLabel, definition.label, conditionKey].filter(Boolean).join(' '))
    };
  }

  function upsert(posts) {
    if (!Array.isArray(posts)) return;
    posts.forEach((post) => {
      const summary = summarize(post);
      if (summary && summary.identity) state.posts.set(summary.identity, summary);
    });
  }

  function decorate(payload) {
    const container = payload && payload.container;
    const posts = payload && Array.isArray(payload.posts) ? payload.posts : [];
    if (!container || !posts.length) return;
    upsert(posts);
    Array.from(container.querySelectorAll('.kc-card')).slice(-posts.length).forEach((card, index) => {
      const summary = summarize(posts[index]);
      if (!summary) return;
      if (!card.getAttribute('data-category')) card.setAttribute('data-category', summary.categoryKey);
      if (!card.getAttribute('data-condition') && summary.conditionKey) card.setAttribute('data-condition', summary.conditionKey);
      if (!card.getAttribute('data-verified')) card.setAttribute('data-verified', String(!!summary.verified));
    });
  }

  function matchesSummary(summary, options) {
    const config = options || {};
    const current = filterState();
    if (current.query && !String(summary.searchText || '').includes(norm(current.query))) return false;
    if (!config.ignoreCategory && current.category && current.category !== 'todas' && current.category !== 'toda' && summary.categoryKey !== current.category) return false;
    if (!config.ignoreCategory) {
      if (state.cats.size === 0) return false;
      if (state.cats.size !== CAT_KEYS.length && !state.cats.has(summary.categoryKey)) return false;
    }
    if (state.conds.size && !config.ignoreConditions && !state.conds.has(summary.conditionKey)) return false;
    if (state.verified && !config.ignoreVerified && !summary.verified) return false;
    return true;
  }

  function renderCategories() {
    const list = document.querySelector('[data-kc-market-category-list="true"]');
    if (!list) return;
    const base = Array.from(state.posts.values()).filter((summary) => matchesSummary(summary, { ignoreCategory: true }));
    const counts = new Map();
    base.forEach((summary) => counts.set(summary.categoryKey, (counts.get(summary.categoryKey) || 0) + 1));
    const active = state.draft && state.activeKey === 'categories' ? state.draft.quick : quickCat(state.cats);
    const items = [
      '<button class="kc-category-item ' + (active === '' ? 'is-active' : '') + '" type="button" data-kc-market-category="" aria-pressed="' + (active === '' ? 'true' : 'false') + '">' +
        '<i class="fas fa-layer-group"></i><span>Todas as categorias</span><span class="kc-category-count">' + base.length + '</span></button>'
    ];
    CATS.forEach((entry) => {
      const count = counts.get(entry.key) || 0;
      const isActive = active === entry.key;
      const isDisabled = !isActive && count === 0;
      items.push('<button class="kc-category-item ' + (isActive ? 'is-active ' : '') + (isDisabled ? 'is-disabled' : '') + '" type="button" data-kc-market-category="' + esc(entry.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '"' + (isDisabled ? ' disabled' : '') + '><i class="' + esc(entry.icon) + '"></i><span>' + esc(entry.label) + '</span><span class="kc-category-count">' + count + '</span></button>');
    });
    list.innerHTML = items.join('');
  }

  function collectSections() {
    state.sections = Array.from(document.querySelectorAll('[data-kc-market-sidebar="true"] .kc-sidebar-section[data-kc-market-section]')).map((node, index) => {
      const key = String(node.getAttribute('data-kc-market-section') || ('section-' + index)).trim();
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
    overlay.className = 'kc-modal-overlay kc-marketplace-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="kc-create-modal kc-marketplace-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcMarketplaceSectionTitle"><div class="kc-create-modal__header"><h2 id="kcMarketplaceSectionTitle"><i class="fas fa-layer-group"></i><span>Seção</span></h2><button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-market-close-section-modal="true"><i class="fas fa-times"></i></button></div><div class="kc-create-modal__body"><div class="kc-marketplace-section-modal__content" data-kc-market-section-modal-slot="true"></div></div><div class="kc-marketplace-section-modal__actions" data-kc-market-section-modal-actions="true"></div></div>';
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-kc-market-close-section-modal="true"]')) closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderRail() {
    const rail = document.querySelector('[data-kc-market-mobile-rail="true"]');
    if (!rail || !state.sections.length) return;
    rail.innerHTML = state.sections.map((section) => '<button class="kc-marketplace-mobile-rail__button ' + (state.activeKey === section.key ? 'is-active' : '') + '" type="button" data-kc-market-open-section="' + esc(section.key) + '" aria-pressed="' + (state.activeKey === section.key ? 'true' : 'false') + '"><i class="' + esc(section.icon) + '"></i><span>' + esc(section.title) + '</span></button>').join('');
  }

  function renderActions() {
    const overlay = document.getElementById(MODAL_ID);
    const actions = overlay ? overlay.querySelector('[data-kc-market-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-marketplace-section-modal') : null;
    if (!actions || !modal) return;
    if (!state.activeKey) {
      modal.removeAttribute('data-kc-market-section-view');
      actions.innerHTML = '';
      return;
    }
    modal.setAttribute('data-kc-market-section-view', state.activeKey);
    if (state.activeKey === 'filters') {
      const draft = state.draft || modalDraft();
      const canClear = !isDefault(draft.cats, draft.conds, draft.verified);
      actions.innerHTML = '<div class="kc-marketplace-section-modal__action-group"><button class="kc-opportunity-clear" type="button" data-kc-market-modal-clear="true"' + (canClear ? '' : ' disabled') + '>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-market-modal-apply="filters">Aplicar filtros</button></div>';
      return;
    }
    if (state.activeKey === 'categories') {
      const label = state.draft && state.draft.quick === null ? 'Combinação personalizada' : ((state.draft && state.draft.quick) ? ((CATS.find((entry) => entry.key === state.draft.quick) || {}).label || state.draft.quick) : 'Todas as categorias');
      actions.innerHTML = '<div class="kc-marketplace-section-modal__action-group"><p class="kc-marketplace-section-modal__caption">Seleção atual: <strong>' + esc(label) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-market-modal-apply="categories">Ver anúncios</button></div>';
      return;
    }
    actions.innerHTML = '<div class="kc-marketplace-section-modal__action-group"><button class="kc-opportunity-apply" type="button" data-kc-market-modal-apply="tips">Entendido!</button></div>';
  }

  function openModal(key, trigger) {
    const section = state.sections.find((entry) => entry.key === key);
    if (!section || !section.node) return;
    const overlay = ensureModal();
    const slot = overlay.querySelector('[data-kc-market-section-modal-slot="true"]');
    const title = overlay.querySelector('#kcMarketplaceSectionTitle span');
    const titleIcon = overlay.querySelector('#kcMarketplaceSectionTitle i');
    if (!slot || !title || !titleIcon) return;
    closeModal();
    const placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-market-section-placeholder', section.key);
    section.node.parentNode.insertBefore(placeholder, section.node);
    slot.innerHTML = '';
    slot.appendChild(section.node);
    state.activeKey = section.key;
    state.activeNode = section.node;
    state.activePlaceholder = placeholder;
    state.lastTrigger = trigger || null;
    state.draft = modalDraft();
    title.textContent = section.title;
    titleIcon.className = section.icon || 'fas fa-layer-group';
    syncInputs(state.draft.cats, state.draft.conds, state.draft.verified);
    renderCategories();
    renderActions();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('market-section-modal');
    }
    renderRail();
    const closeBtn = overlay.querySelector('[data-kc-market-close-section-modal="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal(options) {
    const config = options || {};
    const overlay = document.getElementById(MODAL_ID);
    const slot = overlay ? overlay.querySelector('[data-kc-market-section-modal-slot="true"]') : null;
    const actions = overlay ? overlay.querySelector('[data-kc-market-section-modal-actions="true"]') : null;
    const modal = overlay ? overlay.querySelector('.kc-marketplace-section-modal') : null;
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
    if (!config.commit) syncInputs(state.cats, state.conds, state.verified);
    if (state.activeNode && state.activePlaceholder && state.activePlaceholder.parentNode) state.activePlaceholder.parentNode.replaceChild(state.activeNode, state.activePlaceholder);
    state.activeKey = '';
    state.activeNode = null;
    state.activePlaceholder = null;
    state.draft = null;
    if (slot) slot.innerHTML = '';
    if (actions) actions.innerHTML = '';
    if (modal) modal.removeAttribute('data-kc-market-section-view');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) {
      document.body.classList.remove('kc-modal-open');
      if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
        window.KCOverlayLock.unlock('market-section-modal');
      }
    }
    renderCategories();
    renderRail();
    syncClear();
    if (!focusHandled && target) { try { target.focus(); } catch (_) { } }
    state.lastTrigger = null;
  }

  function queue() {
    if (state.queued) return;
    state.queued = true;
    (window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); })(function () {
      state.queued = false;
      renderCategories();
      renderRail();
      renderActions();
      syncClear();
    });
  }

  function apply() {
    syncUrlState();
    if (window.kcFilters && typeof window.kcFilters.apply === 'function') window.kcFilters.apply();
    else queue();
  }

  function syncClear() {
    const button = document.querySelector('[data-kc-market-clear-sidebar="true"]');
    if (button) button.disabled = isDefault(state.cats, state.conds, state.verified);
  }

  function resetApplied(clearSearch) {
    state.cats = new Set(CAT_KEYS);
    state.conds = new Set();
    state.verified = false;
    syncInputs(state.cats, state.conds, state.verified);
    setTabFromCats(state.cats);
    if (clearSearch && window.kcFilters && typeof window.kcFilters.setQuery === 'function') window.kcFilters.setQuery('');
    else if (clearSearch) {
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
    }
    apply();
  }

  function matchCard(card) {
    const categoryKey = normCat(card.getAttribute('data-category') || '');
    const conditionKey = normCond(card.getAttribute('data-condition') || '');
    const verified = String(card.getAttribute('data-verified') || '').toLowerCase() === 'true';
    if (state.cats.size === 0) return false;
    if (state.cats.size !== CAT_KEYS.length && !state.cats.has(categoryKey)) return false;
    if (state.conds.size && !state.conds.has(conditionKey)) return false;
    if (state.verified && !verified) return false;
    return true;
  }

  function handleInputChange() {
    if (state.draft && state.activeKey === 'filters' && isMobile()) {
      readDraftInputs();
      renderActions();
      return;
    }
    readInputs();
    setTabFromCats(state.cats);
    apply();
  }

  function bind() {
    document.querySelectorAll('[data-kc-market-filter-kind]').forEach((input) => input.addEventListener('change', handleInputChange));
    const clear = document.querySelector('[data-kc-market-clear-sidebar="true"]');
    if (clear) clear.addEventListener('click', function () { resetApplied(false); });
    const emptyClear = document.querySelector('#noResults .kc-btn-primary');
    if (emptyClear) emptyClear.addEventListener('click', function (event) { event.preventDefault(); resetApplied(true); });
    document.querySelectorAll('.kc-feed-tabs a').forEach((tab) => tab.addEventListener('click', function () {
      state.cats = catsFromQuick(tab.getAttribute('data-category') || tab.getAttribute('href') || '');
      syncInputs(state.cats, state.conds, state.verified);
      syncUrlState();
      queue();
    }));
    document.addEventListener('click', function (event) {
      const clearDraft = event.target.closest('[data-kc-market-modal-clear="true"]');
      if (clearDraft && state.draft) {
        state.draft.cats = new Set(CAT_KEYS);
        state.draft.conds = new Set();
        state.draft.verified = false;
        state.draft.quick = '';
        syncInputs(state.draft.cats, state.draft.conds, state.draft.verified);
        renderActions();
        return;
      }
      const applyButton = event.target.closest('[data-kc-market-modal-apply]');
      if (applyButton) {
        const action = String(applyButton.getAttribute('data-kc-market-modal-apply') || '').trim();
        if (action === 'filters' && state.draft) {
          state.cats = cloneSet(state.draft.cats);
          state.conds = cloneSet(state.draft.conds);
          state.verified = !!state.draft.verified;
          syncInputs(state.cats, state.conds, state.verified);
          setTabFromCats(state.cats);
          closeModal({ commit: true });
          apply();
          return;
        }
        if (action === 'categories' && state.draft) {
          if (state.draft.quick !== null) {
            state.cats = catsFromQuick(state.draft.quick);
            syncInputs(state.cats, state.conds, state.verified);
            setTabFromCats(state.cats);
          }
          closeModal({ commit: true });
          apply();
          return;
        }
        if (action === 'tips') {
          closeModal({ commit: true });
          return;
        }
      }
      const categoryButton = event.target.closest('[data-kc-market-category]');
      if (categoryButton) {
        const selectedKey = String(categoryButton.getAttribute('data-kc-market-category') || '').trim();
        if (state.draft && state.activeKey === 'categories' && isMobile()) {
          state.draft.quick = selectedKey === '' ? '' : normCat(selectedKey);
          renderCategories();
          renderActions();
        } else {
          state.cats = catsFromQuick(selectedKey);
          syncInputs(state.cats, state.conds, state.verified);
          setTabFromCats(state.cats);
          apply();
        }
        return;
      }
      const sectionButton = event.target.closest('[data-kc-market-open-section]');
      if (sectionButton && isMobile()) openModal(String(sectionButton.getAttribute('data-kc-market-open-section') || '').trim(), sectionButton);
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeModal(); });
    window.addEventListener('resize', function () { if (!isMobile()) closeModal(); });
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
          let found = false;
          for (const moduleKey of Array.from(MODULES)) {
            const batch = await window.KCAPI.getPosts({ module: moduleKey, page, limit: 100 });
            if (Array.isArray(batch) && batch.length) {
              collected.push(...batch);
              found = true;
            }
          }
          if (!found) break;
        }
      } else if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        const db = await window.KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        collected.push(...posts.filter((post) => MODULES.has(norm(post && (post.modulo || post.module)))));
      }
    } catch (_) { }
    try {
      if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
        const userPosts = window.kcUserPosts.list();
        if (Array.isArray(userPosts)) collected.push(...userPosts.filter((post) => MODULES.has(norm(post && (post.modulo || post.module)))));
      }
    } catch (_) { }
    upsert(collected);
    persistCachedPosts(collected);
    queue();
  }

  function initFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    window.KCControllers.injectFeed({
      module: ['compra-venda', 'livros'],
      pageModule: 'compra-venda',
      containerSelector: '.kc-feed-list',
      sortBy: sortBy || 'votos',
      onAfterAppend: function (payload) {
        decorate(payload);
        queue();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    collectSections();
    ensureModal();
    wrapApply();
    readInputs();
    const restoredFromUrl = restoreUrlState();
    const preset = normCat(getParam('filter') || '');
    if (!restoredFromUrl && preset && CAT_KEYS.includes(preset)) {
      state.cats = new Set([preset]);
      syncInputs(state.cats, state.conds, state.verified);
      if (window.kcFilters && typeof window.kcFilters.setCategory === 'function') window.kcFilters.setCategory(preset);
    }
    bind();
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') window.kcFilters.setExtraPredicate(function (card) { return matchCard(card); });
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
