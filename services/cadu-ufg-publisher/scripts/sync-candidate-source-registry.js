#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  EXPECTED_ARTIFACTS,
  REGISTRY_DIR,
  gitBlobOid,
  sha256,
  validateCandidateRegistry,
  validateRegistrySchema,
  verifyMirroredRegistry,
} = require('./lib/candidate-source-registry');

const SPECS = Object.freeze([
  {
    id: 'candidate',
    ...EXPECTED_ARTIFACTS.candidate,
  },
  {
    id: 'schema',
    ...EXPECTED_ARTIFACTS.schema,
  },
  {
    id: 'reconciliation-report',
    ...EXPECTED_ARTIFACTS['reconciliation-report'],
  },
]);

function parseArgs(argv) {
  const options = {
    check: false,
    openclawRepo: null,
    openclawCommit: null,
  };
  const optionMap = {
    '--openclaw-repo': 'openclawRepo',
    '--openclaw-commit': 'openclawCommit',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    const key = optionMap[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    options[key] = value;
    index += 1;
  }
  const importValues = [
    options.openclawRepo,
    options.openclawCommit,
  ];
  if (options.check && importValues.some(Boolean)) throw new Error('--check cannot be combined with import options');
  if (!options.check && !importValues.every(Boolean)) {
    throw new Error('import requires --openclaw-repo and --openclaw-commit');
  }
  return options;
}

function runGit(repoDir, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function normalizeGithubRemote(remote) {
  let normalized = String(remote || '').trim();
  normalized = normalized.replace(/^git@github\.com:/, 'https://github.com/');
  normalized = normalized.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/');
  return normalized.replace(/\.git\/?$/, '').replace(/\/$/, '');
}

function importRegistry(options, registryDir = REGISTRY_DIR) {
  assert(/^[0-9a-f]{40}$/.test(options.openclawCommit), '--openclaw-commit must be a full SHA');
  const repoDir = path.resolve(options.openclawRepo);
  const expectedRemote = 'https://github.com/yandiamantinoBr/openclaw-cadu';
  const actualRemote = normalizeGithubRemote(runGit(repoDir, ['config', '--get', 'remote.origin.url']).trim());
  assert.strictEqual(actualRemote, expectedRemote, 'OpenClaw origin remote mismatch');
  const resolvedCommit = runGit(repoDir, ['rev-parse', '--verify', `${options.openclawCommit}^{commit}`]).trim();
  assert.strictEqual(resolvedCommit, options.openclawCommit, 'OpenClaw commit did not resolve exactly');
  runGit(repoDir, [
    'fetch',
    '--quiet',
    '--no-tags',
    'origin',
    '+refs/heads/main:refs/remotes/origin/main',
  ]);
  let reachableFromOriginMain = true;
  try {
    runGit(repoDir, ['merge-base', '--is-ancestor', resolvedCommit, 'refs/remotes/origin/main']);
  } catch (_) {
    reachableFromOriginMain = false;
  }
  assert(reachableFromOriginMain, 'OpenClaw commit is not reachable from fetched origin/main');
  const artifacts = [];
  const contents = new Map();
  for (const spec of SPECS) {
    const objectSpec = `${resolvedCommit}:${spec.upstreamPath}`;
    const expectedBlob = runGit(repoDir, ['rev-parse', '--verify', objectSpec]).trim();
    assert(/^[0-9a-f]{40}$/.test(expectedBlob), `${spec.id} blob must be a full Git OID`);
    const objectType = runGit(repoDir, ['cat-file', '-t', expectedBlob]).trim();
    assert.strictEqual(objectType, 'blob', `${spec.id} upstream object must be a blob`);
    const bytes = runGit(repoDir, ['show', objectSpec], null);
    assert.strictEqual(gitBlobOid(bytes), expectedBlob, `${spec.id} bytes do not match upstream Git blob`);
    JSON.parse(bytes.toString('utf8'));
    contents.set(spec.file, bytes);
    artifacts.push({
      id: spec.id,
      file: spec.file,
      upstreamPath: spec.upstreamPath,
      upstreamGitBlobOid: expectedBlob,
      contentSha256: sha256(bytes),
      byteLength: bytes.length,
    });
  }
  const candidate = JSON.parse(contents.get('ufg-source-registry.candidate.json').toString('utf8'));
  const schema = JSON.parse(contents.get('ufg-source-registry.schema.json').toString('utf8'));
  validateRegistrySchema(candidate, schema);
  validateCandidateRegistry(candidate);
  const manifest = {
    schemaVersion: 1,
    registryVersion: candidate.registryVersion,
    auditCutoff: candidate.auditCutoff,
    upstream: {
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      commit: options.openclawCommit,
    },
    artifacts,
    safety: {
      lifecycle: 'candidate',
      runtimeActivated: false,
      publisherUsesLegacySources: true,
      activePublisherRegistry: 'services/cadu-ufg-publisher/config/sources.json',
    },
  };
  fs.mkdirSync(registryDir, { recursive: true });
  for (const [file, bytes] of contents) fs.writeFileSync(path.join(registryDir, file), bytes);
  fs.writeFileSync(path.join(registryDir, 'upstream-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return verifyMirroredRegistry({ registryDir });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const verified = options.check ? verifyMirroredRegistry() : importRegistry(options);
  console.log(JSON.stringify({
    upstreamCommit: verified.manifest.upstream.commit,
    registryVersion: verified.registry.registryVersion,
    entities: verified.registry.entities.length,
    webSources: verified.registry.webSources.length,
    instagramProfiles: verified.registry.instagramProfiles.length,
    enabledWebSources: verified.registry.webSources.filter((source) => source.enabled).length,
    enabledInstagramProfiles: verified.registry.instagramProfiles.filter((profile) => profile.enabled).length,
    publisherUsesLegacySources: verified.manifest.safety.publisherUsesLegacySources,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

module.exports = { importRegistry, normalizeGithubRemote, parseArgs, runGit };
