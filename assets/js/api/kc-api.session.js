/*
  KinoCampus - KCAPI session cache and post freshness internals (V76)

  Extracted from kc-api.client.js to keep the public facade focused on
  KCAPI wiring while preserving the existing global contracts:
  - window.KCSessionStore
  - window.KCPostFreshness
  - window._KCAPI.session
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  const SESSION_STORE_VERSION = '9.0.0';
  const SESSION_STORE_PREFIX = `kc:${SESSION_STORE_VERSION}`;

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

  function clearSessionCacheScopes(scopes) {
    const list = Array.isArray(scopes) ? scopes : (scopes != null ? [scopes] : []);
    let removed = 0;
    list.forEach((scope) => {
      const normalizedScope = String(scope || '').trim();
      if (!normalizedScope) return;
      removed += clearSessionCachePrefix(normalizedScope, '');
    });
    return removed;
  }

  window.KCSessionStore = Object.freeze({
    version: SESSION_STORE_VERSION,
    key: buildSessionStoreKey,
    get: getSessionCache,
    set: setSessionCache,
    remove: removeSessionCache,
    clearPrefix: clearSessionCachePrefix,
    clearScopes: clearSessionCacheScopes,
    getStore: function () { return window.KCSessionStore; },
  });

  const POST_FRESHNESS_EVENT = 'kc:post-freshness';
  const POST_FRESHNESS_STORAGE_KEY = 'kc_post_freshness_event';
  const POST_FRESHNESS_CHANNEL = 'kc-post-freshness-v1';
  const POST_FRESHNESS_TYPES = new Set(['created', 'updated', 'status_changed', 'soft_deleted', 'purged']);
  const POST_FRESHNESS_PRIVATE_KEYS = new Set([
    'title', 'titulo', 'description', 'descricao', 'email', 'author_email', 'authorEmail',
    'metadata', 'raw', 'payload', 'data', 'user', 'profile', 'token', 'authorization',
  ]);
  const POST_FRESHNESS_TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const postFreshnessSubscribers = new Set();
  const postFreshnessSeen = new Set();
  let postFreshnessChannel = null;

  function safeString(value) {
    const text = String(value == null ? '' : value).trim();
    return text || '';
  }

  function readPostFreshnessField(change, names) {
    const source = (change && typeof change === 'object') ? change : {};
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(source, name)) {
        const value = safeString(source[name]);
        if (value) return value;
      }
    }
    return '';
  }

  function normalizePostFreshnessChange(change) {
    const source = (change && typeof change === 'object') ? change : {};
    const rawType = safeString(source.type || source.event || source.action).toLowerCase();
    const type = POST_FRESHNESS_TYPES.has(rawType) ? rawType : 'updated';
    const postId = readPostFreshnessField(source, ['postId', 'post_id', 'id', 'uuid']);
    const legacyId = readPostFreshnessField(source, ['legacyId', 'legacy_id']);
    const moduleKey = readPostFreshnessField(source, ['module', 'moduleKey', 'modulo']).toLowerCase();
    const status = readPostFreshnessField(source, ['status', 'new_status', 'estado']).toLowerCase();
    const updatedAt = readPostFreshnessField(source, ['updated_at', 'updatedAt']);
    const eventId = readPostFreshnessField(source, ['eventId', 'event_id'])
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const sanitized = {
      type,
      eventId,
      source: safeString(source.source || 'local'),
      postId,
      uuid: postId,
      legacyId,
      module: moduleKey,
      status,
      updated_at: updatedAt,
      timestamp: Number(source.timestamp) || Date.now(),
      origin: safeString(source.origin || POST_FRESHNESS_TAB_ID),
    };

    Object.keys(source).forEach((key) => {
      if (POST_FRESHNESS_PRIVATE_KEYS.has(key)) return;
      if (Object.prototype.hasOwnProperty.call(sanitized, key)) return;
      if (/email|token|cookie|authorization|secret|password/i.test(key)) return;
      const value = source[key];
      if (value == null || typeof value === 'object') return;
      const text = safeString(value);
      if (text && text.length <= 160) sanitized[key] = text;
    });

    return sanitized;
  }

  function clearPostFreshnessCaches(options = {}) {
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const scopes = Array.isArray(input.scopes) && input.scopes.length
      ? input.scopes
      : ['feeds', 'product-detail', 'my-posts', 'profile-posts', 'profile'];
    const store = window.KCSessionStore;
    let removed = 0;

    if (store && typeof store.clearScopes === 'function') {
      removed += store.clearScopes(scopes);
    } else if (store && typeof store.clearPrefix === 'function') {
      scopes.forEach((scope) => {
        try { removed += store.clearPrefix(scope, ''); } catch (_) { }
      });
    }

    try {
      if (window._KCProduct && window._KCProduct.load && typeof window._KCProduct.load.invalidateProductDetailCache === 'function') {
        window._KCProduct.load.invalidateProductDetailCache(input.postId || input.uuid || input.legacyId || null);
      }
    } catch (_) { }

    return removed;
  }

  function dispatchPostFreshness(payload) {
    if (!payload || !payload.eventId || postFreshnessSeen.has(payload.eventId)) return;
    postFreshnessSeen.add(payload.eventId);
    if (postFreshnessSeen.size > 200) {
      const first = postFreshnessSeen.values().next();
      if (!first.done) postFreshnessSeen.delete(first.value);
    }

    clearPostFreshnessCaches(payload);

    try {
      document.dispatchEvent(new CustomEvent(POST_FRESHNESS_EVENT, { detail: payload }));
    } catch (_) { }

    postFreshnessSubscribers.forEach((handler) => {
      try { handler(payload); } catch (_) { }
    });
  }

  function getSupabaseClientForFreshness() {
    try {
      return (window.KCSupabase && typeof window.KCSupabase.getClient === 'function')
        ? window.KCSupabase.getClient()
        : null;
    } catch (_) { return null; }
  }

  const POST_FRESHNESS_RT_TOPIC = 'kc-posts-changes';
  let postFreshnessRtChannel = null;

  function ensureRealtimeFreshnessChannel() {
    if (postFreshnessRtChannel) return postFreshnessRtChannel;
    const client = getSupabaseClientForFreshness();
    if (!client || typeof client.channel !== 'function') return null;
    try {
      const ch = client.channel(POST_FRESHNESS_RT_TOPIC, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'post_change' }, (msg) => {
        const src = (msg && msg.payload) ? msg.payload : msg;
        if (!src) return;
        const payload = normalizePostFreshnessChange({
          type: src.type,
          eventId: src.eventId,
          postId: src.postId,
          legacyId: src.legacyId,
          module: src.module,
          status: src.status,
          updated_at: src.updated_at,
          source: 'realtime-broadcast',
        });
        if (payload.origin === POST_FRESHNESS_TAB_ID) return;
        dispatchPostFreshness(payload);
      });
      ch.subscribe();
      postFreshnessRtChannel = ch;
    } catch (_) { postFreshnessRtChannel = null; }
    return postFreshnessRtChannel;
  }

  function publishRealtimeFreshness(payload) {
    try {
      const ch = ensureRealtimeFreshnessChannel();
      if (!ch || typeof ch.send !== 'function') return false;
      ch.send({
        type: 'broadcast',
        event: 'post_change',
        payload: {
          type: payload.type,
          eventId: payload.eventId,
          postId: payload.postId,
          legacyId: payload.legacyId,
          module: payload.module,
          status: payload.status,
          updated_at: payload.updated_at,
        },
      });
      return true;
    } catch (_) { return false; }
  }

  function emitPostFreshness(change) {
    const payload = normalizePostFreshnessChange(change);
    dispatchPostFreshness(payload);

    try {
      if (postFreshnessChannel && typeof postFreshnessChannel.postMessage === 'function') {
        postFreshnessChannel.postMessage(payload);
      }
    } catch (_) { }

    try {
      if (window.localStorage) {
        window.localStorage.setItem(POST_FRESHNESS_STORAGE_KEY, JSON.stringify(payload));
        window.localStorage.removeItem(POST_FRESHNESS_STORAGE_KEY);
      }
    } catch (_) { }

    try {
      const freshSource = String((payload && payload.source) || '').toLowerCase();
      const isLocalOrigin = !!freshSource
        && freshSource.indexOf('realtime') === -1
        && freshSource !== 'broadcast'
        && freshSource !== 'remote';
      if (isLocalOrigin) {
        publishRealtimeFreshness(payload);
      }
    } catch (_) { }

    return payload;
  }

  function subscribePostFreshness(handler) {
    if (typeof handler !== 'function') return function () { };
    postFreshnessSubscribers.add(handler);
    return function () {
      postFreshnessSubscribers.delete(handler);
    };
  }

  function setupPostFreshnessTransports() {
    try {
      if (typeof window.BroadcastChannel === 'function') {
        postFreshnessChannel = new window.BroadcastChannel(POST_FRESHNESS_CHANNEL);
        postFreshnessChannel.onmessage = function (event) {
          const payload = normalizePostFreshnessChange(event && event.data);
          if (payload.origin === POST_FRESHNESS_TAB_ID) return;
          dispatchPostFreshness(payload);
        };
      }
    } catch (_) {
      postFreshnessChannel = null;
    }

    try {
      window.addEventListener('storage', function (event) {
        if (!event || event.key !== POST_FRESHNESS_STORAGE_KEY || !event.newValue) return;
        let parsed = null;
        try { parsed = JSON.parse(event.newValue); } catch (_) { parsed = null; }
        const payload = normalizePostFreshnessChange(parsed);
        if (payload.origin === POST_FRESHNESS_TAB_ID) return;
        dispatchPostFreshness(payload);
      });
    } catch (_) { }
  }

  setupPostFreshnessTransports();

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(ensureRealtimeFreshnessChannel, 0); }, { once: true });
    } else {
      setTimeout(ensureRealtimeFreshnessChannel, 0);
    }
  } catch (_) { }

  window.KCPostFreshness = Object.freeze({
    EVENT_NAME: POST_FRESHNESS_EVENT,
    emit: emitPostFreshness,
    subscribe: subscribePostFreshness,
    clearContentCaches: clearPostFreshnessCaches,
    normalize: normalizePostFreshnessChange,
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

  window._KCAPI.session = Object.freeze({
    SESSION_STORE_VERSION,
    SESSION_STORE_PREFIX,
    POST_FRESHNESS_EVENT,
    POST_FRESHNESS_STORAGE_KEY,
    POST_FRESHNESS_CHANNEL,
    POST_FRESHNESS_RT_TOPIC,
    getSessionStore,
    buildSessionStoreKey,
    getSessionCache,
    setSessionCache,
    removeSessionCache,
    clearSessionCachePrefix,
    clearSessionCacheScopes,
    withPendingSessionRequest,
    getCachedSessionPayload,
    persistSessionPayload,
    normalizePostFreshnessChange,
    clearPostFreshnessCaches,
    dispatchPostFreshness,
    emitPostFreshness,
    subscribePostFreshness,
    setupPostFreshnessTransports,
    ensureRealtimeFreshnessChannel,
    publishRealtimeFreshness,
  });
})();
