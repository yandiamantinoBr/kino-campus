// Read-only, intentionally narrow D2 preflight. A "review_only" result never
// authorizes hiding a post: only a future transactional Edge/RPC can do that.
'use strict';

const { isDeepStrictEqual } = require('node:util');

const POST_FIELDS = [
  'id', 'author_id', 'created_at', 'updated_at', 'title', 'description',
  'price', 'location', 'module', 'category', 'status', 'visibility',
  'image_url', 'expires_at', 'metadata',
];
const MEDIA_FIELDS = ['id', 'post_id', 'url', 'is_cover', 'sort_order', 'created_at'];
const FACT_FIELDS = [
  'title', 'description', 'price', 'location', 'module', 'category',
  'visibility', 'image_url', 'expires_at',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANUAL_FLAGS = [
  'manual_edits_lock', 'manual_description', 'manual_distinct',
  'manual_distinct_pair', 'dedup_manual_distinct',
];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields) {
  return object(value) && isDeepStrictEqual(Object.keys(value).sort(), [...fields].sort());
}

function timestamp(value) {
  return typeof value === 'string' && value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function mediaShape(rows, postId) {
  if (!Array.isArray(rows) || rows.length > 24) return false;
  const ids = new Set();
  const urls = new Set();
  for (const row of rows) {
    if (!exactFields(row, MEDIA_FIELDS) || typeof row.id !== 'string' || !UUID.test(row.id) ||
      row.post_id !== postId || !webUrl(row.url, true) ||
      typeof row.is_cover !== 'boolean' || !Number.isSafeInteger(row.sort_order) ||
      row.sort_order < 0 || row.sort_order > 100 || !timestamp(row.created_at) ||
      ids.has(row.id) || urls.has(row.url)) return false;
    ids.add(row.id); urls.add(row.url);
  }
  return rows.length === 0 || rows.filter((row) => row.is_cover).length === 1;
}

function webUrl(value, allowHttp = false) {
  if (typeof value !== 'string' || value.length > 4096 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (allowHttp && url.protocol === 'http:')) &&
      !!url.hostname && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function sourceIdentity(metadata) {
  return object(metadata) &&
    ['source_id', 'source_url', 'source_registry_id', 'source_title'].every(
      (key) => typeof metadata[key] === 'string' && metadata[key].trim().length > 0,
    ) && webUrl(metadata.source_url);
}

function mediaContent(rows) {
  return rows.map(({ url, is_cover, sort_order }) => ({ url, is_cover, sort_order }))
    .sort((a, b) => a.sort_order - b.sort_order || a.url.localeCompare(b.url));
}

function assessAtomicDedupPreview(input, now = new Date()) {
  const reasons = [];
  const keep = input?.canonical;
  const hide = input?.redundant;
  if (![keep, hide].every((post) => exactFields(post, POST_FIELDS) &&
    typeof post.id === 'string' && UUID.test(post.id) &&
    typeof post.author_id === 'string' && UUID.test(post.author_id) && timestamp(post.created_at) &&
    timestamp(post.updated_at) && object(post.metadata))) {
    return { decision: 'blocked', reasons: ['INVALID_POST_SNAPSHOT'] };
  }
  if (!mediaShape(input.canonicalMedia, keep.id) || !mediaShape(input.redundantMedia, hide.id)) {
    return { decision: 'blocked', reasons: ['INVALID_MEDIA_SNAPSHOT'] };
  }
  if (keep.id === hide.id) reasons.push('SAME_POST');
  if (keep.author_id !== hide.author_id) reasons.push('DIFFERENT_AUTHOR');
  if (!['eventos', 'oportunidades'].includes(keep.module) || keep.module !== hide.module) reasons.push('MODULE_MISMATCH');
  if (keep.status !== 'published' || hide.status !== 'published' ||
    keep.visibility !== 'public' || hide.visibility !== 'public') reasons.push('NOT_TWO_PUBLIC_POSTS');
  if (Date.parse(keep.created_at) > Date.parse(hide.created_at) ||
    (keep.created_at === hide.created_at && keep.id > hide.id)) reasons.push('CANONICAL_NOT_OLDEST');
  if (keep.expires_at !== null && (!timestamp(keep.expires_at) || Date.parse(keep.expires_at) <= +now)) {
    reasons.push('CANONICAL_EXPIRED');
  }
  if (!sourceIdentity(keep.metadata) || !sourceIdentity(hide.metadata)) reasons.push('SOURCE_IDENTITY_MISSING');
  else if (['source_id', 'source_url', 'source_registry_id'].some(
    (key) => keep.metadata[key] !== hide.metadata[key],
  )) reasons.push('SOURCE_IDENTITY_MISMATCH');
  if ([keep.metadata, hide.metadata].some((meta) => MANUAL_FLAGS.some(
    (key) => meta[key] === true || meta[key] === 'true',
  )) || input.manualDistinctPair === true) reasons.push('MANUAL_DISTINCT_OR_LOCKED');
  if ([keep.metadata, hide.metadata].some((meta) =>
    meta.merged_into_post_id || meta.dedup_hidden_keep_id || meta.cadu_reactivation_blocked)) {
    reasons.push('EXISTING_DEDUP_TOMBSTONE');
  }
  if (FACT_FIELDS.some((key) => !isDeepStrictEqual(keep[key], hide[key]))) reasons.push('PUBLIC_FACTS_DIFFER');
  if (!isDeepStrictEqual(keep.metadata, hide.metadata)) reasons.push('METADATA_DIFFERS');
  if (!isDeepStrictEqual(mediaContent(input.canonicalMedia), mediaContent(input.redundantMedia))) {
    reasons.push('MEDIA_CONTENT_DIFFERS');
  }
  if (input.canonicalMedia.length && input.canonicalMedia.find((row) => row.is_cover)?.url !== keep.image_url) {
    reasons.push('CANONICAL_COVER_MISMATCH');
  }
  if (input.redundantMedia.length && input.redundantMedia.find((row) => row.is_cover)?.url !== hide.image_url) {
    reasons.push('REDUNDANT_COVER_MISMATCH');
  }
  return {
    decision: reasons.length ? 'blocked' : 'review_only',
    reasons,
    ...(reasons.length ? {} : { requiredBeforeMutation: [
      'authoritative_manual_distinct_check', 'fresh_full_post_and_media_CAS',
      'same_transaction_canonical_lineage_and_redundant_hide',
      'durable_before_after_ledger', 'CAS_rollback_and_public_visibility_check',
    ] }),
  };
}

module.exports = { assessAtomicDedupPreview };
