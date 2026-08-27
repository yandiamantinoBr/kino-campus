'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ALL_HTML_PAGES } = require('../../scripts/admin-pages.manifest');

const ROOT = path.resolve(__dirname, '../..');
const VENDOR_PATH = 'assets/vendor/supabase-js-2.112.4.js';
const UPSTREAM_SHA256 = 'f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('runtime Supabase vendorizado', () => {
  test('bundle local corresponde ao artefato UMD oficial fixado', () => {
    const normalized = read(VENDOR_PATH).replace(/\r\n/g, '\n').replace(/\n$/, '');
    const sha256 = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');

    expect(sha256).toBe(UPSTREAM_SHA256);
    expect(normalized).toContain('var supabase=');
    expect(normalized).toContain('2.112.4');
    expect(read('assets/vendor/supabase-js-LICENSE.txt')).toContain('MIT License');
  });

  test('as 33 páginas carregam o SDK local antes do cliente KinoCampus', () => {
    ALL_HTML_PAGES.forEach((file) => {
      const html = read(file);
      const src = file.startsWith('admin/') ? `../${VENDOR_PATH}` : VENDOR_PATH;
      const versionedSrc = `${src}?v=2.112.4`;
      const script = `<script defer src="${versionedSrc}"></script>`;

      expect(html.match(new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(
        html.includes(`<link rel="preload" href="${versionedSrc}" as="script" />`) ? 2 : 1,
      );
      expect(html).toContain(script);
      expect(html).not.toContain(`${src}\"`);
      expect(html).not.toContain('cdn.jsdelivr.net/npm/@supabase/supabase-js');
      expect(html.indexOf(script)).toBeLessThan(html.indexOf('kc-supabase.client.js'));
    });
  });
});
