'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CORE = path.join(ROOT, 'assets/js/core/kc-core.js');
const CSS = path.join(ROOT, 'assets/css/styles.css');

describe('kc-scroll-rail', () => {
  let rafQueue;
  let resizeObservers;
  let mutationObservers;

  function flushRaf() {
    const pending = rafQueue.splice(0);
    pending.forEach((callback) => callback(16));
  }

  function setViewport(width) {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
  }

  function mountRail(options = {}) {
    const state = {
      railWidth: options.railWidth ?? 300,
      clientWidth: options.clientWidth ?? 300,
      scrollWidth: options.scrollWidth ?? 600,
      scrollLeft: options.scrollLeft ?? 0,
      offsetReads: 0,
    };
    document.body.innerHTML = `
      <main>
        <div class="kc-feed-tabs"><a href="#todas">Todas</a><a href="#eventos">Eventos</a></div>
      </main>`;

    window.kcInitScrollIndicators();
    const scrollEl = document.querySelector('.kc-feed-tabs');
    const rail = scrollEl.closest('[data-kc-scroll-rail]');
    const prev = rail.querySelector('[data-kc-rail-prev]');
    const next = rail.querySelector('[data-kc-rail-next]');

    Object.defineProperties(rail, {
      clientWidth: { configurable: true, get: () => state.railWidth },
    });
    Object.defineProperties(scrollEl, {
      clientWidth: { configurable: true, get: () => state.clientWidth },
      scrollWidth: { configurable: true, get: () => state.scrollWidth },
      offsetWidth: {
        configurable: true,
        get: () => {
          state.offsetReads += 1;
          return state.clientWidth;
        },
      },
      scrollLeft: {
        configurable: true,
        get: () => state.scrollLeft,
        set: (value) => { state.scrollLeft = value; },
      },
    });
    scrollEl.scrollBy = jest.fn();
    flushRaf();
    return { state, rail, scrollEl, prev, next };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    rafQueue = [];
    resizeObservers = [];
    mutationObservers = [];
    setViewport(1024);

    const requestFrame = jest.fn((callback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    window.requestAnimationFrame = requestFrame;
    global.requestAnimationFrame = requestFrame;

    class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.observe = jest.fn();
        resizeObservers.push(this);
      }
    }
    class MutationObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.observe = jest.fn();
        mutationObservers.push(this);
      }
    }
    window.ResizeObserver = ResizeObserverMock;
    global.ResizeObserver = ResizeObserverMock;
    window.MutationObserver = MutationObserverMock;
    global.MutationObserver = MutationObserverMock;

    require(CORE);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    delete window.kcAttachScrollIndicators;
    delete window.kcInitScrollIndicators;
  });

  test('envolve tabs uma única vez e preserva a semântica start/end', () => {
    const { rail, scrollEl, prev, next, state } = mountRail();

    expect(rail.classList.contains('kc-scroll-rail--tabs')).toBe(true);
    expect(document.querySelectorAll('[data-kc-scroll-rail]')).toHaveLength(1);
    expect(rail.classList.contains('is-overflow-start')).toBe(false);
    expect(rail.classList.contains('is-overflow-end')).toBe(true);
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(false);

    state.scrollLeft = 120;
    scrollEl.dispatchEvent(new Event('scroll'));
    flushRaf();
    expect(rail.classList.contains('is-overflow-start')).toBe(true);
    expect(rail.classList.contains('is-overflow-end')).toBe(true);
    expect(prev.hidden).toBe(false);
    expect(next.hidden).toBe(false);

    state.scrollLeft = state.scrollWidth - state.clientWidth;
    scrollEl.dispatchEvent(new Event('scroll'));
    flushRaf();
    expect(rail.classList.contains('is-overflow-start')).toBe(true);
    expect(rail.classList.contains('is-overflow-end')).toBe(false);
    expect(prev.hidden).toBe(false);
    expect(next.hidden).toBe(true);
  });

  test('não cria overflow apenas porque as setas reduziram a largura do filho', () => {
    const { rail, prev, next } = mountRail({
      railWidth: 300,
      clientWidth: 230,
      scrollWidth: 300,
    });

    expect(rail.classList.contains('is-overflow-start')).toBe(false);
    expect(rail.classList.contains('is-overflow-end')).toBe(false);
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(true);
  });

  test('limpa o estado no mobile <= 768 e o restaura ao voltar para desktop', () => {
    setViewport(768);
    const { rail, prev, next } = mountRail();

    expect(rail.classList.contains('is-mobile')).toBe(true);
    expect(rail.classList.contains('is-overflow-start')).toBe(false);
    expect(rail.classList.contains('is-overflow-end')).toBe(false);
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(true);

    setViewport(769);
    rail.__kcScrollRailUpdate();
    flushRaf();
    expect(rail.classList.contains('is-mobile')).toBe(false);
    expect(rail.classList.contains('is-overflow-end')).toBe(true);
    expect(next.hidden).toBe(false);
  });

  test('remede um rail já anexado sem duplicar wrapper ou listeners', () => {
    const { rail, scrollEl, next, state } = mountRail({ scrollWidth: 300 });
    expect(rail.classList.contains('is-overflow-end')).toBe(false);

    state.scrollWidth = 600;
    window.kcInitScrollIndicators();
    window.kcInitScrollIndicators();
    expect(rafQueue).toHaveLength(1);
    flushRaf();

    expect(document.querySelectorAll('[data-kc-scroll-rail]')).toHaveLength(1);
    expect(rail.classList.contains('is-overflow-end')).toBe(true);
    next.click();
    expect(scrollEl.scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollEl.scrollBy).toHaveBeenCalledWith({ left: 210, behavior: 'smooth' });
  });

  test('ResizeObserver e MutationObserver usam subtree e agrupam medições por frame', () => {
    const { rail, scrollEl, state } = mountRail();
    const initialReads = state.offsetReads;
    const resize = resizeObservers[0];
    const mutation = mutationObservers[0];

    expect(resize.observe).toHaveBeenCalledWith(rail);
    expect(resize.observe).toHaveBeenCalledWith(scrollEl);
    expect(mutation.observe).toHaveBeenCalledWith(scrollEl, {
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style'],
      childList: true,
      subtree: true,
      characterData: true,
    });

    resize.callback([]);
    mutation.callback([]);
    mutation.callback([]);
    expect(rafQueue).toHaveLength(1);
    flushRaf();
    expect(state.offsetReads).toBe(initialReads + 1);
  });

  test('CSS mantém sticky no wrapper e o desativa no filho já envolvido', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    expect(css).toMatch(/\.kc-scroll-rail--tabs\s*\{[^}]*position:\s*sticky;/s);
    expect(css).toMatch(/\.kc-scroll-rail--tabs\s*>\s*\.kc-feed-tabs\s*\{[^}]*position:\s*static;/s);
    expect(css).toMatch(/\.kc-scroll-rail\.is-mobile\s+\.kc-scroll-rail__btn\s*\{[^}]*display:\s*none\s*!important;/s);
  });
});
