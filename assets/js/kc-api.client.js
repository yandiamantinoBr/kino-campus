/*
  KinoCampus - API Client (V8.1.2.4.4)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Normalizar usuários (MOCK_USERS) e posts (contrato padrão com authorId).
  - Manter compatibilidade com modo estático (data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/

(function () {
  'use strict';

  const VERSION = '8.1.2.4.4';

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

    if (merged.driver !== 'local' && merged.driver !== 'supabase') merged.driver = 'local';
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
    const verificado = Boolean(r.verificado ?? r.verified ?? false);

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
      timestamp,
      // Datas (úteis para badges/ordenação; não quebra o contrato legado)
      createdAt,
      created_at,
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
      // Metadata (JSONB/local): mantém subcategory e labels para filtros
      metadata: meta,
      _legacyAuthorName: legacyAuthorName || null,
      _legacyAuthorAvatar: legacyAuthorAvatar || null,
    };

    // V8.1.2.4.4: garante consistência de chaves usadas nos filtros (tabs/checkboxes/JSONB)
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
  async function localGetPosts(params = {}) {
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

      // V8.1.2.4.4: garante persistência consistente de categoria/sub-módulo no modo local
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

  // ---------- Driver Pattern (V8.1.2.4.4) ----------
  // Objetivo: permitir trocar a fonte de dados (local <-> supabase) alterando apenas KC_ENV.driver.
  const driverLocal = Object.freeze({
    name: 'local',
    getPosts: localGetPosts,
    getPostById: localGetPostById,
    createPost: localCreatePost,
  });

  function supabaseNotReady(method) {
    console.error(`[KCAPI][Supabase] Método "${method}" chamado, mas o driver Supabase ainda é um esqueleto (V8.1.2.4.4).`);
    return Promise.reject(new Error('KCAPI_SUPABASE_DRIVER_NOT_READY'));
  }

  // ---------- Supabase Client Bootstrap (V8.1.2.4.4) ----------
  // Cria o cliente apenas quando necessário (driver="supabase").
  let supabaseClient = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    if (!hasSupabaseLib()) {
      console.error('[KCAPI][Supabase] Biblioteca supabase-js não carregada (CDN ausente ou sem internet).');
      return null;
    }

    const url = (ENV.supabase && ENV.supabase.url) ? String(ENV.supabase.url).trim() : '';
    const anonKey = (ENV.supabase && ENV.supabase.anonKey) ? String(ENV.supabase.anonKey).trim() : '';

    if (!url || !anonKey || anonKey.includes('placeholder')) {
      console.error('[KCAPI][Supabase] KC_ENV.supabase.url/anonKey ausentes ou placeholders. Configure antes de usar driver="supabase".');
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

  // ---------- Supabase Auth & Storage (V8.1.2.4.4) ----------
  async function supabaseGetCurrentUser() {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      // getUser() é o caminho mais direto no supabase-js v2
      if (client.auth && typeof client.auth.getUser === 'function') {
        const r = await client.auth.getUser();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getCurrentUser erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.user) ? r.data.user : null;
      }

      // fallback: getSession()
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

  async function ensureSupabaseProfile(client, user) {
    if (!client || !user || !user.id) return null;

    const fullName = (
      (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
      || user.email
      || 'Usuário'
    );

    const avatarUrl = (
      (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.avatar))
      || ''
    );

    try {
      // 1) tenta ler
      const s = await client
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .eq('id', user.id)
        .maybeSingle();

      if (s && s.data) return s.data;

      // 2) tenta upsert (depende das políticas RLS)
      const payload = { id: user.id, full_name: fullName, avatar_url: avatarUrl, email: user.email || null };
      const u = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id, full_name, avatar_url, email')
        .maybeSingle();

      if (u && u.data) return u.data;
    } catch (e) {
      // Não quebra o fluxo (alguns projetos travam upsert por RLS)
      console.warn('[KCAPI][Supabase] Não consegui garantir profile (RLS/trigger):', e);
    }

    return null;
  }

  async function supabaseLogin(email, password) {
    const client = getSupabaseClient();
    if (!client) return null;

    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return null;

    try {
      const r = await client.auth.signInWithPassword({ email: em, password: pw });
      if (r && r.error) {
        console.error('[KCAPI][Supabase] login erro:', r.error);
        return null;
      }
      const user = (r && r.data && r.data.user) ? r.data.user : null;
      if (user) {
        try { await ensureSupabaseProfile(client, user); } catch (_) {}
      }
      return user;
    } catch (e) {
      console.error('[KCAPI][Supabase] login falhou:', e);
      return null;
    }
  }

  async function supabaseLogout() {
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

  async function uploadImagesToSupabaseStorage(client, images) {
    const bucket = (ENV.supabase && ENV.supabase.storageBucket) ? String(ENV.supabase.storageBucket) : 'kino-media';
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) return [];

    const storage = client.storage.from(bucket);
    const ts = Date.now();

    const uploaded = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];

      // Se já for URL http(s), reaproveita.
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        uploaded.push({ url: item, is_cover: i === 0 });
        continue;
      }

      // dataURL -> Blob
      const blob = dataUrlToBlob(item);
      if (!blob) {
        console.warn('[KCAPI][Supabase] Imagem inválida (não é dataURL):', item);
        continue;
      }

      const ext = extFromMime(blob.type);
      const filename = sanitizeFilename(`image-${i + 1}.${ext}`);
      const path = `posts/${ts}-${filename}`;

      const up = await storage.upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
      if (up && up.error) {
        console.error('[KCAPI][Supabase] Upload falhou:', up.error);
        return null;
      }

      const pub = storage.getPublicUrl(path);
      const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
      if (!publicUrl) {
        console.warn('[KCAPI][Supabase] Upload OK, mas não consegui obter URL pública:', path);
      }

      uploaded.push({ url: publicUrl || path, is_cover: i === 0 });
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

  function mapSupabasePost(row) {
    if (!row) return null;

    const author = row.profiles || null;
    const media = Array.isArray(row.post_media) ? row.post_media : [];

    // Cover primeiro (mantém ordem estável do restante)
    const coverFirst = media.slice().sort((a, b) => {
      const ac = (a && a.is_cover) ? 1 : 0;
      const bc = (b && b.is_cover) ? 1 : 0;
      // cover(true) vem primeiro
      if (ac !== bc) return bc - ac;
      return 0;
    });

    const imageUrls = coverFirst
      .map((m) => (m && m.url) ? String(m.url) : '')
      .filter(Boolean);

    const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const categoriaLabel = (metadata && (metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel))
      ? String(metadata.categoria || metadata.categoriaLabel || metadata.categoryLabel)
      : (row.category || "");


    // Saída híbrida (compatível com KCAPI.normalizePost + views legadas):
    // - snake_case e camelCase para campos novos
    // - campos PT-BR usados pelo UI (titulo, descricao, preco, modulo, categoria, timestamp)
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
      autor: (author && (author.full_name || author.email)) ? (author.full_name || author.email) : '',
      autorAvatar: (author && author.avatar_url) ? author.avatar_url : '',

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

  function buildSupabasePostSelect(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url, email), post_media (id, url, is_cover)')
      .limit(1);
  }

  async function supabaseGetPostById(id) {
    const key = String(id || '').trim();
    if (!key) return null;

    const client = getSupabaseClient();
    if (!client) return null;

    const isUuid = UUID_RE.test(key);

    try {
      // 1) tenta por UUID (posts.id)
      if (isUuid) {
        const r1 = await buildSupabasePostSelect(client).eq('id', key).maybeSingle();
        if (r1 && r1.error) {
          console.error('[KCAPI][Supabase] getPostById(id) erro:', r1.error);
        }
        if (r1 && r1.data) return mapSupabasePost(r1.data);
      }

      // 2) compat: busca por legacy_id (IDs numéricos antigos e u_*)
      const r2 = await buildSupabasePostSelect(client).eq('legacy_id', key).maybeSingle();
      if (r2 && r2.error) {
        console.error('[KCAPI][Supabase] getPostById(legacy_id) erro:', r2.error);
        return null;
      }
      if (r2 && r2.data) return mapSupabasePost(r2.data);
    } catch (e) {
      console.error('[KCAPI][Supabase] getPostById falhou:', e);
      return null;
    }

    return null;
  }


  function buildSupabasePostsQuery(client) {
    return client
      .from('posts')
      .select('id, legacy_id, author_id, title, description, price, location, module, category, metadata, created_at, profiles:author_id (id, full_name, avatar_url, email), post_media (id, url, is_cover)');
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
    const client = getSupabaseClient();
    if (!client) return [];

    const f = normalizeSupabaseFilters(filters);

    const from = (f.page - 1) * f.limit;
    const to = from + f.limit - 1;

    try {
      let q = buildSupabasePostsQuery(client).order('created_at', { ascending: false });

      if (f.module) q = q.eq('module', f.module);
      if (f.category) q = q.eq('category', f.category);
      if (f.subcategory) q = q.eq('metadata->>subcategory', f.subcategory);
      if (f.q) q = q.or(buildOrILike(f.q));

      q = q.range(from, to);

      const res = await q;
      if (res && res.error) {
        console.error('[KCAPI][Supabase] getPosts erro:', res.error);
        return [];
      }

      const rows = (res && Array.isArray(res.data)) ? res.data : [];
      if (!rows.length) return [];

      // 1) mapeia snake->camel e embeds (profiles/media)
      // 2) normaliza no mesmo contrato do modo local (normalizePost)
      return rows
        .map(mapSupabasePost)
        .filter(Boolean)
        .map((mapped) => {
          const raw = { ...(mapped || {}) };

          // Para manter a mesma "cara" do modo local, preferimos legacy_id como "id" quando existir.
          const legacy = raw.legacyId || raw.legacy_id || null;
          if (legacy != null && legacy !== '') {
            raw.uuid = raw.id; // preserva UUID (útil para debug/futuro)
            raw.id = legacy;
          }

          return normalizePost(raw);
        });
    } catch (e) {
      console.error('[KCAPI][Supabase] getPosts falhou:', e);
      return [];
    }
  }



  // ---------- Supabase Write Path (V8.1.2.4.4) ----------
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

    // V8.1.2.4.4: compra-venda usa tabs por categoria (ex.: eletronicos).
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

    // 1) Upload das imagens (se houver)
    const uploaded = await uploadImagesToSupabaseStorage(client, parsed.images);
    if (uploaded === null) {
      // uploadImages retorna null em erro hard
      return null;
    }

    // 2) Insere post
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

    try {
      const ins = await client
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .maybeSingle();

      if (ins && ins.error) {
        console.error('[KCAPI][Supabase] insert posts erro:', ins.error);
        return null;
      }

      const postId = (ins && ins.data && ins.data.id) ? ins.data.id : null;
      if (!postId) {
        console.error('[KCAPI][Supabase] insert posts sem id retornado.');
        return null;
      }

      // 3) Insere mídias (post_media)
      if (Array.isArray(uploaded) && uploaded.length) {
        const mediaRows = uploaded
          .filter((m) => m && m.url)
          .map((m, idx) => ({
            post_id: postId,
            url: String(m.url),
            is_cover: !!m.is_cover,
          }));

        const mr = await client
          .from('post_media')
          .insert(mediaRows);

        if (mr && mr.error) {
          console.error('[KCAPI][Supabase] insert post_media erro:', mr.error);
          return null;
        }
      }

      // 4) Rebusca completo (com JOINs) e normaliza no contrato do modo local
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
  // Driver Supabase (V8.1.2.4.4)
  // Nesta versão: getPostById já é real. Outros métodos seguem como esqueleto.
  const driverSupabase = Object.freeze({
    name: 'supabase',
    getPosts: supabaseGetPosts,
    getPostById: supabaseGetPostById,
    createPost: supabaseCreatePost,
  });

  const activeDriver = (ENV.driver === 'supabase') ? driverSupabase : driverLocal;

  // Facade pública (mantém a API estável)
  async function getPosts(params = {}) { return activeDriver.getPosts(params); }
  async function getPostById(id) { return activeDriver.getPostById(id); }
  async function createPost(body) { return activeDriver.createPost(body); }

  // Auth facade (sem quebrar modo local)
  async function getCurrentUser() {
    if (ENV.driver !== 'supabase') return null;
    return supabaseGetCurrentUser();
  }

  async function login(email, password) {
    if (ENV.driver !== 'supabase') return null;
    return supabaseLogin(email, password);
  }

  async function logout() {
    if (ENV.driver !== 'supabase') return false;
    return supabaseLogout();
  }


  function isBackendEnabled() { return !!cfg.baseURL; }

  

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
    // Auth (Supabase)
    getCurrentUser,
    login,
    logout,


    // Users
    MOCK_USERS,
    getAuthorById,

    // Utils
    normalizePost,
    isBackendEnabled,
  });
})();
