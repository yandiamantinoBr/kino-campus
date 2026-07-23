'use strict';

const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto('http://127.0.0.1:4174/tmp/pdf-export-qa.html', { waitUntil: 'networkidle' });
  const downloadPromise = page.waitForEvent('download');
  await page.click('#run');
  const download = await downloadPromise;
  const target = path.resolve(__dirname, 'admin-dashboard-final-qa.pdf');
  await download.saveAs(target);
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'concluído');
  console.log(JSON.stringify({
    target,
    suggestedFilename: download.suggestedFilename(),
    status: await page.textContent('#status'),
    errors
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
