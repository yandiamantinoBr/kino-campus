/**
 * @file gallery-payload-mirror.test.js
 * @description Pin the 2026-07-14 /product.html gallery regression.
 *
 *  Yan reported that he could edit the gallery (3 images) but
 *  /product.html still showed 5. The root cause was that
 *  kc-create-post.submit.js (the edit-modal submit path) did not
 *  mirror the ordered gallery into metadata.gallery_image_urls —
 *  only the top-level `imagens` array was sent. The render path
 *  (product.render.setGallery + KCAPI.normalizePost) reads
 *  metadata.gallery_image_urls first when the post_media table has
 *  fewer rows, so the persisted metadata kept the old 5-image list
 *  and the edit looked like a no-op.
 *
 *  This test asserts both halves of the fix:
 *    - the JS submit path mirrors imagens into metadata
 *    - the Supabase write adapter re-syncs metadata from the
 *      resolved post_media list (defense in depth)
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SUBMIT = fs.readFileSync(
  path.join(ROOT, 'assets/js/features/create-post/kc-create-post.submit.js'),
  'utf8'
);
const WRITE = fs.readFileSync(
  path.join(ROOT, 'assets/js/adapters/supabase/supabase.posts-write.adapter.js'),
  'utf8'
);
const RENDER = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/public/product.render.js'),
  'utf8'
);
const NORMALIZE = fs.readFileSync(
  path.join(ROOT, 'assets/js/api/kc-api.posts-normalize.js'),
  'utf8'
);

describe('gallery-payload-mirror (2026-07-14 /product.html regression)', () => {
  it('kc-create-post.submit.js mirrors publicImages into metadata.gallery_image_urls', () => {
    // The submit path must populate gallery_image_urls from the same
    // ordered list that it sends in the top-level `imagens` field.
    assert.ok(
      /galleryImageUrls\s*=\s*publicImages\.slice\(\)/.test(SUBMIT),
      'kc-create-post.submit.js must derive galleryImageUrls from publicImages.slice()'
    );
    assert.ok(
      /galleryImageUrls[\s\S]{0,800}?gallery_image_urls/.test(SUBMIT),
      'kc-create-post.submit.js must set metadata.gallery_image_urls from galleryImageUrls'
    );
    assert.ok(
      /coverImageUrl[\s\S]{0,800}?cover_url/.test(SUBMIT),
      'kc-create-post.submit.js must mirror coverImageUrl into metadata.cover_url'
    );
  });

  it('supabase.posts-write.adapter.js updatePost re-syncs metadata from post_media', () => {
    // After syncPostMediaForUpdate, the resolved `finalImages` is
    // the source of truth. The adapter must copy that array back
    // into metadata.gallery_image_urls and PATCH the row again so
    // any stale gallery entries on the row get replaced.
    assert.ok(
      /finalImages[\s\S]{0,400}?gallery_image_urls/.test(WRITE),
      'updatePost must set metadata.gallery_image_urls from finalImages.slice()'
    );
    assert.ok(
      /finalImages\.length[\s\S]{0,400}?gallery_count/.test(WRITE),
      'updatePost must set metadata.gallery_count from finalImages.length'
    );
    assert.ok(
      /finalImages[\s\S]{0,2000}?from\('posts'\)[\s\S]{0,600}?update\([\s\S]{0,400}?metadata/.test(WRITE),
      'updatePost must PATCH the posts row with the resolved metadata after syncPostMediaForUpdate'
    );
  });

  it('product.render.setGallery + normalizePost still read metadata.gallery_image_urls', () => {
    // This is the regression guard: the render path is the one Yan
    // sees in /product.html. If a future refactor drops the
    // metadata.gallery_image_urls read here, the same regression
    // will return even after the submit-side fix.
    assert.ok(
      /metadata\.gallery_image_urls/.test(RENDER),
      'product.render.setGallery must keep reading metadata.gallery_image_urls'
    );
    assert.ok(
      /gallery_image_urls[\s\S]{0,400}?galleryImageUrls/.test(NORMALIZE),
      'KCAPI normalizePost must keep looking at metadata.gallery_image_urls (and galleryImageUrls) as fallback'
    );
  });

  it('kc-create-post.submit.js still keeps the top-level `imagens` array', () => {
    // The Supabase write adapter uses the top-level imagens as the
    // source of truth for the post_media sync, so the submit path
    // must keep emitting it. Removing it would break the
    // syncPostMediaForUpdate chain.
    assert.ok(
      /const\s+imagens\s*=\s*kcGetOrderedCreateImages\s*\(\s*\)/.test(SUBMIT),
      'kc-create-post.submit.js must still call kcGetOrderedCreateImages to build the top-level `imagens` array'
    );
    assert.ok(
      /imagens,/.test(SUBMIT),
      'kc-create-post.submit.js payload must reference the top-level `imagens` field'
    );
    assert.ok(
      /metadata\s*:\s*\{/.test(SUBMIT),
      'kc-create-post.submit.js payload must include a metadata object'
    );
  });
});
