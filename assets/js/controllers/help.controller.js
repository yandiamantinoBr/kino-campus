(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};

  const state = {
    user: null,
    profile: null,
    submitting: false,
    conditionalFieldKeys: [],
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

  function renderOptions(select, options, placeholder, emptyLabel) {
    if (!select) return;
    const rows = [];
    const list = Array.isArray(options) ? options : [];
    if (placeholder) rows.push(`<option value="">${esc(placeholder)}</option>`);
    if (!list.length && emptyLabel) rows.push(`<option value="">${esc(emptyLabel)}</option>`);
    list.forEach((option) => {
      if (!option || !option.value) return;
      rows.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = rows.join('');
    select.disabled = list.length === 0;
  }

  function getCurrentType() {
    return String($('#helpType')?.value || '').trim();
  }

  function getCurrentTopic() {
    return String($('#helpTopic')?.value || '').trim();
  }

  function getCurrentSubtopic() {
    return String($('#helpSubtopic')?.value || '').trim();
  }

  function buildSelectFieldOptions(options, value) {
    const placeholder = '<option value="">Selecione uma opção</option>';
    const rows = (Array.isArray(options) ? options : []).map((option) => {
      const selected = String(option.value || '') === String(value || '') ? ' selected' : '';
      return `<option value="${esc(option.value)}"${selected}>${esc(option.label || option.value)}</option>`;
    }).join('');
    return `${placeholder}${rows}`;
  }

  function renderConditionalFields() {
    const container = $('#helpConditionalFields');
    if (!container) return;

    const type = getCurrentType();
    const topic = getCurrentTopic();
    const subtopic = getCurrentSubtopic();
    const fields = Help.getHelpConditionalFields ? Help.getHelpConditionalFields(type, topic, subtopic) : [];

    state.conditionalFieldKeys = (Array.isArray(fields) ? fields : [])
      .map((field) => String(field && field.key || '').trim())
      .filter(Boolean);

    if (!fields.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'grid';
    container.innerHTML = fields.map((field) => {
      const key = String(field.key || '').trim();
      const id = `helpConditional_${key}`;
      const label = esc(field.label || key);
      const wideClass = field.wide ? ' kc-help-field--wide' : '';
      const currentValue = key === 'page_path'
        ? String((window.location.pathname || '/ajuda.html') + (window.location.search || ''))
        : '';

      if (field.type === 'select') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<select id="${esc(id)}" data-help-conditional="${esc(key)}">`,
          buildSelectFieldOptions(field.options, ''),
          '</select>',
          '</label>',
        ].join('');
      }

      if (field.type === 'textarea') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<textarea id="${esc(id)}" data-help-conditional="${esc(key)}" rows="${esc(field.rows || 4)}" maxlength="${esc(field.maxLength || 1200)}" placeholder="${esc(field.placeholder || '')}"></textarea>`,
          '</label>',
        ].join('');
      }

      return [
        `<label class="kc-help-field${wideClass}">`,
        `<span>${label}</span>`,
        `<input id="${esc(id)}" data-help-conditional="${esc(key)}" type="${esc(field.type || 'text')}" maxlength="${esc(field.maxLength || 255)}" placeholder="${esc(field.placeholder || '')}" value="${esc(currentValue)}" />`,
        '</label>',
      ].join('');
    }).join('');
  }

  function populateTopics() {
    const topicSelect = $('#helpTopic');
    const type = getCurrentType();
    const topics = Help.getHelpTopicOptions ? Help.getHelpTopicOptions(type) : [];
    renderOptions(topicSelect, topics, topics.length ? 'Selecione o tema' : 'Selecione a categoria principal', topics.length ? '' : 'Sem temas para esta categoria');
    populateSubtopics();
  }

  function populateSubtopics() {
    const subtopicSelect = $('#helpSubtopic');
    const type = getCurrentType();
    const topic = getCurrentTopic();
    const subtopics = Help.getHelpSubtopicOptions ? Help.getHelpSubtopicOptions(type, topic) : [];
    renderOptions(subtopicSelect, subtopics, subtopics.length ? 'Selecione o subtipo' : 'Sem subtipo sugerido', subtopics.length ? '' : 'Sem subtipo sugerido');
    renderConditionalFields();
  }

  function prefillContext() {
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

  function collectConditionalMetadata() {
    const metadata = {
      route: window.location.pathname || '/ajuda.html',
      user_agent: navigator.userAgent || '',
    };

    state.conditionalFieldKeys.forEach((key) => {
      const field = document.querySelector(`[data-help-conditional="${key}"]`);
      if (!field) return;
      const value = String(field.value || '').trim();
      if (!value) return;
      metadata[key] = value;
    });

    return metadata;
  }

  function buildPayload() {
    const metadata = collectConditionalMetadata();
    const raw = {
      user_id: state.user && state.user.id ? String(state.user.id).trim() : null,
      type: $('#helpType')?.value || '',
      topic: $('#helpTopic')?.value || '',
      subtopic: $('#helpSubtopic')?.value || '',
      subject: $('#helpSubject')?.value || '',
      message: $('#helpMessage')?.value || '',
      priority: $('#helpPriority')?.value || '',
      page_path: metadata.page_path || '',
      contact_email: $('#helpContactEmail')?.value || '',
      allow_contact: $('#helpAllowContact')?.checked !== false,
      metadata,
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
      setStatus('Preencha categoria, tema, assunto, descrição, urgência e e-mail para retorno.', 'warn');
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
      renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
      populateTopics();
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
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    prefillContext();
    setStatus('', '');
  }

  function bindEvents() {
    const form = $('#helpRequestForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const resetButton = $('#helpResetButton');
    if (resetButton) resetButton.addEventListener('click', handleReset);

    const typeField = $('#helpType');
    if (typeField) {
      typeField.addEventListener('change', populateTopics);
    }

    const topicField = $('#helpTopic');
    if (topicField) {
      topicField.addEventListener('change', populateSubtopics);
    }

    const subtopicField = $('#helpSubtopic');
    if (subtopicField) {
      subtopicField.addEventListener('change', renderConditionalFields);
    }
  }

  async function init() {
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
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
