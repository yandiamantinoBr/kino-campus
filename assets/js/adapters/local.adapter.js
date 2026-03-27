/* KinoCampus - Local Adapter */
(function () {
  'use strict';


const { config: cfg, fetchJSON, filterPosts: filterLocalPosts, normalizePost, MOCK_USERS_LIST, MOCK_USERS_BY_ID, apiURL, VERSION, ENV, DEFAULTS } = window.KCAPI;
  
  // Helper functions that might be missing
  function toSlug(str) { return String(str||'').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }


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
      const filtered = typeof filterLocalPosts === 'function' ? filterLocalPosts(db.posts, params) : (db.posts || []);

      // V8.1.4.2: paginação no driver local (paridade com Supabase)
      const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
      const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
      const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 20;
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const slice = Array.isArray(filtered) ? filtered.slice(start, end) : [];

      try { console.debug(`[KCAPI:local] Serving page ${page} (${slice.length} items) [limit=${limit}]`); } catch (_) { }

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
        } catch (_) { }
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
    } catch (_) { }

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
    } catch (_) { }

    return null;
  }

  async function localGetRelatedPosts(postId, options = {}) {
    const current = await localGetPostById(postId);
    if (!current) return [];

    const limit = Math.min(12, Math.max(1, Number(options.limit) || 8));
    const viewerAuthenticated = options.viewerAuthenticated !== false;
    const currentAuthor = String(current.authorId || current.autorId || current.author_id || '').trim();
    const currentModule = String(current.modulo || current.module || '').trim();

    const db = await getDatabaseNormalized();
    const dbItems = Array.isArray(db && db.posts) ? db.posts : [];
    const localItems = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('kc_user_posts') || '[]');
        return Array.isArray(raw) ? raw.map(normalizePost) : [];
      } catch (_) {
        return [];
      }
    })();

    const candidates = dbItems.concat(localItems).filter((item) => {
      if (!item) return false;
      const candidateId = String(item.uuid || item.id || '').trim();
      const currentId = String(current.uuid || current.id || '').trim();
      if (candidateId && currentId && candidateId === currentId) return false;
      if (String(item.status || 'published').trim().toLowerCase() !== 'published') return false;
      const visibility = String(item.visibility || 'public').trim().toLowerCase();
      if (!viewerAuthenticated && visibility !== 'public') return false;
      return true;
    });

    const ranked = (window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function')
      ? window.KCAPI.rankRelatedPosts(current, candidates, { viewerAuthenticated })
      : candidates;

    const prioritized = ranked.sort((left, right) => {
      const leftAuthor = String(left.authorId || left.autorId || left.author_id || '').trim();
      const rightAuthor = String(right.authorId || right.autorId || right.author_id || '').trim();
      const leftModule = String(left.modulo || left.module || '').trim();
      const rightModule = String(right.modulo || right.module || '').trim();

      const leftSameAuthor = leftAuthor && leftAuthor === currentAuthor;
      const rightSameAuthor = rightAuthor && rightAuthor === currentAuthor;
      if (leftSameAuthor !== rightSameAuthor) return leftSameAuthor ? -1 : 1;

      const leftSameModule = leftModule && leftModule === currentModule;
      const rightSameModule = rightModule && rightModule === currentModule;
      if (leftSameModule !== rightSameModule) return leftSameModule ? -1 : 1;

      return Number(right._kcRelatedScore || 0) - Number(left._kcRelatedScore || 0);
    });

    return prioritized.slice(0, limit);
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
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'alugo', 'procuro'];
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
      } catch (_) { }

      const next = normalizePost(raw);
      existing.unshift(next);

      try {
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (err) {
        const message = (err && err.message) ? String(err.message) : 'Falha ao persistir publicação no localStorage.';
        const errorPayload = {
          code: 'LOCAL_STORAGE_SET_ITEM_FAILED',
          message,
        };
        console.error('[KCAPI] localCreatePost persist error', {
          driver: ENV.driver,
          storageKey: key,
          message,
        });
        return { ok: false, error: errorPayload };
      }

      return next;
    }

    return fetchJSON(apiURL('posts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  const HELP_REQUESTS_STORAGE_KEY = 'kc_help_requests';

  function migrateLegacyHelpPayload(payload) {
    const input = (payload && typeof payload === 'object') ? payload : {};
    const legacyType = String(input.type || '').trim().toLowerCase();
    const legacyTopic = String(input.topic || '').trim().toLowerCase();

    const nextType = (function resolveType() {
      if (legacyType === 'complaint') return 'platform_issue';
      if (legacyType === 'praise') return 'suggestion_praise';
      if (legacyType === 'report') return 'report';
      if (legacyType === 'account_access') return 'account_access';
      if (legacyType === 'question') return 'question';
      return legacyType || 'question';
    }());

    const nextTopic = (function resolveTopic() {
      if (nextType === 'question') {
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'profile_contact';
        if (legacyTopic === 'platform_use' || legacyTopic === 'posts') return 'publishing_navigation';
        return 'modules_filters';
      }
      if (nextType === 'platform_issue') {
        if (legacyTopic === 'posts') return 'create_edit_post';
        if (legacyTopic === 'contact') return 'search_filters';
        if (legacyTopic === 'security') return 'slow_performance';
        return 'bugs_crashes';
      }
      if (nextType === 'account_access') {
        if (legacyTopic === 'security') return 'password';
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'onboarding_settings';
        return 'login_signup';
      }
      if (nextType === 'report') {
        if (legacyTopic === 'profile') return 'profile_user';
        if (legacyTopic === 'contact') return 'inappropriate_contact';
        if (legacyTopic === 'security') return 'security';
        return 'post';
      }
      if (nextType === 'suggestion_praise') {
        if (legacyTopic === 'posts') return 'specific_module';
        if (legacyTopic === 'payment_benefit') return 'community';
        return 'general_experience';
      }
      return legacyTopic || '';
    }());

    return {
      ...input,
      type: nextType,
      topic: nextTopic,
    };
  }

  function readHelpRequests() {
    try {
      const raw = localStorage.getItem(HELP_REQUESTS_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const normalized = normalizeHelpPayload(item);
        return {
          ...(item && typeof item === 'object' ? item : {}),
          ...normalized,
        };
      });
    } catch (_) {
      return [];
    }
  }

  function writeHelpRequests(list) {
    try {
      localStorage.setItem(HELP_REQUESTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeHelpPayload(payload) {
    const shared = window.KCHelpUtils || {};
    const migrated = migrateLegacyHelpPayload(payload);
    if (shared && typeof shared.normalizeHelpRequestInput === 'function') {
      return shared.normalizeHelpRequestInput(migrated, {});
    }
    const input = (migrated && typeof migrated === 'object') ? migrated : {};
    return {
      user_id: input.user_id || null,
      type: String(input.type || 'question').trim(),
      topic: String(input.topic || 'publishing_navigation').trim(),
      subtopic: input.subtopic ? String(input.subtopic).trim() : null,
      subject: String(input.subject || '').trim().slice(0, 140),
      message: String(input.message || '').trim().slice(0, 4000),
      priority: String(input.priority || 'normal').trim(),
      status: String(input.status || 'new').trim(),
      page_path: input.page_path ? String(input.page_path).trim().slice(0, 255) : null,
      contact_email: String(input.contact_email || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };
  }

  async function localCreateHelpRequest(payload) {
    const normalized = normalizeHelpPayload(payload);
    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descrição e e-mail de retorno.' } };
    }
    const list = readHelpRequests();
    const now = new Date().toISOString();
    const row = {
      id: `help_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...normalized,
      created_at: now,
      updated_at: now,
    };
    list.unshift(row);
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'Não foi possível salvar o pedido de ajuda localmente.' } };
    }
    return { ok: true, data: row };
  }

  async function localListAdminHelpRequests(filters = {}) {
    const current = readHelpRequests();
    const query = String(filters.query || '').trim().toLowerCase();
    return current.filter((item) => {
      if (filters.status && filters.status !== 'all' && String(item.status || '') !== String(filters.status)) return false;
      if (filters.type && filters.type !== 'all' && String(item.type || '') !== String(filters.type)) return false;
      if (filters.priority && filters.priority !== 'all' && String(item.priority || '') !== String(filters.priority)) return false;
      if (!query) return true;
      const haystack = [
        item.subject,
        item.message,
        item.contact_email,
        item.page_path,
        item.type,
        item.topic,
        item.subtopic,
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
  }

  async function localUpdateAdminHelpRequest(id, patch) {
    const targetId = String(id || '').trim();
    if (!targetId) return { ok: false, error: { message: 'Pedido inválido.' } };
    const list = readHelpRequests();
    const index = list.findIndex((item) => String(item && item.id || '') === targetId);
    if (index < 0) return { ok: false, error: { message: 'Pedido não encontrado.' } };
    list[index] = {
      ...list[index],
      ...(patch && typeof patch === 'object' ? patch : {}),
      updated_at: new Date().toISOString(),
    };
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'Não foi possível atualizar o pedido localmente.' } };
    }
    return { ok: true, data: list[index] };
  }

  // ---------- Driver Pattern (V8.1.3.1) ----------
  // Objetivo: permitir trocar a fonte de dados (local <-> supabase) alterando apenas KC_ENV.driver.
  const driverLocal = Object.freeze({
    name: 'local',
    getPosts: localGetPosts,
    getPostById: localGetPostById,
    getRelatedPosts: localGetRelatedPosts,
    createPost: localCreatePost,
    reportPost: async function () {
      return { ok: false, error: { message: 'Denúncias disponíveis apenas no Supabase.' } };
    },
    // Comentários e votos no driver local são geridos diretamente por kc-core.js (localStorage).
    // As funções abaixo existem apenas para uniformidade da interface; kc-core.js não as usa.
    getComments: async function () { return null; },
    addComment: async function () { return null; },
    likeComment: async function () { return null; },
    votePost: async function () { return null; },
    getMyVote: async function () { return null; },
    createHelpRequest: localCreateHelpRequest,
    listAdminHelpRequests: localListAdminHelpRequests,
    updateAdminHelpRequest: localUpdateAdminHelpRequest,
    // Stubs: funcionalidades disponíveis apenas no driver Supabase
    togglePostStatus: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    renewPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    bumpPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    getTopContributors: async function () { return []; },
    trackCouponClick: async function () { return { ok: false }; },
    trackShare: async function () { return { ok: false }; },
    checkDuplicatePost: async function () { return { ok: false, candidates: [] }; },
  });


window.KCAPI.registerAdapter('local', driverLocal);

})();
