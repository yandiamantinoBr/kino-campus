const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CSS = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');

describe('mobile corner badge layout', () => {
  test('retira o badge do overlay e reserva uma linha no grid mobile', () => {
    const mobileRule = CSS.match(
      /@media \(max-width: 576px\) \{\s*\.kc-card--has-corner-badge \.kc-card__main \{[\s\S]*?\.kc-card--has-corner-badge:hover \.kc-cashback-badge \{[\s\S]*?\}\s*\}/,
    );

    expect(mobileRule).not.toBeNull();
    expect(mobileRule[0]).toContain('"media corner-badge"');
    expect(mobileRule[0]).toContain('"media content"');
    expect(mobileRule[0]).toMatch(/\.kc-cashback-badge \{[\s\S]*?position:\s*static;/);
    expect(mobileRule[0]).toMatch(/\.kc-card__image-wrapper \{\s*grid-area:\s*media;/);
    expect(mobileRule[0]).toMatch(/\.kc-card__content \{\s*grid-area:\s*content;/);
    expect(mobileRule[0]).toContain('white-space: normal;');
    expect(mobileRule[0]).toContain('overflow-wrap: anywhere;');
  });
});
