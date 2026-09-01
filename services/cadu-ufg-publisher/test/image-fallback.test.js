'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { SupabasePublisher } = require('../src/publisher');

function createPublisher() {
  return new SupabasePublisher({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    kinoEmail: 'cadu-test@example.com',
    kinoPassword: 'x',
  });
}

const CERCOMP_BROKEN = 'https://files.cercomp.ufg.br/weby/up/269/o/post_MEM_02-09_.jpg';
const INSTAGRAM_TEMP = 'https://scontent.cdninstagram.com/capa.jpg';

test('falha permanente (4xx) não persiste a URL externa como fallback da galeria', async () => {
  const publisher = createPublisher();
  publisher.downloadRemoteImage = async () => {
    const error = new Error('image_download_http_404');
    error.permanent = true;
    throw error;
  };
  const prepared = await publisher.prepareImagesForPost('post-1', [CERCOMP_BROKEN]);
  assert.deepEqual(prepared.images, [], 'URL 404 não pode entrar na galeria');
  assert.equal(prepared.uploads.length, 1);
  assert.equal(prepared.uploads[0].ok, false);
  assert.equal(prepared.uploads[0].error, 'image_download_http_404');
});

test('unsupported_image_type é permanente: URL externa também é descartada', async () => {
  const publisher = createPublisher();
  publisher.downloadRemoteImage = async () => {
    const error = new Error('unsupported_image_type');
    error.permanent = true;
    throw error;
  };
  const prepared = await publisher.prepareImagesForPost('post-2', [CERCOMP_BROKEN]);
  assert.deepEqual(prepared.images, []);
});

test('detecção por mensagem cobre erros sem flag (defesa em profundidade)', async () => {
  const publisher = createPublisher();
  publisher.downloadRemoteImage = async () => {
    throw new Error('image_download_http_410');
  };
  const prepared = await publisher.prepareImagesForPost('post-3', [CERCOMP_BROKEN]);
  assert.deepEqual(prepared.images, []);
});

test('falha transitória (5xx) mantém o fallback externo para hosts permanentes', async () => {
  const publisher = createPublisher();
  publisher.downloadRemoteImage = async () => {
    throw new Error('image_download_http_503');
  };
  const prepared = await publisher.prepareImagesForPost('post-4', [CERCOMP_BROKEN]);
  assert.deepEqual(prepared.images, [CERCOMP_BROKEN]);
  assert.equal(prepared.uploads[0].ok, false);
});

test('hosts temporários (CDNs de redes sociais) continuam sem fallback externo', async () => {
  const publisher = createPublisher();
  publisher.downloadRemoteImage = async () => {
    throw new Error('image_download_http_503');
  };
  const prepared = await publisher.prepareImagesForPost('post-5', [INSTAGRAM_TEMP]);
  assert.deepEqual(prepared.images, []);
});
