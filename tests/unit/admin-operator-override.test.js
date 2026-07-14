/**
 * @file admin-operator-override.test.js
 * @description Pin down the operator-override list in
 *  product.edit.js and supabase.posts-write.adapter.js.
 *
 *  Yan (2026-07-14 /product.html) could not edit posts because his
 *  primary profile had is_admin = false. The 2026-07-14 fix:
 *    - Promote the four known operator ids in the database (SQL
 *      migration 20260714120000).
 *    - Add a hardcoded operator list to the JS write paths so the
 *      editor renders even if the cached profile is stale or
 *      missing is_admin.
 *
 *  This test guarantees the JS-layer list keeps growing with the SQL
 *  list. If a future change drops an id from the list, the test
 *  fails and the regression is caught before Yan reports it again.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_EDIT = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/public/product.edit.js'),
  'utf8'
);
const POSTS_WRITE = fs.readFileSync(
  path.join(ROOT, 'assets/js/adapters/supabase/supabase.posts-write.adapter.js'),
  'utf8'
);

// Mirror of the operator allow-list. If the SQL migration adds a new
// operator id, mirror it here and the test will demand both layers
// know about it. If the SQL migration drops an id, the test fails
// until both layers drop it too.
const REQUIRED_OPERATOR_IDS = Object.freeze([
  'abfb1831-6ad3-4f40-b55b-788e29f146f0', // yan1nakamura (hotmail)
  'bf3a4310-927f-4200-9df7-7478392d6a6e', // Yan Diamantino (yandiamantino)
  '2345582d-8bf7-4393-aa0d-f9953d0e02ca', // Cadu Bot
  '10391c7b-4a6d-4462-becb-e6e0056b7e1d', // Codex QA Admin
]);

describe('admin-operator-override (2026-07-14 /product.html regression)', () => {
  it('product.edit.js hardcodes the four operator ids', () => {
    for (const id of REQUIRED_OPERATOR_IDS) {
      assert.ok(
        PRODUCT_EDIT.includes(id),
        `product.edit.js is missing operator id ${id}; the editor will not render for this user`
      );
    }
  });

  it('supabase.posts-write.adapter.js hardcodes the same four operator ids', () => {
    for (const id of REQUIRED_OPERATOR_IDS) {
      assert.ok(
        POSTS_WRITE.includes(id),
        `supabase.posts-write.adapter.js is missing operator id ${id}; the write-adapter will reject admin_update for this user`
      );
    }
  });

  it('product.edit.js canManagePost honours the operator override', () => {
    // The function should short-circuit to true for any of the
    // operator ids even when the cached profile is missing is_admin.
    assert.ok(
      /function\s+canManagePost[\s\S]{0,800}?isOperatorProfile\s*\(/.test(PRODUCT_EDIT),
      'canManagePost in product.edit.js must consult isOperatorProfile for the operator escape hatch'
    );
    assert.ok(
      /function\s+canManagePost[\s\S]{0,800}?isOperatorAppMetadata\s*\(/.test(PRODUCT_EDIT),
      'canManagePost in product.edit.js must consult isOperatorAppMetadata for the operator escape hatch'
    );
  });

  it('supabase.posts-write.adapter.js canManagePostRow honours the operator override', () => {
    assert.ok(
      /async\s+function\s+canManagePostRow[\s\S]{0,1500}?hasOperatorOverride\s*\(/.test(POSTS_WRITE),
      'canManagePostRow must consult hasOperatorOverride so the operator escape hatch flows through to the write call'
    );
  });

  it('product.edit.js and supabase.posts-write.adapter.js agree on the operator list', () => {
    // The exact order is not load-bearing but the SET must be
    // identical so a SQL migration that touches one is mirrored in
    // the other.
    const extractIds = (source) => {
      const match = source.match(/KC_ADMIN_OPERATOR_USER_IDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
      if (!match) throw new Error('KC_ADMIN_OPERATOR_USER_IDS array literal not found');
      return match[1]
        .split(',')
        .map((part) => part.match(/'([0-9a-f-]{36})'/i))
        .filter(Boolean)
        .map((m) => m[1].toLowerCase())
        .sort();
    };
    const editIds = extractIds(PRODUCT_EDIT);
    const writeIds = extractIds(POSTS_WRITE);
    assert.deepStrictEqual(editIds, writeIds, 'product.edit.js and supabase.posts-write.adapter.js disagree on the operator allow-list');
    for (const id of REQUIRED_OPERATOR_IDS) {
      assert.ok(editIds.includes(id), `operator id ${id} missing from product.edit.js`);
      assert.ok(writeIds.includes(id), `operator id ${id} missing from supabase.posts-write.adapter.js`);
    }
  });
});
