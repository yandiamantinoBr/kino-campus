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
  let productPopoverViewportBound = false;
  let productGlobalKeydownBound = false;
  const PRODUCT_POPOVER_DESKTOP_BREAKPOINT = 640;
  const PRODUCT_POPOVER_VIEWPORT_MARGIN = 12;
  const PRODUCT_POPOVER_GAP = 8;

  function getProductPopoverConfig(popoverId) {
    switch (String(popoverId || '')) {
      case 'sharePopover':
        return { anchorId: 'shareButton', desktopWidth: 220 };
      default:
        return null;
    }
  }

  function clearProductPopoverPosition(popover) {
    if (!popover) return;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    popover.style.removeProperty('right');
    popover.style.removeProperty('bottom');
    popover.style.removeProperty('width');
    popover.style.removeProperty('max-width');
  }

  function positionProductPopover(popoverId, anchorBtn) {
    const popover = document.getElementById(popoverId);
    const config = getProductPopoverConfig(popoverId);
    const anchor = anchorBtn || (config ? document.getElementById(config.anchorId) : null);
    if (!popover || !config || !anchor) return;

    if (window.innerWidth <= PRODUCT_POPOVER_DESKTOP_BREAKPOINT) {
      clearProductPopoverPosition(popover);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportMargin = PRODUCT_POPOVER_VIEWPORT_MARGIN;
    const maxWidth = Math.max(180, window.innerWidth - (viewportMargin * 2));
    const preferredWidth = Math.min(config.desktopWidth, maxWidth);
    const popoverHeight = Math.min(
      popover.scrollHeight || popover.offsetHeight || 0,
      Math.floor(window.innerHeight * 0.84)
    );

    let left = rect.left;
    if ((left + preferredWidth) > (window.innerWidth - viewportMargin)) {
      left = window.innerWidth - preferredWidth - viewportMargin;
    }
    if (left < viewportMargin) left = viewportMargin;

    let top = rect.bottom + PRODUCT_POPOVER_GAP;
    if ((top + popoverHeight) > (window.innerHeight - viewportMargin)) {
      top = rect.top - popoverHeight - PRODUCT_POPOVER_GAP;
      if (top < viewportMargin) top = viewportMargin;
    }

    popover.style.width = preferredWidth + 'px';
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.top = Math.round(top) + 'px';
    popover.style.left = Math.round(left) + 'px';
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
  }

  function scheduleProductPopoverPosition(popoverId, anchorBtn) {
    window.requestAnimationFrame(() => {
      const popover = document.getElementById(popoverId);
      if (!popover || !popover.classList.contains('active')) return;
      positionProductPopover(popoverId, anchorBtn);
    });
  }

  function syncActiveProductPopovers() {
    ['sharePopover'].forEach((popoverId) => {
      const popover = document.getElementById(popoverId);
      if (!popover || !popover.classList.contains('active')) return;
      const config = getProductPopoverConfig(popoverId);
      positionProductPopover(popoverId, config ? document.getElementById(config.anchorId) : null);
    });
  }

  function ensureProductPopoverViewportBinding() {
    if (productPopoverViewportBound) return;
    productPopoverViewportBound = true;

    let syncScheduled = false;
    const scheduleSync = () => {
      if (syncScheduled) return;
      syncScheduled = true;
      window.requestAnimationFrame(() => {
        syncScheduled = false;
        syncActiveProductPopovers();
      });
    };

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
  }

  function bindProductGlobalKeydown() {
    if (productGlobalKeydownBound) return;
    productGlobalKeydownBound = true;
    document.addEventListener('keydown', handleProductGlobalKeydown, { passive: true });
  }

  function handleProductGlobalKeydown(event) {
    if (!event || event.key !== 'Escape') return;
    closeSharePopover();
    if (window._KCProduct.save && typeof window._KCProduct.save.closeSavePopover === 'function') {
      window._KCProduct.save.closeSavePopover();
    }
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.closeCalendarPopover === 'function') {
      window._KCProduct.calendar.closeCalendarPopover();
    }
  }

  function trackCurrentPostShare() {
    try {
      const postId = currentPost && (currentPost.uuid || currentPost.id);
      if (postId && window.KCAPI && typeof window.KCAPI.trackShare === 'function') {
        window.KCAPI.trackShare(postId).catch(() => { });
      }
    } catch (_) { }
  }

  async function copyCurrentPostLink(options) {
    const utils = window.KCUtils;
    if (!utils || typeof utils.copyTextToClipboard !== 'function') return false;
    return utils.copyTextToClipboard(window.location.href, options);
  }

  // ── Share popover ────────────────────────────────────────
  function openSharePopover(btn) {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    if (!popover) return;
    if (window._KCProduct.save && typeof window._KCProduct.save.closeSavePopover === 'function') {
      window._KCProduct.save.closeSavePopover();
    }
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.closeCalendarPopover === 'function') {
      window._KCProduct.calendar.closeCalendarPopover();
    }
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    scheduleProductPopoverPosition('sharePopover', btn);
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closeSharePopover() {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    const btn      = document.getElementById('shareButton');
    if (popover)  {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearProductPopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn)      btn.setAttribute('aria-expanded', 'false');
  }
  function wireSharePopover() {
    const shareBtn = document.getElementById('shareButton');
    const backdrop = document.getElementById('shareBackdrop');
    const waBtn    = document.getElementById('shareWhatsApp');
    const copyBtn  = document.getElementById('shareCopyLink');
    if (!shareBtn) return;
    ensureProductPopoverViewportBinding();

    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('sharePopover');
      if (popover && popover.classList.contains('active')) {
        closeSharePopover();
      } else {
        openSharePopover(shareBtn);
      }
    });
    if (backdrop) backdrop.addEventListener('click', closeSharePopover);

    if (waBtn) {
      waBtn.addEventListener('click', () => {
        closeSharePopover();
        const title = (currentPost && (currentPost.titulo || currentPost.title)) || document.title;
        const url   = window.location.href;
        const text  = title + '\n' + url;
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        trackCurrentPostShare();
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        closeSharePopover();
        try {
          const copied = await copyCurrentPostLink();
          if (!copied) throw new Error('copy_unavailable');
          trackCurrentPostShare();
          toast('Link copiado!', 'info', 1800);
        } catch (_) {
          toast('Nao foi possivel copiar automaticamente. Tente novamente ou copie o link pela barra do navegador.', 'error', 2600);
        }
      });
    }
  }

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

  function resolveCurrentUserDisplayName(user, profile) {
    const normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    const normalizedUser = (user && typeof user === 'object') ? user : null;
    const userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;

    const candidates = [
      normalizedProfile && normalizedProfile.display_name,
      normalizedProfile && normalizedProfile.full_name,
      userMetadata && userMetadata.full_name,
      normalizedUser && normalizedUser.display_name,
      normalizedUser && normalizedUser.full_name,
      normalizedUser && normalizedUser.email,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function resolveCurrentUserAvatar(user, profile) {
    const normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    const normalizedUser = (user && typeof user === 'object') ? user : null;
    const userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;
    const candidates = [
      normalizedProfile && normalizedProfile.avatar_url,
      normalizedProfile && normalizedProfile.avatarUrl,
      normalizedProfile && normalizedProfile.avatar,
      userMetadata && userMetadata.avatar_url,
      userMetadata && userMetadata.avatar,
      normalizedUser && normalizedUser.avatar_url,
      normalizedUser && normalizedUser.avatarUrl,
      normalizedUser && normalizedUser.avatar,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (value) return value;
    }

    return '';
  }

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
    const authorId = getPostAuthorId(post);
    const viewProfileHref = buildProfileHref(authorId);
    const authorProfile = post && post.authorProfile && typeof post.authorProfile === 'object' ? post.authorProfile : null;

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

  /**
   * Extrai o "login" do contexto autenticado do próprio usuário.
   * Sem e-mail da sessão, cai para um handle público derivado do nome.
   */
  function resolveCurrentUserLogin(user, profile) {
    const ownEmail = String((user && user.email) || '').trim();
    if (ownEmail.includes('@')) return ownEmail.split('@')[0];

    if (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function') {
      const publicHandle = window.KCUtils.buildPublicHandle(profile && (profile.display_name || profile.full_name), { prefix: false });
      if (publicHandle) return publicHandle;
    }
    return '';
  }

  function applyCommentComposerSessionState(user, profile) {
    const commentAuthorInput = document.getElementById('commentAuthor');
    const commentAuthorHint = document.getElementById('commentAuthorHint');
    const composerAvatar = document.getElementById('commentComposerAvatar');
    if (!commentAuthorInput) return;

    const resolvedIdentity = resolveCurrentUserDisplayName(user, profile);
    const resolvedAvatar = resolveCurrentUserAvatar(user, profile);
    const resolvedLogin = resolveCurrentUserLogin(user, profile);
    const isAuthenticated = !!(user && user.id);

    if (resolvedIdentity) commentAuthorInput.value = resolvedIdentity;

    if (isAuthenticated) {
      commentAuthorInput.setAttribute('readonly', 'readonly');
      commentAuthorInput.setAttribute('aria-readonly', 'true');
      commentAuthorInput.removeAttribute('placeholder');
      if (!commentAuthorInput.value) commentAuthorInput.value = 'Conta autenticada';
      // Hint: mostra o login (@handle) abaixo do nome de exibição
      if (commentAuthorHint) {
        commentAuthorHint.textContent = resolvedLogin ? ('@' + resolvedLogin) : '';
        commentAuthorHint.style.display = resolvedLogin ? 'block' : 'none';
      }
    } else {
      commentAuthorInput.removeAttribute('readonly');
      commentAuthorInput.setAttribute('placeholder', 'Seu nome (opcional no modo local/dev)');
      if (commentAuthorHint) {
        commentAuthorHint.textContent = '';
        commentAuthorHint.style.display = 'none';
      }
    }

    if (composerAvatar) {
      if (resolvedAvatar) {
        composerAvatar.src = resolvedAvatar;
      } else {
        const seed = String((resolvedIdentity || (user && (user.email || user.id)) || 'commenter')).toLowerCase();
        composerAvatar.src = (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '';
      }
    }
  }

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
        const authorId = getPostAuthorId(currentPost);
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
            window.KCLazyLoader.load('assets/js/kc-comments.js', function() {
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
          window.KCLazyLoader.load('assets/js/kc-comments.js', function() {
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


  function getPostAuthorId(post) {
    const raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
  }

  function showNotFound() {
    show('notFound', 'block');
    hide('relatedSection');
    hide('sellerCard');
    setText('postTitle', 'Anúncio não encontrado ou removido');
    setHTML('postDescription', '');
    setHTML('badges', '');
    hide('priceBlock');
    hide('specsBlock');
    const emojiCover = document.getElementById('emojiCover');
    if (emojiCover) { emojiCover.textContent = '❓'; emojiCover.style.display = 'flex'; }
    hide('mainImage');
    hide('thumbnails');
  }

  function setBreadcrumb(post) {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;

    const modKey = String(post.modulo || '');
    const modLbl = moduleLabel(modKey);
    const catLbl = post.categoriaLabel || post.categoria || '';
    const subLbl = post.subcategoriaLabel || post.subcategoria || '';

    const parts = [];
    parts.push(`<a href="index.html"><i class="fas fa-home"></i> KinoCampus</a>`);
    const rawModulePage = String((post._kcModulePage || '') || 'index.html').trim();
    const safeModulePage = /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(rawModulePage) ? rawModulePage : 'index.html';

    if (modKey) parts.push(`<i class="fas fa-chevron-right"></i><a href="${esc(safeModulePage)}">${esc(modLbl)}</a>`);
    parts.push(`<i class="fas fa-chevron-right"></i><span>${esc(catLbl || 'Detalhes')}</span>`);
    if (subLbl) parts.push(`<i class="fas fa-chevron-right"></i><span>${esc(subLbl)}</span>`);

    bc.innerHTML = parts.join(' ');
  }

  function setBadges(post) {
    const el = document.getElementById('badges');
    if (!el) return;

    const badges = [];
    // Módulo
    if (post.modulo) {
      const icon = (window.KCUtils && typeof window.KCUtils.getModuleIconClass === 'function')
        ? window.KCUtils.getModuleIconClass(post.modulo)
        : 'fas fa-layer-group';
      badges.push(`<span class="kc-badge"><i class="${esc(icon)}"></i> ${esc(moduleLabel(post.modulo))}</span>`);
    }

    // Status (Achados/Perdidos)
    if (post._kcStatusBadgeHtml) badges.push(post._kcStatusBadgeHtml);

    // Verificado
    if (post.verificado) badges.push(post._kcVerifiedTag || `<span class="kc-badge kc-badge--verified"><i class="fas fa-check-circle"></i> Verificado</span>`);

    // Condição
    if (post.condicao) badges.push(`<span class="kc-badge"><i class="fas fa-star"></i> ${esc(post.condicao)}</span>`);

    // Tempo relativo
    const relTime = post._kcRelativeTime || (window.KCUtils && window.KCUtils.timeAgo ? window.KCUtils.timeAgo(post.timestamp || post.created_at) : (post.timestamp || post.created_at));
    if (relTime) badges.push(`<span class="kc-badge"><i class="fas fa-clock"></i> ${esc(relTime)}</span>`);

    el.innerHTML = badges.join(' ');
  }

  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }

  function isLegacyExampleProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!String(profile.legacyId || profile.legacy_id || '').trim();
  }

  function buildLegacyExampleBadgeHtml(label, extraClass) {
    const text = String(label || 'Exemplo').trim() || 'Exemplo';
    const className = ['kc-product-example-ribbon', extraClass || ''].filter(Boolean).join(' ');
    return '<span class="' + className + '" aria-label="' + esc(text) + '"><i class="fas fa-flask"></i><span>' + esc(text) + '</span></span>';
  }

  function syncLegacyExampleMarker(container, shouldShow, label, extraClass) {
    if (!container) return;
    const current = container.querySelector('.kc-product-example-ribbon');
    if (current) current.remove();
    if (!shouldShow) return;
    container.insertAdjacentHTML('afterbegin', buildLegacyExampleBadgeHtml(label, extraClass));
  }

  function setGallery(post) {
    const mainImg = document.getElementById('mainImage');
    const emojiCover = document.getElementById('emojiCover');
    const thumbs = document.getElementById('thumbnails');
    const galleryMain = document.querySelector('.kc-gallery-main');

    const images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
    const isLegacyExample = isLegacyExamplePost(post);
    syncLegacyExampleMarker(galleryMain, isLegacyExample, 'Exemplo', 'kc-product-example-ribbon--gallery');
    const emoji = post.emoji || '✨';

    if (images && images.length) {
      if (mainImg) {
        mainImg.src = images[0];
        mainImg.style.display = 'block';
      }
      if (emojiCover) emojiCover.style.display = 'none';

      if (thumbs) {
        thumbs.innerHTML = '';
        images.forEach((src, idx) => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = 'Miniatura ' + (idx + 1);
          img.loading = 'lazy';
          img.decoding = 'async';
          img.className = 'kc-thumbnail' + (idx === 0 ? ' active' : '');
          img.setAttribute('data-full-src', src);
          img.addEventListener('click', () => {
            const all = thumbs.querySelectorAll('.kc-thumbnail');
            all.forEach(t => t.classList.remove('active'));
            img.classList.add('active');
            if (mainImg) mainImg.src = src;
          });
          thumbs.appendChild(img);
        });

        thumbs.style.display = images.length > 1 ? 'flex' : 'none';
      }
    } else {
      if (mainImg) mainImg.style.display = 'none';
      if (emojiCover) { emojiCover.style.display = 'flex'; emojiCover.textContent = emoji; }
      if (thumbs) thumbs.style.display = 'none';
    }
  }

  function setPrice(post) {
    const block = document.getElementById('priceBlock');
    if (!block) return;

    if (post._kcHidePrice) {
      block.style.display = 'none';
      return;
    }

    const iconEl = document.getElementById('priceIcon');
    const valueEl = document.getElementById('priceValue');
    const smallEl = document.getElementById('priceSmall');
    const origEl = document.getElementById('priceOriginal');
    const discEl = document.getElementById('priceDiscount');

    const iconClass = post._kcPriceIconClass || 'fas fa-money-bill-wave';
    if (iconEl) iconEl.className = iconClass;

    const main = post._kcPriceTextMain || (typeof post.preco === 'number' ? (post.preco === 0 ? 'Gratuito' : formatCurrency(post.preco)) : '');
    const small = post._kcPriceTextSmall || '';

    if (valueEl) valueEl.textContent = main;
    if (smallEl) smallEl.textContent = small;

    // Original/Desconto (se existirem)
    const showOriginal = !!post._kcShowOriginalPrice;
    const showDiscount = !!post._kcShowDiscount;

    if (origEl) {
      if (showOriginal && typeof post.precoOriginal === 'number') {
        origEl.textContent = formatCurrency(post.precoOriginal);
        origEl.style.display = '';
      } else origEl.style.display = 'none';
    }

    if (discEl) {
      if (showDiscount && typeof post.descontoPercentual === 'number') {
        discEl.textContent = '-' + String(post.descontoPercentual) + '%';
        discEl.style.display = '';
      } else discEl.style.display = 'none';
    }

    // Estilo (p/ ícones e cores existentes)
    if (post._kcPriceStyle && typeof post._kcPriceStyle === 'object') {
      try {
        Object.entries(post._kcPriceStyle).forEach(([k, v]) => block.style.setProperty(k, v));
      } catch (_) { }
    }

    block.style.display = 'flex';
  }

  function setDescription(post) {
    const rawDesc = post.descricao || post.description || '';
    const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline
      : esc;
    const descHtml = renderMd(rawDesc);
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 10) : [];
    const markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 10 })
      : [];
    const normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText
      : ((value) => String(value || '').toLowerCase().trim());
    const markerLabels = new Set(markerTags.map((tag) => normalize(tag && tag.label)));
    const plainTags = tags
      .filter((tag) => !markerLabels.has(normalize(tag)))
      .map((tag) => ({ label: tag, emoji: '🏷️' }));

    let html = '';
    if (descHtml) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">${descHtml}</div>`;
    }
    if (markerTags.length && window.KCUtils && typeof window.KCUtils.renderMarkerTags === 'function') {
      html += window.KCUtils.renderMarkerTags(markerTags, {
        containerClass: 'kc-tags-list kc-tags-list--markers',
        itemClass: 'kc-tag kc-tag--marker',
      });
    }
    if (plainTags.length && window.KCUtils && typeof window.KCUtils.renderMarkerTags === 'function') {
      html += window.KCUtils.renderMarkerTags(plainTags, {
        containerClass: 'kc-tags-list kc-tags-list--plain',
        itemClass: 'kc-tag',
      });
    } else if (plainTags.length) {
      html += `<div class="kc-tags-list kc-tags-list--plain">` +
        plainTags.map((tag) => `<span class="kc-tag"><span class="kc-tag__emoji">${esc(tag.emoji)}</span><span>${esc(tag.label)}</span></span>`).join('') +
        `</div>`;
    }

    setHTML('postDescription', html);
  }

  function addSpec(grid, iconClass, label, value) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div>
        <strong>${esc(label)}</strong>
        <span>${esc(value)}</span>
      </div>
    `;
    grid.appendChild(item);
  }

  function setSpecs(post) {
    const block = document.getElementById('specsBlock');
    const grid = document.getElementById('specsGrid');
    if (!block || !grid) return;

    grid.innerHTML = '';

    const pairs = [];
    if (Array.isArray(post.tags) && post.tags.length) pairs.push(['fas fa-hashtag', 'Tags', post.tags.slice(0, 8).join(', ')]);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if (post.categoriaLabel || post.categoria) pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);

    if (!pairs.length) {
      block.style.display = 'none';
      return;
    }

    pairs.forEach(p => addSpec(grid, p[0], p[1], p[2]));
    block.style.display = 'block';
  }

  function buildTagEntries(post) {
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 14) : [];
    const markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 14 })
      : [];
    const normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText
      : ((value) => String(value || '').toLowerCase().trim());
    const markerLabels = new Set(markerTags.map((tag) => normalize(tag && tag.label)));
    const plainTags = tags
      .filter((tag) => !markerLabels.has(normalize(tag)))
      .map((tag) => ({ label: tag, emoji: '🏷️' }));

    return { markerTags, plainTags };
  }

  function buildTagsSpecHtml(post) {
    const entries = buildTagEntries(post);
    if (!entries.markerTags.length && !entries.plainTags.length) return '';

    const renderTag = (tag, itemClass) => {
      const emoji = esc(String(tag && tag.emoji || '🏷️').trim());
      const label = esc(String(tag && tag.label || '').trim());
      return `<span class="${itemClass}">${emoji ? `<span class="kc-tag__emoji">${emoji}</span>` : ''}<span>${label}</span></span>`;
    };

    return '<div class="kc-tags-list kc-tags-list--specs">'
      + entries.markerTags.map((tag) => renderTag(tag, 'kc-tag kc-tag--marker')).join('')
      + entries.plainTags.map((tag) => renderTag(tag, 'kc-tag')).join('')
      + '</div>';
  }

  function setOpenGraphTags(post) {
    const title = (post.titulo || post.title || 'KinoCampus') + ' — KinoCampus';
    const desc = String(post.descricao || post.description || 'Anúncios, eventos e oportunidades da comunidade universitária UFG.').trim().substring(0, 200);
    const images = post.images || post.image_urls || [];
    const img = images.length ? String(images[0]) : '';
    const url = window.location.href;

    function setMeta(selector, attr, value) {
      const el = document.querySelector(selector);
      if (el && value) el.setAttribute(attr, value);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]', 'content', img);
  }

  function setLegacyBanner(post) {
    const el = document.getElementById('legacyNotice');
    if (!el) return;
    if (isLegacyExamplePost(post)) {
      el.innerHTML = `<div class="kc-legacy-banner">
        <span class="kc-legacy-banner__icon"><i class="fas fa-flask"></i></span>
        <div><strong>Publicação de exemplo</strong>Este é um post fictício criado para demonstração da plataforma. Não representa um anúncio real.</div>
      </div>`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  function setDescription(post) {
    const rawDesc = post.descricao || post.description || '';
    const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline
      : esc;
    const descHtml = renderMd(rawDesc);
    let html = '';
    if (descHtml) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">${descHtml}</div>`;
    }
    setHTML('postDescription', html);
  }

  function addSpec(grid, iconClass, label, value) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div class="kc-spec-item__body">
        <strong>${esc(label)}</strong>
        <span>${esc(value)}</span>
      </div>
    `;
    grid.appendChild(item);
  }

  function addSpecHtml(grid, iconClass, label, html) {
    const item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = `
      <i class="${esc(iconClass)}"></i>
      <div class="kc-spec-item__body">
        <strong>${esc(label)}</strong>
        <div class="kc-spec-item__html">${html || ''}</div>
      </div>
    `;
    grid.appendChild(item);
  }

  function setSpecs(post) {
    const block = document.getElementById('specsBlock');
    const grid = document.getElementById('specsGrid');
    if (!block || !grid) return;

    grid.innerHTML = '';

    const pairs = [];
    const tagsHtml = buildTagsSpecHtml(post);
    if (tagsHtml) addSpecHtml(grid, 'fas fa-hashtag', 'Tags', tagsHtml);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if (post.categoriaLabel || post.categoria) pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);

    if (!pairs.length && !tagsHtml) {
      block.style.display = 'none';
      return;
    }

    pairs.forEach((pair) => addSpec(grid, pair[0], pair[1], pair[2]));
    block.style.display = 'block';
  }

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
    const isLegacyExample = isLegacyExamplePost(post) || isLegacyExampleProfile(post && post.authorProfile);

    const author = normalizedName || 'Autor';
    const avatarUrl = normalizedAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    avatar.src = avatarUrl;
    name.innerHTML = esc(author)
      + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '')
      + (isLegacyExample ? ' ' + buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--seller') : '');

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
    loadSellerAuthorStats(post, stats, items.slice()).catch(() => {});
  }

  async function loadSellerAuthorStats(post, statsContainer, baseItems) {
    const authorId = getPostAuthorId(post);
    if (!authorId || !statsContainer || !window.KCAPI) return;

    const requestToken = ++sellerStatsRequestToken;

    try {
      const postsPromise = typeof window.KCAPI.getPostsByAuthorId === 'function'
        ? window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 24 })
        : Promise.resolve([]);
      const summaryPromise = typeof window.KCAPI.getUserRatingSummary === 'function'
        ? window.KCAPI.getUserRatingSummary(authorId)
        : Promise.resolve(
          window._KCProduct.ratings
            && typeof window._KCProduct.ratings.getSellerRatingSummaryFromPost === 'function'
            ? window._KCProduct.ratings.getSellerRatingSummaryFromPost(post)
            : null
        );
      const ratingStatePromise = (currentUser && currentUser.id && typeof window.KCAPI.getUserRatingState === 'function')
        ? window.KCAPI.getUserRatingState({
          targetUserId: authorId,
          contextPostId: getPostIdForMutation(post),
        })
        : Promise.resolve({
          targetUserId: authorId,
          contextPostId: getPostIdForMutation(post),
          canRate: false,
          reason: 'AUTH_REQUIRED',
          myRating: null,
        });

      const [items, summary, ratingState] = await Promise.all([postsPromise, summaryPromise, ratingStatePromise]);
      if (requestToken !== sellerStatsRequestToken) return;

      const currentPostId = String(getPostIdForMutation(post) || '').trim();
      const authorPostCount = (Array.isArray(items) ? items : []).filter(function (item) {
        if (!item) return false;
        const itemId = String((item.uuid || item.id) || '').trim();
        return !currentPostId || itemId !== currentPostId;
      }).length;

      const rows = Array.isArray(baseItems) ? baseItems.slice() : [];
      if (authorPostCount > 0) {
        rows.push('<span><i class="fas fa-layer-group"></i> ' + authorPostCount + ' publicaç' + (authorPostCount === 1 ? 'ão' : 'ões') + '</span>');
      }
      statsContainer.innerHTML = rows.join('');
      if (window._KCProduct.ratings && typeof window._KCProduct.ratings.refreshSellerRatingUI === 'function') {
        window._KCProduct.ratings.refreshSellerRatingUI(post, summary, ratingState, {
          currentUser: currentUser,
          getCurrentPost: function () { return currentPost; }
        });
      }
    } catch (_) { }
  }

  async function enrichPostAuthorFromProfile(post) {
    const authorId = getPostAuthorId(post);
    if (!authorId || !window.KCAPI || typeof window.KCAPI.getProfileById !== 'function') return post;

    let profile = null;
    try {
      profile = await window.KCAPI.getProfileById(authorId);
    } catch (_) {
      profile = null;
    }

    if (!profile) return post;

    const profileName = String(profile.display_name || profile.full_name || '').trim();
    const profileAvatar = String(profile.avatar_url || '').trim();
    const fallbackName = String(post.authorName || post.autor || post.author || '').trim();
    const fallbackAvatar = String(post.authorAvatar || post.autorAvatar || '').trim();
    const publicHandle = window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function'
      ? window.KCUtils.buildPublicHandle(profileName || fallbackName)
      : '';

    const mergedName = profileName || fallbackName || 'Autor';
    const mergedAvatar = profileAvatar
      || fallbackAvatar
      || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    return {
      ...post,
      authorName: mergedName,
      author: mergedName,
      autor: mergedName,
      authorAvatar: mergedAvatar,
      autorAvatar: mergedAvatar,
      verified: profile.verified === true ? true : post.verified,
      verificado: profile.verified === true ? true : post.verificado,
      authorCreatedAt: profile.created_at || post.authorCreatedAt || null,
      authorHandle: publicHandle || post.authorHandle || '',
      authorProfile: profile,
      authorEmail: post.authorEmail || '',
    };
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

    const authorId = getPostAuthorId(post);
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

  /**
   * Calcula pontuação de relevância entre um candidato e o post atual.
   * Pontuação mais alta = mais relevante.
   */
  function trackHomeCategoryInteraction(eventType, post) {
    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent(eventType, { post });
      }
    } catch (_) { }
  }

  async function refreshViewerState() {
    let profile = null;

    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        currentUser = await window.KCAPI.getCurrentUser();
      }
    } catch (_) {
      currentUser = null;
    }

    try {
      if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
        profile = await window.KCAPI.getMyProfile();
      }
    } catch (_) {
      profile = null;
    }

    if (!profile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          profile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) {
        profile = null;
      }
    }

    currentProfile = profile || null;
    applyCommentComposerSessionState(currentUser, currentProfile);
    if (currentPost) {
      setCTA(currentPost);
      setSeller(currentPost);
      maybeResumeQueuedContact(currentPost);
    }
  }

  function isAuthor(post, user) {
    if (!post || !user || !user.id) return false;
    const postAuthorId = String(post.autorId || post.authorId || post.author_id || '').trim();
    return !!postAuthorId && postAuthorId === String(user.id).trim();
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }
  function renderPost(post) {
    currentPost = post;
    window.kcCurrentPostContext = post;
    document.body.setAttribute('data-post-module', String(post && (post.modulo || post.module) || ''));
    document.body.setAttribute('data-post-category', String(post && (post._kcTabCategoryKey || post.categoriaKey || post.categoria || post.categoryKey || post.category) || ''));
    document.body.setAttribute('data-post-subcategory', String(post && (post.subcategoriaKey || post.subcategoria || post.subcategoryKey || post.subcategory) || ''));
    document.body.setAttribute('data-post-tags', Array.isArray(post && post.tagKeys) ? post.tagKeys.join(' ') : (Array.isArray(post && post.tags) ? post.tags.join(' ') : ''));
    trackHomeCategoryInteraction('post_open', post);
    hide('notFound');
    const postTitleText = post.titulo || post.title || 'Detalhes';
    setText('postTitle', postTitleText);
    document.title = postTitleText + ' — KinoCampus';
    setOpenGraphTags(post);
    setBreadcrumb(post);
    setBadges(post);
    setGallery(post);
    setPrice(post);
    setLegacyBanner(post);
    setDescription(post);
    setSpecs(post);
    setSeller(post);
    setCTA(post);
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.setEventCalendar === 'function') {
      window._KCProduct.calendar.setEventCalendar(post);
    }
    if (window._KCProduct.related && typeof window._KCProduct.related.setRelated === 'function') {
      window._KCProduct.related.setRelated(post, !!(currentUser && currentUser.id));
    }
    if (window._KCProduct.edit && typeof window._KCProduct.edit.upsertOwnerActions === 'function') {
      window._KCProduct.edit.upsertOwnerActions(post, currentUser, {
        renderPost: renderPost,
        getCurrentUser: function () { return currentUser; }
      });
    }
    if (window._KCProduct.analytics && typeof window._KCProduct.analytics.renderAuthorAnalytics === 'function') {
      window._KCProduct.analytics.renderAuthorAnalytics(post, currentUser);
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.bindSavedActions === 'function') {
      window._KCProduct.save.bindSavedActions(post, function () { return currentUser; });
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.refreshSavedState === 'function') {
      window._KCProduct.save.refreshSavedState(post).catch(() => { });
    }
    maybeResumeQueuedContact(post);
    if (window._KCProduct.report && typeof window._KCProduct.report.wireReportButton === 'function') {
      window._KCProduct.report.wireReportButton({ postId: (post && post.uuid) ? post.uuid : post.id, postTitle: post.titulo || post.title || 'Publicação' });
    }
  }

  // ── v9.3.1: Painel de analytics do autor ────────────────────────
  async function loadPost() {
    const id = getParam('id');
    if (!id) { showNotFound(); return; }

    window.kcCurrentPostId = id;
    document.body.setAttribute('data-post-id', id);

    // Bind comment inputs to this post id (script.js procura por data-post-id)
    const author = document.getElementById('commentAuthor');
    const text = document.getElementById('commentText');
    if (author) author.setAttribute('data-post-id', id);
    if (text) text.setAttribute('data-post-id', id);

    let raw = null;

    // Preferir driver unificado (V8.1.2.4.5): localStorage + seed JSON (+ futuro UUID/backend)
    try {
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
    } catch (_) { }


    if (!raw) { showNotFound(); return; }

    await refreshViewerState();

    // Contrato único (Model) + regras centrais
    let post = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);

    post = await enrichPostAuthorFromProfile(post);

    // V8.1.6.2: Denúncia requer UUID real do post (Supabase). Guardar para o botão/modal.
    const postUuid = (post && post.uuid) ? String(post.uuid)
      : ((raw && raw.uuid) ? String(raw.uuid) : null);
    window.kcCurrentPostUuid = postUuid;
    if (postUuid) document.body.setAttribute('data-post-uuid', postUuid);

    renderPost(post);

    // v9.3.1: track view (fire-and-forget, anti-spam server-side)
    try {
      var viewPostId = (post && post.uuid) ? post.uuid : (post && post.id);
      if (viewPostId && window.KCAPI && typeof window.KCAPI.trackView === 'function') {
        window.KCAPI.trackView(viewPostId).catch(function () {});
      }
    } catch (_trackErr) { /* silenciar */ }

    // V8.1.6.2: wire botão Denunciar (gated por driver + auth)
    // Comments — garante kc-comments.js carregado antes de inicializar
    if (window.KCLazyLoader && typeof window.KCLazyLoader.load === 'function') {
      var _commentPostId = id;
      window.KCLazyLoader.load('assets/js/kc-comments.js', function() {
        if (typeof window.renderComments === 'function') {
          window.renderComments(_commentPostId, 'commentsContainer');
        }
      });
    } else if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }
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

  document.addEventListener('DOMContentLoaded', () => {
    bindProductGlobalKeydown();
    wireSharePopover();
    if (window._KCProduct.save && typeof window._KCProduct.save.wireSavePopover === 'function') {
      window._KCProduct.save.wireSavePopover();
    }
    wireCreateSimilarBtn();
    bindStaticInteractions();
    document.addEventListener('kc:authchange', () => { refreshViewerState().catch(() => { }); });
    document.addEventListener('kc:profilechange', () => {
      if (currentPost) {
        enrichPostAuthorFromProfile(currentPost).then((post) => {
          if (!post) return;
          currentPost = post;
          setSeller(post);
          setCTA(post);
        }).catch(() => { });
      }
      refreshViewerState().catch(() => { });
    });
    loadPost();
  });
})();
