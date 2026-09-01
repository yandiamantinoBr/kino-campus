'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/_archive-v75/20260521222100_cadu_publisher_safety.sql');
const PUBLISHER = path.join(ROOT, 'services/cadu-ufg-publisher/src/publisher.js');
const QUALITY = path.join(ROOT, 'services/cadu-ufg-publisher/src/quality.js');

describe('Cadu publisher safety contract', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const publisher = fs.readFileSync(PUBLISHER, 'utf8');
  const quality = fs.readFileSync(QUALITY, 'utf8');

  test('storage policy allows authenticated post-media fallback without exposing the whole bucket', () => {
    expect(sql).toContain('CREATE POLICY storage_kino_media_cadu_post_media_insert');
    expect(sql).toContain("bucket_id = 'kino-media'");
    expect(sql).toContain("(storage.foldername(name))[1] = 'post-media'");
    expect(sql).toContain("(storage.foldername(name))[2] = (SELECT auth.uid())::text");
    expect(sql).toContain("lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp')");
  });

  test('admin publish clears automatic moderation reason', () => {
    expect(sql).toContain("moderation_reason = CASE WHEN v_status = 'published' THEN NULL ELSE moderation_reason END");
  });

  test('flood limit security definer functions are not executable by anon', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.kc_check_post_flood_limit(uuid, text) FROM public, anon');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.kc_admin_set_post_flood_limit(uuid, text, integer, integer) FROM public, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.kc_check_post_flood_limit(uuid, text) TO authenticated, service_role');
  });

  test('publisher exposes safe update and publish paths', () => {
    expect(publisher).toContain('async safeUpdatePost(postId, fields, options = {})');
    expect(publisher).toContain('async caduEditPost(postId, fields, options = {})');
    expect(publisher).toContain('async mergeMetadata(postId, changes, options = {})');
    expect(publisher).toContain('async publishPost(postId, options = {})');
    expect(publisher).toContain('mergeMetadata(current && current.metadata, metadataPatch)');
    expect(publisher).toContain("moderation_reason: null");
  });

  test('publisher normalizes object image candidates before storage or fallback', () => {
    expect(publisher).toContain('function imageUrlFromCandidate(value)');
    expect(publisher).toContain("value.url");
    expect(publisher).toContain("if (allowExternalFallback && fallbackUrl && !isTemporaryImageUrl(fallbackUrl) && !permanent) out.push(fallbackUrl)");
    expect(publisher).toContain('function isTemporaryImageUrl(value)');
    expect(publisher).toContain('allowExternalImageFallback');
  });

  test('publisher serializes cadu edits and validates post-patch state', () => {
    expect(publisher).toContain('postEditLocks = new Map');
    expect(publisher).toContain('async withPostEditLock(postId, task)');
    expect(publisher).toContain('validatePostPatch(post, row, changedFields = {})');
    expect(publisher).toContain('gallery_image_urls: prepared.images.slice()');
    expect(publisher).toContain('expectedMetadata.gallery_image_urls = prepared.images.slice()');
    expect(publisher).toContain("code: 'POST_VALIDATE_FAILED'");
  });

  test('event time warning is non-blocking when event date exists', () => {
    expect(quality).toContain("warnings.push('missing_event_time')");
    expect(quality).toContain("warnings.filter((warning) => warning !== 'missing_event_time')");
  });
});
