/**
 * admin-pages.spec.js — KinoCampus E2E v12.9.1
 *
 * Verifica que as 5 páginas admin carregam corretamente e têm estrutura
 * WCAG básica (HTTP 200, skip link, <main id="kc-main">, exatamente 1 <h1>).
 *
 * Nota: as páginas admin podem redirecionar via JS (sem sessão de admin),
 * mas o HTTP server responde 200 para o HTML estático — os testes verificam
 * somente a camada estática servida.
 *
 * 5 testes (um por página admin).
 */

const { test, expect } = require('@playwright/test');

const ADMIN_PAGES = [
  { path: '/admin/index.html',         name: 'Admin Dashboard' },
  { path: '/admin/moderation.html',    name: 'Admin Moderação' },
  { path: '/admin/banners.html',       name: 'Admin Banners' },
  { path: '/admin/reports.html',       name: 'Admin Denúncias' },
  { path: '/admin/help-requests.html', name: 'Admin Ajuda' },
  { path: '/admin/privacy-analytics.html', name: 'Admin Privacidade' },
];

for (const { path, name } of ADMIN_PAGES) {
  test(`${name}: 200 + estrutura WCAG básica`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });
}
