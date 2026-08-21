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
  // Explicit preferences must visibly affect near-ties and moderate score gaps
  // without overpowering a much stronger base relevance match.
  var MAX_EXPLICIT_BOOST = 0.12;
  var MAX_AFFINITY_BOOST = 0.03;
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

  function resolveStorageKey(options) {
    var key = String(options && options.storageKey || '').trim();
    return key || STORAGE_KEY;
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
      var raw = storage.getItem(resolveStorageKey(opts));
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
      storage.setItem(resolveStorageKey(opts), JSON.stringify(normalized));
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

  function canonicalUserTagKey(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      raw = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {}
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
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
    // Tags livres são sinais locais opt-in: diferentemente da taxonomia, elas
    // não entram nas preferências explícitas nem são sincronizadas como perfil.
    var metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
    var userTags = [];
    appendValues(userTags, post && post.userTags);
    appendValues(userTags, post && post.userTagKeys);
    appendValues(userTags, metadata.userTags);
    appendValues(userTags, metadata.userTagKeys);
    userTags.forEach(function (value) {
      var tagKey = canonicalUserTagKey(value);
      if (!tagKey) return;
      var signalKey = 'user-tag:' + moduleKey + ':' + tagKey;
      if (signals.some(function (signal) { return signal.key === signalKey; })) return;
      signals.push({
        key: signalKey,
        type: 'user-tag',
        module: moduleKey,
        value: tagKey,
        label: String(value),
        groupLabel: 'Tags'
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
    var state = load({ storage: opts.storage, storageKey: opts.storageKey, now: current });
    signals.forEach(function (signal) {
      var previous = state.features[signal.key] || {};
      state.features[signal.key] = {
        count: Math.min(MAX_COUNT, Math.max(0, Number(previous.count) || 0) + 1),
        updatedAt: iso(current),
        expiresAt: iso(current + TTL_MS)
      };
    });
    return save(state, { storage: opts.storage, storageKey: opts.storageKey, now: current });
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

  /** Compact badge/chip text: module or topic only — never "escolhido por você". */
  function cleanShortLabel(value, fallback) {
    var text = String(value || '')
      .replace(/\s+escolhido por você\.?$/i, '')
      .replace(/^afinidade local com\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) text = String(fallback || 'Priorizado').trim();
    return text.slice(0, 22);
  }

  function reasonMeta(type, label, shortLabel, icon, tone) {
    return {
      type: type,
      label: label,
      shortLabel: cleanShortLabel(shortLabel, label),
      icon: icon || 'fas fa-wand-magic-sparkles',
      tone: tone || 'prioritized'
    };
  }

  function featureBadgeMeta(signal) {
    var label = String(signal && signal.label || '').trim();
    var value = String(signal && signal.value || '').trim();
    var groupLabel = String(signal && signal.groupLabel || '').trim();
    var blob = (label + ' ' + value + ' ' + groupLabel).toLowerCase();
    if (/cashback|cupom|desconto|coupon/.test(blob)) {
      return { shortLabel: 'Cashback', icon: 'fas fa-coins', tone: 'cashback' };
    }
    if (/sustent|eco|recicl|verde/.test(blob)) {
      return { shortLabel: 'Sustentável', icon: 'fas fa-leaf', tone: 'sustainable' };
    }
    // Prefer option label (Acadêmicos, Perdidos, Vendo…); never full explanation.
    return {
      shortLabel: cleanShortLabel(label || groupLabel || value || 'Match'),
      icon: 'fas fa-bullseye',
      tone: 'match'
    };
  }

  function explicitReasons(signals, preferences) {
    var reasons = [];
    var moduleSignal = signals.find(function (signal) { return signal.type === 'module'; });
    if (moduleSignal && (preferences.modules || []).indexOf(moduleSignal.module) !== -1) {
      reasons.push(reasonMeta(
        'explicit-module',
        moduleSignal.label + ' escolhido por você',
        moduleSignal.label || 'Priorizado',
        'fas fa-wand-magic-sparkles',
        'prioritized'
      ));
    }
    signals.filter(function (signal) { return signal.type === 'feature'; }).forEach(function (signal) {
      var values = preferences.features && preferences.features[signal.featureKey];
      if (Array.isArray(values) && values.indexOf(signal.value) !== -1) {
        var badge = featureBadgeMeta(signal);
        reasons.push(reasonMeta(
          'explicit-feature',
          signal.label + ' escolhido por você',
          badge.shortLabel,
          badge.icon,
          badge.tone
        ));
      }
    });
    return reasons;
  }

  function scoreCandidate(post, index, preferences, affinity, registry, current) {
    var signals = extractSignals(post, registry);
    var reasons = explicitReasons(signals, preferences);
    var explicitBoost = 0;
    if (reasons.some(function (reason) { return reason.type === 'explicit-module'; })) explicitBoost += 0.06;
    explicitBoost += Math.min(0.06, reasons.filter(function (reason) { return reason.type === 'explicit-feature'; }).length * 0.035);
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
    if (affinityBoost > 0.001 && affinityLabel) {
      reasons.push(reasonMeta(
        'local-affinity',
        'Afinidade local com ' + affinityLabel,
        cleanShortLabel(affinityLabel, 'Afinidade'),
        'fas fa-heart',
        'affinity'
      ));
    }
    var boost = Math.min(MAX_TOTAL_BOOST, explicitBoost + affinityBoost);
    var base = Math.max(0, Number(post && post.relevanceScore) || 0);
    var personalizedScore = base * (1 + boost);
    // Prefer the most specific reason for the compact card badge.
    var primary = reasons.find(function (reason) { return reason && reason.type === 'explicit-feature'; })
      || reasons.find(function (reason) { return reason && reason.type === 'explicit-module'; })
      || reasons[0]
      || null;
    return {
      index: index,
      post: Object.assign({}, post, boost > 0 ? {
        relevanceScore: personalizedScore,
        _kcPersonalization: Object.freeze({
          boost: Math.round(boost * 10000) / 10000,
          explicitBoost: Math.round(explicitBoost * 10000) / 10000,
          affinityBoost: Math.round(affinityBoost * 10000) / 10000,
          primary: primary ? Object.freeze(Object.assign({}, primary)) : null,
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
      ? load({ storage: opts.storage, storageKey: opts.storageKey, now: current })
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
