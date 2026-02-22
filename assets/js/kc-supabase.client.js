/*
  KinoCampus - Supabase Client + Auth Session (V8.1.3.1)

  Regras:
  - Encapsula TODA a lógica de Auth/Sessão aqui (Facade para o resto do app)
  - Usa apenas chaves do window.KC_ENV (SUPABASE_URL / SUPABASE_ANON_KEY)
  - Em modo local (DATA_DRIVER='local') não interfere no UX

  Exposição:
  - window.KCSupabase

  Eventos:
  - 'kc:authchange' (detail: { event, session, user })
*/

(function () {
  'use strict';

  const VERSION = '8.1.12.0';

  const state = {
    inited: false,
    client: null,
    session: null,
    user: null,
    lastError: null,
    authSub: null,
  };

  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();

    const url = String(env.SUPABASE_URL || ((env.supabase || {}).url) || '').trim();
    const anonKey = String(env.SUPABASE_ANON_KEY || ((env.supabase || {}).anonKey) || '').trim();

    const allowedDomains = Array.isArray(env.AUTH_ALLOWED_DOMAINS)
      ? env.AUTH_ALLOWED_DOMAINS
      : (env.auth && Array.isArray(env.auth.allowedEmailDomains) ? env.auth.allowedEmailDomains : []);

    return { driver, url, anonKey, allowedDomains, debug: !!env.debug };
  }

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function isConfigured(url, anonKey) {
    if (!url || !anonKey) return false;
    if (/placeholder/i.test(url)) return false;
    if (/placeholder/i.test(anonKey)) return false;
    return true;
  }

  function safeDispatchAuthChange(eventName, session) {
    const detail = {
      event: eventName,
      session: session || null,
      user: (session && session.user) ? session.user : null,
    };

    try {
      document.dispatchEvent(new CustomEvent('kc:authchange', { detail }));
    } catch (_) {
      // ignora
    }
  }

  function getClient() {
    if (state.client) return state.client;

    const { driver, url, anonKey } = readEnv();
    if (driver !== 'supabase') return null;

    if (!hasSupabaseLib()) {
      state.lastError = new Error('SUPABASE_JS_MISSING');
      return null;
    }

    if (!isConfigured(url, anonKey)) {
      state.lastError = new Error('SUPABASE_ENV_MISSING');
      return null;
    }

    try {
      state.client = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return state.client;
    } catch (e) {
      state.lastError = e;
      return null;
    }
  }

  async function refreshSession() {
    const client = getClient();
    if (!client) return null;

    try {
      const r = await client.auth.getSession();
      if (r && r.error) {
        state.lastError = r.error;
        state.session = null;
        state.user = null;
        return null;
      }

      state.session = (r && r.data && r.data.session) ? r.data.session : null;
      state.user = state.session ? state.session.user : null;
      return state.session;
    } catch (e) {
      state.lastError = e;
      state.session = null;
      state.user = null;
      return null;
    }
  }

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;

    // Preferimos pegar de forma "oficial" do Auth (evita user stale)
    try {
      const r = await client.auth.getUser();
      if (r && r.error) {
        // fallback session cache
        await refreshSession();
        return state.user;
      }
      const user = (r && r.data && r.data.user) ? r.data.user : null;
      state.user = user;
      return user;
    } catch (e) {
      state.lastError = e;
      await refreshSession();
      return state.user;
    }
  }

  function emailAllowed(email, allowedDomains) {
    if (window.KCUtils && typeof window.KCUtils.isInstitutionalEmailAllowed === 'function') {
      return window.KCUtils.isInstitutionalEmailAllowed(email, allowedDomains);
    }

    const em = String(email || '').trim().toLowerCase();
    const at = em.lastIndexOf('@');
    if (at < 0) return false;
    const domain = em.slice(at + 1);

    const list = Array.isArray(allowedDomains)
      ? Array.from(new Set(allowedDomains
        .map((d) => String(d || '').trim().toLowerCase())
        .filter(Boolean)))
      : [];

    if (!list.length) return true; // sem restrição
    return list.includes(domain);
  }

  async function signIn(email, password) {
    const client = getClient();
    if (!client) return { user: null, session: null, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: new Error('EMPTY_FIELDS') };

    try {
      const r = await client.auth.signInWithPassword({ email: em, password: pw });
      if (r && r.error) {
        state.lastError = r.error;
        return { user: null, session: null, error: r.error };
      }

      const session = (r && r.data && r.data.session) ? r.data.session : null;
      state.session = session;
      state.user = session ? session.user : ((r && r.data && r.data.user) ? r.data.user : null);

      // Em alguns fluxos o onAuthStateChange dispara depois; já notificamos aqui também
      safeDispatchAuthChange('SIGNED_IN', state.session);
      return { user: state.user, session: state.session, error: null };
    } catch (e) {
      state.lastError = e;
      return { user: null, session: null, error: e };
    }
  }

  async function signUp(email, password) {
    const client = getClient();
    if (!client) return { user: null, session: null, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: new Error('EMPTY_FIELDS') };

    const { allowedDomains } = readEnv();
    if (!emailAllowed(em, allowedDomains)) {
      return { user: null, session: null, error: new Error('EMAIL_DOMAIN_NOT_ALLOWED') };
    }

    try {
      const r = await client.auth.signUp({ email: em, password: pw });
      if (r && r.error) {
        state.lastError = r.error;
        return { user: null, session: null, error: r.error };
      }

      // Atenção: dependendo da config do Supabase, signUp pode exigir confirmação de email
      const session = (r && r.data && r.data.session) ? r.data.session : null;
      state.session = session;
      state.user = session ? session.user : ((r && r.data && r.data.user) ? r.data.user : null);

      safeDispatchAuthChange('SIGNED_UP', state.session);
      return { user: state.user, session: state.session, error: null };
    } catch (e) {
      state.lastError = e;
      return { user: null, session: null, error: e };
    }
  }

  async function signOut() {
    const client = getClient();
    if (!client) return { ok: false, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    try {
      const r = await client.auth.signOut();
      if (r && r.error) {
        state.lastError = r.error;
        return { ok: false, error: r.error };
      }

      state.session = null;
      state.user = null;
      safeDispatchAuthChange('SIGNED_OUT', null);
      return { ok: true, error: null };
    } catch (e) {
      state.lastError = e;
      return { ok: false, error: e };
    }
  }

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

    const q = (p.q || p.query || p.search || '').toString().trim();

    const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
    const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 50;

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;

    const norm = (v) => {
      if (v == null) return null;
      const s = String(v).trim().toLowerCase();
      return s ? s : null;
    };

    return {
      module: norm(module),
      category: norm(category),
      subcategory: norm(subcategory),
      q,
      page,
      limit,
    };
  }

  function isMissingTokenError(err, token) {
    if (!err || !token) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes(String(token).toLowerCase()) && msg.includes('does not exist');
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

  function buildPostsSelect(includeVerified, mediaRel) {
    const profileFields = includeVerified
      ? 'id, full_name, avatar_url, verified'
      : 'id, full_name, avatar_url';

    // mediaRel: post_media (padrão do schema) | post_images (compat)
    return `id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (${profileFields}), ${mediaRel} (id, url, is_cover)`;
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder) {
    const profileFields = includeVerified
      ? "id, full_name, avatar_url, verified"
      : "id, full_name, avatar_url";

    const mediaFields = includeSortOrder
      ? "id, url, is_cover, sort_order"
      : "id, url, is_cover";

    return `id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (${profileFields}), ${mediaRel} (${mediaFields})`;
  }

  function isMaybeSingleMissing(err) {
    if (!err) return false;
    const code = String(err.code || "");
    const msg = String(err.message || err.details || "").toLowerCase();
    return code === "PGRST116" || msg.includes("json object requested") || msg.includes("no rows");
  }

  async function getPostById(idOrUuid) {
    const { driver } = readEnv();
    if (driver !== "supabase") return null;

    const key = String(idOrUuid || "").trim();
    if (!key) return null;
    if (key.startsWith("u_")) return null; // IDs locais não existem no banco

    const client = getClient();
    if (!client) return null;

    const isUuid = UUID_RE.test(key);
    const legacyNum = (!isUuid && /^\d+$/.test(key)) ? parseInt(key, 10) : null;

    const run = async (selectStr, mediaRel, includeSortOrder, includeVerified) => {
      let q = client.from("posts").select(selectStr).limit(1);
      if (isUuid) q = q.eq("id", key);
      else if (legacyNum != null) q = q.eq("legacy_id", legacyNum);
      else return { data: null, error: null };

      // Ordenação por sort_order quando existir (sem assumir schema)
      if (includeSortOrder) {
        try { q = q.order("sort_order", { foreignTable: mediaRel, ascending: true }); } catch (_) {}
      }
      try { q = q.order("is_cover", { foreignTable: mediaRel, ascending: false }); } catch (_) {}

      if (typeof q.maybeSingle === "function") return await q.maybeSingle();
      return await q.single();
    };

    let mediaRel = "post_media";
    let includeVerified = true;
    let includeSortOrder = true;

    // Tentativa 1: post_media + verified + sort_order
    let res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);

    // Compat: coluna verified ausente
    if (res && res.error && isMissingTokenError(res.error, "verified")) {
      includeVerified = false;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);
    }

    // Compat: sort_order ausente
    if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
      includeSortOrder = false;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);
    }

    // Compat: relação post_media ausente
    if (res && res.error && (isMissingTokenError(res.error, "post_media") || String(res.error.message || "").toLowerCase().includes("post_media") && String(res.error.message || "").toLowerCase().includes("relationship"))) {
      mediaRel = "post_images";
      includeVerified = true;
      includeSortOrder = true;
      res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);
      if (res && res.error && isMissingTokenError(res.error, "verified")) {
        includeVerified = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);
      }
      if (res && res.error && isMissingTokenError(res.error, "sort_order")) {
        includeSortOrder = false;
        res = await run(buildPostDetailSelect(includeVerified, mediaRel, includeSortOrder), mediaRel, includeSortOrder, includeVerified);
      }
    }

    if (res && res.error) {
      if (isMaybeSingleMissing(res.error)) return null;
      try { console.error("[KCSupabase] getPostById erro:", res.error); } catch (_) {}
      return null;
    }

    return (res && res.data) ? res.data : null;
  }

  async function getPosts(params = {}) {
    const { driver } = readEnv();
    if (driver !== 'supabase') return [];

    const client = getClient();
    if (!client) return [];

    const f = normalizeGetPostsParams(params);
    const from = (f.page - 1) * f.limit;
    const to = from + f.limit - 1;

    const run = async (selectStr) => {
      let q = client
        .from('posts')
        .select(selectStr)
        .order('created_at', { ascending: false });

      if (f.module) q = q.eq('module', f.module);
      if (f.category) q = q.eq('category', f.category);
      if (f.subcategory) q = q.eq('metadata->>subcategory', f.subcategory);
      if (f.q) q = q.or(buildOrILike(f.q));

      return await q.range(from, to);
    };

    // 1) tentativa padrão (post_media + profiles.verified)
    let mediaRel = 'post_media';
    let res = await run(buildPostsSelect(true, mediaRel));

    // 2) compat: schema sem profiles.verified
    if (res && res.error && isMissingTokenError(res.error, 'verified')) {
      res = await run(buildPostsSelect(false, mediaRel));
    }

    // 3) compat: schema com relação post_images (ao invés de post_media)
    if (res && res.error && (isMissingTokenError(res.error, 'post_media') || isMissingTokenError(res.error, 'post_media ') || isMissingTokenError(res.error, 'post_media('))) {
      mediaRel = 'post_images';
      res = await run(buildPostsSelect(true, mediaRel));
      if (res && res.error && isMissingTokenError(res.error, 'verified')) {
        res = await run(buildPostsSelect(false, mediaRel));
      }
    }

    // Alguns PostgREST usam mensagens diferentes para relação inexistente
    if (res && res.error) {
      const msg = String(res.error.message || '').toLowerCase();
      if (msg.includes('post_media') && msg.includes('relationship')) {
        mediaRel = 'post_images';
        res = await run(buildPostsSelect(true, mediaRel));
        if (res && res.error && isMissingTokenError(res.error, 'verified')) {
          res = await run(buildPostsSelect(false, mediaRel));
        }
      }
    }

    if (res && res.error) {
      try { console.error('[KCSupabase] getPosts erro:', res.error); } catch (_) {}
      return [];
    }

    return (res && Array.isArray(res.data)) ? res.data : [];
  }

  function noopSubscription() {
    return { unsubscribe: function () {} };
  }

  function normalizeModuleFilter(filter) {
    const f = (filter && typeof filter === 'object' && !Array.isArray(filter))
      ? (filter.module || filter.modules || filter.modulo || filter.modulos || null)
      : filter;

    const list = Array.isArray(f) ? f : (f != null ? [f] : []);
    const set = new Set();
    list.forEach((v) => {
      const s = String(v || '').trim().toLowerCase();
      if (s) set.add(s);
    });
    return set;
  }

  function subscribeNewPosts(options = {}) {
    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const { driver } = readEnv();
    if (driver !== 'supabase') return noopSubscription();

    const client = getClient();
    if (!client || typeof client.channel !== 'function') return noopSubscription();

    const moduleSet = normalizeModuleFilter(opt.filter || null);
    const channelName = `posts-feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = null;
    let unsubscribed = false;

    try {
      channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'posts' },
          (payload) => {
            const row = (payload && payload.new && typeof payload.new === 'object') ? payload.new : null;
            if (!row) return;

            // Defesa em profundidade: mesmo com RLS, o feed público só consome published.
            const status = String(row.status || '').trim().toLowerCase();
            if (status !== 'published') return;

            if (moduleSet.size) {
              const mk = String(row.module || row.modulo || '').trim().toLowerCase();
              if (!mk || !moduleSet.has(mk)) return;
            }

            try {
              if (typeof opt.onPost === 'function') opt.onPost({ row, payload });
            } catch (cbErr) {
              try {
                if (typeof opt.onError === 'function') opt.onError(cbErr);
              } catch (_) {}
            }
          }
        );

      if (typeof channel.subscribe === 'function') {
        channel.subscribe((status) => {
          try {
            if (typeof opt.onStatus === 'function') opt.onStatus(status);
          } catch (_) {}
        });
      }
    } catch (e) {
      try {
        if (typeof opt.onError === 'function') opt.onError(e);
      } catch (_) {}
      return noopSubscription();
    }

    return {
      unsubscribe: function () {
        if (unsubscribed) return;
        unsubscribed = true;
        try {
          if (channel && typeof channel.unsubscribe === 'function') channel.unsubscribe();
        } catch (_) {}
        try {
          if (channel && typeof client.removeChannel === 'function') client.removeChannel(channel);
        } catch (_) {}
      }
    };
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') {
      return { data: { subscription: { unsubscribe: function () {} } } };
    }

    return client.auth.onAuthStateChange((event, session) => {
      state.session = session || null;
      state.user = state.session ? state.session.user : null;
      safeDispatchAuthChange(event, state.session);

      try {
        if (typeof callback === 'function') callback({ event, session: state.session, user: state.user });
      } catch (_) {}
    });
  }

  async function init() {
    if (state.inited) return;
    state.inited = true;

    const { driver, debug } = readEnv();
    if (driver !== 'supabase') return;

    const client = getClient();
    if (!client) {
      if (debug) console.warn('[KCSupabase] Supabase não inicializado (SDK/config ausente).');
      return;
    }

    await refreshSession();
    safeDispatchAuthChange('INIT', state.session);

    // Escuta ativa
    try {
      state.authSub = onAuthStateChange();
    } catch (_) {}
  }

  // Exposição pública
  window.KCSupabase = Object.freeze({
    VERSION,
    init,
    getClient,
    getPosts,
    getPostById,
    refreshSession,
    getSession: () => state.session,
    getUser: () => state.user,
    getCurrentUser,
    signIn,
    signUp,
    signOut,
    onAuthStateChange,
    subscribeNewPosts,
  });

  // Facade dedicada para realtime de feed (evita acoplamento dos controllers ao client direto).
  try {
    window.KCRealtime = Object.freeze({
      VERSION,
      subscribeNewPosts: function (options) {
        if (window.KCSupabase && typeof window.KCSupabase.subscribeNewPosts === 'function') {
          return window.KCSupabase.subscribeNewPosts(options);
        }
        return noopSubscription();
      },
    });
  } catch (_) {}

  // Boot automático (sem bloquear render)
  try {
    // inicia o mais cedo possível
    init();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (_) {}
})();
