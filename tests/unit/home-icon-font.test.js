'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'assets/fonts/kc-ui-icons');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const css = fs.readFileSync(path.join(ROOT, 'assets/css/kc-ui-icons.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function expandRange(value) {
  return value.split(',').flatMap(range => {
    const [, start, end] = range.trim().match(/^U\+([A-F0-9]+)(?:-([A-F0-9]+))?$/);
    const first = parseInt(start, 16), last = parseInt(end || start, 16);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  });
}

describe('optional home icon subset with complete upstream fallback', () => {
  test('pins upstream and derived binary integrity with a content-addressed path', () => {
    const original = fs.readFileSync(path.join(ROOT, 'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2'));
    const compact = fs.readFileSync(path.join(DIR, manifest.subsetFile));
    expect(sha256(original)).toBe(manifest.upstreamSha256);
    expect(sha256(compact)).toBe(manifest.subsetSha256);
    expect(compact.subarray(0, 4).toString()).toBe('wOF2');
    expect(compact.length).toBe(manifest.subsetBytes);
    expect(original.length).toBe(manifest.upstreamBytes);
    expect(compact.length).toBeLessThan(original.length / 4);
    expect(manifest.subsetFile).toBe(`kc-ui-icons-solid-${manifest.subsetSha256.slice(0, 12)}.woff2`);
  });

  test('all reviewed glyph ranges are disjoint and include the space metrics sentinel', () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => match[1]);
    expect(faces).toHaveLength(2);
    const common = expandRange(faces[0].match(/unicode-range:\s*([^;]+);/)[1]);
    const remainder = expandRange(faces[1].match(/unicode-range:\s*([^;]+);/)[1]);
    expect(common).toEqual([...manifest.codepoints, 0x20].sort((a, b) => a - b));
    expect(remainder).toEqual(manifest.remainderCodepoints);
    expect(common.filter(point => new Set(remainder).has(point))).toEqual([]);
    for (const face of faces) {
      expect(face).toContain('font-family: "Kino Campus UI Icons"');
      expect(face).toContain('font-weight: 900');
      expect(face).toContain('font-display: block');
      expect(face).toContain('../vendor/fontawesome/webfonts/fa-solid-900.woff2');
      expect(face).toContain('../vendor/fontawesome/webfonts/fa-solid-900.ttf');
    }
    expect(faces[0].indexOf(manifest.subsetFile)).toBeLessThan(faces[0].indexOf('fa-solid-900.woff2'));
    expect(faces[1]).not.toContain(manifest.subsetFile);
  });

  test('opts in only the solid classes and preserves regular/brand/vendor definitions', () => {
    expect(css).toContain('.fa-solid, .fas {');
    expect(css).not.toMatch(/\.fa(?:r|b|-[rb][a-z-]+)\b/);
    expect(css).not.toContain('!important');
    expect(css).not.toContain('--fa-style-family');
    expect(fs.readFileSync(path.join(DIR, 'LICENSE.txt'), 'utf8')).toBe(
      fs.readFileSync(path.join(ROOT, 'assets/vendor/fontawesome/LICENSE.txt'), 'utf8').replace(/\r\n/g, '\n'),
    );
    expect(css).toContain('Copyright 2023 Fonticons, Inc.');
    expect(manifest.family).toBe('Kino Campus UI Icons');
  });

  test('home loads the optional definition after vendor CSS and preloads only the compact font', () => {
    expect(html).toContain('assets/css/kc-ui-icons.css?v=1.0.0');
    expect(html.indexOf('assets/css/kc-ui-icons.css')).toBeGreaterThan(html.indexOf('assets/vendor/fontawesome/css/all.min.css'));
    expect(html).toContain(`href="assets/fonts/kc-ui-icons/${manifest.subsetFile}" as="font" type="font/woff2" crossorigin`);
    expect(html).not.toContain('href="assets/vendor/fontawesome/webfonts/fa-solid-900.woff2" as="font"');
  });
});
