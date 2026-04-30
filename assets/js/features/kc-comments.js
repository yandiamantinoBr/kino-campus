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

function resolveCommentOptionParentId(options) {
  const raw = (options && typeof options === 'object' && !Array.isArray(options))
    ? (options.parentId || options.parent_id || null)
    : options;
  return String(raw || '').trim() || null;
}

function getCommentParentId(comment) {
  if (window.KCCommentsShared && typeof window.KCCommentsShared.getCommentParentId === 'function') {
    return window.KCCommentsShared.getCommentParentId(comment);
  }
  if (!comment || typeof comment !== 'object') return null;
  return String(comment.parent_id || comment.parentId || '').trim() || null;
}

function resolveReplyTarget(comments, parentId) {
  if (window.KCCommentsShared && typeof window.KCCommentsShared.resolveReplyTarget === 'function') {
    return window.KCCommentsShared.resolveReplyTarget(comments, parentId);
  }

  const id = String(parentId || '').trim();
  if (!id || !Array.isArray(comments)) return null;

  for (let i = 0; i < comments.length; i += 1) {
    const comment = comments[i];
    if (!comment || String(comment.id || '').trim() !== id) continue;
    return getCommentParentId(comment) ? null : comment;
  }

  return null;
}

function buildCommentThreads(comments) {
  if (window.KCCommentsShared && typeof window.KCCommentsShared.buildCommentThreads === 'function') {
    return window.KCCommentsShared.buildCommentThreads(comments);
  }

  const items = Array.isArray(comments) ? comments.filter(Boolean) : [];
  const roots = [];
  const repliesByParent = Object.create(null);

  items.forEach(function (comment) {
    const parentId = getCommentParentId(comment);
    const parent = parentId ? resolveReplyTarget(items, parentId) : null;
    if (parent && parent.id != null) {
      const bucketKey = String(parent.id);
      if (!Array.isArray(repliesByParent[bucketKey])) repliesByParent[bucketKey] = [];
      repliesByParent[bucketKey].push(comment);
      return;
    }
    roots.push(comment);
  });

  return roots.map(function (root) {
    const rootId = String((root && root.id) || '').trim();
    return {
      root: root,
      replies: rootId && Array.isArray(repliesByParent[rootId]) ? repliesByParent[rootId].slice() : [],
    };
  });
}

const _kcActiveReplyState = {
  postId: null,
  parentId: null,
  containerId: 'commentsContainer',
};

function setActiveReplyState(postId, parentId, containerId = 'commentsContainer') {
  _kcActiveReplyState.postId = String(postId || '').trim() || null;
  _kcActiveReplyState.parentId = String(parentId || '').trim() || null;
  _kcActiveReplyState.containerId = String(containerId || 'commentsContainer');
}

function clearActiveReplyState() {
  _kcActiveReplyState.postId = null;
  _kcActiveReplyState.parentId = null;
  _kcActiveReplyState.containerId = 'commentsContainer';
}

function isActiveReplyTarget(postId, parentId, containerId = 'commentsContainer') {
  return (
    String(_kcActiveReplyState.postId || '') === String(postId || '')
    && String(_kcActiveReplyState.parentId || '') === String(parentId || '')
    && String(_kcActiveReplyState.containerId || 'commentsContainer') === String(containerId || 'commentsContainer')
  );
}

function addComment(postId, commentText, authorName = 'Anonimo', options = {}) {
  const id = String(postId);
  const comments = loadComments(id);
  const parentId = resolveCommentOptionParentId(options);
  if (parentId && !resolveReplyTarget(comments, parentId)) return null;

  const newComment = {
    id: (comments.reduce((max, comment) => Math.max(max, Number(comment.id) || 0), 0) + 1),
    author: authorName || 'Anonimo',
    text: commentText,
    parent_id: parentId,
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
function getLocalLikeKey(postId, commentId, userId) {
  return `kc_comment_likes_${postId}_${commentId}_${userId}`;
}

function normalizeCommentForRender(c) {
  if (window.KCCommentsShared && typeof window.KCCommentsShared.normalizeCommentForRender === 'function') {
    return window.KCCommentsShared.normalizeCommentForRender(c || {});
  }

  const profile = c && (c.author_profile || c.profiles) ? (c.author_profile || c.profiles) : null;
  const resolvedAuthor = (
    (profile && (profile.display_name || profile.full_name))
    || (c && c.display_name)
    || (c && c.full_name)
    || (c && c.author_name)
    || (c && c.author)
  );
  const normalizedAuthor = String(resolvedAuthor || '').trim();
  const resolvedAvatar = String(
    (profile && profile.avatar_url)
    || (c && c.author_avatar)
    || (c && c.avatar_url)
    || ''
  ).trim();

  return {
    id: c && c.id,
    authorId: String((c && (c.user_id || c.author_id)) || (profile && profile.id) || '').trim() || null,
    author: normalizedAuthor || 'Anonimo',
    avatar: resolvedAvatar,
    text: (c && (c.body || c.text)) || '',
    parentId: getCommentParentId(c),
    timestamp: c && c.created_at
      ? new Date(c.created_at).toLocaleString('pt-BR')
      : ((c && c.timestamp) || ''),
    likes: (c && c.likes) || 0,
    likedByMe: !!(c && (c.liked_by_me || c.likedByMe)),
    canLike: !(c && c._kcCanLike === false),
  };
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
    KCAPI.likeComment(commentId, { postId: id }).then(function (res) {
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

// ---- Ações de comentário ----

function renderCommentCardHTML(id, containerId, raw, currentUserId, isAdmin, depth = 0) {
  const c = normalizeCommentForRender(raw);
  const likeDisabled = !!c.likedByMe || !c.canLike;
  const likeStateColor = likeDisabled ? 'var(--kc-accent, #3b82f6)' : 'var(--kc-text-dark-secondary)';
  const likeStateWeight = likeDisabled ? '600' : '400';
  const isCommentAuthor = !!(currentUserId && c.authorId && c.authorId === currentUserId);
  const createdMs = raw && raw.created_at ? new Date(raw.created_at).getTime() : 0;
  const canEdit = !!(isCommentAuthor && createdMs > 0 && (Date.now() - createdMs) < 60000);
  const canDelete = !!(isCommentAuthor || isAdmin);
  const canReport = !!(!isCommentAuthor && currentUserId);
  const canReply = !c.parentId && !!(currentUserId || !isSupabaseRuntime());
  const avatarSize = depth > 0 ? 36 : 40;
  const contentOffset = depth > 0 ? 46 : 50;
  const wrapperClass = depth > 0 ? 'kc-comment kc-comment--reply' : 'kc-comment';
  const wrapperStyle = depth > 0
    ? 'padding:12px 14px 12px 12px;margin:0 0 10px 18px;'
    : 'padding:15px;border-bottom:1px solid var(--kc-border-dark);margin-bottom:10px;';

  return `
    <div class="${wrapperClass}" data-kc-comment-id="${_esc(String(c.id))}" data-kc-comment-depth="${_esc(String(depth))}" style="${wrapperStyle}">
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        ${c.authorId ? `<a href="profile.html?id=${_esc(c.authorId)}" style="display: contents;">` : ''}
          <img src="${_esc(c.avatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || ''))}" alt="${_esc(c.author)}" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;object-fit:cover;background-color:var(--kc-surface-dark);cursor:${c.authorId ? 'pointer' : 'default'};">
        ${c.authorId ? '</a>' : ''}
        <div style="flex:1;">
          ${c.authorId ? `<a href="profile.html?id=${_esc(c.authorId)}" style="font-weight:bold;text-decoration:none;color:inherit;" class="kc-comment-author-link">${_esc(c.author)}</a>` : `<div style="font-weight:bold;">${_esc(c.author)}</div>`}
          <div style="font-size:0.85em;color:var(--kc-text-dark-secondary);">${_esc(c.timestamp)}</div>
        </div>
      </div>
      <div class="kc-comment-body-text kc-comment__body" data-raw-text="${_esc(c.text)}" style="margin-left:${contentOffset}px;margin-bottom:10px;white-space:normal;line-height:1.6;">${renderCommentMarkdownInline(c.text)}</div>
      <div class="kc-comment-actions-row kc-comment__actions" style="margin-left:${contentOffset}px;display:flex;gap:12px;font-size:0.88em;flex-wrap:wrap;align-items:center;">
        <button type="button" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" class="kc-like-comment-btn ${likeDisabled ? 'is-liked' : ''}" ${likeDisabled ? 'disabled aria-disabled="true"' : ''} style="background:none;border:none;cursor:${likeDisabled ? 'not-allowed' : 'pointer'};color:${likeStateColor};font-weight:${likeStateWeight};opacity:${likeDisabled ? '0.95' : '1'};padding:0;">
          <i class="fas fa-thumbs-up" aria-hidden="true"></i> ${c.likes || 0}${c.likedByMe ? ' - Curtido' : (c.canLike ? '' : ' - Entrar para curtir')}
        </button>
        ${canReply ? `<button type="button" data-kc-comment-action="reply" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:var(--kc-primary-brand);padding:0;font-size:inherit;" title="Responder comentario"><i class="fas fa-reply" aria-hidden="true"></i> Responder</button>` : ''}
        ${canEdit ? `<button type="button" data-kc-comment-action="edit" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:var(--kc-text-dark-secondary);padding:0;font-size:inherit;" title="Editar comentario (disponivel por 1 minuto)"><i class="fas fa-pen" aria-hidden="true"></i> Editar</button>` : ''}
        ${canDelete ? `<button type="button" data-kc-comment-action="delete" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:#ef9a9a;padding:0;font-size:inherit;" title="Excluir comentario"><i class="fas fa-trash" aria-hidden="true"></i> Excluir</button>` : ''}
        ${canReport ? `<button type="button" data-kc-comment-action="report" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" style="background:none;border:none;cursor:pointer;color:var(--kc-text-dark-secondary);padding:0;font-size:inherit;" title="Denunciar comentario"><i class="fas fa-flag" aria-hidden="true"></i> Denunciar</button>` : ''}
      </div>
    </div>`;
}

function buildReplyComposerHTML(id, containerId, parentComment) {
  const parent = normalizeCommentForRender(parentComment);
  return `
    <div class="kc-comment-reply-composer" data-kc-reply-form-parent-id="${_esc(String(parent.id))}">
      <div class="kc-comment-reply-composer__label"><i class="fas fa-reply"></i> Respondendo a <strong>${_esc(parent.author)}</strong></div>
      <textarea data-kc-reply-input="${_esc(String(parent.id))}" data-post-id="${_esc(String(id))}" placeholder="Escreva sua resposta" aria-label="Escreva sua resposta"></textarea>
      <div class="kc-comment-reply-composer__actions">
        <button type="button" data-kc-comment-action="reply-submit" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(parent.id))}" data-container="${_esc(String(containerId))}" class="kc-btn-primary" style="padding:6px 14px;font-size:0.82em;"><i class="fas fa-paper-plane"></i> Responder</button>
        <button type="button" data-kc-comment-action="reply-cancel" data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(parent.id))}" data-container="${_esc(String(containerId))}" class="kc-btn-secondary" style="padding:6px 14px;font-size:0.82em;"><i class="fas fa-times"></i> Cancelar</button>
      </div>
    </div>`;
}

function _openCommentReplyInline(pid, cid, ctr) {
  setActiveReplyState(pid, cid, ctr);
  renderComments(pid, ctr);
}

function _closeCommentReplyInline(pid, cid, ctr) {
  if (isActiveReplyTarget(pid, cid, ctr)) clearActiveReplyState();
  renderComments(pid, ctr);
}

function _renderCommentList(id, containerId, comments, currentUserId, isAdmin) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!Array.isArray(comments) || comments.length === 0) {
    clearActiveReplyState();
    container.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--kc-text-dark-secondary);">
        <i class="fas fa-comments" style="font-size:2em;margin-bottom:10px;opacity:0.5;"></i>
        <p>Seja o primeiro a comentar!</p>
      </div>
    `;
    return;
  }

  const threads = buildCommentThreads(comments);
  container.innerHTML = threads.map(function (thread) {
    const rootId = String(thread && thread.root && thread.root.id || '').trim();
    const replyComposer = rootId && isActiveReplyTarget(id, rootId, containerId)
      ? buildReplyComposerHTML(id, containerId, thread.root)
      : '';
    const repliesHTML = Array.isArray(thread && thread.replies) && thread.replies.length > 0
      ? `<div class="kc-comment-replies">${thread.replies.map(function (reply) {
          return renderCommentCardHTML(id, containerId, reply, currentUserId, isAdmin, 1);
        }).join('')}</div>`
      : '';

    return `
      <div class="kc-comment-thread" data-kc-thread-root-id="${_esc(rootId)}">
        ${renderCommentCardHTML(id, containerId, thread.root, currentUserId, isAdmin, 0)}
        ${replyComposer}
        ${repliesHTML}
      </div>
    `;
  }).join('');

  if (!container._kcLikeListenerAttached) {
    container._kcLikeListenerAttached = true;
    container.addEventListener('click', function (event) {
      const btn = event.target.closest('.kc-like-comment-btn');
      if (!btn) return;
      likeComment(btn.dataset.postId, btn.dataset.commentId, btn.dataset.container);
    });
  }

  if (!container._kcCommentActionsListenerAttached) {
    container._kcCommentActionsListenerAttached = true;
    container.addEventListener('click', function (event) {
      const actionBtn = event.target.closest('[data-kc-comment-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.kcCommentAction;
        const pid = actionBtn.dataset.postId;
        const cid = actionBtn.dataset.commentId;
        const ctr = actionBtn.dataset.container || 'commentsContainer';
        if (action === 'reply') {
          _openCommentReplyInline(pid, cid, ctr);
          return;
        }
        if (action === 'reply-submit') {
          const wrap = actionBtn.closest('.kc-comment-reply-composer');
          const textarea = wrap ? wrap.querySelector('textarea') : null;
          submitComment(pid, ctr, { parentId: cid, textarea: textarea, submitButton: actionBtn });
          return;
        }
        if (action === 'reply-cancel') {
          _closeCommentReplyInline(pid, cid, ctr);
          return;
        }
        if (action === 'edit') _openCommentEditInline(pid, cid, ctr);
        else if (action === 'delete') _confirmDeleteComment(pid, cid, ctr);
        else if (action === 'report') _openCommentReportModal(pid, cid, ctr);
        return;
      }

      const saveBtn = event.target.closest('[data-kc-comment-edit-save]');
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

      const cancelBtn = event.target.closest('[data-kc-comment-edit-cancel]');
      if (cancelBtn) {
        const pid3 = cancelBtn.dataset.postId;
        const ctr3 = cancelBtn.dataset.container || 'commentsContainer';
        renderComments(pid3, ctr3);
      }
    });
  }
}

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
      if (KCAPI && typeof KCAPI.invalidateCommentsCache === 'function') KCAPI.invalidateCommentsCache(id);
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
      if (!kcClient) { showToast('Nao foi possivel excluir.', 'error'); return; }
      const user = await KCAPI.getCurrentUser();
      let query = kcClient.from('comments').delete().eq('id', cid);
      const profile = window.KCAPI && typeof window.KCAPI.getMyProfile === 'function'
        ? await window.KCAPI.getMyProfile().catch(() => null) : null;
      const isAdm = !!(profile && profile.is_admin);
      if (!isAdm && user) query = query.eq('author_id', user.id);
      const { error } = await query;
      if (error) { showToast(error.message || 'Erro ao excluir comentario.', 'error'); return; }
      if (KCAPI && typeof KCAPI.invalidateCommentsCache === 'function') KCAPI.invalidateCommentsCache(id);
      if (KCAPI && typeof KCAPI.invalidatePostAnalyticsCache === 'function') KCAPI.invalidatePostAnalyticsCache(id);
      if (String(_kcActiveReplyState.parentId || '') === String(cid || '')) clearActiveReplyState();
      showToast('Comentario excluido.', 'info', 1800);
      renderComments(id, ctr);
    } catch (_) { showToast('Erro ao excluir comentario.', 'error'); }
    return;
  }

  const loadedComments = loadComments(id);
  const idsToDelete = new Set([String(cid)]);
  loadedComments.forEach(function (comment) {
    if (String(getCommentParentId(comment) || '') === String(cid || '')) {
      idsToDelete.add(String(comment.id));
    }
  });

  const comments = loadedComments.filter(function (comment) {
    return !idsToDelete.has(String(comment && comment.id));
  });

  if (String(_kcActiveReplyState.parentId || '') === String(cid || '')) clearActiveReplyState();
  saveComments(id, comments);
  showToast('Comentario excluido.', 'info', 1800);
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
    var cached = (KCAPI && typeof KCAPI.getCachedComments === 'function')
      ? KCAPI.getCachedComments(id, { allowStale: true })
      : null;
    var renderedSignature = '';
    var hasRendered = false;

    var identityPromise = Promise.all([
      (KCAPI && typeof KCAPI.getCurrentUser === 'function') ? KCAPI.getCurrentUser() : Promise.resolve(null),
      (KCAPI && typeof KCAPI.getMyProfile === 'function') ? KCAPI.getMyProfile().catch(function () { return null; }) : Promise.resolve(null),
    ]);

    function renderResolvedComments(comments, user, profile) {
      const list = Array.isArray(comments) ? comments : [];
      const currentUser = user || null;
      const currentProfile = profile || null;
      const canLike = !!(currentUser && currentUser.id);
      const currentUserId = currentUser && currentUser.id ? String(currentUser.id) : null;
      const isAdmin = !!(currentProfile && currentProfile.is_admin);
      const enriched = list.map(function (comment) { return { ...comment, _kcCanLike: canLike }; });
      _renderCommentList(id, containerId, enriched, currentUserId, isAdmin);
      renderedSignature = list.map(function (comment) {
        return [
          String(comment && (comment.id || '')).trim(),
          String(comment && (comment.parent_id || comment.parentId || '')).trim(),
          String(comment && (comment.updated_at || comment.created_at || '')).trim(),
          Number(comment && comment.likes) || 0,
          comment && (comment.liked_by_me || comment.likedByMe) ? 1 : 0,
          String(comment && (comment.body || comment.text || '')).trim(),
        ].join('~');
      }).join('|');
      hasRendered = true;
    }

    if (cached && Array.isArray(cached.data)) {
      identityPromise.then(function (results) {
        renderResolvedComments(cached.data, results[0], results[1]);
      }).catch(function () {
        renderResolvedComments(cached.data, null, null);
      });
    }

    var commentsRequest = (KCAPI && typeof KCAPI.refreshComments === 'function')
      ? KCAPI.refreshComments(id, { force: true })
      : KCAPI.getComments(id);

    Promise.all([commentsRequest, identityPromise]).then(function (results) {
      const comments = Array.isArray(results[0]) ? results[0] : [];
      const user = results[1][0] || null;
      const profile = results[1][1] || null;
      const nextSignature = comments.map(function (comment) {
        return [
          String(comment && (comment.id || '')).trim(),
          String(comment && (comment.parent_id || comment.parentId || '')).trim(),
          String(comment && (comment.updated_at || comment.created_at || '')).trim(),
          Number(comment && comment.likes) || 0,
          comment && (comment.liked_by_me || comment.likedByMe) ? 1 : 0,
          String(comment && (comment.body || comment.text || '')).trim(),
        ].join('~');
      }).join('|');
      if (!hasRendered || nextSignature !== renderedSignature) {
        renderResolvedComments(comments, user, profile);
      }
    }).catch(function () {
      if (!hasRendered) _renderCommentList(id, containerId, [], null, false);
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

function resolveCommentSubmitTextarea(id, options = {}) {
  if (options && options.textarea && typeof options.textarea === 'object') return options.textarea;
  const parentId = resolveCommentOptionParentId(options);
  if (parentId) {
    return document.querySelector(`[data-kc-reply-input="${_cssEsc(String(parentId))}"]`);
  }
  return document.querySelector(`textarea[data-post-id="${_cssEsc(id)}"]`) || document.getElementById('commentText');
}

function resolveCommentSubmitButton(options = {}) {
  if (options && options.submitButton && typeof options.submitButton === 'object') return options.submitButton;
  return document.getElementById('submitCommentButton');
}

function releaseCommentSubmitButton(button) {
  if (!button) return;
  button._kcSubmitting = false;
  button.disabled = false;
  button.style.opacity = '';
}

function recordCommentAudit(commentId) {
  try {
    const kcClient = KCSupabase && typeof KCSupabase.getClient === 'function'
      ? KCSupabase.getClient() : null;
    if (!kcClient) return;

    if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
      KCAPI.getCurrentUser().then(function (user) {
        kcClient.from('audit_log').insert({
          action: 'comment_created',
          entity_type: 'comments',
          entity_id: commentId,
          actor_id: user && user.id ? user.id : null,
        }).then(function () { }).catch(function () { });
      }).catch(function () { });
    }
  } catch (_) { }
}

async function submitComment(postId = null, containerId = 'commentsContainer', options = {}) {
  const resolved = postId != null ? String(postId) : getCurrentPostId();
  if (!resolved) {
    showToast('Nao foi possivel identificar esta publicacao', 'error');
    return;
  }

  const id = String(resolved);
  const parentId = resolveCommentOptionParentId(options);
  const textarea = resolveCommentSubmitTextarea(id, options);
  if (!textarea || !String(textarea.value || '').trim()) {
    showToast(parentId ? 'Por favor, escreva uma resposta' : 'Por favor, escreva um comentario', 'error');
    return;
  }

  const text = String(textarea.value || '').trim();
  const submitBtn = resolveCommentSubmitButton(options);
  if (submitBtn && submitBtn._kcSubmitting) return;
  if (submitBtn) { submitBtn._kcSubmitting = true; submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }

  if (KCAPI && KCAPI.ENV && KCAPI.ENV.driver === 'supabase') {
    const currentUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!currentUser) {
      releaseCommentSubmitButton(submitBtn);
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login' });
      } else {
        showToast('Faca login para comentar.', 'info');
      }
      return;
    }

    KCAPI.addComment(id, text, parentId ? { parentId: parentId } : {}).then(function (res) {
      releaseCommentSubmitButton(submitBtn);
      if (!(res && res.ok)) {
        const msg = (res && res.error && res.error.message) || 'Nao foi possivel comentar.';
        showToast(msg, 'error');
        return;
      }

      textarea.value = '';
      if (parentId) clearActiveReplyState();
      updateCommentPreview(id);
      renderComments(id, containerId);
      showToast(parentId ? 'Resposta enviada!' : 'Comentario enviado!', 'info', 1800);

      try {
        if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
          window.KCHomeCategories.trackEvent('comment', {
            post: resolveCommentTrackingPost(id)
          });
        }
      } catch (_) { }

      recordCommentAudit((res.data && res.data.id) ? String(res.data.id) : id);
    }).catch(function () {
      releaseCommentSubmitButton(submitBtn);
      showToast(parentId ? 'Erro ao enviar resposta.' : 'Erro ao enviar comentario.', 'error');
    });
    return;
  }

  if (isProductionRuntime()) {
    releaseCommentSubmitButton(submitBtn);
    showToast('Comentario bloqueado: em producao, use Supabase.', 'error');
    return;
  }

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
    : (sessionAuthorName || authorInput?.value?.trim() || 'Anonimo');
  const inserted = addComment(id, text, authorName, parentId ? { parentId: parentId } : {});
  releaseCommentSubmitButton(submitBtn);

  if (!inserted) {
    showToast('Nao foi possivel responder este comentario.', 'error');
    return;
  }

  textarea.value = '';
  if (parentId) clearActiveReplyState();
  updateCommentPreview(id);
  renderComments(id, containerId);
  showToast(parentId ? 'Resposta enviada!' : 'Comentario enviado!', 'info', 1800);
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
