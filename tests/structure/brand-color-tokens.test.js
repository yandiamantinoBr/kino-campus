/**
 * Brand color tokens contract.
 * Guards the accidental a11y regression where PR #801:
 *  1) introduced --kc-primary-brand-strong fills (#C44A00) on primary UI
 *  2) referenced --kc-primary-brand-bright without defining it
 * Product surfaces must keep the brand orange (#FF6B00) for solid fills.
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '../../assets/css/styles.css'),
  'utf8'
);

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
  test('defines brand, bright and strong tokens in :root', () => {
    expect(CSS).toMatch(/--kc-primary-brand:\s*#FF6B00/i);
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

  test('consent primary keeps the brand fill with AA-safe foreground and focus', () => {
    expect(CSS).toMatch(
      /\.kc-consent-btn--primary\s*\{[\s\S]{0,220}?background:\s*var\(--kc-primary-brand\)[\s\S]{0,220}?color:\s*#222222/
    );
    expect(CSS).toMatch(
      /\.kc-consent-btn:focus-visible\s*\{[\s\S]{0,160}?outline:\s*3px solid var\(--kc-text-dark-primary\)[\s\S]{0,160}?outline-offset:\s*3px/
    );
    expect(contrastRatio('#FF6B00', '#222222')).toBeGreaterThanOrEqual(4.5);
  });

  test('logo Campus word does not use the dark strong token on light theme', () => {
    expect(CSS).not.toMatch(
      /\[data-theme="light"\]\s*\.kc-logo-name\s*>\s*span\s*\{[\s\S]{0,80}?--kc-primary-brand-strong/
    );
  });
});
