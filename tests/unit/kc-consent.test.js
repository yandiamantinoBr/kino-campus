'use strict';

function loadConsentModule() {
  delete window.KCConsent;
  jest.resetModules();
  require('../../assets/js/core/kc-consent.js');
  if (!document.querySelector('#kcConsentRoot')) {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
}

describe('kc-consent.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="main-content"><button id="main-action">Conteúdo</button></main>';
    window.localStorage.clear();
  });

  test('usa glifo local visível no botão de fechar preferências', () => {
    loadConsentModule();

    expect(document.querySelector('.kc-consent-modal__close-glyph')?.textContent).toBe('×');
    expect(document.querySelector('.kc-consent-modal__close .fas')).toBeNull();
  });

  test('prende o foco, torna o fundo inerte e restaura o gatilho ao fechar', () => {
    const outside = document.createElement('button');
    outside.id = 'outside';
    document.body.appendChild(outside);
    loadConsentModule();

    const trigger = document.querySelector('[data-consent-config]');
    trigger.focus();
    trigger.click();

    const modal = document.querySelector('#kcConsentModal');
    const close = modal.querySelector('.kc-consent-modal__close');
    const save = modal.querySelector('[data-consent-save]');
    expect(outside.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('#kcConsentBanner').hasAttribute('inert')).toBe(true);

    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(save);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.hidden).toBe(true);
    expect(outside.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('#kcConsentBanner').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(trigger);
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
      advertising: true,
      source: 'accept_all',
    });
    expect(window.KCConsent.hasConsent('analytics')).toBe(true);
    expect(window.KCConsent.hasConsent('advertising')).toBe(true);
    expect(banner.hidden).toBe(true);

    window.KCConsent.rejectOptional('reject_optional');
    expect(window.KCConsent.hasConsent('preferences')).toBe(false);
    expect(window.KCConsent.hasConsent('analytics')).toBe(false);
    expect(window.KCConsent.hasConsent('advertising')).toBe(false);

    window.KCConsent.openPreferences();

    const modal = document.querySelector('#kcConsentModal');
    expect(modal).toBeTruthy();
    expect(modal.hidden).toBe(false);
  });

  test('move o foco para o conteúdo quando uma decisão oculta o banner', () => {
    loadConsentModule();

    const reject = document.querySelector('#kcConsentBanner [data-consent-reject]');
    reject.focus();
    reject.click();

    expect(document.querySelector('#kcConsentBanner').hidden).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  test('move o foco para o conteúdo ao salvar quando o gatilho também fica oculto', () => {
    loadConsentModule();

    const configure = document.querySelector('[data-consent-config]');
    configure.focus();
    configure.click();
    document.querySelector('[data-consent-save]').click();

    expect(document.querySelector('#kcConsentModal').hidden).toBe(true);
    expect(document.querySelector('#kcConsentBanner').hidden).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('main'));
  });
});
