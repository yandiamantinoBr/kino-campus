'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const Pipeline = require('../assets/js/shared/kc-search-shadow-pipeline.shared.js');
const Parser = require('../assets/js/shared/kc-search-query-parser.shared.js');
const Projector = require('../assets/js/shared/kc-search-fields.shared.js');
const SearchShared = require('../assets/js/shared/kc-search.shared.js');

function buildRegistry() {
  const resolvers = {
    getCaronasCampusOptions: () => [],
    getCaronasFeatureOptions: () => [],
    getHousingRegionOptions: () => [],
    getHousingFeatureOptions: () => [],
    getLostFoundLocationOptions: () => [],
    getOpportunityAreaOptions: () => [],
    normalizeOpportunityTypeKey: (value) => String(value || '').replace(/s$/, '')
  };
  const context = { window: { _KCCreatePost: { resolvers } }, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.schema.js'), 'utf8'), context);
  context.window._KCCreatePost.resolvers = resolvers;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.fields.js'), 'utf8'), context);
  return Projector.buildRegistry(context.window._KCCreatePost.schema, context.window._KCCreatePost.fields);
}

function loadFixture(filePath) {
  const target = filePath || path.join(ROOT, 'tests/fixtures/search-shadow-benchmark.v1.json');
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function runBenchmark(fixture, options = {}) {
  const registry = options.registry || buildRegistry();
  const dependencies = {
    parser: options.parser || Parser,
    registry,
    projector: options.projector || Projector,
    searchShared: options.searchShared || SearchShared,
    limit: options.limit || 10
  };
  const cases = Array.isArray(fixture && fixture.cases) ? fixture.cases : [];
  const durations = [];
  const moduleStats = {};
  let expectedTotal = 0;
  let hits = 0;
  let falsePositives = 0;
  let stableCases = 0;
  let passedCases = 0;

  const results = cases.map((entry) => {
    const runOptions = {
      ...dependencies,
      referenceDate: entry.referenceDate || fixture.referenceDate,
      now: entry.now || `${entry.referenceDate || fixture.referenceDate}T12:00:00-03:00`,
      surface: entry.surface || 'results',
      hideClosed: entry.hideClosed === true
    };
    const startedAt = performance.now();
    const first = Pipeline.runShadow(entry.query, entry.posts, runOptions);
    durations.push(performance.now() - startedAt);
    const second = Pipeline.runShadow(entry.query, entry.posts, runOptions);
    const stable = JSON.stringify(first) === JSON.stringify(second);
    if (stable) stableCases += 1;

    const actualIds = first.candidate.map((row) => row.id);
    const expectedIds = Array.isArray(entry.expectedIds) ? entry.expectedIds : [];
    const caseHits = expectedIds.filter((id) => actualIds.includes(id)).length;
    const caseFalsePositives = actualIds.filter((id) => !expectedIds.includes(id)).length;
    const missedIds = expectedIds.filter((id) => !actualIds.includes(id));
    const deferredFilters = first.comparison.deferredFilters || [];
    const expectedDeferred = Array.isArray(entry.expectedDeferredFilters) ? entry.expectedDeferredFilters : [];
    const deferredMatches = expectedDeferred.every((key) => deferredFilters.includes(key));
    const passed = stable && !missedIds.length && caseFalsePositives === 0 && deferredMatches;
    if (passed) passedCases += 1;
    expectedTotal += expectedIds.length;
    hits += caseHits;
    falsePositives += caseFalsePositives;

    if (!moduleStats[entry.module]) moduleStats[entry.module] = { cases: 0, passed: 0, expected: 0, hits: 0, falsePositives: 0 };
    const moduleEntry = moduleStats[entry.module];
    moduleEntry.cases += 1;
    moduleEntry.passed += passed ? 1 : 0;
    moduleEntry.expected += expectedIds.length;
    moduleEntry.hits += caseHits;
    moduleEntry.falsePositives += caseFalsePositives;

    return {
      id: entry.id,
      module: entry.module,
      passed,
      stable,
      actualIds,
      missedIds,
      falsePositiveIds: actualIds.filter((id) => !expectedIds.includes(id)),
      deferredFilters
    };
  });

  Object.keys(moduleStats).forEach((moduleKey) => {
    const entry = moduleStats[moduleKey];
    entry.recall = round(entry.expected ? entry.hits / entry.expected : 1);
    entry.precision = round(entry.hits + entry.falsePositives ? entry.hits / (entry.hits + entry.falsePositives) : 1);
  });

  return {
    version: fixture.version,
    pipelineVersion: Pipeline.VERSION,
    totals: {
      cases: cases.length,
      passedCases,
      expected: expectedTotal,
      hits,
      falsePositives,
      recall: round(expectedTotal ? hits / expectedTotal : 1),
      precision: round(hits + falsePositives ? hits / (hits + falsePositives) : 1),
      stability: round(cases.length ? stableCases / cases.length : 1),
      latencyMs: {
        median: round(percentile(durations, 0.5)),
        p95: round(percentile(durations, 0.95)),
        max: round(Math.max(0, ...durations))
      }
    },
    modules: moduleStats,
    cases: results
  };
}

function main() {
  const report = runBenchmark(loadFixture(process.argv[2]));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.totals.passedCases !== report.totals.cases) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { buildRegistry, loadFixture, runBenchmark };
