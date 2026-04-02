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
    var parsedUrl = new URL(req.url, 'https://' + (req.headers.host || 'www.kinocampus.com.br'));
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
