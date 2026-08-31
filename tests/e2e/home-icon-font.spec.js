const { test, expect } = require('@playwright/test');
const manifest = require('../../assets/fonts/kc-ui-icons/manifest.json');

const originalFont = '/assets/vendor/fontawesome/webfonts/fa-solid-900.woff2';
const compactFont = '/assets/fonts/kc-ui-icons/' + manifest.subsetFile;
const compactCss = '/assets/css/kc-ui-icons.css';

async function mount(page, codepoints, includeCompact = true, size = 22) {
  const html = '<!doctype html><html><head><meta charset="utf-8">'
    + '<link rel="stylesheet" href="/assets/vendor/fontawesome/css/all.min.css">'
    + (includeCompact ? `<link rel="stylesheet" href="${compactCss}">` : '')
    + `<style>html,body{margin:0;padding:0;background:#fff;color:#222}.grid{display:grid;grid-template-columns:repeat(14,44px);gap:0;width:616px}i.fas{display:flex;align-items:center;justify-content:center;width:44px;height:44px;font-size:${size}px;line-height:1}</style></head><body>`
    + '<div class="grid">' + codepoints.map(point => `<i class="fas">&#${point};</i>`).join('') + '</div></body></html>';
  await page.route('**/icon-font-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('/icon-font-fixture');
  await page.locator('.grid').evaluate(node => node.getBoundingClientRect());
  await page.evaluate(() => document.fonts.ready);
}

async function changedPixels(page, before, after) {
  return page.evaluate(async ([left, right]) => {
    async function pixels(base64) {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const a = await pixels(left), b = await pixels(right);
    if (a.length !== b.length) throw new Error('Font fixture dimensions changed');
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) changed++;
    }
    return changed;
  }, [before.toString('base64'), after.toString('base64')]);
}

async function actualFont(page) {
  // CSS family alone cannot prove the intended font supplied the glyph: a
  // fallback can render the same shape. This suite runs in Chromium, so assert
  // its actual platform font in addition to exact raster comparisons.
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.fas' });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    // PostScript name is stable across DirectWrite/FreeType; familyName can
    // legitimately expose either typographic or legacy family on each OS.
    return fonts.filter(font => font.glyphCount > 0).map(font => ({ postScriptName: font.postScriptName, isCustomFont: font.isCustomFont }));
  } finally {
    await session.detach();
  }
}

for (const size of [16, 22, 32]) {
  test(`all 281 reviewed glyphs retain exact pixels at ${size}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await mount(page, manifest.codepoints, false, size);
    expect(await actualFont(page)).toEqual([{ postScriptName: 'FontAwesome6Free-Solid', isCustomFont: true }]);
    const original = await page.locator('.grid').screenshot();
    await page.addStyleTag({ url: compactCss });
    await page.evaluate(async ({ points, size }) => {
      await document.fonts.load(`900 ${size}px "Kino Campus UI Icons"`, String.fromCodePoint(...points));
    }, { points: manifest.codepoints, size });
    await expect(page.locator('.fas').first()).toHaveCSS('font-family', '"Kino Campus UI Icons"');
    expect(await actualFont(page)).toEqual([{ postScriptName: 'KinoCampusUIIcons-Solid', isCustomFont: true }]);
    const compact = await page.locator('.grid').screenshot();
    await testInfo.attach(`font-original-${size}`, { body: original, contentType: 'image/png' });
    await testInfo.attach(`font-compact-${size}`, { body: compact, contentType: 'image/png' });
    expect(await changedPixels(page, original, compact)).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const state of ['common', 'uncommon', 'subset-error', 'stylesheet-error']) {
  test(`preserves icon availability with ${state}`, async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (request.url().endsWith('.woff2')) requests.push(new URL(request.url()).pathname); });
    if (state === 'subset-error') await page.route('**' + compactFont, route => route.abort('failed'));
    if (state === 'stylesheet-error') await page.route('**' + compactCss, route => route.abort('failed'));
    const point = state === 'uncommon' ? manifest.remainderCodepoints.find(value => value >= 0xf000) : 0xf002;
    await mount(page, [point]);
    const candidate = await page.locator('.grid').screenshot();
    expect(requests.includes(originalFont)).toBe(state !== 'common');
    expect(requests.includes(compactFont)).toBe(state === 'common' || state === 'subset-error');
    await page.addStyleTag({ content: '.fas{font-family:"Font Awesome 6 Free"}' });
    await page.evaluate(async value => { await document.fonts.load('900 22px "Font Awesome 6 Free"', String.fromCodePoint(value)); }, point);
    const original = await page.locator('.grid').screenshot();
    expect(await changedPixels(page, candidate, original)).toBe(0);
  });
}

test('regular and brand families remain unchanged', async ({ page }) => {
  await mount(page, [0xf002]);
  await page.locator('.grid').evaluate(node => { node.innerHTML += '<i class="far fa-heart"></i><i class="fab fa-google"></i>'; });
  await expect(page.locator('.far')).toHaveCSS('font-family', '"Font Awesome 6 Free"');
  await expect(page.locator('.fab')).toHaveCSS('font-family', '"Font Awesome 6 Brands"');
});

test('real home requests the compact solid font once without downloading the full one', async ({ page }) => {
  const fonts = [];
  page.on('request', request => { if (request.url().endsWith('.woff2')) fonts.push(new URL(request.url()).pathname); });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
  await expect(page.locator('.kc-logo-mark .fas')).toHaveCSS('font-family', '"Kino Campus UI Icons"');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => fonts.filter(url => url === compactFont).length).toBe(1);
  expect(fonts).not.toContain(originalFont);
});
