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

// 2026-09-10: dedup por conteúdo — URLs de origem distintas com bytes idênticos
// (cópia do coletor + CDN original) não devem gerar duas ocorrências na galeria
// (regressão observada no post d08588d2: capa + cópia byte-idêntica).

test('bytes idênticos em URLs de origem distintas geram uma única ocorrência na galeria', async () => {
  const publisher = createPublisher();
  const sameBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]);
  let downloads = 0;
  let uploads = 0;
  publisher.downloadRemoteImage = async () => {
    downloads += 1;
    return { buffer: sameBytes, contentType: 'image/png', ext: 'png' };
  };
  publisher.uploadImageToStorage = async (postId, url, index, image) => {
    uploads += 1;
    assert.ok(image, 'upload recebe os bytes pré-baixados');
    return `https://project.supabase.co/storage/v1/object/public/kino-media/${postId}/cadu-${index + 1}.png`;
  };
  const prepared = await publisher.prepareImagesForPost('post-dedup', [
    'https://files.cercomp.ufg.br/o/capa.png',
    'https://files.cercomp.ufg.br/m/capa.png',
  ]);
  assert.equal(downloads, 2);
  assert.equal(uploads, 1, 'segunda cópia byte-idêntica não é gravada');
  assert.deepEqual(prepared.images, [prepared.uploads[0].url]);
  assert.equal(prepared.uploads.length, 2);
  assert.equal(prepared.uploads[0].reused, undefined);
  assert.equal(prepared.uploads[1].reused, true);
});

test('assets distintos continuam entrando na galeria normalmente', async () => {
  const publisher = createPublisher();
  const bytesA = Buffer.from([1, 2, 3, 4]);
  const bytesB = Buffer.from([5, 6, 7, 8]);
  let uploads = 0;
  publisher.downloadRemoteImage = async (url) => ({
    buffer: url.endsWith('b.png') ? bytesB : bytesA,
    contentType: 'image/png',
    ext: 'png',
  });
  publisher.uploadImageToStorage = async (postId, url, index) => {
    uploads += 1;
    return `https://project.supabase.co/storage/v1/object/public/kino-media/${postId}/${index}.png`;
  };
  const prepared = await publisher.prepareImagesForPost('post-multi', [
    'https://files.cercomp.ufg.br/a.png',
    'https://files.cercomp.ufg.br/b.png',
  ]);
  assert.equal(uploads, 2);
  assert.equal(prepared.images.length, 2);
  assert.equal(prepared.uploads[0].reused, undefined);
  assert.equal(prepared.uploads[1].reused, undefined);
});
