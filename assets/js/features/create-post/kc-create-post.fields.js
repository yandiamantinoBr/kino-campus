/**
 * @file kc-create-post.fields.js
 * @description Sub-módulo de geração de campos do formulário de criação de publicações (v11.31.5).
 * Extraído de kc-create-post.js. Registra window._KCCreatePost.fields.
 *
 * Dependências em runtime:
 *   - window._KCCreatePost           — namespace criado por kc-create-post.js
 *   - window._KCCreatePost.resolvers — sub-módulo de resolvers (kc-create-post.resolvers.js)
 *
 * Carregado após kc-create-post.resolvers.js em todos os HTMLs que usam o modal de criação.
 * Execução: IIFE imediata → window._KCCreatePost.fields disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  // ── Acesso defensivo ao sub-módulo de resolvers ───────────────────────────
  function _getResolvers() {
    return window._KCCreatePost && window._KCCreatePost.resolvers;
  }

  // ── Limites de caracteres (admin override 2026-07-16) ─────────────────────
  // 2000 é o limite padrão do produto para usuários finais. Admins operators
  // (KC_ADMIN_OPERATOR_USER_IDS) ganham 5000 para acomodar publicações
  // densas tipo editais longos ou chamadas multi-tópico sem precisar de
  // cortar a copy. Mantém o restante da UI inalterada.
  const KC_DESCRIPTION_MAX_LENGTH = 2000;
  const KC_DESCRIPTION_MAX_LENGTH_ADMIN = 5000;

  function kcGetMaxDescriptionLength(isAdmin) {
    return isAdmin ? KC_DESCRIPTION_MAX_LENGTH_ADMIN : KC_DESCRIPTION_MAX_LENGTH;
  }

  // ── Detecção de admin operator (mirror do supabase.posts-write.adapter) ─
  // Lista idêntica à KC_ADMIN_OPERATOR_USER_IDS do posts-write adapter —
  // qualquer divergência aqui precisa ser propagada para os dois lugares
  // (RLS continua sendo a fonte da verdade no Supabase via
  // profiles.is_admin = true).
  const KC_ADMIN_OPERATOR_USER_IDS = Object.freeze([
    'abfb1831-6ad3-4f40-b55b-788e29f146f0', // yan1nakamura (hotmail)
    'bf3a4310-927f-4200-9df7-7478392d6a6e', // Yan Diamantino (yandiamantino)
    '2345582d-8bf7-4393-aa0d-f9953d0e02ca', // Cadu Bot
    '10391c7b-4a6d-4462-becb-e6e0056b7e1d', // Codex QA Admin
  ]);
  function _kcIsOperatorUserId(value) {
    if (!value) return false;
    var normalized = String(value).trim().toLowerCase();
    if (!normalized) return false;
    for (var i = 0; i < KC_ADMIN_OPERATOR_USER_IDS.length; i += 1) {
      if (String(KC_ADMIN_OPERATOR_USER_IDS[i]).toLowerCase() === normalized) return true;
    }
    return false;
  }
  function kcIsCurrentUserAdminOperator() {
    try {
      var user = null;
      if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
        user = window.KCSupabase.getUser();
      }
      if (!user && window.KCSupabase && window.KCSupabase.auth) {
        user = window.KCSupabase.auth.user || null;
      }
      if (user && _kcIsOperatorUserId(user.id)) return true;
      if (user && user.app_metadata) {
        if (_kcIsOperatorUserId(user.app_metadata.user_id)) return true;
        if (_kcIsOperatorUserId(user.app_metadata.sub)) return true;
      }
      var profile = null;
      if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
        profile = window.KCProfiles.getCurrentProfile();
      }
      if (profile) {
        if (_kcIsOperatorUserId(profile.id)) return true;
        if (_kcIsOperatorUserId(profile.user_id)) return true;
        if (profile.is_admin === true || profile.is_admin === 'true') return true;
      }
    } catch (_) { /* fall-through to false */ }
    return false;
  }

  // ── Geração de campos por módulo ─────────────────────────────────────────
  function kcBuildFieldsForModule(moduleKey, selections, values, opts) {
    const r = _getResolvers();
    const fields = [];
    const moneyFieldMeta = {
      type: 'text',
      inputmode: 'decimal',
      pattern: '^\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?$|^\\d+(?:[\\.,]\\d{1,2})?$'
    };
    const isAdmin = !!(opts && opts.isAdmin);
    const descMaxLength = kcGetMaxDescriptionLength(isAdmin);

    // comuns
    fields.push({ type: 'text', name: 'titulo', label: 'Título', placeholder: 'Ex: Livro de Cálculo Vol. 1', required: true, maxLength: 80 });
    fields.push({ type: 'textarea', name: 'descricao', label: 'Descrição', placeholder: 'Descreva com detalhes…', required: true, rows: 4, maxLength: descMaxLength, maxLengthAdmin: KC_DESCRIPTION_MAX_LENGTH_ADMIN });

    if (moduleKey === 'compra-venda') {
      const acao = selections.acao;
      fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Campus Samambaia', required: false });

      if (acao === 'vendo') {
        fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Preço (R$)', placeholder: '0,00', required: true });
        fields.push({ type: 'select', name: 'condicao', label: 'Condição', required: true, options: ['Novo', 'Semi-novo', 'Usado'] });
      } else {
        fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Orçamento (opcional)', placeholder: '0,00', required: false });
      }
    }

    if (moduleKey === 'caronas') {
      const caronasCampusOptions = (r && typeof r.getCaronasCampusOptions === 'function') ? r.getCaronasCampusOptions() : [];
      const caronasFeatureOptions = (r && typeof r.getCaronasFeatureOptions === 'function') ? r.getCaronasFeatureOptions() : [];
      fields.push({
        type: 'housing-region', name: 'origem', label: 'Origem',
        placeholder: 'Ex: Câmpus Samambaia', required: true,
        options: caronasCampusOptions,
        hint: 'Escolha uma sugestão ou digite outro local.',
      });
      fields.push({
        type: 'housing-region', name: 'destino', label: 'Destino',
        placeholder: 'Ex: Centro', required: true,
        options: caronasCampusOptions,
        hint: 'Escolha uma sugestão ou digite outro local.',
      });
      fields.push({
        type: 'time', name: 'horario', label: 'Horário de saída',
        required: false,
        hint: 'Matutino (05h–12h) · Vespertino (12h–18h) · Noturno (18h–05h)',
      });
      fields.push({ ...moneyFieldMeta, name: 'contribuicao', label: 'Contribuição (opcional)', placeholder: 'Ex: 5,00', required: false });
      if (selections.tipo === 'ofereco') {
        fields.push({ type: 'number', name: 'vagas', label: 'Vagas', placeholder: '2', required: false, min: 1, max: 8 });
      }
      fields.push({
        type: 'housing-features', name: 'marcadoresCarona',
        label: 'Características da carona', placeholder: 'Ex: Ar condicionado',
        required: false, options: caronasFeatureOptions,
        hint: 'Escolha sugestões ou adicione outras características da carona.',
      });
      fields.push({
        type: 'notice', icon: 'fas fa-clock',
        text: 'Publicações de caronas ficam visíveis por <strong>7 dias</strong> e depois são desabilitadas automaticamente. Você pode renovar depois.',
      });
    }

    if (moduleKey === 'moradia') {
      const housingRegionOptions = (r && typeof r.getHousingRegionOptions === 'function') ? r.getHousingRegionOptions() : [];
      const housingFeatureOptions = (r && typeof r.getHousingFeatureOptions === 'function') ? r.getHousingFeatureOptions() : [];
      const t = selections.tipo;
      if (t === 'procurando') {
        fields.push({
          type: 'housing-region',
          name: 'regiao',
          label: 'Região desejada',
          placeholder: 'Ex: Setor Universitário',
          required: true,
          options: housingRegionOptions,
        });
        fields.push({
          type: 'housing-features',
          name: 'marcadoresMoradia',
          label: 'Características do ambiente',
          placeholder: 'Ex: Aceita pets',
          required: false,
          options: housingFeatureOptions,
        });
        fields.push({ ...moneyFieldMeta, name: 'orcamento', label: 'Orçamento máximo (opcional)', placeholder: 'Ex: 800,00', required: false });
      } else {
        fields.push({
          type: 'housing-region',
          name: 'regiao',
          label: 'Região',
          placeholder: 'Ex: Vila Itatiaia',
          required: true,
          options: housingRegionOptions,
        });
        fields.push({
          type: 'housing-features',
          name: 'marcadoresMoradia',
          label: 'Características do ambiente',
          placeholder: 'Ex: Mobiliado',
          required: false,
          options: housingFeatureOptions,
        });
        fields.push({ type: 'text', name: 'localizacao', label: 'Ponto de referência (opcional)', placeholder: 'Ex: 5 min do portão principal', required: false });
        fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor mensal (R$)', placeholder: '0,00', required: true });
        fields.push({ type: 'text', name: 'detalhes', label: 'Detalhes (opcional)', placeholder: 'Ex: contas inclusas, mobília, vagas…', required: false });
      }
    }

    if (moduleKey === 'eventos') {
      fields.push({ type: 'text', name: 'localizacao', label: 'Local', placeholder: 'Ex: Centro de Eventos', required: true });
      fields.push({ type: 'date', name: 'data', label: 'Data de início do evento', required: false, hint: 'Eventos com data aparecem na data certa do calendário. Deixe em branco só se a data ainda não estiver definida.' });
      fields.push({ type: 'date', name: 'data_fim', label: 'Data de término (opcional)', required: false, hint: 'Preencha para eventos de vários dias (ex.: exposições, cursos, períodos de inscrição).' });
      fields.push({ type: 'time', name: 'hora', label: 'Horário (opcional)', required: false });
      fields.push({ type: 'url', name: 'link', label: 'Link/Inscrição (opcional)', placeholder: 'https://…', required: false });
      fields.push({ type: 'checkbox', name: 'link_as_cta', label: 'Usar link como botão principal do anúncio', required: false });
      fields.push({ type: 'checkbox', name: 'gratuito', label: 'Evento gratuito', required: false });
      if (!values.gratuito) {
        fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor (opcional)', placeholder: '0,00', required: false });
      }
    }

    if (moduleKey === 'achados-perdidos') {
      const lostFoundLocationOptions = (r && typeof r.getLostFoundLocationOptions === 'function') ? r.getLostFoundLocationOptions() : [];
      fields.push({
        type: 'achados-location',
        name: 'localizacao',
        label: 'Local (onde foi perdido/encontrado)',
        placeholder: 'Ex: Biblioteca Central',
        required: true,
        options: lostFoundLocationOptions,
      });
      if (selections.status === 'perdidos') {
        fields.push({ ...moneyFieldMeta, name: 'recompensa', label: 'Recompensa (opcional)', placeholder: 'Ex: 20,00', required: false });
      } else {
        fields.push({ type: 'text', name: 'entrega', label: 'Onde retirar/entregar', placeholder: 'Ex: Portaria do Bloco B', required: true });
      }
    }

    if (moduleKey === 'oportunidades') {
      const opportunityAreaOptions = (r && typeof r.getOpportunityAreaOptions === 'function') ? r.getOpportunityAreaOptions() : [];
      const normalizeOpportunityTypeKey = (r && typeof r.normalizeOpportunityTypeKey === 'function')
        ? r.normalizeOpportunityTypeKey.bind(r)
        : function (v) { return String(v || '').trim().toLowerCase(); };
      fields.push({
        type: 'opportunity-area',
        name: 'areaAtuacao',
        label: 'Área',
        placeholder: 'Ex: Educação',
        required: true,
        options: opportunityAreaOptions,
      });
      fields.push({
        type: 'select',
        name: 'modalidadeTrabalho',
        label: 'Modalidade',
        required: true,
        options: ['Remoto', 'Híbrido', 'Presencial']
      });
      if (normalizeOpportunityTypeKey(selections.tipo) === 'emprego') {
        fields.push({
          type: 'select',
          name: 'regimeContratacao',
          label: 'Regime/Vínculo',
          required: true,
          options: ['CLT', 'PJ', 'Temporário', 'Jovem Aprendiz']
        });
      }
      fields.push({ type: 'text', name: 'localizacao', label: 'Local ou campus (opcional)', placeholder: 'Ex: Goiânia / Campus Samambaia / online', required: false });
      fields.push({ ...moneyFieldMeta, name: 'remuneracao', label: 'Remuneração (opcional)', placeholder: 'Ex: 1200,00', required: false });
      fields.push({ type: 'text', name: 'contato', label: 'Contato', placeholder: 'Ex: email@ufg.br', required: true });
      fields.push({ type: 'url', name: 'link', label: 'Link/Inscrição (opcional)', placeholder: 'https://…', required: false });
      fields.push({ type: 'checkbox', name: 'link_as_cta', label: 'Usar link como botão principal do anúncio', required: false });
    }

    return fields;
  }

  window._KCCreatePost.fields = {
    buildFieldsForModule: kcBuildFieldsForModule,
    getMaxDescriptionLength: kcGetMaxDescriptionLength,
    isCurrentUserAdminOperator: kcIsCurrentUserAdminOperator,
    MAX_DESCRIPTION_LENGTH: KC_DESCRIPTION_MAX_LENGTH,
    MAX_DESCRIPTION_LENGTH_ADMIN: KC_DESCRIPTION_MAX_LENGTH_ADMIN,
  };
})();
