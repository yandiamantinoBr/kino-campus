/**
 * pages-load.spec.js — KinoCampus E2E v12.9.0
 *
 * Verifica que 5 páginas públicas principais:
 *   1. retornam HTTP 200
 *   2. têm skip link .kc-skip-link
 *   3. têm <main id="kc-main">
 *   4. têm exatamente 1 <h1>
 *
 * 5 testes (um por página).
 */

const { test, expect } = require('@playwright/test');

const PAGES = [
  { path: '/',                        name: 'Home (index.html)' },
  { path: '/compra-venda-feed.html',  name: 'Compra e Venda Feed' },
  { path: '/caronas-feed.html',       name: 'Caronas Feed' },
  { path: '/eventos.html',            name: 'Eventos' },
  { path: '/search-results.html',     name: 'Resultados de Busca' },
];

for (const { path, name } of PAGES) {
  test(`${name}: 200 + estrutura WCAG básica`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });
}
