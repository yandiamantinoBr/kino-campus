/*
  KinoCampus - kc-search-shadow-pipeline.shared.js
  Offline shadow comparison for legacy vs schema-aware search (V76.36).

  Contract only: this asset is not loaded by HTML pages.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchShadowPipeline = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var SUPPORTED_FILTERS = [
    'area', 'areaText', 'category', 'condition', 'destination', 'employmentType',
    'features', 'free', 'housingType', 'itemType', 'locationAlias', 'locationText',
    'origin', 'price', 'priceMax', 'region', 'rewardMin', 'seatsMin', 'time', 'workMode'
  ];

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).replace(/\s+/g, '-');
  }

  function flatten(values) {
    var out = [];
    (Array.isArray(values) ? values : [values]).forEach(function append(value) {
      if (Array.isArray(value)) return value.forEach(append);
      if (value === undefined || value === null || value === '') return;
      out.push(value);
    });
    return out;
  }

  function fieldValues(post, fieldNames) {
    var projection = post && post.kcSearchProjection;
    var fields = projection && projection.fields && typeof projection.fields === 'object'
      ? projection.fields
      : {};
    var out = [];
    (fieldNames || []).forEach(function (fieldName) {
      out = out.concat(flatten(fields[fieldName]));
    });
    return out;
  }

  function categoryValues(post) {
    var metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
    return flatten([
      post && (post.category || post.categoria || post.categoryKey || post.categoriaKey),
      metadata.categoryKey, metadata.subcategory, metadata.subcategoryKey,
      metadata.actionKey, metadata.housingTypeKey,
      post && post.tagKeys, metadata.tagKeys
    ]);
  }

  function containsValue(values, expected) {
    var target = normalizeKey(expected);
    return flatten(values).some(function (value) {
      var current = normalizeKey(value);
      return current === target || current.indexOf(target) !== -1 || target.indexOf(current) !== -1;
    });
  }

  function numberValues(post, fields) {
    return fieldValues(post, fields).map(function (value) {
      if (typeof value === 'number') return value;
      var parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
      return parsed;
    }).filter(Number.isFinite);
  }

  function matchesFilter(post, key, expected) {
    if (key === 'category' || key === 'housingType' || key === 'itemType') {
      return containsValue(categoryValues(post), expected);
    }
    if (key === 'condition') return containsValue(fieldValues(post, ['condicao']), expected);
    if (key === 'origin') return containsValue(fieldValues(post, ['origem']), expected);
    if (key === 'destination') return containsValue(fieldValues(post, ['destino']), expected);
    if (key === 'workMode') return containsValue(fieldValues(post, ['modalidadeTrabalho']), expected);
    if (key === 'employmentType') return containsValue(fieldValues(post, ['regimeContratacao']), expected);
    if (key === 'area') return containsValue(fieldValues(post, ['areaAtuacao']), expected);
    if (key === 'region') return containsValue(fieldValues(post, ['regiao']), expected);
    if (key === 'features') {
      return flatten(expected).every(function (feature) {
        return containsValue(fieldValues(post, ['marcadoresMoradia', 'marcadoresCarona']), feature);
      });
    }
    if (key === 'locationAlias') {
      return containsValue(fieldValues(post, ['localizacao', 'regiao', 'origem', 'destino']), expected);
    }
    if (key === 'locationText' || key === 'areaText') {
      var searchText = post && post.kcSearchProjection ? post.kcSearchProjection.searchText : '';
      return normalizeText(searchText).indexOf(normalizeText(expected)) !== -1;
    }
    if (key === 'time') return containsValue(fieldValues(post, ['horario', 'hora']), expected);
    if (key === 'free') {
      return fieldValues(post, ['gratuito']).some(function (value) { return Boolean(value) === Boolean(expected); });
    }
    if (key === 'price' || key === 'priceMax') {
      var prices = numberValues(post, ['preco', 'orcamento', 'remuneracao', 'contribuicao']);
      return key === 'price'
        ? prices.some(function (value) { return value === Number(expected); })
        : prices.some(function (value) { return value <= Number(expected); });
    }
    if (key === 'rewardMin') {
      return numberValues(post, ['recompensa']).some(function (value) { return value >= Number(expected); });
    }
    if (key === 'seatsMin') {
      return numberValues(post, ['vagas']).some(function (value) { return value >= Number(expected); });
    }
    return true;
  }

  function applySupportedFilters(posts, filters) {
    var source = filters && typeof filters === 'object' ? filters : {};
    var keys = Object.keys(source);
    var supported = keys.filter(function (key) { return SUPPORTED_FILTERS.indexOf(key) !== -1; });
    var unsupported = keys.filter(function (key) { return SUPPORTED_FILTERS.indexOf(key) === -1; });
    return {
      posts: (Array.isArray(posts) ? posts : []).filter(function (post) {
        return supported.every(function (key) { return matchesFilter(post, key, source[key]); });
      }),
      supportedFilters: supported,
      unsupportedFilters: unsupported
    };
  }

  function summarize(posts) {
    return (Array.isArray(posts) ? posts : []).map(function (post) {
      return {
        id: String((post && (post.id || post.uuid || post.legacy_id || post.legacyId)) || ''),
        relevanceScore: Number(post && post.relevanceScore || 0)
      };
    });
  }

  function ids(rows) {
    return rows.map(function (row) { return row.id; }).filter(Boolean);
  }

  function difference(left, right) {
    return left.filter(function (value) { return right.indexOf(value) === -1; });
  }

  function assertDependencies(options) {
    if (!options || !options.parser || typeof options.parser.parse !== 'function') throw new Error('KC_SEARCH_SHADOW_PARSER_REQUIRED');
    if (!options.registry || !options.registry.modules) throw new Error('KC_SEARCH_SHADOW_REGISTRY_REQUIRED');
    if (!options.projector || typeof options.projector.projectCollection !== 'function') throw new Error('KC_SEARCH_SHADOW_PROJECTOR_REQUIRED');
    if (!options.searchShared || typeof options.searchShared.searchCollection !== 'function') throw new Error('KC_SEARCH_SHADOW_SEARCH_REQUIRED');
  }

  function runShadow(query, posts, options) {
    assertDependencies(options);
    var sourcePosts = Array.isArray(posts) ? posts : [];
    var limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
    var plan = options.parser.parse(query, { registry: options.registry });
    var legacy = options.searchShared.searchCollection(sourcePosts, { q: query, limit: limit });
    var projected = options.projector.projectCollection(sourcePosts);
    var poolLimit = Math.max(50, limit * 5);
    var candidatePool = options.searchShared.searchCollection(projected, {
      q: query,
      module: plan.module || undefined,
      limit: poolLimit
    });
    var filtered = applySupportedFilters(candidatePool, plan.filters);
    var candidate = filtered.posts.slice(0, limit);
    var legacySummary = summarize(legacy);
    var candidateSummary = summarize(candidate);
    var legacyIds = ids(legacySummary);
    var candidateIds = ids(candidateSummary);

    return {
      version: VERSION,
      plan: {
        module: plan.module,
        intent: plan.intent,
        filterKeys: Object.keys(plan.filters || {}),
        confidence: plan.confidence
      },
      legacy: legacySummary,
      candidate: candidateSummary,
      comparison: {
        overlap: candidateIds.filter(function (id) { return legacyIds.indexOf(id) !== -1; }),
        entered: difference(candidateIds, legacyIds),
        exited: difference(legacyIds, candidateIds),
        supportedFilters: filtered.supportedFilters,
        unsupportedFilters: filtered.unsupportedFilters
      }
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    SUPPORTED_FILTERS: SUPPORTED_FILTERS.slice(),
    applySupportedFilters: applySupportedFilters,
    runShadow: runShadow
  });
}));
