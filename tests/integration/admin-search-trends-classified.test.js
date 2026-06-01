'use strict';

/**
 * Search trends: data-driven classification (term -> module by post content).
 * Covers the classified RPC migration, server-first resolveTermModule, dashboard
 * wiring, fallback dictionary and fuzzy typo tolerance.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHARED = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.shared.js');

describe('Tendencias - migration do RPC classificado', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/20260531200000_admin_search_trends_classified.sql');
  });

  test('cria o par publico (INVOKER) -> kc_private (DEFINER)', () => {
    expect(sql).toContain('create function kc_private.kc_admin_search_trends_classified');
    expect(sql).toContain('create function public.kc_admin_search_trends_classified');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('select * from kc_private.kc_admin_search_trends_classified($1, $2)');
  });

  test('classifica por conteudo dos posts (titulo/descricao) -> modulo dominante', () => {
    expect(sql).toContain('module text');
    expect(sql).toContain('module_confidence numeric');
    expect(sql).toContain('join public.posts p');
    expect(sql).toContain('p.title ilike');
    expect(sql).toContain('p.description ilike');
    expect(sql).toContain('row_number() over (partition by term order by posts desc');
  });

  test('grants para authenticated/service_role; anon revogado', () => {
    expect(sql).toContain('grant execute on function public.kc_admin_search_trends_classified(integer, timestamptz) to authenticated, service_role');
    expect(sql).toContain('revoke all on function public.kc_admin_search_trends_classified(integer, timestamptz) from public, anon');
  });
});

describe('Tendencias - resolveTermModule (server-first + reserva)', () => {
  let utils;
  beforeAll(() => { utils = require(SHARED); });

  test('usa o modulo do servidor quando a confianca e alta', () => {
    expect(utils.resolveTermModule({ term: 'conpeex', module: 'eventos', module_confidence: 0.8 }, {})).toBe('eventos');
  });

  test('cai no dicionario quando a confianca do servidor e baixa', () => {
    expect(utils.resolveTermModule({ term: 'livro', module: 'eventos', module_confidence: 0.43 }, {})).toBe('livros');
  });

  test('usa o dicionario quando o servidor nao classificou', () => {
    expect(utils.resolveTermModule({ term: 'celular', module: null }, {})).toBe('compra-venda');
  });

  test('usa o servidor de baixa confianca como ultimo recurso (sem palavra-chave)', () => {
    expect(utils.resolveTermModule({ term: 'zzznaoexiste', module: 'caronas', module_confidence: 0.3 }, {})).toBe('caronas');
  });

  test('aggregateTrendsByModule respeita o modulo do servidor', () => {
    const rows = utils.aggregateTrendsByModule([{ term: 'qualquer', count: 3, module: 'eventos', module_confidence: 0.9 }], {});
    expect(rows[0].module).toBe('eventos');
  });
});

describe('Tendencias - wiring + dicionario ampliado', () => {
  test('loader chama o RPC classificado e preserva o modulo', () => {
    const src = r('assets/js/controllers/admin/admin-dashboard.metrics.js');
    expect(src).toContain("client.rpc('kc_admin_search_trends_classified'");
    expect(src).toContain('function canonicalizeClassifiedTrends');
    expect(src).toContain('agg.module = String(item.module)');
  });

  test('render usa resolveTermModule e mostra cobertura', () => {
    const src = r('assets/js/controllers/admin/admin-dashboard.charts.js');
    expect(src).toContain('function resolveTermModuleValue');
    expect(src).toContain('resolveTermModuleValue(deps, trend)');
    expect(src).toContain('admin-trends-coverage');
    expect(src).toContain('% classificados');
    expect(r('admin/index.html')).toContain('id="admin-trends-coverage"');
  });

  test('dicionario reserva ganhou termos de eventos/oportunidades', () => {
    const utils = require(SHARED);
    expect(utils.MODULE_KEYWORDS.eventos).toContain('conpeex');
    expect(utils.MODULE_KEYWORDS.eventos).toContain('sbpc');
    expect(utils.MODULE_KEYWORDS.oportunidades).toContain('bolsista');
  });
});

describe('Tendencias - classificador tolerante a typos (pg_trgm)', () => {
  const fuzzySql = r('supabase/migrations/20260601172451_search_fuzzy_query_terms_threshold.sql');

  test('usa word_similarity (pg_trgm, schema extensions) com limiar', () => {
    expect(fuzzySql).toContain('create or replace function kc_private.kc_admin_search_trends_classified');
    expect(fuzzySql).toContain('extensions.word_similarity(t.term, p.fuzzy_text)');
    expect(fuzzySql).toContain('>= 0.68');
  });

  test('inclui campos semanticos dos posts no caminho fuzzy', () => {
    expect(fuzzySql).toContain('posts_semantic as');
    expect(fuzzySql).toContain('public.kc_posts_search_tags_text');
    expect(fuzzySql).toContain('public.kc_posts_search_subcategory');
  });

  test('mantem o ilike (substring) como caminho principal', () => {
    expect(fuzzySql).toContain('p.title ilike');
    expect(fuzzySql).toContain('p.description ilike');
  });
});
