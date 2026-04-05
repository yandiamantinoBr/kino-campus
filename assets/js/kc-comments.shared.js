/*
  KinoCampus — kc-comments.shared.js
  Funções puras de comentários, testáveis em Node (UMD).
  Extraído de kc-comments.js (v9.0.2).
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCCommentsShared = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Resolve o display_name de um usuário a partir de user + profile.
   */
  function resolveCurrentUserDisplayName(user, profile) {
    var normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    var normalizedUser = (user && typeof user === 'object') ? user : null;
    var userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;
    var candidates = [
      normalizedProfile && normalizedProfile.display_name,
      normalizedProfile && normalizedProfile.full_name,
      userMetadata && userMetadata.full_name,
      normalizedUser && normalizedUser.display_name,
      normalizedUser && normalizedUser.full_name,
      normalizedUser && normalizedUser.email,
    ];

    for (var i = 0; i < candidates.length; i++) {
      var value = String(candidates[i] || '').trim();
      if (value) return value;
    }

    return '';
  }

  /**
   * Normaliza campos de um comentário para renderização.
   */
  function normalizeCommentForRender(c) {
    if (!c || typeof c !== 'object') {
      return {
        id: null, authorId: null, author: 'Anônimo', avatar: '',
        text: '', timestamp: '', likes: 0, likedByMe: false, canLike: true,
      };
    }

    var profile = c.author_profile || c.profiles || null;
    var resolvedAuthor = (
      (profile && (profile.display_name || profile.full_name))
      || c.display_name
      || c.full_name
      || c.author_name
      || c.author
    );
    var normalizedAuthor = String(resolvedAuthor || '').trim();

    var resolvedAvatar = String(
      (profile && profile.avatar_url)
      || c.author_avatar
      || c.avatar_url
      || ''
    ).trim();

    return {
      id: c.id || null,
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

  /**
   * Gera a chave de storage para likes locais.
   */
  function getLocalLikeKey(postId, commentId, userId) {
    return 'kc_comment_likes_' + postId + '_' + commentId + '_' + userId;
  }

  /**
   * Gera a chave de storage para comentários locais.
   */
  function commentsStorageKey(postId) {
    return 'kc_comments_' + postId;
  }

  return {
    resolveCurrentUserDisplayName: resolveCurrentUserDisplayName,
    normalizeCommentForRender: normalizeCommentForRender,
    getLocalLikeKey: getLocalLikeKey,
    commentsStorageKey: commentsStorageKey,
  };
}));
