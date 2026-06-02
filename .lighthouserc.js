/**
 * Lighthouse CI — KinoCampus v75.1.0
 *
 * Audita 3 páginas representativas da plataforma:
 *   - Home (index.html)      → shell, carousel e ranking
 *   - Feed público           → compra-venda-feed.html
 *   - Admin Dashboard        → admin/index.html
 *
 * Observação SEO:
 *   `_product.html` é deliberadamente um fallback/app shell noindex.
 *   A publicação indexável canônica é servida por `/product.html?id=...`
 *   via `api/og-product.js`, então o detalhe de publicação é validado por
 *   testes de API/HTML inicial e pela auditoria local `npm run seo:audit`.
 *   Páginas públicas complementares, como ODS, também entram na auditoria
 *   local de SEO para metadados/canonical/JSON-LD sem tornar o LHCI local
 *   instável por performance de shell.
 *
 * Thresholds:
 *   Performance    ≥ 0.70  (warn  — local varia sem HTTPS/CDN; revisar no Vercel)
 *   Accessibility  ≥ 0.90  (error)
 *   Best Practices ≥ 0.80  (warn  — local perde pontos por falta de HTTPS)
 *   SEO            ≥ 0.90  (error — apenas páginas indexáveis nesta lista)
 *
 * Nota Windows: lhci pode emitir aviso de servidor/cleanup local, mas o audit
 * em si completa. Em CI Linux, o autorun usa o startServerCommand abaixo.
 */

module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:4000/',
        'http://localhost:4000/compra-venda-feed.html',
        'http://localhost:4000/admin/index.html',
      ],
      startServerCommand: 'npx http-server . -p 4000 -s -c-1',
      startServerReadyPattern: 'Available on',
      numberOfRuns: 1,
      settings: {
        throttlingMethod: 'provided',
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.70 }],
        'categories:accessibility': ['error', { minScore: 0.90 }],
        'categories:best-practices': ['warn', { minScore: 0.80 }],
        'categories:seo': ['error', { minScore: 0.90 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
