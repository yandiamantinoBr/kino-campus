(function () {
  'use strict';

  const state = {
    data: null,
    loading: false,
    recentPage: 1,
    recentPageSize: 25,
    recentQuery: '',
  };

  const EVENT_LABELS = Object.freeze({
    all: 'Todos os eventos',
    search: 'Buscas',
    category_click: 'Cliques em categorias',
    post_open: 'Aberturas de posts',
    banner_impression: 'Impressões de banners',
    banner_click: 'Cliques em banners',
    help_open: 'Aberturas da ajuda',
    help_submit: 'Pedidos de ajuda',
    report_submit: 'Denúncias enviadas',
  });

  const INVENTORY_ROWS = Object.freeze([
    {
      name: 'kc_consent_v1',
      storage: 'localStorage',
      purpose: 'Guarda escolhas de consentimento no navegador.',
      consent: 'Necessário',
      retention: 'Até alteração pelo usuário',
      admin: 'Privacidade e Analytics',
    },
    {
      name: 'Supabase Auth session',
      storage: 'Storage interno do supabase-js',
      purpose: 'Mantém login, refresh token e sessão autenticada.',
      consent: 'Necessário',
      retention: 'Enquanto a sessão existir',
      admin: 'Não exporta tokens',
    },
    {
      name: 'kc_search_session_id',
      storage: 'sessionStorage',
      purpose: 'Agrupa buscas da mesma sessão sem identificar pessoa.',
      consent: 'Analytics',
      retention: 'Sessão do navegador',
      admin: 'Dashboard e Privacidade',
    },
    {
      name: 'kc_search_preferences_v1',
      storage: 'localStorage',
      purpose: 'Guarda escolhas explícitas e o modo de personalização de busca.',
      consent: 'Personalização',
      retention: 'Até alteração ou exclusão pelo titular',
      admin: 'Somente no navegador',
    },
    {
      name: 'kc_search_affinity_v1',
      storage: 'localStorage',
      purpose: 'Agrega cliques consentidos por módulo/assunto canônico, sem consultas.',
      consent: 'Personalização — opt-in separado',
      retention: 'TTL de 90 dias com decaimento local',
      admin: 'Somente no navegador',
    },
    {
      name: 'kc_home_category_*',
      storage: 'localStorage',
      purpose: 'Personaliza categorias e registra afinidade agregada.',
      consent: 'Analytics',
      retention: 'Local com TTL operacional',
      admin: 'Privacidade e Analytics',
    },
    {
      name: 'kc_nav_module_affinity_v1',
      storage: 'localStorage',
      purpose: 'Guarda afinidade local de cliques no menu principal.',
      consent: 'Analytics',
      retention: 'Local com TTL operacional',
      admin: 'Navegacao principal',
    },
    {
      name: 'kc:navLinksOrder:v1',
      storage: 'sessionStorage',
      purpose: 'Cache de 10 minutos da ordem calculada do menu principal.',
      consent: 'Operacional',
      retention: 'Sessao do navegador',
      admin: 'Navegacao principal',
    },
    {
      name: 'privacy_analytics_events',
      storage: 'Supabase',
      purpose: 'Eventos opcionais agregáveis para admin.',
      consent: 'Analytics',
      retention: '6 meses',
      admin: 'Privacidade e Analytics',
    },
    {
      name: 'privacy_consent_events',
      storage: 'Supabase',
      purpose: 'Histórico agregado de aceite/rejeição, sem cookies crus.',
      consent: 'Necessário',
      retention: '6 meses',
      admin: 'Privacidade e Analytics',
    },
  ]);

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value) {
    return toNumber(value).toLocaleString('pt-BR');
  }

  function formatPercent(value) {
    return toNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function eventLabel(eventName) {
    return EVENT_LABELS[eventName] || eventName || '-';
  }

  function entityLabel(row) {
    if (!row || !row.entity_type) return '-';
    return row.entity_type + ':' + (row.entity_id || '-');
  }

  function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - Math.max(1, Number(days) || 30));
    return date.toISOString();
  }

  function showLoading(active) {
    state.loading = !!active;
    const loading = $('#admin-loading');
    const content = $('#admin-content');
    if (loading) loading.style.display = active ? 'flex' : 'none';
    if (content) content.style.display = active ? 'none' : 'block';
  }

  function showError(message) {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = String(message || 'Não foi possível carregar privacidade e analytics.');
    error.style.display = 'block';
  }

  function clearError() {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = '';
    error.style.display = 'none';
  }

  function getClient() {
    return window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
  }

  async function checkAccess() {
    const driver = window.KC_ENV && window.KC_ENV.driver ? window.KC_ENV.driver : 'local';
    if (driver === 'local') return true;
    if (driver !== 'supabase') {
      showError('Este painel requer driver=supabase.');
      return false;
    }

    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') {
      showError('API de autenticação indisponível.');
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      showError('Você precisa estar autenticado para acessar este painel.');
      return false;
    }

    const client = getClient();
    if (!client) {
      showError('Supabase client não disponível.');
      return false;
    }

    const profileResult = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileResult && profileResult.error) {
      showError('Não foi possível validar seu acesso administrativo.');
      return false;
    }

    if (!profileResult.data || profileResult.data.is_admin !== true) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.');
      return false;
    }

    return true;
  }

  function readFilters() {
    const days = Number($('#privacyPeriodFilter')?.value || 30) || 30;
    return {
      days,
      since: daysAgo(days),
      eventName: $('#privacyEventFilter')?.value || 'all',
      pagePath: String($('#privacyPageFilter')?.value || '').trim() || 'all',
      moduleKey: $('#privacyModuleFilter')?.value || 'all',
      limit: 1000,
      offset: 0,
    };
  }

  function isMissingRpcError(error) {
    const code = String(error && error.code || '').trim();
    const message = String(error && (error.message || error.details || error.hint) || '').toLowerCase();
    return code === 'PGRST202'
      || code === '42883'
      || (message.includes('kc_admin_privacy_analytics') && message.includes('schema cache'))
      || (message.includes('could not find the function') && message.includes('kc_admin_privacy_analytics'));
  }

  function isMissingTableError(error) {
    const code = String(error && error.code || '').trim();
    const message = String(error && (error.message || error.details || error.hint) || '').toLowerCase();
    return code === '42P01'
      || code === 'PGRST205'
      || message.includes('could not find the table')
      || message.includes('does not exist');
  }

  function matchesFilters(row, filters) {
    if (!row || !filters) return false;
    if (filters.eventName && filters.eventName !== 'all' && row.event_name !== filters.eventName) return false;
    if (filters.pagePath && filters.pagePath !== 'all' && row.page_path !== filters.pagePath) return false;
    if (filters.moduleKey && filters.moduleKey !== 'all' && row.module_key !== filters.moduleKey) return false;
    return true;
  }

  function sessionKey(row, index) {
    return String(row.session_hash || row.session_id || row.session || row.id || ('row-' + index));
  }

  function aggregateEventRows(rows, consentRows, filters, options) {
    const sourceRows = (Array.isArray(rows) ? rows : []).filter(function (row) {
      return matchesFilters(row, filters);
    });
    const eventMap = new Map();
    const pageMap = new Map();
    const bannerMap = new Map();
    const sessions = new Set();

    sourceRows.forEach(function (row, index) {
      const eventName = String(row.event_name || 'unknown');
      const pagePath = String(row.page_path || '-');
      const session = sessionKey(row, index);
      sessions.add(session);

      if (!eventMap.has(eventName)) eventMap.set(eventName, { event_name: eventName, events: 0, sessionsSet: new Set() });
      const eventEntry = eventMap.get(eventName);
      eventEntry.events += 1;
      eventEntry.sessionsSet.add(session);

      if (!pageMap.has(pagePath)) pageMap.set(pagePath, { page_path: pagePath, events: 0, sessionsSet: new Set() });
      const pageEntry = pageMap.get(pagePath);
      pageEntry.events += 1;
      pageEntry.sessionsSet.add(session);

      if (row.entity_type === 'banner') {
        const key = String(row.entity_id || (row.metadata && row.metadata.entity_label) || 'banner');
        if (!bannerMap.has(key)) {
          bannerMap.set(key, { entity_id: key, label: key || 'Banner', impressions: 0, clicks: 0, ctr: 0 });
        }
        const bannerEntry = bannerMap.get(key);
        if (row.metadata && row.metadata.entity_label) bannerEntry.label = row.metadata.entity_label;
        if (eventName === 'banner_impression') bannerEntry.impressions += 1;
        if (eventName === 'banner_click') bannerEntry.clicks += 1;
      }
    });

    const byEvent = Array.from(eventMap.values()).map(function (row) {
      return { event_name: row.event_name, events: row.events, sessions: row.sessionsSet.size };
    }).sort(function (left, right) {
      return right.events - left.events || String(left.event_name).localeCompare(String(right.event_name), 'pt-BR');
    });

    const byPage = Array.from(pageMap.values()).map(function (row) {
      return { page_path: row.page_path, events: row.events, sessions: row.sessionsSet.size };
    }).sort(function (left, right) {
      return right.events - left.events || String(left.page_path).localeCompare(String(right.page_path), 'pt-BR');
    }).slice(0, 30);

    const banners = Array.from(bannerMap.values()).map(function (row) {
      const impressions = Number(row.impressions) || 0;
      const clicks = Number(row.clicks) || 0;
      return Object.assign({}, row, {
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      });
    }).sort(function (left, right) {
      return right.ctr - left.ctr || right.clicks - left.clicks || right.impressions - left.impressions;
    });

    const consentList = Array.isArray(consentRows) ? consentRows : [];
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      since: filters.since,
      totals: {
        events: sourceRows.length,
        sessions: sessions.size,
        searches: sourceRows.filter(function (row) { return row.event_name === 'search'; }).length,
        banner_impressions: sourceRows.filter(function (row) { return row.event_name === 'banner_impression'; }).length,
        banner_clicks: sourceRows.filter(function (row) { return row.event_name === 'banner_click'; }).length,
        help_submits: sourceRows.filter(function (row) { return row.event_name === 'help_submit'; }).length,
        report_submits: sourceRows.filter(function (row) { return row.event_name === 'report_submit'; }).length,
      },
      consent: {
        updates: consentList.length,
        analytics_accepted: consentList.filter(function (row) { return row.analytics_enabled === true || row.analytics === true; }).length,
        analytics_rejected: consentList.filter(function (row) { return row.analytics_enabled === false || row.analytics === false; }).length,
        preferences_accepted: consentList.filter(function (row) { return row.preferences_enabled === true || row.preferences === true; }).length,
      },
      by_event: byEvent,
      by_page: byPage,
      banners,
      rows: sourceRows.slice(0, filters.limit),
      filters,
      source_mode: options && options.sourceMode || 'rpc',
      notice: options && options.notice || '',
    };
  }

  async function loadDataViaRpcFallbackAware(client, filters) {
    if (!client || typeof client.rpc !== 'function') throw new Error('Supabase client indisponivel.');
    const response = await client.rpc('kc_admin_privacy_analytics', {
      p_since: filters.since,
      p_event_name: filters.eventName,
      p_page_path: filters.pagePath,
      p_module_key: filters.moduleKey,
      p_limit: filters.limit,
      p_offset: filters.offset,
    });
    if (response && response.error) throw response.error;
    const data = response && response.data ? response.data : null;
    if (!data || data.ok === false) {
      const code = data && data.code ? data.code : 'RPC_UNAVAILABLE';
      throw new Error(code === 'FORBIDDEN'
        ? 'A RPC retornou acesso negado para este usuario.'
        : 'A RPC de privacidade ainda nao esta disponivel. Rode a migration v9.3.5.16 no Supabase.');
    }
    return Object.assign({}, data, { filters, source_mode: 'rpc' });
  }

  async function loadDirectPrivacyRows(client, filters) {
    try {
      let query = client
        .from('privacy_analytics_events')
        .select('created_at,event_name,page_path,entity_type,entity_id,module_key,metadata,session_hash')
        .gte('created_at', filters.since)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(filters.limit, 1000)));
      if (filters.eventName !== 'all') query = query.eq('event_name', filters.eventName);
      if (filters.pagePath !== 'all') query = query.eq('page_path', filters.pagePath);
      if (filters.moduleKey !== 'all') query = query.eq('module_key', filters.moduleKey);
      const result = await query;
      if (result && result.error) {
        if (isMissingTableError(result.error)) return null;
        throw result.error;
      }

      let consentRows = [];
      try {
        const consentResult = await client
          .from('privacy_consent_events')
          .select('created_at,preferences_enabled,analytics_enabled')
          .gte('created_at', filters.since)
          .limit(5000);
        if (consentResult && !consentResult.error && Array.isArray(consentResult.data)) {
          consentRows = consentResult.data;
        }
      } catch (_) { }

      return aggregateEventRows(result && result.data || [], consentRows, filters, {
        sourceMode: 'direct_privacy_tables',
        notice: 'RPC ausente; usando tabelas de privacidade diretamente.',
      });
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async function safeSelectRows(builder) {
    try {
      const result = await builder();
      if (result && result.error) return [];
      return Array.isArray(result && result.data) ? result.data : [];
    } catch (_) {
      return [];
    }
  }

  async function loadLegacyAnalyticsRows(client, filters) {
    const rows = [];
    const includeSearch = filters.eventName === 'all' || filters.eventName === 'search';
    const includeViews = filters.eventName === 'all' || filters.eventName === 'post_open';
    const pageAllowsSearch = filters.pagePath === 'all' || filters.pagePath === 'search-results.html';
    const pageAllowsViews = filters.pagePath === 'all' || filters.pagePath === '_product.html' || filters.pagePath === 'product.html';

    if (includeSearch && pageAllowsSearch && filters.moduleKey === 'all') {
      const searchRows = await safeSelectRows(function () {
        return client
          .from('search_queries')
          .select('id,term,session_id,created_at')
          .gte('created_at', filters.since)
          .order('created_at', { ascending: false })
          .limit(Math.max(1, Math.min(filters.limit, 1000)));
      });
      searchRows.forEach(function (row) {
        rows.push({
          created_at: row.created_at,
          event_name: 'search',
          page_path: 'search-results.html',
          entity_type: 'search',
          entity_id: row.term || '',
          module_key: '',
          metadata: { source_table: 'search_queries' },
          session_hash: row.session_id || row.id || '',
        });
      });
    }

    if (includeViews && pageAllowsViews) {
      let viewRows = await safeSelectRows(function () {
        return client
          .from('post_view_events')
          .select('id,post_id,session_id,created_at,posts(module,title)')
          .gte('created_at', filters.since)
          .order('created_at', { ascending: false })
          .limit(Math.max(1, Math.min(filters.limit, 1000)));
      });
      if (!viewRows.length) {
        viewRows = await safeSelectRows(function () {
          return client
            .from('post_view_events')
            .select('id,post_id,session_id,created_at')
            .gte('created_at', filters.since)
            .order('created_at', { ascending: false })
            .limit(Math.max(1, Math.min(filters.limit, 1000)));
        });
      }
      viewRows.forEach(function (row) {
        const post = row.posts && !Array.isArray(row.posts) ? row.posts : {};
        const moduleKey = String(post.module || '');
        if (filters.moduleKey !== 'all' && moduleKey !== filters.moduleKey) return;
        rows.push({
          created_at: row.created_at,
          event_name: 'post_open',
          page_path: '_product.html',
          entity_type: 'post',
          entity_id: row.post_id || '',
          module_key: moduleKey,
          metadata: { source_table: 'post_view_events', post_title: post.title || '' },
          session_hash: row.session_id || row.id || '',
        });
      });
    }

    rows.sort(function (left, right) {
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });

    const data = aggregateEventRows(rows, [], filters, {
      sourceMode: 'legacy_fallback',
      notice: 'Migration/RPC de privacidade pendente; exibindo compatibilidade com buscas e views existentes.',
    });

    if (filters.eventName === 'all' || filters.eventName === 'banner_impression' || filters.eventName === 'banner_click') {
      const bannerRows = await safeSelectRows(function () {
        return client
          .from('hero_banners')
          .select('id,title,is_active,sort_order')
          .order('sort_order', { ascending: true })
          .limit(50);
      });
      if (bannerRows.length && !data.banners.length) {
        data.banners = bannerRows.map(function (banner) {
          return {
            entity_id: banner.id,
            label: banner.title || 'Banner',
            impressions: 0,
            clicks: 0,
            ctr: 0,
          };
        });
      }
    }

    return data;
  }

  async function loadData() {
    const client = getClient();
    const filters = readFilters();
    if (!client) {
      return aggregateEventRows([], [], filters, {
        sourceMode: 'no_client',
        notice: 'Supabase client indisponivel; exibindo inventario local.',
      });
    }
    try {
      return await loadDataViaRpcFallbackAware(client, filters);
    } catch (error) {
      if (!isMissingRpcError(error)) {
        console.warn('[Admin Privacy Analytics] RPC falhou; tentando fallback:', error && error.message || error);
      }
    }

    const direct = await loadDirectPrivacyRows(client, filters);
    if (direct) return direct;
    return loadLegacyAnalyticsRows(client, filters);
  }

  function metricCard(icon, label, value, subtitle) {
    return [
      '<article class="kc-privacy-metric">',
      '<span><i class="' + esc(icon) + '"></i> ' + esc(label) + '</span>',
      '<strong>' + esc(value) + '</strong>',
      subtitle ? '<small>' + esc(subtitle) + '</small>' : '',
      '</article>',
    ].join('');
  }

  function renderSummary(data) {
    const totals = data && data.totals ? data.totals : {};
    const consent = data && data.consent ? data.consent : {};
    const impressions = toNumber(totals.banner_impressions);
    const clicks = toNumber(totals.banner_clicks);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const target = $('#privacySummary');
    if (!target) return;
    target.innerHTML = [
      metricCard('fas fa-chart-simple', 'Eventos opcionais', formatNumber(totals.events), 'com consentimento analytics'),
      metricCard('fas fa-users-viewfinder', 'Sessões agregadas', formatNumber(totals.sessions), 'sem identificação individual'),
      metricCard('fas fa-magnifying-glass', 'Buscas', formatNumber(totals.searches), 'tabela search_queries'),
      metricCard('fas fa-images', 'CTR banners', formatPercent(ctr), formatNumber(clicks) + ' cliques / ' + formatNumber(impressions) + ' impressões'),
      metricCard('fas fa-check-circle', 'Aceites analytics', formatNumber(consent.analytics_accepted), 'histórico agregado'),
      metricCard('fas fa-ban', 'Rejeições analytics', formatNumber(consent.analytics_rejected), 'opcionais bloqueados'),
    ].join('');
  }

  function renderInventory() {
    const target = $('#privacyStorageInventory');
    if (!target) return;
    target.innerHTML = INVENTORY_ROWS.map(function (row) {
      return [
        '<tr>',
        '<td><strong>' + esc(row.name) + '</strong></td>',
        '<td>' + esc(row.storage) + '</td>',
        '<td>' + esc(row.purpose) + '</td>',
        '<td>' + esc(row.consent) + '</td>',
        '<td>' + esc(row.retention) + '</td>',
        '<td>' + esc(row.admin) + '</td>',
        '</tr>',
      ].join('');
    }).join('');
  }

  function renderRows(containerId, rows, columns, emptyMessage) {
    const target = $('#' + containerId);
    if (!target) return;
    if (!Array.isArray(rows) || !rows.length) {
      target.innerHTML = '<tr><td colspan="' + columns.length + '" class="kc-admin-empty">' + esc(emptyMessage || 'Sem dados no período.') + '</td></tr>';
      return;
    }
    target.innerHTML = rows.map(function (row) {
      return '<tr>' + columns.map(function (column) {
        const raw = typeof column.value === 'function' ? column.value(row) : row[column.value];
        return '<td>' + esc(raw == null ? '-' : raw) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function resetRecentPagination() {
    state.recentPage = 1;
  }

  function getFilteredEventRows(data) {
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    const query = normalizeSearchText(state.recentQuery);
    if (!query) return rows;
    return rows.filter(function (row) {
      const haystack = [
        formatDateTime(row.created_at),
        eventLabel(row.event_name),
        row.event_name || '',
        row.page_path || '',
        row.module_key || '',
        entityLabel(row),
        row.metadata && row.metadata.entity_label || '',
        row.metadata && row.metadata.post_title || '',
        row.metadata && row.metadata.source_table || '',
      ].map(normalizeSearchText).join(' ');
      return haystack.includes(query);
    });
  }

  function getPagedEventRows(data) {
    const rows = getFilteredEventRows(data);
    const pageSize = Math.max(1, Math.min(100, Number(state.recentPageSize) || 25));
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(Number(state.recentPage) || 1, totalPages));
    if (page !== state.recentPage) state.recentPage = page;
    const startIndex = (page - 1) * pageSize;
    const pageRows = rows.slice(startIndex, startIndex + pageSize);
    return {
      rows: pageRows,
      total,
      page,
      pageSize,
      totalPages,
      start: total ? startIndex + 1 : 0,
      end: total ? startIndex + pageRows.length : 0,
    };
  }

  function renderEventLog(data) {
    const page = getPagedEventRows(data);
    renderRows('privacyEventLogBody', page.rows, [
      { value: function (row) { return formatDateTime(row.created_at); } },
      { value: function (row) { return eventLabel(row.event_name); } },
      { value: 'page_path' },
      { value: 'module_key' },
      { value: function (row) { return entityLabel(row); } },
    ], state.recentQuery ? 'Nenhum evento corresponde ao filtro local.' : 'Sem eventos detalhados.');

    const count = $('#privacyEventLogCount');
    if (count) {
      count.textContent = 'Mostrando ' + formatNumber(page.start) + '-' + formatNumber(page.end) + ' de ' + formatNumber(page.total);
    }
    const prev = $('#privacyEventLogPrev');
    const next = $('#privacyEventLogNext');
    if (prev) prev.disabled = page.page <= 1;
    if (next) next.disabled = page.page >= page.totalPages;
  }

  function renderData(data) {
    const byEvent = Array.isArray(data.by_event) ? data.by_event : [];
    const byPage = Array.isArray(data.by_page) ? data.by_page : [];
    const banners = Array.isArray(data.banners) ? data.banners : [];
    renderSummary(data);
    renderInventory();
    renderRows('privacyEventsBody', byEvent, [
      { value: function (row) { return eventLabel(row.event_name); } },
      { value: function (row) { return formatNumber(row.events); } },
      { value: function (row) { return formatNumber(row.sessions); } },
    ], 'Nenhum evento opcional registrado.');

    renderRows('privacyPagesBody', byPage, [
      { value: 'page_path' },
      { value: function (row) { return formatNumber(row.events); } },
      { value: function (row) { return formatNumber(row.sessions); } },
    ], 'Nenhuma página agregada no período.');

    renderRows('privacyBannersBody', banners, [
      { value: function (row) { return row.label || row.entity_id || 'Banner'; } },
      { value: function (row) { return formatNumber(row.impressions); } },
      { value: function (row) { return formatNumber(row.clicks); } },
      { value: function (row) { return formatPercent(row.ctr); } },
    ], 'Nenhuma métrica de banner registrada.');

    renderEventLog(data);

    const updated = $('#privacyLastSync');
    if (updated) {
      const suffix = data && data.notice ? ' - ' + data.notice : '';
      updated.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR') + suffix;
    }
  }

  function exportRows(data) {
    const rows = getFilteredEventRows(data);
    return rows.map(function (row) {
      return {
        criado_em: formatDateTime(row.created_at),
        evento: eventLabel(row.event_name),
        chave_evento: row.event_name || '',
        pagina: row.page_path || '',
        modulo: row.module_key || '',
        entidade: entityLabel(row),
      };
    });
  }

  function buildExportFilename(ext) {
    const days = state.data && state.data.filters ? state.data.filters.days : 30;
    return 'kc-privacidade-analytics-' + days + 'd-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  }

  function buildPrivacyExportReport() {
    const data = state.data || {};
    const totals = data.totals || {};
    const consent = data.consent || {};
    const filters = data.filters || readFilters();
    const eventRows = exportRows(data);
    const noticeRows = [];
    if (data.notice) noticeRows.push({ aviso: data.notice });
    if (state.recentQuery) {
      noticeRows.push({ aviso: 'Eventos recentes filtrados localmente por: ' + state.recentQuery });
    }
    return {
      title: 'KinoCampus - Relatório de Privacidade e Analytics',
      subtitle: 'Métricas agregadas, consentimento, inventário e eventos opcionais filtrados',
      source: 'admin/privacy-analytics.html (' + (data.source_mode || 'indisponível') + ')',
      filters: {
        período_dias: filters.days || 30,
        desde: filters.since || '',
        evento: filters.eventName === 'all' ? 'Todos os eventos' : eventLabel(filters.eventName),
        página: filters.pagePath || 'all',
        módulo: filters.moduleKey || 'all',
        filtro_eventos_recentes: state.recentQuery || 'Sem filtro local',
      },
      kpis: [
        { label: 'Eventos opcionais', value: totals.events || 0, context: 'Com consentimento analytics' },
        { label: 'Sessões agregadas', value: totals.sessions || 0, context: 'Sem identificação individual' },
        { label: 'Buscas', value: totals.searches || 0, context: 'Eventos de busca no período' },
        { label: 'Impressões de banners', value: totals.banner_impressions || 0, context: 'Eventos banner_impression' },
        { label: 'Cliques em banners', value: totals.banner_clicks || 0, context: 'Eventos banner_click' },
        { label: 'Consentimentos registrados', value: consent.updates || 0, context: 'Histórico agregado' },
        { label: 'Analytics aceitos', value: consent.analytics_accepted || 0, context: 'Consentimento opcional aceito' },
        { label: 'Analytics rejeitados', value: consent.analytics_rejected || 0, context: 'Consentimento opcional recusado' },
      ],
      sections: [
        {
          title: 'Eventos por tipo',
          rows: data.by_event || [],
          columns: [
            { key: 'event_name', label: 'Evento' },
            { key: 'events', label: 'Eventos' },
            { key: 'sessions', label: 'Sessões' },
          ],
        },
        {
          title: 'Páginas',
          rows: data.by_page || [],
          columns: [
            { key: 'page_path', label: 'Página' },
            { key: 'events', label: 'Eventos' },
            { key: 'sessions', label: 'Sessões' },
          ],
        },
        {
          title: 'Banners',
          rows: data.banners || [],
          columns: [
            { key: 'label', label: 'Banner' },
            { key: 'impressions', label: 'Impressões' },
            { key: 'clicks', label: 'Cliques' },
            { key: 'ctr', label: 'CTR (%)' },
          ],
        },
        {
          title: 'Eventos recentes',
          rows: eventRows,
          pdfColumns: [
            { key: 'criado_em', label: 'Quando' },
            { key: 'evento', label: 'Evento' },
            { key: 'pagina', label: 'Página' },
            { key: 'modulo', label: 'Módulo' },
          ],
          xlsxColumns: [
            { key: 'criado_em', label: 'Quando' },
            { key: 'evento', label: 'Evento' },
            { key: 'chave_evento', label: 'Chave do evento' },
            { key: 'pagina', label: 'Página' },
            { key: 'modulo', label: 'Módulo' },
            { key: 'entidade', label: 'Entidade' },
          ],
          maxPdfRows: 40,
        },
        {
          title: 'Inventário de cookies e armazenamento',
          rows: INVENTORY_ROWS,
          pdfColumns: [
            { key: 'name', label: 'Nome' },
            { key: 'storage', label: 'Armazenamento' },
            { key: 'consent', label: 'Consentimento' },
            { key: 'retention', label: 'Retenção' },
          ],
          xlsxColumns: [
            { key: 'name', label: 'Nome' },
            { key: 'storage', label: 'Armazenamento' },
            { key: 'purpose', label: 'Finalidade' },
            { key: 'consent', label: 'Consentimento' },
            { key: 'retention', label: 'Retenção' },
            { key: 'admin', label: 'Uso no admin' },
          ],
          maxPdfRows: 20,
        },
        {
          title: 'Avisos',
          rows: noticeRows,
          columns: [{ key: 'aviso', label: 'Aviso' }],
          maxPdfRows: 10,
        },
      ],
    };
  }

  async function handleExportXLSX() {
    if (!state.data || !window.KCAdminExport) return;
    if (typeof window.KCAdminExport.exportReportXLSX === 'function') {
      return window.KCAdminExport.exportReportXLSX(buildExportFilename('xlsx'), buildPrivacyExportReport());
    }
    const totals = state.data.totals || {};
    const consent = state.data.consent || {};
    await window.KCAdminExport.exportXLSX(buildExportFilename('xlsx'), [
      {
        name: 'Resumo',
        rows: [{
          eventos: totals.events || 0,
          sessoes: totals.sessions || 0,
          buscas: totals.searches || 0,
          impressões_banners: totals.banner_impressions || 0,
          cliques_banners: totals.banner_clicks || 0,
          consentimentos: consent.updates || 0,
          analytics_aceitos: consent.analytics_accepted || 0,
          analytics_rejeitados: consent.analytics_rejected || 0,
        }],
      },
      { name: 'Eventos', rows: state.data.by_event || [] },
      { name: 'Páginas', rows: state.data.by_page || [] },
      { name: 'Banners', rows: state.data.banners || [] },
      { name: 'Detalhado', rows: exportRows(state.data) },
      { name: 'Inventário', rows: INVENTORY_ROWS },
    ]);
  }

  async function handleExportPDF() {
    if (!state.data || !window.KCAdminExport) return;
    if (typeof window.KCAdminExport.exportReportPDF === 'function') {
      return window.KCAdminExport.exportReportPDF(buildExportFilename('pdf'), buildPrivacyExportReport());
    }
    const totals = state.data.totals || {};
    const consent = state.data.consent || {};
    await window.KCAdminExport.exportPDF(buildExportFilename('pdf'), 'KinoCampus - Privacidade e Analytics', [
      {
        title: 'Resumo',
        rows: [{
          eventos: totals.events || 0,
          sessoes: totals.sessions || 0,
          buscas: totals.searches || 0,
          banners: (totals.banner_clicks || 0) + ' cliques / ' + (totals.banner_impressions || 0) + ' impressões',
          consentimento: (consent.analytics_accepted || 0) + ' aceites / ' + (consent.analytics_rejected || 0) + ' rejeições',
        }],
      },
      { title: 'Eventos por tipo', rows: state.data.by_event || [] },
      { title: 'Banners', rows: state.data.banners || [] },
      { title: 'Inventário', rows: INVENTORY_ROWS },
    ]);
  }

  function setExportEnabled(enabled) {
    const xlsx = $('#privacyExportXlsx');
    const pdf = $('#privacyExportPdf');
    if (xlsx) xlsx.disabled = !enabled;
    if (pdf) pdf.disabled = !enabled;
  }

  async function refresh() {
    if (state.loading) return;
    clearError();
    showLoading(true);
    setExportEnabled(false);
    try {
      const ok = await checkAccess();
      if (!ok) return;
      state.data = await loadData();
      renderData(state.data);
      setExportEnabled(true);
    } catch (error) {
      console.error('[Admin Privacy Analytics]', error);
      showError(error && error.message ? error.message : 'Não foi possível carregar privacidade e analytics.');
      renderInventory();
    } finally {
      showLoading(false);
    }
  }

  function bindEvents() {
    const refreshButton = $('#privacyRefreshButton');
    if (refreshButton) refreshButton.addEventListener('click', function () {
      resetRecentPagination();
      refresh();
    });
    const xlsx = $('#privacyExportXlsx');
    if (xlsx) xlsx.addEventListener('click', function () { handleExportXLSX().catch(console.error); });
    const pdf = $('#privacyExportPdf');
    if (pdf) pdf.addEventListener('click', function () { handleExportPDF().catch(console.error); });
    ['privacyPeriodFilter', 'privacyEventFilter', 'privacyModuleFilter'].forEach(function (id) {
      const el = $('#' + id);
      if (el) el.addEventListener('change', function () {
        resetRecentPagination();
        refresh();
      });
    });
    const page = $('#privacyPageFilter');
    if (page) {
      let timer = null;
      page.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          resetRecentPagination();
          refresh();
        }, 350);
      });
    }
    const recentSearch = $('#privacyEventLogSearch');
    if (recentSearch) {
      recentSearch.addEventListener('input', function () {
        state.recentQuery = String(recentSearch.value || '').trim();
        resetRecentPagination();
        if (state.data) renderEventLog(state.data);
      });
    }
    const pageSize = $('#privacyEventLogPageSize');
    if (pageSize) {
      state.recentPageSize = Number(pageSize.value || 25) || 25;
      pageSize.addEventListener('change', function () {
        state.recentPageSize = Number(pageSize.value || 25) || 25;
        resetRecentPagination();
        if (state.data) renderEventLog(state.data);
      });
    }
    const prev = $('#privacyEventLogPrev');
    if (prev) {
      prev.addEventListener('click', function () {
        state.recentPage = Math.max(1, Number(state.recentPage || 1) - 1);
        if (state.data) renderEventLog(state.data);
      });
    }
    const next = $('#privacyEventLogNext');
    if (next) {
      next.addEventListener('click', function () {
        state.recentPage = Number(state.recentPage || 1) + 1;
        if (state.data) renderEventLog(state.data);
      });
    }
  }

  function showLoadingSkeletons() {
    const summary = $('#privacySummary');
    if (summary && !summary.children.length) {
      summary.innerHTML = '<div class="kc-skeleton" style="height:64px;border-radius:14px;"></div>'.repeat(4);
    }
  }

  function init() {
    bindEvents();
    renderInventory();
    showLoadingSkeletons();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
