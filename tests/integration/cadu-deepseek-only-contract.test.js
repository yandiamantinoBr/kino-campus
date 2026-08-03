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
