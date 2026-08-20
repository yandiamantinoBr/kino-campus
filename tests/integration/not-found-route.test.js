'use strict';

const handler = require('../../api/not-found.js');

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
  test('preserva o layout e responde 404/noindex para /404.html', () => {
    const response = createResponse();
    handler({}, response);

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['x-robots-tag']).toBe('noindex, follow, noarchive');
    expect(response.body).toContain('<title>Página não encontrada - KinoCampus</title>');
  });
});
