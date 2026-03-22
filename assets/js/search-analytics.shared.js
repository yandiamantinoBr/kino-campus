(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KCSearchAnalytics = Object.freeze(api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SESSION_KEY = 'kc_search_session_id';
  var QUEUE_KEY = 'kc_search_pending_queue';
  var RECENT_KEY = 'kc_search_recent_terms';
  var DEFAULT_DEDUPE_WINDOW_MS = 5000;
  var MAX_QUEUE_SIZE = 40;
  var MAX_RECENT_SIZE = 60;

  function normalizeTrackedTerm(term) {
    return String(term || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeRead(storage, key, fallbackValue) {
    if (!storage || typeof storage.getItem !== 'function') return fallbackValue;
    try {
      var value = storage.getItem(key);
      return value == null ? fallbackValue : value;
    } catch (_) {
      return fallbackValue;
    }
  }

  function safeWrite(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
      storage.setItem(key, value);
    } catch (_) {}
  }

  function safeRemove(storage, key) {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
      storage.removeItem(key);
    } catch (_) {}
  }

  function readJson(storage, key, fallbackValue) {
    var raw = safeRead(storage, key, '');
    if (!raw) return fallbackValue;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallbackValue;
    }
  }

  function writeJson(storage, key, value) {
    safeWrite(storage, key, JSON.stringify(value));
  }

  function ensureSessionId(storage, randomFn, nowFn) {
    var existing = safeRead(storage, SESSION_KEY, '');
    if (existing) return existing;

    var randomValue = typeof randomFn === 'function'
      ? randomFn()
      : Math.random().toString(36).slice(2);
    var nowValue = typeof nowFn === 'function' ? nowFn() : Date.now();
    var sessionId = String(randomValue) + String(nowValue);
    safeWrite(storage, SESSION_KEY, sessionId);
    return sessionId;
  }

  function readQueue(storage) {
    var queue = readJson(storage, QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeQueue(storage, queue) {
    var list = Array.isArray(queue) ? queue.slice(-MAX_QUEUE_SIZE) : [];
    if (list.length) writeJson(storage, QUEUE_KEY, list);
    else safeRemove(storage, QUEUE_KEY);
  }

  function readRecentTerms(storage) {
    var recent = readJson(storage, RECENT_KEY, {});
    return recent && typeof recent === 'object' ? recent : {};
  }

  function writeRecentTerms(storage, recent) {
    var keys = Object.keys(recent || {}).sort(function (a, b) {
      return Number(recent[b]) - Number(recent[a]);
    }).slice(0, MAX_RECENT_SIZE);
    var normalized = {};
    keys.forEach(function (key) {
      normalized[key] = Number(recent[key]) || 0;
    });
    if (keys.length) writeJson(storage, RECENT_KEY, normalized);
    else safeRemove(storage, RECENT_KEY);
  }

  function pruneRecentTerms(recent, now, dedupeWindowMs) {
    var maxAge = Number(dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS;
    var pruned = {};
    Object.keys(recent || {}).forEach(function (key) {
      var timestamp = Number(recent[key]) || 0;
      if (now - timestamp <= maxAge) {
        pruned[key] = timestamp;
      }
    });
    return pruned;
  }

  function queueSearchTerm(storage, term, meta, now, dedupeWindowMs) {
    var trimmed = String(term || '').replace(/\s+/g, ' ').trim();
    var normalized = normalizeTrackedTerm(trimmed);
    if (!normalized || normalized.length < 2) return null;

    var timestamp = Number(now) || Date.now();
    var maxAge = Number(dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS;
    var recent = pruneRecentTerms(readRecentTerms(storage), timestamp, maxAge);
    var queue = readQueue(storage);

    var isRecent = typeof recent[normalized] === 'number' && timestamp - recent[normalized] <= maxAge;
    var isQueued = queue.some(function (entry) {
      return entry && entry.normalized === normalized && timestamp - (Number(entry.createdAt) || 0) <= maxAge;
    });

    if (isRecent || isQueued) {
      writeRecentTerms(storage, recent);
      return null;
    }

    var entry = {
      id: normalized + ':' + timestamp,
      term: trimmed,
      normalized: normalized,
      createdAt: timestamp,
      source: meta && meta.source ? String(meta.source) : 'unknown'
    };

    queue.push(entry);
    writeQueue(storage, queue);
    return entry;
  }

  function consumeQueuedTerms(storage, limit) {
    var queue = readQueue(storage);
    if (!queue.length) return [];
    var size = Math.max(1, Number(limit) || queue.length);
    return queue.slice(0, size);
  }

  function markTermsFlushed(storage, entries, now) {
    var timestamp = Number(now) || Date.now();
    var queue = readQueue(storage);
    var flushedIds = {};
    var recent = readRecentTerms(storage);

    (entries || []).forEach(function (entry) {
      if (!entry || !entry.id) return;
      flushedIds[entry.id] = true;
      if (entry.normalized) recent[entry.normalized] = timestamp;
    });

    writeQueue(storage, queue.filter(function (entry) {
      return !(entry && flushedIds[entry.id]);
    }));
    writeRecentTerms(storage, pruneRecentTerms(recent, timestamp, DEFAULT_DEDUPE_WINDOW_MS));
  }

  return {
    DEFAULT_DEDUPE_WINDOW_MS: DEFAULT_DEDUPE_WINDOW_MS,
    QUEUE_KEY: QUEUE_KEY,
    RECENT_KEY: RECENT_KEY,
    SESSION_KEY: SESSION_KEY,
    consumeQueuedTerms: consumeQueuedTerms,
    ensureSessionId: ensureSessionId,
    markTermsFlushed: markTermsFlushed,
    normalizeTrackedTerm: normalizeTrackedTerm,
    queueSearchTerm: queueSearchTerm,
    readQueue: readQueue,
    readRecentTerms: readRecentTerms,
    writeQueue: writeQueue
  };
});
