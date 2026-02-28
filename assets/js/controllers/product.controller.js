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
  let currentDb = null;
  let editUI = null;
  let staticInteractionsBound = false;

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

  /**
   * Extrai o "login" do usuário: prefixo do e-mail (ex.: "yandiamantinobr").
   * Prioridades: email do profile > email do user.
   */
  function resolveCurrentUserLogin(user, profile) {
    const emailSources = [
      profile && profile.email,
      user && user.email,
    ];
    for (let i = 0; i < emailSources.length; i++) {
      const email = String(emailSources[i] || '').trim();
      if (email.includes('@')) return email.split('@')[0];
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
        composerAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(seed);
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
        console.log('[RC-8220][L1] Botão clicado: share-post');
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

      const shareBtn = event.target.closest('[data-kc-share]');
      if (shareBtn) {
        event.preventDefault();
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(window.location.href);
            toast('Link copiado!', 'info', 1800);
          } else {
            throw new Error('clipboard_api_unavailable');
          }
        } catch (e) {
          console.error('[KC Product] Falha ao copiar link:', e);
          toast('Não foi possível copiar o link.', 'error', 2200);
        }
        return;
      }

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

  function setGallery(post) {
    const mainImg = document.getElementById('mainImage');
    const emojiCover = document.getElementById('emojiCover');
    const thumbs = document.getElementById('thumbnails');

    const images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
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

    let html = '';
    if (desc) {
      html += `<h3><i class="fas fa-align-left"></i> Descrição</h3><p>${desc}</p>`;
    }
    if (tags.length) {
      html += `<div style="margin-top: 12px; display:flex; flex-wrap: wrap; gap: 8px;">` +
        tags.map(t => `<span class="kc-tag">${esc(t)}</span>`).join('') +
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

  function setSeller(post) {
    const card = document.getElementById('sellerCard');
    const avatar = document.getElementById('sellerAvatar');
    const name = document.getElementById('sellerName');
    const handle = document.getElementById('sellerHandle');
    const stats = document.getElementById('sellerStats');
    if (!card || !avatar || !name || !stats) return;

    const normalizedName = post.authorName || post.autor || post.author || '';
    const normalizedAvatar = post.authorAvatar || post.autorAvatar || '';
    const authorEmail = post.authorEmail || '';

    const author = normalizedName || 'Autor';
    const avatarUrl = normalizedAvatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(author));

    avatar.src = avatarUrl;
    name.innerHTML = esc(author) + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '');

    // Handle (@login) abaixo do nome
    if (handle) {
      const loginHandle = authorEmail.includes('@') ? ('@' + authorEmail.split('@')[0]) : '';
      if (loginHandle) {
        handle.textContent = loginHandle;
        handle.style.display = 'block';
      } else {
        handle.style.display = 'none';
      }
    }

    const items = [];

    // Engajamento da publicação atual
    if (typeof post.votos === 'number' && post.votos > 0) {
      items.push('<span><i class="fas fa-fire"></i> ' + post.votos + ' voto' + (post.votos !== 1 ? 's' : '') + '</span>');
    }
    if (typeof post.comentarios === 'number' && post.comentarios > 0) {
      items.push('<span><i class="fas fa-comments"></i> ' + post.comentarios + ' coment' + (post.comentarios !== 1 ? 'ários' : 'ário') + '</span>');
    }

    // Outras publicações deste autor no banco local
    const authorId = getPostAuthorId(post);
    if (authorId && currentDb) {
      const allPosts = (Array.isArray(currentDb.posts) ? currentDb.posts
        : (Array.isArray(currentDb.anuncios) ? currentDb.anuncios : []));
      const authorPostCount = allPosts.filter(function (p) {
        if (!p) return false;
        const pid = String(p.autorId || p.authorId || p.author_id || '').trim();
        return pid && pid === String(authorId).trim() && String(p.id) !== String(post.id);
      }).length;
      if (authorPostCount > 0) {
        items.push('<span><i class="fas fa-layer-group"></i> ' + authorPostCount + ' publicaç' + (authorPostCount === 1 ? 'ão' : 'ões') + '</span>');
      }
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

    const mergedName = profileName || fallbackName || 'Autor';
    const mergedAvatar = profileAvatar
      || fallbackAvatar
      || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(mergedName));

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
      authorEmail: profile.email || post.authorEmail || '',
    };
  }

  function normalizeWhatsAppPhone(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    return '55' + digits;
  }

  function getPostContactAction(post) {
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

  function setCTA(post) {
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
  function scoreRelated(candidate, currentPost, searchHistory, voteHistory) {
    var score = 0;

    // 1. Mesma categoria → +20
    var currentCat = String(currentPost.categoria || currentPost.category || '').toLowerCase().trim();
    var candidateCat = String(candidate.categoria || candidate.category || '').toLowerCase().trim();
    if (currentCat && candidateCat && currentCat === candidateCat) score += 20;

    // 2. Mesma subcategoria → +15
    var currentSubCat = String(
      currentPost.subcategoria
      || (currentPost.metadata && currentPost.metadata.subcategory)
      || ''
    ).toLowerCase().trim();
    var candidateSubCat = String(
      candidate.subcategoria
      || (candidate.metadata && candidate.metadata.subcategory)
      || ''
    ).toLowerCase().trim();
    if (currentSubCat && candidateSubCat && currentSubCat === candidateSubCat) score += 15;

    // 3. Tags em comum → +6 por tag coincidente (máx +24)
    var currentTags = Array.isArray(currentPost.tags)
      ? currentPost.tags.map(function (t) { return String(t).toLowerCase().trim(); })
      : [];
    var candidateTags = Array.isArray(candidate.tags)
      ? candidate.tags.map(function (t) { return String(t).toLowerCase().trim(); })
      : [];
    if (currentTags.length && candidateTags.length) {
      var tagOverlap = currentTags.filter(function (t) { return t && candidateTags.indexOf(t) !== -1; }).length;
      score += Math.min(tagOverlap * 6, 24);
    }

    // 4. Coincide com histórico de buscas do usuário → +8 por termo (máx +24)
    if (Array.isArray(searchHistory) && searchHistory.length) {
      var title = String(candidate.titulo || candidate.title || '').toLowerCase();
      var desc = String(candidate.descricao || candidate.description || '').toLowerCase();
      var searchHits = 0;
      searchHistory.forEach(function (term) {
        var t = String(term || '').toLowerCase().trim();
        if (t && t.length >= 2 && (title.indexOf(t) !== -1 || desc.indexOf(t) !== -1)) searchHits++;
      });
      score += Math.min(searchHits * 8, 24);
    }

    // 5. Usuário votou positivamente em post similar → +12
    if (Array.isArray(voteHistory) && voteHistory.indexOf(String(candidate.id)) !== -1) {
      score += 12;
    }

    // 6. Votos do post candidato (normalizado 0-10)
    var votos = typeof candidate.votos === 'number' ? candidate.votos : 0;
    if (votos > 0) score += Math.min(Math.floor(votos / 3), 10);

    // 7. Recência (posts recentes ganham bônus)
    if (candidate.created_at || candidate.criadoEm) {
      try {
        var ts = new Date(candidate.created_at || candidate.criadoEm).getTime();
        if (!isNaN(ts)) {
          var daysDiff = (Date.now() - ts) / 86400000;
          if (daysDiff < 1)       score += 10;
          else if (daysDiff < 3)  score += 7;
          else if (daysDiff < 7)  score += 5;
          else if (daysDiff < 14) score += 2;
        }
      } catch (_) { }
    }

    // 8. Mesmo autor (pode ser interessante ver mais do mesmo autor) → +5
    var currentAuthorId = String(currentPost.autorId || currentPost.authorId || currentPost.author_id || '').trim();
    var candidateAuthorId = String(candidate.autorId || candidate.authorId || candidate.author_id || '').trim();
    if (currentAuthorId && candidateAuthorId && currentAuthorId === candidateAuthorId) score += 5;

    return score;
  }

  /** Lê o histórico de buscas salvo pelo sistema de busca global */
  function getRelatedSearchHistory() {
    try {
      // Tenta o formato usado pelo kc-search.js
      var raw = localStorage.getItem('kc_search_history')
        || localStorage.getItem('kcSearchHistory')
        || localStorage.getItem('kc:search:history');
      if (!raw) {
        // Fallback: query param atual (usuário chegou via busca)
        try {
          var q = new URLSearchParams(document.referrer.split('?')[1] || '').get('q');
          if (q && q.trim()) return [q.trim()];
        } catch (_) { }
        return [];
      }
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 10).map(String);
      if (typeof parsed === 'string') return [parsed];
      return [];
    } catch (_) { return []; }
  }

  /** Lê IDs de posts que o usuário votou positivamente (localStorage) */
  function getRelatedVoteHistory() {
    try {
      var raw = localStorage.getItem('kc_upvoted_posts')
        || localStorage.getItem('kcUpvotedPosts')
        || localStorage.getItem('kc:votes:up');
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) { return []; }
  }

  function setRelated(db, post) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';

    var dbItems = (db && Array.isArray(db.posts)) ? db.posts
      : ((db && Array.isArray(db.anuncios)) ? db.anuncios : []);
    var userItems = (window.kcUserPosts && typeof window.kcUserPosts.list === 'function')
      ? window.kcUserPosts.list() : [];
    var allItems = dbItems.concat(userItems);

    var currentId = String(post.id);
    var moduleKey = String(post.modulo || '');

    // Filtra por módulo e exclui publicação atual
    var candidates = allItems.filter(function (a) {
      if (!a || String(a.id) === currentId) return false;
      return String(a.modulo || '') === moduleKey;
    });

    if (!candidates.length) {
      section.style.display = 'none';
      return;
    }

    var searchHistory = getRelatedSearchHistory();
    var voteHistory = getRelatedVoteHistory();

    // Pontua e ordena por relevância (desc)
    var scored = candidates.map(function (a) {
      return { item: a, score: scoreRelated(a, post, searchHistory, voteHistory) };
    });
    scored.sort(function (x, y) { return y.score - x.score; });

    // Exibe os 4 mais relevantes
    scored.slice(0, 4).forEach(function (entry) {
      var a = entry.item;
      var card = document.createElement('div');
      card.className = 'kc-related-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', function () {
        window.location.href = 'product.html?id=' + encodeURIComponent(a.id);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.href = 'product.html?id=' + encodeURIComponent(a.id);
        }
      });

      var price = (typeof a.preco === 'number')
        ? (a.preco === 0 ? 'Gratuito' : formatCurrency(a.preco))
        : '';

      card.innerHTML = '<h4>' + esc(a.titulo || 'Publicação') + '</h4>'
        + '<div class="kc-related-meta">'
        + '<span><i class="fas fa-user"></i> ' + esc(a.autor || 'Autor') + '</span>'
        + (price ? '<span><i class="fas fa-tag"></i> ' + esc(price) + '</span>' : '')
        + '</div>';

      grid.appendChild(card);
    });

    section.style.display = 'block';
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
    wrap.style.display = 'contents';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'kc-btn-secondary';
    editBtn.id = 'editPostButton';
    editBtn.innerHTML = '<i class="fas fa-pen"></i> Editar';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kc-btn-secondary';
    deleteBtn.id = 'deletePostButton';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';

    wrap.appendChild(editBtn);
    wrap.appendChild(deleteBtn);

    const reportBtn = document.getElementById('reportButton');
    if (reportBtn && reportBtn.parentNode === actions) actions.insertBefore(wrap, reportBtn);
    else actions.appendChild(wrap);

    editBtn.addEventListener('click', () => {
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
  }

  function renderPost(post) {
    currentPost = post;
    hide('notFound');
    setText('postTitle', post.titulo || 'Detalhes');
    setBreadcrumb(post);
    setBadges(post);
    setGallery(post);
    setPrice(post);
    setDescription(post);
    setSpecs(post);
    setSeller(post);
    setCTA(post);
    setRelated(currentDb, post);
    upsertOwnerActions(post, currentUser);
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

    let db = null;
    try {
      if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
        db = await window.KCAPI.getDatabaseNormalized();
      }
    } catch (_) { }

    let raw = null;

    // Preferir driver unificado (V8.1.2.4.5): localStorage + seed JSON (+ futuro UUID/backend)
    try {
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
    } catch (_) { }


    if (!raw) { showNotFound(); return; }

    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        currentUser = await window.KCAPI.getCurrentUser();
      }
    } catch (_) {
      currentUser = null;
    }

    let currentProfile = null;
    try {
      if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
        currentProfile = await window.KCAPI.getMyProfile();
      }
    } catch (_) {
      currentProfile = null;
    }
    if (!currentProfile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          currentProfile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) {
        currentProfile = null;
      }
    }
    applyCommentComposerSessionState(currentUser, currentProfile);

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

    currentDb = db;
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
    bindStaticInteractions();
    loadPost();
  });
})();
