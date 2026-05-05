/**
 * @file product.edit.js
 * @description Sub-modulo de owner actions e edicao da pagina de produto (v11.30.15)
 * Extraido de product.controller.js. Registra window._KCProduct.edit.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCAPI       - updatePost, deletePost, togglePostStatus, renewPost, bumpPost
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

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function clearPostSessionCaches() {
    var store = window.KCSessionStore;
    if (!store || typeof store.clearPrefix !== 'function') return;
    try { store.clearPrefix('feeds', ''); } catch (_) { }
    try { store.clearPrefix('my-posts', ''); } catch (_) { }
    try { store.clearPrefix('profile-posts', ''); } catch (_) { }
  }

  function getClosedLabel(post) {
    var moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    if (moduleKey === 'eventos') return 'Evento encerrado';
    if (moduleKey === 'caronas') return 'Carona encerrada';
    if (moduleKey === 'compra-venda') return 'Anuncio encerrado';
    return 'Publicacao encerrada';
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

    return {
      title: String(form.title.value || '').trim(),
      description: String(form.description.value || '').trim(),
      module: String(form.module.value || '').trim(),
      category: String(form.category.value || '').trim(),
      location: String(form.location.value || '').trim(),
      price: String(form.price.value || '').trim(),
      metadata: metadata,
    };
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

      overlay.style.display = 'flex';
      try { form.title.focus(); } catch (_) { }
    }

    async function save() {
      var viewer = resolveCurrentUser(liveContext, null);
      var payload;
      var res = null;
      var next;
      var msg;

      if (!editingPost || !isAuthor(editingPost, viewer)) {
        status.textContent = 'Voce nao tem permissao para editar este post.';
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
        toast('Publicacao atualizada com sucesso.', 'success', 2000);
        close();
        return;
      }

      msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Nao foi possivel atualizar a publicacao.';
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

    if (!actions) return;

    canManage = isAuthor(post, user);
    existing = document.getElementById('ownerActionsWrap');
    if (existing) existing.remove();
    if (!canManage) return;

    wrap = document.createElement('div');
    wrap.id = 'ownerActionsWrap';
    wrap.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;';

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
        ? '<i class="fas fa-eye"></i> Reativar anuncio'
        : '<i class="fas fa-eye-slash"></i> Desabilitar anuncio';
    }

    renewBtn = document.createElement('button');
    renewBtn.type = 'button';
    renewBtn.className = 'kc-btn-secondary';
    renewBtn.id = 'renewPostButton';
    renewBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Renovar publicacao';
    renewBtn.style.display = (isExpired || isHidden) && !isClosed ? '' : 'none';

    bumpBtn = document.createElement('button');
    bumpBtn.type = 'button';
    bumpBtn.className = 'kc-btn-secondary';
    bumpBtn.id = 'bumpPostButton';

    (function () {
      var bumpedAt = post && (post.bumped_at || post.bumpedAt);
      var bumpCooldownMs = 1 * 24 * 60 * 60 * 1000;
      var bumpReady = !bumpedAt || (Date.now() - new Date(bumpedAt).getTime() >= bumpCooldownMs);
      bumpBtn.style.display = isPublished && !isClosed ? '' : 'none';
      if (bumpReady) {
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
      } else {
        var nextBump = new Date(new Date(bumpedAt).getTime() + bumpCooldownMs);
        bumpBtn.innerHTML = '<i class="fas fa-rocket"></i> Impulsionar hoje';
        bumpBtn.title = 'Proximo impulso disponivel em ' + nextBump.toLocaleDateString('pt-BR');
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
    closeBtn.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i> Encerrar';
    closeBtn.style.display = (!isPending && !isClosed && postStatus !== 'deleted') ? '' : 'none';

    ownerStatusBadge = document.getElementById('ownerStatusBadge');
    if (ownerStatusBadge) ownerStatusBadge.remove();

    if (isPending) {
      (function () {
        var badge = document.createElement('div');
        var details = document.querySelector('.kc-product-details');
        badge.id = 'ownerStatusBadge';
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.3);color:#93c5fd;font-size:.9em;margin-bottom:12px;';
        badge.innerHTML = '<i class="fas fa-clock"></i><span>Esta publicacao esta <strong>em analise</strong> pela moderacao e nao aparece nos feeds ainda. Voce sera notificado quando for aprovada.</span>';
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
        badge.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i><span>' + getClosedLabel(post) + ': ela continua no feed como historico, mas nao fica ativa.</span>';
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
          badge.innerHTML = '<i class="fas fa-calendar-xmark"></i><span>Este anuncio <strong>expirou</strong>' + expiryStr + ' e nao aparece nos feeds. Renove-o para voltar a aparecer.</span>';
        } else {
          badge.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:rgba(239,108,0,.12);border:1px solid rgba(239,108,0,.3);color:#ef6c00;font-size:.9em;margin-bottom:12px;';
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anuncio esta <strong>desabilitado</strong> e nao aparece nos feeds. Apenas voce consegue ver esta pagina.</span>';
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
        badge.innerHTML = '<i class="fas fa-clock"></i><span>Seu anuncio <strong>expira em ' + daysLeft + (daysLeft === 1 ? ' dia' : ' dias') + '</strong>. Renove-o para continuar aparecendo nos feeds.</span>';
        if (details) details.insertAdjacentElement('afterbegin', badge);
      })();
    }

    wrap.appendChild(editBtn);
    wrap.appendChild(bumpBtn);
    wrap.appendChild(renewBtn);
    wrap.appendChild(toggleBtn);
    wrap.appendChild(closeBtn);
    wrap.appendChild(deleteBtn);

    reportBtn = document.getElementById('reportButton');
    if (reportBtn && reportBtn.parentNode === actions) actions.insertBefore(wrap, reportBtn);
    else actions.appendChild(wrap);

    editBtn.addEventListener('click', function () {
      if (typeof window.kcOpenEditPostModal === 'function') {
        window.kcOpenEditPostModal(post, async function (updatedData) {
          var next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(updatedData, { pageModule: updatedData.modulo || '', view: 'product' })
            : updatedData;
          var viewer = resolveCurrentUser(context, user);
          if (context && typeof context.renderPost === 'function') {
            context.renderPost(next);
          }
          markPostAsEdited();
          try {
            var client = window.KCSupabase && window.KCSupabase.getClient ? window.KCSupabase.getClient() : null;
            var uid = viewer && viewer.id;
            if (client && uid) {
              await client.from('audit_log').insert({
                action: 'post_edited',
                entity_type: 'posts',
                entity_id: String(post.uuid || post.id || ''),
                actor_id: uid,
              });
            }
          } catch (_) { }
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
      var confirmed = window.confirm('Tem certeza que deseja excluir esta publicacao?');
      var res = null;
      var msg;
      if (!confirmed) return;

      try {
        if (window.KCAPI && typeof window.KCAPI.deletePost === 'function') {
          res = await window.KCAPI.deletePost(getPostIdForMutation(post));
        }
      } catch (_) { }

      if (res && res.ok) {
        toast('Publicacao excluida com sucesso.', 'success', 2000);
        setTimeout(function () { window.location.href = 'index.html'; }, 300);
        return;
      }

      msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Nao foi possivel excluir a publicacao.';
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
      toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';

      try {
        if (window.KCAPI && typeof window.KCAPI.togglePostStatus === 'function') {
          res = await window.KCAPI.togglePostStatus(getPostIdForMutation(post));
        }
      } catch (_) { }

      toggleBtn.disabled = false;

      if (res && res._kcError === 'POST_LIMIT_REACHED') {
        toggleBtn.innerHTML = prevHTML;
        toast(res.message || 'Voce atingiu o limite de publicacoes ativas. Desabilite outra publicacao antes de reativar esta.', 'error', 4000);
        return;
      }

      if (res && (res.ok || res.data)) {
        result = res.data || res;
        newStatus = String(result.new_status || result.status || '').toLowerCase();
        nowHidden = newStatus === 'hidden' || newStatus === 'desabilitado';

        toggleBtn.setAttribute('data-post-status', nowHidden ? 'hidden' : 'published');
        toggleBtn.innerHTML = nowHidden
          ? '<i class="fas fa-eye"></i> Reativar anuncio'
          : '<i class="fas fa-eye-slash"></i> Desabilitar anuncio';

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
          badge.innerHTML = '<i class="fas fa-eye-slash"></i><span>Este anuncio esta <strong>desabilitado</strong> e nao aparece nos feeds. Apenas voce consegue ver esta pagina.</span>';
          if (details) details.insertAdjacentElement('afterbegin', badge);
        }

        toastMsg = nowHidden ? 'Anuncio desabilitado com sucesso.' : 'Anuncio reativado com sucesso.';
        toast(toastMsg, 'success', 2500);
        return;
      }

      toggleBtn.innerHTML = prevHTML;
      errMsg = (res && res.error && res.error.message) ? String(res.error.message) : 'Nao foi possivel alterar o status do anuncio.';
      toast(errMsg, 'error', 2800);
    });

    closeBtn.addEventListener('click', async function () {
      var confirmed;
      var prevHTML;
      var res = null;
      var next;
      var msg;

      if (closeBtn.disabled) return;
      confirmed = window.confirm('Encerrar esta publicacao? Ela continuara visivel como historico, mas nao ficara ativa no feed.');
      if (!confirmed) return;

      closeBtn.disabled = true;
      prevHTML = closeBtn.innerHTML;
      closeBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Encerrando...';

      try {
        if (window.KCAPI && typeof window.KCAPI.closePost === 'function') {
          res = await window.KCAPI.closePost(getPostIdForMutation(post), { reason: 'owner_closed' });
        }
      } catch (_) { }

      closeBtn.disabled = false;

      if (res && res.ok) {
        post.status = 'closed';
        post.estado = 'closed';
        post.isClosed = true;
        post.effective_at = post.effective_at || post.bumped_at || post.created_at || post.createdAt || null;
        post.effectiveAt = post.effectiveAt || post.effective_at;
        clearPostSessionCaches();
        toast(res.message || 'Publicacao encerrada.', 'success', 2400);
        if (context && typeof context.renderPost === 'function') {
          next = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
            ? window.KCPostModel.from(post, { pageModule: post.modulo || post.module || '', view: 'product' })
            : post;
          context.renderPost(next);
        }
        return;
      }

      closeBtn.innerHTML = prevHTML;
      msg = (res && (res.message || (res.error && res.error.message))) ? String(res.message || res.error.message) : 'Nao foi possivel encerrar a publicacao.';
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
      renewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Renovando...';

      try {
        if (window.KCAPI && typeof window.KCAPI.renewPost === 'function') {
          res = await window.KCAPI.renewPost(getPostIdForMutation(post));
        }
      } catch (_) { }

      renewBtn.disabled = false;

      if (res && (res._kcError === 'POST_LIMIT_REACHED' || res.code === 'LIMIT_REACHED')) {
        renewBtn.innerHTML = prevHTML;
        toast(res.message || 'Limite de publicacoes ativas atingido.', 'error', 4500);
        return;
      }

      if (res && res.ok) {
        post.status = 'published';
        post.estado = 'published';
        post.isClosed = false;
        renewBtn.style.display = 'none';
        toggleBtn.style.display = '';
        toggleBtn.setAttribute('data-post-status', 'published');
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Desabilitar anuncio';
        bumpBtn.style.display = '';
        existingBadge = document.getElementById('ownerStatusBadge');
        if (existingBadge) existingBadge.remove();
        clearPostSessionCaches();
        toast(res.message || 'Publicacao renovada! Disponivel por mais 30 dias.', 'success', 3000);
        return;
      }

      renewBtn.innerHTML = prevHTML;
      msg = (res && res.message) || (res && res.error && res.error.message) || 'Nao foi possivel renovar a publicacao.';
      toast(msg, 'error', 2800);
    });

    bumpBtn.addEventListener('click', async function () {
      var prevHTML;
      var res = null;
      var msg;

      if (bumpBtn.disabled) return;
      bumpBtn.disabled = true;
      prevHTML = bumpBtn.innerHTML;
      bumpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Impulsionando...';

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
        toast(res.message || 'Anuncio impulsionado com sucesso!', 'success', 3000);
        return;
      }

      bumpBtn.disabled = false;
      bumpBtn.style.opacity = '';
      bumpBtn.innerHTML = prevHTML;
      msg = (res && res.message) || (res && res.error && res.error.message) || 'Nao foi possivel impulsionar agora.';
      toast(msg, res && res.code === 'COOLDOWN_ACTIVE' ? 'warn' : 'error', 3500);
    });
  }

  window._KCProduct.edit = {
    upsertOwnerActions: upsertOwnerActions,
  };
})();
