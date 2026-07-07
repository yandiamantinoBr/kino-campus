/*
  KinoCampus - Supabase Client + Auth Session (V8.6.1)

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


  const VERSION = '8.6.1';

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
    if (KCUtils && typeof KCUtils.isInstitutionalEmailAllowed === 'function') {
      return KCUtils.isInstitutionalEmailAllowed(email, allowedDomains);
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

  function buildAuthOptions(options) {
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const authOptions = {};

    const redirectTo = String(input.emailRedirectTo || input.redirectTo || '').trim();
    if (redirectTo) authOptions.emailRedirectTo = redirectTo;

    if (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) {
      authOptions.data = { ...input.data };
    }

    return authOptions;
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

  async function signUp(email, password, options) {
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
      const authOptions = buildAuthOptions(options);
      const payload = authOptions && Object.keys(authOptions).length
        ? { email: em, password: pw, options: authOptions }
        : { email: em, password: pw };

      const r = await client.auth.signUp(payload);
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

  async function resendSignUp(email, options) {
    const client = getClient();
    if (!client) return { ok: false, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    const em = String(email || '').trim();
    if (!em) return { ok: false, error: new Error('EMPTY_EMAIL') };

    const { allowedDomains } = readEnv();
    if (!emailAllowed(em, allowedDomains)) {
      return { ok: false, error: new Error('EMAIL_DOMAIN_NOT_ALLOWED') };
    }

    try {
      const authOptions = buildAuthOptions(options);
      const payload = {
        type: 'signup',
        email: em,
      };
      if (authOptions && Object.keys(authOptions).length) payload.options = authOptions;

      const r = await client.auth.resend(payload);
      if (r && r.error) {
        state.lastError = r.error;
        return { ok: false, error: r.error };
      }
      return { ok: true, error: null };
    } catch (e) {
      state.lastError = e;
      return { ok: false, error: e };
    }
  }

  async function requestPasswordReset(email, options) {
    const client = getClient();
    if (!client) return { ok: false, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    const em = String(email || '').trim();
    if (!em) return { ok: false, error: new Error('EMPTY_EMAIL') };

    try {
      const authOptions = buildAuthOptions(options);
      const resetOptions = {};
      const redirectTo = String(authOptions.emailRedirectTo || authOptions.redirectTo || '').trim();
      if (redirectTo) resetOptions.redirectTo = redirectTo;

      const r = await client.auth.resetPasswordForEmail(em, resetOptions);
      if (r && r.error) {
        state.lastError = r.error;
        return { ok: false, error: r.error };
      }
      return { ok: true, error: null };
    } catch (e) {
      state.lastError = e;
      return { ok: false, error: e };
    }
  }

  async function updatePassword(password) {
    const client = getClient();
    if (!client) return { ok: false, error: state.lastError || new Error('SUPABASE_NOT_READY') };

    const pw = String(password || '').trim();
    if (!pw) return { ok: false, error: new Error('EMPTY_PASSWORD') };

    try {
      const r = await client.auth.updateUser({ password: pw });
      if (r && r.error) {
        state.lastError = r.error;
        return { ok: false, error: r.error };
      }

      if (r && r.data && r.data.user && state.session) {
        state.session = { ...state.session, user: r.data.user };
        state.user = r.data.user;
        safeDispatchAuthChange('USER_UPDATED', state.session);
      }
      return { ok: true, data: r && r.data ? r.data : null, error: null };
    } catch (e) {
      state.lastError = e;
      return { ok: false, error: e };
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

  function noopSubscription() {
    return { unsubscribe: function () { } };
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

  const activeChannels = Object.create(null);

  function subscribeNewPosts(options = {}) {
    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const { driver } = readEnv();
    if (driver !== 'supabase') return noopSubscription();

    const client = getClient();
    if (!client || typeof client.channel !== 'function') return noopSubscription();

    const moduleSet = normalizeModuleFilter(opt.filter || null);
    const channelKey = Array.from(moduleSet).sort().join('-') || 'global';
    const channelName = `posts-feed-${channelKey}`;

    if (!activeChannels[channelName]) {
      const channel = client.channel(channelName);
      activeChannels[channelName] = { 
        channel, 
        listeners: new Set()
      };

      try {
        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'posts' },
          (payload) => {
            const row = (payload && payload.new && typeof payload.new === 'object') ? payload.new : null;
            if (!row) return;

            // Defesa em profundidade: feed só de published
            const status = String(row.status || '').trim().toLowerCase();
            if (status !== 'published' && status !== 'closed') return;

            if (moduleSet.size) {
              const mk = String(row.module || row.modulo || '').trim().toLowerCase();
              if (!mk || !moduleSet.has(mk)) return;
            }

            // Notify all multiplexed listeners
            if (activeChannels[channelName]) {
                activeChannels[channelName].listeners.forEach(l => {
                    try { if (typeof l.onPost === 'function') l.onPost({ row, payload }); } catch (_) {}
                });
            }
          }
        );

        if (typeof channel.subscribe === 'function') {
          channel.subscribe((status) => {
            if (activeChannels[channelName]) {
                activeChannels[channelName].listeners.forEach(l => {
                    try { if (typeof l.onStatus === 'function') l.onStatus(status); } catch (_) {}
                });
            }
          });
        }
      } catch (e) {
        delete activeChannels[channelName];
        try { if (typeof opt.onError === 'function') opt.onError(e); } catch (_) {}
        return noopSubscription();
      }
    }

    const listener = {
      onPost: opt.onPost,
      onStatus: opt.onStatus,
      onError: opt.onError
    };

    activeChannels[channelName].listeners.add(listener);
    let localUnsubscribed = false;

    return {
      unsubscribe: function () {
        if (localUnsubscribed) return;
        localUnsubscribed = true;

        const entry = activeChannels[channelName];
        if (entry) {
          entry.listeners.delete(listener);
          if (entry.listeners.size === 0) {
             try { if (typeof entry.channel.unsubscribe === 'function') entry.channel.unsubscribe(); } catch (_) {}
             try { if (typeof client.removeChannel === 'function') client.removeChannel(entry.channel); } catch (_) {}
             delete activeChannels[channelName];
          }
        }
      }
    };
  }

  function normalizePostChangePayload(payload) {
    const eventType = String((payload && payload.eventType) || (payload && payload.type) || '').toUpperCase();
    const row = (payload && payload.new && typeof payload.new === 'object')
      ? payload.new
      : ((payload && payload.old && typeof payload.old === 'object') ? payload.old : null);
    const oldRow = (payload && payload.old && typeof payload.old === 'object') ? payload.old : null;
    if (!row) return null;

    const nextStatus = String(row.status || '').trim().toLowerCase();
    const previousStatus = String(oldRow && oldRow.status || '').trim().toLowerCase();
    let type = 'updated';
    if (eventType === 'INSERT') type = 'created';
    else if (eventType === 'DELETE') type = 'purged';
    else if (nextStatus && nextStatus !== previousStatus) {
      type = (nextStatus === 'deleted' || nextStatus === 'hidden') ? 'soft_deleted' : 'status_changed';
    }

    return {
      type,
      source: 'realtime',
      postId: row.id || row.uuid || '',
      legacyId: row.legacy_id || row.legacyId || '',
      module: row.module || row.modulo || '',
      status: nextStatus,
      updated_at: row.updated_at || row.updatedAt || '',
      row,
      payload,
    };
  }

  function subscribePostChanges(options = {}) {
    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const { driver } = readEnv();
    if (driver !== 'supabase') return noopSubscription();

    const client = getClient();
    if (!client || typeof client.channel !== 'function') return noopSubscription();

    const moduleSet = normalizeModuleFilter(opt.filter || opt.module || null);
    const channelKey = Array.from(moduleSet).sort().join('-') || 'global';
    const channelName = `posts-changes-${channelKey}`;

    function shouldNotify(change) {
      if (!change) return false;
      if (!moduleSet.size) return true;
      const mk = String(change.module || '').trim().toLowerCase();
      return !!mk && moduleSet.has(mk);
    }

    // Multiplexação: cria o canal UMA vez e notifica todos os listeners (mesmo
    // padrão de subscribeNewPosts). Evita o erro "cannot add postgres_changes
    // callbacks after subscribe()" quando múltiplos pagers compartilham o canal.
    if (!activeChannels[channelName]) {
      const channel = client.channel(channelName);
      activeChannels[channelName] = { channel, listeners: new Set() };

      function notifyAll(change) {
        if (!shouldNotify(change)) return;
        try {
          if (window.KCPostFreshness && typeof window.KCPostFreshness.emit === 'function') {
            window.KCPostFreshness.emit(change);
          }
        } catch (_) { }
        if (activeChannels[channelName]) {
          activeChannels[channelName].listeners.forEach(function (l) {
            try { if (typeof l.onChange === 'function') l.onChange(change); } catch (_) { }
          });
        }
      }

      try {
        channel.on('broadcast', { event: 'post_change' }, (payload) => {
          const source = payload && payload.payload ? payload.payload : payload;
          const change = {
            type: source && source.type || 'updated',
            source: 'realtime-broadcast',
            postId: source && (source.postId || source.post_id || source.id || source.uuid) || '',
            legacyId: source && (source.legacyId || source.legacy_id) || '',
            module: source && (source.module || source.modulo) || '',
            status: source && (source.status || source.new_status) || '',
            updated_at: source && (source.updated_at || source.updatedAt) || '',
          };
          notifyAll(change);
        });
      } catch (_) { }

      try {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'posts' },
          (payload) => { notifyAll(normalizePostChangePayload(payload)); }
        );
        if (typeof channel.subscribe === 'function') {
          channel.subscribe((status) => {
            if (activeChannels[channelName]) {
              activeChannels[channelName].listeners.forEach(function (l) {
                try { if (typeof l.onStatus === 'function') l.onStatus(status); } catch (_) { }
              });
            }
          });
        }
      } catch (e) {
        delete activeChannels[channelName];
        try { if (typeof opt.onError === 'function') opt.onError(e); } catch (_) { }
        return noopSubscription();
      }
    }

    // Registra este listener no canal compartilhado
    const listener = {
      onChange: function (change) { try { if (typeof opt.onChange === 'function') opt.onChange(change); } catch (_) { } },
      onStatus: function (status) { try { if (typeof opt.onStatus === 'function') opt.onStatus(status); } catch (_) { } },
    };
    activeChannels[channelName].listeners.add(listener);

    let unsubscribed = false;
    return {
      unsubscribe: function () {
        if (unsubscribed) return;
        unsubscribed = true;
        if (activeChannels[channelName]) {
          activeChannels[channelName].listeners.delete(listener);
          // Só remove o canal quando não há mais listeners
          if (activeChannels[channelName].listeners.size === 0) {
            try {
              const ch = activeChannels[channelName].channel;
              if (typeof ch.unsubscribe === 'function') ch.unsubscribe();
            } catch (_) { }
            try { if (typeof client.removeChannel === 'function') client.removeChannel(activeChannels[channelName].channel); } catch (_) { }
            delete activeChannels[channelName];
          }
        }
      }
    };
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') {
      return { data: { subscription: { unsubscribe: function () { } } } };
    }

    return client.auth.onAuthStateChange((event, session) => {
      state.session = session || null;
      state.user = state.session ? state.session.user : null;
      safeDispatchAuthChange(event, state.session);

      try {
        if (typeof callback === 'function') callback({ event, session: state.session, user: state.user });
      } catch (err) { console.warn('[KCSupabase] onAuthStateChange callback falhou:', err && err.message || err); }
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
    } catch (err) { console.warn('[KCSupabase] Auth subscription falhou:', err && err.message || err); }
  }

  // Expõe internals para sub-módulos (runtime late-binding)
  function ensurePrivacyAnalyticsScript() {
    try {
      if (typeof document === 'undefined') return;
      if (window.KCPrivacyAnalytics || document.querySelector('script[data-kc-privacy-analytics="true"]')) return;
      const current = document.currentScript;
      const currentSrc = current && current.src ? String(current.src) : '';
      const script = document.createElement('script');
      script.defer = true;
      script.async = false;
      script.src = currentSrc
        ? currentSrc.replace(/assets\/js\/api\/kc-supabase\.client\.js(?:\?[^#]*)?$/i, 'assets/js/features/kc-privacy-analytics.js?v=8.6.1')
        : 'assets/js/features/kc-privacy-analytics.js?v=8.6.1';
      script.setAttribute('data-kc-privacy-analytics', 'true');
      (document.head || document.documentElement).appendChild(script);
    } catch (_) { }
  }

  window._KCSupabaseInternal = Object.freeze({ getClient: getClient, readEnv: readEnv });

  // Stubs — preenchidos pelos sub-módulos (kc-supabase.posts.js, kc-supabase.ratings.js)
  window.KCSupabase = window.KCSupabase || {};
  window.KCSupabase._posts   = window.KCSupabase._posts   || {};
  window.KCSupabase._ratings = window.KCSupabase._ratings || {};

  // Exposição pública
  window.KCSupabase = {
    VERSION,
    init,
    getClient,
    refreshSession,
    getSession: function () { return state.session; },
    getUser: function () { return state.user; },
    getCurrentUser,
    signIn,
    signUp,
    resendSignUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    onAuthStateChange,
    subscribeNewPosts,
    subscribePostChanges,
    // Delegações para sub-módulos (kc-supabase.posts.js)
    getPosts:     function (p) { return window.KCSupabase._posts && typeof window.KCSupabase._posts.getPosts === 'function' ? window.KCSupabase._posts.getPosts(p) : Promise.resolve([]); },
    getPostById:  function (id) { return window.KCSupabase._posts && typeof window.KCSupabase._posts.getPostById === 'function' ? window.KCSupabase._posts.getPostById(id) : Promise.resolve(null); },
    searchPosts:  function (p) { return window.KCSupabase._posts && typeof window.KCSupabase._posts.searchPosts === 'function' ? window.KCSupabase._posts.searchPosts(p) : Promise.resolve([]); },
    getFeedCursor: function (p) { return window.KCSupabase._posts && typeof window.KCSupabase._posts.getFeedCursor === 'function' ? window.KCSupabase._posts.getFeedCursor(p) : Promise.resolve(null); },
    // Delegações para sub-módulos (kc-supabase.ratings.js)
    getUserRatingSummary: function (id) { return window.KCSupabase._ratings && typeof window.KCSupabase._ratings.getUserRatingSummary === 'function' ? window.KCSupabase._ratings.getUserRatingSummary(id) : Promise.resolve(null); },
    getUserRatingState:   function (p) { return window.KCSupabase._ratings && typeof window.KCSupabase._ratings.getUserRatingState === 'function' ? window.KCSupabase._ratings.getUserRatingState(p) : Promise.resolve(null); },
    listUserRatings:      function (p) { return window.KCSupabase._ratings && typeof window.KCSupabase._ratings.listUserRatings === 'function' ? window.KCSupabase._ratings.listUserRatings(p) : Promise.resolve([]); },
    upsertUserRating:     function (p) { return window.KCSupabase._ratings && typeof window.KCSupabase._ratings.upsertUserRating === 'function' ? window.KCSupabase._ratings.upsertUserRating(p) : Promise.resolve(null); },
  };

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
      subscribePostChanges: function (options) {
        if (window.KCSupabase && typeof window.KCSupabase.subscribePostChanges === 'function') {
          return window.KCSupabase.subscribePostChanges(options);
        }
        return noopSubscription();
      },
    });
  } catch (_) { }

  // Boot automático (sem bloquear render)
  try {
    // inicia o mais cedo possível
    ensurePrivacyAnalyticsScript();
    init();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (err) { console.warn('[KCSupabase] Boot falhou:', err && err.message || err); }

})();
