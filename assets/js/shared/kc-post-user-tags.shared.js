/*
  KinoCampus - contract for user-managed post tags.

  `tags` / `tagKeys` are the historical compatibility surface. They may mix
  old human labels and taxonomy generated before the editable contract
  existed. This module owns the canonical, explicitly user-managed pair:
  `metadata.userTags` / `metadata.userTagKeys`.

  It is intentionally UMD so browser flows, Node-based Cadu tooling and Jest
  tests use the same normalization and limits.
*/
/**
 * @typedef {'TAG_NOT_STRING' | 'TAG_TOO_LONG' | 'TAG_INVALID' | 'TOO_MANY_TAGS'} KCUserTagErrorCode
 * @typedef {{ code: KCUserTagErrorCode, message: string, limit?: number }} KCUserTagError
 * @typedef {{ tags: string[], tagKeys: string[], errors: KCUserTagError[] }} KCNormalizedUserTags
 * @typedef {KCNormalizedUserTags & { source: 'canonical' | 'legacy' | 'none', isLegacy: boolean }} KCReadUserTags
 * @typedef {{ isPrivileged?: boolean, limit?: number, allowExistingOverflow?: boolean, initialTags?: unknown }} KCUserTagValidationOptions
 * @typedef {KCNormalizedUserTags & { ok: boolean, limit: number, preservesExistingOverflow: boolean }} KCUserTagValidationResult
 * @typedef {KCUserTagValidationResult & { metadata?: Record<string, string[]> }} KCUserTagMetadataPatchResult
 * @typedef {Record<string, unknown>} KCUnknownRecord
 * @typedef {[KCUnknownRecord, string]} KCUserTagCandidate
 * @typedef {{
 *   USER_TAGS_KEY: string,
 *   USER_TAG_KEYS_KEY: string,
 *   STANDARD_LIMIT: number,
 *   PRIVILEGED_LIMIT: number,
 *   MAX_TAG_LENGTH: number,
 *   normalizeWhitespace: (value: unknown) => string,
 *   tagKey: (value: unknown) => string,
 *   parseText: (value: unknown) => string[],
 *   normalize: (input: unknown) => KCNormalizedUserTags,
 *   limitFor: (isPrivileged: boolean) => number,
 *   sameTags: (left: unknown, right: unknown) => boolean,
 *   validate: (input: unknown, options?: KCUserTagValidationOptions) => KCUserTagValidationResult,
 *   parseSerialized: (value: unknown) => string[],
 *   serialize: (value: unknown) => string,
 *   read: (post: unknown) => KCReadUserTags,
 *   metadataPatch: (input: unknown, options?: KCUserTagValidationOptions) => KCUserTagMetadataPatchResult,
 * }} KCPostUserTagsApi
 * @typedef {(Window & typeof globalThis) & { KCPostUserTags?: KCPostUserTagsApi }} KCPostUserTagsRoot
 */
/**
 * @param {KCPostUserTagsRoot} root
 * @param {() => KCPostUserTagsApi} factory
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCPostUserTags = factory();
  }
}(/** @type {KCPostUserTagsRoot} */ (typeof window !== 'undefined' ? window : /** @type {unknown} */ (this)), function () {
  'use strict';

  var USER_TAGS_KEY = 'userTags';
  var USER_TAG_KEYS_KEY = 'userTagKeys';
  var STANDARD_LIMIT = 6;
  var PRIVILEGED_LIMIT = 12;
  var MAX_TAG_LENGTH = 60;

  /**
   * @param {unknown} value
   * @returns {value is KCUnknownRecord}
   */
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * @param {unknown} value
   * @param {string} key
   * @returns {value is KCUnknownRecord}
   */
  function hasOwn(value, key) {
    return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  /** @param {unknown} value */
  function normalizeWhitespace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  /** @param {unknown} value */
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

  /** @param {unknown} value */
  function parseText(value) {
    return String(value == null ? '' : value)
      .split(/[\n,;]/)
      .map(normalizeWhitespace)
      .filter(Boolean);
  }

  /**
   * @param {unknown} value
   * @returns {unknown[]}
   */
  function sourceValues(value) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'string') return parseText(value);
    if (value == null || value === '') return [];
    return [value];
  }

  /**
   * @param {unknown} input
   * @returns {KCNormalizedUserTags}
   */
  function normalize(input) {
    /** @type {string[]} */
    var tags = [];
    /** @type {string[]} */
    var tagKeys = [];
    /** @type {KCUserTagError[]} */
    var errors = [];
    /** @type {Record<string, true>} */
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

  /** @param {boolean} isPrivileged */
  function limitFor(isPrivileged) {
    return isPrivileged === true ? PRIVILEGED_LIMIT : STANDARD_LIMIT;
  }

  /**
   * @param {unknown} left
   * @param {unknown} right
   */
  function sameTags(left, right) {
    var leftNormalized = normalize(left).tags;
    var rightNormalized = normalize(right).tags;
    if (leftNormalized.length !== rightNormalized.length) return false;
    return leftNormalized.every(function (tag, index) {
      return tag === rightNormalized[index];
    });
  }

  /**
   * @param {unknown} input
   * @param {KCUserTagValidationOptions=} options
   * @returns {KCUserTagValidationResult}
   */
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

  /** @param {unknown} value */
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

  /** @param {unknown} value */
  function serialize(value) {
    return JSON.stringify(normalize(value).tags);
  }

  /**
   * @param {unknown} post
   * @returns {KCReadUserTags}
   */
  function read(post) {
    var source = isPlainObject(post) ? post : {};
    var metadata = isPlainObject(source.metadata) ? source.metadata : {};
    // The persisted metadata is authoritative.  Some read adapters flatten
    // missing userTags as top-level [], so an empty synthetic convenience
    // field must not hide metadata.tags on an old row.
    /** @type {KCUserTagCandidate[]} */
    var metadataCanonicalCandidates = [
      [metadata, USER_TAGS_KEY],
      [metadata, 'user_tags'],
    ];
    for (var index = 0; index < metadataCanonicalCandidates.length; index += 1) {
      var metadataCandidate = metadataCanonicalCandidates[index];
      if (!metadataCandidate) continue;
      var holder = metadataCandidate[0];
      var key = metadataCandidate[1];
      if (!hasOwn(holder, key)) continue;
      var canonical = /** @type {KCReadUserTags} */ (normalize(holder[key]));
      canonical.source = 'canonical';
      canonical.isLegacy = false;
      return canonical;
    }

    var hasLegacySurface = hasOwn(metadata, 'tags') || hasOwn(source, 'tags');
    /** @type {KCReadUserTags | null} */
    var deferredTopLevelCanonical = null;
    /** @type {KCUserTagCandidate[]} */
    var topLevelCanonicalCandidates = [
      [source, USER_TAGS_KEY],
      [source, 'user_tags'],
    ];
    for (var topLevelIndex = 0; topLevelIndex < topLevelCanonicalCandidates.length; topLevelIndex += 1) {
      var topLevelCandidate = topLevelCanonicalCandidates[topLevelIndex];
      if (!topLevelCandidate) continue;
      var topLevelHolder = topLevelCandidate[0];
      var topLevelKey = topLevelCandidate[1];
      if (!hasOwn(topLevelHolder, topLevelKey)) continue;
      var topLevelCanonical = /** @type {KCReadUserTags} */ (normalize(topLevelHolder[topLevelKey]));
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
    /** @type {KCUserTagCandidate[]} */
    var legacyCandidates = [
      [source, 'tags'],
      [metadata, 'tags'],
    ];
    for (var legacyIndex = 0; legacyIndex < legacyCandidates.length; legacyIndex += 1) {
      var legacyCandidate = legacyCandidates[legacyIndex];
      if (!legacyCandidate) continue;
      var legacyHolder = legacyCandidate[0];
      var legacyKey = legacyCandidate[1];
      if (!hasOwn(legacyHolder, legacyKey)) continue;
      var legacy = /** @type {KCReadUserTags} */ (normalize(legacyHolder[legacyKey]));
      legacy.source = 'legacy';
      legacy.isLegacy = true;
      return legacy;
    }

    if (deferredTopLevelCanonical) return deferredTopLevelCanonical;

    var empty = /** @type {KCReadUserTags} */ (normalize([]));
    empty.source = 'none';
    empty.isLegacy = false;
    return empty;
  }

  /**
   * @param {unknown} input
   * @param {KCUserTagValidationOptions=} options
   * @returns {KCUserTagMetadataPatchResult}
   */
  function metadataPatch(input, options) {
    var checked = /** @type {KCUserTagMetadataPatchResult} */ (validate(input, options));
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
