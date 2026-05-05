/*
  KinoCampus - KCAPI Posts-Write Module (v11.33.3)

  Sub-modulo do dominio posts-write para a fachada KCAPI.
  Registrado em window._KCAPI.postsWrite e carregado antes de kc-api.client.js.

  Contrato preservado: os 8 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  o gate enforceSupabaseOnProduction para createPost e os guards de
  indisponibilidade de driver para os demais metodos de mutacao.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver, // () => driver ativo
    ENV,             // { driver, isProduction, ... }
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

  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function enforceSupabaseOnProduction(operationName, deps) {
    const env = (deps && deps.ENV && typeof deps.ENV === 'object') ? deps.ENV : {};
    if (!env.isProduction) return null;
    if (env.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
  }

  // ── Métodos públicos ───────────────────────────────────────────

  async function createPost(body, deps) {
    const policyError = enforceSupabaseOnProduction('createPost', deps);
    if (policyError) return policyError;
    const driver = getActiveDriverOrNull(deps);
    if (!driver) return kcApiError('Driver indisponível para createPost.');
    return driver.createPost(body);
  }

  async function updatePost(postId, payload, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || !driver.updatePost) return kcApiError('Edição indisponível neste driver.');
    return driver.updatePost(postId, payload);
  }

  async function deletePost(postId, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || !driver.deletePost) return kcApiError('Exclusão indisponível neste driver.');
    return driver.deletePost(postId);
  }

  async function reportPost(postId, payload, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || !driver.reportPost) {
      return { ok: false, error: { message: 'Denúncias indisponíveis neste driver.' } };
    }
    return driver.reportPost(postId, payload);
  }

  async function togglePostStatus(postId, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.togglePostStatus !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Toggle de status indisponível neste driver.' };
    }
    return driver.togglePostStatus(postId);
  }

  async function renewPost(postId, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.renewPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Renovação indisponível neste driver.' };
    }
    return driver.renewPost(postId);
  }

  async function bumpPost(postId, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.bumpPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Impulsionamento indisponível neste driver.' };
    }
    return driver.bumpPost(postId);
  }

  async function closePost(postId, payload, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.closePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Encerramento indisponivel neste driver.' };
    }
    return driver.closePost(postId, payload || {});
  }

  window._KCAPI.postsWrite = {
    createPost,
    updatePost,
    deletePost,
    reportPost,
    togglePostStatus,
    renewPost,
    bumpPost,
    closePost,
  };
})();
