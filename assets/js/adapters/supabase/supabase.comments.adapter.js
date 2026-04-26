
(function () {
  'use strict';
  // Sub-adapter de comments — registrado em window._KCSA.comments (v11.30.3)
  // Dependências resolvidas lazily via window._KCSA.getClient / getCurrentUser
  window._KCSA = window._KCSA || {};

  function getClient() {
    return (window._KCSA && typeof window._KCSA.getClient === 'function')
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return (window._KCSA && typeof window._KCSA.getCurrentUser === 'function')
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  // ── Constantes e helpers utilitários ──────────────────────────────────────

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isMissingTokenError(err, token) {
    if (!err || !token) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes(String(token).toLowerCase()) && msg.includes('does not exist');
  }

  function getUserDisplayNameForProfile(user) {
    const meta = (user && user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    const direct = meta.display_name || meta.full_name || meta.name || meta.username || meta.preferred_username;
    if (direct && String(direct).trim()) return String(direct).trim();
    const email = String((user && user.email) || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuário';
  }

  // ── Helpers internos de comentários ───────────────────────────────────────

  function resolveCommentParentIdFromOptions(options) {
    const raw = (options && typeof options === 'object' && !Array.isArray(options))
      ? (options.parentId || options.parent_id || null)
      : options;
    return String(raw || '').trim() || null;
  }

  function resolveCommentMutationErrorMessage(error, fallbackMessage) {
    const fallback = String(fallbackMessage || 'Nao foi possivel comentar.');
    const message = String(error && error.message || '').trim();
    if (!message) return fallback;

    const normalized = message.toLowerCase();
    if (
      (normalized.includes('coment') && normalized.includes('pai'))
      || normalized.includes('apenas 1 n')
      || normalized.includes('resposta deve pertencer')
      || normalized.includes('ja possui respostas')
    ) {
      return message;
    }

    return fallback;
  }

  function isCommentLikeAlreadyLiked(payload, error) {
    const code = String((error && error.code) || '').trim();
    const msg = String((error && error.message) || '').toLowerCase();
    const details = String((error && error.details) || '').toLowerCase();
    if (
      code === '23505'
      || msg.includes('duplicate')
      || msg.includes('comment_likes_comment_user_unique')
      || details.includes('comment_likes_comment_user_unique')
    ) {
      return true;
    }

    return !!(
      payload
      && typeof payload === 'object'
      && (payload.already_liked === true || payload.liked === false)
    );
  }

  // ── API: Buscar comentários de um post ────────────────────────────────────

  async function getComments(postId) {
    const client = getClient();
    if (!client) return [];
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return [];
    try {
      let result = await client
        .from('comments')
        .select('id, created_at, parent_id, author_id, author_name, body, likes, author_profile:profiles!comments_author_id_fkey(display_name, full_name, avatar_url)')
        .eq('post_id', uuid)
        .order('created_at', { ascending: true });

      if (result && result.error) {
        result = await client
          .from('comments')
          .select('id, created_at, parent_id, author_id, author_name, body, likes')
          .eq('post_id', uuid)
          .order('created_at', { ascending: true });
      }

      if (result && result.error) { console.error('[KCAPI][comments] getComments:', result.error); return []; }
      const rows = (result && Array.isArray(result.data)) ? result.data : [];

      let profilesById = Object.create(null);
      const missingProfileJoin = rows.some((row) => !row.author_profile && row.author_id);
      if (missingProfileJoin) {
        try {
          let profRes = await client
            .from('profiles')
            .select('id, display_name, full_name, avatar_url')
            .in('id', Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean))));

          if (profRes && profRes.error && isMissingTokenError(profRes.error, 'display_name')) {
            profRes = await client
              .from('profiles')
              .select('id, full_name, avatar_url')
              .in('id', Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean))));
          }

          if (profRes && Array.isArray(profRes.data)) {
            profRes.data.forEach((p) => {
              if (p && p.id) profilesById[p.id] = p;
            });
          }
        } catch (_) { }
      }

      const commentIds = rows.map((row) => row && row.id).filter(Boolean);
      let likedByMe = new Set();
      if (commentIds.length > 0) {
        try {
          const me = await getCurrentUser();
          if (me && me.id) {
            const likesRes = await client
              .from('comment_likes')
              .select('comment_id')
              .eq('user_id', me.id)
              .in('comment_id', commentIds);
            if (likesRes && Array.isArray(likesRes.data)) {
              likedByMe = new Set(likesRes.data.map((item) => item && item.comment_id).filter(Boolean));
            }
          }
        } catch (_) { }
      }

      return rows.map((row) => {
        const prof = row && row.author_profile ? row.author_profile : (row && row.author_id ? profilesById[row.author_id] : null);
        const resolvedName = String(
          (prof && (prof.display_name || prof.full_name))
          || row.display_name
          || row.full_name
          || row.author_name
          || 'Anônimo'
        ).trim() || 'Anônimo';
        return {
          ...row,
          author_name: resolvedName,
          author_avatar: String((prof && prof.avatar_url) || row.author_avatar || '').trim(),
          parent_id: String(row && row.parent_id || '').trim() || null,
          liked_by_me: likedByMe.has(row && row.id),
        };
      });
    } catch (e) {
      console.error('[KCAPI][comments] getComments exceção:', e);
      return [];
    }
  }

  // ── API: Adicionar comentário ──────────────────────────────────────────────

  async function addComment(postId, body, options = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para comentar.' } };
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return { ok: false, error: { message: 'Post inválido.' } };
    const text = String(body || '').trim().slice(0, 2000);
    const parentId = resolveCommentParentIdFromOptions(options);
    if (parentId && !UUID_RE.test(parentId)) return { ok: false, error: { message: 'Comentario pai invalido.' } };
    if (false && parentId && !UUID_RE.test(parentId)) {
      return { ok: false, error: { message: 'ComentÃ¡rio pai invÃ¡lido.' } };
    }
    if (!text) return { ok: false, error: { message: 'Comentário não pode ser vazio.' } };

    // Busca nome de exibição do profile
    let authorName = 'Anônimo';
    try {
      let profRes = await client
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profRes && profRes.error && isMissingTokenError(profRes.error, 'display_name')) {
        profRes = await client
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
      }

      const prof = profRes && profRes.data ? profRes.data : null;
      if (prof) authorName = String(prof.display_name || prof.full_name || '').trim();
    } catch (_) { }
    // Fallback para metadados de auth quando o perfil não tem nome (P1-A fix)
    if (!authorName) authorName = getUserDisplayNameForProfile(user);

    try {
      const { data, error } = await client
        .from('comments')
        .insert({ post_id: uuid, parent_id: parentId, author_id: user.id, author_name: authorName, body: text })
        .select('id, created_at, parent_id, author_id, author_name, body, likes')
        .maybeSingle();
      if (error) {
        console.error('[KCAPI][comments] addComment:', error);
        return { ok: false, error: { message: 'Não foi possível comentar.' } };
      }
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] addComment exceção:', e);
      return { ok: false, error: { message: 'Não foi possível comentar.' } };
    }
  }

  // ── API: Curtir comentário ─────────────────────────────────────────────────

  async function likeComment(commentId) {
    const client = getClient();
    if (!client) return { ok: false };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para curtir.' } };
    const uuid = (typeof commentId === 'string' && UUID_RE.test(commentId)) ? commentId : null;
    if (!uuid) return { ok: false };
    try {
      const { data, error } = await client.rpc('increment_comment_likes', { comment_uuid: uuid });
      if (error) {
        if (isCommentLikeAlreadyLiked(null, error)) {
          return { ok: true, alreadyLiked: true, data: { liked: false } };
        }
        console.error('[KCAPI][comments] likeComment:', error);
        return { ok: false };
      }

      if (isCommentLikeAlreadyLiked(data, null)) {
        return { ok: true, alreadyLiked: true, data };
      }

      const payloadOk = !data || data.ok !== false;
      if (!payloadOk) {
        const code = String(data && data.code || '').trim().toUpperCase();
        if (code === 'AUTH_REQUIRED') {
          return { ok: false, error: { message: 'Faça login para curtir.' }, code };
        }
        return { ok: false, error: { message: String(data.message || 'Não foi possível curtir.') }, code };
      }

      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] likeComment exceção:', e);
      return { ok: false };
    }
  }

  window._KCSA.comments = {
    getComments,
    addComment,
    likeComment,
  };
})();
