'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const consentSource = fs.readFileSync(path.join(root, 'assets/js/core/kc-consent.js'), 'utf8');
const speedSource = fs.readFileSync(path.join(root, 'assets/js/boot/kc-speed-insights.js'), 'utf8');
const googleSource = fs.readFileSync(path.join(root, 'assets/js/boot/kc-google-tag.js'), 'utf8');

function createHarness() {
  const documentListeners = {};
  const windowListeners = {};
  const isolatedDocument = {
    body: document.body,
    head: document.head,
    documentElement: document.documentElement,
    readyState: 'interactive',
    title: 'KinoCampus',
    referrer: '',
    get activeElement() { return document.activeElement; },
    addEventListener(name, callback) { documentListeners[name] = callback; },
  };
  ['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByTagName', 'createElement'].forEach((name) => {
    isolatedDocument[name] = document[name].bind(document);
  });
  const isolatedWindow = {
    localStorage: window.localStorage,
    MutationObserver: window.MutationObserver,
    location: {
      origin: 'https://www.kinocampus.com.br',
      hostname: 'www.kinocampus.com.br',
      href: 'https://www.kinocampus.com.br/',
      pathname: '/',
    },
    getComputedStyle: window.getComputedStyle.bind(window),
    addEventListener(name, callback) {
      (windowListeners[name] || (windowListeners[name] = [])).push(callback);
    },
    dispatchEvent(event) {
      (windowListeners[event.type] || []).forEach((callback) => callback(event));
    },
  };
  const context = vm.createContext({
    window: isolatedWindow,
    document: isolatedDocument,
    CustomEvent,
    URL,
    console,
    setTimeout: jest.fn(),
  });
  vm.runInContext(consentSource, context);
  return {
    context,
    window: isolatedWindow,
    documentListeners,
    consent: isolatedWindow.KCConsent,
    close() {
      documentListeners.click({
        target: document.querySelector('.kc-consent-modal__close'),
        preventDefault() {},
      });
    },
  };
}

describe('consentimento antecipado sem dependências ou permissões implícitas', () => {
  let harness;

  beforeEach(() => {
    document.body.innerHTML = '<main><button id="content-action">Conteúdo</button></main><nav class="kc-mobile-nav"></nav>';
    document.body.className = '';
    window.localStorage.clear();
    harness = createHarness();
  });

  afterEach(() => {
    harness.close();
    window.localStorage.clear();
    document.body.className = '';
    document.head.querySelectorAll('#kcGoogleTagScript, script[src*="/_vercel/"]').forEach((element) => element.remove());
  });

  test('index carrega consentimento primeiro, uma única vez e antes dos coletores', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const scripts = Array.from(html.matchAll(/<script\b(?=[^>]*\bdefer\b)[^>]*\bsrc="([^"]+)"[^>]*>/g), (match) => match[1]);
    expect(scripts[0]).toBe('assets/js/core/kc-consent.js?v=8.6.5');
    expect(scripts.filter((src) => src.includes('kc-consent.js'))).toHaveLength(1);
    expect(html.indexOf('kc-consent.js')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('kc-consent.js')).toBeLessThan(html.indexOf('kc-speed-insights.js'));
    expect(html.indexOf('kc-google-tag.js')).toBeLessThan(html.indexOf('kc-telemetry.js'));
    const template = document.createElement('template');
    template.innerHTML = html;
    const closedDrawer = template.content.querySelector('#mobileMenuDrawer');
    expect(closedDrawer.getAttribute('aria-hidden')).toBe('true');
    // The early consent snapshot must already include the closed drawer's lock.
    expect(closedDrawer.hasAttribute('inert')).toBe(true);
  });

  test('defer no DOM interactive constrói a UI imediatamente, mantendo o rodapé antes da navegação', () => {
    expect(harness.documentListeners.DOMContentLoaded).toBeUndefined();
    expect(document.querySelector('#kcConsentBanner').hidden).toBe(false);
    expect(document.querySelectorAll('#kcConsentBanner button')).toHaveLength(3);
    expect(document.querySelector('#kcPlatformFooter').nextElementSibling).toBe(document.querySelector('.kc-mobile-nav'));
    expect(harness.window.KC_ENV).toBeUndefined();
    expect(harness.window.KCSupabase).toBeUndefined();
    expect(harness.window.KCOverlayLock).toBeUndefined();
    expect(harness.consent.hasConsent('necessary')).toBe(true);
    ['preferences', 'analytics', 'advertising'].forEach((category) => {
      expect(harness.consent.hasConsent(category)).toBe(false);
    });
  });

  test('cold boot e rejeição continuam sem injetar Google ou Vercel mesmo no domínio de produção', () => {
    vm.runInContext(speedSource, harness.context);
    vm.runInContext(googleSource, harness.context);
    harness.consent.rejectOptional();
    expect(document.querySelector('#kcGoogleTagScript, script[src*="/_vercel/"]')).toBeNull();
    expect(harness.window.si).toBeUndefined();
    expect(harness.window.va).toBeUndefined();
    expect(harness.window.KCGoogleTag.hasAnalyticsConsent()).toBe(false);
    const commands = harness.window.dataLayer.map((entry) => Array.from(entry));
    expect(commands).toEqual(expect.arrayContaining([
      ['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })],
    ]));
    expect(commands.some((command) => command[0] === 'event' && command[1] === 'page_view')).toBe(false);
  });

  test('libera o fallback original se KCOverlayLock surgir depois, sem liberar outro modal', () => {
    harness.consent.openPreferences();
    expect(document.body.classList.contains('kc-modal-open')).toBe(true);
    const keys = new Set(['auth-modal']);
    const lateManager = {
      lock: jest.fn((key) => keys.add(key)),
      unlock: jest.fn((key) => keys.delete(key)),
    };
    harness.window.KCOverlayLock = lateManager;
    harness.close();
    expect(document.querySelector('#kcConsentModal').hidden).toBe(true);
    expect(document.body.classList.contains('kc-modal-open')).toBe(false);
    expect(lateManager.unlock).not.toHaveBeenCalled();
    expect(Array.from(keys)).toEqual(['auth-modal']);
  });

  test('preserva um fallback previamente adquirido por outro modal', () => {
    document.body.classList.add('kc-modal-open');
    harness.consent.openPreferences();
    harness.close();
    expect(document.body.classList.contains('kc-modal-open')).toBe(true);
  });

  test('libera somente o gerenciador e a chave usados na abertura, inclusive após troca de API', () => {
    const keys = new Set(['another-modal']);
    const originalManager = {
      lock: jest.fn((key) => keys.add(key)),
      unlock: jest.fn((key) => keys.delete(key)),
    };
    harness.window.KCOverlayLock = originalManager;
    harness.consent.openPreferences();
    harness.consent.openPreferences();
    const replacementManager = { lock: jest.fn(), unlock: jest.fn() };
    harness.window.KCOverlayLock = replacementManager;
    harness.close();
    expect(originalManager.lock).toHaveBeenCalledTimes(1);
    expect(originalManager.unlock).toHaveBeenCalledWith('consent-modal');
    expect(replacementManager.unlock).not.toHaveBeenCalled();
    expect(Array.from(keys)).toEqual(['another-modal']);
  });

  test('elementos adicionados pelos próximos scripts permanecem inertes até fechar', async () => {
    harness.consent.openPreferences();
    const lateAuthModal = document.createElement('div');
    lateAuthModal.id = 'KCAuthModal';
    lateAuthModal.innerHTML = '<button>Entrar</button>';
    const alreadyInert = document.createElement('div');
    alreadyInert.setAttribute('inert', '');
    alreadyInert.inert = true;
    document.body.append(lateAuthModal, alreadyInert);
    const lateConsentSibling = document.createElement('button');
    document.querySelector('#kcConsentRoot').appendChild(lateConsentSibling);
    await Promise.resolve();
    expect(lateAuthModal.hasAttribute('inert')).toBe(true);
    expect(lateConsentSibling.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('#kcConsentModal').hasAttribute('inert')).toBe(false);
    // Removing/reinserting must not overwrite the original snapshot with our own inert value.
    lateAuthModal.remove();
    document.body.appendChild(lateAuthModal);
    await Promise.resolve();
    harness.close();
    expect(lateAuthModal.hasAttribute('inert')).toBe(false);
    expect(lateAuthModal.inert).toBe(false);
    expect(lateConsentSibling.hasAttribute('inert')).toBe(false);
    expect(alreadyInert.hasAttribute('inert')).toBe(true);
    expect(alreadyInert.inert).toBe(true);
    const afterClose = document.createElement('button');
    document.body.appendChild(afterClose);
    await Promise.resolve();
    expect(afterClose.hasAttribute('inert')).toBe(false);
  });
});
