
(function () {
  'use strict';
const { ENV, normalizePost } = window.KCAPI;
  const profileShared = window.KCAccountProfileUtils || {};
  const OWNER_PROFILE_FIELDS = profileShared.OWNER_PROFILE_SELECT_FIELDS || 'id, display_name, full_name, avatar_url, avatar_path, bio, verified, is_admin, created_at, updated_at, onboarding_completed_at, affiliation, gender_identity, gender_identity_custom, race_color, contact_primary_method, contact_cta_enabled, social_links, social_visibility';

  function normalizeProfilePatchForAdapter(patch) {
    if (profileShared && typeof profileShared.normalizeProfilePatch === 'function') {
      return profileShared.normalizeProfilePatch(patch);
    }
    return (patch && typeof patch === 'object' && !Array.isArray(patch)) ? { ...patch } : {};
  }


  // ---------- Supabase Client Bootstrap (V8.1.3.1) ----------
  // Cria o cliente apenas quando necessÃ¡rio (driver="supabase").
  let supabaseClient = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    // Preferimos o Facade (Auth/SessÃ£o) para manter o SDK isolado
    try {
      if (KCSupabase && typeof KCSupabase.getClient === 'function') {
        supabaseClient = KCSupabase.getClient();
        return supabaseClient;
      }
    } catch (_) { }

    // Fallback (mantÃ©m compatibilidade caso o Facade nÃ£o esteja carregado)
    if (!hasSupabaseLib()) {
      console.error('[KCAPI][Supabase] Biblioteca supabase-js nÃ£o carregada (CDN ausente ou sem internet).');
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
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha sÃ£o obrigatÃ³rios.' } };

    // Preferimos o facade (V8.1.3.1) para validaÃ§Ã£o de domÃ­nio/erros consistentes
    if (KCSupabase && typeof KCSupabase.signUp === 'function') {
      return KCSupabase.signUp(em, pw);
    }

    const client = getSupabaseClient();
    if (!client) return { user: null, session: null, error: { message: 'Supabase nÃ£o configurado.' } };

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
    return 'UsuÃ¡rio';
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
          message: 'PrÃ©-condiÃ§Ã£o invÃ¡lida para sincronizar profile.',
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
      console.warn('[KCAPI][Supabase] ensureSynced (KCProfiles) falhou; fallback upsert serÃ¡ usado.', e);
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

  function dataUrlToBlob(dataUrl) {
    const s = String(dataUrl || '');
    const m = s.match(/^data:([^;,]+)(?:;charset=[^;,]+)?(?:;(base64))?,([\s\S]*)$/i);
    if (!m) return null;

    const mime = String(m[1] || 'application/octet-stream').toLowerCase();
    const isBase64 = String(m[2] || '').toLowerCase() === 'base64';
    const payload = m[3] || '';

    try {
      if (isBase64) {
        const binStr = atob(payload);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }

      const decoded = decodeURIComponent(payload);
      return new Blob([decoded], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function extFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    if (m.includes('svg')) return 'svg';
    return 'bin';
  }

  function sanitizeFilename(name) {
    const s = String(name || '').trim();
    if (!s) return 'image';
    return s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'image';
  }

  function getPostMediaStorageBucket() {
    return (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stripSearchAndHash(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const hashIndex = raw.indexOf('#');
    const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const queryIndex = withoutHash.indexOf('?');
    return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  }

  function safeDecodeUriComponent(value) {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function extractStoragePathFromPostMediaValue(value, bucket) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalizedBucket = String(bucket || getPostMediaStorageBucket()).trim();
    const stripped = stripSearchAndHash(raw);

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        const pathname = safeDecodeUriComponent(String(parsed.pathname || ''));
        const patterns = [
          new RegExp(`/storage/v1/object/public/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
          new RegExp(`/storage/v1/object/sign/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
          new RegExp(`/storage/v1/object/authenticated/${escapeRegExp(normalizedBucket)}/(.+)$`, 'i'),
        ];

        for (let i = 0; i < patterns.length; i++) {
          const match = pathname.match(patterns[i]);
          if (match && match[1]) {
            return safeDecodeUriComponent(stripSearchAndHash(match[1]).replace(/^\/+/, ''));
          }
        }
      } catch (_) {
        // fallback to direct normalization below
      }
    }

    return safeDecodeUriComponent(stripped.replace(/^\/+/, ''));
  }

  function buildPostMediaCleanupContext(summary) {
    const cleanup = (summary && typeof summary === 'object') ? summary : {};
    return {
      bucket: String(cleanup.bucket || getPostMediaStorageBucket()),
      managedPaths: Array.isArray(cleanup.managedPaths) ? cleanup.managedPaths.slice() : [],
      removedPaths: Array.isArray(cleanup.removedPaths) ? cleanup.removedPaths.slice() : [],
      failedPaths: Array.isArray(cleanup.failedPaths) ? cleanup.failedPaths.slice() : [],
      skippedItems: Array.isArray(cleanup.skippedItems)
        ? cleanup.skippedItems.map((item) => ({
          raw: String((item && item.raw) || ''),
          path: String((item && item.path) || ''),
          reason: String((item && item.reason) || 'skipped'),
        }))
        : [],
    };
  }

  async function cleanupManagedPostMediaStorage(client, items, options) {
    const bucket = getPostMediaStorageBucket();
    const opts = (options && typeof options === 'object') ? options : {};
    const userId = (opts.userId != null) ? String(opts.userId).trim() : '';
    const postId = (opts.postId != null) ? String(opts.postId).trim() : '';
    const scopePrefix = (userId && postId) ? `post-media/${userId}/${postId}/` : '';
    const summary = {
      ok: true,
      bucket,
      managedPaths: [],
      removedPaths: [],
      failedPaths: [],
      skippedItems: [],
    };

    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return summary;

    const managedSet = new Set();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rawValue = (typeof item === 'string')
        ? item
        : ((item && typeof item === 'object')
          ? (item.path || item.url || item.publicUrl || '')
          : '');
      const normalizedPath = extractStoragePathFromPostMediaValue(rawValue, bucket);

      if (!normalizedPath) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: '', reason: 'empty_or_unparseable' });
        continue;
      }

      if (!scopePrefix) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: normalizedPath, reason: 'missing_scope' });
        continue;
      }

      if (!normalizedPath.startsWith(scopePrefix)) {
        summary.skippedItems.push({ raw: String(rawValue || ''), path: normalizedPath, reason: 'unmanaged_path' });
        continue;
      }

      managedSet.add(normalizedPath);
    }

    summary.managedPaths = Array.from(managedSet);
    if (!summary.managedPaths.length) return summary;

    try {
      const storage = client.storage.from(bucket);
      const removal = await storage.remove(summary.managedPaths);
      if (removal && removal.error) {
        summary.ok = false;
        summary.failedPaths = summary.managedPaths.slice();
        console.error('[KCAPI][Supabase] post-media cleanup falhou:', removal.error, summary);
        return summary;
      }

      summary.removedPaths = summary.managedPaths.slice();
      return summary;
    } catch (e) {
      summary.ok = false;
      summary.failedPaths = summary.managedPaths.slice();
      console.error('[KCAPI][Supabase] post-media cleanup excecao:', e, summary);
      return summary;
    }
  }

  async function uploadImagesToSupabaseStorage(client, images, options) {
    // Bucket (compat): prefer STORAGE_BUCKET_POST_MEDIA (roadmap), senÃ£o ENV.supabase.storageBucket
    const bucket = getPostMediaStorageBucket();

    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) return { ok: true, uploaded: [] };

    // Hard limits (mÃ­nimo anti-abuso)
    const maxImages = 5;
    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024); // 5MB

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = (opts.userId != null) ? String(opts.userId) : '';
    const postId = (opts.postId != null) ? String(opts.postId) : '';

    // Path controlado: post-media/{userId}/{postId}/{filename}
    // Se nÃ£o houver userId/postId, cai em modo "compat" (menos seguro) e loga warning.
    const hasStrongPath = !!(userId && postId);

    const storage = client.storage.from(bucket);
    const ts = Date.now();

    const uploaded = [];
    for (let i = 0; i < Math.min(list.length, maxImages); i++) {
      const item = list[i];

      // Se jÃ¡ for URL http(s), reaproveita.
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        uploaded.push({ url: item, path: '', is_cover: i === 0, sort_order: i });
        continue;
      }

      // dataURL -> Blob
      const blob = dataUrlToBlob(item);
      if (!blob) {
        console.warn('[KCAPI][Supabase] Imagem invÃ¡lida (nÃ£o Ã© dataURL):', item);
        continue;
      }

      // Valida tipo/tamanho
      const mime = String(blob.type || '').toLowerCase();
      if (!allowedTypes.has(mime)) {
        console.warn('[KCAPI][Supabase] Tipo de imagem nÃ£o permitido:', mime);
        continue;
      }
      if (blob.size > maxBytes) {
        console.warn('[KCAPI][Supabase] Imagem excede tamanho mÃ¡ximo (bytes):', blob.size, '>', maxBytes);
        continue;
      }

      const ext = extFromMime(mime);
      const filename = sanitizeFilename(`image-${i + 1}.${ext}`);

      const path = hasStrongPath
        ? `post-media/${userId}/${postId}/${ts}-${i + 1}-${filename}`
        : `posts/${ts}-${filename}`; // compat (evitar quebra caso postId/userId nÃ£o exista)

      if (!hasStrongPath) {
        console.warn('[KCAPI][Supabase] Upload com path fraco (sem userId/postId). Considere hardening via post-media/{userId}/{postId}.');
      }

      const up = await storage.upload(path, blob, { contentType: mime || 'application/octet-stream', upsert: false });
      if (up && up.error) {
        const cleanup = await cleanupManagedPostMediaStorage(client, uploaded, { userId, postId });
        return {
          ok: false,
          error: {
            message: 'Falha no upload de imagem para o Storage.',
            code: (up.error.code != null && String(up.error.code).trim()) ? String(up.error.code).trim() : 'STORAGE_UPLOAD_FAILED',
            details: up.error.details || null,
            hint: up.error.hint || null,
            bucket,
            path,
            imageIndex: i,
            cleanup,
          },
        };
      }

      const pub = storage.getPublicUrl(path);
      const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
      if (!publicUrl) {
        console.warn('[KCAPI][Supabase] Upload OK, mas nÃ£o consegui obter URL pÃºblica:', path);
      }

      uploaded.push({ url: publicUrl || path, path, is_cover: i === 0, sort_order: i });
    }

    return { ok: true, uploaded };
  }

  async function uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, options) {
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };

    const bucket = (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = String(opts.userId || '').trim();
    if (!userId) return { ok: false, error: { message: 'UsuÃ¡rio invÃ¡lido para upload do avatar.' } };

    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024);
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

    let blob = null;
    let directUrl = '';

    if (typeof fileOrDataUrl === 'string') {
      const raw = String(fileOrDataUrl || '').trim();
      if (!raw) return { ok: false, error: { message: 'Imagem invÃ¡lida para avatar.' } };
      if (/^https?:\/\//i.test(raw)) {
        directUrl = raw;
      } else {
        blob = dataUrlToBlob(raw);
      }
    } else if (typeof Blob !== 'undefined' && fileOrDataUrl instanceof Blob) {
      blob = fileOrDataUrl;
    }

    if (directUrl) {
      return { ok: true, data: { url: directUrl } };
    }

    if (!blob) return { ok: false, error: { message: 'Formato de imagem invÃ¡lido para avatar.' } };

    const mime = String(blob.type || '').toLowerCase();
    if (!allowedTypes.has(mime)) {
      return { ok: false, error: { message: 'Use uma imagem JPG, PNG, WEBP ou SVG.' } };
    }
    if (blob.size > maxBytes) {
      return { ok: false, error: { message: 'A imagem do avatar excede o limite permitido.' } };
    }

    const ext = extFromMime(mime);
    const filename = sanitizeFilename(`avatar.${ext}`);
    const path = `profile-avatars/${userId}/${Date.now()}-${filename}`;
    const storage = client.storage.from(bucket);

    const up = await storage.upload(path, blob, { contentType: mime || 'application/octet-stream', upsert: false });
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
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel obter a URL pÃºblica do avatar.' } };
    }

    return { ok: true, data: { url: publicUrl, path } };
  }



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
    const seed = encodeURIComponent(String(authorName || 'kc').trim() || 'kc');
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  }

  function logAuthorDiagnosticsDev(payload) {
    if (ENV.isProduction) return;
    try {
      console.debug('[KCAPI][Author][diagnostics]', payload);
    } catch (_) { }
  }

  function mapSupabasePost(row, options) {
    if (!row) return null;

    const opts = (options && typeof options === 'object') ? options : {};
    const allImages = !!opts.allImages;

    const author = row.profiles || null;
    // Compat: schema pode usar post_media (padrÃ£o) ou post_images (variante)
    const media = Array.isArray(row.post_media)
      ? row.post_media
      : (Array.isArray(row.post_images) ? row.post_images : []);

    const items = media.filter((m) => m && m.url);
    let ordered = items.slice();

    // OrdenaÃ§Ã£o por sort_order (quando existir). Se nÃ£o existir, prioriza capa.
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

    let imageUrls = [];
    if (allImages) {
      const set = new Set();
      ordered.forEach((m) => {
        if (m && m.url) set.add(String(m.url));
      });
      imageUrls = Array.from(set);
    } else {
      const cover = ordered.find((m) => m && m.is_cover && m.url) || ordered.find((m) => m && m.url) || null;
      imageUrls = (cover && cover.url) ? [String(cover.url)] : [];
    }

    const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const authorId = row.author_id || (author && author.id) || null;
    const categoriaLabel = (metadata && (metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel))
      ? String(metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel)
      : (row.category || "");

    // SaÃ­da hÃ­brida (compatÃ­vel com KCAPI.normalizePost + views legadas):
    // - snake_case e camelCase para campos novos
    // - campos PT-BR usados pelo UI (titulo, descricao, preco, modulo, categoria, timestamp)
    const authorVerified = !!(author && author.verified);

    const legacyId = (row.legacy_id == null) ? null : String(row.legacy_id).trim();
    const normalizedAuthorName = resolveNormalizedAuthorName(author, metadata, row.author_name || row.autor || row.author || '');
    const normalizedAuthorAvatar = resolveNormalizedAuthorAvatar(author, metadata, normalizedAuthorName, row.author_avatar || row.autorAvatar || row.authorAvatar || '');

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

      location: row.location || '',

      timestamp: row.created_at || '',
      createdAt: row.created_at || '',
      created_at: row.created_at || '',

      // Para manter retrocompatibilidade visual (fallback do render):
      // Hardening de privacidade: NÃƒO depender de profiles.email para exibir nome.
      autor: normalizedAuthorName,
      autorAvatar: normalizedAuthorAvatar,

      // VerificaÃ§Ã£o do autor (V8.1.3.2)
      authorVerified,
      author_verified: authorVerified,
      verificado: authorVerified,
      verified: authorVerified,

      imagens: imageUrls,
      images: imageUrls,

      comentarios: (Array.isArray(row.comments) && row.comments[0] && row.comments[0].count != null) ? row.comments[0].count : 0,

      metadata,

      authorName: normalizedAuthorName,
      authorAvatar: normalizedAuthorAvatar,
    };

    // Aliases legados (alguns trechos usam author/authorAvatar)
    out.author = out.autor;
    out.authorAvatar = out.autorAvatar;

    // Injeta campos variÃ¡veis (metadata) sem sobrescrever o contrato base
    mergeMetadataSafe(out, metadata);

    return out;
  }

  // Adapter: linha do Postgres (snake_case + embeds) -> Contrato KCAPI (camelCase/PT-BR)
  // - MantÃ©m compat com modo local (id pode ser legacy_id)
  // - Normaliza via normalizePost (contrato Ãºnico consumido pelos controllers)
  function normalizeSupabasePost(row) {
    const mapped = mapSupabasePost(row);
    if (!mapped) return null;

    const raw = { ...(mapped || {}) };

    // Preferir legacy_id como id para manter links/contrato do protÃ³tipo
    const legacy = raw.legacyId || raw.legacy_id || null;
    if (legacy != null && legacy !== '') {
      raw.uuid = raw.id; // preserva UUID
      raw.id = legacy;
    }

    return normalizePost(raw);
  }

  function buildSupabasePostSelect(client, includeVerified = true, includeComments = true) {
    const profileFields = includeVerified
      ? 'id, display_name, full_name, avatar_url, verified'
      : 'id, display_name, full_name, avatar_url';
    const commentsField = includeComments ? ', comments(count)' : '';
    return client
      .from('posts')
      .select(`id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, votos, profiles:author_id (${profileFields}), post_media (id, url, is_cover)${commentsField}`)
      .limit(1);
  }

  // Compat: caso o schema ainda nÃ£o tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostSelectFallback(client, includeComments = true) {
    return buildSupabasePostSelect(client, false, includeComments);
  }

  function isMissingCommentsEmbedError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('comments') && (msg.includes('does not exist') || msg.includes('relationship'));
  }

  async function supabaseGetPostById(id) {
    const key = String(id || "").trim();
    if (!key) return null;

    // IDs locais (u_*) nÃ£o existem no Supabase
    if (key.startsWith("u_")) return null;

    // Preferir Facade (KCSupabase) para evitar KCAPI falando direto com o SDK
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getPostById === "function") {
        const row = await window.KCSupabase.getPostById(key);
        if (!row) return null;

        const mapped = mapSupabasePost(row, { allImages: true });
        if (!mapped) return null;

        // Se foi chamado com legacy_id, manter id no formato do protÃ³tipo
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

      let res = await buildSupabasePostSelect(client, includeVerified, includeComments).eq(field, value).maybeSingle();
      if (res && res.error && isMissingVerifiedColumnError(res.error)) {
        includeVerified = false;
        res = await buildSupabasePostSelect(client, includeVerified, includeComments).eq(field, value).maybeSingle();
      }
      if (res && res.error && includeComments && isMissingCommentsEmbedError(res.error)) {
        includeComments = false;
        res = await buildSupabasePostSelect(client, includeVerified, includeComments).eq(field, value).maybeSingle();
        if (res && res.error && includeVerified && isMissingVerifiedColumnError(res.error)) {
          includeVerified = false;
          res = await buildSupabasePostSelect(client, includeVerified, includeComments).eq(field, value).maybeSingle();
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


  function buildSupabasePostsQuery(client, includeVerified = true, includeComments = true) {
    const profileFields = includeVerified
      ? 'id, display_name, full_name, avatar_url, verified'
      : 'id, display_name, full_name, avatar_url';
    const commentsField = includeComments ? ', comments(count)' : '';
    return client
      .from('posts')
      .select(`id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (${profileFields}), post_media (id, url, is_cover)${commentsField}`);
  }

  // Compat: caso o schema ainda nÃ£o tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostsQueryFallback(client, includeComments = true) {
    return buildSupabasePostsQuery(client, false, includeComments);
  }

  function isMissingVerifiedColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('verified') && msg.includes('does not exist');
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
    // Mantemos o padrÃ£o pedido (.or('title.ilike.%q%,description.ilike.%q%')) mas com quoting seguro.
    const safe = String(q || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const pattern = `%${safe}%`;
    return `title.ilike."${pattern}",description.ilike."${pattern}"`;
  }

  async function supabaseGetPosts(filters = {}) {
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

    // Fallback defensivo (nÃ£o deveria ocorrer se o bundle estiver correto)
    console.warn('[KCAPI][Supabase] KCSupabase.getPosts indisponÃ­vel; retornando lista vazia.');
    return [];
  }



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
    // Temporal clamp dinÃ¢mico (configurÃ¡vel via KC_ENV.clamp)
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

    const modulo = (d.modulo || d.module || '').toString().trim();
    const categoryKey = (d.categoriaKey || d.categoryKey || d.category || d.categoria || '').toString().trim();
    const subKey = (d.subcategoriaKey || d.subcategoryKey || d.subcategory || d.subcategoria || '').toString().trim();

    const title = (d.titulo || d.title || '').toString().trim();
    const description = (d.descricao || d.description || '').toString().trim();

    const price = (d.preco != null) ? parsePriceMaybe(d.preco) : parsePriceMaybe(d.price);
    const location = (d.localizacao || d.location || '').toString().trim();

    const images = Array.isArray(d.imagens) ? d.imagens : (Array.isArray(d.images) ? d.images : []);

    // labels (opcionais) para manter UI rica via metadata
    // (mantÃ©m retrocompatibilidade: payloads antigos usavam d.categoria/d.subcategoria como labels)
    const categoriaLabel = (d.categoriaLabel || d.categoryLabel || (d.categoriaKey ? '' : d.categoria) || (d.categoryKey ? '' : d.category) || '').toString().trim();
    const subcategoriaLabel = (d.subcategoriaLabel || d.subcategoryLabel || (d.subcategoriaKey ? '' : d.subcategoria) || (d.subcategoryKey ? '' : d.subcategory) || '').toString().trim();

    const moduleDB = toSlug(modulo);
    const categoryDB = toSlug(categoryKey || categoriaLabel);

    // V8.1.3.1: compra-venda usa tabs por categoria (ex.: eletronicos).
    // Se algum payload vier com subKey=aÃ§Ã£o, normalizamos para a categoria.
    const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doaÃ§Ã£o', 'procuro'];
    const subKeySlug = toSlug(subKey);
    const effectiveSubKey = (moduleDB === 'compra-venda' && subKeySlug && actionish.includes(subKeySlug) && categoryKey)
      ? categoryKey
      : subKey;

    const subcategoryDB = toSlug(effectiveSubKey || subcategoriaLabel);

    // metadata: mantÃ©m dados extras sem inflar colunas
    const metadata = {
      ...(d.metadata && typeof d.metadata === 'object' ? d.metadata : {}),
      // filtros (JSONB)
      ...(subcategoryDB ? { subcategory: subcategoryDB } : {}),
      // labels
      ...(categoriaLabel ? { categoryLabel: categoriaLabel } : {}),
      ...(subcategoriaLabel ? { subcategoryLabel: subcategoriaLabel } : {}),
      // chaves Ãºteis do formulÃ¡rio
      ...((categoryKey || d.categoriaKey || d.categoryKey) ? { categoryKey: toSlug(categoryKey || d.categoriaKey || d.categoryKey) } : {}),
      ...((effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) ? { subcategoryKey: toSlug(effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) } : {}),
      ...(Array.isArray(d.tags) ? { tags: d.tags } : {}),
      ...(Array.isArray(d.tagKeys) ? { tagKeys: d.tagKeys } : {}),
      ...(d.condicao ? { condicao: String(d.condicao) } : {}),
      ...(d.precoTexto ? { precoTexto: String(d.precoTexto) } : {}),
      ...(typeof d.sustentavel === 'boolean' ? { sustentavel: d.sustentavel } : {}),
      ...(d.emoji ? { emoji: String(d.emoji) } : {}),
      ...(typeof d.verificado === 'boolean' ? { verificado: d.verificado } : {}),
    };

    return {
      moduleDB,
      categoryDB,
      subcategoryDB,
      title,
      description,
      price,
      location,
      images,
      metadata,
      // tambÃ©m devolvemos o payload bruto para retorno local (labels)
      raw: { ...d },
    };
  }

  async function supabaseCreatePost(data) {
    clearLastCreatePostError();

    const client = getSupabaseClient();
    if (!client) {
      setLastCreatePostError('AUTH', {
        message: 'Supabase client nÃ£o disponÃ­vel para createPost.',
        code: 'SUPABASE_CLIENT_MISSING',
      }, { driver: ENV.driver });
      return null;
    }

    const user = await supabaseGetCurrentUser();
    if (!user) {
      setLastCreatePostError('AUTH', {
        message: 'UsuÃ¡rio nÃ£o autenticado para createPost.',
        code: 'NOT_AUTHENTICATED',
      }, { driver: ENV.driver });
      return null;
    }

    const parsed = normalizeCreatePayload(data);
    const payloadSummary = summarizeCreatePayloadForDiagnostics(parsed);
    if (!parsed.title || !parsed.description || !parsed.moduleDB) {
      setLastCreatePostError('PAYLOAD', {
        message: 'Payload de createPost incompleto (tÃ­tulo/descriÃ§Ã£o/mÃ³dulo).',
        code: 'INVALID_CREATE_PAYLOAD',
      }, payloadSummary);
      return null;
    }

    const profileSync = await ensureSupabaseProfileForCreate(client, user);
    if (!profileSync.ok) {
      setLastCreatePostError('PROFILE_SYNC', profileSync.error, {
        userId: user.id,
      });
      return null;
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
      // NÃ£o enviamos created_at: o BD usa DEFAULT now() para garantir ordenaÃ§Ã£o correta (P0-C fix)

      const insertPayload = {
        author_id: user.id,
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        metadata: parsed.metadata,
      };

      // Helper de rollback (evita Ã³rfÃ£os quando upload falha apÃ³s INSERT)
      async function rollbackCreatedPost(postId) {
        try {
          const del = await client.from('posts').delete().eq('id', postId);
          if (del && del.error) console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
        } catch (e) {
          console.warn('[KCAPI][Supabase] rollback delete exceÃ§Ã£o:', e);
        }
      }

      // 2) INSERT posts (gera UUID)
      const ins = await client
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();

      if (ins && ins.error) {
        setLastCreatePostError('POST_INSERT', ins.error, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      postId = (ins && ins.data && ins.data.id) ? ins.data.id : null;
      if (!postId) {
        setLastCreatePostError('POST_INSERT', {
          message: 'INSERT em posts nÃ£o retornou id.',
          code: 'POST_INSERT_NO_ID',
        }, {
          userId: user.id,
          payload: payloadSummary,
        });
        return null;
      }

      // 3) Upload das imagens (se houver) com path controlado (post-media/{userId}/{postId}/...)
      const uploadResult = await uploadImagesToSupabaseStorage(client, parsed.images, { userId: user.id, postId });
      if (!uploadResult || !uploadResult.ok) {
        const uploadCleanup = buildPostMediaCleanupContext(uploadResult && uploadResult.error ? uploadResult.error.cleanup : null);
        const cleanupFailed = uploadCleanup.failedPaths.length > 0;
        if (!cleanupFailed) {
          await rollbackCreatedPostSafely(postId);
        } else {
          console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup do upload:', uploadCleanup);
        }
        setLastCreatePostError('STORAGE_UPLOAD', uploadResult ? uploadResult.error : null, {
          postId,
          userId: user.id,
          imagesCount: Array.isArray(parsed.images) ? parsed.images.length : 0,
          rollbackSkipped: cleanupFailed,
          ...uploadCleanup,
        });
        return null;
      }
      uploaded = Array.isArray(uploadResult.uploaded) ? uploadResult.uploaded : [];

      // 4) Insere mÃ­dias (post_media) com capa + ordem
      if (Array.isArray(uploaded) && uploaded.length) {
        const mediaRowsFull = uploaded
          .filter((m) => m && m.url)
          .map((m, idx) => ({
            post_id: postId,
            url: String(m.url),
            is_cover: idx === 0, // regra: capa = 1Âª imagem ordenada
            sort_order: Number.isFinite(m.sort_order) ? m.sort_order : idx,
          }));

        // Tenta com sort_order (V8.1.5.1); fallback se schema ainda nÃ£o tiver coluna.
        let mr = await client.from('post_media').insert(mediaRowsFull);
        if (mr && mr.error) {
          const msg = String(mr.error.message || '').toLowerCase();
          if (msg.includes('sort_order')) {
            const mediaRowsCompat = mediaRowsFull.map(({ sort_order, ...rest }) => rest);
            mr = await client.from('post_media').insert(mediaRowsCompat);
          }
        }

        if (mr && mr.error) {
          const cleanup = await cleanupManagedPostMediaStorage(client, uploaded, { userId: user.id, postId });
          const cleanupContext = buildPostMediaCleanupContext(cleanup);
          const cleanupFailed = cleanupContext.failedPaths.length > 0;
          if (!cleanupFailed) {
            await rollbackCreatedPostSafely(postId);
          } else {
            console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de post_media:', cleanupContext);
          }
          setLastCreatePostError('POST_MEDIA_INSERT', mr.error, {
            postId,
            mediaCount: mediaRowsFull.length,
            rollbackSkipped: cleanupFailed,
            ...cleanupContext,
          });
          return null;
        }
      }

      // 5) Rebusca completo (com JOINs) e normaliza no contrato do modo local (com JOINs) e normaliza no contrato do modo local
      const mapped = await supabaseGetPostById(postId);
      if (!mapped) {
        setLastCreatePostError('POST_FETCH', {
          message: 'Post criado, mas a leitura final falhou.',
          code: 'POST_FETCH_EMPTY',
        }, { postId });
        return null;
      }

      // injeta labels do payload bruto (caso category esteja em slug)
      const raw = { ...mapped };
      if (parsed.raw && parsed.raw.categoria && !raw.categoria) raw.categoria = parsed.raw.categoria;
      if (parsed.raw && parsed.raw.subcategoria && !raw.subcategoria) raw.subcategoria = parsed.raw.subcategoria;

      clearLastCreatePostError();
      return normalizePost(raw);
    } catch (e) {
      let cleanupContext = buildPostMediaCleanupContext(null);
      if (postId && Array.isArray(uploaded) && uploaded.length) {
        cleanupContext = buildPostMediaCleanupContext(await cleanupManagedPostMediaStorage(client, uploaded, { userId: user.id, postId }));
      }
      const cleanupFailed = cleanupContext.failedPaths.length > 0;
      if (postId && !cleanupFailed) {
        await rollbackCreatedPostSafely(postId);
      } else if (postId && cleanupFailed) {
        console.warn('[KCAPI][Supabase] rollback do post ignorado apos falha no cleanup de excecao:', cleanupContext);
      }
      setLastCreatePostError('EXCEPTION', e, {
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
    return { ok: false, error: { message: String(message || 'OperaÃ§Ã£o nÃ£o concluÃ­da.') } };
  }

  function enforceSupabaseOnProduction(operationName) {
    if (!ENV.isProduction) return null;
    if (ENV.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `OperaÃ§Ã£o crÃ­tica "${String(operationName || 'unknown')}" bloqueada: em produÃ§Ã£o, o driver "supabase" Ã© obrigatÃ³rio.`,
      },
    };
  }

  function normalizeUpdatePayload(data) {
    const parsed = normalizeCreatePayload(data);
    if (!parsed.title) return { ok: false, error: { message: 'TÃ­tulo Ã© obrigatÃ³rio.' } };
    if (!parsed.description) return { ok: false, error: { message: 'DescriÃ§Ã£o Ã© obrigatÃ³ria.' } };
    if (!parsed.moduleDB) return { ok: false, error: { message: 'MÃ³dulo Ã© obrigatÃ³rio.' } };
    if (!parsed.categoryDB) return { ok: false, error: { message: 'Categoria Ã© obrigatÃ³ria.' } };

    return {
      ok: true,
      data: {
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        metadata: parsed.metadata,
      },
    };
  }

  async function resolvePostUuid(postId) {
    if (typeof postId === 'string' && UUID_RE.test(postId)) return String(postId);
    if (postId == null) return null;
    try {
      const post = await supabaseGetPostById(String(postId));
      if (post && post.uuid && UUID_RE.test(String(post.uuid))) return String(post.uuid);
      if (post && post.id && UUID_RE.test(String(post.id))) return String(post.id);
    } catch (_) { }
    return null;
  }

  async function supabaseUpdatePost(postId, payload) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase nÃ£o inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('FaÃ§a login para editar.');

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return kcApiError('Payload invÃ¡lido para ediÃ§Ã£o.');
    }

    const parsed = normalizeUpdatePayload(payload);
    if (!parsed.ok) return parsed;

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post invÃ¡lido para ediÃ§Ã£o.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] updatePost ownership check erro:', own.error);
        return kcApiError('NÃ£o foi possÃ­vel validar permissÃ£o de ediÃ§Ã£o.');
      }
      if (!own || !own.data) return kcApiError('PublicaÃ§Ã£o nÃ£o encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('VocÃª nÃ£o pode editar este post.');

      const upd = await client
        .from('posts')
        .update(parsed.data)
        .eq('id', postUuid)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle();

      if (upd && upd.error) {
        console.error('[KCAPI][Supabase] updatePost erro:', upd.error);
        return kcApiError('NÃ£o foi possÃ­vel salvar alteraÃ§Ãµes.');
      }

      const updated = await supabaseGetPostById(postUuid);
      if (!updated) return kcApiError('Post atualizado, mas nÃ£o foi possÃ­vel recarregar.');

      return { ok: true, data: updated };
    } catch (e) {
      console.error('[KCAPI][Supabase] updatePost exceÃ§Ã£o:', e);
      return kcApiError('NÃ£o foi possÃ­vel salvar alteraÃ§Ãµes.');
    }
  }

  async function supabaseDeletePost(postId) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase nÃ£o inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('FaÃ§a login para excluir.');

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post invÃ¡lido para exclusÃ£o.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] deletePost ownership check erro:', own.error);
        return kcApiError('NÃ£o foi possÃ­vel validar permissÃ£o de exclusÃ£o.');
      }
      if (!own || !own.data) return kcApiError('PublicaÃ§Ã£o nÃ£o encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('VocÃª nÃ£o pode excluir este post.');

      const media = await client.from('post_media').select('id, url').eq('post_id', postUuid);
      if (media && media.error) {
        console.error('[KCAPI][Supabase] deletePost leitura de post_media falhou:', media.error);
        return kcApiError('NÃƒÂ£o foi possÃƒÂ­vel validar as mÃƒÂ­dias da publicaÃƒÂ§ÃƒÂ£o.');
      }

      const cleanup = await cleanupManagedPostMediaStorage(client, (media && media.data) ? media.data : [], {
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
        return kcApiError('NÃ£o foi possÃ­vel excluir a publicaÃ§Ã£o.');
      }
      return { ok: true };
    } catch (e) {
      console.error('[KCAPI][Supabase] deletePost exceÃ§Ã£o:', e);
      return kcApiError('NÃ£o foi possÃ­vel excluir a publicaÃ§Ã£o.');
    }
  }

  // ---------- Reports (V8.1.6.2) ----------
  // Denunciar Post: insere 1 linha em public.reports (RLS forÃ§a reporter_id = auth.uid())
  // Retorno: { ok, data?, error? }
  async function supabaseReportPost(postId, payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };

    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para denunciar.' } };

    // resolve UUID do post (aceita uuid direto; para legacy numÃ©rico tenta resolver via getPostById)
    let postUuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!postUuid && postId != null) {
      try {
        const p = await supabaseGetPostById(String(postId));
        if (p && p.uuid && UUID_RE.test(String(p.uuid))) postUuid = String(p.uuid);
        else if (p && p.id && UUID_RE.test(String(p.id))) postUuid = String(p.id);
      } catch (_) { }
    }
    if (!postUuid) return { ok: false, error: { message: 'Post invÃ¡lido para denÃºncia.' } };

    const reason = String(payload.reason || '').trim().toLowerCase();
    const allowed = new Set(['spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other']);
    if (!allowed.has(reason)) return { ok: false, error: { message: 'Selecione um motivo vÃ¡lido.' } };

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
          return { ok: false, error: { message: rpcMessage || 'VocÃª jÃ¡ denunciou este post.' }, meta: { duplicate: true } };
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
          return { ok: false, error: { message: 'VocÃª jÃ¡ denunciou este post.' }, meta: { duplicate: true } };
        }
        console.error('[KCAPI][Supabase] reportPost erro:', ins.error);
        return { ok: false, error: { message: 'NÃ£o foi possÃ­vel registrar a denÃºncia.' } };
      }

      return { ok: true, data: (ins && ins.data) ? ins.data : { id: null } };
    } catch (e) {
      console.error('[KCAPI][Supabase] reportPost exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel registrar a denÃºncia.' } };
    }
  }
  // ---------- Comments (V8.1.7.2) ----------

  // Busca comentÃ¡rios de um post (ordenados por created_at asc)
  async function supabaseGetComments(postId) {
    const client = getSupabaseClient();
    if (!client) return [];
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return [];
    try {
      let result = await client
        .from('comments')
        .select('id, created_at, author_id, author_name, body, likes, author_profile:profiles!comments_author_id_fkey(display_name, full_name, avatar_url)')
        .eq('post_id', uuid)
        .order('created_at', { ascending: true });

      if (result && result.error) {
        result = await client
          .from('comments')
          .select('id, created_at, author_id, author_name, body, likes')
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
          const me = await supabaseGetCurrentUser();
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
          || 'AnÃ´nimo'
        ).trim() || 'AnÃ´nimo';
        return {
          ...row,
          author_name: resolvedName,
          author_avatar: String((prof && prof.avatar_url) || row.author_avatar || '').trim(),
          liked_by_me: likedByMe.has(row && row.id),
        };
      });
    } catch (e) {
      console.error('[KCAPI][comments] getComments exceÃ§Ã£o:', e);
      return [];
    }
  }

  // Insere um novo comentÃ¡rio (author_id e author_name do usuÃ¡rio logado)
  async function supabaseAddComment(postId, body) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para comentar.' } };
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return { ok: false, error: { message: 'Post invÃ¡lido.' } };
    const text = String(body || '').trim().slice(0, 2000);
    if (!text) return { ok: false, error: { message: 'ComentÃ¡rio nÃ£o pode ser vazio.' } };

    // Busca nome de exibiÃ§Ã£o do profile
    let authorName = 'AnÃ´nimo';
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
    // Fallback para metadados de auth quando o perfil nÃ£o tem nome (P1-A fix)
    if (!authorName) authorName = getUserDisplayNameForProfile(user);

    try {
      const { data, error } = await client
        .from('comments')
        .insert({ post_id: uuid, author_id: user.id, author_name: authorName, body: text })
        .select('id, created_at, author_id, author_name, body, likes')
        .maybeSingle();
      if (error) {
        console.error('[KCAPI][comments] addComment:', error);
        return { ok: false, error: { message: 'NÃ£o foi possÃ­vel comentar.' } };
      }
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] addComment exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel comentar.' } };
    }
  }

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
      console.error('[KCAPI][profile] getMyProfile exceÃ§Ã£o:', e);
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
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para editar seu perfil.' } };

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
        return { ok: false, error: { message: 'URL de avatar invÃ¡lida.' } };
      }
      updates.avatar_url = avatarUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_path')) {
      updates.avatar_path = String(updates.avatar_path || '').trim() || null;
    }
    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteraÃ§Ã£o informada.' } };
    }
    if (!displayName) return { ok: false, error: { message: 'Informe um nome vÃ¡lido.' } };

    try {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select(OWNER_PROFILE_FIELDS)
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][profile] updateMyProfile:', error);
        return { ok: false, error: { message: error.message || 'NÃ£o foi possÃ­vel atualizar seu perfil.' } };
      }
      if (!data) {
        return { ok: false, error: { message: 'No momento, nÃ£o Ã© possÃ­vel alterar seu nome.' } };
      }
      syncCurrentProfileCache(data);
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][profile] updateMyProfile exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel atualizar seu perfil.' } };
    }
  }

  async function supabaseUploadProfileAvatar(fileOrDataUrl) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para atualizar seu avatar.' } };

    try {
      return await uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId: user.id });
    } catch (e) {
      console.error('[KCAPI][profile] uploadProfileAvatar exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel enviar o avatar.' } };
    }
  }

  function normalizeHelpPayloadForAdapter(payload, user) {
    const sharedHelp = window.KCHelpUtils || {};
    if (sharedHelp && typeof sharedHelp.normalizeHelpRequestInput === 'function') {
      return sharedHelp.normalizeHelpRequestInput(payload, {
        fallbackEmail: user && user.email ? user.email : '',
      });
    }
    const input = (payload && typeof payload === 'object') ? payload : {};
    return {
      user_id: user && user.id ? String(user.id) : null,
      type: String(input.type || 'question').trim(),
      topic: String(input.topic || 'platform_use').trim(),
      subtopic: input.subtopic ? String(input.subtopic).trim() : null,
      subject: String(input.subject || '').trim().slice(0, 140),
      message: String(input.message || '').trim().slice(0, 4000),
      priority: String(input.priority || 'normal').trim(),
      status: String(input.status || 'new').trim(),
      page_path: input.page_path ? String(input.page_path).trim().slice(0, 255) : null,
      contact_email: String(input.contact_email || (user && user.email) || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };
  }

  async function supabaseCreateHelpRequest(payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    const normalized = normalizeHelpPayloadForAdapter(payload, user);

    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descrição e e-mail de retorno.' } };
    }

    const insertPayload = {
      user_id: user && user.id ? user.id : null,
      type: normalized.type,
      topic: normalized.topic,
      subtopic: normalized.subtopic || null,
      subject: normalized.subject,
      message: normalized.message,
      priority: normalized.priority,
      status: normalized.status,
      page_path: normalized.page_path || null,
      contact_email: normalized.contact_email,
      allow_contact: normalized.allow_contact !== false,
      metadata: normalized.metadata || {},
    };

    try {
      const { data, error } = await client
        .from('help_requests')
        .insert(insertPayload)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][help] createHelpRequest:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível enviar o pedido de ajuda.' } };
      }

      return { ok: true, data: data || insertPayload };
    } catch (e) {
      console.error('[KCAPI][help] createHelpRequest exceção:', e);
      return { ok: false, error: { message: 'Não foi possível enviar o pedido de ajuda.' } };
    }
  }

  async function supabaseListAdminHelpRequests(filters = {}) {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      let query = client
        .from('help_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters.status && filters.status !== 'all') query = query.eq('status', String(filters.status).trim());
      if (filters.type && filters.type !== 'all') query = query.eq('type', String(filters.type).trim());
      if (filters.priority && filters.priority !== 'all') query = query.eq('priority', String(filters.priority).trim());

      const { data, error } = await query;
      if (error) {
        console.error('[KCAPI][help] listAdminHelpRequests:', error);
        return [];
      }

      const rows = Array.isArray(data) ? data : [];
      const needle = String(filters.query || '').trim().toLowerCase();
      if (!needle) return rows;

      return rows.filter((row) => {
        const haystack = [
          row.subject,
          row.message,
          row.contact_email,
          row.page_path,
          row.type,
          row.topic,
          row.subtopic,
        ].join(' ').toLowerCase();
        return haystack.indexOf(needle) >= 0;
      });
    } catch (e) {
      console.error('[KCAPI][help] listAdminHelpRequests exceção:', e);
      return [];
    }
  }

  async function supabaseUpdateAdminHelpRequest(id, patch = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const targetId = String(id || '').trim();
    if (!targetId) return { ok: false, error: { message: 'Pedido inválido.' } };

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) updates.status = String(patch.status || '').trim() || 'new';
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) updates.priority = String(patch.priority || '').trim() || 'normal';
    if (Object.prototype.hasOwnProperty.call(patch, 'metadata') && patch.metadata && typeof patch.metadata === 'object') {
      updates.metadata = patch.metadata;
    }

    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }

    try {
      const { data, error } = await client
        .from('help_requests')
        .update(updates)
        .eq('id', targetId)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][help] updateAdminHelpRequest:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar o pedido.' } };
      }

      return { ok: true, data: data || null };
    } catch (e) {
      console.error('[KCAPI][help] updateAdminHelpRequest exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar o pedido.' } };
    }
  }

  async function supabaseGetMyPosts(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await supabaseGetCurrentUser();
    if (!user) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const status = String(params.status || '').trim().toLowerCase();

    try {
      let query = client
        .from('posts')
        .select('id, legacy_id, title, created_at, status, module, category')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) {
        console.error('[KCAPI][profile] getMyPosts:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.legacy_id || row.id,
        uuid: row.id,
        title: row.title || 'Sem tÃ­tulo',
        created_at: row.created_at || null,
        status: row.status || 'published',
        module: row.module || '',
        category: row.category || '',
      }));
    } catch (e) {
      console.error('[KCAPI][profile] getMyPosts exceÃ§Ã£o:', e);
      return [];
    }
  }

  async function supabaseGetPostsByAuthorId(authorId, params = {}) {
    const client = getSupabaseClient();
    const author = String(authorId || '').trim();
    if (!client || !author) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      const { data, error } = await client
        .from('posts')
        .select('id, legacy_id, title, created_at, status, module, category')
        .eq('author_id', author)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('[KCAPI][profile] getPostsByAuthorId:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.legacy_id || row.id,
        uuid: row.id,
        title: row.title || 'Sem tÃ­tulo',
        created_at: row.created_at || null,
        status: row.status || 'published',
        module: row.module || '',
        category: row.category || '',
      }));
    } catch (e) {
      console.error('[KCAPI][profile] getPostsByAuthorId exceÃ§Ã£o:', e);
      return [];
    }
  }

  async function resolvePostUuidForSavedPosts(postId) {
    const raw = String(postId || '').trim();
    if (!raw) return null;
    if (UUID_RE.test(raw)) return raw;
    try {
      const post = await supabaseGetPostById(raw);
      const candidate = post && (post.uuid || post.id) ? String(post.uuid || post.id).trim() : '';
      return candidate && UUID_RE.test(candidate) ? candidate : null;
    } catch (_) {
      return null;
    }
  }

  async function supabaseGetSavedPostState(postId) {
    const client = getSupabaseClient();
    if (!client) return { kind: '' };
    const user = await supabaseGetCurrentUser();
    if (!user) return { kind: '' };

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { kind: '' };

    try {
      const { data, error } = await client
        .from('saved_posts')
        .select('kind')
        .eq('post_id', uuid)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][saved_posts] getSavedPostState:', error);
        return { kind: '' };
      }

      return { kind: data && data.kind ? String(data.kind) : '' };
    } catch (e) {
      console.error('[KCAPI][saved_posts] getSavedPostState exceÃ§Ã£o:', e);
      return { kind: '' };
    }
  }

  async function supabaseSetSavedPostState(postId, kind) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para salvar publicaÃ§Ãµes.' } };

    const saveKind = String(kind || '').trim().toLowerCase();
    if (!['favorite', 'later', 'highlight'].includes(saveKind)) {
      return { ok: false, error: { message: 'Tipo de salvamento invÃ¡lido.' } };
    }

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'PublicaÃ§Ã£o invÃ¡lida.' } };

    try {
      const { data, error } = await client
        .from('saved_posts')
        .upsert({
          user_id: user.id,
          post_id: uuid,
          kind: saveKind,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,post_id',
        })
        .select('id, kind')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][saved_posts] setSavedPostState:', error);
        return { ok: false, error: { message: error.message || 'NÃ£o foi possÃ­vel salvar a publicaÃ§Ã£o.' } };
      }

      return { ok: true, data: data || { kind: saveKind } };
    } catch (e) {
      console.error('[KCAPI][saved_posts] setSavedPostState exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel salvar a publicaÃ§Ã£o.' } };
    }
  }

  async function supabaseClearSavedPostState(postId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para remover salvos.' } };

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'PublicaÃ§Ã£o invÃ¡lida.' } };

    try {
      const { error } = await client
        .from('saved_posts')
        .delete()
        .eq('post_id', uuid)
        .eq('user_id', user.id);

      if (error) {
        console.error('[KCAPI][saved_posts] clearSavedPostState:', error);
        return { ok: false, error: { message: error.message || 'NÃ£o foi possÃ­vel remover o item salvo.' } };
      }

      return { ok: true };
    } catch (e) {
      console.error('[KCAPI][saved_posts] clearSavedPostState exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel remover o item salvo.' } };
    }
  }

  async function supabaseGetMySavedPosts(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await supabaseGetCurrentUser();
    if (!user) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const kind = String(params.kind || '').trim().toLowerCase();

    try {
      let query = client
        .from('saved_posts')
        .select('id, kind, created_at, updated_at, post:posts!saved_posts_post_id_fkey(id, legacy_id, title, created_at, status, module, category)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (kind) query = query.eq('kind', kind);
      const { data, error } = await query;
      if (error) {
        console.error('[KCAPI][saved_posts] getMySavedPosts:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => {
        const post = row.post || {};
        return {
          id: post.legacy_id || post.id,
          uuid: post.id,
          title: post.title || 'Sem tÃ­tulo',
          created_at: post.created_at || null,
          status: post.status || 'published',
          module: post.module || '',
          category: post.category || '',
          save_kind: row.kind || '',
          saved_at: row.updated_at || row.created_at || null,
        };
      });
    } catch (e) {
      console.error('[KCAPI][saved_posts] getMySavedPosts exceÃ§Ã£o:', e);
      return [];
    }
  }

  async function supabaseGetProfileHighlights(profileId, params = {}) {
    const client = getSupabaseClient();
    const author = String(profileId || '').trim();
    if (!client || !author) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
      const { data, error } = await client
        .from('saved_posts')
        .select('id, kind, created_at, updated_at, post:posts!saved_posts_post_id_fkey(id, legacy_id, title, created_at, status, module, category)')
        .eq('user_id', author)
        .eq('kind', 'highlight')
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('[KCAPI][saved_posts] getProfileHighlights:', error);
        return [];
      }

      return (Array.isArray(data) ? data : [])
        .filter((row) => row && row.post && String(row.post.status || '').toLowerCase() === 'published')
        .map((row) => {
          const post = row.post || {};
          return {
            id: post.legacy_id || post.id,
            uuid: post.id,
            title: post.title || 'Sem tÃ­tulo',
            created_at: post.created_at || null,
            status: post.status || 'published',
            module: post.module || '',
            category: post.category || '',
            save_kind: 'highlight',
            saved_at: row.updated_at || row.created_at || null,
          };
        });
    } catch (e) {
      console.error('[KCAPI][saved_posts] getProfileHighlights exceÃ§Ã£o:', e);
      return [];
    }
  }

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
      title: row.title || 'Sem tÃ­tulo',
      created_at: row.created_at || null,
      status: row.status || 'published',
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
          title: post.title || 'Sem tÃ­tulo',
          created_at: post.created_at || null,
          status: includeStatus ? status : 'published',
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
      .select('kind, created_at, updated_at, post:posts!saved_posts_post_id_fkey(id, legacy_id, title, created_at, status, module, category)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (kind) query = query.eq('kind', kind);
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function supabaseGetSavedPostStateMulti(postId) {
    const client = getSupabaseClient();
    if (!client) return { kinds: [] };
    const user = await supabaseGetCurrentUser();
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
      console.error('[KCAPI][saved_posts] getSavedPostStateMulti exceÃ§Ã£o:', e);
      return { kinds: [] };
    }
  }

  async function supabaseClearSavedPostStateMulti(postId, kind) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para remover salvos.' } };

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'PublicaÃ§Ã£o invÃ¡lida.' } };

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
        return { ok: false, error: { message: error.message || 'NÃ£o foi possÃ­vel remover o item salvo.' } };
      }
      return { ok: true, cleared: saveKind || 'all' };
    } catch (e) {
      console.error('[KCAPI][saved_posts] clearSavedPostStateMulti exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel remover o item salvo.' } };
    }
  }

  async function supabaseSetSavedPostStateMulti(postId, kind, enabled) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para salvar publicaÃ§Ãµes.' } };

    const saveKind = normalizeSaveKind(kind);
    if (!saveKind) {
      return { ok: false, error: { message: 'Tipo de salvamento invÃ¡lido.' } };
    }

    const uuid = await resolvePostUuidForSavedPosts(postId);
    if (!uuid) return { ok: false, error: { message: 'PublicaÃ§Ã£o invÃ¡lida.' } };

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
          return { ok: false, error: { message: error.message || 'NÃ£o foi possÃ­vel salvar a publicaÃ§Ã£o.' } };
        }

        return { ok: true, data: data || { kind: saveKind }, enabled: true };
      }

      return await supabaseClearSavedPostStateMulti(postId, saveKind);
    } catch (e) {
      console.error('[KCAPI][saved_posts] setSavedPostStateMulti exceÃ§Ã£o:', e);
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel salvar a publicaÃ§Ã£o.' } };
    }
  }

  async function supabaseGetMySavedPostsMulti(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await supabaseGetCurrentUser();
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
      console.error('[KCAPI][saved_posts] getMySavedPostsMulti exceÃ§Ã£o:', e);
      return [];
    }
  }

  async function supabaseGetMySavedPostsCount(params = {}) {
    const client = getSupabaseClient();
    if (!client) return 0;
    const user = await supabaseGetCurrentUser();
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
      console.error('[KCAPI][saved_posts] getMySavedPostsCount exceÃ§Ã£o:', e);
      return 0;
    }
  }

  async function supabaseGetProfileHighlightsMulti(profileId, params = {}) {
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
      console.error('[KCAPI][saved_posts] getProfileHighlightsMulti exceÃ§Ã£o:', e);
      return [];
    }
  }

  async function supabaseGetProfileHighlightsCount(profileId) {
    const client = getSupabaseClient();
    const author = String(profileId || '').trim();
    if (!client || !author) return 0;

    try {
      const rpc = await client.rpc('kc_get_profile_highlights_count', { p_profile_id: author });
      if (!(rpc && rpc.error)) return Number(rpc && rpc.data) || 0;
    } catch (_) { }

    try {
      const rows = await fetchSavedRowsFallback(client, author, { kind: 'highlight' });
      return aggregateSavedRows(rows, { includeStatus: false, onlyPublished: true }).length;
    } catch (e) {
      console.error('[KCAPI][saved_posts] getProfileHighlightsCount exceÃ§Ã£o:', e);
      return 0;
    }
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

  // Incrementa likes de um comentÃ¡rio respeitando 1 like por usuÃ¡rio
  async function supabaseLikeComment(commentId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para curtir.' } };
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
          return { ok: false, error: { message: 'FaÃ§a login para curtir.' }, code };
        }
        return { ok: false, error: { message: String(data.message || 'NÃ£o foi possÃ­vel curtir.') }, code };
      }

      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] likeComment exceÃ§Ã£o:', e);
      return { ok: false };
    }
  }

  // ---------- Votes (V8.1.7.3) ----------

  // Busca o voto do usuÃ¡rio logado para um post (null se nÃ£o votou)
  async function supabaseGetMyVote(postId) {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await supabaseGetCurrentUser();
    if (!user) return null;
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return null;
    try {
      const { data } = await client
        .from('post_votes')
        .select('id, direction')
        .eq('post_id', uuid)
        .eq('voter_id', user.id)
        .maybeSingle();
      return data || null;
    } catch (_) { return null; }
  }

  function logVoteError(step, error, context) {
    console.error('[KCAPI][votes]', {
      step: String(step || 'UNKNOWN'),
      error: normalizeErrorForDiagnostics(error),
      ...(context && typeof context === 'object' ? context : {}),
    });
  }

  function isVoteConflict(error) {
    if (!error) return false;
    const code = String(error.code || '').trim();
    const msg = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();
    const hint = String(error.hint || '').toLowerCase();
    return (
      code === '23505' ||
      msg.includes('duplicate') ||
      msg.includes('conflict') ||
      msg.includes('post_votes_post_id_voter_id_key') ||
      details.includes('post_votes_post_id_voter_id_key') ||
      hint.includes('post_votes_post_id_voter_id_key')
    );
  }

  function voteFail(step, error, context) {
    logVoteError(step, error, context);
    return {
      ok: false,
      error: {
        message: 'NÃ£o foi possÃ­vel registrar voto.',
        step: String(step || 'UNKNOWN'),
      },
    };
  }

  async function fetchPostScore(client, postUuid) {
    const scoreRes = await client.from('posts').select('votos').eq('id', postUuid).maybeSingle();
    if (scoreRes && scoreRes.error) {
      logVoteError('READ_SCORE', scoreRes.error, { postId: postUuid });
      return 0;
    }
    const value = scoreRes && scoreRes.data ? scoreRes.data.votos : 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  async function deleteVoteByPostAndVoter(client, postUuid, userId, step) {
    const delRes = await client
      .from('post_votes')
      .delete()
      .eq('post_id', postUuid)
      .eq('voter_id', userId);
    if (delRes && delRes.error) {
      return { ok: false, error: delRes.error, step: step || 'DELETE_VOTE' };
    }
    return { ok: true };
  }

  // Toggle voto num post: se jÃ¡ votou igual, remove (toggle off). Caso contrÃ¡rio, insere/substitui.
  // Retorna { ok, direction: null|'hot'|'cold', score }
  async function supabaseVotePost(postId, direction, options = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase nÃ£o inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'FaÃ§a login para votar.' } };
    if (direction !== 'hot' && direction !== 'cold') return { ok: false, error: { message: 'DireÃ§Ã£o invÃ¡lida.' } };

    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) {
      // tenta resolver UUID para posts legacy
      try {
        const p = await supabaseGetPostById(String(postId));
        const resolved = (p && (p.uuid || p.id));
        if (!resolved || !UUID_RE.test(String(resolved))) return { ok: false, error: { message: 'Post invÃ¡lido.' } };
        return supabaseVotePost(String(resolved), direction, options);
      } catch (_) { return { ok: false, error: { message: 'Post invÃ¡lido.' } }; }
    }

    try {
      let shouldToggleOff = false;
      const hasExplicitToggle = Object.prototype.hasOwnProperty.call(options || {}, 'toggleOff');
      if (hasExplicitToggle) {
        shouldToggleOff = !!options.toggleOff;
      } else {
        // Compatibilidade: chamadas antigas sem options continuam com toggle no mesmo botÃ£o.
        const existing = await supabaseGetMyVote(uuid);
        shouldToggleOff = !!(existing && existing.direction === direction);
      }

      if (shouldToggleOff) {
        const del = await deleteVoteByPostAndVoter(client, uuid, user.id, 'TOGGLE_DELETE');
        if (!del.ok) return voteFail(del.step, del.error, { postId: uuid, userId: user.id, direction });
        const score = await fetchPostScore(client, uuid);
        return { ok: true, direction: null, score };
      }

      // Escrita idempotente: limpa voto existente antes de inserir nova direÃ§Ã£o.
      const preDelete = await deleteVoteByPostAndVoter(client, uuid, user.id, 'PREPARE_DELETE');
      if (!preDelete.ok) return voteFail(preDelete.step, preDelete.error, { postId: uuid, userId: user.id, direction });

      let insertRes = await client
        .from('post_votes')
        .insert({ post_id: uuid, voter_id: user.id, direction });

      // Corrida de concorrÃªncia: tenta 1 ciclo de recuperaÃ§Ã£o.
      if (insertRes && insertRes.error) {
        if (!isVoteConflict(insertRes.error)) {
          return voteFail('INSERT', insertRes.error, { postId: uuid, userId: user.id, direction });
        }

        logVoteError('INSERT_CONFLICT_RECOVERY_START', insertRes.error, { postId: uuid, userId: user.id, direction });

        const recoveryDelete = await deleteVoteByPostAndVoter(client, uuid, user.id, 'RECOVERY_DELETE');
        if (!recoveryDelete.ok) {
          return voteFail(recoveryDelete.step, recoveryDelete.error, { postId: uuid, userId: user.id, direction });
        }

        insertRes = await client
          .from('post_votes')
          .insert({ post_id: uuid, voter_id: user.id, direction });

        if (insertRes && insertRes.error) {
          return voteFail('RECOVERY_INSERT', insertRes.error, { postId: uuid, userId: user.id, direction });
        }
      }

      const score = await fetchPostScore(client, uuid);
      return { ok: true, direction, score };
    } catch (e) {
      return voteFail('EXCEPTION', e, { postId: uuid, userId: user.id, direction });
    }
  }

  // Driver Supabase (V8.1.7.2+)
  const driverSupabase = Object.freeze({
    name: 'supabase',
    getPosts: supabaseGetPosts,
    getPostById: supabaseGetPostById,
    createPost: supabaseCreatePost,
    updatePost: supabaseUpdatePost,
    deletePost: supabaseDeletePost,
    reportPost: supabaseReportPost,
    getComments: supabaseGetComments,
    addComment: supabaseAddComment,
    likeComment: supabaseLikeComment,
    votePost: supabaseVotePost,
    getMyVote: supabaseGetMyVote,
    getMyProfile: supabaseGetMyProfile,
    updateMyProfile: supabaseUpdateMyProfile,
    uploadProfileAvatar: supabaseUploadProfileAvatar,
    getMyPosts: supabaseGetMyPosts,
    getPostsByAuthorId: supabaseGetPostsByAuthorId,
    getSavedPostState: supabaseGetSavedPostStateMulti,
    setSavedPostState: supabaseSetSavedPostStateMulti,
    clearSavedPostState: supabaseClearSavedPostStateMulti,
    getMySavedPosts: supabaseGetMySavedPostsMulti,
    getMySavedPostsCount: supabaseGetMySavedPostsCount,
    getProfileHighlights: supabaseGetProfileHighlightsMulti,
    getProfileHighlightsCount: supabaseGetProfileHighlightsCount,
    createHelpRequest: supabaseCreateHelpRequest,
    listAdminHelpRequests: supabaseListAdminHelpRequests,
    updateAdminHelpRequest: supabaseUpdateAdminHelpRequest,
  });


window.KCAPI.registerAdapter('supabase', driverSupabase);

})();

