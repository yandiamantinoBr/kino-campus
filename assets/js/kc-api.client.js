/*
  KinoCampus - API Client (V8.2.6.2)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Normalizar usuários (MOCK_USERS) e posts (contrato padrão com authorId).
  - Manter compatibilidade com modo estático (data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/



  const VERSION = '8.2.6.2';

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
      environment: 'development',
      APP_ENV: 'development',
      isProduction: false,
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

    const rawEnv = String((merged.APP_ENV || merged.environment || '')).trim().toLowerCase();
    const normalizedEnv = (rawEnv === 'production' || rawEnv === 'prod') ? 'production' : 'development';
    merged.environment = normalizedEnv;
    merged.APP_ENV = normalizedEnv;
    merged.isProduction = normalizedEnv === 'production';

    const rawDriver = String((merged.DATA_DRIVER || merged.driver || 'local')).toLowerCase();
    if (rawDriver === '__invalid_production_driver__') {
      merged.driver = '__invalid_production_driver__';
    } else {
      merged.driver = (rawDriver === 'supabase') ? 'supabase' : 'local';
    }
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
  let lastCreatePostError = null;

  function normalizeErrorForDiagnostics(err) {
    if (!err) {
      return {
        message: 'Erro desconhecido.',
        code: 'UNKNOWN',
        details: null,
        hint: null,
      };
    }

    if (typeof err === 'string') {
      return {
        message: err,
        code: 'ERROR_STRING',
        details: null,
        hint: null,
      };
    }

    const message = String(err.message || err.msg || 'Erro desconhecido.');
    const code = (err.code != null && String(err.code).trim()) ? String(err.code).trim() : 'UNKNOWN';
    const details = (err.details != null) ? err.details : null;
    const hint = (err.hint != null) ? err.hint : null;

    return { message, code, details, hint };
  }

  function summarizeCreatePayloadForDiagnostics(parsed) {
    const p = (parsed && typeof parsed === 'object') ? parsed : {};
    return {
      moduleDB: p.moduleDB || '',
      categoryDB: p.categoryDB || '',
      subcategoryDB: p.subcategoryDB || '',
      titleLength: String(p.title || '').length,
      descriptionLength: String(p.description || '').length,
      imagesCount: Array.isArray(p.images) ? p.images.length : 0,
    };
  }

  function setLastCreatePostError(stage, err, context) {
    const normalized = normalizeErrorForDiagnostics(err);
    const payload = {
      stage: String(stage || 'EXCEPTION'),
      message: normalized.message,
      code: normalized.code,
      details: normalized.details,
      hint: normalized.hint,
      context: (context && typeof context === 'object') ? context : null,
      at: new Date().toISOString(),
    };

    lastCreatePostError = Object.freeze(payload);
    console.error('[KCAPI][Supabase] createPost falhou:', lastCreatePostError);
    return lastCreatePostError;
  }

  function clearLastCreatePostError() {
    lastCreatePostError = null;
  }

  function getLastCreatePostError() {
    return lastCreatePostError ? { ...lastCreatePostError } : null;
  }


  const DEFAULTS = {
    baseURL: '',
    fallbackDatabaseURLs: ['data/database.json'],
    timeoutMs: 10000,
    debug: false,
  };

  const cfg = { ...DEFAULTS };

  // Boot inicial (lê KC_ENV e aplica debug)
  (function bootstrapConfig() {
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

    const meta = (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) ? { ...r.metadata } : {};
    const legacyAuthorName = pickFirstNonEmpty([r.autor, r.author, meta.autorNome]);
    const legacyAuthorAvatar = pickFirstNonEmpty([r.autorAvatar, r.authorAvatar, meta.autorAvatar]);

    const authorId = r.authorId
      || resolveAuthorId(legacyAuthorName, legacyAuthorAvatar)
      || null;

    const normalizedAuthorName = pickFirstNonEmpty([r.authorName, legacyAuthorName, 'Autor']);
    const normalizedAuthorAvatar = pickFirstNonEmpty([
      r.authorAvatar,
      legacyAuthorAvatar,
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(normalizedAuthorName || 'kc'),
    ]);

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
      autor: normalizedAuthorName,
      author: normalizedAuthorName,
      autorAvatar: normalizedAuthorAvatar,
      authorAvatar: normalizedAuthorAvatar,
      authorName: normalizedAuthorName,
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
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
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
    } catch (_e) { }

    return out;
  }

  function filterPosts(posts, params = {}) {
    const p = params || {};

    const moduleFilter = (p.module || p.modulo || '').toString().trim().toLowerCase() || null;
    const categoryFilter = (p.category || p.categoria || '').toString().trim().toLowerCase() || null;
    const subcategoryFilter = (p.subcategory || p.subcategoria || '').toString().trim().toLowerCase() || null;
    const q = (p.q || p.query || '').toString().trim().toLowerCase();
    const tagFilter = (p.tag || p.tagKey || p.tag_key || '').toString().trim().toLowerCase();

    const normalizeTag = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return '';
      try {
        return raw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      } catch (_e) {
        return raw;
      }
    };

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

      if (tagFilter) {
        const tagPool = [];
        if (Array.isArray(post.tagKeys)) tagPool.push(...post.tagKeys);
        if (Array.isArray(post.tags)) tagPool.push(...post.tags);
        const meta = post && (post.metadata || post.meta || post._meta);
        if (meta && Array.isArray(meta.tagKeys)) tagPool.push(...meta.tagKeys);
        if (meta && Array.isArray(meta.tags)) tagPool.push(...meta.tags);

        const tagsNorm = tagPool.map(normalizeTag).filter(Boolean);
        const wanted = normalizeTag(tagFilter);
        if (!wanted || !tagsNorm.includes(wanted)) return false;
      }

      if (q) {
        const hay = `${post.titulo || post.title || ''} ${post.descricao || post.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // ---------- Utilidades internas ----------
  function pickFirstNonEmpty(values) {
    if (!Array.isArray(values)) return '';
    for (const item of values) {
      const value = String(item == null ? '' : item).trim();
      if (value) return value;
    }
    return '';
  }

  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function enforceSupabaseOnProduction(operationName) {
    if (!ENV.isProduction) return null;
    if (ENV.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
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

  // ---------- Supabase Auth Delegates ----------
  async function supabaseGetCurrentUser() {
    try {
      if (KCSupabase && typeof KCSupabase.getCurrentUser === 'function') {
        return await KCSupabase.getCurrentUser();
      }
    } catch (err) { console.warn('[KCAPI] getCurrentUser falhou:', err && err.message || err); }
    return null;
  }

  async function supabaseLogin(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return null;

    try {
      if (KCSupabase && typeof KCSupabase.signIn === 'function') {
        const r = await KCSupabase.signIn(em, pw);
        return (r && r.user) ? r.user : null;
      }
    } catch (err) { console.warn('[KCAPI] login falhou:', err && err.message || err); }
    return null;
  }

  async function supabaseSignUp(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };

    if (KCSupabase && typeof KCSupabase.signUp === 'function') {
      return KCSupabase.signUp(em, pw);
    }
    return { user: null, session: null, error: { message: 'Supabase não configurado.' } };
  }

  async function supabaseLogout() {
    try {
      if (KCSupabase && typeof KCSupabase.signOut === 'function') {
        const r = await KCSupabase.signOut();
        return !!(r && r.ok);
      }
    } catch (err) { console.warn('[KCAPI] logout falhou:', err && err.message || err); }
    return false;
  }

  const _adapters = {};
  function registerAdapter(name, adapter) {
    _adapters[name] = adapter;
  }

  function getActiveDriver() {
    if (ENV.driver === 'supabase' && _adapters['supabase']) return _adapters['supabase'];
    if (_adapters['local']) return _adapters['local'];
    throw new Error('No driver adapters loaded!');
  }


  // Facade pública (mantém a API estável)
  async function getPosts(params = {}) { return getActiveDriver().getPosts(params); }
  async function getPostById(id) { return getActiveDriver().getPostById(id); }
  async function createPost(body) {
    const policyError = enforceSupabaseOnProduction('createPost');
    if (policyError) return policyError;
    return getActiveDriver().createPost(body);
  }
  async function updatePost(postId, payload) {
    if (!getActiveDriver().updatePost) return kcApiError('Edição indisponível neste driver.');
    return getActiveDriver().updatePost(postId, payload);
  }
  async function deletePost(postId) {
    if (!getActiveDriver().deletePost) return kcApiError('Exclusão indisponível neste driver.');
    return getActiveDriver().deletePost(postId);
  }

  async function reportPost(postId, payload) {
    if (!getActiveDriver().reportPost) {
      return { ok: false, error: { message: 'Denúncias indisponíveis neste driver.' } };
    }
    return getActiveDriver().reportPost(postId, payload);
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
    // 1. Supabase (caminho existente)
    if (ENV.driver === 'supabase' &&
        window.KCProfiles && typeof window.KCProfiles.getProfileById === 'function') {
      const profile = await window.KCProfiles.getProfileById(id);
      if (profile) return profile;
    }

    // 2. Fallback: mock user legado (USER_01..USER_42)
    const mock = getAuthorById(id);
    if (mock) {
      return Object.freeze({
        id:           mock.id,
        display_name: mock.displayName || mock.name || '',
        full_name:    mock.displayName || mock.name || '',
        avatar_url:   mock.avatarUrl   || mock.avatar || '',
        bio:          '',
        verified:     false,
        is_admin:     false,
        created_at:   null,
        updated_at:   null,
      });
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
    if (ENV.driver !== 'supabase' || !getActiveDriver().getComments) return null;
    return getActiveDriver().getComments(postId);
  }

  async function addComment(postId, body) {
    const policyError = enforceSupabaseOnProduction('addComment');
    if (policyError) return policyError;
    if (ENV.driver !== 'supabase' || !getActiveDriver().addComment) return null;
    return getActiveDriver().addComment(postId, body);
  }

  async function likeComment(commentId) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().likeComment) return null;
    return getActiveDriver().likeComment(commentId);
  }

  // Votes facade (V8.1.7.3)
  async function votePost(postId, direction, options = {}) {
    const policyError = enforceSupabaseOnProduction('votePost');
    if (policyError) return policyError;
    if (ENV.driver !== 'supabase' || !getActiveDriver().votePost) return null;
    return getActiveDriver().votePost(postId, direction, options);
  }

  async function getMyVote(postId) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMyVote) return null;
    return getActiveDriver().getMyVote(postId);
  }

  async function getMyProfile() {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMyProfile) return null;
    return getActiveDriver().getMyProfile();
  }

  async function updateMyProfile(patch = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().updateMyProfile) return { ok: false, error: { message: 'Perfil indisponível neste driver.' } };
    return getActiveDriver().updateMyProfile(patch);
  }

  async function uploadProfileAvatar(fileOrDataUrl) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().uploadProfileAvatar) {
      return { ok: false, error: { message: 'Upload de avatar indisponível neste driver.' } };
    }
    return getActiveDriver().uploadProfileAvatar(fileOrDataUrl);
  }

  async function getMyPosts(params = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMyPosts) return [];
    return getActiveDriver().getMyPosts(params);
  }

  async function getPostsByAuthorId(authorId, params = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getPostsByAuthorId) return [];
    return getActiveDriver().getPostsByAuthorId(authorId, params);
  }

  async function getSavedPostState(postId) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getSavedPostState) return { kinds: [] };
    return getActiveDriver().getSavedPostState(postId);
  }

  async function setSavedPostState(postId, kind, enabled) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().setSavedPostState) {
      return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    }
    return getActiveDriver().setSavedPostState(postId, kind, enabled);
  }

  async function clearSavedPostState(postId, kind) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().clearSavedPostState) {
      return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
    }
    return getActiveDriver().clearSavedPostState(postId, kind);
  }

  async function getMySavedPosts(params = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMySavedPosts) return [];
    return getActiveDriver().getMySavedPosts(params);
  }

  async function getMySavedPostsCount(params = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMySavedPostsCount) return 0;
    return getActiveDriver().getMySavedPostsCount(params);
  }

  async function getProfileHighlights(profileId, params = {}) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getProfileHighlights) return [];
    return getActiveDriver().getProfileHighlights(profileId, params);
  }

  async function getProfileHighlightsCount(profileId) {
    if (ENV.driver !== 'supabase' || !getActiveDriver().getProfileHighlightsCount) return 0;
    return getActiveDriver().getProfileHighlightsCount(profileId);
  }

  window.KCAPI = Object.freeze({
    VERSION,
    ENV,
    config: cfg,
    registerAdapter,
    get activeDriver() { try { return getActiveDriver().name; } catch(e) { return 'pending'; } },

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
    uploadProfileAvatar,
    getMyPosts,
    getPostsByAuthorId,
    getSavedPostState,
    setSavedPostState,
    clearSavedPostState,
    getMySavedPosts,
    getMySavedPostsCount,
    getProfileHighlights,
    getProfileHighlightsCount,

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
    getLastCreatePostError,


    // Users
    MOCK_USERS,

    apiURL,
    DEFAULTS,
    MOCK_USERS_BY_ID,
    MOCK_USERS_LIST,

    getAuthorById,

    // Utils
    normalizePost,
    isBackendEnabled,
  });
