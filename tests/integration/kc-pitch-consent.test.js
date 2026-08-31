const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.resolve(__dirname, '../../apresentacao-institucional.html'), 'utf8');

describe('institutional pitch telemetry integration', () => {
  test('uses exactly one shared consent-gated boot and no direct telemetry script', () => {
    const document = new DOMParser().parseFromString(page, 'text/html');
    const scripts = [...document.querySelectorAll('script[src]')];
    expect(scripts.filter((script) => /\/_vercel\/(?:insights|speed-insights)\//.test(script.getAttribute('src')))).toHaveLength(0);
    const boot = scripts.filter((script) => script.getAttribute('src').split('?')[0] === 'assets/js/boot/kc-speed-insights.js');
    expect(boot).toHaveLength(1);
    expect(boot[0].defer).toBe(true);
    const consentIndex = scripts.findIndex((script) => script.getAttribute('src').startsWith('assets/js/core/kc-consent.js?'));
    expect(consentIndex).toBeGreaterThanOrEqual(0);
    // Defer scripts run while readyState is interactive. The shared telemetry
    // boot must see KCConsent immediately, including a previously stored grant.
    expect(scripts.indexOf(boot[0])).toBe(consentIndex + 1);
  });

  test('preserves accessible frame, layout stylesheet and host controls', () => {
    const document = new DOMParser().parseFromString(page, 'text/html');
    const frame = document.querySelector('#kc-pitch-frame');
    expect(frame.title).toBe('Apresentação institucional interativa do KinoCampus');
    expect(frame.hasAttribute('allowfullscreen')).toBe(true);
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(document.querySelectorAll('[data-kc-pitch-fullscreen]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-kc-pitch-direct]')).toHaveLength(2);
    expect(document.querySelector('link[href^="assets/css/kc-pitch-host.css?"]')).not.toBeNull();
    expect(document.querySelector('script[src^="assets/js/features/kc-pitch-host.js?"]')).not.toBeNull();
  });
});
