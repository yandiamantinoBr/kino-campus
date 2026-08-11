'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  EXPECTED_GITHUB_SOURCE,
  isProductionTarget,
  hasOfficialGitHubBuildIdentity,
  inspectLocalGitCheckout,
  evaluateVercelProductionOrigin,
  assertVercelProductionOrigin,
} = require('../../scripts/vercel-production-guard');

function git(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} falhou`);
  }
  return String(result.stdout || '').trim();
}

function validProductionEnv(overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_TARGET_ENV: 'production',
    VERCEL_GIT_PROVIDER: EXPECTED_GITHUB_SOURCE.provider,
    VERCEL_GIT_REPO_OWNER: EXPECTED_GITHUB_SOURCE.owner,
    VERCEL_GIT_REPO_SLUG: EXPECTED_GITHUB_SOURCE.repository,
    VERCEL_GIT_REPO_ID: EXPECTED_GITHUB_SOURCE.repositoryId,
    VERCEL_GIT_COMMIT_REF: EXPECTED_GITHUB_SOURCE.productionBranch,
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    ...overrides,
  };
}

describe('Vercel production origin guard', () => {
  let tempRepository;

  beforeEach(() => {
    tempRepository = '';
  });

  afterEach(() => {
    if (tempRepository) {
      fs.rmSync(tempRepository, { recursive: true, force: true });
    }
  });

  test('detecta production por VERCEL_ENV ou VERCEL_TARGET_ENV', () => {
    expect(isProductionTarget({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionTarget({ VERCEL_TARGET_ENV: ' production ' })).toBe(true);
    expect(isProductionTarget({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false);
  });

  test('reconhece somente a identidade completa da integracao GitHub oficial', () => {
    expect(hasOfficialGitHubBuildIdentity(validProductionEnv())).toBe(true);
    expect(hasOfficialGitHubBuildIdentity(validProductionEnv({ VERCEL_GIT_REPO_ID: '' })))
      .toBe(false);
    expect(hasOfficialGitHubBuildIdentity(validProductionEnv({ VERCEL_GIT_PROVIDER: 'gitlab' })))
      .toBe(false);
  });

  test('inject-env executa o guard antes de processar ambiente ou gerar artefatos', () => {
    const injectEnv = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'scripts', 'inject-env.js'),
      'utf8',
    );
    const guardIndex = injectEnv.indexOf('assertVercelProductionOrigin({');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(injectEnv.indexOf('function resolveEnv('));
    expect(guardIndex).toBeLessThan(injectEnv.indexOf("require('./build-static-output')"));
  });

  test('nao bloqueia preview mesmo sem metadados Git', () => {
    const result = evaluateVercelProductionOrigin({
      env: { VERCEL: '1', VERCEL_ENV: 'preview', NODE_ENV: 'production' },
      gitState: { present: true, dirty: true },
    });

    expect(result).toMatchObject({ allowed: true, production: false });
  });

  test('assert de preview nao tenta inspecionar o checkout Git', () => {
    const executeGit = jest.fn(() => {
      throw new Error('nao deveria executar');
    });
    const result = assertVercelProductionOrigin({
      env: { VERCEL: '1', VERCEL_ENV: 'preview' },
      rootDir: path.resolve(__dirname, '..', '..'),
      executeGit,
    });

    expect(result).toMatchObject({ allowed: true, production: false });
    expect(executeGit).not.toHaveBeenCalled();
  });

  test('aceita build GitHub de main com identidade oficial e checkout remoto imutavel', () => {
    const result = evaluateVercelProductionOrigin({
      env: validProductionEnv(),
      gitState: { present: false },
    });

    expect(result).toMatchObject({ allowed: true, production: true, reasons: [] });
  });

  test('nao trata .git sanitizado pela Vercel como checkout local dirty', () => {
    tempRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-vercel-sanitized-git-'));
    fs.mkdirSync(path.join(tempRepository, '.git'));

    expect(inspectLocalGitCheckout(tempRepository)).toMatchObject({
      present: false,
      sanitized: true,
    });
    expect(assertVercelProductionOrigin({
      env: validProductionEnv(),
      rootDir: tempRepository,
    })).toMatchObject({ allowed: true, production: true });
  });

  test.each([
    ['branch nao-main', { VERCEL_GIT_COMMIT_REF: 'feature/dirty-deploy' }],
    ['provider ausente', { VERCEL_GIT_PROVIDER: '' }],
    ['owner diferente', { VERCEL_GIT_REPO_OWNER: 'attacker' }],
    ['repositorio diferente', { VERCEL_GIT_REPO_SLUG: 'kino-campus-copy' }],
    ['repo id ausente (padrao observado no CLI)', { VERCEL_GIT_REPO_ID: '' }],
    ['repo id diferente', { VERCEL_GIT_REPO_ID: '999' }],
    ['sha abreviado', { VERCEL_GIT_COMMIT_SHA: 'abc1234' }],
    ['fora da Vercel', { VERCEL: '' }],
  ])('rejeita producao com %s', (_label, overrides) => {
    const result = evaluateVercelProductionOrigin({
      env: validProductionEnv(overrides),
      gitState: { present: false },
    });

    expect(result.allowed).toBe(false);
    expect(result.production).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('aceita checkout Git local limpo em main e no SHA declarado', () => {
    const result = evaluateVercelProductionOrigin({
      env: validProductionEnv(),
      gitState: {
        present: true,
        dirty: false,
        head: 'a'.repeat(40),
        branch: 'main',
        detached: false,
      },
    });

    expect(result.allowed).toBe(true);
  });

  test.each([
    ['checkout dirty', { dirty: true, head: 'a'.repeat(40), branch: 'main', detached: false }],
    ['HEAD divergente', { dirty: false, head: 'b'.repeat(40), branch: 'main', detached: false }],
    ['branch local divergente', { dirty: false, head: 'a'.repeat(40), branch: 'feature', detached: false }],
    ['falha ao inspecionar Git', { error: 'git indisponivel' }],
  ])('rejeita producao quando ha %s', (_label, gitState) => {
    const result = evaluateVercelProductionOrigin({
      env: validProductionEnv(),
      gitState: { present: true, ...gitState },
    });

    expect(result.allowed).toBe(false);
  });

  test('aceita checkout detached somente quando o SHA coincide', () => {
    const result = evaluateVercelProductionOrigin({
      env: validProductionEnv(),
      gitState: {
        present: true,
        dirty: false,
        head: 'a'.repeat(40),
        branch: '',
        detached: true,
      },
    });

    expect(result.allowed).toBe(true);
  });

  test('inspeciona um repositorio real e detecta arquivo nao rastreado', () => {
    tempRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-vercel-guard-'));
    git(tempRepository, ['init', '-b', 'main']);
    git(tempRepository, ['config', 'user.name', 'Kino Guard Test']);
    git(tempRepository, ['config', 'user.email', 'guard-test@example.invalid']);
    fs.writeFileSync(path.join(tempRepository, 'tracked.txt'), 'tracked\n', 'utf8');
    git(tempRepository, ['add', 'tracked.txt']);
    git(tempRepository, ['commit', '-m', 'test fixture']);

    const clean = inspectLocalGitCheckout(tempRepository);
    expect(clean).toMatchObject({
      present: true,
      dirty: false,
      branch: 'main',
      detached: false,
    });
    expect(clean.head).toMatch(/^[0-9a-f]{40}$/);

    fs.writeFileSync(path.join(tempRepository, 'untracked.txt'), 'dirty\n', 'utf8');
    expect(inspectLocalGitCheckout(tempRepository)).toMatchObject({
      present: true,
      dirty: true,
    });
  });

  test('assert falha fechado antes do build com codigo operacional estavel', () => {
    expect(() => assertVercelProductionOrigin({
      env: validProductionEnv({ VERCEL_GIT_COMMIT_REF: 'codex/unsafe' }),
      rootDir: process.cwd(),
      gitState: { present: false },
    })).toThrow(/KC_VERCEL_PRODUCTION_ORIGIN_REJECTED/);
  });
});
