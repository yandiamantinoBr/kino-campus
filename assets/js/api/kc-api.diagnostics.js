/*
  KinoCampus - KCAPI Diagnostics (V8.6.1)

  Objetivo:
  - Centralizar diagnosticos publicos de create-post fora da fachada KCAPI.
  - Preservar o contrato exposto por window.KCAPI e pelos aliases globais.

  Exposicao:
  - window._KCAPI.diagnostics
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  let lastCreatePostError = null;

  function normalizeErrorForDiagnostics(err) {
    if (!err) {
      return {
        message: 'Erro desconhecido.',
        code: 'UNKNOWN',
        details: null,
        hint: null,
      };
    }

    if (typeof err === 'string') {
      return {
        message: err,
        code: 'ERROR_STRING',
        details: null,
        hint: null,
      };
    }

    const message = String(err.message || err.msg || 'Erro desconhecido.');
    const code = (err.code != null && String(err.code).trim()) ? String(err.code).trim() : 'UNKNOWN';
    const details = (err.details != null) ? err.details : null;
    const hint = (err.hint != null) ? err.hint : null;

    return { message, code, details, hint };
  }

  function summarizeCreatePayloadForDiagnostics(parsed) {
    const p = (parsed && typeof parsed === 'object') ? parsed : {};
    return {
      moduleDB: p.moduleDB || '',
      categoryDB: p.categoryDB || '',
      subcategoryDB: p.subcategoryDB || '',
      titleLength: String(p.title || '').length,
      descriptionLength: String(p.description || '').length,
      imagesCount: Array.isArray(p.images) ? p.images.length : 0,
    };
  }

  function setLastCreatePostError(stage, err, context) {
    const normalized = normalizeErrorForDiagnostics(err);
    const payload = {
      stage: String(stage || 'EXCEPTION'),
      message: normalized.message,
      code: normalized.code,
      details: normalized.details,
      hint: normalized.hint,
      context: (context && typeof context === 'object') ? context : null,
      at: new Date().toISOString(),
    };

    lastCreatePostError = Object.freeze(payload);
    console.error('[KCAPI][Supabase] createPost falhou:', lastCreatePostError);
    return lastCreatePostError;
  }

  function clearLastCreatePostError() {
    lastCreatePostError = null;
  }

  function getLastCreatePostError() {
    return lastCreatePostError ? { ...lastCreatePostError } : null;
  }

  window._KCAPI.diagnostics = Object.freeze({
    normalizeErrorForDiagnostics,
    summarizeCreatePayloadForDiagnostics,
    setLastCreatePostError,
    clearLastCreatePostError,
    getLastCreatePostError,
  });
}());
