/* KinoCampus - oportunidades controller (V8.1.2.4.5) */
(function () {
  'use strict';

  const MODULE = 'oportunidades';
  const PAGE = 1;
  const POSTS_LIMIT = 12;

  function reapplyFiltersAndSearch() {
    try {
      const input = document.getElementById('searchInput');
      const q = input && input.value ? String(input.value) : '';

      if (typeof window.filterPosts === 'function') {
        if (q) window.filterPosts(q); else window.filterPosts();
        return;
      }

      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      }
    } catch (_) {}
  }

  async function injectFeed() {
    try {
      if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return;
      if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') return;

      const feed = document.querySelector('.kc-feed-list');
      if (!feed) return;

      const params = MODULE ? { module: MODULE, page: PAGE, limit: POSTS_LIMIT } : { page: PAGE, limit: POSTS_LIMIT };
      try { console.debug(`[KCFeed:oportunidades] Carregando página ${PAGE} (${POSTS_LIMIT} posts)`); } catch (_) {}
      const posts = await window.KCAPI.getPosts(params);
      if (!Array.isArray(posts) || posts.length === 0) return;

      const prepared = posts.map((raw) => {
        const p = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(raw, { module: MODULE })
          : raw;

        return p;
      });

      feed.innerHTML = prepared.map(window.KCUtils.renderPostCard).join('\n');

      setTimeout(reapplyFiltersAndSearch, 0);
      window.addEventListener('load', reapplyFiltersAndSearch, { once: true });
    } catch (e) {
      console.warn('[KinoCampus] Falha ao carregar feed dinâmico (oportunidades). Usando fallback estático.', e);
    }
  }



  document.addEventListener('DOMContentLoaded', function () {
    
    injectFeed();
  });
})();