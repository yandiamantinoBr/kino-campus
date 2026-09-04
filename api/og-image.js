/**
 * KinoCampus — Dynamic OG Image Generator
 * 
 * Atualizado com um design moderno, fontes muito maiores para legibilidade 
 * em previews mobile, reprodução fiel da logo e cores temáticas dinâmicas.
 */

import { ImageResponse } from '@vercel/og';

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------
const MODULES = {
  home: {
    title: 'KinoCampus',
    description: 'A plataforma universitária da UFG para compra e venda, caronas, moradia, eventos e muito mais.',
    emoji: '⛺',
    tag: 'COMUNIDADE UNIVERSITÁRIA',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  'compra-venda': {
    title: 'Compra e Venda',
    description: 'Anuncie ou encontre eletrônicos, móveis, livros e mais entre estudantes da UFG.',
    emoji: '🛍️',
    tag: 'MARKETPLACE UNIVERSITÁRIO',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  eventos: {
    title: 'Eventos',
    description: 'Palestras, workshops, feiras, eventos culturais e esportivos na UFG.',
    emoji: '🎉',
    tag: 'AGENDA UNIVERSITÁRIA',
    accent: '#41B5D3',
    rgb: '65,181,211',
  },
  moradia: {
    title: 'Moradia',
    description: 'Repúblicas, quartos e apartamentos perto da UFG em Goiânia.',
    emoji: '🏠',
    tag: 'MORADIA UNIVERSITÁRIA',
    accent: '#70E291',
    rgb: '112,226,145',
  },
  caronas: {
    title: 'Caronas',
    description: 'Ofereça ou procure caronas entre estudantes da UFG. Econômico e sustentável.',
    emoji: '🚗',
    tag: 'MOBILIDADE UNIVERSITÁRIA',
    accent: '#FFD700',
    rgb: '255,215,0',
  },
  oportunidades: {
    title: 'Oportunidades',
    description: 'Estágios, empregos, freelancer, monitorias e bolsas para estudantes da UFG.',
    emoji: '💼',
    tag: 'CARREIRA E DESENVOLVIMENTO',
    accent: '#A78BFA', // Ajustado para roxo claro para diferenciar
    rgb: '167,139,250',
  },
  'achados-perdidos': {
    title: 'Achados e Perdidos',
    description: 'Perdeu ou encontrou algo no campus? Publique e ajude a comunidade UFG.',
    emoji: '🔍',
    tag: 'CAMPUS UFG',
    accent: '#F472B6', // Rosa para chamar atenção
    rgb: '244,114,182',
  },
  ajuda: {
    title: 'Central de Ajuda',
    description: 'Tire dúvidas e aprenda a usar o KinoCampus, a plataforma da comunidade da UFG.',
    emoji: '💬',
    tag: 'SUPORTE E TUTORIAIS',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  transparencia: {
    title: 'Transparência',
    description: 'Privacidade, termos, cookies, suporte e direitos LGPD em um só lugar.',
    emoji: '🛡️',
    tag: 'PRIVACIDADE E CONFIANÇA',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  product: {
    title: 'Anúncio na Plataforma',
    description: 'Confira este anúncio na plataforma da comunidade universitária da UFG.',
    emoji: '📦',
    tag: 'NOVO ANÚNCIO',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
};

// ---------------------------------------------------------------------------
// Minimal React element factory — no JSX, no React dependency.
// ---------------------------------------------------------------------------
const REACT_ELEMENT_TYPE = Symbol.for('react.element');

function h(type, props) {
  var children = Array.prototype.slice.call(arguments, 2)
    .flat(Infinity)
    .filter(function (c) { return c !== null && c !== undefined && c !== false; });

  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: null,
    ref: null,
    props: Object.assign({}, props, {
      children: children.length === 0 ? undefined
        : children.length === 1 ? children[0]
        : children,
    }),
    _owner: null,
    _store: {},
  };
}

// ---------------------------------------------------------------------------
// Font loader — DM Sans (Weights 500 and 800)
// ---------------------------------------------------------------------------
async function loadFonts() {
  try {
    const fetchFont = async (weight) => {
      const css = await fetch(
        `https://fonts.googleapis.com/css2?family=DM+Sans:wght@${weight}&display=swap`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }
      ).then(r => r.text());
      const match = css.match(/src:\s*url\(([^)]+\.woff2)\)/);
      if (!match) return null;
      return fetch(match[1]).then(r => r.arrayBuffer());
    };

    const [medium, extraBold] = await Promise.all([fetchFont(500), fetchFont(800)]);
    
    if (!medium || !extraBold) return null;

    return [
      { name: 'DM Sans', data: medium, weight: 500, style: 'normal' },
      { name: 'DM Sans', data: extraBold, weight: 800, style: 'normal' }
    ];
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  try {
    var requestHost = req && req.headers && req.headers.host ? req.headers.host : 'www.kinocampus.com.br';
    var parsedUrl = new URL(req && req.url ? req.url : '/', 'https://' + requestHost);
    // 2026-09-04: modo media (resize/conversao de objetos crus do Storage para
    // og:image e thumbnails). Vive no MESMO Serverless Function porque o plano
    // Hobby da Vercel limita o deployment a 12 funcoes (ver og-product.js) —
    // a query "path" ativa o modo; "type" continua gerando a imagem institucional.
    if (parsedUrl.searchParams.get('path') || (req && req.query && req.query.path)) {
      return await handleMediaRequest(parsedUrl, req, res);
    }
    var type = parsedUrl.searchParams.get('type') || 'home';
    var m = MODULES[type] || MODULES['home'];

    var fontsData = await loadFonts();
    var hasFonts = !!fontsData;
    var ff = hasFonts ? "'DM Sans', system-ui, sans-serif" : 'system-ui, -apple-system, sans-serif';

    // Ajuste dinâmico de título para caber lindamente
    var titleSize = m.title.length > 18 ? '72px' : '96px';

    var element = h('div', {
      style: {
        width: '1200px',
        height: '630px',
        background: '#0B0C10', // Fundo escuro profundo
        display: 'flex',
        fontFamily: ff,
        position: 'relative',
        overflow: 'hidden',
      },
    },

      // ── EFEITOS DE FUNDO DIVERSOS ──────────────────────────────────────────

      // Grid Pattern muito sutil
      h('div', {
        style: {
          position: 'absolute', inset: '0',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        },
      }),

      // Glow Primário - Cor do Módulo (Fica atrás do Emoji)
      h('div', {
        style: {
          position: 'absolute', right: '-150px', top: '-100px',
          width: '800px', height: '800px', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${m.rgb}, 0.25) 0%, rgba(${m.rgb}, 0.05) 50%, transparent 80%)`,
        },
      }),

      // Glow Secundário - Base KinoCampus Laranja (No canto inferior esquerdo)
      h('div', {
        style: {
          position: 'absolute', left: '-200px', bottom: '-200px',
          width: '600px', height: '600px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,0,0.15) 0%, transparent 70%)',
        },
      }),

      // ── CONTEÚDO PRINCIPAL (Layout de 2 Colunas) ─────────────────────────
      h('div', {
        style: {
          display: 'flex', width: '100%', height: '100%',
          padding: '64px 80px', position: 'relative', zIndex: '10',
        },
      },
      
        // COLUNA ESQUERDA: Textos
        h('div', {
          style: {
            display: 'flex', flexDirection: 'column', width: '65%', height: '100%',
          },
        },
          
          // 1. HEADER: Recriação Fiel da Logo
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: 'auto' } },
            
            // Icon Mark
            h('div', {
              style: {
                width: '56px', height: '56px', borderRadius: '16px',
                background: '#FF6B00', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '28px', transform: 'rotate(-3deg)',
                boxShadow: '0 8px 24px rgba(255,107,0,0.4)',
              },
            }, '⛺'),
            
            // Textos da Logo
            h('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: '1.05' } },
              h('div', {
                style: { display: 'flex', fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em' }
              },
                h('span', { style: { color: '#E9EAED' } }, 'Kino'),
                h('span', { style: { color: '#FF6B00' } }, 'Campus')
              ),
              h('span', {
                style: { color: '#B0B3B8', fontSize: '13px', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', marginTop: '2px' }
              }, 'Comunidade UFG')
            )
          ),

          // 2. MAIN INFOS (Tag, Titulo, Descrição)
          h('div', { style: { display: 'flex', flexDirection: 'column', marginBottom: 'auto', marginTop: '60px' } },
            
            // Tag do Módulo
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' } },
              h('div', { style: { width: '40px', height: '4px', background: m.accent, borderRadius: '2px' } }),
              h('span', {
                style: { color: m.accent, fontSize: '20px', fontWeight: 800, letterSpacing: '2px' }
              }, m.tag)
            ),

            // Título Gigante
            h('div', {
              style: {
                fontSize: titleSize, fontWeight: 800, color: '#FFFFFF',
                lineHeight: '1.05', letterSpacing: '-2px', marginBottom: '24px',
                textShadow: '0 4px 24px rgba(0,0,0,0.5)'
              },
            }, m.title),

            // Descrição muito mais legível
            h('div', {
              style: { fontSize: '36px', color: '#A1A1AA', fontWeight: 500, lineHeight: '1.4', maxWidth: '640px' },
            }, m.description)
          ),

          // 3. FOOTER URL
          h('div', {
            style: { display: 'flex', alignItems: 'center', gap: '12px' },
          },
            h('span', { style: { color: '#52525B', fontSize: '24px', fontWeight: 500 } }, 'www.'),
            h('span', { style: { color: '#D4D4D8', fontSize: '24px', fontWeight: 800 } }, 'kinocampus.com.br')
          )
        ),

        // COLUNA DIREITA: Emoji Gigante e Decorativo
        h('div', {
          style: {
            display: 'flex', width: '35%', height: '100%',
            alignItems: 'center', justifyContent: 'center',
            position: 'relative'
          },
        },
          // Emoji Massivo (Atua como a "imagem" do post nas páginas institucionais)
          h('div', {
            style: {
              fontSize: '220px',
              lineHeight: '1',
              filter: `drop-shadow(0 20px 40px rgba(${m.rgb}, 0.4))`,
              transform: 'translateY(-20px)',
            },
          }, m.emoji)
        )
      )
    );

    var options = { width: 1200, height: 630 };
    if (fontsData) options.fonts = fontsData;
    
    var imageResponse = new ImageResponse(element, options);
    var buffer = Buffer.from(await imageResponse.arrayBuffer());

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('[og-image] Error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}

// ---------------------------------------------------------------------------
// Media mode (2026-09-04) — resize/conversao de objetos publicos do Storage.
// Derivado de api/media.js (integrado aqui por causa do limite de 12
// Serverless Functions do plano Hobby). Baixa o objeto CRU de kino-media e
// devolve JPEG progressivo <= ~280 KB, imune a quota de Image Transformations
// do Supabase (/render/), que com spend cap estourado serve o objeto original
// (PNG ~800 KB) e quebra o preview do WhatsApp.
// ---------------------------------------------------------------------------
const MEDIA_ALLOWED_BUCKET = 'kino-media';
const MEDIA_OBJECT_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,320}$/;
const MEDIA_IMAGE_EXT_RE = /\.(?:jpe?g|png|webp)$/i;
const MEDIA_MAX_UPSTREAM_BYTES = 30 * 1024 * 1024;
const MEDIA_MAX_EDGE = 1920;
const MEDIA_MIN_EDGE = 16;
const MEDIA_DEFAULT_WIDTH = 1200;
const MEDIA_DEFAULT_QUALITY = 82;
const MEDIA_TARGET_MAX_BYTES = 280 * 1024;
const MEDIA_QUALITY_LADDER = [MEDIA_DEFAULT_QUALITY, 72, 62, 52];
const MEDIA_UPSTREAM_TIMEOUT_MS = 9_000;

function mediaResolveEnv(candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var value = process.env[candidates[i]];
    if (value && String(value).trim()) return String(value).trim().replace(/\/+$/, '');
  }
  return '';
}

function mediaClampInt(value, min, max, fallback) {
  var parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Valida "kino-media/post-media/.../file.jpg" -> caminho normalizado ou ''. */
function mediaParseObjectPath(raw) {
  var value = String(raw || '').trim();
  if (!value || !MEDIA_OBJECT_PATH_RE.test(value)) return '';
  if (value.includes('..') || value.includes('%') || value.includes('\\')) return '';
  if (!MEDIA_IMAGE_EXT_RE.test(value)) return '';
  var slash = value.indexOf('/');
  if (slash <= 0) return '';
  var bucket = value.slice(0, slash);
  var objectPath = value.slice(slash + 1);
  if (bucket !== MEDIA_ALLOWED_BUCKET || !objectPath) return '';
  return bucket + '/' + objectPath;
}

function mediaBuildUpstreamUrl(origin, bucketObjectPath) {
  if (!origin) return '';
  return origin + '/storage/v1/object/public/' + bucketObjectPath;
}

function mediaPickQualityLadder(requested) {
  var first = mediaClampInt(requested, 40, 92, MEDIA_DEFAULT_QUALITY);
  var ladder = [first];
  for (var i = 0; i < MEDIA_QUALITY_LADDER.length; i++) {
    if (MEDIA_QUALITY_LADDER[i] < first) ladder.push(MEDIA_QUALITY_LADDER[i]);
  }
  return ladder.length ? ladder : [MEDIA_DEFAULT_QUALITY];
}

async function mediaEncodeJpeg(inputBuffer, resize, qualities) {
  var sharpModule = await import('sharp');
  var sharp = sharpModule.default;
  var lastBuffer = null;
  var lastInfo = null;
  for (var i = 0; i < qualities.length; i++) {
    var pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
    if (resize) pipeline = pipeline.resize(resize);
    var encoded = await pipeline
      .jpeg({ quality: qualities[i], progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true });
    lastBuffer = encoded.data;
    lastInfo = encoded.info;
    if (encoded.data.length <= MEDIA_TARGET_MAX_BYTES) break;
  }
  return { buffer: lastBuffer, info: lastInfo };
}

function mediaSendError(res, status, message, cacheable) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'public, max-age=0, s-maxage=300' : 'no-store');
  res.status(status).send(message);
}

/** Query unificado: aceita req.url (Vercel passa a query string) e req.query. */
function mediaQueryGet(req, parsedUrl, name) {
  var fromUrl = parsedUrl.searchParams.get(name);
  if (fromUrl !== null && fromUrl !== undefined) return fromUrl;
  var q = req && req.query;
  if (q && q[name] !== undefined) {
    return Array.isArray(q[name]) ? String(q[name][0]) : String(q[name]);
  }
  return null;
}

async function handleMediaRequest(parsedUrl, req, res) {
  var method = String((req && req.method) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return mediaSendError(res, 405, 'method not allowed', false);
  }

  var bucketObjectPath = mediaParseObjectPath(mediaQueryGet(req, parsedUrl, 'path'));
  if (!bucketObjectPath) {
    return mediaSendError(res, 400, 'invalid media path', false);
  }

  var origin = mediaResolveEnv(['SUPABASE_URL', 'KC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  var upstreamUrl = mediaBuildUpstreamUrl(origin, bucketObjectPath);
  if (!upstreamUrl) {
    return mediaSendError(res, 503, 'media backend unavailable', false);
  }

  var width = mediaClampInt(mediaQueryGet(req, parsedUrl, 'w'), MEDIA_MIN_EDGE, MEDIA_MAX_EDGE, MEDIA_DEFAULT_WIDTH);
  var heightRaw = mediaClampInt(mediaQueryGet(req, parsedUrl, 'h'), MEDIA_MIN_EDGE, MEDIA_MAX_EDGE, 0);
  var fit = String(mediaQueryGet(req, parsedUrl, 'fit') || '').toLowerCase() === 'cover' ? 'cover' : 'inside';
  var resize = heightRaw
    ? { width: width, height: heightRaw, fit: fit, withoutEnlargement: true }
    : { width: width, withoutEnlargement: true };

  var upstream;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(new Error('media upstream timeout')); }, MEDIA_UPSTREAM_TIMEOUT_MS);
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
    return mediaSendError(res, 504, 'media upstream unreachable', false);
  }

  if (!upstream || !upstream.ok) {
    // Supabase Storage responde 400 (InvalidKey) para objetos inexistentes;
    // tratamos como 404 para permitir cache negativo curto no CDN.
    var notFound = upstream && (upstream.status === 404 || upstream.status === 400);
    var status = notFound ? 404 : 502;
    return mediaSendError(res, status, notFound ? 'media not found' : 'media upstream error', notFound);
  }

  var declaredLength = Number(upstream.headers.get('content-length') || 0);
  if (declaredLength > MEDIA_MAX_UPSTREAM_BYTES) {
    return mediaSendError(res, 413, 'media too large', false);
  }

  var inputBuffer;
  try {
    inputBuffer = Buffer.from(await upstream.arrayBuffer());
  } catch (_) {
    return mediaSendError(res, 502, 'media download failed', false);
  }
  if (!inputBuffer.length || inputBuffer.length > MEDIA_MAX_UPSTREAM_BYTES) {
    return mediaSendError(res, 502, 'media payload invalid', false);
  }

  var encoded;
  try {
    encoded = await mediaEncodeJpeg(inputBuffer, resize, mediaPickQualityLadder(mediaQueryGet(req, parsedUrl, 'q')));
  } catch (err) {
    console.error('[og-image] media encode failed:', err && err.message ? err.message : err);
    return mediaSendError(res, 502, 'media conversion failed', false);
  }
  if (!encoded || !encoded.buffer || !encoded.buffer.length) {
    return mediaSendError(res, 502, 'media conversion empty', false);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-KC-Media-Width', String(encoded.info ? encoded.info.width : ''));
  res.setHeader('X-KC-Media-Height', String(encoded.info ? encoded.info.height : ''));
  res.status(200).send(encoded.buffer);
}

export const __internals = {
  parseObjectPath: mediaParseObjectPath,
  clampInt: mediaClampInt,
  buildUpstreamUrl: mediaBuildUpstreamUrl,
  pickQualityLadder: mediaPickQualityLadder,
  TARGET_MAX_BYTES: MEDIA_TARGET_MAX_BYTES,
  MAX_EDGE: MEDIA_MAX_EDGE,
  DEFAULT_WIDTH: MEDIA_DEFAULT_WIDTH,
  DEFAULT_QUALITY: MEDIA_DEFAULT_QUALITY,
};

