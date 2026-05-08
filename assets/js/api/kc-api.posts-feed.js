/*
  KinoCampus - KCAPI Posts-Feed Module (v11.33.2)

  Sub-modulo do dominio posts-read-feed para a fachada KCAPI.
  Registrado em window._KCAPI.postsFeed e carregado antes de kc-api.client.js.

  Contrato preservado: os 8 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  fallback de searchPosts para getPosts quando o driver nao suporta busca
  nativa, e fallback de getFeedCursor para getPosts sem cursor.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver, // () => driver ativo
    ENV,             // { driver: 'local'|'supabase', ... }
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

  async function getPosts(params, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver) return [];
    return driver.getPosts(params || {});
  }

  async function searchPosts(params, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver) return [];
    if (typeof driver.searchPosts !== 'function') {
      const posts = await driver.getPosts(params || {});
      return Array.isArray(posts) ? posts : [];
    }
    const posts = await driver.searchPosts(params || {});
    return Array.isArray(posts) ? posts : [];
  }

  async function getFeedCursor(params, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver) return { posts: [], nextCursor: null, hasMore: false };
    if (typeof driver.getFeedCursor !== 'function') {
      const posts = await driver.getPosts(params || {});
      return {
        posts: Array.isArray(posts) ? posts : [],
        nextCursor: null,
        hasMore: false,
      };
    }
    return driver.getFeedCursor(params || {});
  }

  async function getPostById(id, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver) return null;
    return driver.getPostById(id);
  }

  async function getTopContributors(period, module, limit, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getTopContributors !== 'function') return [];
    return driver.getTopContributors(period, module, limit);
  }

  async function checkDuplicatePost(userId, module, title, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.checkDuplicatePost !== 'function') {
      return { ok: false, candidates: [] };
    }
    return driver.checkDuplicatePost(userId, module, title);
  }

  async function getMyPosts(params, deps) {
    const driver = getActiveDriverOrNull(deps);
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase' && driver && typeof driver.getMyPosts === 'function') {
      return driver.getMyPosts(params || {});
    }
    if (envDriver !== 'supabase' || !driver || typeof driver.getMyPosts !== 'function') {
      return [];
    }
    return driver.getMyPosts(params || {});
  }

  async function getPostsByAuthorId(authorId, params, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getPostsByAuthorId !== 'function') return [];
    return driver.getPostsByAuthorId(authorId, params || {});
  }

  /* v75.1: abas personalizadas para kc-feed-tabs (após o divider).
   * Chama o RPC kc_get_personalized_tabs(p_session_id, p_limit). Falha
   * silenciosa: se não houver driver Supabase ou ocorrer erro, retorna []
   * — o controller manterá os links estáticos do HTML como fallback. */
  async function getPersonalizedTabs(limit, deps) {
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase') return [];
    try {
      const sb = (window.KCSupabase && typeof window.KCSupabase.getClient === 'function')
        ? window.KCSupabase.getClient()
        : (window.supabase && typeof window.supabase.createClient === 'function' ? null : null);
      if (!sb) return [];

      // session_id anônimo: tenta obter do KCSession (mesmo wrapper usado em outras RPCs)
      let sessionId = null;
      try {
        if (window.KCSession && typeof window.KCSession.getAnonId === 'function') {
          sessionId = window.KCSession.getAnonId();
        } else if (window.localStorage) {
          sessionId = window.localStorage.getItem('kc_anon_session_id') || null;
        }
      } catch (_) { /* ignore */ }

      const { data, error } = await sb.rpc('kc_get_personalized_tabs', {
        p_session_id: sessionId,
        p_limit: Math.max(1, Math.min(Number(limit) || 8, 30)),
      });
      if (error) {
        if (typeof console !== 'undefined') console.warn('[KCAPI] getPersonalizedTabs:', error.message || error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[KCAPI] getPersonalizedTabs exception:', e && e.message || e);
      return [];
    }
  }

  window._KCAPI.postsFeed = {
    getPosts,
    searchPosts,
    getFeedCursor,
    getPostById,
    getTopContributors,
    checkDuplicatePost,
    getMyPosts,
    getPostsByAuthorId,
    getPersonalizedTabs,
  };
})();
