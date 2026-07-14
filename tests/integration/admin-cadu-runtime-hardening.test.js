'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8',
);
const html = fs.readFileSync(path.join(ROOT, 'admin/cadu.html'), 'utf8');

function functionSource(name) {
  const start = controller.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const bodyStart = controller.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < controller.length; index += 1) {
    if (controller[index] === '{') depth += 1;
    if (controller[index] === '}') depth -= 1;
    if (depth === 0) return controller.slice(start, index + 1);
  }
  throw new Error(`function ${name} is incomplete`);
}

function isolatedFunction(name, dependencies = []) {
  return Function(
    '"use strict";\n' +
    dependencies.map((dependency) => `const ${dependency} = ${functionSource(dependency)};`).join('\n') +
    `\nreturn (${functionSource(name)});`,
  )();
}

describe('admin Cadu runtime hardening', () => {
  test('marks OpenClaw online only after the command proves ok=true', () => {
    const openclawStatusData = isolatedFunction('openclawStatusData');
    expect(openclawStatusData({ status: { ok: false, data: { agents: {} } } })).toBeNull();
    expect(openclawStatusData({ status: { data: { agents: {} } } })).toBeNull();
    expect(openclawStatusData({ data: { agents: {} } })).toBeNull();
    expect(openclawStatusData({ status: { ok: true, data: { agents: { defaultId: 'main' } } } }))
      .toEqual({ agents: { defaultId: 'main' } });
    expect(controller).not.toContain("|| 'deepseek-v4-pro'");
    expect(controller).not.toContain("'ctx 1M'");
  });

  test('keeps legacy pipeline stages visible while their actions remain fail-closed', () => {
    const pipelineStagesForDisplay = isolatedFunction('pipelineStagesForDisplay', [
      'isSafePipelineStageId',
      'isSafePipelineRunId',
      'normalizePipelineRun',
      'normalizePipelineStageForDisplay',
    ]);
    const stages = pipelineStagesForDisplay({
      stages: [{
        id: 'curator',
        name: 'Curador UFG',
        description: 'Coleta sites institucionais',
        script: 'scripts/cadu-curador.js',
        estimated_sec: 180,
        category: 'scan',
      }],
    });
    expect(stages).toEqual([expect.objectContaining({ id: 'curator', preflight: null })]);
    expect(pipelineStagesForDisplay({
      stages: [{
        id: '../publish',
        name: 'Unsafe',
        description: '',
        script: 'x',
        estimated_sec: 1,
        category: 'publish',
      }],
    })).toEqual([]);
    expect(controller).toContain("if (!actionButtons.length) actionButtons.push(actionButton(null, 'Execução bloqueada', false));");
  });

  test('polls OpenClaw at most once per minute, singleflight, and only while visible', () => {
    expect(controller).toContain('var OPENCLAW_POLL_INTERVAL_MS = 60000;');
    expect(controller).toContain('if (openclawState.refreshPromise) return openclawState.refreshPromise;');
    expect(controller).toContain('now - openclawState.lastRefreshStartedAt < OPENCLAW_POLL_INTERVAL_MS');
    expect(controller).toContain("return Promise.resolve({ skipped: 'cooldown' });");
    expect(controller).toContain("if (typeof document !== 'undefined' && document.hidden)");
    expect(controller).toContain("document.addEventListener('visibilitychange'");
    expect(controller).toContain('refreshAll({ forceOperational: true });');
    expect(controller).not.toContain('}, 15000);');
    expect(controller).not.toContain('Bot: 8746');
  });

  test('does not leave pipeline health indefinitely loading on a legacy snapshot', () => {
    const invalidSnapshotBranch = controller.slice(
      controller.indexOf('if (!validation.ok)'),
      controller.indexOf('var normalizedStages = validation.stages'),
    );
    expect(invalidSnapshotBranch).toContain('else refreshPipelineHealth();');
  });

  test('classifies a three-day-old feed as stale without pretending reload triggers collection', () => {
    const feedTimestampMs = isolatedFunction('feedTimestampMs');
    const newestFeedTimestamp = Function(
      `"use strict"; const feedTimestampMs = ${functionSource('feedTimestampMs')}; return (${functionSource('newestFeedTimestamp')});`,
    )();
    expect(feedTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(feedTimestampMs('2026-07-11T12:00:00Z')).toBe(Date.parse('2026-07-11T12:00:00Z'));
    expect(newestFeedTimestamp([
      { created_at: '2026-07-10T12:00:00Z' },
      { created_at: '2026-07-11T12:00:00Z' },
    ])).toBe(Date.parse('2026-07-11T12:00:00Z'));
    expect(html).toContain('id="feed-freshness-status"');
    expect(controller).toContain('Recarregar consulta o índice; a coleta é executada pela pipeline.');
  });

  test('does not hardcode an obsolete curator version in the operator explanation', () => {
    expect(html).not.toContain('Saída do script <code>cadu-curador-v4.4.js</code>');
    expect(html).toContain('A versão e o script ativos são informados pelo preflight do cadu-api');
  });
});
