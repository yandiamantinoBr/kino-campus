/*
  KinoCampus - API Client (V7.1.2)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Normalizar usuários (MOCK_USERS) e posts (contrato padrão com authorId).
  - Manter compatibilidade com modo estático (assets/data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/

(function () {
  'use strict';

  const VERSION = '7.1.2';

  const DEFAULTS = {
    // Backend poderá servir /api/v1
    baseURL: '',
    // Mantém compatibilidade: projeto possui 2 caminhos para o mesmo arquivo.
    fallbackDatabaseURLs: ['assets/data/database.json', 'data/database.json'],
    timeoutMs: 10000,
  };

  const cfg = { ...DEFAULTS };

  /**
   * MOCK_USERS (extraído do database.json da V6.1.0)
   * - IDs estáveis (USER_01..USER_42) para preparar o futuro backend.
   * - USER_SELF é um perfil local para posts criados pelo usuário.
   */
  const MOCK_USERS = Object.freeze({
    'USER_01': { id: 'USER_01', displayName: 'Rafael Almeida', avatarUrl: 'https://i.pravatar.cc/150?img=12' }, // USER_01: Rafael Almeida (img=12)
    'USER_02': { id: 'USER_02', displayName: 'Fernanda Lima', avatarUrl: 'https://i.pravatar.cc/150?img=35' }, // USER_02: Fernanda Lima (img=35)
    'USER_03': { id: 'USER_03', displayName: 'Ricardo Souza', avatarUrl: 'https://i.pravatar.cc/150?img=28' }, // USER_03: Ricardo Souza (img=28)
    'USER_04': { id: 'USER_04', displayName: 'Camila Rodrigues', avatarUrl: 'https://i.pravatar.cc/150?img=42' }, // USER_04: Camila Rodrigues (img=42)
    'USER_05': { id: 'USER_05', displayName: 'Beatriz Santos', avatarUrl: 'https://i.pravatar.cc/150?img=48' }, // USER_05: Beatriz Santos (img=48)
    'USER_06': { id: 'USER_06', displayName: 'Thiago Alves', avatarUrl: 'https://i.pravatar.cc/150?img=52' }, // USER_06: Thiago Alves (img=52)
    'USER_07': { id: 'USER_07', displayName: 'Gabriela Mendes', avatarUrl: 'https://i.pravatar.cc/150?img=60' }, // USER_07: Gabriela Mendes (img=60)
    'USER_08': { id: 'USER_08', displayName: 'Felipe Costa', avatarUrl: 'https://i.pravatar.cc/150?img=65' }, // USER_08: Felipe Costa (img=65)
    'USER_09': { id: 'USER_09', displayName: 'Maria Souza', avatarUrl: 'https://i.pravatar.cc/150?img=25' }, // USER_09: Maria Souza (img=25)
    'USER_10': { id: 'USER_10', displayName: 'João Pedro', avatarUrl: 'https://i.pravatar.cc/150?img=33' }, // USER_10: João Pedro (img=33)
    'USER_11': { id: 'USER_11', displayName: 'Carlos Silva', avatarUrl: 'https://i.pravatar.cc/150?img=15' }, // USER_11: Carlos Silva (img=15)
    'USER_12': { id: 'USER_12', displayName: 'Ana Paula', avatarUrl: 'https://i.pravatar.cc/150?img=20' }, // USER_12: Ana Paula (img=20)
    'USER_13': { id: 'USER_13', displayName: 'TechCorp RH', avatarUrl: 'https://i.pravatar.cc/150?img=50' }, // USER_13: TechCorp RH (img=50)
    'USER_14': { id: 'USER_14', displayName: 'Startup XYZ', avatarUrl: 'https://i.pravatar.cc/150?img=55' }, // USER_14: Startup XYZ (img=55)
    'USER_15': { id: 'USER_15', displayName: 'Lucas Mendes', avatarUrl: 'https://i.pravatar.cc/150?img=22' }, // USER_15: Lucas Mendes (img=22)
    'USER_16': { id: 'USER_16', displayName: 'Mariana Costa', avatarUrl: 'https://i.pravatar.cc/150?img=30' }, // USER_16: Mariana Costa (img=30)
    'USER_17': { id: 'USER_17', displayName: 'UFG Eventos', avatarUrl: 'https://i.pravatar.cc/150?img=45' }, // USER_17: UFG Eventos (img=45)
    'USER_18': { id: 'USER_18', displayName: 'Pedro Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=40' }, // USER_18: Pedro Henrique (img=40)
    'USER_19': { id: 'USER_19', displayName: 'Carlos Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=13' }, // USER_19: Carlos Henrique (img=13)
    'USER_20': { id: 'USER_20', displayName: 'Mariana Costa', avatarUrl: 'https://i.pravatar.cc/150?img=25' }, // USER_20: Mariana Costa (img=25)
    'USER_21': { id: 'USER_21', displayName: 'Rafael Santos', avatarUrl: 'https://i.pravatar.cc/150?img=40' }, // USER_21: Rafael Santos (img=40)
    'USER_22': { id: 'USER_22', displayName: 'Juliana Oliveira', avatarUrl: 'https://i.pravatar.cc/150?img=45' }, // USER_22: Juliana Oliveira (img=45)
    'USER_23': { id: 'USER_23', displayName: 'Pedro Almeida', avatarUrl: 'https://i.pravatar.cc/150?img=50' }, // USER_23: Pedro Almeida (img=50)
    'USER_24': { id: 'USER_24', displayName: 'Amanda Silva', avatarUrl: 'https://i.pravatar.cc/150?img=55' }, // USER_24: Amanda Silva (img=55)
    'USER_25': { id: 'USER_25', displayName: 'Fernando Santos', avatarUrl: 'https://i.pravatar.cc/150?img=35' }, // USER_25: Fernando Santos (img=35)
    'USER_26': { id: 'USER_26', displayName: 'Beatriz Lima', avatarUrl: 'https://i.pravatar.cc/150?img=36' }, // USER_26: Beatriz Lima (img=36)
    'USER_27': { id: 'USER_27', displayName: 'Roberto Oliveira', avatarUrl: 'https://i.pravatar.cc/150?img=37' }, // USER_27: Roberto Oliveira (img=37)
    'USER_28': { id: 'USER_28', displayName: 'Amanda Rodrigues', avatarUrl: 'https://i.pravatar.cc/150?img=38' }, // USER_28: Amanda Rodrigues (img=38)
    'USER_29': { id: 'USER_29', displayName: 'CA Ciências Ambientais', avatarUrl: 'https://i.pravatar.cc/150?img=14' }, // USER_29: CA Ciências Ambientais (img=14)
    'USER_30': { id: 'USER_30', displayName: 'Instituto de Informática', avatarUrl: 'https://i.pravatar.cc/150?img=15' }, // USER_30: Instituto de Informática (img=15)
    'USER_31': { id: 'USER_31', displayName: 'Pró-Reitoria de Extensão', avatarUrl: 'https://i.pravatar.cc/150?img=16' }, // USER_31: Pró-Reitoria de Extensão (img=16)
    'USER_32': { id: 'USER_32', displayName: 'Atlética UFG', avatarUrl: 'https://i.pravatar.cc/150?img=17' }, // USER_32: Atlética UFG (img=17)
    'USER_33': { id: 'USER_33', displayName: 'DCE UFG', avatarUrl: 'https://i.pravatar.cc/150?img=18' }, // USER_33: DCE UFG (img=18)
    'USER_34': { id: 'USER_34', displayName: 'Maria Silva', avatarUrl: 'https://i.pravatar.cc/150?img=26' }, // USER_34: Maria Silva (img=26)
    'USER_35': { id: 'USER_35', displayName: 'Pedro Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=27' }, // USER_35: Pedro Henrique (img=27)
    'USER_36': { id: 'USER_36', displayName: 'Júlia Martins', avatarUrl: 'https://i.pravatar.cc/150?img=28' }, // USER_36: Júlia Martins (img=28)
    'USER_37': { id: 'USER_37', displayName: 'TechStart Soluções', avatarUrl: 'https://i.pravatar.cc/150?img=30' }, // USER_37: TechStart Soluções (img=30)
    'USER_38': { id: 'USER_38', displayName: 'Digital Marketing Agency', avatarUrl: 'https://i.pravatar.cc/150?img=31' }, // USER_38: Digital Marketing Agency (img=31)
    'USER_39': { id: 'USER_39', displayName: 'Lucas Ferreira', avatarUrl: 'https://i.pravatar.cc/150?img=32' }, // USER_39: Lucas Ferreira (img=32)
    'USER_40': { id: 'USER_40', displayName: 'Instituto de Matemática - UFG', avatarUrl: 'https://i.pravatar.cc/150?img=33' }, // USER_40: Instituto de Matemática - UFG (img=33)
    'USER_41': { id: 'USER_41', displayName: 'ONG Educação para Todos', avatarUrl: 'https://i.pravatar.cc/150?img=34' }, // USER_41: ONG Educação para Todos (img=34)
    'USER_42': { id: 'USER_42', displayName: 'Maria Souza', avatarUrl: 'https://i.pravatar.cc/150?img=16' }, // USER_42: Maria Souza (img=16)

    // Perfil do próprio usuário (posts criados via modal / localStorage)
    'USER_SELF': { id: 'USER_SELF', displayName: 'Você', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce' },
  });

  const MOCK_USERS_LIST = Object.freeze(Object.values(MOCK_USERS));
  const MOCK_USERS_BY_ID = Object.freeze(MOCK_USERS_LIST.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {}));

  // Índice auxiliar (legado) para resolver authorId a partir de autor + avatar.
  const LEGACY_AUTHOR_INDEX = (() => {
    const idx = Object.create(null);
    MOCK_USERS_LIST.forEach((u) => {
      // chave "nome::avatar" (mais segura)
      idx[`${u.displayName}::${u.avatarUrl}`] = u.id;
      // fallback: só nome (caso algum lugar não tenha avatar)
      if (!idx[u.displayName]) idx[u.displayName] = u.id;
    });
    return Object.freeze(idx);
  })();

  function setConfig(partial) {
    if (!partial) return;
    if (typeof partial.baseURL === 'string') cfg.baseURL = partial.baseURL;
    if (Array.isArray(partial.fallbackDatabaseURLs)) cfg.fallbackDatabaseURLs = partial.fallbackDatabaseURLs.filter(Boolean);
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
    return base ? (base + '/' + p) : p; // relativo quando baseURL vazio
  }

  // ---------- Normalização: USERS ----------
  // Compatibilidade: internamente o MOCK_USERS usa {displayName, avatarUrl} (legado).
  // Para o frontend, expomos também {name, avatar} para padronização do contrato.
  function normalizeUserProfile(u) {
    if (!u) return null;
    const name = u.name || u.displayName || '';
    const avatar = u.avatar || u.avatarUrl || '';
    return Object.freeze({
      id: u.id,
      // novo (preferencial)
      name,
      avatar,
      // legado (mantido)
      displayName: name,
      avatarUrl: avatar,
    });
  }

  function getAuthorById(id) {
    return normalizeUserProfile(MOCK_USERS_BY_ID[String(id)]) || null;
  }

  function resolveAuthorId(legacyName, legacyAvatarUrl) {
    const name = (legacyName || '').toString().trim();
    const avatar = (legacyAvatarUrl || '').toString().trim();
    if (name && avatar) {
      return LEGACY_AUTHOR_INDEX[`${name}::${avatar}`] || LEGACY_AUTHOR_INDEX[name] || null;
    }
    if (name) return LEGACY_AUTHOR_INDEX[name] || null;
    return null;
  }

  // ---------- Normalização: POSTS ----------
  /**
   * Contrato padrão do Post (V7.x):
   * id, modulo, categoria, titulo, descricao, preco, authorId, timestamp, emoji, verificado
   */
  function normalizePost(raw) {
    const r = raw || {};

    const id = (r.id != null) ? r.id : ((r._id != null) ? r._id : Date.now());
    const modulo = r.modulo || r.module || '';
    const categoria = r.categoria || r.category || '';
    const titulo = r.titulo || r.title || '';
    const descricao = r.descricao || r.description || '';
    const preco = (typeof r.preco === 'number') ? r.preco : ((r.price != null) ? r.price : null);

    const legacyAuthorName = r.autor || r.author || '';
    const legacyAuthorAvatar = r.autorAvatar || r.authorAvatar || '';

    const authorId = r.authorId
      || resolveAuthorId(legacyAuthorName, legacyAuthorAvatar)
      || null;

    const timestamp = r.timestamp || r.createdAt || r.created_at || '';
    const emoji = r.emoji || '✨';
    const verificado = Boolean(r.verificado ?? r.verified ?? false);

    const tagLabels = Array.isArray(r.tags) ? r.tags : [];
    const tagKeys = Array.isArray(r.tagKeys) ? r.tagKeys : (tagLabels.length ? tagLabels : []);

    return {
      // Contrato padrão (campos base)
      id,
      modulo,
      categoria,
      titulo,
      descricao,
      preco,
      authorId,
      timestamp,
      emoji,
      verificado,

      // Campos auxiliares (mantidos para não haver regressão de conteúdo/UX nos cards)
      categoriaKey: r.categoriaKey || r.categoryKey || '',
      categoriaLabel: r.categoriaLabel || r.categoryLabel || '',
      subcategoria: r.subcategoria || r.subcategory || '',
      subcategoriaKey: r.subcategoriaKey || r.subcategoryKey || '',
      subcategoriaLabel: r.subcategoriaLabel || r.subcategoryLabel || '',
      tags: tagLabels,
      tagKeys,
      rating: (r.rating != null ? r.rating : null),
      votos: (r.votos != null ? r.votos : null),
      comentarios: (r.comentarios != null ? r.comentarios : null),
      condicao: r.condicao || r.condition || null,
      precoOriginal: (r.precoOriginal != null ? r.precoOriginal : null),
      precoTexto: r.precoTexto || r.priceText || null,
      imagens: Array.isArray(r.imagens) ? r.imagens : (Array.isArray(r.images) ? r.images : null),
      _legacyAuthorName: legacyAuthorName || null,
      _legacyAuthorAvatar: legacyAuthorAvatar || null,
    };
  }

  function filterPosts(posts, params = {}) {
    const p = params || {};
    const moduleFilter = p.module || p.modulo || null;
    const q = (p.q || p.query || '').toString().trim().toLowerCase();
    const categoryFilter = p.category || p.categoria || null;

    return (posts || []).filter((post) => {
      if (moduleFilter && String(post.modulo).toLowerCase() !== String(moduleFilter).toLowerCase()) return false;
      if (categoryFilter && String(post.categoria).toLowerCase() !== String(categoryFilter).toLowerCase()) return false;
      if (q) {
        const hay = `${post.titulo} ${post.descricao}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // ---------- Modo estático (fallback) ----------
  async function getDatabaseRaw() {
    const urls = (Array.isArray(cfg.fallbackDatabaseURLs) && cfg.fallbackDatabaseURLs.length)
      ? cfg.fallbackDatabaseURLs
      : DEFAULTS.fallbackDatabaseURLs;

    let lastErr = null;
    for (const url of urls) {
      try {
        return await fetchJSON(url);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('KCAPI_DB_NOT_FOUND');
  }

  async function getDatabaseNormalized() {
    const db = await getDatabaseRaw();
    const anuncios = Array.isArray(db.anuncios) ? db.anuncios : [];
    const posts = anuncios.map(normalizePost);
    return {
      version: VERSION,
      users: MOCK_USERS_LIST,
      posts,
    };
  }

  // ---------- Endpoints sugeridos (futuro backend) ----------
  // GET /api/v1/posts?module=...&q=...
  async function getPosts(params = {}) {
    // Se você já tiver um backend rodando, basta configurar baseURL:
    // KCAPI.setConfig({ baseURL: '/api/v1' })
    if (!cfg.baseURL) {
      const db = await getDatabaseNormalized();
      return filterPosts(db.posts, params);
    }

    // Backend: espera-se que o servidor já devolva o contrato padrão do Post
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('posts?' + q.toString()));
  }

  // POST /api/v1/posts
  async function createPost(body) {
    if (!cfg.baseURL) {
      // fallback: simula persistência local (para protótipo)
      // Obs.: kc-core.js ainda usa "kc_user_posts" (legado). Mantemos sem regressão.
      const key = 'kc_user_posts';
      const existing = (() => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
      })();
      // Normaliza o payload para o contrato V7.x e garante autor local.
      const raw = { ...(body || {}) };
      if (!raw.id) raw.id = Date.now();
      if (!raw.authorId) raw.authorId = 'USER_SELF';
      if (!raw.autor && !raw._legacyAuthorName) raw.autor = 'Você';
      if (!raw.autorAvatar && !raw._legacyAuthorAvatar) raw.autorAvatar = (MOCK_USERS_BY_ID.USER_SELF && MOCK_USERS_BY_ID.USER_SELF.avatarUrl) || '';
      if (!raw.timestamp && !raw.createdAt) raw.timestamp = 'Agora';

      const next = normalizePost(raw);
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
    VERSION,
    setConfig,
    fetchJSON,

    // Data access
    getDatabaseRaw,
    getDatabaseNormalized,
    getPosts,
    createPost,

    // Users
    MOCK_USERS,
    getAuthorById,

    // Utils
    normalizePost,
    isBackendEnabled,
  };
})();
