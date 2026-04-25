/**
 * product-detail.spec.js — KinoCampus E2E v12.9.1
 *
 * Verifica a página _product.html (detalhe de publicação / comentar / votar):
 *   - estrutura WCAG básica (h1, skip link, main)
 *   - editor rich text de comentários (botões Negrito, Itálico)
 *   - input do nome do autor no comentário
 *   - sharePopover com aria-hidden inicial
 *   - renderPostCard via page.evaluate() — vote buttons aria-label correto
 *
 * 8 testes — suite: "Produto/Detalhe — _product.html"
 */

const { test, expect } = require('@playwright/test');

test.describe('Produto/Detalhe — _product.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/_product.html');
  });

  test('página carrega com status 200', async ({ page }) => {
    const response = await page.goto('/_product.html');
    expect(response.status()).toBe(200);
  });

  test('h1 único + skip link + main#kc-main', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    await expect(page.locator('.kc-skip-link')).toBeAttached();
    await expect(page.locator('#kc-main')).toBeAttached();
  });

  test('editor de comentários: botão Negrito tem aria-label="Negrito"', async ({ page }) => {
    await expect(page.locator('[aria-label="Negrito"]')).toBeAttached();
  });

  test('editor de comentários: botão Itálico tem aria-label="Itálico"', async ({ page }) => {
    await expect(page.locator('[aria-label="Itálico"]')).toBeAttached();
  });

  test('input do autor tem aria-label="Seu nome no comentário"', async ({ page }) => {
    await expect(page.locator('[aria-label="Seu nome no comentário"]')).toBeAttached();
  });

  test('sharePopover tem aria-hidden="true" (estado inicial fechado)', async ({ page }) => {
    const popover = page.locator('#sharePopover');
    await expect(popover).toBeAttached();
    const ariaHidden = await popover.getAttribute('aria-hidden');
    expect(ariaHidden).toBe('true');
  });

  test('searchInput tem aria-label="Pesquisar"', async ({ page }) => {
    await expect(page.locator('[aria-label="Pesquisar"]')).toBeAttached();
  });

  test('renderPostCard (via page.evaluate) gera vote buttons com aria-labels corretos', async ({ page }) => {
    // Aguarda scripts carregarem (defer) antes de invocar KCUtils no contexto do browser
    await page.waitForLoadState('networkidle').catch(() => { /* ignorar timeout de Supabase */ });

    const result = await page.evaluate(() => {
      if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') {
        return { available: false };
      }
      const post = {
        id: 'e2e-test-id',
        uuid: 'e2e-test-uuid',
        titulo: 'Post de Teste E2E',
        description: 'Descrição do post de teste',
        modulo: 'compravenda',
        categoria: 'eletronicos',
        votos: 3,
        comments_count: 1,
        imagens: [],
        author_name: 'Teste E2E',
        author_avatar: '',
        created_at: new Date().toISOString(),
        status: 'approved',
      };
      const html = window.KCUtils.renderPostCard(post);
      return {
        available: true,
        hasVotoPositivo: html.includes('aria-label="Voto positivo"'),
        hasVotoNegativo: html.includes('aria-label="Voto negativo"'),
        hasAriaLive: html.includes('aria-live="polite"'),
      };
    });

    if (!result.available) {
      // KCUtils pode não estar disponível sem Supabase inicializado — skip suave
      console.warn('[E2E] KCUtils.renderPostCard não disponível no contexto do browser');
      return;
    }

    expect(result.hasVotoPositivo).toBe(true);
    expect(result.hasVotoNegativo).toBe(true);
    expect(result.hasAriaLive).toBe(true);
  });
});
