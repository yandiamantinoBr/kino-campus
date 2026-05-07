'use strict';

function loadConsentModule() {
  delete window.KCConsent;
  delete require.cache[require.resolve('../../assets/js/core/kc-consent.js')];
  require('../../assets/js/core/kc-consent.js');
  if (!document.querySelector('#kcConsentRoot')) {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
}

describe('kc-consent.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  test('exibe banner inicial, grava consentimento e reabre preferencias', () => {
    loadConsentModule();

    const banner = document.querySelector('#kcConsentBanner');
    expect(banner).toBeTruthy();
    expect(banner.hidden).toBe(false);
    expect(window.KCConsent.hasConsent('analytics')).toBe(false);

    document.querySelector('[data-consent-accept]').click();
    const stored = JSON.parse(window.localStorage.getItem('kc_consent_v1'));
    expect(stored).toMatchObject({
      necessary: true,
      preferences: true,
      analytics: true,
      source: 'accept_all',
    });
    expect(window.KCConsent.hasConsent('analytics')).toBe(true);
    expect(banner.hidden).toBe(true);

    window.KCConsent.rejectOptional('reject_optional');
    expect(window.KCConsent.hasConsent('preferences')).toBe(false);
    expect(window.KCConsent.hasConsent('analytics')).toBe(false);

    window.KCConsent.openPreferences();

    const modal = document.querySelector('#kcConsentModal');
    expect(modal).toBeTruthy();
    expect(modal.hidden).toBe(false);
  });
});
