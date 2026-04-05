const CommentsShared = require('../assets/js/kc-comments.shared.js');

describe('KCCommentsShared - Funcoes puras de comentarios', () => {

  describe('resolveCurrentUserDisplayName', () => {
    test('profile.display_name tem prioridade sobre tudo', () => {
      const user = { email: 'a@b.com', user_metadata: { full_name: 'Meta Name' } };
      const profile = { display_name: 'Display', full_name: 'Full' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, profile)).toBe('Display');
    });

    test('profile.full_name e fallback quando display_name esta vazio', () => {
      const user = { email: 'a@b.com' };
      const profile = { full_name: 'Profile Full' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, profile)).toBe('Profile Full');
    });

    test('user.user_metadata.full_name e proximo na cadeia', () => {
      const user = { user_metadata: { full_name: 'Metadata Full' }, email: 'x@y.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('Metadata Full');
    });

    test('user.email e ultimo recurso', () => {
      const user = { email: 'last@resort.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('last@resort.com');
    });

    test('retorna string vazia se nada encontrado', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName({}, {})).toBe('');
    });

    test('lida com user null e profile null', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName(null, null)).toBe('');
    });

    test('lida com inputs nao-objeto (string, number)', () => {
      expect(CommentsShared.resolveCurrentUserDisplayName('string', 123)).toBe('');
      expect(CommentsShared.resolveCurrentUserDisplayName(42, false)).toBe('');
    });

    test('ignora user_metadata se nao for objeto', () => {
      const user = { user_metadata: 'not-an-object', email: 'fall@back.com' };
      expect(CommentsShared.resolveCurrentUserDisplayName(user, null)).toBe('fall@back.com');
    });
  });

  describe('normalizeCommentForRender', () => {
    test('normaliza comentario Supabase com author_profile', () => {
      const c = {
        id: 'c1',
        user_id: 'u1',
        body: 'Ola mundo',
        created_at: '2025-01-15T10:00:00Z',
        likes: 3,
        liked_by_me: true,
        author_profile: { display_name: 'Yan', avatar_url: 'https://img.com/a.png' }
      };
      const result = CommentsShared.normalizeCommentForRender(c);
      expect(result.id).toBe('c1');
      expect(result.authorId).toBe('u1');
      expect(result.author).toBe('Yan');
      expect(result.avatar).toBe('https://img.com/a.png');
      expect(result.text).toBe('Ola mundo');
      expect(result.likes).toBe(3);
      expect(result.likedByMe).toBe(true);
    });

    test('normaliza comentario com campo author direto', () => {
      const c = {
        id: 'c2',
        author: 'Carlos',
        text: 'Bom anuncio',
        likes: 0,
      };
      const result = CommentsShared.normalizeCommentForRender(c);
      expect(result.author).toBe('Carlos');
      expect(result.text).toBe('Bom anuncio');
    });

    test('retorna Anonimo quando nenhum autor encontrado', () => {
      const c = { id: 'c3', body: 'Sem autor' };
      const result = CommentsShared.normalizeCommentForRender(c);
      expect(result.author).toBe('An\u00f4nimo');
    });

    test('lida com null e undefined', () => {
      expect(CommentsShared.normalizeCommentForRender(null).author).toBe('An\u00f4nimo');
      expect(CommentsShared.normalizeCommentForRender(undefined).id).toBe(null);
    });

    test('extrai avatar de profile.avatar_url', () => {
      const c = {
        id: 'c4',
        author_profile: { display_name: 'Ana', avatar_url: 'https://cdn.com/ana.jpg' }
      };
      expect(CommentsShared.normalizeCommentForRender(c).avatar).toBe('https://cdn.com/ana.jpg');
    });

    test('avatar vazio quando nenhum campo de avatar existe', () => {
      const c = { id: 'c5', author: 'Test' };
      expect(CommentsShared.normalizeCommentForRender(c).avatar).toBe('');
    });

    test('liked_by_me boolean funciona corretamente', () => {
      expect(CommentsShared.normalizeCommentForRender({ liked_by_me: false }).likedByMe).toBe(false);
      expect(CommentsShared.normalizeCommentForRender({ liked_by_me: true }).likedByMe).toBe(true);
      expect(CommentsShared.normalizeCommentForRender({ likedByMe: true }).likedByMe).toBe(true);
    });

    test('respeita flag _kcCanLike', () => {
      expect(CommentsShared.normalizeCommentForRender({ _kcCanLike: false }).canLike).toBe(false);
      expect(CommentsShared.normalizeCommentForRender({ _kcCanLike: true }).canLike).toBe(true);
      expect(CommentsShared.normalizeCommentForRender({}).canLike).toBe(true);
    });
  });

  describe('getLocalLikeKey', () => {
    test('retorna formato correto da chave', () => {
      expect(CommentsShared.getLocalLikeKey('p1', 'c1', 'u1'))
        .toBe('kc_comment_likes_p1_c1_u1');
    });
  });

  describe('commentsStorageKey', () => {
    test('retorna formato correto da chave', () => {
      expect(CommentsShared.commentsStorageKey('post-abc'))
        .toBe('kc_comments_post-abc');
    });
  });
});
