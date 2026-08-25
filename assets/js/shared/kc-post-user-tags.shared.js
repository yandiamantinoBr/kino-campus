/*
  KinoCampus - contract for user-managed post tags.

  `tags` / `tagKeys` are the historical compatibility surface. They may mix
  old human labels and taxonomy generated before the editable contract
  existed. This module owns the canonical, explicitly user-managed pair:
  `metadata.userTags` / `metadata.userTagKeys`.

  It is intentionally UMD so browser flows, Node-based Cadu tooling and Jest
  tests use the same normalization and limits.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCPostUserTags = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var USER_TAGS_KEY = 'userTags';
  var USER_TAG_KEYS_KEY = 'userTagKeys';
  var STANDARD_LIMIT = 6;
  var PRIVILEGED_LIMIT = 12;
  var MAX_TAG_LENGTH = 60;

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(value, key) {
    return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  function normalizeWhitespace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function tagKey(value) {
    var label = normalizeWhitespace(value);
    if (!label) return '';
    try {
      return label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_TAG_LENGTH);
    } catch (_) {
      return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_TAG_LENGTH);
    }
  }

  function parseText(value) {
    return String(value == null ? '' : value)
      .split(/[\n,;]/)
      .map(normalizeWhitespace)
      .filter(Boolean);
  }

  function sourceValues(value) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'string') return parseText(value);
    if (value == null || value === '') return [];
    return [value];
  }

  function normalize(input) {
    var tags = [];
    var tagKeys = [];
    var errors = [];
    var seen = {};

    sourceValues(input).forEach(function (raw) {
      if (typeof raw !== 'string') {
        errors.push({ code: 'TAG_NOT_STRING', message: 'Cada tag precisa ser um texto.' });
        return;
      }
      var label = normalizeWhitespace(raw);
      if (!label) return;
      if (label.length > MAX_TAG_LENGTH) {
        errors.push({ code: 'TAG_TOO_LONG', message: 'Cada tag pode ter no máximo ' + MAX_TAG_LENGTH + ' caracteres.' });
        return;
      }
      var key = tagKey(label);
      if (!key) {
        errors.push({ code: 'TAG_INVALID', message: 'Use pelo menos uma letra ou número em cada tag.' });
        return;
      }
      if (seen[key]) return;
      seen[key] = true;
      tags.push(label);
      tagKeys.push(key);
    });

    return { tags: tags, tagKeys: tagKeys, errors: errors };
  }

  function limitFor(isPrivileged) {
    return isPrivileged === true ? PRIVILEGED_LIMIT : STANDARD_LIMIT;
  }

  function sameTags(left, right) {
    var leftNormalized = normalize(left).tags;
    var rightNormalized = normalize(right).tags;
    if (leftNormalized.length !== rightNormalized.length) return false;
    return leftNormalized.every(function (tag, index) {
      return tag === rightNormalized[index];
    });
  }

  function validate(input, options) {
    var opts = options || {};
    var normalized = normalize(input);
    var limit = Number.isFinite(Number(opts.limit))
      ? Math.max(0, Math.floor(Number(opts.limit)))
      : limitFor(opts.isPrivileged === true);
    var errors = normalized.errors.slice();
    var preservesExistingOverflow = opts.allowExistingOverflow === true
      && sameTags(normalized.tags, opts.initialTags);
    if (normalized.tags.length > limit && !preservesExistingOverflow) {
      errors.push({
        code: 'TOO_MANY_TAGS',
        message: 'Você pode adicionar no máximo ' + limit + ' tags adicionais nesta publicação.',
        limit: limit,
      });
    }
    return {
      ok: errors.length === 0,
      tags: normalized.tags,
      tagKeys: normalized.tagKeys,
      errors: errors,
      limit: limit,
      preservesExistingOverflow: preservesExistingOverflow,
    };
  }

  function parseSerialized(value) {
    if (Array.isArray(value)) return normalize(value).tags;
    var text = String(value == null ? '' : value).trim();
    if (!text) return [];
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return normalize(parsed).tags;
    } catch (_) { }
    return normalize(text).tags;
  }

  function serialize(value) {
    return JSON.stringify(normalize(value).tags);
  }

  function read(post) {
    var source = isPlainObject(post) ? post : {};
    var metadata = isPlainObject(source.metadata) ? source.metadata : {};
    // The persisted metadata is authoritative.  Some read adapters flatten
    // missing userTags as top-level [], so an empty synthetic convenience
    // field must not hide metadata.tags on an old row.
    var metadataCanonicalCandidates = [
      [metadata, USER_TAGS_KEY],
      [metadata, 'user_tags'],
    ];
    for (var index = 0; index < metadataCanonicalCandidates.length; index += 1) {
      var holder = metadataCanonicalCandidates[index][0];
      var key = metadataCanonicalCandidates[index][1];
      if (!hasOwn(holder, key)) continue;
      var canonical = normalize(holder[key]);
      canonical.source = 'canonical';
      canonical.isLegacy = false;
      return canonical;
    }

    var hasLegacySurface = hasOwn(metadata, 'tags') || hasOwn(source, 'tags');
    var deferredTopLevelCanonical = null;
    var topLevelCanonicalCandidates = [
      [source, USER_TAGS_KEY],
      [source, 'user_tags'],
    ];
    for (var topLevelIndex = 0; topLevelIndex < topLevelCanonicalCandidates.length; topLevelIndex += 1) {
      var topLevelHolder = topLevelCanonicalCandidates[topLevelIndex][0];
      var topLevelKey = topLevelCanonicalCandidates[topLevelIndex][1];
      if (!hasOwn(topLevelHolder, topLevelKey)) continue;
      var topLevelCanonical = normalize(topLevelHolder[topLevelKey]);
      topLevelCanonical.source = 'canonical';
      topLevelCanonical.isLegacy = false;
      if (topLevelCanonical.tags.length || !hasLegacySurface) return topLevelCanonical;
      // Keep a true explicit clear as a last resort, after giving the
      // historical metadata pair a chance to be displayed by old adapters.
      deferredTopLevelCanonical = topLevelCanonical;
    }

    // Historical posts only had `tags`/`tagKeys`.  Prefer the visible labels
    // and use this read-only fallback until the database backfill has written
    // the canonical pair.  An explicit userTags: [] above deliberately wins
    // and therefore remains a real clear action.
    var legacyCandidates = [
      [source, 'tags'],
      [metadata, 'tags'],
    ];
    for (var legacyIndex = 0; legacyIndex < legacyCandidates.length; legacyIndex += 1) {
      var legacyHolder = legacyCandidates[legacyIndex][0];
      var legacyKey = legacyCandidates[legacyIndex][1];
      if (!hasOwn(legacyHolder, legacyKey)) continue;
      var legacy = normalize(legacyHolder[legacyKey]);
      legacy.source = 'legacy';
      legacy.isLegacy = true;
      return legacy;
    }

    if (deferredTopLevelCanonical) return deferredTopLevelCanonical;

    var empty = normalize([]);
    empty.source = 'none';
    empty.isLegacy = false;
    return empty;
  }

  function metadataPatch(input, options) {
    var checked = validate(input, options);
    if (!checked.ok) return checked;
    checked.metadata = {};
    checked.metadata[USER_TAGS_KEY] = checked.tags.slice();
    checked.metadata[USER_TAG_KEYS_KEY] = checked.tagKeys.slice();
    return checked;
  }

  return Object.freeze({
    USER_TAGS_KEY: USER_TAGS_KEY,
    USER_TAG_KEYS_KEY: USER_TAG_KEYS_KEY,
    STANDARD_LIMIT: STANDARD_LIMIT,
    PRIVILEGED_LIMIT: PRIVILEGED_LIMIT,
    MAX_TAG_LENGTH: MAX_TAG_LENGTH,
    normalizeWhitespace: normalizeWhitespace,
    tagKey: tagKey,
    parseText: parseText,
    normalize: normalize,
    limitFor: limitFor,
    sameTags: sameTags,
    validate: validate,
    parseSerialized: parseSerialized,
    serialize: serialize,
    read: read,
    metadataPatch: metadataPatch,
  });
}));
