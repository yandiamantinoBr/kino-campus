import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

await page.goto('http://localhost:4000/settings.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-search-preference-module="eventos"]', { timeout: 15000 });

const debug = await page.evaluate(async () => {
  const out = {
    hasPrefs: !!window.KCSearchPreferences,
    hasRegistrySnap: !!window.KCSearchFieldRegistrySnapshot,
    hasApi: !!(window.KCAPI && window.KCAPI.updateSearchPreferences),
  };
  try {
    const mode = document.getElementById('settingsSearchPersonalized');
    mode.checked = true;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-search-preference-module="eventos"]').checked = true;
    const topic = document.querySelector('[data-search-preference-feature="eventos:topico"][value="academicos"]');
    if (topic) topic.checked = true;
    document.getElementById('settingsSaveSearchPreferences').click();
    await new Promise((r) => setTimeout(r, 800));
    out.status = document.getElementById('settingsSearchPreferencesStatus').textContent;
    out.tone = document.getElementById('settingsSearchPreferencesStatus').dataset.tone;
    out.ls = localStorage.getItem('kc_search_preferences_v1');
    out.user = window.KCAPI && window.KCAPI.getCurrentUser
      ? await window.KCAPI.getCurrentUser().then((u) => (u && u.id ? 'logged' : 'guest')).catch((e) => 'err:' + e.message)
      : 'no-api';
  } catch (e) {
    out.evalError = e.message;
  }
  return out;
});

console.log(JSON.stringify(debug, null, 2));
await browser.close();
