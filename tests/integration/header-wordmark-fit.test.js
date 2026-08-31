'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const WIDGETS_PATH = path.resolve(__dirname, '../../assets/js/core/kc-core-widgets.js');
const VISIBLE_CLASS = 'kc-logo--wordmark-visible';

describe('wordmark do cabeçalho — espaço disponível real', () => {
  const windows = [];

  function bootHeader(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><body${options.shellPage ? ' class="kc-shell-page"' : ''}>
      <header class="kc-header${options.admin ? ' kc-header--admin' : ''}">
        <div class="kc-header-container">
          <div class="kc-logo"><a href="/" aria-label="KinoCampus — Comunidade UFG" style="column-gap:12px">
            <span class="kc-logo-mark" aria-hidden="true">K</span>
            <span class="kc-logo-text" style="display:flex"><span class="kc-logo-name">KinoCampus</span></span>
          </a></div>
          <button class="kc-search-mobile-btn" aria-label="Buscar"></button>
          <div class="kc-user-actions"><button class="kc-notif-bell" style="display:none"></button>
            <a class="icon-btn kc-chat-shortcut" href="mensagens.html" aria-label="Mensagens"></a>
            <a class="btn-login" href="#login">Login/Cadastro</a>
          </div>
        </div>
      </header>
    </body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://www.kinocampus.com.br/oportunidades.html',
    });
    const { window } = dom;
    windows.push(window);
    const { document } = window;
    const logo = document.querySelector('.kc-logo');
    const mark = logo.querySelector('.kc-logo-mark');
    const text = logo.querySelector('.kc-logo-text');
    const link = logo.querySelector('a');
    const state = {
      viewport: options.viewport ?? 390,
      available: options.available ?? 180,
      markWidth: options.markWidth ?? 44,
      textWidth: options.textWidth ?? 100,
      logoReads: 0,
    };

    // JSDOM does not lay out media queries. Supply the three independent
    // measurements used by the runtime; browser tests own the actual CSS fit.
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => state.viewport });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => state.viewport });
    Object.defineProperty(logo, 'clientWidth', {
      configurable: true,
      get: () => { state.logoReads += 1; return state.available; },
    });
    Object.defineProperty(mark, 'offsetWidth', { configurable: true, get: () => state.markWidth });
    Object.defineProperty(text, 'offsetWidth', { configurable: true, get: () => state.textWidth });

    let frameId = 0;
    const frames = new Map();
    window.requestAnimationFrame = jest.fn((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    window.cancelAnimationFrame = jest.fn((id) => frames.delete(id));
    function flushFrames() {
      for (let count = 0; frames.size && count < 10; count += 1) {
        const pending = Array.from(frames.values());
        frames.clear();
        pending.forEach((callback) => callback(16));
      }
      if (frames.size) throw new Error('Wordmark scheduling did not settle within 10 frames');
    }

    const observers = [];
    window.ResizeObserver = options.resizeObserver === false ? undefined : class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.targets = new Set();
        this.observe = jest.fn((target) => this.targets.add(target));
        this.unobserve = jest.fn((target) => this.targets.delete(target));
        this.disconnect = jest.fn(() => this.targets.clear());
        observers.push(this);
      }
    };
    function notifyResize(...targets) {
      const matching = observers.filter((observer) => targets.some((target) => observer.targets.has(target)));
      expect(matching.length).toBeGreaterThan(0);
      matching.forEach((observer) => observer.callback(
        targets.filter((target) => observer.targets.has(target)).map((target) => ({ target })),
        observer,
      ));
    }

    let resolveFontsReady;
    const fonts = new window.EventTarget();
    fonts.ready = new Promise((resolve) => { resolveFontsReady = resolve; });
    fonts.addEventListener = jest.fn(fonts.addEventListener.bind(fonts));
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });

    // Evaluate the real widgets module without the unrelated core bootstrap.
    // Exercise the same public export invoked by core's DOMContentLoaded hook.
    document.addEventListener = jest.fn(document.addEventListener.bind(document));
    window.addEventListener = jest.fn(window.addEventListener.bind(window));
    window.eval(fs.readFileSync(WIDGETS_PATH, 'utf8'));
    expect(typeof window.KCCore.initHeaderWordmarkFit).toBe('function');
    expect(window.kcInitHeaderWordmarkFit).toBeUndefined();
    if (options.beforeInit) options.beforeInit({ window, document, logo, mark, text, link, state });

    const init = () => window.KCCore.initHeaderWordmarkFit();
    const visible = () => logo.classList.contains(VISIBLE_CLASS);
    const resize = (width) => {
      if (width !== undefined) state.viewport = width;
      window.dispatchEvent(new window.Event('resize'));
    };
    const profileChange = () => document.dispatchEvent(new window.CustomEvent('kc:profilechange'));
    const fontsLoaded = () => fonts.dispatchEvent(new window.Event('loadingdone'));
    init();
    flushFrames();

    return {
      window, document, logo, mark, text, link, state, frames, observers, fonts,
      init, visible, resize, profileChange, fontsLoaded, resolveFontsReady, notifyResize, flushFrames,
    };
  }

  function bootFlexHeader(options = {}) {
    let flex;
    const header = bootHeader({
      viewport: 577,
      markWidth: 38,
      textWidth: 100,
      beforeInit({ window, document, logo, link, state }) {
        const container = logo.parentElement;
        container.style.display = 'flex';
        link.style.columnGap = '8px';
        const nav = document.createElement('nav');
        nav.className = 'kc-nav-links';
        nav.style.cssText = 'display:flex;flex:1 1 0;min-width:0;overflow-x:auto';
        nav.innerHTML = '<a href="eventos.html">Eventos</a><a href="moradia.html">Moradia</a>';
        container.insertBefore(nav, logo.nextSibling);
        const items = Array.from(nav.querySelectorAll('a'));
        const itemWidths = options.itemWidths || [32, 36];
        items.forEach((item, index) => {
          Object.defineProperty(item, 'offsetWidth', { configurable: true, get: () => itemWidths[index] });
        });
        if (options.itemMargins) items[1].style.cssText = options.itemMargins;

        flex = { container, nav, items, pool: options.pool ?? 191.25 };
        flex.widths = () => {
          // Real flex redistribution: revealing the wordmark takes exactly
          // that width from nav; the total allocation stays independent of state.
          const logoWidth = logo.classList.contains(VISIBLE_CLASS)
            ? state.markWidth + state.textWidth + 8 + 0.25
            : state.markWidth;
          return { logo: logoWidth, nav: Math.max(0, flex.pool - logoWidth) };
        };
        const rect = (width) => new window.DOMRect(0, 0, width, 38);
        Object.defineProperty(logo, 'clientWidth', {
          configurable: true,
          get: () => { state.logoReads += 1; return Math.round(flex.widths().logo); },
        });
        Object.defineProperty(nav, 'clientWidth', { configurable: true, get: () => Math.round(flex.widths().nav) });
        logo.getBoundingClientRect = jest.fn(() => rect(flex.widths().logo));
        nav.getBoundingClientRect = jest.fn(() => rect(flex.widths().nav));
        flex.wrapNav = () => {
          const rail = document.createElement('div');
          rail.className = 'kc-scroll-rail kc-scroll-rail--nav';
          rail.setAttribute('data-kc-scroll-rail', '');
          rail.style.display = 'flex';
          Object.defineProperty(rail, 'clientWidth', { configurable: true, get: () => Math.round(flex.widths().nav) });
          rail.getBoundingClientRect = jest.fn(() => rect(flex.widths().nav));
          container.insertBefore(rail, nav);
          rail.appendChild(nav);
          return rail;
        };
      },
    });
    return { ...header, flex };
  }

  afterEach(() => {
    windows.splice(0).forEach((window) => window.close());
  });

  test.each([[155, false], [156, false], [157, true], [180, true]])(
    'reserva 1px além da marca, texto e gap: coluna %ipx, texto visível=%s',
    (available, expected) => {
      const header = bootHeader({ available });
      expect(header.visible()).toBe(expected);
      expect(header.text.style.display).not.toBe('none');
      expect(header.text.hidden).toBe(false);
      expect(header.link.getAttribute('aria-label')).toBe('KinoCampus — Comunidade UFG');
    },
  );

  test.each([false, true])('funciona no cabeçalho público com kc-shell-page=%s', (shellPage) => {
    const header = bootHeader({ shellPage, available: 180 });
    expect(header.visible()).toBe(true);
    const observed = header.observers.flatMap((observer) => Array.from(observer.targets));
    expect(observed).toEqual(expect.arrayContaining([header.logo, header.mark, header.text]));
  });

  test('acompanha espaço móvel e limpa o estado ao cruzar 768/769px, inclusive na volta', () => {
    const header = bootHeader({ viewport: 768, available: 180 });
    expect(header.visible()).toBe(true);

    header.state.available = 110;
    header.resize(390);
    header.flushFrames();
    expect(header.visible()).toBe(false);

    header.state.available = 180;
    header.resize(768);
    header.flushFrames();
    expect(header.visible()).toBe(true);

    header.resize(769);
    header.flushFrames();
    expect(header.visible()).toBe(false);
    expect(header.text.style.display).not.toBe('none');
    expect(header.text.hidden).toBe(false);

    header.resize(390);
    header.flushFrames();
    expect(header.visible()).toBe(true);
  });

  test('reage à autenticação/controles que alteram somente a coluna livre, sem resize da janela', () => {
    const header = bootHeader({ available: 180 });
    expect(header.visible()).toBe(true);

    header.document.querySelector('.kc-notif-bell').style.display = 'inline-flex';
    header.document.querySelector('.btn-login').classList.add('is-auth');
    header.state.available = 120;
    header.notifyResize(header.logo);
    header.flushFrames();
    expect(header.visible()).toBe(false);
    expect(header.window.innerWidth).toBe(390);

    header.state.available = 180;
    header.notifyResize(header.logo);
    header.flushFrames();
    expect(header.visible()).toBe(true);
  });

  test('reconsidera a largura do texto oculto e da marca, sem depender da largura dos controles', () => {
    const header = bootHeader({ available: 180 });
    header.state.textWidth = 150;
    header.notifyResize(header.text);
    header.flushFrames();
    expect(header.visible()).toBe(false);

    // Hidden text remains measurable; reducing it must make the logo eligible again.
    header.state.textWidth = 100;
    header.notifyResize(header.text);
    header.flushFrames();
    expect(header.visible()).toBe(true);

    header.state.markWidth = 80;
    header.notifyResize(header.mark);
    header.flushFrames();
    expect(header.visible()).toBe(false);

    header.state.markWidth = 44;
    header.link.style.columnGap = '40px';
    header.resize();
    header.flushFrames();
    expect(header.visible()).toBe(false);
  });

  test('reavalia quando fonts.ready resolve e depois em loadingdone', async () => {
    const header = bootHeader({ available: 180 });
    expect(header.visible()).toBe(true);
    header.state.textWidth = 150;
    header.resolveFontsReady(header.fonts);
    await Promise.resolve();
    header.flushFrames();
    expect(header.visible()).toBe(false);

    header.state.textWidth = 100;
    header.fontsLoaded();
    header.flushFrames();
    expect(header.visible()).toBe(true);
  });

  test('agrupa observer, resize, perfil e fontes em uma única medição por frame', () => {
    const header = bootHeader({ available: 180 });
    const readsBefore = header.state.logoReads;
    header.state.available = 120;
    header.notifyResize(header.logo, header.text);
    header.notifyResize(header.mark);
    header.resize();
    header.profileChange();
    header.fontsLoaded();

    expect(header.state.logoReads).toBe(readsBefore);
    expect(header.frames.size).toBe(1);
    header.flushFrames();
    expect(header.state.logoReads).toBe(readsBefore + 1);
    expect(header.visible()).toBe(false);
  });

  test('init repetido não duplica observadores, listeners nem reinicializa o estado', () => {
    const header = bootHeader({ available: 180 });
    const observerCount = header.observers.length;
    const countListeners = () => ({
      resize: header.window.addEventListener.mock.calls.filter(([type]) => type === 'resize').length,
      profile: header.document.addEventListener.mock.calls.filter(([type]) => type === 'kc:profilechange').length,
      fonts: header.fonts.addEventListener.mock.calls.filter(([type]) => type === 'loadingdone').length,
    });
    const listenersBefore = countListeners();
    expect(observerCount).toBe(1);
    expect(listenersBefore).toEqual({ resize: 1, profile: 1, fonts: 1 });
    expect(header.logo.dataset.kcWordmarkFitBound).toBe('1');

    header.init();
    header.init();
    header.flushFrames();
    expect(header.observers).toHaveLength(observerCount);
    expect(countListeners()).toEqual(listenersBefore);
    expect(header.visible()).toBe(true);

    header.state.available = 120;
    header.notifyResize(header.logo);
    header.flushFrames();
    expect(header.visible()).toBe(false);
  });

  test('desktop não ganha a classe mobile e volta a medir quando entra no mobile', () => {
    const header = bootHeader({ viewport: 1280, available: 20 });
    expect(header.visible()).toBe(false);
    expect(header.text.style.display).not.toBe('none');
    expect(header.text.hidden).toBe(false);

    header.state.available = 180;
    header.resize(390);
    header.flushFrames();
    expect(header.visible()).toBe(true);
  });

  test('não observa nem altera o logo do cabeçalho administrativo', () => {
    const header = bootHeader({ admin: true, available: 180 });
    const observed = header.observers.flatMap((observer) => Array.from(observer.targets));
    expect(observed).not.toEqual(expect.arrayContaining([header.logo]));
    expect(header.logo.dataset.kcWordmarkFitBound).toBeUndefined();
    expect(header.state.logoReads).toBe(0);
    expect(header.visible()).toBe(false);
    header.resize();
    header.profileChange();
    header.fontsLoaded();
    header.flushFrames();
    expect(header.state.logoReads).toBe(0);
  });

  test('mantém fallback por resize, perfil e fontes quando ResizeObserver não existe', () => {
    const header = bootHeader({ resizeObserver: false, available: 180 });
    expect(header.visible()).toBe(true);
    expect(header.observers).toHaveLength(0);

    header.state.available = 120;
    header.profileChange();
    header.flushFrames();
    expect(header.visible()).toBe(false);

    header.state.available = 180;
    header.resize();
    header.flushFrames();
    expect(header.visible()).toBe(true);

    header.state.textWidth = 150;
    header.fontsLoaded();
    header.flushFrames();
    expect(header.visible()).toBe(false);
  });

  test('flex revela o wordmark com folga e permanece estável após redistribuir a largura da nav', () => {
    const header = bootFlexHeader();
    expect(header.visible()).toBe(true);
    expect(header.flex.widths()).toEqual({ logo: 146.25, nav: 45 });
    const observed = header.observers.flatMap((observer) => Array.from(observer.targets));
    expect(observed).toEqual(expect.arrayContaining([header.flex.container, header.flex.nav]));
    const toggle = jest.spyOn(header.logo.classList, 'toggle');

    for (let cycle = 0; cycle < 8; cycle += 1) {
      header.notifyResize(header.logo, header.flex.nav, header.flex.container);
      header.flushFrames();
      expect(header.visible()).toBe(true);
      expect(header.flex.widths().nav).toBeGreaterThanOrEqual(44);
      expect(header.flex.widths().logo + header.flex.widths().nav).toBeCloseTo(191.25, 5);
    }
    expect(toggle).not.toHaveBeenCalled();
    expect(header.frames.size).toBe(0);

    // 190.75px leaves only 146.75px after the 44px nav reserve, below the
    // 147px requirement. Rounded clientWidth values would incorrectly sum to 191.
    header.flex.pool = 190.75;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      header.notifyResize(header.flex.nav, header.logo);
      header.flushFrames();
      expect(header.visible()).toBe(false);
    }
    expect(toggle).toHaveBeenCalledTimes(1);

    header.flex.pool = 191.25;
    header.notifyResize(header.flex.nav);
    header.flushFrames();
    expect(header.visible()).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  test('flex preserva o maior alvo completo com margens e recupera espaço sem resize da janela', () => {
    const header = bootFlexHeader({
      pool: 220.25,
      itemWidths: [32, 48],
      itemMargins: 'margin-left:5px;margin-right:7px',
    });
    expect(header.visible()).toBe(true);
    expect(header.flex.widths().nav).toBe(74);

    // A 48px item plus its 12px margins requires 60px. Keeping the wordmark
    // here would leave only 49px; reserving only the first item would be wrong.
    header.flex.pool = 195.25;
    header.notifyResize(header.flex.nav);
    header.flushFrames();
    expect(header.visible()).toBe(false);
    expect(header.flex.widths()).toEqual({ logo: 38, nav: 157.25 });

    header.flex.pool = 220.25;
    header.notifyResize(header.flex.container);
    header.flushFrames();
    expect(header.visible()).toBe(true);
    expect(header.flex.widths().nav).toBeGreaterThanOrEqual(60);
    expect(header.window.innerWidth).toBe(577);
  });

  test('flex encontra o rail criado depois do init sem trocar nem duplicar o observer da nav', () => {
    const header = bootFlexHeader();
    expect(header.visible()).toBe(true);
    expect(header.flex.nav.parentElement).toBe(header.flex.container);
    const observerCount = header.observers.length;
    const rail = header.flex.wrapNav();

    header.flex.pool = 180;
    header.notifyResize(header.flex.nav);
    header.flushFrames();
    expect(rail.getBoundingClientRect).toHaveBeenCalled();
    expect(header.visible()).toBe(false);
    expect(header.flex.nav.parentElement).toBe(rail);

    header.flex.pool = 191.25;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      header.notifyResize(header.flex.nav, header.logo);
      header.flushFrames();
      expect(header.visible()).toBe(true);
      expect(header.flex.widths().nav).toBe(45);
    }
    expect(header.observers).toHaveLength(observerCount);
    expect(header.frames.size).toBe(0);
  });
});
