/**
 * remaining-pages.spec.js — KinoCampus E2E v12.9.2
 *
 * Verifica as 7 páginas públicas ainda não cobertas pelas suites anteriores:
 *   moradia, oportunidades, achados-perdidos, ods, my-posts, profile, settings
 *
 * Cada teste verifica: HTTP 200 + skip link + <main id="kc-main"> + exatamente 1 <h1>.
 *
 * Junto com pages-load.spec.js (5 páginas) e as suites create-post + product-detail,
 * esta suite completa a cobertura das páginas públicas canônicas do projeto.
 *
 * 7 testes (um por página).
 */

const { test, expect } = require('@playwright/test');

const REMAINING_PAGES = [
  { path: '/moradia.html',           name: 'Moradia' },
  { path: '/oportunidades.html',     name: 'Oportunidades' },
  { path: '/achados-perdidos.html',  name: 'Achados e Perdidos' },
  { path: '/ods.html',               name: 'ODS' },
  { path: '/my-posts.html',          name: 'Minhas Publicações' },
  { path: '/profile.html',           name: 'Perfil' },
  { path: '/settings.html',          name: 'Configurações' },
];

for (const { path, name } of REMAINING_PAGES) {
  test(`${name}: 200 + estrutura WCAG básica`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });
}
