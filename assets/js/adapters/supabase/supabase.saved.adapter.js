/**
 * @file supabase.saved.adapter.js
 * @description Sub-adapter para o grupo saved — saved_posts (v11.30.6)
 * Extraído de supabase.adapter.js. Registra window._KCSA.saved.
 *
 * Dependências em runtime:
 *   - window._KCSA.getClient()         — via supabase.adapter.js
 *   - window._KCSA.getCurrentUser()    — via supabase.adapter.js
 *   - window._KCSA.posts.getPostById() — lazy, disponível após v11.30.7
 */
'use strict';

(function () {
  'use strict';

  window._KCSA = window._KCSA || {};

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function getSupabaseClient() {
    return window._KCSA && typeof window._KCSA.getClient === 'function'
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return window._KCSA && typeof window._KCSA.getCurrentUser === 'function'
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  // ── resolvePostUuidForSavedPosts ───────────────────────────────────────────
  // supabaseGetPostById ainda reside no adapter principal. Leitura lazy até v11.30.7.

  async function resolvePostUuidForSavedPosts(postId) {
    const raw = String(postId || '').trim();
    if (!raw) return null;
    if (UUID_RE.test(raw)) return raw;
    try {
      const getPostByIdFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function'
        ? window._KCSA.posts.getPostById : null;
      if (!getPostByIdFn) return null;
      const post = await getPostByIdFn(raw);
      const candidate = post && (post.uuid || post.id) ? String(post.uuid || post.id).trim() : '';
      return candidate && UUID_RE.test(candidate) ? candidate : null;
    } catch (_) {
      return null;
    }
  }

  // ── Helpers internos ───────────────────────────────────────────────────────

  function normalizeSaveKind(kind) {
    const value = String(kind || '').trim().toLowerCase();
    return ['favorite', 'later', 'highlight'].includes(value) ? value : '';
  }

  function normalizeSaveKinds(kinds) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    return Array.from(new Set(list.map(normalizeSaveKind).filter(Boolean)));
  }

  function mapSavedSummaryRow(row) {
    if (!row) return null;
    return {
      id: row.legacy_id || row.post_id || row.post_uuid,
      uuid: row.post_uuid || row.post_id || '',
      title: row.title || 'Sem título',
      created_at: row.created_at || null,
      status: row.status || 'published',
      visibility: row.visibility || 'public',
      module: row.module || '',
      category: row.category || '',
      save_kinds: normalizeSaveKinds(row.save_kinds),
      saved_at: row.saved_at || null,
    };
  }

  function aggregateSavedRows(rows, options = {}) {
    const includeStatus = !!options.includeStatus;
    const onlyPublished = !!options.onlyPublished;
    const byPost = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const post = row && row.post ? row.post : {};
      const uuid = String(post.id || row.post_id || '').trim();
      if (!uuid) return;
      const status = String(post.status || 'published').toLowerCase();
      if (onlyPublished && status !== 'published') return;

      const saveKind = normalizeSaveKind(row.kind);
      const savedAt = row.updated_at || row.created_at || null;
      const existing = byPost.get(uuid);
      if (!existing) {
        byPost.set(uuid, {
          id: post.legacy_id || post.id,
          uuid,
          title: post.title || 'Sem título',
          created_at: post.created_at || null,
          status: includeStatus ? status : 'published',
          visibility: String(post.visibility || 'public').toLowerCase(),
          module: post.module || '',
          category: post.category || '',
          save_kinds: saveKind ? [saveKind] : [],
          saved_at: savedAt,
        });
        return;
      }

      if (saveKind && !existing.save_kinds.includes(saveKind)) existing.save_kinds.push(saveKind);
      if (savedAt && (!existing.saved_at || new Date(savedAt) > new Date(existing.saved_at))) {
        existing.saved_at = savedAt;
      }
    });

    return Array.from(byPost.values()).sort((left, right) => {
      const leftAt = left.saved_at ? new Date(left.saved_at).getTime() : 0;
      const rightAt = right.saved_at ? new Date(right.saved_at).getTime() : 0;
      return rightAt - leftAt;
    });
  }

  function paginateList(items, page, limit) {
    const from = (page - 1) * limit;
    return items.slice(from, from + limit);
  }

  async function fetchSavedRowsFallback(client, userId, params = {}) {
    const kind = normalizeSaveKind(params.kind);
    let query = client
      .from('saved_posts')
      .select('kind, created_at, updated_at, post:posts!saved_posts_post_id_fkey(id, legacy_id, title, created_at, status, visibility, module, category)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (kind) query = query.eq('kind', kind);
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  // ── API multi-kind (pública) ───────────────────────────────────────────────

  async function getSavedPostStateMulti(postId) {
    const client = getSupabaseClient();
    if (!client) return { kinds: [] };
    const user = await getCurrentUser();
    if (!user) return { kinds: [] };

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { kinds: [] };

    try {
      const { data, error } = await client
        .from('saved_posts')
        .select('kind')
        .eq('post_id', uuid)
        .eq('user_id', user.id);

      if (error) {
        console.error('[KCAPI][saved_posts] getSavedPostStateMulti:', error);
        return { kinds: [] };
      }

      return { kinds: normalizeSaveKinds((Array.isArray(data) ? data : []).map((row) => row && row.kind)) };
    } catch (e) {
      console.error('[KCAPI][saved_posts] getSavedPostStateMulti exceção:', e);
      return { kinds: [] };
    }
  }

  async function clearSavedPostStateMulti(postId, kind) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para remover salvos.' } };

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'Publicação inválida.' } };

    try {
      let query = client
        .from('saved_posts')
        .delete()
        .eq('post_id', uuid)
        .eq('user_id', user.id);

      const saveKind = normalizeSaveKind(kind);
      if (saveKind) query = query.eq('kind', saveKind);
      const { error } = await query;
      if (error) {
        console.error('[KCAPI][saved_posts] clearSavedPostStateMulti:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível remover o item salvo.' } };
      }
      return { ok: true, cleared: saveKind || 'all' };
    } catch (e) {
      console.error('[KCAPI][saved_posts] clearSavedPostStateMulti exceção:', e);
      return { ok: false, error: { message: 'Não foi possível remover o item salvo.' } };
    }
  }

  async function setSavedPostStateMulti(postId, kind, enabled) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para salvar publicações.' } };

    const saveKind = normalizeSaveKind(kind);
    if (!saveKind) {
      return { ok: false, error: { message: 'Tipo de salvamento inválido.' } };
    }

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'Publicação inválida.' } };

    const shouldEnable = enabled !== false;
    try {
      if (shouldEnable) {
        const { data, error } = await client
          .from('saved_posts')
          .upsert({
            user_id: user.id,
            post_id: uuid,
            kind: saveKind,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,post_id,kind',
          })
          .select('id, kind')
          .maybeSingle();

        if (error) {
          console.error('[KCAPI][saved_posts] setSavedPostStateMulti:', error);
          return { ok: false, error: { message: error.message || 'Não foi possível salvar a publicação.' } };
        }

        return { ok: true, data: data || { kind: saveKind }, enabled: true };
      }

      return await clearSavedPostStateMulti(postId, saveKind);
    } catch (e) {
      console.error('[KCAPI][saved_posts] setSavedPostStateMulti exceção:', e);
      return { ok: false, error: { message: 'Não foi possível salvar a publicação.' } };
    }
  }

  async function getMySavedPostsMulti(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const kind = normalizeSaveKind(params.kind);

    try {
      const rpc = await client.rpc('kc_get_my_saved_posts', { p_kind: kind || null, p_page: page, p_limit: limit });
      if (rpc && !rpc.error) {
        return (Array.isArray(rpc.data) ? rpc.data : []).map(mapSavedSummaryRow).filter(Boolean);
      }
    } catch (_) { }

    try {
      const rows = await fetchSavedRowsFallback(client, user.id, { kind });
      return paginateList(aggregateSavedRows(rows, { includeStatus: true }), page, limit);
    } catch (e) {
      console.error('[KCAPI][saved_posts] getMySavedPostsMulti exceção:', e);
      return [];
    }
  }

  async function getMySavedPostsCount(params = {}) {
    const client = getSupabaseClient();
    if (!client) return 0;
    const user = await getCurrentUser();
    if (!user) return 0;

    const kind = normalizeSaveKind(params.kind);
    try {
      const rpc = await client.rpc('kc_get_my_saved_posts_count', { p_kind: kind || null });
      if (!(rpc && rpc.error)) return Number(rpc && rpc.data) || 0;
    } catch (_) { }

    try {
      const rows = await fetchSavedRowsFallback(client, user.id, { kind });
      return aggregateSavedRows(rows, { includeStatus: true }).length;
    } catch (e) {
      console.error('[KCAPI][saved_posts] getMySavedPostsCount exceção:', e);
      return 0;
    }
  }

  async function getProfileHighlightsMulti(profileId, params = {}) {
    const client = getSupabaseClient();
    const author = String(profileId || '').trim();
    if (!client || !author) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));

    try {
      const rpc = await client.rpc('kc_get_profile_highlights', { p_profile_id: author, p_page: page, p_limit: limit });
      if (rpc && !rpc.error) {
        return (Array.isArray(rpc.data) ? rpc.data : []).map(mapSavedSummaryRow).filter(Boolean);
      }
    } catch (_) { }

    try {
      const rows = await fetchSavedRowsFallback(client, author, { kind: 'highlight' });
      return paginateList(aggregateSavedRows(rows, { includeStatus: false, onlyPublished: true }), page, limit);
    } catch (e) {
      console.error('[KCAPI][saved_posts] getProfileHighlightsMulti exceção:', e);
      return [];
    }
  }

  async function getProfileHighlightsCount(profileId, params = {}) {
    const client = getSupabaseClient();
    const author = String(profileId || '').trim();
    if (!client || !author) return 0;

    try {
      const rpc = await client.rpc('kc_get_profile_highlights_count', { p_profile_id: author });
      if (!(rpc && rpc.error)) return Number(rpc && rpc.data) || 0;
    } catch (_) { }

    try {
      const rows = await fetchSavedRowsFallback(client, author, { ...params, kind: 'highlight' });
      return aggregateSavedRows(rows, { includeStatus: false, onlyPublished: true }).length;
    } catch (e) {
      console.error('[KCAPI][saved_posts] getProfileHighlightsCount exceção:', e);
      return 0;
    }
  }

  // ── Namespace ──────────────────────────────────────────────────────────────

  window._KCSA.saved = {
    getSavedPostState: getSavedPostStateMulti,
    setSavedPostState: setSavedPostStateMulti,
    clearSavedPostState: clearSavedPostStateMulti,
    getMySavedPosts: getMySavedPostsMulti,
    getMySavedPostsCount,
    getProfileHighlights: getProfileHighlightsMulti,
    getProfileHighlightsCount,
  };

})();
