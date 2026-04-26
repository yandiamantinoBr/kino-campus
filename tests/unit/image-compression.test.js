/**
 * Testes para compressImage() exposta em window.KCCompressImage (v9.4.1)
 * - GIF é pass-through (não comprime)
 * - JPEG/PNG/WebP são comprimidos via Canvas
 * - Dimensões são respeitadas (max 1200×900)
 * - Fallback para blob original se Canvas falhar
 * - Avatar: max 400×400
 */

let origCreateElement;
let origImage;
let origCreateObjectURL;
let origRevokeObjectURL;

function makeBlob(type, size) {
  const arr = new Uint8Array(size || 100);
  return new Blob([arr], { type });
}

function setupCanvasMock({ naturalWidth = 800, naturalHeight = 600, toBlobFail = false } = {}) {
  // Mock Image constructor
  origImage = global.Image;
  function MockImage() {
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this._onload = null;
    this._onerror = null;
    Object.defineProperty(this, 'onload', { set(v) { this._onload = v; }, get() { return this._onload; } });
    Object.defineProperty(this, 'onerror', { set(v) { this._onerror = v; }, get() { return this._onerror; } });
    Object.defineProperty(this, 'src', {
      set() {
        const self = this;
        // Dispara onload de forma síncrona
        if (self._onload) self._onload();
      },
    });
  }
  global.Image = MockImage;

  // Mock URL.createObjectURL / revokeObjectURL
  origCreateObjectURL = global.URL && global.URL.createObjectURL;
  origRevokeObjectURL = global.URL && global.URL.revokeObjectURL;
  if (!global.URL) global.URL = {};
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();

  // Mock document.createElement('canvas')
  origCreateElement = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return origCreateElement(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: jest.fn() }),
      toBlob: toBlobFail
        ? (cb) => cb(null)
        : (cb, type) => cb(new Blob(['compressed'], { type: type || 'image/jpeg' })),
    };
  });
}

function teardownCanvasMock() {
  if (origImage) global.Image = origImage;
  if (origCreateObjectURL) global.URL.createObjectURL = origCreateObjectURL;
  if (origRevokeObjectURL) global.URL.revokeObjectURL = origRevokeObjectURL;
  jest.restoreAllMocks();
}

beforeAll(() => {
  global.window = global.window || global;

  global.KCSupabase = { getClient: jest.fn(() => ({})) };
  window.KCSupabase = global.KCSupabase;

  window.KCAPI = {
    ENV: {
      driver: 'supabase',
      environment: 'development',
      isProduction: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: { url: 'https://test.supabase.co', anonKey: 'test-key' },
    },
    normalizePost: jest.fn((p) => p),
    registerAdapter: jest.fn(),
    clearLastCreatePostError: jest.fn(),
    setLastCreatePostError: jest.fn(),
    getLastCreatePostError: jest.fn(),
    summarizeCreatePayloadForDiagnostics: jest.fn(() => ({})),
    rankRelatedPosts: jest.fn((_, c) => c),
  };

  require('../../assets/js/adapters/supabase/supabase.media.adapter.js');
  require('../../assets/js/adapters/supabase/supabase.adapter.js');
});

describe('window.KCCompressImage (v9.4.1)', () => {
  afterEach(() => {
    teardownCanvasMock();
  });

  // ── Exposição ────────────────────────────────────────────────────────────
  test('está exposta como window.KCCompressImage', () => {
    expect(typeof window.KCCompressImage).toBe('function');
  });

  // ── GIF pass-through ─────────────────────────────────────────────────────
  test('retorna GIF sem modificar (pass-through)', async () => {
    const gif = makeBlob('image/gif', 200);
    const result = await window.KCCompressImage(gif);
    expect(result).toBe(gif); // mesma referência
  });

  // ── JPEG comprimido via Canvas ───────────────────────────────────────────
  test('comprime JPEG via Canvas e retorna Blob image/jpeg', async () => {
    setupCanvasMock({ naturalWidth: 800, naturalHeight: 600 });
    const jpeg = makeBlob('image/jpeg', 50000);
    const result = await window.KCCompressImage(jpeg);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  // ── PNG comprimido via Canvas ────────────────────────────────────────────
  test('comprime PNG via Canvas', async () => {
    setupCanvasMock({ naturalWidth: 400, naturalHeight: 300 });
    const png = makeBlob('image/png', 30000);
    const result = await window.KCCompressImage(png);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  // ── WebP comprimido via Canvas ───────────────────────────────────────────
  test('comprime WebP via Canvas', async () => {
    setupCanvasMock({ naturalWidth: 600, naturalHeight: 400 });
    const webp = makeBlob('image/webp', 40000);
    const result = await window.KCCompressImage(webp);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  // ── Dimensões acima do máximo → redimensiona ─────────────────────────────
  test('canvas recebe dimensões corretas para imagem grande (3000×2000 → max 1200×900)', async () => {
    let capturedCanvas = null;
    origImage = global.Image;
    function MockImageLarge() {
      this.naturalWidth = 3000;
      this.naturalHeight = 2000;
      Object.defineProperty(this, 'src', {
        set() { if (this.onload) this.onload(); },
      });
    }
    global.Image = MockImageLarge;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return origCreateElement(tag);
      const c = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: jest.fn() }),
        toBlob: (cb, type) => cb(new Blob(['x'], { type: type || 'image/jpeg' })),
      };
      capturedCanvas = c;
      return c;
    });

    const blob = makeBlob('image/jpeg', 100);
    await window.KCCompressImage(blob, 1200, 900, 0.85);

    // ratio = min(1200/3000, 900/2000) = min(0.4, 0.45) = 0.4
    // w = round(3000 * 0.4) = 1200, h = round(2000 * 0.4) = 800
    expect(capturedCanvas.width).toBe(1200);
    expect(capturedCanvas.height).toBe(800);

    global.Image = origImage;
    jest.restoreAllMocks();
  });

  // ── Dimensões abaixo do máximo → não redimensiona ────────────────────────
  test('canvas mantém dimensões originais para imagem pequena (400×300)', async () => {
    let capturedCanvas = null;
    setupCanvasMock({ naturalWidth: 400, naturalHeight: 300 });

    jest.restoreAllMocks(); // reaplica mock mais detalhado
    origImage = global.Image;
    function MockImageSmall() {
      this.naturalWidth = 400;
      this.naturalHeight = 300;
      Object.defineProperty(this, 'src', {
        set() { if (this.onload) this.onload(); },
      });
    }
    global.Image = MockImageSmall;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return origCreateElement(tag);
      const c = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: jest.fn() }),
        toBlob: (cb, type) => cb(new Blob(['x'], { type: type || 'image/jpeg' })),
      };
      capturedCanvas = c;
      return c;
    });

    const blob = makeBlob('image/jpeg', 100);
    await window.KCCompressImage(blob, 1200, 900, 0.85);

    expect(capturedCanvas.width).toBe(400);
    expect(capturedCanvas.height).toBe(300);

    global.Image = origImage;
    jest.restoreAllMocks();
  });

  // ── Fallback quando toBlob retorna null ──────────────────────────────────
  test('retorna blob original se toBlob falhar (retorna null)', async () => {
    setupCanvasMock({ naturalWidth: 800, naturalHeight: 600, toBlobFail: true });
    const jpeg = makeBlob('image/jpeg', 100);
    const result = await window.KCCompressImage(jpeg);
    expect(result).toBe(jpeg); // fallback para original
  });

  // ── Fallback quando blob é null ──────────────────────────────────────────
  test('retorna null/undefined se blob for null', async () => {
    const result = await window.KCCompressImage(null);
    expect(result).toBeFalsy();
  });

  // ── Avatar: max 400×400 ──────────────────────────────────────────────────
  test('dimensões de avatar (500×500) são reduzidas para max 400×400', async () => {
    let capturedCanvas = null;
    origImage = global.Image;
    function MockImageAvatar() {
      this.naturalWidth = 500;
      this.naturalHeight = 500;
      Object.defineProperty(this, 'src', {
        set() { if (this.onload) this.onload(); },
      });
    }
    global.Image = MockImageAvatar;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return origCreateElement(tag);
      const c = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: jest.fn() }),
        toBlob: (cb, type) => cb(new Blob(['x'], { type: type || 'image/jpeg' })),
      };
      capturedCanvas = c;
      return c;
    });

    const blob = makeBlob('image/jpeg', 100);
    await window.KCCompressImage(blob, 400, 400, 0.85);

    // ratio = min(400/500, 400/500) = 0.8 → w=400, h=400
    expect(capturedCanvas.width).toBe(400);
    expect(capturedCanvas.height).toBe(400);

    global.Image = origImage;
    jest.restoreAllMocks();
  });
});
