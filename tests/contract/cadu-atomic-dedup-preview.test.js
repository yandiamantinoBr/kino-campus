'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('synthetic atomic dedup preview regressions run in the standard CI suite', () => {
  const script = path.resolve(__dirname, '../../scripts/test-cadu-atomic-dedup-preview.js');
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual({
    passed: 29,
    permittedMutations: 0,
    contract: 'cadu-atomic-dedup-preview-v1',
    fixture: 'synthetic',
  });
});
