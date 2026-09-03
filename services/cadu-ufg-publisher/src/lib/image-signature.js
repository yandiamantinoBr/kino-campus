'use strict';

/**
 * Assinatura de identidade de imagem (2026-09-03).
 *
 * Duplicatas intra-post aconteciam porque URLs "diferentes" apontavam para a
 * MESMA imagem:
 *   - CDN do Instagram: hostname e tokens volateis mudam a cada fetch
 *     (scontent.fgru8-1.fna.fbcdn.net vs scontent.cdninstagram.com; oh/oe/_nc_ohc/stp);
 *   - CMS UFG (weby): par thumb/original do mesmo arquivo vive em segmentos
 *     /l/ e /o/ do mesmo diretorio numerado (/weby/up/313/l/x.png vs /o/x.png).
 *
 * Assinatura:
 *   1. Hosts de CDN do Instagram (cdninstagram.com / fbcdn.net) colapsam para
 *      "ig-cdn" + chave estavel do asset: a tupla numerica do filename
 *      (\d{6,}(_\d{6,})+), que nao muda entre fetches/tamanhos.
 *   2. Demais hosts mantem o hostname (imagens de sites distintos nao colapsam)
 *      e normalizam segmentos de diretorio de variante (l/i -> o), descartando
 *      query e prefixo de versao hexa do filename.
 *   3. URLs invalidas caem para o texto normalizado, preservando o comportamento
 *      anterior de nao colapsar.
 */

const IG_CDN_HOST_RE = /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/;
const IG_ASSET_KEY_RE = /(\d{6,}(?:_\d{6,}){1,})/;
const VERSIONED_FILE_RE = /^[a-f0-9]{8,}_/;

function registrablePathSegments(pathname) {
  const raw = String(pathname || '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    decoded = raw;
  }
  return decoded
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .map(segment => (segment === 'l' || segment === 'i' ? 'o' : segment));
}

function imageUrlSignature(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return raw.toLowerCase().slice(0, 300);
  }
  const host = url.hostname.toLowerCase();
  if (IG_CDN_HOST_RE.test(host)) {
    const segments = url.pathname.split('/').filter(Boolean);
    const file = (segments[segments.length - 1] || '').toLowerCase();
    const asset = IG_ASSET_KEY_RE.exec(file);
    if (asset) return 'ig-cdn/' + asset[1];
    return 'ig-cdn/' + file.replace(VERSIONED_FILE_RE, '').slice(0, 160);
  }
  const segments = registrablePathSegments(url.pathname);
  if (segments.length === 0) return host + '/';
  const last = segments.length - 1;
  segments[last] = segments[last].replace(VERSIONED_FILE_RE, '').slice(0, 160) || segments[last];
  return host + '/' + segments.join('/').slice(-240);
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