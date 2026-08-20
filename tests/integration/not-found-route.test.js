'use strict';

const handler = require('../../api/og-product.js').default;

function createResponse() {
  return {
    body: '',
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = String(body);
      return this;
    },
  };
}

describe('rota publica da página 404', () => {
  test('preserva o layout e responde 404/noindex para /404.html', async () => {
    const response = createResponse();
    await handler({ query: { kc_not_found: '1' } }, response);

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['x-robots-tag']).toBe('noindex, follow, noarchive');
    expect(response.body).toContain('<title>Página não encontrada - KinoCampus</title>');
  });
});
