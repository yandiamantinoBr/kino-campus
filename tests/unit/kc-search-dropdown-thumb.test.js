'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SEARCH_SRC = fs.readFileSync(
  path.join(__dirname, '../../assets/js/features/kc-search.js'),
  'utf8'
);

function createMockEl(tag) {
  const classSet = new Set();
  const el = {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    childNodes: [],
    children: [],
    textContent: '',
    parentNode: null,
    src: '',
    loading: '',
    decoding: '',
    width: 0,
    height: 0,
    onerror: null,
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(child) {
      this.childNodes.push(child);
      this.children.push(child);
      if (child && typeof child === 'object') child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((c) => c !== child);
      this.children = this.children.filter((c) => c !== child);
      if (child) child.parentNode = null;
      return child;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    classList: {
      add(name) { classSet.add(name); },
      remove(name) { classSet.delete(name); },
      toggle(name, force) {
        if (force === true) classSet.add(name);
        else if (force === false) classSet.delete(name);
        else if (classSet.has(name)) classSet.delete(name);
        else classSet.add(name);
      },
      contains(name) { return classSet.has(name); },
      toString() { return [...classSet].join(' '); }
    }
  };
  Object.defineProperty(el, 'className', {
    get() { return [...classSet].join(' '); },
    set(value) {
      classSet.clear();
      String(value || '').split(/\s+/).filter(Boolean).forEach((part) => classSet.add(part));
    }
  });
  return el;
}

function loadSearchInternals() {
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: createMockEl,
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    head: { appendChild() {} },
    documentElement: { clientWidth: 1280, clientHeight: 800 }
  };
  const sandbox = {
    window: {
      KCAPI: null,
      localStorage: {
        getItem: () => null,
        setItem() {},
        removeItem() {}
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
      location: {
        href: 'https://www.kinocampus.com.br/',
        hostname: 'www.kinocampus.com.br',
        pathname: '/',
        search: '',
        origin: 'https://www.kinocampus.com.br'
      },
      document,
      URL,
      innerWidth: 1280,
      innerHeight: 800
    },
    document,
    console,
    setTimeout,
    clearTimeout,
    URL,
    Math,
    Number,
    String,
    Array,
    Object,
    Date,
    JSON,
    Error,
    Map,
    Set,
    Promise,
    encodeURIComponent,
    decodeURIComponent
  };
  sandbox.global = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SEARCH_SRC, sandbox, { filename: 'kc-search.js' });
  return sandbox.window.kcSearch && sandbox.window.kcSearch.__internals
    ? sandbox.window.kcSearch.__internals
    : null;
}

describe('search dropdown thumbs', () => {
  const internals = loadSearchInternals();

  test('expõe helpers de thumbnail no internals do kc-search', () => {
    expect(internals).toBeTruthy();
    expect(typeof internals.buildOptimizedThumbUrl).toBe('function');
    expect(typeof internals.getPostImageCandidates).toBe('function');
    expect(typeof internals.createDropdownThumb).toBe('function');
  });

  test('converte storage público do Supabase em render/image compacto', () => {
    const src = 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u1/p1/cover.jpg';
    const thumb = internals.buildOptimizedThumbUrl(src, { size: 80, quality: 62 });
    expect(thumb).toContain('/storage/v1/render/image/public/kino-media/post-media/u1/p1/cover.jpg');
    expect(thumb).toContain('width=80');
    expect(thumb).toContain('height=80');
    expect(thumb).toContain('resize=cover');
    expect(thumb).toContain('quality=62');
  });

  test('não altera hosts externos (sem transform server-side)', () => {
    const external = 'https://files.cercomp.ufg.br/weby/up/1/o/banner.png';
    expect(internals.buildOptimizedThumbUrl(external, { size: 80 })).toBe(external);
  });

  test('coleta candidatos de imagem de posts normalizados', () => {
    const candidates = internals.getPostImageCandidates({
      imagens: ['https://cdn.example/a.jpg'],
      image_url: 'https://cdn.example/b.jpg',
      metadata: { gallery_image_urls: ['https://cdn.example/c.jpg'] }
    });
    expect(candidates[0]).toBe('https://cdn.example/a.jpg');
    expect(candidates).toEqual(expect.arrayContaining([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
      'https://cdn.example/c.jpg'
    ]));
  });

  test('cria thumb com img otimizada e fallback emoji sem imagem', () => {
    const withImage = internals.createDropdownThumb({
      emoji: '🎉',
      image_url: 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/x/y.jpg',
      titulo: 'Evento'
    });
    expect(withImage.className).toContain('kc-search-dropdown__thumb');
    expect(withImage.childNodes[0].tagName).toBe('IMG');
    expect(withImage.childNodes[0].src).toContain('/render/image/');
    expect(withImage.childNodes[0].loading).toBe('lazy');

    const without = internals.createDropdownThumb({ emoji: '📚', titulo: 'Sem foto' });
    expect(without.className).toMatch(/emoji/);
    expect(without.textContent).toBe('📚');
  });
});
