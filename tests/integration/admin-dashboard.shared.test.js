const DashboardUtils = require('../../assets/js/controllers/admin/admin-dashboard.shared.js');

describe('KCAdminDashboardUtils', () => {
  test('canonicalizeTerm normaliza sinonimos e plural simples', () => {
    expect(DashboardUtils.canonicalizeTerm('  Quartos ')).toBe('quarto');
    expect(DashboardUtils.canonicalizeTerm('Empregos')).toBe('vaga');
    expect(DashboardUtils.canonicalizeTerm('Celulares')).toBe('celular');
    expect(DashboardUtils.canonicalizeTerm('Ônibus')).toBe('onibus');
    expect(DashboardUtils.canonicalizeTerm('inglês')).toBe('ingles');
    expect(DashboardUtils.canonicalizeTerm('campus')).toBe('campus');
    expect(DashboardUtils.canonicalizeTerm('lápis')).toBe('lapis');
    expect(DashboardUtils.classifyTermToModule('vaga', {})).toBe('oportunidades');
  });

  test('buildModuleShareRows agrega termos por modulo e calcula share', () => {
    const rows = DashboardUtils.buildModuleShareRows([
      { term: 'quarto', count: 4 },
      { term: 'republicas', count: 2 },
      { term: 'celulares', count: 4 }
    ], {});

    expect(rows).toHaveLength(2);
    expect(rows[0].module).toBe('moradia');
    expect(rows[0].count).toBe(6);
    expect(rows[0].share).toBe(60);
    expect(rows[1].module).toBe('compra-venda');
    expect(rows[1].count).toBe(4);
    expect(rows[1].share).toBe(40);
  });

  test('buildDailyMetricsFromEventSets agrega eventos por dia', () => {
    const series = DashboardUtils.buildDailyMetricsFromEventSets({
      posts: [{ created_at: '2026-03-20T10:00:00Z' }],
      comments: [{ created_at: '2026-03-20T12:00:00Z' }, { created_at: '2026-03-21T12:00:00Z' }],
      searches: [{ created_at: '2026-03-21T09:00:00Z' }],
      votes: [{ created_at: '2026-03-21T15:00:00Z' }],
      admin_actions: [{ created_at: '2026-03-21T18:00:00Z' }]
    }, '2026-03-20T00:00:00Z', '2026-03-21T23:59:59Z');

    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({
      day: '2026-03-20',
      posts_count: 1,
      comments_count: 1,
      searches_count: 0,
      votes_count: 0,
      admin_actions_count: 0,
      total_count: 2
    });
    expect(series[1]).toMatchObject({
      day: '2026-03-21',
      posts_count: 0,
      comments_count: 1,
      searches_count: 1,
      votes_count: 1,
      admin_actions_count: 1,
      total_count: 4
    });
  });

  test('buildActivityPulseSummary identifica pico e media', () => {
    const summary = DashboardUtils.buildActivityPulseSummary([
      { day: '2026-03-20', total_count: 2, posts_count: 1, comments_count: 1, searches_count: 0, votes_count: 0, admin_actions_count: 0 },
      { day: '2026-03-21', total_count: 5, posts_count: 1, comments_count: 1, searches_count: 2, votes_count: 1, admin_actions_count: 0 }
    ]);

    expect(summary.peakTotal).toBe(5);
    expect(summary.peakDay.day).toBe('2026-03-21');
    expect(summary.averageTotal).toBe(3.5);
    expect(summary.totals.searches_count).toBe(2);
  });

  test('buildDailyMetricsSeries mantém N dias exatos nos períodos do dashboard', () => {
    [1, 7, 30, 90, 365].forEach((days) => {
      const until = new Date('2026-07-16T15:00:00-03:00');
      const since = new Date(until);
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));
      const series = DashboardUtils.buildDailyMetricsSeries([], since.toISOString(), until.toISOString());
      expect(series).toHaveLength(days);
    });
  });

  test('janela anterior tem exatamente a mesma duração da janela atual', () => {
    [1, 7, 30, 90, 365].forEach((days) => {
      const until = new Date('2026-07-16T15:00:00-03:00');
      const since = new Date('2026-07-16T00:00:00-03:00');
      since.setDate(since.getDate() - (days - 1));
      const previousSince = new Date(DashboardUtils.getComparablePreviousSince(
        since.toISOString(),
        until.toISOString()
      ));
      expect(since.getTime() - previousSince.getTime()).toBe(until.getTime() - since.getTime());
    });
  });

  test('ranking declara janelas móveis independentes dos dias civis do dashboard', () => {
    expect(DashboardUtils.getRankingWindowContext(1)).toMatchObject({
      period: 'day',
      periodDays: 1,
      windowDays: 1,
      windowType: 'rolling',
      periodLabel: 'Últimas 24 horas (janela móvel)'
    });
    expect(DashboardUtils.getRankingWindowContext(7)).toMatchObject({
      period: 'week',
      periodDays: 7,
      periodLabel: 'Últimos 7 dias corridos (janela móvel)'
    });
    expect(DashboardUtils.getRankingWindowContext(30)).toMatchObject({
      period: 'month',
      periodDays: 30,
      periodLabel: 'Últimos 30 dias corridos (janela móvel)'
    });
    expect(DashboardUtils.getRankingWindowContext(90).period).toBe('quarter');
    expect(DashboardUtils.getRankingWindowContext(365).period).toBe('year');
  });

  test('fallback diário agrupa timestamps no dia civil de São Paulo', () => {
    const series = DashboardUtils.buildDailyMetricsFromEventSets({
      posts: [{ created_at: '2026-07-17T02:30:00Z' }]
    }, '2026-07-16T03:00:00Z', '2026-07-16T23:59:59-03:00');

    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ day: '2026-07-16', posts_count: 1 });
  });

  test('pulso exclui sessões distintas e impressões, mas preserva ações de anúncio', () => {
    const series = DashboardUtils.buildDailyMetricsSeries([{
      day: '2026-07-16',
      posts_count: 1,
      sessions_count: 8,
      ad_clicks_count: 2,
      ad_impressions_count: 100
    }], '2026-07-16', '2026-07-16');

    expect(series[0].total_count).toBe(3);
  });

  test('alertas de publicidade não tratam fonte indisponível como zero confirmado', () => {
    const alerts = DashboardUtils.buildOperationalAlerts({
      periodDays: 30,
      auditAvailable: true,
      auditEvents: 0,
      ads: {
        source: 'partial',
        campaigns: { active: 2 },
        metrics: { impressions: null, clicks: null },
        active_without_impressions: null,
        expired_active: null,
        settings: { status: null }
      }
    });

    expect(alerts.some((alert) => alert.title === 'Campanhas sem entrega')).toBe(false);
    expect(alerts.some((alert) => alert.title === 'Publicidade com cliques')).toBe(false);
  });

  test('alertas não tratam auditoria indisponível como ausência de incidentes', () => {
    const alerts = DashboardUtils.buildOperationalAlerts({
      periodDays: 30,
      auditAvailable: false,
      auditEvents: null,
      ads: {
        source: 'fallback',
        campaigns: { active: 0 },
        metrics: { impressions: 0, clicks: 0 },
        active_without_impressions: 0,
        expired_active: 0,
        settings: { status: 'disabled' }
      }
    });

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Auditoria indisponível', tone: 'warning' })
    ]));
    expect(alerts.some((alert) => alert.title === 'Sem incidentes recentes')).toBe(false);
  });
});
