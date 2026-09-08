'use strict';

// URL identity proves equivalence only for reviewed provider forms. Unknown
// queries, case, extensions and version/hash prefixes can identify different
// posters or editions. A Storage filename hash may identify the source URL,
// not the downloaded bytes.
const IG_CDN_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/;
const IG_ASSET_FILE_RE = /^(\d{6,}(?:_\d{6,})+)(?:_[no])?\.(?:jpe?g|png|webp)$/;
const IG_DELIVERY_PARAMS = new Set(['oh', 'oe', '_nc_ohc', '_nc_ht', '_nc_cat']);
const IG_REENCODE_RE = /^dst-(?:jpg|jpeg|png|webp)(?:_e\d+)?(?:_s\d+x\d+)?$/;
const UFG_HOST_RE = /(^|\.)ufg\.br$/;

function imageUrlSignature(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return raw;
  }
  url.hash = '';
  // Neither credentials nor nonstandard ports are reviewed CDN variants.
  if (!url.username && !url.password && !url.port && IG_CDN_HOST_RE.test(url.hostname)) {
    const segments = url.pathname.split('/');
    const asset = IG_ASSET_FILE_RE.exec(segments[segments.length - 1]);
    if (asset) {
      segments[segments.length - 1] = asset[1];
      // Resize-only paths preserve the asset. Crop paths and every unknown
      // transformation remain part of its identity.
      const assetPath = segments.filter(segment => !/^s\d+x\d+$/.test(segment)).join('/');
      const query = new URLSearchParams();
      for (const [key, val] of url.searchParams) {
        if (IG_DELIVERY_PARAMS.has(key)) continue;
        if (key === 'stp' && IG_REENCODE_RE.test(val)) continue;
        query.append(key, val);
      }
      return `ig-cdn${assetPath}${query.size ? '?' + query.toString() : ''}`;
    }
  }
  if (!url.username && !url.password && !url.port && UFG_HOST_RE.test(url.hostname)) {
    // Keep the Weby tenant and full filename; /i/ elsewhere is not /o/.
    url.pathname = url.pathname.replace(
      /^(\/(?:weby\/)?up\/\d+\/)(?:l|i|m|s|thumb)\//,
      '$1o/',
    );
  }
  return url.href;
}

/**
 * Dedup preservando a primeira ocorrencia. Mantem a URL exata como chave
 * primaria (compatibilidade com a constraint (post_id,url)) e usa a assinatura
 * para colapsar variantes da mesma imagem.
 */
function dedupeImageUrls(values, { limit = 0, coverUrl = '' } = {}) {
  const seenExact = new Set();
  const seenSignature = new Set();
  const coverSignature = imageUrlSignature(coverUrl);
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const url = String(value || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const signature = imageUrlSignature(url);
    if (!signature) continue;
    if (coverSignature && signature === coverSignature) continue;
    if (seenExact.has(url) || seenSignature.has(signature)) continue;
    seenExact.add(url);
    seenSignature.add(signature);
    result.push(url);
    if (limit > 0 && result.length >= limit) break;
  }
  return result;
}

module.exports = {
  dedupeImageUrls,
  imageUrlSignature,
};
