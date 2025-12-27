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

  const VERSION = '8.1.3.2';

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
    const em = String(email || '').trim().toLowerCase();
    if (!em.includes('@')) return false;
    const domain = em.split('@').pop() || '';

    const list = Array.isArray(allowedDomains) ? allowedDomains.filter(Boolean).map(d => String(d).trim().toLowerCase()) : [];
    if (!list.length) return true; // sem restrição

    return list.some((d) => domain === d || domain.endsWith(`.${d}`) || domain.endsWith(d));
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
    refreshSession,
    getSession: () => state.session,
    getUser: () => state.user,
    getCurrentUser,
    signIn,
    signUp,
    signOut,
    onAuthStateChange,
  });

  // Boot automático (sem bloquear render)
  try {
    // inicia o mais cedo possível
    init();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (_) {}
})();
