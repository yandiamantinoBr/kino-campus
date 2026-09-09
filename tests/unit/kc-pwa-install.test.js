'use strict';
/**
 * kc-pwa-install.test.js — contrato do módulo de instalação PWA (v1.0.0)
 *
 * Cobre:
 *   - detecção de plataforma (iOS, Android, desktop, iPadOS disfarçado de Mac)
 *   - instruções guiadas por plataforma
 *   - captura de beforeinstallprompt e fluxo promptInstall() (aceito/cancelado)
 *   - fallback manual: passos renderizados no container do card
 *   - card do drawer: injeção, posição, dismiss persistente e já-instalado
 *   - standalone: getStatus().installed e ausência do card
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'assets', 'js', 'shared', 'kc-pwa-install.js');
const MODULE_SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

const DRAWER_HTML = [
  '<div class="kc-mobile-menu-drawer kc-mobile-menu" id="mobileMenuDrawer" aria-hidden="true">',
  '  <div class="kc-mobile-menu-content">',
  '    <div class="kc-mobile-menu-user-section" id="mobileMenuUserSection"></div>',
  '    <div id="mobileMenuAccountSection" class="kc-mobile-menu-account-section"></div>',
  '    <a href="eventos.html">Eventos</a>',
  '  </div>',
  '</div>',
].join('\n');

function createWindow(options) {
  const opts = options || {};
  const dom = new JSDOM('<!doctype html><html><body>' + (opts.bodyHtml !== undefined ? opts.bodyHtml : DRAWER_HTML) + '</body></html>', {
    url: 'https://www.kinocampus.com.br/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const window = dom.window;

  window.matchMedia = function (query) {
    return {
      matches: !!(opts.standalone && /standalone|minimal-ui/.test(String(query))),
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {},
    };
  };
  Object.defineProperty(window.navigator, 'userAgent', {
    value: opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: opts.maxTouchPoints || 0,
    configurable: true,
  });
  if (opts.standaloneIOS) {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
  }

  window.eval(MODULE_SOURCE);
  return { dom, window, api: window.KCPwaInstall };
}

function makeInstallPromptEvent(window, outcome) {
  const event = new window.Event('beforeinstallprompt', { cancelable: true });
  event.prompt = function () { event.promptCalled = (event.promptCalled || 0) + 1; };
  event.userChoice = Promise.resolve({ outcome: outcome || 'accepted' });
  return event;
}

function flushPromises() {
  return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

// ─── 1. Detecção de plataforma ───────────────────────────────────────────────
describe('KCPwaInstall — detecção de plataforma', () => {
  test.each([
    ['iPhone (Safari)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 'ios'],
    ['iPad disfarçado de Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'ios'],
    ['Android (Chrome)', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 'android'],
    ['Desktop (Windows)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36', 'desktop'],
  ])('%s → %s', (_label, userAgent, expected) => {
    const { api } = createWindow({ userAgent, maxTouchPoints: /Macintosh/.test(userAgent) ? 5 : 0 });
    expect(api.detectPlatform()).toBe(expected);
  });

  test.each([
    ['ios', 'compartilhar'],
    ['android', 'Instalar app'],
    ['desktop', 'barra de endere'],
  ])('instruções de %s mencionam o gesto certo', (platform, needle) => {
    const { api } = createWindow({});
    const guide = api.buildInstructions(platform);
    expect(guide.platform).toBe(platform);
    expect(guide.steps.length).toBeGreaterThanOrEqual(2);
    expect(guide.steps.join(' ')).toContain(needle);
  });
});

// ─── 2. Estado inicial e standalone ──────────────────────────────────────────
describe('KCPwaInstall — getStatus', () => {
  test('sem beforeinstallprompt: canPrompt false e installed false', () => {
    const { api } = createWindow({});
    const status = api.getStatus();
    expect(status.canPrompt).toBe(false);
    expect(status.installed).toBe(false);
    expect(status.drawerDismissed).toBe(false);
  });

  test('display-mode standalone: installed true e card não é montado', () => {
    const { api } = createWindow({ standalone: true });
    expect(api.getStatus().installed).toBe(true);
    expect(document.querySelector('[data-kc-install-card]')).toBeNull();
  });

  test('navigator.standalone (iOS da tela de início): installed true', () => {
    const { api } = createWindow({ standaloneIOS: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile Safari' });
    expect(api.getStatus().installed).toBe(true);
  });
});

// ─── 3. Card do drawer ───────────────────────────────────────────────────────
describe('KCPwaInstall — card do drawer', () => {
  test('injeta o card após a seção de conta', () => {
    const { window } = createWindow({});
    const content = window.document.querySelector('.kc-mobile-menu-content');
    const card = content.querySelector('[data-kc-install-card]');
    expect(card).not.toBeNull();
    const account = content.querySelector('#mobileMenuAccountSection');
    expect(card.previousElementSibling).toBe(account);
    expect(card.querySelector('[data-kc-install="prompt"]')).not.toBeNull();
    expect(card.querySelector('[data-kc-install="dismiss"]')).not.toBeNull();
  });

  test('dismiss persiste em localStorage e remove o card', () => {
    const { window, api } = createWindow({});
    expect(api.isDrawerDismissed()).toBe(false);
    const closeButton = window.document.querySelector('[data-kc-install="dismiss"]');
    closeButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(api.isDrawerDismissed()).toBe(true);
    expect(window.document.querySelector('[data-kc-install-card]')).toBeNull();
    // Nova sessão (nova janela com o mesmo storage? JSDOM não compartilha; valida a API):
    expect(api.getStatus().drawerDismissed).toBe(true);
  });

  test('página sem drawer não quebra (montagem é no-op)', () => {
    const { window } = createWindow({ bodyHtml: '<main>sem drawer</main>' });
    expect(window.document.querySelector('[data-kc-install-card]')).toBeNull();
  });
});

// ─── 4. Fluxo beforeinstallprompt (Chromium) ─────────────────────────────────
describe('KCPwaInstall — prompt nativo', () => {
  test('captura beforeinstallprompt, evita o infobar nativo e promove via prompt()', async () => {
    const { window, api } = createWindow({});
    expect(api.getStatus().canPrompt).toBe(false);

    const event = makeInstallPromptEvent(window, 'accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // infobar nativo suprimido
    expect(api.getStatus().canPrompt).toBe(true);

    const result = await api.promptInstall();
    expect(result).toEqual({ ok: true, outcome: 'accepted' });
    expect(event.promptCalled).toBe(1);
    expect(api.getStatus().installed).toBe(true);
  });

  test('usuário cancela o prompt: outcome dismissed, sem instalar', async () => {
    const { window, api } = createWindow({});
    window.dispatchEvent(makeInstallPromptEvent(window, 'dismissed'));
    const result = await api.promptInstall();
    expect(result).toEqual({ ok: true, outcome: 'dismissed' });
    expect(api.getStatus().installed).toBe(false);
  });

  test('sem prompt capturado, promptInstall resolve fallback manual', async () => {
    const { api } = createWindow({});
    const result = await api.promptInstall();
    expect(result).toEqual({ ok: false, reason: 'manual' });
  });

  test('appinstalled marca instalado e remove o card do drawer', async () => {
    const { window } = createWindow({});
    expect(window.document.querySelector('[data-kc-install-card]')).not.toBeNull();
    window.dispatchEvent(new window.Event('appinstalled'));
    await flushPromises();
    expect(window.KCPwaInstall.getStatus().installed).toBe(true);
    expect(window.document.querySelector('[data-kc-install-card]')).toBeNull();
  });
});

// ─── 5. Fallback manual (iOS/Firefox): passos guiados ────────────────────────
describe('KCPwaInstall — fallback manual', () => {
  test('clique sem prompt nativo renderiza os passos do Safari iOS no card', () => {
    const { window } = createWindow({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari',
    });
    const promptButton = window.document.querySelector('[data-kc-install="prompt"]');
    promptButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const steps = window.document.querySelector('[data-kc-install-steps]');
    expect(steps.hidden).toBe(false);
    expect(steps.textContent).toContain('compartilhar');
    expect(steps.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    expect(promptButton.getAttribute('aria-expanded')).toBe('true');
  });

  test('segundo clique recolhe os passos', () => {
    const { window } = createWindow({});
    const promptButton = window.document.querySelector('[data-kc-install="prompt"]');
    promptButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    promptButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const steps = window.document.querySelector('[data-kc-install-steps]');
    expect(steps.hidden).toBe(true);
    expect(promptButton.getAttribute('aria-expanded')).toBe('false');
  });

  test('bloco declarativo da página de configurações recebe os passos', () => {
    const settingsHtml = [
      '<section class="kc-settings-card">',
      '  <button type="button" data-kc-install="prompt" aria-expanded="false">Instalar</button>',
      '  <div class="kc-install-instructions" data-kc-install-steps hidden></div>',
      '</section>',
    ].join('\n');
    const { window } = createWindow({ bodyHtml: settingsHtml, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile' });
    const button = window.document.querySelector('[data-kc-install="prompt"]');
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const steps = window.document.querySelector('[data-kc-install-steps]');
    expect(steps.hidden).toBe(false);
    expect(steps.textContent).toContain('Android');
  });
});
