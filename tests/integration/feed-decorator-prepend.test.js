'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTROLLERS = [
  'eventos.controller.js',
  'oportunidades.controller.js',
  'moradia.controller.js',
  'compra-venda-feed.controller.js',
  'caronas-feed.controller.js',
  'achados-perdidos.controller.js',
];

describe.each(CONTROLLERS)('%s — decoracao de cards prependidos', (filename) => {
  const source = fs.readFileSync(path.join(ROOT, 'assets/js/controllers/public', filename), 'utf8');

  test('anota os primeiros cards no realtime e os ultimos no append comum', () => {
    expect(source).toContain("payload.mode === 'prepend'");
    expect(source).toMatch(/slice\(0,\s*posts\.length\)/);
    expect(source).toMatch(/slice\(-posts\.length\)/);
  });
});
