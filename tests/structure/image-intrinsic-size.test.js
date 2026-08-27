'use strict';

const fs = require('fs');
const path = require('path');
const { ALL_HTML_PAGES } = require('../../scripts/admin-pages.manifest');

const ROOT = path.resolve(__dirname, '../..');

describe('dimensões intrínsecas das imagens HTML', () => {
  test('todas as imagens declaradas nas rotas canônicas reservam proporção', () => {
    const missing = [];

    ALL_HTML_PAGES.forEach((file) => {
      const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const tags = html.match(/<img\b[^>]*>/gis) || [];
      tags.forEach((tag, index) => {
        if (!/\bwidth="\d+"/i.test(tag) || !/\bheight="\d+"/i.test(tag)) {
          missing.push(`${file}#img-${index + 1}`);
        }
      });
    });

    expect(missing).toEqual([]);
  });
});
