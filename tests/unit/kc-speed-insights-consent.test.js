'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'assets', 'js', 'boot', 'kc-speed-insights.js'),
  'utf8'
);

function bootTelemetry(hasAnalyticsConsent) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://www.kinocampus.com.br/oportunidades.html',
  });
  const { window } = dom;
  if (typeof hasAnalyticsConsent === 'boolean') {
    window.KCConsent = { hasConsent: () => hasAnalyticsConsent };
  }
  window.eval(SOURCE);
  return window;
}

describe('kc-speed-insights — consentimento', () => {
  test('não injeta telemetria antes do consentimento e injeta uma única vez após aceite', () => {
    const window = bootTelemetry();

    expect(window.document.head.querySelectorAll('script[src]').length).toBe(0);

    window.KCConsent = { hasConsent: () => true };
    window.dispatchEvent(new window.CustomEvent('kc:consentchange', {
      detail: { preferences: { analytics: true } },
    }));

    const firstInjection = Array.from(window.document.head.querySelectorAll('script[src]'))
      .map((script) => script.getAttribute('src'));
    expect(firstInjection).toEqual([
      '/_vercel/speed-insights/script.js',
      '/_vercel/insights/script.js',
    ]);

    window.dispatchEvent(new window.CustomEvent('kc:consentchange', {
      detail: { preferences: { analytics: true } },
    }));
    expect(window.document.head.querySelectorAll('script[src]').length).toBe(2);
  });

  test('consentimento ausente ou recusado não cria conexões de métricas', () => {
    expect(bootTelemetry(false).document.head.querySelectorAll('script[src]').length).toBe(0);
  });
});
