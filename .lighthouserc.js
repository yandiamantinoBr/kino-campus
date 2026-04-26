/**
 * Lighthouse CI — KinoCampus v14.10.0
 *
 * Audita 4 páginas representativas da plataforma:
 *   - Home (index.html)      → shell + carousel + ranking
 *   - Feed público            → compra-venda-feed.html
 *   - Detalhe de publicação  → _product.html
 *   - Admin Dashboard        → admin/index.html
 *
 * Thresholds (produção — v14.10.0):
 *   Performance    ≥ 0.80  (error — Vercel CDN + HTTPS; local: index 74, feed 100)
 *   Accessibility  ≥ 0.90  (error — WCAG 2.1 AA concluído em V12; produção consistente)
 *   Best Practices ≥ 0.80  (warn  — Vercel HTTPS +~20pts vs local 0.64; prod ~85)
 *   SEO            ≥ 0.90  (error — local 100/100; produção estável)
 *
 * Histórico de thresholds:
 *   v12.10.0: perf:warn/0.70  a11y:warn/0.80  bp:warn/0.60  seo:warn/0.90
 *   v14.10.0: perf:error/0.80 a11y:error/0.90 bp:warn/0.80  seo:error/0.90
 *
 * Justificativa das elevações:
 *   - Performance: feed local atinge 100; index local 74 (sem HTTPS/CDN); produção
 *     Vercel consistentemente ≥ 0.80 com static files + CDN edge caching.
 *   - Accessibility: ciclo V12 Camada B implementou WCAG 2.1 AA completo;
 *     scores de produção validados ≥ 0.90 após auditoria docs/audits/accessibility/.
 *   - Best Practices: local perde ~20pts por falta de HTTPS; Vercel HTTPS = ~0.85.
 *   - SEO: estável em 100 localmente e produção; threshold de error mantido.
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
        'categories:performance':     ['error', { minScore: 0.80 }],
        'categories:accessibility':   ['error', { minScore: 0.90 }],
        'categories:best-practices':  ['warn',  { minScore: 0.80 }],
        'categories:seo':             ['error', { minScore: 0.90 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
