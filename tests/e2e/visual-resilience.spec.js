const { test, expect } = require('@playwright/test');

test.describe('resiliência visual pública', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost:4000\/)/u, (route) => route.abort());
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    test(`consentimento mantém as três decisões dentro de ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => window.localStorage.removeItem('kc_consent_v1'));
      await page.goto('/_product.html', { waitUntil: 'domcontentloaded' });

      const banner = page.locator('#kcConsentBanner');
      const buttons = banner.locator('.kc-consent-banner__actions .kc-consent-btn');
      await expect(banner).toBeVisible();
      await expect(buttons).toHaveCount(3);

      const geometry = await banner.evaluate((element) => {
        const bannerRect = element.getBoundingClientRect();
        const actionButtons = [...element.querySelectorAll('.kc-consent-banner__actions .kc-consent-btn')];
        return {
          viewportHeight: window.innerHeight,
          banner: { top: bannerRect.top, bottom: bannerRect.bottom, height: bannerRect.height },
          buttons: actionButtons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          }),
        };
      });

      expect(geometry.banner.top).toBeGreaterThanOrEqual(0);
      expect(geometry.banner.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry.buttons).toHaveLength(3);
      geometry.buttons.forEach((button) => {
        expect(button.top).toBeGreaterThanOrEqual(geometry.banner.top);
        expect(button.bottom).toBeLessThanOrEqual(geometry.banner.bottom);
        expect(button.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
        expect(button.width).toBeGreaterThan(100);
        expect(button.height).toBeGreaterThanOrEqual(44);
      });
    });
  }

  test('Font Awesome é carregado do próprio domínio', async ({ page }) => {
    const externalRequests = [];
    page.on('request', (request) => {
      if (/font-awesome|fontawesome/i.test(request.url()) && !request.url().startsWith('http://localhost:4000/')) {
        externalRequests.push(request.url());
      }
    });
    const response = await page.goto('/_product.html', { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    const localSheet = page.locator('link[href="assets/vendor/fontawesome/css/all.min.css?v=6.4.0"]');
    await expect(localSheet).toHaveCount(1);
    const icon = page.locator('.kc-logo .fas.fa-campground');
    await expect(icon).toBeVisible();
    const iconContent = await icon.evaluate((element) => getComputedStyle(element, '::before').content);

    expect(iconContent).not.toBe('none');
    expect(iconContent).not.toBe('normal');
    expect(externalRequests).toEqual([]);
  });

  test('miniaturas preservam a arte em vez de recortá-la', async ({ page }) => {
    await page.goto('/_product.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window._KCProduct?.render?.setGallery);

    await page.evaluate(() => {
      const poster = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><rect width="800" height="480" fill="#234"/><text x="20" y="80" fill="white" font-size="60">PROCESSO SELETIVO</text></svg>',
      );
      window._KCProduct.render.setGallery({ titulo: 'Processo seletivo', imagens: [poster, poster + '#2'] });
    });

    const thumbnail = page.locator('.kc-thumbnail').first();
    await expect(thumbnail).toBeVisible();
    const presentation = await thumbnail.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { objectFit: style.objectFit, ratio: rect.width / rect.height };
    });

    expect(presentation.objectFit).toBe('contain');
    expect(presentation.ratio).toBeGreaterThan(1.3);
    expect(presentation.ratio).toBeLessThan(1.36);
  });

  test('breadcrumb não deixa chevron órfão e datas usam padrão brasileiro', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/_product.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window._KCProduct?.render?.setBreadcrumb);

    await page.evaluate(() => {
      const post = {
        modulo: 'oportunidades',
        _kcModulePage: 'oportunidades.html',
        categoria: 'Processos seletivos',
        titulo: 'PPGACV/UFG oferece 28 vagas para mestrado e doutorado',
        metadata: { applicationDeadline: '2026-09-25', data_evento: '2027-03-01' },
      };
      window._KCProduct.render.setBreadcrumb(post);
      window._KCProduct.render.setBadges(post);
      window._KCProduct.render.setSpecs(post);
    });

    const presentation = await page.locator('#breadcrumb').evaluate((element) => ({
      directChevrons: element.querySelectorAll(':scope > .fa-chevron-right').length,
      segments: [...element.querySelectorAll(':scope > .kc-breadcrumb-segment')].map((segment) => ({
        display: getComputedStyle(segment).display,
        hasChevron: !!segment.querySelector('.fa-chevron-right'),
        text: segment.textContent.trim(),
      })),
      current: element.querySelector('[aria-current="page"]')?.textContent || '',
    }));

    expect(presentation.directChevrons).toBe(0);
    expect(presentation.segments).toHaveLength(4);
    expect(presentation.segments.slice(1).every((segment) => /^(?:inline-)?flex$/u.test(segment.display) && segment.hasChevron)).toBe(true);
    expect(presentation.current).toContain('PPGACV/UFG oferece 28 vagas');
    await expect(page.locator('#badges')).toContainText('Prazo: 25/09/2026');
    await expect(page.locator('#specsGrid')).toContainText('Data do evento01/03/2027');
    await expect(page.locator('#specsGrid')).toContainText('Prazo25/09/2026');
  });

  test('cabeçalho estreito não colide e o placeholder do comentário cabe', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/_product.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window._KCProduct?.load?.applyCommentComposerSessionState);
    await page.evaluate(() => window._KCProduct.load.applyCommentComposerSessionState(null, null));

    for (const width of [320, 390, 414]) {
      await page.setViewportSize({ width, height: 568 });
      const presentation = await page.evaluate(() => {
        const logoText = document.querySelector('.kc-logo-text');
        const search = document.querySelector('#kcSearchMobileBtn');
        const input = document.querySelector('#commentAuthor');
        const logoRect = logoText?.getBoundingClientRect();
        const searchRect = search?.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context && input) context.font = getComputedStyle(input).font;
        return {
          logoVisible: !!logoText && getComputedStyle(logoText).visibility === 'visible',
          logoSearchOverlap: !!logoRect && !!searchRect && logoRect.right > searchRect.left,
          placeholder: input?.getAttribute('placeholder') || '',
          placeholderWidth: context && input ? context.measureText(input.placeholder).width : Infinity,
          inputWidth: input?.clientWidth || 0,
        };
      });

      if (presentation.logoVisible) expect(presentation.logoSearchOverlap).toBe(false);
      expect(presentation.placeholder).toBe('Seu nome (opcional)');
      expect(presentation.placeholderWidth).toBeLessThanOrEqual(presentation.inputWidth);
    }
  });
});
