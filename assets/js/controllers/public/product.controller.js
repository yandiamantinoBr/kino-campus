/*
  KinoCampus - Product (Detalhes) Controller (V8.1.2.4.5)
  - Carrega post por ID usando KCAPI + KCPostModel
  - Aplica regras centrais (KCUtils.applyPresentationRules)
  - Mantém comentários e UI existente (sem regressão visual)
*/

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  let currentPost = null;
  let currentUser = null;
  let currentProfile = null;
  let staticInteractionsBound = false;
  const shared = window.KCAccountProfileUtils || {};
  let sellerStatsRequestToken = 0;
  // ── Share popover ────────────────────────────────────────
  // ── Badge "editado" ──────────────────────────────────────
  function getParam(name) {
    const params = new URLSearchParams(window.location.search || '');
    return params.get(name);
  }

  function esc(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    console.error('[KC Product] KCUtils.escapeHtml indisponível.');
    return '';
  }

  function moduleLabel(key) {
    if (window.KCUtils && typeof window.KCUtils.getModuleLabel === 'function') return window.KCUtils.getModuleLabel(key);
    return String(key || '');
  }

  function formatCurrency(n) {
    if (window.KCUtils && typeof window.KCUtils.formatCurrencyBRL === 'function') return window.KCUtils.formatCurrencyBRL(n);
    try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (_) { return String(n); }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html || '';
  }

  function show(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display || '';
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }

  function buildCurrentPagePath() {
    const path = String(window.location.pathname || '/product.html').trim() || '/product.html';
    return `${path}${window.location.search || ''}${window.location.hash || ''}`;
  }

  function buildPostContactIntent(post) {
    return {
      type: 'product_contact',
      path: buildCurrentPagePath(),
      postId: String((post && (post.id || post.uuid)) || '').trim(),
      postUuid: String((post && post.uuid) || '').trim(),
      createdAt: new Date().toISOString()
    };
  }

  function buildProfileHref(profileId) {
    const normalized = String(profileId || '').trim();
    return normalized ? `profile.html?id=${encodeURIComponent(normalized)}` : 'profile.html';
  }

  function isViewerAuthenticated() {
    return !!(currentUser && currentUser.id);
  }

  // resolveCurrentUserDisplayName / resolveCurrentUserAvatar → window._KCProduct.load
  function getContactActionPresentation(action, post) {
    const fallbackCta = post && post._kcCTA ? post._kcCTA : null;
    const iconMap = {
      whatsapp: 'fab fa-whatsapp',
      email_public: 'fas fa-envelope',
      instagram: 'fab fa-instagram',
      linkedin: 'fab fa-linkedin',
      facebook: 'fab fa-facebook',
      login_required: 'fas fa-right-to-bracket',
      view_profile: 'fas fa-id-badge',
      external_link: 'fas fa-arrow-up-right-from-square',
      real_form: 'fas fa-paper-plane',
      safe_fallback: 'fas fa-circle-info'
    };

    return {
      label: String((action && action.label) || (fallbackCta && fallbackCta.label) || 'Entrar em contato').trim(),
      iconClass: String((action && action.iconClass) || (fallbackCta && fallbackCta.iconClass) || iconMap[String((action && action.type) || '').trim()] || 'fas fa-paper-plane').trim()
    };
  }

  function executeContactAction(action, post) {
    if (!action) return false;

    if (action.type === 'closed') {
      toast('Esta publicacao foi encerrada.', 'info', 2200);
      return true;
    }

    if (action.type === 'login_required') {
      if (typeof window.kcQueueAuthIntent === 'function') {
        window.kcQueueAuthIntent(buildPostContactIntent(post));
      }
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login', nextPath: buildCurrentPagePath() });
      } else {
        window.location.href = 'index.html#login';
      }
      return true;
    }

    if (action.href) {
      if (action.target === '_blank') {
        window.open(action.href, '_blank', action.rel || 'noopener,noreferrer');
      } else {
        window.location.href = action.href;
      }
      return true;
    }

    if (typeof action.handler === 'function') {
      action.handler();
      return true;
    }

    return false;
  }

  function getPostContactAction(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    const moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    const categoryKey = String(post && (post.categoria || post.category) || '').trim().toLowerCase();
    const status = String(post && (post.status || post.estado) || '').trim().toLowerCase();
    const authorId = (window._KCProduct.render && window._KCProduct.render.getPostAuthorId ? window._KCProduct.render.getPostAuthorId(post) : null);
    const viewProfileHref = buildProfileHref(authorId);
    const authorProfile = post && post.authorProfile && typeof post.authorProfile === 'object' ? post.authorProfile : null;

    if (status === 'closed' || post.isClosed === true) {
      return {
        type: 'closed',
        label: 'Encerrado',
        iconClass: 'fas fa-lock',
        handler: function () {
          toast('Esta publicacao foi encerrada.', 'info', 2200);
        },
      };
    }

    // link_as_cta: o criador do post marcou o link para ser a ação principal
    if (meta.link_as_cta) {
      const ctaUrl = String(meta.link || post.link || post.externalUrl || '').trim();
      if (/^https?:\/\//i.test(ctaUrl)) {
        if (!isViewerAuthenticated()) {
          return { type: 'login_required', label: 'Entrar para acessar' };
        }
        return {
          type: 'external_link',
          label: 'Acessar link',
          href: ctaUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        };
      }
    }

    if (authorProfile && shared && typeof shared.buildContactAction === 'function') {
      const profileAction = shared.buildContactAction({
        profile: authorProfile,
        viewerAuthenticated: isViewerAuthenticated(),
        postTitle: post && (post.titulo || post.title) || '',
        postUrl: window.location.href,
        viewProfileHref
      });
      if (profileAction && profileAction.type && profileAction.type !== 'unavailable') {
        return profileAction;
      }
    }

    const whatsappRaw = post && (post.whatsapp || post.whatsappNumber || post.contatoWhatsapp) || meta.whatsapp;
    const whatsapp = normalizeWhatsAppPhone(whatsappRaw);
    if (whatsapp) {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      const message = shared && typeof shared.buildContactMessage === 'function'
        ? shared.buildContactMessage(post && (post.titulo || post.title) || '', window.location.href)
        : `${post && (post.titulo || post.title) || 'KinoCampus'}\n${window.location.href}`;
      return {
        type: 'whatsapp',
        label: 'Falar no WhatsApp',
        href: 'https://wa.me/' + encodeURIComponent(whatsapp) + '?text=' + encodeURIComponent(message),
        target: '_blank',
        rel: 'noopener noreferrer'
      };
    }

    const externalUrl = String(post && (post.link || post.externalUrl || post.url || post.formUrl) || meta.formUrl || meta.externalUrl || '').trim();
    const isOpportunityForm = moduleKey === 'oportunidades' || categoryKey === 'estagio' || categoryKey === 'emprego';

    if (isOpportunityForm && typeof window.openFormModal === 'function') {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      return {
        type: 'real_form',
        label: 'Enviar interesse',
        handler: () => window.openFormModal({ postId: post && (post.id || post.uuid) || null, post })
      };
    }

    if (/^https?:\/\//i.test(externalUrl)) {
      if (!isViewerAuthenticated()) {
        return { type: 'login_required', label: 'Entrar para contatar' };
      }
      return {
        type: 'external_link',
        label: 'Abrir canal de contato',
        href: externalUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      };
    }

    if (authorId) {
      return {
        type: 'view_profile',
        label: 'Ver perfil',
        href: viewProfileHref
      };
    }

    return {
      type: 'safe_fallback',
      label: 'Contato indisponivel',
      handler: () => {
        toast('Contato indisponivel para esta publicacao.', 'warn', 2400);
      }
    };
  }

  function setCTA(post) {
    const btn = document.getElementById('primaryCta');
    if (!btn) return;

    const action = getPostContactAction(post);
    const presentation = getContactActionPresentation(action, post);
    btn.innerHTML = `<i class="${esc(presentation.iconClass)}"></i> ${esc(presentation.label)}`;
    btn.dataset.kcCtaLabel = presentation.label;
    btn.dataset.kcCtaHref = String(action && action.href || '');
    btn.dataset.kcCtaTarget = String(action && action.target || '');
    btn.dataset.kcCtaRel = String(action && action.rel || '');
    btn.dataset.kcCtaActionType = String(action && action.type || 'safe_fallback');
    btn.classList.toggle('kc-product-cta--closed', !!(action && action.type === 'closed'));
    if (action && action.type === 'closed') {
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('aria-disabled');
    }

    if (btn.tagName === 'A') {
      btn.setAttribute('href', action && action.href ? action.href : '#');
      if (action && action.target) btn.setAttribute('target', action.target);
      else btn.removeAttribute('target');
      if (action && action.rel) btn.setAttribute('rel', action.rel);
      else btn.removeAttribute('rel');
    }

    if (btn.dataset.kcCtaBound !== '1') {
      btn.dataset.kcCtaBound = '1';
      btn.addEventListener('click', (event) => {
        try {
          const liveAction = getPostContactAction(currentPost || post || {});
          if (executeContactAction(liveAction, currentPost || post || {})) {
            event.preventDefault();
            if (liveAction && liveAction.type === 'closed') return;
            // Tracking de clique no CTA/cupom (fire-and-forget)
            try {
              const pid = (currentPost && (currentPost.uuid || currentPost.id)) || (post && (post.uuid || post.id));
              if (pid && window.KCAPI && typeof window.KCAPI.trackCouponClick === 'function') {
                window.KCAPI.trackCouponClick(pid).catch(() => {});
              }
            } catch (_) {}
            return;
          }

          throw new Error('cta_action_unresolved:' + String(btn.dataset.kcCtaActionType || 'unknown'));
        } catch (error) {
          event.preventDefault();
          reportCtaError('cta_click_failed', {
            message: error && error.message ? String(error.message) : 'unknown',
            postId: (currentPost && (currentPost.id || currentPost.uuid)) || (post && (post.id || post.uuid)) || null,
            module: (currentPost && (currentPost.modulo || currentPost.module)) || null,
            category: (currentPost && (currentPost.categoria || currentPost.category)) || null,
          });
          toast('Nao foi possivel executar esta acao agora.', 'error', 2400);
        }
      });
    }
  }

  function maybeResumeQueuedContact(post) {
    if (!post || !isViewerAuthenticated() || typeof window.kcConsumeAuthIntent !== 'function') return;

    const currentPath = buildCurrentPagePath();
    const identifiers = new Set([
      String(post.id || '').trim(),
      String(post.uuid || '').trim()
    ].filter(Boolean));

    const intent = window.kcConsumeAuthIntent((entry) => {
      if (!entry || entry.type !== 'product_contact') return false;
      const entryPath = String(entry.path || '').trim();
      const entryId = String(entry.postUuid || entry.postId || '').trim();
      return (entryPath && entryPath === currentPath) || (entryId && identifiers.has(entryId));
    });

    if (!intent) return;
    const action = getPostContactAction(post);
    if (action && action.type !== 'login_required') {
      executeContactAction(action, post);
    }
  }

  // resolveCurrentUserLogin / applyCommentComposerSessionState → window._KCProduct.load

  // Mapa módulo → groupId da categoria principal (espelha KC_CREATE_SCHEMA.categoryGroupId)
  const CATEGORY_GROUP_MAP = {
    'compra-venda': 'categoria',
    'moradia': 'tipo',
    'eventos': 'topico',
    'achados-perdidos': 'status',
    'oportunidades': 'tipo',
    'caronas': 'tipo',
  };

  function wireCreateSimilarBtn() {
    const btn = document.getElementById('createSimilarBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const post = currentPost;
      if (!post) return;
      const moduleKey = String(post.modulo || post.module || '').trim().toLowerCase();
      if (!moduleKey) return;
      const groupId = CATEGORY_GROUP_MAP[moduleKey];
      const catKey = String(post.categoriaKey || post.categoria || '').trim().toLowerCase();
      const selections = {};
      if (groupId && catKey) selections[groupId] = catKey;
      if (typeof window.kcOpenCreatePostModalPrefilled === 'function') {
        window.kcOpenCreatePostModalPrefilled(moduleKey, selections);
      } else if (typeof window.kcOpenCreatePostModal === 'function') {
        window.kcOpenCreatePostModal(moduleKey);
      }
    });
  }

  function bindStaticInteractions() {
    if (staticInteractionsBound) return;
    staticInteractionsBound = true;

    document.body.addEventListener('click', async (event) => {
      const actionTrigger = event.target.closest('[data-action]');
      const action = actionTrigger
        ? String(actionTrigger.dataset.action || '').trim().toLowerCase()
        : '';

      if (action === 'share-post') {
        // handled by wireSharePopover() directly on the button
      } else if (action === 'report-post') {
        console.log('[RC-8220][L1] Botão clicado: report-post');
      } else if (action === 'submit-comment') {
        console.log('[RC-8220][L1] Botão clicado: submit-comment');
      }

      const commentLikeBtn = event.target.closest('.kc-like-comment-btn');
      if (commentLikeBtn) {
        console.log('[RC-8220][L1] Botão clicado: comment-like', {
          postId: String(commentLikeBtn.dataset.postId || ''),
          commentId: String(commentLikeBtn.dataset.commentId || ''),
        });
      }

      // [data-kc-share] is now handled by wireSharePopover() directly


      const viewProfileBtn = event.target.closest('[data-kc-view-profile]');
      if (viewProfileBtn) {
        event.preventDefault();
        const authorId = (window._KCProduct.render && window._KCProduct.render.getPostAuthorId ? window._KCProduct.render.getPostAuthorId(currentPost) : null);
        if (authorId) {
          window.location.href = 'profile.html?id=' + encodeURIComponent(authorId);
        } else {
          toast('Perfil indisponível para esta publicação.', 'warn', 2000);
        }
        return;
      }

      const formatBtn = event.target.closest('[data-kc-format]');
      if (formatBtn) {
        event.preventDefault();
        const fmt = String(formatBtn.dataset.kcFormat || '').trim();
        if (fmt) {
          if (window.KCLazyLoader && typeof window.KCLazyLoader.load === 'function') {
            window.KCLazyLoader.load('assets/js/features/kc-comments.js', function() {
              if (typeof window.formatText === 'function') window.formatText(fmt);
            });
          } else if (typeof window.formatText === 'function') {
            window.formatText(fmt);
          }
        }
        return;
      }

      const submitCommentBtn = event.target.closest('[data-kc-submit-comment]');
      if (submitCommentBtn) {
        event.preventDefault();
        if (window.KCLazyLoader && typeof window.KCLazyLoader.load === 'function') {
          window.KCLazyLoader.load('assets/js/features/kc-comments.js', function() {
            if (typeof window.submitComment === 'function') window.submitComment();
          });
        } else if (typeof window.submitComment === 'function') {
          window.submitComment();
        }
        return;
      }

      const mobileMenuBtn = event.target.closest('[data-kc-mobile-menu]');
      if (mobileMenuBtn) {
        const action = String(mobileMenuBtn.dataset.kcMobileMenu || '').trim().toLowerCase();
        if (action === 'open' && typeof window.openMobileMenu === 'function') {
          window.openMobileMenu();
          return;
        }
        if (action === 'close' && typeof window.closeMobileMenu === 'function') {
          window.closeMobileMenu();
        }
      }
    });
  }


  // getPostAuthorId / showNotFound / setBreadcrumb / setBadges /
  // isLegacyExamplePost / isLegacyExampleProfile / buildLegacyExampleBadgeHtml /
  // syncLegacyExampleMarker / setGallery / setPrice / setDescription /
  // addSpec / addSpecHtml / setSpecs / buildTagEntries / buildTagsSpecHtml /
  // setOpenGraphTags / setLegacyBanner → window._KCProduct.render
  // (render functions removed — ver window._KCProduct.render)

  function setSeller(post) {
    const card = document.getElementById('sellerCard');
    const avatar = document.getElementById('sellerAvatar');
    const name = document.getElementById('sellerName');
    const handle = document.getElementById('sellerHandle');
    const stats = document.getElementById('sellerStats');
    if (!card || !avatar || !name || !stats) return;

    const normalizedName = post.authorName || post.autor || post.author || '';
    const normalizedAvatar = post.authorAvatar || post.autorAvatar || '';
    const publicHandle = String(post.authorHandle || '').trim()
      || (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function'
        ? window.KCUtils.buildPublicHandle(normalizedName)
        : '');
    const _R = window._KCProduct.render;
    const isLegacyExample = (_R && _R.isLegacyExamplePost ? _R.isLegacyExamplePost(post) : false)
      || (_R && _R.isLegacyExampleProfile ? _R.isLegacyExampleProfile(post && post.authorProfile) : false);

    const author = normalizedName || 'Autor';
    const avatarUrl = normalizedAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    avatar.src = avatarUrl;
    name.innerHTML = esc(author)
      + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '')
      + (isLegacyExample ? ' ' + (_R && _R.buildLegacyExampleBadgeHtml ? _R.buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--seller') : '') : '');

    // Handle (@login) abaixo do nome
    if (handle) {
      if (publicHandle) {
        handle.textContent = publicHandle;
        handle.style.display = 'block';
      } else {
        handle.style.display = 'none';
      }
    }

    const items = [];
    const authorProfile = post && post.authorProfile && typeof post.authorProfile === 'object' ? post.authorProfile : null;

    if (isLegacyExample) {
      items.push('<span><i class="fas fa-flask"></i> Perfil de exemplo</span>');
    }

    if (authorProfile && authorProfile.affiliation && shared && typeof shared.formatProfileValue === 'function') {
      const affiliationLabel = shared.formatProfileValue('affiliation', authorProfile.affiliation);
      if (affiliationLabel) {
        items.push('<span><i class="fas fa-user-graduate"></i> ' + esc(affiliationLabel) + '</span>');
      }
    }

    // Engajamento da publicação atual
    if (typeof post.votos === 'number' && post.votos > 0) {
      items.push('<span><i class="fas fa-fire"></i> ' + post.votos + ' voto' + (post.votos !== 1 ? 's' : '') + '</span>');
    }
    if (typeof post.comentarios === 'number' && post.comentarios > 0) {
      items.push('<span><i class="fas fa-comments"></i> ' + post.comentarios + ' coment' + (post.comentarios !== 1 ? 'ários' : 'ário') + '</span>');
    }

    // Membro desde (data de cadastro do perfil)
    if (post.authorCreatedAt) {
      try {
        const d = new Date(post.authorCreatedAt);
        if (!isNaN(d.getTime())) {
          const formatted = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          items.push('<span><i class="fas fa-calendar-alt"></i> Desde ' + formatted + '</span>');
        }
      } catch (_) { }
    }

    stats.innerHTML = items.join('');
    if (window._KCProduct.ratings && typeof window._KCProduct.ratings.refreshSellerRatingUI === 'function') {
      const fallbackSummary = (window._KCProduct.ratings.getSellerRatingSummaryFromPost && typeof window._KCProduct.ratings.getSellerRatingSummaryFromPost === 'function')
        ? window._KCProduct.ratings.getSellerRatingSummaryFromPost(post)
        : null;
      window._KCProduct.ratings.refreshSellerRatingUI(post, fallbackSummary, null, {
        currentUser: currentUser,
        getCurrentPost: function () { return currentPost; }
      });
    }
    card.style.display = 'block';
    if (window._KCProduct.load && typeof window._KCProduct.load.loadSellerAuthorStats === 'function') {
      window._KCProduct.load.loadSellerAuthorStats(post, stats, items.slice()).catch(() => {});
    }
  }

  function normalizeWhatsAppPhone(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    return '55' + digits;
  }

  function getPostContactActionLegacy(post) {
    const meta = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
    const moduleKey = String(post.modulo || post.module || '').trim().toLowerCase();
    const categoryKey = String(post.categoria || post.category || '').trim().toLowerCase();

    const whatsappRaw = post.whatsapp || post.whatsappNumber || post.contatoWhatsapp || meta.whatsapp;
    const whatsapp = normalizeWhatsAppPhone(whatsappRaw);
    if (whatsapp) {
      return {
        type: 'whatsapp',
        href: 'https://wa.me/' + encodeURIComponent(whatsapp),
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }

    const externalUrl = String(post.link || post.externalUrl || post.url || post.formUrl || meta.formUrl || meta.externalUrl || '').trim();
    if (/^https?:\/\//i.test(externalUrl)) {
      return {
        type: 'external_link',
        href: externalUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }

    const isOpportunityForm = moduleKey === 'oportunidades' || categoryKey === 'estagio' || categoryKey === 'emprego';
    if (isOpportunityForm && typeof window.openFormModal === 'function') {
      return {
        type: 'real_form',
        handler: () => window.openFormModal({ postId: post.id || post.uuid || null, post }),
      };
    }

    const authorId = (window._KCProduct.render && window._KCProduct.render.getPostAuthorId ? window._KCProduct.render.getPostAuthorId(post) : null);
    if (authorId) {
      return {
        type: 'open_contact',
        href: 'profile.html?id=' + encodeURIComponent(authorId),
      };
    }

    return {
      type: 'safe_fallback',
      handler: () => {
        toast('Contato indisponível para esta publicação.', 'warn', 2400);
      },
    };
  }

  function reportCtaError(reason, details) {
    const payload = {
      reason: String(reason || 'unknown_cta_error'),
      details: details && typeof details === 'object' ? details : {},
      at: new Date().toISOString(),
      page: window.location && window.location.pathname ? window.location.pathname : 'unknown',
    };
    try {
      console.error('[KC Product][CTA]', payload);
    } catch (_) { }
    try {
      window.dispatchEvent(new CustomEvent('kc:cta-error', { detail: payload }));
    } catch (_) { }
  }

  function setCTALegacy(post) {
    const btn = document.getElementById('primaryCta');
    if (!btn) return;

    const cta = post._kcCTA || { label: 'Entrar em contato', iconClass: 'fas fa-paper-plane' };
    const label = cta.label || 'Entrar em contato';
    const icon = cta.iconClass || 'fas fa-paper-plane';

    btn.innerHTML = `<i class="${esc(icon)}"></i> ${esc(label)}`;
    btn.dataset.kcCtaLabel = label;
    btn.dataset.kcCtaHref = '';
    btn.dataset.kcCtaTarget = '';
    btn.dataset.kcCtaRel = '';
    btn.dataset.kcCtaActionType = '';

    const action = getPostContactAction(post);
    btn.dataset.kcCtaActionType = action.type || 'safe_fallback';

    if (action.href) {
      btn.dataset.kcCtaHref = action.href;
      btn.dataset.kcCtaTarget = action.target || '';
      btn.dataset.kcCtaRel = action.rel || '';
    }

    if (btn.tagName === 'A') {
      btn.setAttribute('href', action.href || '#');
      if (action.target) btn.setAttribute('target', action.target);
      else btn.removeAttribute('target');
      if (action.rel) btn.setAttribute('rel', action.rel);
      else btn.removeAttribute('rel');
    }

    if (btn.dataset.kcCtaBound !== '1') {
      btn.dataset.kcCtaBound = '1';
      btn.addEventListener('click', (event) => {
        try {
          const href = String(btn.dataset.kcCtaHref || '').trim();
          const actionType = String(btn.dataset.kcCtaActionType || '').trim();
          const target = String(btn.dataset.kcCtaTarget || '').trim();

          if (href) {
            if (btn.tagName === 'A') return;
            event.preventDefault();
            if (target === '_blank') {
              window.open(href, '_blank', 'noopener,noreferrer');
            } else {
              window.location.href = href;
            }
            return;
          }

          const liveAction = getPostContactAction(currentPost || post || {});
          if (typeof liveAction.handler === 'function') {
            event.preventDefault();
            liveAction.handler();
            return;
          }

          throw new Error('cta_action_unresolved:' + actionType);
        } catch (error) {
          event.preventDefault();
          reportCtaError('cta_click_failed', {
            message: error && error.message ? String(error.message) : 'unknown',
            postId: (currentPost && (currentPost.id || currentPost.uuid)) || (post && (post.id || post.uuid)) || null,
            module: (currentPost && (currentPost.modulo || currentPost.module)) || null,
            category: (currentPost && (currentPost.categoria || currentPost.category)) || null,
          });
          toast('Não foi possível executar esta ação agora.', 'error', 2400);
        }
      });
    }
  }

  // Sub-módulos de render e lifecycle (v13.4.1 split) — carregados antes deste DOMContentLoaded.
  // window._KCProduct.render.showNotFound / setBreadcrumb / setGallery / ... — product.render.js
  window._KCProduct.render = window._KCProduct.render || {};
  // window._KCProduct.load.loadPost / refreshViewerState / renderPost / ... — product.load.js
  window._KCProduct.load = window._KCProduct.load || {};

  // Reports UI extraido para product.report.js (v11.30.10)
  // window._KCProduct.report.wireReportButton(ctx) - carregado apos este arquivo.
  window._KCProduct.report = window._KCProduct.report || {};

  // window._KCProduct.related.setRelated(post, viewerAuthenticated) — carregado após este arquivo.
  window._KCProduct.related = window._KCProduct.related || {};

  // window._KCProduct.calendar.setEventCalendar(post) / closeCalendarPopover() — carregado após este arquivo.
  window._KCProduct.calendar = window._KCProduct.calendar || {};

  // window._KCProduct.save.closeSavePopover() / wireSavePopover() / bindSavedActions(post, getViewer) — carregado após este arquivo.
  window._KCProduct.save = window._KCProduct.save || {};

  // window._KCProduct.ratings.refreshSellerRatingUI(...) / normalizeSellerRatingSummary(...) - carregado apos este arquivo.
  window._KCProduct.ratings = window._KCProduct.ratings || {};

  // window._KCProduct.edit.upsertOwnerActions(post, user, context) - carregado apos este arquivo.
  window._KCProduct.edit = window._KCProduct.edit || {};

  // window._KCProduct.analytics.renderAuthorAnalytics(post, user) - carregado apos este arquivo.
  window._KCProduct.analytics = window._KCProduct.analytics || {};

  // window._KCProduct.popovers.bindProductGlobalKeydown() / wireSharePopover({ getCurrentPost }) / closeSharePopover() - carregado apos este arquivo.
  window._KCProduct.popovers = window._KCProduct.popovers || {};

  document.addEventListener('DOMContentLoaded', () => {
    // Injeta deps no sub-módulo de lifecycle (product.load.js)
    if (window._KCProduct.load && typeof window._KCProduct.load.init === 'function') {
      window._KCProduct.load.init({
        getPost:        function () { return currentPost; },
        setPost:        function (p) { currentPost = p; },
        getUser:        function () { return currentUser; },
        setUser:        function (u) { currentUser = u; },
        getProfile:     function () { return currentProfile; },
        setProfile:     function (p) { currentProfile = p; },
        getParam:       function (name) { return getParam(name); },
        incrSellerToken: function () { return ++sellerStatsRequestToken; },
        getSellerToken: function () { return sellerStatsRequestToken; },
        setCTA:         function (post) { setCTA(post); },
        setSeller:      function (post) { setSeller(post); },
        resumeContact:  function (post) { maybeResumeQueuedContact(post); },
      });
    }
    if (window._KCProduct.popovers && typeof window._KCProduct.popovers.bindProductGlobalKeydown === 'function') {
      window._KCProduct.popovers.bindProductGlobalKeydown();
    }
    if (window._KCProduct.popovers && typeof window._KCProduct.popovers.wireSharePopover === 'function') {
      window._KCProduct.popovers.wireSharePopover({
        getCurrentPost: function () { return currentPost; }
      });
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.wireSavePopover === 'function') {
      window._KCProduct.save.wireSavePopover();
    }
    wireCreateSimilarBtn();
    bindStaticInteractions();
    document.addEventListener('kc:authchange', function () {
      if (window._KCProduct.load && typeof window._KCProduct.load.refreshViewerState === 'function') {
        window._KCProduct.load.refreshViewerState().catch(function () {});
      }
    });
    document.addEventListener('kc:profilechange', function () {
      if (currentPost && window._KCProduct.load && typeof window._KCProduct.load.enrichPostAuthorFromProfile === 'function') {
        window._KCProduct.load.enrichPostAuthorFromProfile(currentPost).then(function (post) {
          if (!post) return;
          currentPost = post;
          setSeller(post);
          setCTA(post);
        }).catch(function () {});
      }
      if (window._KCProduct.load && typeof window._KCProduct.load.refreshViewerState === 'function') {
        window._KCProduct.load.refreshViewerState().catch(function () {});
      }
    });
    if (window._KCProduct.load && typeof window._KCProduct.load.loadPost === 'function') {
      window._KCProduct.load.loadPost();
    }
  });
})();
