(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};

  const state = {
    user: null,
    profile: null,
    submitting: false,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function setStatus(message, tone) {
    const status = $('#helpStatus');
    if (!status) return;
    if (!message) {
      status.textContent = '';
      status.className = 'kc-settings-status';
      return;
    }
    status.textContent = String(message || '');
    status.className = `kc-settings-status is-visible${tone ? ` is-${tone}` : ''}`;
  }

  function setSubmitState(active) {
    state.submitting = !!active;
    const button = $('#helpSubmitButton');
    if (!button) return;
    button.disabled = state.submitting;
    button.innerHTML = state.submitting
      ? '<i class="fas fa-spinner fa-spin"></i><span>Enviando pedido...</span>'
      : '<i class="fas fa-paper-plane"></i><span>Enviar pedido</span>';
  }

  function renderOptions(select, options, placeholder) {
    if (!select) return;
    const rows = [];
    if (placeholder) rows.push(`<option value="">${esc(placeholder)}</option>`);
    (Array.isArray(options) ? options : []).forEach((option) => {
      if (!option || !option.value) return;
      rows.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = rows.join('');
  }

  function populateSubtopics() {
    const type = String($('#helpType')?.value || '').trim();
    const topic = String($('#helpTopic')?.value || '').trim();
    const subtopics = Help.getHelpSubtopicOptions ? Help.getHelpSubtopicOptions(type, topic) : [];
    renderOptions($('#helpSubtopic'), subtopics, subtopics.length ? 'Selecione um subtipo' : 'Sem subtipo sugerido');
  }

  function prefillContext() {
    const pagePath = $('#helpPagePath');
    if (pagePath && !pagePath.value) {
      pagePath.value = `${window.location.pathname || '/ajuda.html'}${window.location.search || ''}`;
    }

    const emailInput = $('#helpContactEmail');
    if (emailInput && !emailInput.value) {
      const profileEmail = state.profile && state.profile.email ? String(state.profile.email).trim() : '';
      const userEmail = state.user && state.user.email ? String(state.user.email).trim() : '';
      emailInput.value = profileEmail || userEmail;
    }
  }

  async function hydrateUser() {
    if (!window.KCSupabase) return;
    state.user = typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!state.user && typeof window.KCSupabase.getCurrentUser === 'function') {
      state.user = await window.KCSupabase.getCurrentUser();
    }

    if (window.KCAPI) {
      state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!state.profile && typeof window.KCAPI.getMyProfile === 'function' && state.user) {
        state.profile = await window.KCAPI.getMyProfile();
      }
    }
  }

  function buildPayload() {
    const raw = {
      user_id: state.user && state.user.id ? String(state.user.id).trim() : null,
      type: $('#helpType')?.value || '',
      topic: $('#helpTopic')?.value || '',
      subtopic: $('#helpSubtopic')?.value || '',
      subject: $('#helpSubject')?.value || '',
      message: $('#helpMessage')?.value || '',
      priority: $('#helpPriority')?.value || '',
      page_path: $('#helpPagePath')?.value || '',
      contact_email: $('#helpContactEmail')?.value || '',
      allow_contact: $('#helpAllowContact')?.checked !== false,
      metadata: {
        route: window.location.pathname || '/ajuda.html',
        user_agent: navigator.userAgent || '',
      },
    };

    return Help.normalizeHelpRequestInput
      ? Help.normalizeHelpRequestInput(raw, {
          fallbackEmail: raw.contact_email,
        })
      : raw;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.submitting) return;

    if (!window.KCAPI || typeof window.KCAPI.createHelpRequest !== 'function') {
      setStatus('O envio de pedidos de ajuda não está disponível neste ambiente.', 'error');
      return;
    }

    const payload = buildPayload();
    if (!payload.subject || !payload.message || !payload.contact_email || !payload.type || !payload.topic || !payload.priority) {
      setStatus('Preencha categoria, tema, assunto, descrição, prioridade e e-mail para retorno.', 'warn');
      return;
    }

    setSubmitState(true);
    setStatus('Enviando seu pedido de ajuda...', 'info');

    try {
      const result = await window.KCAPI.createHelpRequest(payload);
      if (!result || result.ok === false) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível enviar seu pedido agora.', 'error');
        return;
      }

      setStatus('Pedido enviado com sucesso. Obrigado por ajudar a melhorar o KinoCampus.', 'success');
      const form = $('#helpRequestForm');
      if (form) form.reset();
      renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
      renderOptions($('#helpTopic'), Help.HELP_TOPIC_OPTIONS || [], 'Selecione o tema');
      renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
      populateSubtopics();
      prefillContext();
    } catch (error) {
      console.error('[Help] submit failed:', error);
      setStatus('Não foi possível enviar seu pedido agora.', 'error');
    } finally {
      setSubmitState(false);
    }
  }

  function handleReset() {
    const form = $('#helpRequestForm');
    if (form) form.reset();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpTopic'), Help.HELP_TOPIC_OPTIONS || [], 'Selecione o tema');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateSubtopics();
    prefillContext();
    setStatus('', '');
  }

  function bindEvents() {
    const form = $('#helpRequestForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const resetButton = $('#helpResetButton');
    if (resetButton) resetButton.addEventListener('click', handleReset);

    ['#helpType', '#helpTopic'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('change', populateSubtopics);
    });
  }

  async function init() {
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpTopic'), Help.HELP_TOPIC_OPTIONS || [], 'Selecione o tema');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateSubtopics();
    bindEvents();

    try {
      await hydrateUser();
    } catch (error) {
      console.warn('[Help] hydrate user failed:', error);
    }

    prefillContext();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
