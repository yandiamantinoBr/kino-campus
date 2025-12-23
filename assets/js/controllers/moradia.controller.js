/* KinoCampus - moradia controller (V8.1.2.4.3) */
(function () {
  'use strict';

  const MODULE = 'moradia';
  const LIMIT = null;

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

      const params = MODULE ? { module: MODULE } : {};
      const posts = await window.KCAPI.getPosts(params);
      if (!Array.isArray(posts) || posts.length === 0) return;

      const slice = (Number.isFinite(LIMIT) && LIMIT > 0) ? posts.slice(0, LIMIT) : posts;

      const prepared = slice.map((raw) => {
        const p = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
          ? window.KCPostModel.from(raw, { module: MODULE })
          : raw;

        if (window.KCUtils && typeof window.KCUtils.applyPresentationRules === 'function') {
          window.KCUtils.applyPresentationRules(p, { module: MODULE, view: 'moradia' });
        }
        return p;
      });

      feed.innerHTML = prepared.map(window.KCUtils.renderPostCard).join('\n');

      setTimeout(reapplyFiltersAndSearch, 0);
      window.addEventListener('load', reapplyFiltersAndSearch, { once: true });
    } catch (e) {
      console.warn('[KinoCampus] Falha ao carregar feed dinâmico (moradia). Usando fallback estático.', e);
    }
  }



  document.addEventListener('DOMContentLoaded', function () {
    
    injectFeed();
  });
})();