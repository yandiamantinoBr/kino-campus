/**
 * KinoCampus — Dynamic OG Image Generator (v8.6.4)
 *
 * Vercel Serverless Function (api/og-image.js) that generates branded Open Graph
 * images (1200×630 PNG) for all platform pages using @vercel/og + Satori.
 *
 * Uses ESM with Node.js runtime. The api/package.json sets "type": "module"
 * so Vercel recognises this as native ESM.
 *
 * Usage: /api/og-image?type=eventos
 * Types: home | compra-venda | eventos | moradia | caronas |
 *        oportunidades | achados-perdidos | ajuda | product
 */

import { ImageResponse } from '@vercel/og';

// ---------------------------------------------------------------------------
// KinoCampus Logo — assets/favicon.svg as inline SVG string
// ---------------------------------------------------------------------------
var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#ff6b00"/><g transform="translate(50,50) scale(0.042) translate(-1024,-1024)"><path d="M1271.98,454.73c30.57-38.46,24.45-94.48-13.89-125.42-38.35-30.94-94.2-24.53-125.05,13.94l-108.38,136.01-108.38-136.01c-30.57-38.46-86.7-44.59-125.05-13.94-38.35,30.66-44.46,86.96-13.89,125.42l133.38,167.22-652.2,817.73c-22.23,27.87-34.18,62.15-34.18,97.55v65.77c0,73.86,59.75,133.78,133.38,133.78h1333.85c73.64,0,133.38-59.92,133.38-133.78v-65.77c0-35.4-11.95-69.96-34.18-97.55l-652.2-817.73,133.38-167.22ZM1024.66,1558.41h-332.07l332.07-435.62,332.07,435.62h-332.07Z" fill="white"/></g></svg>';

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------
var MODULES = {
  home: {
    title: 'KinoCampus',
    description: 'A plataforma universitária da UFG para compra e venda, caronas, moradia, eventos e muito mais.',
    emoji: '⛺',
    tag: 'Comunidade Universitária',
    accent: '#FF6B00',
    rgb: '255,107,0',
    accentLight: '#FFF5EB',
  },
  'compra-venda': {
    title: 'Compra e Venda',
    description: 'Anuncie ou encontre eletrônicos, móveis, livros e mais entre estudantes da UFG.',
    emoji: '🛍️',
    tag: 'Marketplace Universitário',
    accent: '#FF6B00',
    rgb: '255,107,0',
    accentLight: '#FFF5EB',
  },
  eventos: {
    title: 'Eventos',
    description: 'Palestras, workshops, feiras, eventos culturais e esportivos na UFG.',
    emoji: '🎉',
    tag: 'Agenda Universitária',
    accent: '#1A9CBF',
    rgb: '26,156,191',
    accentLight: '#E6F5FA',
  },
  moradia: {
    title: 'Moradia',
    description: 'Repúblicas, quartos e apartamentos perto da UFG em Goiânia.',
    emoji: '🏠',
    tag: 'Moradia Universitária',
    accent: '#2DA653',
    rgb: '45,166,83',
    accentLight: '#E8F8EE',
  },
  caronas: {
    title: 'Caronas',
    description: 'Ofereça ou procure caronas entre estudantes da UFG. Econômico e sustentável.',
    emoji: '🚗',
    tag: 'Mobilidade Universitária',
    accent: '#D4A017',
    rgb: '212,160,23',
    accentLight: '#FDF6E3',
  },
  oportunidades: {
    title: 'Oportunidades',
    description: 'Estágios, empregos, freelancer, monitorias e bolsas para estudantes da UFG.',
    emoji: '💼',
    tag: 'Carreira & Desenvolvimento',
    accent: '#9B59B6',
    rgb: '155,89,182',
    accentLight: '#F5EEF8',
  },
  'achados-perdidos': {
    title: 'Achados e Perdidos',
    description: 'Perdeu ou encontrou algo no campus? Publique e ajude a comunidade UFG.',
    emoji: '🔍',
    tag: 'Campus UFG',
    accent: '#E74C3C',
    rgb: '231,76,60',
    accentLight: '#FDEDEC',
  },
  ajuda: {
    title: 'Central de Ajuda',
    description: 'Tire dúvidas e aprenda a usar o KinoCampus, a plataforma da comunidade da UFG.',
    emoji: '💬',
    tag: 'Suporte & Tutoriais',
    accent: '#3498DB',
    rgb: '52,152,219',
    accentLight: '#EBF5FB',
  },
  product: {
    title: 'KinoCampus',
    description: 'Confira este anúncio na plataforma da comunidade universitária da UFG.',
    emoji: '⛺',
    tag: 'Ver anúncio',
    accent: '#FF6B00',
    rgb: '255,107,0',
    accentLight: '#FFF5EB',
  },
};

// ---------------------------------------------------------------------------
// Minimal React element factory — no JSX, no React dependency.
// Satori / @vercel/og accept plain objects with this shape.
// ---------------------------------------------------------------------------
var REACT_ELEMENT_TYPE = Symbol.for('react.element');

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
// Handler — Node.js Serverless Function (ESM via api/package.json)
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  try {
    var parsedUrl = new URL(req.url, 'https://' + (req.headers.host || 'www.kinocampus.com.br'));
    var type = parsedUrl.searchParams.get('type') || 'home';
    var m = MODULES[type] || MODULES['home'];

    var fontData = await loadFont();
    var hasDMSans = !!fontData;
    var fonts = hasDMSans
      ? [{ name: 'DM Sans', data: fontData, weight: 700, style: 'normal' }]
      : undefined;
    var ff = hasDMSans ? "'DM Sans', system-ui, sans-serif" : 'system-ui, -apple-system, sans-serif';

    var logoDataUri = 'data:image/svg+xml;base64,' + Buffer.from(LOGO_SVG).toString('base64');
    var titleSize = m.title.length > 16 ? '48px' : m.title.length > 12 ? '56px' : '66px';

    var element = h('div', {
      style: {
        width: '1200px',
        height: '630px',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: ff,
        position: 'relative',
        overflow: 'hidden',
      },
    },

      // ── Top accent bar (module colour) ───────────────────────────────────
      h('div', {
        style: {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '6px',
          background: m.accent,
        },
      }),

      // ── Decorative glow (bottom-right) ───────────────────────────────────
      h('div', {
        style: {
          position: 'absolute',
          right: '-60px',
          bottom: '-60px',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(' + m.rgb + ', 0.10) 0%, rgba(' + m.rgb + ', 0.03) 55%, transparent 100%)',
        },
      }),

      // ── Subtle grid texture ──────────────────────────────────────────────
      h('div', {
        style: {
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        },
      }),

      // ── Main content container ───────────────────────────────────────────
      h('div', {
        style: {
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 72px 40px',
          zIndex: '1',
        },
      },

        // ── HEADER: Logo + Tag pill ──────────────────────────────────────
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        },
          // Logo group
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            },
          },
            // Real logo icon (from assets/favicon.svg)
            h('img', {
              src: logoDataUri,
              width: 52,
              height: 52,
            }),
            // Logo text
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
              h('span', {
                style: {
                  color: '#1A1A2E',
                  fontSize: '22px',
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
                  color: '#999',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                },
              }, 'Comunidade UFG')
            )
          ),
          // Tag pill (top-right)
          h('div', {
            style: {
              padding: '8px 20px',
              background: m.accentLight,
              border: '1px solid rgba(' + m.rgb + ', 0.20)',
              borderRadius: '999px',
              color: m.accent,
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.4px',
            },
          }, m.tag)
        ),

        // ── Accent divider ──────────────────────────────────────────────
        h('div', {
          style: {
            width: '48px',
            height: '3px',
            background: m.accent,
            borderRadius: '2px',
            marginTop: '28px',
            marginBottom: '24px',
          },
        }),

        // ── MAIN CONTENT ────────────────────────────────────────────────
        h('div', {
          style: {
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          },
        },
          // Emoji
          h('div', {
            style: { fontSize: '56px', lineHeight: '1', marginBottom: '16px' },
          }, m.emoji),

          // Module title
          h('div', {
            style: {
              fontSize: titleSize,
              fontWeight: 700,
              color: '#1A1A2E',
              lineHeight: '1.1',
              letterSpacing: '-1.5px',
              marginBottom: '16px',
            },
          }, m.title),

          // Description
          h('div', {
            style: {
              fontSize: '22px',
              color: '#555',
              lineHeight: '1.5',
              maxWidth: '800px',
            },
          }, m.description)
        ),

        // ── FOOTER ──────────────────────────────────────────────────────
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #E8E8EE',
            paddingTop: '20px',
          },
        },
          h('span', {
            style: { color: '#999', fontSize: '15px', letterSpacing: '0.3px' },
          }, 'www.kinocampus.com.br'),

          h('div', {
            style: {
              padding: '7px 18px',
              background: '#FF6B00',
              borderRadius: '999px',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            },
          }, 'KinoCampus')
        )
      )
    );

    var options = { width: 1200, height: 630 };
    if (fonts) options.fonts = fonts;
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
