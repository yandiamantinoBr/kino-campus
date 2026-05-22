(function () {
  'use strict';

  const state = {
    data: null,
    loading: false,
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
      name: 'kc_home_category_*',
      storage: 'localStorage',
      purpose: 'Personaliza categorias e registra afinidade agregada.',
      consent: 'Analytics',
      retention: 'Local com TTL operacional',
      admin: 'Privacidade e Analytics',
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
      limit: 500,
      offset: 0,
    };
  }

  async function loadData() {
    const client = getClient();
    if (!client || typeof client.rpc !== 'function') {
      throw new Error('Supabase client não disponível.');
    }
    const filters = readFilters();
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
        ? 'A RPC retornou acesso negado para este usuário.'
        : 'A RPC de privacidade ainda não está disponível. Rode a migration v9.3.5.16 no Supabase.');
    }
    return Object.assign({}, data, { filters });
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

  function renderData(data) {
    const byEvent = Array.isArray(data.by_event) ? data.by_event : [];
    const byPage = Array.isArray(data.by_page) ? data.by_page : [];
    const banners = Array.isArray(data.banners) ? data.banners : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];

    renderSummary(data);
    renderInventory();
    renderRows('privacyEventsBody', byEvent, [
      { value: function (row) { return EVENT_LABELS[row.event_name] || row.event_name; } },
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

    renderRows('privacyEventLogBody', rows, [
      { value: function (row) { return formatDateTime(row.created_at); } },
      { value: function (row) { return EVENT_LABELS[row.event_name] || row.event_name; } },
      { value: 'page_path' },
      { value: 'module_key' },
      { value: function (row) { return row.entity_type ? row.entity_type + ':' + (row.entity_id || '-') : '-'; } },
    ], 'Sem eventos detalhados.');

    const updated = $('#privacyLastSync');
    if (updated) updated.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
  }

  function exportRows(data) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return rows.map(function (row) {
      return {
        criado_em: formatDateTime(row.created_at),
        evento: EVENT_LABELS[row.event_name] || row.event_name,
        pagina: row.page_path || '',
        modulo: row.module_key || '',
        entidade: row.entity_type ? row.entity_type + ':' + (row.entity_id || '') : '',
      };
    });
  }

  function buildExportFilename(ext) {
    const days = state.data && state.data.filters ? state.data.filters.days : 30;
    return 'kc-privacidade-analytics-' + days + 'd-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  }

  async function handleExportXLSX() {
    if (!state.data || !window.KCAdminExport) return;
    const totals = state.data.totals || {};
    const consent = state.data.consent || {};
    await window.KCAdminExport.exportXLSX(buildExportFilename('xlsx'), [
      {
        name: 'Resumo',
        rows: [{
          eventos: totals.events || 0,
          sessoes: totals.sessions || 0,
          buscas: totals.searches || 0,
          impressoes_banners: totals.banner_impressions || 0,
          cliques_banners: totals.banner_clicks || 0,
          consentimentos: consent.updates || 0,
          analytics_aceitos: consent.analytics_accepted || 0,
          analytics_rejeitados: consent.analytics_rejected || 0,
        }],
      },
      { name: 'Eventos', rows: state.data.by_event || [] },
      { name: 'Paginas', rows: state.data.by_page || [] },
      { name: 'Banners', rows: state.data.banners || [] },
      { name: 'Detalhado', rows: exportRows(state.data) },
      { name: 'Inventario', rows: INVENTORY_ROWS },
    ]);
  }

  async function handleExportPDF() {
    if (!state.data || !window.KCAdminExport) return;
    const totals = state.data.totals || {};
    const consent = state.data.consent || {};
    await window.KCAdminExport.exportPDF(buildExportFilename('pdf'), 'KinoCampus - Privacidade e Analytics', [
      {
        title: 'Resumo',
        rows: [{
          eventos: totals.events || 0,
          sessoes: totals.sessions || 0,
          buscas: totals.searches || 0,
          banners: (totals.banner_clicks || 0) + ' cliques / ' + (totals.banner_impressions || 0) + ' impressoes',
          consentimento: (consent.analytics_accepted || 0) + ' aceites / ' + (consent.analytics_rejected || 0) + ' rejeicoes',
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
    if (refreshButton) refreshButton.addEventListener('click', refresh);
    const xlsx = $('#privacyExportXlsx');
    if (xlsx) xlsx.addEventListener('click', function () { handleExportXLSX().catch(console.error); });
    const pdf = $('#privacyExportPdf');
    if (pdf) pdf.addEventListener('click', function () { handleExportPDF().catch(console.error); });
    ['privacyPeriodFilter', 'privacyEventFilter', 'privacyModuleFilter'].forEach(function (id) {
      const el = $('#' + id);
      if (el) el.addEventListener('change', refresh);
    });
    const page = $('#privacyPageFilter');
    if (page) {
      let timer = null;
      page.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 350);
      });
    }
  }

  function init() {
    bindEvents();
    renderInventory();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
