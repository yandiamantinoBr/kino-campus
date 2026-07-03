/*
  KinoCampus - KCAPI filters internals (V76)

  Extracted from kc-api.client.js to keep the public facade focused on
  KCAPI wiring while preserving the existing public method:
  - window.KCAPI.filterPosts

  Exposicao interna:
  - window._KCAPI.filters
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

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
    const directText = direct;
    if (directText.includes('edital') || directText.includes('editai') || directText.includes('chamada')) return 'edital';
    if (directText.includes('concurso') || directText.includes('processo seletivo') || directText.includes('selecao')) return 'concurso';
    if (directText.includes('bolsa') || directText.includes('auxilio') || directText.includes('fomento')) return 'bolsa';
    if (directText.includes('curso') || directText.includes('capacit') || directText.includes('qualific') || directText.includes('formacao')) return 'curso-capacitacao';
    if (direct.includes('estag')) return 'estagio';
    if (direct.includes('empreg')) return 'emprego';
    if (direct.includes('freela') || direct.includes('freelancer')) return 'freelancer';
    if (direct.includes('monitor')) return 'monitoria';
    if (direct.includes('pesquis') || direct.includes('pibic') || direct.includes('pivic')) return 'pesquisa';
    if (direct.includes('volunt')) return 'voluntariado';

    const haystack = normalizeFilterText(sourceText);
    if (haystack.includes('edital') || haystack.includes('editai') || haystack.includes('chamada publica')) return 'edital';
    if (haystack.includes('concurso') || haystack.includes('processo seletivo') || haystack.includes('selecao')) return 'concurso';
    if (haystack.includes('bolsa') || haystack.includes('auxilio') || haystack.includes('fomento')) return 'bolsa';
    if (haystack.includes('curso') || haystack.includes('capacit') || haystack.includes('qualific') || haystack.includes('formacao')) return 'curso-capacitacao';
    if (haystack.includes('freelancer') || haystack.includes('freela')) return 'freelancer';
    if (haystack.includes('monitoria') || haystack.includes('monitor ')) return 'monitoria';
    if (haystack.includes('pesquisa') || haystack.includes('pibic') || haystack.includes('pivic') || haystack.includes('iniciacao cientifica')) return 'pesquisa';
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

  window._KCAPI.filters = Object.freeze({
    filterPosts,
    matchesAdvancedRequestParams,
    matchesDatePresetFilter,
    normalizeDatePreset,
    getEventDateKey,
    getDateKeyInZone,
    getCurrentDateKey,
    normalizeFilterText,
    slugifyFilterKey,
  });
})();
