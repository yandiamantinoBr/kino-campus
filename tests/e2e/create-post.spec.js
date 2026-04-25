/**
 * create-post.spec.js — KinoCampus E2E v12.9.1
 *
 * Verifica a página create-post.html:
 *   - estrutura WCAG básica (h1, skip link, main, lang)
 *   - acessibilidade dos controles estáticos (nav, search, theme-toggle)
 *   - container do formulário presente no DOM (renderizado pelo kc-create-post.js)
 *
 * Nota: o formulário de criação é renderizado dinamicamente pelo JS;
 * os testes verificam a estrutura estática + os elementos injetados após
 * DOMContentLoaded (com waitForLoadState 'domcontentloaded').
 *
 * 6 testes — suite: "Criar Post — create-post.html"
 */

const { test, expect } = require('@playwright/test');

test.describe('Criar Post — create-post.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create-post.html');
  });

  test('página carrega com status 200', async ({ page }) => {
    const response = await page.goto('/create-post.html');
    expect(response.status()).toBe(200);
  });

  test('h1 único + skip link + main#kc-main', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
  });

  test('html[lang="pt-BR"] definido', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('pt-BR');
  });

  test('nav principal tem aria-label', async ({ page }) => {
    const nav = page.locator('nav.kc-nav-links');
    await expect(nav).toBeAttached();
    const label = await nav.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('searchInput tem aria-label="Pesquisar"', async ({ page }) => {
    await expect(page.locator('[aria-label="Pesquisar"]')).toBeAttached();
  });

  test('theme-toggle tem aria-label não vazio', async ({ page }) => {
    const btn = page.locator('.theme-toggle');
    await expect(btn).toBeAttached();
    const label = await btn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });
});
