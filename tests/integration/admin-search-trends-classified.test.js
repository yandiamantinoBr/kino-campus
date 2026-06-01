'use strict';

/**
 * Tendências de busca — classificação data-driven (termo → módulo pelo conteúdo).
 * Cobre: migration do RPC classificado; resolveTermModule (server-first com
 * limiar de confiança + reserva por dicionário); wiring no loader/render; e o
 * dicionário reserva ampliado.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHARED = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.shared.js');

describe('Tendências — migration do RPC classificado', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/20260531200000_admin_search_trends_classified.sql');
  });

  test('cria o par público (INVOKER) → kc_private (DEFINER)', () => {
    expect(sql).toContain('create function kc_private.kc_admin_search_trends_classified');
    expect(sql).toContain('create function public.kc_admin_search_trends_classified');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('select * from kc_private.kc_admin_search_trends_classified($1, $2)');
  });

  test('classifica por conteúdo dos posts (título/descrição) → módulo dominante', () => {
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

describe('Tendências — resolveTermModule (server-first + reserva)', () => {
  let utils;
  beforeAll(() => { utils = require(SHARED); });

  test('usa o módulo do servidor quando a confiança é alta', () => {
    expect(utils.resolveTermModule({ term: 'conpeex', module: 'eventos', module_confidence: 0.8 }, {})).toBe('eventos');
  });

  test('cai no dicionário quando a confiança do servidor é baixa', () => {
    // "livro" casa eventos por conteúdo com baixa confiança, mas o dicionário acerta livros
    expect(utils.resolveTermModule({ term: 'livro', module: 'eventos', module_confidence: 0.43 }, {})).toBe('livros');
  });

  test('usa o dicionário quando o servidor não classificou', () => {
    expect(utils.resolveTermModule({ term: 'celular', module: null }, {})).toBe('compra-venda');
  });

  test('usa o servidor de baixa confiança como último recurso (sem palavra-chave)', () => {
    expect(utils.resolveTermModule({ term: 'zzznaoexiste', module: 'caronas', module_confidence: 0.3 }, {})).toBe('caronas');
  });

  test('aggregateTrendsByModule respeita o módulo do servidor', () => {
    const rows = utils.aggregateTrendsByModule([{ term: 'qualquer', count: 3, module: 'eventos', module_confidence: 0.9 }], {});
    expect(rows[0].module).toBe('eventos');
  });
});

describe('Tendências — wiring + dicionário ampliado', () => {
  test('loader chama o RPC classificado e preserva o módulo', () => {
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

  test('dicionário reserva ganhou termos de eventos/oportunidades', () => {
    const utils = require(SHARED);
    expect(utils.MODULE_KEYWORDS.eventos).toContain('conpeex');
    expect(utils.MODULE_KEYWORDS.eventos).toContain('sbpc');
    expect(utils.MODULE_KEYWORDS.oportunidades).toContain('bolsista');
  });
});
