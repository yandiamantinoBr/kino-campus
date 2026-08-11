#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const EXPECTED_GITHUB_SOURCE = Object.freeze({
  provider: 'github',
  owner: 'yandiamantinoBr',
  repository: 'kino-campus',
  repositoryId: '1115961791',
  productionBranch: 'main',
});

function normalized(value) {
  return String(value || '').trim();
}

function normalizedLower(value) {
  return normalized(value).toLowerCase();
}

function isProductionTarget(env = process.env) {
  const targetEnvironment = normalizedLower(env.VERCEL_TARGET_ENV);
  const deploymentEnvironment = normalizedLower(env.VERCEL_ENV);
  return targetEnvironment === 'production' || deploymentEnvironment === 'production';
}

function hasOfficialGitHubBuildIdentity(env = process.env) {
  const expected = EXPECTED_GITHUB_SOURCE;
  return (
    normalized(env.VERCEL) === '1'
    && normalizedLower(env.VERCEL_GIT_PROVIDER) === expected.provider
    && normalizedLower(env.VERCEL_GIT_REPO_OWNER) === expected.owner.toLowerCase()
    && normalizedLower(env.VERCEL_GIT_REPO_SLUG) === expected.repository
    && normalized(env.VERCEL_GIT_REPO_ID) === expected.repositoryId
  );
}

function runGit(rootDir, args) {
  const result = spawnSync(
    'git',
    ['--no-optional-locks', '-C', rootDir, ...args],
    {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    },
  );

  if (result.error) {
    throw result.error;
  }

  return Object.freeze({
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: normalized(result.stdout),
    stderr: normalized(result.stderr),
  });
}

function inspectLocalGitCheckout(rootDir, executeGit = runGit) {
  const gitMarker = path.join(rootDir, '.git');
  if (!fs.existsSync(gitMarker)) {
    return Object.freeze({ present: false });
  }

  const markerStat = fs.statSync(gitMarker);
  if (
    markerStat.isDirectory()
    && (
      !fs.existsSync(path.join(gitMarker, 'HEAD'))
      || !fs.existsSync(path.join(gitMarker, 'index'))
    )
  ) {
    // A Vercel pode preservar apenas o diretorio .git depois de aplicar
    // .vercelignore. Esse marcador parcial nao e um checkout inspecionavel.
    return Object.freeze({ present: false, sanitized: true });
  }

  try {
    const status = executeGit(rootDir, ['status', '--porcelain=v1', '--untracked-files=normal']);
    if (status.status !== 0) {
      throw new Error(status.stderr || `git status saiu com codigo ${status.status}`);
    }

    const head = executeGit(rootDir, ['rev-parse', '--verify', 'HEAD']);
    if (head.status !== 0 || !/^[0-9a-f]{40}$/i.test(head.stdout)) {
      throw new Error(head.stderr || 'git rev-parse HEAD nao retornou um SHA completo');
    }

    const branch = executeGit(rootDir, ['symbolic-ref', '--short', '-q', 'HEAD']);
    if (branch.status !== 0 && branch.status !== 1) {
      throw new Error(branch.stderr || `git symbolic-ref saiu com codigo ${branch.status}`);
    }

    return Object.freeze({
      present: true,
      dirty: Boolean(status.stdout),
      head: head.stdout.toLowerCase(),
      branch: branch.status === 0 ? branch.stdout : '',
      detached: branch.status === 1,
    });
  } catch (error) {
    return Object.freeze({
      present: true,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function evaluateVercelProductionOrigin(options = {}) {
  const env = options.env || process.env;
  const gitState = options.gitState || Object.freeze({ present: false });
  const production = isProductionTarget(env);

  if (!production) {
    return Object.freeze({
      allowed: true,
      production: false,
      reasons: Object.freeze([]),
    });
  }

  const reasons = [];
  const expected = EXPECTED_GITHUB_SOURCE;
  const provider = normalizedLower(env.VERCEL_GIT_PROVIDER);
  const owner = normalizedLower(env.VERCEL_GIT_REPO_OWNER);
  const repository = normalizedLower(env.VERCEL_GIT_REPO_SLUG);
  const repositoryId = normalized(env.VERCEL_GIT_REPO_ID);
  const branch = normalized(env.VERCEL_GIT_COMMIT_REF);
  const commitSha = normalizedLower(env.VERCEL_GIT_COMMIT_SHA);

  if (normalized(env.VERCEL) !== '1') {
    reasons.push('VERCEL deve ser 1 em um build de producao hospedado');
  }
  if (provider !== expected.provider) {
    reasons.push(`provedor Git deve ser ${expected.provider}`);
  }
  if (owner !== expected.owner.toLowerCase()) {
    reasons.push(`owner Git deve ser ${expected.owner}`);
  }
  if (repository !== expected.repository) {
    reasons.push(`repositorio Git deve ser ${expected.repository}`);
  }
  if (repositoryId !== expected.repositoryId) {
    reasons.push(
      `VERCEL_GIT_REPO_ID deve identificar a integracao GitHub oficial (${expected.repositoryId})`,
    );
  }
  if (branch !== expected.productionBranch) {
    reasons.push(`branch de producao deve ser ${expected.productionBranch}`);
  }
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    reasons.push('VERCEL_GIT_COMMIT_SHA deve ser um SHA Git completo');
  }

  if (gitState.present) {
    if (gitState.error) {
      reasons.push(`checkout Git local nao pode ser verificado: ${gitState.error}`);
    } else {
      if (gitState.dirty) {
        reasons.push('checkout Git local possui alteracoes rastreadas ou nao rastreadas');
      }
      if (normalizedLower(gitState.head) !== commitSha) {
        reasons.push('HEAD local difere de VERCEL_GIT_COMMIT_SHA');
      }
      if (!gitState.detached && normalized(gitState.branch) !== expected.productionBranch) {
        reasons.push(`branch local deve ser ${expected.productionBranch}`);
      }
    }
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    production: true,
    reasons: Object.freeze(reasons),
  });
}

function assertVercelProductionOrigin(options = {}) {
  const env = options.env || process.env;
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const gitState = options.gitState || (
    isProductionTarget(env) && !hasOfficialGitHubBuildIdentity(env)
      ? inspectLocalGitCheckout(rootDir, options.executeGit)
      : Object.freeze({ present: false })
  );
  const result = evaluateVercelProductionOrigin({ env, gitState });

  if (!result.allowed) {
    const details = result.reasons.map((reason) => ` - ${reason}`).join('\n');
    throw new Error(
      'KC_VERCEL_PRODUCTION_ORIGIN_REJECTED: deploy de producao bloqueado.\n'
      + `${details}\n`
      + 'Use a integracao GitHub apos merge em main; deploy CLI --prod nao e permitido.',
    );
  }

  if (result.production) {
    console.log(
      'KC_VERCEL_PRODUCTION_ORIGIN_OK: integracao GitHub oficial, branch main e origem limpa.',
    );
  }

  return result;
}

if (require.main === module) {
  try {
    const result = assertVercelProductionOrigin();
    if (!result.production) {
      console.log('KC_VERCEL_PRODUCTION_ORIGIN_BYPASS: o target nao e production.');
    }
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = Object.freeze({
  EXPECTED_GITHUB_SOURCE,
  isProductionTarget,
  hasOfficialGitHubBuildIdentity,
  inspectLocalGitCheckout,
  evaluateVercelProductionOrigin,
  assertVercelProductionOrigin,
});
