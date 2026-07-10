'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const essential = read('.github/workflows/essential-validation.yml');
const edgeDeploy = read('.github/workflows/edge-deploy.yml');
const emailCheck = read('.github/workflows/email-check.yml');
const lighthouse = read('.github/workflows/lighthouse-ci.yml');

describe('CI and deployment safety contracts', () => {
  test('uses the same Node major configured in the Vercel project', () => {
    expect(packageJson.engines.node).toBe('24.x');
    [essential, emailCheck, lighthouse].forEach((workflow) => {
      expect(workflow).toContain("node-version: '24'");
      expect(workflow).not.toMatch(/node-version:\s*['\"]?20/);
    });
  });

  test('rebuilds and tests the active Supabase migration chain in CI', () => {
    expect(essential).toContain('database-contracts:');
    expect(essential).toContain('version: 2.105.0');
    expect(essential).toContain('supabase db reset --local --no-seed');
    expect(essential).toContain('supabase db lint --local --level error --fail-on error');
    expect(essential).toContain('supabase test db --local supabase/tests');
    expect(essential).toContain('supabase stop --no-backup');
  });

  test('deploys Edge Functions only after a successful validated base push', () => {
    expect(edgeDeploy).toContain('workflow_run:');
    expect(edgeDeploy).toContain('workflows: [Essential Validation]');
    expect(edgeDeploy).toContain("github.event.workflow_run.event == 'push'");
    expect(edgeDeploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(edgeDeploy).toContain('github.event.workflow_run.head_sha');
    expect(edgeDeploy).not.toMatch(/^\s{2}push:/m);
  });

  test('fails closed and handles shared Edge Function dependencies', () => {
    expect(edgeDeploy).toContain('REQUESTED_FUNCTION: ${{ inputs.function_name }}');
    expect(edgeDeploy).not.toContain('REQUESTED="${{ inputs.function_name }}"');
    expect(edgeDeploy).toContain("grep -q '^supabase/functions/_shared/'");
    expect(edgeDeploy).toContain('all functions must be rebuilt');
    expect(edgeDeploy).toContain('Remote deletion requires an explicit manual operation');
    expect(edgeDeploy).toContain('version: 2.105.0');
    expect(edgeDeploy).not.toContain('version: latest');
    expect(edgeDeploy).not.toMatch(/supabase link[^\n]*\|\|\s*true/);
  });
});
