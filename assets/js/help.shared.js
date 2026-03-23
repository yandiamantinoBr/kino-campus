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
    Object.freeze({ value: 'complaint', label: 'Reclamação' }),
    Object.freeze({ value: 'praise', label: 'Elogio' }),
    Object.freeze({ value: 'report', label: 'Denúncia' }),
    Object.freeze({ value: 'account_access', label: 'Conta e acesso' }),
  ]);

  const HELP_TOPIC_OPTIONS = Object.freeze([
    Object.freeze({ value: 'platform_use', label: 'Uso da plataforma' }),
    Object.freeze({ value: 'posts', label: 'Publicações' }),
    Object.freeze({ value: 'profile', label: 'Perfil' }),
    Object.freeze({ value: 'contact', label: 'Contato' }),
    Object.freeze({ value: 'payment_benefit', label: 'Pagamento ou benefício' }),
    Object.freeze({ value: 'security', label: 'Segurança' }),
    Object.freeze({ value: 'other', label: 'Outro' }),
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

  const HELP_SUBTOPICS = Object.freeze({
    'question|platform_use': Object.freeze([
      Object.freeze({ value: 'how_to_publish', label: 'Como publicar' }),
      Object.freeze({ value: 'filters_and_search', label: 'Filtros e busca' }),
      Object.freeze({ value: 'navigation', label: 'Navegação entre módulos' }),
      Object.freeze({ value: 'mobile_usage', label: 'Uso no celular' }),
    ]),
    'complaint|platform_use': Object.freeze([
      Object.freeze({ value: 'bug', label: 'Bug ou travamento' }),
      Object.freeze({ value: 'slow_performance', label: 'Lentidão' }),
      Object.freeze({ value: 'layout_issue', label: 'Problema visual' }),
      Object.freeze({ value: 'accessibility', label: 'Acessibilidade' }),
    ]),
    'question|posts': Object.freeze([
      Object.freeze({ value: 'create_post', label: 'Criar publicação' }),
      Object.freeze({ value: 'edit_post', label: 'Editar publicação' }),
      Object.freeze({ value: 'images_and_media', label: 'Imagens e mídia' }),
      Object.freeze({ value: 'vote_or_comment', label: 'Votos e comentários' }),
    ]),
    'complaint|posts': Object.freeze([
      Object.freeze({ value: 'post_not_loading', label: 'Publicação não carrega' }),
      Object.freeze({ value: 'media_failed', label: 'Imagem ou mídia falhou' }),
      Object.freeze({ value: 'vote_comment_error', label: 'Erro em voto ou comentário' }),
      Object.freeze({ value: 'feed_update', label: 'Feed desatualizado' }),
    ]),
    'question|profile': Object.freeze([
      Object.freeze({ value: 'avatar_profile', label: 'Avatar ou foto de perfil' }),
      Object.freeze({ value: 'public_links', label: 'Links públicos' }),
      Object.freeze({ value: 'contact_preferences', label: 'Contato principal' }),
      Object.freeze({ value: 'settings', label: 'Configurações da conta' }),
    ]),
    'complaint|profile': Object.freeze([
      Object.freeze({ value: 'avatar_profile', label: 'Avatar ou foto de perfil' }),
      Object.freeze({ value: 'settings', label: 'Configurações da conta' }),
      Object.freeze({ value: 'wrong_profile_data', label: 'Dados incorretos no perfil' }),
      Object.freeze({ value: 'public_view_issue', label: 'Erro na visualização pública' }),
    ]),
    'report|contact': Object.freeze([
      Object.freeze({ value: 'inappropriate_contact', label: 'Contato indevido' }),
      Object.freeze({ value: 'spam_contact', label: 'Spam' }),
      Object.freeze({ value: 'scam_contact', label: 'Tentativa de golpe' }),
      Object.freeze({ value: 'harassment', label: 'Assédio' }),
    ]),
    'question|contact': Object.freeze([
      Object.freeze({ value: 'how_contact_works', label: 'Como o contato funciona' }),
      Object.freeze({ value: 'whatsapp_setup', label: 'Configurar WhatsApp' }),
      Object.freeze({ value: 'public_links', label: 'Exibir links no perfil' }),
    ]),
    'account_access|platform_use': Object.freeze([
      Object.freeze({ value: 'email_confirmation', label: 'Confirmação de e-mail' }),
      Object.freeze({ value: 'password_reset', label: 'Redefinição de senha' }),
      Object.freeze({ value: 'login_error', label: 'Erro no login' }),
      Object.freeze({ value: 'onboarding_blocked', label: 'Onboarding travado' }),
    ]),
    'account_access|profile': Object.freeze([
      Object.freeze({ value: 'avatar_profile', label: 'Avatar ou foto de perfil' }),
      Object.freeze({ value: 'settings', label: 'Configurações da conta' }),
      Object.freeze({ value: 'public_links', label: 'Links públicos' }),
    ]),
    'praise|other': Object.freeze([
      Object.freeze({ value: 'positive_feedback', label: 'Feedback positivo' }),
      Object.freeze({ value: 'community_impact', label: 'Impacto na comunidade' }),
    ]),
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

  function getHelpSubtopicOptions(type, topic) {
    const key = `${normalizeKey(type)}|${normalizeKey(topic)}`;
    return HELP_SUBTOPICS[key] ? HELP_SUBTOPICS[key].slice() : [];
  }

  function buildLabelMap(options) {
    const map = Object.create(null);
    (Array.isArray(options) ? options : []).forEach((option) => {
      if (!option || !option.value) return;
      map[String(option.value)] = String(option.label || option.value);
    });
    return Object.freeze(map);
  }

  const HELP_TYPE_LABELS = buildLabelMap(HELP_TYPE_OPTIONS);
  const HELP_TOPIC_LABELS = buildLabelMap(HELP_TOPIC_OPTIONS);
  const HELP_PRIORITY_LABELS = buildLabelMap(HELP_PRIORITY_OPTIONS);
  const HELP_STATUS_LABELS = buildLabelMap(HELP_STATUS_OPTIONS);

  function normalizeHelpRequestInput(input, options) {
    const raw = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const type = normalizeChoice(raw.type, HELP_TYPE_OPTIONS, 'question');
    const topic = normalizeChoice(raw.topic, HELP_TOPIC_OPTIONS, 'platform_use');
    const subtopicOptions = getHelpSubtopicOptions(type, topic);
    const subtopic = normalizeChoice(raw.subtopic, subtopicOptions, '');
    const priority = normalizeChoice(raw.priority, HELP_PRIORITY_OPTIONS, 'normal');
    const status = normalizeChoice(raw.status, HELP_STATUS_OPTIONS, 'new');
    const contactEmail = normalizeEmail(raw.contact_email || '') || normalizeEmail(opts.fallbackEmail || '');
    const subject = trimText(raw.subject, 140);
    const message = trimText(raw.message, 4000);
    const pagePath = trimText(raw.page_path || '', 255);
    const allowContact = raw.allow_contact !== false;
    const metadata = raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata
      : {};

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
    HELP_TOPIC_OPTIONS,
    HELP_PRIORITY_OPTIONS,
    HELP_STATUS_OPTIONS,
    HELP_TYPE_LABELS,
    HELP_TOPIC_LABELS,
    HELP_PRIORITY_LABELS,
    HELP_STATUS_LABELS,
    normalizeKey,
    trimText,
    normalizeEmail,
    getHelpSubtopicOptions,
    normalizeHelpRequestInput,
  });
}));
