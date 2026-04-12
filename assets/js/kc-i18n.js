/*
  KinoCampus - Módulo de Internacionalização (i18n)
  Infraestrutura base: dicionário pt-BR, helpers KCi18n.t() e KCi18n.n()
  v11.24.1 — sem dependências externas
*/
(function () {
  'use strict';

  var _locale = 'pt-BR';

  // Dicionário pt-BR — chaves em dot-notation (categoria.nome)
  var _dict = {

    // ── Ações comuns ──────────────────────────────────────────────────────
    'common.save':            'Salvar',
    'common.cancel':          'Cancelar',
    'common.delete':          'Excluir',
    'common.edit':            'Editar',
    'common.close':           'Fechar',
    'common.confirm':         'Confirmar',
    'common.send':            'Enviar',
    'common.publish':         'Publicar',
    'common.loading':         'Carregando...',
    'common.retry':           'Tentar novamente',
    'common.share':           'Compartilhar',
    'common.copy':            'Copiar',
    'common.copied':          'Copiado!',
    'common.back':            'Voltar',
    'common.next':            'Próximo',
    'common.previous':        'Anterior',
    'common.search':          'Buscar',
    'common.filter':          'Filtrar',
    'common.clear':           'Limpar',
    'common.show-more':       'Ver mais',
    'common.show-less':       'Ver menos',
    'common.read-more':       'Ler mais',
    'common.yes':             'Sim',
    'common.no':              'Não',
    'common.see-all':         'Ver todos',
    'common.report':          'Denunciar',
    'common.view':            'Visualizar',
    'common.add':             'Adicionar',
    'common.remove':          'Remover',
    'common.create':          'Criar',
    'common.login':           'Entrar',
    'common.logout':          'Sair',
    'common.register':        'Cadastrar',
    'common.update':          'Atualizar',
    'common.activate':        'Ativar',
    'common.deactivate':      'Desativar',
    'common.optional':        'Opcional',
    'common.required':        'Obrigatório',
    'common.new':             'Novo',
    'common.active':          'Ativo',
    'common.inactive':        'Inativo',

    // ── Navegação ─────────────────────────────────────────────────────────
    'nav.home':               'Início',
    'nav.moradia':            'Moradia',
    'nav.eventos':            'Eventos',
    'nav.oportunidades':      'Oportunidades',
    'nav.achados-perdidos':   'Achados e Perdidos',
    'nav.caronas':            'Caronas',
    'nav.compra-venda':       'Compra e Venda',
    'nav.livros':             'Livros',
    'nav.rankings':           'Rankings',
    'nav.ajuda':              'Ajuda',
    'nav.profile':            'Perfil',
    'nav.notifications':      'Notificações',
    'nav.admin':              'Administração',
    'nav.menu':               'Menu',
    'nav.my-posts':           'Meus anúncios',
    'nav.my-saves':           'Salvos',
    'nav.settings':           'Configurações',
    'nav.accessibility':      'Acessibilidade',

    // ── Formulários ───────────────────────────────────────────────────────
    'form.title':               'Título',
    'form.description':         'Descrição',
    'form.price':               'Preço',
    'form.location':            'Localização',
    'form.date':                'Data',
    'form.time':                'Horário',
    'form.phone':               'Telefone',
    'form.email':               'E-mail',
    'form.name':                'Nome',
    'form.category':            'Categoria',
    'form.subcategory':         'Subcategoria',
    'form.condition':           'Condição',
    'form.images':              'Imagens',
    'form.tags':                'Tags',
    'form.required':            'Campo obrigatório',
    'form.invalid-email':       'E-mail institucional inválido',
    'form.placeholder-search':  'Buscar...',
    'form.placeholder-comment': 'Escreva um comentário...',
    'form.placeholder-title':   'Título do anúncio',
    'form.placeholder-desc':    'Descrição detalhada',
    'form.placeholder-price':   'Valor em R$',
    'form.select-option':       'Selecione uma opção',
    'form.characters-remaining':'caracteres restantes',
    'form.upload-image':        'Enviar imagem',
    'form.add-photo':           'Adicionar foto',
    'form.max-images':          'Máximo de {n} imagens',
    'form.drag-drop':           'Arraste ou clique para enviar',

    // ── Erros ─────────────────────────────────────────────────────────────
    'error.generic':            'Algo deu errado. Tente novamente.',
    'error.load-failed':        'Falha ao carregar. Tente novamente.',
    'error.save-failed':        'Não foi possível salvar. Tente novamente.',
    'error.delete-failed':      'Não foi possível excluir. Tente novamente.',
    'error.not-found':          'Não encontrado.',
    'error.unauthorized':       'Você não tem permissão para isso.',
    'error.session-expired':    'Sua sessão expirou. Faça login novamente.',
    'error.network':            'Erro de conexão. Verifique sua internet.',
    'error.image-upload':       'Falha ao enviar imagem.',
    'error.invalid-format':     'Formato inválido.',
    'error.timeout':            'Tempo de resposta esgotado.',
    'error.insert-failed':      'Falha no insert.',
    'error.rpc-failed':         'RPC falhou.',
    'error.unknown':            'Erro desconhecido.',

    // ── Feedback (toasts / confirmações) ──────────────────────────────────
    'feedback.saved':            'Salvo com sucesso!',
    'feedback.deleted':          'Excluído com sucesso!',
    'feedback.published':        'Publicado com sucesso!',
    'feedback.updated':          'Atualizado com sucesso!',
    'feedback.copied':           'Link copiado!',
    'feedback.sent':             'Enviado com sucesso!',
    'feedback.report-sent':      'Denúncia enviada. Obrigado!',
    'feedback.vote-added':       'Voto registrado!',
    'feedback.vote-removed':     'Voto removido.',
    'feedback.comment-added':    'Comentário publicado!',
    'feedback.comment-deleted':  'Comentário excluído.',
    'feedback.calendar-added':   'Adicionado à agenda!',
    'feedback.profile-updated':  'Perfil atualizado!',
    'feedback.image-uploaded':   'Imagem enviada!',
    'feedback.link-shared':      'Link compartilhado!',
    'feedback.notification-read':'Notificação marcada como lida.',

    // ── Tempo ─────────────────────────────────────────────────────────────
    'time.now':                 'Agora mesmo',
    'time.just-now':            'há pouco',
    'time.today':               'Hoje',
    'time.yesterday':           'Ontem',
    'time.tomorrow':            'Amanhã',
    'time.minutes-ago':         'há {n} min',
    'time.hours-ago':           'há {n} h',
    'time.days-ago':            'há {n} dias',
    'time.weeks-ago':           'há {n} semanas',
    'time.months-ago':          'há {n} meses',
    'time.years-ago':           'há {n} anos',

    // ── Estados vazios ────────────────────────────────────────────────────
    'empty.generic':            'Nenhum resultado encontrado.',
    'empty.posts':              'Nenhum anúncio encontrado.',
    'empty.comments':           'Nenhum comentário ainda. Seja o primeiro!',
    'empty.notifications':      'Nenhuma notificação.',
    'empty.search':             'Nenhum resultado para sua busca.',
    'empty.filter':             'Nenhum item corresponde ao filtro selecionado.',
    'empty.events':             'Nenhum evento disponível.',
    'empty.rankings':           'Ainda sem dados de ranking.',
    'empty.saves':              'Você ainda não salvou nenhum anúncio.',
    'empty.my-posts':           'Você ainda não publicou nenhum anúncio.',
    'empty.contributors':       'Nenhum contribuidor ainda.',

    // ── Acessibilidade (aria-labels e sr-only) ────────────────────────────
    'a11y.close-modal':          'Fechar modal',
    'a11y.open-menu':            'Abrir menu',
    'a11y.close-menu':           'Fechar menu',
    'a11y.open-share':           'Abrir opções de compartilhamento',
    'a11y.open-save':            'Salvar anúncio',
    'a11y.saved-indicator':      'Anúncio salvo',
    'a11y.prev-image':           'Imagem anterior',
    'a11y.next-image':           'Próxima imagem',
    'a11y.image-counter':        'Imagem {current} de {total}',
    'a11y.vote-up':              'Votar positivamente',
    'a11y.vote-count':           '{n} votos',
    'a11y.notification-count':   '{n} notificações não lidas',
    'a11y.open-notifications':   'Abrir notificações',
    'a11y.loading-content':      'Carregando conteúdo',
    'a11y.page-loading':         'Página carregando',
    'a11y.external-link':        'Abre em nova aba',
    'a11y.required-field':       'Campo obrigatório',
    'a11y.image-alt-post':       'Imagem do anúncio',
    'a11y.image-alt-profile':    'Foto de perfil',
    'a11y.user-avatar':          'Avatar de {name}',
    'a11y.skip-to-content':      'Pular para o conteúdo',
    'a11y.open-filters':         'Abrir filtros',
    'a11y.close-filters':        'Fechar filtros',
    'a11y.toggle-theme':         'Alternar tema',
    'a11y.post-card':            'Anúncio: {title}',
    'a11y.comment-by':           'Comentário de {name}',
    'a11y.go-back':              'Voltar à página anterior',

    // ── Módulos (nomes exibidos, alinhados com KC_CONSTANTS) ──────────────
    'module.moradia':            'Moradia',
    'module.eventos':            'Eventos',
    'module.oportunidades':      'Oportunidades',
    'module.achados-perdidos':   'Achados/Perdidos',
    'module.caronas':            'Caronas',
    'module.compra-venda':       'Compra e Venda',
    'module.livros':             'Livros',

    // ── UX Writing — tom e voz ────────────────────────────────────────────
    'uxw.brand':                 'KinoCampus',
    'uxw.tagline':               'A comunidade da UFG',
    'uxw.welcome':               'Bem-vindo ao KinoCampus!',
    'uxw.welcome-sub':           'A comunidade da UFG para moradia, caronas e muito mais.',
    'uxw.cta-post':              'Publicar anúncio',
    'uxw.cta-save':              'Salvar rascunho',
    'uxw.empty-feed-cta':        'Seja o primeiro a publicar aqui!',
    'uxw.report-confirm':        'Sua denúncia foi registrada. Nossa equipe vai analisar em breve.',
    'uxw.delete-confirm':        'Tem certeza? Esta ação não pode ser desfeita.',
    'uxw.session-greeting':      'Olá, {name}!',
    'uxw.page-not-found':        'Página não encontrada.',
    'uxw.page-not-found-sub':    'O endereço que você tentou acessar não existe ou foi removido.',
    'uxw.go-home':               'Ir para a página inicial',

    // ── Notificações (dropdown) ───────────────────────────────────────────
    'notif.now':                 'agora',
    'notif.minutes-ago':         '{n}min',
    'notif.hours-ago':           '{n}h',
    'notif.days-ago':            '{n}d',
    'notif.item-single':         '1 item',
    'notif.item-plural':         '{n} itens',
    'notif.marking':             'Marcando...',
    'notif.mark-all':            'Marcar todas',
    'notif.clearing':            'Limpando...',
    'notif.empty':               'Nenhuma notificação',
    'notif.confirm-clear':       'Limpar todas as notificações deste dropdown?',

    // ── Autenticação (status e mensagens de UI) ───────────────────────────
    'auth.login-disabled':       'A autenticação está desativada no modo local.',
    'auth.signup-disabled':      'O cadastro está desativado no modo local.',
    'auth.fill-email-password':  'Preencha e-mail e senha.',
    'auth.logging-in':           'Entrando...',
    'auth.login-failed':         'Não foi possível entrar.',
    'auth.login-success':        'Login realizado com sucesso.',
    'auth.fill-all-fields':      'Preencha todos os campos.',
    'auth.password-short':       'Sua senha precisa ter pelo menos 6 caracteres.',
    'auth.password-mismatch':    'As senhas não conferem.',
    'auth.creating-account':     'Criando sua conta...',
    'auth.signup-failed':        'Não foi possível criar sua conta.',
    'auth.account-created-verified': 'Conta criada e autenticada. Vamos completar seu perfil.',
    'auth.account-created-email':    'Conta criada. Abra o e-mail de confirmação para finalizar seu cadastro.',
    'auth.email-required':       'Informe o e-mail da sua conta.',
    'auth.sending-reset':        'Enviando link de redefinição...',
    'auth.reset-failed':         'Não foi possível enviar o link.',
    'auth.reset-sent':           'Pronto. Enviamos um e-mail com o link para redefinir sua senha.',
    'auth.resend-email-required':'Informe o e-mail usado no cadastro.',
    'auth.resending':            'Reenviando confirmação...',
    'auth.resend-failed':        'Não foi possível reenviar a confirmação.',
    'auth.resend-sent':          'Novo e-mail enviado. Abra o link recebido para concluir o cadastro.',
    'auth.logging-out':          'Saindo...',
    'auth.logout-failed':        'Não foi possível sair agora.',
    'auth.login-to-publish':     'Faça login para publicar.',
    'auth.profile-ready':        'Conta pronta para publicar e receber contatos',
    'auth.profile-incomplete':   'Cadastro incompleto: finalize seu onboarding',
  };

  /**
   * Traduz uma chave do dicionário com interpolação opcional.
   *
   *   KCi18n.t('common.save')                          → 'Salvar'
   *   KCi18n.t('a11y.user-avatar', { name: 'João' })  → 'Avatar de João'
   *   KCi18n.t('chave.inexistente')                    → 'chave.inexistente'
   *
   * Placeholders no formato {chave} são substituídos pelos valores de params.
   * Placeholders sem correspondência em params permanecem intactos.
   */
  function t(key, params) {
    var str = _dict[key];
    if (str === undefined) {
      return key;
    }
    if (params && typeof params === 'object') {
      str = str.replace(/\{(\w+)\}/g, function (match, k) {
        return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : match;
      });
    }
    return str;
  }

  /**
   * Formata um número com Intl.NumberFormat (locale pt-BR).
   *
   *   KCi18n.n(1500)                          → '1.500'
   *   KCi18n.n(1500, { style: 'currency' })   → 'R$ 1.500,00'
   *   KCi18n.n(0.75, { style: 'percent' })    → '75%'
   *   KCi18n.n(1500, { notation: 'compact' }) → '1,5 mil'
   */
  function n(value, opts) {
    var options = opts || {};
    if (options.style === 'currency') {
      return new Intl.NumberFormat(_locale, {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
      }).format(value);
    }
    if (options.style === 'percent') {
      return new Intl.NumberFormat(_locale, {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value);
    }
    if (options.notation === 'compact') {
      return new Intl.NumberFormat(_locale, {
        notation: 'compact',
        compactDisplay: 'short',
      }).format(value);
    }
    return new Intl.NumberFormat(_locale).format(value);
  }

  /**
   * Retorna todas as chaves do dicionário.
   * Útil para auditoria de cobertura e testes.
   */
  function keys() {
    return Object.keys(_dict);
  }

  window.KCi18n = {
    locale: _locale,
    t: t,
    n: n,
    keys: keys,
  };

}());
