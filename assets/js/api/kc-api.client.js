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

  // Related Posts split (v11.33.5)
  // Implementacoes foram movidas para window._KCAPI.related (kc-api.related.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getRelatedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.related = window._KCAPI.related || {};

  function getRelatedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const related = window._KCAPI.related;
    return (related && typeof related === 'object') ? related : null;
  }

  function buildRelatedDeps() {
    return {
      getActiveDriver,
      normalizePost,
    };
  }

  function rankRelatedPosts(currentPost, candidates, options) {
    const relatedModule = getRelatedModule();
    if (relatedModule && typeof relatedModule.rankRelatedPosts === 'function') {
      return relatedModule.rankRelatedPosts(currentPost, candidates, options, buildRelatedDeps());
    }
    return [];
  }

  function normalizeFilterText(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
      return window.KCUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function slugifyFilterKey(value) {
    const normalized = normalizeFilterText(value);
    if (!normalized) return '';
    return normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function toFilterList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (value == null || value === '') return [];
    return [String(value).trim()].filter(Boolean);
  }

  function toNormalizedFilterSet(value, normalizer) {
    const normalize = typeof normalizer === 'function' ? normalizer : ((input) => String(input || '').trim());
    return new Set(toFilterList(value).map((item) => normalize(item)).filter(Boolean));
  }

  function toBooleanFlag(value) {
    if (value === true || value === false) return value;
    const normalized = normalizeFilterText(value);
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'sim';
  }

  function getPostMeta(post) {
    if (!post || typeof post !== 'object' || Array.isArray(post)) return {};
    const meta = post.metadata || post.meta || post._meta;
    return (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {};
  }

  function collectPostTextParts(post) {
    const meta = getPostMeta(post);
    const values = [
      post && (post.titulo || post.title),
      post && (post.descricao || post.description),
      post && (post.categoria || post.category),
      post && (post.categoriaLabel || post.categoryLabel),
      post && (post.subcategoria || post.subcategory),
      post && (post.subcategoriaLabel || post.subcategoryLabel),
      post && (post.localizacao || post.location),
      post && post.condicao,
      post && post.origem,
      post && post.destino,
      post && post.horario,
      post && post.area,
      post && post.areaLabel,
      post && post.modalidadeTrabalho,
      post && post.regimeContratacao,
      meta.categoria,
      meta.category,
      meta.subcategoria,
      meta.subcategory,
      meta.localizacao,
      meta.location,
      meta.condicao,
      meta.origem,
      meta.destino,
      meta.horario,
      meta.area,
      meta.areaLabel,
      meta.workMode,
      meta.workModeLabel,
      meta.modalidadeTrabalho,
      meta.regimeContratacao,
      meta.employmentType,
      meta.employmentTypeLabel,
    ];
    [
      post && post.tags,
      post && post.tagKeys,
      post && post.housingFeatureLabels,
      post && post.housingFeatureKeys,
      post && post.caronasFeatureLabels,
      post && post.caronasFeatureKeys,
      post && post.features,
      meta.tags,
      meta.tagKeys,
      meta.housingFeatureLabels,
      meta.housingFeatureKeys,
      meta.caronasFeatureLabels,
      meta.caronasFeatureKeys,
      meta.features,
      meta.marcadoresMoradia,
      meta.marcadoresCarona,
    ].forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => values.push(item));
    });
    return values.filter(Boolean);
  }

  function getPostSearchHaystack(post) {
    return normalizeFilterText(collectPostTextParts(post).join(' '));
  }

  function normalizeMarketCategoryKey(value) {
    const key = normalizeFilterText(value).replace(/^#/, '');
    if (!key) return '';
    if (['eletronicos', 'livros', 'moveis', 'vestuario', 'outros'].includes(key)) return key;
    if (!key.endsWith('s') && ['eletronicos', 'livros', 'moveis', 'vestuario', 'outros'].includes(key + 's')) return key + 's';
    if (key.includes('eletron')) return 'eletronicos';
    if (key.includes('livr')) return 'livros';
    if (key.includes('mov') || key.includes('mobil')) return 'moveis';
    if (key.includes('vest') || key.includes('roup')) return 'vestuario';
    if (key.includes('outro')) return 'outros';
    return key;
  }

  function normalizeMarketConditionKey(value) {
    const key = normalizeFilterText(value);
    if (!key) return '';
    if (key.includes('semi')) return 'seminovo';
    if (key.includes('novo')) return 'novo';
    if (key.includes('usado')) return 'usado';
    return key.replace(/\s+/g, '');
  }

  function getMarketSummary(post) {
    const meta = getPostMeta(post);
    const moduleKey = normalizeFilterText(post && (post.modulo || post.module));
    let categoryKey = normalizeMarketCategoryKey(
      post && (post._kcTabCategoryKey || post.categoriaKey || post.categoria || post.categoryKey || post.category)
      || meta.categoryKey
      || meta.categoriaKey
      || meta.category
      || meta.categoria
    );
    if (!categoryKey && moduleKey === 'livros') categoryKey = 'livros';
    if (!categoryKey) categoryKey = normalizeMarketCategoryKey(getPostSearchHaystack(post));
    return {
      categoryKey: categoryKey || 'outros',
      conditionKey: normalizeMarketConditionKey(post && post.condicao ? post.condicao : meta.condicao),
      verified: !!(post && (post.authorVerified === true || post.verificado === true || post.verified === true || meta.verificado === true)),
    };
  }

  function normalizeOpportunityTypeKey(value, sourceText) {
    const direct = normalizeFilterText(value).replace(/^#/, '');
    if (direct.includes('estag')) return 'estagio';
    if (direct.includes('empreg')) return 'emprego';
    if (direct.includes('freela') || direct.includes('freelancer')) return 'freelancer';
    if (direct.includes('monitor')) return 'monitoria';
    if (direct.includes('volunt')) return 'voluntariado';

    const haystack = normalizeFilterText(sourceText);
    if (haystack.includes('freelancer') || haystack.includes('freela')) return 'freelancer';
    if (haystack.includes('monitoria') || haystack.includes('monitor ')) return 'monitoria';
    if (haystack.includes('volunt')) return 'voluntariado';
    if (haystack.includes('estagio') || haystack.includes('trainee')) return 'estagio';
    if (haystack.includes('emprego') || haystack.includes('clt') || haystack.includes('vaga')) return 'emprego';
    return direct || '';
  }

  function resolveOpportunityWorkMode(post) {
    const meta = getPostMeta(post);
    const text = normalizeFilterText([
      meta.workModeLabel,
      meta.workMode,
      meta.modalidadeTrabalho,
      post && post.modalidadeTrabalho,
      post && post.workMode,
      post && post.titulo,
      post && post.descricao,
    ].filter(Boolean).join(' '));
    if (text.includes('hibrid') || text.includes('hybrid')) return { key: 'hibrido', remote: true, presencial: true };
    if (text.includes('remot') || text.includes('home office') || text.includes('home-office')) return { key: 'remoto', remote: true, presencial: false };
    if (text.includes('presencial') || text.includes('onsite') || text.includes('on site') || text.includes('on-site')) return { key: 'presencial', remote: false, presencial: true };
    return { key: '', remote: false, presencial: false };
  }

  function resolveOpportunityRegime(post) {
    const meta = getPostMeta(post);
    const text = normalizeFilterText([
      meta.employmentTypeLabel,
      meta.employmentType,
      meta.regimeContratacao,
      post && post.regimeContratacao,
      post && post.titulo,
      post && post.descricao,
    ].filter(Boolean).join(' '));
    if (text.includes('jovem aprendiz') || text.includes('aprendiz')) return 'jovem-aprendiz';
    if (text.includes('temporario')) return 'temporario';
    if (text.includes('clt')) return 'clt';
    if (text.includes('pj') || text.includes('pessoa juridica')) return 'pj';
    return '';
  }

  function getOpportunityAreaKey(post) {
    if (window.KCUtils && typeof window.KCUtils.resolveOpportunityArea === 'function') {
      const resolved = window.KCUtils.resolveOpportunityArea(post);
      if (resolved && resolved.key) return String(resolved.key).trim();
    }
    const meta = getPostMeta(post);
    return String(post && (post.areaKey || post.area) || meta.areaKey || meta.area || '').trim();
  }

  function getHousingFeatureKeys(post) {
    if (window.KCUtils && typeof window.KCUtils.resolveHousingFeatures === 'function') {
      const resolved = window.KCUtils.resolveHousingFeatures(post);
      if (Array.isArray(resolved) && resolved.length) {
        return resolved.map((entry) => String(entry && entry.key || '').trim()).filter(Boolean);
      }
    }
    const meta = getPostMeta(post);
    const raw = []
      .concat(Array.isArray(post && post.housingFeatureKeys) ? post.housingFeatureKeys : [])
      .concat(Array.isArray(post && post.housingFeatureLabels) ? post.housingFeatureLabels : [])
      .concat(Array.isArray(post && post.marcadoresMoradia) ? post.marcadoresMoradia : [])
      .concat(Array.isArray(post && post.features) ? post.features : [])
      .concat(Array.isArray(meta.housingFeatureKeys) ? meta.housingFeatureKeys : [])
      .concat(Array.isArray(meta.housingFeatureLabels) ? meta.housingFeatureLabels : [])
      .concat(Array.isArray(meta.marcadoresMoradia) ? meta.marcadoresMoradia : [])
      .concat(Array.isArray(meta.features) ? meta.features : []);
    return Array.from(new Set(raw.map(slugifyFilterKey).filter(Boolean)));
  }

  function getHousingRegionSummary(post) {
    if (window.KCUtils && typeof window.KCUtils.resolveHousingRegion === 'function') {
      const resolved = window.KCUtils.resolveHousingRegion(post);
      if (resolved) {
        return {
          regionKey: String(resolved.key || '').trim(),
          zoneKey: String(resolved.zoneKey || '').trim(),
        };
      }
    }
    const meta = getPostMeta(post);
    return {
      regionKey: String(post && (post.regionKey || post.regiao) || meta.regionKey || meta.regiao || meta.region || '').trim(),
      zoneKey: String(post && post.regionZoneKey || meta.regionZoneKey || '').trim(),
    };
  }

  function normalizeLostFoundStatus(value) {
    const normalized = normalizeFilterText(value);
    if (!normalized) return '';
    if (normalized.includes('perd')) return 'perdido';
    if (normalized.includes('encontr') || normalized.includes('achad')) return 'encontrado';
    return normalized;
  }

  function normalizeLostFoundType(value) {
    const normalized = normalizeFilterText(value);
    if (!normalized) return '';
    if (normalized.includes('document')) return 'documento';
    if (normalized.includes('eletron')) return 'eletronico';
    if (normalized.includes('outro')) return 'outro';
    return normalized;
  }

  function getLostFoundSummary(post) {
    const meta = getPostMeta(post);
    let locationKey = '';
    if (window.KCUtils && typeof window.KCUtils.resolveLostFoundLocation === 'function') {
      const resolved = window.KCUtils.resolveLostFoundLocation(post);
      if (resolved && resolved.key) locationKey = String(resolved.key).trim();
    }
    if (!locationKey) locationKey = String(post && post.lostFoundLocationKey || meta.lostFoundLocationKey || '').trim();
    return {
      statusKey: normalizeLostFoundStatus(post && (post.categoriaKey || post.categoria) || meta.categoriaKey || meta.categoria),
      typeKey: normalizeLostFoundType(post && (post.subcategoriaKey || post.subcategoria) || meta.subcategory || meta.subcategoria),
      locationKey,
    };
  }

  function classifyRidePeriod(value) {
    const match = String(value || '').match(/(\d{1,2})[h:.]?(\d{2})?/);
    if (!match) return '';
    const hour = parseInt(match[1], 10);
    if (!Number.isFinite(hour)) return '';
    if (hour >= 5 && hour < 12) return 'matutino';
    if (hour >= 12 && hour < 18) return 'vespertino';
    return 'noturno';
  }

  function caronasCampusMatches(campus, haystack) {
    const wanted = normalizeFilterText(campus);
    const text = normalizeFilterText(haystack);
    if (!wanted || !text) return false;
    if (wanted === 'campus-ii') return text.includes('campus ii') || text.includes('samambaia');
    if (wanted === 'campus-samambaia') return text.includes('campus samambaia') || text.includes('campus ii') || text.includes('samambaia');
    if (wanted === 'campus-colemar') return text.includes('campus colemar') || text.includes('colemar') || text.includes('praca universitaria');
    return text.includes(wanted.replace(/-/g, ' ')) || text.includes(wanted);
  }

  function getRideFeatureKeys(post) {
    const meta = getPostMeta(post);
    const raw = []
      .concat(Array.isArray(post && post.caronasFeatureKeys) ? post.caronasFeatureKeys : [])
      .concat(Array.isArray(post && post.caronasFeatureLabels) ? post.caronasFeatureLabels : [])
      .concat(Array.isArray(post && post.marcadoresCarona) ? post.marcadoresCarona : [])
      .concat(Array.isArray(meta.caronasFeatureKeys) ? meta.caronasFeatureKeys : [])
      .concat(Array.isArray(meta.caronasFeatureLabels) ? meta.caronasFeatureLabels : [])
      .concat(Array.isArray(meta.marcadoresCarona) ? meta.marcadoresCarona : []);
    return Array.from(new Set(raw.map(slugifyFilterKey).filter(Boolean)));
  }

  function toNumericFilterValue(value) {
    if (value == null || value === '') return null;
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function getPostPriceValue(post) {
    const meta = getPostMeta(post);
    const candidates = [
      post && (post.preco != null ? post.preco : post.price),
      meta.preco,
      meta.price,
      meta.remuneracao,
      meta.contribuicao,
      meta.precoTexto,
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const numeric = toNumericFilterValue(candidates[index]);
      if (numeric != null) return numeric;
    }

    return null;
  }

  const FEED_DATE_TIMEZONE = 'America/Sao_Paulo';
  const FEED_DATE_PRESETS = Object.freeze({
    'compra-venda': Object.freeze(['today', 'last7d', 'last30d']),
    livros: Object.freeze(['today', 'last7d', 'last30d']),
    moradia: Object.freeze(['today', 'last7d', 'last30d']),
    oportunidades: Object.freeze(['today', 'last7d', 'last30d']),
    'achados-perdidos': Object.freeze(['today', 'last7d', 'last30d']),
    caronas: Object.freeze(['today', 'last3d', 'last7d']),
    eventos: Object.freeze(['today', 'next7d', 'thisMonth', 'past']),
  });

  function getFeedFilterDateUtils() {
    const utils = (typeof window !== 'undefined' && window.KCFeedFilters) ? window.KCFeedFilters : null;
    if (utils && typeof utils.matchesDatePreset === 'function') return utils;
    return null;
  }

  function formatDateKeyParts(year, month, day) {
    const y = parseInt(String(year || '0'), 10);
    const m = parseInt(String(month || '0'), 10);
    const d = parseInt(String(day || '0'), 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || y <= 0 || m <= 0 || d <= 0) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseDateKey(dateKey) {
    const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
    };
  }

  function shiftDateKey(dateKey, deltaDays) {
    const parsed = parseDateKey(dateKey);
    if (!parsed) return '';
    const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
    base.setUTCDate(base.getUTCDate() + (parseInt(String(deltaDays || '0'), 10) || 0));
    return formatDateKeyParts(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  }

  function getDateKeyFormatter() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: FEED_DATE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch (_) {
      return null;
    }
  }

  function getDateKeyInZone(input) {
    const shared = getFeedFilterDateUtils();
    if (shared && typeof shared.getDateKeyInZone === 'function') return shared.getDateKeyInZone(input);

    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (!date || Number.isNaN(date.getTime())) return '';

    const formatter = getDateKeyFormatter();
    if (formatter && typeof formatter.formatToParts === 'function') {
      const parts = formatter.formatToParts(date);
      const bag = {};
      parts.forEach((part) => {
        if (part && part.type) bag[part.type] = part.value;
      });
      return formatDateKeyParts(bag.year, bag.month, bag.day);
    }

    return formatDateKeyParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function getCurrentDateKey(nowValue) {
    const shared = getFeedFilterDateUtils();
    if (shared && typeof shared.getCurrentDateKey === 'function') return shared.getCurrentDateKey(nowValue);
    return getDateKeyInZone(nowValue || new Date());
  }

  function normalizeDatePreset(moduleKey, value) {
    const shared = getFeedFilterDateUtils();
    if (shared && typeof shared.normalizeDatePreset === 'function') return shared.normalizeDatePreset(moduleKey, value);

    const key = normalizeFilterText(moduleKey);
    const allowed = FEED_DATE_PRESETS[key] ? FEED_DATE_PRESETS[key].slice() : [];
    const normalized = normalizeFilterText(value);
    if (!normalized || !allowed.length) return '';
    return allowed.includes(normalized) ? normalized : '';
  }

  function getEventDateKey(post) {
    const shared = getFeedFilterDateUtils();
    if (shared && typeof shared.getEventDateKey === 'function') return shared.getEventDateKey(post);

    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const meta = getPostMeta(source);
    const raw = [
      meta.data_evento,
      meta.dataEvento,
      meta.data,
      source.data_evento,
      source.dataEvento,
      source.data,
    ].find((entry) => String(entry || '').trim());
    const text = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    return getDateKeyInZone(source.created_at || source.createdAt || source.timestamp || null);
  }

  function matchesDatePresetFilter(options) {
    const shared = getFeedFilterDateUtils();
    if (shared && typeof shared.matchesDatePreset === 'function') return shared.matchesDatePreset(options);

    const opt = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const moduleKey = normalizeFilterText(opt.moduleKey || opt.module || opt.pageModule);
    const preset = normalizeDatePreset(moduleKey, opt.preset);
    if (!preset) return true;

    const todayKey = getCurrentDateKey(opt.now || new Date());
    if (!todayKey) return true;

    const createdKey = opt.createdKey || getDateKeyInZone(opt.createdAt || opt.created_at || null);
    const eventKey = opt.eventKey || getEventDateKey(opt.post || opt);
    const candidateKey = moduleKey === 'eventos' ? eventKey : createdKey;
    if (!candidateKey) return false;

    if (preset === 'today') return candidateKey === todayKey;
    if (preset === 'last3d') return candidateKey >= shiftDateKey(todayKey, -2) && candidateKey <= todayKey;
    if (preset === 'last7d') return candidateKey >= shiftDateKey(todayKey, -6) && candidateKey <= todayKey;
    if (preset === 'last30d') return candidateKey >= shiftDateKey(todayKey, -29) && candidateKey <= todayKey;
    if (preset === 'next7d') return candidateKey >= todayKey && candidateKey <= shiftDateKey(todayKey, 6);
    if (preset === 'thisMonth') return String(candidateKey).slice(0, 7) === String(todayKey).slice(0, 7);
    if (preset === 'past') return candidateKey < todayKey;
    return true;
  }

  function matchesAdvancedRequestParams(post, params) {
    const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const moduleKey = normalizeFilterText(post && (post.modulo || post.module));
    const meta = getPostMeta(post);
    const datePreset = normalizeDatePreset(moduleKey, p.datePreset);

    if (datePreset) {
      const createdAt = post && (post.created_at || post.createdAt || post.timestamp || null);
      const eventDate = getEventDateKey(post);
      if (!matchesDatePresetFilter({
        moduleKey,
        preset: datePreset,
        createdAt,
        eventKey: eventDate,
        post,
      })) {
        return false;
      }
    }

    const marketCats = toNormalizedFilterSet(p.marketCats, normalizeMarketCategoryKey);
    const marketConds = toNormalizedFilterSet(p.marketConds, normalizeMarketConditionKey);
    const marketVerified = toBooleanFlag(p.marketVerified);
    if (marketCats.size || marketConds.size || marketVerified) {
      if (!['compra-venda', 'livros'].includes(moduleKey)) return false;
      const market = getMarketSummary(post);
      if (marketCats.size && !marketCats.has(market.categoryKey)) return false;
      if (marketConds.size && !marketConds.has(market.conditionKey)) return false;
      if (marketVerified && !market.verified) return false;
    }

    const rideTypes = toNormalizedFilterSet(p.rideType, normalizeFilterText);
    const rideCampi = toNormalizedFilterSet(p.rideCampus, normalizeFilterText);
    const ridePeriods = toNormalizedFilterSet(p.ridePeriod, normalizeFilterText);
    const rideFeatures = toNormalizedFilterSet(p.rideFeatures, slugifyFilterKey);
    const rideVerified = toBooleanFlag(p.rideVerified);
    const rideOrigin = normalizeFilterText(p.rideOrigin);
    const rideDestination = normalizeFilterText(p.rideDestination);
    if (rideTypes.size || rideCampi.size || ridePeriods.size || rideFeatures.size || rideVerified || rideOrigin || rideDestination) {
      if (moduleKey !== 'caronas') return false;
      const haystack = getPostSearchHaystack(post);
      if (rideTypes.size && rideTypes.size < 2) {
        if (rideTypes.has('ofereco') && !haystack.includes('ofereco')) return false;
        if (rideTypes.has('procuro') && !haystack.includes('procuro')) return false;
      }
      if (rideCampi.size) {
        const campusMatch = Array.from(rideCampi).some((campus) => caronasCampusMatches(campus, haystack));
        if (!campusMatch) return false;
      }
      if (rideVerified && !(post && (post.authorVerified === true || post.verificado === true || post.verified === true || meta.verificado === true))) return false;
      if (ridePeriods.size) {
        const period = classifyRidePeriod(post && post.horario ? post.horario : meta.horario);
        if (!period || !ridePeriods.has(period)) return false;
      }
      const rideFeatureKeys = new Set(getRideFeatureKeys(post));
      if (rideFeatures.size && !Array.from(rideFeatures).every((key) => rideFeatureKeys.has(key))) return false;
      const originText = normalizeFilterText(post && post.origem ? post.origem : meta.origem);
      const destinationText = normalizeFilterText(post && post.destino ? post.destino : meta.destino);
      if (rideOrigin && !(originText.includes(rideOrigin) || haystack.includes(rideOrigin))) return false;
      if (rideDestination && !(destinationText.includes(rideDestination) || haystack.includes(rideDestination))) return false;
    }

    const housingFeatures = toNormalizedFilterSet(p.housingFeatures, slugifyFilterKey);
    const housingRegion = normalizeFilterText(p.housingRegion);
    if (housingFeatures.size || housingRegion) {
      if (moduleKey !== 'moradia') return false;
      const featureKeys = new Set(getHousingFeatureKeys(post));
      if (housingFeatures.size && !Array.from(housingFeatures).every((key) => featureKeys.has(key))) return false;
      if (housingRegion) {
        const region = getHousingRegionSummary(post);
        const normalizedRegion = normalizeFilterText(region.regionKey);
        const normalizedZone = normalizeFilterText(region.zoneKey);
        if (normalizedRegion !== housingRegion && normalizedZone !== housingRegion) return false;
      }
    }

    const oppTypes = toNormalizedFilterSet(p.oppType, normalizeFilterText);
    const oppModes = toNormalizedFilterSet(p.oppMode, normalizeFilterText);
    const oppArea = normalizeFilterText(p.oppArea);
    if (oppTypes.size || oppModes.size || oppArea) {
      if (moduleKey !== 'oportunidades') return false;
      const aggregateText = collectPostTextParts(post).join(' ');
      const type = normalizeOpportunityTypeKey(post && (post.categoriaKey || post.categoria) || meta.categoryKey || meta.category, aggregateText);
      const regimeKey = resolveOpportunityRegime(post);
      const workMode = resolveOpportunityWorkMode(post);
      const areaKey = normalizeFilterText(getOpportunityAreaKey(post));
      if (oppTypes.size) {
        const typeMatch = Array.from(oppTypes).some((filterKey) => {
          if (filterKey === 'emprego-clt') return type === 'emprego' && regimeKey === 'clt';
          return type === filterKey;
        });
        if (!typeMatch) return false;
      }
      if (oppModes.size) {
        const modeMatch = Array.from(oppModes).some((filterKey) => {
          if (filterKey === 'hibrido') return workMode.key === 'hibrido';
          if (filterKey === 'remoto') return workMode.remote;
          if (filterKey === 'presencial') return workMode.presencial;
          return false;
        });
        if (!modeMatch) return false;
      }
      if (oppArea && areaKey !== oppArea) return false;
    }

    const lfStatuses = toNormalizedFilterSet(p.lfStatus, normalizeLostFoundStatus);
    const lfTypes = toNormalizedFilterSet(p.lfType, normalizeLostFoundType);
    const lfLocation = normalizeFilterText(p.lfLocation);
    if (lfStatuses.size || lfTypes.size || lfLocation) {
      if (moduleKey !== 'achados-perdidos') return false;
      const summary = getLostFoundSummary(post);
      if (lfStatuses.size && !lfStatuses.has(summary.statusKey)) return false;
      if (lfTypes.size && !lfTypes.has(summary.typeKey)) return false;
      if (lfLocation && normalizeFilterText(summary.locationKey) !== lfLocation) return false;
    }

    let priceMin = toNumericFilterValue(p.priceMin);
    let priceMax = toNumericFilterValue(p.priceMax);
    if (priceMin != null || priceMax != null) {
      if (priceMin != null && priceMax != null && priceMax < priceMin) {
        const nextMin = priceMax;
        priceMax = priceMin;
        priceMin = nextMin;
      }
      const priceValue = getPostPriceValue(post);
      if (priceValue == null) return false;
      if (priceMin != null && priceValue < priceMin) return false;
      if (priceMax != null && priceValue > priceMax) return false;
    }

    return true;
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
  // Constantes SWR de analytics e comments movidas para os sub-módulos v11.32.5/v11.32.6.

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

  function withPendingSessionRequest(bucket, key, factory) {
    if (bucket.has(key)) return bucket.get(key);
    const pending = Promise.resolve()
      .then(factory)
      .finally(() => {
        bucket.delete(key);
      });
    bucket.set(key, pending);
    return pending;
  }

  function getCachedSessionPayload(scope, key, maxAgeMs, staleMaxAgeMs, options = {}) {
    const cached = getSessionCache(scope, key);
    if (!cached || !cached.value || typeof cached.value !== 'object') return null;

    const age = Number(cached.age) || 0;
    const hardLimit = Number(staleMaxAgeMs) || 0;
    if (hardLimit > 0 && age > hardLimit) {
      removeSessionCache(scope, key);
      return null;
    }

    const freshLimit = Number(maxAgeMs) || 0;
    const allowStale = !!(options && options.allowStale);
    const isFresh = freshLimit <= 0 ? true : age <= freshLimit;
    if (!allowStale && !isFresh) return null;

    return {
      data: cached.value.data,
      signature: String(cached.value.signature || ''),
      timestamp: Number(cached.timestamp) || 0,
      age,
      isFresh,
    };
  }

  function persistSessionPayload(scope, key, data, signature) {
    setSessionCache(scope, key, {
      data: data == null ? null : data,
      signature: String(signature || ''),
    });
  }

  // getCommentsCacheIdentity, getPostAnalyticsCacheKey, getCommentsCacheKey,
  // buildPostAnalyticsSignature, normalizeCommentsPayload, buildCommentsSignature
  // movidos para os sub-módulos kc-api.posts-read.js e kc-api.comments-votes.js.

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
    const authorProfile = (r.authorProfile && typeof r.authorProfile === 'object' && !Array.isArray(r.authorProfile))
      ? { ...r.authorProfile }
      : null;
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
    const bumpedAt = r.bumpedAt || r.bumped_at || null;
    const bumped_at = r.bumped_at || r.bumpedAt || null;
    const effectiveAt = r.effectiveAt || r.effective_at || bumpedAt || createdAt || null;
    const effective_at = r.effective_at || r.effectiveAt || bumped_at || created_at || null;
    const timestamp = r.timestamp || effectiveAt || createdAt || '';
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
    const isClosed = status === 'closed';
    const visibility = String(r.visibility || meta.visibility || '').trim().toLowerCase() || 'public';
    const tagLabels = Array.isArray(r.tags) ? r.tags : [];
    const tagKeys = Array.isArray(r.tagKeys) ? r.tagKeys : (tagLabels.length ? tagLabels : []);
    const ratingRaw = (r.rating != null)
      ? r.rating
      : (r.rating_avg != null ? r.rating_avg : (authorProfile && authorProfile.rating_avg != null ? authorProfile.rating_avg : null));
    const rating = (ratingRaw != null && ratingRaw !== '') ? Number(ratingRaw) : null;
    const ratingCountRaw = (r.ratingCount != null)
      ? r.ratingCount
      : (r.rating_count != null ? r.rating_count : (authorProfile && authorProfile.rating_count != null ? authorProfile.rating_count : 0));
    const ratingCount = Math.max(0, parseInt(String(ratingCountRaw != null ? ratingCountRaw : 0), 10) || 0);

    if (authorProfile) {
      authorProfile.rating_avg = Number.isFinite(rating) ? rating : null;
      authorProfile.rating_count = ratingCount;
      authorProfile.ratingAvg = authorProfile.rating_avg;
      authorProfile.ratingCount = authorProfile.rating_count;
    }

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
      bumpedAt,
      bumped_at,
      effectiveAt,
      effective_at,
      emoji,
      verificado,
      status,
      isClosed,
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
      rating: Number.isFinite(rating) && ratingCount > 0 ? rating : null,
      ratingCount,
      rating_count: ratingCount,
      votos: (r.votos != null ? r.votos : null),
      comentarios: (r.comentarios != null ? r.comentarios : null),
      condicao: r.condicao || r.condition || null,
      precoOriginal: (r.precoOriginal != null ? r.precoOriginal : null),
      precoTexto: r.precoTexto || r.priceText || null,
      imagens: Array.isArray(r.imagens) ? r.imagens : (Array.isArray(r.images) ? r.images : null),
      // Metadata (JSONB/local): mantém subcategory e labels para filtros
      metadata: meta,
      authorProfile,
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

  function normalizeUserRatingSummary(raw, fallbackUserId) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const averageRaw = source.average != null ? source.average : source.rating_avg;
    const average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    const countRaw = source.count != null ? source.count : source.rating_count;
    const count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || fallbackUserId || '').trim() || null,
      average: Number.isFinite(average) ? average : null,
      count,
    };
  }

  function normalizeUserRatingEntry(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const reviewer = (source.reviewer && typeof source.reviewer === 'object' && !Array.isArray(source.reviewer))
      ? source.reviewer
      : {};
    const rating = parseInt(String(source.rating != null ? source.rating : 0), 10);
    return {
      id: String(source.id || '').trim() || null,
      targetUserId: String(source.targetUserId || source.target_user_id || '').trim() || null,
      raterUserId: String(source.raterUserId || source.rater_user_id || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : 0,
      comment: String(source.comment || '').trim(),
      createdAt: source.createdAt || source.created_at || null,
      updatedAt: source.updatedAt || source.updated_at || null,
      reviewer: {
        id: String(reviewer.id || '').trim() || null,
        displayName: String(reviewer.displayName || reviewer.display_name || '').trim() || 'Membro da comunidade',
        avatarUrl: String(reviewer.avatarUrl || reviewer.avatar_url || '').trim() || null,
        public: reviewer.public === true,
      },
    };
  }

  function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    return {
      targetUserId: String(source.targetUserId || source.target_user_id || fallbackTargetUserId || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || fallbackContextPostId || '').trim() || null,
      canRate: source.canRate === true || source.can_rate === true,
      reason: String(source.reason || 'UNKNOWN').trim() || 'UNKNOWN',
      myRating: (source.myRating || source.my_rating) ? normalizeUserRatingEntry(source.myRating || source.my_rating) : null,
    };
  }

  function normalizeUserRatingList(raw, fallbackPage, fallbackLimit) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const items = Array.isArray(source.items) ? source.items.map(normalizeUserRatingEntry).filter(Boolean) : [];
    const page = Math.max(1, parseInt(String(source.page != null ? source.page : fallbackPage), 10) || 1);
    const limit = Math.max(1, parseInt(String(source.limit != null ? source.limit : fallbackLimit), 10) || 10);
    const total = Math.max(0, parseInt(String(source.total != null ? source.total : items.length), 10) || 0);
    return {
      items,
      page,
      limit,
      total,
      hasMore: source.hasMore === true || source.has_more === true,
    };
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

      if (!matchesAdvancedRequestParams(post, p)) return false;
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
  // Auth split (v11.33.6): supabase wrappers movidos para kc-api.auth.js

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
  // Posts-Feed split (v11.33.2)
  // Implementacoes foram movidas para window._KCAPI.postsFeed (kc-api.posts-feed.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsFeedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsFeed = window._KCAPI.postsFeed || {};

  function getPostsFeedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsFeed = window._KCAPI.postsFeed;
    return (postsFeed && typeof postsFeed === 'object') ? postsFeed : null;
  }

  function buildPostsFeedDeps() {
    return { getActiveDriver, ENV };
  }

  async function getPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPosts === 'function') {
      return postsFeedModule.getPosts(params, buildPostsFeedDeps());
    }
    return getActiveDriver().getPosts(params);
  }
  async function searchPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.searchPosts === 'function') {
      return postsFeedModule.searchPosts(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.searchPosts !== 'function') {
      const posts = await driver.getPosts(params);
      return Array.isArray(posts) ? posts : [];
    }
    const posts = await driver.searchPosts(params);
    return Array.isArray(posts) ? posts : [];
  }
  async function getFeedCursor(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getFeedCursor === 'function') {
      return postsFeedModule.getFeedCursor(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getFeedCursor !== 'function') {
      const posts = await driver.getPosts(params);
      return { posts: Array.isArray(posts) ? posts : [], nextCursor: null, hasMore: false };
    }
    return driver.getFeedCursor(params);
  }
  // Ratings split (v11.33.1)
  // Implementacoes foram movidas para window._KCAPI.ratings (kc-api.ratings.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getRatingsModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.ratings = window._KCAPI.ratings || {};

  function getRatingsModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const ratings = window._KCAPI.ratings;
    return (ratings && typeof ratings === 'object') ? ratings : null;
  }

  function buildRatingsDeps() {
    return {
      getActiveDriver,
      normalizeUserRatingSummary,
      normalizeUserRatingEntry,
      normalizeUserRatingState,
      normalizeUserRatingList,
    };
  }

  async function getUserRatingSummary(userId) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.getUserRatingSummary === 'function') {
      return ratingsModule.getUserRatingSummary(userId, buildRatingsDeps());
    }
    return normalizeUserRatingSummary(null, userId);
  }
  async function getUserRatingState(params = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.getUserRatingState === 'function') {
      return ratingsModule.getUserRatingState(params, buildRatingsDeps());
    }
    const input = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const fallbackTargetUserId = input.targetUserId || input.target_user_id || null;
    const fallbackContextPostId = input.contextPostId || input.context_post_id || null;
    return normalizeUserRatingState(null, fallbackTargetUserId, fallbackContextPostId);
  }
  async function listUserRatings(userId, options = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.listUserRatings === 'function') {
      return ratingsModule.listUserRatings(userId, options, buildRatingsDeps());
    }
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return normalizeUserRatingList(null, input.page || 1, input.limit || 10);
  }
  async function upsertUserRating(payload = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.upsertUserRating === 'function') {
      return ratingsModule.upsertUserRating(payload, buildRatingsDeps());
    }
    return { ok: false, error: { message: 'Avaliações indisponíveis neste driver.' } };
  }
  async function getPostById(id) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPostById === 'function') {
      return postsFeedModule.getPostById(id, buildPostsFeedDeps());
    }
    return getActiveDriver().getPostById(id);
  }
  // Posts-Write split (v11.33.3)
  // Implementacoes foram movidas para window._KCAPI.postsWrite (kc-api.posts-write.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsWriteModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsWrite = window._KCAPI.postsWrite || {};

  function getPostsWriteModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsWrite = window._KCAPI.postsWrite;
    return (postsWrite && typeof postsWrite === 'object') ? postsWrite : null;
  }

  function buildPostsWriteDeps() {
    return { getActiveDriver, ENV };
  }

  async function createPost(body) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.createPost === 'function') {
      return postsWriteModule.createPost(body, buildPostsWriteDeps());
    }
    const policyError = enforceSupabaseOnProduction('createPost');
    if (policyError) return policyError;
    return getActiveDriver().createPost(body);
  }
  async function updatePost(postId, payload) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.updatePost === 'function') {
      return postsWriteModule.updatePost(postId, payload, buildPostsWriteDeps());
    }
    if (!getActiveDriver().updatePost) return kcApiError('Edição indisponível neste driver.');
    return getActiveDriver().updatePost(postId, payload);
  }
  async function deletePost(postId) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.deletePost === 'function') {
      return postsWriteModule.deletePost(postId, buildPostsWriteDeps());
    }
    if (!getActiveDriver().deletePost) return kcApiError('Exclusão indisponível neste driver.');
    return getActiveDriver().deletePost(postId);
  }
  async function reportPost(postId, payload) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.reportPost === 'function') {
      return postsWriteModule.reportPost(postId, payload, buildPostsWriteDeps());
    }
    if (!getActiveDriver().reportPost) {
      return { ok: false, error: { message: 'Denúncias indisponíveis neste driver.' } };
    }
    return getActiveDriver().reportPost(postId, payload);
  }
  async function togglePostStatus(postId) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.togglePostStatus === 'function') {
      return postsWriteModule.togglePostStatus(postId, buildPostsWriteDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.togglePostStatus !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Toggle de status indisponível neste driver.' };
    }
    return driver.togglePostStatus(postId);
  }
  async function renewPost(postId) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.renewPost === 'function') {
      return postsWriteModule.renewPost(postId, buildPostsWriteDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.renewPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Renovação indisponível neste driver.' };
    }
    return driver.renewPost(postId);
  }
  async function bumpPost(postId) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.bumpPost === 'function') {
      return postsWriteModule.bumpPost(postId, buildPostsWriteDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.bumpPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Impulsionamento indisponível neste driver.' };
    }
    return driver.bumpPost(postId);
  }

  async function closePost(postId, payload = {}) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.closePost === 'function') {
      return postsWriteModule.closePost(postId, payload, buildPostsWriteDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.closePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Encerramento indisponivel neste driver.' };
    }
    return driver.closePost(postId, payload);
  }

  async function getTopContributors(period, module, limit) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getTopContributors === 'function') {
      return postsFeedModule.getTopContributors(period, module, limit, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getTopContributors !== 'function') return [];
    return driver.getTopContributors(period, module, limit);
  }

  // Posts-Read/Analytics split (v11.32.5)
  // Implementacoes foram movidas para window._KCAPI.postsRead (kc-api.posts-read.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsReadModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsRead = window._KCAPI.postsRead || {};

  function getPostsReadModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsRead = window._KCAPI.postsRead;
    return (postsRead && typeof postsRead === 'object') ? postsRead : null;
  }

  function buildPostsReadDeps() {
    return {
      getActiveDriver,
      ENV,
      getCachedSessionPayload,
      persistSessionPayload,
      removeSessionCache,
      withPendingSessionRequest,
    };
  }

  async function trackCouponClick(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackCouponClick === 'function') {
      return postsReadModule.trackCouponClick(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function trackShare(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackShare === 'function') {
      return postsReadModule.trackShare(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function checkDuplicatePost(userId, module, title) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.checkDuplicatePost === 'function') {
      return postsFeedModule.checkDuplicatePost(userId, module, title, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.checkDuplicatePost !== 'function') return { ok: false, candidates: [] };
    return driver.checkDuplicatePost(userId, module, title);
  }

  // ── Analytics de post (v9.3.1) — delegados via getPostsReadModule() ──
  async function trackView(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackView === 'function') {
      return postsReadModule.trackView(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  function getCachedPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.getCachedPostAnalytics === 'function') {
      return postsReadModule.getCachedPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return null;
  }

  function invalidatePostAnalyticsCache(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.invalidatePostAnalyticsCache === 'function') {
      return postsReadModule.invalidatePostAnalyticsCache(postId, buildPostsReadDeps());
    }
    return false;
  }

  async function refreshPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.refreshPostAnalytics === 'function') {
      return postsReadModule.refreshPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function getPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.getPostAnalytics === 'function') {
      return postsReadModule.getPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return { ok: false };
  }


  // Auth split (v11.33.6)
  // Implementacoes foram movidas para window._KCAPI.auth (kc-api.auth.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getAuthModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.auth = window._KCAPI.auth || {};

  function getAuthModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const auth = window._KCAPI.auth;
    return (auth && typeof auth === 'object') ? auth : null;
  }

  function buildAuthDeps() {
    return { ENV };
  }

  async function getCurrentUser() {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.getCurrentUser === 'function') {
      return authModule.getCurrentUser(buildAuthDeps());
    }
    return null;
  }

  async function signIn(email, password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.signIn === 'function') {
      return authModule.signIn(email, password, buildAuthDeps());
    }
    return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function signUp(email, password, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.signUp === 'function') {
      return authModule.signUp(email, password, options, buildAuthDeps());
    }
    return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function resendConfirmation(email, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.resendConfirmation === 'function') {
      return authModule.resendConfirmation(email, options, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function requestPasswordReset(email, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.requestPasswordReset === 'function') {
      return authModule.requestPasswordReset(email, options, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function updatePassword(password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.updatePassword === 'function') {
      return authModule.updatePassword(password, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  // Aliases (compat)
  async function login(email, password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.login === 'function') {
      return authModule.login(email, password, buildAuthDeps());
    }
    return null;
  }

  async function logout() {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.logout === 'function') {
      return authModule.logout(buildAuthDeps());
    }
    return false;
  }


  // Profiles split (v11.33.4)
  // Implementacoes foram movidas para window._KCAPI.profiles (kc-api.profiles.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getProfilesModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.profiles = window._KCAPI.profiles || {};

  function getProfilesModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const profiles = window._KCAPI.profiles;
    return (profiles && typeof profiles === 'object') ? profiles : null;
  }

  function buildProfilesDeps() {
    return { getActiveDriver, ENV, getAuthorById };
  }

  function getCurrentProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getCurrentProfile === 'function') {
      return profilesModule.getCurrentProfile(buildProfilesDeps());
    }
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') return window.KCProfiles.getCurrentProfile();
    return null;
  }

  async function getProfileById(id) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getProfileById === 'function') {
      return profilesModule.getProfileById(id, buildProfilesDeps());
    }
    return null;
  }

  async function syncProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.syncProfile === 'function') {
      return profilesModule.syncProfile(buildProfilesDeps());
    }
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') return window.KCProfiles.ensureSynced();
    return null;
  }


  function isBackendEnabled() { return !!cfg.baseURL; }

  // Comments-Votes split (v11.32.6)
  // Implementacoes foram movidas para window._KCAPI.commentsVotes (kc-api.comments-votes.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getCommentsVotesModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.commentsVotes = window._KCAPI.commentsVotes || {};

  function getCommentsVotesModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const commentsVotes = window._KCAPI.commentsVotes;
    return (commentsVotes && typeof commentsVotes === 'object') ? commentsVotes : null;
  }

  function buildCommentsVotesDeps() {
    return {
      getActiveDriver,
      ENV,
      invalidatePostAnalyticsCache,
      getCachedSessionPayload,
      persistSessionPayload,
      removeSessionCache,
      clearSessionCachePrefix,
      withPendingSessionRequest,
    };
  }

  // Comments facade (V8.1.7.2) — delegado via getCommentsVotesModule()
  // Em driver=supabase: usa tabela public.comments.
  // Em driver=local: retorna null; kc-core.js usa localStorage diretamente.
  function getCachedComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getCachedComments === 'function') {
      return m.getCachedComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  function invalidateCommentsCache(postId) {
    const m = getCommentsVotesModule();
    if (m && typeof m.invalidateCommentsCache === 'function') {
      return m.invalidateCommentsCache(postId, buildCommentsVotesDeps());
    }
    return false;
  }

  async function refreshComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.refreshComments === 'function') {
      return m.refreshComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getComments === 'function') {
      return m.getComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function addComment(postId, body, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.addComment === 'function') {
      return m.addComment(postId, body, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function likeComment(commentId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.likeComment === 'function') {
      return m.likeComment(commentId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  // Votes facade (V8.1.7.3) — delegado via getCommentsVotesModule()
  async function votePost(postId, direction, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.votePost === 'function') {
      return m.votePost(postId, direction, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getMyVote(postId) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getMyVote === 'function') {
      return m.getMyVote(postId, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getMyProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getMyProfile === 'function') {
      return profilesModule.getMyProfile(buildProfilesDeps());
    }
    const activeDriver = getActiveDriver();
    if (!activeDriver || typeof activeDriver.getMyProfile !== 'function') return null;
    return activeDriver.getMyProfile();
  }

  async function updateMyProfile(patch = {}) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.updateMyProfile === 'function') {
      return profilesModule.updateMyProfile(patch, buildProfilesDeps());
    }
    return { ok: false, error: { message: 'Perfil indisponível neste driver.' } };
  }

  async function uploadProfileAvatar(fileOrDataUrl) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.uploadProfileAvatar === 'function') {
      return profilesModule.uploadProfileAvatar(fileOrDataUrl, buildProfilesDeps());
    }
    return { ok: false, error: { message: 'Upload de avatar indisponível neste driver.' } };
  }

  async function getMyPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getMyPosts === 'function') {
      return postsFeedModule.getMyPosts(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (ENV.driver !== 'supabase' && driver && typeof driver.getMyPosts === 'function') return driver.getMyPosts(params);
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMyPosts) return [];
    return driver.getMyPosts(params);
  }

  async function getPostsByAuthorId(authorId, params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPostsByAuthorId === 'function') {
      return postsFeedModule.getPostsByAuthorId(authorId, params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getPostsByAuthorId !== 'function') return [];
    return driver.getPostsByAuthorId(authorId, params);
  }

  async function getRelatedPosts(postId, options = {}) {
    const relatedModule = getRelatedModule();
    if (relatedModule && typeof relatedModule.getRelatedPosts === 'function') {
      return relatedModule.getRelatedPosts(postId, options, buildRelatedDeps());
    }
    return [];
  }

  // Saved/Highlights split (v11.32.3)
  // Implementacoes foram movidas para window._KCAPI.saved (kc-api.saved.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getSavedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.saved = window._KCAPI.saved || {};

  function getSavedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const saved = window._KCAPI.saved;
    return (saved && typeof saved === 'object') ? saved : null;
  }

  async function getSavedPostState(postId) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getSavedPostState === 'function') {
      return savedModule.getSavedPostState(postId, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { kinds: [] };
  }

  async function setSavedPostState(postId, kind, enabled) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.setSavedPostState === 'function') {
      return savedModule.setSavedPostState(postId, kind, enabled, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
  }

  async function clearSavedPostState(postId, kind) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.clearSavedPostState === 'function') {
      return savedModule.clearSavedPostState(postId, kind, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
  }

  async function getMySavedPosts(params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getMySavedPosts === 'function') {
      return savedModule.getMySavedPosts(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return [];
  }

  async function getMySavedPostsCount(params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getMySavedPostsCount === 'function') {
      return savedModule.getMySavedPostsCount(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return 0;
  }

  async function getProfileHighlights(profileId, params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getProfileHighlights === 'function') {
      return savedModule.getProfileHighlights(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return [];
  }

  async function getProfileHighlightsCount(profileId, params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getProfileHighlightsCount === 'function') {
      return savedModule.getProfileHighlightsCount(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return 0;
  }

  // Help/Invites split (v11.32.4)
  // Implementacoes foram movidas para window._KCAPI.help (kc-api.help.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getHelpModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.help = window._KCAPI.help || {};

  function getHelpModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const help = window._KCAPI.help;
    return (help && typeof help === 'object') ? help : null;
  }

  async function createHelpRequest(payload = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.createHelpRequest === 'function') {
      return helpModule.createHelpRequest(payload, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Pedidos de ajuda indisponíveis neste driver.' } };
  }

  async function listAdminHelpRequests(filters = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.listAdminHelpRequests === 'function') {
      return helpModule.listAdminHelpRequests(filters, { getActiveDriver });
    }
    return [];
  }

  async function updateAdminHelpRequest(id, patch = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.updateAdminHelpRequest === 'function') {
      return helpModule.updateAdminHelpRequest(id, patch, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };
  }

  // Notifications split (v11.32.2)
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.notifications = window._KCAPI.notifications || {};

  function getNotificationsModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const notifications = window._KCAPI.notifications;
    return (notifications && typeof notifications === 'object') ? notifications : null;
  }

  function buildFallbackNotificationPreferences() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationPreferences === 'function') {
      return notificationsModule.buildFallbackNotificationPreferences({ accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationPreferences();
    }
    return {
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    };
  }

  function buildFallbackNotificationChannelTargets() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationChannelTargets === 'function') {
      return notificationsModule.buildFallbackNotificationChannelTargets({ accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets();
    }
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    };
  }

  async function getNotificationPreferences() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationPreferences === 'function') {
      return notificationsModule.getNotificationPreferences({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return buildFallbackNotificationPreferences();
  }

  async function updateNotificationPreferences(preferences = {}) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.updateNotificationPreferences === 'function') {
      return notificationsModule.updateNotificationPreferences(preferences, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return { ok: false, error: { message: 'Preferencias de notificacao indisponiveis neste driver.' } };
  }

  async function getNotificationChannelTargets() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationChannelTargets === 'function') {
      return notificationsModule.getNotificationChannelTargets({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return buildFallbackNotificationChannelTargets();
  }

  async function updateNotificationChannelTargets(targets = {}) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.updateNotificationChannelTargets === 'function') {
      return notificationsModule.updateNotificationChannelTargets(targets, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return { ok: false, error: { message: 'Destinos privados de notificacao indisponiveis neste driver.' } };
  }
  // Notifications (v9.1.0)

  async function getNotifications(limit, offset) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotifications === 'function') {
      return notificationsModule.getNotifications(limit, offset, { getActiveDriver });
    }
    return { ok: false, notifications: [], unread: 0, total: 0 };
  }

  async function markNotificationsRead(ids) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.markNotificationsRead === 'function') {
      return notificationsModule.markNotificationsRead(ids, { getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function markAllNotificationsRead() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.markAllNotificationsRead === 'function') {
      return notificationsModule.markAllNotificationsRead({ getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function clearNotifications() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.clearNotifications === 'function') {
      return notificationsModule.clearNotifications({ getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function getUnreadNotificationCount() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getUnreadNotificationCount === 'function') {
      return notificationsModule.getUnreadNotificationCount({ getActiveDriver });
    }
    return 0;
  }

  function subscribeNotifications(userId, callback) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.subscribeNotifications === 'function') {
      return notificationsModule.subscribeNotifications(userId, callback, { getActiveDriver });
    }
    return null;
  }

  function unsubscribeNotifications(channel) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.unsubscribeNotifications === 'function') {
      return notificationsModule.unsubscribeNotifications(channel, { getActiveDriver });
    }
  }
  // ── Convites de usuários externos (v9.1.0.3) — delegados via getHelpModule() ─

  async function inviteExternalUser(email, note) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.inviteExternalUser === 'function') {
      return helpModule.inviteExternalUser(email, note, { getActiveDriver });
    }
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  async function getInvites() {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.getInvites === 'function') {
      return helpModule.getInvites({ getActiveDriver });
    }
    return { data: [], error: null };
  }

  async function revokeInvite(email) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.revokeInvite === 'function') {
      return helpModule.revokeInvite(email, { getActiveDriver });
    }
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
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
    searchPosts,
    getFeedCursor,
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
    getPostById,
    createPost,
    updatePost,
    deletePost,
    reportPost,
    togglePostStatus,
    renewPost,
    bumpPost,
    closePost,
    getTopContributors,
    trackCouponClick,
    trackShare,
    trackView,
    getCachedPostAnalytics,
    refreshPostAnalytics,
    invalidatePostAnalyticsCache,
    getPostAnalytics,
    checkDuplicatePost,

    // Comments (Supabase) — V8.1.7.2
    getCachedComments,
    refreshComments,
    invalidateCommentsCache,
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
    getNotificationPreferences,
    updateNotificationPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,

    // Notifications (v9.1.0)
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,

    // Convites externos (v9.1.0.3)
    inviteExternalUser,
    getInvites,
    revokeInvite,

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
    normalizeUserRatingSummary,
    normalizeUserRatingEntry,
    normalizeUserRatingState,
    normalizeUserRatingList,
    isBackendEnabled,
  });

  window.getLastCreatePostError = getLastCreatePostError;
  window.setLastCreatePostError = setLastCreatePostError;
  window.clearLastCreatePostError = clearLastCreatePostError;
  window.summarizeCreatePayloadForDiagnostics = summarizeCreatePayloadForDiagnostics;

})();
