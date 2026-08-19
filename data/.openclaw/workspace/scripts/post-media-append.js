'use strict';

function uniqueMediaUrls(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const url = String(value || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

/**
 * Append-only, conflict-safe post_media writer for Cadu enrichers.
 *
 * The database owns exact `(post_id,url)` uniqueness. `ignoreDuplicates`
 * closes the SELECT->INSERT race without weakening that constraint or replacing
 * an existing cover/order row.
 */
async function appendPostMediaIfAbsent(supabase, postId, urls) {
  const normalizedPostId = String(postId || '').trim();
  const uniqueUrls = uniqueMediaUrls(urls);
  if (!normalizedPostId || uniqueUrls.length === 0) {
    return { attempted: 0, inserted: [] };
  }

  const rows = uniqueUrls.map(url => ({
    post_id: normalizedPostId,
    url,
    is_cover: false,
  }));
  const query = supabase
    .from('post_media')
    .upsert(rows, {
      onConflict: 'post_id,url',
      ignoreDuplicates: true,
    });
  const result = query && typeof query.select === 'function'
    ? await query.select('id,url,is_cover,sort_order')
    : await query;

  if (result && result.error) {
    throw new Error(`post_media append failed: ${result.error.message}`);
  }
  return {
    attempted: rows.length,
    inserted: Array.isArray(result && result.data) ? result.data : [],
  };
}

function buildCanonicalGalleryImageUrls(coverUrl, mediaRows, limit = 5) {
  const normalizedCover = String(coverUrl || '').trim();
  return uniqueMediaUrls(
    Array.isArray(mediaRows) ? mediaRows.map(row => row && row.url) : [],
  ).filter(url => url !== normalizedCover)
    .slice(0, Math.max(0, Number(limit) || 0));
}

module.exports = {
  appendPostMediaIfAbsent,
  buildCanonicalGalleryImageUrls,
  uniqueMediaUrls,
};
