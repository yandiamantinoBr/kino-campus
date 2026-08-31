'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const WIDGETS_PATH = path.resolve(__dirname, '../../assets/js/core/kc-core-widgets.js');
const VISIBLE_CLASS = 'kc-logo--wordmark-visible';
const WRAP_CLASS = 'kc-header-container--wordmark-wrap';
const COMPACT_CLASS = 'kc-header-container--compact-login';

describe('wordmark do cabeçalho — linha única e login compacto estável', () => {
  const windows = [];

  function bootHeader(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><body${options.shellPage ? ' class="kc-shell-page"' : ''}>
      <header class="kc-header${options.admin ? ' kc-header--admin' : ''}">
        <div class="kc-header-container" style="display:grid;column-gap:8px">
          <div class="kc-logo"><a href="/" aria-label="KinoCampus — Comunidade UFG" style="column-gap:8px">
            <span class="kc-logo-mark" aria-hidden="true">K</span>
            <span class="kc-logo-text" style="display:flex">
              <span class="kc-logo-name">Kino<span>Campus</span></span>
              <span class="kc-logo-sub" style="display:none">Comunidade UFG</span>
            </span>
          </a></div>
          <button class="kc-search-mobile-btn" style="display:inline-flex" aria-label="Buscar"></button>
          <div class="kc-user-actions" style="display:flex;column-gap:6px">
            <button class="kc-notif-bell" style="display:none" aria-label="Notificações"></button>
            <a class="icon-btn kc-chat-shortcut" style="display:inline-flex" href="mensagens.html" aria-label="Mensagens"></a>
            <button class="theme-toggle" style="display:inline-flex" aria-label="Alterar tema"></button>
            <a class="btn-login" style="display:inline-flex" href="#login" data-kc-login="true">Login/Cadastro</a>
          </div>
        </div>
      </header>
    </body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://www.kinocampus.com.br/mensagens.html',
    });
    const { window } = dom;
    windows.push(window);
    const { document } = window;
    const header = document.querySelector('.kc-header');
    const container = document.querySelector('.kc-header-container');
    const logo = document.querySelector('.kc-logo');
    const mark = logo.querySelector('.kc-logo-mark');
    const text = logo.querySelector('.kc-logo-text');
    const name = logo.querySelector('.kc-logo-name');
    const subtitle = logo.querySelector('.kc-logo-sub');
    const link = logo.querySelector('a');
    const search = container.querySelector('.kc-search-mobile-btn');
    const actions = container.querySelector('.kc-user-actions');
    const bell = actions.querySelector('.kc-notif-bell');
    const chat = actions.querySelector('.kc-chat-shortcut');
    const theme = actions.querySelector('.theme-toggle');
    const login = actions.querySelector('.btn-login');
    const state = {
      viewport: options.viewport ?? 430,
      containerWidth: options.containerWidth ?? ((options.viewport ?? 430) - 28),
      markWidth: options.markWidth ?? 38,
      nameWidth: options.nameWidth ?? 100,
      textWidth: options.textWidth ?? 100,
      searchWidth: 36,
      bellWidth: 40,
      chatWidth: 36,
      themeWidth: 36,
      loginWidth: 112,
      fullLabelWidth: 112,
      compactLabelWidth: 40,
      height: 64,
      containerReads: 0,
      heightReads: [],
    };
    const wrapped = () => container.classList.contains(WRAP_CLASS);
    const compact = () => container.classList.contains(COMPACT_CLASS);
    const rect = (width, height = 36) => new window.DOMRect(0, 0, width, height);
    const measure = (element, width) => {
      Object.defineProperty(element, 'offsetWidth', { configurable: true, get: width });
      element.getBoundingClientRect = jest.fn(() => rect(width()));
    };

    // JSDOM has no layout engine. These are independent element dimensions,
    // not a mocked fit decision: the expected compact/full label is literal.
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => state.viewport });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => state.viewport });
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      get: () => { state.containerReads += 1; return state.containerWidth; },
    });
    Object.defineProperty(logo, 'clientWidth', {
      configurable: true,
      get: () => state.containerWidth - 248 + (compact() ? state.fullLabelWidth - state.compactLabelWidth : 0),
    });
    Object.defineProperty(header, 'offsetHeight', {
      configurable: true,
      get: () => {
        state.heightReads.push({ compact: compact(), wrapped: wrapped(), visible: logo.classList.contains(VISIBLE_CLASS) });
        return state.height;
      },
    });
    measure(mark, () => state.markWidth);
    measure(name, () => state.nameWidth);
    measure(text, () => Math.max(state.textWidth, state.nameWidth));
    measure(search, () => state.searchWidth);
    measure(bell, () => state.bellWidth);
    measure(chat, () => state.chatWidth);
    measure(theme, () => state.themeWidth);
    const horizontalBox = () => {
      const style = window.getComputedStyle(login);
      return ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
    };
    measure(login, () => login.classList.contains('is-auth') ? state.loginWidth
      : (compact() ? state.compactLabelWidth : state.fullLabelWidth) + horizontalBox());
    // Full/compact spans are created by production code, including after logout.
    // Both remain measurable even though only one occupies the visible button.
    const nativeRect = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('kc-login-label-full')) return rect(state.fullLabelWidth);
      if (this.classList.contains('kc-login-label-compact')) return rect(state.compactLabelWidth);
      return nativeRect.call(this);
    };
    actions.getBoundingClientRect = jest.fn(() => rect(84 + login.getBoundingClientRect().width));
    logo.getBoundingClientRect = jest.fn(() => rect(logo.clientWidth, 38));

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
    Object.defineProperty(document, 'fonts', { configurable: true, value: options.fonts === false ? undefined : fonts });
    document.addEventListener = jest.fn(document.addEventListener.bind(document));
    window.addEventListener = jest.fn(window.addEventListener.bind(window));
    window.eval(fs.readFileSync(WIDGETS_PATH, 'utf8'));
    expect(typeof window.KCCore.initHeaderWordmarkFit).toBe('function');
    expect(window.kcInitHeaderWordmarkFit).toBeUndefined();

    const elements = { window, document, header, container, logo, mark, text, name, subtitle, link, search, actions, bell, chat, theme, login };
    if (options.beforeInit) options.beforeInit({ ...elements, state, measure });
    const init = () => window.KCCore.initHeaderWordmarkFit();
    const visible = () => logo.classList.contains(VISIBLE_CLASS);
    const resize = (width) => {
      if (width !== undefined) {
        state.viewport = width;
        state.containerWidth = width - 28;
      }
      window.dispatchEvent(new window.Event('resize'));
    };
    const profileChange = () => document.dispatchEvent(new window.CustomEvent('kc:profilechange'));
    const authChange = () => document.dispatchEvent(new window.CustomEvent('kc:authchange'));
    const fontsLoaded = () => fonts.dispatchEvent(new window.Event('loadingdone'));
    init();
    flushFrames();

    return {
      ...elements, state, frames, observers, fonts, measure, init, visible, wrapped, compact,
      resize, profileChange, authChange, fontsLoaded, resolveFontsReady, notifyResize, flushFrames,
    };
  }

  function bootNavHeader(options = {}) {
    let nav;
    let items;
    const header = bootHeader({
      viewport: 577,
      containerWidth: options.containerWidth ?? 441,
      beforeInit({ window, document, container, logo, measure }) {
        container.style.display = 'flex';
        nav = document.createElement('nav');
        nav.className = 'kc-nav-links';
        nav.style.cssText = 'display:flex;flex:1 1 0;min-width:0;overflow-x:auto';
        nav.innerHTML = '<a href="eventos.html">Eventos</a><a href="moradia.html">Moradia</a>';
        container.insertBefore(nav, logo.nextSibling);
        items = Array.from(nav.querySelectorAll('a'));
        const widths = options.itemWidths ?? [32, 36];
        items.forEach((item, index) => measure(item, () => widths[index]));
        if (options.itemMargins) items[1].style.cssText = options.itemMargins;
        // The rail can expand after the label shrinks. Reserve the intrinsic
        // minimum useful target, never the rail's current stretched width.
        nav.getBoundingClientRect = jest.fn(() => new window.DOMRect(0, 0, container.classList.contains(COMPACT_CLASS) ? 116 : 44, 36));
      },
    });
    const wrapNav = () => {
      const rail = header.document.createElement('div');
      rail.className = 'kc-scroll-rail kc-scroll-rail--nav';
      rail.setAttribute('data-kc-scroll-rail', '');
      rail.style.display = 'flex';
      rail.getBoundingClientRect = jest.fn(() => new header.window.DOMRect(0, 0, 500, 36));
      header.container.insertBefore(rail, nav);
      rail.appendChild(nav);
      return rail;
    };
    return { ...header, nav, items, wrapNav };
  }

  function expectMobileName(header, compact) {
    expect(header.visible()).toBe(true);
    expect(header.wrapped()).toBe(false);
    expect(header.compact()).toBe(compact);
    expect(header.name.textContent).toBe('KinoCampus');
    expect(header.name.hidden).toBe(false);
    expect(header.text.style.display).not.toBe('none');
    expect(header.link.getAttribute('aria-label')).toBe('KinoCampus — Comunidade UFG');
  }

  afterEach(() => windows.splice(0).forEach((window) => window.close()));

  test.each([[394, true], [395, false], [396, false]])(
    'preserva nome e 1px de reserva: container %ipx, login compacto=%s',
    (containerWidth, compact) => {
      // 38 mark + 100 name + 8 gap + 1 safety = 147px.
      // Search 36 + controls 196 + two 8px column gaps = 248px.
      expectMobileName(bootHeader({ containerWidth }), compact);
    },
  );

  test.each([320, 360, 375, 390, 412, 430])('nome permanece visível no viewport mobile de %ipx sem criar outra linha', (viewport) => {
    const header = bootHeader({ viewport });
    expectMobileName(header, viewport < 430);
  });

  test('alinha nome acessível ao rótulo visível e preserva link e listener existente', () => {
    const onClick = jest.fn((event) => event.preventDefault());
    let originalTrigger;
    const header = bootHeader({
      viewport: 390,
      beforeInit({ login }) {
        originalTrigger = login;
        login.addEventListener('click', onClick);
      },
    });
    const full = header.login.querySelector('.kc-login-label-full');
    const short = header.login.querySelector('.kc-login-label-compact');
    expectMobileName(header, true);
    expect(header.login).toBe(originalTrigger);
    expect(full.textContent).toBe('Login/Cadastro');
    expect(full.hidden).toBe(false);
    expect(full.getAttribute('aria-hidden')).toBe('true');
    expect(short.textContent).toBe('Entrar');
    expect(short.getAttribute('aria-hidden')).toBe('false');
    expect(header.login.getAttribute('href')).toBe('#login');
    expect(header.login.dataset.kcLogin).toBe('true');
    header.login.dispatchEvent(new header.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    header.resize(769);
    header.flushFrames();
    expect(header.compact()).toBe(false);
    expect(header.wrapped()).toBe(false);
    expect(full.getAttribute('aria-hidden')).toBe('false');
    expect(short.getAttribute('aria-hidden')).toBe('true');
    expect(header.login.querySelector('.kc-login-label-full')).toBe(full);
    expect(header.login.querySelector('.kc-login-label-compact')).toBe(short);
    expect(header.login.querySelectorAll('.kc-login-label-full, .kc-login-label-compact')).toHaveLength(2);
    header.resize(390);
    header.flushFrames();
    expect(full.getAttribute('aria-hidden')).toBe('true');
    expect(short.getAttribute('aria-hidden')).toBe('false');
  });

  test('reset do conteúdo visitante é reconstruído uma vez sem perder a medição completa', () => {
    const header = bootHeader({ viewport: 390 });
    for (let reset = 0; reset < 3; reset += 1) {
      const previousFull = header.login.querySelector('.kc-login-label-full');
      header.login.textContent = 'Login/Cadastro';
      header.profileChange();
      header.notifyResize(header.actions);
      header.flushFrames();
      expectMobileName(header, true);
      const full = header.login.querySelector('.kc-login-label-full');
      expect(full).not.toBe(previousFull);
      expect(full.getBoundingClientRect().width).toBe(112);
      expect(header.login.querySelectorAll('.kc-login-label-full, .kc-login-label-compact')).toHaveLength(2);
      header.profileChange();
      header.flushFrames();
      expect(header.login.querySelector('.kc-login-label-full')).toBe(full);
    }
    expect(header.observers).toHaveLength(1);
    expect(header.frames.size).toBe(0);
  });

  test('preserva rótulo visitante personalizado e não inventa uma tradução compacta', () => {
    const header = bootHeader({ beforeInit: ({ login }) => { login.innerHTML = '<span>Acessar conta</span>'; } });
    expectMobileName(header, false);
    expect(header.login.innerHTML).toBe('<span>Acessar conta</span>');
    expect(header.login.querySelector('.kc-login-label-compact')).toBeNull();
    header.profileChange();
    header.flushFrames();
    expect(header.login.innerHTML).toBe('<span>Acessar conta</span>');
  });

  test('sem botão de login continua a mostrar nome em linha única e não ativa compactação', () => {
    const header = bootHeader({ viewport: 390, beforeInit: ({ login }) => login.remove() });
    expectMobileName(header, false);
    expect(header.container.querySelector('.btn-login')).toBeNull();
    header.authChange();
    header.flushFrames();
    expectMobileName(header, false);
  });

  test.each([false, true])('funciona no cabeçalho público com kc-shell-page=%s', (shellPage) => {
    const header = bootHeader({ shellPage, viewport: 390 });
    expectMobileName(header, true);
    expect(header.observers).toHaveLength(1);
    const observed = Array.from(header.observers[0].targets);
    expect(observed).toEqual(expect.arrayContaining([header.logo, header.mark, header.text, header.name, header.container, header.header, header.actions]));
    expect(observed).toHaveLength(7);
  });

  test('mede o nome independentemente do subtítulo opcional, sem alterar o texto', () => {
    const header = bootHeader({
      textWidth: 240,
      // A legacy/optional subtitle may be wider than the name. Its width
      // cannot make the required brand name disappear or shorten the login.
      beforeInit: ({ subtitle }) => { subtitle.style.display = 'block'; },
    });
    expectMobileName(header, false);
    header.state.textWidth = 400;
    header.notifyResize(header.text);
    header.flushFrames();
    expectMobileName(header, false);
    expect(header.subtitle.textContent).toBe('Comunidade UFG');
    header.state.nameWidth = 120;
    header.notifyResize(header.name);
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('desconta padding, bordas, margens e gaps sem usar a largura do botão já compacto', () => {
    const header = bootHeader({
      containerWidth: 427,
      beforeInit({ container, search, login }) {
        container.style.paddingLeft = '5px';
        container.style.paddingRight = '7px';
        search.style.marginLeft = '2px';
        search.style.marginRight = '3px';
        login.style.marginRight = '2px';
        login.style.paddingLeft = '4px';
        login.style.paddingRight = '6px';
        login.style.borderLeft = '1px solid transparent';
        login.style.borderRight = '2px solid transparent';
      },
    });
    // 427 - 12 container padding - 41 search - (198 actions + 13 box) - 16 gaps = 147px.
    expectMobileName(header, false);
    expect(header.login.getBoundingClientRect().width).toBe(125);
    header.login.style.borderRightWidth = '2.25px';
    header.notifyResize(header.actions);
    header.flushFrames();
    expectMobileName(header, true);
    expect(header.login.getBoundingClientRect().width).toBe(53.25);
    expect(header.login.querySelector('.kc-login-label-full').getBoundingClientRect().width).toBe(112);
    header.login.style.borderRightWidth = '1.75px';
    header.notifyResize(header.actions);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('controles ocultos não consomem largura nem gaps; busca oculta libera seu slot', () => {
    const header = bootHeader({ viewport: 390 });
    expectMobileName(header, true);
    const hidden = header.document.createElement('div');
    hidden.style.display = 'none';
    header.measure(hidden, () => 500);
    header.actions.appendChild(hidden);
    header.search.style.display = 'none';
    header.notifyResize(header.actions, header.container);
    header.flushFrames();
    // 362 - 196 actions - one 8px gap = 158px, enough for the name.
    expectMobileName(header, false);
    expect(hidden.getBoundingClientRect).not.toHaveBeenCalled();
    expect(header.bell.getBoundingClientRect).not.toHaveBeenCalled();
  });

  test('acompanha 768/769px e volta ao mobile mantendo o nome, sem segunda linha', () => {
    const header = bootHeader({ viewport: 768 });
    expectMobileName(header, false);
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
    header.resize(769);
    header.flushFrames();
    expect(header.visible()).toBe(false);
    expect(header.wrapped()).toBe(false);
    expect(header.compact()).toBe(false);
    expect(header.text.style.display).not.toBe('none');
    expect(header.name.hidden).toBe(false);
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
    header.resize(768);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('auth troca conteúdo sem perder o trigger e logout recompõe o rótulo completo mensurável', () => {
    const header = bootHeader({ viewport: 390 });
    expectMobileName(header, true);
    const trigger = header.login;
    const firstFull = trigger.querySelector('.kc-login-label-full');
    const onClick = jest.fn((event) => event.preventDefault());
    trigger.addEventListener('click', onClick);
    header.bell.style.display = 'inline-flex';
    trigger.classList.add('is-auth');
    const identity = '<span class="kc-header-user"><span class="kc-header-user__avatar">Y</span><i class="fas fa-check-circle kc-header-user__verified"></i><i class="fas fa-chevron-down kc-header-user__chevron"></i></span>';
    trigger.innerHTML = identity;
    header.state.loginWidth = 80;
    header.authChange();
    header.flushFrames();
    // No unauthenticated label exists to shorten, even under a tight budget.
    expectMobileName(header, false);
    expect(trigger.innerHTML).toBe(identity);
    expect(trigger.querySelectorAll('.kc-login-label-full, .kc-login-label-compact')).toHaveLength(0);
    header.bell.style.display = 'none';
    trigger.classList.remove('is-auth');
    trigger.textContent = 'Login/Cadastro';
    header.authChange();
    header.flushFrames();
    expectMobileName(header, true);
    expect(header.container.querySelector('.btn-login')).toBe(trigger);
    expect(trigger.querySelector('.kc-login-label-full')).not.toBe(firstFull);
    expect(trigger.querySelector('.kc-login-label-full').textContent).toBe('Login/Cadastro');
    expect(trigger.querySelectorAll('.kc-login-label-full, .kc-login-label-compact')).toHaveLength(2);
    expect(trigger.getAttribute('href')).toBe('#login');
    expect(trigger.dataset.kcLogin).toBe('true');
    trigger.dispatchEvent(new header.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(header.window.innerWidth).toBe(390);
    header.resize(430);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('mudanças de marca e gap selecionam o rótulo curto e recuperam o completo', () => {
    const header = bootHeader();
    header.state.markWidth = 50;
    header.notifyResize(header.mark);
    header.flushFrames();
    expectMobileName(header, true);
    header.state.markWidth = 38;
    header.notifyResize(header.mark);
    header.flushFrames();
    expectMobileName(header, false);
    header.link.style.columnGap = '16px';
    header.resize();
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('fonts.ready e loadingdone reavaliam o nome sem escondê-lo', async () => {
    const header = bootHeader();
    header.state.nameWidth = 125;
    header.resolveFontsReady(header.fonts);
    await Promise.resolve();
    header.flushFrames();
    expectMobileName(header, true);
    header.state.nameWidth = 100;
    header.fontsLoaded();
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('fonte/root-scale altera a largura do rótulo completo mesmo enquanto Entrar aparece', () => {
    const header = bootHeader();
    expectMobileName(header, false);
    header.document.documentElement.style.fontSize = '20px';
    header.state.fullLabelWidth = 140;
    header.state.compactLabelWidth = 50;
    header.fontsLoaded();
    header.flushFrames();
    // Increasing only the label consumes the available headroom first.
    expectMobileName(header, true);
    header.state.nameWidth = 125;
    header.notifyResize(header.name);
    header.flushFrames();
    expectMobileName(header, true);
    expect(header.login.querySelector('.kc-login-label-full').getBoundingClientRect().width).toBe(140);
    expect(header.login.getBoundingClientRect().width).toBe(50);
    header.document.documentElement.style.fontSize = '16px';
    header.state.fullLabelWidth = 112;
    header.state.compactLabelWidth = 40;
    header.state.nameWidth = 100;
    header.fontsLoaded();
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('agrupa observer, resize, orientação, perfil, auth e fontes em uma medição por frame', () => {
    const header = bootHeader();
    const readsBefore = header.state.containerReads;
    header.state.containerWidth = 362;
    header.notifyResize(header.logo, header.name, header.actions);
    header.notifyResize(header.mark);
    header.resize();
    header.window.dispatchEvent(new header.window.Event('orientationchange'));
    header.profileChange();
    header.authChange();
    header.fontsLoaded();
    expect(header.state.containerReads).toBe(readsBefore);
    expect(header.frames.size).toBe(1);
    header.flushFrames();
    expect(header.state.containerReads).toBe(readsBefore + 1);
    expectMobileName(header, true);
  });

  test('init repetido não duplica observadores/listeners nem recalcula o estado', () => {
    const header = bootHeader({ viewport: 390 });
    const countListeners = () => ({
      resize: header.window.addEventListener.mock.calls.filter(([type]) => type === 'resize').length,
      orientation: header.window.addEventListener.mock.calls.filter(([type]) => type === 'orientationchange').length,
      profile: header.document.addEventListener.mock.calls.filter(([type]) => type === 'kc:profilechange').length,
      auth: header.document.addEventListener.mock.calls.filter(([type]) => type === 'kc:authchange').length,
      fonts: header.fonts.addEventListener.mock.calls.filter(([type]) => type === 'loadingdone').length,
    });
    const listenersBefore = countListeners();
    const readsBefore = header.state.containerReads;
    expect(listenersBefore).toEqual({ resize: 1, orientation: 1, profile: 1, auth: 1, fonts: 1 });
    expect(header.logo.dataset.kcWordmarkFitBound).toBe('1');
    header.init();
    header.init();
    header.flushFrames();
    expect(header.observers).toHaveLength(1);
    expect(countListeners()).toEqual(listenersBefore);
    expect(header.state.containerReads).toBe(readsBefore);
    expectMobileName(header, true);
    header.resize(430);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('desktop não recebe classes mobile mesmo se a soma não couber', () => {
    const header = bootHeader({ viewport: 1280, containerWidth: 300 });
    expect(header.visible()).toBe(false);
    expect(header.wrapped()).toBe(false);
    expect(header.compact()).toBe(false);
    expect(header.text.style.display).not.toBe('none');
    expect(header.name.hidden).toBe(false);
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('cabeçalho administrativo permanece intocado, inclusive a variável de altura', () => {
    const header = bootHeader({ admin: true });
    expect(header.observers).toHaveLength(0);
    expect(header.logo.dataset.kcWordmarkFitBound).toBeUndefined();
    expect(header.visible()).toBe(false);
    expect(header.wrapped()).toBe(false);
    expect(header.compact()).toBe(false);
    expect(header.login.innerHTML).toBe('Login/Cadastro');
    header.resize();
    header.profileChange();
    header.authChange();
    header.fontsLoaded();
    header.flushFrames();
    expect(header.state.containerReads).toBe(0);
    expect(header.state.heightReads).toEqual([]);
    expect(header.document.documentElement.style.getPropertyValue('--kc-header-height')).toBe('');
  });

  test('fallback sem ResizeObserver usa perfil, resize, fontes, auth e orientação', () => {
    const header = bootHeader({ resizeObserver: false });
    expect(header.observers).toHaveLength(0);
    expectMobileName(header, false);
    header.state.containerWidth = 362;
    header.profileChange();
    header.flushFrames();
    expectMobileName(header, true);
    header.resize(430);
    header.flushFrames();
    expectMobileName(header, false);
    header.state.nameWidth = 125;
    header.fontsLoaded();
    header.flushFrames();
    expectMobileName(header, true);
    header.state.nameWidth = 100;
    header.authChange();
    header.flushFrames();
    expectMobileName(header, false);
    header.state.containerWidth = 362;
    header.window.dispatchEvent(new header.window.Event('orientationchange'));
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('API de fontes ausente não impede a inicialização nem o reflow', () => {
    const header = bootHeader({ fonts: false });
    expectMobileName(header, false);
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('nome ausente não marca como inicializado e permite completar o DOM depois', () => {
    const header = bootHeader({ beforeInit: ({ name }) => name.remove() });
    expect(header.logo.dataset.kcWordmarkFitBound).toBeUndefined();
    expect(header.observers).toHaveLength(0);
    expect(header.state.containerReads).toBe(0);
    expect(header.state.heightReads).toEqual([]);
    header.text.prepend(header.name);
    header.init();
    expect(header.logo.dataset.kcWordmarkFitBound).toBe('1');
    expect(header.observers).toHaveLength(1);
    expectMobileName(header, false);
  });

  test('nome inicialmente sem medida é reconsiderado assim que fica mensurável', () => {
    const header = bootHeader({ viewport: 390, nameWidth: 0 });
    expect(header.visible()).toBe(false);
    expect(header.wrapped()).toBe(false);
    header.state.nameWidth = 100;
    header.notifyResize(header.name);
    header.flushFrames();
    expectMobileName(header, true);
  });

  test('altura publicada continua de uma linha e acompanha fontes sem reescritas inúteis', () => {
    const header = bootHeader();
    const rootStyle = header.document.documentElement.style;
    expect(rootStyle.getPropertyValue('--kc-header-height')).toBe('64px');
    const setProperty = jest.spyOn(rootStyle, 'setProperty');
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
    expect(header.state.heightReads.at(-1)).toEqual({ compact: true, wrapped: false, visible: true });
    expect(rootStyle.getPropertyValue('--kc-header-height')).toBe('64px');
    expect(setProperty).not.toHaveBeenCalled();
    header.notifyResize(header.container);
    header.flushFrames();
    expect(setProperty).not.toHaveBeenCalled();
    header.state.height = 70;
    header.notifyResize(header.header);
    header.flushFrames();
    expect(rootStyle.getPropertyValue('--kc-header-height')).toBe('70px');
    expect(setProperty).toHaveBeenCalledTimes(1);
    header.state.height = 0;
    header.profileChange();
    header.flushFrames();
    expect(rootStyle.getPropertyValue('--kc-header-height')).toBe('70px');
    expect(setProperty).toHaveBeenCalledTimes(1);
    header.state.height = 64;
    header.resize(430);
    header.flushFrames();
    expect(header.state.heightReads.at(-1)).toEqual({ compact: false, wrapped: false, visible: true });
    expect(rootStyle.getPropertyValue('--kc-header-height')).toBe('64px');
    expect(setProperty).toHaveBeenCalledTimes(2);
  });

  test('Entrar permanece estável mesmo devolvendo espaço à marca por oito ciclos de observer', () => {
    const header = bootHeader({ viewport: 390 });
    expectMobileName(header, true);
    // Full label leaves 114px, compact leaves 186px. Using the current button
    // width would incorrectly restore the full label in the following frame.
    expect(header.logo.clientWidth).toBe(186);
    expect(header.actions.getBoundingClientRect().width).toBe(124);
    expect(header.login.getBoundingClientRect().width).toBe(40);
    expect(header.login.querySelector('.kc-login-label-full').getBoundingClientRect().width).toBe(112);
    const toggle = jest.spyOn(header.container.classList, 'toggle');
    const logoToggle = jest.spyOn(header.logo.classList, 'toggle');
    for (let cycle = 0; cycle < 8; cycle += 1) {
      header.notifyResize(header.logo, header.container, header.actions);
      header.flushFrames();
      expectMobileName(header, true);
      expect(header.document.documentElement.style.getPropertyValue('--kc-header-height')).toBe('64px');
    }
    expect(toggle).not.toHaveBeenCalled();
    expect(logoToggle).not.toHaveBeenCalled();
    header.resize(430);
    header.flushFrames();
    expectMobileName(header, false);
    expect(toggle).toHaveBeenCalledTimes(1);
    header.resize(390);
    header.flushFrames();
    expectMobileName(header, true);
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(logoToggle).not.toHaveBeenCalled();
    expect(header.frames.size).toBe(0);
  });

  test('nav mantém reserva mínima de 44px mesmo quando seus links são menores', () => {
    const header = bootNavHeader();
    // 441 - search36 - actions196 - nav44 - three gaps24 = 141px.
    expectMobileName(header, true);
    expect(header.observers[0].targets.has(header.nav)).toBe(true);
    header.state.containerWidth = 447;
    header.notifyResize(header.nav);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('reserva o maior link da nav com margens e recupera espaço sem resize', () => {
    const header = bootNavHeader({ containerWidth: 462, itemWidths: [32, 48], itemMargins: 'margin-left:5px;margin-right:7px' });
    // 462 - 36 - 196 - (48 + 5 + 7) - 24 = 146px, one short.
    expectMobileName(header, true);
    header.state.containerWidth = 463;
    header.notifyResize(header.nav);
    header.flushFrames();
    expectMobileName(header, false);
    expect(header.window.innerWidth).toBe(577);
    header.nav.style.display = 'none';
    header.state.containerWidth = 395;
    header.notifyResize(header.nav);
    header.flushFrames();
    expectMobileName(header, false);
  });

  test('wrapper da navegação criado depois do init não altera o orçamento nem duplica observers', () => {
    const header = bootNavHeader({ containerWidth: 447 });
    expectMobileName(header, false);
    const rail = header.wrapNav();
    const observer = header.observers[0];
    const observeCalls = observer.observe.mock.calls.length;
    header.state.containerWidth = 446;
    header.notifyResize(header.nav);
    header.flushFrames();
    expectMobileName(header, true);
    expect(header.nav.parentElement).toBe(rail);
    for (let cycle = 0; cycle < 4; cycle += 1) {
      header.notifyResize(header.nav, header.logo, header.container);
      header.flushFrames();
      expectMobileName(header, true);
    }
    header.state.containerWidth = 447;
    header.notifyResize(header.nav);
    header.flushFrames();
    expectMobileName(header, false);
    expect(header.observers).toHaveLength(1);
    expect(observer.observe).toHaveBeenCalledTimes(observeCalls);
    expect(observer.targets.has(header.nav)).toBe(true);
    expect(header.frames.size).toBe(0);
  });
});
