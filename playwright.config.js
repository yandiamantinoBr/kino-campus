// @ts-check
/**
 * Configuração Playwright E2E — KinoCampus v12.9.0
 *
 * Suites:
 *   tests/e2e/smoke.spec.js         — index.html smoke (6 testes)
 *   tests/e2e/pages-load.spec.js    — 5 páginas estáticas principais (5 testes)
 *   tests/e2e/a11y-e2e.spec.js      — DOM vivo WCAG 2.1 AA no index (7 testes)
 *
 * Servidor local: http-server servindo a raiz do projeto na porta 4000.
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never', outputFolder: 'output/playwright-report' }], ['line']],
  use: {
    // O Service Worker (habilitado em produção para a instalação PWA) serve
    // requests direto do cache e não é interceptável por page.route/route.fulfill,
    // o que torna specs baseados em interceptação não determinísticos com SW ativo.
    // O comportamento do SW é coberto em tests/unit/sw.test.js (nível unitário).
    serviceWorkers: 'block',
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Servidor com os MESMOS redirects/rewrites do vercel.json: as rotas
    // canônicas sem extensão (/eventos, /perfil) precisam resolver localmente
    // como resolvem em produção, senão a navegação do app cai em 404 aqui e
    // nos testes. Ver scripts/e2e-static-server.js.
    command: 'node scripts/e2e-static-server.js --port 4000',
    url: 'http://localhost:4000',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
