(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};
  const state = {
    rows: [],
    filters: {
      status: 'all',
      type: 'all',
      priority: 'all',
      query: '',
    },
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function showError(message) {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = String(message || 'Não foi possível carregar os pedidos de ajuda.');
    error.style.display = 'block';
  }

  function hideError() {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = '';
    error.style.display = 'none';
  }

  function showLoading(active) {
    const loading = $('#admin-loading');
    const content = $('#admin-content');
    if (loading) loading.style.display = active ? 'flex' : 'none';
    if (content) content.style.display = active ? 'none' : 'block';
  }

  function showToast(message, type) {
    const text = String(message || '').trim();
    if (!text) return;
    if (typeof window.showToast === 'function') {
      window.showToast(text, type || 'info', 2600);
      return;
    }
    window.alert(text);
  }

  async function checkAdminAccess() {
    const driver = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (driver === 'local') {
      return true;
    }
    if (driver !== 'supabase') {
      showError('O painel de ajuda requer driver=supabase.');
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      showError('Você precisa estar autenticado para acessar este painel.');
      return false;
    }

    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
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

  function populateTypeFilter() {
    const select = $('#helpTypeFilter');
    if (!select) return;
    const items = ['<option value="all">Todas as categorias</option>'];
    (Help.HELP_TYPE_OPTIONS || []).forEach((option) => {
      if (!option || !option.value) return;
      items.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = items.join('');
  }

  function readFilters() {
    state.filters.status = String($('#helpStatusFilter')?.value || 'all').trim();
    state.filters.type = String($('#helpTypeFilter')?.value || 'all').trim();
    state.filters.priority = String($('#helpPriorityFilter')?.value || 'all').trim();
    state.filters.query = String($('#helpQueryFilter')?.value || '').trim();
  }

  function formatDateTime(value) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '-';
    }
  }

  function renderSummary(rows) {
    const target = $('#helpSummary');
    if (!target) return;

    const list = Array.isArray(rows) ? rows : [];
    const metrics = [
      { label: 'Total', value: list.length },
      { label: 'Novos', value: list.filter((row) => row && row.status === 'new').length },
      { label: 'Urgentes', value: list.filter((row) => row && row.priority === 'urgent').length },
      { label: 'Em andamento', value: list.filter((row) => row && row.status === 'in_progress').length },
    ];

    target.innerHTML = metrics.map((item) => {
      return `<div class="kc-admin-help-metric"><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></div>`;
    }).join('');
  }

  function renderEmpty() {
    const list = $('#helpRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="kc-admin-help-empty">Nenhum pedido de ajuda encontrado para os filtros atuais.</div>';
  }

  function buildLabel(map, value, fallback) {
    const key = String(value || '').trim();
    return (map && map[key]) || fallback || key || '-';
  }

  function buildSubtopicLabel(row) {
    const raw = String(row && row.subtopic || '').trim();
    if (!raw) return 'Sem subtipo';
    if (Help && typeof Help.getHelpSubtopicOptions === 'function') {
      const options = Help.getHelpSubtopicOptions(row.type, row.topic);
      const match = Array.isArray(options)
        ? options.find((item) => item && String(item.value || '').trim() === raw)
        : null;
      if (match && match.label) return String(match.label);
    }
    return raw;
  }

  function renderRows(rows) {
    const list = $('#helpRequestsList');
    if (!list) return;

    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty();
      return;
    }

    list.innerHTML = rows.map((row) => {
      const typeLabel = buildLabel(Help.HELP_TYPE_LABELS, row.type, row.type);
      const topicLabel = buildLabel(Help.HELP_TOPIC_LABELS, row.topic, row.topic);
      const priorityLabel = buildLabel(Help.HELP_PRIORITY_LABELS, row.priority, row.priority);
      const statusLabel = buildLabel(Help.HELP_STATUS_LABELS, row.status, row.status);
      const subtopicLabel = buildSubtopicLabel(row);
      const pagePath = String(row.page_path || '').trim() || 'Não informado';
      const subject = String(row.subject || '').trim() || 'Sem assunto';
      const message = String(row.message || '').trim() || 'Sem descrição';
      const contactEmail = String(row.contact_email || '').trim() || 'Sem e-mail';

      return [
        `<article class="kc-admin-help-card" data-help-id="${esc(row.id)}">`,
        '  <div class="kc-admin-help-card-top">',
        `    <div><h2>${esc(subject)}</h2><p>${esc(message)}</p></div>`,
        '    <div class="kc-admin-help-chips">',
        `      <span class="kc-admin-help-chip kc-admin-help-chip--status-${esc(row.status)}"><i class="fas fa-circle"></i>${esc(statusLabel)}</span>`,
        `      <span class="kc-admin-help-chip kc-admin-help-chip--priority-${esc(row.priority)}"><i class="fas fa-bolt"></i>${esc(priorityLabel)}</span>`,
        `      <span class="kc-admin-help-chip"><i class="fas fa-layer-group"></i>${esc(typeLabel)}</span>`,
        '    </div>',
        '  </div>',
        '  <div class="kc-admin-help-meta">',
        `    <div><strong>Tema</strong><span>${esc(topicLabel)}</span></div>`,
        `    <div><strong>Subtipo</strong><span>${esc(subtopicLabel)}</span></div>`,
        `    <div><strong>E-mail</strong><span>${esc(contactEmail)}</span></div>`,
        `    <div><strong>Página afetada</strong><span>${esc(pagePath)}</span></div>`,
        `    <div><strong>Criado em</strong><span>${esc(formatDateTime(row.created_at))}</span></div>`,
        `    <div><strong>Contato autorizado</strong><span>${row.allow_contact === false ? 'Não' : 'Sim'}</span></div>`,
        '  </div>',
        '  <div class="kc-admin-help-actions">',
        `    <label><span class="sr-only">Status</span><select data-help-status><option value="new"${row.status === 'new' ? ' selected' : ''}>Novo</option><option value="triaged"${row.status === 'triaged' ? ' selected' : ''}>Triado</option><option value="in_progress"${row.status === 'in_progress' ? ' selected' : ''}>Em andamento</option><option value="resolved"${row.status === 'resolved' ? ' selected' : ''}>Resolvido</option><option value="archived"${row.status === 'archived' ? ' selected' : ''}>Arquivado</option></select></label>`,
        `    <label><span class="sr-only">Urgência</span><select data-help-priority><option value="low"${row.priority === 'low' ? ' selected' : ''}>Baixa</option><option value="normal"${row.priority === 'normal' ? ' selected' : ''}>Normal</option><option value="high"${row.priority === 'high' ? ' selected' : ''}>Alta</option><option value="urgent"${row.priority === 'urgent' ? ' selected' : ''}>Urgente</option></select></label>`,
        `    <button type="button" data-help-save><i class="fas fa-floppy-disk"></i> Salvar triagem</button>`,
        '  </div>',
        '</article>',
      ].join('');
    }).join('');
  }

  async function loadRows() {
    hideError();
    showLoading(true);
    readFilters();

    try {
      const rows = await window.KCAPI.listAdminHelpRequests(state.filters);
      state.rows = Array.isArray(rows) ? rows : [];
      renderSummary(state.rows);
      renderRows(state.rows);
    } catch (error) {
      console.error('[AdminHelp] load failed:', error);
      showError('Não foi possível carregar os pedidos de ajuda.');
    } finally {
      showLoading(false);
    }
  }

  async function saveRow(card) {
    const id = String(card?.getAttribute('data-help-id') || '').trim();
    if (!id) return;

    const status = String(card.querySelector('[data-help-status]')?.value || '').trim();
    const priority = String(card.querySelector('[data-help-priority]')?.value || '').trim();
    const button = card.querySelector('[data-help-save]');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
      const result = await window.KCAPI.updateAdminHelpRequest(id, { status, priority });
      if (!result || result.ok === false) {
        showToast((result && result.error && result.error.message) || 'Não foi possível salvar a triagem.', 'error');
        return;
      }
      showToast('Triagem atualizada.', 'success');
      await loadRows();
    } catch (error) {
      console.error('[AdminHelp] save failed:', error);
      showToast('Não foi possível salvar a triagem.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar triagem';
      }
    }
  }

  function bindEvents() {
    ['#helpStatusFilter', '#helpTypeFilter', '#helpPriorityFilter'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('change', loadRows);
    });

    const queryField = $('#helpQueryFilter');
    if (queryField) {
      queryField.addEventListener('input', function () {
        window.clearTimeout(queryField._kcTimer);
        queryField._kcTimer = window.setTimeout(loadRows, 220);
      });
    }

    const refreshButton = $('#helpRefreshButton');
    if (refreshButton) refreshButton.addEventListener('click', loadRows);

    document.addEventListener('click', function (event) {
      const action = event.target && event.target.closest ? event.target.closest('[data-help-save]') : null;
      if (!action) return;
      const card = action.closest('[data-help-id]');
      if (card) saveRow(card);
    });
  }

  async function init() {
    populateTypeFilter();
    bindEvents();

    const allowed = await checkAdminAccess();
    if (!allowed) {
      showLoading(false);
      return;
    }

    await loadRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
