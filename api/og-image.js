/**
 * KinoCampus — Dynamic OG Image Generator (v8.6.3)
 *
 * Vercel Node.js Serverless Function that generates branded Open Graph
 * images (1200×630 PNG) for all platform pages using @vercel/og + Satori.
 *
 * Uses CommonJS + Node.js handler (req, res) so Vercel deploys it
 * correctly in a non-framework project with "type": "commonjs".
 *
 * Usage: /api/og-image?type=eventos
 * Types: home | compra-venda | eventos | moradia | caronas |
 *        oportunidades | achados-perdidos | ajuda | product
 */

const { ImageResponse } = require('@vercel/og');

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------
const MODULES = {
  home: {
    title: 'KinoCampus',
    description: 'A plataforma universitária da UFG para compra e venda, caronas, moradia, eventos e muito mais.',
    emoji: '⛺',
    tag: 'Comunidade Universitária',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  'compra-venda': {
    title: 'Compra e Venda',
    description: 'Anuncie ou encontre eletrônicos, móveis, livros e mais entre estudantes da UFG.',
    emoji: '🛍️',
    tag: 'Marketplace Universitário',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  eventos: {
    title: 'Eventos',
    description: 'Palestras, workshops, feiras, eventos culturais e esportivos na UFG.',
    emoji: '🎉',
    tag: 'Agenda Universitária',
    accent: '#41B5D3',
    rgb: '65,181,211',
  },
  moradia: {
    title: 'Moradia',
    description: 'Repúblicas, quartos e apartamentos perto da UFG em Goiânia.',
    emoji: '🏠',
    tag: 'Moradia Universitária',
    accent: '#70E291',
    rgb: '112,226,145',
  },
  caronas: {
    title: 'Caronas',
    description: 'Ofereça ou procure caronas entre estudantes da UFG. Econômico e sustentável.',
    emoji: '🚗',
    tag: 'Mobilidade Universitária',
    accent: '#FFD700',
    rgb: '255,215,0',
  },
  oportunidades: {
    title: 'Oportunidades',
    description: 'Estágios, empregos, freelancer, monitorias e bolsas para estudantes da UFG.',
    emoji: '💼',
    tag: 'Carreira & Desenvolvimento',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  'achados-perdidos': {
    title: 'Achados e Perdidos',
    description: 'Perdeu ou encontrou algo no campus? Publique e ajude a comunidade UFG.',
    emoji: '🔍',
    tag: 'Campus UFG',
    accent: '#41B5D3',
    rgb: '65,181,211',
  },
  ajuda: {
    title: 'Central de Ajuda',
    description: 'Tire dúvidas e aprenda a usar o KinoCampus, a plataforma da comunidade da UFG.',
    emoji: '💬',
    tag: 'Suporte & Tutoriais',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
  product: {
    title: 'KinoCampus',
    description: 'Confira este anúncio na plataforma da comunidade universitária da UFG.',
    emoji: '⛺',
    tag: 'Ver anúncio',
    accent: '#FF6B00',
    rgb: '255,107,0',
  },
};

// ---------------------------------------------------------------------------
// Minimal React element factory — no JSX, no React dependency.
// Satori / @vercel/og accept plain objects with this shape.
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
// Font loader — DM Sans Bold from Google Fonts CDN
// Returns null on failure → falls back to system-ui
// ---------------------------------------------------------------------------
async function loadFont() {
  try {
    var css = await fetch(
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } }
    ).then(function (r) { return r.text(); });

    var match = css.match(/src:\s*url\(([^)]+\.woff2)\)/);
    if (!match) return null;

    return await fetch(match[1]).then(function (r) { return r.arrayBuffer(); });
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build the OG image element tree
// ---------------------------------------------------------------------------
function buildElement(m, ff) {
  var titleSize = m.title.length > 16 ? '52px' : m.title.length > 12 ? '62px' : '72px';

  return h('div', {
    style: {
      width: '1200px',
      height: '630px',
      background: 'linear-gradient(145deg, #14151f 0%, #1c1e30 55%, #181b2c 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '56px 72px',
      fontFamily: ff,
      position: 'relative',
      overflow: 'hidden',
    },
  },

    // Glow — top right, module accent colour
    h('div', {
      style: {
        position: 'absolute',
        right: '-100px',
        top: '-100px',
        width: '480px',
        height: '480px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(' + m.rgb + ', 0.20) 0%, rgba(' + m.rgb + ', 0.05) 55%, transparent 100%)',
      },
    }),

    // Glow — bottom left, always orange
    h('div', {
      style: {
        position: 'absolute',
        left: '-60px',
        bottom: '-60px',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,107,0,0.10) 0%, transparent 70%)',
      },
    }),

    // Subtle grid texture
    h('div', {
      style: {
        position: 'absolute',
        inset: '0',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      },
    }),

    // ── HEADER: Logo ──────────────────────────────────────────────────────
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        zIndex: '1',
      },
    },

      // Orange icon square
      h('div', {
        style: {
          width: '48px',
          height: '48px',
          background: 'linear-gradient(135deg, #FF6B00 0%, #d95e00 100%)',
          borderRadius: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          flexShrink: '0',
          boxShadow: '0 4px 16px rgba(255,107,0,0.35)',
        },
      }, '⛺'),

      // Logo text
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
        h('span', {
          style: {
            color: '#E9EAED',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '-0.3px',
            lineHeight: '1',
          },
        },
          'Kino',
          h('span', { style: { color: '#FF6B00' } }, 'Campus')
        ),
        h('span', {
          style: {
            color: '#6b6d7e',
            fontSize: '11px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          },
        }, 'Comunidade UFG')
      )
    ),

    // ── MAIN CONTENT ──────────────────────────────────────────────────────
    h('div', {
      style: {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: '1',
      },
    },

      // Emoji
      h('div', {
        style: { fontSize: '64px', lineHeight: '1', marginBottom: '20px' },
      }, m.emoji),

      // Module title
      h('div', {
        style: {
          fontSize: titleSize,
          fontWeight: 700,
          color: '#F0F1F4',
          lineHeight: '1.05',
          letterSpacing: '-1.5px',
          marginBottom: '16px',
        },
      }, m.title),

      // Accent tag line
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '22px',
        },
      },
        h('div', {
          style: {
            width: '36px',
            height: '3px',
            background: m.accent,
            borderRadius: '2px',
          },
        }),
        h('span', {
          style: {
            color: m.accent,
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '0.5px',
          },
        }, m.tag)
      ),

      // Description
      h('div', {
        style: {
          fontSize: '24px',
          color: '#8a8b9a',
          lineHeight: '1.5',
          maxWidth: '780px',
        },
      }, m.description)
    ),

    // ── FOOTER ────────────────────────────────────────────────────────────
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingTop: '20px',
        zIndex: '1',
      },
    },
      h('span', {
        style: { color: '#55566a', fontSize: '16px', letterSpacing: '0.3px' },
      }, 'www.kinocampus.com.br'),

      h('div', {
        style: {
          padding: '7px 18px',
          background: 'rgba(' + m.rgb + ', 0.12)',
          border: '1px solid rgba(' + m.rgb + ', 0.28)',
          borderRadius: '999px',
          color: m.accent,
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.5px',
        },
      }, 'KinoCampus')
    )
  );
}

// ---------------------------------------------------------------------------
// Handler — Node.js Serverless Function (req, res)
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  try {
    var parsedUrl = new URL(req.url, 'https://' + (req.headers.host || 'www.kinocampus.com.br'));
    var type = parsedUrl.searchParams.get('type') || 'home';
    var m = MODULES[type] || MODULES['home'];

    var fontData = await loadFont();
    var fonts = fontData
      ? [{ name: 'DM Sans', data: fontData, weight: 700, style: 'normal' }]
      : [];
    var ff = fontData ? "'DM Sans', system-ui, sans-serif" : 'system-ui, -apple-system, sans-serif';

    var element = buildElement(m, ff);

    var imageResponse = new ImageResponse(element, {
      width: 1200,
      height: 630,
      fonts: fonts,
    });

    var arrayBuffer = await imageResponse.arrayBuffer();
    var buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('[og-image] Error generating image:', err);
    res.status(500).send('Failed to generate OG image');
  }
};
