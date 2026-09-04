'use strict';

const path = require('node:path');
const sharp = require('sharp');

let mediaModule;

async function makePng(width, height) {
  return sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: { r: 90, g: 120, b: 200 },
    },
  }).png().toBuffer();
}

function makeRes() {
  return {
    headers: {},
    code: 0,
    body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    getHeader(key) { return this.headers[String(key).toLowerCase()]; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

function withEnv(origin) {
  const previous = process.env.SUPABASE_URL;
  if (origin === null) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = origin;
  return () => {
    if (previous === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous;
  };
}

describe('api/media handler', () => {
  beforeAll(() => {
    mediaModule = require('../../api/media.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('parseObjectPath aceita somente kino-media raster e bloqueia traversal', () => {
    const i = mediaModule.__internals;
    expect(i.parseObjectPath('kino-media/post-media/a/b/c.png')).toBe('kino-media/post-media/a/b/c.png');
    expect(i.parseObjectPath('kino-media/post-media/a/b/c.PNG')).toBe('kino-media/post-media/a/b/c.PNG');
    expect(i.parseObjectPath('kino-media/../secret.jpg')).toBe('');
    expect(i.parseObjectPath('avatars/a.jpg')).toBe('');
    expect(i.parseObjectPath('kino-media/doc.pdf')).toBe('');
    expect(i.parseObjectPath('kino-media/a%2Fb.jpg')).toBe('');
    expect(i.parseObjectPath('kino-media/')).toBe('');
    expect(i.parseObjectPath('')).toBe('');
  });

  test('metodo invalido responde 405', async () => {
    const res = makeRes();
    await mediaModule.default({ method: 'POST', query: { path: 'kino-media/a.jpg' } }, res);
    expect(res.code).toBe(405);
  });

  test('path invalido responde 400 sem cache', async () => {
    const res = makeRes();
    await mediaModule.default({ method: 'GET', query: { path: 'kino-media/../x.jpg' } }, res);
    expect(res.code).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('backend ausente responde 503', async () => {
    const restore = withEnv(null);
    try {
      const res = makeRes();
      await mediaModule.default({ method: 'GET', query: { path: 'kino-media/a.jpg' } }, res);
      expect(res.code).toBe(503);
    } finally {
      restore();
    }
  });

  test('converte objeto cru em JPEG redimensionado com cache longo', async () => {
    const png = await makePng(640, 400);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(png.length) },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    const restore = withEnv('https://proj-fixture.supabase.co');
    try {
      const res = makeRes();
      await mediaModule.default(
        { method: 'GET', query: { path: 'kino-media/post-media/a/b/capa.png', w: '120', q: '82' } },
        res
      );
      expect(res.code).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(String(res.headers['cache-control'])).toContain('s-maxage=31536000');
      expect(res.body.length).toBeLessThanOrEqual(mediaModule.__internals.TARGET_MAX_BYTES);
      expect(Number(res.headers['x-kc-media-width'])).toBe(120);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://proj-fixture.supabase.co/storage/v1/object/public/kino-media/post-media/a/b/capa.png',
        expect.objectContaining({ redirect: 'follow' })
      );
      const meta = await sharp(res.body).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(120);
    } finally {
      restore();
      globalThis.fetch = originalFetch;
    }
  });

  test('fit=cover entrega exatamente w x h (avatars quadrados)', async () => {
    const png = await makePng(600, 300);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(png.length) },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    }));
    const restore = withEnv('https://proj-fixture.supabase.co');
    try {
      const res = makeRes();
      await mediaModule.default(
        { method: 'GET', query: { path: 'kino-media/profile-avatars/u/foto.jpg', w: '144', h: '144', fit: 'cover', q: '80' } },
        res
      );
      expect(res.code).toBe(200);
      const meta = await sharp(res.body).metadata();
      expect(meta.width).toBe(144);
      expect(meta.height).toBe(144);
    } finally {
      restore();
      globalThis.fetch = originalFetch;
    }
  });

  test('objeto inexistente (Supabase 400 InvalidKey) responde 404 cacheavel negativamente', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => '0' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    const restore = withEnv('https://proj-fixture.supabase.co');
    try {
      const res = makeRes();
      await mediaModule.default({ method: 'GET', query: { path: 'kino-media/nao/existe.jpg' } }, res);
      expect(res.code).toBe(404);
      expect(res.headers['cache-control']).toBe('public, max-age=0, s-maxage=300');
    } finally {
      restore();
      globalThis.fetch = originalFetch;
    }
  });

  test('falha 5xx do upstream responde 502 sem cache', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      headers: { get: () => '0' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    const restore = withEnv('https://proj-fixture.supabase.co');
    try {
      const res = makeRes();
      await mediaModule.default({ method: 'GET', query: { path: 'kino-media/a/b.jpg' } }, res);
      expect(res.code).toBe(502);
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      restore();
      globalThis.fetch = originalFetch;
    }
  });
});
