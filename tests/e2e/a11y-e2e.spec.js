/**
 * a11y-e2e.spec.js — KinoCampus E2E v12.9.0
 *
 * Verifica atributos WCAG 2.1 AA no DOM vivo do index.html:
 *   - lang="pt-BR"
 *   - todos os <nav> com aria-label
 *   - theme-toggle com aria-label
 *   - searchInput com aria-label
 *   - skip link é o primeiro elemento focável (Tab)
 *   - carousel prev/next com aria-label
 *   - kc-ranking-info-btn com aria-label
 *
 * 7 testes — suite: "a11y E2E — index.html (DOM vivo)"
 */

const { test, expect } = require('@playwright/test');

test.describe('a11y E2E — index.html (DOM vivo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('html[lang="pt-BR"] definido', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('pt-BR');
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

  test('theme-toggle (.theme-toggle) tem aria-label não vazio', async ({ page }) => {
    // O JS atualiza o aria-label dinamicamente conforme o tema ativo
    // ("Ativar tema escuro" / "Ativar tema claro") — verificamos que existe e não é vazio
    const btn = page.locator('.theme-toggle');
    await expect(btn).toBeAttached();
    const label = await btn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('searchInput tem aria-label="Pesquisar"', async ({ page }) => {
    await expect(page.locator('[aria-label="Pesquisar"]')).toBeAttached();
  });

  test('skip link é o primeiro elemento focável (Tab)', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
    expect(focusedClass).toContain('kc-skip-link');
  });

  test('carousel prev/next têm aria-label', async ({ page }) => {
    await expect(page.locator('[aria-label="Slide anterior"]')).toBeAttached();
    await expect(page.locator('[aria-label="Próximo slide"]')).toBeAttached();
  });

  test('kc-ranking-info-btn tem aria-label', async ({ page }) => {
    const btn = page.locator('.kc-ranking-info-btn');
    await expect(btn).toBeAttached();
    const label = await btn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });
});
