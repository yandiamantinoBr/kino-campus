/*
  KinoCampus - KCAPI Help/Invites Module (v11.32.4)

  Sub-modulo do dominio help-requests e invites para a fachada KCAPI.
  Registrado em window._KCAPI.help e carregado antes de kc-api.client.js.

  Contrato preservado: as 6 funcoes abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  fallbacks de indisponibilidade por driver.
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

  async function createHelpRequest(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.createHelpRequest !== 'function') {
      return { ok: false, error: { message: 'Pedidos de ajuda indisponíveis neste driver.' } };
    }
    return driver.createHelpRequest(payload);
  }

  async function listAdminHelpRequests(filters = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.listAdminHelpRequests !== 'function') return [];
    return driver.listAdminHelpRequests(filters);
  }

  async function updateAdminHelpRequest(id, patch = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.updateAdminHelpRequest !== 'function') {
      return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };
    }
    return driver.updateAdminHelpRequest(id, patch);
  }

  async function inviteExternalUser(email, note, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.inviteExternalUser !== 'function') {
      return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
    }
    return driver.inviteExternalUser(email, note);
  }

  async function getInvites(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getInvites !== 'function') return { data: [], error: null };
    return driver.getInvites();
  }

  async function revokeInvite(email, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.revokeInvite !== 'function') {
      return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
    }
    return driver.revokeInvite(email);
  }

  window._KCAPI.help = {
    createHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
    inviteExternalUser,
    getInvites,
    revokeInvite,
  };
})();
