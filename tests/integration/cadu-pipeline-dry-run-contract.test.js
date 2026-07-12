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

describe('Cadu pipeline explicit dry-run contract', () => {
  const resolvePipelineDryRun = extractFunction('resolvePipelineDryRun');
  const buildPipelineRunRequest = extractFunction('buildPipelineRunRequest');
  const pipelineStageActionModes = extractFunction('pipelineStageActionModes');
  const lockPipelineActionButtons = extractFunction('lockPipelineActionButtons');
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
  ])('%s', (_label, profile, requested, capabilities, expected) => {
    expect(resolvePipelineDryRun(profile, requested, capabilities)).toBe(expected);
  });

  test.each([
    ['explicit true', true, explicitCapabilities, { path: '/api/cadu/pipeline/run/dry-run', payload: { stage: 'all' } }],
    ['explicit false', false, explicitCapabilities, { path: '/api/cadu/pipeline/run/real', payload: { stage: 'all' } }],
    ['legacy API', true, {}, { path: '/api/cadu/pipeline/run', payload: { stage: 'all' } }],
    ['partial capability', true, { explicit_dry_run: true }, { path: '/api/cadu/pipeline/run', payload: { stage: 'all' } }],
    ['unknown mode', null, explicitCapabilities, { path: '/api/cadu/pipeline/run', payload: { stage: 'all' } }],
  ])('request: %s', (_label, dryRun, capabilities, expected) => {
    expect(buildPipelineRunRequest('all', dryRun, capabilities)).toEqual(expected);
  });

  test('stage actions follow old/new/forced/unavailable contracts', () => {
    expect(pipelineStageActionModes({ dry_run_available: true, mutates_platform: true }, {})).toEqual([
      { dryRun: null, label: 'Executar', danger: true },
    ]);
    expect(pipelineStageActionModes({ dry_run_available: true, mutates_platform: true }, explicitCapabilities)).toEqual([
      { dryRun: true, label: 'Dry-run', danger: false },
      { dryRun: false, label: 'Executar real', danger: true },
    ]);
    expect(pipelineStageActionModes({ dry_run_available: true, force_dry_run: true }, explicitCapabilities)).toEqual([
      { dryRun: true, label: 'Simular', danger: false },
    ]);
    expect(pipelineStageActionModes({ dry_run_available: false }, explicitCapabilities)).toEqual([
      { dryRun: null, label: 'Executar', danger: false },
    ]);
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

  test.each(['api/cadu/pipeline.js', 'api/cadu/pipeline-router.js'])(
    '%s forwards the request body without truthy filtering',
    (relativePath) => {
      const proxy = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      expect(proxy).toContain('JSON.stringify(req.body)');
      expect(proxy).not.toMatch(/dry_run\s*\?/);
    }
  );
});
