(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};
  const HELP_PAGE_SIZE = 25;
  const QUERY_DEBOUNCE_MS = 250;
  const FALLBACK_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'question', label: 'Dúvida' }),
    Object.freeze({ value: 'platform_issue', label: 'Problema na plataforma' }),
    Object.freeze({ value: 'account_access', label: 'Conta e acesso' }),
    Object.freeze({ value: 'external_access', label: 'Solicitação de acesso externo' }),
    Object.freeze({ value: 'report', label: 'Denúncia' }),
    Object.freeze({ value: 'suggestion_praise', label: 'Sugestão ou elogio' }),
  ]);
  const FALLBACK_STATUS_VALUES = Object.freeze(['new', 'triaged', 'in_progress', 'resolved', 'archived']);
  const FALLBACK_PRIORITY_VALUES = Object.freeze(['low', 'normal', 'high', 'urgent']);
  const LGPD_STATUS_LABELS = Object.freeze({
    diagnosed: 'Diagnóstico preparado',
    pending_confirmation: 'Aguardando confirmação',
    reversible_applied: 'Ocultação reversível aplicada',
    erased: 'Exclusão executada',
    cancelled: 'Cancelado',
    failed: 'Falhou',
    'não iniciado': 'Não iniciado',
  });

  const state = {
    rows: [],
    filters: {
      status: 'all',
      type: 'all',
      priority: 'all',
      query: '',
    },
    pagination: {
      limit: HELP_PAGE_SIZE,
      totalCount: 0,
      hasMore: false,
      isLoadingMore: false,
    },
    erasureResults: {},
    requestToken: 0,
  };

  let eventsBound = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getHelpTypeOptions() {
    const shared = window.KCHelpUtils;
    if (shared && Array.isArray(shared.HELP_TYPE_OPTIONS) && shared.HELP_TYPE_OPTIONS.length) {
      return shared.HELP_TYPE_OPTIONS;
    }
    return FALLBACK_TYPE_OPTIONS;
  }

  function getValidValues(options, fallback) {
    if (Array.isArray(options) && options.length) {
      return options
        .map((option) => String(option && option.value || '').trim())
        .filter(Boolean);
    }
    return fallback.slice();
  }

  function getValidStatuses() {
    return getValidValues(Help.HELP_STATUS_OPTIONS, FALLBACK_STATUS_VALUES);
  }

  function getValidPriorities() {
    return getValidValues(Help.HELP_PRIORITY_OPTIONS, FALLBACK_PRIORITY_VALUES);
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

  function friendlyLgpdErrorMessage(error) {
    const raw = String(
      error && typeof error === 'object'
        ? (error.message || error.error || error.detail || '')
        : (error || '')
    ).trim();
    const code = raw.toLowerCase();
    const body = error && typeof error === 'object' && error.body && typeof error.body === 'object'
      ? String(error.body.error || error.body.message || '').toLowerCase()
      : '';
    const value = [code, body].filter(Boolean).join(' ');
    if (value.indexOf('invalid_session') >= 0 || value.indexOf('missing authorization') >= 0 || value.indexOf('unauthorized') >= 0) {
      return 'Sua sessão administrativa expirou ou foi trocada. Entre novamente com uma conta administradora e recarregue esta página.';
    }
    if (value.indexOf('not_authorized') >= 0) {
      return 'A sessão atual não tem permissão de administrador para executar este fluxo LGPD.';
    }
    if (value.indexOf('invalid_help_request_id') >= 0) {
      return 'O pedido de ajuda não foi localizado no fluxo LGPD. Recarregue a página e tente novamente pelo cartão correto da solicitação.';
    }
    if (value.indexOf('valid_target_email_required') >= 0) {
      return 'Não foi possível identificar o e-mail alvo da conta. Confira o campo de e-mail do pedido de ajuda.';
    }
    if (value.indexOf('confirmation_phrase_mismatch') >= 0) {
      return 'A frase de confirmação irreversível não confere com o e-mail alvo.';
    }
    if (value.indexOf('auth_user_not_found') >= 0) {
      return 'O usuário não foi localizado no Auth. Revise o diagnóstico antes de concluir.';
    }
    if (raw) return raw;
    return 'Não foi possível processar o fluxo LGPD. Recarregue a página e confirme que você está logado como administrador.';
  }

  async function checkAdminAccess() {
    const driver = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (driver === 'local') return true;
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

    const currentValue = String(select.value || state.filters.type || 'all').trim();
    const items = ['<option value="all">Todas as categorias</option>'];
    getHelpTypeOptions().forEach((option) => {
      if (!option || !option.value) return;
      items.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = items.join('');
    select.value = currentValue || 'all';
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
    const totalCount = Math.max(list.length, toFiniteNumber(state.pagination.totalCount, list.length));
    const metrics = [
      { label: 'Total filtrado', value: totalCount },
      { label: 'Exibindo', value: list.length },
      { label: 'Urgentes na tela', value: list.filter((row) => row && row.priority === 'urgent').length },
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

  function buildMetadataChips(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const chips = [];

    const moduleValue = String(metadata.affected_module || '').trim();
    if (moduleValue) {
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-layer-group" aria-hidden="true"></i>${esc(buildLabel(Help.HELP_MODULE_LABELS, moduleValue, moduleValue))}</span>`);
    }

    const impactValue = String(metadata.impact_scope || '').trim();
    if (impactValue) {
      const impactLabels = {
        only_me: 'So comigo',
        some_people: 'Com outras pessoas',
        entire_platform: 'Plataforma toda',
      };
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-signal" aria-hidden="true"></i>${esc(impactLabels[impactValue] || impactValue)}</span>`);
    }

    const pagePath = String((row && row.page_path) || metadata.page_path || '').trim();
    if (pagePath) {
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-file-code" aria-hidden="true"></i>${esc(pagePath)}</span>`);
    }

    return chips.join('');
  }

  function buildMetadataSummary(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const lines = [];

    if (metadata.reproduce_steps) lines.push(`<div><strong>Como reproduzir</strong><span>${esc(metadata.reproduce_steps)}</span></div>`);
    if (metadata.error_message) lines.push(`<div><strong>Mensagem de erro</strong><span>${esc(metadata.error_message)}</span></div>`);
    if (metadata.expected_result) lines.push(`<div><strong>Resultado esperado</strong><span>${esc(metadata.expected_result)}</span></div>`);
    if (metadata.content_link) lines.push(`<div><strong>Link relacionado</strong><span>${esc(metadata.content_link)}</span></div>`);
    if (metadata.account_email) lines.push(`<div><strong>E-mail da conta</strong><span>${esc(metadata.account_email)}</span></div>`);
    if (metadata.requester_name) lines.push(`<div><strong>Nome do solicitante</strong><span>${esc(metadata.requester_name)}</span></div>`);
    if (metadata.affiliation_context) lines.push(`<div><strong>Vínculo ou contexto</strong><span>${esc(metadata.affiliation_context)}</span></div>`);
    if (metadata.institutional_domain_hint) lines.push(`<div><strong>Domínios institucionais</strong><span>${esc(metadata.institutional_domain_hint)}</span></div>`);
    if (metadata.device_context) lines.push(`<div><strong>Dispositivo ou navegador</strong><span>${esc(metadata.device_context)}</span></div>`);
    if (metadata.email_notification && typeof metadata.email_notification === 'object') {
      const status = String(metadata.email_notification.status || '').trim();
      const sentAt = String(metadata.email_notification.sent_at || metadata.email_notification.failed_at || '').trim();
      const detail = [status, sentAt].filter(Boolean).join(' · ');
      if (detail) lines.push(`<div><strong>E-mail automático</strong><span>${esc(detail)}</span></div>`);
    }

    if (!lines.length) return '';
    return `<div class="kc-admin-help-meta">${lines.join('')}</div>`;
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getLgpdTargetEmail(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const explicit = String(metadata.account_email || metadata.email || row.contact_email || '').trim().toLowerCase();
    if (explicit) return explicit;
    const haystack = [row && row.subject, row && row.message, row && row.topic].join(' ');
    const match = haystack.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return String(match && match[0] || '').trim().toLowerCase();
  }

  function isLgpdErasureRequest(row) {
    if (!row || typeof row !== 'object') return false;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const text = normalizeSearchText([
      row.type,
      row.topic,
      row.subtopic,
      row.subject,
      row.message,
      row.contact_email,
      metadata.account_email,
      metadata.request_kind,
    ].join(' '));
    const hasErasureSignal = /(lgpd|artigo 18|exclusao|excluir|eliminacao|eliminar|remocao|remover|dados cadastrais|apagar conta|deletar conta)/.test(text);
    const isAccountRequest = String(row.type || '').trim() === 'account_access';
    return hasErasureSignal || (isAccountRequest && /(conta|dados|perfil)/.test(text) && /(excl|remov|elimin|apag|delet)/.test(text));
  }

  function summarizeCounts(counts) {
    const input = counts && typeof counts === 'object' ? counts : {};
    const labels = {
      profiles: 'Perfil',
      posts: 'Publicações',
      post_media: 'Mídias',
      comments: 'Comentários',
      post_votes: 'Votos',
      saved_posts: 'Salvos',
      reports: 'Denúncias',
      help_requests: 'Pedidos de ajuda',
      chat_conversations: 'Conversas',
      chat_messages: 'Mensagens',
      notification_preferences: 'Preferências',
      privacy_analytics_events: 'Eventos de analytics',
      privacy_consent_events: 'Consentimentos',
    };
    const keys = Object.keys(labels);
    return keys
      .filter((key) => input[key] !== undefined)
      .map((key) => `<span class="kc-admin-help-chip"><strong>${esc(labels[key])}</strong> ${esc(input[key])}</span>`)
      .join('');
  }

  function buildEmailDraftPreview(result) {
    const draft = result && result.email && result.email.draft ? result.email.draft : null;
    if (!draft || !draft.text) return '';
    return [
      '<details class="kc-admin-lgpd-email">',
      '  <summary><i class="fas fa-envelope-open-text" aria-hidden="true"></i> Ver e-mail de confirmação</summary>',
      `  <pre>${esc(draft.text)}</pre>`,
      '</details>',
    ].join('');
  }

  function buildLgpdPanel(row) {
    if (!isLgpdErasureRequest(row)) return '';
    const targetEmail = getLgpdTargetEmail(row);
    const result = state.erasureResults[String(row.id || '')] || null;
    const request = result && result.request ? result.request : null;
    const diagnostics = result && result.diagnostics ? result.diagnostics : null;
    const countsHtml = diagnostics && diagnostics.counts ? summarizeCounts(diagnostics.counts) : '';
    const status = request && request.status ? String(request.status) : 'não iniciado';
    const statusLabel = buildLabel(LGPD_STATUS_LABELS, status, status);
    const erasedAt = request && request.erased_at || result && result.receipt && result.receipt.erased_at || '';
    const canClose = erasedAt
      ? 'Sim, após revisar o recibo interno.'
      : status === 'pending_confirmation' || status === 'reversible_applied'
        ? 'Não. Aguardar confirmação final do titular.'
        : diagnostics && diagnostics.counts
          ? 'Não. Fluxo sem confirmação final.'
          : 'Não. Diagnóstico pendente.';
    const expectedPhrase = targetEmail ? `EXCLUIR ${targetEmail}` : 'EXCLUIR email@domínio';
    const warning = result && Array.isArray(result.warnings) && result.warnings.length
      ? `<p class="kc-admin-lgpd-warning">${esc(result.warnings.join(' | '))}</p>`
      : '';
    const emailDraft = buildEmailDraftPreview(result);

    return [
      '<section class="kc-admin-lgpd-panel" data-lgpd-panel>',
      '  <div class="kc-admin-lgpd-panel__head">',
      '    <div>',
      '      <strong><i class="fas fa-shield-heart" aria-hidden="true"></i> Solicitação LGPD</strong>',
      '      <p>Fluxo seguro: diagnosticar, ocultar de forma reversível, pedir confirmação e só então executar a eliminação irreversível.</p>',
      '    </div>',
      `    <span class="kc-admin-help-chip"><i class="fas fa-circle-info" aria-hidden="true"></i>${esc(statusLabel)}</span>`,
      '  </div>',
      '  <div class="kc-admin-help-meta">',
      `    <div><strong>E-mail alvo</strong><span>${esc(targetEmail || 'Não informado')}</span></div>`,
      `    <div><strong>Confirmação irreversível</strong><span>${esc(expectedPhrase)}</span></div>`,
      `    <div><strong>Dados excluídos</strong><span>${erasedAt ? 'Sim' : 'Não'}</span></div>`,
      `    <div><strong>Pode fechar?</strong><span>${esc(canClose)}</span></div>`,
      '  </div>',
      countsHtml ? `<div class="kc-admin-lgpd-counts">${countsHtml}</div>` : '',
      warning,
      emailDraft,
      '  <div class="kc-admin-lgpd-actions">',
      '    <button type="button" data-lgpd-action="diagnose"><i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> Preparar diagnóstico</button>',
      '    <button type="button" data-lgpd-action="apply_reversible"><i class="fas fa-eye-slash" aria-hidden="true"></i> Ocultar conta e pedir confirmação</button>',
      '    <button type="button" data-lgpd-action="generate_receipt"><i class="fas fa-receipt" aria-hidden="true"></i> Gerar recibo interno</button>',
      '    <button type="button" data-lgpd-export><i class="fas fa-file-arrow-down" aria-hidden="true"></i> Exportar relatório LGPD</button>',
      '  </div>',
      '  <div class="kc-admin-lgpd-danger">',
      `    <label><span>Digite exatamente <code>${esc(expectedPhrase)}</code></span><input type="text" data-lgpd-confirmation placeholder="${esc(expectedPhrase)}" autocomplete="off" /></label>`,
      '    <button type="button" data-lgpd-action="erase_confirmed"><i class="fas fa-user-slash" aria-hidden="true"></i> Executar exclusão confirmada</button>',
      '  </div>',
      '</section>',
    ].join('');
  }

  function buildPaginationCard() {
    const totalCount = Math.max(0, toFiniteNumber(state.pagination.totalCount, state.rows.length));
    const loadedCount = Array.isArray(state.rows) ? state.rows.length : 0;
    if (!totalCount && !loadedCount) return '';

    const helperText = state.pagination.hasMore
      ? 'Filtros aplicados no servidor. Carregue a próxima página para continuar.'
      : 'Todos os resultados disponíveis para os filtros atuais já foram carregados.';
    const buttonHtml = state.pagination.hasMore
      ? [
        '<button',
        ' type="button"',
        ' data-help-load-more',
        state.pagination.isLoadingMore ? ' disabled aria-busy="true"' : '',
        ' style="padding:10px 14px;border-radius:12px;border:1px solid var(--kc-border-dark);background:var(--kc-background-dark);color:var(--kc-text-dark-primary);font:inherit;cursor:pointer;"',
        '>',
        state.pagination.isLoadingMore
          ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando...'
          : '<i class="fas fa-arrow-down" aria-hidden="true"></i> Carregar mais',
        '</button>',
      ].join('')
      : '';

    return [
      '<article class="kc-admin-help-card" data-help-pagination>',
      '  <div class="kc-admin-help-card-top">',
      `    <div><h2>${esc(`${loadedCount} de ${totalCount} pedidos exibidos`)}</h2><p>${esc(helperText)}</p></div>`,
      `    <div class="kc-admin-help-chips">${buttonHtml}</div>`,
      '  </div>',
      '</article>',
    ].join('');
  }

  function renderRows(rows) {
    const list = $('#helpRequestsList');
    if (!list) return;

    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty();
      return;
    }

    const cards = rows.map((row) => {
      const typeLabel = buildLabel(Help.HELP_TYPE_LABELS, row.type, row.type);
      const topicLabel = buildLabel(Help.HELP_TOPIC_LABELS, row.topic, row.topic);
      const priorityLabel = buildLabel(Help.HELP_PRIORITY_LABELS, row.priority, row.priority);
      const statusLabel = buildLabel(Help.HELP_STATUS_LABELS, row.status, row.status);
      const subtopicLabel = buildSubtopicLabel(row);
      const pagePath = String((row && row.page_path) || '').trim() || 'Não informado';
      const subject = String(row.subject || '').trim() || 'Sem assunto';
      const message = String(row.message || '').trim() || 'Sem descrição';
      const contactEmail = String(row.contact_email || '').trim() || 'Sem e-mail';
      const metadataChips = buildMetadataChips(row);
      const metadataSummary = buildMetadataSummary(row);

      return [
        `<article class="kc-admin-help-card" data-help-id="${esc(row.id)}">`,
        '  <div class="kc-admin-help-card-top">',
        `    <div><h2>${esc(subject)}</h2><p>${esc(message)}</p></div>`,
        '    <div class="kc-admin-help-chips">',
        `      <span class="kc-admin-help-chip kc-admin-help-chip--status-${esc(row.status)}"><i class="fas fa-circle" aria-hidden="true"></i>${esc(statusLabel)}</span>`,
        `      <span class="kc-admin-help-chip kc-admin-help-chip--priority-${esc(row.priority)}"><i class="fas fa-bolt" aria-hidden="true"></i>${esc(priorityLabel)}</span>`,
        `      <span class="kc-admin-help-chip"><i class="fas fa-layer-group" aria-hidden="true"></i>${esc(typeLabel)}</span>`,
        metadataChips,
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
        metadataSummary,
        buildLgpdPanel(row),
        '  <div class="kc-admin-help-actions">',
        `    <label><span class="sr-only">Status</span><select data-help-status><option value="new"${row.status === 'new' ? ' selected' : ''}>Novo</option><option value="triaged"${row.status === 'triaged' ? ' selected' : ''}>Triado</option><option value="in_progress"${row.status === 'in_progress' ? ' selected' : ''}>Em andamento</option><option value="resolved"${row.status === 'resolved' ? ' selected' : ''}>Resolvido</option><option value="archived"${row.status === 'archived' ? ' selected' : ''}>Arquivado</option></select></label>`,
        `    <label><span class="sr-only">Urgência</span><select data-help-priority><option value="low"${row.priority === 'low' ? ' selected' : ''}>Baixa</option><option value="normal"${row.priority === 'normal' ? ' selected' : ''}>Normal</option><option value="high"${row.priority === 'high' ? ' selected' : ''}>Alta</option><option value="urgent"${row.priority === 'urgent' ? ' selected' : ''}>Urgente</option></select></label>`,
        '    <button type="button" data-help-save><i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar triagem</button>',
        '  </div>',
        '</article>',
      ].join('');
    });

    cards.push(buildPaginationCard());
    list.innerHTML = cards.join('');
  }

  function unwrapRowsResponse(result, requestedLimit, requestedOffset) {
    const rawRows = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.rows) ? result.rows : []);
    const rows = rawRows
      .filter((row) => row && typeof row === 'object')
      .map((row) => row);

    const totalCountSource = Array.isArray(result) ? result.totalCount : result && result.totalCount;
    const limitSource = Array.isArray(result) ? result.limit : result && result.limit;
    const offsetSource = Array.isArray(result) ? result.offset : result && result.offset;
    const hasMoreSource = Array.isArray(result) ? result.hasMore : result && result.hasMore;
    const totalCount = Math.max(rows.length, toFiniteNumber(totalCountSource, rows.length));
    const limit = Math.max(1, toFiniteNumber(limitSource, requestedLimit));
    const offset = Math.max(0, toFiniteNumber(offsetSource, requestedOffset));
    const hasMore = typeof hasMoreSource === 'boolean'
      ? hasMoreSource
      : (offset + rows.length) < totalCount;

    return { rows, totalCount, limit, offset, hasMore };
  }

  function mergeRows(currentRows, nextRows) {
    const merged = Array.isArray(currentRows) ? currentRows.slice() : [];
    const seen = new Set(merged.map((row) => String(row && row.id || '')).filter(Boolean));
    (Array.isArray(nextRows) ? nextRows : []).forEach((row) => {
      const key = String(row && row.id || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(row);
    });
    return merged;
  }

  async function loadRows(options = {}) {
    const append = options.append === true;
    const requestedLimit = Math.max(1, Math.min(100, toFiniteNumber(options.limit, state.pagination.limit || HELP_PAGE_SIZE)));
    const requestedOffset = append ? state.rows.length : Math.max(0, toFiniteNumber(options.offset, 0));
    const requestToken = state.requestToken + 1;
    state.requestToken = requestToken;

    if (!append) {
      hideError();
      showLoading(true);
      readFilters();
    } else {
      state.pagination.isLoadingMore = true;
      renderRows(state.rows);
    }

    try {
      const result = await window.KCAPI.listAdminHelpRequests({
        status: state.filters.status,
        type: state.filters.type,
        priority: state.filters.priority,
        query: state.filters.query,
        limit: requestedLimit,
        offset: requestedOffset,
      });

      if (requestToken !== state.requestToken) return;

      const payload = unwrapRowsResponse(result, requestedLimit, requestedOffset);
      state.rows = append ? mergeRows(state.rows, payload.rows) : payload.rows;
      state.pagination.limit = payload.limit;
      state.pagination.totalCount = payload.totalCount;
      state.pagination.hasMore = payload.hasMore && state.rows.length < payload.totalCount;
      renderSummary(state.rows);
      renderRows(state.rows);
    } catch (error) {
      if (requestToken !== state.requestToken) return;
      console.error('[AdminHelp] load failed:', error);
      if (append) {
        showToast('Não foi possível carregar mais pedidos de ajuda.', 'error');
        renderRows(state.rows);
      } else {
        showError('Não foi possível carregar os pedidos de ajuda.');
      }
    } finally {
      if (requestToken !== state.requestToken) return;
      state.pagination.isLoadingMore = false;
      if (!append) showLoading(false);
      renderRows(state.rows);
    }
  }

  async function saveRow(card) {
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id) return;

    const status = String(card.querySelector('[data-help-status]')?.value || '').trim();
    const priority = String(card.querySelector('[data-help-priority]')?.value || '').trim();
    const validStatuses = getValidStatuses();
    const validPriorities = getValidPriorities();
    if (validStatuses.indexOf(status) < 0) {
      showToast('Status inválido para triagem.', 'error');
      return;
    }
    if (validPriorities.indexOf(priority) < 0) {
      showToast('Urgência inválida para triagem.', 'error');
      return;
    }

    const button = card.querySelector('[data-help-save]');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando...';
    }

    try {
      const result = await window.KCAPI.updateAdminHelpRequest(id, { status, priority });
      if (!result || result.ok === false) {
        showToast((result && result.error && result.error.message) || 'Não foi possível salvar a triagem.', 'error');
        return;
      }
      showToast('Triagem atualizada.', 'success');
      await loadRows({
        limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE),
      });
    } catch (error) {
      console.error('[AdminHelp] save failed:', error);
      showToast('Não foi possível salvar a triagem.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar triagem';
      }
    }
  }

  function buildHelpExportReport() {
    const rows = Array.isArray(state.rows) ? state.rows : [];
    const statusCounts = rows.reduce((acc, row) => {
      const key = String(row && row.status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const typeCounts = rows.reduce((acc, row) => {
      const key = String(row && row.type || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      title: 'KinoCampus - Pedidos de ajuda Admin',
      subtitle: 'Solicitações filtradas, status, prioridade, origem e decisões operacionais',
      source: 'admin/help-requests.html',
      filters: {
        status: state.filters.status || 'all',
        tipo: state.filters.type || 'all',
        prioridade: state.filters.priority || 'all',
        busca: state.filters.query || '',
        total_filtrado: state.pagination.totalCount || rows.length,
      },
      kpis: {
        pedidos_carregados: rows.length,
        pedidos_filtrados_total: state.pagination.totalCount || rows.length,
        urgentes_na_tela: rows.filter((row) => row && row.priority === 'urgent').length,
        em_andamento: rows.filter((row) => row && row.status === 'in_progress').length,
        novos: rows.filter((row) => row && row.status === 'new').length,
      },
      sections: [
        {
          title: 'Resumo por status',
          rows: Object.keys(statusCounts).map((status) => ({ status, total: statusCounts[status] })),
        },
        {
          title: 'Resumo por categoria',
          rows: Object.keys(typeCounts).map((type) => ({
            categoria: buildLabel(Help.HELP_TYPE_LABELS, type, type),
            type_key: type,
            total: typeCounts[type],
          })),
        },
        {
          title: 'Pedidos filtrados',
          rows: rows.map((row) => {
            const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return {
              id: row.id,
              criado_em: formatDateTime(row.created_at),
              status: row.status || '',
              prioridade: row.priority || '',
              categoria: buildLabel(Help.HELP_TYPE_LABELS, row.type, row.type || ''),
              tema: row.topic || '',
              subtipo: buildSubtopicLabel(row),
              assunto: row.subject || row.title || '',
              pagina_origem: row.page_path || metadata.page_path || '',
              modulo_afetado: metadata.affected_module || '',
              contato_autorizado: row.allow_contact === false ? 'Não' : 'Sim',
              email_contato: row.contact_email || '',
            };
          }),
        },
      ],
    };
  }

  async function handleHelpExport(kind) {
    if (!window.KCAdminExport) {
      showToast('Exportador admin indisponível.', 'error');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const report = buildHelpExportReport();
    if (kind === 'pdf') {
      await window.KCAdminExport.exportReportPDF('kc-admin-ajuda-' + date + '.pdf', report);
    } else {
      await window.KCAdminExport.exportReportXLSX('kc-admin-ajuda-' + date + '.xlsx', report);
    }
  }

  function buildLgpdExportReport(row) {
    const result = state.erasureResults[String(row && row.id || '')] || {};
    const diagnostics = result.diagnostics || {};
    const counts = diagnostics.counts && typeof diagnostics.counts === 'object' ? diagnostics.counts : {};
    const request = result.request || {};
    const receipt = result.receipt || request.receipt || {};
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const requestMetadata = request && request.metadata && typeof request.metadata === 'object' ? request.metadata : {};
    const targetEmail = getLgpdTargetEmail(row);
    const target = result.target || {};
    const countLabels = {
      profiles: 'Perfil cadastral',
      posts: 'Publicações',
      post_media: 'Mídias de publicações',
      comments: 'Comentários',
      post_votes: 'Votos realizados',
      saved_posts: 'Publicações salvas',
      reports: 'Denúncias registradas',
      help_requests: 'Pedidos de ajuda',
      chat_conversations: 'Conversas',
      chat_messages: 'Mensagens',
      notification_preferences: 'Preferências de notificação',
      privacy_analytics_events: 'Eventos opcionais de analytics',
      privacy_consent_events: 'Histórico de consentimento',
    };
    const statusLabels = {
      diagnosed: 'Diagnóstico preparado',
      pending_confirmation: 'Aguardando confirmação do titular',
      reversible_applied: 'Ocultação reversível aplicada',
      erased: 'Exclusão confirmada executada',
      cancelled: 'Cancelado',
      failed: 'Falhou',
    };
    const status = request.status || (result.action === 'diagnose' ? 'diagnosed' : 'não iniciado');
    const hasDiagnostics = Boolean(diagnostics && diagnostics.counts);
    const erasedAt = request.erased_at || receipt.erased_at || '';
    const confirmationRequestedAt = request.confirmation_requested_at || '';
    const userFoundKnown = Object.prototype.hasOwnProperty.call(target, 'user_found');
    const userFoundLabel = userFoundKnown
      ? (target.user_found ? 'Sim' : 'Não')
      : (row && row.user_id ? 'Vinculado ao pedido; diagnóstico pendente' : 'Não verificado');
    const canCloseLabel = erasedAt
      ? 'Sim, após revisar o recibo interno'
      : status === 'pending_confirmation' || status === 'reversible_applied'
        ? 'Não. Aguardar confirmação final do titular por e-mail.'
        : hasDiagnostics
          ? 'Não. Fluxo ainda sem confirmação final.'
          : 'Não. Prepare o diagnóstico antes de concluir.';
    const dataDeletedLabel = erasedAt ? 'Sim' : 'Não';
    const warnings = []
      .concat(Array.isArray(result.warnings) ? result.warnings : [])
      .concat(Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [])
      .concat(Array.isArray(requestMetadata.warnings) ? requestMetadata.warnings : [])
      .filter(Boolean);
    if (!hasDiagnostics) warnings.push('Diagnóstico ainda não executado ou não carregado no painel.');
    if (!erasedAt) warnings.push('Exclusão definitiva ainda não executada.');
    const countsRows = Object.keys(countLabels).map((key) => ({
      categoria: countLabels[key],
      chave_tecnica: key,
      quantidade: hasDiagnostics ? (Number(counts[key]) || 0) : 'A verificar',
      tratamento_previsto: key === 'posts' || key === 'post_media'
        ? 'Ocultar e anonimizar/remover conforme confirmação'
        : key === 'privacy_analytics_events' || key === 'privacy_consent_events'
          ? 'Manter apenas o mínimo agregado ou anonimizado quando aplicável'
          : 'Eliminar, anonimizar ou reter minimamente conforme hipótese legal',
    }));
    const steps = [
      {
        etapa: '1. Validação da solicitação',
        status: result.ok === false ? 'Falhou' : 'Disponível',
        detalhe: 'Confere se há e-mail alvo e se a solicitação está vinculada ao pedido de ajuda.',
      },
      {
        etapa: '2. Diagnóstico de dados',
        status: diagnostics && diagnostics.counts ? 'Preparado' : 'Pendente',
        detalhe: 'Levanta perfil, publicações, mídias, comentários, votos, salvos, mensagens, consentimentos e analytics vinculados.',
      },
      {
        etapa: '3. Ocultação reversível',
        status: request.reversible_applied_at ? 'Aplicada' : 'Pendente',
        detalhe: 'Remove visibilidade pública enquanto aguarda confirmação final do titular.',
      },
      {
        etapa: '4. Confirmação do titular',
        status: request.confirmed_at ? 'Confirmada' : 'Aguardando resposta',
        detalhe: 'Exige resposta por e-mail antes da eliminação irreversível.',
      },
      {
        etapa: '5. Exclusão/anonimização final',
        status: request.erased_at || receipt.erased_at ? 'Executada' : 'Pendente',
        detalhe: 'Executa limpeza de Auth, dados cadastrais, mídias e vínculos pessoais quando confirmado.',
      },
    ];
    return {
      title: 'KinoCampus - Relatório LGPD',
      subtitle: 'Solicitação de remoção de conta e dados cadastrais',
      source: 'admin/help-requests.html',
      filters: {
        pedido_de_ajuda: row && row.id || '',
        status_do_pedido: row && row.status || '',
        status_lgpd: statusLabels[status] || status,
        e_mail_alvo: targetEmail || 'Não informado',
        hash_do_e_mail: target.email_hash || request.email_hash || '',
      },
      kpis: {
        auth: userFoundKnown ? (target.user_found ? 'Encontrado' : 'Não encontrado') : 'Pendente',
        status_final: dataDeletedLabel === 'Sim' ? 'Executado' : 'Pendente',
        fechamento: erasedAt ? 'Pode fechar' : 'Não fechar',
        publicacoes: hasDiagnostics ? (counts.posts || 0) : 'A verificar',
        midias: hasDiagnostics ? (counts.post_media || 0) : 'A verificar',
        pedidos_de_ajuda: hasDiagnostics ? (counts.help_requests || 0) : 'A verificar',
      },
      sections: [
        {
          title: 'Dados da solicitação',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Pedido de ajuda',
            valor: row && row.id || '',
          }, {
            campo: 'Criado em',
            valor: formatDateTime(row && row.created_at),
          }, {
            campo: 'Status do pedido',
            valor: row && row.status || '',
          }, {
            campo: 'Prioridade',
            valor: row && row.priority || '',
          }, {
            campo: 'Tipo',
            valor: buildLabel(Help.HELP_TYPE_LABELS, row && row.type, row && row.type || ''),
          }, {
            campo: 'Assunto',
            valor: row && (row.subject || row.title) || '',
          }, {
            campo: 'E-mail informado',
            valor: targetEmail || 'Não informado',
          }, {
            campo: 'Mensagem do titular',
            valor: row && row.message || '',
          }],
        },
        {
          title: 'Status administrativo atual',
          note: 'Esta seção evita conclusão indevida: solicitação LGPD só deve ser fechada como resolvida após confirmação final e execução do fluxo irreversível, ou se o titular cancelar formalmente o pedido.',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Usuário localizado no Auth',
            valor: userFoundLabel,
          }, {
            campo: 'Dados definitivamente excluídos',
            valor: dataDeletedLabel,
          }, {
            campo: 'Pode fechar a solicitação agora?',
            valor: canCloseLabel,
          }, {
            campo: 'Próxima ação recomendada',
            valor: erasedAt
              ? 'Revisar recibo, registrar fechamento e responder ao titular.'
              : confirmationRequestedAt
                ? 'Aguardar resposta do titular com a frase de confirmação antes da exclusão definitiva.'
                : 'Executar “Ocultar conta e pedir confirmação” após validar o diagnóstico.',
          }],
        },
        {
          title: 'Diagnóstico de dados vinculados',
          pdfColumns: [
            { key: 'categoria', width: 1.2 },
            { key: 'quantidade', width: 0.7 },
            { key: 'tratamento_previsto', label: 'Tratamento', width: 2.2 },
          ],
          xlsxColumns: ['categoria', 'chave_tecnica', 'quantidade', 'tratamento_previsto'],
          maxPdfRows: 14,
          rows: countsRows,
        },
        {
          title: 'Andamento do fluxo LGPD',
          pdfColumns: [
            { key: 'etapa', width: 1.25 },
            { key: 'status', width: 0.8 },
            { key: 'detalhe', width: 2.1 },
          ],
          xlsxColumns: ['etapa', 'status', 'detalhe'],
          rows: steps,
        },
        {
          title: 'Recibo interno',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Status LGPD',
            valor: statusLabels[status] || status,
          }, {
            campo: 'Confirmação solicitada em',
            valor: formatDateTime(confirmationRequestedAt),
          }, {
            campo: 'Ocultação reversível em',
            valor: formatDateTime(request.reversible_applied_at),
          }, {
            campo: 'Confirmado em',
            valor: formatDateTime(request.confirmed_at),
          }, {
            campo: 'Eliminado/anonimizado em',
            valor: formatDateTime(erasedAt),
          }, {
            campo: 'Hash do e-mail',
            valor: target.email_hash || request.email_hash || receipt.email_hash || '',
          }, {
            campo: 'Observações',
            valor: warnings.length ? warnings.join(' | ') : 'Sem avisos registrados.',
          }],
        },
        {
          title: 'Base legal e orientações',
          pdfColumns: [{ key: 'item', width: 1 }, { key: 'descricao', label: 'Descrição', width: 2.4 }],
          xlsxColumns: ['item', 'descricao'],
          rows: [{
            item: 'Direito solicitado',
            descricao: 'Eliminação de dados pessoais tratados com consentimento ou quando aplicável, nos termos do art. 18, VI, da LGPD.',
          }, {
            item: 'Confirmação obrigatória',
            descricao: 'A exclusão irreversível exige confirmação enviada pelo e-mail titular antes da execução final.',
          }, {
            item: 'Retenção mínima',
            descricao: 'Podem ser mantidos registros mínimos de auditoria, hash do e-mail, datas, contagens e recibo interno para segurança e exercício regular de direitos.',
          }, {
            item: 'Publicações e conteúdo',
            descricao: 'Conteúdos vinculados ao titular devem ficar ocultos da comunidade e ser anonimizados ou removidos após confirmação final.',
          }],
        },
      ],
    };
  }

  async function exportLgpdReport(row) {
    if (!window.KCAdminExport) {
      showToast('Exportador admin indisponível.', 'error');
      return;
    }
    const id = String(row && row.id || '');
    const targetEmail = getLgpdTargetEmail(row);
    if (window.KCAPI && typeof window.KCAPI.processAccountErasure === 'function' && (!state.erasureResults[id] || !state.erasureResults[id].diagnostics)) {
      const allowed = await checkAdminAccess();
      if (!allowed) {
        showToast('Entre novamente com uma conta administradora antes de preparar o relatório LGPD.', 'error');
        return;
      }
      const result = await window.KCAPI.processAccountErasure({
        action: 'diagnose',
        actionKey: 'diagnose',
        help_request_id: id,
        helpRequestId: id,
        target_email: targetEmail,
        targetEmail,
        help_request: row,
      });
      if (result && result.ok !== false) {
        state.erasureResults[id] = result;
        renderRows(state.rows);
      } else if (result && result.error && result.error.message) {
        showToast(friendlyLgpdErrorMessage(result.error), 'error');
      }
    }
    const date = new Date().toISOString().slice(0, 10);
    await window.KCAdminExport.exportReportPDF(`kc-lgpd-${date}.pdf`, buildLgpdExportReport(row));
  }

  async function handleLgpdAction(card, action) {
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id) return;
    const row = state.rows.find((item) => String(item && item.id || '') === id);
    if (!row) return;
    const allowed = await checkAdminAccess();
    if (!allowed) {
      showToast('Entre novamente com uma conta administradora antes de executar o fluxo LGPD.', 'error');
      return;
    }
    const targetEmail = getLgpdTargetEmail(row);
    const confirmation = String(card.querySelector('[data-lgpd-confirmation]')?.value || '').trim();
    if (action === 'erase_confirmed' && confirmation !== `EXCLUIR ${targetEmail}`) {
      showToast('Digite a frase de confirmação exatamente como exibida antes da exclusão irreversível.', 'error');
      return;
    }
    const button = card.querySelector(`[data-lgpd-action="${action}"]`);
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Processando...';
    }
    try {
      const result = await window.KCAPI.processAccountErasure({
        action,
        actionKey: action,
        help_request_id: id,
        helpRequestId: id,
        target_email: targetEmail,
        targetEmail,
        confirmation_phrase: confirmation,
        confirmationPhrase: confirmation,
        help_request: row,
      });
      if (!result || result.ok === false) {
        showToast(friendlyLgpdErrorMessage(result && result.error), 'error');
        return;
      }
      state.erasureResults[id] = result;
      showToast(action === 'erase_confirmed' ? 'Exclusão LGPD confirmada.' : 'Fluxo LGPD atualizado.', 'success');
      if (action === 'apply_reversible' || action === 'erase_confirmed') {
        await loadRows({ limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE) });
      } else {
        renderRows(state.rows);
      }
    } catch (error) {
      console.error('[AdminHelp] lgpd action failed:', error);
      showToast(friendlyLgpdErrorMessage(error), 'error');
    } finally {
      if (button) {
        button.disabled = false;
        renderRows(state.rows);
      }
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    ['#helpStatusFilter', '#helpTypeFilter', '#helpPriorityFilter'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('change', function () { loadRows(); });
    });

    const queryField = $('#helpQueryFilter');
    if (queryField) {
      queryField.addEventListener('input', function () {
        window.clearTimeout(queryField._kcTimer);
        queryField._kcTimer = window.setTimeout(function () {
          loadRows();
        }, QUERY_DEBOUNCE_MS);
      });
    }

    const refreshButton = $('#helpRefreshButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', function () {
        loadRows({ limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE) });
      });
    }

    const exportXlsx = $('#helpExportXlsx');
    if (exportXlsx) exportXlsx.addEventListener('click', () => handleHelpExport('xlsx').catch(console.error));
    const exportPdf = $('#helpExportPdf');
    if (exportPdf) exportPdf.addEventListener('click', () => handleHelpExport('pdf').catch(console.error));

    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('[data-help-save],[data-help-load-more],[data-lgpd-action],[data-lgpd-export]') : null;
      if (!target) return;

      if (target.hasAttribute('data-help-load-more')) {
        event.preventDefault();
        if (!state.pagination.isLoadingMore && state.pagination.hasMore) {
          loadRows({ append: true, limit: state.pagination.limit || HELP_PAGE_SIZE });
        }
        return;
      }

      const card = target.closest('[data-help-id]');
      if (target.hasAttribute('data-lgpd-action')) {
        event.preventDefault();
        if (card) {
          handleLgpdAction(card, String(target.getAttribute('data-lgpd-action') || '')).catch(console.error);
        }
        return;
      }

      if (target.hasAttribute('data-lgpd-export')) {
        event.preventDefault();
        const id = String(card && card.getAttribute('data-help-id') || '').trim();
        const row = state.rows.find((item) => String(item && item.id || '') === id);
        if (row) exportLgpdReport(row).catch(console.error);
        return;
      }

      if (card) saveRow(card);
    });
  }

  function showLoadingSkeletons() {
    const summary = $('#helpSummary');
    if (summary && !summary.children.length) {
      summary.innerHTML = '<div class="kc-skeleton" style="height:60px;border-radius:14px;"></div>'.repeat(4);
    }
    const list = $('#helpRequestsList');
    if (list && !list.children.length) {
      list.innerHTML = '<div class="kc-skeleton" style="height:84px;border-radius:14px;margin-bottom:12px;"></div>'.repeat(4);
    }
  }

  async function init() {
    populateTypeFilter();
    bindEvents();

    const allowed = await checkAdminAccess();
    if (!allowed) {
      showLoading(false);
      return;
    }

    showLoadingSkeletons();
    await loadRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
