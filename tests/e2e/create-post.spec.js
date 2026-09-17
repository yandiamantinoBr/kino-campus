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

const LEGACY_SUPABASE_POST = Object.freeze({
  id: 'c843fa56-ded9-4b9b-a982-0257313f343d',
  module: 'oportunidades',
  category: 'concursos',
  title: 'Concurso Público de teste',
  description: 'Registro sintético de compatibilidade.',
  metadata: {
    tags: ['Direito', 'Concursos', 'UFG', 'institutoverbena', 'Presencial'],
    tagKeys: ['direito', 'concursos', 'ufg', 'institutoverbena', 'presencial'],
  },
});

async function openNormalizedLegacyEditor(page) {
  await page.waitForFunction(() => (
    typeof window.kcOpenEditPostModal === 'function'
    && !!(window.KCAPI && typeof window.KCAPI.normalizePost === 'function')
  ));
  await page.evaluate((rawLegacyPost) => {
    // Exercita o caminho real do Supabase/My Posts: o normalizador cria
    // userTags top-level vazias para um registro que ainda só tem metadata.tags.
    window.kcOpenEditPostModal(window.KCAPI.normalizePost(rawLegacyPost));
  }, LEGACY_SUPABASE_POST);
}

async function expectLegacyTagsInEditor(page) {
  const tagsField = page.locator('[data-kc-user-tags-field]');
  await expect(tagsField).toBeVisible();
  await expect(tagsField.getByRole('button', { name: 'Remover Direito' })).toBeVisible();
  await expect(tagsField.getByRole('button', { name: 'Remover institutoverbena' })).toBeVisible();
  await expect(tagsField.locator('[data-kc-user-tags-value]')).toHaveValue(JSON.stringify([
    'Direito', 'Concursos', 'UFG', 'institutoverbena', 'Presencial',
  ]));
  await expect(tagsField.locator('.kc-field-hint')).toContainText('(5/6)');
}

async function dismissOptionalCookies(page) {
  const rejectOptionalCookies = page.getByRole('button', { name: 'Rejeitar opcionais' });
  if (await rejectOptionalCookies.isVisible()) await rejectOptionalCookies.click();
}

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

test.describe('Criar Post - gatilhos globais', () => {
  test('botao Criar Publicacao da home abre modal sem navegar para fallback', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.kc-create-post-btn').click();

    await expect(page).not.toHaveURL(/create-post\.html/);
    await expect(page.locator('#kcCreatePostModalOverlay.active')).toBeVisible();
    await expect(page.locator('#kcCreateModalTitle')).toContainText('Nova Publicação');
  });

  test('Tags adicionais cria chips pesquisáveis sem misturar a taxonomia do módulo', async ({ page }) => {
    await page.goto('/create-post.html');
    await page.getByRole('button', { name: /Eventos/ }).click();

    const tagsField = page.locator('[data-kc-user-tags-field]');
    await expect(tagsField).toBeVisible();
    await tagsField.locator('[data-kc-user-tags-input]').fill('Acessibilidade, Material aberto');
    await tagsField.getByRole('button', { name: 'Adicionar', exact: true }).click();

    await expect(tagsField.getByRole('button', { name: 'Remover Acessibilidade' })).toBeVisible();
    await expect(tagsField.getByRole('button', { name: 'Remover Material aberto' })).toBeVisible();
    await expect(tagsField.locator('.kc-field-hint')).toContainText('(2/6)');
  });

  test('atalho kc-create-btn em viewport mobile abre o mesmo campo Tags', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await dismissOptionalCookies(page);
    await page.locator('.kc-create-btn').first().click();

    await expect(page).not.toHaveURL(/create-post\.html/);
    await expect(page.locator('#kcCreatePostModalOverlay.active')).toBeVisible();
    await page.getByRole('button', { name: /Eventos/ }).click();
    await expect(page.locator('[data-kc-user-tags-field]')).toBeVisible();
  });

  test('Tags legadas do Supabase preenchem o editor sem apagar a superfície antiga', async ({ page }) => {
    await page.goto('/index.html');
    await openNormalizedLegacyEditor(page);
    await expectLegacyTagsInEditor(page);
  });

  test('My Posts também abre Tags legadas no mesmo kc-create-modal', async ({ page }) => {
    await page.goto('/my-posts.html');
    await openNormalizedLegacyEditor(page);
    await expectLegacyTagsInEditor(page);
  });
});
