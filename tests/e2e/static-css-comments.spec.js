const { test, expect } = require('@playwright/test');
const { minifyCssComments } = require('../../scripts/minify-static-css-comments');

// Real-browser regression: JSDOM strips comments from custom-property values,
// unlike browsers. Exact token equality alone cannot protect these CSSOM APIs.
const ORIGINAL_CSS = String.raw`@charset "UTF-8";
/* Explanatory section between rules can be compacted safely. */
:root {
  --foreground: #222222;
  --background: #ffffff;
  --raw: foo/* custom value explanation */bar;
  --raw-block: { nested: [one/* nested value explanation */two]; };
  --escaped: "\26  B /* literal string */ São João";
}
/* Explanatory theme section is also a top-level comment. */
[data-theme="dark"] { --foreground: #ffffff; --background: #222222; }
@property --registered {
  syntax: "*";
  inherits: true;
  initial-value: foo/* registered initial-value explanation */bar;
}
body { margin: 0; font: 16px/1.5 system-ui; color: var(--foreground); background: var(--background); }
.probe {
  width: var(--missing, calc(1px /* fallback value explanation */ + 2px));
  height: 12px;
  color: var(--foreground);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C!--/*literal*/--%3E%3C/svg%3E");
}
@supports (--test: foo/* supports condition explanation */bar) {
  .nested { --nested: one/* nested custom value explanation */two; }
}
.nested/* selector explanation */ > span { display: inline-block; padding: 1px 2px; }
/* Explanatory final section can be compacted safely. */`;

function markup(css, theme) {
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="UTF-8"><style id="tested">${css}</style></head><body><div class="probe"></div><div class="nested"><span>São João</span></div></body></html>`;
}

async function snapshotCssom(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.querySelector('.probe');
    const probeStyle = getComputedStyle(probe);
    const nested = document.querySelector('.nested');
    const sheet = document.querySelector('#tested').sheet;
    const rules = Array.from(sheet.cssRules);
    const probeRule = rules.find((rule) => rule.selectorText === '.probe');
    const supports = rules.find((rule) => typeof rule.conditionText === 'string');
    const rectangle = probe.getBoundingClientRect();
    return {
      raw: root.getPropertyValue('--raw'),
      rawBlock: root.getPropertyValue('--raw-block'),
      escaped: root.getPropertyValue('--escaped'),
      registered: root.getPropertyValue('--registered'),
      nested: getComputedStyle(nested).getPropertyValue('--nested'),
      rawWidth: probeRule.style.getPropertyValue('width'),
      supportCondition: supports.conditionText,
      cssRules: rules.map((rule) => rule.cssText),
      width: probeStyle.width,
      color: probeStyle.color,
      background: getComputedStyle(document.body).backgroundColor,
      image: probeStyle.backgroundImage,
      box: { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height },
    };
  });
}

for (const theme of ['light', 'dark']) {
  test(`CSS comment build preserves browser CSSOM, values and geometry (${theme})`, async ({ page }) => {
    const output = minifyCssComments(ORIGINAL_CSS);
    expect(output.length).toBeLessThan(ORIGINAL_CSS.length);
    // No network fonts, external services, authentication or real-site writes.
    await page.route(/^https?:/u, (route) => route.abort());
    await page.setContent(markup(ORIGINAL_CSS, theme));
    const before = await snapshotCssom(page);
    expect(before.raw).toContain('/* custom value explanation */');
    expect(before.registered).toContain('/* registered initial-value explanation */');
    expect(before.rawWidth).toContain('/* fallback value explanation */');
    expect(before.width).toBe('3px');
    expect(before.color).toBe(theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(34, 34, 34)');
    await page.setContent(markup(output, theme));
    expect(await snapshotCssom(page)).toEqual(before);
  });
}
