/*
  KinoCampus - Media proxy/resizer (2026-09-04).

  Serve public Supabase Storage objects as crawler-friendly JPEGs
  (WhatsApp/Meta/Twitter previews and UI thumbnails) straight from the RAW
  object, resizing with sharp at the edge of our own Vercel function.

  Why this exists:
    - og:image used to point at /storage/v1/render/... (Supabase Storage
      Image Transformations). That feature has its own paid quota; when the
      spend cap is reached (e.g. 142/100 in 2026-09), transformations are
      disabled and the ORIGINAL object is served instead (PNG, ~800 KB,
      1920 px), which breaks WhatsApp link previews.
    - Supabase render also keeps the source format: a .png source stays PNG
      after any quality param, so previews could never get small enough.
    - This endpoint decouples crawlers/thumbnails from that quota entirely
      and always emits a compressed progressive JPEG <= ~280 KB.

  Contract:
    GET /api/media?path=<bucket/objectPath>&w=<px>&h=<px>&q=<quality>[&v=<cache-buster>]
      - bucket must be kino-media (public).
      - objectPath: raster image (jpg/jpeg/png/webp), no traversal/encoding.
      - w default 1200, capped at 1920. h optional (fit "inside", no crop).
      - fit=cover crops to exactly w x h (square UI thumbnails/avatars);
        default inside keeps the aspect ratio (crawler previews).
      - q default 82, clamped 40..92.
      - 200 image/jpeg with long CDN cache (objects are content-addressed
        filenames; the optional v= param only busts crawlers/CDN per edit).
*/
import sharp from 'sharp';

const ALLOWED_BUCKET = 'kino-media';
const OBJECT_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,320}$/;
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp)$/i;
const MAX_UPSTREAM_BYTES = 30 * 1024 * 1024;
const MAX_EDGE = 1920;
const MIN_EDGE = 16;
const DEFAULT_WIDTH = 1200;
const DEFAULT_QUALITY = 82;
const TARGET_MAX_BYTES = 280 * 1024;
const QUALITY_LADDER = [DEFAULT_QUALITY, 72, 62, 52];
const UPSTREAM_TIMEOUT_MS = 9_000;

function resolveEnv(candidates) {
  for (const name of candidates) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim().replace(/\/+$/, '');
  }
  return '';
}

function getSupabaseOrigin() {
  return resolveEnv(['SUPABASE_URL', 'KC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Validates "kino-media/post-media/.../file.jpg" -> normalized path or ''. */
function parseObjectPath(raw) {
  const value = String(raw || '').trim();
  if (!value || !OBJECT_PATH_RE.test(value)) return '';
  if (value.includes('..') || value.includes('%') || value.includes('\\')) return '';
  if (!IMAGE_EXT_RE.test(value)) return '';
  const slash = value.indexOf('/');
  if (slash <= 0) return '';
  const bucket = value.slice(0, slash);
  const objectPath = value.slice(slash + 1);
  if (bucket !== ALLOWED_BUCKET || !objectPath) return '';
  return bucket + '/' + objectPath;
}

function buildUpstreamUrl(origin, bucketObjectPath) {
  if (!origin) return '';
  return origin + '/storage/v1/object/public/' + bucketObjectPath;
}

function pickQualityLadder(requested) {
  const first = clampInt(requested, 40, 92, DEFAULT_QUALITY);
  const ladder = [first].concat(QUALITY_LADDER.filter((q) => q < first));
  return ladder.length ? ladder : [DEFAULT_QUALITY];
}

async function encodeJpeg(inputBuffer, resize, qualities) {
  let lastBuffer = null;
  let lastInfo = null;
  for (const quality of qualities) {
    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
    if (resize) pipeline = pipeline.resize(resize);
    const encoded = await pipeline
      .jpeg({ quality, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true });
    lastBuffer = encoded.data;
    lastInfo = encoded.info;
    if (encoded.data.length <= TARGET_MAX_BYTES) break;
  }
  return { buffer: lastBuffer, info: lastInfo };
}

function sendError(res, status, message, cacheable) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'public, max-age=0, s-maxage=300' : 'no-store');
  res.status(status).send(message);
}

export default async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return sendError(res, 405, 'method not allowed', false);
  }

  const bucketObjectPath = parseObjectPath(req.query && req.query.path);
  if (!bucketObjectPath) {
    return sendError(res, 400, 'invalid media path', false);
  }

  const origin = getSupabaseOrigin();
  const upstreamUrl = buildUpstreamUrl(origin, bucketObjectPath);
  if (!upstreamUrl) {
    return sendError(res, 503, 'media backend unavailable', false);
  }

  const width = clampInt(req.query && req.query.w, MIN_EDGE, MAX_EDGE, DEFAULT_WIDTH);
  const heightRaw = clampInt(req.query && req.query.h, MIN_EDGE, MAX_EDGE, 0);
  const fit = String((req.query && req.query.fit) || '').toLowerCase() === 'cover' ? 'cover' : 'inside';
  const resize = heightRaw
    ? { width: width, height: heightRaw, fit: fit, withoutEnlargement: true }
    : { width: width, withoutEnlargement: true };

  let upstream;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('media upstream timeout')), UPSTREAM_TIMEOUT_MS);
    try {
      upstream = await fetch(upstreamUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'image/*' },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (_) {
    return sendError(res, 504, 'media upstream unreachable', false);
  }

  if (!upstream || !upstream.ok) {
    // Supabase Storage responde 400 (InvalidKey) para objetos inexistentes;
    // tratamos como 404 para permitir cache negativo curto no CDN.
    const notFound = upstream && (upstream.status === 404 || upstream.status === 400);
    const status = notFound ? 404 : 502;
    return sendError(res, status, notFound ? 'media not found' : 'media upstream error', notFound);
  }

  const declaredLength = Number(upstream.headers.get('content-length') || 0);
  if (declaredLength > MAX_UPSTREAM_BYTES) {
    return sendError(res, 413, 'media too large', false);
  }

  let inputBuffer;
  try {
    inputBuffer = Buffer.from(await upstream.arrayBuffer());
  } catch (_) {
    return sendError(res, 502, 'media download failed', false);
  }
  if (!inputBuffer.length || inputBuffer.length > MAX_UPSTREAM_BYTES) {
    return sendError(res, 502, 'media payload invalid', false);
  }

  let encoded;
  try {
    encoded = await encodeJpeg(inputBuffer, resize, pickQualityLadder(req.query && req.query.q));
  } catch (err) {
    console.error('[media] sharp encode failed:', err && err.message ? err.message : err);
    return sendError(res, 502, 'media conversion failed', false);
  }
  if (!encoded || !encoded.buffer || !encoded.buffer.length) {
    return sendError(res, 502, 'media conversion empty', false);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-KC-Media-Width', String(encoded.info ? encoded.info.width : ''));
  res.setHeader('X-KC-Media-Height', String(encoded.info ? encoded.info.height : ''));
  res.status(200).send(encoded.buffer);
}

export const __internals = {
  parseObjectPath: parseObjectPath,
  clampInt: clampInt,
  buildUpstreamUrl: buildUpstreamUrl,
  pickQualityLadder: pickQualityLadder,
  TARGET_MAX_BYTES: TARGET_MAX_BYTES,
  MAX_EDGE: MAX_EDGE,
  DEFAULT_WIDTH: DEFAULT_WIDTH,
  DEFAULT_QUALITY: DEFAULT_QUALITY,
};
