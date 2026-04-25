/**
 * Lighthouse CI — KinoCampus v12.10.0
 *
 * Audita 4 páginas representativas da plataforma:
 *   - Home (index.html)      → shell + carousel + ranking
 *   - Feed público            → compra-venda-feed.html
 *   - Detalhe de publicação  → _product.html
 *   - Admin Dashboard        → admin/index.html
 *
 * Thresholds (baseline local — v12.10.0):
 *   Performance    ≥ 0.70  (warn — site dinâmico via Supabase; local: index 74, feed 100)
 *   Accessibility  ≥ 0.80  (warn — local: 86/86; prod com dados dinâmicos pode variar)
 *   Best Practices ≥ 0.60  (warn — localhost sem HTTPS perde ~10pts; prod Vercel HTTPS ~85)
 *   SEO            ≥ 0.90  (warn — local: 100/100)
 *
 * Nota Windows: lhci falha no cleanup (EPERM temp dir) mas o audit em si completa.
 * Em Linux (CI GitHub Actions), autorun funciona sem erros.
 *
 * Baseline local (2026-04-25):
 *   index.html              perf:74  a11y:86  bp:64  seo:100
 *   compra-venda-feed.html  perf:100 a11y:86  bp:64  seo:100
 *
 * Para executar localmente (Linux/macOS):
 *   npx lhci autorun
 *
 * Em CI (GitHub Actions), o startServerCommand sobe o servidor automaticamente.
 */

module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:4000/',
        'http://localhost:4000/compra-venda-feed.html',
        'http://localhost:4000/_product.html',
        'http://localhost:4000/admin/index.html',
      ],
      startServerCommand: 'npx http-server . -p 4000 -s -c-1',
      startServerReadyPattern: 'Available on',
      numberOfRuns: 1,
      settings: {
        // Desativa throttling no CI (ambiente já limitado)
        throttlingMethod: 'provided',
        // Chrome sem sandbox (necessário no Linux/CI)
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance':     ['warn',  { minScore: 0.70 }],
        'categories:accessibility':   ['warn',  { minScore: 0.80 }],
        'categories:best-practices':  ['warn',  { minScore: 0.60 }],
        'categories:seo':             ['warn',  { minScore: 0.90 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
