/*
  KinoCampus - kc-comments.shared.js
  Pure comment helpers, testable in Node (UMD).
  Extracted from kc-comments.js and extended for v9.1.1.
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
   * Resolve the display name for a user from user + profile data.
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

    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || '').trim();
      if (value) return value;
    }

    return '';
  }

  /**
   * Resolve a normalized parent_id from a raw comment object.
   */
  function getCommentParentId(comment) {
    if (!comment || typeof comment !== 'object') return null;
    return String(comment.parent_id || comment.parentId || '').trim() || null;
  }

  /**
   * Normalize comment fields for rendering.
   */
  function normalizeCommentForRender(comment) {
    if (!comment || typeof comment !== 'object') {
      return {
        id: null,
        authorId: null,
        author: 'Anonimo',
        avatar: '',
        text: '',
        parentId: null,
        timestamp: '',
        likes: 0,
        likedByMe: false,
        canLike: true,
      };
    }

    var profile = comment.author_profile || comment.profiles || null;
    var resolvedAuthor = (
      (profile && (profile.display_name || profile.full_name))
      || comment.display_name
      || comment.full_name
      || comment.author_name
      || comment.author
    );
    var normalizedAuthor = String(resolvedAuthor || '').trim();

    var resolvedAvatar = String(
      (profile && profile.avatar_url)
      || comment.author_avatar
      || comment.avatar_url
      || ''
    ).trim();

    return {
      id: comment.id || null,
      authorId: String(comment.user_id || comment.author_id || (profile && profile.id) || '').trim() || null,
      author: normalizedAuthor || 'Anonimo',
      avatar: resolvedAvatar,
      text: comment.body || comment.text || '',
      parentId: getCommentParentId(comment),
      timestamp: comment.created_at
        ? new Date(comment.created_at).toLocaleString('pt-BR')
        : (comment.timestamp || ''),
      likes: comment.likes || 0,
      likedByMe: !!(comment && (comment.liked_by_me || comment.likedByMe)),
      canLike: (comment && comment._kcCanLike !== false),
    };
  }

  /**
   * Return the comment that can receive a reply.
   * Only top-level comments are valid targets.
   */
  function resolveReplyTarget(comments, parentId) {
    var id = String(parentId || '').trim();
    if (!id || !Array.isArray(comments)) return null;

    for (var i = 0; i < comments.length; i += 1) {
      var comment = comments[i];
      if (!comment || String(comment.id || '').trim() !== id) continue;
      return getCommentParentId(comment) ? null : comment;
    }

    return null;
  }

  /**
   * Group comments into one-level threads while preserving input order.
   */
  function buildCommentThreads(comments) {
    var items = Array.isArray(comments) ? comments.filter(Boolean) : [];
    var roots = [];
    var repliesByParent = Object.create(null);

    for (var i = 0; i < items.length; i += 1) {
      var comment = items[i];
      var parentId = getCommentParentId(comment);
      var parent = parentId ? resolveReplyTarget(items, parentId) : null;

      if (parent && parent.id != null) {
        var bucketKey = String(parent.id);
        if (!Array.isArray(repliesByParent[bucketKey])) repliesByParent[bucketKey] = [];
        repliesByParent[bucketKey].push(comment);
        continue;
      }

      roots.push(comment);
    }

    return roots.map(function (root) {
      var rootId = String((root && root.id) || '').trim();
      return {
        root: root,
        replies: rootId && Array.isArray(repliesByParent[rootId]) ? repliesByParent[rootId].slice() : [],
      };
    });
  }

  /**
   * Generate the local storage key for comment likes.
   */
  function getLocalLikeKey(postId, commentId, userId) {
    return 'kc_comment_likes_' + postId + '_' + commentId + '_' + userId;
  }

  /**
   * Generate the local storage key for post comments.
   */
  function commentsStorageKey(postId) {
    return 'kc_comments_' + postId;
  }

  return {
    resolveCurrentUserDisplayName: resolveCurrentUserDisplayName,
    getCommentParentId: getCommentParentId,
    normalizeCommentForRender: normalizeCommentForRender,
    resolveReplyTarget: resolveReplyTarget,
    buildCommentThreads: buildCommentThreads,
    getLocalLikeKey: getLocalLikeKey,
    commentsStorageKey: commentsStorageKey,
  };
}));
