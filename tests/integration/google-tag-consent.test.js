'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const manifest = require('../../scripts/admin-pages.manifest');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('Google tag e consentimento LGPD', () => {
  test('todas as paginas carregam Google tag depois do consentimento e antes da telemetria', () => {
    manifest.ALL_HTML_PAGES.forEach((file) => {
      const html = read(file);
      const consent = html.indexOf('kc-consent.js');
      const googleTag = html.indexOf('kc-google-tag.js');
      const telemetry = html.indexOf('kc-telemetry.js');

      expect(consent).toBeGreaterThan(-1);
      expect(googleTag).toBeGreaterThan(consent);
      expect(telemetry).toBeGreaterThan(googleTag);
    });
  });

  test('CSP permite Google Tag Manager e GA4', () => {
    const vercel = read('vercel.json');

    expect(vercel).toContain('https://www.googletagmanager.com');
    expect(vercel).toContain('https://www.google-analytics.com');
    expect(vercel).toContain('https://region1.google-analytics.com');
  });

  test('script usa Consent Mode negado por padrao e libera analytics/publicidade por KCConsent', () => {
    const source = read('assets/js/boot/kc-google-tag.js');

    expect(source).toContain("MEASUREMENT_ID = 'G-P9RKYHPB7Z'");
    expect(source).toContain("window.gtag('consent', 'default', consentPayload(false, false));");
    expect(source).toContain("gtag('consent', 'update', consentPayload(analyticsGranted, advertisingGranted));");
    expect(source).toContain("window.KCConsent.hasConsent('analytics')");
    expect(source).toContain("window.KCConsent.hasConsent('advertising')");
    expect(source).toContain("ad_storage: advertisingGranted ? 'granted' : 'denied'");
    expect(source).toContain("ad_user_data: 'denied'");
    expect(source).toContain("ad_personalization: 'denied'");
  });

  test('runtime nao configura page_view quando analytics esta negado', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    const listeners = {};
    const context = {
      window: {
        dataLayer: [],
        KCConsent: { hasConsent: () => false },
        addEventListener: (name, handler) => { listeners[name] = handler; },
      },
      document: {
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
        head: { appendChild: () => {} },
      },
      encodeURIComponent,
      Date,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);

    expect(calls.some((call) => call[0] === 'consent' && call[1] === 'default')).toBe(true);
    expect(calls.some((call) => call[0] === 'config')).toBe(false);
    expect(context.window.KCGoogleTag.hasAnalyticsConsent()).toBe(false);
  });
});
