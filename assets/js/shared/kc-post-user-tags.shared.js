/*
  KinoCampus - contract for user-managed post tags.

  `tags` / `tagKeys` remain the automatic taxonomy surface. This module owns
  only the additional, explicitly user-managed pair:
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

  function validate(input, options) {
    var opts = options || {};
    var normalized = normalize(input);
    var limit = Number.isFinite(Number(opts.limit))
      ? Math.max(0, Math.floor(Number(opts.limit)))
      : limitFor(opts.isPrivileged === true);
    var errors = normalized.errors.slice();
    if (normalized.tags.length > limit) {
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
    var candidates = [
      source[USER_TAGS_KEY],
      metadata[USER_TAGS_KEY],
      source.user_tags,
      metadata.user_tags,
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      if (Array.isArray(candidates[index])) return normalize(candidates[index]);
    }
    return normalize([]);
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
    validate: validate,
    parseSerialized: parseSerialized,
    serialize: serialize,
    read: read,
    metadataPatch: metadataPatch,
  });
}));
