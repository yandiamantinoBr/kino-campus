/**
 * kc-user-posts.js — v13.6.1
 * Extraído de kc-core.js (v13.6.1 split).
 * Expõe: window.kcUserPosts
 */
(function () {
  'use strict';

  // -----------------------------
  // User posts (create-post -> localStorage)
  // -----------------------------
  const KC_USER_POSTS_KEY = 'kc_user_posts';
  
  function kcLoadUserPosts() {
    try {
      const raw = localStorage.getItem(KC_USER_POSTS_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  
  function kcSaveUserPosts(posts) {
    localStorage.setItem(KC_USER_POSTS_KEY, JSON.stringify(posts));
  }
  
  function kcCreateUserPost(data) {
    const posts = kcLoadUserPosts();
    const id = `u_${Date.now().toString(36)}`;
  
    // Modelo (MVC): persistimos no contrato V7.x, mas sem quebrar legado.
    // V8.1.2.4.5: temporal clamp (Fevereiro/2026) para consistência do protótipo
    function _kcMonthIndexLocal(name) {
      const n = String(name || "").toLowerCase();
      const map = {
        january: 0, janeiro: 0,
        february: 1, fevereiro: 1,
        march: 2, marco: 2, março: 2,
        april: 3, abril: 3,
        may: 4, maio: 4,
        june: 5, junho: 5,
        july: 6, julho: 6,
        august: 7, agosto: 7,
        september: 8, setembro: 8,
        october: 9, outubro: 9,
        november: 10, novembro: 10,
        december: 11, dezembro: 11,
      };
      return (map[n] != null) ? map[n] : 1;
    }
  
    function _kcClampCreatedAtISO() {
      try {
        const clamp = (KC_ENV && KC_ENV.clamp) ? KC_ENV.clamp : null;
        if (clamp && typeof clamp.year === "number" && clamp.month) {
          const mi = _kcMonthIndexLocal(clamp.month);
          const base = Date.UTC(clamp.year, mi, 15, 14, 0, 0);
          const jitter = (Date.now() % 60000);
          return new Date(base - jitter).toISOString();
        }
      } catch (_) { }
      return new Date().toISOString();
    }
  
    const createdAt = _kcClampCreatedAtISO();
    const raw = {
      id,
      createdAt,
      timestamp: (data && (data.timestamp || data.createdAt)) ? (data.timestamp || data.createdAt) : 'Agora',
      authorId: (data && data.authorId) ? data.authorId : 'USER_SELF',
      // Legado: manter campos "autor" para compatibilidade com páginas antigas.
      autor: (data && (data.autor || data.author)) ? (data.autor || data.author) : 'Você',
      autorAvatar: (data && (data.autorAvatar || data.authorAvatar))
        ? (data.autorAvatar || data.authorAvatar)
        : (() => {
          try {
            if (KCAPI && typeof KCAPI.getAuthorById === 'function') {
              const u = KCAPI.getAuthorById('USER_SELF');
              return (u && (u.avatarUrl || u.avatar)) ? (u.avatarUrl || u.avatar) : '';
            }
          } catch (_) { }
          return '';
        })(),
      ...(data || {}),
    };
  
    // V8.1.2.4.5: normaliza chaves de categoria/subcategoria para filtros (tabs/checkboxes)
    try {
      const mk = String(raw.modulo || raw.module || '').toLowerCase();
      const meta = (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) ? raw.metadata : {};
      raw.metadata = meta;
  
      if (!raw.categoriaKey && raw.categoryKey) raw.categoriaKey = raw.categoryKey;
      if (!raw.categoryKey && raw.categoriaKey) raw.categoryKey = raw.categoriaKey;
      if (!raw.categoriaKey && meta.categoryKey) raw.categoriaKey = meta.categoryKey;
      if (!meta.categoryKey && raw.categoriaKey) meta.categoryKey = raw.categoriaKey;
  
      if (!raw.subcategoriaKey && raw.subcategoryKey) raw.subcategoriaKey = raw.subcategoryKey;
      if (!raw.subcategoryKey && raw.subcategoriaKey) raw.subcategoryKey = raw.subcategoriaKey;
      if (!raw.subcategoriaKey && meta.subcategoryKey) raw.subcategoriaKey = meta.subcategoryKey;
  
      const desiredSub = String(raw.subcategoriaKey || raw.subcategoryKey || meta.subcategory || '').trim();
      if (!meta.subcategory && desiredSub) meta.subcategory = desiredSub;
      if (!meta.subcategoryKey && desiredSub) meta.subcategoryKey = desiredSub;
  
      // Compra e Venda: tabs são por categoria (ex.: eletronicos), não pela ação (vendo/compro)
      if (mk === 'compra-venda') {
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
        const subk = String(raw.subcategoriaKey || '').toLowerCase();
        if (raw.categoriaKey && actionish.includes(subk)) {
          raw.subcategoriaKey = raw.categoriaKey;
          raw.subcategoryKey = raw.categoriaKey;
          meta.subcategory = raw.categoriaKey;
          meta.subcategoryKey = raw.categoriaKey;
        }
        if (raw.categoriaKey && !meta.subcategory) {
          meta.subcategory = raw.categoriaKey;
          meta.subcategoryKey = raw.categoriaKey;
        }
      }
    } catch (_) { }
  
    const normalized = (KCAPI && typeof KCAPI.normalizePost === 'function')
      ? KCAPI.normalizePost(raw)
      : raw;
  
    // Mantém createdAt para ordenação local futura (não interfere no card).
    const post = { ...normalized, createdAt };
  
    posts.unshift(post);
    kcSaveUserPosts(posts);
  
    // V7.1.2: pronto para backend (sem quebrar o modo estático)
    // Se existir KCAPI configurado, espelha o post no servidor.
    try {
      if (KCAPI && typeof KCAPI.isBackendEnabled === 'function' && KCAPI.isBackendEnabled()) {
        const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : KCAPI.createPost;
        if (typeof apiCreateFn === 'function') apiCreateFn(post);
      }
    } catch (_) { }
  
    return post;
  }
  
  function kcGetUserPostById(id) {
    const posts = kcLoadUserPosts();
    return posts.find(p => String(p.id) === String(id)) || null;
  }
  
  function kcGetModuloFilterForPage() {
    const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (page.includes('caronas')) return 'caronas';
    if (page.includes('achados-perdidos')) return 'achados-perdidos';
    if (page.includes('eventos')) return 'eventos';
    if (page.includes('moradia')) return 'moradia';
    if (page.includes('oportunidades')) return 'oportunidades';
    if (page.includes('compra-venda')) return 'compra-venda';
    // index / search / product: sem filtro
    return null;
  }
  
  function kcModuleLabel(modulo) {
    const m = String(modulo || '').toLowerCase();
    const map = {
      'compra-venda': 'Compra e Venda',
      'caronas': 'Caronas',
      'moradia': 'Moradia',
      'eventos': 'Eventos na UFG',
      'oportunidades': 'Oportunidades',
      'achados-perdidos': 'Achados/Perdidos',
      'livros': 'Livros'
    };
    return map[m] || (modulo || 'Publicação');
  }
  
  function kcModulePage(modulo) {
    const m = String(modulo || '').toLowerCase();
    const map = {
      'compra-venda': 'compra-venda-feed.html',
      'livros': 'compra-venda-feed.html?filter=livros',
      'caronas': 'caronas-feed.html',
      'oportunidades': 'oportunidades.html',
      'achados-perdidos': 'achados-perdidos.html',
      'eventos': 'eventos.html',
      'moradia': 'moradia.html'
    };
    return map[m] || 'index.html';
  }
  
  // Minimal card injection (works on pages with .kc-feed-list)
  // NOTE (V7.1.2): A View (HTML do card) fica centralizada em KCUtils.renderPostCard.
  function kcInjectUserPostsIntoFeed() {
    const feed = document.querySelector('.kc-feed-list');
    if (!feed) return;
  
    // Evita duplicação se já tiver sido injetado.
    if (feed.querySelector('[data-kc-user-post="true"]')) return;
  
    const filterModulo = kcGetModuloFilterForPage();
    const userPosts = kcLoadUserPosts()
      .filter(p => !filterModulo || String(p.modulo) === String(filterModulo))
      .slice(0, 20);
  
    if (!userPosts.length) return;
    if (!KCUtils || typeof KCUtils.renderPostCard !== 'function') return;
  
    const normalized = userPosts.map((p) => {
      const np = (KCAPI && typeof KCAPI.normalizePost === 'function')
        ? KCAPI.normalizePost(p)
        : (p || {});
      // Marca como post do usuário para evitar duplicação (e permitir estilo futuro).
      np._kcUserPost = true;
      if (!np.timestamp) np.timestamp = 'Agora';
      return np;
    });
  
    try {
      const html = normalized.map(KCUtils.renderPostCard).join('\n');
      feed.insertAdjacentHTML('afterbegin', html);
    } catch (e) {
      console.warn('[KinoCampus] Falha ao injetar posts do usuário no feed.', e);
    }
  }
  
  // Expose small API

  window.kcUserPosts = {
    create: kcCreateUserPost,
    getById: kcGetUserPostById,
    list: kcLoadUserPosts,
    inject: kcInjectUserPostsIntoFeed,
  };
})();