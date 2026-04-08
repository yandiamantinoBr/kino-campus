const fs = require('fs');
const path = require('path');

const cases = [
  ['compra-venda-feed.html', 'data-kc-market-empty-clear="true"'],
  ['caronas-feed.html', 'data-kc-caronas-empty-clear="true"'],
  ['moradia.html', 'data-kc-housing-empty-clear="true"'],
  ['eventos.html', 'data-kc-eventos-empty-clear="true"'],
  ['oportunidades.html', 'data-kc-opp-empty-clear="true"'],
  ['achados-perdidos.html', 'data-kc-achados-empty-clear="true"'],
];

describe('feed empty state clear actions', () => {
  test.each(cases)('%s exposes an explicit empty-state clear action', (file, marker) => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    expect(html).toContain('id="noResults"');
    expect(html).toContain(marker);
  });

  test('eventos exposes a sidebar clear action for date filters', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'eventos.html'), 'utf8');
    expect(html).toContain('data-kc-eventos-clear-filters="true"');
  });
});
