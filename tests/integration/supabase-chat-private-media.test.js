'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CUTOVER_SCRIPT = fs.readFileSync(
  path.join(ROOT, 'scripts/migrate-chat-media-to-private.ps1'),
  'utf8'
);

function loadAdapter(overrides = {}) {
  jest.resetModules();

  const upload = jest.fn().mockResolvedValue({ data: { path: 'ok' }, error: null });
  const privateSignedUrl = jest.fn().mockResolvedValue({
    data: { signedUrl: 'https://private.example/signed' },
    error: null,
  });
  const legacySignedUrl = jest.fn().mockResolvedValue({
    data: { signedUrl: 'https://legacy.example/signed' },
    error: null,
  });
  const privateRemove = jest.fn().mockResolvedValue({ data: [], error: null });
  const legacyRemove = jest.fn().mockResolvedValue({ data: [], error: null });

  const buckets = {
    'kino-chat-media': {
      upload,
      createSignedUrl: privateSignedUrl,
      remove: privateRemove,
    },
    'kino-media': {
      upload: jest.fn(),
      createSignedUrl: legacySignedUrl,
      remove: legacyRemove,
    },
  };
  Object.assign(buckets['kino-chat-media'], overrides.privateBucket || {});
  Object.assign(buckets['kino-media'], overrides.legacyBucket || {});

  const client = {
    storage: {
      from: jest.fn((bucket) => buckets[bucket]),
    },
    rpc: jest.fn(),
  };

  window._KCSA = {
    getClient: () => client,
    getCurrentUser: () => Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    media: {
      checkImageMagicBytes: jest.fn().mockResolvedValue('image/png'),
      compressImage: jest.fn(async (file) => file),
      extFromMime: jest.fn(() => 'png'),
    },
  };
  window.KCAPI = {
    ENV: {
      STORAGE_BUCKET_POST_MEDIA: 'kino-media',
      STORAGE_BUCKET_CHAT_MEDIA: 'kino-chat-media',
      supabase: {
        storageBucket: 'kino-media',
        chatStorageBucket: 'kino-chat-media',
      },
    },
  };

  require('../../assets/js/adapters/supabase/supabase.chat.adapter.js');

  return {
    adapter: window._KCSA.chat,
    client,
    upload,
    privateSignedUrl,
    legacySignedUrl,
    privateRemove,
    legacyRemove,
  };
}

describe('Supabase chat private media', () => {
  afterEach(() => {
    delete window._KCSA;
    delete window.KCAPI;
  });

  test('uploads novos anexos somente no bucket privado', async () => {
    const runtime = loadAdapter();
    const file = new File(['png'], 'foto.png', { type: 'image/png' });

    const result = await runtime.adapter.uploadChatImage(
      '22222222-2222-4222-8222-222222222222',
      file
    );

    expect(result.ok).toBe(true);
    expect(result.data.bucket).toBe('kino-chat-media');
    expect(result.data.path).toMatch(
      /^chat-media\/22222222-2222-4222-8222-222222222222\/11111111-1111-4111-8111-111111111111\/[a-z0-9-]+\.png$/
    );
    expect(runtime.client.storage.from).toHaveBeenCalledWith('kino-chat-media');
    expect(runtime.upload).toHaveBeenCalledTimes(1);
  });

  test('gera URL assinada no bucket privado sem consultar o legado', async () => {
    const runtime = loadAdapter();

    await expect(runtime.adapter.getSignedUrl('chat-media/c/u/file.png', 300))
      .resolves.toBe('https://private.example/signed');

    expect(runtime.privateSignedUrl).toHaveBeenCalledWith('chat-media/c/u/file.png', 300);
    expect(runtime.legacySignedUrl).not.toHaveBeenCalled();
  });

  test('usa fallback legado apenas quando o objeto ainda não chegou ao bucket privado', async () => {
    const runtime = loadAdapter({
      privateBucket: {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Object not found' },
        }),
      },
    });

    await expect(runtime.adapter.getSignedUrl('chat-media/c/u/old.pdf', 120))
      .resolves.toBe('https://legacy.example/signed');

    expect(runtime.legacySignedUrl).toHaveBeenCalledWith('chat-media/c/u/old.pdf', 120);
  });

  test('limpeza de cutover tenta o bucket privado e o legado', async () => {
    const runtime = loadAdapter();

    await expect(runtime.adapter.deleteUploadedMedia('chat-media/c/u/file.png'))
      .resolves.toEqual({ ok: true });

    expect(runtime.privateRemove).toHaveBeenCalledWith(['chat-media/c/u/file.png']);
    expect(runtime.legacyRemove).toHaveBeenCalledWith(['chat-media/c/u/file.png']);
  });

  test('não declara limpeza quando um dos buckets rejeita a remoção', async () => {
    const runtime = loadAdapter({
      legacyBucket: {
        remove: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'forbidden' },
        }),
      },
    });

    await expect(runtime.adapter.deleteUploadedMedia('chat-media/c/u/file.png'))
      .resolves.toEqual({
        ok: false,
        error: { message: 'Não foi possível remover o anexo.' },
      });
  });

  test('cutover script is read-only by default and binds inventory to the linked project', () => {
    expect(CUTOVER_SCRIPT).toContain('[switch]$Apply');
    expect(CUTOVER_SCRIPT).toContain('[switch]$RemoveLegacyAfterVerification');
    expect(CUTOVER_SCRIPT).toContain('/database/query/read-only');
    expect(CUTOVER_SCRIPT).not.toMatch(
      /\/database\/query(?!\/read-only)/
    );
    expect(CUTOVER_SCRIPT).toContain('supabase/.temp/project-ref');
    expect(CUTOVER_SCRIPT).toContain('$linkedProjectRef -ne $ProjectRef');
    expect(CUTOVER_SCRIPT.indexOf('if (-not $Apply)')).toBeLessThan(
      CUTOVER_SCRIPT.indexOf('Invoke-StorageCopy -Source $sourceUri')
    );
    expect(CUTOVER_SCRIPT).toContain('$PSCmdlet.ShouldProcess');
  });
});
