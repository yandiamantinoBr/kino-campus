/*
  KinoCampus - explicit search preferences and purpose-specific consent.

  Local storage remains a fast cache for ranking. When the user is signed in,
  the same payload is upserted to public.search_preferences so preferences
  follow the account across devices.

  Never stores free-form query text or inferred demographic attributes.
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
      updatedAt: null,
      sync: {
        scope: 'local',
        remoteUpdatedAt: null,
        lastSyncedAt: null
      }
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
    var syncSource = source.sync && typeof source.sync === 'object' ? source.sync : {};
    return {
      version: VERSION,
      mode: mode,
      modules: granted ? uniqueAllowed(source.modules, MODULE_KEYS) : [],
      features: granted ? features : {},
      localAffinityConsent: granted && source.localAffinityConsent === true,
      consent: {
        purpose: PURPOSE_VERSION,
        granted: granted,
        source: (source.consent && source.consent.source === 'account')
          ? 'account'
          : (source.consent && typeof source.consent.source === 'string' ? source.consent.source : 'settings'),
        updatedAt: granted && source.consent && typeof source.consent.updatedAt === 'string'
          ? source.consent.updatedAt
          : null
      },
      updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
      sync: {
        scope: syncSource.scope === 'account' ? 'account' : 'local',
        remoteUpdatedAt: typeof syncSource.remoteUpdatedAt === 'string' ? syncSource.remoteUpdatedAt : null,
        lastSyncedAt: typeof syncSource.lastSyncedAt === 'string' ? syncSource.lastSyncedAt : null
      }
    };
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (_) {}
    return null;
  }

  function parseTime(value) {
    if (!value) return 0;
    var ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }

  function pickNewer(left, right) {
    var leftAt = parseTime(left && left.updatedAt);
    var rightAt = parseTime(right && right.updatedAt);
    if (rightAt > leftAt) return right;
    if (leftAt > rightAt) return left;
    // tie-break: personalized wins over empty standard only if modules/features present
    if (isPersonalized(right) && !isPersonalized(left)) return right;
    return left;
  }

  function toRemotePayload(state) {
    var normalized = normalizeState(state);
    return {
      version: normalized.version,
      mode: normalized.mode,
      modules: normalized.modules,
      features: normalized.features,
      localAffinityConsent: normalized.localAffinityConsent,
      consent: normalized.consent,
      updatedAt: normalized.updatedAt
    };
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
    if (opts.scope === 'account') {
      normalized.sync.scope = 'account';
      normalized.sync.remoteUpdatedAt = now;
      normalized.sync.lastSyncedAt = now;
      normalized.consent.source = 'account';
    } else {
      normalized.sync.scope = 'local';
      if (opts.preserveRemoteMeta !== true) {
        normalized.sync.lastSyncedAt = normalized.sync.lastSyncedAt || null;
      }
    }
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
      exportVersion: 2,
      exportedAt: typeof opts.now === 'function' ? opts.now() : new Date().toISOString(),
      scope: state.sync && state.sync.scope === 'account' ? 'account-and-local-cache' : 'local-browser-only',
      preferences: state,
      localAffinity: affinity
    };
  }

  function isPersonalized(input) {
    return !!input && input.mode === MODES.PERSONALIZED && input.consent && input.consent.granted === true;
  }

  /**
   * Merge remote account payload with local cache.
   * Remote wins when strictly newer; otherwise local is preferred and can be pushed.
   */
  function mergeLocalAndRemote(localState, remoteState, registry) {
    var local = normalizeState(localState, registry);
    var remote = remoteState ? normalizeState(remoteState, registry) : null;
    if (!remote) {
      return { state: local, shouldPushRemote: isPersonalized(local) || !!local.updatedAt, shouldWriteLocal: false };
    }
    remote.sync = remote.sync || {};
    remote.sync.scope = 'account';
    remote.sync.remoteUpdatedAt = remote.updatedAt;
    var winner = pickNewer(local, remote);
    var remoteIsWinner = winner === remote || (parseTime(remote.updatedAt) >= parseTime(local.updatedAt) && remote.updatedAt);
    if (remoteIsWinner && parseTime(remote.updatedAt) > parseTime(local.updatedAt)) {
      winner.sync = {
        scope: 'account',
        remoteUpdatedAt: remote.updatedAt,
        lastSyncedAt: remote.updatedAt
      };
      return { state: winner, shouldPushRemote: false, shouldWriteLocal: true };
    }
    // local is newer or equal
    winner.sync = {
      scope: 'account',
      remoteUpdatedAt: remote.updatedAt,
      lastSyncedAt: local.updatedAt || remote.updatedAt
    };
    return {
      state: winner,
      shouldPushRemote: parseTime(local.updatedAt) > parseTime(remote.updatedAt),
      shouldWriteLocal: false
    };
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
    isPersonalized: isPersonalized,
    toRemotePayload: toRemotePayload,
    mergeLocalAndRemote: mergeLocalAndRemote,
    pickNewer: pickNewer
  });
}));
