/*
  KinoCampus - local, opt-in search affinity and bounded reranking.

  Candidate generation and hard filters happen before this module. It only
  reorders existing candidates and stores aggregate canonical feature counts.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.KCSearchAffinity = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = 1;
  var STORAGE_KEY = 'kc_search_affinity_v1';
  var PURPOSE_VERSION = 'search-personalization-v1';
  var TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_FEATURES = 24;
  var MAX_COUNT = 20;
  var MAX_EXPLICIT_BOOST = 0.05;
  var MAX_AFFINITY_BOOST = 0.02;
  var MAX_TOTAL_BOOST = MAX_EXPLICIT_BOOST + MAX_AFFINITY_BOOST;

  function parseTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    var parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : null;
  }

  function nowMs(value) {
    var parsed = parseTimestamp(value);
    return parsed == null ? Date.now() : parsed;
  }

  function iso(value) {
    return new Date(value).toISOString();
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (_) {}
    return null;
  }

  function emptyState() {
    return { version: VERSION, purpose: PURPOSE_VERSION, updatedAt: null, features: {} };
  }

  function normalizeFeatureKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9:-]/g, '').slice(0, 96);
  }

  function normalizeState(input, options) {
    var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var current = nowMs(options && options.now);
    var rows = [];
    Object.keys(source.features && typeof source.features === 'object' ? source.features : {}).forEach(function (rawKey) {
      var key = normalizeFeatureKey(rawKey);
      var row = source.features[rawKey];
      if (!key || !row || typeof row !== 'object') return;
      var updated = parseTimestamp(row.updatedAt);
      var expires = parseTimestamp(row.expiresAt);
      var count = Math.max(1, Math.min(MAX_COUNT, Math.round(Number(row.count) || 1)));
      if (updated == null || expires == null || expires <= current) return;
      rows.push({ key: key, count: count, updatedAt: iso(updated), expiresAt: iso(expires) });
    });
    rows.sort(function (left, right) {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || right.count - left.count || left.key.localeCompare(right.key);
    });
    var features = {};
    rows.slice(0, MAX_FEATURES).forEach(function (row) {
      features[row.key] = { count: row.count, updatedAt: row.updatedAt, expiresAt: row.expiresAt };
    });
    return { version: VERSION, purpose: PURPOSE_VERSION, updatedAt: source.updatedAt || null, features: features };
  }

  function load(options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    if (!storage) return emptyState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : null, opts);
    } catch (_) {
      return emptyState();
    }
  }

  function save(state, options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    if (!storage) return false;
    var current = nowMs(opts.now);
    var normalized = normalizeState(state, { now: current });
    normalized.updatedAt = iso(current);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (_) {
      return false;
    }
  }

  function readPath(source, path) {
    var current = source;
    String(path || '').split('.').filter(Boolean).forEach(function (part) {
      current = current && typeof current === 'object' ? current[part] : undefined;
    });
    return current;
  }

  function appendValues(target, value) {
    if (Array.isArray(value)) {
      value.forEach(function (item) { appendValues(target, item); });
      return;
    }
    if (value == null || typeof value === 'object') return;
    var normalized = String(value).trim().toLowerCase();
    if (normalized && target.indexOf(normalized) === -1) target.push(normalized);
  }

  function canonicalModule(post) {
    var raw = String(post && (post.module || post.modulo) || '').trim().toLowerCase();
    var aliases = {
      compra_venda: 'compra-venda', compraevenda: 'compra-venda',
      achados_perdidos: 'achados-perdidos', achadoseperdidos: 'achados-perdidos'
    };
    return aliases[raw] || raw;
  }

  function extractSignals(post, registry) {
    var source = registry && registry.registry ? registry.registry : registry;
    var moduleKey = canonicalModule(post);
    var moduleEntry = source && source.modules && source.modules[moduleKey];
    if (!moduleEntry) return [];
    var signals = [{
      key: 'module:' + moduleKey,
      type: 'module',
      module: moduleKey,
      label: String(moduleEntry.label || moduleKey)
    }];
    (moduleEntry.tagGroups || []).forEach(function (group) {
      if (group.preferenceEligible !== true) return;
      var values = [];
      (group.payloadPaths || []).forEach(function (path) { appendValues(values, readPath(post, path)); });
      (group.options || []).forEach(function (option) {
        var optionKey = String(option.key || '').trim().toLowerCase();
        if (!optionKey || values.indexOf(optionKey) === -1) return;
        signals.push({
          key: 'feature:' + moduleKey + ':' + group.id + ':' + optionKey,
          type: 'feature',
          module: moduleKey,
          featureKey: moduleKey + ':' + group.id,
          value: optionKey,
          label: String(option.label || option.key),
          groupLabel: String(group.label || group.id)
        });
      });
    });
    return signals;
  }

  function personalized(preferences) {
    return !!(preferences && preferences.mode === 'personalized' &&
      preferences.consent && preferences.consent.granted === true);
  }

  function recordInteraction(post, options) {
    var opts = options || {};
    if (!personalized(opts.preferences) || opts.preferences.localAffinityConsent !== true) return false;
    if (opts.automated === true) return false;
    if (['dropdown-click', 'results-click'].indexOf(opts.source) === -1) return false;
    var signals = extractSignals(post, opts.registry);
    if (!signals.length) return false;
    var current = nowMs(opts.now);
    var state = load({ storage: opts.storage, now: current });
    signals.forEach(function (signal) {
      var previous = state.features[signal.key] || {};
      state.features[signal.key] = {
        count: Math.min(MAX_COUNT, Math.max(0, Number(previous.count) || 0) + 1),
        updatedAt: iso(current),
        expiresAt: iso(current + TTL_MS)
      };
    });
    return save(state, { storage: opts.storage, now: current });
  }

  function affinityStrength(row, current) {
    if (!row) return 0;
    var updated = parseTimestamp(row.updatedAt);
    if (updated == null) return 0;
    var age = Math.max(0, current - updated);
    var decay = Math.pow(0.5, age / HALF_LIFE_MS);
    var saturation = 1 - Math.exp(-Math.max(0, Number(row.count) || 0) / 3);
    return Math.max(0, Math.min(1, decay * saturation));
  }

  function explicitReasons(signals, preferences) {
    var reasons = [];
    var moduleSignal = signals.find(function (signal) { return signal.type === 'module'; });
    if (moduleSignal && (preferences.modules || []).indexOf(moduleSignal.module) !== -1) {
      reasons.push({ type: 'explicit-module', label: moduleSignal.label + ' escolhido por você' });
    }
    signals.filter(function (signal) { return signal.type === 'feature'; }).forEach(function (signal) {
      var values = preferences.features && preferences.features[signal.featureKey];
      if (Array.isArray(values) && values.indexOf(signal.value) !== -1) {
        reasons.push({ type: 'explicit-feature', label: signal.label + ' escolhido por você' });
      }
    });
    return reasons;
  }

  function scoreCandidate(post, index, preferences, affinity, registry, current) {
    var signals = extractSignals(post, registry);
    var reasons = explicitReasons(signals, preferences);
    var explicitBoost = 0;
    if (reasons.some(function (reason) { return reason.type === 'explicit-module'; })) explicitBoost += 0.025;
    explicitBoost += Math.min(0.025, reasons.filter(function (reason) { return reason.type === 'explicit-feature'; }).length * 0.015);
    explicitBoost = Math.min(MAX_EXPLICIT_BOOST, explicitBoost);

    var bestAffinity = 0;
    var affinityLabel = '';
    if (preferences.localAffinityConsent === true) {
      signals.forEach(function (signal) {
        var strength = affinityStrength(affinity.features[signal.key], current);
        if (strength > bestAffinity) {
          bestAffinity = strength;
          affinityLabel = signal.label;
        }
      });
    }
    var affinityBoost = Math.min(MAX_AFFINITY_BOOST, bestAffinity * MAX_AFFINITY_BOOST);
    if (affinityBoost > 0.001 && affinityLabel) reasons.push({ type: 'local-affinity', label: 'Afinidade local com ' + affinityLabel });
    var boost = Math.min(MAX_TOTAL_BOOST, explicitBoost + affinityBoost);
    var base = Math.max(0, Number(post && post.relevanceScore) || 0);
    var personalizedScore = base * (1 + boost);
    return {
      index: index,
      post: Object.assign({}, post, boost > 0 ? {
        relevanceScore: personalizedScore,
        _kcPersonalization: Object.freeze({
          boost: Math.round(boost * 10000) / 10000,
          explicitBoost: Math.round(explicitBoost * 10000) / 10000,
          affinityBoost: Math.round(affinityBoost * 10000) / 10000,
          reasons: Object.freeze(reasons.slice(0, 3).map(function (reason) { return Object.freeze(reason); }))
        })
      } : {}),
      score: personalizedScore
    };
  }

  function rerank(results, options) {
    var opts = options || {};
    var list = Array.isArray(results) ? results : [];
    if (!personalized(opts.preferences) || opts.sortBy && opts.sortBy !== 'relevance') return list.slice();
    var current = nowMs(opts.now);
    var affinity = opts.preferences.localAffinityConsent === true
      ? load({ storage: opts.storage, now: current })
      : emptyState();
    return list.map(function (post, index) {
      return scoreCandidate(post, index, opts.preferences, affinity, opts.registry, current);
    }).sort(function (left, right) {
      return right.score - left.score || left.index - right.index;
    }).map(function (entry) { return entry.post; });
  }

  return Object.freeze({
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    PURPOSE_VERSION: PURPOSE_VERSION,
    TTL_MS: TTL_MS,
    HALF_LIFE_MS: HALF_LIFE_MS,
    MAX_FEATURES: MAX_FEATURES,
    MAX_COUNT: MAX_COUNT,
    MAX_EXPLICIT_BOOST: MAX_EXPLICIT_BOOST,
    MAX_AFFINITY_BOOST: MAX_AFFINITY_BOOST,
    MAX_TOTAL_BOOST: MAX_TOTAL_BOOST,
    emptyState: emptyState,
    normalizeState: normalizeState,
    load: load,
    save: save,
    extractSignals: extractSignals,
    recordInteraction: recordInteraction,
    affinityStrength: affinityStrength,
    rerank: rerank
  });
}));
