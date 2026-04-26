/*
  KinoCampus - KCAPI Saved/Highlights Module (v11.32.3)

  Sub-modulo do dominio saved/highlights para a fachada KCAPI.
  Registrado em window._KCAPI.saved e carregado antes de kc-api.client.js.

  Contrato preservado: as 7 funcoes abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js (ENV.driver
  local vs. supabase, fallbacks e invalidacao do cache de analytics).
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  function getActiveDriverOrNull(deps) {
    if (!deps || typeof deps.getActiveDriver !== 'function') return null;
    try {
      return deps.getActiveDriver();
    } catch (_) {
      return null;
    }
  }

  function getEnv(deps) {
    if (deps && deps.ENV && typeof deps.ENV === 'object') return deps.ENV;
    return null;
  }

  function invalidateAnalytics(deps, postId) {
    if (!deps || typeof deps.invalidatePostAnalyticsCache !== 'function') return;
    try {
      deps.invalidatePostAnalyticsCache(postId);
    } catch (_) { /* no-op */ }
  }

  async function getSavedPostState(postId, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return { kinds: [] };
    if (ENV.driver !== 'supabase' && driver && typeof driver.getSavedPostState === 'function') return driver.getSavedPostState(postId);
    if (ENV.driver !== 'supabase' || !driver || typeof driver.getSavedPostState !== 'function') return { kinds: [] };
    return driver.getSavedPostState(postId);
  }

  async function setSavedPostState(postId, kind, enabled, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    if (ENV.driver !== 'supabase' && driver && typeof driver.setSavedPostState === 'function') {
      return driver.setSavedPostState(postId, kind, enabled);
    }
    if (ENV.driver !== 'supabase' || !driver || typeof driver.setSavedPostState !== 'function') {
      return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    }
    const result = await driver.setSavedPostState(postId, kind, enabled);
    if (result && result.ok) invalidateAnalytics(deps, postId);
    return result;
  }

  async function clearSavedPostState(postId, kind, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    if (ENV.driver !== 'supabase' && driver && typeof driver.clearSavedPostState === 'function') {
      return driver.clearSavedPostState(postId, kind);
    }
    if (ENV.driver !== 'supabase' || !driver || typeof driver.clearSavedPostState !== 'function') {
      return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    }
    const result = await driver.clearSavedPostState(postId, kind);
    if (result && result.ok) invalidateAnalytics(deps, postId);
    return result;
  }

  async function getMySavedPosts(params = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return [];
    if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPosts === 'function') return driver.getMySavedPosts(params);
    if (ENV.driver !== 'supabase' || !driver || typeof driver.getMySavedPosts !== 'function') return [];
    return driver.getMySavedPosts(params);
  }

  async function getMySavedPostsCount(params = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return 0;
    if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPostsCount === 'function') return driver.getMySavedPostsCount(params);
    if (ENV.driver !== 'supabase' || !driver || typeof driver.getMySavedPostsCount !== 'function') return 0;
    return driver.getMySavedPostsCount(params);
  }

  async function getProfileHighlights(profileId, params = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return [];
    if (ENV.driver !== 'supabase' && driver && typeof driver.getProfileHighlights === 'function') {
      return driver.getProfileHighlights(profileId, params);
    }
    if (ENV.driver !== 'supabase' || !driver || typeof driver.getProfileHighlights !== 'function') return [];
    return driver.getProfileHighlights(profileId, params);
  }

  async function getProfileHighlightsCount(profileId, params = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    const ENV = getEnv(deps);
    if (!ENV) return 0;
    if (ENV.driver !== 'supabase' && driver && typeof driver.getProfileHighlightsCount === 'function') {
      return driver.getProfileHighlightsCount(profileId, params);
    }
    if (ENV.driver !== 'supabase' || !driver || typeof driver.getProfileHighlightsCount !== 'function') return 0;
    return driver.getProfileHighlightsCount(profileId, params);
  }

  window._KCAPI.saved = {
    getSavedPostState,
    setSavedPostState,
    clearSavedPostState,
    getMySavedPosts,
    getMySavedPostsCount,
    getProfileHighlights,
    getProfileHighlightsCount,
  };
})();
