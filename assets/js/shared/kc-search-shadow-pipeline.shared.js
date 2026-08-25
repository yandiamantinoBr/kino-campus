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

  var VERSION = '1.2.0';
  var SUPPORTED_FILTERS = [
    'area', 'areaText', 'category', 'condition', 'destination', 'employmentType',
    'dayOfMonth', 'features', 'free', 'housingType', 'itemType', 'locationAlias',
    'locationText', 'origin', 'price', 'priceMax', 'region', 'relativeDate',
    'rewardMin', 'seatsMin', 'time', 'timePeriod', 'weekday', 'workMode'
  ];
  var DEFERRED_FILTERS = ['registrationStatus'];
  var WEEKDAY_INDEX = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  };

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

  function normalizeIgnoredSignals(options) {
    var source = options && options.ignoredSignals && typeof options.ignoredSignals === 'object'
      ? options.ignoredSignals
      : {};
    return {
      module: source.module === true,
      intent: source.intent === true,
      filters: (Array.isArray(source.filters) ? source.filters : [])
        .map(function (key) { return String(key || ''); })
        .filter(function (key, index, list) { return key && list.indexOf(key) === index; })
    };
  }

  function buildEffectivePlan(parsedPlan, options) {
    var parsed = parsedPlan && typeof parsedPlan === 'object' ? parsedPlan : {};
    var ignored = normalizeIgnoredSignals(options);
    var registryModules = options && options.registry && options.registry.modules || {};
    var requestedModule = normalizeKey(options && options.moduleOverride);
    var moduleOverride = requestedModule && registryModules[requestedModule] ? requestedModule : null;
    var filters = {};
    Object.keys(parsed.filters || {}).forEach(function (key) {
      if (ignored.filters.indexOf(key) === -1) filters[key] = parsed.filters[key];
    });
    return {
      module: moduleOverride || (ignored.module ? null : parsed.module),
      intent: ignored.intent ? null : parsed.intent,
      filters: filters,
      confidence: parsed.confidence,
      moduleOverride: moduleOverride,
      ignored: ignored
    };
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
      post && post.tagKeys, metadata.tagKeys,
      post && post.userTagKeys, metadata.userTagKeys
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

  function dateKey(value) {
    var text = String(value == null ? '' : value).trim();
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[1] + '-' + match[2] + '-' + match[3];
    var parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
  }

  function dateNumber(value) {
    var key = dateKey(value);
    if (!key) return NaN;
    var parts = key.split('-').map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(value, amount) {
    var time = dateNumber(value);
    if (!Number.isFinite(time)) return '';
    return new Date(time + Number(amount || 0) * 86400000).toISOString().slice(0, 10);
  }

  function postDateRange(post) {
    var starts = fieldValues(post, ['data']).map(dateKey).filter(Boolean);
    var ends = fieldValues(post, ['data_fim']).map(dateKey).filter(Boolean);
    if (!starts.length) return null;
    var start = starts[0];
    var end = ends[0] || start;
    if (dateNumber(end) < dateNumber(start)) end = start;
    return { start: start, end: end };
  }

  function rangeContainsDate(range, expected) {
    if (!range) return false;
    var value = dateNumber(expected);
    return Number.isFinite(value) && value >= dateNumber(range.start) && value <= dateNumber(range.end);
  }

  function rangeHasDatePart(range, predicate) {
    if (!range) return false;
    var start = dateNumber(range.start);
    var end = dateNumber(range.end);
    var maxEnd = Math.min(end, start + 370 * 86400000);
    for (var time = start; time <= maxEnd; time += 86400000) {
      if (predicate(new Date(time))) return true;
    }
    return false;
  }

  function parseHour(value) {
    var match = String(value == null ? '' : value).match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?/);
    return match ? Number(match[1]) : NaN;
  }

  function resolveReferenceDate(options) {
    var explicit = options && (options.referenceDate || options.now || options.nowValue);
    return dateKey(explicit || new Date().toISOString());
  }

  function canEvaluateFilter(posts, key, context) {
    if (['relativeDate', 'weekday', 'dayOfMonth'].indexOf(key) !== -1) {
      return !!context.referenceDate && posts.some(function (post) { return !!postDateRange(post); });
    }
    if (key === 'timePeriod') {
      return posts.some(function (post) {
        return fieldValues(post, ['hora', 'horario']).some(function (value) { return Number.isFinite(parseHour(value)); });
      });
    }
    return true;
  }

  function matchesFilter(post, key, expected, context) {
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
    if (key === 'relativeDate') {
      if (expected !== 'tomorrow') return false;
      return rangeContainsDate(postDateRange(post), addDays(context.referenceDate, 1));
    }
    if (key === 'weekday') {
      var weekday = WEEKDAY_INDEX[normalizeText(expected)];
      return Number.isInteger(weekday) && rangeHasDatePart(postDateRange(post), function (date) {
        return date.getUTCDay() === weekday;
      });
    }
    if (key === 'dayOfMonth') {
      return rangeHasDatePart(postDateRange(post), function (date) {
        return date.getUTCDate() === Number(expected);
      });
    }
    if (key === 'timePeriod') {
      return fieldValues(post, ['hora', 'horario']).some(function (value) {
        var hour = parseHour(value);
        return expected === 'night' && Number.isFinite(hour) && (hour >= 18 || hour < 6);
      });
    }
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

  function applySupportedFilters(posts, filters, options) {
    var source = filters && typeof filters === 'object' ? filters : {};
    var list = Array.isArray(posts) ? posts : [];
    var context = { referenceDate: resolveReferenceDate(options) };
    var keys = Object.keys(source);
    var supported = keys.filter(function (key) {
      return SUPPORTED_FILTERS.indexOf(key) !== -1 && canEvaluateFilter(list, key, context);
    });
    var deferred = keys.filter(function (key) {
      return DEFERRED_FILTERS.indexOf(key) !== -1 ||
        (SUPPORTED_FILTERS.indexOf(key) !== -1 && !canEvaluateFilter(list, key, context));
    });
    var unsupported = keys.filter(function (key) {
      return SUPPORTED_FILTERS.indexOf(key) === -1 && DEFERRED_FILTERS.indexOf(key) === -1;
    });
    return {
      posts: list.filter(function (post) {
        return supported.every(function (key) { return matchesFilter(post, key, source[key], context); });
      }),
      supportedFilters: supported,
      deferredFilters: deferred,
      unsupportedFilters: unsupported
    };
  }

  function applyIntent(posts, moduleKey, intent) {
    var target = normalizeKey(intent);
    // Em moradia, "procuro quarto" descreve a necessidade do usuário, não uma
    // publicação da categoria "procurando". O tipo estruturado continua dominante.
    var filterable = target && target !== 'any' && moduleKey !== 'moradia';
    if (!filterable) return { posts: posts, applied: false };
    return {
      posts: posts.filter(function (post) { return containsValue(categoryValues(post), target); }),
      applied: true
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

  function moduleCounts(posts, registry) {
    var allowedModules = registry && registry.modules && typeof registry.modules === 'object'
      ? registry.modules
      : {};
    return (Array.isArray(posts) ? posts : []).reduce(function (counts, post) {
      var projection = post && post.kcSearchProjection;
      var key = normalizeKey(post && (post.module || post.modulo || post.moduleKey) ||
        projection && projection.moduleKey);
      if (key && Object.prototype.hasOwnProperty.call(allowedModules, key)) {
        counts[key] = (Object.prototype.hasOwnProperty.call(counts, key) ? counts[key] : 0) + 1;
      }
      return counts;
    }, {});
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
    var surface = options.surface === 'dropdown' ? 'dropdown' : 'results';
    var publicOnly = options.publicOnly !== false;
    var hideClosed = surface === 'dropdown' || options.hideClosed === true;
    var parsedPlan = options.parser.parse(query, { registry: options.registry });
    var plan = buildEffectivePlan(parsedPlan, options);
    var searchPolicy = {
      q: query,
      limit: limit,
      publicOnly: publicOnly,
      hideClosed: hideClosed,
      now: options.now || options.nowValue
    };
    var legacy = options.searchShared.searchCollection(sourcePosts, searchPolicy);
    var projected = options.projector.projectCollection(sourcePosts);
    var poolLimit = Math.max(50, limit * 5);
    var candidatePool = options.searchShared.searchCollection(projected, {
      q: query,
      module: plan.module || undefined,
      limit: poolLimit,
      publicOnly: publicOnly,
      hideClosed: hideClosed,
      now: options.now || options.nowValue
    });
    var intent = applyIntent(candidatePool, plan.module, plan.intent);
    var filtered = applySupportedFilters(intent.posts, plan.filters, options);
    var facetPool = options.searchShared.searchCollection(projected, {
      q: query,
      limit: Math.max(poolLimit, sourcePosts.length),
      publicOnly: publicOnly,
      hideClosed: hideClosed,
      now: options.now || options.nowValue
    });
    // Module dropdown facets must ignore the UI module override so other modules
    // keep real counts and remain selectable. Keep module only when it comes from the query.
    var facetModule = plan.moduleOverride ? null : plan.module;
    var facetIntent = applyIntent(facetPool, facetModule, plan.intent);
    var facetFiltered = applySupportedFilters(facetIntent.posts, plan.filters, options);
    var facetModuleCounts = moduleCounts(facetFiltered.posts, options.registry);
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
        intentApplied: intent.applied,
        supportedFilters: filtered.supportedFilters,
        deferredFilters: filtered.deferredFilters,
        unsupportedFilters: filtered.unsupportedFilters
      },
      policy: {
        surface: surface,
        publicOnly: publicOnly,
        hideClosed: hideClosed,
        moduleOverride: plan.moduleOverride
      },
      facets: {
        modules: facetModuleCounts,
        total: Object.keys(facetModuleCounts).reduce(function (total, key) {
          return total + facetModuleCounts[key];
        }, 0)
      }
    };
  }

  return Object.freeze({
    VERSION: VERSION,
    SUPPORTED_FILTERS: SUPPORTED_FILTERS.slice(),
    DEFERRED_FILTERS: DEFERRED_FILTERS.slice(),
    applySupportedFilters: applySupportedFilters,
    runShadow: runShadow
  });
}));
