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
    command: 'npx http-server . -p 4000 -s -c-1',
    url: 'http://localhost:4000',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
