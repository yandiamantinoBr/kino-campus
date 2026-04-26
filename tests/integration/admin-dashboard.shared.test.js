const DashboardUtils = require('../../assets/js/controllers/admin/admin-dashboard.shared.js');

describe('KCAdminDashboardUtils', () => {
  test('canonicalizeTerm normaliza sinonimos e plural simples', () => {
    expect(DashboardUtils.canonicalizeTerm('  Quartos ')).toBe('quarto');
    expect(DashboardUtils.canonicalizeTerm('Empregos')).toBe('vaga');
    expect(DashboardUtils.canonicalizeTerm('Celulares')).toBe('celular');
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
});
