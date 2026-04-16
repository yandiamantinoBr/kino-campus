
(function () {
  'use strict';
const { ENV, normalizePost } = window.KCAPI;
  const profileShared = window.KCAccountProfileUtils || {};
  const OWNER_PROFILE_FIELDS = profileShared.OWNER_PROFILE_SELECT_FIELDS || 'id, display_name, full_name, avatar_url, avatar_path, bio, verified, is_admin, created_at, updated_at, onboarding_completed_at, affiliation, gender_identity, gender_identity_custom, race_color, profile_public, contact_primary_method, contact_cta_enabled, social_links, social_visibility';
  const createPostDiagnostics = Object.freeze({
    clear() {
      try {
        if (window.KCAPI && typeof window.KCAPI.clearLastCreatePostError === 'function') {
          window.KCAPI.clearLastCreatePostError();
        }
      } catch (_) { }
    },
    set(stage, error, context) {
      try {
        if (window.KCAPI && typeof window.KCAPI.setLastCreatePostError === 'function') {
          return window.KCAPI.setLastCreatePostError(stage, error, context);
        }
      } catch (_) { }
      return null;
    },
    get() {
      try {
        if (window.KCAPI && typeof window.KCAPI.getLastCreatePostError === 'function') {
          return window.KCAPI.getLastCreatePostError();
        }
      } catch (_) { }
      return null;
    }
  });

  function summarizeCreatePayloadForCreateDiagnostics(parsed) {
    try {
      if (window.KCAPI && typeof window.KCAPI.summarizeCreatePayloadForDiagnostics === 'function') {
        return window.KCAPI.summarizeCreatePayloadForDiagnostics(parsed);
      }
    } catch (_) { }

    const payload = (parsed && typeof parsed === 'object') ? parsed : {};
    return {
      moduleDB: payload.moduleDB || '',
      categoryDB: payload.categoryDB || '',
      subcategoryDB: payload.subcategoryDB || '',
      titleLength: String(payload.title || '').length,
      descriptionLength: String(payload.description || '').length,
      imagesCount: Array.isArray(payload.images) ? payload.images.length : 0,
    };
  }

  function normalizeProfilePatchForAdapter(patch) {
    if (profileShared && typeof profileShared.normalizeProfilePatch === 'function') {
      return profileShared.normalizeProfilePatch(patch);
    }
    return (patch && typeof patch === 'object' && !Array.isArray(patch)) ? { ...patch } : {};
  }


  // ---------- Supabase Client Bootstrap (V8.1.3.1) ----------
  // Cria o cliente apenas quando necessário (driver="supabase").
  let supabaseClient = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    // Preferimos o Facade (Auth/Sessão) para manter o SDK isolado
    try {
      if (KCSupabase && typeof KCSupabase.getClient === 'function') {
        supabaseClient = KCSupabase.getClient();
        return supabaseClient;
      }
    } catch (_) { }

    // Fallback (mantém compatibilidade caso o Facade não esteja carregado)
    if (!hasSupabaseLib()) {
      console.error('[KCAPI][Supabase] Biblioteca supabase-js não carregada (CDN ausente ou sem internet).');
      return null;
    }

    const url = (ENV.SUPABASE_URL || (ENV.supabase && ENV.supabase.url)) ? String(ENV.SUPABASE_URL || ENV.supabase.url).trim() : '';
    const anonKey = (ENV.SUPABASE_ANON_KEY || (ENV.supabase && ENV.supabase.anonKey)) ? String(ENV.SUPABASE_ANON_KEY || ENV.supabase.anonKey).trim() : '';

    if (!url || !anonKey || anonKey.includes('placeholder')) {
      console.error('[KCAPI][Supabase] KC_ENV SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou placeholders. Configure antes de usar driver="supabase".');
      return null;
    }

    try {
      supabaseClient = window.supabase.createClient(url, anonKey);
      return supabaseClient;
    } catch (e) {
      console.error('[KCAPI][Supabase] Falha ao criar cliente supabase:', e);
      return null;
    }
  }

  // Eager init: resolve o client imediatamente para evitar lazy-init na primeira chamada
  try { getSupabaseClient(); } catch (_) {}

  // ---------- Supabase Auth & Storage (V8.1.3.1) ----------
  async function supabaseGetCurrentUser() {
    try {
      if (KCSupabase && typeof KCSupabase.getUser === 'function') {
        const cachedUser = KCSupabase.getUser();
        if (cachedUser && cachedUser.id) return cachedUser;
      }
      if (KCSupabase && typeof KCSupabase.getCurrentUser === 'function') {
        return await KCSupabase.getCurrentUser();
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      if (client.auth && typeof client.auth.getUser === 'function') {
        const r = await client.auth.getUser();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getCurrentUser erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.user) ? r.data.user : null;
      }

      if (client.auth && typeof client.auth.getSession === 'function') {
        const r = await client.auth.getSession();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getSession erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.session && r.data.session.user) ? r.data.session.user : null;
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getCurrentUser falhou:', e);
    }

    return null;
  }

  // ── Namespace _KCSA: expõe getClient/getCurrentUser para sub-adapters (v11.30.1) ──
  window._KCSA = window._KCSA || {};
  window._KCSA.getClient = getSupabaseClient;
  window._KCSA.getCurrentUser = supabaseGetCurrentUser;

  async function supabaseLogin(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return null;

    try {
      if (KCSupabase && typeof KCSupabase.signIn === 'function') {
        const r = await KCSupabase.signIn(em, pw);
        return (r && r.user) ? r.user : null;
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const r = await client.auth.signInWithPassword({ email: em, password: pw });
      if (r && r.error) {
        console.error('[KCAPI][Supabase] login erro:', r.error);
        return null;
      }
      return (r && r.data && r.data.user) ? r.data.user : null;
    } catch (e) {
      console.error('[KCAPI][Supabase] login falhou:', e);
      return null;
    }
  }

  async function supabaseSignUp(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };

    // Preferimos o facade (V8.1.3.1) para validação de domínio/erros consistentes
    if (KCSupabase && typeof KCSupabase.signUp === 'function') {
      return KCSupabase.signUp(em, pw);
    }

    const client = getSupabaseClient();
    if (!client) return { user: null, session: null, error: { message: 'Supabase não configurado.' } };

    try {
      const r = await client.auth.signUp({ email: em, password: pw });
      if (r && r.error) return { user: null, session: null, error: r.error };
      return { user: (r && r.data && r.data.user) ? r.data.user : null, session: (r && r.data && r.data.session) ? r.data.session : null, error: null };
    } catch (e) {
      return { user: null, session: null, error: { message: 'Falha no cadastro.' } };
    }
  }


  async function supabaseLogout() {
    try {
      if (KCSupabase && typeof KCSupabase.signOut === 'function') {
        const r = await KCSupabase.signOut();
        return !!(r && r.ok);
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const r = await client.auth.signOut();
      if (r && r.error) {
        console.error('[KCAPI][Supabase] logout erro:', r.error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[KCAPI][Supabase] logout falhou:', e);
      return false;
    }
  }

  function getUserDisplayNameForProfile(user) {
    const meta = (user && user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    const direct = meta.display_name || meta.full_name || meta.name || meta.username || meta.preferred_username;
    if (direct && String(direct).trim()) return String(direct).trim();

    const email = String((user && user.email) || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuário';
  }

  function getUserAvatarForProfile(user) {
    const profileAvatar = String((user && user.profile && user.profile.avatar_url) || '').trim();
    return profileAvatar || '';
  }

  async function ensureSupabaseProfileForCreate(client, user) {
    if (!client || !user || !user.id) {
      return {
        ok: false,
        error: {
          message: 'Pré-condição inválida para sincronizar profile.',
          code: 'PROFILE_SYNC_PRECONDITION_FAILED',
        }
      };
    }

    try {
      if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') {
        const synced = await window.KCProfiles.ensureSynced();
        if (!synced || synced.id == null || String(synced.id) === String(user.id)) {
          return { ok: true };
        }
      }
    } catch (e) {
      console.warn('[KCAPI][Supabase] ensureSynced (KCProfiles) falhou; fallback upsert será usado.', e);
    }

    const payload = {
      id: user.id,
      full_name: getUserDisplayNameForProfile(user),
    };

    try {
      const q = client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id');

      const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
      if (res && res.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  // ── Grupo media extraído para supabase.media.adapter.js (v11.30.5) ──────────
  // dataUrlToBlob, extFromMime, sanitizeFilename, checkImageMagicBytes,
  // compressImage, getPostMediaStorageBucket, escapeRegExp, stripSearchAndHash,
  // safeDecodeUriComponent, extractStoragePathFromPostMediaValue,
  // buildPostMediaCleanupContext, cleanupManagedPostMediaStorage,
  // uploadImagesToSupabaseStorage → window._KCSA.media.*

  async function uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, options) {
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const bucket = (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = String(opts.userId || '').trim();
    if (!userId) return { ok: false, error: { message: 'Usuário inválido para upload do avatar.' } };

    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024);
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    let blob = null;
    let directUrl = '';

    if (typeof fileOrDataUrl === 'string') {
      const raw = String(fileOrDataUrl || '').trim();
      if (!raw) return { ok: false, error: { message: 'Imagem inválida para avatar.' } };
      if (/^https?:\/\//i.test(raw)) {
        directUrl = raw;
      } else {
        blob = window._KCSA.media.dataUrlToBlob(raw);
      }
    } else if (typeof Blob !== 'undefined' && fileOrDataUrl instanceof Blob) {
      blob = fileOrDataUrl;
    }

    if (directUrl) {
      return { ok: true, data: { url: directUrl } };
    }

    if (!blob) return { ok: false, error: { message: 'Formato de imagem inválido para avatar.' } };

    const mime = String(blob.type || '').toLowerCase();
    if (!allowedTypes.has(mime)) {
      return { ok: false, error: { message: 'Use uma imagem JPG, PNG ou WEBP para o avatar.' } };
    }
    if (blob.size > maxBytes) {
      return { ok: false, error: { message: 'A imagem do avatar excede o limite permitido.' } };
    }
    // Valida magic bytes (defesa contra arquivos maliciosos com MIME falsificado)
    const actualMime = await window._KCSA.media.checkImageMagicBytes(blob);
    if (!actualMime || !allowedTypes.has(actualMime)) {
      return { ok: false, error: { message: 'O arquivo não é uma imagem válida.' } };
    }

    // Comprime avatar antes do upload (v9.4.1) — max 400×400px
    const compressedAvatar = await window._KCSA.media.compressImage(blob, 400, 400, 0.85);
    const avatarMime = compressedAvatar.type || mime;
    const ext = window._KCSA.media.extFromMime(avatarMime);
    const filename = window._KCSA.media.sanitizeFilename(`avatar.${ext}`);
    const path = `profile-avatars/${userId}/${Date.now()}-${filename}`;
    const storage = client.storage.from(bucket);

    const up = await storage.upload(path, compressedAvatar, { contentType: avatarMime || 'application/octet-stream', upsert: false });
    if (up && up.error) {
      return {
        ok: false,
        error: {
          message: 'Falha no upload do avatar.',
          code: (up.error.code != null && String(up.error.code).trim()) ? String(up.error.code).trim() : 'PROFILE_AVATAR_UPLOAD_FAILED',
          details: up.error.details || null,
          hint: up.error.hint || null,
          bucket,
          path,
        },
      };
    }

    const pub = storage.getPublicUrl(path);
    const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
    if (!publicUrl) {
      return { ok: false, error: { message: 'Não foi possível obter a URL pública do avatar.' } };
    }

    return { ok: true, data: { url: publicUrl, path } };
  }



  // ── Grupo posts-read extraído para supabase.posts-read.adapter.js (v11.30.7) ──
  // mergeMetadataSafe, pickFirstNonEmpty, resolveNormalizedAuthorName,
  // resolveNormalizedAuthorAvatar, logAuthorDiagnosticsDev, mapSupabasePost,
  // normalizeSupabasePost, buildSupabasePostSelect, buildSupabasePostSelectFallback,
  // isMissingCommentsEmbedError, supabaseGetPostById, buildSupabasePostsQuery,
  // buildSupabasePostsQueryFallback, isMissingVerifiedColumnError,
  // normalizeSupabaseFilters, buildOrILike, supabaseGetPosts, supabaseSearchPosts,
  // supabaseGetFeedCursor
  // → window._KCSA.posts.*

  async function supabaseGetUserRatingSummary(userId) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUserRatingSummary === 'function') {
        return await window.KCSupabase.getUserRatingSummary(userId);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] getUserRatingSummary falhou:', error);
    }
    return { userId: String(userId || '').trim() || null, average: null, count: 0 };
  }

  async function supabaseGetUserRatingState(params = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUserRatingState === 'function') {
        return await window.KCSupabase.getUserRatingState(params);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] getUserRatingState falhou:', error);
    }

    return {
      targetUserId: String((params && (params.targetUserId || params.target_user_id)) || '').trim() || null,
      contextPostId: String((params && (params.contextPostId || params.context_post_id)) || '').trim() || null,
      canRate: false,
      reason: 'UNKNOWN',
      myRating: null,
    };
  }

  async function supabaseListUserRatings(userId, options = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.listUserRatings === 'function') {
        return await window.KCSupabase.listUserRatings(userId, options);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] listUserRatings falhou:', error);
    }

    const page = Math.max(1, parseInt(String(options && options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options && options.limit != null ? options.limit : 10), 10) || 10);
    return {
      items: [],
      page,
      limit,
      total: 0,
      hasMore: false,
    };
  }

  async function supabaseUpsertUserRating(payload = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.upsertUserRating === 'function') {
        return await window.KCSupabase.upsertUserRating(payload);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] upsertUserRating falhou:', error);
      return { ok: false, error };
    }

    return { ok: false, error: { message: 'Avaliações indisponíveis no cliente Supabase.' } };
  }
  /*
    } catch (e) {
      console.error('[KCAPI][Supabase] getFeedCursor falhou:', e);
      throw e;
    }

    console.warn('[KCAPI][Supabase] KCSupabase.getFeedCursor indisponÃ­vel; retornando lote vazio.');
    return {
      posts: [],
      nextCursor: null,
      hasMore: false,
    };
  }
  */


  // ---------- Supabase Write Path (V8.1.3.1) ----------
  function parsePriceMaybe(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    // tenta BRL: 1.234,56
    const norm = s
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  function toSlug(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
      return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    } catch (_) {
      return s.toLowerCase();
    }
  }

  function clampCreatedAtISO() {
    // Temporal clamp dinâmico (configurável via KC_ENV.clamp)
    const MONTH_MAP = { january:1,february:2,march:3,april:4,may:5,june:6,
                        july:7,august:8,september:9,october:10,november:11,december:12 };
    const d = new Date();
    const y = (ENV.clamp && ENV.clamp.year) ? parseInt(String(ENV.clamp.year), 10) : d.getFullYear();
    const yy = Number.isFinite(y) ? y : d.getFullYear();
    const rawMonth = (ENV.clamp && ENV.clamp.month) ? String(ENV.clamp.month).toLowerCase() : null;
    const mi = (rawMonth && MONTH_MAP[rawMonth]) ? MONTH_MAP[rawMonth] : (d.getMonth() + 1);
    const mm = String(mi).padStart(2, '0');
    return `${yy}-${mm}-15T12:00:00.000Z`;
  }

  function normalizeCreatePayload(data) {
    const d = (data && typeof data === 'object') ? data : {};
    const rawVisibility = String(d.visibility || (d.metadata && d.metadata.visibility) || '').trim().toLowerCase();
    const visibility = rawVisibility === 'community' ? 'community' : 'public';

    const modulo = (d.modulo || d.module || '').toString().trim();
    const categoryKey = (d.categoriaKey || d.categoryKey || d.category || d.categoria || '').toString().trim();
    const subKey = (d.subcategoriaKey || d.subcategoryKey || d.subcategory || d.subcategoria || '').toString().trim();

    const title = (d.titulo || d.title || '').toString().trim();
    const description = (d.descricao || d.description || '').toString().trim();

    const price = (d.preco != null) ? parsePriceMaybe(d.preco) : parsePriceMaybe(d.price);
    const location = (d.localizacao || d.location || '').toString().trim();

    const images = Array.isArray(d.imagens) ? d.imagens : (Array.isArray(d.images) ? d.images : []);

    // labels (opcionais) para manter UI rica via metadata
    // (mantém retrocompatibilidade: payloads antigos usavam d.categoria/d.subcategoria como labels)
    const categoriaLabel = (d.categoriaLabel || d.categoryLabel || (d.categoriaKey ? '' : d.categoria) || (d.categoryKey ? '' : d.category) || '').toString().trim();
    const subcategoriaLabel = (d.subcategoriaLabel || d.subcategoryLabel || (d.subcategoriaKey ? '' : d.subcategoria) || (d.subcategoryKey ? '' : d.subcategory) || '').toString().trim();

    const moduleDB = toSlug(modulo);
    const categoryDB = toSlug(categoryKey || categoriaLabel);

    // V8.1.3.1: compra-venda usa tabs por categoria (ex.: eletronicos).
    // Se algum payload vier com subKey=ação, normalizamos para a categoria.
    const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
    const subKeySlug = toSlug(subKey);
    const effectiveSubKey = (moduleDB === 'compra-venda' && subKeySlug && actionish.includes(subKeySlug) && categoryKey)
      ? categoryKey
      : subKey;

    const subcategoryDB = toSlug(effectiveSubKey || subcategoriaLabel);

    // metadata: mantém dados extras sem inflar colunas
    const metadata = {
      ...(d.metadata && typeof d.metadata === 'object' ? d.metadata : {}),
      // filtros (JSONB)
      ...(subcategoryDB ? { subcategory: subcategoryDB } : {}),
      // labels
      ...(categoriaLabel ? { categoryLabel: categoriaLabel } : {}),
      ...(subcategoriaLabel ? { subcategoryLabel: subcategoriaLabel } : {}),
      // chaves úteis do formulário
      ...((categoryKey || d.categoriaKey || d.categoryKey) ? { categoryKey: toSlug(categoryKey || d.categoriaKey || d.categoryKey) } : {}),
      ...((effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) ? { subcategoryKey: toSlug(effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) } : {}),
      ...(Array.isArray(d.tags) ? { tags: d.tags } : {}),
      ...(Array.isArray(d.tagKeys) ? { tagKeys: d.tagKeys } : {}),
      ...(d.condicao ? { condicao: String(d.condicao) } : {}),
      ...(d.precoTexto ? { precoTexto: String(d.precoTexto) } : {}),
      ...(typeof d.sustentavel === 'boolean' ? { sustentavel: d.sustentavel } : {}),
      ...(d.emoji ? { emoji: String(d.emoji) } : {}),
      ...(typeof d.verificado === 'boolean' ? { verificado: d.verificado } : {}),
      visibility,
    };

    return {
      moduleDB,
      categoryDB,
      subcategoryDB,
      title,
      description,
      price,
      location,
      visibility,
      images,
      metadata,
      // também devolvemos o payload bruto para retorno local (labels)
      raw: { ...d },
    };
  }

  async function supabaseCreatePost(data) {
    createPostDiagnostics.clear();

    const client = getSupabaseClient();
    if (!client) {
      createPostDiagnostics.set('AUTH', {
        message: 'Supabase client não disponível para createPost.',
        code: 'SUPABASE_CLIENT_MISSING',
      }, { driver: ENV.driver });
      return null;
    }

    const user = await supabaseGetCurrentUser();
    if (!user) {
      createPostDiagnostics.set('AUTH', {
        message: 'Usuário não autenticado para createPost.',
        code: 'NOT_AUTHENTICATED',
      }, { driver: ENV.driver });
      return null;
    }

    const parsed = normalizeCreatePayload(data);
    const payloadSummary = summarizeCreatePayloadForCreateDiagnostics(parsed);
    if (!parsed.title || !parsed.description || !parsed.moduleDB) {
      createPostDiagnostics.set('PAYLOAD', {
        message: 'Payload de createPost incompleto (título/descrição/módulo).',
        code: 'INVALID_CREATE_PAYLOAD',
      }, payloadSummary);
      return null;
    }

    const profileSync = await ensureSupabaseProfileForCreate(client, user);
    if (!profileSync.ok) {
      createPostDiagnostics.set('PROFILE_SYNC', profileSync.error, {
        userId: user.id,
      });
      return null;
    }

    // ── Verificação de limite de publicações ativas ─────────
    try {
      const moduleForLimit = (parsed && parsed.moduleDB) ? String(parsed.moduleDB).trim() : null;
      const limitCheck = await client.rpc('kc_check_post_limit', {
        p_user_id: user.id,
        p_module: moduleForLimit || null,
      });
      if (limitCheck && !limitCheck.error && limitCheck.data) {
        const check = limitCheck.data;
        if (check && check.ok === false) {
          const limitMsg = `Você atingiu o limite de ${check.limit} publicações ativas${moduleForLimit ? ' neste módulo' : ''}. Desabilite ou exclua uma publicação antes de criar uma nova.`;
          createPostDiagnostics.set('POST_LIMIT', {
            message: limitMsg,
            code: 'POST_LIMIT_REACHED',
            limit: check.limit,
            count: check.count,
          }, { module: moduleForLimit });
          return { _kcError: 'POST_LIMIT_REACHED', message: limitMsg, limit: check.limit, count: check.count };
        }
      }
    } catch (_limitErr) {
      // Falha na checagem de limite não bloqueia a criação (graceful degradation)
      console.warn('[KCAPI][Supabase] kc_check_post_limit falhou (criação permitida):', _limitErr);
    }

    let postId = null;
    let uploaded = [];

    async function rollbackCreatedPostSafely(targetPostId) {
      if (!targetPostId) return { ok: false };
      try {
        const del = await client.from('posts').delete().eq('id', targetPostId);
        if (del && del.error) {
          console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
          return { ok: false, error: del.error };
        }
        return { ok: true };
      } catch (e) {
        console.warn('[KCAPI][Supabase] rollback delete excecao:', e);
        return { ok: false, error: e };
      }
    }

    try {

      // 1) Insere post primeiro (para obter postId) e habilitar path controlado no Storage
      // Não enviamos created_at: o BD usa DEFAULT now() para garantir ordenação correta (P0-C fix)

      const insertPayload = {
        author_id: user.id,
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        visibility: parsed.visibility,
        metadata: parsed.metadata,
      };

      // Helper de rollback (evita órfãos quando upload falha após INSERT)
      async function rollbackCreatedPost(postId) {
        try {
          const del = await client.from('posts').delete().eq('id', postId);
          if (del && del.error) console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
        } catch (e) {
          console.warn('[KCAPI][Supabase] rollback delete exceção:', e);
        }
      }

      // 2) INSERT posts (gera UUID)
      const ins = await client
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();

      if (ins && ins.error) {
        // v9.3.2: detectar flood control (trigger kc_anti_spam_gate)
        var insErrMsg = String((ins.error && ins.error.message) || '');
        if (insErrMsg.includes('flood_limit_exceeded')) {
          return {
            _kcError: 'FLOOD_LIMIT',
            message: 'Limite de 3 publicações por hora atingido. Aguarde antes de publicar novamente.',
          };
        }
        createPostDiagnostics.set('POST_INSERT', ins.error, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      postId = (ins && ins.data && ins.data.id) ? ins.data.id : null;
      if (!postId) {
        createPostDiagnostics.set('POST_INSERT', {
          message: 'INSERT em posts não retornou id.',
          code: 'POST_INSERT_NO_ID',
        }, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      // 3) Upload das imagens (se houver) com path controlado (post-media/{userId}/{postId}/...)
      const uploadResult = await window._KCSA.media.uploadImages(client, parsed.images, { userId: user.id, postId });
      if (!uploadResult || !uploadResult.ok) {
        const uploadCleanup = window._KCSA.media.buildCleanupContext(uploadResult && uploadResult.error ? uploadResult.error.cleanup : null);
        const cleanupFailed = uploadCleanup.failedPaths.length > 0;
        if (!cleanupFailed) {
          await rollbackCreatedPostSafely(postId);
        } else {
          console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup do upload:', uploadCleanup);
        }
        createPostDiagnostics.set('STORAGE_UPLOAD', uploadResult ? uploadResult.error : null, {
          postId,
          userId: user.id,
          imagesCount: Array.isArray(parsed.images) ? parsed.images.length : 0,
          rollbackSkipped: cleanupFailed,
          ...uploadCleanup,
        });
        return null;
      }
      uploaded = Array.isArray(uploadResult.uploaded) ? uploadResult.uploaded : [];

      // 4) Insere mídias (post_media) com capa + ordem
      if (Array.isArray(uploaded) && uploaded.length) {
        const mediaRowsFull = uploaded
          .filter((m) => m && m.url)
          .map((m, idx) => ({
            post_id: postId,
            url: String(m.url),
            is_cover: idx === 0, // regra: capa = 1Âª imagem ordenada
            sort_order: Number.isFinite(m.sort_order) ? m.sort_order : idx,
          }));

        // Tenta com sort_order (V8.1.5.1); fallback se schema ainda não tiver coluna.
        let mr = await client.from('post_media').insert(mediaRowsFull);
        if (mr && mr.error) {
          const msg = String(mr.error.message || '').toLowerCase();
          if (msg.includes('sort_order')) {
            const mediaRowsCompat = mediaRowsFull.map(({ sort_order, ...rest }) => rest);
            mr = await client.from('post_media').insert(mediaRowsCompat);
          }
        }

        if (mr && mr.error) {
          const cleanup = await window._KCSA.media.cleanupStorage(client, uploaded, { userId: user.id, postId });
          const cleanupContext = window._KCSA.media.buildCleanupContext(cleanup);
          const cleanupFailed = cleanupContext.failedPaths.length > 0;
          if (!cleanupFailed) {
            await rollbackCreatedPostSafely(postId);
          } else {
            console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de post_media:', cleanupContext);
          }
          createPostDiagnostics.set('POST_MEDIA_INSERT', mr.error, {
            postId,
            mediaCount: mediaRowsFull.length,
            rollbackSkipped: cleanupFailed,
            ...cleanupContext,
          });
          return null;
        }
      }

      // 5) Rebusca completo (com JOINs) e normaliza no contrato do modo local (com JOINs) e normaliza no contrato do modo local
      const getPostByIdFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const mapped = getPostByIdFn ? await getPostByIdFn(postId) : null;
      if (!mapped) {
        createPostDiagnostics.set('POST_FETCH', {
          message: 'Post criado, mas a leitura final falhou.',
          code: 'POST_FETCH_EMPTY',
        }, { postId });
        return null;
      }

      // injeta labels do payload bruto (caso category esteja em slug)
      const raw = { ...mapped };
      if (parsed.raw && parsed.raw.categoria && !raw.categoria) raw.categoria = parsed.raw.categoria;
      if (parsed.raw && parsed.raw.subcategoria && !raw.subcategoria) raw.subcategoria = parsed.raw.subcategoria;

      createPostDiagnostics.clear();
      var normalizedPost = normalizePost(raw);
      // v9.3.2: sinalizar post auto-moderado para o caller mostrar feedback
      if (normalizedPost && normalizedPost.status === 'pending') {
        normalizedPost._kcPending = true;
        normalizedPost._kcPendingReason = 'Sua publicação foi enviada para análise da moderação antes de aparecer nos feeds.';
      }
      return normalizedPost;
    } catch (e) {
      let cleanupContext = window._KCSA.media.buildCleanupContext(null);
      if (postId && Array.isArray(uploaded) && uploaded.length) {
        cleanupContext = window._KCSA.media.buildCleanupContext(await window._KCSA.media.cleanupStorage(client, uploaded, { userId: user.id, postId }));
      }
      const cleanupFailed = cleanupContext.failedPaths.length > 0;
      if (postId && !cleanupFailed) {
        await rollbackCreatedPostSafely(postId);
      } else if (postId && cleanupFailed) {
        console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de excecao:', cleanupContext);
      }
      createPostDiagnostics.set('EXCEPTION', e, {
        userId: user.id,
        payload: payloadSummary,
        postId,
        rollbackSkipped: !!(postId && cleanupFailed),
        ...cleanupContext,
      });
      return null;
    }
  }

  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function enforceSupabaseOnProduction(operationName) {
    if (!ENV.isProduction) return null;
    if (ENV.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
  }

  function normalizeUpdatePayload(data) {
    const parsed = normalizeCreatePayload(data);
    if (!parsed.title) return { ok: false, error: { message: 'Título é obrigatório.' } };
    if (!parsed.description) return { ok: false, error: { message: 'Descrição é obrigatória.' } };
    if (!parsed.moduleDB) return { ok: false, error: { message: 'Módulo é obrigatório.' } };
    if (!parsed.categoryDB) return { ok: false, error: { message: 'Categoria é obrigatória.' } };

    return {
      ok: true,
      data: {
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        visibility: parsed.visibility,
        metadata: parsed.metadata,
      },
      images: parsed.images,
    };
  }

  async function resolvePostUuid(postId) {
    if (typeof postId === 'string' && UUID_RE.test(postId)) return String(postId);
    if (postId == null) return null;
    try {
      const getPostByIdFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const post = getPostByIdFn ? await getPostByIdFn(String(postId)) : null;
      if (post && post.uuid && UUID_RE.test(String(post.uuid))) return String(post.uuid);
      if (post && post.id && UUID_RE.test(String(post.id))) return String(post.id);
    } catch (_) { }
    return null;
  }

  async function supabaseUpdatePost(postId, payload) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('Faça login para editar.');

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return kcApiError('Payload inválido para edição.');
    }

    const parsed = normalizeUpdatePayload(payload);
    if (!parsed.ok) return parsed;

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para edição.');

    try {
      // 1) Ownership check
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] updatePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de edição.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('Você não pode editar este post.');

      // 2) Update post fields (text, metadata, etc.)
      const upd = await client
        .from('posts')
        .update(parsed.data)
        .eq('id', postUuid)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle();

      if (upd && upd.error) {
        console.error('[KCAPI][Supabase] updatePost erro:', upd.error);
        return kcApiError('Não foi possível salvar alterações.');
      }

      // 3) Handle image updates (upload new, delete removed, sync post_media)
      // Always sync — even if empty (user might have removed all images)
      const newImages = Array.isArray(parsed.images) ? parsed.images : [];
      try {
        await syncPostMediaForUpdate(client, postUuid, user.id, newImages);
      } catch (imgErr) {
        console.error('[KCAPI][Supabase] updatePost syncPostMedia erro:', imgErr);
        // Non-blocking: text fields were saved, image sync failed partially
      }

      const getPostByIdFn2 = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
      const updated = getPostByIdFn2 ? await getPostByIdFn2(postUuid) : null;
      if (!updated) return kcApiError('Post atualizado, mas não foi possível recarregar.');

      return { ok: true, data: updated };
    } catch (e) {
      console.error('[KCAPI][Supabase] updatePost exceção:', e);
      return kcApiError('Não foi possível salvar alterações.');
    }
  }

  /**
   * Sync post_media entries for an update operation.
   * Handles: keep existing URLs, upload new data URLs, delete removed images.
   */
  async function syncPostMediaForUpdate(client, postUuid, userId, newImages) {
    // 1) Fetch current post_media entries for this post
    const currentMedia = await client
      .from('post_media')
      .select('id, url, is_cover, sort_order')
      .eq('post_id', postUuid);

    const currentRows = (currentMedia && !currentMedia.error && Array.isArray(currentMedia.data))
      ? currentMedia.data
      : [];

    const currentUrlSet = new Set(currentRows.map(r => String(r.url || '')).filter(Boolean));

    // 2) Classify new images: existing URLs to keep vs new data URLs to upload
    const keepUrls = new Set();
    const toUpload = []; // { index, dataUrl }
    const orderedFinal = []; // { url, sort_order, is_cover }

    for (let i = 0; i < newImages.length; i++) {
      const item = newImages[i];
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        // Existing URL — keep it
        keepUrls.add(item);
        orderedFinal.push({ url: item, sort_order: i, is_cover: i === 0 });
      } else if (typeof item === 'string' && item.startsWith('data:')) {
        // New data URL — needs upload
        toUpload.push({ index: i, dataUrl: item });
        orderedFinal.push({ url: null, uploadIdx: toUpload.length - 1, sort_order: i, is_cover: i === 0 });
      }
    }

    // 3) Upload new images to Storage
    if (toUpload.length > 0) {
      const dataUrls = toUpload.map(t => t.dataUrl);
      const uploadResult = await window._KCSA.media.uploadImages(client, dataUrls, { userId, postId: postUuid });
      if (uploadResult && uploadResult.ok && Array.isArray(uploadResult.uploaded)) {
        // Map uploaded URLs back into orderedFinal
        for (let u = 0; u < uploadResult.uploaded.length; u++) {
          const uploadedItem = uploadResult.uploaded[u];
          const finalEntry = orderedFinal.find(f => f.uploadIdx === u);
          if (finalEntry && uploadedItem && uploadedItem.url) {
            finalEntry.url = uploadedItem.url;
          }
        }
      } else {
        console.error('[KCAPI][Supabase] syncPostMedia upload falhou:', uploadResult);
      }
    }

    // Filter out entries that failed to upload
    const validFinal = orderedFinal.filter(f => f.url);

    // 4) Delete removed images from Storage
    const removedUrls = [];
    currentRows.forEach(row => {
      if (row.url && !keepUrls.has(String(row.url))) {
        removedUrls.push(row);
      }
    });

    if (removedUrls.length > 0) {
      try {
        await window._KCSA.media.cleanupStorage(client, removedUrls, { userId, postId: postUuid });
      } catch (cleanupErr) {
        console.warn('[KCAPI][Supabase] syncPostMedia cleanup de imagens removidas falhou:', cleanupErr);
      }
    }

    // 5) Delete ALL current post_media rows for this post
    if (currentRows.length > 0) {
      const delMedia = await client.from('post_media').delete().eq('post_id', postUuid);
      if (delMedia && delMedia.error) {
        console.error('[KCAPI][Supabase] syncPostMedia delete post_media falhou:', delMedia.error);
      }
    }

    // 6) Insert new post_media rows in the correct order
    if (validFinal.length > 0) {
      const mediaRows = validFinal.map((f, idx) => ({
        post_id: postUuid,
        url: String(f.url),
        is_cover: idx === 0,
        sort_order: idx,
      }));

      let mr = await client.from('post_media').insert(mediaRows);
      if (mr && mr.error) {
        const msg = String(mr.error.message || '').toLowerCase();
        if (msg.includes('sort_order')) {
          const mediaRowsCompat = mediaRows.map(function (r) {
            var copy = { post_id: r.post_id, url: r.url, is_cover: r.is_cover };
            return copy;
          });
          mr = await client.from('post_media').insert(mediaRowsCompat);
        }
      }
      if (mr && mr.error) {
        console.error('[KCAPI][Supabase] syncPostMedia insert post_media falhou:', mr.error);
      }
    }
  }

  async function supabaseDeletePost(postId) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('Faça login para excluir.');

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para exclusão.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] deletePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de exclusão.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('Você não pode excluir este post.');

      const media = await client.from('post_media').select('id, url').eq('post_id', postUuid);
      if (media && media.error) {
        console.error('[KCAPI][Supabase] deletePost leitura de post_media falhou:', media.error);
        return kcApiError('NÀƒÂ£o foi possÀƒÂ­vel validar as mÀƒÂ­dias da publicaÀƒÂ§ÀƒÂ£o.');
      }

      const cleanup = await window._KCSA.media.cleanupStorage(client, (media && media.data) ? media.data : [], {
        userId: user.id,
        postId: postUuid,
      });
      if (Array.isArray(cleanup.failedPaths) && cleanup.failedPaths.length) {
        console.error('[KCAPI][Supabase] deletePost cleanup bloqueou a exclusao:', cleanup);
        return {
          ok: false,
          error: {
            message: 'Nao foi possivel excluir a publicacao porque a remocao das midias falhou. Tente novamente.',
            code: 'POST_MEDIA_STORAGE_CLEANUP_FAILED',
            details: cleanup,
          },
        };
      }

      const del = await client.from('posts').delete().eq('id', postUuid).eq('author_id', user.id);
      if (del && del.error) {
        console.error('[KCAPI][Supabase] deletePost erro:', del.error);
        return kcApiError('Não foi possível excluir a publicação.');
      }
      return { ok: true };
    } catch (e) {
      console.error('[KCAPI][Supabase] deletePost exceção:', e);
      return kcApiError('Não foi possível excluir a publicação.');
    }
  }

  // ---------- Reports (V8.1.6.2) ----------
  // Denunciar Post: insere 1 linha em public.reports (RLS força reporter_id = auth.uid())
  // Retorno: { ok, data?, error? }
  async function supabaseReportPost(postId, payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para denunciar.' } };

    // resolve UUID do post (aceita uuid direto; para legacy numérico tenta resolver via getPostById)
    let postUuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!postUuid && postId != null) {
      try {
        const getPostByIdFn3 = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function' ? window._KCSA.posts.getPostById : null;
        const p = getPostByIdFn3 ? await getPostByIdFn3(String(postId)) : null;
        if (p && p.uuid && UUID_RE.test(String(p.uuid))) postUuid = String(p.uuid);
        else if (p && p.id && UUID_RE.test(String(p.id))) postUuid = String(p.id);
      } catch (_) { }
    }
    if (!postUuid) return { ok: false, error: { message: 'Post inválido para denúncia.' } };

    const reason = String(payload.reason || '').trim().toLowerCase();
    const allowed = new Set(['spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other']);
    if (!allowed.has(reason)) return { ok: false, error: { message: 'Selecione um motivo válido.' } };

    const detailsRaw = (payload.details == null) ? '' : String(payload.details);
    const details = detailsRaw.trim().slice(0, 1000);

    try {
      // Caminho preferencial (V8.2.9.1): RPC server-side para reduzir fragilidade de RLS no client.
      const rpc = await client.rpc('kc_report_post', {
        p_post_id: postUuid,
        p_reason: reason,
        p_details: details ? details : null,
      });

      if (rpc && !rpc.error && rpc.data && typeof rpc.data === 'object') {
        if (rpc.data.ok) {
          return {
            ok: true,
            data: {
              id: rpc.data.id || null,
              post_id: rpc.data.post_id || postUuid,
            },
          };
        }

        const rpcMessage = String(rpc.data.message || '').trim();
        const rpcCode = String(rpc.data.code || '').trim().toUpperCase();
        if (rpcCode === 'ALREADY_REPORTED') {
          return { ok: false, error: { message: rpcMessage || 'Você já denunciou este post.' }, meta: { duplicate: true } };
        }

        if (rpcMessage) {
          return { ok: false, error: { message: rpcMessage } };
        }
      }

      // Fallback legado: INSERT direto
      const ins = await client
        .from('reports')
        .insert({
          post_id: postUuid,
          reporter_id: user.id,
          reason,
          details: details ? details : null,
          status: 'open',
        })
        .select('id, created_at')
        .maybeSingle();

      if (ins && ins.error) {
        // UNIQUE parcial: reports_unique_open_post_reporter
        const code = String(ins.error.code || '');
        const msg = String(ins.error.message || '').toLowerCase();
        if (code === '23505' || msg.includes('reports_unique_open_post_reporter') || msg.includes('duplicate')) {
          return { ok: false, error: { message: 'Você já denunciou este post.' }, meta: { duplicate: true } };
        }
        console.error('[KCAPI][Supabase] reportPost erro:', ins.error);
        return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
      }

      return { ok: true, data: (ins && ins.data) ? ins.data : { id: null } };
    } catch (e) {
      console.error('[KCAPI][Supabase] reportPost exceção:', e);
      return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
    }
  }
  // ── Comments (V8.1.7.2) — extraídas para supabase.comments.adapter.js (v11.30.3) ──

  async function supabaseGetMyProfile() {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await supabaseGetCurrentUser();
    if (!user) return null;

    try {
      const res = await client
        .from('profiles')
        .select(OWNER_PROFILE_FIELDS)
        .eq('id', user.id)
        .maybeSingle();
      if (res && res.error) {
        console.error('[KCAPI][profile] getMyProfile:', res.error);
        return null;
      }
      if (res && res.data) syncCurrentProfileCache(res.data);
      return (res && res.data) ? res.data : null;
    } catch (e) {
      console.error('[KCAPI][profile] getMyProfile exceção:', e);
      return null;
    }
  }

  function syncCurrentProfileCache(profile) {
    if (window.KCProfiles && typeof window.KCProfiles.commitProfile === 'function') {
      try {
        return window.KCProfiles.commitProfile(profile);
      } catch (_) { }
    }
    try {
      document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
    } catch (_) { }
    return profile || null;
  }

  async function supabaseUpdateMyProfile(patch = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para editar seu perfil.' } };

    const updates = normalizeProfilePatchForAdapter(patch);
    const displayName = Object.prototype.hasOwnProperty.call(updates, 'display_name')
      ? String(updates.display_name || '').trim()
      : '__skip__';
    if (Object.prototype.hasOwnProperty.call(updates, 'display_name') && !String(updates.display_name || '').trim()) {
      return { ok: false, error: { message: 'Informe um nome valido.' } };
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
      const avatarUrl = String(updates.avatar_url || '').trim();
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return { ok: false, error: { message: 'URL de avatar inválida.' } };
      }
      updates.avatar_url = avatarUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_path')) {
      updates.avatar_path = String(updates.avatar_path || '').trim() || null;
    }
    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }
    if (!displayName) return { ok: false, error: { message: 'Informe um nome válido.' } };

    try {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select(OWNER_PROFILE_FIELDS)
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][profile] updateMyProfile:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar seu perfil.' } };
      }
      if (!data) {
        return { ok: false, error: { message: 'No momento, não é possível alterar seu nome.' } };
      }
      syncCurrentProfileCache(data);
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][profile] updateMyProfile exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar seu perfil.' } };
    }
  }

  async function supabaseUploadProfileAvatar(fileOrDataUrl) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para atualizar seu avatar.' } };

    try {
      return await uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId: user.id });
    } catch (e) {
      console.error('[KCAPI][profile] uploadProfileAvatar exceção:', e);
      return { ok: false, error: { message: 'Não foi possível enviar o avatar.' } };
    }
  }

  // ── Admin / Help Requests — extraídas para supabase.admin.adapter.js (v11.30.2) ──

  // ── Grupo posts-read (parte 2) extraído para supabase.posts-read.adapter.js (v11.30.7) ──
  // supabaseGetMyPosts, supabaseGetPostsByAuthorId, supabaseGetRelatedPosts
  // → window._KCSA.posts.*

  // ── Grupo saved extraído para supabase.saved.adapter.js (v11.30.6) ──────────
  // resolvePostUuidForSavedPosts, normalizeSaveKind, normalizeSaveKinds,
  // mapSavedSummaryRow, aggregateSavedRows, paginateList, fetchSavedRowsFallback,
  // supabaseGetSavedPostState(legacy), supabaseSetSavedPostState(legacy),
  // supabaseClearSavedPostState(legacy), supabaseGetMySavedPosts(legacy),
  // supabaseGetProfileHighlights(legacy), supabaseGetSavedPostStateMulti,
  // supabaseClearSavedPostStateMulti, supabaseSetSavedPostStateMulti,
  // supabaseGetMySavedPostsMulti, supabaseGetMySavedPostsCount,
  // supabaseGetProfileHighlightsMulti, supabaseGetProfileHighlightsCount
  // → window._KCSA.saved.*

  // ── Comments / likeComment — extraído para supabase.comments.adapter.js (v11.30.3) ──

  // ── Votes (V8.1.7.3) — extraídas para supabase.votes.adapter.js (v11.30.4) ──

  // ── kc_toggle_post_status ────────────────────────────────────
  // Permite ao autor alternar o próprio anúncio entre published ↔ hidden.
  // Bloqueia reativação quando o usuário está no limite de publicações ativas.
  async function supabaseTogglePostStatus(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };

    try {
      const { data, error } = await client.rpc('kc_toggle_post_status', { p_post_id: uuid });
      if (error) {
        return { ok: false, error };
      }
      if (!data || data.ok === false) {
        return {
          ok: false,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível alterar o status da publicação.',
          limit: data && data.limit,
          count: data && data.count,
        };
      }
      return {
        ok: true,
        new_status: data.new_status,
        message: data.message,
      };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  // ── Renovar post expirado/oculto ──────────────────────────────────────────
  async function supabaseRenewPost(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };
    try {
      const { data, error } = await client.rpc('kc_renew_post', { p_post_id: uuid });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          _kcError: data && data.code === 'LIMIT_REACHED' ? 'POST_LIMIT_REACHED' : undefined,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível renovar a publicação.',
          limit: data && data.limit,
          count: data && data.count,
        };
      }
      return { ok: true, new_status: data.new_status, expires_at: data.expires_at, message: data.message };
    } catch (e) { return { ok: false, error: e }; }
  }

  // ── Impulsionar post (bump) ────────────────────────────────────────────────
  async function supabaseBumpPost(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const uuid = String(postId || '').trim();
    if (!uuid) return { ok: false, error: { message: 'ID de publicação inválido.' } };
    try {
      const { data, error } = await client.rpc('kc_bump_post', { p_post_id: uuid });
      if (error) return { ok: false, error };
      if (!data || data.ok === false) {
        return {
          ok: false,
          code: (data && data.code) || 'UNKNOWN',
          message: (data && data.message) || 'Não foi possível impulsionar a publicação.',
          next_bump_at: data && data.next_bump_at,
        };
      }
      return { ok: true, bumped_at: data.bumped_at, next_bump_at: data.next_bump_at, message: data.message };
    } catch (e) { return { ok: false, error: e }; }
  }

  // ── Analytics — extraídas para supabase.analytics.adapter.js (v11.30.1) ──

  // ── Notifications (v9.1.0) — extraídas para supabase.notifications.adapter.js (v11.30.1) ──

  // ── Convites de usuários externos (v9.1.0.3) ─────────────────────────────

  async function supabaseInviteExternalUser(email, note) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: 'SUPABASE_NOT_READY' };
    var em = String(email || '').trim().toLowerCase();
    var nt = String(note || '').trim() || null;
    if (!em || !em.includes('@')) return { ok: false, error: 'EMAIL_INVALIDO' };
    try {
      var result = await client.functions.invoke('kc-invite-user', {
        body: { email: em, note: nt },
      });
      if (result.error) return { ok: false, error: result.error.message || String(result.error) };
      var data = result.data;
      if (data && data.error) return { ok: false, error: data.error };
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  async function supabaseGetInvites() {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: 'SUPABASE_NOT_READY' };
    try {
      var r = await client.rpc('kc_admin_get_invites');
      if (r.error) return { data: null, error: r.error.message || String(r.error) };
      return { data: r.data || [], error: null };
    } catch (e) {
      return { data: null, error: e && e.message ? e.message : String(e) };
    }
  }

  async function supabaseRevokeInvite(email) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: 'SUPABASE_NOT_READY' };
    try {
      var r = await client.rpc('kc_admin_revoke_invite', { p_email: String(email || '').trim().toLowerCase() });
      if (r.error) return { ok: false, error: r.error.message || String(r.error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  // Garante namespaces _KCSA para degradação elegante quando sub-adapters não estão carregados (v11.30.1+)
  window._KCSA.analytics = window._KCSA.analytics || {};
  window._KCSA.notifications = window._KCSA.notifications || {};
  window._KCSA.admin = window._KCSA.admin || {};
  window._KCSA.comments = window._KCSA.comments || {};
  window._KCSA.votes = window._KCSA.votes || {};
  window._KCSA.media = window._KCSA.media || {};
  window._KCSA.saved = window._KCSA.saved || {};
  window._KCSA.posts = window._KCSA.posts || {};

  // Driver Supabase (V8.1.7.2+)
  const driverSupabase = Object.freeze({
    name: 'supabase',
    getPosts: window._KCSA.posts.getPosts,
    searchPosts: window._KCSA.posts.searchPosts,
    getFeedCursor: window._KCSA.posts.getFeedCursor,
    getUserRatingSummary: supabaseGetUserRatingSummary,
    getUserRatingState: supabaseGetUserRatingState,
    listUserRatings: supabaseListUserRatings,
    upsertUserRating: supabaseUpsertUserRating,
    getPostById: window._KCSA.posts.getPostById,
    createPost: supabaseCreatePost,
    updatePost: supabaseUpdatePost,
    deletePost: supabaseDeletePost,
    reportPost: supabaseReportPost,
    getComments: window._KCSA.comments.getComments,
    addComment: window._KCSA.comments.addComment,
    likeComment: window._KCSA.comments.likeComment,
    votePost: window._KCSA.votes.votePost,
    getMyVote: window._KCSA.votes.getMyVote,
    getMyProfile: supabaseGetMyProfile,
    updateMyProfile: supabaseUpdateMyProfile,
    uploadProfileAvatar: supabaseUploadProfileAvatar,
    getMyPosts: window._KCSA.posts.getMyPosts,
    getPostsByAuthorId: window._KCSA.posts.getPostsByAuthorId,
    getRelatedPosts: window._KCSA.posts.getRelatedPosts,
    getSavedPostState: window._KCSA.saved.getSavedPostState,
    setSavedPostState: window._KCSA.saved.setSavedPostState,
    clearSavedPostState: window._KCSA.saved.clearSavedPostState,
    togglePostStatus: supabaseTogglePostStatus,
    renewPost: supabaseRenewPost,
    bumpPost: supabaseBumpPost,
    getTopContributors: window._KCSA.analytics.getTopContributors,
    trackCouponClick: window._KCSA.analytics.trackCouponClick,
    trackShare: window._KCSA.analytics.trackShare,
    trackView: window._KCSA.analytics.trackView,
    getPostAnalytics: window._KCSA.analytics.getPostAnalytics,
    checkDuplicatePost: window._KCSA.analytics.checkDuplicatePost,
    getMySavedPosts: window._KCSA.saved.getMySavedPosts,
    getMySavedPostsCount: window._KCSA.saved.getMySavedPostsCount,
    getProfileHighlights: window._KCSA.saved.getProfileHighlights,
    getProfileHighlightsCount: window._KCSA.saved.getProfileHighlightsCount,
    createHelpRequest: window._KCSA.admin.createHelpRequest,
    listAdminHelpRequests: window._KCSA.admin.listAdminHelpRequests,
    updateAdminHelpRequest: window._KCSA.admin.updateAdminHelpRequest,
    getNotificationPreferences: window._KCSA.notifications.getNotificationPreferences,
    updateNotificationPreferences: window._KCSA.notifications.updateNotificationPreferences,
    getNotificationChannelTargets: window._KCSA.notifications.getNotificationChannelTargets,
    updateNotificationChannelTargets: window._KCSA.notifications.updateNotificationChannelTargets,
    // Notifications (v9.1.0)
    getNotifications: window._KCSA.notifications.getNotifications,
    markNotificationsRead: window._KCSA.notifications.markNotificationsRead,
    markAllNotificationsRead: window._KCSA.notifications.markAllNotificationsRead,
    clearNotifications: window._KCSA.notifications.clearNotifications,
    getUnreadNotificationCount: window._KCSA.notifications.getUnreadNotificationCount,
    subscribeNotifications: window._KCSA.notifications.subscribeNotifications,
    unsubscribeNotifications: window._KCSA.notifications.unsubscribeNotifications,
    // Convites de usuários externos (v9.1.0.3)
    inviteExternalUser: supabaseInviteExternalUser,
    getInvites: supabaseGetInvites,
    revokeInvite: supabaseRevokeInvite,
  });


window.KCAPI.registerAdapter('supabase', driverSupabase);

// window.KCCompressImage exposto em supabase.media.adapter.js (v11.30.5)

})();

