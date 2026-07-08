/*
  KinoCampus - Create Post Diagnostics Controller (RC V8.2.2.0 / Lote 2)
  - Wraps KCAPI.createPost with detailed diagnostics for Supabase failures.
  - Keeps the existing flow untouched and only adds logs.
*/

(function () {
  'use strict';

  const LOG_TAG = '[RC-8220][L2][CreatePost]';
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
    } catch (_) { }
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

  function logSupabaseStageFailure(diagnostic, payloadSummary, result) {
    const stage = diagnostic && diagnostic.stage ? String(diagnostic.stage).toUpperCase() : 'UNKNOWN';

    if (stage === 'POST_INSERT') {
      console.error(LOG_TAG + ' Etapa INSERT em posts falhou.', {
        stage,
        payload: payloadSummary,
        diagnostic,
      });
      return;
    }

    if (stage === 'STORAGE_UPLOAD') {
      console.error(LOG_TAG + ' Etapa UPLOAD no Storage falhou.', {
        stage,
        bucket: payloadSummary.storageBucket,
        payload: payloadSummary,
        diagnostic,
      });
      return;
    }

    if (stage === 'POST_MEDIA_INSERT') {
      console.error(LOG_TAG + ' Etapa INSERT em post_media falhou.', {
        stage,
        payload: payloadSummary,
        diagnostic,
      });
      return;
    }

    if (stage === 'POST_FETCH') {
      console.error(LOG_TAG + ' Etapa leitura final do post falhou.', {
        stage,
        payload: payloadSummary,
        diagnostic,
      });
      return;
    }

    console.error(LOG_TAG + ' Falha no fluxo Supabase de createPost.', {
      stage,
      payload: payloadSummary,
      diagnostic,
      result: result || null,
    });
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
      const hasSuccess = !!(result && result.ok !== false && !result._kcError);
      if (hasSuccess) {
        if (isSupabase) {
          console.log(LOG_TAG + ' Publicacao concluida com sucesso.', summary);
        }
        try {
          if (window.KCEvents && typeof window.KCEvents.track === 'function') {
            var newPostId = (result && (result.id || result.uuid)) || null;
            var moduleKey = payload && payload.modulo ? String(payload.modulo) : null;
            window.KCEvents.track('kc_post_create', { post_id: newPostId, module: moduleKey });
          }
        } catch (_) {}
        return result;
      }

      if (isSupabase) {
        const diagnostic = safeGetLastCreatePostError();
        logSupabaseStageFailure(diagnostic, summary, result);
      } else {
        console.error(LOG_TAG + ' createPost retornou falha no modo local.', {
          payload: summary,
          result: result || null,
        });
      }

      return result;
    } catch (err) {
      if (isSupabase) {
        const diagnostic = safeGetLastCreatePostError();
        console.error(LOG_TAG + ' Excecao durante createPost (Supabase).', {
          payload: summary,
          error: err,
          diagnostic: diagnostic || null,
        });
      } else {
        console.error(LOG_TAG + ' Excecao durante createPost (local).', {
          payload: summary,
          error: err,
        });
      }
      throw err;
    }
  }

  function installWrapper() {
    if (!window.KCAPI || typeof window.KCAPI.createPost !== 'function') return false;
    if (window.KCAPI[WRAP_FLAG] === true) return true;

    const originalCreatePost = window.KCAPI.createPost.bind(window.KCAPI);
    window.KCActions = window.KCActions || {};
    window.KCActions.createPost = async function wrappedCreatePost(payload) {
      return createPostWithDiagnostics(originalCreatePost, payload);
    };

    try {
      Object.defineProperty(window.KCActions, WRAP_FLAG, {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
      });
    } catch (_) {
      window.KCActions[WRAP_FLAG] = true;
    }

    console.log(LOG_TAG + ' Wrapper de diagnostico instalado.');
    return true;
  }

  if (!installWrapper()) {
    document.addEventListener('DOMContentLoaded', installWrapper, { once: true });
  }
})();
