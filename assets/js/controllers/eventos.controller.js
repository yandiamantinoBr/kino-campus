/* KinoCampus — eventos.controller.js (V8.5.0.0)
   Calendar funcional (mensal/semanal/diário) + filtro de categoria por rail.
*/
(function () {
  'use strict';

  /* ── Configuração de categorias ───────────────────────── */
  var CATEGORIES = {
    sustentabilidade: { label: 'Sustentabilidade', icon: 'fas fa-leaf',               color: '#4caf50' },
    academicos:       { label: 'Acadêmicos',        icon: 'fas fa-graduation-cap',     color: '#2196f3' },
    culturais:        { label: 'Culturais',          icon: 'fas fa-theater-masks',      color: '#9c27b0' },
    esportivos:       { label: 'Esportivos',         icon: 'fas fa-running',            color: '#ff9800' },
    workshops:        { label: 'Workshops',           icon: 'fas fa-chalkboard-teacher', color: '#00bcd4' },
    festas:           { label: 'Festas',              icon: 'fas fa-music',              color: '#e91e63' },
  };

  var MONTHS_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var DAYS_SHORT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var STORAGE_KEY = 'kc_events_calendar_month';

  /* ── Helpers ──────────────────────────────────────────── */
  function padZ(n) { return String(n).padStart(2, '0'); }
  function toYMD(y, m, d) { return y + '-' + padZ(m + 1) + '-' + padZ(d); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function catColor(cat) { return (CATEGORIES[cat] && CATEGORIES[cat].color) || '#888'; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /* ── Limites de navegação ─────────────────────────────── */
  var _now  = new Date();
  var MIN_Y = _now.getFullYear(), MIN_M = _now.getMonth();
  var _max  = new Date(_now.getFullYear(), _now.getMonth() + 18, 1);
  var MAX_Y = _max.getFullYear(),  MAX_M = _max.getMonth();

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
      actions.innerHTML = '<div class="kc-housing-section-modal__action-group"><p class="kc-housing-section-modal__caption">Data selecionada: <strong>' + esc(selectedLabel) + '</strong></p><button class="kc-opportunity-apply" type="button" data-kc-eventos-modal-apply-date>Ver eventos</button></div>';
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
    if (wasActive) document.body.classList.remove('kc-modal-open');
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
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

  /* ── Estado do calendário ─────────────────────────────── */
  var calState = {
    view:         'month',
    year:         _now.getFullYear(),
    month:        _now.getMonth(),
    day:          _now.getDate(),
    events:       [],
    loaded:       false,
    loading:      false,
    selectedDate: null,
  };

  /* ── Data do evento de um post ────────────────────────── */
  function getEventDate(post) {
    // Usa data_evento da metadata (campo do formulário) ou data/hora, fallback para created_at
    var m = post.metadata || {};
    var d = m.data_evento || m.data || null;
    if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
    if (post.created_at) return String(post.created_at).slice(0, 10);
    return null;
  }

  function getEventCategory(post) {
    var m = post.metadata || {};
    return (m.subcategoryKey || m.categoryKey || m.categoria || post.category || 'outros').toLowerCase();
  }

  /* ── Busca eventos do Supabase ────────────────────────── */
  function fetchEvents() {
    if (calState.loading) return;
    calState.loading = true;
    renderCalendarAll();   // mostra spinner

    var client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient() : null;

    if (!client) {
      calState.loading = false;
      return;
    }

    client
      .from('posts')
      .select('id, title, category, metadata, created_at')
      .eq('module', 'eventos')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(function (res) {
        if (!res.error && Array.isArray(res.data)) {
          calState.events = res.data;
          calState.loaded = true;
        }
        calState.loading = false;
        renderCalendarAll();
      })
      .catch(function () {
        calState.loading = false;
        renderCalendarAll();
      });
  }

  /* ── Filtros de data ──────────────────────────────────── */
  function eventsForDate(dateStr) {
    return calState.events.filter(function (p) { return getEventDate(p) === dateStr; });
  }

  function weekDays(year, month, day) {
    var d = new Date(year, month, day);
    var dow = d.getDay();
    var days = [];
    for (var i = 0; i < 7; i++) {
      var dd = new Date(year, month, day - dow + i);
      days.push(toYMD(dd.getFullYear(), dd.getMonth(), dd.getDate()));
    }
    return days;
  }

  /* ── Renderização do grid mensal ──────────────────────── */
  function renderMonthGrid(year, month) {
    var today    = new Date();
    var todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());
    var firstDow = new Date(year, month, 1).getDay();
    var daysInM  = new Date(year, month + 1, 0).getDate();

    var html = '<div class="kc-cal-grid-month">';
    html += '<div class="kc-cal-week-header">';
    DAYS_SHORT.forEach(function (d) { html += '<span>' + d + '</span>'; });
    html += '</div><div class="kc-cal-days">';

    for (var i = 0; i < firstDow; i++) {
      html += '<div class="kc-cal-day kc-cal-day--empty"></div>';
    }
    for (var d = 1; d <= daysInM; d++) {
      var ds  = toYMD(year, month, d);
      var evs = eventsForDate(ds);
      var cls = 'kc-cal-day'
        + (ds === todayYMD ? ' kc-cal-day--today' : '')
        + (ds === calState.selectedDate ? ' kc-cal-day--selected' : '')
        + (evs.length ? ' kc-cal-day--has-events' : '');
      html += '<div class="' + cls + '" data-kc-cal-day="' + ds + '" role="button" tabindex="0">';
      html += '<span class="kc-cal-day-num">' + d + '</span>';
      if (evs.length) {
        html += '<div class="kc-cal-day-dots">' + renderDots(evs) + '</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderDots(events) {
    var shown = events.slice(0, 3);
    var rest  = events.length - 3;
    var html  = shown.map(function (e) {
      var cat = getEventCategory(e);
      return '<span class="kc-cal-event-dot" style="background:' + catColor(cat) + '" title="' + esc(e.title || '') + '"></span>';
    }).join('');
    if (rest > 0) html += '<span class="kc-cal-event-more">+' + rest + '</span>';
    return html;
  }

  /* ── Renderização semanal ─────────────────────────────── */
  function renderWeekGrid(year, month, day) {
    var days    = weekDays(year, month, day);
    var today   = new Date();
    var todayYMD = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

    var html = '<div class="kc-cal-grid-week">';
    days.forEach(function (ds) {
      var dayDate = new Date(ds + 'T12:00:00');
      var dn      = dayDate.getDate();
      var dow     = DAYS_SHORT[dayDate.getDay()];
      var evs     = eventsForDate(ds);
      var cls     = 'kc-cal-week-col'
        + (ds === todayYMD ? ' kc-cal-week-col--today' : '')
        + (ds === calState.selectedDate ? ' kc-cal-week-col--selected' : '');
      html += '<div class="' + cls + '" data-kc-cal-day="' + ds + '" role="button" tabindex="0">';
      html += '<div class="kc-cal-week-col-head"><span class="kc-cal-week-dow">' + dow + '</span><span class="kc-cal-week-num">' + dn + '</span></div>';
      html += '<div class="kc-cal-week-events">';
      evs.forEach(function (e) {
        var cat = getEventCategory(e);
        html += '<div class="kc-cal-week-event" style="border-left-color:' + catColor(cat) + '">' + esc((e.title || 'Evento').substring(0, 18)) + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  /* ── Renderização diária ──────────────────────────────── */
  function renderDayGrid(year, month, day) {
    var ds   = toYMD(year, month, day);
    var evs  = eventsForDate(ds);
    var date = new Date(ds + 'T12:00:00');
    var label = DAYS_SHORT[date.getDay()] + ', ' + day + ' de ' + MONTHS_PT[month];

    var html = '<div class="kc-cal-grid-day">';
    html += '<div class="kc-cal-day-header"><span class="kc-cal-day-name">' + label + '</span></div>';
    if (!evs.length) {
      html += '<div class="kc-cal-day-empty">Nenhum evento neste dia.</div>';
    } else {
      evs.forEach(function (e) {
        var cat    = getEventCategory(e);
        var catCfg = CATEGORIES[cat] || { label: cat, icon: 'fas fa-circle', color: '#888' };
        html += '<div class="kc-cal-day-event" style="border-left-color:' + catColor(cat) + '">';
        html += '<span class="kc-cal-day-event-cat" style="color:' + catColor(cat) + '"><i class="' + catCfg.icon + '"></i> ' + esc(catCfg.label) + '</span>';
        html += '<span class="kc-cal-day-event-title">' + esc(e.title || 'Evento') + '</span>';
        html += '</div>';
      });
    }
    html += '</div>';
    return html;
  }

  /* ── Label de navegação ───────────────────────────────── */
  function navLabel() {
    var v = calState.view, y = calState.year, m = calState.month, d = calState.day;
    if (v === 'month') return MONTHS_PT[m] + ' / ' + y;
    if (v === 'week') {
      var days = weekDays(y, m, d);
      var f = new Date(days[0] + 'T12:00:00');
      var l = new Date(days[6] + 'T12:00:00');
      return f.getDate() + ' ' + MONTHS_PT[f.getMonth()].slice(0, 3) + ' – ' + l.getDate() + ' ' + MONTHS_PT[l.getMonth()].slice(0, 3);
    }
    return d + ' ' + MONTHS_PT[m].slice(0, 3) + ', ' + y;
  }

  /* ── Renderizar num container específico ──────────────── */
  function renderInto(grid, modalGrid) {
    var v = calState.view, y = calState.year, m = calState.month, d = calState.day;
    var html;

    if (calState.loading) {
      html = '<div class="kc-cal-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    } else if (v === 'month') {
      html = renderMonthGrid(y, m);
    } else if (v === 'week') {
      html = renderWeekGrid(y, m, d);
    } else {
      html = renderDayGrid(y, m, d);
    }

    if (grid) grid.innerHTML = html;
    if (modalGrid) modalGrid.innerHTML = html;
  }

  /* ── Render principal (sidebar + modal) ───────────────── */
  function renderCalendarAll() {
    var grid      = $('[data-kc-cal-grid]');
    var gridModal = $('[data-kc-cal-grid-modal]');

    // Labels de mês
    var lbl = navLabel();
    $all('[data-kc-cal-month]').forEach(function (el) { el.textContent = lbl; });
    $all('[data-kc-cal-month-modal]').forEach(function (el) { el.textContent = lbl; });

    // Prev/next disabled no modo mensal
    var atMin = (calState.year === MIN_Y && calState.month === MIN_M);
    var atMax = (calState.year === MAX_Y && calState.month === MAX_M);
    $all('[data-kc-cal-prev]').forEach(function (b) {
      b.disabled = calState.view === 'month' && atMin;
    });
    $all('[data-kc-cal-next]').forEach(function (b) {
      b.disabled = calState.view === 'month' && atMax;
    });

    renderInto(grid, gridModal);
    bindDayClick(grid);
    bindDayClick(gridModal);
  }

  /* ── Click nos dias do grid ───────────────────────────── */
  function bindDayClick(grid) {
    if (!grid) return;
    $all('[data-kc-cal-day]', grid).forEach(function (el) {
      el.addEventListener('click', function () {
        var ds = el.dataset.kcCalDay;
        calState.selectedDate = ds;
        var parts = ds.split('-');
        calState.year  = parseInt(parts[0], 10);
        calState.month = parseInt(parts[1], 10) - 1;
        calState.day   = parseInt(parts[2], 10);
        renderCalendarAll();
        showDayDetail(ds);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
  }

  /* ── Detalhe do dia ───────────────────────────────────── */
  function showDayDetail(ds) {
    function renderDetail(detailEl, titleEl, eventsEl, inModal) {
      if (!detailEl || !titleEl || !eventsEl) return;
      var evs  = eventsForDate(ds);
      var date = new Date(ds + 'T12:00:00');
      titleEl.textContent = DAYS_SHORT[date.getDay()] + ', ' + parseInt(ds.split('-')[2], 10) + ' de ' + MONTHS_PT[date.getMonth()];
      if (!evs.length) {
        eventsEl.innerHTML = '<p class="kc-cal-detail-empty">Nenhum evento neste dia.</p>';
      } else {
        eventsEl.innerHTML = evs.map(function (e) {
          var cat    = getEventCategory(e);
          var catCfg = CATEGORIES[cat] || { label: cat, icon: 'fas fa-circle', color: '#888' };
          return '<a class="kc-cal-detail-event" href="product.html?id=' + esc(e.id) + '" style="border-left-color:' + catColor(cat) + '">'
            + '<span class="kc-cal-detail-event-cat" style="color:' + catColor(cat) + '"><i class="' + catCfg.icon + '"></i> ' + esc(catCfg.label) + '</span>'
            + '<span class="kc-cal-detail-event-title">' + esc(e.title || 'Evento') + '</span>'
            + '</a>';
        }).join('');
      }
      detailEl.style.display = '';
    }

    // Sidebar
    renderDetail(
      $('[data-kc-cal-day-detail]'),
      $('[data-kc-cal-day-detail-title]'),
      $('[data-kc-cal-day-detail-events]'),
      false
    );
    // Modal
    renderDetail(
      $('[data-kc-cal-day-detail-modal]'),
      $('[data-kc-cal-day-detail-title-modal]'),
      $('[data-kc-cal-day-detail-events-modal]'),
      true
    );
  }

  /* ── Navegação ────────────────────────────────────────── */
  function navigate(dir) {
    var v = calState.view;
    if (v === 'month') {
      var nm = calState.month + dir;
      if (nm < 0) { calState.year--;  calState.month = 11; }
      else if (nm > 11) { calState.year++; calState.month = 0; }
      else calState.month = nm;
    } else if (v === 'week') {
      var d = new Date(calState.year, calState.month, calState.day + dir * 7);
      calState.year = d.getFullYear(); calState.month = d.getMonth(); calState.day = d.getDate();
    } else {
      var d2 = new Date(calState.year, calState.month, calState.day + dir);
      calState.year = d2.getFullYear(); calState.month = d2.getMonth(); calState.day = d2.getDate();
    }
    // persistir mês no localStorage (apenas para view mensal)
    try {
      localStorage.setItem(STORAGE_KEY, calState.year + '-' + padZ(calState.month + 1));
    } catch (_) {}
    renderCalendarAll();
  }

  /* ── Modal expandido ──────────────────────────────────── */
  function openCalModal() {
    var modal = $('#kcCalModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.documentElement.classList.add('kc-scroll-locked');
    syncModalViewTabs();
    renderCalendarAll();
  }

  function closeCalModal() {
    var modal = $('#kcCalModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('kc-scroll-locked');
  }

  function syncViewTabs(view) {
    $all('[data-kc-cal-view]').forEach(function (b) {
      var active = b.dataset.kcCalView === view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function syncModalViewTabs() {
    $all('[data-kc-cal-modal-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.kcCalModalView === calState.view);
    });
  }

  /* ── Init calendário ──────────────────────────────────── */
  function initCalendar() {
    // Restaura mês salvo
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s && /^\d{4}-\d{2}$/.test(s)) {
        var parts = s.split('-');
        var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1;
        if (Number.isFinite(y) && Number.isFinite(m)) {
          calState.year = y; calState.month = m;
        }
      }
    } catch (_) {}

    // Botões prev/next (sidebar)
    $all('[data-kc-cal-prev]').forEach(function (b) {
      if (b.closest('[data-kc-cal-modal-prev]') === null && !b.dataset.kcCalModalPrev) {
        // evitar duplicar listeners no modal
      }
    });
    var prevSidebar = $('[data-kc-events-calendar] [data-kc-cal-prev]');
    var nextSidebar = $('[data-kc-events-calendar] [data-kc-cal-next]');
    if (prevSidebar) prevSidebar.addEventListener('click', function () { navigate(-1); });
    if (nextSidebar) nextSidebar.addEventListener('click', function () { navigate(1); });

    // Botões prev/next (modal)
    var prevModal = $('[data-kc-cal-modal-prev]');
    var nextModal = $('[data-kc-cal-modal-next]');
    if (prevModal) prevModal.addEventListener('click', function () { navigate(-1); });
    if (nextModal) nextModal.addEventListener('click', function () { navigate(1); });

    // View tabs (sidebar)
    $all('[data-kc-cal-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        calState.view = b.dataset.kcCalView;
        syncViewTabs(calState.view);
        syncModalViewTabs();
        renderCalendarAll();
      });
    });

    // View tabs (modal)
    $all('[data-kc-cal-modal-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        calState.view = b.dataset.kcCalModalView;
        syncViewTabs(calState.view);
        syncModalViewTabs();
        renderCalendarAll();
      });
    });

    // Expand btn
    var expandBtn = $('[data-kc-cal-expand]');
    if (expandBtn) expandBtn.addEventListener('click', openCalModal);

    // Fechar modal
    var closeBtn = $('[data-kc-cal-modal-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeCalModal);
    var modalEl = $('#kcCalModal');
    if (modalEl) {
      modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeCalModal(); });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCalModal(); });

    // Render inicial + fetch
    renderCalendarAll();
    fetchEvents();
  }

  /* ── DOMContentLoaded ─────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    restoreUrlState();
    syncDateInputs(feedState.datePreset);
    bindRail();
    initCalendar();

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
