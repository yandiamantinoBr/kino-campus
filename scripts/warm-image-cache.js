#!/usr/bin/env node
'use strict';

/**
 * Aquece o cache de borda das miniaturas servidas por /api/og-image.
 *
 * Contexto (2026-09-17): as capas do feed passaram a ser entregues pelo proxy
 * sharp da Vercel (640x480, ~5 KB em vez de 400 KB+ do original). O proxy tem
 * s-maxage de 1 ano, mas a PRIMEIRA requisicao de cada variante paga o custo da
 * funcao (download do objeto + sharp), o que aparece como atraso para o primeiro
 * visitante de um post — e nos laboratorios (Lighthouse/PSI), que medem sempre
 * com cache frio. Este script percorre as publicacoes publicadas, monta exatamente
 * a mesma URL que o cliente monta e popula o cache.
 *
 * Uso:
 *   node scripts/warm-image-cache.js [--limit 200] [--concurrency 6] [--origin https://www.kinocampus.com.br]
 *
 * Requer KC_SUPABASE_URL e KC_SUPABASE_ANON_KEY no ambiente (ou .env local).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) acc[match[1]] = match[2].trim();
    return acc;
  }, {});
}

const env = Object.assign({}, loadEnv(), process.env);
const SUPABASE_URL = env.KC_SUPABASE_URL;
const ANON_KEY = env.KC_SUPABASE_ANON_KEY;
const ORIGIN = readArg('--origin', env.KC_WARM_ORIGIN || 'https://www.kinocampus.com.br');
const LIMIT = Number(readArg('--limit', '200'));
const CONCURRENCY = Math.max(1, Number(readArg('--concurrency', '6')));

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Faltam KC_SUPABASE_URL/KC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

// Mesmas constantes do card (assets/js/utils/kc-utils.presentation.js).
const CARD_WIDTH = 640;
const CARD_HEIGHT = 480;
const CARD_QUALITY = 68;
const STORAGE_RE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i;

function optimizedUrl(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value || !/^https?:\/\//i.test(value)) return '';
  try {
    const match = new URL(value).pathname.match(STORAGE_RE);
    if (!match) return '';
    return ORIGIN + '/api/og-image?path=' + encodeURIComponent(match[1] + '/' + match[2])
      + '&w=' + CARD_WIDTH + '&h=' + CARD_HEIGHT + '&fit=cover&q=' + CARD_QUALITY;
  } catch (_) {
    return '';
  }
}

async function fetchPublishedPosts() {
  // A tabela posts nao tem coluna cover_url: a capa vive em image_url e no
  // metadata (cover_url/gallery_image_urls), igual ao buildPostImageCandidates.
  const select = 'id,image_url,metadata';
  const url = SUPABASE_URL + '/rest/v1/posts?select=' + encodeURIComponent(select)
    + '&status=eq.published&order=created_at.desc&limit=' + LIMIT;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } });
  if (!res.ok) throw new Error('Supabase respondeu ' + res.status);
  return res.json();
}

function collectUrls(posts) {
  const urls = new Set();
  posts.forEach((post) => {
    const meta = post && typeof post.metadata === 'object' && post.metadata ? post.metadata : {};
    [post && post.image_url, post && post.cover_url, meta.image_url, meta.cover_url]
      .concat(Array.isArray(meta.gallery_image_urls) ? meta.gallery_image_urls : [])
      .forEach((value) => {
        const url = optimizedUrl(value);
        if (url) urls.add(url);
      });
  });
  return Array.from(urls);
}

async function warm(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'KinoCampus-CacheWarmer/1.0' } });
    await res.arrayBuffer();
    return res.ok ? 'ok' : 'http-' + res.status;
  } catch (err) {
    return 'erro';
  }
}

async function run() {
  console.log('[warm-image-cache] origem:', ORIGIN, '| limite:', LIMIT, '| concorrencia:', CONCURRENCY);
  const posts = await fetchPublishedPosts();
  const urls = collectUrls(posts);
  console.log('[warm-image-cache] publicacoes:', posts.length, '| miniaturas:', urls.length);
  const resultados = { ok: 0, erro: 0, outro: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const status = await warm(url);
      if (status === 'ok') resultados.ok += 1;
      else if (status === 'erro') resultados.erro += 1;
      else resultados.outro += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('[warm-image-cache] ok:', resultados.ok, '| falhas:', resultados.erro, '| outros:', resultados.outro);
}

run().catch((err) => {
  console.error('[warm-image-cache] falhou:', err && err.message ? err.message : err);
  process.exit(1);
});
