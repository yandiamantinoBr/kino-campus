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

  test('reconhece sinais historicos de publicacao pelo Cadu', () => {
    expect(Shadow.isCaduPublished({ metadata: { cadu_published: true } })).toBe(true);
    expect(Shadow.isCaduPublished({ metadata: { published_by_cadu: true } })).toBe(true);
    expect(Shadow.isCaduPublished({ metadata: { cadu_run_id: 'cadu-full-1' } })).toBe(true);
    expect(Shadow.isCaduPublished({ metadata: { source_url: 'https://ufg.br/n/1' } })).toBe(false);
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

  test('monta fila operacional para Cadu corrigir metadados do feed', () => {
    const entries = Policy.rankForShadow([
      {
        id: 'missing-deadline',
        module: 'oportunidades',
        status: 'published',
        title: 'Selecao com inscricoes abertas',
        description: 'Oportunidade sem prazo estruturado.',
        metadata: { cadu_run_id: 'cadu-full-1', source_url: 'https://inf.ufg.br/n/1' }
      },
      {
        id: 'missing-event-date',
        module: 'eventos',
        status: 'published',
        title: 'Curso com inscricoes abertas',
        description: 'Inscricoes abertas para curso da UFG.',
        metadata: { published_by_cadu: true, source_url: 'https://ciar.ufg.br/n/2' }
      },
      {
        id: 'active-event',
        module: 'eventos',
        status: 'published',
        title: 'Workshop com data',
        description: 'Evento ativo.',
        metadata: { data_evento: '2026-07-04', source_url: 'https://ufg.br/e/3' }
      }
    ], { now: NOW, diversify: false });

    const triage = Shadow.buildCaduTriage(entries, { limit: 10 });

    expect(triage).toMatchObject({
      total: 2,
      caduMarked: 2,
      byReason: {
        'missing-deadline': 1,
        'missing-event-date': 1
      },
      byRepairAction: {
        extract_deadline_date: 1,
        fill_data_evento_or_reclassify: 1
      }
    });
    expect(triage.queues.missingDeadlines[0]).toMatchObject({
      id: 'missing-deadline',
      repairAction: 'extract_deadline_date',
      caduRunId: 'cadu-full-1',
      sourceHost: 'inf.ufg.br'
    });
    expect(triage.queues.eventDateReview[0]).toMatchObject({
      id: 'missing-event-date',
      repairAction: 'fill_data_evento_or_reclassify',
      sourceHost: 'ciar.ufg.br'
    });
  });
});
