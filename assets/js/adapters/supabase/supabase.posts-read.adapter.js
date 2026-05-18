/**
 * @file supabase.posts-read.adapter.js
 * @description Sub-adapter para o grupo posts-read (v11.30.7)
 * Extraído de supabase.adapter.js. Registra window._KCSA.posts (funções de leitura).
 *
 * Dependências em runtime:
 *   - window._KCSA.getClient()          — via supabase.adapter.js
 *   - window._KCSA.getCurrentUser()     — via supabase.adapter.js
 *   - window.KCAPI.normalizePost()      — lazy, lido em doNormalizePost()
 *   - window.KCAPI.ENV                  — lazy, lido em logAuthorDiagnosticsDev()
 *   - window.KCAPI.rankRelatedPosts()   — lazy, global
 *   - window.KCSupabase                 — global facade
 *   - window.KC_CONSTANTS               — global
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

  function doNormalizePost(p) {
    const fn = window.KCAPI && typeof window.KCAPI.normalizePost === 'function'
      ? window.KCAPI.normalizePost : null;
    return fn ? fn(p) : p;
  }

  // ── Helpers de mapeamento de posts ────────────────────────────────────────

  function mergeMetadataSafe(target, metadata) {
    const base = target || {};
    const meta = (metadata && typeof metadata === 'object') ? metadata : {};
    for (const k of Object.keys(meta)) {
      if (k in base) continue;
      base[k] = meta[k];
    }
    return base;
  }

  function pickFirstNonEmpty(values) {
    if (!Array.isArray(values)) return '';
    for (const item of values) {
      const value = String(item == null ? '' : item).trim();
      if (value) return value;
    }
    return '';
  }

  function resolveNormalizedAuthorName(author, metadata, legacyName) {
    return pickFirstNonEmpty([
      author && author.display_name,
      author && author.full_name,
      metadata && metadata.autorNome,
      legacyName,
      'Autor',
    ]);
  }

  function resolveNormalizedAuthorAvatar(author, metadata, authorName, legacyAvatar) {
    const direct = pickFirstNonEmpty([
      author && author.avatar_url,
      metadata && metadata.autorAvatar,
      legacyAvatar,
    ]);
    if (direct) return direct;
    return (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ccircle cx=%2750%27 cy=%2750%27 r=%2750%27 fill=%27%23ff6b00%27/%3E%3Ccircle cx=%2750%27 cy=%2738%27 r=%2714%27 fill=%27white%27/%3E%3Cellipse cx=%2750%27 cy=%2772%27 rx=%2722%27 ry=%2716%27 fill=%27white%27/%3E%3C/svg%3E';
  }

  function logAuthorDiagnosticsDev(payload) {
    const ENV = window.KCAPI && window.KCAPI.ENV;
    if (ENV && ENV.isProduction) return;
    try {
      console.debug('[KCAPI][Author][diagnostics]', payload);
    } catch (_) { }
  }

  function mapSupabasePost(row, options) {
    if (!row) return null;

    const opts = (options && typeof options === 'object') ? options : {};
    const allImages = !!opts.allImages;

    const author = row.profiles || null;
    // Compat: schema pode usar post_media (padrão) ou post_images (variante)
    const media = Array.isArray(row.post_media)
      ? row.post_media
      : (Array.isArray(row.post_images) ? row.post_images : []);

    const items = media.filter((m) => m && m.url);
    let ordered = items.slice();

    // Ordenação por sort_order (quando existir). Se não existir, prioriza capa.
    const hasSortOrder = ordered.some((m) => (m && (m.sort_order != null || m.sortOrder != null)));
    if (hasSortOrder) {
      ordered.sort((a, b) => {
        const av = (a && (a.sort_order != null ? a.sort_order : a.sortOrder));
        const bv = (b && (b.sort_order != null ? b.sort_order : b.sortOrder));
        const an = (typeof av === 'number' && isFinite(av)) ? av : 1e9;
        const bn = (typeof bv === 'number' && isFinite(bv)) ? bv : 1e9;
        return an - bn;
      });
    } else {
      ordered.sort((a, b) => {
        const ac = (a && a.is_cover) ? 1 : 0;
        const bc = (b && b.is_cover) ? 1 : 0;
        if (ac !== bc) return bc - ac; // cover(true) vem primeiro
        return 0;
      });
    }

    const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const fallbackImageUrl = pickFirstNonEmpty([
      row.image_url,
      row.imageUrl,
      metadata && metadata.cover_url,
      metadata && metadata.coverUrl,
      metadata && metadata.image_url,
      metadata && metadata.imageUrl,
    ]);

    let imageUrls = [];
    if (allImages) {
      const set = new Set();
      ordered.forEach((m) => {
        if (m && m.url) set.add(String(m.url));
      });
      if (!set.size && fallbackImageUrl) set.add(String(fallbackImageUrl));
      imageUrls = Array.from(set);
    } else {
      const cover = ordered.find((m) => m && m.is_cover && m.url) || ordered.find((m) => m && m.url) || null;
      imageUrls = (cover && cover.url) ? [String(cover.url)] : (fallbackImageUrl ? [String(fallbackImageUrl)] : []);
    }

    const authorId = row.author_id || (author && author.id) || null;
    const categoriaLabel = (metadata && (metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel))
      ? String(metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel)
      : (row.category || "");

    // Saída híbrida (compatível com KCAPI.normalizePost + views legadas):
    // - snake_case e camelCase para campos novos
    // - campos PT-BR usados pelo UI (titulo, descricao, preco, modulo, categoria, timestamp)
    const authorVerified = !!(author && author.verified);
    const normalizedAuthorProfile = (author && typeof author === 'object')
      ? {
          ...author,
          legacy_id: author.legacy_id || null,
          legacyId: author.legacyId || author.legacy_id || null,
        }
      : null;

    const legacyId = (row.legacy_id == null) ? null : String(row.legacy_id).trim();
    const normalizedAuthorName = resolveNormalizedAuthorName(author, metadata, row.author_name || row.autor || row.author || '');
    const normalizedAuthorAvatar = resolveNormalizedAuthorAvatar(author, metadata, normalizedAuthorName, row.author_avatar || row.autorAvatar || row.authorAvatar || '');
    const ratingAverage = (author && author.rating_avg != null && author.rating_avg !== '')
      ? Number(author.rating_avg)
      : null;
    const ratingCount = Math.max(0, parseInt(String(author && author.rating_count != null ? author.rating_count : 0), 10) || 0);

    if (authorId) {
      const hasProfileName = !!pickFirstNonEmpty([author && author.display_name, author && author.full_name]);
      const hasProfileAvatar = !!pickFirstNonEmpty([author && author.avatar_url]);
      if (!hasProfileName || !hasProfileAvatar) {
        logAuthorDiagnosticsDev({
          postId: row.id || null,
          authorId,
          missingName: !hasProfileName,
          missingAvatar: !hasProfileAvatar,
          metadataHasAutorNome: !!pickFirstNonEmpty([metadata && metadata.autorNome]),
          metadataHasAutorAvatar: !!pickFirstNonEmpty([metadata && metadata.autorAvatar]),
        });
      }
    }

    const out = {
      // IDs
      id: row.id,
      uuid: row.id || null,
      legacyId,
      legacy_id: legacyId,

      // Autor
      authorId,
      author_id: row.author_id || null,

      // Contrato (PT-BR + aliases EN)
      modulo: row.module || '',
      module: row.module || '',
      categoria: categoriaLabel,
      category: row.category || '',

      titulo: row.title || '',
      title: row.title || '',
      descricao: row.description || '',
      description: row.description || '',

      preco: (row.price != null ? row.price : null),
      price: (row.price != null ? row.price : null),
      status: String(row.status || 'published').toLowerCase(),
      visibility: String(row.visibility || (metadata && metadata.visibility) || 'public').toLowerCase(),

      location: row.location || '',

      timestamp: row.created_at || '',
      createdAt: row.created_at || '',
      created_at: row.created_at || '',

      // Para manter retrocompatibilidade visual (fallback do render):
      // Hardening de privacidade: NÀƒO depender de profiles.email para exibir nome.
      autor: normalizedAuthorName,
      autorAvatar: normalizedAuthorAvatar,

      // Verificação do autor (V8.1.3.2)
      authorVerified,
      author_verified: authorVerified,
      verificado: authorVerified,
      verified: authorVerified,

      imagens: imageUrls,
      images: imageUrls,
      image_url: row.image_url || fallbackImageUrl || '',
      imageUrl: row.imageUrl || row.image_url || fallbackImageUrl || '',
      cover_url: row.image_url || fallbackImageUrl || '',
      coverUrl: row.imageUrl || row.image_url || fallbackImageUrl || '',

      comentarios: (Array.isArray(row.comments) && row.comments[0] && row.comments[0].count != null) ? row.comments[0].count : 0,
      rating: Number.isFinite(ratingAverage) && ratingCount > 0 ? ratingAverage : null,
      ratingCount,
      rating_count: ratingCount,

      metadata,

      authorName: normalizedAuthorName,
      authorAvatar: normalizedAuthorAvatar,
      authorProfile: normalizedAuthorProfile,
    };

    // Aliases legados (alguns trechos usam author/authorAvatar)
    out.author = out.autor;
    out.authorAvatar = out.autorAvatar;

    // Injeta campos variáveis (metadata) sem sobrescrever o contrato base
    mergeMetadataSafe(out, metadata);

    return out;
  }

  // Adapter: linha do Postgres (snake_case + embeds) -> Contrato KCAPI (camelCase/PT-BR)
  // - Mantém compat com modo local (id pode ser legacy_id)
  // - Normaliza via normalizePost (contrato único consumido pelos controllers)
  function normalizeSupabasePost(row) {
    const mapped = mapSupabasePost(row);
    if (!mapped) return null;

    const raw = { ...(mapped || {}) };

    // Preferir legacy_id como id para manter links/contrato do protótipo
    const legacy = raw.legacyId || raw.legacy_id || null;
    if (legacy != null && legacy !== '') {
      raw.uuid = raw.id; // preserva UUID
      raw.id = legacy;
    }

    return doNormalizePost(raw);
  }

  function buildSupabasePostSelect(client, includeVerified = true, includeComments = true, includeImageUrl = true) {
    const profileFields = includeVerified
      ? 'id, display_name, full_name, avatar_url, verified, rating_avg, rating_count'
      : 'id, display_name, full_name, avatar_url, rating_avg, rating_count';
    const commentsField = includeComments ? ', comments(count)' : '';
    const imageUrlField = includeImageUrl ? 'image_url, ' : '';
    return client
      .from('posts')
      .select(`id, legacy_id, author_id, title, description, price, location, module, category, ${imageUrlField}status, visibility, metadata, created_at, votos, profiles:author_id (${profileFields}), post_media (id, url, is_cover)${commentsField}`)
      .limit(1);
  }

  // Compat: caso o schema ainda não tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostSelectFallback(client, includeComments = true) {
    return buildSupabasePostSelect(client, false, includeComments);
  }

  function isMissingCommentsEmbedError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('comments') && (msg.includes('does not exist') || msg.includes('relationship'));
  }

  async function getPostById(id) {
    const key = String(id || "").trim();
    if (!key) return null;

    // IDs locais (u_*) não existem no Supabase
    if (key.startsWith("u_")) return null;

    // Preferir Facade (KCSupabase) para evitar KCAPI falando direto com o SDK
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getPostById === "function") {
        const row = await window.KCSupabase.getPostById(key);
        if (!row) return null;

        const mapped = mapSupabasePost(row, { allImages: true });
        if (!mapped) return null;

        // Se foi chamado com legacy_id, manter id no formato do protótipo
        const isUuid = UUID_RE.test(key);
        if (!isUuid) {
          const legacy = mapped.legacyId || mapped.legacy_id || null;
          if (legacy != null && legacy !== "") {
            mapped.uuid = mapped.id; // preserva UUID real
            mapped.id = legacy;
          }
        }

        return mapped;
      }
    } catch (e) {
      console.warn("[KCAPI][Supabase] getPostById via KCSupabase falhou, usando fallback:", e);
    }

    const client = getSupabaseClient();
    if (!client) return null;

    const isUuid = UUID_RE.test(key);
    const legacyKey = key.trim();

    const runPostQueryWithFallback = async (field, value) => {
      let includeVerified = true;
      let includeComments = true;
      let includeImageUrl = true;

      let res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
      if (res && res.error && isMissingImageUrlColumnError(res.error)) {
        includeImageUrl = false;
        res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
      }
      if (res && res.error && isMissingVerifiedColumnError(res.error)) {
        includeVerified = false;
        res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
      }
      if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
        includeComments = false;
        res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
        if (res && res.error && includeImageUrl && isMissingImageUrlColumnError(res.error)) {
          includeImageUrl = false;
          res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
        }
        if (res && res.error && includeVerified && isMissingVerifiedColumnError(res.error)) {
          includeVerified = false;
          res = await buildSupabasePostSelect(client, includeVerified, includeComments, includeImageUrl).eq(field, value).maybeSingle();
        }
      }

      return res;
    };

    try {
      // 1) tenta por UUID (posts.id)
      if (isUuid) {
        const r1 = await runPostQueryWithFallback('id', key);
        if (r1 && r1.error) {
          console.error("[KCAPI][Supabase] getPostById(id) erro:", r1.error);
          return null;
        }
        if (r1 && r1.data) return mapSupabasePost(r1.data, { allImages: true });
      }

      // 2) legacy_id (compatibilidade de IDs legados)
      if (!isUuid) {
        const r2 = await runPostQueryWithFallback('legacy_id', legacyKey);
        if (r2 && r2.error) {
          console.error("[KCAPI][Supabase] getPostById(legacy_id) erro:", r2.error);
          return null;
        }
        if (r2 && r2.data) {
          const mapped = mapSupabasePost(r2.data, { allImages: true });
          if (mapped) {
            const legacy = mapped.legacyId || mapped.legacy_id || null;
            if (legacy != null && legacy !== "") {
              mapped.uuid = mapped.id;
              mapped.id = legacy;
            }
          }
          return mapped;
        }
      }
    } catch (e) {
      console.error("[KCAPI][Supabase] getPostById falhou:", e);
      return null;
    }

    return null;
  }


  function buildSupabasePostsQuery(client, includeVerified = true, includeComments = true, includeImageUrl = true) {
    const profileFields = includeVerified
      ? 'id, display_name, full_name, avatar_url, verified, rating_avg, rating_count'
      : 'id, display_name, full_name, avatar_url, rating_avg, rating_count';
    const commentsField = includeComments ? ', comments(count)' : '';
    const imageUrlField = includeImageUrl ? 'image_url, ' : '';
    return client
      .from('posts')
      .select(`id, legacy_id, author_id, title, description, price, location, module, category, ${imageUrlField}status, visibility, metadata, created_at, profiles:author_id (${profileFields}), post_media (id, url, is_cover)${commentsField}`);
  }

  // Compat: caso o schema ainda não tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostsQueryFallback(client, includeComments = true) {
    return buildSupabasePostsQuery(client, false, includeComments);
  }

  function isMissingVerifiedColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('verified') && msg.includes('does not exist');
  }

  function isMissingImageUrlColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('image_url') && (
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache')
    );
  }

  function normalizeSupabaseFilters(filters) {
    const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {};
    const module = (f.module || f.modulo || null);
    const category = (f.category || f.categoria || null);
    const subcategory = (f.subcategory || f.subcategoria || null);

    const moduleNorm = module != null ? String(module).trim().toLowerCase() : null;
    const categoryNorm = category != null ? String(category).trim().toLowerCase() : null;
    const subcategoryNorm = subcategory != null ? String(subcategory).trim().toLowerCase() : null;

    const q = (f.q || f.query || f.search || '').toString().trim();

    const pageRaw = (f.page != null) ? parseInt(String(f.page), 10) : 1;
    const limitRaw = (f.limit != null) ? parseInt(String(f.limit), 10) : 10;

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;

    return { module: moduleNorm, category: categoryNorm, subcategory: subcategoryNorm, q, page, limit };
  }

  function buildOrILike(q) {
    // PostgREST: valores com caracteres especiais podem ser envoltos em aspas.
    // Mantemos o padrão pedido (.or('title.ilike.%q%,description.ilike.%q%')) mas com quoting seguro.
    const safe = String(q || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const pattern = `%${safe}%`;
    return `title.ilike."${pattern}",description.ilike."${pattern}"`;
  }

  async function getPosts(filters = {}) {
    // Preferimos a Facade (KCSupabase.getPosts) para manter o SDK isolado do restante do app.
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getPosts === 'function') {
        const rows = await window.KCSupabase.getPosts(filters);
        const out = (Array.isArray(rows) ? rows : []).map(normalizeSupabasePost).filter(Boolean);

        // Logs discretos para QA (V8.1.4.2)
        const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {};
        const pageRaw = (f.page != null) ? parseInt(String(f.page), 10) : 1;
        const limitRaw = (f.limit != null) ? parseInt(String(f.limit), 10) : (out.length || 0);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : (out.length || 0);
        try { console.debug(`[KCAPI:supabase] Loaded page ${page} (${out.length} items) [limit=${limit}]`); } catch (_) { }

        return out;
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getPosts (via KCSupabase) falhou:', e);
      return [];
    }

    // Fallback defensivo (não deveria ocorrer se o bundle estiver correto)
    console.warn('[KCAPI][Supabase] KCSupabase.getPosts indisponível; retornando lista vazia.');
    return [];
  }

  async function searchPosts(filters = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.searchPosts === 'function') {
        const rows = await window.KCSupabase.searchPosts(filters);
        return (Array.isArray(rows) ? rows : []).map(normalizeSupabasePost).filter(Boolean);
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] searchPosts falhou:', e);
      return [];
    }

    console.warn('[KCAPI][Supabase] KCSupabase.searchPosts indisponivel; retornando lista vazia.');
    return [];
  }

  async function getFeedCursor(filters = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getFeedCursor === 'function') {
        const payload = await window.KCSupabase.getFeedCursor(filters);
        const rows = Array.isArray(payload && payload.posts) ? payload.posts : [];
        const out = rows.map(normalizeSupabasePost).filter(Boolean);
        const nextCursor = payload && payload.nextCursor ? String(payload.nextCursor) : null;
        const hasMore = !!(payload && payload.hasMore === true);

        try {
          const limitRaw = (filters && filters.limit != null) ? parseInt(String(filters.limit), 10) : (out.length || 0);
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : (out.length || 0);
          console.debug(`[KCAPI:supabase] Loaded cursor batch (${out.length} items) [limit=${limit}] hasMore=${hasMore}`);
        } catch (_) { }

        return {
          posts: out,
          nextCursor,
          hasMore,
        };
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getFeedCursor falhou:', e);
      throw e;
    }

    console.warn('[KCAPI][Supabase] KCSupabase.getFeedCursor indisponivel; retornando lote vazio.');
    return {
      posts: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  async function getMyPosts(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const status = String(params.status || '').trim().toLowerCase();

    try {
      const buildQuery = (includeImageUrl) => client
        .from('posts')
        .select(includeImageUrl
          ? 'id, legacy_id, title, created_at, status, visibility, module, category, image_url, votos, view_count, share_count, coupon_clicks, expires_at'
          : 'id, legacy_id, title, created_at, status, visibility, module, category, votos, view_count, share_count, coupon_clicks, expires_at')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      let query = buildQuery(true);
      if (status) query = query.eq('status', status);
      let { data, error } = await query;
      if (error && isMissingImageUrlColumnError(error)) {
        query = buildQuery(false);
        if (status) query = query.eq('status', status);
        ({ data, error } = await query);
      }
      if (error) {
        console.error('[KCAPI][profile] getMyPosts:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.legacy_id || row.id,
        uuid: row.id,
        legacy_id: row.legacy_id || null,
        title: row.title || 'Sem título',
        created_at: row.created_at || null,
        status: row.status || 'published',
        visibility: row.visibility || 'public',
        module: row.module || '',
        category: row.category || '',
        image_url: row.image_url || '',
        cover_url: row.image_url || '',
        votos: row.votos || 0,
        view_count: row.view_count || 0,
        share_count: row.share_count || 0,
        coupon_clicks: row.coupon_clicks || 0,
        expires_at: row.expires_at || null,
      }));
    } catch (e) {
      console.error('[KCAPI][profile] getMyPosts exceção:', e);
      return [];
    }
  }

  async function getPostsByAuthorId(authorId, params = {}) {
    const client = getSupabaseClient();
    const author = String(authorId || '').trim();
    if (!client || !author) return [];
    // Supabase author_id is UUID — skip query for legacy IDs (e.g. "USER_29")
    if (!UUID_RE.test(author)) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      const buildQuery = (includeImageUrl) => client
        .from('posts')
        .select(includeImageUrl
          ? 'id, legacy_id, title, created_at, status, visibility, module, category, image_url'
          : 'id, legacy_id, title, created_at, status, visibility, module, category')
        .eq('author_id', author)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(from, to);

      let { data, error } = await buildQuery(true);
      if (error && isMissingImageUrlColumnError(error)) {
        ({ data, error } = await buildQuery(false));
      }

      if (error) {
        console.error('[KCAPI][profile] getPostsByAuthorId:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.legacy_id || row.id,
        uuid: row.id,
        legacy_id: row.legacy_id || null,
        title: row.title || 'Sem título',
        created_at: row.created_at || null,
        status: row.status || 'published',
        visibility: row.visibility || 'public',
        module: row.module || '',
        category: row.category || '',
        image_url: row.image_url || '',
        cover_url: row.image_url || '',
      }));
    } catch (e) {
      console.error('[KCAPI][profile] getPostsByAuthorId exceção:', e);
      return [];
    }
  }

  async function fetchRelatedPostsByIds(client, ids) {
    const orderedIds = Array.isArray(ids)
      ? ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (!client || !orderedIds.length) return [];

    let includeVerified = true;
    let includeComments = false;
    let includeImageUrl = true;

    try {
      let query = buildSupabasePostsQuery(client, includeVerified, includeComments, includeImageUrl)
        .in('id', orderedIds)
        .eq('status', 'published');
      let response = await query;

      if (response && response.error && isMissingImageUrlColumnError(response.error)) {
        includeImageUrl = false;
        response = await buildSupabasePostsQuery(client, includeVerified, includeComments, includeImageUrl)
          .in('id', orderedIds)
          .eq('status', 'published');
      }

      if (response && response.error && isMissingVerifiedColumnError(response.error)) {
        includeVerified = false;
        response = await buildSupabasePostsQuery(client, includeVerified, includeComments, includeImageUrl)
          .in('id', orderedIds)
          .eq('status', 'published');
      }

      if (response && response.error && includeComments && isMissingCommentsEmbedError(response.error)) {
        includeComments = false;
        response = await buildSupabasePostsQuery(client, includeVerified, includeComments, includeImageUrl)
          .in('id', orderedIds)
          .eq('status', 'published');
      }

      if (response && response.error) {
        console.error('[KCAPI][product] fetchRelatedPostsByIds:', response.error);
        return [];
      }

      const rows = Array.isArray(response && response.data) ? response.data : [];
      const mappedById = new Map();
      rows.forEach((row) => {
        const mapped = mapSupabasePost(row, { allImages: false });
        if (mapped && mapped.uuid) mappedById.set(String(mapped.uuid), doNormalizePost(mapped));
      });

      return orderedIds
        .map((id) => mappedById.get(String(id)))
        .filter(Boolean);
    } catch (error) {
      console.error('[KCAPI][product] fetchRelatedPostsByIds exceção:', error);
      return [];
    }
  }

  async function getRelatedPosts(postId, options = {}) {
    const client = getSupabaseClient();
    if (!client) return [];

    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const limit = Math.min(12, Math.max(1, Number(opts.limit) || 8));
    const currentPost = opts.currentPost && typeof opts.currentPost === 'object'
      ? doNormalizePost(opts.currentPost)
      : await getPostById(postId);
    if (!currentPost) return [];

    const viewer = await getCurrentUser();
    const viewerAuthenticated = !!(viewer && viewer.id);
    const currentUuid = String(currentPost.uuid || currentPost.id || '').trim();
    const currentAuthorId = String(currentPost.authorId || currentPost.autorId || currentPost.author_id || '').trim();
    const currentModule = String(currentPost.modulo || currentPost.module || '').trim();

    try {
      // Only call RPC when currentUuid is a valid UUID — legacy numeric IDs cause 22P02
      if (!UUID_RE.test(currentUuid)) throw new Error('legacy-id-skip');
      const rpc = await client.rpc('kc_related_posts', {
        p_post_id: currentUuid,
        p_limit: limit,
      });

      if (rpc && !rpc.error) {
        const rows = Array.isArray(rpc.data) ? rpc.data : [];
        const ids = rows.map((row) => String((row && (row.candidate_id || row.id)) || '').trim()).filter(Boolean);
        const scoreMap = new Map();
        rows.forEach((row) => {
          const id = String((row && (row.candidate_id || row.id)) || '').trim();
          if (!id) return;
          scoreMap.set(id, {
            score: Number(row && row.relevance_score) || 0,
            reason: String(row && row.reason || '').trim(),
          });
        });

        const hydrated = await fetchRelatedPostsByIds(client, ids);
        if (hydrated.length) {
          return hydrated.map((item) => {
            const meta = scoreMap.get(String(item.uuid || item.id || '').trim()) || {};
            return Object.assign({}, item, {
              _kcRelatedScore: Number(meta.score) || 0,
              _kcRelatedReason: meta.reason || item._kcRelatedReason || 'Relacionado',
            });
          }).slice(0, limit);
        }
      } else if (rpc && rpc.error) {
        console.warn('[KCAPI][product] kc_related_posts RPC indisponível; usando fallback local:', rpc.error);
      }
    } catch (error) {
      console.warn('[KCAPI][product] kc_related_posts RPC falhou; usando fallback local:', error);
    }

    const candidateBuckets = [];
    if (currentAuthorId) {
      candidateBuckets.push(getPostsByAuthorId(currentAuthorId, { page: 1, limit: 24 }));
    }
    if (currentModule) {
      candidateBuckets.push(getPosts({ module: currentModule, page: 1, limit: 36 }));
    }

    let fallbackCandidates = [];
    try {
      const resolved = await Promise.all(candidateBuckets);
      resolved.forEach((list) => {
        if (Array.isArray(list) && list.length) fallbackCandidates = fallbackCandidates.concat(list);
      });
    } catch (_) { }

    const ranked = (window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function')
      ? window.KCAPI.rankRelatedPosts(currentPost, fallbackCandidates, { viewerAuthenticated })
      : fallbackCandidates;

    return ranked.slice(0, limit);
  }

  // ── Namespace ──────────────────────────────────────────────────────────────

  window._KCSA.posts = {
    getPostById,
    getPosts,
    searchPosts,
    getFeedCursor,
    getMyPosts,
    getPostsByAuthorId,
    getRelatedPosts,
  };

})();
