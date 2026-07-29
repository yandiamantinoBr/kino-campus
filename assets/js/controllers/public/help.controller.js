(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};

  const PRIVACY_DEEP_LINKS = Object.freeze({
    data_access_copy: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_copy',
      subject: 'Solicitação de cópia dos meus dados',
      messagePlaceholder: 'Informe quais dados você espera receber e qualquer contexto necessário. Não envie senhas, tokens ou documentos desnecessários.',
      status: 'Formulário preparado para solicitar uma cópia dos seus dados.',
    }),
    data_portability: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_portability',
      subject: 'Solicitação de portabilidade dos meus dados',
      messagePlaceholder: 'Explique quais dados deseja portar, o formato ou serviço de destino pretendido e qualquer contexto necessário.',
      status: 'Formulário preparado para solicitar portabilidade dos seus dados.',
    }),
    account_erasure: Object.freeze({
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_deletion',
      subject: 'Solicitação de exclusão da minha conta e dos meus dados',
      messagePlaceholder: 'Explique seu pedido e qualquer contexto necessário. O envio não apaga a conta imediatamente; haverá confirmação de titularidade antes da etapa irreversível.',
      status: 'Formulário preparado para solicitar exclusão da conta e dos dados.',
    }),
  });

  const PRIVACY_GUIDANCE_BY_SUBTOPIC = Object.freeze({
    account_data_copy: 'Você está solicitando uma cópia dos dados associados à conta. Este formulário gera uma referência de atendimento; após a verificação de titularidade, ela será vinculada ao protocolo correto. O arquivo integral não é baixado imediatamente.',
    account_data_portability: 'Você está solicitando portabilidade. O formato e a viabilidade serão analisados conforme as categorias envolvidas e os padrões disponíveis.',
    account_deletion: 'Você está solicitando exclusão. O envio abre uma análise e não elimina a conta imediatamente; a titularidade e a confirmação final serão verificadas antes da etapa irreversível.',
  });

  const state = {
    user: null,
    profile: null,
    submitting: false,
    accountLoadGeneration: 0,
    conditionalFieldKeys: [],
    deepLinkPreset: null,
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

  function getUserId(user) {
    return String(user && user.id || '').trim();
  }

  function isAuthenticatedAccountUser(user) {
    return Boolean(getUserId(user) && user.is_anonymous !== true);
  }

  function isActiveAccountLoad(generation, userId) {
    return (
      state.accountLoadGeneration === generation &&
      getUserId(state.user) === String(userId || '').trim()
    );
  }

  function profileBelongsToUser(profile, userId) {
    if (!profile || typeof profile !== 'object') return false;
    const ownerId = String(profile.user_id || profile.userId || profile.id || '').trim();
    return Boolean(ownerId && ownerId === String(userId || '').trim());
  }

  function resetAccountBoundForm() {
    setSubmitState(false);
    setProtocol('');
    const form = $('#helpRequestForm');
    if (form) form.reset();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    if (state.deepLinkPreset) applyPrivacyDeepLinkPreset({ announce: false });
    const contactEmail = $('#helpContactEmail');
    if (contactEmail) {
      contactEmail.value = '';
      delete contactEmail.dataset.kcAccountPrefillUserId;
    }
    const accountEmail = document.querySelector('[data-help-conditional="account_email"]');
    if (accountEmail) {
      accountEmail.value = '';
      delete accountEmail.dataset.kcAccountPrefillUserId;
    }
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
    const form = $('#helpRequestForm');
    if (form) form.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
    const button = $('#helpSubmitButton');
    if (!button) return;
    button.disabled = state.submitting;
    button.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
    button.innerHTML = state.submitting
      ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Enviando pedido...</span>'
      : '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Enviar pedido</span>';
  }

  function setProtocol(protocol, kind) {
    const container = $('#helpProtocol');
    const value = $('#helpProtocolValue');
    const label = $('#helpProtocolLabel');
    const guidance = $('#helpProtocolGuidance');
    if (!container || !value) return;
    const normalized = String(protocol || '').trim();
    const isDataSubjectProtocol = kind === 'data_subject_protocol';
    value.textContent = normalized;
    if (label) {
      label.textContent = isDataSubjectProtocol
        ? 'Protocolo do titular'
        : 'Referência de atendimento';
    }
    if (guidance) {
      guidance.textContent = isDataSubjectProtocol
        ? 'Guarde-o para acompanhar o pedido em Configurações, quando autenticado, ou com o atendimento verificado. Esta página não oferece consulta pública por protocolo.'
        : 'Guarde-a para informar ao suporte no retorno por e-mail. Ela não permite consulta pública nesta página.';
    }
    container.hidden = !normalized;
    container.style.display = normalized ? '' : 'none';
  }

  function readPrivacyDeepLink() {
    let request = '';
    try {
      request = String(new URLSearchParams(window.location.search || '').get('request') || '').trim();
    } catch (_) {
      return null;
    }
    return Object.prototype.hasOwnProperty.call(PRIVACY_DEEP_LINKS, request)
      ? PRIVACY_DEEP_LINKS[request]
      : null;
  }

  function updatePrivacyRequestGuidance() {
    const notice = $('#helpRequestPresetNotice');
    if (!notice) return;
    const guidance = PRIVACY_GUIDANCE_BY_SUBTOPIC[getCurrentSubtopic()] || '';
    notice.textContent = guidance;
    notice.hidden = !guidance;
    notice.style.display = guidance ? '' : 'none';
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
      updatePrivacyRequestGuidance();
      return;
    }

    container.style.display = 'grid';
    container.innerHTML = fields.map((field) => {
      const key = String(field.key || '').trim();
      const id = `helpConditional_${key}`;
      const helpId = `${id}_help`;
      const label = esc(field.label || key);
      const wideClass = field.wide ? ' kc-help-field--wide' : '';
      const required = field.required === true ? ' required aria-required="true"' : '';
      const describedBy = field.help ? ` aria-describedby="${esc(helpId)}"` : '';
      const helpCopy = field.help
        ? `<small id="${esc(helpId)}" class="kc-settings-help">${esc(field.help)}</small>`
        : '';
      const currentValue = key === 'page_path'
        ? String(window.location.pathname || '/ajuda.html')
        : '';

      if (field.type === 'select') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<select id="${esc(id)}" data-help-conditional="${esc(key)}"${required}${describedBy}>`,
          buildSelectFieldOptions(field.options, ''),
          '</select>',
          helpCopy,
          '</label>',
        ].join('');
      }

      if (field.type === 'textarea') {
        return [
          `<label class="kc-help-field${wideClass}">`,
          `<span>${label}</span>`,
          `<textarea id="${esc(id)}" data-help-conditional="${esc(key)}" rows="${esc(field.rows || 4)}" maxlength="${esc(field.maxLength || 1200)}" placeholder="${esc(field.placeholder || '')}"${required}${describedBy}></textarea>`,
          helpCopy,
          '</label>',
        ].join('');
      }

      const autocomplete = field.autocomplete ? ` autocomplete="${esc(field.autocomplete)}"` : '';
      return [
        `<label class="kc-help-field${wideClass}">`,
        `<span>${label}</span>`,
        `<input id="${esc(id)}" data-help-conditional="${esc(key)}" type="${esc(field.type || 'text')}" maxlength="${esc(field.maxLength || 255)}" placeholder="${esc(field.placeholder || '')}" value="${esc(currentValue)}"${autocomplete}${required}${describedBy} />`,
        helpCopy,
        '</label>',
      ].join('');
    }).join('');
    updatePrivacyRequestGuidance();
    prefillContext();
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

  function applyPrivacyDeepLinkPreset(options) {
    const opts = options || {};
    const preset = state.deepLinkPreset;
    if (!preset) return false;

    const type = $('#helpType');
    const topic = $('#helpTopic');
    const subtopic = $('#helpSubtopic');
    const priority = $('#helpPriority');
    const subject = $('#helpSubject');
    const message = $('#helpMessage');

    if (!type || !topic || !subtopic) return false;
    type.value = preset.type;
    if (type.value !== preset.type) return false;
    populateTopics();
    topic.value = preset.topic;
    if (topic.value !== preset.topic) return false;
    populateSubtopics();
    subtopic.value = preset.subtopic;
    if (subtopic.value !== preset.subtopic) return false;
    renderConditionalFields();

    if (priority && !priority.value) priority.value = 'normal';
    if (subject && !subject.value) subject.value = preset.subject;
    if (message) message.placeholder = preset.messagePlaceholder;
    if (opts.announce !== false) setStatus(preset.status, 'info');
    return true;
  }

  function applyAccountEmailPrefill(input, value, userId) {
    if (!input) return;
    const previousOwner = String(input.dataset.kcAccountPrefillUserId || '');
    if (previousOwner && previousOwner !== userId) {
      input.value = '';
      delete input.dataset.kcAccountPrefillUserId;
    }
    if (!input.value && value) {
      input.value = value;
      input.dataset.kcAccountPrefillUserId = userId;
    }
  }

  function prefillContext() {
    const emailInput = $('#helpContactEmail');
    const accountEmailInput = document.querySelector('[data-help-conditional="account_email"]');
    const profileEmail = state.profile && state.profile.email ? String(state.profile.email).trim() : '';
    const userEmail = state.user && state.user.email ? String(state.user.email).trim() : '';
    const knownEmail = profileEmail || userEmail;
    const userId = getUserId(state.user);
    applyAccountEmailPrefill(emailInput, knownEmail, userId);
    applyAccountEmailPrefill(accountEmailInput, knownEmail, userId);
  }

  async function hydrateUser(options) {
    const opts = options || {};
    const generation = ++state.accountLoadGeneration;
    if (!window.KCSupabase) {
      state.user = null;
      state.profile = null;
      return { generation, userId: '' };
    }
    let nextUser = Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      ? opts.sessionUser
      : (typeof window.KCSupabase.getUser === 'function'
          ? window.KCSupabase.getUser()
          : null);
    if (!nextUser && !Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      && typeof window.KCSupabase.getCurrentUser === 'function') {
      nextUser = await window.KCSupabase.getCurrentUser();
    }
    if (generation !== state.accountLoadGeneration) {
      return { generation, userId: '', stale: true };
    }

    const previousUserId = getUserId(state.user);
    const userId = getUserId(nextUser);
    state.user = nextUser || null;
    if (previousUserId !== userId) {
      state.profile = null;
      resetAccountBoundForm();
    }

    if (window.KCAPI && userId) {
      let profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!profileBelongsToUser(profile, userId)) profile = null;
      if (!profile && typeof window.KCAPI.getMyProfile === 'function') {
        const fetchedProfile = await window.KCAPI.getMyProfile();
        if (!isActiveAccountLoad(generation, userId)) {
          return { generation, userId, stale: true };
        }
        profile = profileBelongsToUser(fetchedProfile, userId) ? fetchedProfile : null;
      }
      if (isActiveAccountLoad(generation, userId)) state.profile = profile;
    }
    return { generation, userId, stale: !isActiveAccountLoad(generation, userId) };
  }

  async function refreshHelpPage(options) {
    const opts = options || {};
    const generation = state.accountLoadGeneration + 1;
    setStatus('Atualizando a central de ajuda...', 'info');
    try {
      const accountLoad = await hydrateUser(
        Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
          ? { sessionUser: opts.sessionUser }
          : undefined
      );
      if (accountLoad && accountLoad.stale) return;
      prefillContext();
      setStatus('Central de ajuda atualizada.', 'success');
    } catch (error) {
      if (state.accountLoadGeneration !== generation) return;
      console.warn('[Help] refresh failed.');
      setStatus('Não foi possível atualizar a central de ajuda agora.', 'error');
    }
  }

  function collectConditionalMetadata() {
    const requestKind = Help.getPrivacyRequestKind
      ? Help.getPrivacyRequestKind(getCurrentType(), getCurrentTopic(), getCurrentSubtopic())
      : '';
    const metadata = {
      route: window.location.pathname || '/ajuda.html',
    };
    if (!requestKind) metadata.user_agent = navigator.userAgent || '';

    state.conditionalFieldKeys.forEach((key) => {
      const field = document.querySelector(`[data-help-conditional="${key}"]`);
      if (!field) return;
      const value = String(field.value || '').trim();
      if (!value) return;
      metadata[key] = value;
    });

    if (requestKind) {
      metadata.request_kind = requestKind;
      metadata.source = state.deepLinkPreset ? 'help_privacy_deep_link' : 'help_form';
    }

    return metadata;
  }

  function buildPayload() {
    const metadata = collectConditionalMetadata();
    const authenticatedAccount = isAuthenticatedAccountUser(state.user);
    const expectedUserId = authenticatedAccount ? getUserId(state.user) : '';
    const raw = {
      user_id: expectedUserId || null,
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

    const normalized = Help.normalizeHelpRequestInput
      ? Help.normalizeHelpRequestInput(raw, {
          fallbackEmail: raw.contact_email,
        })
      : raw;
    return Object.assign({}, normalized, {
      expected_auth_state: authenticatedAccount ? 'authenticated' : 'anonymous',
      expected_user_id: expectedUserId || null,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.submitting) return;

    if (!window.KCAPI || typeof window.KCAPI.createHelpRequest !== 'function') {
      setStatus('O envio de pedidos de ajuda não está disponível neste ambiente.', 'error');
      return;
    }

    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    const payload = buildPayload();
    if (!payload.subject || !payload.message || !payload.contact_email || !payload.type || !payload.topic || !payload.priority) {
      setStatus('Preencha categoria, tema, assunto, descrição, urgência e e-mail para retorno.', 'warn');
      return;
    }
    const firstInvalidConditional = document.querySelector('#helpConditionalFields [required]:invalid');
    if (firstInvalidConditional) {
      setStatus('Preencha os campos obrigatórios específicos deste pedido.', 'warn');
      if (typeof firstInvalidConditional.reportValidity === 'function') firstInvalidConditional.reportValidity();
      firstInvalidConditional.focus();
      return;
    }

    setSubmitState(true);
    setProtocol('');
    setStatus('Enviando seu pedido de ajuda...', 'info');

    try {
      const result = await window.KCAPI.createHelpRequest(payload);
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!result || result.ok === false) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível enviar seu pedido agora.', 'error');
        return;
      }

      const dataSubjectProtocol = String(
        (result.data && result.data.protocol)
        || (result.data && result.data.data_subject_request && result.data.data_subject_request.protocol)
        || ''
      ).trim();
      const protocol = String(
        dataSubjectProtocol
        || (result.data && (result.data.id || result.data.out_id))
        || result.id
        || ''
      ).trim();
      setProtocol(
        protocol,
        dataSubjectProtocol ? 'data_subject_protocol' : 'help_reference'
      );
      setStatus(
        dataSubjectProtocol
          ? `Pedido enviado com sucesso. Protocolo do titular: ${dataSubjectProtocol}. Guarde-o para acompanhar o atendimento e, em pedidos de cópia ou portabilidade, consultar o download autenticado.`
          : protocol
          ? `Pedido enviado com sucesso. Referência de atendimento: ${protocol}. Guarde-a para informar quando o suporte entrar em contato.`
          : 'Pedido enviado com sucesso. A referência será informada no retorno do atendimento.',
        'success'
      );
      try {
        if (window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
          window.KCPrivacyAnalytics.track('help_submit', {
            source: 'help_form',
            status: 'submitted',
            reason: payload.type || '',
            category: payload.topic || '',
            page_path: payload.page_path || '/ajuda.html',
          }).catch(function () {});
        }
      } catch (_) { }
      const form = $('#helpRequestForm');
      if (form) form.reset();
      renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
      renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
      populateTopics();
      if (!applyPrivacyDeepLinkPreset({ announce: false })) prefillContext();
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Help] submit failed.');
      setStatus('Não foi possível enviar seu pedido agora.', 'error');
    } finally {
      if (isActiveAccountLoad(generation, userId)) setSubmitState(false);
    }
  }

  function handleReset() {
    const form = $('#helpRequestForm');
    if (form) form.reset();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    setProtocol('');
    setStatus('', '');
    if (!applyPrivacyDeepLinkPreset()) prefillContext();
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

    document.addEventListener('input', function (event) {
      const target = event && event.target;
      if (!target || !target.dataset) return;
      if (
        target.id === 'helpContactEmail' ||
        target.getAttribute('data-help-conditional') === 'account_email'
      ) {
        delete target.dataset.kcAccountPrefillUserId;
      }
    });

    document.addEventListener('kc:authchange', function (event) {
      const detail = event && event.detail && typeof event.detail === 'object'
        ? event.detail
        : {};
      const sessionUser = detail.user || (detail.session && detail.session.user) || null;
      refreshHelpPage({ sessionUser });
    });
  }

  function initPullToRefresh() {
    if (!window.KCPullToRefresh || document.body.dataset.kcHelpPtrReady === '1') return;
    document.body.dataset.kcHelpPtrReady = '1';
    window.KCPullToRefresh.init({
      container: document.body,
      onRefresh: refreshHelpPage,
    });
  }

  async function init() {
    state.deepLinkPreset = readPrivacyDeepLink();
    renderOptions($('#helpType'), Help.HELP_TYPE_OPTIONS || [], 'Selecione a categoria principal');
    renderOptions($('#helpPriority'), Help.HELP_PRIORITY_OPTIONS || [], 'Selecione a urgência');
    populateTopics();
    bindEvents();
    applyPrivacyDeepLinkPreset();

    try {
      await hydrateUser();
    } catch (error) {
      console.warn('[Help] hydrate user failed:', error);
    }

    prefillContext();
    initPullToRefresh();
    try {
      if (window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
        window.KCPrivacyAnalytics.track('help_open', {
          source: 'help_page',
          page_path: '/ajuda.html',
        }).catch(function () {});
      }
    } catch (_) { }
  }

  window.KCHelpRefresh = refreshHelpPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
