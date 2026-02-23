/*
  KinoCampus - Create Post Diagnostics Controller (RC V8.2.2.0 / Lote 2)
  - Wraps KCAPI.createPost with detailed diagnostics for Supabase failures.
  - Keeps the existing flow untouched and only adds logs.
*/

(function () {
  'use strict';

  const LOG_TAG = '[KC][CREATE_POST]';
  const WRAP_FLAG = '__kcCreatePostDiagnosticsWrapped';

  function summarizePayload(payload) {
    const p = (payload && typeof payload === 'object') ? payload : {};
    const title = String(p.titulo || p.title || '');
    const description = String(p.descricao || p.description || '');
    const images = Array.isArray(p.imagens) ? p.imagens : (Array.isArray(p.images) ? p.images : []);

    return {
      module: String(p.modulo || p.module || ''),
      category: String(p.categoria || p.category || ''),
      subcategory: String(p.subcategoria || p.subcategory || ''),
      titleLength: title.length,
      descriptionLength: description.length,
      imagesCount: images.length,
      storageBucket: (window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.supabase && window.KCAPI.ENV.supabase.storageBucket)
        ? String(window.KCAPI.ENV.supabase.storageBucket)
        : 'kino-media',
    };
  }

  function getDriverName() {
    try {
      if (window.KCAPI && window.KCAPI.activeDriver) return String(window.KCAPI.activeDriver);
      if (window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver) return String(window.KCAPI.ENV.driver);
    } catch (_) {}
    return 'local';
  }

  function safeGetLastCreatePostError() {
    try {
      if (window.KCAPI && typeof window.KCAPI.getLastCreatePostError === 'function') {
        return window.KCAPI.getLastCreatePostError();
      }
    } catch (err) {
      console.error(LOG_TAG + ' Falha ao ler getLastCreatePostError:', err);
    }
    return null;
  }

  function getDiagnosticStep(diagnostic) {
    const fromStep = diagnostic && diagnostic.step ? String(diagnostic.step).trim() : '';
    const fromStage = diagnostic && diagnostic.stage ? String(diagnostic.stage).trim() : '';
    return (fromStep || fromStage || 'UNKNOWN').toUpperCase();
  }

  async function createPostWithDiagnostics(originalCreatePost, payload) {
    const summary = summarizePayload(payload);
    const driver = getDriverName().toLowerCase();
    const isSupabase = driver === 'supabase';

    if (isSupabase) {
      console.log(LOG_TAG + ' Iniciando fluxo de publicacao (Supabase).', summary);
    }

    try {
      const result = await originalCreatePost(payload);
      const hasSuccess = !!(result && result.ok !== false);
      if (hasSuccess) {
        if (isSupabase) {
          console.log(LOG_TAG, { step: 'SUCCESS', error: null, data: summary });
        }
        return result;
      }

      if (isSupabase) {
        const diagnostic = safeGetLastCreatePostError();
        console.error(LOG_TAG, {
          step: getDiagnosticStep(diagnostic),
          error: diagnostic || result || { message: 'createPost retornou falha sem diagnóstico.' },
          data: summary,
        });
      } else {
        console.error(LOG_TAG, {
          step: 'LOCAL_CREATE_POST',
          error: result || { message: 'Falha no modo local.' },
          data: summary,
        });
      }

      return result;
    } catch (err) {
      if (isSupabase) {
        const diagnostic = safeGetLastCreatePostError();
        console.error(LOG_TAG, {
          step: getDiagnosticStep(diagnostic || { step: 'EXCEPTION' }),
          error: diagnostic || err,
          data: summary,
        });
      } else {
        console.error(LOG_TAG, {
          step: 'LOCAL_EXCEPTION',
          error: err,
          data: summary,
        });
      }
      throw err;
    }
  }

  function installWrapper() {
    if (!window.KCAPI || typeof window.KCAPI.createPost !== 'function') return false;
    if (window.KCAPI[WRAP_FLAG] === true) return true;

    const originalCreatePost = window.KCAPI.createPost.bind(window.KCAPI);
    window.KCAPI.createPost = async function wrappedCreatePost(payload) {
      return createPostWithDiagnostics(originalCreatePost, payload);
    };

    try {
      Object.defineProperty(window.KCAPI, WRAP_FLAG, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
      });
    } catch (_) {
      window.KCAPI[WRAP_FLAG] = true;
    }

    console.log(LOG_TAG, { step: 'WRAPPER_INSTALLED', error: null, data: null });
    return true;
  }

  if (!installWrapper()) {
    document.addEventListener('DOMContentLoaded', installWrapper, { once: true });
  }
})();
