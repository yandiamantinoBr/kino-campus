'use strict';

const fs = require('fs');
const path = require('path');
const sitemapHandler = require('../../api/sitemap.js').default;

const ROOT = path.join(__dirname, '..', '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

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

function sitemapLocs(xml) {
  return xml
    .split('<loc>')
    .slice(1)
    .map((chunk) => chunk.split('</loc>')[0])
    .map((url) => url.replace('https://www.kinocampus.com.br', ''));
}

describe('higiene de indexação (Search Console)', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('alias legado /_product.html?id= redireciona para a rota canônica de detalhe', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const redirect = vercel.redirects.find((entry) => entry.source === '/_product.html');

    expect(redirect).toBeTruthy();
    expect(redirect.destination).toBe('/product.html');
    expect(redirect.permanent).toBe(true);
    // só com ?id=: sem id, /_product.html é o shell legado usado pelo driver
    // local e pelos testes E2E e precisa continuar servindo 200
    expect(redirect.has).toEqual([{ type: 'query', key: 'id' }]);
  });

  test('servidor E2E replica a condicao `has` dos redirects do vercel.json', () => {
    const server = read('scripts/e2e-static-server.js');
    expect(server).toContain('function matchesHas');
    expect(server).toContain('matchesHas(redirect, search)');
  });

  test('sitemap anuncia somente URLs que respondem 200 — nunca rotas redirecionadas', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const response = createResponse();
    await sitemapHandler({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<loc>https://www.kinocampus.com.br/apresentacao-institucional.html</loc>');

    const vercel = JSON.parse(read('vercel.json'));
    const redirectSources = vercel.redirects.map((entry) => entry.source);
    const locs = sitemapLocs(response.body);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(redirectSources).not.toContain(loc);
    }
  });

  test('nenhum redirect de rota limpa aponta de volta para o próprio arquivo .html', () => {
    const vercel = JSON.parse(read('vercel.json'));
    for (const entry of vercel.redirects) {
      expect(entry.destination).not.toBe(entry.source);
    }
  });
});
