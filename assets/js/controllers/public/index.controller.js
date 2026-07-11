/* KinoCampus - index controller */
(function () {
  'use strict';

  const PAGE_SIZE = 10;
  let interactionsBound = false;
  let categoryOffset = 0;
  let categoryState = { total: 0, hasMore: false };
  let refreshTimer = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
  }

  function buildMetricCard(title, value, detail, options) {
    const variantStr = typeof options === 'string' ? options : (options && options.variant) || '';
    const href = options && typeof options === 'object' ? options.href : null;
    const tag = href ? 'a' : 'article';
    const hrefAttr = href ? `href="${href}"` : '';
    return `
      <${tag} ${hrefAttr} class="kc-home-metric-card${variantStr ? ` ${variantStr}` : ''}">
        <strong>${title}</strong>
        <span class="kc-home-metric-card__value">${value}</span>
        <span>${detail}</span>
      </${tag}>
    `;
  }

  function getModuleLabel(moduleKey) {
    const constants = window.KC_CONSTANTS || {};
    const map = constants.MODULE_LABEL_MAP || {};
    return map[moduleKey] || moduleKey || 'Categoria';
  }

  function getCategoryListElements() {
    return {
      status: $('[data-kc-home-categories-status]'),
      list: $('[data-kc-home-categories-list]'),
      more: $('[data-kc-home-categories-more]')
    };
  }

  function ensureCategoryStatusNode() {
    const refs = getCategoryListElements();
    if (refs.status || !refs.list) return refs.status;
    const status = document.createElement('div');
    status.className = 'kc-home-section-status';
    status.dataset.kcHomeCategoriesStatus = 'true';
    status.hidden = true;
    refs.list.insertAdjacentElement('beforebegin', status);
    return status;
  }

  function setCategoryStatus(kind, message) {
    const status = ensureCategoryStatusNode();
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.innerHTML = '';
      return;
    }
    const icon = kind === 'error'
      ? 'fas fa-circle-exclamation'
      : 'fas fa-spinner fa-spin';
    status.hidden = false;
    status.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
  }

  function getCategoryHelpElements() {
    return {
      modal: $('#kcHomeCategoriesHelpModal'),
      backdrop: $('#kcHomeCategoriesHelpBackdrop')
    };
  }

  function openCategoriesHelp() {
    const refs = getCategoryHelpElements();
    if (!refs.modal || !refs.backdrop) return;
    refs.modal.hidden = false;
    refs.backdrop.hidden = false;
    refs.modal.classList.add('active');
    refs.backdrop.classList.add('active');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('home-categories-help');
    }
  }

  function closeCategoriesHelp() {
    const refs = getCategoryHelpElements();
    if (!refs.modal || !refs.backdrop) return;
    refs.modal.classList.remove('active');
    refs.backdrop.classList.remove('active');
    refs.modal.hidden = true;
    refs.backdrop.hidden = true;
    if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
      window.KCOverlayLock.unlock('home-categories-help');
    }
  }

  function renderCategoryRows(rows, append) {
    const refs = getCategoryListElements();
    if (!refs.list) return;
    if (!append) refs.list.innerHTML = '';

    const sourceRows = Array.isArray(rows) ? rows : [];
    const markup = sourceRows.map((row) => {
      let tempClass = 'kc-temp-cold';
      let iconClass = 'fas fa-snowflake';
      let tempLabel = 'Frio · Pouca relevância ou nova';

      if (row.rankingScore >= 14) {
        tempClass = 'kc-temp-hot';
        iconClass = 'fas fa-fire';
        tempLabel = 'Quente · Alta relevância';
      } else if (row.rankingScore >= 7) {
        tempClass = 'kc-temp-warm';
        iconClass = 'fas fa-tint';
        tempLabel = 'Morno · Subindo em relevância';
      }
      
      return `
        <a class="kc-category-item kc-category-item--home" href="${row.href}" data-kc-home-category-id="${row.id}">
          <i class="${row.icon}"></i>
          <span class="kc-category-item__body">
            <strong>${row.label}</strong>
            <small class="text-muted d-block text-truncate kc-temp-display"><i class="${iconClass} ${tempClass}"></i> ${tempLabel}</small>
          </span>
          <span class="kc-category-count">${formatNumber(row.count)}</span>
        </a>
      `;
    }).join('');

    refs.list.insertAdjacentHTML(append ? 'beforeend' : 'afterbegin', markup);
  }

  async function renderSidebarCategories(options = {}) {
    const refs = getCategoryListElements();
    if (!refs.list || !window.KCHomeCategories || typeof window.KCHomeCategories.getSidebarRows !== 'function') return;

    const append = !!options.append;
    const force = !!options.force;
    const nextOffset = append ? categoryOffset : 0;

    if (!append) {
      setCategoryStatus('loading', 'Atualizando categorias...');
    }

    try {
      const result = await window.KCHomeCategories.getSidebarRows({
        offset: nextOffset,
        limit: PAGE_SIZE,
        force
      });

      categoryState = {
        total: Number(result && result.total) || 0,
        hasMore: !!(result && result.hasMore)
      };

      renderCategoryRows(result && result.rows, append);
      categoryOffset = nextOffset + ((result && Array.isArray(result.rows)) ? result.rows.length : 0);

      setCategoryStatus('', '');
      if (refs.more) {
        refs.more.hidden = !categoryState.hasMore;
        refs.more.innerHTML = '<i class="fas fa-layer-group"></i><span>Mostrar mais 10 categorias</span>';
      }
    } catch (_) {
      setCategoryStatus('error', 'Não foi possível carregar as categorias agora.');
      if (refs.more) refs.more.hidden = true;
    }
  }

  async function renderPersonalPanel() {
    const target = $('[data-kc-home-personal-metrics]');
    if (!target) return;

    const user = (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function')
      ? await window.KCAPI.getCurrentUser().catch(() => null)
      : null;
    const affinityRows = (window.KCHomeCategories && typeof window.KCHomeCategories.getAffinityRows === 'function')
      ? await window.KCHomeCategories.getAffinityRows().catch(() => [])
      : [];
    const topResult = (window.KCHomeCategories && typeof window.KCHomeCategories.getSidebarRows === 'function')
      ? await window.KCHomeCategories.getSidebarRows({ offset: 0, limit: 1 }).catch(() => ({ rows: [] }))
      : { rows: [] };
    const topCategory = topResult && Array.isArray(topResult.rows) ? topResult.rows[0] : null;

    if (!user || !user.id) {
      target.innerHTML = [
        buildMetricCard('Perfil de uso', 'Visitante', 'Entre para guardar afinidade entre sessões, favoritos e destaques.', { variant: 'is-honest', href: '#login' }),
        buildMetricCard('Categoria mais forte', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `${getModuleLabel(topCategory.moduleKey)} · ${topCategory.relevanceLabel || 'Em observação'}` : 'Navegue, busque e interaja para personalizar a ordem.', { variant: 'is-honest', href: topCategory ? topCategory.href : null }),
        buildMetricCard('Histórico pessoal', formatNumber(affinityRows.length), 'Categorias tocadas nesta sessão.', { variant: 'is-honest' })
      ].join('');
      return;
    }

    let favoriteCount = 0;
    let laterCount = 0;
    let highlightCount = 0;
    if (window.KCAPI && typeof window.KCAPI.getMySavedPostsCount === 'function') {
      const counts = await Promise.all([
        window.KCAPI.getMySavedPostsCount({ kind: 'favorite' }).catch(() => 0),
        window.KCAPI.getMySavedPostsCount({ kind: 'later' }).catch(() => 0),
        window.KCAPI.getMySavedPostsCount({ kind: 'highlight' }).catch(() => 0)
      ]);
      favoriteCount = Number(counts[0]) || 0;
      laterCount = Number(counts[1]) || 0;
      highlightCount = Number(counts[2]) || 0;
    }

    target.innerHTML = [
      buildMetricCard('Categoria mais forte', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `${getModuleLabel(topCategory.moduleKey)} · ${topCategory.relevanceLabel || 'Em observação'}` : 'Continue interagindo para personalizar a home.', { href: topCategory ? topCategory.href : null }),
      buildMetricCard('Itens salvos', formatNumber(favoriteCount + laterCount), `${formatNumber(favoriteCount)} favoritos · ${formatNumber(laterCount)} para ver depois`, { href: 'profile.html' }),
      buildMetricCard('Destaques pessoais', formatNumber(highlightCount), `${formatNumber(affinityRows.length)} categorias já têm afinidade registrada`, { href: 'profile.html' })
    ].join('');
  }

  async function renderCommunityPanel() {
    const target = $('[data-kc-home-community-metrics]');
    if (!target) return;

    const counts = (window.KCHomeCategories && typeof window.KCHomeCategories.getCategoryCounts === 'function')
      ? await window.KCHomeCategories.getCategoryCounts().catch(() => [])
      : [];
    const totalPosts = (Array.isArray(counts) ? counts : []).reduce((sum, item) => sum + (Number(item && item.count) || 0), 0);
    const liveCategories = (Array.isArray(counts) ? counts : []).filter((item) => Number(item && item.count) > 0);
    const topResult = (window.KCHomeCategories && typeof window.KCHomeCategories.getSidebarRows === 'function')
      ? await window.KCHomeCategories.getSidebarRows({ offset: 0, limit: 1 }).catch(() => ({ rows: [] }))
      : { rows: [] };
    const topCategory = topResult && Array.isArray(topResult.rows) ? topResult.rows[0] : null;

    target.innerHTML = [
      buildMetricCard('Publicações ativas', formatNumber(totalPosts), 'Total de anúncios e avisos visíveis agora.', { href: 'search-results.html' }),
      buildMetricCard('Temas em movimento', formatNumber(liveCategories.length), 'Categorias com pelo menos uma publicação ativa neste momento.'),
      buildMetricCard('Tema com mais anúncios', topCategory ? topCategory.label : 'Sem destaque', topCategory ? `${formatNumber(topCategory.count)} publicações ativas agora` : 'Volte em instantes para conferir o movimento da comunidade.', { variant: 'is-honest', href: topCategory ? topCategory.href : null })
    ].join('');
  }

  function renderCashbackPanel() {
    const panel = $('[data-kc-home-cashback-panel]');
    if (!panel) return;
    panel.classList.add('is-ready');
  }

  function syncStaticSidebarCopy() {
    const categoriesNote = document.querySelector('[data-kc-home-categories-section="true"] .kc-home-section-note');
    if (categoriesNote) {
      categoriesNote.textContent = 'A ordem mistura seu interesse recente com a quantidade atual de publicações em cada tema.';
    }

    const communityPanel = $('[data-kc-home-community-panel]');
    if (communityPanel) {
      const note = communityPanel.querySelector('.kc-home-section-note');
      if (note) {
        note.textContent = 'Um resumo rápido do que está ativo agora: quantas publicações existem, quantos temas estão movimentados e onde a comunidade mais interage.';
      }
    }
  }

  function bindIndexInteractions() {
    if (interactionsBound) return;
    interactionsBound = true;

    document.body.addEventListener('click', function (event) {
      const slideEl = event.target.closest('[data-kc-slide]');
      if (slideEl) {
        const action = String(slideEl.dataset.kcSlide || '').trim();
        if (action === 'prev') {
          if (typeof window.changeSlide === 'function') window.changeSlide(-1);
          return;
        }
        if (action === 'next') {
          if (typeof window.changeSlide === 'function') window.changeSlide(1);
          return;
        }
        if (/^-?\d+$/.test(action)) {
          if (typeof window.goToSlide === 'function') window.goToSlide(Number(action));
          return;
        }
      }

      const moreButton = event.target.closest('[data-kc-home-categories-more]');
      if (moreButton) {
        renderSidebarCategories({ append: true }).catch(() => {});
        return;
      }

      if (event.target.closest('[data-kc-home-categories-help="open"]')) {
        openCategoriesHelp();
        return;
      }

      if (event.target.closest('[data-kc-home-categories-help="close"]') || event.target.id === 'kcHomeCategoriesHelpBackdrop') {
        closeCategoriesHelp();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeCategoriesHelp();
    });

    window.addEventListener('kc:home-categories-tracked', function () {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        renderPersonalPanel().catch(() => {});
        renderCommunityPanel().catch(() => {});
        renderSidebarCategories({ force: true }).catch(() => {});
      }, 160);
    });
  }

  let destaquePager = null;
  let recentesPager = null;
  let comentadosPager = null;
  let activeFeedTab = 'destaques';

  function switchFeedTab(tabKey) {
    if (activeFeedTab === tabKey) return;
    activeFeedTab = tabKey;

    // Atualiza botões de aba
    const tabs = document.querySelectorAll('[data-feed-tab]');
    tabs.forEach((btn) => {
      const isActive = btn.dataset.feedTab === tabKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Esconde/mostra wrappers (cada wrapper contém o panel + pager + realtime-banner)
    const wraps = document.querySelectorAll('[data-feed-wrap]');
    wraps.forEach((wrap) => {
      const isActive = wrap.dataset.feedWrap === tabKey;
      wrap.hidden = !isActive;
      wrap.classList.toggle('kc-feed-tab-wrap--active', isActive);
    });

    // Mantém classe --active no panel interno para animação CSS
    const panels = document.querySelectorAll('.kc-feed-panel');
    panels.forEach((panel) => {
      panel.classList.toggle('kc-feed-panel--active', panel.id === `kc-feed-${tabKey}`);
    });

    // Inicializa pager do tab selecionado apenas na primeira visita
    if (tabKey === 'recentes' && !recentesPager) {
      recentesPager = injectFeedPane('recentes');
    }
    if (tabKey === 'comentados' && !comentadosPager) {
      comentadosPager = injectFeedPane('comentados');
    }

    // Re-aplica estados de voto ao trocar de aba
    if (typeof kcInitVoteStates === 'function') {
      setTimeout(() => { try { kcInitVoteStates(); } catch (_) {} }, 80);
    }
  }

  function injectFeedPane(feedTab) {
    if (!(window.KCControllers && typeof window.KCControllers.injectFeed === 'function')) return null;
    let urlQ = '';
    let urlTag = '';
    try {
      const search = new URLSearchParams(window.location.search);
      urlQ = search.get('q') || '';
      urlTag = search.get('tag') || '';
    } catch (_) {}

    const tabToSortBy = { destaques: 'votos', recentes: 'recentes', comentados: 'comentados' };
    const containerId = `kc-feed-${feedTab}`;
    return window.KCControllers.injectFeed({
      containerSelector: `#${containerId}`,
      module: null,
      pageModule: '',
      q: urlQ,
      tag: urlTag,
      sortBy: tabToSortBy[feedTab] || 'recentes',
      keepExisting: true,
      onAfterAppend: function () {
        if (typeof kcInitVoteStates === 'function') kcInitVoteStates();
      }
    });
  }

  function injectHomeFeed() {
    // Inicia apenas o feed Destaques (ativo por padrão)
    // O feed Recentes é inicializado sob demanda ao clicar na aba
    destaquePager = injectFeedPane('destaques');
  }

  const VALID_TABS = new Set(['destaques', 'recentes', 'comentados']);

  function bindFeedTabInteractions() {
    document.addEventListener('click', function (event) {
      const tabBtn = event.target.closest('[data-feed-tab]');
      if (!tabBtn) return;
      const tabKey = tabBtn.dataset.feedTab;
      if (tabKey) {
        switchFeedTab(tabKey);
        // Atualiza hash da URL sem adicionar ao histórico (permite compartilhar tab)
        try {
          const hash = tabKey === 'destaques' ? '' : '#' + tabKey;
          history.replaceState(null, '', hash || window.location.pathname + window.location.search);
        } catch (_) {}
      }
    });

    // Ativa tab conforme hash da URL ao carregar (links compartilhados)
    try {
      const hash = (window.location.hash || '').replace('#', '').toLowerCase();
      if (hash && VALID_TABS.has(hash) && hash !== 'destaques') {
        switchFeedTab(hash);
      }
    } catch (_) {}
  }

  async function bootstrapHome() {
    // Paint feed first (kc_get_feed_cursor). Do NOT force-refresh category
    // metrics in parallel with ranking — concurrent home RPCs stampeded free-tier DB.
    injectHomeFeed();
    renderCashbackPanel();

    try {
      await renderSidebarCategories({ force: false });
    } catch (_) { }

    // Secondary panels: sequential, reuse category cache (no force).
    try {
      await renderPersonalPanel();
    } catch (_) { }
    try {
      await renderCommunityPanel();
    } catch (_) { }

    // Ranking is non-critical for first paint — defer after main metrics.
    const scheduleRanking = (typeof window.requestIdleCallback === 'function')
      ? function (fn) { window.requestIdleCallback(fn, { timeout: 2500 }); }
      : function (fn) { window.setTimeout(fn, 400); };
    scheduleRanking(function () {
      try { initRanking(); } catch (_) { }
    });
  }

  // ─── Top Contribuidores (ranking de engajamento) ──────────────────────────

  function initRanking() {
    var container = document.querySelector('[data-kc-ranking-container]');
    if (!container) return;

    var currentPeriod = 'month';

    // Filtros de período
    document.querySelectorAll('.kc-ranking-filter[data-kc-ranking-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.kc-ranking-filter[data-kc-ranking-period]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentPeriod = btn.dataset.kcRankingPeriod;
        loadRanking(currentPeriod, null, container);
      });
    });

    // Modal info
    document.querySelectorAll('[data-kc-ranking-info]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = document.getElementById('kcRankingInfoModal');
        if (modal) modal.setAttribute('aria-hidden', 'false');
      });
    });
    document.querySelectorAll('[data-kc-ranking-modal-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = el.closest('.kc-ranking-modal');
        if (modal) modal.setAttribute('aria-hidden', 'true');
      });
    });

    // Carga inicial
    loadRanking(currentPeriod, null, container);
  }

  function loadRanking(period, module, container) {
    if (window.KCRanking && typeof window.KCRanking.loadHomeRanking === 'function') {
      window.KCRanking.loadHomeRanking(container, period, module);
      return;
    }

    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') return;

    container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin"></i></span>';

    api.getTopContributors(period, module, 10).then(function (users) {
      if (!users || users.length === 0) {
        container.innerHTML = '<span class="kc-ranking-empty">Nenhum contribuidor no período.</span>';
        return;
      }
      var iconClass = (window.KCRanking && window.KCRanking.getModuleIcon) ? window.KCRanking.getModuleIcon(module) : 'fas fa-campground';
      container.innerHTML = users.map(function (u, i) {
        var name = u.display_name || 'Usuário';
        var avatarSrc = u.avatar_url || '';
        var avatarHtml = avatarSrc
          ? '<img src="' + avatarSrc + '" alt="' + name + '" loading="lazy">'
          : '<i class="fas fa-user" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.9em;color:var(--kc-text-dark-secondary);"></i>';
        return '<a href="profile.html?id=' + u.user_id + '" class="kc-ranking-user" title="' + name + ' — ' + u.score + ' pts">' +
          '<div class="kc-ranking-user-avatar">' + avatarHtml +
            '<span class="kc-ranking-user-position"><i class="' + iconClass + '"></i>' + (i + 1) + '</span>' +
          '</div>' +
          '<span class="kc-ranking-user-name">' + name + '</span>' +
          '<span class="kc-ranking-user-score">' + u.score + ' pts</span>' +
        '</a>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<span class="kc-ranking-empty">Erro ao carregar ranking.</span>';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindIndexInteractions();
    bindFeedTabInteractions();
    syncStaticSidebarCopy();
    bootstrapHome().catch(() => {});
  });
}());
