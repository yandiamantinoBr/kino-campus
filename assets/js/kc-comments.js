/* KinoCampus — kc-comments.js
   Sistema de comentários (localStorage + Supabase).
   Extraído de kc-core.js (F1).
*/


// Helpers globais para ambiente
function isSupabaseRuntime() {
  return !!(KCAPI && KCAPI.ENV && KCAPI.ENV.driver === 'supabase');
}
function isProductionRuntime() {
  return !!(KC_ENV && KC_ENV.isProduction === true);
}

// Helpers locais
function _esc(str) { return KCUtils.escapeHtml(str); }
function _cssEsc(str) { return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

// -----------------------------
// Comments (localStorage per post)
// -----------------------------
function getCurrentPostId() {
  // Prioridades: window.kcCurrentPostId > body[data-post-id] > null
  if (window.kcCurrentPostId != null) return String(window.kcCurrentPostId);
  const bodyId = document.body.getAttribute('data-post-id');
  return bodyId ? String(bodyId) : null;
}

function commentsStorageKey(postId) {
  return `kc_comments_${postId}`;
}

function loadComments(postId) {
  try {
    const raw = localStorage.getItem(commentsStorageKey(postId));
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveComments(postId, comments) {
  localStorage.setItem(commentsStorageKey(postId), JSON.stringify(comments));
}

function addComment(postId, commentText, authorName = 'Anônimo') {
  const id = String(postId);
  const comments = loadComments(id);

  const newComment = {
    id: (comments.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1),
    author: authorName || 'Anônimo',
    text: commentText,
    timestamp: new Date().toLocaleString('pt-BR'),
    created_at: new Date().toISOString(),
    likes: 0,
  };

  comments.push(newComment);
  saveComments(id, comments);
  return newComment;
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

function renderCommentMarkdownInline(raw) {
  // Delega para o utilitário compartilhado em KCUtils quando disponível
  if (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function') {
    return window.KCUtils.renderMarkdownInline(raw);
  }
  // Fallback inline (caso KCUtils não tenha carregado ainda)
  const source = String(raw || '');
  let html = _esc(source);

  const links = [];
  html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, url) {
    const safeUrl = String(url || '').trim();
    const safeLabel = String(label || '').trim() || safeUrl;
    const token = `__KC_LINK_${links.length}__`;
    links.push(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`);
    return token;
  });

  html = html
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');

  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/(?:^|\n)-\s+(.+)(?=\n|$)/g, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');

  links.forEach((tag, idx) => {
    html = html.replace(`__KC_LINK_${idx}__`, tag);
  });

  return html;
}

function updateCommentPreview(postId = null) {
  const id = postId != null ? String(postId) : getCurrentPostId();
  if (!id) return;
  const textarea = document.querySelector(`textarea[data-post-id="${_cssEsc(id)}"]`) || document.getElementById('commentText');
  const preview = document.getElementById('commentPreview');
  if (!textarea || !preview) return;

  const value = String(textarea.value || '').trim();
  if (!value) {
    preview.innerHTML = 'Pré-visualização: use a barra para formatar o comentário.';
    return;
  }

  preview.innerHTML = renderCommentMarkdownInline(value);
}

// Normaliza campos de um comentário independentemente da origem (localStorage ou Supabase)
function normalizeCommentForRender(c) {
  const profile = c.author_profile || c.profiles || null;
  const resolvedAuthor = (
    (profile && (profile.display_name || profile.full_name))
    || c.display_name
    || c.full_name
    || c.author_name
    || c.author
  );
  const normalizedAuthor = String(resolvedAuthor || '').trim();
  if (!normalizedAuthor) {
    console.warn('[KC Comments] Comentário sem autoria preenchida, aplicando fallback.', {
      commentId: c && c.id,
      hasAuthorProfile: !!profile,
      raw: c,
    });
  }

  const resolvedAvatar = String(
    (profile && profile.avatar_url)
    || c.author_avatar
    || c.avatar_url
    || ''
  ).trim();

  return {
    id: c.id,
    authorId: String(c.user_id || c.author_id || (profile && profile.id) || '').trim() || null,
    author: normalizedAuthor || 'Anônimo',
    avatar: resolvedAvatar,
    text: c.body || c.text || '',
    timestamp: c.created_at
      ? new Date(c.created_at).toLocaleString('pt-BR')
      : (c.timestamp || ''),
    likes: c.likes || 0,
    likedByMe: !!(c && (c.liked_by_me || c.likedByMe)),
    canLike: (c && c._kcCanLike !== false),
  };
}

function getLocalLikeKey(postId, commentId, userId) {
  return `kc_comment_likes_${postId}_${commentId}_${userId}`;
}

async function resolveCurrentLikeUserId() {
  try {
    if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
      const user = await KCAPI.getCurrentUser();
      if (user && user.id) return String(user.id);
    }
  } catch (_) { }

  try {
    const key = 'kc_local_like_user_id';
    let localId = String(localStorage.getItem(key) || '').trim();
    if (!localId) {
      localId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(key, localId);
    }
    return localId;
  } catch (_) {
    return 'guest_fallback';
  }
}

async function likeComment(postId, commentId, containerId = 'commentsContainer') {

  const id = String(postId);

  // Driver Supabase: persiste via KCAPI (async, re-render ao resolver)
  if (isSupabaseRuntime()) {
    KCAPI.likeComment(commentId).then(function (res) {
      renderComments(id, containerId);
      if (res && res.ok && res.alreadyLiked) {
        showToast('Você já curtiu este comentário.', 'info', 1800);
        return;
      }
      if (!res || !res.ok) {
        const msg = (res && res.error && res.error.message) || 'Não foi possível curtir este comentário.';
        showToast(msg, 'error', 2200);
      }
    }).catch(function () {
      showToast('Não foi possível curtir este comentário.', 'error', 2200);
    });
    return;
  }

  // Driver local: localStorage
  const comments = loadComments(id);
  const comment = comments.find(c => String(c.id) === String(commentId));
  if (!comment) return;

  const userId = await resolveCurrentLikeUserId();
  const likeKey = getLocalLikeKey(id, commentId, userId);
  try {
    if (localStorage.getItem(likeKey)) {
      showToast('Você já curtiu este comentário.', 'info', 1800);
      return;
    }
  } catch (_) { }

  comment.likes = (comment.likes || 0) + 1;
  saveComments(id, comments);
  try { localStorage.setItem(likeKey, '1'); } catch (_) { }
  renderComments(id, containerId);
}

function _renderCommentList(id, containerId, comments, currentUserId, isAdmin) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!Array.isArray(comments) || comments.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--kc-text-dark-secondary);">
        <i class="fas fa-comments" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5;"></i>
        <p>Seja o primeiro a comentar!</p>
      </div>
    `;
    return;
  }

  const nowMs = Date.now();

  container.innerHTML = comments.map(function (raw) {
    const c = normalizeCommentForRender(raw);
    const likeDisabled = !!c.likedByMe || !c.canLike;
    const likeStateColor = likeDisabled ? 'var(--kc-accent, #3b82f6)' : 'var(--kc-text-dark-secondary)';
    const likeStateWeight = likeDisabled ? '600' : '400';

    // Ações de comentário
    const isCommentAuthor = !!(currentUserId && c.authorId && c.authorId === currentUserId);
    const createdMs = raw.created_at ? new Date(raw.created_at).getTime() : 0;
    const canEdit   = !!(isCommentAuthor && createdMs > 0 && (nowMs - createdMs) < 60000);
    const canDelete = !!(isCommentAuthor || isAdmin);
    const canReport = !!(!isCommentAuthor && currentUserId);

    return `
    <div class="kc-comment" data-kc-comment-id="${_esc(String(c.id))}" style="padding: 15px; border-bottom: 1px solid var(--kc-border-dark); margin-bottom: 10px;">
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        ${c.authorId ? `<a href="profile.html?id=${_esc(c.authorId)}" style="display: contents;">` : ''}
          <img src="${_esc(c.avatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || ''))}" alt="${_esc(c.author)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background-color: var(--kc-surface-dark); cursor: ${c.authorId ? 'pointer' : 'default'};">
        ${c.authorId ? `</a>` : ''}
        <div style="flex: 1;">
          ${c.authorId ? `<a href="profile.html?id=${_esc(c.authorId)}" style="font-weight: bold; text-decoration: none; color: inherit;" class="kc-comment-author-link">${_esc(c.author)}</a>` : `<div style="font-weight: bold;">${_esc(c.author)}</div>`}
          <div style="font-size: 0.85em; color: var(--kc-text-dark-secondary);">${_esc(c.timestamp)}</div>
        </div>
      </div>
      <div class="kc-comment-body-text" data-raw-text="${_esc(c.text)}" style="margin-left: 50px; margin-bottom: 10px; white-space: normal; line-height: 1.6;">${renderCommentMarkdownInline(c.text)}</div>
      <div class="kc-comment-actions-row" style="margin-left: 50px; display: flex; gap: 12px; font-size: 0.88em; flex-wrap: wrap; align-items: center;">
        <button data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" class="kc-like-comment-btn ${likeDisabled ? 'is-liked' : ''}" ${likeDisabled ? 'disabled aria-disabled="true"' : ''} style="background: none; border: none; cursor: ${likeDisabled ? 'not-allowed' : 'pointer'}; color: ${likeStateColor}; font-weight: ${likeStateWeight}; opacity: ${likeDisabled ? '0.95' : '1'}; padding: 0;">
          <i class="fas fa-thumbs-up"></i> ${c.likes || 0}${c.likedByMe ? ' • Curtido' : (c.canLike ? '' : ' • Entrar para curtir')}
        </button>
        ${canEdit ? `<button data-kc-comment-action="edit" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:var(--kc-text-dark-secondary);padding:0;font-size:inherit;" title="Editar comentário (disponível por 1 minuto)"><i class="fas fa-pen"></i> Editar</button>` : ''}
        ${canDelete ? `<button data-kc-comment-action="delete" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:#ef9a9a;padding:0;font-size:inherit;" title="Excluir comentário"><i class="fas fa-trash"></i> Excluir</button>` : ''}
        ${canReport ? `<button data-kc-comment-action="report" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:var(--kc-text-dark-secondary);padding:0;font-size:inherit;" title="Denunciar comentário"><i class="fas fa-flag"></i> Denunciar</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Event delegation: set up once per container so it persists across re-renders.
  if (!container._kcLikeListenerAttached) {
    container._kcLikeListenerAttached = true;
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.kc-like-comment-btn');
      if (!btn) return;
      likeComment(btn.dataset.postId, btn.dataset.commentId, btn.dataset.container);
    });
  }

  if (!container._kcCommentActionsListenerAttached) {
    container._kcCommentActionsListenerAttached = true;
    container.addEventListener('click', function (e) {
      const actionBtn = e.target.closest('[data-kc-comment-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.kcCommentAction;
        const pid = actionBtn.dataset.postId;
        const cid = actionBtn.dataset.commentId;
        const ctr = actionBtn.dataset.container || 'commentsContainer';
        if (action === 'edit') _openCommentEditInline(pid, cid, ctr);
        else if (action === 'delete') _confirmDeleteComment(pid, cid, ctr);
        else if (action === 'report') _openCommentReportModal(pid, cid, ctr);
        return;
      }
      const saveBtn = e.target.closest('[data-kc-comment-edit-save]');
      if (saveBtn) {
        const wrap = saveBtn.closest('.kc-comment-edit-wrap');
        const textarea = wrap ? wrap.querySelector('textarea') : null;
        const text = textarea ? textarea.value.trim() : '';
        const cid2 = saveBtn.dataset.kcCommentEditSave;
        const pid2 = saveBtn.dataset.postId;
        const ctr2 = saveBtn.dataset.container || 'commentsContainer';
        editComment(pid2, cid2, text, ctr2);
        return;
      }
      const cancelBtn = e.target.closest('[data-kc-comment-edit-cancel]');
      if (cancelBtn) {
        const pid3 = cancelBtn.dataset.postId;
        const ctr3 = cancelBtn.dataset.container || 'commentsContainer';
        renderComments(pid3, ctr3);
      }
    });
  }
}

// ---- Ações de comentário ----

function _openCommentEditInline(pid, cid, ctr) {
  const commentEl = document.querySelector(`[data-kc-comment-id="${_cssEsc(String(cid))}"]`);
  if (!commentEl) return;
  const textDiv = commentEl.querySelector('.kc-comment-body-text');
  const actionsRow = commentEl.querySelector('.kc-comment-actions-row');
  if (!textDiv) return;
  if (commentEl.querySelector('.kc-comment-edit-wrap')) return; // já aberto

  const rawText = textDiv.dataset.rawText || '';
  const editWrap = document.createElement('div');
  editWrap.className = 'kc-comment-edit-wrap';
  editWrap.style.cssText = 'margin-left:50px;margin-bottom:10px;';
  editWrap.innerHTML = `
    <textarea style="width:100%;min-height:72px;padding:8px 10px;border-radius:8px;border:1px solid var(--kc-border-dark);background:var(--kc-surface-dark);color:inherit;resize:vertical;font-size:0.95em;font-family:inherit;box-sizing:border-box;">${_esc(rawText)}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px;">
      <button type="button" data-kc-comment-edit-save="${_esc(String(cid))}" data-post-id="${_esc(String(pid))}" data-container="${_esc(String(ctr))}" class="kc-btn-primary" style="padding:5px 14px;font-size:0.82em;"><i class="fas fa-check"></i> Salvar</button>
      <button type="button" data-kc-comment-edit-cancel="1" data-post-id="${_esc(String(pid))}" data-container="${_esc(String(ctr))}" class="kc-btn-secondary" style="padding:5px 14px;font-size:0.82em;"><i class="fas fa-times"></i> Cancelar</button>
    </div>`;
  textDiv.style.display = 'none';
  if (actionsRow) actionsRow.style.display = 'none';
  textDiv.parentNode.insertBefore(editWrap, textDiv.nextSibling);
  editWrap.querySelector('textarea').focus();
}

async function editComment(pid, cid, newText, ctr) {
  if (!newText) { showToast('O comentário não pode ficar vazio.', 'error'); return; }
  const id = String(pid);

  if (isSupabaseRuntime()) {
    try {
      const kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient() : null;
      if (!kcClient) { showToast('Não foi possível editar.', 'error'); return; }
      const user = await KCAPI.getCurrentUser();
      if (!user) { showToast('Faça login para editar.', 'info'); return; }
      const { error } = await kcClient.from('comments').update({ body: newText }).eq('id', cid).eq('author_id', user.id);
      if (error) { showToast(error.message || 'Erro ao editar comentário.', 'error'); return; }
      showToast('Comentário editado!', 'info', 1800);
      renderComments(id, ctr);
    } catch (_) { showToast('Erro ao editar comentário.', 'error'); }
    return;
  }

  const comments = loadComments(id);
  const comment = comments.find(function (c) { return String(c.id) === String(cid); });
  if (!comment) { showToast('Comentário não encontrado.', 'error'); return; }
  comment.text = newText;
  saveComments(id, comments);
  showToast('Comentário editado!', 'info', 1800);
  renderComments(id, ctr);
}

function _confirmDeleteComment(pid, cid, ctr) {
  const commentEl = document.querySelector(`[data-kc-comment-id="${_cssEsc(String(cid))}"]`);
  if (!commentEl) return;
  const actionsRow = commentEl.querySelector('.kc-comment-actions-row');
  if (!actionsRow) return;
  if (actionsRow.querySelector('.kc-comment-delete-confirm')) return;

  const originalHTML = actionsRow.innerHTML;
  actionsRow.innerHTML = `
    <span style="color:var(--kc-text-dark-secondary);font-size:0.88em;">Excluir este comentário?</span>
    <button class="kc-comment-delete-confirm kc-btn-primary" type="button" style="padding:3px 12px;font-size:0.8em;background:#ef5350;border-color:#ef5350;"><i class="fas fa-trash"></i> Sim, excluir</button>
    <button class="kc-comment-delete-cancel kc-btn-secondary" type="button" style="padding:3px 12px;font-size:0.8em;">Não</button>`;

  actionsRow.querySelector('.kc-comment-delete-confirm').addEventListener('click', function () {
    deleteComment(pid, cid, ctr);
  });
  actionsRow.querySelector('.kc-comment-delete-cancel').addEventListener('click', function () {
    actionsRow.innerHTML = originalHTML;
  });
}

async function deleteComment(pid, cid, ctr) {
  const id = String(pid);

  if (isSupabaseRuntime()) {
    try {
      const kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient() : null;
      if (!kcClient) { showToast('Não foi possível excluir.', 'error'); return; }
      const user = await KCAPI.getCurrentUser();
      let query = kcClient.from('comments').delete().eq('id', cid);
      const profile = window.KCAPI && typeof window.KCAPI.getMyProfile === 'function'
        ? await window.KCAPI.getMyProfile().catch(() => null) : null;
      const isAdm = !!(profile && profile.is_admin);
      if (!isAdm && user) query = query.eq('author_id', user.id);
      const { error } = await query;
      if (error) { showToast(error.message || 'Erro ao excluir comentário.', 'error'); return; }
      showToast('Comentário excluído.', 'info', 1800);
      renderComments(id, ctr);
    } catch (_) { showToast('Erro ao excluir comentário.', 'error'); }
    return;
  }

  const comments = loadComments(id).filter(function (c) { return String(c.id) !== String(cid); });
  saveComments(id, comments);
  showToast('Comentário excluído.', 'info', 1800);
  renderComments(id, ctr);
}

var _kcCommentReportReasons = [
  { value: 'spam',        label: 'Spam ou conteúdo irrelevante',          icon: 'fas fa-ban' },
  { value: 'harassment',  label: 'Assédio ou comportamento abusivo',      icon: 'fas fa-user-slash' },
  { value: 'offensive',   label: 'Linguagem ofensiva ou discriminatória', icon: 'fas fa-face-angry' },
  { value: 'misleading',  label: 'Conteúdo falso ou enganoso',            icon: 'fas fa-triangle-exclamation' },
  { value: 'privacy',     label: 'Violação de privacidade',               icon: 'fas fa-eye-slash' },
  { value: 'other',       label: 'Outros',                                icon: 'fas fa-comment-dots' },
];

function _openCommentReportModal(pid, cid, ctr) {
  const existing = document.getElementById('kcCommentReportModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'kcCommentReportModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

  const reasonsHTML = _kcCommentReportReasons.map(function (r) {
    return `<button type="button" class="kc-comment-report-reason" data-reason="${_esc(r.value)}" style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;background:none;border:1px solid var(--kc-border-dark);border-radius:8px;cursor:pointer;color:inherit;text-align:left;font-size:0.9em;transition:background .15s;">
      <i class="${_esc(r.icon)}" style="width:18px;text-align:center;color:var(--kc-text-dark-secondary);"></i>
      <span>${_esc(r.label)}</span>
    </button>`;
  }).join('');

  overlay.innerHTML = `
    <div class="kc-card" style="max-width:400px;width:100%;padding:0;overflow:hidden;border-radius:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--kc-border-dark);">
        <h3 style="margin:0;font-size:1em;display:flex;align-items:center;gap:8px;"><i class="fas fa-flag" style="color:var(--kc-primary-brand);"></i> Denunciar comentário</h3>
        <button type="button" id="kcCommentReportClose" style="background:none;border:none;cursor:pointer;color:var(--kc-text-dark-secondary);font-size:1.1em;" aria-label="Fechar"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding:14px 18px;">
        <p style="color:var(--kc-text-dark-secondary);font-size:0.88em;margin:0 0 12px;">Selecione o motivo da denúncia:</p>
        <div style="display:flex;flex-direction:column;gap:8px;" id="kcCommentReportReasons">${reasonsHTML}</div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('#kcCommentReportClose').addEventListener('click', function () { overlay.remove(); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

  overlay.querySelectorAll('.kc-comment-report-reason').forEach(function (btn) {
    btn.addEventListener('mouseenter', function () { btn.style.background = 'var(--kc-background-dark)'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = 'none'; });
    btn.addEventListener('click', function () {
      const reason = btn.dataset.reason;
      overlay.remove();
      _submitCommentReport(pid, cid, reason, ctr);
    });
  });
}

async function _submitCommentReport(pid, cid, reason, ctr) {
  if (isSupabaseRuntime()) {
    try {
      const kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient() : null;
      let reporterId = null;
      try {
        const u = await KCAPI.getCurrentUser();
        if (u) reporterId = u.id;
      } catch (_) { }
      if (kcClient && reporterId) {
        // entity_type/entity_id adicionados pela migration v8.4.2.0_comment_reports
        await kcClient.from('reports').insert({
          entity_type: 'comment',
          entity_id: String(cid),
          reporter_id: reporterId,
          reason: reason,
        }).then(function () { }).catch(function (err) {
          console.warn('[KC Comments] Report insert silenced:', err);
        });
      }
    } catch (_) { }
    showToast('Denúncia enviada! Obrigado por contribuir.', 'info', 2800);
    return;
  }
  // Local: apenas UX feedback
  showToast('Denúncia registrada! Revisaremos em breve.', 'info', 2800);
}

function renderComments(postId, containerId = 'commentsContainer') {
  bindCommentPreviewSync();
  const id = String(postId);

  // Driver Supabase: carrega async, depois renderiza
  if (isSupabaseRuntime()) {
    Promise.all([
      KCAPI.getComments(id),
      (KCAPI && typeof KCAPI.getCurrentUser === 'function') ? KCAPI.getCurrentUser() : Promise.resolve(null),
      (KCAPI && typeof KCAPI.getMyProfile === 'function') ? KCAPI.getMyProfile().catch(function () { return null; }) : Promise.resolve(null),
    ]).then(function (results) {
      const comments = Array.isArray(results[0]) ? results[0] : [];
      const user = results[1] || null;
      const profile = results[2] || null;
      const canLike = !!(user && user.id);
      const currentUserId = user && user.id ? String(user.id) : null;
      const isAdmin = !!(profile && profile.is_admin);
      const enriched = comments.map(function (comment) { return { ...comment, _kcCanLike: canLike }; });
      _renderCommentList(id, containerId, enriched, currentUserId, isAdmin);
    }).catch(function () {
      _renderCommentList(id, containerId, [], null, false);
    }).finally(function () {
      updateCommentPreview(id);
    });
    return;
  }

  // Driver local/dev: localStorage + chave de like por usuário
  Promise.all([
    Promise.resolve(resolveCurrentLikeUserId()),
    (KCAPI && typeof KCAPI.getCurrentUser === 'function') ? KCAPI.getCurrentUser().catch(function () { return null; }) : Promise.resolve(null),
  ]).then(function (results) {
    const userId = results[0];
    const localUser = results[1];
    const currentUserId = localUser && localUser.id ? String(localUser.id) : (userId && !userId.startsWith('guest_') ? userId : null);
    const comments = (loadComments(id) || []).map(function (comment) {
      const likeKey = getLocalLikeKey(id, comment && comment.id, userId);
      let likedByMe = false;
      try { likedByMe = !!localStorage.getItem(likeKey); } catch (_) { }
      return { ...comment, likedByMe };
    });
    _renderCommentList(id, containerId, comments, currentUserId, false);
  }).catch(function () {
    _renderCommentList(id, containerId, loadComments(id), null, false);
  }).finally(function () {
    updateCommentPreview(id);
  });
}

function bindCommentPreviewSync() {
  if (document.body && document.body.dataset.kcCommentPreviewBound === '1') return;
  if (document.body) document.body.dataset.kcCommentPreviewBound = '1';

  document.addEventListener('input', function (event) {
    const target = event.target;
    if (!target || target.id !== 'commentText') return;
    updateCommentPreview();
  });
}

function buildTrackingPostFromNode(node) {
  if (!node) return null;
  return {
    module: node.getAttribute('data-post-module') || node.getAttribute('data-module') || '',
    category: node.getAttribute('data-post-category') || node.getAttribute('data-category') || '',
    subcategory: node.getAttribute('data-post-subcategory') || node.getAttribute('data-subcategory') || '',
    title: (node.querySelector('.kc-card__title') || document.getElementById('postTitle') || {}).textContent || '',
    description: (node.querySelector('.kc-card__description-preview') || document.getElementById('postDescription') || {}).textContent || '',
    tagKeys: String(node.getAttribute('data-post-tags') || node.getAttribute('data-kc-tags') || '').split(/\s+/).filter(Boolean)
  };
}

function resolveCommentTrackingPost(postId) {
  const id = String(postId || '').trim();
  if (!id) return null;

  const card = document.querySelector(`.kc-card[data-post-id="${_cssEsc(id)}"]`);
  if (card) return buildTrackingPostFromNode(card);

  if (window.kcCurrentPostContext && typeof window.kcCurrentPostContext === 'object') {
    return window.kcCurrentPostContext;
  }

  return buildTrackingPostFromNode(document.body);
}

async function submitComment(postId = null, containerId = 'commentsContainer') {
  const resolved = postId != null ? String(postId) : getCurrentPostId();
  if (!resolved) {
    showToast('Não foi possível identificar esta publicação', 'error');
    return;
  }

  const id = String(resolved);
  const textarea = document.querySelector(`textarea[data-post-id="${_cssEsc(id)}"]`);
  if (!textarea || !textarea.value.trim()) {
    showToast('Por favor, escreva um comentário', 'error');
    return;
  }

  const text = textarea.value.trim();

  // Guard contra duplo-clique / duplo-envio
  const submitBtn = document.getElementById('submitCommentButton');
  if (submitBtn && submitBtn._kcSubmitting) return;
  if (submitBtn) { submitBtn._kcSubmitting = true; submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }
  function _releaseSubmitBtn() {
    if (submitBtn) { submitBtn._kcSubmitting = false; submitBtn.disabled = false; submitBtn.style.opacity = ''; }
  }

  // Driver Supabase: persiste via KCAPI (async)
  if (KCAPI && KCAPI.ENV && KCAPI.ENV.driver === 'supabase') {
    // Verifica autenticação antes de enviar — abre modal de login se necessário
    const currentUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!currentUser) {
      _releaseSubmitBtn();
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login' });
      } else {
        showToast('Faça login para comentar.', 'info');
      }
      return;
    }
    KCAPI.addComment(id, text).then(function (res) {
      _releaseSubmitBtn();
      if (res && res.ok) {
        textarea.value = '';
        updateCommentPreview(id);
        renderComments(id, containerId);
        showToast('Comentário enviado!', 'info', 1800);
        try {
          if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
            window.KCHomeCategories.trackEvent('comment', {
              post: resolveCommentTrackingPost(id)
            });
          }
        } catch (_) { }

        // Audit log: registra comentário (fire-and-forget)
        try {
          const kcClient = KCSupabase && typeof KCSupabase.getClient === 'function'
            ? KCSupabase.getClient() : null;
          const commentId = (res.data && res.data.id) ? String(res.data.id) : id;
          if (kcClient) {
            let actorId = null;
            try {
              if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
                KCAPI.getCurrentUser().then(function (u) {
                  if (u) actorId = u.id;
                  kcClient.from('audit_log').insert({
                    action: 'comment_created',
                    entity_type: 'comments',
                    entity_id: commentId,
                    actor_id: actorId,
                  }).then(() => { }).catch(() => { });
                }).catch(() => { });
              }
            } catch (_) { }
          }
        } catch (_) { }
      } else {
        const msg = (res && res.error && res.error.message) || 'Não foi possível comentar.';
        _releaseSubmitBtn();
        showToast(msg, 'error');
      }
    }).catch(function () {
      _releaseSubmitBtn();
      showToast('Erro ao enviar comentário.', 'error');
    });
    return;
  }

  // Política de produção: impedir persistência local de operação crítica.
  if (isProductionRuntime()) {
    showToast('Comentário bloqueado: em produção, use Supabase.', 'error');
    return;
  }

  // Driver local: localStorage
  const authorInput = document.querySelector(`input[data-post-id="${_cssEsc(id)}"][name="author"]`);
  let sessionUser = null;
  let sessionProfile = null;
  try {
    if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
      sessionUser = await KCAPI.getCurrentUser();
    }
  } catch (_) { }

  if (sessionUser) {
    try {
      if (KCAPI && typeof KCAPI.getMyProfile === 'function') {
        sessionProfile = await KCAPI.getMyProfile();
      }
    } catch (_) { }

    if (!sessionProfile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          sessionProfile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) { }
    }
  }

  const sessionAuthorName = resolveCurrentUserDisplayName(sessionUser, sessionProfile);
  const hasSession = !!(sessionUser && sessionUser.id);
  const authorName = hasSession
    ? (sessionAuthorName || 'Conta autenticada')
    : (sessionAuthorName || authorInput?.value?.trim() || 'Anônimo');
  addComment(id, text, authorName);
  _releaseSubmitBtn();
  textarea.value = '';
  updateCommentPreview(id);
  renderComments(id, containerId);
  showToast('Comentário enviado!', 'info', 1800);
  try {
    if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
      window.KCHomeCategories.trackEvent('comment', {
        post: resolveCommentTrackingPost(id)
      });
    }
  } catch (_) { }
}

// Toolbar formatting (Markdown-like)
function formatText(format, postId = null) {
  const id = postId != null ? String(postId) : getCurrentPostId();
  if (!id) return;

  const textarea = document.querySelector(`textarea[data-post-id="${_cssEsc(id)}"]`);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const hasSelection = !!selectedText;

  const wrapSelection = function (before, after, fallbackText) {
    const baseText = hasSelection ? selectedText : (fallbackText || 'texto');
    const formatted = `${before}${baseText}${after}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  const insertBlock = function (blockText) {
    const prefix = (start > 0 && textarea.value[start - 1] !== '\n') ? '\n' : '';
    const suffix = (end < textarea.value.length && textarea.value[end] !== '\n') ? '\n' : '';
    const formatted = `${prefix}${blockText}${suffix}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  switch (format) {
    case 'bold':
      wrapSelection('**', '**', 'negrito');
      break;
    case 'italic':
      wrapSelection('*', '*', 'itálico');
      break;
    case 'underline':
      wrapSelection('__', '__', 'sublinhado');
      break;
    case 'strikethrough':
      wrapSelection('~~', '~~', 'tachado');
      break;
    case 'inlinecode':
      wrapSelection('`', '`', 'código');
      break;
    case 'quote':
      insertBlock(`> ${hasSelection ? selectedText : 'citação'}`);
      break;
    case 'bullet':
      insertBlock(`- ${hasSelection ? selectedText : 'item da lista'}`);
      break;
    case 'link': {
      const label = hasSelection ? selectedText : 'texto do link';
      const formatted = `[${label}](https://)`;
      textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
      const cursorStart = start + formatted.length - 1;
      textarea.focus();
      textarea.selectionStart = cursorStart;
      textarea.selectionEnd = cursorStart;
      break;
    }
    default:
      return;
  }

  updateCommentPreview(id);
}

window.renderCommentMarkdownInline = renderCommentMarkdownInline;
