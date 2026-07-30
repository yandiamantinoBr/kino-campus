(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.KCHelpUtils = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HELP_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'question', label: 'Dúvida' }),
    Object.freeze({ value: 'platform_issue', label: 'Problema na plataforma' }),
    Object.freeze({ value: 'account_access', label: 'Conta e acesso' }),
    Object.freeze({ value: 'external_access', label: 'Solicitação de acesso externo' }),
    Object.freeze({ value: 'report', label: 'Denúncia' }),
    Object.freeze({ value: 'suggestion_praise', label: 'Sugestão ou elogio' }),
  ]);

  const HELP_PRIORITY_OPTIONS = Object.freeze([
    Object.freeze({ value: 'low', label: 'Baixa' }),
    Object.freeze({ value: 'normal', label: 'Normal' }),
    Object.freeze({ value: 'high', label: 'Alta' }),
    Object.freeze({ value: 'urgent', label: 'Urgente' }),
  ]);

  const HELP_STATUS_OPTIONS = Object.freeze([
    Object.freeze({ value: 'new', label: 'Novo' }),
    Object.freeze({ value: 'triaged', label: 'Triado' }),
    Object.freeze({ value: 'in_progress', label: 'Em andamento' }),
    Object.freeze({ value: 'resolved', label: 'Resolvido' }),
    Object.freeze({ value: 'archived', label: 'Arquivado' }),
  ]);

  const PRIVACY_REQUEST_KINDS_BY_SUBTOPIC = Object.freeze({
    account_data_copy: 'data_access_copy',
    account_data_portability: 'data_portability',
    account_deletion: 'account_erasure',
  });

  const HELP_MODULE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'index', label: 'Página inicial' }),
    Object.freeze({ value: 'compra_venda', label: 'Compra e Venda' }),
    Object.freeze({ value: 'eventos', label: 'Eventos' }),
    Object.freeze({ value: 'moradia', label: 'Moradia' }),
    Object.freeze({ value: 'caronas', label: 'Caronas' }),
    Object.freeze({ value: 'oportunidades', label: 'Oportunidades' }),
    Object.freeze({ value: 'achados_perdidos', label: 'Achados e Perdidos' }),
    Object.freeze({ value: 'profile', label: 'Perfil' }),
    Object.freeze({ value: 'settings', label: 'Configurações' }),
    Object.freeze({ value: 'account_setup', label: 'Completar conta' }),
    Object.freeze({ value: 'other', label: 'Outro' }),
  ]);

  const HELP_TOPICS_BY_TYPE = Object.freeze({
    question: Object.freeze([
      Object.freeze({ value: 'publishing_navigation', label: 'Publicar e navegar' }),
      Object.freeze({ value: 'modules_filters', label: 'Módulos e filtros' }),
      Object.freeze({ value: 'profile_contact', label: 'Perfil e contato' }),
    ]),
    platform_issue: Object.freeze([
      Object.freeze({ value: 'bugs_crashes', label: 'Bugs e travamentos' }),
      Object.freeze({ value: 'slow_performance', label: 'Lentidão' }),
      Object.freeze({ value: 'search_filters', label: 'Busca e filtros' }),
      Object.freeze({ value: 'create_edit_post', label: 'Criar ou editar publicação' }),
    ]),
    account_access: Object.freeze([
      Object.freeze({ value: 'login_signup', label: 'Login e cadastro' }),
      Object.freeze({ value: 'email_confirmation', label: 'Confirmação de e-mail' }),
      Object.freeze({ value: 'password', label: 'Senha' }),
      Object.freeze({ value: 'onboarding_settings', label: 'Onboarding e configurações' }),
    ]),
    external_access: Object.freeze([
      Object.freeze({ value: 'non_institutional_email', label: 'E-mail não institucional' }),
      Object.freeze({ value: 'partnership_access', label: 'Parceria ou projeto vinculado' }),
    ]),
    report: Object.freeze([
      Object.freeze({ value: 'post', label: 'Anúncio' }),
      Object.freeze({ value: 'profile_user', label: 'Perfil ou usuário' }),
      Object.freeze({ value: 'inappropriate_contact', label: 'Contato indevido' }),
      Object.freeze({ value: 'security', label: 'Segurança' }),
    ]),
    suggestion_praise: Object.freeze([
      Object.freeze({ value: 'general_experience', label: 'Experiência geral' }),
      Object.freeze({ value: 'specific_module', label: 'Módulo específico' }),
      Object.freeze({ value: 'community', label: 'Comunidade' }),
    ]),
  });

  const HELP_SUBTOPICS = Object.freeze({
    'question|publishing_navigation': Object.freeze([
      Object.freeze({ value: 'how_to_publish', label: 'Como publicar' }),
      Object.freeze({ value: 'how_to_edit', label: 'Como editar uma publicação' }),
      Object.freeze({ value: 'contact_flow', label: 'Como o contato funciona' }),
      Object.freeze({ value: 'navigation_between_pages', label: 'Navegação entre páginas' }),
    ]),
    'question|modules_filters': Object.freeze([
      Object.freeze({ value: 'module_differences', label: 'Diferença entre módulos' }),
      Object.freeze({ value: 'filter_use', label: 'Como usar filtros' }),
      Object.freeze({ value: 'category_search', label: 'Categorias e busca' }),
      Object.freeze({ value: 'feed_updates', label: 'Atualização do feed' }),
    ]),
    'question|profile_contact': Object.freeze([
      Object.freeze({ value: 'public_profile', label: 'Perfil público' }),
      Object.freeze({ value: 'social_links', label: 'Links públicos' }),
      Object.freeze({ value: 'primary_contact', label: 'Contato principal' }),
      Object.freeze({ value: 'avatar_profile', label: 'Foto, avatar ou emoji' }),
    ]),
    'platform_issue|bugs_crashes': Object.freeze([
      Object.freeze({ value: 'menu_bug', label: 'Menu ou navegação quebrada' }),
      Object.freeze({ value: 'layout_break', label: 'Quebra visual' }),
      Object.freeze({ value: 'mobile_bug', label: 'Erro no celular' }),
      Object.freeze({ value: 'freeze_reload', label: 'Travamento ou recarregamento indevido' }),
    ]),
    'platform_issue|slow_performance': Object.freeze([
      Object.freeze({ value: 'slow_load', label: 'Carregamento lento' }),
      Object.freeze({ value: 'feed_delay', label: 'Feed demora para aparecer' }),
      Object.freeze({ value: 'action_delay', label: 'Ação demora para responder' }),
      Object.freeze({ value: 'device_specific', label: 'Lentidão em dispositivo específico' }),
    ]),
    'platform_issue|search_filters': Object.freeze([
      Object.freeze({ value: 'search_failed', label: 'Busca não encontra conteúdo' }),
      Object.freeze({ value: 'filter_wrong_results', label: 'Filtro mostra resultado incorreto' }),
      Object.freeze({ value: 'category_mismatch', label: 'Categoria não corresponde ao conteúdo' }),
      Object.freeze({ value: 'sort_order', label: 'Ordenação inesperada' }),
    ]),
    'platform_issue|create_edit_post': Object.freeze([
      Object.freeze({ value: 'save_failed', label: 'Não consigo salvar' }),
      Object.freeze({ value: 'edit_failed', label: 'Não consigo editar' }),
      Object.freeze({ value: 'media_upload', label: 'Falha em imagem ou mídia' }),
      Object.freeze({ value: 'visibility_issue', label: 'Problema na visibilidade' }),
    ]),
    'account_access|login_signup': Object.freeze([
      Object.freeze({ value: 'invalid_credentials', label: 'Credenciais inválidas' }),
      Object.freeze({ value: 'institutional_email', label: 'E-mail institucional' }),
      Object.freeze({ value: 'signup_link', label: 'Link do cadastro' }),
      Object.freeze({ value: 'session_problem', label: 'Sessão cai ou não entra' }),
    ]),
    'account_access|email_confirmation': Object.freeze([
      Object.freeze({ value: 'email_not_received', label: 'Não recebi o e-mail' }),
      Object.freeze({ value: 'expired_link', label: 'Link expirado ou inválido' }),
      Object.freeze({ value: 'callback_problem', label: 'Problema no callback' }),
    ]),
    'account_access|password': Object.freeze([
      Object.freeze({ value: 'reset_not_arriving', label: 'Link não chega' }),
      Object.freeze({ value: 'reset_invalid', label: 'Link inválido' }),
      Object.freeze({ value: 'cannot_change_password', label: 'Não consigo trocar a senha' }),
    ]),
    'account_access|onboarding_settings': Object.freeze([
      Object.freeze({ value: 'onboarding_blocked', label: 'Onboarding travado' }),
      Object.freeze({ value: 'settings_not_saving', label: 'Configurações não salvam' }),
      Object.freeze({ value: 'profile_visibility', label: 'Privacidade e visibilidade' }),
      Object.freeze({ value: 'avatar_profile', label: 'Foto, avatar ou emoji' }),
      Object.freeze({ value: 'account_data_copy', label: 'Cópia dos meus dados' }),
      Object.freeze({ value: 'account_data_portability', label: 'Portabilidade dos meus dados' }),
      Object.freeze({ value: 'account_deletion', label: 'Exclusão de conta e dados' }),
    ]),
    'external_access|non_institutional_email': Object.freeze([
      Object.freeze({ value: 'has_context', label: 'Informou vínculo ou contexto' }),
      Object.freeze({ value: 'needs_context', label: 'Contexto pendente' }),
    ]),
    'external_access|partnership_access': Object.freeze([
      Object.freeze({ value: 'partner_project', label: 'Projeto parceiro' }),
      Object.freeze({ value: 'community_guest', label: 'Convidado da comunidade' }),
    ]),
    'report|post': Object.freeze([
      Object.freeze({ value: 'fraud', label: 'Possível golpe' }),
      Object.freeze({ value: 'spam', label: 'Spam ou duplicado' }),
      Object.freeze({ value: 'inappropriate_content', label: 'Conteúdo inadequado' }),
      Object.freeze({ value: 'illegal_content', label: 'Conteúdo ilegal' }),
    ]),
    'report|profile_user': Object.freeze([
      Object.freeze({ value: 'fake_profile', label: 'Perfil suspeito ou falso' }),
      Object.freeze({ value: 'impersonation', label: 'Se passando por outra pessoa' }),
      Object.freeze({ value: 'harassment_profile', label: 'Assédio ou abuso' }),
    ]),
    'report|inappropriate_contact': Object.freeze([
      Object.freeze({ value: 'spam_contact', label: 'Spam' }),
      Object.freeze({ value: 'harassment_contact', label: 'Assédio' }),
      Object.freeze({ value: 'off_platform_risk', label: 'Contato suspeito fora da plataforma' }),
    ]),
    'report|security': Object.freeze([
      Object.freeze({ value: 'account_takeover', label: 'Suspeita de invasão' }),
      Object.freeze({ value: 'data_exposure', label: 'Exposição de dados' }),
      Object.freeze({ value: 'abuse_report', label: 'Abuso grave' }),
    ]),
    'suggestion_praise|general_experience': Object.freeze([
      Object.freeze({ value: 'ux_improvement', label: 'Melhoria de experiência' }),
      Object.freeze({ value: 'design_feedback', label: 'Visual e organização' }),
      Object.freeze({ value: 'positive_feedback', label: 'Feedback positivo' }),
    ]),
    'suggestion_praise|specific_module': Object.freeze([
      Object.freeze({ value: 'new_filter', label: 'Novo filtro ou categoria' }),
      Object.freeze({ value: 'module_flow', label: 'Fluxo de um módulo' }),
      Object.freeze({ value: 'new_feature', label: 'Nova funcionalidade' }),
    ]),
    'suggestion_praise|community': Object.freeze([
      Object.freeze({ value: 'community_impact', label: 'Impacto na comunidade' }),
      Object.freeze({ value: 'partnership_idea', label: 'Ideia de parceria' }),
      Object.freeze({ value: 'campus_use_case', label: 'Caso de uso no campus' }),
    ]),
  });

  const CONDITIONAL_FIELD_TEMPLATES = Object.freeze({
    affected_module: Object.freeze({
      key: 'affected_module',
      label: 'Módulo afetado',
      type: 'select',
      options: HELP_MODULE_OPTIONS,
    }),
    page_path: Object.freeze({
      key: 'page_path',
      label: 'Página afetada',
      type: 'text',
      placeholder: '/index.html ou /product.html?id=123',
      maxLength: 255,
    }),
    reproduce_steps: Object.freeze({
      key: 'reproduce_steps',
      label: 'Como reproduzir',
      type: 'textarea',
      rows: 4,
      wide: true,
      placeholder: 'Explique o passo a passo para que eu consiga repetir o problema.',
      maxLength: 1200,
    }),
    error_message: Object.freeze({
      key: 'error_message',
      label: 'Mensagem de erro',
      type: 'textarea',
      rows: 3,
      wide: true,
      placeholder: 'Cole aqui a mensagem exibida na tela, se houver.',
      maxLength: 1200,
    }),
    expected_result: Object.freeze({
      key: 'expected_result',
      label: 'Resultado esperado',
      type: 'textarea',
      rows: 3,
      wide: true,
      placeholder: 'Descreva o que deveria acontecer.',
      maxLength: 1200,
    }),
    content_link: Object.freeze({
      key: 'content_link',
      label: 'Link do anúncio ou perfil',
      type: 'url',
      wide: true,
      placeholder: 'https://kinocampus.com.br/product.html?id=123',
      maxLength: 500,
    }),
    account_email: Object.freeze({
      key: 'account_email',
      label: 'E-mail da conta afetada',
      type: 'email',
      placeholder: 'seu.email@ufg.br',
      maxLength: 255,
      autocomplete: 'email',
      help: 'Informe o e-mail exato usado na conta. Ele não será incluído no endereço desta página.',
    }),
    device_context: Object.freeze({
      key: 'device_context',
      label: 'Dispositivo ou navegador',
      type: 'text',
      placeholder: 'Ex.: Android 14, iPhone, Chrome, Firefox',
      maxLength: 120,
    }),
    impact_scope: Object.freeze({
      key: 'impact_scope',
      label: 'Impacto percebido',
      type: 'select',
      options: Object.freeze([
        Object.freeze({ value: 'only_me', label: 'Só comigo' }),
        Object.freeze({ value: 'some_people', label: 'Com outras pessoas também' }),
        Object.freeze({ value: 'entire_platform', label: 'Afeta a plataforma toda' }),
      ]),
    }),
    data_scope: Object.freeze({
      key: 'data_scope',
      label: 'Dados solicitados',
      type: 'select',
      required: true,
      wide: true,
      options: Object.freeze([
        Object.freeze({ value: 'all_account_data', label: 'Todos os dados associados à minha conta' }),
        Object.freeze({ value: 'profile_account', label: 'Conta, perfil e preferências' }),
        Object.freeze({ value: 'posts_interactions', label: 'Publicações, mídias e interações' }),
        Object.freeze({ value: 'messages_support', label: 'Mensagens e atendimentos' }),
        Object.freeze({ value: 'analytics_consents', label: 'Consentimentos e dados de uso vinculáveis' }),
        Object.freeze({ value: 'specific_categories', label: 'Somente categorias específicas (descrever abaixo)' }),
      ]),
      help: 'A resposta pode excluir dados de terceiros, segredos de segurança e registros que precisem ser legalmente preservados.',
    }),
    data_copy_format: Object.freeze({
      key: 'data_copy_format',
      label: 'Formato preferido',
      type: 'select',
      required: true,
      wide: true,
      options: Object.freeze([
        Object.freeze({ value: 'structured', label: 'Arquivo estruturado (JSON e, quando aplicável, CSV)' }),
        Object.freeze({ value: 'readable', label: 'Relatório legível' }),
        Object.freeze({ value: 'both', label: 'Ambos, se disponíveis' }),
      ]),
      help: 'Este formulário registra uma solicitação. O download integral da conta ainda não é gerado imediatamente nesta página.',
    }),
    portability_context: Object.freeze({
      key: 'portability_context',
      label: 'Contexto da portabilidade',
      type: 'textarea',
      rows: 3,
      wide: true,
      placeholder: 'Informe o formato ou serviço de destino pretendido, sem incluir senhas, tokens ou dados desnecessários.',
      maxLength: 1200,
      help: 'A viabilidade e o formato serão analisados conforme os dados envolvidos e os padrões disponíveis.',
    }),
    export_before_erasure: Object.freeze({
      key: 'export_before_erasure',
      label: 'Cópia dos dados antes da exclusão',
      type: 'select',
      required: true,
      wide: true,
      options: Object.freeze([
        Object.freeze({ value: 'request_copy_first', label: 'Sim, quero solicitar uma cópia antes da exclusão' }),
        Object.freeze({ value: 'no_copy_needed', label: 'Não preciso de uma cópia antes da exclusão' }),
        Object.freeze({ value: 'need_guidance', label: 'Ainda não sei; quero orientação' }),
      ]),
      help: 'Enviar este formulário não exclui a conta imediatamente. A titularidade e a confirmação final serão verificadas antes da etapa irreversível.',
    }),
  });

  const HELP_PRIVACY_CONDITIONAL_FIELDS = Object.freeze({
    account_data_copy: Object.freeze(['account_email', 'data_scope', 'data_copy_format']),
    account_data_portability: Object.freeze(['account_email', 'data_scope', 'portability_context']),
    account_deletion: Object.freeze(['account_email', 'export_before_erasure']),
  });

  const HELP_CONDITIONAL_FIELDS = Object.freeze({
    'question|publishing_navigation': Object.freeze(['affected_module']),
    'question|modules_filters': Object.freeze(['affected_module']),
    'question|profile_contact': Object.freeze([]),
    'platform_issue|bugs_crashes': Object.freeze(['affected_module', 'page_path', 'reproduce_steps', 'error_message', 'device_context']),
    'platform_issue|slow_performance': Object.freeze(['affected_module', 'page_path', 'reproduce_steps', 'device_context', 'impact_scope']),
    'platform_issue|search_filters': Object.freeze(['affected_module', 'page_path', 'expected_result']),
    'platform_issue|create_edit_post': Object.freeze(['affected_module', 'page_path', 'error_message', 'expected_result']),
    'account_access|login_signup': Object.freeze(['account_email', 'error_message']),
    'account_access|email_confirmation': Object.freeze(['account_email', 'error_message']),
    'account_access|password': Object.freeze(['account_email', 'error_message']),
    'account_access|onboarding_settings': Object.freeze(['account_email', 'page_path', 'error_message']),
    'external_access|non_institutional_email': Object.freeze(['account_email']),
    'external_access|partnership_access': Object.freeze(['account_email']),
    'report|post': Object.freeze(['affected_module', 'content_link']),
    'report|profile_user': Object.freeze(['content_link']),
    'report|inappropriate_contact': Object.freeze(['content_link']),
    'report|security': Object.freeze(['content_link', 'error_message', 'impact_scope']),
    'suggestion_praise|general_experience': Object.freeze(['affected_module']),
    'suggestion_praise|specific_module': Object.freeze(['affected_module', 'expected_result']),
    'suggestion_praise|community': Object.freeze([]),
  });

  function normalizeKey(value) {
    try {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    } catch (_) {
      return String(value || '').toLowerCase().trim();
    }
  }

  function trimText(value, maxLength) {
    const text = String(value == null ? '' : value).trim();
    if (!maxLength || !Number.isFinite(maxLength) || maxLength <= 0) return text;
    return text.slice(0, maxLength);
  }

  function normalizeChoice(value, options, fallback) {
    const normalized = normalizeKey(value);
    const allowed = new Set((Array.isArray(options) ? options : []).map((item) => String(item && item.value || '')));
    if (allowed.has(normalized)) return normalized;
    return String(fallback || '').trim();
  }

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(raw)) return `https://${raw}`;
    return '';
  }

  function buildLabelMap(options) {
    const map = Object.create(null);
    (Array.isArray(options) ? options : []).forEach((option) => {
      if (!option || !option.value) return;
      map[String(option.value)] = String(option.label || option.value);
    });
    return Object.freeze(map);
  }

  function flattenOptionsMap(collection) {
    const values = [];
    Object.keys(collection || {}).forEach((key) => {
      const list = collection[key];
      if (Array.isArray(list)) values.push.apply(values, list);
    });
    return values;
  }

  function getHelpTopicOptions(type) {
    return HELP_TOPICS_BY_TYPE[normalizeKey(type)] ? HELP_TOPICS_BY_TYPE[normalizeKey(type)].slice() : [];
  }

  function getHelpSubtopicOptions(type, topic) {
    const key = `${normalizeKey(type)}|${normalizeKey(topic)}`;
    return HELP_SUBTOPICS[key] ? HELP_SUBTOPICS[key].slice() : [];
  }

  function getHelpConditionalFields(type, topic, subtopic) {
    const key = `${normalizeKey(type)}|${normalizeKey(topic)}`;
    const subtypeValue = normalizeKey(subtopic);
    const privacyFields = key === 'account_access|onboarding_settings'
      ? HELP_PRIVACY_CONDITIONAL_FIELDS[subtypeValue]
      : null;
    const fields = privacyFields
      ? privacyFields.slice()
      : (HELP_CONDITIONAL_FIELDS[key] ? HELP_CONDITIONAL_FIELDS[key].slice() : []);
    if (subtypeValue === 'visibility_issue' && fields.indexOf('expected_result') === -1) {
      fields.push('expected_result');
    }
    return fields
      .map((fieldKey) => {
        const template = CONDITIONAL_FIELD_TEMPLATES[fieldKey] || null;
        if (!template || !privacyFields || fieldKey !== 'account_email') return template;
        return Object.freeze(Object.assign({}, template, { required: true }));
      })
      .filter(Boolean);
  }

  function getPrivacyRequestKind(type, topic, subtopic) {
    if (normalizeKey(type) !== 'account_access' || normalizeKey(topic) !== 'onboarding_settings') return '';
    return PRIVACY_REQUEST_KINDS_BY_SUBTOPIC[normalizeKey(subtopic)] || '';
  }

  const HELP_TYPE_LABELS = buildLabelMap(HELP_TYPE_OPTIONS);
  const HELP_TOPIC_LABELS = buildLabelMap(flattenOptionsMap(HELP_TOPICS_BY_TYPE));
  const HELP_PRIORITY_LABELS = buildLabelMap(HELP_PRIORITY_OPTIONS);
  const HELP_STATUS_LABELS = buildLabelMap(HELP_STATUS_OPTIONS);
  const HELP_MODULE_LABELS = buildLabelMap(HELP_MODULE_OPTIONS);

  function normalizeConditionalMetadata(rawMetadata, fields) {
    const metadata = (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata))
      ? rawMetadata
      : {};
    const normalized = Object.create(null);

    ['route', 'user_agent'].forEach((key) => {
      if (!metadata[key]) return;
      normalized[key] = trimText(metadata[key], key === 'route' ? 255 : 300);
    });

    const directTextFields = Object.freeze({
      request_kind: 60,
      source: 80,
      requester_name: 120,
      affiliation_context: 180,
      institutional_domain_hint: 180,
    });
    Object.keys(directTextFields).forEach((key) => {
      if (!metadata[key]) return;
      normalized[key] = trimText(metadata[key], directTextFields[key]);
    });

    if (metadata.email_notification && typeof metadata.email_notification === 'object' && !Array.isArray(metadata.email_notification)) {
      const emailStatus = trimText(metadata.email_notification.status, 40);
      if (emailStatus) {
        normalized.email_notification = {
          status: emailStatus,
          provider: trimText(metadata.email_notification.provider, 40),
          to: trimText(metadata.email_notification.to, 255),
          sent_at: trimText(metadata.email_notification.sent_at, 80),
          failed_at: trimText(metadata.email_notification.failed_at, 80),
        };
      }
    }

    (Array.isArray(fields) ? fields : []).forEach((field) => {
      if (!field || !field.key) return;
      const rawValue = metadata[field.key];
      if (rawValue == null || rawValue === '') return;

      if (field.type === 'select') {
        const value = normalizeChoice(rawValue, field.options || [], '');
        if (value) normalized[field.key] = value;
        return;
      }
      if (field.type === 'email') {
        const value = normalizeEmail(rawValue);
        if (value) normalized[field.key] = value;
        return;
      }
      if (field.type === 'url') {
        const value = normalizeUrl(rawValue);
        if (value) normalized[field.key] = value;
        return;
      }
      normalized[field.key] = trimText(rawValue, field.maxLength || 1200);
    });

    return normalized;
  }

  function normalizeHelpRequestInput(input, options) {
    const raw = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const type = normalizeChoice(raw.type, HELP_TYPE_OPTIONS, 'question');
    const topicOptions = getHelpTopicOptions(type);
    const topicFallback = topicOptions.length ? topicOptions[0].value : '';
    const topic = normalizeChoice(raw.topic, topicOptions, topicFallback);
    const subtopicOptions = getHelpSubtopicOptions(type, topic);
    const subtopic = normalizeChoice(raw.subtopic, subtopicOptions, '');
    const priority = normalizeChoice(raw.priority, HELP_PRIORITY_OPTIONS, 'normal');
    const status = normalizeChoice(raw.status, HELP_STATUS_OPTIONS, 'new');
    const contactEmail = normalizeEmail(raw.contact_email || '') || normalizeEmail(opts.fallbackEmail || '');
    const subject = trimText(raw.subject, 140);
    const message = trimText(raw.message, 4000);
    const conditionalFields = getHelpConditionalFields(type, topic, subtopic);
    const metadata = normalizeConditionalMetadata(raw.metadata, conditionalFields);
    const privacyRequestKind = getPrivacyRequestKind(type, topic, subtopic);
    if (privacyRequestKind) metadata.request_kind = privacyRequestKind;
    const pagePath = trimText(raw.page_path || metadata.page_path || '', 255);
    const allowContact = raw.allow_contact !== false;

    return Object.freeze({
      user_id: raw.user_id ? String(raw.user_id).trim() : null,
      type,
      topic,
      subtopic: subtopic || null,
      subject,
      message,
      priority,
      status,
      page_path: pagePath || null,
      contact_email: contactEmail,
      allow_contact: allowContact,
      metadata,
    });
  }

  return Object.freeze({
    HELP_TYPE_OPTIONS,
    HELP_PRIORITY_OPTIONS,
    HELP_STATUS_OPTIONS,
    HELP_MODULE_OPTIONS,
    PRIVACY_REQUEST_KINDS_BY_SUBTOPIC,
    HELP_TYPE_LABELS,
    HELP_TOPIC_LABELS,
    HELP_PRIORITY_LABELS,
    HELP_STATUS_LABELS,
    HELP_MODULE_LABELS,
    normalizeKey,
    trimText,
    normalizeEmail,
    getHelpTopicOptions,
    getHelpSubtopicOptions,
    getHelpConditionalFields,
    getPrivacyRequestKind,
    normalizeHelpRequestInput,
  });
}));
