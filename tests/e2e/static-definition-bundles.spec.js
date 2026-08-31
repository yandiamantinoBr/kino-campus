const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { GROUPS, wrapDefinition } = require('../../scripts/bundle-static-definition-scripts');
const { minifyJavaScript } = require('../../scripts/minify-static-javascript');
const ROOT = path.resolve(__dirname, '../..');
let sources;
let bundles;

test.beforeAll(() => {
  sources = new Map();
  bundles = GROUPS.map(group => group.files.map(file => {
    const formatted = minifyJavaScript(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
    sources.set('/' + file, formatted);
    return wrapDefinition(formatted, file);
  }).join('\n;\n'));
});

// Real current definitions, not rewritten substitutes. No application account,
// API, telemetry or third-party network participates in this semantic fixture.
function bootstrap(mode) {
  return `(() => {
    const audit = window._bundleAudit = { trace: [], snapshots: [], listeners: [], errors: [], violations: [] };
    const nativeAdd = document.addEventListener;
    function hash(value) { let result = 2166136261; for (let i=0; i<value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result,16777619); } return (result>>>0).toString(16); }
    function describe(value, seen = new Set()) {
      if (typeof value === 'function') return {name:value.name,length:value.length,sourceHash:hash(String(value)),sourceLength:String(value).length};
      if (!value || typeof value !== 'object') return value;
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      return {frozen:Object.isFrozen(value),properties:Object.fromEntries(Object.keys(value).sort().map(key=>[key,describe(value[key],seen)]))};
    }
    audit.capture = () => Object.fromEntries(['_KCU','KCSupabase','_KCAPI','_KCLA','_KCSA','_KCCreatePost','KCCompressImage'].map(key=>[key,describe(window[key])]));
    document.addEventListener = function(type,callback,options) { audit.listeners.push({type,callback:describe(callback),options}); return nativeAdd.call(this,type,callback,options); };
    document.addEventListener('securitypolicyviolation', event => audit.violations.push(event.violatedDirective));
    const failure = new Error('controlled original registration failure');
    window.addEventListener('error', event => {
      audit.trace.push('error');
      audit.errors.push({same:event.error===failure,cancelable:event.cancelable,message:event.message});
      if (${JSON.stringify(mode)} === 'prevent') event.preventDefault();
    });
    window.onerror = () => { audit.trace.push('onerror'); return ${JSON.stringify(mode)} === 'onerror'; };
    if (${JSON.stringify(mode)} !== 'success') {
      window._KCU = {};
      Object.defineProperty(window._KCU,'string',{configurable:true,set(){throw failure;}});
    }
    if (${JSON.stringify(mode)} === 'fallback') window.reportError = undefined;
    nativeAdd.call(document,'DOMContentLoaded',()=> {
      audit.trace.push('DOMContentLoaded');
      queueMicrotask(()=>audit.trace.push('DOMContentLoaded-microtask'));
      setTimeout(()=>{audit.done=true;},20);
    });
  })();`;
}

async function measure(page, candidate, mode) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    let body;
    let contentType = 'text/javascript; charset=utf-8';
    if (url.pathname === '/definition-bundle-fixture') {
      contentType = 'text/html; charset=utf-8';
      body = '<!doctype html><html><head><meta charset="utf-8"><script src="/bundle-bootstrap.js"></script></head><body><h1>Definition fixture</h1>'
        + GROUPS.map((group, index) => `<script defer src="/before-${index}.js"></script>`
          + (candidate ? `<script defer src="/bundle-${index}.js"></script>` : group.files.map(file => `<script defer src="/${file}"></script>`).join('\n'))
          + `<script defer src="/after-${index}.js"></script>`).join('\n') + '</body></html>';
    } else if (url.pathname === '/bundle-bootstrap.js') body = bootstrap(mode);
    else if (/^\/(before|after)-[0-3]\.js$/.test(url.pathname)) {
      const [, phase, index] = url.pathname.match(/^\/(before|after)-([0-3])\.js$/);
      body = `_bundleAudit.trace.push('${phase}-${index}');queueMicrotask(()=>_bundleAudit.trace.push('${phase}-${index}-microtask'));`
        + (phase === 'after' ? '_bundleAudit.snapshots.push(_bundleAudit.capture());' : '');
    } else if (/^\/bundle-[0-3]\.js$/.test(url.pathname)) body = bundles[Number(url.pathname.match(/[0-3]/)[0])];
    else body = sources.get(url.pathname);
    if (body === undefined) return route.abort('blockedbyclient');
    return route.fulfill({ contentType, body, headers: {
      'content-security-policy': "default-src 'none';script-src 'self';connect-src 'none';style-src 'none';img-src 'none';frame-src 'none';base-uri 'none'",
      'cache-control': 'no-store',
    } });
  });
  await page.goto('/definition-bundle-fixture');
  await expect.poll(() => page.evaluate(() => !!window._bundleAudit?.done)).toBe(true);
  const result = await page.evaluate(() => {
    const { trace, snapshots, listeners, errors, violations } = window._bundleAudit;
    return { trace, snapshots, listeners, errors, violations };
  });
  await page.unrouteAll({ behavior: 'wait' });
  return result;
}

for (const mode of ['success', 'normal', 'prevent', 'onerror', 'fallback']) {
  test(`home definition bundles retain exports, boundaries and error continuation: ${mode}`, async ({ page }) => {
    const original = await measure(page, false, mode);
    const bundled = await measure(page, true, mode);
    expect(original.snapshots).toHaveLength(4);
    expect(bundled.snapshots).toEqual(original.snapshots);
    expect(bundled.listeners).toEqual(original.listeners);
    expect(bundled.errors).toEqual(original.errors);
    expect(original.violations).toEqual([]);
    expect(bundled.violations).toEqual([]);
    expect(bundled.trace).toContain('after-3');
    expect(bundled.errors).toHaveLength(mode === 'success' ? 0 : 1);
    if (mode !== 'fallback') expect(bundled.trace).toEqual(original.trace);
    // Browsers without reportError deliver a thrown error in the next timer.
    // Retain the error and all definitions; do not claim identical timing.
  });
}
