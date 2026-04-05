const CommentsShared = require('../assets/js/kc-comments.shared.js');

describe('KCCommentsShared - pure comment helpers', () => {
  describe('resolveCurrentUserDisplayName', () => {
    test('profile.display_name has highest priority', () => {
      const user = { email: 'a@b.com', user_metadata: { full_name: 'Meta Name' } };
      const profile = { display_name: 'Display', full_name: 'Full' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, profile)).toBe('Display');
    });

    test('profile.full_name is fallback when display_name is empty', () => {
      const user = { email: 'a@b.com' };
      const profile = { full_name: 'Profile Full' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, profile)).toBe('Profile Full');
    });

    test('user.user_metadata.full_name is next in chain', () => {
      const user = { user_metadata: { full_name: 'Metadata Full' }, email: 'x@y.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('Metadata Full');
    });

    test('user.email is the last fallback', () => {
      const user = { email: 'last@resort.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('last@resort.com');
    });

    test('returns empty string when nothing useful exists', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName({}, {})).toBe('');
    });

    test('handles null user and profile', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName(null, null)).toBe('');
    });

    test('ignores non-object inputs', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName('string', 123)).toBe('');
      expect(CommentsShared.resolveCurrentUserDisplayName(42, false)).toBe('');
    });

    test('ignores malformed user_metadata values', () => {
      const user = { user_metadata: 'not-an-object', email: 'fall@back.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('fall@back.com');
    });
  });

  describe('normalizeCommentForRender', () => {
    test('normalizes a Supabase comment with author_profile', () => {
      const comment = {
        id: 'c1',
        user_id: 'u1',
        body: 'Ola mundo',
        created_at: '2025-01-15T10:00:00Z',
        likes: 3,
        liked_by_me: true,
        parent_id: 'root-1',
        author_profile: { display_name: 'Yan', avatar_url: 'https://img.com/a.png' }
      };
      const result = CommentsShared.normalizeCommentForRender(comment);
      expect(result.id).toBe('c1');
      expect(result.authorId).toBe('u1');
      expect(result.author).toBe('Yan');
      expect(result.avatar).toBe('https://img.com/a.png');
      expect(result.text).toBe('Ola mundo');
      expect(result.likes).toBe(3);
      expect(result.likedByMe).toBe(true);
      expect(result.parentId).toBe('root-1');
    });

    test('normalizes a comment with author field directly', () => {
      const comment = {
        id: 'c2',
        author: 'Carlos',
        text: 'Bom anuncio',
        likes: 0,
      };
      const result = CommentsShared.normalizeCommentForRender(comment);
      expect(result.author).toBe('Carlos');
      expect(result.text).toBe('Bom anuncio');
    });

    test('returns Anonimo when no author is found', () => {
      const result = CommentsShared.normalizeCommentForRender({ id: 'c3', body: 'Sem autor' });
      expect(result.author).toBe('Anonimo');
    });

    test('handles null and undefined values', () => {
      expect(CommentsShared.normalizeCommentForRender(null).author).toBe('Anonimo');
      expect(CommentsShared.normalizeCommentForRender(undefined).id).toBe(null);
    });

    test('extracts avatar from profile.avatar_url', () => {
      const comment = {
        id: 'c4',
        author_profile: { display_name: 'Ana', avatar_url: 'https://cdn.com/ana.jpg' }
      };
      expect(CommentsShared.normalizeCommentForRender(comment).avatar).toBe('https://cdn.com/ana.jpg');
    });

    test('uses empty avatar when no avatar source exists', () => {
      expect(CommentsShared.normalizeCommentForRender({ id: 'c5', author: 'Test' }).avatar).toBe('');
    });

    test('maps liked_by_me and likedByMe correctly', () => {
      expect(CommentsShared.normalizeCommentForRender({ liked_by_me: false }).likedByMe).toBe(false);
      expect(CommentsShared.normalizeCommentForRender({ liked_by_me: true }).likedByMe).toBe(true);
      expect(CommentsShared.normalizeCommentForRender({ likedByMe: true }).likedByMe).toBe(true);
    });

    test('respects the _kcCanLike flag', () => {
      expect(CommentsShared.normalizeCommentForRender({ _kcCanLike: false }).canLike).toBe(false);
      expect(CommentsShared.normalizeCommentForRender({ _kcCanLike: true }).canLike).toBe(true);
      expect(CommentsShared.normalizeCommentForRender({}).canLike).toBe(true);
    });
  });

  describe('thread helpers', () => {
    test('getCommentParentId normalizes snake_case and camelCase', () => {
      expect(CommentsShared.getCommentParentId({ parent_id: 'root-a' })).toBe('root-a');
      expect(CommentsShared.getCommentParentId({ parentId: 'root-b' })).toBe('root-b');
      expect(CommentsShared.getCommentParentId({})).toBeNull();
    });

    test('resolveReplyTarget accepts only top-level comments', () => {
      const comments = [
        { id: 'c1', body: 'Raiz' },
        { id: 'c2', body: 'Resposta', parent_id: 'c1' },
      ];

      expect(CommentsShared.resolveReplyTarget(comments, 'c1')).toEqual(comments[0]);
      expect(CommentsShared.resolveReplyTarget(comments, 'c2')).toBeNull();
      expect(CommentsShared.resolveReplyTarget(comments, 'missing')).toBeNull();
    });

    test('buildCommentThreads groups one-level replies under their root', () => {
      const comments = [
        { id: 'c1', body: 'Primeiro' },
        { id: 'c2', body: 'Resposta ao primeiro', parent_id: 'c1' },
        { id: 'c3', body: 'Segundo' },
        { id: 'c4', body: 'Resposta ao segundo', parent_id: 'c3' },
      ];

      const result = CommentsShared.buildCommentThreads(comments);
      expect(result).toHaveLength(2);
      expect(result[0].root.id).toBe('c1');
      expect(result[0].replies.map((item) => item.id)).toEqual(['c2']);
      expect(result[1].root.id).toBe('c3');
      expect(result[1].replies.map((item) => item.id)).toEqual(['c4']);
    });

    test('buildCommentThreads keeps orphaned or nested replies visible as roots', () => {
      const comments = [
        { id: 'c1', body: 'Raiz' },
        { id: 'c2', body: 'Resposta valida', parent_id: 'c1' },
        { id: 'c3', body: 'Resposta de resposta', parent_id: 'c2' },
        { id: 'c4', body: 'Orfa', parent_id: 'missing' },
      ];

      const result = CommentsShared.buildCommentThreads(comments);
      expect(result.map((thread) => thread.root.id)).toEqual(['c1', 'c3', 'c4']);
      expect(result[0].replies.map((item) => item.id)).toEqual(['c2']);
      expect(result[1].replies).toEqual([]);
      expect(result[2].replies).toEqual([]);
    });
  });

  describe('storage helpers', () => {
    test('getLocalLikeKey returns the expected format', () => {
      expect(CommentsShared.getLocalLikeKey('p1', 'c1', 'u1')).toBe('kc_comment_likes_p1_c1_u1');
    });

    test('commentsStorageKey returns the expected format', () => {
      expect(CommentsShared.commentsStorageKey('post-abc')).toBe('kc_comments_post-abc');
    });
  });
});
