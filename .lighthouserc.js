/**
 * Lighthouse CI — KinoCampus v76.46
 *
 * Audita 4 páginas públicas representativas da plataforma:
 *   - Home (index.html)      → shell, carousel e ranking
 *   - Feed público           → compra-venda-feed.html
 *   - Eventos                → conteúdo e listagem pública
 *   - Central de Ajuda       → conteúdo longo e layout responsivo
 *
 * Rotas administrativas autenticadas ficam nos testes E2E. Auditá-las aqui
 * sem sessão mede o redirect para a Home, duplica a amostra e introduz um erro
 * de console que não pertence à página administrativa real.
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
        'http://localhost:4000/eventos.html',
        'http://localhost:4000/ajuda.html',
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
