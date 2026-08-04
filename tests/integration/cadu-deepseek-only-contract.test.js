'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const runtimePaths = [
  'data/.openclaw/workspace/scripts/formatador-ia.js',
  'data/.openclaw/workspace/scripts/dedup-kino.js',
  'data/.openclaw/workspace/skills/cadu-api/pipeline.py',
  'data/.openclaw/workspace/TOOLS.md',
  'services/cadu-ufg-publisher/src/model.js',
  'services/cadu-ufg-publisher/.env.example',
  'services/cadu-ufg-publisher/docs/cadu-operator-guide.md',
  'supabase/functions/cadu-publish/mapper.ts',
];

const removedProviderNames = [
  ['mini', 'max'].join(''),
  ['z', 'ai'].join(''),
  ['z', '\\.', 'ai'].join(''),
  ['g', 'lm'].join(''),
  ['moon', 'shot'].join(''),
  ['open', 'router'].join(''),
  ['q', 'wen'].join(''),
  ['open', 'ai'].join(''),
];
const removedProviderPattern = new RegExp(`(?:${removedProviderNames.join('|')})`, 'i');

describe('Cadu DeepSeek-only contract', () => {
  test.each(runtimePaths)('%s has no removed provider wiring', (relativePath) => {
    expect(read(relativePath)).not.toMatch(removedProviderPattern);
  });

  test('formatter and dedup default to Flash, allow only Pro, and pin the official endpoint', () => {
    const formatter = read('data/.openclaw/workspace/scripts/formatador-ia.js');
    const dedup = read('data/.openclaw/workspace/scripts/dedup-kino.js');

    for (const source of [formatter, dedup]) {
      expect(source).toContain("'deepseek-v4-flash'");
      expect(source).toContain("'deepseek-v4-pro'");
      expect(source).toContain("hostname !== 'api.deepseek.com'");
      expect(source).toContain("'/v1/chat/completions'");
    }
    expect(formatter).toContain("const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'");
    expect(formatter).not.toContain('dependencies.provider');
    expect(dedup).toContain("String(value || 'deepseek-v4-flash')");
    expect(dedup).toContain("thinking: { type: 'disabled' }");
    expect(dedup).toContain("response_format: { type: 'json_object' }");
    expect(dedup).not.toContain('reasoning_effort');
  });

  test('publisher example and model resolver expose the same strict contract', () => {
    const envExample = read('services/cadu-ufg-publisher/.env.example');
    const model = read('services/cadu-ufg-publisher/src/model.js');

    expect(envExample).toContain('CADU_DEEPSEEK_MODEL=deepseek-v4-flash');
    expect(envExample).toContain(
      'CADU_DEEPSEEK_ENDPOINT=https://api.deepseek.com/v1/chat/completions',
    );
    expect(model).toContain("!['deepseek-v4-flash', 'deepseek-v4-pro'].includes(model)");
    expect(model).toContain("url.hostname !== 'api.deepseek.com'");
  });

  // 2026-08-04 (cost controls — mirror of openclaw-cadu PR #148): the
  // publisher summarizer must request the DeepSeek V4 ephemeral cache
  // and cap max_tokens so a single run cannot burst a 4K output. The
  // system prompt is byte-identical across the same publish run, so
  // the cache_hit rate (1/50 of cache_miss) is the cheapest possible
  // input cost on V4-Flash.
  test('publisher summarizer pins the V4 cost control contract', () => {
    const model = read('services/cadu-ufg-publisher/src/model.js');

    expect(model).toContain("cache_control: { type: 'ephemeral' }");
    expect(model).toMatch(/max_tokens:\s*1000\b/);
    expect(model).toContain("thinking: { type: 'disabled' }");
    expect(model).not.toMatch(/max_tokens:\s*[2-9]\d{3,}\b/);
  });

  test('local Supabase Studio has no external text-model credential configured', () => {
    const config = read('supabase/config.toml').toLowerCase();
    const removedCredential = ['open', 'ai_api_key'].join('');
    expect(config).not.toContain(removedCredential);
  });

  test('current admin state is Flash-first and marks old provider mentions as historical', () => {
    const state = read('docs/CADU-ADMIN-STATE.md');
    expect(state).toContain('Nota de migração de modelos (2026-08-02)');
    expect(state).toContain('main + deepseek-v4-flash + ctx 1M');
    expect(state).toContain('consome chave DeepSeek e gera `_formatted_*.json`');
  });
});
