/*
  KinoCampus - Product (Detalhes) Controller (V8.1.2.4.5)
  - Carrega post por ID usando KCAPI + KCPostModel
  - Aplica regras centrais (KCUtils.applyPresentationRules)
  - Mantém comentários e UI existente (sem regressão visual)
*/

(function () {
  'use strict';

  let currentPost = null;
  let currentUser = null;
  let editUI = null;
  let staticInteractionsBound = false;
  let savedPostState = { kinds: [], loaded: false, pending: false };
  const shared = window.KCAccountProfileUtils || {};
  let sellerStatsRequestToken = 0;

  // ── Share popover ────────────────────────────────────────
  function openSharePopover(btn) {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    if (!popover) return;
    closeSavePopover();
    popover.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closeSharePopover() {
    const popover  = document.getElementById('sharePopover');
    const backdrop = document.getElementById('shareBackdrop');
    const btn      = document.getElementById('shareButton');
    if (popover)  popover.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    if (btn)      btn.setAttribute('aria-expanded', 'false');
  }
  function wireSharePopover() {
    const shareBtn = document.getElementById('shareButton');
    const backdrop = document.getElementById('shareBackdrop');
    const waBtn    = document.getElementById('shareWhatsApp');
    const copyBtn  = document.getElementById('shareCopyLink');
    if (!shareBtn) return;

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
        // Tracking de compartilhamento (fire-and-forget)
        try {
          const pid = currentPost && (currentPost.uuid || currentPost.id);
          if (pid && window.KCAPI && typeof window.KCAPI.trackShare === 'function') {
            window.KCAPI.trackShare(pid).catch(() => {});
          }
        } catch (_) {}
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        closeSharePopover();
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(window.location.href);
            toast('Link copiado!', 'info', 1800);
          } else { throw new Error('no clipboard'); }
        } catch (_) {
          toast('Não foi possível copiar o link.', 'error', 2200);
        }
      });
    }
    // Fechar ao pressionar Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSharePopover();
    }, { passive: true });
  }

  function openSavePopover(btn) {
    const popover = document.getElementById('savePopover');
    const backdrop = document.getElementById('saveBackdrop');
    if (!popover) return;
    closeSharePopover();
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeSavePopover() {
    const popover = document.getElementById('savePopover');
    const backdrop = document.getElementById('saveBackdrop');
    const btn = document.getElementById('saveButton');
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireSavePopover() {
    const saveBtn = document.getElementById('saveButton');
    const backdrop = document.getElementById('saveBackdrop');
    const closeBtn = document.getElementById('savePopoverClose');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = document.getElementById('savePopover');
      if (popover && popover.classList.contains('active')) closeSavePopover();
      else openSavePopover(saveBtn);
    });

    if (backdrop) backdrop.addEventListener('click', closeSavePopover);
    if (closeBtn) closeBtn.addEventListener('click', closeSavePopover);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSavePopover();
    }, { passive: true });
  }

  // ── Badge "editado" ──────────────────────────────────────
  function markPostAsEdited() {
    // Adiciona indicador abaixo do título
    const titleEl = document.getElementById('postTitle');
    if (!titleEl) return;
    const existing = document.getElementById('kcEditedBadge');
    if (existing) return;
    const badge = document.createElement('div');
    badge.id = 'kcEditedBadge';
    badge.className = 'kc-post-edited-badge';
    badge.innerHTML = '<i class="fas fa-pen-to-square"></i> Editado';
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }

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
        if (fmt && typeof window.formatText === 'function') {
          window.formatText(fmt);
        }
        return;
      }

      const submitCommentBtn = event.target.closest('[data-kc-submit-comment]');
      if (submitCommentBtn) {
        event.preventDefault();
        if (typeof window.submitComment === 'function') {
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
    const desc = esc(post.descricao || post.description || '');
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
    if (desc) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><p>${desc}</p>`;
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
    const desc = esc(post.descricao || post.description || '');
    let html = '';
    if (desc) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><p>${desc}</p>`;
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
    card.style.display = 'block';
    loadSellerAuthorStats(post, stats, items.slice()).catch(() => {});
  }

  async function loadSellerAuthorStats(post, statsContainer, baseItems) {
    const authorId = getPostAuthorId(post);
    if (!authorId || !statsContainer || !window.KCAPI || typeof window.KCAPI.getPostsByAuthorId !== 'function') return;

    const requestToken = ++sellerStatsRequestToken;

    try {
      const items = await window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 24 });
      if (requestToken !== sellerStatsRequestToken) return;

      const currentPostId = String(getPostIdForMutation(post) || '').trim();
      const authorPostCount = (Array.isArray(items) ? items : []).filter(function (item) {
        if (!item) return false;
        const itemId = String((item.uuid || item.id) || '').trim();
        return !currentPostId || itemId !== currentPostId;
      }).length;

      if (!authorPostCount) return;

      const rows = Array.isArray(baseItems) ? baseItems.slice() : [];
      rows.push('<span><i class="fas fa-layer-group"></i> ' + authorPostCount + ' publicaç' + (authorPostCount === 1 ? 'ão' : 'ões') + '</span>');
      statsContainer.innerHTML = rows.join('');
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
  function getSavedButtons() {
    return Array.from(document.querySelectorAll('[data-kc-save-kind]'));
  }

  function getSaveKindLabel(kind) {
    if (kind === 'favorite') return 'Favorito';
    if (kind === 'later') return 'Lembrar Depois';
    if (kind === 'highlight') return 'Destaque';
    return '';
  }

  function getSaveKinds() {
    return Array.isArray(savedPostState && savedPostState.kinds)
      ? savedPostState.kinds.slice()
      : [];
  }

  function trackHomeCategoryInteraction(eventType, post) {
    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent(eventType, { post });
      }
    } catch (_) { }
  }

  function updateSavedButtonsUI() {
    const activeKinds = new Set(getSaveKinds());
    const loading = !!(savedPostState && savedPostState.pending);
    getSavedButtons().forEach((button) => {
      const kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
      const active = !!kind && activeKinds.has(kind);
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-loading', loading);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (loading) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });

    const trigger = document.getElementById('saveButton');
    const count = document.getElementById('saveButtonCount');
    const totalActive = activeKinds.size;
    if (trigger) {
      trigger.classList.toggle('is-active', totalActive > 0);
      trigger.classList.toggle('is-loading', loading);
      trigger.setAttribute('aria-pressed', totalActive > 0 ? 'true' : 'false');
    }
    if (count) {
      if (totalActive > 0) {
        count.style.display = 'inline-flex';
        count.textContent = String(totalActive);
      } else {
        count.style.display = 'none';
        count.textContent = '0';
      }
    }
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

    applyCommentComposerSessionState(currentUser, profile);
    if (currentPost) {
      setCTA(currentPost);
      maybeResumeQueuedContact(currentPost);
    }
  }

  async function refreshSavedState(post) {
    const postId = getPostIdForMutation(post);
    if (!postId || !window.KCAPI || typeof window.KCAPI.getSavedPostState !== 'function') {
      savedPostState = { kinds: [], loaded: true, pending: false };
      updateSavedButtonsUI();
      return;
    }

    try {
      const result = await window.KCAPI.getSavedPostState(postId);
      savedPostState = {
        kinds: Array.isArray(result && result.kinds)
          ? result.kinds.slice()
          : (result && result.kind ? [String(result.kind)] : []),
        loaded: true,
        pending: false,
      };
    } catch (_) {
      savedPostState = { kinds: [], loaded: true, pending: false };
    }
    updateSavedButtonsUI();
  }

  function bindSavedActions(post) {
    const postId = getPostIdForMutation(post);
    getSavedButtons().forEach((button) => {
      if (button.dataset.kcSaveBound === '1') return;
      button.dataset.kcSaveBound = '1';
      button.addEventListener('click', async () => {
        if (!postId || !window.KCAPI) return;
        if (!currentUser || !currentUser.id) {
          toast('Faça login para salvar esta publicação.', 'warn', 2400);
          return;
        }
        const kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
        if (!kind) return;

        savedPostState = { ...savedPostState, pending: true };
        updateSavedButtonsUI();

        try {
          if (getSaveKinds().includes(kind)) {
            const result = (typeof window.KCAPI.clearSavedPostState === 'function')
              ? await window.KCAPI.clearSavedPostState(postId, kind)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              const message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível remover o item salvo.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: getSaveKinds().filter((item) => item !== kind),
                loaded: true,
                pending: false,
              };
              toast('Salvamento removido.', 'info', 2000);
            }
          } else {
            const result = (typeof window.KCAPI.setSavedPostState === 'function')
              ? await window.KCAPI.setSavedPostState(postId, kind, true)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              const message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível salvar a publicação.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: Array.from(new Set(getSaveKinds().concat(kind))),
                loaded: true,
                pending: false,
              };
              toast(`${getSaveKindLabel(kind)} salvo com sucesso.`, 'success', 2200);
              trackHomeCategoryInteraction(kind, post);
            }
          }
        } catch (_) {
          toast('Não foi possível atualizar este salvamento agora.', 'error', 2600);
        } finally {
          savedPostState = { ...savedPostState, pending: false };
          updateSavedButtonsUI();
        }
      });
    });
  }

  let relatedRequestToken = 0;

  function getRelatedReasonLabel(candidate, currentPost) {
    var explicitReason = String(candidate && candidate._kcRelatedReason || '').trim();
    if (explicitReason) return explicitReason;

    var currentAuthorId = getPostAuthorId(currentPost);
    var candidateAuthorId = getPostAuthorId(candidate);
    var currentModule = String(currentPost && (currentPost.modulo || currentPost.module) || '').trim().toLowerCase();
    var candidateModule = String(candidate && (candidate.modulo || candidate.module) || '').trim().toLowerCase();

    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId && currentModule && currentModule === candidateModule) {
      return 'Mesmo autor neste módulo';
    }
    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId) {
      return 'Outro anúncio do mesmo autor';
    }
    if (currentModule && candidateModule && currentModule === candidateModule) {
      return 'Relacionado neste módulo';
    }
    return 'Publicação relacionada';
  }

  function getRelatedImageHtml(post) {
    var images = Array.isArray(post && post.imagens) ? post.imagens : (Array.isArray(post && post.images) ? post.images : []);
    var title = String(post && (post.titulo || post.title) || 'Imagem da publicação').trim() || 'Imagem da publicação';
    var exampleBadge = isLegacyExamplePost(post) ? buildLegacyExampleBadgeHtml('Exemplo', 'kc-product-example-ribbon--related') : '';
    if (images.length) {
      return '<div class="kc-related-card__media">' + exampleBadge + '<img src="' + esc(String(images[0])) + '" alt="' + esc(title) + '" loading="lazy" decoding="async" /></div>';
    }

    var emoji = String(post && post.emoji || '✨').trim() || '✨';
    return '<div class="kc-related-card__media kc-related-card__media--fallback">' + exampleBadge + '<span aria-hidden="true">' + esc(emoji) + '</span></div>';
  }

  function getRelatedPriceLabel(post) {
    var price = post && (post.preco != null ? post.preco : post.price);
    if (price == null || price === '') return '';
    if (typeof price === 'number') return price === 0 ? 'Gratuito' : formatCurrency(price);
    var normalized = String(price).trim();
    return normalized || '';
  }

  function renderRelatedPosts(posts, currentPost) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;

    var list = Array.isArray(posts) ? posts.filter(Boolean) : [];
    if (!list.length) {
      grid.innerHTML = '';
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = list.map(function (item) {
      var postId = String((item && (item.uuid || item.id)) || '').trim();
      if (!postId) return '';

      var href = 'product.html?id=' + encodeURIComponent(postId);
      var title = String(item && (item.titulo || item.title) || 'Publicação').trim() || 'Publicação';
      var author = String(item && (item.authorName || item.autor || item.author) || 'Autor').trim() || 'Autor';
      var reason = getRelatedReasonLabel(item, currentPost);
      var priceLabel = getRelatedPriceLabel(item);
      var moduleText = moduleLabel(item && (item.modulo || item.module) || '');
      var categoryText = String(item && (item.categoriaLabel || item.categoria || item.categoryLabel || item.category) || '').trim();
      var metaParts = [
        moduleText ? '<span><i class="fas fa-layer-group"></i> ' + esc(moduleText) + '</span>' : '',
        categoryText ? '<span><i class="fas fa-tag"></i> ' + esc(categoryText) + '</span>' : '',
        priceLabel ? '<span><i class="fas fa-money-bill-wave"></i> ' + esc(priceLabel) + '</span>' : '',
      ].filter(Boolean).join('');

      return [
        '<a class="kc-related-card" href="' + href + '">',
        getRelatedImageHtml(item),
        '<div class="kc-related-card__body">',
        '<span class="kc-related-card__reason">' + esc(reason) + '</span>',
        '<h4 class="kc-related-card__title">' + esc(title) + '</h4>',
        '<div class="kc-related-card__author"><i class="fas fa-user"></i> ' + esc(author) + '</div>',
        metaParts ? '<div class="kc-related-card__meta">' + metaParts + '</div>' : '',
        '</div>',
        '</a>',
      ].join('');
    }).filter(Boolean).join('');

    section.style.display = 'block';
  }

  async function setRelated(post) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid || !post || !window.KCAPI || typeof window.KCAPI.getRelatedPosts !== 'function') {
      if (section) section.style.display = 'none';
      if (grid) grid.innerHTML = '';
      return;
    }

    var currentPostId = getPostIdForMutation(post);
    if (!currentPostId) {
      section.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    var requestToken = ++relatedRequestToken;
    grid.innerHTML = '<div class="kc-related-loading"><i class="fas fa-spinner fa-spin"></i> Carregando publicações relacionadas...</div>';
    section.style.display = 'block';

    try {
      var items = await window.KCAPI.getRelatedPosts(currentPostId, {
        limit: 8,
        module: post.modulo || post.module || '',
        authorId: getPostAuthorId(post),
        currentPost: post,
        viewerAuthenticated: isViewerAuthenticated(),
      });
      if (requestToken !== relatedRequestToken) return;
      renderRelatedPosts(items, post);
    } catch (error) {
      if (requestToken !== relatedRequestToken) return;
      console.warn('[KC Product] related posts:', error);
      grid.innerHTML = '';
      section.style.display = 'none';
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

  function buildEditPayload(form, sourcePost) {
    const tagsRaw = String(form.tags.value || '').trim();
    const metadata = {
      ...(sourcePost && sourcePost.metadata && typeof sourcePost.metadata === 'object' ? sourcePost.metadata : {}),
      ...(form.subcategory.value ? { subcategory: String(form.subcategory.value).trim() } : {}),
      ...(form.condition.value ? { condicao: String(form.condition.value).trim() } : {}),
      ...(form.emoji.value ? { emoji: String(form.emoji.value).trim() } : {}),
    };

    if (tagsRaw) metadata.tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    else delete metadata.tags;

    return {
      title: String(form.title.value || '').trim(),
      description: String(form.description.value || '').trim(),
      module: String(form.module.value || '').trim(),
      category: String(form.category.value || '').trim(),
      location: String(form.location.value || '').trim(),
      price: String(form.price.value || '').trim(),
      metadata,
    };
  }

  function upsertOwnerActions(post, user) {
    const actions = document.querySelector('.kc-product-actions');
    if (!actions) return;

    const canManage = isAuthor(post, user);
    const existing = document.getElementById('ownerActionsWrap');
    if (existing) existing.remove();
    if (!canManage) return;

    const wrap = document.createElement('div');
    wrap.id = 'ownerActionsWrap';
    wrap.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'kc-btn-secondary';
    editBtn.id = 'editPostButton';
    editBtn.innerHTML = '<i class="fas fa-pen"></i> Editar';

    // Status atual do post
    const postStatus = String((post && (post.status || post.estado)) || 'published').toLowerCase();
    const isHidden  = postStatus === 'hidden';
    const isExpired = postStatus === 'expired';
    const isPublished = postStatus === 'published';

    // ── Botão Desabilitar / Reativar (apenas para published/hidden) ────────
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'kc-btn-secondary';
    toggleBtn.id = 'togglePostStatusButton';
    toggleBtn.setAttribute('data-post-status', postStatus);
    if (isExpired) {
      toggleBtn.style.display = 'none'; // oculto; Renovar é o CTA principal para expirados
    } else {
      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-eye"></i> Reativar anúncio'
        : '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';
    }

    // ── Botão Renovar Publicação (expirado OU hidden) ──────────────────────
    const renewBtn = document.createElement('button');
    renewBtn.type = 'button';
    renewBtn.className = 'kc-btn-secondary';
    renewBtn.id = 'renewPostButton';
    renewBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Renovar publicação';
    renewBtn.style.display = (isExpired || isHidden) ? '' : 'none';

    // ── Botão Impulsionar Hoje (apenas published) ──────────────────────────
    const bumpBtn = document.createElement('button');
    bumpBtn.type = 'button';
    bumpBtn.className = 'kc-btn-secondary';
    bumpBtn.id = 'bumpPostButton';
    const bumpedAt = post && (post.bumped_at || post.bumpedAt);
    const bumpCooldownMs = 1 * 24 * 60 * 60 * 1000;
    const bumpReady = !bumpedAt || (Date.now() - new Date(bumpedAt).getTime() >= bumpCooldownMs);
    bumpBtn.style.display = isPublished ? '' : 'none';
    if (bumpReady) {
      bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
    } else {
      const nextBump = new Date(new Date(bumpedAt).getTime() + bumpCooldownMs);
      bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
      bumpBtn.title = 'Próximo impulso disponível em ' + nextBump.toLocaleDateString('pt-BR');
      bumpBtn.disabled = true;
      bumpBtn.style.opacity = '0.55';
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kc-btn-secondary';
    deleteBtn.id = 'deletePostButton';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';

    // ── Badge de status para o dono ────────────────────────────────────────
    const ownerStatusBadge = document.getElementById('ownerStatusBadge');
    if (ownerStatusBadge) ownerStatusBadge.remove();

    if (isHidden || isExpired) {
      const badge = document.createElement('div');
      badge.id = 'ownerStatusBadge';
      if (isExpired) {
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(244,67,54,.10);border:1px solid rgba(244,67,54,.30);color:#ef9a9a;font-size:.9em;margin-bottom:12px;';
        const expiresAt = post && (post.expires_at || post.expiresAt);
        const expiryStr = expiresAt ? ' em ' + new Date(expiresAt).toLocaleDateString('pt-BR') : '';
        badge.innerHTML = '<i class="fas fa-calendar-xmark"></i><span>Este anúncio <strong>expirou</strong>' + expiryStr + ' e não aparece nos feeds. Renove-o para voltar a aparecer.</span>';
      } else {
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anúncio está <strong>desabilitado</strong> e não aparece nos feeds. Apenas você consegue ver esta página.</span>';
      }
      const details = document.querySelector('.kc-product-details');
      if (details) details.insertAdjacentElement('afterbegin', badge);
    } else if (isPublished) {
      // Badge de validade quando expira em menos de 5 dias
      const expiresAt = post && (post.expires_at || post.expiresAt);
      if (expiresAt) {
        const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
        if (daysLeft <= 5 && daysLeft >= 0) {
          const badge = document.createElement('div');
          badge.id = 'ownerStatusBadge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.35);color:#ffc107;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-clock"></i><span>Seu anúncio <strong>expira em ' + daysLeft + (daysLeft === 1 ? ' dia' : ' dias') + '</strong>. Renove-o para continuar aparecendo nos feeds.</span>';
          const details = document.querySelector('.kc-product-details');
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }
      }
    }

    wrap.appendChild(editBtn);
    wrap.appendChild(bumpBtn);
    wrap.appendChild(renewBtn);
    wrap.appendChild(toggleBtn);
    wrap.appendChild(deleteBtn);

    const reportBtn = document.getElementById('reportButton');
    if (reportBtn && reportBtn.parentNode === actions) actions.insertBefore(wrap, reportBtn);
    else actions.appendChild(wrap);

    editBtn.addEventListener('click', () => {
      // Usa o kc-create-modal completo em modo edição, se disponível
      if (typeof window.kcOpenEditPostModal === 'function') {
        window.kcOpenEditPostModal(post, async (updatedData) => {
          const next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(updatedData, { pageModule: updatedData.modulo || '', view: 'product' })
            : updatedData;
          renderPost(next);
          markPostAsEdited();
          // Log edição no audit_log
          try {
            const client = window.KCSupabase && window.KCSupabase.getClient ? window.KCSupabase.getClient() : null;
            const uid = currentUser && currentUser.id;
            if (client && uid) {
              await client.from('audit_log').insert({
                action: 'post_edited',
                entity_type: 'posts',
                entity_id: String(post.uuid || post.id || ''),
                actor_id: uid,
              });
            }
          } catch (_) { /* silent */ }
        });
        return;
      }
      // Fallback para o modal antigo
      if (!editUI) editUI = buildEditUI();
      editUI.open(post);
    });

    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('Tem certeza que deseja excluir esta publicação?');
      if (!confirmed) return;

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.deletePost === 'function') {
          res = await window.KCAPI.deletePost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        try { showToast('Publicação excluída com sucesso.', 'success', 2000); } catch (_) { }
        setTimeout(() => { window.location.href = 'index.html'; }, 300);
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível excluir a publicação.';
      try { showToast(msg, 'error', 2800); } catch (_) { }
    });

    toggleBtn.addEventListener('click', async () => {
      if (toggleBtn.disabled) return;
      toggleBtn.disabled = true;
      const prevHTML = toggleBtn.innerHTML;
      toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.togglePostStatus === 'function') {
          res = await window.KCAPI.togglePostStatus(getPostIdForMutation(post));
        }
      } catch (_) { }

      toggleBtn.disabled = false;

      if (res && res._kcError === 'POST_LIMIT_REACHED') {
        toggleBtn.innerHTML = prevHTML;
        const limitMsg = res.message || 'Você atingiu o limite de publicações ativas. Desabilite outra publicação antes de reativar esta.';
        try { showToast(limitMsg, 'error', 4000); } catch (_) { }
        return;
      }

      if (res && (res.ok || res.data)) {
        const result = res.data || res;
        const newStatus = String(result.new_status || result.status || '').toLowerCase();
        const nowHidden = newStatus === 'hidden' || newStatus === 'desabilitado';

        // Update button
        toggleBtn.setAttribute('data-post-status', nowHidden ? 'hidden' : 'published');
        toggleBtn.innerHTML = nowHidden
          ? '<i class="fas fa-eye"></i> Reativar anúncio'
          : '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';

        // Update in-memory post status
        if (currentPost) {
          currentPost.status = nowHidden ? 'hidden' : 'published';
          currentPost.estado = currentPost.status;
        }

        // Update owner badge
        const existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        if (nowHidden) {
          const badge = document.createElement('div');
          badge.id = 'ownerStatusBadge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anúncio está <strong>desabilitado</strong> e não aparece nos feeds. Apenas você consegue ver esta página.</span>';
          const details = document.querySelector('.kc-product-details');
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }

        const toastMsg = nowHidden ? 'Anúncio desabilitado com sucesso.' : 'Anúncio reativado com sucesso.';
        try { showToast(toastMsg, 'success', 2500); } catch (_) { }
        return;
      }

      // Generic error
      toggleBtn.innerHTML = prevHTML;
      const errMsg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível alterar o status do anúncio.';
      try { showToast(errMsg, 'error', 2800); } catch (_) { }
    });

    renewBtn.addEventListener('click', async () => {
      if (renewBtn.disabled) return;
      renewBtn.disabled = true;
      const prevHTML = renewBtn.innerHTML;
      renewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Renovando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.renewPost === 'function') {
          res = await window.KCAPI.renewPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      renewBtn.disabled = false;

      if (res && (res._kcError === 'POST_LIMIT_REACHED' || res.code === 'LIMIT_REACHED')) {
        renewBtn.innerHTML = prevHTML;
        try { showToast(res.message || 'Limite de publicações ativas atingido.', 'error', 4500); } catch (_) { }
        return;
      }

      if (res && res.ok) {
        if (currentPost) { currentPost.status = 'published'; currentPost.estado = 'published'; }
        // Oculta Renovar, mostra Desabilitar e Impulsionar
        renewBtn.style.display = 'none';
        toggleBtn.style.display = '';
        toggleBtn.setAttribute('data-post-status', 'published');
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Desabilitar anúncio';
        bumpBtn.style.display = '';
        // Remove badge de expirado/oculto
        const existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        try { showToast(res.message || 'Publicação renovada! Disponível por mais 30 dias.', 'success', 3000); } catch (_) { }
        return;
      }

      renewBtn.innerHTML = prevHTML;
      const msg = (res && res.message) || (res && res.error && res.error.message) || 'Não foi possível renovar a publicação.';
      try { showToast(msg, 'error', 2800); } catch (_) { }
    });

    bumpBtn.addEventListener('click', async () => {
      if (bumpBtn.disabled) return;
      bumpBtn.disabled = true;
      const prevHTML = bumpBtn.innerHTML;
      bumpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Impulsionando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.bumpPost === 'function') {
          res = await window.KCAPI.bumpPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        bumpBtn.disabled = true;
        bumpBtn.style.opacity = '0.55';
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionado!';
        if (currentPost) { currentPost.bumped_at = new Date().toISOString(); }
        try { showToast(res.message || 'Anúncio impulsionado com sucesso!', 'success', 3000); } catch (_) { }
        return;
      }

      bumpBtn.disabled = false;
      bumpBtn.style.opacity = '';
      bumpBtn.innerHTML = prevHTML;
      const msg = (res && res.message) || (res && res.error && res.error.message) || 'Não foi possível impulsionar agora.';
      try { showToast(msg, res && res.code === 'COOLDOWN_ACTIVE' ? 'warn' : 'error', 3500); } catch (_) { }
    });
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
    setRelated(post);
    upsertOwnerActions(post, currentUser);
    bindSavedActions(post);
    refreshSavedState(post).catch(() => { });
    maybeResumeQueuedContact(post);
    wireReportButton({ postId: (post && post.uuid) ? post.uuid : post.id, postTitle: post.titulo || post.title || 'Publicação' });
  }

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

    // V8.1.6.2: wire botão Denunciar (gated por driver + auth)
    // Comments
    if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }

  function buildEditUI() {
    const overlay = document.createElement('div');
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'kc-create-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="kc-create-modal-header">
        <h2 class="kc-create-modal-title">Editar publicação</h2>
        <button type="button" class="kc-modal-close" aria-label="Fechar">×</button>
      </div>
      <div class="kc-create-modal-body">
        <div class="kc-form-group"><label>Título</label><input class="kc-input" name="title" /></div>
        <div class="kc-form-group"><label>Descrição</label><textarea class="kc-input" name="description" rows="4"></textarea></div>
        <div class="kc-form-group"><label>Preço</label><input class="kc-input" name="price" placeholder="Ex.: 99,90" /></div>
        <div class="kc-form-group"><label>Localização</label><input class="kc-input" name="location" /></div>
        <div class="kc-form-group"><label>Módulo</label><input class="kc-input" name="module" /></div>
        <div class="kc-form-group"><label>Categoria</label><input class="kc-input" name="category" /></div>
        <div class="kc-form-group"><label>Subcategoria</label><input class="kc-input" name="subcategory" /></div>
        <div class="kc-form-group"><label>Condição</label><input class="kc-input" name="condition" /></div>
        <div class="kc-form-group"><label>Emoji</label><input class="kc-input" name="emoji" maxlength="4" /></div>
        <div class="kc-form-group"><label>Tags (vírgula)</label><input class="kc-input" name="tags" /></div>
        <div class="kc-create-actions">
          <button type="button" class="kc-btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="kc-btn-primary" data-action="save">Salvar</button>
        </div>
        <div data-role="status" style="margin-top:8px;color:var(--text-muted, #64748b);"></div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = modal.querySelector('.kc-modal-close');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    const saveBtn = modal.querySelector('[data-action="save"]');
    const status = modal.querySelector('[data-role="status"]');

    const form = {
      title: modal.querySelector('[name="title"]'),
      description: modal.querySelector('[name="description"]'),
      price: modal.querySelector('[name="price"]'),
      location: modal.querySelector('[name="location"]'),
      module: modal.querySelector('[name="module"]'),
      category: modal.querySelector('[name="category"]'),
      subcategory: modal.querySelector('[name="subcategory"]'),
      condition: modal.querySelector('[name="condition"]'),
      emoji: modal.querySelector('[name="emoji"]'),
      tags: modal.querySelector('[name="tags"]'),
    };

    let editingPost = null;

    function close() {
      overlay.style.display = 'none';
      status.textContent = '';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    function open(post) {
      editingPost = post;
      const md = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
      form.title.value = post.titulo || post.title || '';
      form.description.value = post.descricao || post.description || '';
      form.price.value = (post.preco != null) ? String(post.preco) : '';
      form.location.value = post.location || '';
      form.module.value = post.modulo || post.module || '';
      form.category.value = post.category || post.categoria || '';
      form.subcategory.value = post.subcategoria || md.subcategory || '';
      form.condition.value = post.condicao || md.condicao || '';
      form.emoji.value = post.emoji || md.emoji || '';
      const tags = Array.isArray(post.tags) ? post.tags : (Array.isArray(md.tags) ? md.tags : []);
      form.tags.value = tags.join(', ');

      overlay.style.display = 'flex';
      try { form.title.focus(); } catch (_) { }
    }

    async function save() {
      if (!editingPost || !isAuthor(editingPost, currentUser)) {
        status.textContent = 'Você não tem permissão para editar este post.';
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      status.textContent = 'Salvando...';

      const payload = buildEditPayload(form, editingPost);
      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.updatePost === 'function') {
          res = await window.KCAPI.updatePost(getPostIdForMutation(editingPost), payload);
        }
      } catch (_) { }

      if (res && res.ok && res.data) {
        const next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(res.data, { pageModule: (res.data && res.data.modulo) || '', view: 'product' })
          : res.data;
        renderPost(next);
        try { showToast('Publicação atualizada com sucesso.', 'success', 2000); } catch (_) { }
        close();
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível atualizar a publicação.';
      status.textContent = msg;
      try { showToast(msg, 'error', 2400); } catch (_) { }
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    saveBtn.addEventListener('click', save);

    return { open, close };
  }

  // ─── Reports UI V8.3.0 — Popover / Bottom-Sheet ──────────────────────────
  // Desktop: popover ancorado ao botão; Mobile: bottom sheet deslizante.
  // Segurança: nenhuma injeção de HTML com dados do usuário (textContent apenas).
  var _reportPopover = null;

  var REPORT_REASONS = [
    { value: 'spam',          label: 'Spam / conteúdo repetitivo',   icon: 'fas fa-ban' },
    { value: 'scam',          label: 'Golpe / fraude',               icon: 'fas fa-exclamation-triangle' },
    { value: 'inappropriate', label: 'Conteúdo impróprio',           icon: 'fas fa-eye-slash' },
    { value: 'hate',          label: 'Ódio / assédio',               icon: 'fas fa-frown' },
    { value: 'illegal',       label: 'Ilegal / proibido',            icon: 'fas fa-gavel' },
    { value: 'duplicate',     label: 'Publicação duplicada',         icon: 'fas fa-copy' },
    { value: 'other',         label: 'Outro motivo',                 icon: 'fas fa-comment-dots' },
  ];

  function wireReportButton(ctx) {
    var btn = document.getElementById('reportButton');
    if (!btn) return;

    if (btn.dataset.kcReportBound === '1') {
      btn.dataset.kcReportPostId = String(ctx.postId || '');
      btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');
      return;
    }

    btn.dataset.kcReportBound = '1';
    btn.dataset.kcReportPostId = String(ctx.postId || '');
    btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();

      var payloadCtx = {
        postId: btn.dataset.kcReportPostId || ctx.postId,
        postTitle: btn.dataset.kcReportPostTitle || ctx.postTitle,
      };

      var driver = (window.KC_ENV && window.KC_ENV.driver) ? window.KC_ENV.driver : 'local';
      if (driver !== 'supabase') {
        try { showToast('Denúncias disponíveis apenas no modo Supabase.', 'info', 2200); } catch (_) { }
        return;
      }

      // Requer login
      var user = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          user = await window.KCAPI.getCurrentUser();
        }
      } catch (_) { }

      if (!user) {
        try { showToast('Faça login para denunciar.', 'info', 2200); } catch (_) { }
        try { if (typeof window.kcOpenAuthModal === 'function') window.kcOpenAuthModal(); } catch (_) { }
        return;
      }

      if (!_reportPopover) _reportPopover = buildReportPopover();
      _reportPopover.open(payloadCtx, btn);
    });
  }

  /**
   * buildReportPopover — cria uma vez e reutiliza.
   * Desktop: popover ancorado ao botão clicado.
   * Mobile (≤640px): bottom sheet.
   */
  function buildReportPopover() {
    // ── Backdrop ──────────────────────────────────────────────────
    var backdrop = document.createElement('div');
    backdrop.className = 'kc-report-popover-backdrop';
    backdrop.style.display = 'none';
    document.body.appendChild(backdrop);

    // ── Popover container ──────────────────────────────────────────
    var popover = document.createElement('div');
    popover.className = 'kc-report-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');
    popover.setAttribute('aria-label', 'Denunciar publicação');
    popover.style.display = 'none';
    document.body.appendChild(popover);

    // ── Shared elements ────────────────────────────────────────────
    var header = document.createElement('div');
    header.className = 'kc-report-popover-header';

    var headerTitle = document.createElement('h3');

    var headerActions = document.createElement('div');
    headerActions.className = 'kc-report-popover-header-actions';

    var btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'kc-report-btn-back';
    btnBack.setAttribute('aria-label', 'Voltar');
    btnBack.innerHTML = '<i class=”fas fa-arrow-left”></i>';
    btnBack.style.display = 'none';

    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'kc-report-btn-close';
    btnClose.setAttribute('aria-label', 'Fechar');
    btnClose.innerHTML = '<i class=”fas fa-times”></i>';

    headerActions.appendChild(btnBack);
    headerActions.appendChild(btnClose);
    header.appendChild(headerTitle);
    header.appendChild(headerActions);

    var postLabel = document.createElement('div');
    postLabel.className = 'kc-report-post-label';

    // ── Step 1: lista de motivos ───────────────────────────────────
    var stepReasons = document.createElement('div');

    var reasonList = document.createElement('ul');
    reasonList.className = 'kc-report-reason-list';
    reasonList.setAttribute('role', 'listbox');

    REPORT_REASONS.forEach(function (r, idx) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kc-report-reason-item';
      btn.dataset.kcReasonValue = r.value;

      var icon = document.createElement('i');
      icon.className = r.icon;
      icon.setAttribute('aria-hidden', 'true');

      var labelSpan = document.createElement('span');
      labelSpan.textContent = r.label;

      var chevron = document.createElement('i');
      chevron.className = 'fas fa-chevron-right kc-report-chevron';
      chevron.setAttribute('aria-hidden', 'true');

      btn.appendChild(icon);
      btn.appendChild(labelSpan);
      btn.appendChild(chevron);
      li.appendChild(btn);

      // Separador entre itens (exceto último)
      if (idx < REPORT_REASONS.length - 1) {
        var sep = document.createElement('hr');
        sep.className = 'kc-report-reason-separator';
        li.appendChild(sep);
      }

      btn.addEventListener('click', function () {
        goToConfirm(r.value, r.label);
      });

      reasonList.appendChild(li);
    });

    stepReasons.appendChild(reasonList);

    // ── Step 2: confirmação + detalhes ────────────────────────────
    var stepConfirm = document.createElement('div');
    stepConfirm.style.display = 'none';

    var confirmBody = document.createElement('div');
    confirmBody.className = 'kc-report-confirm-body';

    var confirmInfo = document.createElement('p');
    confirmInfo.className = 'kc-report-confirm-info';
    confirmInfo.textContent = 'Deseja confirmar esta denúncia? Adicione detalhes se quiser.';

    var detailsLabel = document.createElement('label');
    detailsLabel.className = 'kc-report-details-label';
    detailsLabel.textContent = 'Detalhes adicionais (opcional, máx. 1000 caracteres)';

    var detailsField = document.createElement('textarea');
    detailsField.className = 'kc-report-details-field';
    detailsField.maxLength = 1000;
    detailsField.placeholder = 'Descreva o problema com mais detalhes…';
    detailsField.rows = 3;

    var statusEl = document.createElement('div');
    statusEl.className = 'kc-report-status';

    var confirmActions = document.createElement('div');
    confirmActions.className = 'kc-report-confirm-actions';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'kc-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    var btnSubmit = document.createElement('button');
    btnSubmit.type = 'button';
    btnSubmit.className = 'kc-btn-primary';
    btnSubmit.innerHTML = '<i class=”fas fa-flag”></i> Enviar denúncia';

    confirmActions.appendChild(btnCancel);
    confirmActions.appendChild(btnSubmit);

    confirmBody.appendChild(confirmInfo);
    confirmBody.appendChild(detailsLabel);
    confirmBody.appendChild(detailsField);
    confirmBody.appendChild(statusEl);
    confirmBody.appendChild(confirmActions);
    stepConfirm.appendChild(confirmBody);

    // ── Assemble ───────────────────────────────────────────────────
    popover.appendChild(header);
    popover.appendChild(postLabel);
    popover.appendChild(stepReasons);
    popover.appendChild(stepConfirm);

    // ── State ──────────────────────────────────────────────────────
    var currentPostId = null;
    var currentReason = null;

    // ── Positioning (desktop) ──────────────────────────────────────
    function positionPopover(anchorBtn) {
      var isMobile = window.innerWidth <= 640;
      if (isMobile) {
        // bottom sheet: CSS handles it
        popover.style.removeProperty('top');
        popover.style.removeProperty('left');
        popover.style.removeProperty('right');
        return;
      }

      var rect = anchorBtn.getBoundingClientRect();
      var popW = 310; // matches CSS width
      var margin = 8;

      var left = rect.left;
      var top = rect.bottom + margin;

      // Evita sair pela direita
      if (left + popW > window.innerWidth - margin) {
        left = window.innerWidth - popW - margin;
      }
      // Evita sair pela esquerda
      if (left < margin) left = margin;

      // Se não cabe abaixo, abre acima
      var popH = Math.min(popover.scrollHeight || 400, window.innerHeight * 0.8);
      if (top + popH > window.innerHeight - margin) {
        top = rect.top - popH - margin;
        if (top < margin) top = margin;
      }

      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
    }

    // ── Steps ──────────────────────────────────────────────────────
    function showStep1() {
      headerTitle.innerHTML = '<i class=”fas fa-flag” aria-hidden=”true”></i> Denunciar';
      btnBack.style.display = 'none';
      stepReasons.style.display = '';
      stepConfirm.style.display = 'none';
      detailsField.value = '';
      statusEl.textContent = '';
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    function goToConfirm(reasonValue, reasonLabel) {
      currentReason = reasonValue;
      headerTitle.innerHTML = '<i class=”fas fa-flag” aria-hidden=”true”></i> ' + esc(reasonLabel);
      btnBack.style.display = '';
      stepReasons.style.display = 'none';
      stepConfirm.style.display = '';
      statusEl.textContent = '';
      try { detailsField.focus(); } catch (_) { }
    }

    // ── Open / Close ───────────────────────────────────────────────
    function open(ctx, anchorBtn) {
      currentPostId = ctx.postId;

      var title = String(ctx.postTitle || 'Publicação');
      postLabel.textContent = title;

      showStep1();

      backdrop.style.display = '';
      popover.style.display = '';

      // Positioning must happen after display (to measure dimensions)
      requestAnimationFrame(function () {
        positionPopover(anchorBtn);
      });

      try { reasonList.querySelector('.kc-report-reason-item').focus(); } catch (_) { }
    }

    function closePopover() {
      backdrop.style.display = 'none';
      popover.style.display = 'none';
      currentPostId = null;
      currentReason = null;
      showStep1();
    }

    async function submitReport() {
      if (!currentReason) return;

      btnSubmit.disabled = true;
      btnCancel.disabled = true;
      statusEl.textContent = 'Enviando…';

      var res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.reportPost === 'function') {
          res = await window.KCAPI.reportPost(currentPostId, {
            reason: currentReason,
            details: detailsField.value,
          });
        }
      } catch (e) {
        res = { ok: false, error: { message: 'Falha ao enviar.' } };
      }

      if (res && res.ok) {
        statusEl.textContent = 'Denúncia registrada. Obrigado!';
        statusEl.style.color = 'var(--kc-green-check, #22c55e)';
        try { showToast('Denúncia registrada. Obrigado!', 'success', 2200); } catch (_) { }
        setTimeout(closePopover, 900);
        return;
      }

      var msg = (res && res.error && res.error.message)
        ? String(res.error.message)
        : 'Não foi possível registrar a denúncia.';
      statusEl.textContent = msg;
      statusEl.style.color = '';
      try { showToast(msg, 'error', 2600); } catch (_) { }
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    // ── Event wiring ───────────────────────────────────────────────
    btnClose.addEventListener('click', closePopover);
    btnCancel.addEventListener('click', closePopover);
    btnBack.addEventListener('click', showStep1);
    btnSubmit.addEventListener('click', submitReport);

    // Fechar ao clicar no backdrop
    backdrop.addEventListener('click', closePopover);

    // Fechar com Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popover.style.display !== 'none') closePopover();
    });

    // Reposicionar no resize (desktop)
    window.addEventListener('resize', function () {
      if (popover.style.display !== 'none' && window.innerWidth > 640) {
        var anchorEl = document.getElementById('reportButton');
        if (anchorEl) positionPopover(anchorEl);
      }
    });

    return { open: open, close: closePopover };
  }
  // ─────────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    wireSharePopover();
    wireSavePopover();
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
