/** @jsxImportSource @vercel/og */
/**
 * KinoCampus — Dynamic OG Image Generator (v8.6.2)
 *
 * Vercel Edge Function that generates branded Open Graph images for all
 * platform pages. Returns a 1200×630 PNG with KinoCampus dark theme,
 * per-module accent colors, and emoji identifiers.
 *
 * Usage: /api/og-image?type=eventos
 *
 * Supported types: home, compra-venda, eventos, moradia, caronas,
 *                  oportunidades, achados-perdidos, ajuda, product
 */

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

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

/**
 * Loads DM Sans 700 from Google Fonts CDN.
 * Returns null on failure so we gracefully fall back to system-ui.
 */
async function loadFont() {
  try {
    // Google Fonts CSS for DM Sans Bold
    const cssUrl = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap';
    const css = await fetch(cssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    }).then((r) => r.text());

    // Extract the woff2 URL from the CSS
    const match = css.match(/src: url\(([^)]+\.woff2)\)/);
    if (!match) return null;

    const fontData = await fetch(match[1]).then((r) => r.arrayBuffer());
    return fontData;
  } catch (_) {
    return null;
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'home';
  const m = MODULES[type] || MODULES.home;

  const fontData = await loadFont();
  const fonts = fontData
    ? [{ name: 'DM Sans', data: fontData, weight: 700, style: 'normal' }]
    : [];
  const ff = fontData ? "'DM Sans', system-ui, sans-serif" : 'system-ui, -apple-system, sans-serif';

  const titleSize = m.title.length > 16 ? '52px' : m.title.length > 12 ? '62px' : '72px';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(145deg, #14151f 0%, #1c1e30 55%, #181b2c 100%)',
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 72px',
          fontFamily: ff,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow — top right, module accent color */}
        <div
          style={{
            position: 'absolute',
            right: '-100px',
            top: '-100px',
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${m.rgb}, 0.20) 0%, rgba(${m.rgb}, 0.05) 55%, transparent 100%)`,
          }}
        />
        {/* Decorative glow — bottom left, always orange */}
        <div
          style={{
            position: 'absolute',
            left: '-60px',
            bottom: '-60px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,107,0,0.10) 0%, transparent 70%)',
          }}
        />
        {/* Subtle grid texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* ── HEADER: Logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 1 }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              background: 'linear-gradient(135deg, #FF6B00 0%, #d95e00 100%)',
              borderRadius: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              flexShrink: 0,
              boxShadow: '0 4px 16px rgba(255,107,0,0.35)',
            }}
          >
            ⛺
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span
              style={{
                color: '#E9EAED',
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '-0.3px',
                lineHeight: 1,
              }}
            >
              Kino<span style={{ color: '#FF6B00' }}>Campus</span>
            </span>
            <span
              style={{
                color: '#6b6d7e',
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              Comunidade UFG
            </span>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          {/* Emoji */}
          <div style={{ fontSize: '64px', lineHeight: 1, marginBottom: '20px' }}>
            {m.emoji}
          </div>

          {/* Module title */}
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              color: '#F0F1F4',
              lineHeight: 1.05,
              letterSpacing: '-1.5px',
              marginBottom: '16px',
            }}
          >
            {m.title}
          </div>

          {/* Accent tag line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '22px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '3px',
                background: m.accent,
                borderRadius: '2px',
              }}
            />
            <span
              style={{
                color: m.accent,
                fontSize: '15px',
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {m.tag}
            </span>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: '24px',
              color: '#8a8b9a',
              lineHeight: 1.5,
              maxWidth: '780px',
            }}
          >
            {m.description}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: '20px',
            zIndex: 1,
          }}
        >
          <span style={{ color: '#55566a', fontSize: '16px', letterSpacing: '0.3px' }}>
            www.kinocampus.com.br
          </span>
          <div
            style={{
              padding: '7px 18px',
              background: `rgba(${m.rgb}, 0.12)`,
              border: `1px solid rgba(${m.rgb}, 0.28)`,
              borderRadius: '999px',
              color: m.accent,
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            KinoCampus
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  );
}
