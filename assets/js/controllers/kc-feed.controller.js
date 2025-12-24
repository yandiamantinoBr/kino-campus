/*
  KinoCampus - Feed Controller Helper (V8.1.2.4.4)
  - Utilitário para páginas de feed (MVC: Controller)
  - Preserva fallback estático (HTML) se a API falhar
  - Reaplica filtros/busca após injeção dinâmica
*/

(function () {
  'use strict';

  function warn(msg, err) {
    try { console.warn(msg, err || ''); } catch (_) {}
  }

  function getCtx(options) {
    return (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  }

  async function injectFeed(options) {
    const opt = getCtx(options);
    const containerSelector = opt.containerSelector || '.kc-feed-list';
    const moduleOpt = opt.module || '';
    const moduleKeys = Array.isArray(moduleOpt) ? moduleOpt.filter(Boolean) : (moduleOpt ? [moduleOpt] : []);

    const container = document.querySelector(containerSelector);
    if (!container) return;

    // fallback estático
    const fallbackHTML = container.innerHTML;

    if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') {
      warn('[KCControllers] KCAPI.getPosts não disponível; mantendo fallback estático.');
      return;
    }

    if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') {
      warn('[KCControllers] KCUtils.renderPostCard não disponível; mantendo fallback estático.');
      return;
    }

    try {
      let dbPosts = [];
      if (moduleKeys.length === 0) {
        dbPosts = await window.KCAPI.getPosts();
      } else if (moduleKeys.length === 1) {
        dbPosts = await window.KCAPI.getPosts({ module: moduleKeys[0] });
      } else {
        for (const mk of moduleKeys) {
          try {
            const part = await window.KCAPI.getPosts({ module: mk });
            if (Array.isArray(part) && part.length) dbPosts.push(...part);
          } catch (_) {}
        }
      }

      // User posts (localStorage) - mantém offline-first e evita regressão do create-post
      let userRaw = [];
      try {
        if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
          userRaw = window.kcUserPosts.list();
        }
      } catch (_) {}

      // Filtrar user posts pelos módulos deste feed (quando aplicável)
      if (Array.isArray(userRaw) && userRaw.length && moduleKeys.length) {
        const set = new Set(moduleKeys.map(String));
        userRaw = userRaw.filter((p) => set.has(String(p && p.modulo)));
      }

      const posts = [
        ...(Array.isArray(userRaw) ? userRaw.map((p) => ({ ...(p || {}), _kcUserPost: true })) : []),
        ...(Array.isArray(dbPosts) ? dbPosts : [])
      ];

      if (!Array.isArray(posts) || posts.length === 0) return;

      const pageModule = opt.pageModule || (moduleKeys.length === 1 ? moduleKeys[0] : '') || '';
      const ctx = { pageModule };

      // Deduplicar por id (user posts podem colidir em protótipos)
      const seen = new Set();
      const normalized = [];
      for (const raw of posts) {
        const p = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(raw, ctx)
          : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : (raw || {}));

        const id = (p && p.id != null) ? String(p.id) : '';
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        normalized.push(p);
      }

      const html = normalized.map((p) => window.KCUtils.renderPostCard(p, ctx)).join('');
      if (!html.trim()) return;

      container.innerHTML = html;

      // Reaplicar filtros (tabs) e busca (input) quando existirem
      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      } else if (typeof window.filterPosts === 'function') {
        window.filterPosts();
      }

      // Callback opcional (ex: calendar rebind, etc)
      if (typeof opt.onAfterInject === 'function') {
        try { opt.onAfterInject({ container, posts: normalized }); } catch (_) {}
      }

    } catch (err) {
      // Mantém fallback estático
      container.innerHTML = fallbackHTML;
      warn('[KCControllers] Falha ao injetar feed dinâmico; mantendo fallback estático.', err);
    }
  }

  window.KCControllers = Object.freeze({
    injectFeed,
  });
})();
