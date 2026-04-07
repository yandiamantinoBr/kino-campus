/**
 * Testes para kc-lazy-loader.js (v9.4.0)
 * - window.KCLazyLoader existe e está frozen
 * - load() injeta script e chama callback
 * - load() é idempotente
 * - onVisible() usa fallback quando IntersectionObserver ausente
 * - onVisible() não lança erro quando selector não existe
 * - onInteraction() carrega na primeira interação
 */

beforeAll(() => {
  global.window = global.window || global;
  require('../assets/js/kc-lazy-loader.js');
});

describe('KCLazyLoader (v9.4.0)', () => {
  // ── Estrutura ────────────────────────────────────────────────────────────

  describe('window.KCLazyLoader', () => {
    test('está definido', () => {
      expect(window.KCLazyLoader).toBeDefined();
    });

    test('expõe load, onVisible, onInteraction', () => {
      expect(typeof window.KCLazyLoader.load).toBe('function');
      expect(typeof window.KCLazyLoader.onVisible).toBe('function');
      expect(typeof window.KCLazyLoader.onInteraction).toBe('function');
    });

    test('está frozen (Object.freeze)', () => {
      expect(Object.isFrozen(window.KCLazyLoader)).toBe(true);
    });
  });

  // ── load() ───────────────────────────────────────────────────────────────

  describe('KCLazyLoader.load()', () => {
    test('injeta tag <script> no document.head', () => {
      const injected = [];
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT') injected.push(el);
        // não chama original para não fazer fetch real
      };

      const src = 'assets/js/lazy-test-' + Date.now() + '.js';
      window.KCLazyLoader.load(src);

      expect(injected.length).toBeGreaterThan(0);
      // JSDOM resolve para URL absoluta, então verificamos que termina com o src
      expect(injected[0].src).toContain('lazy-test-');

      document.head.appendChild = origAppend;
    });

    test('não injeta script duas vezes para o mesmo src (idempotente)', () => {
      const injected = [];
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT') {
          injected.push(el);
          // simula carga imediata chamando onload
          if (el.onload) el.onload();
        }
      };

      const src = 'assets/js/idem-' + Date.now() + '.js';
      window.KCLazyLoader.load(src);
      window.KCLazyLoader.load(src); // segunda chamada — deve ser ignorada

      // Só um script deve ter sido injetado
      expect(injected.length).toBe(1);

      document.head.appendChild = origAppend;
    });

    test('funciona sem callback (não lança erro)', () => {
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function () {};
      expect(() => {
        window.KCLazyLoader.load('assets/js/no-cb-' + Date.now() + '.js');
      }).not.toThrow();
      document.head.appendChild = origAppend;
    });

    test('chama callback quando onload dispara', () => {
      let called = false;
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT' && el.onload) el.onload();
      };

      const src = 'assets/js/cb-fired-' + Date.now() + '.js';
      window.KCLazyLoader.load(src, () => { called = true; });
      expect(called).toBe(true);

      document.head.appendChild = origAppend;
    });
  });

  // ── onVisible() — fallback sem IntersectionObserver ──────────────────────

  describe('KCLazyLoader.onVisible() — fallback', () => {
    let origIO;

    beforeEach(() => {
      origIO = window.IntersectionObserver;
      delete window.IntersectionObserver;
    });

    afterEach(() => {
      if (origIO) window.IntersectionObserver = origIO;
    });

    test('carrega imediatamente quando IntersectionObserver não disponível', () => {
      let called = false;
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT' && el.onload) el.onload();
      };

      const div = document.createElement('div');
      div.className = 'kc-test-visible';
      document.body.appendChild(div);

      window.KCLazyLoader.onVisible('.kc-test-visible', 'assets/js/visible-fallback.js', () => { called = true; });
      expect(called).toBe(true);

      document.body.removeChild(div);
      document.head.appendChild = origAppend;
    });

    test('não lança erro quando selector não existe no DOM', () => {
      expect(() => {
        window.KCLazyLoader.onVisible('#nao-existe-xyz', 'assets/js/missing.js');
      }).not.toThrow();
    });
  });

  // ── onVisible() — com IntersectionObserver ────────────────────────────────

  describe('KCLazyLoader.onVisible() — com IntersectionObserver', () => {
    test('cria IntersectionObserver quando disponível', () => {
      let observedElement = null;
      const origIO = window.IntersectionObserver;
      window.IntersectionObserver = function (cb, opts) {
        return {
          observe(el) { observedElement = el; },
          disconnect() {},
        };
      };

      const div = document.createElement('div');
      div.className = 'kc-test-io';
      document.body.appendChild(div);

      window.KCLazyLoader.onVisible('.kc-test-io', 'assets/js/io-test.js');
      expect(observedElement).toBe(div);

      document.body.removeChild(div);
      window.IntersectionObserver = origIO;
    });

    test('não lança erro quando selector não existe (com IO disponível)', () => {
      const origIO = window.IntersectionObserver;
      window.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
      expect(() => {
        window.KCLazyLoader.onVisible('#ghost-element', 'assets/js/ghost.js');
      }).not.toThrow();
      window.IntersectionObserver = origIO;
    });
  });

  // ── onInteraction() ──────────────────────────────────────────────────────

  describe('KCLazyLoader.onInteraction()', () => {
    test('carrega ao disparar evento no elemento', () => {
      let called = false;
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT' && el.onload) el.onload();
      };

      const btn = document.createElement('button');
      btn.id = 'kc-lazy-test-btn';
      document.body.appendChild(btn);

      window.KCLazyLoader.onInteraction('#kc-lazy-test-btn', ['click'], 'assets/js/btn-lazy.js', () => { called = true; });
      btn.dispatchEvent(new Event('click'));

      expect(called).toBe(true);
      document.body.removeChild(btn);
      document.head.appendChild = origAppend;
    });

    test('não dispara duas vezes (once: true)', () => {
      let count = 0;
      const origAppend = document.head.appendChild.bind(document.head);
      document.head.appendChild = function (el) {
        if (el && el.tagName === 'SCRIPT' && el.onload) el.onload();
      };

      const btn = document.createElement('button');
      btn.id = 'kc-lazy-once-btn';
      document.body.appendChild(btn);

      window.KCLazyLoader.onInteraction('#kc-lazy-once-btn', ['click'], 'assets/js/once-lazy-' + Date.now() + '.js', () => { count++; });
      btn.dispatchEvent(new Event('click'));
      btn.dispatchEvent(new Event('click')); // segundo click — deve ser ignorado pelo loader

      expect(count).toBe(1);
      document.body.removeChild(btn);
      document.head.appendChild = origAppend;
    });

    test('não lança erro quando selector não existe', () => {
      expect(() => {
        window.KCLazyLoader.onInteraction('#inexistente-xyz', ['click'], 'fake.js');
      }).not.toThrow();
    });
  });
});
