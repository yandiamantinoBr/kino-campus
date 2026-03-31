(function () {
  'use strict';

  const VERSION = '8.6.0';

  const shared = window.KCAccountProfileUtils || {};
  const OWNER_FIELDS = shared.OWNER_PROFILE_SELECT_FIELDS || [
    'id',
    'display_name',
    'full_name',
    'avatar_url',
    'avatar_path',
    'bio',
    'verified',
    'is_admin',
    'created_at',
    'updated_at',
    'onboarding_completed_at',
    'affiliation',
    'gender_identity',
    'gender_identity_custom',
    'race_color',
    'profile_public',
    'contact_primary_method',
    'contact_cta_enabled',
    'social_links',
    'social_visibility'
  ].join(', ');
  const PUBLIC_FIELDS = shared.PUBLIC_PROFILE_SELECT_FIELDS || [
    'id',
    'display_name',
    'full_name',
    'avatar_url',
    'bio',
    'verified',
    'created_at',
    'updated_at',
    'onboarding_completed_at',
    'affiliation',
    'gender_identity',
    'gender_identity_custom',
    'race_color',
    'profile_public',
    'contact_primary_method',
    'contact_cta_enabled',
    'social_links',
    'social_visibility'
  ].join(', ');

  const state = {
    inited: false,
    syncing: false,
    lastError: null,
    lastUserId: '',
    profile: null,
    profileSignature: '',
    pendingSync: null,
    pendingSyncUserId: '',
    cache: Object.create(null),
  };

  function readEnv() {
    const env = window.KC_ENV || {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
    return {
      driver,
      debug: !!env.debug,
    };
  }

  function getClient() {
    if (!window.KCSupabase || typeof window.KCSupabase.getClient !== 'function') return null;
    return window.KCSupabase.getClient();
  }

  function titleize(value) {
    return String(value || '')
      .trim()
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ')
      .trim();
  }

  function computeDisplayName(user) {
    const meta = (user && user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    const candidate = meta.display_name || meta.full_name || meta.name || meta.preferred_username || '';
    if (String(candidate || '').trim()) return String(candidate).trim();

    const email = String((user && user.email) || '').trim();
    if (email.includes('@')) return titleize(email.split('@')[0]);
    return 'Usuario';
  }

  function computeAvatarUrl(user) {
    void user;
    return '';
  }

  function normalizeProfile(row, fallback) {
    const source = (row && typeof row === 'object') ? row : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : {};

    const normalized = {
      id: source.id || base.id || null,
      legacy_id: source.legacy_id || base.legacy_id || null,
      legacyId: source.legacyId || source.legacy_id || base.legacyId || base.legacy_id || null,
      full_name: String(source.full_name || base.full_name || '').trim(),
      display_name: String(source.display_name || base.display_name || source.full_name || base.full_name || '').trim(),
      avatar_url: String(source.avatar_url || base.avatar_url || '').trim(),
      avatar_path: String(source.avatar_path || base.avatar_path || '').trim(),
      bio: String(source.bio || base.bio || '').trim(),
      verified: source.verified === true,
      is_admin: source.is_admin === true || base.is_admin === true,
      created_at: source.created_at || base.created_at || null,
      updated_at: source.updated_at || base.updated_at || null,
      onboarding_completed_at: source.onboarding_completed_at || base.onboarding_completed_at || null,
      affiliation: source.affiliation || base.affiliation || null,
      gender_identity: source.gender_identity || base.gender_identity || null,
      gender_identity_custom: source.gender_identity_custom || base.gender_identity_custom || null,
      race_color: source.race_color || base.race_color || null,
      profile_public: source.profile_public === true || base.profile_public === true,
      contact_primary_method: source.contact_primary_method || base.contact_primary_method || null,
      contact_cta_enabled: source.contact_cta_enabled !== false && base.contact_cta_enabled !== false,
      social_links: shared.normalizeSocialLinks
        ? shared.normalizeSocialLinks(source.social_links || base.social_links || {})
        : (source.social_links || base.social_links || {}),
      social_visibility: shared.normalizeSocialVisibility
        ? shared.normalizeSocialVisibility(source.social_visibility || base.social_visibility || {})
        : (source.social_visibility || base.social_visibility || {}),
    };

    return Object.freeze(normalized);
  }

  function buildProfileSignature(profile) {
    if (!profile) return '';
    try {
      return JSON.stringify(profile);
    } catch (_) {
      return String(profile.id || '');
    }
  }

  function dispatchProfileChange(profile) {
    try {
      document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
    } catch (_) { }
  }

  function commitProfile(profile, fallback) {
    const normalized = normalizeProfile(profile, fallback);
    const nextSignature = buildProfileSignature(normalized);
    const changed = nextSignature !== state.profileSignature;
    state.profile = normalized;
    state.profileSignature = nextSignature;
    if (normalized && normalized.id) {
      state.cache[String(normalized.id)] = normalized;
      state.lastUserId = String(normalized.id);
    }
    if (changed) dispatchProfileChange(normalized);
    return normalized;
  }

  function resetProfileState() {
    const hadState = !!state.profileSignature || !!state.lastUserId || Object.keys(state.cache).length > 0;
    state.profile = null;
    state.profileSignature = '';
    state.lastUserId = '';
    state.cache = Object.create(null);
    if (hadState) dispatchProfileChange(null);
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async function selectProfileById(id, fields) {
    const client = getClient();
    if (!client) return null;

    const key = String(id || '').trim();
    // profiles.id is UUID — skip Supabase query for legacy IDs (e.g. "USER_29")
    if (!key || !UUID_RE.test(key)) return null;

    try {
      const query = client
        .from('profiles')
        .select(fields)
        .eq('id', key);

      const result = (typeof query.maybeSingle === 'function')
        ? await query.maybeSingle()
        : await query.single();

      if (result && result.error) {
        state.lastError = result.error;
        return null;
      }
      return (result && result.data) ? result.data : null;
    } catch (error) {
      state.lastError = error;
      return null;
    }
  }

  async function createProfileFallback(user) {
    const client = getClient();
    if (!client || !user || !user.id) return null;

    const payload = {
      id: user.id,
      full_name: computeDisplayName(user),
      display_name: computeDisplayName(user),
    };
    const avatarUrl = computeAvatarUrl(user);
    if (avatarUrl) payload.avatar_url = avatarUrl;

    try {
      const query = client
        .from('profiles')
        .insert(payload)
        .select(OWNER_FIELDS);

      const result = (typeof query.maybeSingle === 'function')
        ? await query.maybeSingle()
        : await query.single();

      if (result && result.error) {
        state.lastError = result.error;
        return null;
      }
      return (result && result.data) ? result.data : payload;
    } catch (error) {
      state.lastError = error;
      return null;
    }
  }

  async function ensureSynced(options) {
    const env = readEnv();
    if (env.driver !== 'supabase') return null;

    const user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;

    if (!user || !user.id) {
      resetProfileState();
      return null;
    }

    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const force = !!opts.force;
    const userId = String(user.id || '');
    if (!force && state.profile && String(state.profile.id || '') === String(user.id || '')) {
      return state.profile;
    }
    if (state.pendingSync && state.pendingSyncUserId === userId) return state.pendingSync;

    state.pendingSyncUserId = userId;
    state.pendingSync = (async function runSync() {
      state.syncing = true;
      try {
        let row = await selectProfileById(user.id, OWNER_FIELDS);
        if (!row) row = await createProfileFallback(user);
        const activeUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
          ? window.KCSupabase.getUser()
          : null;
        if (!activeUser || String(activeUser.id || '') !== userId) {
          return state.profile;
        }
        if (!row) {
          return commitProfile(null, {
            id: user.id,
            full_name: computeDisplayName(user),
            display_name: computeDisplayName(user),
            avatar_url: computeAvatarUrl(user),
            contact_cta_enabled: true,
            social_links: {},
            social_visibility: {},
          });
        }
        return commitProfile(row, {
          id: user.id,
          full_name: computeDisplayName(user),
          display_name: computeDisplayName(user),
          avatar_url: computeAvatarUrl(user),
        });
      } finally {
        state.syncing = false;
        if (state.pendingSyncUserId === userId) {
          state.pendingSync = null;
          state.pendingSyncUserId = '';
        }
      }
    }());

    return state.pendingSync;
  }

  async function upsertProfileForUser(user, options) {
    const sessionUser = user && user.id ? user : (
      window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
        ? window.KCSupabase.getUser()
        : null
    );
    if (!sessionUser || !sessionUser.id) return null;
    return ensureSynced(Object.assign({}, options, { force: true }));
  }

  async function getProfileById(id) {
    const env = readEnv();
    if (env.driver !== 'supabase') return null;

    const key = String(id || '').trim();
    if (!key) return null;
    if (state.cache[key]) return state.cache[key];

    const row = await selectProfileById(key, PUBLIC_FIELDS);
    if (!row) return null;

    const normalized = normalizeProfile(row, { id: key });
    state.cache[key] = normalized;
    return normalized;
  }

  function getCurrentProfile() {
    return state.profile;
  }

  async function handleAuthChange(event) {
    const detail = event && event.detail ? event.detail : {};
    const authEvent = String(detail.event || '').toUpperCase();
    const user = detail.user || null;

    if (!user || !user.id || authEvent === 'SIGNED_OUT') {
      resetProfileState();
      return;
    }

    if (authEvent === 'TOKEN_REFRESHED' && state.profile && String(state.profile.id || '') === String(user.id || '')) {
      return;
    }

    await ensureSynced({ force: authEvent === 'SIGNED_IN' || authEvent === 'SIGNED_UP' || authEvent === 'USER_UPDATED' });
  }

  function init() {
    if (state.inited) return;
    state.inited = true;

    const env = readEnv();
    if (env.driver !== 'supabase') return;

    document.addEventListener('kc:authchange', handleAuthChange);
    const user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (user && user.id) {
      ensureSynced().catch((error) => {
        state.lastError = error;
      });
    }
  }

  window.KCProfiles = Object.freeze({
    VERSION,
    init,
    ensureSynced,
    upsertProfileForUser,
    getCurrentProfile,
    getProfileById,
    commitProfile,
    getLastError: function () { return state.lastError; },
  });

  try {
    init();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } catch (_) { }
})();
