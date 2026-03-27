/* KinoCampus — my-posts.controller.js
   Página de gerenciamento de publicações do usuário.
*/

(function () {
  'use strict';

  // ─── Constantes ─────────────────────────────────────────────────────────────

  var MY_POSTS_MODULES = [
    { key: 'all',               label: 'Todos',            icon: 'fas fa-th-large',      emoji: '📋' },
    { key: 'compra-venda',      label: 'Compra e Venda',   icon: 'fas fa-shopping-bag',  emoji: '🛍️' },
    { key: 'eventos',           label: 'Eventos',          icon: 'fas fa-calendar',      emoji: '🎉' },
    { key: 'moradia',           label: 'Moradia',          icon: 'fas fa-home',          emoji: '🏠' },
    { key: 'caronas',           label: 'Caronas',          icon: 'fas fa-car',           emoji: '🚗' },
    { key: 'oportunidades',     label: 'Oportunidades',    icon: 'fas fa-briefcase',     emoji: '💼' },
    { key: 'achados-perdidos',  label: 'Achados/Perdidos', icon: 'fas fa-search',        emoji: '🔍' },
  ];

  var MODULE_MAP = {};
  MY_POSTS_MODULES.forEach(function (m) { MODULE_MAP[m.key] = m; });

  var STATUS_MAP = {
    published: { label: 'Ativo',     bg: 'rgba(83,214,129,.15)',  color: '#53d681', borderColor: 'rgba(83,214,129,.3)'  },
    hidden:    { label: 'Inativo',   bg: 'rgba(239,108,0,.12)',   color: '#ef6c00', borderColor: 'rgba(239,108,0,.3)'   },
    expired:   { label: 'Expirado',  bg: 'rgba(244,67,54,.10)',   color: '#ef9a9a', borderColor: 'rgba(244,67,54,.3)'   },
    deleted:   { label: 'Excluído',  bg: 'rgba(150,150,150,.12)', color: '#aaa',    borderColor: 'rgba(150,150,150,.25)' },
    pending:   { label: 'Pendente',  bg: 'rgba(255,193,7,.12)',   color: '#ffc107', borderColor: 'rgba(255,193,7,.3)'   },
  };

  // ─── Estado ──────────────────────────────────────────────────────────────────

  var state = {
    user: null,
    posts: [],
    activeModule: 'all',
    loading: false,
    saveTargetUuid: null,
  };

  // ─── Utilitários ─────────────────────────────────────────────────────────────

  function esc(str) {
    return typeof KCUtils !== 'undefined' && typeof KCUtils.escapeHtml === 'function'
      ? KCUtils.escapeHtml(String(str || ''))
      : String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function showToastMsg(msg, type, duration) {
    if (typeof showToast === 'function') { showToast(msg, type || 'info', duration || 2200); return; }
    console.info('[MyPosts]', msg);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return iso; }
  }

  function getModuleInfo(key) {
    return MODULE_MAP[key] || { key: key, label: key, icon: 'fas fa-tag', emoji: '📌' };
  }

  function getStatusInfo(status) {
    return STATUS_MAP[status] || STATUS_MAP['published'];
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────

  function waitForAuth(retries, delay) {
    retries = retries !== undefined ? retries : 4;
    delay = delay || 700;
    return new Promise(function (resolve) {
      function attempt(n) {
        var api = window.KCAPI;
        var kcSupa = window.KCSupabase;
        if (api && typeof api.getCurrentUser === 'function') {
          api.getCurrentUser().then(function (user) {
            resolve(user || null);
          }).catch(function () { resolve(null); });
          return;
        }
        if (kcSupa && typeof kcSupa.getUser === 'function') {
          var u = kcSupa.getUser();
          resolve(u || null);
          return;
        }
        if (n > 0) {
          setTimeout(function () { attempt(n - 1); }, delay);
        } else {
          resolve(null);
        }
      }
      attempt(retries);
    });
  }

  // ─── Inicialização ───────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('DOMContentLoaded', function () {
      setLoading(true);

      waitForAuth().then(function (user) {
        state.user = user;

        if (!user) {
          setLoading(false);
          showAuthNotice();
          return;
        }

        var api = window.KCAPI;
        if (!api || !api.ENV || api.ENV.driver !== 'supabase') {
          setLoading(false);
          showLocalNotice();
          return;
        }

        loadAllMyPosts();
      });

      wireSavePopover();
    });
  }

  // ─── Carregamento de dados ───────────────────────────────────────────────────

  function loadAllMyPosts() {
    setLoading(true);
    var api = window.KCAPI;
    api.getMyPosts({ limit: 100 }).then(function (posts) {
      state.posts = Array.isArray(posts) ? posts : [];
      setLoading(false);
      renderTabs();
      renderPostsList(state.activeModule);
    }).catch(function (err) {
      console.error('[MyPosts] Erro ao carregar posts:', err);
      setLoading(false);
      showToastMsg('Não foi possível carregar suas publicações.', 'error');
    });
  }

  function reloadPosts() {
    loadAllMyPosts();
  }

  // ─── Renderização de Tabs ────────────────────────────────────────────────────

  function renderTabs() {
    var tabRow = $('myPostsTabRow');
    if (!tabRow) return;

    var moduleCounts = {};
    state.posts.forEach(function (p) {
      var mod = (p.module || p.modulo || '').toLowerCase().trim();
      if (mod) moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
    });
    moduleCounts['all'] = state.posts.length;

    tabRow.innerHTML = MY_POSTS_MODULES.filter(function (m) {
      return m.key === 'all' || moduleCounts[m.key] > 0;
    }).map(function (m) {
      var count = moduleCounts[m.key] || 0;
      var isActive = m.key === state.activeModule;
      return '<button type="button" class="kc-my-posts-tab' + (isActive ? ' active' : '') + '" data-module="' + esc(m.key) + '" aria-selected="' + (isActive ? 'true' : 'false') + '">' +
        '<i class="' + esc(m.icon) + '"></i> ' + esc(m.label) +
        (count > 0 ? ' <span class="kc-tab-badge">' + count + '</span>' : '') +
        '</button>';
    }).join('');

    // Listener de tabs (uma vez)
    if (!tabRow._kcTabsListenerAttached) {
      tabRow._kcTabsListenerAttached = true;
      tabRow.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-module]');
        if (!btn) return;
        state.activeModule = btn.dataset.module;
        renderTabs();
        renderPostsList(state.activeModule);
      });
    }

    tabRow.style.display = 'flex';
  }

  // ─── Renderização de Posts ───────────────────────────────────────────────────

  function renderPostsList(moduleKey) {
    var list = $('myPostsList');
    var empty = $('myPostsEmpty');
    var emptyTitle = $('myPostsEmptyTitle');
    if (!list) return;

    var filtered = moduleKey === 'all'
      ? state.posts
      : state.posts.filter(function (p) {
          var mod = (p.module || p.modulo || '').toLowerCase().trim();
          return mod === moduleKey;
        });

    if (filtered.length === 0) {
      list.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        if (emptyTitle) {
          emptyTitle.textContent = moduleKey === 'all'
            ? 'Você ainda não tem publicações'
            : 'Nenhuma publicação em ' + getModuleInfo(moduleKey).label;
        }
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    list.innerHTML = filtered.map(function (post) { return renderPostCard(post); }).join('');

    // Event delegation na lista
    if (!list._kcActionsListenerAttached) {
      list._kcActionsListenerAttached = true;
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-my-post-action]');
        if (!btn) return;
        var action = btn.dataset.myPostAction;
        var uuid = btn.dataset.postUuid;
        if (action === 'edit') handleEdit(uuid);
        else if (action === 'toggle') handleToggle(uuid, btn);
        else if (action === 'boost') handleBoost();
        else if (action === 'renew') handleRenew(uuid);
        else if (action === 'save') handleSave(uuid, btn);
        else if (action === 'clone') { e.preventDefault(); handleClone(uuid); }
        else if (action === 'delete') handleDelete(uuid);
        else if (action === 'view') window.location.href = 'product.html?id=' + encodeURIComponent(uuid);
      });
    }
  }

  function buildPostActions(uuid, status) {
    var viewBtn = '<a href="product.html?id=' + esc(uuid) + '" class="kc-btn-secondary kc-my-posts-action--full" style="text-decoration:none;">' +
      '<i class="fas fa-eye"></i> Ver publicação</a>';

    var editBtn = '<button type="button" class="kc-btn-secondary" data-my-post-action="edit" data-post-uuid="' + esc(uuid) + '">' +
      '<i class="fas fa-pen"></i> Editar</button>';

    var saveBtn = '<button type="button" class="kc-btn-secondary" data-my-post-action="save" data-post-uuid="' + esc(uuid) + '">' +
      '<i class="fas fa-bookmark"></i> Salvar</button>';

    var cloneBtn = '<a href="create-post.html" class="kc-btn-secondary" data-my-post-action="clone" data-post-uuid="' + esc(uuid) + '" style="text-decoration:none;">' +
      '<i class="fas fa-copy"></i> Criar Parecido</a>';

    var deleteBtn = '<button type="button" class="kc-btn-secondary kc-my-posts-action--danger" data-my-post-action="delete" data-post-uuid="' + esc(uuid) + '">' +
      '<i class="fas fa-trash"></i> Excluir</button>';

    if (status === 'expired') {
      var renewBtn = '<button type="button" class="kc-btn-primary kc-my-posts-action--full" data-my-post-action="renew" data-post-uuid="' + esc(uuid) + '">' +
        '<i class="fas fa-rotate-right"></i> Renovar publicação</button>';
      return '<div class="kc-my-posts-actions">' +
        renewBtn + viewBtn + editBtn + saveBtn + cloneBtn + deleteBtn +
        '</div>';
    }

    if (status === 'deleted' || status === 'pending') {
      return '<div class="kc-my-posts-actions">' +
        viewBtn + editBtn + saveBtn + cloneBtn + deleteBtn +
        '</div>';
    }

    // published ou hidden
    var toggleLabel = status === 'hidden' ? 'Reativar' : 'Desabilitar';
    var toggleIcon  = status === 'hidden' ? 'fas fa-eye' : 'fas fa-eye-slash';
    var toggleBtn = '<button type="button" class="kc-btn-secondary" data-my-post-action="toggle" data-post-uuid="' + esc(uuid) + '">' +
      '<i class="' + esc(toggleIcon) + '"></i> ' + esc(toggleLabel) + '</button>';

    var boostBtn = '<button type="button" class="kc-btn-secondary" data-my-post-action="boost" data-post-uuid="' + esc(uuid) + '">' +
      '<i class="fas fa-rocket"></i> Impulsionar</button>';

    return '<div class="kc-my-posts-actions">' +
      viewBtn + editBtn + toggleBtn + boostBtn + saveBtn + cloneBtn + deleteBtn +
      '</div>';
  }

  function renderPostCard(post) {
    var uuid = post.uuid || post.id || '';
    var title = post.title || post.titulo || 'Sem título';
    var status = post.status || 'published';
    var moduleKey = (post.module || post.modulo || '').toLowerCase().trim() || 'compra-venda';
    var modInfo = getModuleInfo(moduleKey);
    var statusInfo = getStatusInfo(status);
    var createdAt = post.created_at || post.createdAt || '';
    var expiresAt = post.expires_at || post.expiresAt || '';
    var coverUrl = post.cover_url || (post.images && post.images[0]) || '';

    var thumbHtml = coverUrl
      ? '<img src="' + esc(coverUrl) + '" alt="' + esc(title) + '" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;">'
      : '<div style="width:64px;height:64px;border-radius:10px;background:var(--kc-background-dark);display:flex;align-items:center;justify-content:center;font-size:1.8em;flex-shrink:0;">' + modInfo.emoji + '</div>';

    var metaHtml = '';
    if (createdAt) metaHtml += '<span><i class="fas fa-clock"></i> ' + formatDate(createdAt) + '</span>';
    if (expiresAt && status !== 'deleted') {
      var expiryColor = status === 'expired' ? '#ef9a9a' : 'inherit';
      metaHtml += '<span style="color:' + expiryColor + ';"><i class="fas fa-hourglass-end"></i> ' +
        (status === 'expired' ? 'Expirou' : 'Expira') + ' ' + formatDate(expiresAt) + '</span>';
    }

    return '<div class="kc-card" style="padding:14px 16px; margin-bottom:12px;">' +
      '<div style="display:flex;gap:12px;align-items:flex-start;">' +
        thumbHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px;">' +
            '<span style="background:var(--kc-primary-brand);color:#fff;padding:2px 9px;border-radius:20px;font-size:0.72em;font-weight:600;">' +
              '<i class="' + esc(modInfo.icon) + '"></i> ' + esc(modInfo.label) + '</span>' +
            '<span style="background:' + statusInfo.bg + ';color:' + statusInfo.color + ';border:1px solid ' + statusInfo.borderColor + ';padding:2px 9px;border-radius:20px;font-size:0.72em;font-weight:600;">' + esc(statusInfo.label) + '</span>' +
          '</div>' +
          '<a href="product.html?id=' + esc(uuid) + '" style="font-weight:700;text-decoration:none;color:inherit;font-size:0.97em;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(title) + '">' + esc(title) + '</a>' +
          (metaHtml ? '<div style="font-size:0.78em;color:var(--kc-text-dark-secondary);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">' + metaHtml + '</div>' : '') +
        '</div>' +
      '</div>' +
      buildPostActions(uuid, status) +
    '</div>';
  }

  // ─── Handlers de ação ────────────────────────────────────────────────────────

  function handleEdit(uuid) {
    var api = window.KCAPI;
    showToastMsg('Carregando dados…', 'info', 1200);
    api.getPostById(uuid).then(function (post) {
      if (!post) { showToastMsg('Publicação não encontrada.', 'error'); return; }
      if (typeof window.kcOpenEditPostModal === 'function') {
        window.kcOpenEditPostModal(post, function () { reloadPosts(); });
      } else {
        window.location.href = 'create-post.html?edit=' + encodeURIComponent(uuid);
      }
    }).catch(function () {
      showToastMsg('Não foi possível carregar a publicação.', 'error');
    });
  }

  function handleToggle(uuid, btn) {
    var postIdx = state.posts.findIndex(function (p) { return (p.uuid || p.id) === uuid; });
    if (postIdx < 0) return;
    var post = state.posts[postIdx];
    var currentStatus = post.status || 'published';
    var newStatus = currentStatus === 'hidden' ? 'published' : 'hidden';
    var api = window.KCAPI;

    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

    var updateFn = (api && typeof api.updatePost === 'function')
      ? api.updatePost(uuid, { status: newStatus })
      : Promise.reject(new Error('API updatePost não disponível'));

    updateFn.then(function (res) {
      if (res && res.ok === false) {
        showToastMsg((res.error && res.error.message) || 'Não foi possível alterar o status.', 'error');
      } else {
        state.posts[postIdx] = Object.assign({}, post, { status: newStatus });
        showToastMsg(newStatus === 'hidden' ? 'Publicação desabilitada.' : 'Publicação reativada!', 'info', 2000);
        renderTabs();
        renderPostsList(state.activeModule);
      }
    }).catch(function (err) {
      var msg = (err && err.message) || 'Não foi possível alterar o status.';
      // Fallback: tentar via Supabase diretamente
      var kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient() : null;
      if (kcClient) {
        kcClient.from('posts').update({ status: newStatus }).eq('id', uuid).then(function (r) {
          if (r.error) {
            showToastMsg(r.error.message || msg, 'error');
          } else {
            state.posts[postIdx] = Object.assign({}, post, { status: newStatus });
            showToastMsg(newStatus === 'hidden' ? 'Publicação desabilitada.' : 'Publicação reativada!', 'info', 2000);
            renderTabs();
            renderPostsList(state.activeModule);
          }
        }).catch(function () { showToastMsg(msg, 'error'); });
      } else {
        showToastMsg(msg, 'error');
      }
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  function handleRenew(uuid) {
    var kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient() : null;
    if (!kcClient) { showToastMsg('Serviço não disponível.', 'error'); return; }

    var postIdx = state.posts.findIndex(function (p) { return (p.uuid || p.id) === uuid; });
    if (postIdx < 0) return;

    showToastMsg('Renovando publicação…', 'info', 1500);

    kcClient.rpc('kc_renew_post', { p_post_id: uuid }).then(function (res) {
      var data = res && res.data;
      if (res && res.error) {
        showToastMsg(res.error.message || 'Não foi possível renovar.', 'error');
        return;
      }
      if (data && data.ok === false) {
        showToastMsg(data.message || 'Não foi possível renovar.', 'error');
        return;
      }
      state.posts[postIdx] = Object.assign({}, state.posts[postIdx], {
        status: 'published',
        expires_at: (data && data.expires_at) || null,
      });
      showToastMsg((data && data.message) || 'Publicação renovada com sucesso!', 'info', 2500);
      renderTabs();
      renderPostsList(state.activeModule);
    }).catch(function () {
      showToastMsg('Não foi possível renovar a publicação.', 'error');
    });
  }

  function handleBoost() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div class="kc-card" style="max-width:360px;width:100%;padding:28px 24px;text-align:center;border-radius:16px;">' +
        '<i class="fas fa-rocket" style="font-size:2.5em;color:var(--kc-primary-brand);display:block;margin-bottom:14px;"></i>' +
        '<h3 style="margin:0 0 8px;font-size:1.1em;">Impulsionar — Em breve</h3>' +
        '<p style="color:var(--kc-text-dark-secondary);margin:0 0 20px;font-size:0.9em;">O recurso de impulsionamento premium estará disponível em breve para destacar suas publicações na plataforma.</p>' +
        '<button type="button" class="kc-btn-primary" style="width:100%;"><i class="fas fa-check"></i> Entendido</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.tagName === 'BUTTON') overlay.remove();
    });
  }

  function handleSave(uuid, triggerBtn) {
    state.saveTargetUuid = uuid;
    var popover = $('myPostsSavePopover');
    var backdrop = $('myPostsSaveBackdrop');
    if (!popover) return;

    // Resetar estado visual dos botões
    popover.querySelectorAll('.kc-my-posts-save-action').forEach(function (b) {
      b.setAttribute('aria-pressed', 'false');
    });

    // Posicionar popover perto do botão
    if (triggerBtn) {
      var rect = triggerBtn.getBoundingClientRect();
      var top = rect.bottom + 6;
      var left = Math.min(rect.left, window.innerWidth - 280);
      if (left < 8) left = 8;
      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
    }

    popover.style.display = 'block';
    popover.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.style.display = 'block';

    // Carregar estado salvo atual
    var api = window.KCAPI;
    if (api && typeof api.getSavedPostState === 'function') {
      api.getSavedPostState(uuid).then(function (result) {
        var kinds = (result && Array.isArray(result.kinds)) ? result.kinds
          : (Array.isArray(result) ? result : []);
        kinds.forEach(function (kind) {
          var btn = popover.querySelector('[data-kc-save-kind="' + kind + '"]');
          if (btn) btn.setAttribute('aria-pressed', 'true');
        });
      }).catch(function () {});
    }
  }

  function closeSavePopover() {
    var popover = $('myPostsSavePopover');
    var backdrop = $('myPostsSaveBackdrop');
    if (popover) { popover.style.display = 'none'; popover.setAttribute('aria-hidden', 'true'); }
    if (backdrop) backdrop.style.display = 'none';
    state.saveTargetUuid = null;
  }

  function wireSavePopover() {
    document.addEventListener('DOMContentLoaded', function () {
      var closeBtn = $('myPostsSavePopoverClose');
      var backdrop = $('myPostsSaveBackdrop');
      if (closeBtn) closeBtn.addEventListener('click', closeSavePopover);
      if (backdrop) backdrop.addEventListener('click', closeSavePopover);

      var popover = $('myPostsSavePopover');
      if (popover) {
        popover.addEventListener('click', function (e) {
          var btn = e.target.closest('.kc-my-posts-save-action');
          if (!btn || !state.saveTargetUuid) return;
          var kind = btn.dataset.kcSaveKind;
          var isPressed = btn.getAttribute('aria-pressed') === 'true';
          var uuid = state.saveTargetUuid;
          var api = window.KCAPI;

          btn.setAttribute('aria-pressed', isPressed ? 'false' : 'true');

          if (api && typeof api.setSavedPostState === 'function') {
            api.setSavedPostState(uuid, kind, !isPressed).then(function () {
              showToastMsg(isPressed ? 'Removido dos salvos.' : 'Publicação salva!', 'info', 1800);
            }).catch(function () {
              showToastMsg('Não foi possível salvar.', 'error');
              btn.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
            });
          } else {
            showToastMsg(isPressed ? 'Removido dos salvos.' : 'Publicação salva!', 'info', 1800);
          }

          closeSavePopover();
        });
      }
    });
  }

  function handleClone(uuid) {
    var api = window.KCAPI;
    showToastMsg('Preparando formulário…', 'info', 1200);
    api.getPostById(uuid).then(function (post) {
      if (!post) { showToastMsg('Publicação não encontrada.', 'error'); return; }
      if (typeof window.kcOpenEditPostModal === 'function') {
        // Abre o modal de edição mas reseta o modo de edição após abertura
        // para que o submit crie um novo post
        window.kcOpenEditPostModal(post, null);
        // Pequeno delay para garantir que o modal abriu antes de resetar
        setTimeout(function () {
          if (window.kcCreateState) {
            window.kcCreateState.editMode = false;
            window.kcCreateState.editPostId = null;
          }
        }, 80);
      } else {
        window.location.href = 'create-post.html';
      }
    }).catch(function () {
      showToastMsg('Não foi possível carregar dados da publicação.', 'error');
    });
  }

  function handleDelete(uuid) {
    var postIdx = state.posts.findIndex(function (p) { return (p.uuid || p.id) === uuid; });
    if (postIdx < 0) return;

    // Confirm via modal simples
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div class="kc-card" style="max-width:360px;width:100%;padding:24px;border-radius:14px;">' +
        '<h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;"><i class="fas fa-trash" style="color:#ef5350;"></i> Excluir publicação</h3>' +
        '<p style="color:var(--kc-text-dark-secondary);margin:0 0 18px;font-size:0.9em;">Esta ação é irreversível. Deseja mesmo excluir esta publicação?</p>' +
        '<div style="display:flex;gap:10px;">' +
          '<button type="button" id="_kcDeleteConfirmYes" class="kc-btn-primary" style="flex:1;background:#ef5350;border-color:#ef5350;"><i class="fas fa-trash"></i> Excluir</button>' +
          '<button type="button" id="_kcDeleteConfirmNo" class="kc-btn-secondary" style="flex:1;">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#_kcDeleteConfirmNo').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#_kcDeleteConfirmYes').addEventListener('click', function () {
      overlay.remove();
      var api = window.KCAPI;
      var deleteFn = (api && typeof api.deletePost === 'function')
        ? api.deletePost(uuid)
        : Promise.reject(new Error('API deletePost não disponível'));

      deleteFn.then(function () {
        state.posts.splice(postIdx, 1);
        showToastMsg('Publicação excluída.', 'info', 2000);
        renderTabs();
        renderPostsList(state.activeModule);
      }).catch(function () {
        // Fallback Supabase direto
        var kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
          ? window.KCSupabase.getClient() : null;
        if (kcClient) {
          kcClient.from('posts').update({ status: 'deleted' }).eq('id', uuid).then(function (r) {
            if (!r.error) {
              state.posts.splice(postIdx, 1);
              showToastMsg('Publicação excluída.', 'info', 2000);
              renderTabs();
              renderPostsList(state.activeModule);
            } else {
              showToastMsg('Não foi possível excluir a publicação.', 'error');
            }
          }).catch(function () {
            showToastMsg('Não foi possível excluir a publicação.', 'error');
          });
        } else {
          showToastMsg('Não foi possível excluir a publicação.', 'error');
        }
      });
    });
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function showAuthNotice() {
    var notice = $('myPostsAuthNotice');
    if (notice) {
      notice.style.display = 'block';
      // Re-apply inline style (sobrescreve o atributo style duplicado do HTML)
      notice.style.cssText = 'display:block; padding:32px; text-align:center;';
    }
  }

  function showLocalNotice() {
    var notice = $('myPostsLocalNotice');
    if (notice) {
      notice.style.display = 'block';
      notice.style.cssText = 'display:block; padding:28px; text-align:center;';
    }
  }

  function setLoading(val) {
    state.loading = val;
    var el = $('myPostsLoading');
    if (el) el.style.display = val ? 'block' : 'none';
    if (!val) {
      var list = $('myPostsList');
      if (list) list.style.opacity = '1';
    }
  }

  // ─── Array.findIndex polyfill seguro ─────────────────────────────────────────

  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (fn) {
      for (var i = 0; i < this.length; i++) { if (fn(this[i], i, this)) return i; }
      return -1;
    };
  }

  // ─── Boot ────────────────────────────────────────────────────────────────────
  init();

})();
