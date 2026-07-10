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
const supabaseConfig = read('supabase/config.toml');
const dispatchFunction = read('supabase/functions/kc-dispatch-notification-outbox/index.ts');
const inviteFunction = read('supabase/functions/kc-invite-user/index.ts');
const caduFunction = read('supabase/functions/cadu-publish/index.ts');
const caduPublisher = read('services/cadu-ufg-publisher/src/publisher.js');
const baseline = read('supabase/migrations/00000000000001_baseline_v76.sql');
const workflows = [essential, edgeDeploy, emailCheck, lighthouse];

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

  test('type-checks every Edge Function with its deployment-specific Deno config', () => {
    expect(essential).toContain('edge-functions:');
    expect(essential).toContain('uses: denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed');
    expect(essential).toContain('deno-version: v2.8.0');
    expect(essential).toContain('entrypoints=(supabase/functions/*/index.ts)');
    expect(essential).toContain('--config "$config"');
    expect(essential).toContain('deno check --no-lock --node-modules-dir=none');
  });

  test('pins every third-party GitHub Action to an immutable commit', () => {
    const uses = workflows.flatMap((workflow) => (
      [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1])
    ));

    expect(uses.length).toBeGreaterThanOrEqual(14);
    uses.forEach((action) => expect(action).toMatch(/^[^@]+@[0-9a-f]{40}$/));
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
    expect(edgeDeploy).toContain("grep -Eq '^supabase/functions/_shared/|^supabase/functions/[^/]+$'");
    expect(edgeDeploy).toContain('all functions must be rebuilt');
    expect(edgeDeploy).toContain('Remote deletion requires an explicit manual operation');
    expect(edgeDeploy).toContain('version: 2.105.0');
    expect(edgeDeploy).not.toContain('version: latest');
    expect(edgeDeploy).not.toMatch(/supabase link[^\n]*\|\|\s*true/);
  });

  test('versions the internal-auth mode of Edge Functions that bypass gateway JWT checks', () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-dispatch-notification-outbox\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig).toMatch(
      /\[functions\.kc-invite-user\]\s*verify_jwt\s*=\s*false/
    );
    expect(supabaseConfig.match(/verify_jwt\s*=\s*false/g)).toHaveLength(2);

    expect(baseline).toContain("'x-kc-dispatch-secret', v_dispatch_secret");
    expect(dispatchFunction).toContain('req.headers.get("x-kc-dispatch-secret")');
    expect(dispatchFunction).toContain('timingSafeEqual(providedSecret, secret)');
    expect(inviteFunction).toContain('userClient.auth.getUser()');
    expect(inviteFunction).toContain('.select("is_admin, display_name")');
  });

  test('deploys changed function configuration and rejects remote auth drift', () => {
    expect(edgeDeploy).toContain("grep -Fxq 'supabase/config.toml'");
    expect(edgeDeploy).toContain('import tomllib');
    expect(edgeDeploy).toContain('before.get(name) != after.get(name)');
    expect(edgeDeploy).toContain('EXPECTED_VERIFY_JWT');
    expect(edgeDeploy).toContain('ACTUAL_VERIFY_JWT');
    expect(edgeDeploy).toContain('JWT verification drift');
    expect(edgeDeploy).toContain('curl --fail-with-body --retry 3 --retry-all-errors');
    expect(edgeDeploy).not.toContain('|| echo "?"');
  });

  test('keeps gateway JWT enabled by default for the authenticated Cadu publisher', () => {
    expect(supabaseConfig).not.toMatch(
      /\[functions\.cadu-publish\]\s*verify_jwt\s*=\s*false/
    );
    expect(caduPublisher).toContain('authorization: `Bearer ${token || this.session.access_token}`');
    expect(caduFunction).toContain('userClient.auth.getUser()');
    expect(caduFunction).toContain('.from("kc_trusted_publishers")');
  });
});
