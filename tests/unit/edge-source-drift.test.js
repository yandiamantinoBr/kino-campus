'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  compareEdgeFunctionSource,
  parseArguments,
} = require('../../scripts/compare-edge-function-source');

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

describe('Edge Function remote source drift', () => {
  let fixtureRoot;
  let localRoot;
  let remoteRoot;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-edge-drift-'));
    localRoot = path.join(fixtureRoot, 'local');
    remoteRoot = path.join(fixtureRoot, 'remote');
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('reports equal source and follows only reachable relative dependencies', () => {
    const index = 'import { value } from "../_shared/value.ts";\nconsole.log(value);\n';
    write(localRoot, 'supabase/functions/example/index.ts', index);
    write(remoteRoot, 'supabase/functions/example/index.ts', index);
    write(localRoot, 'supabase/functions/_shared/value.ts', 'export const value = 1;\n');
    write(remoteRoot, 'supabase/functions/_shared/value.ts', 'export const value = 1;\n');
    write(localRoot, 'supabase/functions/_shared/unrelated.ts', 'export const other = 2;\n');
    write(remoteRoot, 'supabase/functions/_shared/unrelated.ts', 'export const other = 3;\n');

    expect(compareEdgeFunctionSource({ localRoot, remoteRoot, functionName: 'example' }))
      .toEqual(expect.objectContaining({
        drift: false,
        reason: 'source_equal',
        compared_files: 2,
        differences: [],
      }));
  });

  test('detects a changed transitive shared dependency without exposing contents', () => {
    const index = 'export { value } from "../_shared/value.ts";\n';
    write(localRoot, 'supabase/functions/example/index.ts', index);
    write(remoteRoot, 'supabase/functions/example/index.ts', index);
    write(localRoot, 'supabase/functions/_shared/value.ts', 'export const value = "local";\n');
    write(remoteRoot, 'supabase/functions/_shared/value.ts', 'export const value = "remote";\n');

    const result = compareEdgeFunctionSource({ localRoot, remoteRoot, functionName: 'example' });
    expect(result).toEqual(expect.objectContaining({
      drift: true,
      reason: 'source_mismatch',
      differences: [{ path: '_shared/value.ts', kind: 'content_mismatch' }],
    }));
    expect(JSON.stringify(result)).not.toContain('"local"');
    expect(JSON.stringify(result)).not.toContain('"remote"');
  });

  test('marks a local function absent from the remote project for first deploy', () => {
    write(localRoot, 'supabase/functions/new-function/index.ts', 'Deno.serve(() => new Response());\n');

    expect(compareEdgeFunctionSource({
      localRoot,
      remoteRoot,
      functionName: 'new-function',
    })).toEqual(expect.objectContaining({
      drift: true,
      reason: 'remote_function_missing',
    }));
  });

  test('fails closed for traversal names and incomplete downloaded imports', () => {
    write(localRoot, 'supabase/functions/example/index.ts', 'export {};\n');
    write(remoteRoot, 'supabase/functions/example/index.ts', 'export { value } from "./missing.ts";\n');

    expect(() => compareEdgeFunctionSource({
      localRoot,
      remoteRoot,
      functionName: '../example',
    })).toThrow('Invalid Edge Function name');
    expect(() => compareEdgeFunctionSource({
      localRoot,
      remoteRoot,
      functionName: 'example',
    })).toThrow('Downloaded source has an unresolved relative import');
  });

  test('requires all CLI paths explicitly', () => {
    expect(() => parseArguments(['--function', 'example']))
      .toThrow('Missing required argument: --local-root');
    expect(parseArguments([
      '--local-root', '.',
      '--remote-root', 'remote',
      '--function', 'example',
      '--check',
    ])).toEqual(expect.objectContaining({
      localRoot: '.',
      remoteRoot: 'remote',
      function: 'example',
      check: true,
    }));
  });
});
