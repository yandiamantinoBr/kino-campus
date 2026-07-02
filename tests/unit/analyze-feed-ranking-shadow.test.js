'use strict';

const Policy = require('../../assets/js/shared/kc-feed-ranking-policy.shared.js');
const Shadow = require('../../scripts/analyze-feed-ranking-shadow.js');

const NOW = '2026-07-02T12:00:00.000Z';

describe('diagnostico shadow de ranking do feed', () => {
  test('extrai KC_ENV publico sem depender de segredos locais', () => {
    const parsed = Shadow.parsePublicEnv(`
      window.KC_ENV = {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-public-key'
      };
    `);
    expect(parsed).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'anon-public-key'
    });
  });

  test('classifica evento sem data como problema alto de revisao', () => {
    const entry = Policy.rankForShadow([{
      id: 'event-news',
      module: 'eventos',
      status: 'published',
      title: 'FANUT Conecta: Faculdade de Nutricao lanca novo canal oficial',
      description: 'Canal institucional com informacoes gerais e novidades da unidade.',
      metadata: {
        cadu_published: true,
        source_url: 'https://fanut.ufg.br/n/198698'
      }
    }], { now: NOW, diversify: false })[0];
    const issue = Shadow.classifyIssue(entry);
    expect(issue).toMatchObject({
      severity: 'high',
      state: 'needs-review',
      reasons: ['missing-event-date'],
      caduPublished: true
    });
    expect(issue.suggestion).toMatch(/reclassificar|oportunidade|evento sem data/i);
  });

  test('resume amostra por modulo, estado e razao', () => {
    const entries = Policy.rankForShadow([
      {
        id: 'active-event',
        module: 'eventos',
        status: 'published',
        title: 'Workshop futuro da UFG',
        description: 'Atividade com data confirmada e fonte oficial.',
        metadata: { data_evento: '2026-07-03', source_url: 'https://ufg.br/e/1' }
      },
      {
        id: 'missing-deadline',
        module: 'oportunidades',
        status: 'published',
        title: 'Selecao com inscricoes abertas',
        description: 'Oportunidade sem prazo estruturado.',
        metadata: { cadu_published: true, source_url: 'https://inf.ufg.br/n/1' }
      }
    ], { now: NOW, diversify: false });

    expect(Shadow.summarize(entries)).toMatchObject({
      total: 2,
      active: 2,
      inactive: 0,
      byModule: { eventos: 1, oportunidades: 1 },
      byState: { active: 2 },
      byReason: { 'missing-deadline': 1 }
    });
  });
});
