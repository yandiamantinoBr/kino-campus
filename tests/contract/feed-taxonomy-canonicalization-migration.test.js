'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260808152843_feed_taxonomy_canonicalization_20260808.sql'), 'utf8');
const proof = fs.readFileSync(path.join(ROOT, 'tests/sql/feed-taxonomy-canonicalization-proof.sql'), 'utf8');

describe('feed taxonomy canonicalization migration', () => {
  test('canonicaliza categorias por módulo no boundary do banco', () => {
    expect(migration).toContain('function public.kc_feed_category_key');
    expect(migration).toContain("when 'emprego' then 'empregos'");
    expect(migration).toContain("when 'apartamento' then 'apartamentos'");
    expect(migration).toContain("when 'ofereco-carona' then 'ofereco'");
    expect(migration).toContain('trg_posts_canonicalize_feed_fields');
  });

  test('normaliza características de carona e preço derivável', () => {
    expect(migration).toContain("when '4-mais-lugares' then 'quatro-mais-lugares'");
    expect(migration).toContain("v_meta->>'remuneracao'");
    expect(migration).toContain("v_meta->>'contribuicao'");
  });

  test('inclui prova SQL de aliases, deduplicação e trigger', () => {
    expect(proof).toContain('mechanical category aliases remain after backfill');
    expect(proof).toContain('ride feature aliases were not deduplicated');
    expect(proof).toContain('canonicalization trigger is missing');
    expect(proof).toContain('trigger did not synchronize ride category aliases');
    expect(proof).toContain('trigger did not derive opportunity remuneration price');
    expect(proof).toContain('trigger lost metadata-only category');
    expect(proof).toContain('trigger accepted non-object metadata');
  });
});
