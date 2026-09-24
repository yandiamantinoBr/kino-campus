// Synthetic-only contract regression. No database or network connection.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assessAtomicDedupPreview } = require('./cadu-atomic-dedup-preview');

const fixture = JSON.parse(fs.readFileSync(path.join(
  __dirname, '../tests/fixtures/cadu-atomic-dedup-pair.json',
), 'utf8'));
const fixedNow = new Date('2098-01-03T00:00:00.000Z');
const clone = () => structuredClone(fixture);
const baseline = clone();
const original = JSON.stringify(baseline);
const exact = assessAtomicDedupPreview(baseline, fixedNow);
assert.equal(exact.decision, 'review_only');
assert.deepEqual(exact.reasons, []);
assert(exact.requiredBeforeMutation.includes('fresh_full_post_and_media_CAS'));
assert.equal(JSON.stringify(baseline), original, 'preview may not mutate input');

const blocked = [
  ['same source page, different individual title', (p) => { p.redundant.title = 'Bolsa para outro projeto'; }, 'PUBLIC_FACTS_DIFFER'],
  ['same title, different application instructions', (p) => { p.redundant.description += ' Enviar documentos em outro endereço.'; }, 'PUBLIC_FACTS_DIFFER'],
  ['same URL, different source entity', (p) => { p.redundant.metadata.source_id += ':individual'; }, 'SOURCE_IDENTITY_MISMATCH'],
  ['different typed application date', (p) => { p.redundant.metadata.dates.applicationDeadline = '2098-02-20'; }, 'METADATA_DIFFERS'],
  ['different run provenance', (p) => { p.redundant.metadata.cadu_run_id = '00000000-0000-4000-8000-00000000d111'; }, 'METADATA_DIFFERS'],
  ['different media evidence', (p) => { p.redundantMedia[0].url = 'https://example.test/new.jpg'; }, 'MEDIA_CONTENT_DIFFERS'],
  ['different author', (p) => { p.redundant.author_id = '00000000-0000-4000-8000-00000000d199'; }, 'DIFFERENT_AUTHOR'],
  ['manual description lock', (p) => { p.canonical.metadata.manual_description = true; p.redundant.metadata.manual_description = true; }, 'MANUAL_DISTINCT_OR_LOCKED'],
  ['manual distinct pair', (p) => { p.canonical.metadata.manual_distinct_pair = true; p.redundant.metadata.manual_distinct_pair = true; }, 'MANUAL_DISTINCT_OR_LOCKED'],
  ['pair-level manual distinction', (p) => { p.manualDistinctPair = true; }, 'MANUAL_DISTINCT_OR_LOCKED'],
  ['prior tombstone', (p) => { p.redundant.metadata.merged_into_post_id = p.canonical.id; }, 'EXISTING_DEDUP_TOMBSTONE'],
  ['canonical newer', (p) => { p.canonical.created_at = '2098-01-04T00:00:00.000001Z'; }, 'CANONICAL_NOT_OLDEST'],
  ['canonical expired', (p) => { p.canonical.expires_at = '2098-01-02T00:00:00.000000Z'; }, 'CANONICAL_EXPIRED'],
  ['not both public', (p) => { p.redundant.status = 'closed'; }, 'NOT_TWO_PUBLIC_POSTS'],
  ['cover differs from media', (p) => { p.redundant.image_url = 'https://example.test/missing.png'; }, 'REDUNDANT_COVER_MISMATCH'],
  ['media snapshot incomplete', (p) => { delete p.redundantMedia[0].created_at; }, 'INVALID_MEDIA_SNAPSHOT'],
  ['typed media ID required', (p) => { p.redundantMedia[0].id = [p.redundantMedia[0].id]; }, 'INVALID_MEDIA_SNAPSHOT'],
  ['source URL with embedded credentials', (p) => { p.redundant.metadata.source_url = 'https://user:pass@example.test/edital-2098'; }, 'SOURCE_IDENTITY_MISSING'],
  ['post snapshot incomplete', (p) => { delete p.redundant.updated_at; }, 'INVALID_POST_SNAPSHOT'],
];

for (const [name, change, code] of blocked) {
  const pair = clone();
  change(pair);
  const before = JSON.stringify(pair);
  const result = assessAtomicDedupPreview(pair, fixedNow);
  assert.equal(result.decision, 'blocked', name);
  assert(result.reasons.includes(code), `${name}: expected ${code}, got ${result.reasons.join(', ')}`);
  assert.equal(result.requiredBeforeMutation, undefined, name);
  assert.equal(JSON.stringify(pair), before, `${name}: preview may not mutate input`);
}

console.log(JSON.stringify({
  passed: blocked.length + 1,
  permittedMutations: 0,
  contract: 'cadu-atomic-dedup-preview-v1',
  fixture: 'synthetic',
}));
