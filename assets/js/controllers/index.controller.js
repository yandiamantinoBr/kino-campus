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

  function buildMetricCard(title, value, detail, variant) {
    return `
      <article class="kc-home-metric-card${variant ? ` ${variant}` : ''}">
        <strong>${title}</strong>
        <span class="kc-home-metric-card__value">${value}</span>
        <span>${detail}</span>
      </article>
    `;
  }

  function setPanelHTML(selector, html) {
    const el = $(selector);
    if (el) el.innerHTML = html;
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

  function renderCategoryRows(rows, append) {
    const refs = getCategoryListElements();
    if (!refs.list) return;
    if (!append) refs.list.innerHTML = '';

    const markup = (Array.isArray(rows) ? rows : []).map((row) => `
      <a class="kc-category-item kc-category-item--home" href="${row.href}" data-kc-home-category-id="${row.id}">
        <i class="${row.icon}"></i>
        <span class="kc-category-item__body">
          <strong>${row.label}</strong>
          <small>${getModuleLabel(row.moduleKey)} · relevância ${Math.max(1, Math.round(row.score || 0))}</small>
        </span>
        <span class="kc-category-count">${formatNumber(row.count)}</span>
      </a>
    `).join('');

    refs.list.insertAdjacentHTML(append ? 'beforeend' : 'afterbegin', markup);
  }

  async function renderSidebarCategories(options = {}) {
    const refs = getCategoryListElements();
    if (!refs.list || !window.KCHomeCategories || typeof window.KCHomeCategories.getSidebarRows !== 'function') return;

    const append = !!options.append;
    const force = !!options.force;
    const nextOffset = append ? categoryOffset : 0;

    if (refs.status) {
      refs.status.hidden = false;
      refs.status.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Atualizando categorias...</span>';
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

      if (refs.status) refs.status.hidden = true;
      if (refs.more) refs.more.hidden = !categoryState.hasMore;
    } catch (_) {
      if (refs.status) {
        refs.status.hidden = false;
        refs.status.innerHTML = '<i class="fas fa-circle-exclamation"></i><span>Não foi possível carregar as categorias agora.</span>';
      }
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
        buildMetricCard('Perfil de uso', 'Visitante', 'Entre para guardar afinidade entre sessões, favoritos e destaques.', 'is-honest'),
        buildMetricCard('Categoria mais aquecida', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `Relevância local ${Math.round(topCategory.score || 0)}` : 'Navegue, busque e interaja para personalizar a ordem.', 'is-honest'),
        buildMetricCard('Histórico pessoal', formatNumber(affinityRows.length), 'Categorias já tocadas nesta sessão atual.', 'is-honest')
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
      buildMetricCard('Categoria mais forte', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `${getModuleLabel(topCategory.moduleKey)} · ${Math.round(topCategory.score || 0)} pts` : 'Continue interagindo para personalizar a home.'),
      buildMetricCard('Itens salvos', formatNumber(favoriteCount + laterCount), `${formatNumber(favoriteCount)} favoritos · ${formatNumber(laterCount)} para ver depois`),
      buildMetricCard('Destaques pessoais', formatNumber(highlightCount), `${formatNumber(affinityRows.length)} categorias já têm afinidade registrada`)
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
      buildMetricCard('Publicações ativas', formatNumber(totalPosts), 'Soma das categorias com conteúdo publicado e disponível.'),
      buildMetricCard('Categorias vivas', formatNumber(liveCategories.length), 'Quantidade de frentes com anúncios ativos agora.'),
      buildMetricCard('Categoria líder', topCategory ? topCategory.label : 'Sem destaque', topCategory ? `${formatNumber(topCategory.count)} publicações ativas` : 'Volte em instantes para conferir o pulso da comunidade.', 'is-honest')
    ].join('');
  }

  function renderCashbackPanel() {
    const panel = $('[data-kc-home-cashback-panel]');
    if (!panel) return;
    panel.classList.add('is-ready');
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
      }
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

  function injectHomeFeed() {
    if (!(window.KCControllers && typeof window.KCControllers.injectFeed === 'function')) return;
    let urlQ = '';
    let urlTag = '';
    try {
      const search = new URLSearchParams(window.location.search);
      urlQ = search.get('q') || '';
      urlTag = search.get('tag') || '';
    } catch (_) {}

    window.KCControllers.injectFeed({
      module: null,
      pageModule: '',
      q: urlQ,
      tag: urlTag,
      onAfterAppend: function () {
        if (typeof kcInitVoteStates === 'function') kcInitVoteStates();
      }
    });
  }

  async function bootstrapHome() {
    injectHomeFeed();
    renderCashbackPanel();
    await Promise.all([
      renderSidebarCategories({ force: true }),
      renderPersonalPanel(),
      renderCommunityPanel()
    ]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindIndexInteractions();
    bootstrapHome().catch(() => {});
  });
}());
