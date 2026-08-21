/**
 * KinoCampus — kc-supabase.posts.js v13.5.1
 *
 * Sub-módulo de leitura de posts via Supabase.
 * Extraído de kc-supabase.client.js (v13.5.1 split).
 *
 * Contém: normalizeGetPostsParams, normalizeCursorRequest*, normalizeGetFeedCursorParams,
 *         getSearchShared, buildExpandedSearchTerms, normalizeSearchPostsParams,
 *         normalizeModuleKey, rowModuleMatches, isMissingTokenError, isMissingCommentsEmbedError,
 *         buildOrILike, buildPostsSelect, buildPostDetailSelect, isMaybeSingleMissing,
 *         getPostById, getPosts
 *
 * Expõe: window.KCSupabase._posts (Object.freeze)
 * Carregado: após kc-supabase.client.js (defer)
 */

(function () {
  'use strict';

  window.KCSupabase = window.KCSupabase || {};

  // ── Acesso ao client Supabase via facade pública ──────────────────────────────
  function _client() {
    return (window.KCSupabase && typeof window.KCSupabase.getClient === 'function')
      ? window.KCSupabase.getClient()
      : null;
  }
  function _readEnv() {
    if (window._KCSupabaseInternal && typeof window._KCSupabaseInternal.readEnv === 'function') {
      return window._KCSupabaseInternal.readEnv();
    }
    var env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    return {
      driver: String(env.DATA_DRIVER || env.driver || 'local').toLowerCase(),
      debug: !!env.debug,
    };
  }


  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // ---------- Read Path: Posts (V8.1.4.1) ----------
  // Encapsula SELECTs de posts no Facade do Supabase.
  // - Mantém controllers/UI isolados do SDK.
  // - Aplica filtros/paginação.
  // - Mantém compat com schemas (post_media vs post_images; profiles.verified opcional).
  function normalizeGetPostsParams(params) {
    const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};

    const module = (p.module || p.modulo || null);
    const category = (p.category || p.categoria || null);
    const subcategory = (p.subcategory || p.subcategoria || null);
    const tag = (p.tag || p.tagKey || p.tag_key || null);

    const q = (p.q || p.query || p.search || '').toString().trim();

    const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
    const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 50;

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    // Hard cap: module catalog loops historically used limit=100 × 20 pages and
    // saturated free-tier Postgres (503/504). Cards should use getFeedCursor.
    const limitUncapped = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
    const limit = Math.min(limitUncapped, 50);
    const light = p.light === true || p.mode === 'light' || p.catalog === true;

    const norm = (v) => {
      if (v == null) return null;
      const s = String(v).trim().toLowerCase();
      return s ? s : null;
    };

    const normalizeTagKey = (v) => {
      const base = norm(v);
      if (!base) return null;
      try {
        return base
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || null;
      } catch (_) {
        return base;
      }
    };

    // sortBy: 'recentes' (default) | 'votos' (highlight score) | 'comentados' (last comment)
    const sortByRaw = String(p.sortBy || p.sort_by || 'recentes').trim().toLowerCase();
    const sortBy = sortByRaw === 'votos' ? 'votos' : sortByRaw === 'comentados' ? 'comentados' : 'recentes';

    return {
      module: norm(module),
      category: norm(category),
      subcategory: norm(subcategory),
      tag: normalizeTagKey(tag),
      q,
      page,
      limit,
      sortBy,
      light: !!light,
    };
  }

  /** Lightweight select for filter/catalog indexes — no profiles/media/comments embeds. */
  function buildPostsCatalogSelect() {
    return 'id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, status, expires_at, bumped_at, highlight_score, votos';
  }

  const FEED_CURSOR_RESERVED_KEYS = new Set([
    'module',
    'modules',
    'modulo',
    'modulos',
    'category',
    'categoria',
    'subcategory',
    'subcategoria',
    'tag',
    'tagKey',
    'tag_key',
    'q',
    'query',
    'search',
    'page',
    'limit',
    'sortBy',
    'sort_by',
    'cursor',
    'requestParams',
    'request_params',
  ]);

  function normalizeCursorRequestParamValue(value) {
    if (value == null) return undefined;
    if (Array.isArray(value)) {
      const list = Array.from(new Set(value
        .map((entry) => {
          if (entry == null) return '';
          if (typeof entry === 'string') return entry.trim();
          if (typeof entry === 'number' && Number.isFinite(entry)) return String(entry);
          if (typeof entry === 'boolean') return entry ? 'true' : 'false';
          return '';
        })
        .filter(Boolean)));
      return list.length ? list : undefined;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      const text = value.trim();
      return text ? text : undefined;
    }
    return undefined;
  }

  function normalizeCursorRequestParams(params) {
    const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const nested = (p.requestParams && typeof p.requestParams === 'object' && !Array.isArray(p.requestParams))
      ? p.requestParams
      : {};
    const out = {};

    const assignValue = (key, value) => {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) return;
      const normalized = normalizeCursorRequestParamValue(value);
      if (normalized === undefined) return;
      out[cleanKey] = normalized;
    };

    Object.keys(nested).forEach((key) => {
      assignValue(key, nested[key]);
    });

    Object.keys(p).forEach((key) => {
      if (FEED_CURSOR_RESERVED_KEYS.has(key)) return;
      assignValue(key, p[key]);
    });

    return out;
  }

  function normalizeGetFeedCursorParams(params) {
    const base = normalizeGetPostsParams(params);
    const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const rawModules = Array.isArray(p.modules)
      ? p.modules
      : (Array.isArray(p.module) ? p.module : (Array.isArray(p.modulo) ? p.modulo : []));
    const modules = rawModules
      .map((value) => {
        if (value == null) return '';
        const s = String(value).trim().toLowerCase();
        return s || '';
      })
      .filter(Boolean);
    const cursor = p.cursor != null ? String(p.cursor).trim() : '';
    return {
      ...base,
      modules,
      cursor: cursor || null,
      requestParams: normalizeCursorRequestParams(p),
    };
  }

  function getSearchShared() {
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.expandQueryTerms === 'function') return shared;
    return null;
  }

  function buildExpandedSearchTerms(query) {
    const q = String(query || '').trim();
    if (!q) return [];

    const shared = getSearchShared();
    if (shared) return shared.expandQueryTerms(q);

    const normalized = q
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!normalized) return [];
    return Array.from(new Set(normalized.split(/\s+/).filter((term) => term.length > 1)));
  }

  function normalizeSearchPostsParams(params) {
    const base = normalizeGetPostsParams(params);
    const limitRaw = (params && params.limit != null) ? parseInt(String(params.limit), 10) : base.limit;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 120) : 50;
    return {
      module: base.module,
      category: base.category,
      subcategory: base.subcategory,
      q: base.q,
      limit,
      hideClosed: !!(params && (params.hideClosed === true || params.hideEnded === true)),
      terms: buildExpandedSearchTerms(base.q),
    };
  }

  function normalizeModuleKey(v) {
    const raw = String(v || '').trim().toLowerCase();
    if (!raw) return '';

    let base = raw;
    try {
      base = base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    } catch (_) { }

    base = base
      .replace(/[_\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (['compra-venda', 'compra-e-venda', 'vendas', 'venda'].includes(base)) return 'compra-venda';
    if (['achados-perdidos', 'achados-e-perdidos', 'achados', 'perdidos'].includes(base)) return 'achados-perdidos';
    if (['carona', 'caronas'].includes(base)) return 'caronas';
    if (['evento', 'eventos'].includes(base)) return 'eventos';
    if (['oportunidade', 'oportunidades'].includes(base)) return 'oportunidades';
    if (['moradia', 'moradias'].includes(base)) return 'moradia';

    return base;
  }

  function rowModuleMatches(row, moduleFilter) {
    const target = normalizeModuleKey(moduleFilter);
    if (!target) return true;
    if (!row || typeof row !== 'object') return false;

    const direct = normalizeModuleKey(row.module || row.modulo || '');
    if (direct && direct === target) return true;

    const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : null;
    if (!meta) return false;

    const fromMeta = [
      meta.module,
      meta.modulo,
      meta.moduleKey,
      meta.moduloKey,
      meta.feed,
      meta.feedModule,
    ];

    return fromMeta.some((v) => normalizeModuleKey(v) === target);
  }

  function isMissingTokenError(err, token) {
    if (!err || !token) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes(String(token).toLowerCase()) && msg.includes('does not exist');
  }

  function isMissingCommentsEmbedError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return (msg.includes('comments') && (msg.includes('does not exist') || msg.includes('relationship') || msg.includes('could not find')));
  }

  function buildOrILike(q) {
    const raw = String(q || '').trim();
    if (!raw) return 'title.ilike.%%,description.ilike.%%';

    // Preferência: formato recomendado e simples (sem aspas), desde que não quebre o parser do .or()
    // (vírgula/parênteses/aspas/backslash podem interferir na expressão OR do PostgREST)
    const hasSpecial = /[(),]/.test(raw) || raw.includes('"') || raw.includes('\\');

    if (!hasSpecial) {
      const pattern = `%${raw}%`;
      return `title.ilike.${pattern},description.ilike.${pattern}`;
    }

    // Fallback robusto: valor entre aspas, com escaping básico
    const safe = raw
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    const pattern = `%${safe}%`;
    return `title.ilike."${pattern}",description.ilike."${pattern}"`;
  }

  function buildPostsSelect(includeVerified, mediaRel, includeComments, includeVotos = true) {
    const profileFields = includeVerified
      ? 'id, display_name, full_name, avatar_url, verified, rating_avg, rating_count'
      : 'id, display_name, full_name, avatar_url, rating_avg, rating_count';

    // mediaRel: post_media (padrão do schema) | post_images (compat)
    // includeComments: false quando tabela comments ainda não existe no schema (compat)
    const commentsStr = (includeComments !== false) ? ', comments(count)' : '';
    const votosStr = (includeVotos !== false) ? ', votos' : '';
    return `id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, status, expires_at, bumped_at, highlight_score${votosStr}, profiles:author_id (${profileFields}), ${mediaRel} (id, url, is_cover)${commentsStr}`;
  }

  function buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments) {
    const profileFields = includeVerified
      ? "id, display_name, full_name, avatar_url, verified, rating_avg, rating_count"
      : "id, display_name, full_name, avatar_url, rating_avg, rating_count";

    const mediaFields = includeSortOrder
      ? "id, url, is_cover, sort_order"
      : "id, url, is_cover";

    // includeComments: false quando tabela comments ainda não existe no schema (compat)
    const commentsStr = (includeComments !== false) ? ', comments(count)' : '';
    return `id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, status, expires_at, bumped_at, highlight_score, votos, profiles:author_id (${profileFields}), ${mediaRel} (${mediaFields})${commentsStr}`;
  }

  function isMaybeSingleMissing(err) {
    if (!err) return false;
    const code = String(err.code || "");
    const msg = String(err.message || err.details || "").toLowerCase();
    return code === "PGRST116" || msg.includes("json object requested") || msg.includes("no rows");
  }

  async function getPostById(idOrUuid) {
    const { driver } = _readEnv();
    if (driver !== "supabase") return null;

    const key = String(idOrUuid || "").trim();
    if (!key) return null;
    if (key.startsWith("u_")) return null; // IDs locais não existem no banco

    const client = _client();
    if (!client) return null;

    const isUuid = UUID_RE.test(key);
    const legacyKey = key.trim();

    const run = async (selectStr, mediaRel, includeSortOrder, includeVerified) => {
      let q = client.from("posts").select(selectStr).limit(1);
      if (isUuid) q = q.eq("id", key);
      else q = q.eq("legacy_id", legacyKey);

      // Ordenação por sort_order quando existir (sem assumir schema)
      if (includeSortOrder) {
        try { q = q.order("sort_order", { foreignTable: mediaRel, ascending: true }); } catch (_) { }
      }
      try { q = q.order("is_cover", { foreignTable: mediaRel, ascending: false }); } catch (_) { }

      if (typeof q.maybeSingle === "function") return await q.maybeSingle();
      return await q.single();
    };

    let mediaRel = "post_media";
    let includeVerified = true;
    let includeSortOrder = true;
    let includeComments = true;

    // Tentativa 1: post_media + verified + sort_order
    let res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);

    // Compat: coluna verified ausente
    if (res && res.error && isMissingTokenError(res.error, "verified")) {
      includeVerified = false;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
    }

    // Compat: sort_order ausente
    if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
      includeSortOrder = false;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
    }

    // Compat: embed comments(count) ausente
    if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
      includeComments = false;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      if (res && res.error && isMissingTokenError(res.error, "verified")) {
        includeVerified = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      }
      if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
        includeSortOrder = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      }
    }

    // Compat: relação post_media ausente
    if (res && res.error && (isMissingTokenError(res.error, "post_media") || String(res.error.message || "").toLowerCase().includes("post_media") && String(res.error.message || "").toLowerCase().includes("relationship"))) {
      mediaRel = "post_images";
      includeVerified = true;
      includeSortOrder = true;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      if (res && res.error && isMissingTokenError(res.error, "verified")) {
        includeVerified = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      }
      if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
        includeSortOrder = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
      }
      if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
        includeComments = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
        if (res && res.error && isMissingTokenError(res.error, "verified")) {
          includeVerified = false;
          res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
        }
        if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
          includeSortOrder = false;
          res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, includeComments), mediaRel, includeSortOrder, includeVerified);
        }
      }
    }

    // Compat: tabela comments ainda não existe (migration v8.1.7.2 não aplicada)
    if (res && res.error) {
      const commentsMsg = String(res.error.message || res.error.details || "").toLowerCase();
      if (commentsMsg.includes("comments") && (commentsMsg.includes("does not exist") || commentsMsg.includes("relationship"))) {
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, false), mediaRel, includeSortOrder, includeVerified);
        if (res && res.error && isMissingTokenError(res.error, "verified")) {
          includeVerified = false;
          res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder, false), mediaRel, includeSortOrder, includeVerified);
        }
      }
    }

    if (res && res.error) {
      if (isMaybeSingleMissing(res.error)) return null;
      try { console.error("[KCSupabase] getPostById erro:", res.error); } catch (_) { }
      return null;
    }

    return (res && res.data) ? res.data : null;
  }

  async function getPosts(params = {}) {
    const { driver } = _readEnv();
    if (driver !== 'supabase') return [];

    const client = _client();
    if (!client) return [];

    const f = normalizeGetPostsParams(params);
    const from = (f.page - 1) * f.limit;
    const to = from + f.limit - 1;

    const run = async (selectStr, moduleEqValue) => {
      let q = client
        .from('posts')
        .select(selectStr)
        .is('legacy_id', null)  // exclui posts de exemplo/demo do feed
        .in('status', ['published', 'closed']);

      // Ordenação por tipo de feed
      if (f.sortBy === 'votos') {
        // Feed Destaques: posts encerrados ficam abaixo dos publicados.
        q = q.order('status', { ascending: false }).order('highlight_score', { ascending: false }).order('votos', { ascending: false }).order('created_at', { ascending: false });
      } else if (f.sortBy === 'comentados') {
        // Feed Comentados: posts com comentários ordenados pela data do último comentário
        q = q.not('last_comment_at', 'is', null)
             .order('last_comment_at', { ascending: false, nullsFirst: false })
             .order('created_at', { ascending: false });
      } else {
        // Feed Recentes: a RPC usa COALESCE(bumped_at, created_at); este fallback
        // mantem created_at no servidor e reordena a pagina carregada no cliente.
        q = q.order('created_at', { ascending: false });
      }

      if (moduleEqValue) q = q.eq('module', moduleEqValue);
      if (f.category) q = q.eq('category', f.category);
      if (f.subcategory) q = q.eq('metadata->>subcategory', f.subcategory);
      if (f.tag) {
        // O filtro remoto cobre a taxonomia automática e a dupla adicional.
        // `f.tag` já foi slugificado em normalizeGetPostsParams, logo não
        // precisa interpolar texto livre na expressão PostgREST.
        q = q.or('metadata->tagKeys.cs.["' + f.tag + '"],metadata->userTagKeys.cs.["' + f.tag + '"]');
      }
      if (f.q) q = q.or(buildOrILike(f.q));

      return await q.range(from, to);
    };

    // Catalog/filter path: no embeds — used by module sidebars (was 20×100 full embeds).
    if (f.light) {
      let lightRes = await run(buildPostsCatalogSelect(), f.module);
      if (lightRes && lightRes.error) {
        try { console.error('[KCSupabase] getPosts(light) erro:', lightRes.error); } catch (_) { }
        return [];
      }
      let lightRows = (lightRes && Array.isArray(lightRes.data)) ? lightRes.data : [];
      if (f.sortBy === 'recentes') {
        lightRows = lightRows.slice().sort((a, b) => {
          const aTime = new Date((a && (a.bumped_at || a.created_at)) || 0).getTime() || 0;
          const bTime = new Date((b && (b.bumped_at || b.created_at)) || 0).getTime() || 0;
          if (bTime !== aTime) return bTime - aTime;
          return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
        });
      }
      return lightRows;
    }

    // 1) tentativa padrão (post_media + profiles.verified)
    let mediaRel = 'post_media';
    let includeComments = true;
    let res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);

    // 2) compat: schema sem profiles.verified
    if (res && res.error && isMissingTokenError(res.error, 'verified')) {
      res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
    }

    // 2.1) compat: embed comments(count) ausente
    if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
      includeComments = false;
      res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);
      if (res && res.error && isMissingTokenError(res.error, 'verified')) {
        res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
      }
    }

    // 3) compat: schema com relação post_images (ao invés de post_media)
    if (res && res.error && (isMissingTokenError(res.error, 'post_media') || isMissingTokenError(res.error, 'post_media ') || isMissingTokenError(res.error, 'post_media('))) {
      mediaRel = 'post_images';
      res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);
      if (res && res.error && isMissingTokenError(res.error, 'verified')) {
        res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
      }
      if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
        includeComments = false;
        res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);
        if (res && res.error && isMissingTokenError(res.error, 'verified')) {
          res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
        }
      }
    }

    // Alguns PostgREST usam mensagens diferentes para relação inexistente
    if (res && res.error) {
      const msg = String(res.error.message || '').toLowerCase();
      if (msg.includes('post_media') && msg.includes('relationship')) {
        mediaRel = 'post_images';
        res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);
        if (res && res.error && isMissingTokenError(res.error, 'verified')) {
          res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
        }
        if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
          includeComments = false;
          res = await run(buildPostsSelect(true, mediaRel, includeComments), f.module);
          if (res && res.error && isMissingTokenError(res.error, 'verified')) {
            res = await run(buildPostsSelect(false, mediaRel, includeComments), f.module);
          }
        }
      }
    }

    // 4) compat: tabela comments ainda não existe (migration v8.1.7.2 não aplicada)
    if (res && res.error) {
      const commentsMsg = String(res.error.message || res.error.details || '').toLowerCase();
      if (commentsMsg.includes('comments') && (commentsMsg.includes('does not exist') || commentsMsg.includes('relationship'))) {
        res = await run(buildPostsSelect(true, mediaRel, false));
        if (res && res.error && isMissingTokenError(res.error, 'verified')) {
          res = await run(buildPostsSelect(false, mediaRel, false));
        }
      }
    }

    if (res && res.error) {
      try { console.error('[KCSupabase] getPosts erro:', res.error); } catch (_) { }
      return [];
    }

    let rows = (res && Array.isArray(res.data)) ? res.data : [];
    if (f.sortBy === 'recentes') {
      rows = rows.slice().sort((a, b) => {
        const aTime = new Date((a && (a.bumped_at || a.created_at)) || 0).getTime() || 0;
        const bTime = new Date((b && (b.bumped_at || b.created_at)) || 0).getTime() || 0;
        if (bTime !== aTime) return bTime - aTime;
        return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
      });
    }

    // Fallback resiliente (gated): empty module filter must NOT pull all modules
    // with full embeds under load. Only allow for small first-page reads.
    if (f.module && rows.length === 0 && f.page === 1 && f.limit <= 12) {
      const retryNoModule = await run(buildPostsSelect(true, mediaRel, includeComments), null);
      if (retryNoModule && retryNoModule.error && isMissingTokenError(retryNoModule.error, 'verified')) {
        const retryNoModuleNoVerified = await run(buildPostsSelect(false, mediaRel, includeComments), null);
        if (!retryNoModuleNoVerified || !retryNoModuleNoVerified.error) {
          rows = Array.isArray(retryNoModuleNoVerified && retryNoModuleNoVerified.data)
            ? retryNoModuleNoVerified.data
            : [];
        }
      } else if (retryNoModule && !retryNoModule.error) {
        rows = Array.isArray(retryNoModule.data) ? retryNoModule.data : [];
      }

      if (rows.length) rows = rows.filter((row) => rowModuleMatches(row, f.module));
    }

    return rows;
  }


  async function searchPosts(params) {
    params = params || {};
    var env = _readEnv();
    if (env.driver !== 'supabase') return [];

    var client = _client();
    if (!client) return [];

    var f = normalizeSearchPostsParams(params);
    if (!f.q || !f.terms.length) return [];

    var rpcArgs = {
      p_q: f.q,
      p_terms: f.terms,
      p_module: f.module || null,
      p_category: f.category || null,
      p_subcategory: f.subcategory || null,
      p_limit: f.limit,
    };
    if (f.hideClosed) rpcArgs.p_hide_closed = true;
    var rpcRequest = client.rpc('kc_search_posts_fts', rpcArgs);
    if (params.signal && rpcRequest && typeof rpcRequest.abortSignal === 'function') {
      rpcRequest = rpcRequest.abortSignal(params.signal);
    }
    var rpc = await rpcRequest;

    // Phased rollout compatibility: old databases do not yet expose
    // p_hide_closed. Retry the legacy signature; the browser still applies the
    // same lifecycle filter locally until the migration is present.
    if (rpc && rpc.error && f.hideClosed) {
      var errorText = String(rpc.error.message || rpc.error.details || rpc.error.hint || '').toLowerCase();
      var signatureMismatch = errorText.includes('p_hide_closed')
        || errorText.includes('could not find the function')
        || errorText.includes('function public.kc_search_posts_fts');
      if (signatureMismatch) {
        var legacyRpcArgs = Object.assign({}, rpcArgs);
        delete legacyRpcArgs.p_hide_closed;
        legacyRpcArgs.p_limit = Math.max(f.limit, 120);
        rpcRequest = client.rpc('kc_search_posts_fts', legacyRpcArgs);
        if (params.signal && rpcRequest && typeof rpcRequest.abortSignal === 'function') {
          rpcRequest = rpcRequest.abortSignal(params.signal);
        }
        rpc = await rpcRequest;
      }
    }

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] searchPosts erro:', rpc.error); } catch (_) { }
      var searchError = new Error('KC_SEARCH_BACKEND_UNAVAILABLE');
      searchError.code = 'KC_SEARCH_BACKEND_UNAVAILABLE';
      searchError.details = rpc.error;
      throw searchError;
    }

    return Array.isArray(rpc && rpc.data) ? rpc.data : [];
  }

  async function getFeedCursor(params) {
    params = params || {};
    var env = _readEnv();
    if (env.driver !== 'supabase') return { posts: [], nextCursor: null, hasMore: false };

    var client = _client();
    if (!client) return { posts: [], nextCursor: null, hasMore: false };

    var f = normalizeGetFeedCursorParams(params);
    var moduleList = Array.isArray(f.modules) ? f.modules.filter(Boolean) : [];
    var moduleParam = moduleList.length === 1
      ? moduleList[0]
      : (moduleList.length === 0 ? f.module : null);

    var rpc = await client.rpc('kc_get_feed_cursor', {
      p_module: moduleParam || null,
      p_modules: moduleList.length > 1 ? moduleList : null,
      p_category: f.category || null,
      p_subcategory: f.subcategory || null,
      p_tag: f.tag || null,
      p_q: f.q || null,
      p_sort_by: f.sortBy || 'recentes',
      p_limit: f.limit,
      p_cursor: f.cursor || null,
      p_request_params: f.requestParams && Object.keys(f.requestParams).length ? f.requestParams : null,
    });

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] getFeedCursor erro:', rpc.error); } catch (_) { }
      throw rpc.error;
    }

    var payload = (rpc && rpc.data && typeof rpc.data === 'object' && !Array.isArray(rpc.data)) ? rpc.data : {};
    if (payload && payload.ok === false) {
      var err = new Error(String(payload.error || 'KC_GET_FEED_CURSOR_FAILED'));
      err.code = String(payload.error || 'KC_GET_FEED_CURSOR_FAILED');
      throw err;
    }
    var rows = Array.isArray(payload.posts) ? payload.posts : [];

    return {
      posts: rows,
      nextCursor: payload.nextCursor || payload.next_cursor || null,
      hasMore: payload.hasMore === true || payload.has_more === true,
    };
  }


  // ── Namespace público ──────────────────────────────────────────────────────────
  window.KCSupabase._posts = Object.freeze({
    normalizeGetPostsParams:      normalizeGetPostsParams,
    normalizeSearchPostsParams:   normalizeSearchPostsParams,
    normalizeGetFeedCursorParams: normalizeGetFeedCursorParams,
    getPostById:                  getPostById,
    getPosts:                     getPosts,
    searchPosts:                  searchPosts,
    getFeedCursor:                getFeedCursor,
    buildOrILike:                 buildOrILike,
    getSearchShared:              getSearchShared,
    buildExpandedSearchTerms:     buildExpandedSearchTerms,
  });
})();
