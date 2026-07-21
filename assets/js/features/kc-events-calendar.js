/* ============================================================================
   KinoCampus — kc-events-calendar.js (V76.2)
   Componente COMPARTILHADO do Calendário de Eventos (seção da sidebar + modal
   expandido). Fonte única consumida por eventos.html e index.html.

   v76.2: a consulta de eventos passou a filtrar status visível (published/closed)
   e excluir posts demo (legacy_id), e o calendário agora revalida ao vivo via
   window.KCPostFreshness + visibilitychange/focus (some deleted/hidden na hora).

   ⚑ SINCRONIZAÇÃO: este arquivo é a ÚNICA fonte do calendário. Para alterar o
     calendário (markup, comportamento, dados, categorias), edite SOMENTE este
     arquivo — e os estilos .kc-cal-* / .kc-events-calendar em styles.css. As duas
     páginas (eventos e index) refletem a mudança automaticamente, sem cópia.

   Histórico: a lógica vivia embutida em eventos.controller.js; foi extraída na
   v76.1 para permitir o mesmo calendário no /index.html, mantido em sincronia.

   Uso: posicione <div data-kc-cal-mount></div> onde o calendário deve aparecer.
        Opcional: data-kc-cal-rail="calendario" para integrar ao rail mobile da
        página de eventos (a seção vira alvo de [data-kc-eventos-section]).

   Convenções do projeto: IIFE + "use strict"; sem dependências de build; gestão
   defensiva de dependências opcionais (KCSupabase, KCSessionStore, KCOverlayLock,
   KCi18n) — a ausência de qualquer uma apenas degrada o recurso, nunca quebra.
   ========================================================================== */
(function () {
  'use strict';

  /* ── Configuração de categorias ───────────────────────── */
  var CATEGORIES = {
    sustentabilidade: { label: 'Sustentabilidade', icon: 'fas fa-leaf',               color: '#4caf50' },
    academicos:       { label: 'Acadêmicos',        icon: 'fas fa-graduation-cap',     color: '#2196f3' },
    palestras:        { label: 'Palestras',         icon: 'fas fa-microphone-lines',   color: '#3f51b5' },
    congressos:       { label: 'Congressos',        icon: 'fas fa-users-rectangle',    color: '#795548' },
    cursos:           { label: 'Cursos',            icon: 'fas fa-book-open-reader',   color: '#607d8b' },
    culturais:        { label: 'Culturais',          icon: 'fas fa-theater-masks',      color: '#9c27b0' },
    esportivos:       { label: 'Esportivos',         icon: 'fas fa-running',            color: '#ff9800' },
    workshops:        { label: 'Workshops',           icon: 'fas fa-chalkboard-teacher', color: '#00bcd4' },
    festas:           { label: 'Festas',              icon: 'fas fa-music',              color: '#e91e63' },
  };

  var MONTHS_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var DAYS_SHORT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var STORAGE_KEY = 'kc_events_calendar_month';

  /* ── Cache de sessão (SWR) ────────────────────────────── */
  // v2: invalida caches antigos que podiam conter posts deleted/hidden (antes do
  // filtro de status). Evita um flash de eventos inválidos no 1º load pós-deploy.
  var SECTION_CACHE_KEY = 'eventos:calendar:v2';
  var SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10; // 10 min
  var FOCUS_REVALIDATE_MS = 1000 * 30;           // só refaz por foco/aba se > 30s

  function getSessionStore() {
    return (window.KCSessionStore && typeof window.KCSessionStore.getStore === 'function')
      ? window.KCSessionStore.getStore()
      : null;
  }

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

  /* ── Estado do calendário ─────────────────────────────── */
  var calState = {
    view:         'month',
    year:         _now.getFullYear(),
    month:        _now.getMonth(),
    day:          _now.getDate(),
    events:       [],
    loaded:       false,
    loading:      false,
    lastFetchAt:  0,
    selectedDate: null,
  };

  var _inited     = false;  // wiring de eventos aplicado uma única vez
  var _modalReady = false;  // markup do modal injetado uma única vez

  /* ── Markup: seção da sidebar (FONTE ÚNICA) ───────────── */
  function legendMarkup() {
    return [
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#4caf50"></span><span>Sustentabilidade</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#2196f3"></span><span>Acadêmicos</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#3f51b5"></span><span>Palestras</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#795548"></span><span>Congressos</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#607d8b"></span><span>Cursos</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#9c27b0"></span><span>Culturais</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#ff9800"></span><span>Esportivos</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#00bcd4"></span><span>Workshops</span></div>',
      '<div class="kc-cal-legend-item"><span class="kc-cal-dot" style="background:#e91e63"></span><span>Festas</span></div>',
    ].join('');
  }

  function sectionInnerMarkup() {
    return [
      '<div class="kc-sidebar-section-head">',
      '  <h3><i class="fas fa-calendar-alt"></i> Calendário</h3>',
      '  <button class="kc-cal-expand-btn" type="button" data-kc-cal-expand aria-label="Expandir calendário" data-i18n-aria-label="aria-label.calendar-expand">',
      '    <i class="fas fa-expand-alt"></i> Expandir',
      '  </button>',
      '</div>',
      '<div class="kc-cal-view-tabs" role="tablist" aria-label="Modo de visualização do calendário" data-i18n-aria-label="aria-label.calendar-view">',
      '  <button class="active" type="button" role="tab" data-kc-cal-view="month" aria-selected="true">Mensal</button>',
      '  <button type="button" role="tab" data-kc-cal-view="week" aria-selected="false">Semanal</button>',
      '  <button type="button" role="tab" data-kc-cal-view="day" aria-selected="false">Diário</button>',
      '</div>',
      '<div class="kc-events-calendar" data-kc-events-calendar>',
      '  <button type="button" class="kc-cal-nav" data-kc-cal-prev aria-label="Período anterior" data-i18n-aria-label="aria-label.calendar-prev">',
      '    <i class="fas fa-chevron-left"></i>',
      '  </button>',
      '  <div class="kc-cal-display">',
      '    <i class="fas fa-calendar kc-cal-icon"></i>',
      '    <span class="kc-cal-month" data-kc-cal-month>Carregando…</span>',
      '    <button type="button" class="kc-cal-today-btn" data-kc-cal-today aria-label="Voltar para hoje" data-i18n-aria-label="aria-label.calendar-today" hidden>Hoje</button>',
      '  </div>',
      '  <button type="button" class="kc-cal-nav" data-kc-cal-next aria-label="Próximo período" data-i18n-aria-label="aria-label.calendar-next">',
      '    <i class="fas fa-chevron-right"></i>',
      '  </button>',
      '</div>',
      '<div class="kc-cal-grid" data-kc-cal-grid aria-live="polite" aria-busy="true">',
      '  <div class="kc-cal-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando calendário…</span></div>',
      '</div>',
      '<div class="kc-cal-day-detail" data-kc-cal-day-detail style="display:none;">',
      '  <div class="kc-cal-day-detail-title" data-kc-cal-day-detail-title></div>',
      '  <div class="kc-cal-day-detail-events" data-kc-cal-day-detail-events></div>',
      '</div>',
      '<div class="kc-cal-legend">',
      legendMarkup(),
      '</div>',
    ].join('');
  }

  /* ── Markup: modal expandido (FONTE ÚNICA) ────────────── */
  var MODAL_ID = 'kcCalModal';
  function modalMarkup() {
    return [
      '<div id="' + MODAL_ID + '" class="kc-cal-modal" role="dialog" aria-modal="true" aria-label="Calendário de Eventos" aria-hidden="true" data-i18n-aria-label="aria-label.calendar-modal">',
      '  <div class="kc-cal-modal-card">',
      '    <div class="kc-cal-modal-header">',
      '      <h2><i class="fas fa-calendar-alt"></i> Calendário de Eventos</h2>',
      '      <button class="kc-cal-modal-close" type="button" data-kc-cal-modal-close aria-label="Fechar" data-i18n-aria-label="aria-label.calendar-modal-close"><i class="fas fa-times"></i></button>',
      '    </div>',
      '    <div class="kc-cal-modal-controls">',
      '      <div class="kc-cal-view-tabs" role="tablist" data-kc-cal-modal-viewtabs>',
      '        <button type="button" role="tab" data-kc-cal-modal-view="month">Mensal</button>',
      '        <button type="button" role="tab" data-kc-cal-modal-view="week">Semanal</button>',
      '        <button type="button" role="tab" data-kc-cal-modal-view="day">Diário</button>',
      '      </div>',
      '      <div class="kc-events-calendar kc-events-calendar--modal">',
      '        <button type="button" class="kc-cal-nav" data-kc-cal-modal-prev aria-label="Anterior" data-i18n-aria-label="aria-label.calendar-modal-prev"><i class="fas fa-chevron-left"></i></button>',
      '        <div class="kc-cal-display"><i class="fas fa-calendar kc-cal-icon"></i><span class="kc-cal-month" data-kc-cal-month-modal>—</span><button type="button" class="kc-cal-today-btn" data-kc-cal-today aria-label="Voltar para hoje" data-i18n-aria-label="aria-label.calendar-today" hidden>Hoje</button></div>',
      '        <button type="button" class="kc-cal-nav" data-kc-cal-modal-next aria-label="Próximo" data-i18n-aria-label="aria-label.calendar-modal-next"><i class="fas fa-chevron-right"></i></button>',
      '      </div>',
      '    </div>',
      '    <div class="kc-cal-modal-body">',
      '      <div class="kc-cal-grid kc-cal-grid--modal" data-kc-cal-grid-modal></div>',
      '      <div class="kc-cal-day-detail kc-cal-day-detail--modal" data-kc-cal-day-detail-modal style="display:none;">',
      '        <div class="kc-cal-day-detail-title" data-kc-cal-day-detail-title-modal></div>',
      '        <div class="kc-cal-day-detail-events" data-kc-cal-day-detail-events-modal></div>',
      '      </div>',
      '    </div>',
      '    <div class="kc-cal-modal-legend">',
      legendMarkup(),
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
  }

  /* ── Datas do evento (início e término) ───────────────── */
  function getEventStartDate(post) {
    // Data de início. SEM fallback para created_at: um evento sem data não deve ser
    // posicionado no dia da publicação (some do calendário, em vez de aparecer errado).
    var m = post.metadata || {};
    var d = m.data_evento || m.data || null;
    if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 10);
    return null;
  }

  function getEventEndDate(post) {
    // Data de término (eventos de vários dias). Default = início (evento de um dia).
    var start = getEventStartDate(post);
    var m = post.metadata || {};
    var d = m.data_fim_evento || m.data_fim || null;
    if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) {
      var end = String(d).slice(0, 10);
      if (start && end < start) return start; // guarda contra término anterior ao início
      return end;
    }
    return start;
  }

  // Normaliza a chave de categoria para casar com CATEGORIES (cores/legenda):
  // minúsculas, sem acentos e singular → plural oficial (academico → academicos).
  function normalizeCategoryKey(raw) {
    var key = String(raw == null ? '' : raw).toLowerCase().trim();
    if (typeof key.normalize === 'function') {
      key = key.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
    }
    var ALIASES = {
      academico: 'academicos', cultural: 'culturais', esportivo: 'esportivos',
      palestra: 'palestras', congresso: 'congressos', curso: 'cursos',
      workshop: 'workshops', festa: 'festas',
    };
    return ALIASES[key] || key;
  }

  function getEventCategory(post) {
    var m = post.metadata || {};
    return normalizeCategoryKey(m.subcategoryKey || m.categoryKey || m.categoria || post.category || 'outros');
  }

  /* ── Busca eventos do Supabase ────────────────────────── */
  function restoreCachedEvents() {
    var store = getSessionStore();
    if (!store) return false;
    var cached = store.get('feed-index', SECTION_CACHE_KEY, { maxAge: SECTION_CACHE_MAX_AGE_MS });
    var events = cached && cached.value && Array.isArray(cached.value.events) ? cached.value.events : [];
    if (!events.length) return false;
    calState.events = events;
    calState.loaded = true;
    renderCalendarAll();
    return true;
  }

  function persistCachedEvents(events) {
    var store = getSessionStore();
    if (!store || typeof store.set !== 'function') return;
    store.set('feed-index', SECTION_CACHE_KEY, {
      events: Array.isArray(events) ? events.slice(0, 600) : [],
    });
  }

  function fetchEvents() {
    if (calState.loading) return;
    calState.loading = true;
    renderCalendarAll();   // mostra spinner

    var client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient() : null;

    if (!client) {
      calState.loading = false;
      calState.lastFetchAt = Date.now();
      renderCalendarAll();
      return;
    }

    client
      .from('posts')
      .select('id, title, category, metadata, created_at')
      .eq('module', 'eventos')
      .is('legacy_id', null)                  // exclui posts de exemplo/demo (igual ao feed)
      .in('status', ['published', 'closed'])  // só status visíveis — remove deleted/hidden
      .order('created_at', { ascending: false })
      // Cap reduced from 500: large scans during DB pressure cause 504/statement timeouts.
      .limit(120)
      .then(function (res) {
        if (!res.error && Array.isArray(res.data)) {
          calState.events = res.data;
          calState.loaded = true;
          persistCachedEvents(calState.events);
        }
        calState.loading = false;
        calState.lastFetchAt = Date.now();
        renderCalendarAll();
      })
      .catch(function () {
        calState.loading = false;
        renderCalendarAll();
      });
  }

  /* ── Revalidação ao vivo (frescor de posts + retomada de aba) ──
     O calendário busca uma vez e cacheia por 10 min; sem isto, deletar/esconder/
     editar/criar um evento com a página aberta não refletiria. Espelha o feed
     (kc-feed.controller.js), que assina window.KCPostFreshness e revalida ao focar. */
  var _refreshTimer = null;
  var _freshUnsub   = null;

  function scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(function run() {
      // Se um fetch está em voo, reagenda para não perder a atualização.
      if (calState.loading) { _refreshTimer = setTimeout(run, 200); return; }
      _refreshTimer = null;
      fetchEvents();
    }, 150);
  }

  function handleFreshness(change) {
    if (!change) return;
    // Só mudanças de eventos afetam o calendário (module ausente ⇒ não filtra).
    var mod = String(change.module || '').trim().toLowerCase();
    if (mod && mod !== 'eventos') return;
    // Contadores (votos etc.) e UPDATEs de realtime não precisam rebuscar o calendário.
    var changeType = String(change.type || '').trim().toLowerCase();
    var changeSource = String(change.source || '').trim().toLowerCase();
    if (
      changeType === 'metrics_updated'
      || changeType === 'vote_metrics'
      || changeType === 'metrics'
      || (
        (changeType === 'updated' || changeType === '')
        && (
          !changeSource
          || changeSource.indexOf('realtime') !== -1
          || changeSource === 'broadcast'
          || changeSource === 'remote'
        )
      )
    ) {
      return;
    }
    scheduleRefresh(); // deletar/esconder/editar/criar re-busca
  }

  function onCalendarVisible() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    // Por foco/aba, só revalida se passou tempo suficiente (frescor já cobre o resto).
    if (Date.now() - (calState.lastFetchAt || 0) < FOCUS_REVALIDATE_MS) return;
    scheduleRefresh();
  }

  function onCalendarPageShow(e) {
    if (e && e.persisted) scheduleRefresh(); // restauração de bfcache
  }

  function bindLiveRefresh() {
    if (window.KCPostFreshness && typeof window.KCPostFreshness.subscribe === 'function') {
      _freshUnsub = window.KCPostFreshness.subscribe(handleFreshness);
    }
    document.addEventListener('visibilitychange', onCalendarVisible);
    window.addEventListener('focus', onCalendarVisible);
    window.addEventListener('pageshow', onCalendarPageShow);
  }

  function destroy() {
    try { if (typeof _freshUnsub === 'function') _freshUnsub(); } catch (_) {}
    _freshUnsub = null;
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    try { document.removeEventListener('visibilitychange', onCalendarVisible); } catch (_) {}
    try { window.removeEventListener('focus', onCalendarVisible); } catch (_) {}
    try { window.removeEventListener('pageshow', onCalendarPageShow); } catch (_) {}
  }

  /* ── Filtros de data ──────────────────────────────────── */
  function eventsForDate(dateStr) {
    // Evento aparece em todos os dias do intervalo [início, término] (multi-dia).
    return calState.events.filter(function (p) {
      var start = getEventStartDate(p);
      if (!start) return false;
      var end = getEventEndDate(p) || start;
      return start <= dateStr && dateStr <= end;
    });
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
      html = '<div class="kc-cal-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando calendário…</span></div>';
    } else if (v === 'month') {
      html = renderMonthGrid(y, m);
    } else if (v === 'week') {
      html = renderWeekGrid(y, m, d);
    } else {
      html = renderDayGrid(y, m, d);
    }

    if (grid) {
      grid.setAttribute('aria-busy', calState.loading ? 'true' : 'false');
      grid.innerHTML = html;
    }
    if (modalGrid) {
      modalGrid.setAttribute('aria-busy', calState.loading ? 'true' : 'false');
      modalGrid.innerHTML = html;
    }
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

    // Botão "Hoje": aparece só quando não se está no período atual.
    var viewingToday = isViewingToday();
    $all('[data-kc-cal-today]').forEach(function (b) { b.hidden = viewingToday; });

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
    function renderDetail(detailEl, titleEl, eventsEl) {
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
      $('[data-kc-cal-day-detail-events]')
    );
    // Modal
    renderDetail(
      $('[data-kc-cal-day-detail-modal]'),
      $('[data-kc-cal-day-detail-title-modal]'),
      $('[data-kc-cal-day-detail-events-modal]')
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

  /* ── "Hoje": volta rápido ao período atual ────────────── */
  function isViewingToday() {
    var t = new Date();
    if (calState.view === 'month') {
      return calState.year === t.getFullYear() && calState.month === t.getMonth();
    }
    var todayYMD = toYMD(t.getFullYear(), t.getMonth(), t.getDate());
    if (calState.view === 'week') {
      return weekDays(calState.year, calState.month, calState.day).indexOf(todayYMD) !== -1;
    }
    return toYMD(calState.year, calState.month, calState.day) === todayYMD;
  }

  function navigateToToday() {
    var t = new Date();
    calState.year = t.getFullYear();
    calState.month = t.getMonth();
    calState.day = t.getDate();
    try {
      localStorage.setItem(STORAGE_KEY, calState.year + '-' + padZ(calState.month + 1));
    } catch (_) {}
    renderCalendarAll();
  }

  /* ── Modal expandido ──────────────────────────────────── */
  var _modalReturnFocus = null; // elemento que abriu o modal (foco volta ao fechar)

  function openCalModal() {
    var modal = $('#' + MODAL_ID);
    if (!modal) return;
    // Guarda o foco atual ANTES de qualquer mudança (devolvido no fechamento).
    _modalReturnFocus = (typeof document !== 'undefined' && document.activeElement) || null;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    // Usa KCOverlayLock para garantir scroll lock correto no iOS Safari:
    // salva scrollY, aplica position:fixed no body, restaura ao fechar.
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('eventos-cal-modal');
    }
    syncModalViewTabs();
    renderCalendarAll();
    // Move o foco para dentro do modal (acessibilidade de teclado).
    var closeBtn = $('[data-kc-cal-modal-close]');
    if (closeBtn && typeof closeBtn.focus === 'function') { try { closeBtn.focus(); } catch (_) {} }
  }

  function closeCalModal() {
    var modal = $('#' + MODAL_ID);
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
      window.KCOverlayLock.unlock('eventos-cal-modal');
    }
    // Devolve o foco ao elemento que abriu o modal (ex.: botão "Expandir").
    if (_modalReturnFocus && typeof _modalReturnFocus.focus === 'function') {
      try { _modalReturnFocus.focus(); } catch (_) {}
    }
    _modalReturnFocus = null;
  }

  // Focus trap: mantém o Tab/Shift+Tab dentro do modal enquanto aberto.
  function trapModalFocus(e) {
    if (e.key !== 'Tab') return;
    var modal = $('#' + MODAL_ID);
    if (!modal || !modal.classList.contains('is-open')) return;
    var focusables = $all('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter(function (el) { return !el.disabled && !el.hidden; });
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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

  /* ── i18n: reaplica em markup injetado dinamicamente ──── */
  function applyI18n(root) {
    if (!window.KCi18n) return;
    try {
      if (typeof window.KCi18n.applyAriaLabels === 'function') window.KCi18n.applyAriaLabels(root);
      if (typeof window.KCi18n.applyTooltips === 'function') window.KCi18n.applyTooltips(root);
    } catch (_) {}
  }

  /* ── Injeta o modal expandido no body (uma única vez) ─── */
  function ensureModal() {
    if (_modalReady || document.getElementById(MODAL_ID)) { _modalReady = true; return; }
    var wrap = document.createElement('div');
    wrap.innerHTML = modalMarkup();
    var modal = wrap.firstElementChild;
    if (!modal) return;
    document.body.appendChild(modal);
    _modalReady = true;
    applyI18n(modal);
  }

  /* ── Wiring de eventos (uma única vez) ────────────────── */
  function init() {
    if (_inited) return;
    _inited = true;

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

    // Botão "Hoje" (sidebar + modal)
    $all('[data-kc-cal-today]').forEach(function (b) {
      b.addEventListener('click', navigateToToday);
    });

    // Expand btn
    var expandBtn = $('[data-kc-cal-expand]');
    if (expandBtn) expandBtn.addEventListener('click', openCalModal);

    // Fechar modal
    var closeBtn = $('[data-kc-cal-modal-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeCalModal);
    var modalEl = $('#' + MODAL_ID);
    if (modalEl) {
      modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeCalModal(); });
      modalEl.addEventListener('keydown', trapModalFocus); // focus trap (a11y)
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCalModal(); });

    // Render inicial + fetch (tenta cache primeiro para resposta imediata)
    renderCalendarAll();
    restoreCachedEvents();
    fetchEvents();

    // Mantém o calendário em sincronia com mudanças de posts e retorno de aba.
    bindLiveRefresh();
  }

  /* ── Mount: prepara um ponto de montagem e inicializa ─── */
  function mount(el) {
    if (!el || el.getAttribute('data-kc-cal-mounted') === '1') return;
    el.setAttribute('data-kc-cal-mounted', '1');
    el.classList.add('kc-sidebar-section', 'kc-sidebar-section--cal');
    var rail = el.getAttribute('data-kc-cal-rail');
    if (rail) el.setAttribute('data-kc-eventos-section', rail);
    el.innerHTML = sectionInnerMarkup();
    applyI18n(el);
    ensureModal();
    init();
  }

  /* ── Auto-mount: encontra pontos de montagem na página ── */
  function autoMount() {
    var mounts = $all('[data-kc-cal-mount]');
    if (mounts.length) {
      mounts.forEach(mount);
      return;
    }
    // Fallback: markup já presente inline (compatibilidade) — só faz o wiring.
    if ($('[data-kc-cal-grid]')) {
      ensureModal();
      init();
    }
  }

  /* ── API pública ──────────────────────────────────────── */
  window.KCEventsCalendar = {
    version: '76.2',
    mount: mount,
    init: init,
    refresh: fetchEvents,
    open: openCalModal,
    close: closeCalModal,
    destroy: destroy,
    isReady: function () { return _inited; },
  };

  /* ── Boot ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
