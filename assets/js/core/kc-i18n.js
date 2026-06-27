/*
  KinoCampus - Módulo de Internacionalização (i18n)
  Infraestrutura base: dicionário pt-BR, helpers KCi18n.t() e KCi18n.n()
  v12.7.2 — runtime fase 3: title (tooltip) declarativo (sem dependências externas)
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

    // ── Modal de autenticação (labels, placeholders, botões e notas) ──────
    'auth.modal-title':                'Conta KinoCampus',
    'auth.modal-subtitle':             'Entre, confirme seu cadastro ou recupere sua senha sem sair da página.',
    'auth.modal-tab-login':            'Login',
    'auth.modal-tab-signup':           'Cadastro',
    'auth.modal-email-institutional':  'E-mail institucional',
    'auth.modal-email-placeholder':    'voce@ufg.br',
    'auth.modal-password-label':       'Senha',
    'auth.modal-current-password':     'Sua senha',
    'auth.modal-enter-btn':            'Entrar',
    'auth.modal-forgot-link':          'Esqueci minha senha',
    'auth.modal-resend-link':          'Reenviar confirmação',
    'auth.modal-no-account-link':      'Ainda não tenho conta',
    'auth.modal-new-password':         'Crie uma senha',
    'auth.modal-confirm-label':        'Confirmar senha',
    'auth.modal-confirm-placeholder':  'Repita a senha',
    'auth.modal-signup-note':          'O link de confirmação será enviado para o seu e-mail institucional.',
    'auth.modal-create-account':       'Criar conta',
    'auth.modal-have-account-link':    'Já tenho conta',
    'auth.modal-forgot-email-label':   'E-mail da sua conta',
    'auth.modal-forgot-note':          'Enviaremos um link para redefinir sua senha pelo callback oficial do KinoCampus.',
    'auth.modal-send-link':            'Enviar link',
    'auth.modal-back-to-login':        'Voltar ao login',
    'auth.modal-resend-email-label':   'E-mail do cadastro',
    'auth.modal-resend-note':          'Se o e-mail anterior expirou ou sumiu, enviamos outro agora.',
    'auth.modal-resend-btn':           'Reenviar',
    'auth.modal-go-signup':            'Ir para cadastro',
    'auth.modal-session-active':       'Sessão ativa',
    'auth.modal-my-profile':           'Meu perfil',
    'auth.modal-complete-signup':      'Completar cadastro',
    'auth.modal-help-center':          'Central de ajuda',

    // ── Dropdown de perfil (menu de usuário autenticado) ──────────────────
    'auth.dropdown-my-profile':        'Meu perfil',
    'auth.dropdown-my-posts':          'Minhas publicações',
    'auth.dropdown-complete-signup':   'Completar cadastro',
    'auth.dropdown-help-center':       'Central de ajuda',
    'auth.dropdown-logout':            'Sair da conta',

    // ── Metadata runtime (title + meta description) ────────────────────────────
    'meta-title.error-404':            'Página não encontrada - KinoCampus',
    'meta-title.account-setup':        'KinoCampus - Completar conta',
    'meta-title.achados-perdidos':     'Achados e Perdidos - KinoCampus',
    'meta-title.ajuda':                'KinoCampus - Central de ajuda',
    'meta-title.auth-callback':        'KinoCampus - Confirmando sua conta',
    'meta-title.caronas-feed':         'Caronas - KinoCampus',
    'meta-title.compra-venda-feed':    'Compra e Venda - KinoCampus',
    'meta-title.create-post':          'KinoCampus - Nova Publicação',
    'meta-title.editorial':            'Política editorial - KinoCampus',
    'meta-title.eventos':              'Eventos - KinoCampus',
    'meta-title.index':                'KinoCampus - Comunidade UFG',
    'meta-title.moradia':              'Moradia - KinoCampus',
    'meta-title.my-posts':             'KinoCampus — Minhas Publicações',
    'meta-title.ods':                  'ODS | KinoCampus',
    'meta-title.oportunidades':        'Oportunidades - KinoCampus',
    'meta-title.profile':              'KinoCampus — Perfil',
    'meta-title.privacidade':          'Declaração de Privacidade - KinoCampus',
    'meta-title.search-results':       'Resultados de Busca - KinoCampus',
    'meta-title.settings':             'KinoCampus - Configurações',
    'meta-title.sobre':                'Sobre o KinoCampus - Comunidade UFG',
    'meta-title.transparencia':         'Transparência - KinoCampus',
    'meta-title.termos':               'Termos de Uso - KinoCampus',
    'meta-title.product':              'KinoCampus - Detalhes',
    'meta-title.admin-banners':        'KinoCampus - Gerenciar Banners',
    'meta-title.admin-help-requests':  'KinoCampus - Pedidos de ajuda',
    'meta-title.admin-index':          'KinoCampus - Dashboard Admin',
    'meta-title.admin-moderation':     'KinoCampus - Moderação Admin',
    'meta-title.admin-reports':        'KinoCampus - Denúncias Admin',
    'meta-title.admin-privacy-analytics': 'KinoCampus - Privacidade e Analytics Admin',

    'meta-description.error-404':            'Página não encontrada no KinoCampus. Volte ao início ou explore os módulos da comunidade UFG: eventos, oportunidades, moradia, compra e venda, caronas e achados e perdidos.',
    'meta-description.account-setup':       'Complete sua conta no KinoCampus — comunidade universitária da UFG.',
    'meta-description.achados-perdidos':    'Achados e Perdidos da UFG. Encontrou ou perdeu algo no campus? Publique no KinoCampus e ajude a comunidade.',
    'meta-description.ajuda':               'Central de ajuda do KinoCampus. Tire dúvidas sobre a plataforma da comunidade universitária da UFG.',
    'meta-description.auth-callback':       'Confirme sua conta no KinoCampus com segurança e finalize o acesso à comunidade universitária da UFG.',
    'meta-description.caronas-feed':        'Caronas entre estudantes da UFG. Ofereça ou procure caronas para o campus, centro e região de Goiânia no KinoCampus.',
    'meta-description.compra-venda-feed':   'Compra e venda entre estudantes da UFG. Anuncie ou encontre eletrônicos, ingressos, móveis, livros e mais no KinoCampus.',
    'meta-description.create-post':         'Crie uma nova publicação no KinoCampus — comunidade universitária da UFG.',
    'meta-description.editorial':           'Política editorial do KinoCampus: fontes, curadoria, correções, publicidade e critérios para organizar publicações úteis à comunidade UFG.',
    'meta-description.eventos':             'Eventos universitários na UFG. Encontre palestras, workshops, feiras, eventos culturais e esportivos no KinoCampus.',
    'meta-description.index':               'KinoCampus é a plataforma da comunidade universitária da UFG. Compra e venda, caronas, moradia, eventos, oportunidades e achados/perdidos entre estudantes.',
    'meta-description.moradia':             'Moradia universitária em Goiânia. Encontre repúblicas, quartos e apartamentos perto da UFG no KinoCampus.',
    'meta-description.my-posts':            'Gerencie suas publicações no KinoCampus. Veja, edite, renove e acompanhe o desempenho dos seus anúncios.',
    'meta-description.ods':                 'Objetivos de Desenvolvimento Sustentável no KinoCampus — comunidade universitária da UFG.',
    'meta-description.oportunidades':       'Oportunidades para estudantes da UFG. Estágios, empregos, freelancer, monitorias, bolsas e voluntariado no KinoCampus.',
    'meta-description.profile':             'Perfil de usuário no KinoCampus — comunidade universitária da UFG.',
    'meta-description.privacidade':         'Declaração de Privacidade do KinoCampus: dados tratados, finalidades, direitos dos titulares, cookies e contato.',
    'meta-description.search-results':      'Busca no KinoCampus — encontre publicações, eventos, oportunidades e mais na comunidade da UFG.',
    'meta-description.settings':            'Configurações da sua conta no KinoCampus — comunidade universitária da UFG.',
    'meta-description.sobre':               'Conheça o KinoCampus: plataforma comunitária independente da UFG, sua missão, governança, processo de curadoria e canais oficiais.',
    'meta-description.transparencia':        'Central de Transparência do KinoCampus: privacidade, termos, cookies, suporte, LGPD e canais de contato.',
    'meta-description.termos':              'Termos de Uso do KinoCampus: regras da comunidade, conta, publicações, moderação e responsabilidades.',
    'meta-description.product':             'KinoCampus — plataforma da comunidade universitária da UFG. Compra e venda, caronas, moradia, eventos, oportunidades e achados/perdidos entre estudantes.',
    'meta-description.admin-banners':       'Gerencie banners e comunicações administrativas do KinoCampus.',
    'meta-description.admin-help-requests': 'Acompanhe e responda pedidos de ajuda enviados pela comunidade KinoCampus.',
    'meta-description.admin-index':         'Painel administrativo do KinoCampus — comunidade universitária da UFG.',
    'meta-description.admin-moderation':    'Modere publicações e conteúdos reportados no painel administrativo do KinoCampus.',
    'meta-description.admin-reports':       'Analise denúncias recebidas no painel administrativo do KinoCampus.',
    'meta-description.admin-privacy-analytics': 'Acompanhe consentimento, armazenamento local e analytics agregados do KinoCampus.',

    // ── Alt text estático ──────────────────────────────────────────────────────
    'alt.avatar-preview':        'Preview do avatar',
    'alt.profile-avatar':        'Avatar',
    'alt.product-image':         'Imagem da publicação',
    'alt.author-avatar':         'Avatar do autor',
    'alt.comment-user-avatar':   'Seu avatar',

    // ── Aria-label estático (v12.7.1 — fase 2 i18n runtime) ───────────────────
    // Header / navbar / ações comuns em todas as páginas
    'aria-label.brand-home':            'KinoCampus - Comunidade UFG',
    'aria-label.search-input':          'Pesquisar',
    'aria-label.search-submit':         'Buscar',
    'aria-label.notifications-bell':    'Notificações',
    'aria-label.theme-toggle':          'Alternar tema claro/escuro',
    'aria-label.theme-toggle-admin':    'Alternar tema',
    'aria-label.menu-open':             'Abrir menu',
    'aria-label.menu-close':            'Fechar menu',
    'aria-label.create-post':           'Criar publicação',
    'aria-label.close':                 'Fechar',
    'aria-label.privacy-cookie-notice': 'Aviso de privacidade e cookies',
    'aria-label.close-cookie-preferences': 'Fechar preferências de cookies',
    'aria-label.about-kinocampus':     'Sobre o KinoCampus',

    // Feed / module rails
    'aria-label.feed-sort':             'Ordenação do feed',
    'aria-label.feed-view':             'Visualização do feed',
    'aria-label.categories-help':       'Como a relevância funciona',
    'aria-label.close-explanation':     'Fechar explicação',
    'aria-label.market-rail':           'Seções rápidas de compra e venda',
    'aria-label.lostfound-rail':        'Seções rápidas de achados e perdidos',
    'aria-label.context-home':             'Informações sobre o KinoCampus',
    'aria-label.context-achados-perdidos': 'Informações sobre Achados e Perdidos',
    'aria-label.context-eventos':       'Informações sobre Eventos',
    'aria-label.context-moradia':       'Informações sobre Moradia',
    'aria-label.context-oportunidades': 'Informações sobre Oportunidades',
    'aria-label.context-compra-venda':  'Informações sobre Compra e Venda',
    'aria-label.context-caronas':       'Informações sobre Caronas',
    'aria-label.housing-rail':          'Seções rápidas de moradia',
    'aria-label.opportunity-rail':      'Seções rápidas de oportunidades',
    'aria-label.caronas-rail':          'Seções do painel lateral',
    'aria-label.eventos-rail':          'Seções do painel lateral',
    'aria-label.events-context':        'Contexto sobre eventos',
    'aria-label.opportunities-context': 'Contexto sobre oportunidades',
    'aria-label.housing-context':       'Contexto sobre moradia',
    'aria-label.marketplace-context':   'Contexto sobre compra e venda',
    'aria-label.rides-context':         'Contexto sobre caronas',
    'aria-label.lostfound-context':     'Contexto sobre achados e perdidos',

    // Home carousel e modais
    'aria-label.carousel-prev':         'Slide anterior',
    'aria-label.carousel-next':         'Próximo slide',
    'aria-label.ranking-close':         'Fechar',

    // Account setup e profile
    'aria-label.onboarding-steps':      'Etapas do onboarding',
    'aria-label.profile-configure':     'Configurar perfil',
    'aria-label.profile-legacy-badge':  'Perfil de exemplo',
    'aria-label.profile-tabs':          'Seções do perfil',
    'aria-label.start-chat':            'Iniciar conversa',

    // Mensagens
    'aria-label.chat-list':             'Lista de conversas',
    'aria-label.chat-conversation':     'Conversa',
    'aria-label.chat-back':             'Voltar para a lista de conversas',
    'aria-label.chat-profile':          'Ver perfil',
    'aria-label.chat-block':            'Bloquear conversa',
    'aria-label.chat-search-conversation': 'Buscar conversa',
    'aria-label.chat-attach':           'Anexar imagem',
    'aria-label.chat-send':             'Enviar mensagem',

    // Calendário de eventos
    'aria-label.calendar-expand':       'Expandir calendário',
    'aria-label.calendar-view':         'Modo de visualização do calendário',
    'aria-label.calendar-prev':         'Período anterior',
    'aria-label.calendar-next':         'Próximo período',
    'aria-label.calendar-today':        'Voltar para hoje',
    'aria-label.calendar-modal':        'Calendário de Eventos',
    'aria-label.calendar-modal-close':  'Fechar',
    'aria-label.calendar-modal-prev':   'Anterior',
    'aria-label.calendar-modal-next':   'Próximo',

    // Product / detalhe
    'aria-label.breadcrumb':            'Navegação de trilha',
    'aria-label.save-close':            'Fechar opções de salvar',
    'aria-label.share-whatsapp':        'Compartilhar no WhatsApp',
    'aria-label.share-copy':            'Copiar link da publicação',
    'aria-label.view-author':           'Ver perfil do autor',

    // Editor de comentário
    'aria-label.comment-author':        'Seu nome no comentário',
    'aria-label.comment-text':          'Escreva seu comentário',
    'aria-label.format-bold':           'Negrito',
    'aria-label.format-italic':         'Itálico',
    'aria-label.format-underline':      'Sublinhado',
    'aria-label.format-strike':         'Tachado',
    'aria-label.format-code':           'Código inline',
    'aria-label.format-quote':          'Citação',
    'aria-label.format-bullet':         'Lista com marcadores',
    'aria-label.format-link':           'Inserir link',

    // Admin
    'aria-label.admin-nav':             'Navegação admin',
    'aria-label.menu-mobile':           'Menu mobile',
    'aria-label.cadu-sites-search':     'Filtrar sites',
    'aria-label.cadu-sites-tier':       'Filtrar por tier',
    'aria-label.cadu-feed-search':      'Filtrar feed',
    'aria-label.cadu-feed-limit':       'Limite',
    'placeholder.cadu-sites-search':    'Filtrar por nome, site ou @instagram',
    'placeholder.cadu-feed-search':     'Filtrar por conteúdo do chunk',
    'tooltip.cadu-notifications':       'Notificações Cadu (runs recentes, publicações)',
    'tooltip.cadu-context':             'Endpoint /api/openclaw/context disponível (consolida sites+pipeline+feed+openclaw em 1 request)',
    'tooltip.cadu-version':             'Versão cadu-api',
    'tooltip.cadu-refresh':             'Atualizar',
    'tooltip.cadu-pipeline-idle':       'Sem run ativo',
    'aria-label.admin-insights':        'Insights do dashboard',
    'aria-label.series-picker':         'Configurar séries do gráfico',
    'aria-label.audit-log':             'Audit log de ações administrativas',
    'aria-label.audit-log-filters':     'Filtros do audit log',
    'aria-label.audit-actor-filter':    'Filtrar por ator',
    'aria-label.chart-modal-close':     'Fechar gráfico ampliado',
    'aria-label.filter-entity':         'Filtrar por entidade',
    'aria-label.filter-action':         'Filtrar por ação',
    'aria-label.records-per-page':      'Registros por página',
    'aria-label.banner-modal-close':    'Fechar',
    'aria-label.banners-metrics-period': 'Período das métricas de banners',
    'aria-label.feed-ads-metric-window': 'Período das métricas dos anúncios de feed',
    'aria-label.feed-ads-filter-query':  'Buscar campanhas de anúncio',
    'aria-label.feed-ads-filter-status': 'Filtrar anúncios por status',
    'aria-label.feed-ads-filter-module': 'Filtrar anúncios por módulo',
    'aria-label.privacy-event-log-filters': 'Filtros dos eventos recentes',
    'aria-label.privacy-event-log-prev': 'Página anterior dos eventos recentes',
    'aria-label.privacy-event-log-next': 'Próxima página dos eventos recentes',
    'aria-label.admin-trends-filters':   'Filtros das tendências de busca',
    'aria-label.admin-trends-query':     'Filtrar tendências de busca',
    'aria-label.admin-trends-page-size': 'Linhas por página em tendências de busca',
    'aria-label.admin-trends-pagination': 'Paginação das tendências de busca',
    'aria-label.search-results-filters': 'Filtros dos resultados de busca',
    'aria-label.search-results-module':  'Filtrar por módulo',
    'aria-label.search-results-sort':    'Ordenar resultados',

    // My posts popover
    'aria-label.my-posts-save-close':   'Fechar',

    // Navegação (v12.8.1 — trilha B3 a11y)
    'aria-label.nav-main':              'Navegação principal',
    'aria-label.nav-mobile':            'Menu mobile',
    // 404 institucional (v76.20)
    'aria-label.error-modules':         'Módulos da comunidade UFG',
    'aria-label.footer-institutional':  'Rodapé institucional',
    'aria-label.footer-links':          'Links institucionais',

    // Ranking info (v12.8.1 — trilha B3 a11y)
    'aria-label.how-ranking-works':     'Como funciona o ranking?',

    // Admin moderation filters (v12.8.1 — trilha B3 a11y)
    'aria-label.filter-mod-status':        'Filtrar por status de moderação',
    'aria-label.filter-mod-global-module': 'Módulo — limite global',
    'aria-label.filter-mod-user-module':   'Módulo — limite por usuário',
    'aria-label.admin-flood-global-module': 'Módulo — ritmo global',
    'aria-label.admin-flood-global-max':    'Máximo de publicações na janela global',
    'aria-label.admin-flood-global-window': 'Janela global em minutos',
    'aria-label.admin-flood-user-module':   'Módulo — ritmo por usuário',
    'aria-label.admin-flood-user-max':      'Máximo de publicações na janela do usuário',
    'aria-label.admin-flood-user-window':   'Janela do usuário em minutos',
    'aria-label.refresh-list':             'Atualizar lista',

    // ── Placeholder estático (v12.7.1 — fase 2 i18n runtime) ──────────────────
    // Busca principal por módulo
    'placeholder.search-main':          'Busque por itens, eventos, vagas na UFG...',
    'placeholder.search-marketplace':   'Busque por produtos...',
    'placeholder.search-caronas':       'Busque por caronas...',
    'placeholder.search-moradia':       'Busque por moradia perto da UFG...',
    'placeholder.search-opportunities': 'Busque por vagas e oportunidades...',
    'placeholder.search-events':        'Busque por eventos na UFG...',
    'placeholder.search-lostfound':     'Busque por itens perdidos ou encontrados...',

    // Faixas de preço (varia por módulo)
    'placeholder.price-min':            'R$ 0',
    'placeholder.price-max-housing':    'R$ 3000',
    'placeholder.price-max-market':     'R$ 5000',
    'placeholder.price-max-caronas':    'R$ 30',
    'placeholder.price-max-opportunities': 'R$ 10000',

    // Caronas filters
    'placeholder.any-origin':           'Qualquer origem...',
    'placeholder.any-destination':      'Qualquer destino...',

    // Perfil e onboarding
    'placeholder.profile-display-name': 'Como você quer aparecer no KinoCampus',
    'placeholder.profile-bio':          'Fale um pouco sobre você, seu curso ou o que procura por aqui.',
    'placeholder.account-bio':          'Curso, área de interesse, projetos ou o que você costuma compartilhar por aqui.',
    'placeholder.gender-custom':        'Escreva do seu jeito',

    // Contato / social
    'placeholder.country-code':         '+55',
    'placeholder.phone-number':         'Número com DDD ou número local',
    'placeholder.phone-brazil':         '(62) 99876-5432',
    'placeholder.social-handle':        '@seuusuario ou URL do perfil',
    'placeholder.linkedin-url':         'linkedin.com/in/seuperfil',
    'placeholder.facebook-url':         'facebook.com/seuperfil',
    'placeholder.email-generic':        'voce@dominio.com',
    'placeholder.email-institutional':  'voce@ufg.br',
    'placeholder.lattes-url':           'URL ou identificador do Lattes',

    // Auth-callback (reset de senha)
    'placeholder.password-min':         'Minimo de 6 caracteres',
    'placeholder.password-repeat':      'Repita a senha',

    // Ajuda
    'placeholder.help-subject':         'Resumo curto do pedido',
    'placeholder.help-message':         'Explique o contexto e os detalhes que ajudam a entender ou reproduzir a situação.',

    // Comentário
    'placeholder.comment':              'Deixe o seu comentário',
    'placeholder.chat-search-conversation': 'Buscar conversa',
    'placeholder.chat-message':         'Escreva uma mensagem...',
    'placeholder.external-access-note': 'Adicione uma observação para a resposta ao solicitante.',

    // Admin banners
    'placeholder.banner-pill':          'ex: Destaque',
    'placeholder.banner-title':         'ex: Semana de Sustentabilidade UFG',
    'placeholder.banner-subtitle':      'ex: Troque materiais, ganhe cashback em dobro...',
    'placeholder.banner-cta-text':      'ex: Ver Programação',
    'placeholder.banner-cta-url':       'ex: eventos.html',
    'placeholder.banner-icon':          'ex: fas fa-calendar-alt',
    'placeholder.banner-grad-from':     '#4F46E5',
    'placeholder.banner-grad-to':       '#7C3AED',
    'placeholder.feed-ad-name':         'ex: Vestibular parceiro - junho',
    'placeholder.feed-ad-advertiser':   'ex: Centro Acadêmico, empresa ou projeto',
    'placeholder.feed-ad-title':        'ex: Bolsas abertas para estudantes UFG',
    'placeholder.feed-ad-description':  'Resumo curto, objetivo e transparente.',
    'placeholder.feed-ad-image-url':    'https://...',
    'placeholder.feed-ad-target-url':   'https://...',
    'placeholder.feed-ad-tags':         'ex: bolsa, edital, curso, evento',
    'placeholder.feed-ad-notes':        'Contrato, responsável, valor combinado ou observação de curadoria.',
    'placeholder.feed-ads-filter-query': 'Buscar por campanha, anunciante ou URL',
    'placeholder.adsense-client-id':    'ca-pub-...',
    'placeholder.adsense-slot':         'data-ad-slot',
    'placeholder.adsense-notes':        'Ex.: aprovação no AdSense, slots criados, restrições de página e orientações para anunciantes.',

    // Admin help-requests / moderation
    'placeholder.admin-help-search':    'Buscar por assunto, e-mail ou página',
    'placeholder.admin-mod-search':     'Buscar por título, ID, nome ou nickname',
    'placeholder.admin-user-search':    'Buscar usuário por nome, e-mail ou nickname…',
    'placeholder.admin-actor-filter':   'Filtrar por actor_id, nome ou nickname',
    'placeholder.audit-actor-filter':   'Ator: nome ou UUID',
    'placeholder.privacy-page-filter':  'Filtrar por página',
    'placeholder.privacy-event-log-search': 'Filtrar evento, página, módulo ou entidade',
    'placeholder.admin-trends-query':   'Filtrar termo, módulo ou entidade',
    'placeholder.admin-invite-email':   'E-mail do convidado (ex: usuario@gmail.com)',
    'placeholder.admin-invite-reason':  'Motivo do convite (opcional)',
    'placeholder.admin-limit-max':      'Máx.',

    // ── Tooltips (atributo title em botões, selects e links) ──────────────
    // Tema
    'tooltip.theme-toggle':             'Alternar tema',
    'tooltip.banners-metrics-period':   'Período das métricas',
    // Ranking / info
    'tooltip.how-it-works':             'Como funciona?',
    'tooltip.how-ranking-works':        'Como funciona o ranking?',
    // Perfil
    'tooltip.view-author':              'Ver perfil do autor',
    'tooltip.verified-user':            'Usuário verificado',
    // Editor de rich text
    'tooltip.format-bold':              'Negrito',
    'tooltip.format-italic':            'Itálico',
    'tooltip.format-underline':         'Sublinhado',
    'tooltip.format-strike':            'Tachado',
    'tooltip.format-code':              'Código inline',
    'tooltip.format-quote':             'Citação',
    'tooltip.format-bullet':            'Lista',
    'tooltip.format-link':              'Link',
    // Filtros admin
    'tooltip.filter-status':            'Filtrar por status',
    'tooltip.filter-category':          'Filtrar por categoria',
    'tooltip.filter-urgency':           'Filtrar por urgência',
    'tooltip.filter-report-status':     'Filtrar por status da denúncia',
    'tooltip.filter-reason':            'Filtrar por motivo',
    'tooltip.filter-module':            'Filtrar por módulo',
    'tooltip.privacy-event-filter':     'Filtrar por tipo de evento de privacidade',
    'tooltip.period-filter':            'Período',
    'tooltip.series-config':            'Escolher quais séries exibir e suas cores',
    'tooltip.audit-action-filter':      'Filtrar por ação',
    'tooltip.audit-entity-filter':      'Filtrar por entidade',
    'tooltip.refresh':                  'Recarregar dados',
    'tooltip.refresh-list':             'Atualizar lista',
    'tooltip.remove-global-limit':      'Remover override global (volta ao padrão de 5)',
    // Mensagens
    'tooltip.chat-profile':             'Ver perfil',
    'tooltip.chat-block':               'Bloquear conversa',
    'tooltip.chat-attach':              'Anexar imagem',
    'tooltip.chat-send':                'Enviar mensagem',
    // Admin banners
    'tooltip.color-start':              'Escolher cor inicial',
    'tooltip.color-end':                'Escolher cor final',
    // ODS badges (index.html)
    'tooltip.ods-04':                   'ODS 04: Educação de Qualidade',
    'tooltip.ods-11':                   'ODS 11: Cidades e Comunidades Sustentáveis',
    'tooltip.ods-12':                   'ODS 12: Consumo e Produção Responsáveis',
    'tooltip.ods-13':                   'ODS 13: Ação Contra a Mudança Global do Clima',
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

  function translateWithFallback(key, fallback) {
    if (!key) return fallback || '';
    var value = t(key);
    return value === key ? (fallback || '') : value;
  }

  function getDocument(root) {
    if (root && root.nodeType === 9) return root;
    if (root && root.ownerDocument) return root.ownerDocument;
    if (typeof document !== 'undefined') return document;
    return null;
  }

  function getMetadataRoot(root, doc) {
    if (root && root.nodeType === 1 && typeof root.getAttribute === 'function') return root;
    return doc ? doc.documentElement : null;
  }

  function findOrCreateMetaDescription(doc) {
    var meta = doc.querySelector('meta[name="description"]');
    if (!meta && doc.head && typeof doc.createElement === 'function') {
      meta = doc.createElement('meta');
      meta.setAttribute('name', 'description');
      doc.head.appendChild(meta);
    }
    return meta;
  }

  function applyDocumentMetadata(root) {
    var doc = getDocument(root);
    var source = getMetadataRoot(root, doc);
    if (!doc || !source || typeof source.getAttribute !== 'function') {
      return false;
    }

    var changed = false;
    var titleKey = source.getAttribute('data-i18n-title');
    var descriptionKey = source.getAttribute('data-i18n-description');

    if (titleKey) {
      var titleEl = doc.querySelector('title');
      var currentTitle = titleEl ? titleEl.textContent : doc.title;
      var nextTitle = translateWithFallback(titleKey, currentTitle);
      if (nextTitle) {
        doc.title = nextTitle;
        if (titleEl) titleEl.textContent = nextTitle;
        changed = true;
      }
    }

    if (descriptionKey) {
      var meta = findOrCreateMetaDescription(doc);
      var currentDescription = meta ? meta.getAttribute('content') : '';
      var nextDescription = translateWithFallback(descriptionKey, currentDescription);
      if (meta && nextDescription) {
        meta.setAttribute('content', nextDescription);
        changed = true;
      }
    }

    return changed;
  }

  function applyStaticAlts(root) {
    var doc = getDocument(root);
    var scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
    if (!scope || typeof scope.querySelectorAll !== 'function') {
      return 0;
    }

    var count = 0;
    var images = scope.querySelectorAll('img[data-i18n-alt]');
    Array.prototype.forEach.call(images, function (img) {
      var key = img.getAttribute('data-i18n-alt');
      var fallback = img.getAttribute('alt') || '';
      var value = translateWithFallback(key, fallback);
      img.setAttribute('alt', value);
      count += 1;
    });
    return count;
  }

  /**
   * Aplica aria-label estático em qualquer elemento marcado com
   * data-i18n-aria-label="aria-label.<nome>". Preserva fallback pt-BR
   * quando a chave não existe no dicionário.
   *
   *   <button data-i18n-aria-label="aria-label.close" aria-label="Fechar">
   */
  function applyAriaLabels(root) {
    var doc = getDocument(root);
    var scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
    if (!scope || typeof scope.querySelectorAll !== 'function') {
      return 0;
    }

    var count = 0;
    var elements = scope.querySelectorAll('[data-i18n-aria-label]');
    Array.prototype.forEach.call(elements, function (el) {
      if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
      var key = el.getAttribute('data-i18n-aria-label');
      var fallback = el.getAttribute('aria-label') || '';
      var value = translateWithFallback(key, fallback);
      if (value) {
        el.setAttribute('aria-label', value);
        count += 1;
      }
    });
    return count;
  }

  /**
   * Aplica placeholder estático em qualquer input/textarea marcado com
   * data-i18n-placeholder="placeholder.<nome>". Preserva fallback pt-BR
   * quando a chave não existe no dicionário.
   *
   *   <input data-i18n-placeholder="placeholder.search-main" placeholder="Busque...">
   */
  function applyPlaceholders(root) {
    var doc = getDocument(root);
    var scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
    if (!scope || typeof scope.querySelectorAll !== 'function') {
      return 0;
    }

    var count = 0;
    var elements = scope.querySelectorAll('[data-i18n-placeholder]');
    Array.prototype.forEach.call(elements, function (el) {
      if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
      var key = el.getAttribute('data-i18n-placeholder');
      var fallback = el.getAttribute('placeholder') || '';
      var value = translateWithFallback(key, fallback);
      if (value) {
        el.setAttribute('placeholder', value);
        count += 1;
      }
    });
    return count;
  }

  /**
   * Aplica o atributo `title` (tooltip do browser) em qualquer elemento
   * marcado com data-i18n-tooltip="tooltip.<nome>". Preserva o fallback
   * pt-BR quando a chave não existe no dicionário.
   *
   *   <button data-i18n-tooltip="tooltip.theme-toggle" title="Alternar tema">
   *
   * Nota: data-i18n-tooltip NÃO conflita com data-i18n-title (usado apenas
   * no elemento <html> para o metadata de page-title).
   */
  function applyTooltips(root) {
    var doc = getDocument(root);
    var scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
    if (!scope || typeof scope.querySelectorAll !== 'function') {
      return 0;
    }

    var count = 0;
    var elements = scope.querySelectorAll('[data-i18n-tooltip]');
    Array.prototype.forEach.call(elements, function (el) {
      if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
      var key = el.getAttribute('data-i18n-tooltip');
      var fallback = el.getAttribute('title') || '';
      var value = translateWithFallback(key, fallback);
      if (value) {
        el.setAttribute('title', value);
        count += 1;
      }
    });
    return count;
  }

  function applyRuntimeI18n() {
    applyDocumentMetadata();
    applyStaticAlts();
    applyAriaLabels();
    applyPlaceholders();
    applyTooltips();
  }

  function onReady(callback) {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }
    callback();
  }

  window.KCi18n = {
    locale: _locale,
    t: t,
    n: n,
    keys: keys,
    applyDocumentMetadata: applyDocumentMetadata,
    applyStaticAlts: applyStaticAlts,
    applyAriaLabels: applyAriaLabels,
    applyPlaceholders: applyPlaceholders,
    applyTooltips: applyTooltips,
  };

  onReady(applyRuntimeI18n);

}());
