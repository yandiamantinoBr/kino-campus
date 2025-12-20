/*
  KinoCampus - API Client (V6.0.0)

  Principal função:
  - Definir um ponto único para integração futura com Backend (REST/GraphQL)
  - Manter fallback para modo estático (assets/data/database.json)

  Exposição:
  - window.KCAPI
*/

(function () {
  'use strict';

  const DEFAULTS = {
    // Backend poderá servir /api/v1
    baseURL: '',
    fallbackDatabaseURL: 'assets/data/database.json',
    timeoutMs: 10000,
  };

  const cfg = { ...DEFAULTS };

  function setConfig(partial) {
    if (!partial) return;
    if (typeof partial.baseURL === 'string') cfg.baseURL = partial.baseURL;
    if (typeof partial.fallbackDatabaseURL === 'string') cfg.fallbackDatabaseURL = partial.fallbackDatabaseURL;
    if (Number.isFinite(partial.timeoutMs)) cfg.timeoutMs = partial.timeoutMs;
  }

  function withTimeout(promise, ms) {
    if (!ms || ms <= 0) return promise;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('KCAPI_TIMEOUT')), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  async function fetchJSON(url, options = {}) {
    const res = await withTimeout(fetch(url, options), cfg.timeoutMs);
    if (!res.ok) throw new Error('KCAPI_HTTP_' + res.status);
    return res.json();
  }

  function apiURL(path) {
    const base = (cfg.baseURL || '').replace(/\/$/, '');
    const p = String(path || '').replace(/^\//, '');
    return base ? (base + '/' + p) : ('/' + p).replace(/^\//, p); // se base vazio, deixa relativo
  }

  // ---------- Modo estático (fallback) ----------
  async function getDatabase() {
    return fetchJSON(cfg.fallbackDatabaseURL);
  }

  // ---------- Endpoints sugeridos (futuro backend) ----------
  // GET /api/v1/posts?module=...&q=...
  async function getPosts(params = {}) {
    // Se você já tiver um backend rodando, basta configurar baseURL:
    // KCAPI.setConfig({ baseURL: '/api/v1' })
    if (!cfg.baseURL) {
      // fallback: base estático
      const db = await getDatabase();
      return Array.isArray(db.anuncios) ? db.anuncios : [];
    }

    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v == null || v === '') return;
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('posts?' + q.toString()));
  }

  // POST /api/v1/posts
  async function createPost(body) {
    if (!cfg.baseURL) {
      // fallback: simula persistência local (para protótipo)
      const key = 'kc_user_posts';
      const existing = (() => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
      })();
      const next = { ...(body || {}), id: Date.now() };
      existing.unshift(next);
      try { localStorage.setItem(key, JSON.stringify(existing)); } catch (_) {}
      return next;
    }

    return fetchJSON(apiURL('posts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  function isBackendEnabled() { return !!cfg.baseURL; }

  window.KCAPI = {
    setConfig,
    fetchJSON,
    getDatabase,
    getPosts,
    createPost,
    isBackendEnabled,
  };
})();
