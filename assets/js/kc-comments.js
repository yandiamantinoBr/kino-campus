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

function _renderCommentList(id, containerId, comments) {
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

  container.innerHTML = comments.map(function (raw) {
    const c = normalizeCommentForRender(raw);
    const likeDisabled = !!c.likedByMe || !c.canLike;
    const likeStateColor = likeDisabled ? 'var(--kc-accent, #3b82f6)' : 'var(--kc-text-dark-secondary)';
    const likeStateWeight = likeDisabled ? '600' : '400';
    return `
    <div class="kc-comment" style="padding: 15px; border-bottom: 1px solid var(--kc-border-dark); margin-bottom: 10px;">
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <img src="${_esc(c.avatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(c.author)))}" alt="${_esc(c.author)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background-color: var(--kc-surface-dark);">
        <div style="flex: 1;">
          <div style="font-weight: bold;">${_esc(c.author)}</div>
          <div style="font-size: 0.85em; color: var(--kc-text-dark-secondary);">${_esc(c.timestamp)}</div>
        </div>
      </div>
      <div style="margin-left: 50px; margin-bottom: 10px; white-space: normal; line-height: 1.6;">${renderCommentMarkdownInline(c.text)}</div>
      <div style="margin-left: 50px; display: flex; gap: 15px; font-size: 0.9em;">
        <button data-post-id="${_esc(String(id))}" data-comment-id="${_esc(String(c.id))}" data-container="${_esc(containerId)}" class="kc-like-comment-btn ${likeDisabled ? 'is-liked' : ''}" ${likeDisabled ? 'disabled aria-disabled="true"' : ''} style="background: none; border: none; cursor: ${likeDisabled ? 'not-allowed' : 'pointer'}; color: ${likeStateColor}; font-weight: ${likeStateWeight}; opacity: ${likeDisabled ? '0.95' : '1'};">
          <i class="fas fa-thumbs-up"></i> ${c.likes || 0}${c.likedByMe ? ' • Curtido' : (c.canLike ? '' : ' • Entrar para curtir')}
        </button>
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
}

function renderComments(postId, containerId = 'commentsContainer') {
  bindCommentPreviewSync();
  const id = String(postId);

  // Driver Supabase: carrega async, depois renderiza
  if (isSupabaseRuntime()) {
    Promise.all([
      KCAPI.getComments(id),
      (KCAPI && typeof KCAPI.getCurrentUser === 'function') ? KCAPI.getCurrentUser() : Promise.resolve(null),
    ]).then(function (results) {
      const comments = Array.isArray(results[0]) ? results[0] : [];
      const user = results[1] || null;
      const canLike = !!(user && user.id);
      const enriched = comments.map(function (comment) { return { ...comment, _kcCanLike: canLike }; });
      _renderCommentList(id, containerId, enriched);
    }).catch(function () {
      _renderCommentList(id, containerId, []);
    }).finally(function () {
      updateCommentPreview(id);
    });
    return;
  }

  // Driver local/dev: localStorage + chave de like por usuário
  Promise.resolve(resolveCurrentLikeUserId()).then(function (userId) {
    const comments = (loadComments(id) || []).map(function (comment) {
      const likeKey = getLocalLikeKey(id, comment && comment.id, userId);
      let likedByMe = false;
      try { likedByMe = !!localStorage.getItem(likeKey); } catch (_) { }
      return { ...comment, likedByMe };
    });
    _renderCommentList(id, containerId, comments);
  }).catch(function () {
    _renderCommentList(id, containerId, loadComments(id));
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

  // Driver Supabase: persiste via KCAPI (async)
  if (KCAPI && KCAPI.ENV && KCAPI.ENV.driver === 'supabase') {
    KCAPI.addComment(id, text).then(function (res) {
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
        showToast(msg, 'error');
      }
    }).catch(function () {
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
