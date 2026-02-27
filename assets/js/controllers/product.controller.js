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

  function resolveCurrentUserDisplayName(user) {
    if (!user || typeof user !== 'object') return '';
    const userMetadata = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : null;
    const candidates = [
      userMetadata && userMetadata.full_name,
      user.display_name,
      user.email,
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (value) return value;
    }
    return '';
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
        const authorId = (currentPost && (currentPost.autorId || currentPost.authorId || currentPost.author_id)) || null;
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
    const stats = document.getElementById('sellerStats');
    if (!card || !avatar || !name || !stats) return;

    const authorId = (post && (post.autorId || post.authorId || post.author_id)) || null;
    const normalizedName = post.authorName || post.autor || post.author || '';
    const normalizedAvatar = post.authorAvatar || post.autorAvatar || '';

    const authorProfile = (authorId && window.KCAPI && typeof window.KCAPI.getAuthorById === 'function')
      ? window.KCAPI.getAuthorById(authorId)
      : null;

    const author = normalizedName
      || (authorProfile && (authorProfile.name || authorProfile.displayName))
      || 'Autor';

    const avatarUrl = normalizedAvatar
      || (authorProfile && (authorProfile.avatar || authorProfile.avatarUrl))
      || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(author));

    avatar.src = avatarUrl;
    name.innerHTML = esc(author) + (post.verificado ? ' <i class="fas fa-check-circle" style="color: var(--kc-green-check);" title="Verificado"></i>' : '');

    const items = [];
    if (typeof post.rating === 'number') items.push('<span><i class="fas fa-star" style="color: var(--kc-yellow-badge);"></i> ' + post.rating.toFixed(1) + '</span>');
    if (typeof post.votos === 'number') items.push('<span><i class="fas fa-fire"></i> ' + post.votos + '</span>');
    if (typeof post.comentarios === 'number') items.push('<span><i class="fas fa-comments"></i> ' + post.comentarios + '</span>');

    stats.innerHTML = items.join('');
    card.style.display = 'block';
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

    const authorId = (post && (post.autorId || post.authorId || post.author_id)) || null;
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

  function setRelated(db, post) {
    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';

    const dbItems = (db && Array.isArray(db.posts)) ? db.posts : ((db && Array.isArray(db.anuncios)) ? db.anuncios : []);
    const userItems = (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') ? window.kcUserPosts.list() : [];
    const allItems = [...dbItems, ...userItems];

    const currentId = String(post.id);
    const moduleKey = String(post.modulo || '');

    const related = allItems
      .filter(a => String(a && a.id) !== currentId && String(a && a.modulo || '') === moduleKey)
      .slice(0, 6);

    if (!related.length) {
      section.style.display = 'none';
      return;
    }

    related.slice(0, 4).forEach(a => {
      const card = document.createElement('div');
      card.className = 'kc-related-card';
      card.addEventListener('click', () => {
        window.location.href = 'product.html?id=' + encodeURIComponent(a.id);
      });

      const price = (typeof a.preco === 'number')
        ? (a.preco === 0 ? 'Gratuito' : formatCurrency(a.preco))
        : '';

      card.innerHTML = `
        <h4>${esc(a.titulo || 'Publicação')}</h4>
        <div class="kc-related-meta">
          <span><i class="fas fa-user"></i> ${esc(a.autor || 'Autor')}</span>
          ${price ? `<span><i class="fas fa-tag"></i> ${esc(price)}</span>` : ''}
        </div>
      `;
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

    const commentAuthorInput = document.getElementById('commentAuthor');
    if (commentAuthorInput) {
      const resolvedIdentity = resolveCurrentUserDisplayName(currentUser);
      if (resolvedIdentity) commentAuthorInput.value = resolvedIdentity;
    }

    // Contrato único (Model) + regras centrais
    const post = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);

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

  // ---------------- Reports UI (V8.1.6.2) ----------------
  // UI mínima: botão “Denunciar” (product.html) + modal com motivo/detalhes.
  // Segurança: nenhuma injeção de HTML com dados do usuário (textContent apenas).
  let _reportUI = null;

  function wireReportButton(ctx) {
    const btn = document.getElementById('reportButton');
    if (!btn) return;

    if (btn.dataset.kcReportBound === '1') {
      btn.dataset.kcReportPostId = String(ctx.postId || '');
      btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');
      return;
    }

    btn.dataset.kcReportBound = '1';
    btn.dataset.kcReportPostId = String(ctx.postId || '');
    btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');

    btn.addEventListener('click', async () => {
      const payloadCtx = {
        postId: btn.dataset.kcReportPostId || ctx.postId,
        postTitle: btn.dataset.kcReportPostTitle || ctx.postTitle,
      };
      const driver = (window.KC_ENV && window.KC_ENV.driver) ? window.KC_ENV.driver : 'local';
      if (driver !== 'supabase') {
        try { showToast('Denúncias disponíveis apenas no modo Supabase.', 'info', 2200); } catch (_) { }
        return;
      }

      // Requer login
      let user = null;
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

      if (!_reportUI) _reportUI = buildReportUI();
      _reportUI.open({ postId: payloadCtx.postId, postTitle: payloadCtx.postTitle });
    });
  }

  function buildReportUI() {
    // overlay
    const overlay = document.createElement('div');
    overlay.id = 'kcReportOverlay';
    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'kc-create-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // header
    const header = document.createElement('div');
    header.className = 'kc-create-modal-header';

    const h2 = document.createElement('h2');
    h2.className = 'kc-create-modal-title';
    h2.textContent = 'Denunciar publicação';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kc-modal-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';

    header.appendChild(h2);
    header.appendChild(close);

    const body = document.createElement('div');
    body.className = 'kc-create-modal-body';

    const subtitle = document.createElement('p');
    subtitle.style.margin = '0 0 10px 0';
    subtitle.style.color = 'var(--text-muted, #64748b)';
    subtitle.style.fontSize = '0.95rem';
    subtitle.textContent = 'Ajude a manter a comunidade segura. Escolha um motivo e descreva, se quiser.';

    const postLine = document.createElement('div');
    postLine.style.margin = '0 0 14px 0';
    postLine.style.fontSize = '0.95rem';
    const postLabel = document.createElement('span');
    postLabel.textContent = 'Post: ';
    const postTitle = document.createElement('strong');
    postTitle.textContent = '';
    postLine.appendChild(postLabel);
    postLine.appendChild(postTitle);

    const reasonWrap = document.createElement('div');
    reasonWrap.className = 'kc-form-group';
    const reasonLabel = document.createElement('label');
    reasonLabel.textContent = 'Motivo (obrigatório)';
    const reasonSel = document.createElement('select');
    reasonSel.className = 'kc-input';
    reasonSel.style.width = '100%';
    const reasons = [
      { v: '', t: 'Selecione…' },
      { v: 'spam', t: 'Spam / conteúdo repetitivo' },
      { v: 'scam', t: 'Golpe / fraude' },
      { v: 'inappropriate', t: 'Conteúdo impróprio' },
      { v: 'hate', t: 'Ódio / assédio' },
      { v: 'illegal', t: 'Ilegal / proibido' },
      { v: 'duplicate', t: 'Duplicado' },
      { v: 'other', t: 'Outro' },
    ];
    reasons.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.v;
      opt.textContent = r.t;
      reasonSel.appendChild(opt);
    });
    reasonWrap.appendChild(reasonLabel);
    reasonWrap.appendChild(reasonSel);

    const detailsWrap = document.createElement('div');
    detailsWrap.className = 'kc-form-group';
    const detailsLabel = document.createElement('label');
    detailsLabel.textContent = 'Detalhes (opcional)';
    const details = document.createElement('textarea');
    details.className = 'kc-input';
    details.rows = 4;
    details.maxLength = 1000;
    details.placeholder = 'Conte o que aconteceu (máx. 1000 caracteres).';
    details.style.width = '100%';
    detailsWrap.appendChild(detailsLabel);
    detailsWrap.appendChild(details);

    const status = document.createElement('div');
    status.style.marginTop = '8px';
    status.style.fontSize = '0.95rem';
    status.style.color = 'var(--text-muted, #64748b)';
    status.textContent = '';

    const actions = document.createElement('div');
    actions.className = 'kc-create-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kc-btn-secondary';
    cancel.textContent = 'Cancelar';

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'kc-btn-primary';
    submit.textContent = 'Enviar denúncia';

    actions.appendChild(cancel);
    actions.appendChild(submit);

    body.appendChild(subtitle);
    body.appendChild(postLine);
    body.appendChild(reasonWrap);
    body.appendChild(detailsWrap);
    body.appendChild(status);
    body.appendChild(actions);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let currentPostId = null;

    function closeModal() {
      overlay.style.display = 'none';
      reasonSel.value = '';
      details.value = '';
      status.textContent = '';
      submit.disabled = false;
      cancel.disabled = false;
    }

    function open(ctx) {
      currentPostId = ctx.postId;
      postTitle.textContent = String(ctx.postTitle || 'Publicação');
      overlay.style.display = 'flex';
      // foco inicial
      try { reasonSel.focus(); } catch (_) { }
    }

    async function submitReport() {
      const reason = String(reasonSel.value || '').trim();
      if (!reason) {
        status.textContent = 'Selecione um motivo.';
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      status.textContent = 'Enviando…';

      let res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.reportPost === 'function') {
          res = await window.KCAPI.reportPost(currentPostId, { reason, details: details.value });
        }
      } catch (e) {
        res = { ok: false, error: { message: 'Falha ao enviar.' } };
      }

      if (res && res.ok) {
        status.textContent = 'Obrigado! Sua denúncia foi registrada.';
        try { showToast('Denúncia registrada. Obrigado!', 'success', 2200); } catch (_) { }
        setTimeout(closeModal, 650);
        return;
      }

      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível registrar a denúncia.';
      status.textContent = msg;
      try { showToast(msg, 'error', 2600); } catch (_) { }
      submit.disabled = false;
      cancel.disabled = false;
    }

    // wire
    close.addEventListener('click', closeModal);
    cancel.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    submit.addEventListener('click', submitReport);

    return { open, close: closeModal };
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindStaticInteractions();
    loadPost();
  });
})();
