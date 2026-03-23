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
    const markup = sourceRows.map((row) => `
      <a class="kc-category-item kc-category-item--home" href="${row.href}" data-kc-home-category-id="${row.id}">
        <i class="${row.icon}"></i>
        <span class="kc-category-item__body">
          <strong>${row.label}</strong>
          <small>${row.relevanceLabel || 'Em observacao'} · ${row.relevanceDetail || `${getModuleLabel(row.moduleKey)} combina interesse pessoal com anuncios ativos.`}</small>
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
      setCategoryStatus('error', 'Nao foi possivel carregar as categorias agora.');
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
        buildMetricCard('Perfil de uso', 'Visitante', 'Entre para guardar afinidade entre sessoes, favoritos e destaques.', 'is-honest'),
        buildMetricCard('Categoria mais forte', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `${getModuleLabel(topCategory.moduleKey)} · ${topCategory.relevanceLabel || 'Em observacao'}` : 'Navegue, busque e interaja para personalizar a ordem.', 'is-honest'),
        buildMetricCard('Historico pessoal', formatNumber(affinityRows.length), 'Categorias tocadas nesta sessao.', 'is-honest')
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
      buildMetricCard('Categoria mais forte', topCategory ? topCategory.label : 'Ainda aprendendo', topCategory ? `${getModuleLabel(topCategory.moduleKey)} · ${topCategory.relevanceLabel || 'Em observacao'}` : 'Continue interagindo para personalizar a home.'),
      buildMetricCard('Itens salvos', formatNumber(favoriteCount + laterCount), `${formatNumber(favoriteCount)} favoritos · ${formatNumber(laterCount)} para ver depois`),
      buildMetricCard('Destaques pessoais', formatNumber(highlightCount), `${formatNumber(affinityRows.length)} categorias ja tem afinidade registrada`)
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
      buildMetricCard('Publicacoes ativas', formatNumber(totalPosts), 'Total de anuncios e avisos visiveis agora.'),
      buildMetricCard('Temas em movimento', formatNumber(liveCategories.length), 'Categorias com pelo menos uma publicacao ativa neste momento.'),
      buildMetricCard('Tema com mais anuncios', topCategory ? topCategory.label : 'Sem destaque', topCategory ? `${formatNumber(topCategory.count)} publicacoes ativas agora` : 'Volte em instantes para conferir o movimento da comunidade.', 'is-honest')
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
      categoriesNote.textContent = 'A ordem mistura seu interesse recente com a quantidade atual de publicacoes em cada tema.';
    }

    const communityPanel = $('[data-kc-home-community-panel]');
    if (communityPanel) {
      const note = communityPanel.querySelector('.kc-home-section-note');
      if (note) {
        note.textContent = 'Um resumo rapido do que esta ativo agora: quantas publicacoes existem, quantos temas estao movimentados e onde a comunidade mais interage.';
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
    syncStaticSidebarCopy();
    bootstrapHome().catch(() => {});
  });
}());
