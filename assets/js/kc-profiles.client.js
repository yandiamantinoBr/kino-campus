/*
  KinoCampus - Profiles Client (V8.2.6.2)

  Objetivo:
  - Sincronizar automaticamente o usuário autenticado (Supabase Auth) com a tabela public.profiles.
  - Expor um Facade simples para o restante do frontend (controllers não falam com supabase-js).

  Regras:
  - Em modo local (DATA_DRIVER='local'), este módulo não executa chamadas.
  - Em modo supabase, faz UPSERT no SIGNED_IN (e também em SIGNED_UP/INIT para cobrir sessão persistida).

  Eventos:
  - 'kc:profilechange' (detail: { profile })

  Exposição:
  - window.KCProfiles
*/

(function () {
  'use strict';

  const VERSION = '8.2.6.2';

  const state = {
    inited: false,
    syncing: false,
    lastError: null,
    lastSyncedUserId: null,
    profile: null,
    cache: Object.create(null),
  };

  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();

    const allowedDomains = Array.isArray(env.AUTH_ALLOWED_DOMAINS)
      ? env.AUTH_ALLOWED_DOMAINS
      : (env.auth && Array.isArray(env.auth.allowedEmailDomains) ? env.auth.allowedEmailDomains : []);

    return {
      env,
      driver,
      allowedDomains: Array.isArray(allowedDomains) ? allowedDomains.filter(Boolean) : [],
      debug: !!env.debug,
    };
  }

  function getSupabaseClient() {
    if (!window.KCSupabase || typeof window.KCSupabase.getClient !== 'function') return null;
    return window.KCSupabase.getClient();
  }

  // OBS (V8.1.3.3 retro): a definição de `profiles.verified` é server-side (trigger no Postgres).
  // O frontend NÃO deve computar nem enviar `verified=true/false` no upsert.

  function titleize(s) {
    const raw = String(s || '').trim();
    if (!raw) return '';
    return raw
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((w) => w ? (w[0].toUpperCase() + w.slice(1)) : '')
      .join(' ')
      .trim();
  }

  function computeDisplayName(user) {
    if (!user) return 'Usuário';
    const meta = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};

    const direct = meta.display_name || meta.full_name || meta.name || meta.username || meta.preferred_username;
    if (direct && String(direct).trim()) return String(direct).trim();

    const em = String(user.email || '').trim();
    if (em.includes('@')) return titleize(em.split('@')[0]);

    return 'Usuário';
  }

  function computeAvatarUrl(user) {
    if (!user) return 'https://api.dicebear.com/7.x/avataaars/svg?seed=kc';
    const meta = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};

    const direct = meta.avatar_url || meta.avatar || meta.picture || meta.photo_url;
    if (direct && String(direct).trim()) return String(direct).trim();

    const seed = encodeURIComponent(String(user.email || user.id || 'kc').trim().toLowerCase());
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  }

  function normalizeProfile(row, fallback) {
    const r = (row && typeof row === 'object') ? row : {};
    const fb = (fallback && typeof fallback === 'object') ? fallback : {};

    const id = r.id || fb.id || null;
    const fullName = r.full_name || fb.full_name || '';
    const displayName = r.display_name || fb.display_name || fullName || '';
    const avatarUrl = r.avatar_url || fb.avatar_url || '';
    const bio = r.bio || fb.bio || '';
    // Hardening: badge deve refletir SOMENTE o valor retornado do banco.
    const verified = (r.verified === true);

    return Object.freeze({
      id,
      full_name: fullName,
      display_name: displayName,
      avatar_url: avatarUrl,
      bio,
      verified,
      is_admin: r.is_admin === true || fb.is_admin === true,
      created_at: r.created_at || null,
      updated_at: r.updated_at || null,
    });
  }

  function commitProfile(profile, fallback) {
    const normalized = normalizeProfile(profile, fallback);
    if (normalized && normalized.id) {
      state.profile = normalized;
      state.cache[String(normalized.id)] = normalized;
      state.lastSyncedUserId = normalized.id;
    } else {
      state.profile = normalized;
    }
    dispatchProfileChange(normalized);
    return normalized;
  }

  function dispatchProfileChange(profile) {
    try {
      document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
    } catch (_) {}
  }

  async function upsertProfileForUser(user, options = {}) {
    const { driver, debug } = readEnv();
    if (driver !== 'supabase') return null;

    const u = user || null;
    if (!u || !u.id) return null;

    const force = !!options.force;
    if (!force && state.lastSyncedUserId === u.id && state.profile && state.profile.id === u.id) {
      return state.profile;
    }

    const client = getSupabaseClient();
    if (!client) return null;

    const payload = {
      id: u.id,
      full_name: computeDisplayName(u),
    };

    state.syncing = true;
    state.lastError = null;

    try {
      // UPSERT
      let profileRow = null;
      try {
        const q = client
          .from('profiles')
          .upsert(payload, { onConflict: 'id' })
          .select('id, display_name, full_name, avatar_url, bio, verified, is_admin, created_at, updated_at');

        const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();

        if (res && res.error) {
          state.lastError = res.error;
          if (debug) console.warn('[KCProfiles] upsert erro:', res.error);
        } else {
          profileRow = (res && res.data) ? res.data : null;
        }
      } catch (e) {
        // Pode ocorrer se RLS/banco ainda não estiver pronto.
        state.lastError = e;
        if (debug) console.warn('[KCProfiles] upsert falhou:', e);
      }

      // Fallback: tenta SELECT
      if (!profileRow) {
        try {
          const q2 = client
            .from('profiles')
            .select('id, display_name, full_name, avatar_url, bio, verified, is_admin, created_at, updated_at')
            .eq('id', u.id);

          const r2 = (typeof q2.maybeSingle === 'function') ? await q2.maybeSingle() : await q2.single();
          if (r2 && r2.error) {
            state.lastError = r2.error;
            if (debug) console.warn('[KCProfiles] select erro:', r2.error);
          } else {
            profileRow = (r2 && r2.data) ? r2.data : null;
          }
        } catch (e2) {
          state.lastError = e2;
          if (debug) console.warn('[KCProfiles] select falhou:', e2);
        }
      }

      return commitProfile(profileRow, {
        id: u.id,
        full_name: computeDisplayName(u),
        display_name: '',
        avatar_url: '',
        bio: '',
      });
    } finally {
      state.syncing = false;
    }
  }

  async function getProfileById(id) {
    const { driver } = readEnv();
    if (driver !== 'supabase') return null;

    const key = String(id || '').trim();
    if (!key) return null;

    if (state.cache[key]) return state.cache[key];

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const q = client
        .from('profiles')
        .select('id, display_name, full_name, avatar_url, bio, verified, is_admin, created_at, updated_at')
        .eq('id', key);

      const r = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
      if (r && r.error) return null;

      const profile = normalizeProfile(r && r.data ? r.data : null, { id: key });
      state.cache[key] = profile;
      return profile;
    } catch (_) {
      return null;
    }
  }

  function getCurrentProfile() {
    return state.profile;
  }

  async function ensureSynced() {
    const { driver } = readEnv();
    if (driver !== 'supabase') return null;

    // Preferimos usar o cache local do KCSupabase; se não tiver, tenta getCurrentUser
    const u = (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') ? window.KCSupabase.getUser() : null;
    if (u && u.id) return upsertProfileForUser(u);

    if (window.KCSupabase && typeof window.KCSupabase.getCurrentUser === 'function') {
      const u2 = await window.KCSupabase.getCurrentUser();
      if (u2 && u2.id) return upsertProfileForUser(u2);
    }

    return null;
  }

  function reset() {
    state.profile = null;
    state.lastSyncedUserId = null;
    dispatchProfileChange(null);
  }

  async function handleAuthChange(e) {
    const d = (e && e.detail) ? e.detail : {};
    const ev = String(d.event || '').toUpperCase();
    const user = d.user || null;

    if (!user || !user.id) {
      reset();
      return;
    }

    if (ev === 'SIGNED_IN' || ev === 'SIGNED_UP' || ev === 'INIT' || ev === 'TOKEN_REFRESHED') {
      await upsertProfileForUser(user);
    }
  }

  function init() {
    if (state.inited) return;
    state.inited = true;

    const { driver } = readEnv();
    if (driver !== 'supabase') return;

    // Sempre que Auth mudar, sincroniza perfil (SIGNED_IN) ou reseta (SIGNED_OUT)
    document.addEventListener('kc:authchange', handleAuthChange);

    // Cobertura: sessão persistida pode existir antes deste script carregar.
    setTimeout(() => {
      ensureSynced();
    }, 30);
  }

  window.KCProfiles = Object.freeze({
    VERSION,
    init,
    ensureSynced,
    upsertProfileForUser,
    getCurrentProfile,
    getProfileById,
    commitProfile,
    getLastError: () => state.lastError,
  });

  // Boot
  try {
    init();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (_) {}
})();
