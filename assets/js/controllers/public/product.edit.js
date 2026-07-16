/**
 * @file product.edit.js
 * @description Sub-modulo de owner actions e edicao da pagina de produto (v11.30.15)
 * Extraido de product.controller.js. Registra window._KCProduct.edit.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCAPI       - updatePost, deletePost, togglePostStatus, renewPost, bumpPost, reactivatePost
 *   - window.KCPostModel - normalizacao do payload atualizado
 *   - window.kcOpenEditPostModal - modal principal de edicao, quando disponivel
 *   - window.showToast   - feedback visual
 *
 * Carregado apos product.ratings.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.edit disponivel antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  var editUI = null;

  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }

  function isAuthor(post, user) {
    if (!post || !user || !user.id) return false;
    var postAuthorId = String(post.autorId || post.authorId || post.author_id || '').trim();
    return !!postAuthorId && postAuthorId === String(user.id).trim();
  }

  function isAdminProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return profile.is_admin === true
      || profile.isAdmin === true
      || profile.admin === true
      || String(profile.role || '').toLowerCase() === 'admin';
  }

  // Hardcoded operator override. Even if profiles.is_admin is somehow
  // false in the database (stale cache, RLS denormalisation, manual
  // reset) the operator keeps edit access on every post. This is the
  // safety net that keeps the "Eu sou admin" guarantee Yan asked for:
  // as long as he is logged in with one of these auth user ids, the
  // editor buttons render and the write-adapter sends the admin_update
  // source marker. RLS still requires profiles.is_admin on the
  // Supabase side, so this list is paired with a SQL migration that
  // hard-promotes the same ids.
  var KC_ADMIN_OPERATOR_USER_IDS = Object.freeze([
    'abfb1831-6ad3-4f40-b55b-788e29f146f0', // yan1nakamura (hotmail)
    'bf3a4310-927f-4200-9df7-7478392d6a6e', // Yan Diamantino (yandiamantino)
    '2345582d-8bf7-4393-aa0d-f9953d0e02ca', // Cadu Bot
    '10391c7b-4a6d-4462-becb-e6e0056b7e1d', // Codex QA Admin
  ]);
  function isOperatorUserId(value) {
    if (!value) return false;
    var normalized = String(value).trim().toLowerCase();
    if (!normalized) return false;
    for (var i = 0; i < KC_ADMIN_OPERATOR_USER_IDS.length; i += 1) {
      if (String(KC_ADMIN_OPERATOR_USER_IDS[i]).toLowerCase() === normalized) return true;
    }
    return false;
  }
  function isOperatorProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (isOperatorUserId(profile.id)) return true;
    if (isOperatorUserId(profile.user_id)) return true;
    return false;
  }
  function isOperatorAppMetadata(appMetadata) {
    if (!appMetadata || typeof appMetadata !== 'object') return false;
    return isOperatorUserId(appMetadata.user_id) || isOperatorUserId(appMetadata.sub);
  }

  function resolveCurrentProfile(context, fallbackUser) {
    var profile = fallbackUser && fallbackUser.profile;
    if (context && typeof context.getCurrentProfile === 'function') {
      try {
        profile = context.getCurrentProfile() || profile || null;
      } catch (_) { }
    }
    if (!profile && window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function') {
      try { profile = window.KCAPI.getCurrentProfile() || null; } catch (_) { }
    }
    if (!profile && window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
      try { profile = window.KCProfiles.getCurrentProfile() || null; } catch (_) { }
    }
    return profile || null;
  }

  function canManagePost(post, user, context) {
    var viewer = resolveCurrentUser(context, user);
    if (isAuthor(post, viewer)) return true;
    return isAdminProfile(resolveCurrentProfile(context, viewer))
      || isAdminProfile(viewer && viewer.app_metadata)
      || isOperatorProfile(viewer)
      || isOperatorAppMetadata(viewer && viewer.app_metadata);
  }

  function isAdminManagingPost(post, user, context) {
    var viewer = resolveCurrentUser(context, user);
    return !isAuthor(post, viewer) && canManagePost(post, viewer, context);
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function clearPostSessionCaches() {
    if (window.KCPostFreshness && typeof window.KCPostFreshness.clearContentCaches === 'function') {
      try {
        window.KCPostFreshness.clearContentCaches({ scopes: ['feeds', 'product-detail', 'my-posts', 'profile-posts', 'profile'] });
        return;
      } catch (_) { }
    }
    var store = window.KCSessionStore;
    if (store && typeof store.clearPrefix === 'function') {
      try { store.clearPrefix('feeds', ''); } catch (_) { }
      try { store.clearPrefix('my-posts', ''); } catch (_) { }
      try { store.clearPrefix('profile-posts', ''); } catch (_) { }
      try { store.clearPrefix('product-detail', ''); } catch (_) { }
    }
    try {
      if (window._KCProduct && window._KCProduct.load && typeof window._KCProduct.load.invalidateProductDetailCache === 'function') {
        window._KCProduct.load.invalidateProductDetailCache(window.kcCurrentPostContext || null);
      }
    } catch (_) { }
  }

  function getClosedLabel(post) {
    var moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    if (moduleKey === 'eventos') return 'Evento encerrado';
    if (moduleKey === 'caronas') return 'Carona encerrada';
    if (moduleKey === 'compra-venda') return 'An\u00FAncio encerrado';
    return 'Publica\u00E7\u00E3o encerrada';
  }

  function markPostAsEdited() {
    var titleEl = document.getElementById('postTitle');
    var existing;
    var badge;
    if (!titleEl) return;
    existing = document.getElementById('kcEditedBadge');
    if (existing) return;
    badge = document.createElement('div');
    badge.id = 'kcEditedBadge';
    badge.className = 'kc-post-edited-badge';
    badge.innerHTML = '<i class="fas fa-pen-to-square"></i> Editado';
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }

  function buildEditPayload(form, sourcePost) {
    var tagsRaw = String(form.tags.value || '').trim();
    var metadata = Object.assign(
      {},
      (sourcePost && sourcePost.metadata && typeof sourcePost.metadata === 'object') ? sourcePost.metadata : {},
      form.subcategory.value ? { subcategory: String(form.subcategory.value).trim() } : {},
      form.condition.value ? { condicao: String(form.condition.value).trim() } : {},
      form.emoji.value ? { emoji: String(form.emoji.value).trim() } : {}
    );

    if (tagsRaw) metadata.tags = tagsRaw.split(',').map(function (tag) { return tag.trim(); }).filter(Boolean);
    else delete metadata.tags;

    // v13.6.3: gerenciar galeria de imagens. O editor mostra uma lista de URLs
    // (textarea com 1 URL por linha). O admin pode remover URLs existentes e/ou
    // adicionar novas (após upload pro Storage). A primeira URL vira o cover
    // (image_url top-level) para o card do feed.
    var galleryRaw = String((form.gallery && form.gallery.value) || '').trim();
    var galleryUrls = galleryRaw
      ? galleryRaw.split(/\r?\n/).map(function (u) { return String(u || '').trim(); }).filter(function (u) { return /^https?:\/\//i.test(u); })
      : [];

    if (galleryUrls.length) {
      metadata.gallery_image_urls = galleryUrls;
      metadata.gallery_count = galleryUrls.length;
    } else {
      delete metadata.gallery_image_urls;
      delete metadata.gallery_count;
    }

    var payload = {
      title: String(form.title.value || '').trim(),
      description: String(form.description.value || '').trim(),
      module: String(form.module.value || '').trim(),
      category: String(form.category.value || '').trim(),
      location: String(form.location.value || '').trim(),
      price: String(form.price.value || '').trim(),
      metadata: metadata,
    };

    // v13.6.3: passar `imagens` (top-level) também — isso faz o write-adapter
    // sincronizar post_media + atualizar image_url/cover_url via updatePostCoverImage.
    // Sem isso, image_url top-level fica stale e o feed mostra capa antiga.
    if (galleryUrls.length) {
      payload.imagens = galleryUrls;
    }

    return payload;
  }

  function resolveCurrentUser(context, fallbackUser) {
    if (context && typeof context.getCurrentUser === 'function') {
      try {
        return context.getCurrentUser() || fallbackUser || null;
      } catch (_) {
        return fallbackUser || null;
      }
    }
    return fallbackUser || null;
  }

  function buildEditUI(context) {
    var liveContext = context || {};
    var overlay = document.createElement('div');
    var modal = document.createElement('div');
    var closeBtn;
    var cancelBtn;
    var saveBtn;
    var status;
    var form;
    var editingPost = null;

    overlay.className = 'kc-modal-overlay';
    overlay.style.display = 'none';

    modal.className = 'kc-create-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = [
      '<div class="kc-create-modal-header">',
      '  <h2 class="kc-create-modal-title">Editar publica\u00E7\u00E3o</h2>',
      '  <button type="button" class="kc-modal-close" aria-label="Fechar">\u00D7</button>',
      '</div>',
      '<div class="kc-create-modal-body">',
      '  <div class="kc-form-group"><label>T\u00EDtulo</label><input class="kc-input" name="title" /></div>',
      '  <div class="kc-form-group"><label>Descri\u00E7\u00E3o</label><textarea class="kc-input" name="description" rows="4"></textarea></div>',
      '  <div class="kc-form-group"><label>Pre\u00E7o</label><input class="kc-input" name="price" placeholder="Ex.: 99,90" /></div>',
      '  <div class="kc-form-group"><label>Localiza\u00E7\u00E3o</label><input class="kc-input" name="location" /></div>',
      '  <div class="kc-form-group"><label>M\u00F3dulo</label><input class="kc-input" name="module" /></div>',
      '  <div class="kc-form-group"><label>Categoria</label><input class="kc-input" name="category" /></div>',
      '  <div class="kc-form-group"><label>Subcategoria</label><input class="kc-input" name="subcategory" /></div>',
      '  <div class="kc-form-group"><label>Condi\u00E7\u00E3o</label><input class="kc-input" name="condition" /></div>',
      '  <div class="kc-form-group"><label>Emoji</label><input class="kc-input" name="emoji" maxlength="4" /></div>',
      '  <div class="kc-form-group"><label>Tags (v\u00EDrgula)</label><input class="kc-input" name="tags" /></div>',
      // v13.6.3: galeria de imagens — uma URL por linha. A 1ª vira cover.
      '  <div class="kc-form-group">',
      '    <label>Galeria de imagens <span style="color:var(--text-muted, #64748b);font-size:.85em;">(1 URL por linha — a 1ª \u00E9 a capa)</span></label>',
      '    <textarea class="kc-input" name="gallery" rows="6" placeholder="https://... (1 URL por linha)"></textarea>',
      '    <small style="color:var(--text-muted, #64748b);">At\u00E9 12 imagens. Fa\u00E7a upload no Supabase Storage (bucket <code>kino-media</code>) e cole as URLs p\u00FAblicas aqui.</small>',
      '  </div>',
      '  <div class="kc-create-actions">',
      '    <button type="button" class="kc-btn-secondary" data-action="cancel">Cancelar</button>',
      '    <button type="button" class="kc-btn-primary" data-action="save">Salvar</button>',
      '  </div>',
      '  <div data-role="status" style="margin-top:8px;color:var(--text-muted, #64748b);"></div>',
      '</div>'
    ].join('');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    closeBtn = modal.querySelector('.kc-modal-close');
    cancelBtn = modal.querySelector('[data-action="cancel"]');
    saveBtn = modal.querySelector('[data-action="save"]');
    status = modal.querySelector('[data-role="status"]');

    form = {
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
      gallery: modal.querySelector('[name="gallery"]'),
    };

    function setContext(nextContext) {
      liveContext = nextContext || {};
    }

    function close() {
      overlay.style.display = 'none';
      status.textContent = '';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    function open(post) {
      var md;
      var tags;
      var gallery;

      editingPost = post;
      md = (post && post.metadata && typeof post.metadata === 'object') ? post.metadata : {};
      form.title.value = post.titulo || post.title || '';
      form.description.value = post.descricao || post.description || '';
      form.price.value = (post.preco != null) ? String(post.preco) : '';
      form.location.value = post.location || '';
      form.module.value = post.modulo || post.module || '';
      form.category.value = post.category || post.categoria || '';
      form.subcategory.value = post.subcategoria || md.subcategory || '';
      form.condition.value = post.condicao || md.condicao || '';
      form.emoji.value = post.emoji || md.emoji || '';
      tags = Array.isArray(post.tags) ? post.tags : (Array.isArray(md.tags) ? md.tags : []);
      form.tags.value = tags.join(', ');

      // v13.6.3: popular galeria de imagens. Prioridade: post.imagens (normalizado) > metadata.gallery_image_urls.
      // O admin pode editar livremente (1 URL por linha) — a 1ª vira a capa.
      gallery = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(md.gallery_image_urls) ? md.gallery_image_urls : []);
      if (form.gallery) {
        form.gallery.value = (gallery || []).filter(function(u){ return u && /^https?:\/\//i.test(u); }).join('\n');
      }

      overlay.style.display = 'flex';
      try { form.title.focus(); } catch (_) { }
    }

    async function save() {
      var viewer = resolveCurrentUser(liveContext, null);
      var payload;
      var res = null;
      var next;
      var msg;

      if (!editingPost || !canManagePost(editingPost, viewer, liveContext)) {
        status.textContent = 'Voc\u00EA n\u00E3o tem permiss\u00E3o para editar esta publica\u00E7\u00E3o.';
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      status.textContent = 'Salvando...';

      payload = buildEditPayload(form, editingPost);
      try {
        if (window.KCAPI && typeof window.KCAPI.updatePost === 'function') {
          res = await window.KCAPI.updatePost(getPostIdForMutation(editingPost), payload);
        }
      } catch (_) { }

      if (res && res.ok && res.data) {
        next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(res.data, { pageModule: (res.data && res.data.modulo) || '', view: 'product' })
          : res.data;
        if (liveContext && typeof liveContext.renderPost === 'function') {
          liveContext.renderPost(next);
        }
        clearPostSessionCaches();
        toast('Publica\u00E7\u00E3o atualizada com sucesso.', 'success', 2000);
        close();
        return;
      }

      msg = (res && res.error && res.error.message) ? String(res.error.message) : 'N\u00E3o foi poss\u00EDvel atualizar a publica\u00E7\u00E3o.';
      status.textContent = msg;
      toast(msg, 'error', 2400);
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    saveBtn.addEventListener('click', save);

    return { open: open, close: close, setContext: setContext };
  }

  function upsertOwnerActions(post, user, context) {
    var actions = document.querySelector('.kc-product-actions');
    var canManage;
    var adminManaging;
    var existing;
    var wrap;
    var editBtn;
    var postStatus;
    var isHidden;
    var isExpired;
    var isPublished;
    var isPending;
    var isClosed;
    var toggleBtn;
    var renewBtn;
    var bumpBtn;
    var closeBtn;
    var deleteBtn;
    var ownerStatusBadge;
    var reportBtn;

    function appendVisibleAction(btn) {
      if (!btn || btn.style.display === 'none') return;
      wrap.appendChild(btn);
    }

    if (!actions) return;

    canManage = canManagePost(post, user, context);
    adminManaging = isAdminManagingPost(post, user, context);
    existing = document.getElementById('ownerActionsWrap');
    if (existing) existing.remove();
    if (!canManage) return;

    wrap = document.createElement('div');
    wrap.id = 'ownerActionsWrap';
    wrap.className = 'kc-owner-actions-grid';
    wrap.dataset.kcAdminManaging = adminManaging ? '1' : '0';
    wrap.style.cssText = 'display:contents;';

    editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'kc-btn-secondary';
    editBtn.id = 'editPostButton';
    editBtn.innerHTML = '<i class="fas fa-pen"></i> Editar';

    postStatus = String((post && (post.status || post.estado)) || 'published').toLowerCase();
    isHidden = postStatus === 'hidden';
    isExpired = postStatus === 'expired';
    isPublished = postStatus === 'published';
    isPending = postStatus === 'pending';
    isClosed = postStatus === 'closed';

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'kc-btn-secondary';
    toggleBtn.id = 'togglePostStatusButton';
    toggleBtn.setAttribute('data-post-status', postStatus);
    if (isExpired || isPending || isClosed) {
      toggleBtn.style.display = 'none';
    } else {
      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-eye"></i> Reativar an\u00FAncio'
        : '<i class="fas fa-eye-slash"></i> Desabilitar an\u00FAncio';
    }

    renewBtn = document.createElement('button');
    renewBtn.type = 'button';
    renewBtn.className = 'kc-btn-secondary';
    renewBtn.id = 'renewPostButton';
    renewBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Renovar publica\u00E7\u00E3o';
    renewBtn.style.display = (isExpired || isHidden) && !isClosed ? '' : 'none';

    bumpBtn = document.createElement('button');
    bumpBtn.type = 'button';
    bumpBtn.className = 'kc-btn-secondary';
    bumpBtn.id = 'bumpPostButton';

    (function () {
      var bumpedAt = post && (post.bumped_at || post.bumpedAt);
      var bumpCooldownMs = 1 * 24 * 60 * 60 * 1000;
      var bumpReady = adminManaging || !bumpedAt || (Date.now() - new Date(bumpedAt).getTime() >= bumpCooldownMs);
      bumpBtn.style.display = isPublished && !isClosed ? '' : 'none';
      if (bumpReady) {
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
      } else {
        var nextBump = new Date(new Date(bumpedAt).getTime() + bumpCooldownMs);
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
        bumpBtn.title = 'Pr\u00F3ximo impulso dispon\u00EDvel em ' + nextBump.toLocaleDateString('pt-BR');
        bumpBtn.disabled = true;
        bumpBtn.style.opacity = '0.55';
      }
    })();

    deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kc-btn-secondary';
    deleteBtn.id = 'deletePostButton';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kc-btn-secondary';
    closeBtn.id = 'closePostButton';
    closeBtn.innerHTML = isClosed
      ? '<i class="fas fa-unlock" aria-hidden="true"></i> Reativar'
      : '<i class="fas fa-lock" aria-hidden="true"></i> Encerrar';
    closeBtn.style.display = (!isPending && postStatus !== 'deleted') ? '' : 'none';

    ownerStatusBadge = document.getElementById('ownerStatusBadge');
    if (ownerStatusBadge) ownerStatusBadge.remove();

    if (isPending) {
      (function () {
        var badge = document.createElement('div');
        var details = document.querySelector('.kc-product-details');
        badge.id = 'ownerStatusBadge';
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.3);color:#93c5fd;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-clock"></i><span>Esta publica\u00E7\u00E3o est\u00E1 <strong>em an\u00E1lise</strong> pela modera\u00E7\u00E3o e ainda n\u00E3o aparece nos feeds. ' + (adminManaging ? 'Voc\u00EA est\u00E1 gerenciando como administrador.' : 'Voc\u00EA ser\u00E1 notificado quando for aprovada.') + '</span>';
        if (details) details.insertAdjacentElement('afterbegin', badge);
      })();
    } else if (isClosed) {
      (function () {
        if (document.getElementById('kcClosedStatusNote')) return;
        var badge = document.createElement('div');
        var details = document.querySelector('.kc-product-details');
        badge.id = 'ownerStatusBadge';
        badge.className = 'kc-product-status-note kc-product-status-note--closed';
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(148,163,184,.14);border:1px solid rgba(148,163,184,.35);color:#cbd5e1;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i><span>' + getClosedLabel(post) + ': continua vis\u00EDvel como hist\u00F3rico, mas n\u00E3o est\u00E1 ativa. Use Reativar para desfazer o encerramento.</span>';
        if (details) details.insertAdjacentElement('afterbegin', badge);
      })();
    } else if (isHidden || isExpired) {
      (function () {
        var badge = document.createElement('div');
        var details = document.querySelector('.kc-product-details');
        badge.id = 'ownerStatusBadge';
        if (isExpired) {
          var expiresAt = post && (post.expires_at || post.expiresAt);
          var expiryStr = expiresAt ? ' em ' + new Date(expiresAt).toLocaleDateString('pt-BR') : '';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(244,67,54,.10);border:1px solid rgba(244,67,54,.30);color:#ef9a9a;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-calendar-xmark"></i><span>Este an\u00FAncio <strong>expirou</strong>' + expiryStr + ' e n\u00E3o aparece nos feeds. Renove-o para voltar a aparecer.</span>';
        } else {
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este an\u00FAncio est\u00E1 <strong>desabilitado</strong> e n\u00E3o aparece nos feeds. ' + (adminManaging ? 'Autores e administradores conseguem acessar esta p\u00E1gina.' : 'Apenas voc\u00EA consegue ver esta p\u00E1gina.') + '</span>';
        }
        if (details) details.insertAdjacentElement('afterbegin', badge);
      })();
    } else if (isPublished) {
      (function () {
        var expiresAt = post && (post.expires_at || post.expiresAt);
        if (!expiresAt) return;
        var daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
        var badge;
        var details;
        if (daysLeft > 5 || daysLeft < 0) return;
        badge = document.createElement('div');
        details = document.querySelector('.kc-product-details');
        badge.id = 'ownerStatusBadge';
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.35);color:#ffc107;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-clock"></i><span>Seu an\u00FAncio <strong>expira em ' + daysLeft + (daysLeft === 1 ? ' dia' : ' dias') + '</strong>. Renove-o para continuar aparecendo nos feeds.</span>';
        if (details) details.insertAdjacentElement('afterbegin', badge);
      })();
    }

    appendVisibleAction(editBtn);
    appendVisibleAction(bumpBtn);
    appendVisibleAction(renewBtn);
    appendVisibleAction(toggleBtn);
    appendVisibleAction(closeBtn);
    appendVisibleAction(deleteBtn);

    reportBtn = document.getElementById('reportButton');
    if (reportBtn && reportBtn.parentNode === actions) actions.insertBefore(wrap, reportBtn);
    else actions.appendChild(wrap);

    editBtn.addEventListener('click', function () {
      if (typeof window.kcOpenEditPostModal === 'function') {
        window.kcOpenEditPostModal(post, async function (updatedData) {
          var next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(updatedData, { pageModule: updatedData.modulo || '', view: 'product' })
            : updatedData;
          if (context && typeof context.renderPost === 'function') {
            context.renderPost(next);
          }
          clearPostSessionCaches();
          markPostAsEdited();
        });
        return;
      }

      if (!editUI) {
        editUI = buildEditUI(context);
      } else if (typeof editUI.setContext === 'function') {
        editUI.setContext(context);
      }
      editUI.open(post);
    });

    deleteBtn.addEventListener('click', async function () {
      var confirmed = window.confirm('Tem certeza que deseja excluir esta publica\u00E7\u00E3o?');
      var res = null;
      var msg;
      if (!confirmed) return;

      try {
        if (window.KCAPI && typeof window.KCAPI.deletePost === 'function') {
          res = await window.KCAPI.deletePost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        clearPostSessionCaches();
        toast('Publica\u00E7\u00E3o exclu\u00EDda com sucesso.', 'success', 2000);
        setTimeout(function () { window.location.href = 'index.html'; }, 300);
        return;
      }

      msg = (res && res.error && res.error.message) ? String(res.error.message) : 'N\u00E3o foi poss\u00EDvel excluir a publica\u00E7\u00E3o.';
      toast(msg, 'error', 2800);
    });

    toggleBtn.addEventListener('click', async function () {
      var prevHTML;
      var res = null;
      var result;
      var newStatus;
      var nowHidden;
      var existingBadge;
      var toastMsg;
      var errMsg;

      if (toggleBtn.disabled) return;
      toggleBtn.disabled = true;
      prevHTML = toggleBtn.innerHTML;
      toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Aguarde...';

      try {
        if (window.KCAPI && typeof window.KCAPI.togglePostStatus === 'function') {
          res = await window.KCAPI.togglePostStatus(getPostIdForMutation(post));
        }
      } catch (_) { }

      toggleBtn.disabled = false;

      if (res && res._kcError === 'POST_LIMIT_REACHED') {
        toggleBtn.innerHTML = prevHTML;
        toast(res.message || 'Voc\u00EA atingiu o limite de publica\u00E7\u00F5es ativas. Desabilite outra publica\u00E7\u00E3o antes de reativar esta.', 'error', 4000);
        return;
      }

      if (res && (res.ok || res.data)) {
        result = res.data || res;
        newStatus = String(result.new_status || result.status || '').toLowerCase();
        nowHidden = newStatus === 'hidden' || newStatus === 'desabilitado';

        toggleBtn.setAttribute('data-post-status', nowHidden ? 'hidden' : 'published');
        toggleBtn.innerHTML = nowHidden
          ? '<i class="fas fa-eye"></i> Reativar an\u00FAncio'
          : '<i class="fas fa-eye-slash"></i> Desabilitar an\u00FAncio';

        post.status = nowHidden ? 'hidden' : 'published';
        post.estado = post.status;
        clearPostSessionCaches();

        existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        if (nowHidden) {
          var badge = document.createElement('div');
          var details = document.querySelector('.kc-product-details');
          badge.id = 'ownerStatusBadge';
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este an\u00FAncio est\u00E1 <strong>desabilitado</strong> e n\u00E3o aparece nos feeds. ' + (adminManaging ? 'Autores e administradores conseguem acessar esta p\u00E1gina.' : 'Apenas voc\u00EA consegue ver esta p\u00E1gina.') + '</span>';
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }

        toastMsg = nowHidden ? 'An\u00FAncio desabilitado com sucesso.' : 'An\u00FAncio reativado com sucesso.';
        toast(toastMsg, 'success', 2500);
        return;
      }

      toggleBtn.innerHTML = prevHTML;
      errMsg = (res && res.error && res.error.message) ? String(res.error.message) : 'N\u00E3o foi poss\u00EDvel alterar o status do an\u00FAncio.';
      toast(errMsg, 'error', 2800);
    });

    closeBtn.addEventListener('click', async function () {
      var confirmed;
      var prevHTML;
      var res = null;
      var next;
      var msg;
      var isReactivation;

      if (closeBtn.disabled) return;
      isReactivation = String((post && (post.status || post.estado)) || postStatus || '').toLowerCase() === 'closed';
      confirmed = window.confirm(isReactivation
        ? 'Reativar esta publica\u00E7\u00E3o? Ela voltar\u00E1 a ficar ativa nos feeds.'
        : 'Encerrar esta publica\u00E7\u00E3o? Ela continuar\u00E1 vis\u00EDvel como hist\u00F3rico, mas n\u00E3o ficar\u00E1 ativa no feed.');
      if (!confirmed) return;

      closeBtn.disabled = true;
      prevHTML = closeBtn.innerHTML;
      closeBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' + (isReactivation ? 'Reativando...' : 'Encerrando...');

      try {
        if (isReactivation && window.KCAPI && typeof window.KCAPI.reactivatePost === 'function') {
          res = await window.KCAPI.reactivatePost(getPostIdForMutation(post));
        } else if (!isReactivation && window.KCAPI && typeof window.KCAPI.closePost === 'function') {
          res = await window.KCAPI.closePost(getPostIdForMutation(post), { reason: adminManaging ? 'admin_closed' : 'owner_closed' });
        }
      } catch (_) { }

      closeBtn.disabled = false;

      if (res && res.ok) {
        if (isReactivation) {
          post.status = 'published';
          post.estado = 'published';
          post.isClosed = false;
          post.expires_at = res.expires_at || post.expires_at || null;
          post.expiresAt = post.expires_at;
        } else {
          post.status = 'closed';
          post.estado = 'closed';
          post.isClosed = true;
          post.effective_at = post.effective_at || post.bumped_at || post.created_at || post.createdAt || null;
          post.effectiveAt = post.effectiveAt || post.effective_at;
        }
        clearPostSessionCaches();
        toast(res.message || (isReactivation ? 'Publica\u00E7\u00E3o reativada com sucesso.' : 'Publica\u00E7\u00E3o encerrada.'), 'success', 2400);
        if (context && typeof context.renderPost === 'function') {
          next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(post, { pageModule: post.modulo || post.module || '', view: 'product' })
            : post;
          context.renderPost(next);
        }
        return;
      }

      closeBtn.innerHTML = prevHTML;
      msg = (res && (res.message || (res.error && res.error.message)))
        ? String(res.message || res.error.message)
        : (isReactivation ? 'N\u00E3o foi poss\u00EDvel reativar a publica\u00E7\u00E3o.' : 'N\u00E3o foi poss\u00EDvel encerrar a publica\u00E7\u00E3o.');
      toast(msg, 'error', 2800);
    });

    renewBtn.addEventListener('click', async function () {
      var prevHTML;
      var res = null;
      var existingBadge;
      var msg;

      if (renewBtn.disabled) return;
      renewBtn.disabled = true;
      prevHTML = renewBtn.innerHTML;
      renewBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Renovando...';

      try {
        if (window.KCAPI && typeof window.KCAPI.renewPost === 'function') {
          res = await window.KCAPI.renewPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      renewBtn.disabled = false;

      if (res && (res._kcError === 'POST_LIMIT_REACHED' || res.code === 'LIMIT_REACHED')) {
        renewBtn.innerHTML = prevHTML;
        toast(res.message || 'Limite de publica\u00E7\u00F5es ativas atingido.', 'error', 4500);
        return;
      }

      if (res && res.ok) {
        post.status = 'published';
        post.estado = 'published';
        post.isClosed = false;
        renewBtn.style.display = 'none';
        toggleBtn.style.display = '';
        toggleBtn.setAttribute('data-post-status', 'published');
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Desabilitar an\u00FAncio';
        bumpBtn.style.display = '';
        existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        clearPostSessionCaches();
        toast(res.message || 'Publica\u00E7\u00E3o renovada. Dispon\u00EDvel por mais 30 dias.', 'success', 3000);
        return;
      }

      renewBtn.innerHTML = prevHTML;
      msg = (res && res.message) || (res && res.error && res.error.message) || 'N\u00E3o foi poss\u00EDvel renovar a publica\u00E7\u00E3o.';
      toast(msg, 'error', 2800);
    });

    bumpBtn.addEventListener('click', async function () {
      var prevHTML;
      var res = null;
      var msg;

      if (bumpBtn.disabled) return;
      bumpBtn.disabled = true;
      prevHTML = bumpBtn.innerHTML;
      bumpBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Impulsionando...';

      try {
        if (window.KCAPI && typeof window.KCAPI.bumpPost === 'function') {
          res = await window.KCAPI.bumpPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        bumpBtn.disabled = true;
        bumpBtn.style.opacity = '0.55';
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionado!';
        post.bumped_at = (res && res.bumped_at) || new Date().toISOString();
        post.bumpedAt = post.bumped_at;
        post.effective_at = post.bumped_at;
        post.effectiveAt = post.bumped_at;
        clearPostSessionCaches();
        toast(res.message || 'An\u00FAncio impulsionado com sucesso.', 'success', 3000);
        return;
      }

      bumpBtn.disabled = false;
      bumpBtn.style.opacity = '';
      bumpBtn.innerHTML = prevHTML;
      msg = (res && res.message) || (res && res.error && res.error.message) || 'N\u00E3o foi poss\u00EDvel impulsionar agora.';
      toast(msg, res && res.code === 'COOLDOWN_ACTIVE' ? 'warn' : 'error', 3500);
    });
  }

  window._KCProduct.edit = {
    upsertOwnerActions: upsertOwnerActions,
  };
})();
