/* KinoCampus — eventos.controller.js (V76.1)
   Feed de eventos + filtro de data + rail mobile (seções da sidebar como modal).

   NOTA: o Calendário (mensal/semanal/diário + modal expandido) foi extraído para o
   componente compartilhado assets/js/features/kc-events-calendar.js (window.KCEventsCalendar),
   que é a FONTE ÚNICA usada por eventos.html e index.html. Este controller cuida apenas
   do feed e dos filtros desta página; o calendário se auto-monta via [data-kc-cal-mount].
*/
(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /* ── Data do evento de um post (usado para anotar cards do feed) ── */
  function getEventDate(post) {
    // Usa data_evento da metadata (campo do formulário) ou data/hora, fallback para created_at
    var m = post.metadata || {};
    var d = m.data_evento || m.data || null;
    if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
    if (post.created_at) return String(post.created_at).slice(0, 10);
    return null;
  }

  /* ── Estado do feed ───────────────────────────────────── */
  var currentSortBy = 'votos';
  var feedPager = null;
  var feedState = { datePreset: '' };

  function isMobile() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
  }

  function getFeedFilterUtils() {
    return (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
  }

  function getAllowedDatePresets() {
    var utils = getFeedFilterUtils();
    return utils && typeof utils.getAllowedDatePresets === 'function'
      ? utils.getAllowedDatePresets('eventos')
      : ['today', 'next7d', 'thisMonth', 'past'];
  }

  function normalizeDatePreset(value) {
    var utils = getFeedFilterUtils();
    if (utils && typeof utils.normalizeDatePreset === 'function') {
      return utils.normalizeDatePreset('eventos', value);
    }
    var normalized = String(value || '').trim().toLowerCase();
    var allowed = getAllowedDatePresets();
    return allowed.indexOf(normalized) !== -1 ? normalized : '';
  }

  function readSelectedDatePreset() {
    var selected = document.querySelector('[data-kc-eventos-date-preset]:checked');
    return normalizeDatePreset(selected ? selected.value : '');
  }

  function syncDateInputs(value) {
    var selected = normalizeDatePreset(value);
    $all('[data-kc-eventos-date-preset]').forEach(function (input) {
      input.checked = normalizeDatePreset(input.value) === selected;
    });
    syncClearButtons();
  }

  function syncClearButtons() {
    var hasPreset = !!normalizeDatePreset(feedState.datePreset);
    $all('[data-kc-eventos-clear-filters="true"], [data-kc-eventos-empty-clear="true"]').forEach(function (btn) {
      btn.disabled = !hasPreset;
    });
  }

  function getFeedRequestParams() {
    var params = {};
    if (feedState.datePreset) params.datePreset = feedState.datePreset;
    return params;
  }

  function buildFeedExtraPredicate() {
    var utils = getFeedFilterUtils();
    if (!feedState.datePreset || !utils || typeof utils.matchesDatePreset !== 'function') return null;
    return function (card) {
      return utils.matchesDatePreset({
        moduleKey: 'eventos',
        preset: feedState.datePreset,
        eventKey: card.getAttribute('data-kc-event-date') || '',
        createdAt: card.getAttribute('data-kc-created-at') || ''
      });
    };
  }

  function syncUrlState() {
    var utils = getFeedFilterUtils();
    if (!utils || typeof utils.updateSearchParams !== 'function') return;
    utils.updateSearchParams(function (params) {
      if (typeof utils.writePresetParam === 'function') utils.writePresetParam(params, 'datePreset', feedState.datePreset, getAllowedDatePresets());
      else utils.writeTextParam(params, 'datePreset', feedState.datePreset || '');
    });
  }

  function restoreUrlState() {
    var utils = getFeedFilterUtils();
    if (!utils || typeof utils.getSearchParams !== 'function') return false;
    var params = utils.getSearchParams();
    if (!params || typeof params.has !== 'function' || !params.has('datePreset')) return false;
    feedState.datePreset = typeof utils.readPresetParam === 'function'
      ? utils.readPresetParam(params, 'datePreset', getAllowedDatePresets())
      : normalizeDatePreset(utils.readTextParam(params, 'datePreset'));
    syncDateInputs(feedState.datePreset);
    return true;
  }

  function applyFeedFilters() {
    syncUrlState();
    syncClearButtons();
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
      window.kcFilters.setExtraPredicate(buildFeedExtraPredicate());
    }
    if (feedPager && typeof feedPager.refresh === 'function') {
      feedPager.refresh({ requestParams: getFeedRequestParams() });
    }
    if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
      window.kcFilters.apply();
    }
  }

  function injectFeed(sortBy) {
    if (!window.KCControllers || typeof window.KCControllers.injectFeed !== 'function') return;
    var pending = window.KCControllers.injectFeed({
      module: 'eventos',
      pageModule: 'eventos',
      sortBy: sortBy || 'votos',
      getRequestParams: getFeedRequestParams,
      onAfterAppend: function (payload) {
        var container = payload && payload.container;
        var posts = payload && Array.isArray(payload.posts) ? payload.posts : [];
        if (!container || !posts.length) return;
        var cards = Array.from(container.querySelectorAll('.kc-card')).slice(-posts.length);
        cards.forEach(function (card, index) {
          var post = posts[index] || {};
          var eventDate = getEventDate(post);
          var createdAt = post.created_at || post.createdAt || post.timestamp || '';
          if (eventDate && !card.getAttribute('data-kc-event-date')) card.setAttribute('data-kc-event-date', eventDate);
          if (createdAt && !card.getAttribute('data-kc-created-at')) card.setAttribute('data-kc-created-at', String(createdAt));
        });
      }
    });
    Promise.resolve(pending).then(function (pager) {
      feedPager = pager || null;
    }).catch(function () {
      feedPager = null;
    });
    if (window.kcFilters && typeof window.kcFilters.setExtraPredicate === 'function') {
      window.kcFilters.setExtraPredicate(buildFeedExtraPredicate());
    }
  }

  /* ── Mobile rail — seções do sidebar como modal ───────── */
  var EVENTOS_SECTIONS = [
    { key: 'dates',      title: 'Data',                icon: 'fas fa-calendar-day' },
    { key: 'calendario', title: 'Calendário',          icon: 'fas fa-calendar-alt' },
    { key: 'categorias', title: 'Categorias',          icon: 'fas fa-th-large'     },
    { key: 'dicas',      title: 'Dicas',               icon: 'fas fa-lightbulb'    },
    { key: 'ranking',    title: 'Top Contribuidores',  icon: 'fas fa-trophy'       },
  ];
  var EVENTOS_MODAL_ID = 'kcEventosSectionOverlay';
  var railState = { activeKey: '', activeNode: null, activePlaceholder: null, lastTrigger: null, dateDraft: '' };

  function ensureEventosModal() {
    var overlay = document.getElementById(EVENTOS_MODAL_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = EVENTOS_MODAL_ID;
    overlay.className = 'kc-modal-overlay kc-eventos-section-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="kc-create-modal kc-eventos-section-modal" role="dialog" aria-modal="true" aria-labelledby="kcEventosSectionTitle">',
      '  <div class="kc-create-modal__header">',
      '    <h2 id="kcEventosSectionTitle"><i class="fas fa-calendar-alt"></i><span>Seção</span></h2>',
      '    <button type="button" class="kc-create-modal__close" aria-label="Fechar" data-kc-eventos-close-section="true"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-create-modal__body">',
      '    <div class="kc-eventos-section-modal__content" data-kc-eventos-section-slot="true"></div>',
      '  </div>',
      '  <div class="kc-eventos-section-modal__actions" data-kc-eventos-section-actions="true"></div>',
      '</div>',
    ].join('');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-kc-eventos-close-section="true"]')) closeEventosSection();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function openEventosSection(key, trigger) {
    var secDef = EVENTOS_SECTIONS.filter(function (s) { return s.key === key; })[0];
    if (!secDef) return;
    var node = $('[data-kc-eventos-section="' + key + '"]');
    if (!node) return;

    var overlay = ensureEventosModal();
    closeEventosSection();

    var slot = overlay.querySelector('[data-kc-eventos-section-slot="true"]');
    var titleSpan = overlay.querySelector('#kcEventosSectionTitle span');
    var titleIcon = overlay.querySelector('#kcEventosSectionTitle i');

    var placeholder = document.createElement('div');
    placeholder.hidden = true;
    placeholder.setAttribute('data-kc-eventos-section-placeholder', key);
    node.parentNode.insertBefore(placeholder, node);
    slot.innerHTML = '';
    slot.appendChild(node);

    railState.activeKey = key;
    railState.activeNode = node;
    railState.activePlaceholder = placeholder;
    railState.lastTrigger = trigger || null;
    railState.dateDraft = feedState.datePreset;

    if (titleSpan) titleSpan.textContent = secDef.title;
    if (titleIcon) titleIcon.className = secDef.icon;
    if (key === 'dates') syncDateInputs(railState.dateDraft);

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kc-modal-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('eventos-section-modal');
    }
    renderEventosActions();

    var closeBtn = overlay.querySelector('[data-kc-eventos-close-section="true"]');
    if (closeBtn) closeBtn.focus();
  }

  function renderEventosActions() {
    var overlay = document.getElementById(EVENTOS_MODAL_ID);
    var actions = overlay ? overlay.querySelector('[data-kc-eventos-section-actions="true"]') : null;
    if (!actions) return;
    if (!railState.activeKey) { actions.innerHTML = ''; return; }

    if (railState.activeKey === 'dates') {
      var labels = { '': 'Todas as datas', today: 'Hoje', next7d: 'Próximos 7 dias', thisMonth: 'Este mês', past: 'Passados' };
      var selectedLabel = labels[railState.dateDraft || ''] || 'Todas as datas';
      var canClear = !!normalizeDatePreset(railState.dateDraft);
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><p class="kc-housing-section-modal__caption">Data selecionada: <strong>' + esc(selectedLabel) + '</strong></p><button class="kc-opportunity-clear" type="button" data-kc-eventos-modal-clear-date' + (canClear ? '' : ' disabled') + '>Limpar filtros</button><button class="kc-opportunity-apply" type="button" data-kc-eventos-modal-apply-date>Ver eventos</button></div>';
      var clearBtn = actions.querySelector('[data-kc-eventos-modal-clear-date]');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        railState.dateDraft = '';
        syncDateInputs('');
        renderEventosActions();
      });
      var applyBtn = actions.querySelector('[data-kc-eventos-modal-apply-date]');
      if (applyBtn) applyBtn.addEventListener('click', function () {
        feedState.datePreset = normalizeDatePreset(railState.dateDraft);
        syncDateInputs(feedState.datePreset);
        closeEventosSection();
        applyFeedFilters();
      });
      return;
    }

    var label = railState.activeKey === 'dicas' ? 'Entendido!' : 'Fechar';
    actions.innerHTML = '<div class="kc-housing-section-modal__action-group">' +
      '<button class="kc-opportunity-apply" type="button" data-kc-eventos-modal-action-close>' + label + '</button>' +
      '</div>';
    var btn = actions.querySelector('[data-kc-eventos-modal-action-close]');
    if (btn) btn.addEventListener('click', closeEventosSection);
  }

  function closeEventosSection() {
    var overlay = document.getElementById(EVENTOS_MODAL_ID);
    var slot = overlay ? overlay.querySelector('[data-kc-eventos-section-slot="true"]') : null;
    var actions = overlay ? overlay.querySelector('[data-kc-eventos-section-actions="true"]') : null;
    var wasActive = !!(overlay && overlay.classList.contains('active'));

    if (railState.activeNode && railState.activePlaceholder && railState.activePlaceholder.parentNode) {
      railState.activePlaceholder.parentNode.replaceChild(railState.activeNode, railState.activePlaceholder);
    }

    var returnFocus = railState.lastTrigger;
    railState.activeKey = '';
    railState.activeNode = null;
    railState.activePlaceholder = null;
    railState.lastTrigger = null;
    railState.dateDraft = '';

    if (slot) slot.innerHTML = '';
    if (actions) actions.innerHTML = '';
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (wasActive) {
      document.body.classList.remove('kc-modal-open');
      if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
        window.KCOverlayLock.unlock('eventos-section-modal');
      }
    }
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
  }

  function clearAppliedFilters(event) {
    if (event) event.preventDefault();
    feedState.datePreset = '';
    syncDateInputs(feedState.datePreset);
    applyFeedFilters();
  }

  function bindClearButtons() {
    $all('[data-kc-eventos-clear-filters="true"], [data-kc-eventos-empty-clear="true"]').forEach(function (btn) {
      btn.addEventListener('click', clearAppliedFilters);
    });
    syncClearButtons();
  }

  function bindRail() {
    $all('[data-kc-eventos-open-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openEventosSection(btn.dataset.kcEventosOpenSection, btn);
      });
    });
    document.addEventListener('change', function (e) {
      var target = e.target;
      if (!target || !target.matches || !target.matches('[data-kc-eventos-date-preset]')) return;
      var nextPreset = readSelectedDatePreset();
      if (railState.activeKey === 'dates' && isMobile()) {
        railState.dateDraft = nextPreset;
        renderEventosActions();
        return;
      }
      feedState.datePreset = nextPreset;
      syncDateInputs(feedState.datePreset);
      applyFeedFilters();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && railState.activeKey) closeEventosSection();
    });
  }

  /* ── DOMContentLoaded ─────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    restoreUrlState();
    syncDateInputs(feedState.datePreset);
    bindRail();
    bindClearButtons();
    // O calendário se auto-inicializa pelo componente compartilhado kc-events-calendar.js.

    if (window.KCCore && typeof window.KCCore.bindModuleSortTabs === 'function') {
      window.KCCore.bindModuleSortTabs({
        initFeedFn: function (sortBy) {
          currentSortBy = sortBy;
          injectFeed(sortBy);
        }
      });
    } else {
      injectFeed();
    }
  });
})();
