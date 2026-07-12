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
  const buildPipelineRunPayload = extractFunction('buildPipelineRunPayload');

  test.each([
    ['old API omits true', { dry_run_available: true }, true, {}, null],
    ['old API ignores force claim', { dry_run_available: true, force_dry_run: true }, false, {}, null],
    ['forced stage is always dry-run', { dry_run_available: true, force_dry_run: true }, false, { explicit_dry_run: true }, true],
    ['available stage preserves true', { dry_run_available: true }, true, { explicit_dry_run: true }, true],
    ['available stage preserves false', { dry_run_available: true }, false, { explicit_dry_run: true }, false],
    ['unavailable stage omits the field', { dry_run_available: false }, true, { explicit_dry_run: true }, null],
  ])('%s', (_label, profile, requested, capabilities, expected) => {
    expect(resolvePipelineDryRun(profile, requested, capabilities)).toBe(expected);
  });

  test.each([
    ['explicit true', true, { explicit_dry_run: true }, { stage: 'all', dry_run: true }],
    ['explicit false', false, { explicit_dry_run: true }, { stage: 'all', dry_run: false }],
    ['legacy API', true, {}, { stage: 'all' }],
    ['unknown mode', null, { explicit_dry_run: true }, { stage: 'all' }],
  ])('payload: %s', (_label, dryRun, capabilities, expected) => {
    expect(buildPipelineRunPayload('all', dryRun, capabilities)).toEqual(expected);
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
