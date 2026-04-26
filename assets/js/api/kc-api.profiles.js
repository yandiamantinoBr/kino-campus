/*
  KinoCampus - KCAPI Profiles Module (v11.33.4)

  Sub-modulo do dominio profiles para a fachada KCAPI.
  Registrado em window._KCAPI.profiles e carregado antes de kc-api.client.js.

  Contrato preservado: os 6 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  delegacao a window.KCProfiles para leitura/sync de perfil Supabase e
  fallback de getProfileById para mocks legados via deps.getAuthorById.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver,  // () => driver ativo
    ENV,              // { driver: 'local'|'supabase', ... }
    getAuthorById,    // (id) => mock user | null
  }
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Helpers internos ───────────────────────────────────────────

  function getActiveDriverOrNull(deps) {
    if (!deps || typeof deps.getActiveDriver !== 'function') return null;
    try {
      return deps.getActiveDriver();
    } catch (_) {
      return null;
    }
  }

  function getEnvDriver(deps) {
    return (deps && deps.ENV && typeof deps.ENV.driver === 'string')
      ? deps.ENV.driver
      : 'local';
  }

  // ── Métodos públicos ───────────────────────────────────────────

  function getCurrentProfile(deps) {
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
      return window.KCProfiles.getCurrentProfile();
    }
    return null;
  }

  async function getProfileById(id, deps) {
    const envDriver = getEnvDriver(deps);

    // 1. Supabase (caminho principal)
    if (envDriver === 'supabase' &&
        window.KCProfiles && typeof window.KCProfiles.getProfileById === 'function') {
      const profile = await window.KCProfiles.getProfileById(id);
      if (profile) return profile;
    }

    // 2. Fallback: mock user legado (USER_01..USER_42)
    const getAuthorById = (deps && typeof deps.getAuthorById === 'function') ? deps.getAuthorById : null;
    const mock = getAuthorById ? getAuthorById(id) : null;
    if (mock) {
      return Object.freeze({
        id:                     mock.id,
        display_name:           mock.displayName || mock.name || '',
        full_name:              mock.displayName || mock.name || '',
        avatar_url:             mock.avatarUrl   || mock.avatar || '',
        bio:                    '',
        verified:               false,
        is_admin:               false,
        rating_avg:             null,
        rating_count:           0,
        ratingAvg:              null,
        ratingCount:            0,
        profile_public:         true,
        contact_primary_method: null,
        contact_cta_enabled:    true,
        social_links:           {},
        social_visibility:      {},
        created_at:             null,
        updated_at:             null,
      });
    }

    return null;
  }

  async function syncProfile(deps) {
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') {
      return window.KCProfiles.ensureSynced();
    }
    return null;
  }

  async function getMyProfile(deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getMyProfile !== 'function') return null;
    return driver.getMyProfile();
  }

  async function updateMyProfile(patch, deps) {
    const driver = getActiveDriverOrNull(deps);
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase' && driver && typeof driver.updateMyProfile === 'function') {
      return driver.updateMyProfile(patch || {});
    }
    if (envDriver !== 'supabase' || !driver || !driver.updateMyProfile) {
      return { ok: false, error: { message: 'Perfil indisponível neste driver.' } };
    }
    return driver.updateMyProfile(patch || {});
  }

  async function uploadProfileAvatar(fileOrDataUrl, deps) {
    const driver = getActiveDriverOrNull(deps);
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase' && driver && typeof driver.uploadProfileAvatar === 'function') {
      return driver.uploadProfileAvatar(fileOrDataUrl);
    }
    if (envDriver !== 'supabase' || !driver || !driver.uploadProfileAvatar) {
      return { ok: false, error: { message: 'Upload de avatar indisponível neste driver.' } };
    }
    return driver.uploadProfileAvatar(fileOrDataUrl);
  }

  window._KCAPI.profiles = {
    getCurrentProfile,
    getProfileById,
    syncProfile,
    getMyProfile,
    updateMyProfile,
    uploadProfileAvatar,
  };
})();
