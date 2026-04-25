/**
 * smoke.spec.js — KinoCampus E2E v12.9.0
 *
 * Verifica que index.html carrega corretamente e tem estrutura básica esperada:
 * título, h1 único, skip link, main landmark, header.
 *
 * 6 testes — suite: "Smoke — index.html"
 */

const { test, expect } = require('@playwright/test');

test.describe('Smoke — index.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('página carrega com status 200', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
  });

  test('título contém "KinoCampus"', async ({ page }) => {
    await expect(page).toHaveTitle(/KinoCampus/i);
  });

  test('exatamente um <h1> presente', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('skip link .kc-skip-link está no DOM', async ({ page }) => {
    await expect(page.locator('.kc-skip-link')).toBeAttached();
  });

  test('skip link aponta para #kc-main', async ({ page }) => {
    const href = await page.locator('.kc-skip-link').getAttribute('href');
    expect(href).toBe('#kc-main');
  });

  test('<main id="kc-main"> existe no DOM', async ({ page }) => {
    await expect(page.locator('main#kc-main')).toBeAttached();
  });
});
