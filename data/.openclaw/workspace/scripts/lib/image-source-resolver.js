#!/usr/bin/env node
/**
 * image-source-resolver.js — Resolve a melhor URL de imagem a partir de múltiplas fontes (P1-A)
 *
 * Adicionado em 2026-06-12 após o curador ter pegado só imagens minúsculas (13KB)
 * do CMS UFG. A pipeline precisa consultar:
 *   1. Sympla (se o evento tem página lá) — poster oficial
 *   2. YouTube (se tem live/vídeo) — thumbnail oficial (maxresdefault)
 *   3. Organizador (LAPEI, PPGEEC, FAV, etc.) — banner dedicado
 *   4. Fallback: imagem da página de origem (já normalizada pelo P0-A)
 *
 * v0.1 (2026-06-12): Sympla + YouTube + organizer básico
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const {
  isKnownPlaceholderImageUrl,
  validateImageUrl,
  normalizeImageUrl,
} = require('./image-utils.js');

// ============================================================
// HTTP HELPERS
// ============================================================

function fetchText(url, opts = {}) {
  const { timeoutMs = 15000, userAgent = 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)', maxRedirects = 5, maxBytes = 2 * 1024 * 1024 } = opts;
  return _fetchTextWithRedirects(url, opts, 0, maxRedirects, maxBytes);
}

function _fetchTextWithRedirects(url, opts, depth, maxRedirects, maxBytes) {
  return new Promise((resolve, reject) => {
    if (depth > maxRedirects) {
      return reject(new Error(`max_redirects:${maxRedirects}`));
    }
    const lib = url.startsWith('https') ? https : http;
    const { timeoutMs = 15000, userAgent = 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)' } = opts;
    const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': userAgent } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return _fetchTextWithRedirects(next, opts, depth + 1, maxRedirects, maxBytes).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`http_${res.statusCode}`));
      }
      const ct = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      let data = '';
      let bytes = 0;
      let truncated = false;
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          truncated = true;
          data += chunk.slice(0, maxBytes - (bytes - chunk.length));
          res.destroy();
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        if (truncated) {
          // aceita parcial
        }
        resolve({ body: data, contentType: ct, bytes, truncated });
      });
      res.on('error', (e) => reject(e));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ============================================================
// SOURCE-SPECIFIC RESOLVERS
// ============================================================

/**
 * Sympla: dado um link sympla.com.br, retorna a URL do poster oficial.
 * Padrão: https://images.sympla.com.br/{event-id}-lg.jpg
 * Mas o ID é interno — só descobrimos fazendo fetch da página.
 */
async function resolveSympla(symplaUrl) {
  if (!symplaUrl || !/sympla\.com\.br/.test(symplaUrl)) return null;
  try {
    const { body, contentType } = await fetchText(symplaUrl);
    if (!/text\/html/.test(contentType)) return null;
    // Procura og:image ou img principal
    const ogMatch = body.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);
    if (ogMatch) {
      let url = ogMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      // Sympla serve images em /-lg.jpg, /-md.jpg, /-sm.jpg
      // O og:image costuma ser o tamanho original ou md.
      return url;
    }
    // Fallback: procurar <img class="event-image"> ou similar
    const imgMatch = body.match(/<img[^>]+class=["'][^"']*event-image[^"']*["'][^>]+src=["']([^"']+)["']/i);
    if (imgMatch) {
      let url = imgMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      return url;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * YouTube: dado um link youtube.com/watch?v=ID ou youtu.be/ID, retorna maxresdefault.jpg
 */
function resolveYouTube(youtubeUrl) {
  if (!youtubeUrl) return null;
  let videoId = null;
  const m1 = youtubeUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  const m2 = youtubeUrl.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  const m3 = youtubeUrl.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  const m4 = youtubeUrl.match(/\/live\/([A-Za-z0-9_-]{11})/);
  if (m1) videoId = m1[1];
  else if (m2) videoId = m2[1];
  else if (m3) videoId = m3[1];
  else if (m4) videoId = m4[1];
  if (!videoId) return null;
  // maxresdefault pode não existir; o cliente deve fazer fallback
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Organizador: páginas LAPEI/PPGEEC/FAV/EMC têm banners em paths conhecidos.
 * Heurística: se o link da fonte contém o slug do organizador, buscar
 * /up/{N}/o/ (P0-A) por banners dedicados.
 *
 * Para v0.1, só retorna o próprio link do organizador se a página de origem
 * já é do organizador.
 */
async function resolveOrganizer(item) {
  const sourceUrl = item.sourceUrl || item.url || '';
  if (!sourceUrl) return null;
  // Heurística: detectar organizador
  const orgPatterns = [
    { match: /lapei\.face\.ufg\.br/i, bucket: 1267 },
    { match: /ppgeec\.emc\.ufg\.br/i, bucket: 873 },
    { match: /fav\.ufg\.br/i, bucket: 403 },
    { match: /em\.ufg\.br/i, bucket: 269 },
    { match: /face\.ufg\.br/i, bucket: 80 },
    { match: /proex\.ufg\.br/i, bucket: 1378 },
  ];
  for (const p of orgPatterns) {
    if (p.match.test(sourceUrl)) {
      // v0.1: retorna null — implementação completa virá depois
      // A página do evento individual já foi usada pelo curador
      return null;
    }
  }
  return null;
}

// ============================================================
// MAIN RESOLVER
// ============================================================

/**
 * Dado um item de evento/oportunidade, tenta múltiplas fontes para achar
 * a MELHOR URL de imagem (alta resolução, evento-específica).
 *
 * @param {object} item - { title, link, sourceUrl, relevantLinks, image, images, ... }
 * @param {object} opts - { minBytes=30000, timeoutMs=15000, logger=console }
 * @returns {Promise<{url: string, source: string, score: number, bytes?: number, contentType?: string, candidates?: Array}>}
 */
async function resolveBestImage(item, opts = {}) {
  const { minBytes = 30000, timeoutMs = 12000, logger = console } = opts;
  const candidates = [];
  const seen = new Set();

  // 1. Coletar candidatos de várias fontes
  const candidateUrls = [];

  // 1a. Imagem atual (já no item)
  const itemImages = [
    item.image,
    ...(Array.isArray(item.images) ? item.images : []),
  ].filter(Boolean).map(String);
  for (const u of itemImages) {
    if (!seen.has(u)) { seen.add(u); candidateUrls.push({ url: u, source: 'item.current' }); }
  }

  // 1b. Sympla (se houver link)
  const allLinks = [
    item.link,
    item.sourceUrl,
    ...(Array.isArray(item.relevantLinks) ? item.relevantLinks : []),
    ...(Array.isArray(item.enrichmentSources) ? item.enrichmentSources.map(s => typeof s === 'string' ? s : s.url) : []),
  ].filter(Boolean).map(String);
  const symplaUrl = allLinks.find(l => /sympla\.com\.br/.test(l));
  if (symplaUrl) {
    const sym = await resolveSympla(symplaUrl);
    if (sym && !seen.has(sym)) { seen.add(sym); candidateUrls.push({ url: sym, source: 'sympla' }); }
  }

  // 1c. YouTube (se houver link)
  const ytUrl = allLinks.find(l => /youtube\.com|youtu\.be/.test(l));
  if (ytUrl) {
    const yt = resolveYouTube(ytUrl);
    if (yt && !seen.has(yt)) { seen.add(yt); candidateUrls.push({ url: yt, source: 'youtube.maxresdefault' }); }
  }

  // 1d. Organizador
  const org = await resolveOrganizer(item);
  if (org && !seen.has(org)) { seen.add(org); candidateUrls.push({ url: org, source: 'organizer' }); }

  // 2. Para cada candidato, valida (Content-Type, tamanho) e dá um score
  // v0.2 (2026-06-12): validação em PARALELO com Promise.all — antes era sequencial
  // (4 candidatos = 48s). Agora = max de todos.
  logger.log?.(`   [image-resolver] testando ${candidateUrls.length} candidatos (em paralelo)...`);
  const validationResults = await Promise.all(candidateUrls.map(async (c) => {
    const normalized = normalizeImageUrl(c.url);
    if (!normalized || isKnownPlaceholderImageUrl(c.url)) {
      return { ...c, normalized: '', valid: false, reason: 'known_placeholder' };
    }
    if (normalized !== c.url) {
      logger.log?.(`   [image-resolver] normalizou: ${c.url.slice(-50)} → /o/`);
    }
    const v = await validateImageUrl(normalized, { minBytes, timeoutMs });
    if (!v.ok) {
      return { ...c, normalized, valid: false, reason: v.error };
    }
    // Score baseado em tamanho + source
    let score = 0;
    const bytesNum = typeof v.bytes === 'number' ? v.bytes : 0;
    if (bytesNum >= 200000) score += 5;      // >= 200KB
    else if (bytesNum >= 50000) score += 3;  // >= 50KB
    else if (bytesNum >= 20000) score += 2;  // >= 20KB
    else if (bytesNum >= 5000) score += 1;   // >= 5KB
    // Bonus por fonte
    if (c.source === 'sympla') score += 3;
    if (c.source === 'youtube.maxresdefault') score += 2;
    if (c.source === 'organizer') score += 2;
    return { ...c, normalized, valid: true, bytes: bytesNum, contentType: v.contentType, score };
  }));
  candidates.push(...validationResults);

  // 3. Escolhe o melhor
  const valid = candidates.filter(c => c.valid).sort((a, b) => b.score - a.score || b.bytes - a.bytes);
  if (valid.length === 0) {
    return { url: '', source: 'none', score: 0, candidates, reason: 'no_valid_candidates' };
  }
  const best = valid[0];
  logger.log?.(`   [image-resolver] ✓ ${best.source} (${best.bytes}B, score=${best.score}) — ${best.normalized.slice(-60)}`);
  return { url: best.normalized, source: best.source, score: best.score, bytes: best.bytes, contentType: best.contentType, candidates };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  resolveSympla,
  resolveYouTube,
  resolveOrganizer,
  resolveBestImage,
};

// CLI mode
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: node image-source-resolver.js <sympla|organizer url>');
    process.exit(1);
  }
  (async () => {
    if (/sympla/.test(url)) {
      const r = await resolveSympla(url);
      console.log('Sympla →', r);
    } else if (/youtube|youtu\.be/.test(url)) {
      const r = resolveYouTube(url);
      console.log('YouTube →', r);
    } else {
      const r = await resolveBestImage({ link: url, sourceUrl: url, image: '', images: [] });
      console.log('Best →', JSON.stringify(r, null, 2));
    }
  })();
}
