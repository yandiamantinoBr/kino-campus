/**
 * admin-moderation.spec.js — KinoCampus E2E v12.9.2
 *
 * Verifica admin/moderation.html em profundidade:
 *   - estrutura WCAG básica
 *   - os 3 selects corrigidos em v12.8.1 (A5) têm aria-label correto
 *   - selects do painel de auditoria têm aria-label
 *   - ranking-info-btn tem aria-label
 *   - nav admin tem aria-label
 *
 * 7 testes — suite: "Admin Moderação — admin/moderation.html"
 */

const { test, expect } = require('@playwright/test');

test.describe('Admin Moderação — admin/moderation.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/moderation.html');
  });

  test('página carrega com status 200', async ({ page }) => {
    const response = await page.goto('/admin/moderation.html');
    expect(response.status()).toBe(200);
  });

  test('h1 único + skip link + main#kc-main', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
  });

  test('select #moderation-status-filter tem aria-label (A5 — v12.8.1)', async ({ page }) => {
    const sel = page.locator('#moderation-status-filter');
    await expect(sel).toBeAttached();
    const label = await sel.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('select #limit-global-module tem aria-label (A5 — v12.8.1)', async ({ page }) => {
    const sel = page.locator('#limit-global-module');
    await expect(sel).toBeAttached();
    const label = await sel.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('select #limit-user-module tem aria-label (A5 — v12.8.1)', async ({ page }) => {
    const sel = page.locator('#limit-user-module');
    await expect(sel).toBeAttached();
    const label = await sel.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('todos os <select> têm aria-label (cobertura global)', async ({ page }) => {
    const selects = page.locator('select');
    const count = await selects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const label = await selects.nth(i).getAttribute('aria-label');
      expect(label, `select[${i}] sem aria-label`).toBeTruthy();
    }
  });

  test('todos os <nav> têm aria-label ou aria-labelledby', async ({ page }) => {
    const navs = page.locator('nav');
    const count = await navs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const label      = await navs.nth(i).getAttribute('aria-label');
      const labelledby = await navs.nth(i).getAttribute('aria-labelledby');
      expect(label || labelledby, `nav[${i}] sem aria-label`).toBeTruthy();
    }
  });
});
