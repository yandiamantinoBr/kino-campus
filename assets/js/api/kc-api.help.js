/*
  KinoCampus - KCAPI Help/Invites Module (v11.32.4)

  Sub-modulo do dominio help-requests e invites para a fachada KCAPI.
  Registrado em window._KCAPI.help e carregado antes de kc-api.client.js.

  Contrato preservado: as funcoes abaixo mantem exatamente a mesma
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

  async function recoverPrivacyHelpRequest(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.recoverPrivacyHelpRequest !== 'function') {
      return {
        ok: false,
        error: {
          code: 'BACKEND_REQUIRED',
          message: 'Recuperação de pedidos indisponível neste driver.',
          idempotency: {
            safe_to_replace: false,
            response_confirmed: false,
          },
        },
      };
    }
    return driver.recoverPrivacyHelpRequest(payload);
  }

  async function listAdminHelpRequests(filters = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.listAdminHelpRequests !== 'function') {
      return {
        ok: false,
        error: { message: 'Triagem de ajuda indisponível neste driver.' },
        rows: [],
        totalCount: 0,
        hasMore: false,
      };
    }
    return driver.listAdminHelpRequests(filters);
  }

  async function updateAdminHelpRequest(id, patch = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.updateAdminHelpRequest !== 'function') {
      return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };
    }
    return driver.updateAdminHelpRequest(id, patch);
  }

  async function processAccountErasure(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.processAccountErasure !== 'function') {
      return { ok: false, error: { message: 'Fluxo LGPD indisponivel neste driver.' } };
    }
    return driver.processAccountErasure(payload);
  }

  async function createDataSubjectRequest(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.createDataSubjectRequest !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'BACKEND_REQUIRED', message: 'Solicita\u00E7\u00F5es de dados exigem uma conta conectada.' },
      };
    }
    return driver.createDataSubjectRequest(payload);
  }

  async function listDataSubjectRequests(options = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.listDataSubjectRequests !== 'function') {
      return {
        ok: false,
        data: { items: [], total: 0 },
        error: { code: 'BACKEND_REQUIRED', message: 'Hist\u00F3rico de solicita\u00E7\u00F5es indispon\u00EDvel.' },
      };
    }
    return driver.listDataSubjectRequests(options);
  }

  async function getDataSubjectRequest(protocol, options = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getDataSubjectRequest !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'BACKEND_REQUIRED', message: 'Consulta de protocolo indispon\u00EDvel.' },
      };
    }
    return driver.getDataSubjectRequest(protocol, options);
  }

  async function downloadDataSubjectExport(protocol, options = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.downloadDataSubjectExport !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'BACKEND_REQUIRED', message: 'Download de dados exige uma conta conectada.' },
      };
    }
    return driver.downloadDataSubjectExport(protocol, options);
  }

  async function downloadDataSubjectSupplement(protocol, artifactRef, options = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.downloadDataSubjectSupplement !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'BACKEND_REQUIRED', message: 'Complemento integral exige uma conta conectada.' },
      };
    }
    return driver.downloadDataSubjectSupplement(protocol, artifactRef, options);
  }

  async function cancelDataSubjectRequest(protocol, options = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.cancelDataSubjectRequest !== 'function') {
      return {
        ok: false,
        data: null,
        error: { code: 'BACKEND_REQUIRED', message: 'Cancelamento de solicita\u00E7\u00E3o indispon\u00EDvel.' },
      };
    }
    return driver.cancelDataSubjectRequest(protocol, options);
  }

  async function processDataExportSupplement(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.processDataExportSupplement !== 'function') {
      return {
        ok: false,
        error: { code: 'BACKEND_REQUIRED', message: 'Administração do suplemento indisponível.' },
      };
    }
    return driver.processDataExportSupplement(payload);
  }

  async function listExternalAccessRequests(filters = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (driver && typeof driver.listExternalAccessRequests === 'function') {
      return driver.listExternalAccessRequests(filters);
    }
    return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' }, items: [], total: 0 };
  }

  async function decideExternalAccessRequest(payload = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (driver && typeof driver.decideExternalAccessRequest === 'function') {
      return driver.decideExternalAccessRequest(payload);
    }
    return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' } };
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
    recoverPrivacyHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
    processAccountErasure,
    createDataSubjectRequest,
    listDataSubjectRequests,
    getDataSubjectRequest,
    downloadDataSubjectExport,
    downloadDataSubjectSupplement,
    cancelDataSubjectRequest,
    processDataExportSupplement,
    listExternalAccessRequests,
    decideExternalAccessRequest,
    inviteExternalUser,
    getInvites,
    revokeInvite,
  };
})();
