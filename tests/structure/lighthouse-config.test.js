'use strict';

const lighthouseConfig = require('../../.lighthouserc.js');

describe('Lighthouse CI representa páginas públicas reais', () => {
  test('audita quatro superfícies públicas sem redirects autenticados', () => {
    const urls = lighthouseConfig.ci.collect.url;

    expect(urls).toEqual([
      'http://localhost:4000/',
      // LHCI roda contra um servidor estatico local (http-server), que serve
      // ARQUIVOS: aqui os nomes .html sao obrigatorios (as rotas canonicas sem
      // extensao existem apenas no rewrite do Vercel).
      'http://localhost:4000/compra-venda-feed.html',
      'http://localhost:4000/eventos.html',
      'http://localhost:4000/ajuda.html',
    ]);
    expect(urls).toHaveLength(4);
    expect(urls.some((url) => url.includes('/admin/'))).toBe(false);
  });
});
