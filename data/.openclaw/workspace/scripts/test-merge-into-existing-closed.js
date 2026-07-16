#!/usr/bin/env node
/**
 * test-merge-into-existing-closed.js
 *
 * FIX 2026-07-15: O `mergeIntoExisting` precisa reativar posts com
 * `status: 'closed'` (auto-close por data passada ou admin_close) quando
 * há um item NOVO para o mesmo source. Caso contrário, o item novo vira
 * `hidden` e o post closed fica inativo — a UI mostra "encerrado" e nada
 * é publicado, mesmo com N publicáveis identificados pelo curador.
 *
 * Estes testes isolam a função de patch do `mergeIntoExisting` e validam
 * o comportamento de reativação:
 *   - `closed` + novo item → reativar para `published` + audit trail
 *   - `closed` + reativar DEDO (opt-out) → manter `closed`
 *   - `hidden` + reativarIfHidden default → reativar para `published`
 *   - `published` → manter `published` (no patch.status change)
 *
 * Não fazem I/O real (Supabase client stubado).
 */

'use strict';

const assert = require('assert');
const { Module } = require('module');

// Stub do supabase-js para evitar dependência em runtime real.
const updateCalls = [];
const existingPosts = new Map();
const fakeSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: existingPosts.get('latest') || null }),
      }),
    }),
    update: (patch) => {
      updateCalls.push(patch);
      return {
        eq: async () => ({ error: null, data: [{ id: 'fake', ...patch }] }),
      };
    },
  }),
};

function loadMergeIntoExisting() {
  // Hack: carrega publish_auto_v5.js como source, extrai a função.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, 'publish_auto_v5.js'),
    'utf8',
  );
  const m = src.match(/async function mergeIntoExisting[\s\S]+?\n\}/);
  if (!m) throw new Error('mergeIntoExisting not found in source');
  // Injeta um Module wrapper simples
  const code = `${m[0]}\nmodule.exports = { mergeIntoExisting };`;
  const Module = require('module');
  const mod = new Module('mergeStub');
  mod._compile(code, 'mergeStub.js');
  return mod.exports.mergeIntoExisting;
}

const mergeIntoExisting = loadMergeIntoExisting();

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

(async () => {
  console.log('🧪 test-merge-into-existing-closed.js');
  console.log('============================================================');

  await test('closed + item novo → reativa para published + audit trail', async () => {
    updateCalls.length = 0;
    existingPosts.set('latest', {
      id: 'old-post',
      status: 'closed',
      description: 'Old desc',
      image_url: 'https://example.com/old.jpg',
      metadata: { source_url: 'https://x.y/z' },
    });
    await mergeIntoExisting(fakeSupabase, 'old-post', {
      sourceUrl: 'https://x.y/z',
      title: 'Updated title',
      description: 'New longer description for the reopened event',
      image: 'https://example.com/new.jpg',
      link: 'https://x.y/z',
    });
    assert.strictEqual(updateCalls.length, 1);
    const patch = updateCalls[0];
    assert.strictEqual(patch.status, 'published', 'closed post deve virar published');
    assert.ok(patch._reactivated_from_closed_at, 'deve gravar audit trail');
    assert.strictEqual(patch._reactivated_from_closed_by, 'cadu-publish-merge');
  });

  await test('closed + opt-out (reactivateIfClosed=false) → mantém closed', async () => {
    updateCalls.length = 0;
    existingPosts.set('latest', {
      id: 'old-post-2',
      status: 'closed',
      description: 'Old',
      image_url: 'https://example.com/old.jpg',
      metadata: { source_url: 'https://x.y/z' },
    });
    await mergeIntoExisting(
      fakeSupabase,
      'old-post-2',
      { sourceUrl: 'https://x.y/z', description: 'New', image: 'https://i/new.jpg' },
      { reactivateIfClosed: false },
    );
    const patch = updateCalls[0];
    assert.notStrictEqual(patch.status, 'published', 'não deve reativar quando opt-out');
  });

  await test('hidden + default → reativa para published', async () => {
    updateCalls.length = 0;
    existingPosts.set('latest', {
      id: 'hidden-post',
      status: 'hidden',
      description: 'Old',
      image_url: 'https://example.com/old.jpg',
      metadata: { source_url: 'https://x.y/z' },
    });
    await mergeIntoExisting(fakeSupabase, 'hidden-post', {
      sourceUrl: 'https://x.y/z',
      description: 'New',
      image: 'https://i/new.jpg',
    });
    const patch = updateCalls[0];
    assert.strictEqual(patch.status, 'published', 'hidden post deve virar published');
  });

  await test('published → não mexe no status (sem audit trail)', async () => {
    updateCalls.length = 0;
    existingPosts.set('latest', {
      id: 'pub-post',
      status: 'published',
      description: 'Old',
      image_url: 'https://example.com/old.jpg',
      metadata: { source_url: 'https://x.y/z' },
    });
    await mergeIntoExisting(fakeSupabase, 'pub-post', {
      sourceUrl: 'https://x.y/z',
      description: 'New longer description for the post',
      image: 'https://i/new.jpg',
    });
    const patch = updateCalls[0];
    assert.ok(!('status' in patch), 'published não deve ter patch.status');
    assert.ok(!patch._reactivated_from_closed_at, 'não deve ter audit trail');
  });

  await test('merge_at + merge_reason gravados no metadata', async () => {
    updateCalls.length = 0;
    existingPosts.set('latest', {
      id: 'old-post-3',
      status: 'closed',
      description: 'Old',
      image_url: 'https://example.com/old.jpg',
      metadata: { source_url: 'https://x.y/z', old_field: 'preserved' },
    });
    await mergeIntoExisting(fakeSupabase, 'old-post-3', {
      sourceUrl: 'https://x.y/z',
      title: 'Updated',
      description: 'New',
      image: 'https://i/new.jpg',
    });
    const patch = updateCalls[0];
    assert.ok(patch.metadata, 'metadata deve estar no patch');
    assert.ok(patch.metadata.merged_at, 'merged_at deve estar setado');
    assert.ok(patch.metadata.merge_reason, 'merge_reason deve estar setado');
    assert.strictEqual(patch.metadata.source_url, 'https://x.y/z', 'source_url atualizado');
    assert.strictEqual(patch.metadata.old_field, 'preserved', 'campos antigos preservados');
  });

  console.log('============================================================');
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
