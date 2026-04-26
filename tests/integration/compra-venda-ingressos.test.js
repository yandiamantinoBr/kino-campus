const fs = require('fs');
const path = require('path');

describe('compra-venda ingressos category', () => {
  test('feed markup exposes ingressos in tabs and sidebar filters', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'compra-venda-feed.html'), 'utf8');
    expect(html).toContain('data-category="ingressos"');
    expect(html).toContain('id="filterIngressos"');
    expect(html).toContain('value="ingressos"');
    expect(html).toContain('<span>Ingressos</span>');
  });

  test('controller and create modal schema recognize ingressos as a first-class category', () => {
    const controller = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/js/controllers/compra-venda-feed.controller.js'), 'utf8');
    const createSchema = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/js/kc-create-post.schema.js'), 'utf8');

    expect(controller).toContain("{ key: 'ingressos', label: 'Ingressos'");
    expect(controller).toContain("if (key.includes('ingress')) return 'ingressos';");
    expect(createSchema).toContain("{ key: 'ingressos', label: 'Ingressos' }");
  });
});
