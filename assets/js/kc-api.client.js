/*
  KinoCampus - API Client (V8.6.0)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Normalizar usuários (MOCK_USERS) e posts (contrato padrão com authorId).
  - Manter compatibilidade com modo estático (data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/
(function () {
  'use strict';




  const VERSION = '8.6.0';

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

  function getNormalizedPostValue(post, keys) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (let index = 0; index < list.length; index += 1) {
      const key = list[index];
      if (!key) continue;
      const value = source[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function normalizeRelatedToken(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
      return window.KCUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function buildRelatedTokenSet(post) {
    const metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata))
      ? post.metadata
      : {};
    const rawTags = []
      .concat(Array.isArray(post && post.tagKeys) ? post.tagKeys : [])
      .concat(Array.isArray(post && post.tags) ? post.tags : [])
      .concat(Array.isArray(metadata.tagKeys) ? metadata.tagKeys : [])
      .concat(Array.isArray(metadata.tags) ? metadata.tags : []);

    const rawText = [
      getNormalizedPostValue(post, ['titulo', 'title']),
      getNormalizedPostValue(post, ['descricao', 'description']),
      getNormalizedPostValue(post, ['categoriaLabel', 'categoryLabel', 'categoria', 'category']),
      getNormalizedPostValue(post, ['subcategoriaLabel', 'subcategoryLabel', 'subcategoria', 'subcategory']),
    ].join(' ');

    const tokens = new Set();
    rawTags.forEach((tag) => {
      const normalized = normalizeRelatedToken(tag);
      if (normalized) tokens.add(normalized);
    });
    rawText.split(/[^a-zA-Z0-9À-ÿ]+/).forEach((token) => {
      const normalized = normalizeRelatedToken(token);
      if (normalized && normalized.length >= 3) tokens.add(normalized);
    });
    return tokens;
  }

  function getRelatedPostAuthorId(post) {
    return getNormalizedPostValue(post, ['authorId', 'autorId', 'author_id']);
  }

  function getRelatedPostModule(post) {
    return getNormalizedPostValue(post, ['modulo', 'module']);
  }

  function getRelatedPostCategory(post) {
    return getNormalizedPostValue(post, ['categoriaKey', 'categoryKey', 'categoria', 'category']);
  }

  function getRelatedPostSubcategory(post) {
    const metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata))
      ? post.metadata
      : {};
    return getNormalizedPostValue(
      { ...(post || {}), metadataSubcategory: metadata.subcategory, metadataSubcategoryKey: metadata.subcategoryKey },
      ['subcategoriaKey', 'subcategoryKey', 'subcategoria', 'subcategory', 'metadataSubcategoryKey', 'metadataSubcategory']
    );
  }

  function getRelatedPostTimestamp(post) {
    const raw = getNormalizedPostValue(post, ['created_at', 'createdAt', 'timestamp', 'criadoEm']);
    if (!raw) return 0;
    const date = new Date(raw).getTime();
    return Number.isFinite(date) ? date : 0;
  }

  function getRelatedPostScore(candidate, currentPost, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const currentAuthor = normalizeRelatedToken(getRelatedPostAuthorId(currentPost));
    const candidateAuthor = normalizeRelatedToken(getRelatedPostAuthorId(candidate));
    const currentModule = normalizeRelatedToken(getRelatedPostModule(currentPost));
    const candidateModule = normalizeRelatedToken(getRelatedPostModule(candidate));
    const currentCategory = normalizeRelatedToken(getRelatedPostCategory(currentPost));
    const candidateCategory = normalizeRelatedToken(getRelatedPostCategory(candidate));
    const currentSubcategory = normalizeRelatedToken(getRelatedPostSubcategory(currentPost));
    const candidateSubcategory = normalizeRelatedToken(getRelatedPostSubcategory(candidate));
    const currentTokens = buildRelatedTokenSet(currentPost);
    const candidateTokens = buildRelatedTokenSet(candidate);

    let score = 0;
    let reason = 'Relacionado';

    if (currentAuthor && candidateAuthor && currentAuthor === candidateAuthor) {
      if (currentModule && candidateModule && currentModule === candidateModule) {
        score += 160;
        reason = 'Mesmo autor e módulo';
      } else {
        score += 120;
        reason = 'Mesmo autor';
      }
    }

    if (currentModule && candidateModule && currentModule === candidateModule) {
      score += 60;
      if (reason === 'Relacionado') reason = 'Mesmo módulo';
    }

    if (currentCategory && candidateCategory && currentCategory === candidateCategory) {
      score += 40;
      if (reason === 'Relacionado') reason = 'Mesma categoria';
    }

    if (currentSubcategory && candidateSubcategory && currentSubcategory === candidateSubcategory) {
      score += 30;
      if (reason === 'Relacionado') reason = 'Mesma subcategoria';
    }

    let overlap = 0;
    currentTokens.forEach((token) => {
      if (candidateTokens.has(token)) overlap += 1;
    });
    score += Math.min(overlap * 6, 48);
    if (overlap >= 2 && reason === 'Relacionado') reason = 'Termos parecidos';

    const votes = Number(candidate && candidate.votos);
    if (Number.isFinite(votes) && votes > 0) {
      score += Math.min(Math.floor(votes / 2), 12);
    }

    const currentTime = getRelatedPostTimestamp(currentPost);
    const candidateTime = getRelatedPostTimestamp(candidate);
    if (candidateTime > 0) {
      const deltaDays = Math.max(0, (Date.now() - candidateTime) / 86400000);
      if (deltaDays <= 2) score += 8;
      else if (deltaDays <= 7) score += 5;
      else if (deltaDays <= 21) score += 2;

      if (currentTime > 0 && Math.abs(currentTime - candidateTime) <= 1000 * 60 * 60 * 24 * 10) {
        score += 3;
      }
    }

    if (opts.viewerAuthenticated !== true) {
      const visibility = normalizeRelatedToken(getNormalizedPostValue(candidate, ['visibility']));
      if (visibility && visibility !== 'public') {
        score = -9999;
      }
    }

    return { score, reason };
  }

  function rankRelatedPosts(currentPost, candidates, options) {
    const current = (currentPost && typeof currentPost === 'object') ? currentPost : null;
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!current || !list.length) return [];

    const currentIds = new Set([
      String(current.id || '').trim(),
      String(current.uuid || '').trim(),
    ].filter(Boolean));

    const scored = [];
    list.forEach((candidate) => {
      const candidateIds = [
        String(candidate && candidate.id || '').trim(),
        String(candidate && candidate.uuid || '').trim(),
      ].filter(Boolean);
      if (candidateIds.some((value) => currentIds.has(value))) return;

      const normalizedCandidate = normalizePost(candidate);
      const result = getRelatedPostScore(normalizedCandidate, current, options);
      if (!Number.isFinite(result.score) || result.score <= -9999) return;

      scored.push({
        ...normalizedCandidate,
        _kcRelatedScore: result.score,
        _kcRelatedReason: result.reason,
      });
    });

    scored.sort((left, right) => {
      const scoreDiff = Number(right._kcRelatedScore || 0) - Number(left._kcRelatedScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return getRelatedPostTimestamp(right) - getRelatedPostTimestamp(left);
    });

    const seen = new Set();
    return scored.filter((item) => {
      const key = String(item.uuid || item.id || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }


  const DEFAULTS = {
    baseURL: '',
    fallbackDatabaseURLs: ['data/database.json'],
    timeoutMs: 10000,
    debug: false,
  };

  const cfg = { ...DEFAULTS };
  const SESSION_STORE_VERSION = '9.0.0';
  const SESSION_STORE_PREFIX = `kc:${SESSION_STORE_VERSION}`;

  // Boot inicial (lê KC_ENV e aplica debug)
  (function bootstrapConfig() {
    cfg.debug = Boolean(ENV.debug);
  })();

  function getSessionStore() {
    try {
      return window.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function buildSessionStoreKey(scope, key) {
    return `${SESSION_STORE_PREFIX}:${String(scope || 'app').trim()}:${String(key || '').trim()}`;
  }

  function getSessionCache(scope, key, options) {
    const storage = getSessionStore();
    if (!storage) return null;
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};

    try {
      const raw = storage.getItem(buildSessionStoreKey(scope, key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== SESSION_STORE_VERSION) {
        storage.removeItem(buildSessionStoreKey(scope, key));
        return null;
      }

      const maxAge = Number(opts.maxAge) || 0;
      const age = Date.now() - (Number(parsed.timestamp) || 0);
      if (maxAge > 0 && (!Number.isFinite(age) || age > maxAge)) {
        if (opts.removeExpired !== false) storage.removeItem(buildSessionStoreKey(scope, key));
        return null;
      }

      return {
        value: parsed.value,
        timestamp: Number(parsed.timestamp) || 0,
        age: Number.isFinite(age) ? age : 0,
      };
    } catch (_) {
      return null;
    }
  }

  function setSessionCache(scope, key, value) {
    const storage = getSessionStore();
    if (!storage) return false;
    try {
      storage.setItem(buildSessionStoreKey(scope, key), JSON.stringify({
        version: SESSION_STORE_VERSION,
        timestamp: Date.now(),
        value: value == null ? null : value,
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeSessionCache(scope, key) {
    const storage = getSessionStore();
    if (!storage) return false;
    try {
      storage.removeItem(buildSessionStoreKey(scope, key));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSessionCachePrefix(scope, keyPrefix) {
    const storage = getSessionStore();
    if (!storage) return 0;
    const prefix = buildSessionStoreKey(scope, keyPrefix || '');
    let removed = 0;
    try {
      const toRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const currentKey = storage.key(index);
        if (currentKey && currentKey.indexOf(prefix) === 0) toRemove.push(currentKey);
      }
      toRemove.forEach((currentKey) => {
        storage.removeItem(currentKey);
        removed += 1;
      });
    } catch (_) { }
    return removed;
  }

  window.KCSessionStore = Object.freeze({
    version: SESSION_STORE_VERSION,
    key: buildSessionStoreKey,
    get: getSessionCache,
    set: setSessionCache,
    remove: removeSessionCache,
    clearPrefix: clearSessionCachePrefix,
  });

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
    'USER_SELF': { id: 'USER_SELF', displayName: 'Você', avatarUrl: '' },
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
      (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '',
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

    const status = String(r.status || '').trim().toLowerCase() || 'published';
    const visibility = String(r.visibility || meta.visibility || '').trim().toLowerCase() || 'public';
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
      status,
      visibility,

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
      // V8.4: legacy_id identifica posts de exemplo/fictícios
      legacyId: r.legacyId || r.legacy_id || null,
      legacy_id: r.legacy_id || r.legacyId || null,
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
      if (!meta.visibility && visibility) meta.visibility = visibility;
    } catch (_e) { }

    return out;
  }

  function filterPosts(posts, params = {}) {
    const p = params || {};

    const rawModuleFilter = (p.module != null ? p.module : (p.modulo != null ? p.modulo : p.modules));
    const moduleFilters = Array.isArray(rawModuleFilter)
      ? rawModuleFilter.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [String(rawModuleFilter || '').trim().toLowerCase()].filter(Boolean);
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

      if (moduleFilters.length && !moduleFilters.includes(mod)) return false;
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
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha sao obrigatorios.' } };

    try {
      if (KCSupabase && typeof KCSupabase.signIn === 'function') {
        return await KCSupabase.signIn(em, pw);
      }
    } catch (err) { console.warn('[KCAPI] login falhou:', err && err.message || err); }
    return { user: null, session: null, error: { message: 'Nao foi possivel entrar.' } };
  }

  async function supabaseSignUp(email, password, options) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };

    if (KCSupabase && typeof KCSupabase.signUp === 'function') {
      return KCSupabase.signUp(em, pw, options);
    }
    return { user: null, session: null, error: { message: 'Supabase não configurado.' } };
  }

  async function supabaseResendConfirmation(email, options) {
    const em = String(email || '').trim();
    if (!em) return { ok: false, error: { message: 'Informe um e-mail valido.' } };

    try {
      if (KCSupabase && typeof KCSupabase.resendSignUp === 'function') {
        return await KCSupabase.resendSignUp(em, options);
      }
    } catch (err) { console.warn('[KCAPI] resend confirmation falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel reenviar a confirmacao.' } };
  }

  async function supabaseRequestPasswordReset(email, options) {
    const em = String(email || '').trim();
    if (!em) return { ok: false, error: { message: 'Informe um e-mail valido.' } };

    try {
      if (KCSupabase && typeof KCSupabase.requestPasswordReset === 'function') {
        return await KCSupabase.requestPasswordReset(em, options);
      }
    } catch (err) { console.warn('[KCAPI] password reset falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel enviar o link de redefinicao.' } };
  }

  async function supabaseUpdatePassword(password) {
    const pw = String(password || '').trim();
    if (!pw) return { ok: false, error: { message: 'Informe uma senha valida.' } };

    try {
      if (KCSupabase && typeof KCSupabase.updatePassword === 'function') {
        return await KCSupabase.updatePassword(pw);
      }
    } catch (err) { console.warn('[KCAPI] update password falhou:', err && err.message || err); }
    return { ok: false, error: { message: 'Nao foi possivel atualizar a senha.' } };
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
  async function getFeedCursor(params = {}) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.getFeedCursor !== 'function') {
      const posts = await driver.getPosts(params);
      return {
        posts: Array.isArray(posts) ? posts : [],
        nextCursor: null,
        hasMore: false,
      };
    }
    return driver.getFeedCursor(params);
  }
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

  async function togglePostStatus(postId) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.togglePostStatus !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Toggle de status indisponível neste driver.' };
    }
    return driver.togglePostStatus(postId);
  }

  async function renewPost(postId) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.renewPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Renovação indisponível neste driver.' };
    }
    return driver.renewPost(postId);
  }

  async function bumpPost(postId) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.bumpPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Impulsionamento indisponível neste driver.' };
    }
    return driver.bumpPost(postId);
  }

  async function getTopContributors(period, module, limit) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.getTopContributors !== 'function') return [];
    return driver.getTopContributors(period, module, limit);
  }

  async function trackCouponClick(postId) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.trackCouponClick !== 'function') return { ok: false };
    return driver.trackCouponClick(postId);
  }

  async function trackShare(postId) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.trackShare !== 'function') return { ok: false };
    return driver.trackShare(postId);
  }

  async function checkDuplicatePost(userId, module, title) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.checkDuplicatePost !== 'function') return { ok: false, candidates: [] };
    return driver.checkDuplicatePost(userId, module, title);
  }


  // Auth facade (sem quebrar modo local)
  // - signIn/signUp retornam { user, error }
  async function getCurrentUser() {
    if (ENV.driver !== 'supabase') return null;
    return supabaseGetCurrentUser();
  }

  async function signIn(email, password) {
    if (ENV.driver !== 'supabase') return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    const result = await supabaseLogin(email, password);
    if (result && result.error) return result;
    return result || { user: null, session: null, error: { message: 'Nao foi possivel entrar. Verifique seus dados.' } };
  }

  async function signUp(email, password, options) {
    if (ENV.driver !== 'supabase') return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
    const r = await supabaseSignUp(email, password, options);
    return r || { user: null, error: { message: 'Não foi possível cadastrar.' } };
  }

  async function resendConfirmation(email, options) {
    if (ENV.driver !== 'supabase') return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    return supabaseResendConfirmation(email, options);
  }

  async function requestPasswordReset(email, options) {
    if (ENV.driver !== 'supabase') return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    return supabaseRequestPasswordReset(email, options);
  }

  async function updatePassword(password) {
    if (ENV.driver !== 'supabase') return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
    return supabaseUpdatePassword(password);
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
        profile_public: true,
        contact_primary_method: null,
        contact_cta_enabled: true,
        social_links: {},
        social_visibility: {},
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

  async function addComment(postId, body, options = {}) {
    const policyError = enforceSupabaseOnProduction('addComment');
    if (policyError) return policyError;
    if (ENV.driver !== 'supabase' || !getActiveDriver().addComment) return null;
    return getActiveDriver().addComment(postId, body, options);
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
    const driver = getActiveDriver();
    if (!driver || typeof driver.getPostsByAuthorId !== 'function') return [];
    return getActiveDriver().getPostsByAuthorId(authorId, params);
  }

  async function getRelatedPosts(postId, options = {}) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.getRelatedPosts !== 'function') return [];
    return driver.getRelatedPosts(postId, options);
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

  async function createHelpRequest(payload = {}) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.createHelpRequest !== 'function') {
      return { ok: false, error: { message: 'Pedidos de ajuda indisponíveis neste driver.' } };
    }
    return driver.createHelpRequest(payload);
  }

  async function listAdminHelpRequests(filters = {}) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.listAdminHelpRequests !== 'function') return [];
    return driver.listAdminHelpRequests(filters);
  }

  async function updateAdminHelpRequest(id, patch = {}) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.updateAdminHelpRequest !== 'function') {
      return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };
    }
    return driver.updateAdminHelpRequest(id, patch);
  }

  // Notifications (v9.1.0)

  async function getNotifications(limit, offset) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.getNotifications !== 'function') {
      return { ok: false, notifications: [], unread: 0, total: 0 };
    }
    return driver.getNotifications(limit, offset);
  }

  async function markNotificationsRead(ids) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.markNotificationsRead !== 'function') {
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return driver.markNotificationsRead(ids);
  }

  async function markAllNotificationsRead() {
    const driver = getActiveDriver();
    if (!driver || typeof driver.markAllNotificationsRead !== 'function') {
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return driver.markAllNotificationsRead();
  }

  async function getUnreadNotificationCount() {
    const driver = getActiveDriver();
    if (!driver || typeof driver.getUnreadNotificationCount !== 'function') return 0;
    return driver.getUnreadNotificationCount();
  }

  function subscribeNotifications(userId, callback) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.subscribeNotifications !== 'function') return null;
    return driver.subscribeNotifications(userId, callback);
  }

  function unsubscribeNotifications(channel) {
    const driver = getActiveDriver();
    if (!driver || typeof driver.unsubscribeNotifications !== 'function') return;
    driver.unsubscribeNotifications(channel);
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
    getFeedCursor,
    getPostById,
    createPost,
    updatePost,
    deletePost,
    reportPost,
    togglePostStatus,
    renewPost,
    bumpPost,
    getTopContributors,
    trackCouponClick,
    trackShare,
    checkDuplicatePost,

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
    getRelatedPosts,
    getSavedPostState,
    setSavedPostState,
    clearSavedPostState,
    getMySavedPosts,
    getMySavedPostsCount,
    getProfileHighlights,
    getProfileHighlightsCount,
    createHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,

    // Notifications (v9.1.0)
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,

    // Auth (Supabase)
    getCurrentUser,
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    // compat
    login,
    logout,

    // Profiles (Supabase)
    getCurrentProfile,
    getProfileById,
    syncProfile,
    getLastCreatePostError,
    setLastCreatePostError,
    clearLastCreatePostError,
    summarizeCreatePayloadForDiagnostics,
    rankRelatedPosts,


    // Users
    MOCK_USERS,

    apiURL,
    DEFAULTS,
    MOCK_USERS_BY_ID,
    MOCK_USERS_LIST,

    getAuthorById,

    // Utils
    filterPosts,
    normalizePost,
    isBackendEnabled,
  });

  window.getLastCreatePostError = getLastCreatePostError;
  window.setLastCreatePostError = setLastCreatePostError;
  window.clearLastCreatePostError = clearLastCreatePostError;
  window.summarizeCreatePayloadForDiagnostics = summarizeCreatePayloadForDiagnostics;

})();
