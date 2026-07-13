const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);

function extractFunction(name) {
  const start = controller.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const bodyStart = controller.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < controller.length; index += 1) {
    if (controller[index] === '{') depth += 1;
    if (controller[index] === '}') depth -= 1;
    if (depth === 0) {
      // The extracted function is deliberately pure, so evaluating this exact
      // production source gives the contract test a real behavior surface.
      return Function(`"use strict"; return (${controller.slice(start, index + 1)});`)();
    }
  }
  throw new Error(`function ${name} is incomplete`);
}

function extractFunctionSource(name) {
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

describe('Cadu pipeline explicit dry-run contract', () => {
  const resolvePipelineDryRun = extractFunction('resolvePipelineDryRun');
  const buildPipelineRunRequest = extractFunction('buildPipelineRunRequest');
  const pipelineStageActionModes = extractFunction('pipelineStageActionModes');
  const lockPipelineActionButtons = extractFunction('lockPipelineActionButtons');
  const isSafePipelineRunId = extractFunction('isSafePipelineRunId');
  const validatePipelineControlSnapshot = Function(
    `"use strict";
     const PIPELINE_CONTROL_CONTRACT = 'cadu-pipeline-control-v1';
     const PIPELINE_SNAPSHOT_TTL_MS = 15000;
     const isSafePipelineStageId = ${extractFunctionSource('isSafePipelineStageId')};
     const isSafePipelineRunId = ${extractFunctionSource('isSafePipelineRunId')};
     const normalizePipelineRun = ${extractFunctionSource('normalizePipelineRun')};
     const normalizePipelineStringList = ${extractFunctionSource('normalizePipelineStringList')};
     const normalizePipelineCheck = ${extractFunctionSource('normalizePipelineCheck')};
     const normalizePipelineCheckList = ${extractFunctionSource('normalizePipelineCheckList')};
     const normalizePipelinePreflight = ${extractFunctionSource('normalizePipelinePreflight')};
     const normalizePipelineStage = ${extractFunctionSource('normalizePipelineStage')};
     return (${extractFunctionSource('validatePipelineControlSnapshot')});`
  )();
  const explicitCapabilities = { explicit_dry_run: true, explicit_run_mode_routes: true };

  test.each([
    ['old API omits true', { dry_run_available: true }, true, {}, null],
    ['old API ignores force claim', { dry_run_available: true, force_dry_run: true }, false, {}, null],
    ['capability without fail-closed routes is legacy', { dry_run_available: true }, true, { explicit_dry_run: true }, null],
    ['forced stage is always dry-run', { dry_run_available: true, force_dry_run: true }, false, explicitCapabilities, true],
    ['available stage preserves true', { dry_run_available: true }, true, explicitCapabilities, true],
    ['available stage preserves false', { dry_run_available: true }, false, explicitCapabilities, false],
    ['available stage rejects an unknown mode', { dry_run_available: true }, null, explicitCapabilities, null],
    ['unavailable stage omits the field', { dry_run_available: false }, true, explicitCapabilities, null],
    ['unavailable stage allows explicit real mode', { dry_run_available: false }, false, explicitCapabilities, false],
  ])('%s', (_label, profile, requested, capabilities, expected) => {
    expect(resolvePipelineDryRun(profile, requested, capabilities)).toBe(expected);
  });

  test.each([
    ['explicit true', true, explicitCapabilities, { path: '/api/cadu/pipeline/run/dry-run', payload: { stage: 'all' } }],
    ['explicit false', false, explicitCapabilities, { path: '/api/cadu/pipeline/run/real', payload: { stage: 'all' } }],
    ['legacy API', true, {}, null],
    ['partial capability', true, { explicit_dry_run: true }, null],
    ['unknown mode', null, explicitCapabilities, null],
  ])('request: %s', (_label, dryRun, capabilities, expected) => {
    expect(buildPipelineRunRequest('all', dryRun, capabilities)).toEqual(expected);
  });

  test('stage actions follow old/new/forced/unavailable contracts', () => {
    expect(pipelineStageActionModes({ dry_run_available: true, mutates_platform: true }, {})).toEqual([]);
    expect(pipelineStageActionModes({ dry_run_available: true, mutates_platform: true }, explicitCapabilities)).toEqual([
      { dryRun: true, label: 'Dry-run', danger: false },
      { dryRun: false, label: 'Executar real', danger: true },
    ]);
    expect(pipelineStageActionModes({ dry_run_available: true, force_dry_run: true }, explicitCapabilities)).toEqual([
      { dryRun: true, label: 'Simular', danger: false },
    ]);
    expect(pipelineStageActionModes({ dry_run_available: false }, explicitCapabilities)).toEqual([
      { dryRun: false, label: 'Executar', danger: false },
    ]);
  });

  test('control snapshot requires an exact fresh contract and complete preflight', () => {
    const now = Date.parse('2026-07-13T20:00:00.000Z');
    const snapshot = {
      contract_version: 'cadu-pipeline-control-v1',
      generated_at: new Date(now).toISOString(),
      capabilities: explicitCapabilities,
      stages: [{
        id: 'all',
        name: 'Pipeline completa',
        description: 'IG + Curator + Duplicates + Format + Publish + Enrich',
        script: 'scripts/pipeline-kino.js',
        estimated_sec: 1200,
        category: 'publish',
        last_run: null,
        preflight: {
          stage: 'all',
          checked_at: now / 1000,
          can_run: true,
          command: 'node scripts/pipeline-kino.js all',
          profile: {
            risk: 'high',
            mode: 'publish',
            dry_run_available: true,
            default_dry_run: false,
            force_dry_run: false,
            mutates_platform: true,
            effects: ['workspace_artifacts', 'edge_publish'],
            notes: ['dry-run isolado'],
          },
          checks: [{ id: 'script', label: 'Script', status: 'ok', blocking: true, detail: 'scripts/pipeline-kino.js' }],
          blockers: [],
          warnings: [],
          script: {
            exists: true,
            path: '/workspace/scripts/pipeline-kino.js',
            relative_path: 'scripts/pipeline-kino.js',
          },
        },
      }],
    };
    expect(validatePipelineControlSnapshot(snapshot, now)).toMatchObject({
      ok: true,
      stages: [{ preflight: { command: 'node scripts/pipeline-kino.js all' } }],
    });
    expect(validatePipelineControlSnapshot({ ...snapshot, contract_version: 'legacy' }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({ ...snapshot, generated_at: new Date(now - 16000).toISOString() }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({ ...snapshot, capabilities: { explicit_dry_run: true } }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({ ...snapshot, capabilities: { ...explicitCapabilities, legacy_fallback: true } }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{ ...snapshot.stages[0], preflight: { ...snapshot.stages[0].preflight, can_run: undefined } }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{ ...snapshot.stages[0], preflight: { ...snapshot.stages[0].preflight, checks: {} } }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{
        ...snapshot.stages[0],
        preflight: {
          ...snapshot.stages[0].preflight,
          profile: { ...snapshot.stages[0].preflight.profile, effects: {} },
        },
      }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{ ...snapshot.stages[0], preflight: { ...snapshot.stages[0].preflight, checks: [null] } }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{
        ...snapshot.stages[0],
        preflight: {
          ...snapshot.stages[0].preflight,
          can_run: true,
          checks: [{
            id: 'script',
            label: 'Script',
            status: 'missing',
            blocking: true,
            detail: 'scripts/pipeline-kino.js',
          }],
          blockers: [],
          script: { ...snapshot.stages[0].preflight.script, exists: false },
        },
      }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{
        ...snapshot.stages[0],
        preflight: { ...snapshot.stages[0].preflight, command: 'node scripts/other.js' },
      }],
    }, now).ok).toBe(false);
    expect(validatePipelineControlSnapshot({
      ...snapshot,
      stages: [{
        ...snapshot.stages[0],
        script: 'scripts/other.js',
      }],
    }, now).ok).toBe(false);
  });

  test('run identifiers match the proxy segment contract exactly', () => {
    expect(isSafePipelineRunId('8192bbbe-4ae1-4f4c-8abc-123456789abc')).toBe(true);
    expect(isSafePipelineRunId('legacy-run_1')).toBe(true);
    expect(isSafePipelineRunId('run.with.dot')).toBe(false);
    expect(isSafePipelineRunId('run:with:colon')).toBe(false);
  });

  test('locking one action locks its sibling and restores original states and markup', () => {
    document.body.innerHTML = '<div><button class="kc-pipeline-stage__btn"><i>dry</i></button><button class="kc-pipeline-stage__btn" disabled><i>real</i></button></div>';
    const buttons = Array.from(document.querySelectorAll('button'));
    const originalHtml = buttons.map((button) => button.innerHTML);
    const restore = lockPipelineActionButtons(buttons[0]);
    expect(buttons.map((button) => button.disabled)).toEqual([true, true]);
    expect(buttons[0].innerHTML).toContain('Iniciando');
    restore();
    expect(buttons.map((button) => button.disabled)).toEqual([false, true]);
    expect(buttons.map((button) => button.innerHTML)).toEqual(originalHtml);
  });

  test('shared pipeline proxy forwards the request body without truthy filtering', () => {
    const proxy = fs.readFileSync(
      path.join(ROOT, 'server/cadu-control-proxy.js'),
      'utf8'
    );
    expect(proxy).toContain('body = JSON.stringify(req.body)');
    expect(proxy).toContain("req.body === undefined");
    expect(proxy).not.toMatch(/dry_run\s*\?/);
  });
});
