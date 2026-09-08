'use strict';

const { dedupeImageUrls, imageUrlSignature } = require('../../../../services/cadu-ufg-publisher/src/lib/image-signature');
const MEDIA_COLUMNS = 'id,post_id,url,is_cover,sort_order,created_at';
const MAX_MEDIA_ROWS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniqueMediaUrls(values, { coverUrl = '' } = {}) {
  return dedupeImageUrls(values, { coverUrl });
}

function failure(code) {
  // Provider errors can contain URLs or credentials; expose only the contract code.
  return Object.assign(new Error(`post_media append failed: ${code}`), { code });
}

function definiteRejection(error, status) {
  return /^(?:22|23|28|42|PGRST)/.test(String(error && error.code || ''))
    || [400, 401, 403, 404].includes(Number(status || error && error.status));
}

function validateRows(rows, postId) {
  if (!Array.isArray(rows) || rows.length > MAX_MEDIA_ROWS) throw failure('MEDIA_SNAPSHOT_INVALID');
  const ids = new Set();
  const urls = new Set();
  return rows.map(row => {
    if (!row || typeof row !== 'object' || !UUID.test(row.id || '') || row.post_id !== postId
      || typeof row.url !== 'string' || !row.url || row.url.length > 8192
      || typeof row.is_cover !== 'boolean'
      || !(row.sort_order === null || (Number.isSafeInteger(row.sort_order) && row.sort_order >= 0 && row.sort_order <= 1000000))
      || !(row.created_at === null || (typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))))
      || ids.has(row.id) || urls.has(row.url)) throw failure('MEDIA_SNAPSHOT_INVALID');
    ids.add(row.id);
    urls.add(row.url);
    return Object.fromEntries(MEDIA_COLUMNS.split(',').map(key => [key, row[key]]));
  }).sort((a, b) => a.id.localeCompare(b.id));
}

async function readSnapshot(supabase, postId) {
  let result;
  try {
    result = await supabase.from('post_media').select(MEDIA_COLUMNS)
      .eq('post_id', postId).order('id').limit(MAX_MEDIA_ROWS + 1);
  } catch (_) { throw failure('MEDIA_SNAPSHOT_READ_FAILED'); }
  if (!result || result.error) throw failure('MEDIA_SNAPSHOT_READ_FAILED');
  return validateRows(result.data, postId);
}

function appendUrls(values) {
  if (!Array.isArray(values)) throw failure('MEDIA_APPEND_INVALID');
  for (const value of values) {
    if (typeof value !== 'string' || value !== value.trim() || value.length > 8192 || /\s/.test(value)) {
      throw failure('MEDIA_APPEND_INVALID');
    }
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
    } catch (_) { throw failure('MEDIA_APPEND_INVALID'); }
  }
  const urls = uniqueMediaUrls(values);
  if (urls.length > 5) throw failure('MEDIA_APPEND_INVALID');
  return urls;
}

async function reconcile(supabase, postId, before, pending) {
  let observed;
  try { observed = await readSnapshot(supabase, postId); }
  catch (_) { throw failure('MEDIA_APPEND_OUTCOME_UNKNOWN'); }
  const byId = new Map(observed.map(row => [row.id, row]));
  if (before.some(row => JSON.stringify(row) !== JSON.stringify(byId.get(row.id)))) {
    throw failure('MEDIA_APPEND_OUTCOME_UNKNOWN');
  }
  const oldIds = new Set(before.map(row => row.id));
  const reconciled = pending.map(url => observed.find(row => !oldIds.has(row.id)
    && row.is_cover === false && imageUrlSignature(row.url) === imageUrlSignature(url)));
  if (reconciled.some(row => !row)) throw failure('MEDIA_APPEND_OUTCOME_UNKNOWN');
  // IDs are observed, not attributed to this caller. Never reinsert after an
  // uncertain response: the first transaction might already have committed.
  return { attempted: pending.length, inserted: [], reconciled, outcome: 'reconciled' };
}

/** Append only through an authenticated, post-locked exact-snapshot RPC. */
async function appendPostMediaIfAbsent(supabase, postId, urls) {
  const requested = appendUrls(urls);
  if (!requested.length) return { attempted: 0, inserted: [] };
  const normalizedPostId = String(postId || '').trim().toLowerCase();
  if (!UUID.test(normalizedPostId)) throw failure('MEDIA_POST_INVALID');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await readSnapshot(supabase, normalizedPostId);
    const existing = new Set(before.map(row => imageUrlSignature(row.url)));
    const pending = requested.filter(url => !existing.has(imageUrlSignature(url)));
    if (!pending.length) return { attempted: 0, inserted: [] };
    if (before.length + pending.length > MAX_MEDIA_ROWS) throw failure('MEDIA_CAP_EXCEEDED');
    let result;
    try {
      result = await supabase.rpc('kc_cadu_append_post_media', {
        p_post_id: normalizedPostId,
        p_expected_rows: before,
        p_append_urls: pending,
      });
    } catch (error) {
      if (definiteRejection(error)) throw failure('MEDIA_APPEND_REJECTED');
      return reconcile(supabase, normalizedPostId, before, pending);
    }
    if (result && result.error) {
      // Definite permission, validation and missing-RPC failures never reconcile
      // as success. There is no fallback to the legacy direct writer.
      if (definiteRejection(result.error, result.status)) throw failure('MEDIA_APPEND_REJECTED');
      return reconcile(supabase, normalizedPostId, before, pending);
    }
    const data = result && result.data;
    if (data && data.ok === false) {
      if (data.code === 'MEDIA_EDIT_CONFLICT' && attempt === 0) continue;
      throw failure(data.code === 'MEDIA_EDIT_CONFLICT' ? 'MEDIA_EDIT_CONFLICT' : 'MEDIA_APPEND_REJECTED');
    }
    try {
      if (!data || data.ok !== true || data.code !== 'MEDIA_APPENDED' || data.post_id !== normalizedPostId) throw new Error();
      const inserted = validateRows(data.inserted, normalizedPostId);
      const oldIds = new Set(before.map(row => row.id));
      if (inserted.length !== pending.length || inserted.some(row => oldIds.has(row.id)
        || row.is_cover !== false || !pending.includes(row.url))) throw new Error();
      return { attempted: pending.length, inserted };
    } catch (_) { return reconcile(supabase, normalizedPostId, before, pending); }
  }
  throw failure('MEDIA_EDIT_CONFLICT');
}

function buildCanonicalGalleryImageUrls(coverUrl, mediaRows, limit = 5) {
  return uniqueMediaUrls(
    Array.isArray(mediaRows) ? mediaRows.map(row => row && row.url) : [],
    { coverUrl },
  ).slice(0, Math.max(0, Number(limit) || 0));
}

module.exports = { appendPostMediaIfAbsent, buildCanonicalGalleryImageUrls, uniqueMediaUrls };
