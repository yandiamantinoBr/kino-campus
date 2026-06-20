'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const Benchmark = require('../../scripts/benchmark-search-shadow.js');

const ROOT = path.resolve(__dirname, '..', '..');
const fixture = Benchmark.loadFixture();

describe('benchmark sintético do pipeline shadow', () => {
  test('cobre os seis módulos com dois cenários independentes por módulo', () => {
    const counts = fixture.cases.reduce((acc, entry) => {
      acc[entry.module] = (acc[entry.module] || 0) + 1;
      return acc;
    }, {});
    expect(Object.keys(counts).sort()).toEqual([
      'achados-perdidos', 'caronas', 'compra-venda', 'eventos', 'moradia', 'oportunidades'
    ]);
    Object.values(counts).forEach((count) => expect(count).toBe(2));
  });

  test('atinge recall, precisão e estabilidade integrais sem falsos positivos', () => {
    const report = Benchmark.runBenchmark(fixture);
    expect(report.totals).toMatchObject({
      cases: 12,
      passedCases: 12,
      expected: 12,
      hits: 12,
      falsePositives: 0,
      recall: 1,
      precision: 1,
      stability: 1
    });
    Object.values(report.modules).forEach((entry) => {
      expect(entry).toMatchObject({ cases: 2, passed: 2, recall: 1, precision: 1 });
    });
  });

  test('declara data de carona como lacuna do schema sem degradar filtros confiáveis', () => {
    const report = Benchmark.runBenchmark(fixture);
    const ride = report.cases.find((entry) => entry.id === 'caronas-route-time');
    const event = report.cases.find((entry) => entry.id === 'events-weekday-free');
    expect(ride.actualIds).toEqual(['ride-18']);
    expect(ride.deferredFilters).toEqual(['relativeDate']);
    expect(event.deferredFilters).toEqual([]);
  });

  test('relatório não reproduz consultas nem conteúdo dos posts', () => {
    const serialized = JSON.stringify(Benchmark.runBenchmark(fixture));
    fixture.cases.forEach((entry) => {
      expect(serialized).not.toContain(entry.query);
      entry.posts.forEach((post) => {
        if (post.description) expect(serialized).not.toContain(post.description);
      });
    });
  });

  test('CLI é executável, falha fechada e mantém p95 sob teto de regressão', () => {
    const output = execFileSync(process.execPath, [path.join(ROOT, 'scripts/benchmark-search-shadow.js')], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    const report = JSON.parse(output);
    expect(report.totals.passedCases).toBe(report.totals.cases);
    expect(report.totals.latencyMs.p95).toBeLessThan(500);
  });
});
