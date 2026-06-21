/*
  KinoCampus - explicit search preferences and purpose-specific consent.

  This module is intentionally local-only. It never stores query text, identity,
  free-form profile data or inferred/sensitive attributes.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchPreferences = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = 1;
  var PURPOSE_VERSION = 'search-personalization-v1';
  var STORAGE_KEY = 'kc_search_preferences_v1';
  var AFFINITY_STORAGE_KEY = 'kc_search_affinity_v1';
  var MODES = Object.freeze({ STANDARD: 'standard', PERSONALIZED: 'personalized' });
  var MODULE_KEYS = Object.freeze([
    'achados-perdidos', 'caronas', 'compra-venda', 'eventos', 'moradia', 'oportunidades'
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueAllowed(values, allowed) {
    var seen = {};
    return (Array.isArray(values) ? values : []).map(function (value) {
      return String(value || '').trim();
    }).filter(function (value) {
      if (!value || allowed.indexOf(value) === -1 || seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort();
  }

  function preferenceCatalog(registry) {
    var source = registry && registry.registry ? registry.registry : registry;
    var modules = source && source.modules ? source.modules : {};
    var catalog = {};

    MODULE_KEYS.forEach(function (moduleKey) {
      var moduleEntry = modules[moduleKey];
      if (!moduleEntry) return;
      (moduleEntry.tagGroups || []).forEach(function (group) {
        if (group.preferenceEligible !== true) return;
        var featureKey = moduleKey + ':' + String(group.id || '');
        catalog[featureKey] = {
          key: featureKey,
          module: moduleKey,
          group: String(group.id || ''),
          label: String(group.label || ''),
          options: (group.options || []).map(function (option) {
            return { key: String(option.key || ''), label: String(option.label || '') };
          }).filter(function (option) { return !!option.key; })
        };
      });
    });
    return catalog;
  }

  function defaultState() {
    return {
      version: VERSION,
      mode: MODES.STANDARD,
      modules: [],
      features: {},
      localAffinityConsent: false,
      consent: {
        purpose: PURPOSE_VERSION,
        granted: false,
        source: 'settings',
        updatedAt: null
      },
      updatedAt: null
    };
  }

  function normalizeState(input, registry) {
    var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var catalog = preferenceCatalog(registry);
    var mode = source.mode === MODES.PERSONALIZED ? MODES.PERSONALIZED : MODES.STANDARD;
    var features = {};

    Object.keys(source.features && typeof source.features === 'object' ? source.features : {}).forEach(function (featureKey) {
      var entry = catalog[featureKey];
      if (!entry) return;
      var allowed = entry.options.map(function (option) { return option.key; });
      var values = uniqueAllowed(source.features[featureKey], allowed);
      if (values.length) features[featureKey] = values;
    });

    var granted = mode === MODES.PERSONALIZED;
    return {
      version: VERSION,
      mode: mode,
      modules: granted ? uniqueAllowed(source.modules, MODULE_KEYS) : [],
      features: granted ? features : {},
      localAffinityConsent: granted && source.localAffinityConsent === true,
      consent: {
        purpose: PURPOSE_VERSION,
        granted: granted,
        source: 'settings',
        updatedAt: granted && source.consent && typeof source.consent.updatedAt === 'string'
          ? source.consent.updatedAt
          : null
      },
      updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null
    };
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (_) {}
    return null;
  }

  function load(options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    if (!storage) return defaultState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : null, opts.registry);
    } catch (_) {
      return defaultState();
    }
  }

  function save(input, options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    if (!storage) throw new Error('KC_SEARCH_PREFERENCES_STORAGE_UNAVAILABLE');
    var now = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    var normalized = normalizeState(input, opts.registry);
    normalized.updatedAt = now;
    normalized.consent.updatedAt = now;
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    if (!normalized.localAffinityConsent) storage.removeItem(AFFINITY_STORAGE_KEY);
    return clone(normalized);
  }

  function clear(options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    if (storage) {
      storage.removeItem(STORAGE_KEY);
      storage.removeItem(AFFINITY_STORAGE_KEY);
    }
    return defaultState();
  }

  function exportData(options) {
    var opts = options || {};
    var storage = resolveStorage(opts.storage);
    var state = load(opts);
    var affinity = null;
    if (state.localAffinityConsent && storage) {
      try {
        var raw = storage.getItem(AFFINITY_STORAGE_KEY);
        affinity = raw ? JSON.parse(raw) : null;
      } catch (_) {}
    }
    return {
      exportVersion: 1,
      exportedAt: typeof opts.now === 'function' ? opts.now() : new Date().toISOString(),
      scope: 'local-browser-only',
      preferences: state,
      localAffinity: affinity
    };
  }

  function isPersonalized(input) {
    return !!input && input.mode === MODES.PERSONALIZED && input.consent && input.consent.granted === true;
  }

  return Object.freeze({
    VERSION: VERSION,
    PURPOSE_VERSION: PURPOSE_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    AFFINITY_STORAGE_KEY: AFFINITY_STORAGE_KEY,
    MODES: MODES,
    MODULE_KEYS: MODULE_KEYS,
    defaultState: defaultState,
    preferenceCatalog: preferenceCatalog,
    normalizeState: normalizeState,
    load: load,
    save: save,
    clear: clear,
    exportData: exportData,
    isPersonalized: isPersonalized
  });
}));
