/**
 * Brand color tokens contract.
 * Guards the accidental a11y regression where PR #801:
 *  1) introduced --kc-primary-brand-strong fills (#C44A00) on primary UI
 *  2) referenced --kc-primary-brand-bright without defining it
 * Product surfaces must keep the brand orange (#FF6B00) for solid fills. The
 * shared foreground is also inherited by the logo and other identity elements,
 * so its default value is part of the visual contract and cannot be changed as
 * a global shortcut for a component-specific contrast adjustment.
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '../../assets/css/styles.css'),
  'utf8'
);
const CSS_DIR = path.join(__dirname, '../../assets/css');

function contrastRatio(first, second) {
  const relativeLuminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));

    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('brand color tokens', () => {
  test('defines brand, on-primary, bright and strong tokens in :root', () => {
    expect(CSS).toMatch(/--kc-primary-brand:\s*#FF6B00/i);
    expect(CSS).toMatch(/--kc-on-primary:\s*#FFFFFF/i);
    expect(CSS).toMatch(/--kc-primary-brand-bright:\s*#FF8000/i);
    expect(CSS).toMatch(/--kc-primary-brand-strong:\s*#C44A00/i);
  });

  test('primary solid fills use brand orange, not strong', () => {
    // Active feed tabs
    expect(CSS).toMatch(
      /\.kc-feed-tabs a\.active[\s\S]{0,200}?background-color:\s*var\(--kc-primary-brand\)/
    );
    // Ranking filter chips
    expect(CSS).toMatch(
      /\.kc-ranking-filter\.active\s*\{[\s\S]{0,120}?background:\s*var\(--kc-primary-brand\)/
    );
    // Login chip
    expect(CSS).toMatch(
      /\.kc-user-actions a\.btn-login\s*\{[\s\S]{0,160}?background-color:\s*var\(--kc-primary-brand\)/
    );
    // Global filled primary button (empty states, pager, hero CTAs)
    expect(CSS).toMatch(
      /\.kc-btn-primary\s*\{\s*background:\s*var\(--kc-primary-brand\)/
    );
    // Consent primary
    expect(CSS).toMatch(
      /\.kc-consent-btn--primary\s*\{[\s\S]{0,120}?background:\s*var\(--kc-primary-brand\)/
    );

    // Must not pin those fills to the dark strong token
    expect(CSS).not.toMatch(
      /\.kc-feed-tabs a\.active[\s\S]{0,200}?background-color:\s*var\(--kc-primary-brand-strong\)/
    );
    expect(CSS).not.toMatch(
      /\.kc-ranking-filter\.active\s*\{[\s\S]{0,120}?background:\s*var\(--kc-primary-brand-strong\)/
    );
    expect(CSS).not.toMatch(
      /\.kc-btn-primary\s*\{\s*background:\s*var\(--kc-primary-brand-strong\)/
    );
  });

  test('shared foreground preserves the established white brand identity', () => {
    const cssSources = Object.fromEntries(
      fs.readdirSync(CSS_DIR)
        .filter((file) => file.endsWith('.css'))
        .map((file) => [file, fs.readFileSync(path.join(CSS_DIR, file), 'utf8')])
    );
    const declarations = Object.values(cssSources)
      .flatMap((source) => Array.from(source.matchAll(/--kc-on-primary:\s*([^;]+);/gi)))
      .map((match) => match[1].trim().toUpperCase());
    const consumersByFile = Object.fromEntries(
      Object.entries(cssSources)
        .map(([file, source]) => [
          file,
          (source.match(/color:\s*var\(--kc-on-primary\)/g) || []).length,
        ])
        .filter(([, count]) => count > 0)
    );

    expect(declarations).toEqual(['#FFFFFF']);
    expect(consumersByFile).toEqual({
      'admin-shell.css': 1,
      'kc-chat-shortcut.css': 1,
      'kc-chat.css': 6,
      'kc-error-page.css': 1,
      'kc-pitch-host.css': 2,
      'kc-public-shell.css': 1,
      'product.css': 1,
      'styles.css': 34,
    });
    expect(CSS).not.toMatch(/--kc-on-primary:\s*#222222/i);
    expect(CSS).toMatch(
      /\.kc-logo-mark\s*\{[\s\S]{0,180}?color:\s*var\(--kc-on-primary\)/
    );
    expect(CSS).toMatch(
      /\.kc-user-actions a\.btn-login\s*\{[\s\S]{0,180}?color:\s*var\(--kc-on-primary\)/
    );
    expect(CSS).toMatch(
      /\.kc-feed-tabs a\.active,[\s\S]{0,240}?color:\s*var\(--kc-on-primary\)/
    );
    expect(CSS).toMatch(
      /\.kc-btn-primary\s*\{[\s\S]{0,120}?color:\s*var\(--kc-on-primary\)/
    );
    expect(CSS).toMatch(
      /\.kc-mobile-nav \.kc-create-btn\s*\{[\s\S]{0,180}?color:\s*var\(--kc-on-primary\)/
    );

    [
      'admin-shell.css',
      'kc-chat-shortcut.css',
      'kc-chat.css',
      'kc-error-page.css',
      'kc-pitch-host.css',
      'kc-public-shell.css',
      'product.css',
    ].forEach((file) => {
      expect(cssSources[file]).toContain('color: var(--kc-on-primary)');
    });
  });

  test('consent primary keeps the brand fill with AA-safe foreground and focus', () => {
    // Light theme: primary continua com fill laranja + texto preto (#222222)
    // → 5.57:1 (AA Normal).
    expect(CSS).toMatch(
      /\.kc-consent-btn--primary\s*\{[\s\S]{0,400}?background:\s*var\(--kc-primary-brand\)[\s\S]{0,400}?color:\s*#222222/
    );
    // Dark theme: branco sobre laranja daria 2.35:1 (falha AA). Para preservar
    // a consistência visual com os botões ghost (todos com texto branco no
    // escuro), o primary troca o fill pelo background escuro e ganha uma
    // borda laranja grossa + box-shadow brand para continuar se diferenciando
    // como CTA principal.
    expect(CSS).toMatch(
      /\[data-theme="dark"\]\s*\.kc-consent-btn--primary\s*\{[\s\S]{0,400}?background:\s*var\(--kc-background-dark\)[\s\S]{0,400}?color:\s*var\(--kc-text-dark-primary\)/
    );
    expect(CSS).toMatch(
      /\[data-theme="dark"\]\s*\.kc-consent-btn--primary\s*\{[\s\S]{0,400}?border-color:\s*var\(--kc-primary-brand\)/
    );
    expect(CSS).toMatch(
      /\.kc-consent-btn:focus-visible\s*\{[\s\S]{0,160}?outline:\s*3px solid var\(--kc-text-dark-primary\)[\s\S]{0,160}?outline-offset:\s*3px/
    );
    // Light: preto sobre laranja.
    expect(contrastRatio('#FF6B00', '#222222')).toBeGreaterThanOrEqual(4.5);
    // Dark: branco sobre cinza escuro.
    expect(contrastRatio('#222222', '#E9EAED')).toBeGreaterThanOrEqual(4.5);
  });

  test('logo Campus word does not use the dark strong token on light theme', () => {
    expect(CSS).not.toMatch(
      /\[data-theme="light"\]\s*\.kc-logo-name\s*>\s*span\s*\{[\s\S]{0,80}?--kc-primary-brand-strong/
    );
  });
});
