/*
  KinoCampus - API Client (V8.1.3.1)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Normalizar usuários (MOCK_USERS) e posts (contrato padrão com authorId).
  - Manter compatibilidade com modo estático (data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/

(function () {
  'use strict';

  const VERSION = '8.1.8.1';

  // -------- Bootstrap de Configuração (KC_ENV) --------
  // Regra de fallback: se kc-env.js não estiver carregado, assume driver local.
  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : null;
    if (!env) {
      console.warn('[KCAPI] window.KC_ENV não encontrado. Usando defaults (driver=local).');
    }

    const fallback = {
      version: VERSION,
      driver: 'local',
      debug: true,
      SUPABASE_URL: 'https://placeholder-project.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbG...placeholder',
      supabase: {
        url: 'https://placeholder-project.supabase.co',
        anonKey: 'eyJhbG...placeholder',
        storageBucket: 'kino-media',
      },
      clamp: { month: 'February', year: 2026 },
    };

    const merged = {
      ...fallback,
      ...(env || {}),
      supabase: { ...fallback.supabase, ...(((env || {}).supabase) || {}) },
      clamp: { ...fallback.clamp, ...(((env || {}).clamp) || {}) },
    };

    const rawDriver = String((merged.DATA_DRIVER || merged.driver || 'local')).toLowerCase();
    merged.driver = (rawDriver === 'supabase') ? 'supabase' : 'local';
    merged.DATA_DRIVER = merged.driver;

    // Normaliza Supabase (aliases)
    if (!merged.supabase || typeof merged.supabase !== 'object') merged.supabase = {};
    const url = String(merged.SUPABASE_URL || merged.supabase.url || '').trim();
    const anonKey = String(merged.SUPABASE_ANON_KEY || merged.supabase.anonKey || '').trim();
    if (url) merged.supabase.url = url;
    if (anonKey) merged.supabase.anonKey = anonKey;
    merged.SUPABASE_URL = merged.supabase.url;
    merged.SUPABASE_ANON_KEY = merged.supabase.anonKey;

    return merged;
  }

  const ENV = readEnv();


  const DRIVER_PRESETS = Object.freeze({
    local: {
      baseURL: '',
      // Fonte local (offline-first)
      fallbackDatabaseURLs: ['data/database.json'],
    },
    // Placeholder: supabase driver será implementado na próxima fase (V8.1.2.x)
    supabase: {
      baseURL: '',
      // Mantemos o seed como fallback até o driver supabase estar ativo
      fallbackDatabaseURLs: ['data/database.json'],
    },
  });

  const DEFAULTS = {
    // Backend poderá servir /api/v1 (quando driver evoluir)
    baseURL: '',
    // Fonte única do database (local/offline-first)
    fallbackDatabaseURLs: DRIVER_PRESETS.local.fallbackDatabaseURLs.slice(),
    timeoutMs: 10000,
    debug: false,
  };

  const cfg = { ...DEFAULTS };

  // Boot inicial (lê KC_ENV e aplica preset do driver)
  (function bootstrapConfig() {
    const preset = DRIVER_PRESETS[ENV.driver] || DRIVER_PRESETS.local;
    cfg.baseURL = preset.baseURL;
    cfg.fallbackDatabaseURLs = preset.fallbackDatabaseURLs.slice();
    cfg.debug = Boolean(ENV.debug);
  })();

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

    const createdAt = r.createdAt || r.created_at || null;
    const created_at = r.created_at || r.createdAt || null;
    const timestamp = r.timestamp || createdAt || '';
    const emoji = r.emoji || '✨';

    // V8.1.3.2: verificação passa a ser atributo do AUTOR (profiles.verified).
    // Mantém compat com o legado (posts com r.verificado / r.verified no mock/local).
    const authorVerified = Boolean(
      r.authorVerified ??
      r.author_verified ??
      (r.profiles && r.profiles.verified) ??
      (r.author && r.author.verified) ??
      false
    );

    const verificado = (Boolean(r.verificado ?? r.verified ?? false) || authorVerified);

    const tagLabels = Array.isArray(r.tags) ? r.tags : [];
    const tagKeys = Array.isArray(r.tagKeys) ? r.tagKeys : (tagLabels.length ? tagLabels : []);

    const meta = (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) ? { ...r.metadata } : {};

    const out = {
      // Contrato padrão (campos base)
      id,
      modulo,
      categoria,
      titulo,
      descricao,
      preco,
      authorId,
      // V8.1.3.2: status do autor (profiles.verified)
      authorVerified,
      timestamp,
      // Datas (úteis para badges/ordenação; não quebra o contrato legado)
      createdAt,
      created_at,
      emoji,
      verificado,

      // Autor (status)
      authorVerified,

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
      // Metadata (JSONB/local): mantém subcategory e labels para filtros
      metadata: meta,
      _legacyAuthorName: legacyAuthorName || null,
      _legacyAuthorAvatar: legacyAuthorAvatar || null,
    };

    // V8.1.3.1: garante consistência de chaves usadas nos filtros (tabs/checkboxes/JSONB)
    try {
      const mk = String(out.modulo || '').toLowerCase();

      if (!out.categoriaKey && meta.categoryKey) out.categoriaKey = meta.categoryKey;
      if (!meta.categoryKey && out.categoriaKey) meta.categoryKey = out.categoriaKey;

      if (!out.subcategoriaKey && meta.subcategoryKey) out.subcategoriaKey = meta.subcategoryKey;
      if (!out.subcategoriaKey && meta.subcategory) out.subcategoriaKey = meta.subcategory;

      const desiredSub = String(out.subcategoriaKey || meta.subcategory || '').trim();
      if (!meta.subcategory && desiredSub) meta.subcategory = desiredSub;
      if (!meta.subcategoryKey && desiredSub) meta.subcategoryKey = desiredSub;

      if (mk === 'compra-venda') {
        const actionish = ['vendo','compro','troco','doacao','doação','procuro'];
        const subk = String(out.subcategoriaKey || '').toLowerCase();
        if (out.categoriaKey && actionish.includes(subk)) {
          out.subcategoriaKey = out.categoriaKey;
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
        if (out.categoriaKey && !meta.subcategory) {
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
      }
    } catch (_e) {}

    return out;
  }

  function filterPosts(posts, params = {}) {
    const p = params || {};

    const moduleFilter = (p.module || p.modulo || '').toString().trim().toLowerCase() || null;
    const categoryFilter = (p.category || p.categoria || '').toString().trim().toLowerCase() || null;
    const subcategoryFilter = (p.subcategory || p.subcategoria || '').toString().trim().toLowerCase() || null;
    const q = (p.q || p.query || '').toString().trim().toLowerCase();

    const getMetaSub = (post) => {
      try {
        const m = post && (post.metadata || post.meta || post._meta);
        if (!m) return '';
        return String(m.subcategoryKey || m.subcategory || m.subcategoriaKey || m.subcategoria || '').toLowerCase();
      } catch (_e) {
        return '';
      }
    };

    return (posts || []).filter((post) => {
      if (!post) return false;

      const mod = String(post.modulo ?? post.module ?? '').toLowerCase();
      const cat = String(post.categoria ?? post.category ?? '').toLowerCase();
      const sub = String(post.subcategoria ?? post.subcategory ?? post.subcategoriaKey ?? post.subcategoryKey ?? '').toLowerCase() || getMetaSub(post);

      if (moduleFilter && mod !== moduleFilter) return false;
      if (categoryFilter && cat !== categoryFilter) return false;
      if (subcategoryFilter && sub !== subcategoryFilter) return false;

      if (q) {
        const hay = `${post.titulo || post.title || ''} ${post.descricao || post.description || ''}`.toLowerCase();
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
  async function localGetPosts(params = {}) {
    // Se você já tiver um backend rodando, basta configurar baseURL:
    // KCAPI.setConfig({ baseURL: '/api/v1' })
    if (!cfg.baseURL) {
      const db = await getDatabaseNormalized();
      const filtered = filterPosts(db.posts, params);

      // V8.1.4.2: paginação no driver local (paridade com Supabase)
      const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
      const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
      const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 20;
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const slice = Array.isArray(filtered) ? filtered.slice(start, end) : [];

      try { console.debug(`[KCAPI:local] Serving page ${page} (${slice.length} items) [limit=${limit}]`); } catch (_) {}

      return slice;
    }

    // Backend: espera-se que o servidor já devolva o contrato padrão do Post
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('posts?' + q.toString()));
  }

  // GET /api/v1/posts/:id (ou driver local)
  // - Local-first: busca em localStorage (kc_user_posts) e no seed (data/database.json)
  // - Futuro: preparado para IDs UUID (string) e para backend habilitado
  async function localGetPostById(id) {
    const key = String(id || '').trim();
    if (!key) return null;

    // Backend mode (quando baseURL estiver configurado)
    if (cfg.baseURL) {
      try {
        return await fetchJSON(apiURL('posts/' + encodeURIComponent(key)));
      } catch (_) {
        // fallback: tenta resolver via listagem (caso rota /:id não exista ainda)
        try {
          const posts = await localGetPosts({});
          return posts.find((p) => {
            const pid = (p && (p.id ?? p._id ?? p.legacy_id ?? p.legacyId ?? p.uuid)) ?? null;
            return pid != null && String(pid) === key;
          }) || null;
        } catch (_) {}
        return null;
      }
    }

    // 1) LocalStorage (posts do usuário)
    try {
      const raw = localStorage.getItem('kc_user_posts');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const found = list.find((p) => {
          const pid = (p && (p.id ?? p._id ?? p.legacy_id ?? p.legacyId ?? p.uuid)) ?? null;
          return pid != null && String(pid) === key;
        });
        if (found) return found;
      }
    } catch (_) {}

    // 2) Seed JSON (data/database.json)
    try {
      const db = await getDatabaseRaw();
      const items = Array.isArray(db.anuncios) ? db.anuncios : (Array.isArray(db.posts) ? db.posts : []);
      const found = items.find((a) => {
        const pid = (a && (a.id ?? a._id ?? a.legacy_id ?? a.legacyId ?? a.uuid)) ?? null;
        if (pid != null && String(pid) === key) return true;
        // compat: alguns seeds podem usar legacy_id numérico + id uuid
        const legacy = (a && (a.legacy_id ?? a.legacyId)) ?? null;
        if (legacy != null && String(legacy) === key) return true;
        return false;
      });
      if (found) return found;
    } catch (_) {}

    return null;
  }

  // POST /api/v1/posts
  async function localCreatePost(body) {
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

      // V8.1.3.1: garante persistência consistente de categoria/sub-módulo no modo local
      // (mesma semântica do driver Supabase, para que os filters/tabs funcionem igual).
      try {
        const m = String(raw.modulo || raw.module || '').trim();
        const catKey = toSlug(raw.categoriaKey || raw.categoryKey || raw.category || raw.categoria || '');
        if (catKey) {
          raw.categoriaKey = catKey;
          if (!raw.categoria) raw.categoria = catKey;
        }

        let subKey = toSlug(raw.subcategoriaKey || raw.subcategoryKey || raw.subcategory || '');
        const actionish = ['vendo','compro','troco','doacao','alugo','procuro'];
        // compra-venda: tabs usam categoria (eletronicos...), não ação
        if (m === 'compra-venda' && subKey && actionish.includes(subKey) && catKey) {
          subKey = catKey;
          raw.subcategoriaKey = catKey;
        } else if (subKey) {
          raw.subcategoriaKey = subKey;
        }

        if (!raw.metadata || typeof raw.metadata !== 'object') raw.metadata = {};
        if (catKey) raw.metadata.categoriaKey = raw.metadata.categoriaKey || catKey;
        if (subKey) {
          raw.metadata.subcategory = raw.metadata.subcategory || subKey;
          raw.metadata.subcategoryKey = raw.metadata.subcategoryKey || subKey;
        }
      } catch (_) {}

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

  // ---------- Driver Pattern (V8.1.3.1) ----------
  // Objetivo: permitir trocar a fonte de dados (local <-> supabase) alterando apenas KC_ENV.driver.
  const driverLocal = Object.freeze({
    name: 'local',
    getPosts: localGetPosts,
    getPostById: localGetPostById,
    createPost: localCreatePost,
    reportPost: async function () {
      return { ok: false, error: { message: 'Denúncias disponíveis apenas no Supabase.' } };
    },
    // Comentários e votos no driver local são geridos diretamente por kc-core.js (localStorage).
    // As funções abaixo existem apenas para uniformidade da interface; kc-core.js não as usa.
    getComments: async function () { return null; },
    addComment:  async function () { return null; },
    likeComment: async function () { return null; },
    votePost:    async function () { return null; },
    getMyVote:   async function () { return null; },
  });

  function supabaseNotReady(method) {
    console.error(`[KCAPI][Supabase] Método "${method}" chamado, mas o driver Supabase ainda é um esqueleto (V8.1.3.1).`);
    return Promise.reject(new Error('KCAPI_SUPABASE_DRIVER_NOT_READY'));
  }

  // ---------- Supabase Client Bootstrap (V8.1.3.1) ----------
  // Cria o cliente apenas quando necessário (driver="supabase").
  let supabaseClient = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    // Preferimos o Facade (Auth/Sessão) para manter o SDK isolado
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
        supabaseClient = window.KCSupabase.getClient();
        return supabaseClient;
      }
    } catch (_) {}

    // Fallback (mantém compatibilidade caso o Facade não esteja carregado)
    if (!hasSupabaseLib()) {
      console.error('[KCAPI][Supabase] Biblioteca supabase-js não carregada (CDN ausente ou sem internet).');
      return null;
    }

    const url = (ENV.SUPABASE_URL || (ENV.supabase && ENV.supabase.url)) ? String(ENV.SUPABASE_URL || ENV.supabase.url).trim() : '';
    const anonKey = (ENV.SUPABASE_ANON_KEY || (ENV.supabase && ENV.supabase.anonKey)) ? String(ENV.SUPABASE_ANON_KEY || ENV.supabase.anonKey).trim() : '';

    if (!url || !anonKey || anonKey.includes('placeholder')) {
      console.error('[KCAPI][Supabase] KC_ENV SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou placeholders. Configure antes de usar driver="supabase".');
      return null;
    }

    try {
      supabaseClient = window.supabase.createClient(url, anonKey);
      return supabaseClient;
    } catch (e) {
      console.error('[KCAPI][Supabase] Falha ao criar cliente supabase:', e);
      return null;
    }
  }

  // ---------- Supabase Auth & Storage (V8.1.3.1) ----------
  async function supabaseGetCurrentUser() {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getCurrentUser === 'function') {
        return await window.KCSupabase.getCurrentUser();
      }
    } catch (_) {}

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      if (client.auth && typeof client.auth.getUser === 'function') {
        const r = await client.auth.getUser();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getCurrentUser erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.user) ? r.data.user : null;
      }

      if (client.auth && typeof client.auth.getSession === 'function') {
        const r = await client.auth.getSession();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getSession erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.session && r.data.session.user) ? r.data.session.user : null;
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getCurrentUser falhou:', e);
    }

    return null;
  }

  async function supabaseLogin(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return null;

    try {
      if (window.KCSupabase && typeof window.KCSupabase.signIn === 'function') {
        const r = await window.KCSupabase.signIn(em, pw);
        return (r && r.user) ? r.user : null;
      }
    } catch (_) {}

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const r = await client.auth.signInWithPassword({ email: em, password: pw });
      if (r && r.error) {
        console.error('[KCAPI][Supabase] login erro:', r.error);
        return null;
      }
      return (r && r.data && r.data.user) ? r.data.user : null;
    } catch (e) {
      console.error('[KCAPI][Supabase] login falhou:', e);
      return null;
    }
  }

  async function supabaseSignUp(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };

    // Preferimos o facade (V8.1.3.1) para validação de domínio/erros consistentes
    if (window.KCSupabase && typeof window.KCSupabase.signUp === 'function') {
      return window.KCSupabase.signUp(em, pw);
    }

    const client = getSupabaseClient();
    if (!client) return { user: null, session: null, error: { message: 'Supabase não configurado.' } };

    try {
      const r = await client.auth.signUp({ email: em, password: pw });
      if (r && r.error) return { user: null, session: null, error: r.error };
      return { user: (r && r.data && r.data.user) ? r.data.user : null, session: (r && r.data && r.data.session) ? r.data.session : null, error: null };
    } catch (e) {
      return { user: null, session: null, error: { message: 'Falha no cadastro.' } };
    }
  }


  async function supabaseLogout() {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.signOut === 'function') {
        const r = await window.KCSupabase.signOut();
        return !!(r && r.ok);
      }
    } catch (_) {}

    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const r = await client.auth.signOut();
      if (r && r.error) {
        console.error('[KCAPI][Supabase] logout erro:', r.error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[KCAPI][Supabase] logout falhou:', e);
      return false;
    }
  }

  function dataUrlToBlob(dataUrl) {
    const s = String(dataUrl || '');
    const m = s.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;

    const mime = m[1] || 'application/octet-stream';
    const b64 = m[2] || '';

    try {
      const binStr = atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function extFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'bin';
  }

  function sanitizeFilename(name) {
    const s = String(name || '').trim();
    if (!s) return 'image';
    return s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'image';
  }

    async function uploadImagesToSupabaseStorage(client, images, options) {
    // Bucket (compat): prefer STORAGE_BUCKET_POST_MEDIA (roadmap), senão ENV.supabase.storageBucket
    const bucket = (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';

    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) return [];

    // Hard limits (mínimo anti-abuso)
    const maxImages = 5;
    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024); // 5MB

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = (opts.userId != null) ? String(opts.userId) : '';
    const postId = (opts.postId != null) ? String(opts.postId) : '';

    // Path controlado: post-media/{userId}/{postId}/{filename}
    // Se não houver userId/postId, cai em modo "compat" (menos seguro) e loga warning.
    const hasStrongPath = !!(userId && postId);

    const storage = client.storage.from(bucket);
    const ts = Date.now();

    const uploaded = [];
    for (let i = 0; i < Math.min(list.length, maxImages); i++) {
      const item = list[i];

      // Se já for URL http(s), reaproveita.
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        uploaded.push({ url: item, is_cover: i === 0, sort_order: i });
        continue;
      }

      // dataURL -> Blob
      const blob = dataUrlToBlob(item);
      if (!blob) {
        console.warn('[KCAPI][Supabase] Imagem inválida (não é dataURL):', item);
        continue;
      }

      // Valida tipo/tamanho
      const mime = String(blob.type || '').toLowerCase();
      if (!allowedTypes.has(mime)) {
        console.warn('[KCAPI][Supabase] Tipo de imagem não permitido:', mime);
        continue;
      }
      if (blob.size > maxBytes) {
        console.warn('[KCAPI][Supabase] Imagem excede tamanho máximo (bytes):', blob.size, '>', maxBytes);
        continue;
      }

      const ext = extFromMime(mime);
      const filename = sanitizeFilename(`image-${i + 1}.${ext}`);

      const path = hasStrongPath
        ? `post-media/${userId}/${postId}/${ts}-${i + 1}-${filename}`
        : `posts/${ts}-${filename}`; // compat (evitar quebra caso postId/userId não exista)

      if (!hasStrongPath) {
        console.warn('[KCAPI][Supabase] Upload com path fraco (sem userId/postId). Considere hardening via post-media/{userId}/{postId}.');
      }

      const up = await storage.upload(path, blob, { contentType: mime || 'application/octet-stream', upsert: false });
      if (up && up.error) {
        console.error('[KCAPI][Supabase] Upload falhou:', up.error);
        return null;
      }

      const pub = storage.getPublicUrl(path);
      const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
      if (!publicUrl) {
        console.warn('[KCAPI][Supabase] Upload OK, mas não consegui obter URL pública:', path);
      }

      uploaded.push({ url: publicUrl || path, is_cover: i === 0, sort_order: i });
    }

    return uploaded;
  }



  function mergeMetadataSafe(target, metadata) {
    const base = target || {};
    const meta = (metadata && typeof metadata === 'object') ? metadata : {};
    for (const k of Object.keys(meta)) {
      if (k in base) continue;
      base[k] = meta[k];
    }
    return base;
  }

  function mapSupabasePost(row, options) {
    if (!row) return null;

    const opts = (options && typeof options === 'object') ? options : {};
    const allImages = !!opts.allImages;

    const author = row.profiles || null;
    // Compat: schema pode usar post_media (padrão) ou post_images (variante)
    const media = Array.isArray(row.post_media)
      ? row.post_media
      : (Array.isArray(row.post_images) ? row.post_images : []);

    const items = media.filter((m) => m && m.url);
    let ordered = items.slice();

    // Ordenação por sort_order (quando existir). Se não existir, prioriza capa.
    const hasSortOrder = ordered.some((m) => (m && (m.sort_order != null || m.sortOrder != null)));
    if (hasSortOrder) {
      ordered.sort((a, b) => {
        const av = (a && (a.sort_order != null ? a.sort_order : a.sortOrder));
        const bv = (b && (b.sort_order != null ? b.sort_order : b.sortOrder));
        const an = (typeof av === 'number' && isFinite(av)) ? av : 1e9;
        const bn = (typeof bv === 'number' && isFinite(bv)) ? bv : 1e9;
        return an - bn;
      });
    } else {
      ordered.sort((a, b) => {
        const ac = (a && a.is_cover) ? 1 : 0;
        const bc = (b && b.is_cover) ? 1 : 0;
        if (ac !== bc) return bc - ac; // cover(true) vem primeiro
        return 0;
      });
    }

    let imageUrls = [];
    if (allImages) {
      const set = new Set();
      ordered.forEach((m) => {
        if (m && m.url) set.add(String(m.url));
      });
      imageUrls = Array.from(set);
    } else {
      const cover = ordered.find((m) => m && m.is_cover && m.url) || ordered.find((m) => m && m.url) || null;
      imageUrls = (cover && cover.url) ? [String(cover.url)] : [];
    }

    const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const categoriaLabel = (metadata && (metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel))
      ? String(metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel)
      : (row.category || "");

    // Saída híbrida (compatível com KCAPI.normalizePost + views legadas):
    // - snake_case e camelCase para campos novos
    // - campos PT-BR usados pelo UI (titulo, descricao, preco, modulo, categoria, timestamp)
    const authorVerified = !!(author && author.verified);

    const out = {
      // IDs
      id: row.id,
      legacyId: row.legacy_id || null,
      legacy_id: row.legacy_id || null,

      // Autor
      authorId: row.author_id || (author && author.id) || null,
      author_id: row.author_id || null,

      // Contrato (PT-BR + aliases EN)
      modulo: row.module || '',
      module: row.module || '',
      categoria: categoriaLabel,
      category: row.category || '',

      titulo: row.title || '',
      title: row.title || '',
      descricao: row.description || '',
      description: row.description || '',

      preco: (row.price != null ? row.price : null),
      price: (row.price != null ? row.price : null),

      location: row.location || '',

      timestamp: row.created_at || '',
      createdAt: row.created_at || '',
      created_at: row.created_at || '',

      // Para manter retrocompatibilidade visual (fallback do render):
      // Hardening de privacidade: NÃO depender de profiles.email para exibir nome.
      autor: (author && author.full_name) ? String(author.full_name || '') : '',
      autorAvatar: (author && author.avatar_url) ? author.avatar_url : '',

      // Verificação do autor (V8.1.3.2)
      authorVerified,
      author_verified: authorVerified,
      verificado: authorVerified,
      verified: authorVerified,

      imagens: imageUrls,
      images: imageUrls,

      metadata,
    };

    // Aliases legados (alguns trechos usam author/authorAvatar)
    out.author = out.autor;
    out.authorAvatar = out.autorAvatar;

    // Injeta campos variáveis (metadata) sem sobrescrever o contrato base
    mergeMetadataSafe(out, metadata);

    return out;
  }

  // Adapter: linha do Postgres (snake_case + embeds) -> Contrato KCAPI (camelCase/PT-BR)
  // - Mantém compat com modo local (id pode ser legacy_id)
  // - Normaliza via normalizePost (contrato único consumido pelos controllers)
  function normalizeSupabasePost(row) {
    const mapped = mapSupabasePost(row);
    if (!mapped) return null;

    const raw = { ...(mapped || {}) };

    // Preferir legacy_id como id para manter links/contrato do protótipo
    const legacy = raw.legacyId || raw.legacy_id || null;
    if (legacy != null && legacy !== '') {
      raw.uuid = raw.id; // preserva UUID
      raw.id = legacy;
    }

    return normalizePost(raw);
  }

  function buildSupabasePostSelect(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url, verified), post_media (id, url, is_cover)')
      .limit(1);
  }

  // Compat: caso o schema ainda não tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostSelectFallback(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url), post_media (id, url, is_cover)')
      .limit(1);
  }

  async function supabaseGetPostById(id) {
    const key = String(id || "").trim();
    if (!key) return null;

    // IDs locais (u_*) não existem no Supabase
    if (key.startsWith("u_")) return null;

    // Preferir Facade (KCSupabase) para evitar KCAPI falando direto com o SDK
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getPostById === "function") {
        const row = await window.KCSupabase.getPostById(key);
        if (!row) return null;

        const mapped = mapSupabasePost(row, { allImages: true });
        if (!mapped) return null;

        // Se foi chamado com legacy numérico, manter id no formato do protótipo
        const isUuid = UUID_RE.test(key);
        const isNumeric = /^\d+$/.test(key);
        if (!isUuid && isNumeric) {
          const legacy = mapped.legacyId || mapped.legacy_id || null;
          if (legacy != null && legacy !== "") {
            mapped.uuid = mapped.id; // preserva UUID real
            mapped.id = legacy;
          }
        }

        return mapped;
      }
    } catch (e) {
      console.warn("[KCAPI][Supabase] getPostById via KCSupabase falhou, usando fallback:", e);
    }

    const client = getSupabaseClient();
    if (!client) return null;

    const isUuid = UUID_RE.test(key);
    const isNumeric = /^\d+$/.test(key);
    const legacyNum = (!isUuid && isNumeric) ? parseInt(key, 10) : null;

    try {
      // 1) tenta por UUID (posts.id)
      if (isUuid) {
        const r1 = await buildSupabasePostSelect(client).eq("id", key).maybeSingle();
        if (r1 && r1.error) {
          console.error("[KCAPI][Supabase] getPostById(id) erro:", r1.error);
          // Fallback para schema sem profiles.verified
          if (isMissingVerifiedColumnError(r1.error)) {
            const r1b = await buildSupabasePostSelectFallback(client).eq("id", key).maybeSingle();
            if (r1b && r1b.data) return mapSupabasePost(r1b.data, { allImages: true });
          }
        }
        if (r1 && r1.data) return mapSupabasePost(r1.data, { allImages: true });
      }

      // 2) legacy_id (IDs numéricos antigos)
      if (legacyNum != null) {
        const r2 = await buildSupabasePostSelect(client).eq("legacy_id", legacyNum).maybeSingle();
        if (r2 && r2.error) {
          console.error("[KCAPI][Supabase] getPostById(legacy_id) erro:", r2.error);
          if (isMissingVerifiedColumnError(r2.error)) {
            const r2b = await buildSupabasePostSelectFallback(client).eq("legacy_id", legacyNum).maybeSingle();
            if (r2b && r2b.data) {
              const mapped = mapSupabasePost(r2b.data, { allImages: true });
              if (mapped) {
                const legacy = mapped.legacyId || mapped.legacy_id || null;
                if (legacy != null && legacy !== "") {
                  mapped.uuid = mapped.id;
                  mapped.id = legacy;
                }
              }
              return mapped;
            }
          }
          return null;
        }
        if (r2 && r2.data) {
          const mapped = mapSupabasePost(r2.data, { allImages: true });
          if (mapped) {
            const legacy = mapped.legacyId || mapped.legacy_id || null;
            if (legacy != null && legacy !== "") {
              mapped.uuid = mapped.id;
              mapped.id = legacy;
            }
          }
          return mapped;
        }
      }
    } catch (e) {
      console.error("[KCAPI][Supabase] getPostById falhou:", e);
      return null;
    }

    return null;
  }


  function buildSupabasePostsQuery(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url, verified), post_media (id, url, is_cover)');
  }

  // Compat: caso o schema ainda não tenha profiles.verified (antes do update v8.1.3.2)
  function buildSupabasePostsQueryFallback(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url), post_media (id, url, is_cover)');
  }

  function isMissingVerifiedColumnError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('verified') && msg.includes('does not exist');
  }

  function normalizeSupabaseFilters(filters) {
    const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {};
    const module = (f.module || f.modulo || null);
    const category = (f.category || f.categoria || null);
    const subcategory = (f.subcategory || f.subcategoria || null);

    const moduleNorm = module != null ? String(module).trim().toLowerCase() : null;
    const categoryNorm = category != null ? String(category).trim().toLowerCase() : null;
    const subcategoryNorm = subcategory != null ? String(subcategory).trim().toLowerCase() : null;

    const q = (f.q || f.query || f.search || '').toString().trim();

    const pageRaw = (f.page != null) ? parseInt(String(f.page), 10) : 1;
    const limitRaw = (f.limit != null) ? parseInt(String(f.limit), 10) : 10;

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;

    return { module: moduleNorm, category: categoryNorm, subcategory: subcategoryNorm, q, page, limit };
  }

  function buildOrILike(q) {
    // PostgREST: valores com caracteres especiais podem ser envoltos em aspas.
    // Mantemos o padrão pedido (.or('title.ilike.%q%,description.ilike.%q%')) mas com quoting seguro.
    const safe = String(q || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const pattern = `%${safe}%`;
    return `title.ilike."${pattern}",description.ilike."${pattern}"`;
  }

  async function supabaseGetPosts(filters = {}) {
    // Preferimos a Facade (KCSupabase.getPosts) para manter o SDK isolado do restante do app.
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getPosts === 'function') {
        const rows = await window.KCSupabase.getPosts(filters);
        const out = (Array.isArray(rows) ? rows : []).map(normalizeSupabasePost).filter(Boolean);

        // Logs discretos para QA (V8.1.4.2)
        const f = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {};
        const pageRaw = (f.page != null) ? parseInt(String(f.page), 10) : 1;
        const limitRaw = (f.limit != null) ? parseInt(String(f.limit), 10) : (out.length || 0);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : (out.length || 0);
        try { console.debug(`[KCAPI:supabase] Loaded page ${page} (${out.length} items) [limit=${limit}]`); } catch (_) {}

        return out;
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getPosts (via KCSupabase) falhou:', e);
      return [];
    }

    // Fallback defensivo (não deveria ocorrer se o bundle estiver correto)
    console.warn('[KCAPI][Supabase] KCSupabase.getPosts indisponível; retornando lista vazia.');
    return [];
  }



  // ---------- Supabase Write Path (V8.1.3.1) ----------
  function parsePriceMaybe(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    // tenta BRL: 1.234,56
    const norm = s
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  function toSlug(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
      return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    } catch (_) {
      return s.toLowerCase();
    }
  }

  function clampCreatedAtISO() {
    // Temporal clamp: Fevereiro de 2026 (configurável via KC_ENV.clamp)
    const y = (ENV.clamp && ENV.clamp.year) ? parseInt(String(ENV.clamp.year), 10) : 2026;
    const yy = Number.isFinite(y) ? y : 2026;
    return `${yy}-02-15T12:00:00.000Z`;
  }

  function normalizeCreatePayload(data) {
    const d = (data && typeof data === 'object') ? data : {};

    const modulo = (d.modulo || d.module || '').toString().trim();
    const categoryKey = (d.categoriaKey || d.categoryKey || d.category || d.categoria || '').toString().trim();
    const subKey = (d.subcategoriaKey || d.subcategoryKey || d.subcategory || d.subcategoria || '').toString().trim();

    const title = (d.titulo || d.title || '').toString().trim();
    const description = (d.descricao || d.description || '').toString().trim();

    const price = (d.preco != null) ? parsePriceMaybe(d.preco) : parsePriceMaybe(d.price);
    const location = (d.localizacao || d.location || '').toString().trim();

    const images = Array.isArray(d.imagens) ? d.imagens : (Array.isArray(d.images) ? d.images : []);

    // labels (opcionais) para manter UI rica via metadata
    // (mantém retrocompatibilidade: payloads antigos usavam d.categoria/d.subcategoria como labels)
    const categoriaLabel = (d.categoriaLabel || d.categoryLabel || (d.categoriaKey ? '' : d.categoria) || (d.categoryKey ? '' : d.category) || '').toString().trim();
    const subcategoriaLabel = (d.subcategoriaLabel || d.subcategoryLabel || (d.subcategoriaKey ? '' : d.subcategoria) || (d.subcategoryKey ? '' : d.subcategory) || '').toString().trim();

    const moduleDB = toSlug(modulo);
    const categoryDB = toSlug(categoryKey || categoriaLabel);

    // V8.1.3.1: compra-venda usa tabs por categoria (ex.: eletronicos).
    // Se algum payload vier com subKey=ação, normalizamos para a categoria.
    const actionish = ['vendo','compro','troco','doacao','doação','procuro'];
    const subKeySlug = toSlug(subKey);
    const effectiveSubKey = (moduleDB === 'compra-venda' && subKeySlug && actionish.includes(subKeySlug) && categoryKey)
      ? categoryKey
      : subKey;

    const subcategoryDB = toSlug(effectiveSubKey || subcategoriaLabel);

    // metadata: mantém dados extras sem inflar colunas
    const metadata = {
      ...(d.metadata && typeof d.metadata === 'object' ? d.metadata : {}),
      // filtros (JSONB)
      ...(subcategoryDB ? { subcategory: subcategoryDB } : {}),
      // labels
      ...(categoriaLabel ? { categoryLabel: categoriaLabel } : {}),
      ...(subcategoriaLabel ? { subcategoryLabel: subcategoriaLabel } : {}),
      // chaves úteis do formulário
      ...((categoryKey || d.categoriaKey || d.categoryKey) ? { categoryKey: toSlug(categoryKey || d.categoriaKey || d.categoryKey) } : {}),
      ...((effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) ? { subcategoryKey: toSlug(effectiveSubKey || d.subcategoriaKey || d.subcategoryKey) } : {}),
      ...(Array.isArray(d.tags) ? { tags: d.tags } : {}),
      ...(Array.isArray(d.tagKeys) ? { tagKeys: d.tagKeys } : {}),
      ...(d.condicao ? { condicao: String(d.condicao) } : {}),
      ...(d.precoTexto ? { precoTexto: String(d.precoTexto) } : {}),
      ...(typeof d.sustentavel === 'boolean' ? { sustentavel: d.sustentavel } : {}),
      ...(d.emoji ? { emoji: String(d.emoji) } : {}),
      ...(typeof d.verificado === 'boolean' ? { verificado: d.verificado } : {}),
    };

    return {
      moduleDB,
      categoryDB,
      subcategoryDB,
      title,
      description,
      price,
      location,
      images,
      metadata,
      // também devolvemos o payload bruto para retorno local (labels)
      raw: { ...d },
    };
  }

  async function supabaseCreatePost(data) {
    const client = getSupabaseClient();
    if (!client) return null;

    const user = await supabaseGetCurrentUser();
    if (!user) {
      console.warn('[KCAPI][Supabase] createPost bloqueado: usuário não autenticado.');
      return null;
    }

    const parsed = normalizeCreatePayload(data);
    if (!parsed.title || !parsed.description || !parsed.moduleDB) {
      console.warn('[KCAPI][Supabase] createPost payload incompleto (título/descrição/módulo).');
      return null;
    }

    // garante perfil (quando RLS permitir)
    await ensureSupabaseProfile(client, user);

    try {

    // 1) Insere post primeiro (para obter postId) e habilitar path controlado no Storage
    const createdAt = clampCreatedAtISO();

    const insertPayload = {
      author_id: user.id,
      title: parsed.title,
      description: parsed.description,
      price: parsed.price,
      location: parsed.location,
      module: parsed.moduleDB,
      category: parsed.categoryDB,
      metadata: parsed.metadata,
      created_at: createdAt,
    };

    // Helper de rollback (evita órfãos quando upload falha após INSERT)
    async function rollbackCreatedPost(postId) {
      try {
        const del = await client.from('posts').delete().eq('id', postId);
        if (del && del.error) console.warn('[KCAPI][Supabase] rollback delete falhou:', del.error);
      } catch (e) {
        console.warn('[KCAPI][Supabase] rollback delete exceção:', e);
      }
    }

    // 2) INSERT posts (gera UUID)
    let postId = null;
    const ins = await client
      .from('posts')
      .insert(insertPayload)
      .select('id')
      .maybeSingle();

    if (ins && ins.error) {
      console.error('[KCAPI][Supabase] insert posts erro:', ins.error);
      return null;
    }

    postId = (ins && ins.data && ins.data.id) ? ins.data.id : null;
    if (!postId) {
      console.error('[KCAPI][Supabase] insert posts sem id retornado.');
      return null;
    }

    // 3) Upload das imagens (se houver) com path controlado (post-media/{userId}/{postId}/...)
    const uploaded = await uploadImagesToSupabaseStorage(client, parsed.images, { userId: user.id, postId });
    if (uploaded === null) {
      await rollbackCreatedPost(postId);
      return null;
    }

    // 4) Insere mídias (post_media) com capa + ordem
    if (Array.isArray(uploaded) && uploaded.length) {
      const mediaRowsFull = uploaded
        .filter((m) => m && m.url)
        .map((m, idx) => ({
          post_id: postId,
          url: String(m.url),
          is_cover: idx === 0, // regra: capa = 1ª imagem ordenada
          sort_order: Number.isFinite(m.sort_order) ? m.sort_order : idx,
        }));

      // Tenta com sort_order (V8.1.5.1); fallback se schema ainda não tiver coluna.
      let mr = await client.from('post_media').insert(mediaRowsFull);
      if (mr && mr.error) {
        const msg = String(mr.error.message || '').toLowerCase();
        if (msg.includes('sort_order')) {
          const mediaRowsCompat = mediaRowsFull.map(({ sort_order, ...rest }) => rest);
          mr = await client.from('post_media').insert(mediaRowsCompat);
        }
      }

      if (mr && mr.error) {
        console.error('[KCAPI][Supabase] insert post_media erro:', mr.error);
        // não apaga post automaticamente (pode ser útil depurar), mas registra dívida
        return null;
      }
    }

    // 5) Rebusca completo (com JOINs) e normaliza no contrato do modo local (com JOINs) e normaliza no contrato do modo local
      const mapped = await supabaseGetPostById(postId);
      if (!mapped) return null;

      // injeta labels do payload bruto (caso category esteja em slug)
      const raw = { ...mapped };
      if (parsed.raw && parsed.raw.categoria && !raw.categoria) raw.categoria = parsed.raw.categoria;
      if (parsed.raw && parsed.raw.subcategoria && !raw.subcategoria) raw.subcategoria = parsed.raw.subcategoria;

      return normalizePost(raw);
    } catch (e) {
      console.error('[KCAPI][Supabase] createPost falhou:', e);
      return null;
    }
  }

  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function normalizeUpdatePayload(data) {
    const parsed = normalizeCreatePayload(data);
    if (!parsed.title) return { ok: false, error: { message: 'Título é obrigatório.' } };
    if (!parsed.description) return { ok: false, error: { message: 'Descrição é obrigatória.' } };
    if (!parsed.moduleDB) return { ok: false, error: { message: 'Módulo é obrigatório.' } };
    if (!parsed.categoryDB) return { ok: false, error: { message: 'Categoria é obrigatória.' } };

    return {
      ok: true,
      data: {
        title: parsed.title,
        description: parsed.description,
        price: parsed.price,
        location: parsed.location,
        module: parsed.moduleDB,
        category: parsed.categoryDB,
        metadata: parsed.metadata,
      },
    };
  }

  async function resolvePostUuid(postId) {
    if (typeof postId === 'string' && UUID_RE.test(postId)) return String(postId);
    if (postId == null) return null;
    try {
      const post = await supabaseGetPostById(String(postId));
      if (post && post.uuid && UUID_RE.test(String(post.uuid))) return String(post.uuid);
      if (post && post.id && UUID_RE.test(String(post.id))) return String(post.id);
    } catch (_) {}
    return null;
  }

  async function supabaseUpdatePost(postId, payload) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('Faça login para editar.');

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return kcApiError('Payload inválido para edição.');
    }

    const parsed = normalizeUpdatePayload(payload);
    if (!parsed.ok) return parsed;

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para edição.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] updatePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de edição.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('Você não pode editar este post.');

      const upd = await client
        .from('posts')
        .update(parsed.data)
        .eq('id', postUuid)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle();

      if (upd && upd.error) {
        console.error('[KCAPI][Supabase] updatePost erro:', upd.error);
        return kcApiError('Não foi possível salvar alterações.');
      }

      const updated = await supabaseGetPostById(postUuid);
      if (!updated) return kcApiError('Post atualizado, mas não foi possível recarregar.');

      return { ok: true, data: updated };
    } catch (e) {
      console.error('[KCAPI][Supabase] updatePost exceção:', e);
      return kcApiError('Não foi possível salvar alterações.');
    }
  }

  async function supabaseDeletePost(postId) {
    const client = getSupabaseClient();
    if (!client) return kcApiError('Supabase não inicializado.');

    const user = await supabaseGetCurrentUser();
    if (!user) return kcApiError('Faça login para excluir.');

    const postUuid = await resolvePostUuid(postId);
    if (!postUuid) return kcApiError('Post inválido para exclusão.');

    try {
      const own = await client.from('posts').select('id, author_id').eq('id', postUuid).maybeSingle();
      if (own && own.error) {
        console.error('[KCAPI][Supabase] deletePost ownership check erro:', own.error);
        return kcApiError('Não foi possível validar permissão de exclusão.');
      }
      if (!own || !own.data) return kcApiError('Publicação não encontrada.');
      if (String(own.data.author_id || '') !== String(user.id || '')) return kcApiError('Você não pode excluir este post.');

      const del = await client.from('posts').delete().eq('id', postUuid).eq('author_id', user.id);
      if (del && del.error) {
        console.error('[KCAPI][Supabase] deletePost erro:', del.error);
        return kcApiError('Não foi possível excluir a publicação.');
      }
      return { ok: true };
    } catch (e) {
      console.error('[KCAPI][Supabase] deletePost exceção:', e);
      return kcApiError('Não foi possível excluir a publicação.');
    }
  }

  // ---------- Reports (V8.1.6.2) ----------
  // Denunciar Post: insere 1 linha em public.reports (RLS força reporter_id = auth.uid())
  // Retorno: { ok, data?, error? }
  async function supabaseReportPost(postId, payload = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para denunciar.' } };

    // resolve UUID do post (aceita uuid direto; para legacy numérico tenta resolver via getPostById)
    let postUuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!postUuid && postId != null) {
      try {
        const p = await supabaseGetPostById(String(postId));
        if (p && p.uuid && UUID_RE.test(String(p.uuid))) postUuid = String(p.uuid);
        else if (p && p.id && UUID_RE.test(String(p.id))) postUuid = String(p.id);
      } catch (_) {}
    }
    if (!postUuid) return { ok: false, error: { message: 'Post inválido para denúncia.' } };

    const reason = String(payload.reason || '').trim().toLowerCase();
    const allowed = new Set(['spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other']);
    if (!allowed.has(reason)) return { ok: false, error: { message: 'Selecione um motivo válido.' } };

    const detailsRaw = (payload.details == null) ? '' : String(payload.details);
    const details = detailsRaw.trim().slice(0, 1000);

    try {
      const ins = await client
        .from('reports')
        .insert({
          post_id: postUuid,
          reporter_id: user.id,
          reason,
          details: details ? details : null,
          status: 'open',
        })
        .select('id, created_at')
        .maybeSingle();

      if (ins && ins.error) {
        // UNIQUE parcial: reports_unique_open_post_reporter
        const code = String(ins.error.code || '');
        const msg = String(ins.error.message || '').toLowerCase();
        if (code === '23505' || msg.includes('reports_unique_open_post_reporter') || msg.includes('duplicate')) {
          return { ok: false, error: { message: 'Você já denunciou este post.' }, meta: { duplicate: true } };
        }
        console.error('[KCAPI][Supabase] reportPost erro:', ins.error);
        return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
      }

      return { ok: true, data: (ins && ins.data) ? ins.data : { id: null } };
    } catch (e) {
      console.error('[KCAPI][Supabase] reportPost exceção:', e);
      return { ok: false, error: { message: 'Não foi possível registrar a denúncia.' } };
    }
  }
  // ---------- Comments (V8.1.7.2) ----------

  // Busca comentários de um post (ordenados por created_at asc)
  async function supabaseGetComments(postId) {
    const client = getSupabaseClient();
    if (!client) return [];
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return [];
    try {
      let result = await client
        .from('comments')
        .select('id, created_at, author_id, author_name, body, likes, author_profile:profiles!comments_author_id_fkey(display_name, full_name)')
        .eq('post_id', uuid)
        .order('created_at', { ascending: true });

      if (result && result.error) {
        result = await client
          .from('comments')
          .select('id, created_at, author_id, author_name, body, likes')
          .eq('post_id', uuid)
          .order('created_at', { ascending: true });
      }

      if (result && result.error) { console.error('[KCAPI][comments] getComments:', result.error); return []; }
      const rows = (result && Array.isArray(result.data)) ? result.data : [];

      let profilesById = Object.create(null);
      const missingProfileJoin = rows.some((row) => !row.author_profile && row.author_id);
      if (missingProfileJoin) {
        try {
          let profRes = await client
            .from('profiles')
            .select('id, display_name, full_name')
            .in('id', Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean))));

          if (profRes && profRes.error && isMissingTokenError(profRes.error, 'display_name')) {
            profRes = await client
              .from('profiles')
              .select('id, full_name')
              .in('id', Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean))));
          }

          if (profRes && Array.isArray(profRes.data)) {
            profRes.data.forEach((p) => {
              if (p && p.id) profilesById[p.id] = p;
            });
          }
        } catch (_) {}
      }

      return rows.map((row) => {
        const prof = row && row.author_profile ? row.author_profile : (row && row.author_id ? profilesById[row.author_id] : null);
        const resolvedName = String(
          (prof && (prof.display_name || prof.full_name))
          || row.display_name
          || row.full_name
          || row.author_name
          || 'Anônimo'
        ).trim() || 'Anônimo';
        return { ...row, author_name: resolvedName };
      });
    } catch (e) {
      console.error('[KCAPI][comments] getComments exceção:', e);
      return [];
    }
  }

  // Insere um novo comentário (author_id e author_name do usuário logado)
  async function supabaseAddComment(postId, body) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para comentar.' } };
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return { ok: false, error: { message: 'Post inválido.' } };
    const text = String(body || '').trim().slice(0, 2000);
    if (!text) return { ok: false, error: { message: 'Comentário não pode ser vazio.' } };

    // Busca nome de exibição do profile
    let authorName = 'Anônimo';
    try {
      let profRes = await client
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profRes && profRes.error && isMissingTokenError(profRes.error, 'display_name')) {
        profRes = await client
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
      }

      const prof = profRes && profRes.data ? profRes.data : null;
      if (prof) authorName = String(prof.display_name || prof.full_name || 'Anônimo').trim() || 'Anônimo';
    } catch (_) {}

    try {
      const { data, error } = await client
        .from('comments')
        .insert({ post_id: uuid, author_id: user.id, author_name: authorName, body: text })
        .select('id, created_at, author_id, author_name, body, likes')
        .maybeSingle();
      if (error) {
        console.error('[KCAPI][comments] addComment:', error);
        return { ok: false, error: { message: 'Não foi possível comentar.' } };
      }
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] addComment exceção:', e);
      return { ok: false, error: { message: 'Não foi possível comentar.' } };
    }
  }

  async function supabaseGetMyProfile() {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await supabaseGetCurrentUser();
    if (!user) return null;

    try {
      let res = await client
        .from('profiles')
        .select('id, display_name, full_name, avatar_url, verified, updated_at')
        .eq('id', user.id)
        .maybeSingle();

      if (res && res.error && isMissingTokenError(res.error, 'display_name')) {
        res = await client
          .from('profiles')
          .select('id, full_name, avatar_url, verified, updated_at')
          .eq('id', user.id)
          .maybeSingle();
      }
      if (res && res.error) {
        console.error('[KCAPI][profile] getMyProfile:', res.error);
        return null;
      }
      return (res && res.data) ? res.data : null;
    } catch (e) {
      console.error('[KCAPI][profile] getMyProfile exceção:', e);
      return null;
    }
  }

  async function supabaseUpdateMyProfile(patch = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para editar seu perfil.' } };

    const displayName = String((patch && patch.display_name) || '').trim().slice(0, 80);
    if (!displayName) return { ok: false, error: { message: 'Informe um nome válido.' } };

    try {
      const { data, error } = await client
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id)
        .select('id, display_name, full_name, avatar_url, verified, updated_at')
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][profile] updateMyProfile:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar seu perfil.' } };
      }
      if (!data) {
        return { ok: false, error: { message: 'No momento, não é possível alterar seu nome.' } };
      }
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][profile] updateMyProfile exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar seu perfil.' } };
    }
  }

  async function supabaseGetMyPosts(params = {}) {
    const client = getSupabaseClient();
    if (!client) return [];
    const user = await supabaseGetCurrentUser();
    if (!user) return [];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const status = String(params.status || '').trim().toLowerCase();

    try {
      let query = client
        .from('posts')
        .select('id, legacy_id, title, created_at, status, module, category')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) {
        console.error('[KCAPI][profile] getMyPosts:', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.legacy_id || row.id,
        uuid: row.id,
        title: row.title || 'Sem título',
        created_at: row.created_at || null,
        status: row.status || 'published',
        module: row.module || '',
        category: row.category || '',
      }));
    } catch (e) {
      console.error('[KCAPI][profile] getMyPosts exceção:', e);
      return [];
    }
  }

  // Incrementa likes de um comentário (operação simples; sem tabela separada de likes)
  async function supabaseLikeComment(commentId) {
    const client = getSupabaseClient();
    if (!client) return { ok: false };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para curtir.' } };
    const uuid = (typeof commentId === 'string' && UUID_RE.test(commentId)) ? commentId : null;
    if (!uuid) return { ok: false };
    try {
      const { data, error } = await client.rpc('increment_comment_likes', { comment_uuid: uuid });
      if (error) { console.error('[KCAPI][comments] likeComment:', error); return { ok: false }; }
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][comments] likeComment exceção:', e);
      return { ok: false };
    }
  }

  // ---------- Votes (V8.1.7.3) ----------

  // Busca o voto do usuário logado para um post (null se não votou)
  async function supabaseGetMyVote(postId) {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await supabaseGetCurrentUser();
    if (!user) return null;
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return null;
    try {
      const { data } = await client
        .from('post_votes')
        .select('id, direction')
        .eq('post_id', uuid)
        .eq('voter_id', user.id)
        .maybeSingle();
      return data || null;
    } catch (_) { return null; }
  }

  // Toggle voto num post: se já votou igual, remove (toggle off). Caso contrário, insere/substitui.
  // Retorna { ok, direction: null|'hot'|'cold', score }
  async function supabaseVotePost(postId, direction) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para votar.' } };
    if (direction !== 'hot' && direction !== 'cold') return { ok: false, error: { message: 'Direção inválida.' } };

    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) {
      // tenta resolver UUID para posts legacy
      try {
        const p = await supabaseGetPostById(String(postId));
        const resolved = (p && (p.uuid || p.id));
        if (!resolved || !UUID_RE.test(String(resolved))) return { ok: false, error: { message: 'Post inválido.' } };
        return supabaseVotePost(String(resolved), direction);
      } catch (_) { return { ok: false, error: { message: 'Post inválido.' } }; }
    }

    try {
      // Verifica voto existente
      const existing = await supabaseGetMyVote(uuid);

      if (existing && existing.direction === direction) {
        // Toggle off: remove voto
        await client.from('post_votes').delete().eq('id', existing.id);
        const { data: post } = await client.from('posts').select('votos').eq('id', uuid).maybeSingle();
        return { ok: true, direction: null, score: post ? post.votos : 0 };
      }

      if (existing) {
        // Muda direção: remove antigo e insere novo
        await client.from('post_votes').delete().eq('id', existing.id);
      }

      await client.from('post_votes').insert({ post_id: uuid, voter_id: user.id, direction });
      const { data: post } = await client.from('posts').select('votos').eq('id', uuid).maybeSingle();
      return { ok: true, direction, score: post ? post.votos : 0 };
    } catch (e) {
      console.error('[KCAPI][votes] votePost exceção:', e);
      return { ok: false, error: { message: 'Não foi possível registrar voto.' } };
    }
  }

  // Driver Supabase (V8.1.7.2+)
  const driverSupabase = Object.freeze({
    name: 'supabase',
    getPosts: supabaseGetPosts,
    getPostById: supabaseGetPostById,
    createPost: supabaseCreatePost,
    updatePost: supabaseUpdatePost,
    deletePost: supabaseDeletePost,
    reportPost: supabaseReportPost,
    getComments: supabaseGetComments,
    addComment:  supabaseAddComment,
    likeComment: supabaseLikeComment,
    votePost:    supabaseVotePost,
    getMyVote:   supabaseGetMyVote,
    getMyProfile: supabaseGetMyProfile,
    updateMyProfile: supabaseUpdateMyProfile,
    getMyPosts: supabaseGetMyPosts,
  });

  const activeDriver = (ENV.driver === 'supabase') ? driverSupabase : driverLocal;

  // Facade pública (mantém a API estável)
  async function getPosts(params = {}) { return activeDriver.getPosts(params); }
  async function getPostById(id) { return activeDriver.getPostById(id); }
  async function createPost(body) { return activeDriver.createPost(body); }
  async function updatePost(postId, payload) {
    if (!activeDriver.updatePost) return kcApiError('Edição indisponível neste driver.');
    return activeDriver.updatePost(postId, payload);
  }
  async function deletePost(postId) {
    if (!activeDriver.deletePost) return kcApiError('Exclusão indisponível neste driver.');
    return activeDriver.deletePost(postId);
  }

  async function reportPost(postId, payload) {
    if (!activeDriver.reportPost) {
      return { ok: false, error: { message: 'Denúncias indisponíveis neste driver.' } };
    }
    return activeDriver.reportPost(postId, payload);
  }

  
  // Auth facade (sem quebrar modo local)
  // - signIn/signUp retornam { user, error }
  async function getCurrentUser() {
    if (ENV.driver !== 'supabase') return null;
    return supabaseGetCurrentUser();
  }

  async function signIn(email, password) {
    if (ENV.driver !== 'supabase') return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    const user = await supabaseLogin(email, password);
    return user ? { user, error: null } : { user: null, error: { message: 'Não foi possível entrar. Verifique seus dados.' } };
  }

  async function signUp(email, password) {
    if (ENV.driver !== 'supabase') return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    const r = await supabaseSignUp(email, password);
    return r || { user: null, error: { message: 'Não foi possível cadastrar.' } };
  }

  // Aliases (compat)
  async function login(email, password) {
    const r = await signIn(email, password);
    return r && r.user ? r.user : null;
  }

  async function logout() {
    if (ENV.driver !== 'supabase') return false;
    return supabaseLogout();
  }


  // Profiles facade (V8.1.3.2)
  // - Leitura pública (profiles_select_public)
  // - Sincronização do usuário logado via UPSERT ao autenticar
  function getCurrentProfile() {
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
      return window.KCProfiles.getCurrentProfile();
    }
    return null;
  }

  async function getProfileById(id) {
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.getProfileById === 'function') {
      return window.KCProfiles.getProfileById(id);
    }
    return null;
  }

  async function syncProfile() {
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') {
      return window.KCProfiles.ensureSynced();
    }
    return null;
  }


  function isBackendEnabled() { return !!cfg.baseURL; }

  // Comments facade (V8.1.7.2)
  // Em driver=supabase: usa tabela public.comments.
  // Em driver=local: retorna null; kc-core.js usa localStorage diretamente.
  async function getComments(postId) {
    if (ENV.driver !== 'supabase' || !activeDriver.getComments) return null;
    return activeDriver.getComments(postId);
  }

  async function addComment(postId, body) {
    if (ENV.driver !== 'supabase' || !activeDriver.addComment) return null;
    return activeDriver.addComment(postId, body);
  }

  async function likeComment(commentId) {
    if (ENV.driver !== 'supabase' || !activeDriver.likeComment) return null;
    return activeDriver.likeComment(commentId);
  }

  // Votes facade (V8.1.7.3)
  async function votePost(postId, direction) {
    if (ENV.driver !== 'supabase' || !activeDriver.votePost) return null;
    return activeDriver.votePost(postId, direction);
  }

  async function getMyVote(postId) {
    if (ENV.driver !== 'supabase' || !activeDriver.getMyVote) return null;
    return activeDriver.getMyVote(postId);
  }

  async function getMyProfile() {
    if (ENV.driver !== 'supabase' || !activeDriver.getMyProfile) return null;
    return activeDriver.getMyProfile();
  }

  async function updateMyProfile(patch = {}) {
    if (ENV.driver !== 'supabase' || !activeDriver.updateMyProfile) return { ok: false, error: { message: 'Perfil indisponível neste driver.' } };
    return activeDriver.updateMyProfile(patch);
  }

  async function getMyPosts(params = {}) {
    if (ENV.driver !== 'supabase' || !activeDriver.getMyPosts) return [];
    return activeDriver.getMyPosts(params);
  }

  window.KCAPI = Object.freeze({
    VERSION,
    ENV,
    config: cfg,
    activeDriver: activeDriver.name,

    setConfig,
    fetchJSON,

    // Data access
    getDatabaseRaw,
    getDatabaseNormalized,
    getPosts,
    getPostById,
    createPost,
    updatePost,
    deletePost,
    reportPost,

    // Comments (Supabase) — V8.1.7.2
    getComments,
    addComment,
    likeComment,

    // Votes (Supabase) — V8.1.7.3
    votePost,
    getMyVote,
    getMyProfile,
    updateMyProfile,
    getMyPosts,

    // Auth (Supabase)
    getCurrentUser,
    signIn,
    signUp,
    // compat
    login,
    logout,

    // Profiles (Supabase)
    getCurrentProfile,
    getProfileById,
    syncProfile,


    // Users
    MOCK_USERS,
    getAuthorById,

    // Utils
    normalizePost,
    isBackendEnabled,
  });
})();
