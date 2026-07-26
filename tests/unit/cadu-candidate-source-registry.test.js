const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const {
  MANIFEST_PATH,
  REGISTRY_DIR,
  EXPECTED_MIRROR_SAFETY,
  EXPECTED_PROVENANCE,
  loadCandidateSourceRegistry,
  sha256,
  validateCandidateRegistry,
  validateManifest,
  validateReconciliationReport,
  validateRegistryBundle,
  validateRegistrySchema,
  verifyMirroredRegistry,
} = require('../../services/cadu-ufg-publisher/scripts/lib/candidate-source-registry');
const {
  canonicalJsonSha256,
  compareRegistryVersions,
  EXPECTED_KINO_BRANCH,
  EXPECTED_KINO_REMOTE,
  EXPECTED_OPENCLAW_REMOTE,
  IMPORT_LOCK_FILE,
  importRegistry,
  parseArgs,
  runGit: runHardenedGit,
  sortObjectDeepByCodepoint,
  validateKinoPublisherProvenance,
  validateOpenClawProvenance,
  withImportLock,
  withIsolatedImportRepository,
  writeImportAtomically,
} = require('../../services/cadu-ufg-publisher/scripts/sync-candidate-source-registry');
const {
  DEFAULT_SOURCE_PATH,
  loadSources,
  selectSources,
} = require('../../services/cadu-ufg-publisher/src/sources');

const ROOT = path.resolve(__dirname, '../..');
const SYNC_SCRIPT = path.join(
  ROOT,
  'services',
  'cadu-ufg-publisher',
  'scripts',
  'sync-candidate-source-registry.js',
);

function runGit(repoDir, args, encoding = 'utf8') {
  if (encoding === null) {
    const result = spawnSync('git', ['-C', repoDir, ...args], { cwd: ROOT });
    if (result.status !== 0) {
      throw new Error(result.stderr?.toString('utf8') || result.stdout?.toString('utf8') || `git exited ${result.status}`);
    }
    return result.stdout;
  }
  return runGitCommand(['-C', repoDir, ...args]);
}

function runGitCommand(args, cwd = ROOT) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git exited ${result.status}`);
  return result.stdout.trim();
}

function makeOfflineFetchGit(sourceRepo, sourceRef, hooks = {}) {
  return (repoDir, args, encoding = 'utf8') => {
    const commandIndex = args.indexOf('fetch');
    if (commandIndex >= 0) {
      const originalRefspec = args[args.length - 1];
      const separator = originalRefspec.indexOf(':');
      if (separator < 0) throw new Error(`unexpected fetch refspec ${originalRefspec}`);
      const destinationRef = originalRefspec.slice(separator + 1);
      const result = runGit(
        repoDir,
        [
          'fetch',
          '--quiet',
          '--no-tags',
          pathToFileURL(sourceRepo).href,
          `+${sourceRef}:${destinationRef}`,
        ],
        encoding,
      );
      if (hooks.afterFetch) hooks.afterFetch({ repoDir, args, destinationRef });
      return result;
    }
    const result = runGit(repoDir, args, encoding);
    if (hooks.afterRemoteAdd && args.includes('remote') && args.includes('add')) {
      hooks.afterRemoteAdd({ repoDir, args });
    }
    return result;
  };
}

function createKinoPublisherFixture(rootDir, directoryName = 'kino-publisher-fixture') {
  const repoDir = path.join(rootDir, directoryName);
  const sourcePath = EXPECTED_PROVENANCE.inputs
    .find((input) => input.id === 'kino_publisher').path;
  const sourceFile = path.join(repoDir, sourcePath);
  const payload = {
    meta: { zeta: { second: 2, first: 1 }, totalSites: 2, alpha: true },
    sources: [
      { z: 3, a: { y: 2, x: 1 } },
      { name: 'segunda', flags: { quick: true, full: false } },
    ],
  };
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  runGit(repoDir, ['init', `--initial-branch=${EXPECTED_KINO_BRANCH}`]);
  const deliberatelyUnsorted = { sources: payload.sources, meta: payload.meta };
  fs.writeFileSync(
    sourceFile,
    `\uFEFF${JSON.stringify(deliberatelyUnsorted, null, 4).replace(/\n/g, '\r\n')}\r\n`,
    'utf8',
  );
  runGit(repoDir, ['add', sourcePath]);
  runGit(repoDir, [
    '-c', 'user.name=KinoCampus Test',
    '-c', 'user.email=test@kino.invalid',
    'commit', '-m', 'hermetic Kino publisher fixture',
  ]);
  const commit = runGit(repoDir, ['rev-parse', 'HEAD']);
  const gitBlobOid = runGit(repoDir, ['rev-parse', `${commit}:${sourcePath}`]);
  const canonicalPayloadSha256 = canonicalJsonSha256(payload);
  return {
    canonicalPayloadSha256,
    commit,
    gitBlobOid,
    payload,
    repoDir,
    runGit: makeOfflineFetchGit(repoDir, `refs/heads/${EXPECTED_KINO_BRANCH}`),
    sourceFile,
    sourcePath,
  };
}

function listFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function shadowFixtureFromBundledArtifacts() {
  const registry = JSON.parse(fs.readFileSync(
    path.join(REGISTRY_DIR, 'ufg-source-registry.candidate.json'),
    'utf8',
  ));
  registry.activation = { state: 'shadow', runtimeConsumers: ['cadu-api'] };
  const report = JSON.parse(fs.readFileSync(
    path.join(REGISTRY_DIR, 'source-reconciliation-report.json'),
    'utf8',
  ));
  report.safety = {
    ...report.safety,
    lifecycle: 'shadow',
    runtimeActivated: true,
    collectionActivated: false,
    publishAttempted: false,
  };
  return { registry, report };
}

describe('Cadu candidate source registry mirror', () => {
  test('neutralizes a malicious reference-transaction hook without letting it repoint refs', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-hooks-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      fs.writeFileSync(path.join(upstreamRepo, 'fixture.txt'), 'trusted\n', 'utf8');
      runGit(upstreamRepo, ['add', 'fixture.txt']);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'trusted fixture',
      ]);
      const trustedCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      fs.writeFileSync(path.join(upstreamRepo, 'fixture.txt'), 'attacker\n', 'utf8');
      runGit(upstreamRepo, ['add', 'fixture.txt']);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'attacker fixture',
      ]);
      const attackerCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      const targetRef = 'refs/heads/cadu-hook-target';
      runGit(upstreamRepo, ['update-ref', targetRef, attackerCommit]);

      const maliciousHooksDir = path.join(tempRoot, 'malicious-hooks');
      const maliciousHook = path.join(maliciousHooksDir, 'reference-transaction');
      fs.mkdirSync(maliciousHooksDir, { recursive: true });
      fs.writeFileSync(maliciousHook, [
        '#!/bin/sh',
        'if [ "$1" = "committed" ]; then',
        '  printf "executed\\n" > .git/cadu-hook-executed',
        `  printf "${attackerCommit}\\n" > .git/refs/heads/cadu-hook-target`,
        'fi',
        'exit 0',
        '',
      ].join('\n'), 'utf8');
      fs.chmodSync(maliciousHook, 0o755);
      runGit(upstreamRepo, [
        'config',
        'core.hooksPath',
        maliciousHooksDir.replace(/\\/g, '/'),
      ]);

      runHardenedGit(upstreamRepo, ['update-ref', targetRef, trustedCommit]);

      expect(runGit(upstreamRepo, ['rev-parse', targetRef])).toBe(trustedCommit);
      const hookMarker = path.join(upstreamRepo, '.git', 'cadu-hook-executed');
      expect(fs.existsSync(hookMarker)).toBe(false);

      // Prove the fixture is executable and capable of overriding the ref when
      // the hardened runner is not in the path. This keeps the regression from
      // passing merely because the local Git cannot execute the hook.
      runGit(upstreamRepo, ['update-ref', targetRef, attackerCommit]);
      fs.rmSync(hookMarker, { force: true });
      runGit(upstreamRepo, ['update-ref', targetRef, trustedCommit]);
      expect(fs.existsSync(hookMarker)).toBe(true);
      expect(runGit(upstreamRepo, ['rev-parse', targetRef])).toBe(attackerCommit);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('does not inherit a caller-controlled GIT_EXEC_PATH', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-exec-path-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const maliciousExecPath = path.join(tempRoot, 'malicious-git-core');
    const originalExecPath = process.env.GIT_EXEC_PATH;
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      fs.mkdirSync(maliciousExecPath, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      process.env.GIT_EXEC_PATH = maliciousExecPath;

      const effectiveExecPath = runHardenedGit(upstreamRepo, ['--exec-path']).trim();

      expect(path.resolve(effectiveExecPath)).not.toBe(path.resolve(maliciousExecPath));
    } finally {
      if (originalExecPath === undefined) delete process.env.GIT_EXEC_PATH;
      else process.env.GIT_EXEC_PATH = originalExecPath;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('isolates caller global Git configuration while preserving local repository config', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-global-config-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const maliciousGlobalConfig = path.join(tempRoot, 'malicious.gitconfig');
    const originalGlobalConfig = process.env.GIT_CONFIG_GLOBAL;
    const originalNoSystem = process.env.GIT_CONFIG_NOSYSTEM;
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      runGit(upstreamRepo, ['config', 'cadu.local', 'trusted']);
      fs.writeFileSync(maliciousGlobalConfig, '[cadu]\n\tinjected = true\n', 'utf8');
      process.env.GIT_CONFIG_GLOBAL = maliciousGlobalConfig;
      process.env.GIT_CONFIG_NOSYSTEM = '0';

      expect(runHardenedGit(upstreamRepo, ['config', '--get', 'cadu.local']).trim())
        .toBe('trusted');
      expect(() => runHardenedGit(upstreamRepo, ['config', '--get', 'cadu.injected']))
        .toThrow();
    } finally {
      if (originalGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = originalGlobalConfig;
      if (originalNoSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
      else process.env.GIT_CONFIG_NOSYSTEM = originalNoSystem;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('proves URL-specific checkout config overrides generic Git transport safeguards', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-url-config-control-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const fetchUrl = `${EXPECTED_OPENCLAW_REMOTE}.git`;
    const scopedKey = `http.${fetchUrl}`;
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      runGit(upstreamRepo, ['config', `${scopedKey}.sslVerify`, 'false']);
      runGit(upstreamRepo, ['config', `${scopedKey}.proxy`, 'http://127.0.0.1:9']);
      runGit(upstreamRepo, ['config', `${scopedKey}.extraHeader`, 'Authorization: Basic attacker']);

      expect(runGit(upstreamRepo, [
        '-c', 'http.sslVerify=true',
        'config', '--get-urlmatch', 'http.sslVerify', fetchUrl,
      ])).toBe('false');
      expect(runGit(upstreamRepo, [
        '-c', 'http.proxy=',
        'config', '--get-urlmatch', 'http.proxy', fetchUrl,
      ])).toBe('http://127.0.0.1:9');
      expect(runGit(upstreamRepo, [
        '-c', 'http.extraHeader=',
        'config', '--get-urlmatch', 'http.extraHeader', fetchUrl,
      ])).toBe('Authorization: Basic attacker');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('neutralizes URL-specific transport config only in the disposable fetch repository', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-url-config-isolation-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const fetchUrl = `${EXPECTED_OPENCLAW_REMOTE}.git`;
    const scopedKey = `http.${fetchUrl}`;
    let isolatedRepoDir = '';
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      runGit(upstreamRepo, ['config', `${scopedKey}.sslVerify`, 'false']);
      runGit(upstreamRepo, ['config', `${scopedKey}.proxy`, 'http://127.0.0.1:9']);
      runGit(upstreamRepo, ['config', `${scopedKey}.extraHeader`, 'Authorization: Basic attacker']);
      const callerConfigPath = path.join(upstreamRepo, '.git', 'config');
      const callerConfigBefore = fs.readFileSync(callerConfigPath);

      expect(withIsolatedImportRepository(runHardenedGit, ({ repoDir, git }) => {
        isolatedRepoDir = repoDir;
        expect(path.resolve(repoDir)).not.toBe(path.resolve(upstreamRepo));
        expect(git(['config', '--get', 'remote.origin.url']).trim()).toBe(fetchUrl);
        expect(git(['config', '--get-urlmatch', 'http.sslVerify', fetchUrl]).trim()).toBe('true');
        expect(git(['config', '--get-urlmatch', 'http.proxy', fetchUrl]).trim()).toBe('');
        expect(git(['config', '--get-urlmatch', 'http.extraHeader', fetchUrl]).trim()).toBe('');
        return 'isolated';
      })).toBe('isolated');

      expect(isolatedRepoDir).not.toBe('');
      expect(fs.existsSync(isolatedRepoDir)).toBe(false);
      expect(fs.readFileSync(callerConfigPath)).toEqual(callerConfigBefore);
      expect(runGit(upstreamRepo, ['config', '--get-urlmatch', 'http.sslVerify', fetchUrl])).toBe('false');
      expect(runGit(upstreamRepo, ['config', '--get-urlmatch', 'http.proxy', fetchUrl]))
        .toBe('http://127.0.0.1:9');
      expect(runGit(upstreamRepo, ['config', '--get-urlmatch', 'http.extraHeader', fetchUrl]))
        .toBe('Authorization: Basic attacker');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('orders registry revisions numerically and audit dates chronologically', () => {
    expect(compareRegistryVersions('2026-07-13.10', '2026-07-13.9')).toBeGreaterThan(0);
    expect(compareRegistryVersions('2026-07-14.1', '2026-07-13.99')).toBeGreaterThan(0);
    expect(compareRegistryVersions('2026-07-13.6', '2026-07-13.6')).toBe(0);
    expect(compareRegistryVersions(
      '2026-07-13.9007199254740993',
      '2026-07-13.9007199254740992',
    )).toBeGreaterThan(0);
    expect(compareRegistryVersions(
      `2026-07-13.${'9'.repeat(256)}`,
      `2026-07-13.${'8'.repeat(256)}`,
    )).toBeGreaterThan(0);
    expect(() => compareRegistryVersions('2026-02-30.1', '2026-02-28.1')).toThrow(/invalid day/);
    expect(() => compareRegistryVersions('2026-13-01.1', '2026-12-01.1')).toThrow(/invalid month/);
  });

  test('keeps repair explicit and separate from check and deliberate downgrade', () => {
    const importArgs = [
      '--openclaw-repo', 'C:/openclaw-cadu',
      '--openclaw-commit', 'a'.repeat(40),
      '--repair',
    ];
    expect(parseArgs(importArgs)).toEqual(expect.objectContaining({ repair: true, allowDowngrade: false }));
    expect(() => parseArgs(['--check', '--repair'])).toThrow(/cannot be combined/);
    expect(() => parseArgs([...importArgs, '--allow-downgrade'])).toThrow(/cannot be combined/);
  });

  test('rejects every upstream activation other than the exact cadu-api shadow', () => {
    const { registry, report } = shadowFixtureFromBundledArtifacts();
    expect(validateCandidateRegistry(registry)).toBe(registry);
    expect(validateReconciliationReport(report, registry)).toBe(report);

    for (const activation of [
      { state: 'candidate', runtimeConsumers: [] },
      { state: 'shadow', runtimeConsumers: [] },
      { state: 'shadow', runtimeConsumers: ['cadu-api', 'publisher'] },
      { state: 'active', runtimeConsumers: ['cadu-api'] },
    ]) {
      expect(() => validateCandidateRegistry({ ...registry, activation }))
        .toThrow(/shadowed only by cadu-api/);
    }

    const enabledWeb = JSON.parse(JSON.stringify(registry));
    enabledWeb.webSources[0].enabled = true;
    expect(() => validateCandidateRegistry(enabledWeb)).toThrow(/must remain disabled/);
    const enabledInstagram = JSON.parse(JSON.stringify(registry));
    enabledInstagram.instagramProfiles[0].enabled = true;
    expect(() => validateCandidateRegistry(enabledInstagram)).toThrow(/must remain disabled/);

    for (const unsafeReport of [
      { ...report, safety: { ...report.safety, lifecycle: 'candidate' } },
      { ...report, safety: { ...report.safety, runtimeActivated: false } },
      { ...report, safety: { ...report.safety, collectionActivated: true } },
      { ...report, safety: { ...report.safety, publishAttempted: true } },
      { ...report, safety: { ...report.safety, networkAccessRequired: true } },
      { ...report, normalizedRegistry: { ...report.normalizedRegistry, enabledWebSources: 1 } },
      { ...report, normalizedRegistry: { ...report.normalizedRegistry, enabledInstagramProfiles: 1 } },
    ]) {
      expect(() => validateReconciliationReport(unsafeReport, registry)).toThrow();
    }
  });

  test('requires the exact read-only KinoCampus mirror safety envelope', () => {
    const current = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const safeManifest = {
      ...current,
      safety: { ...EXPECTED_MIRROR_SAFETY },
    };
    expect(validateManifest(safeManifest)).toBe(safeManifest);

    for (const unsafeSafety of [
      { ...EXPECTED_MIRROR_SAFETY, lifecycle: 'candidate' },
      { ...EXPECTED_MIRROR_SAFETY, readOnlyMirror: false },
      { ...EXPECTED_MIRROR_SAFETY, runtimeActivated: true },
      { ...EXPECTED_MIRROR_SAFETY, publisherUsesLegacySources: false },
      { ...EXPECTED_MIRROR_SAFETY, activePublisherRegistry: 'shadow.json' },
      { ...EXPECTED_MIRROR_SAFETY, unreviewedFlag: true },
    ]) {
      expect(() => validateManifest({ ...safeManifest, safety: unsafeSafety }))
        .toThrow(/mirror safety policy/);
    }
  });

  test('requires an exact, unique and cryptographically formed manifest artifact set', () => {
    const current = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(validateManifest(current)).toBe(current);
    const mutation = (change) => {
      const value = JSON.parse(JSON.stringify(current));
      change(value);
      return value;
    };
    for (const invalidManifest of [
      mutation((value) => { value.artifacts[1].id = value.artifacts[0].id; }),
      mutation((value) => { value.artifacts[0].file = '../candidate.json'; }),
      mutation((value) => { value.artifacts[0].upstreamPath = 'other/path.json'; }),
      mutation((value) => { value.artifacts[0].upstreamGitBlobOid = '0'.repeat(39); }),
      mutation((value) => { value.artifacts[0].contentSha256 = '0'.repeat(63); }),
      mutation((value) => { value.artifacts[0].byteLength = 0; }),
      mutation((value) => { value.artifacts[0].unexpected = true; }),
      mutation((value) => { value.upstream.unexpected = true; }),
      mutation((value) => { value.unexpected = true; }),
    ]) {
      expect(() => validateManifest(invalidManifest)).toThrow();
    }
  });

  test('pins all upstream artifacts to the merged OpenClaw commit', () => {
    const { manifest } = verifyMirroredRegistry();
    expect(manifest.upstream).toEqual({
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      commit: '749c05beff5d81253d3b5f36d4bf076950186740',
    });
    expect(Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.id, artifact.upstreamGitBlobOid]))).toEqual({
      candidate: '8d69cc7f6ed555697d00bee804c809bf37c1d13a',
      schema: '04bc038f0694066b447f56940eb5e0dceb1dbcef',
      'reconciliation-report': '2efe00d49a06d0cf9344f9054a0d82ae9f33b467',
    });
  });

  test('loads the full structured candidate without enabling it', () => {
    const { registry, schema } = verifyMirroredRegistry();
    expect(loadCandidateSourceRegistry()).toEqual(registry);
    expect(registry.activation).toEqual({ state: 'shadow', runtimeConsumers: ['cadu-api'] });
    expect(registry.entities).toHaveLength(172);
    expect(registry.webSources).toHaveLength(198);
    expect(registry.instagramProfiles).toHaveLength(103);
    expect(registry.webSources.every((source) => source.enabled === false)).toBe(true);
    expect(registry.instagramProfiles.every((profile) => profile.enabled === false)).toBe(true);

    const missingProvenance = JSON.parse(JSON.stringify(registry));
    delete missingProvenance.provenance;
    expect(() => validateRegistrySchema(missingProvenance, schema)).toThrow(/violates mirrored schema/);

    const orphanParent = JSON.parse(JSON.stringify(registry));
    orphanParent.entities[0].parentId = 'ufg.missing-parent';
    expect(() => validateCandidateRegistry(orphanParent)).toThrow(/unknown parent/);

    const cyclicHierarchy = JSON.parse(JSON.stringify(registry));
    cyclicHierarchy.entities[0].parentId = cyclicHierarchy.entities[0].id;
    expect(() => validateCandidateRegistry(cyclicHierarchy)).toThrow(/hierarchy cycle/);
  });

  test('enforces upstream directory, temporal, placeholder, execution and fail-closed invariants', () => {
    const { registry } = verifyMirroredRegistry();
    const rejectMutation = (change, pattern) => {
      const candidate = JSON.parse(JSON.stringify(registry));
      change(candidate);
      expect(() => validateCandidateRegistry(candidate)).toThrow(pattern);
    };
    rejectMutation(
      (candidate) => { candidate.authoritativeDirectories[1].id = candidate.authoritativeDirectories[0].id; },
      /duplicate directory id/,
    );
    rejectMutation(
      (candidate) => { candidate.authoritativeDirectories[0].checkedAt = '2026-07-23'; },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => { candidate.authoritativeDirectories[0].pageUpdatedAt = '2026-07-23'; },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => { candidate.authoritativeDirectories[0].url = 'https://ppgx.unidade.ufg.br/'; },
      /must not be a placeholder/,
    );
    rejectMutation(
      (candidate) => { candidate.entities[0].name = 'PPGX <placeholder>'; },
      /placeholder entity/,
    );
    rejectMutation(
      (candidate) => { candidate.webSources[0].canonicalUrl = 'https://ppgx.unidade.ufg.br/'; },
      /must not be a placeholder/,
    );
    rejectMutation(
      (candidate) => {
        const source = candidate.webSources.find((entry) => entry.executionModes.length > 1);
        source.executionModes.reverse();
      },
      /executionModes order drift/,
    );
    rejectMutation(
      (candidate) => {
        const profile = candidate.instagramProfiles.find((entry) => entry.executionModes.length > 1);
        profile.executionModes.reverse();
      },
      /executionModes order drift/,
    );
    rejectMutation(
      (candidate) => { candidate.webSources[0].audit.checkedAt = '2026-07-23'; },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => {
        const source = candidate.webSources.find((entry) => entry.audit.evidence.length > 0);
        source.audit.evidence[0].checkedAt = '2026-07-23';
      },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => { candidate.webSources[0].transport.checkedAt = '2026-07-23'; },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => {
        const observation = candidate.webSources
          .flatMap((source) => source.observations)
          .find((entry) => entry.publisherDeclared !== null);
        observation.publisherDeclared.lastAudit = '2026-07-23';
      },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => { candidate.instagramProfiles[0].audit.checkedAt = '2026-07-23'; },
      /must not be after auditCutoff/,
    );
    rejectMutation(
      (candidate) => {
        const source = candidate.webSources.find((entry) => entry.reviewState === 'quarantined');
        source.reviewIssues = [];
      },
      /quarantine must explain its blockers/,
    );
    rejectMutation(
      (candidate) => {
        const source = candidate.webSources.find((entry) => entry.transport.status === 'verified_200');
        source.transport.httpStatus = 404;
      },
      /verified transport needs HTTP 200/,
    );
  });

  test('enforces executable registry semantics independently of the mirrored schema', () => {
    const { registry, schema, report } = verifyMirroredRegistry();
    const rejectMutation = (change, pattern) => {
      const candidate = JSON.parse(JSON.stringify(registry));
      change(candidate);
      expect(() => validateCandidateRegistry(candidate)).toThrow(pattern);
    };
    const firstWebObservation = (candidate) => candidate.webSources
      .find((source) => source.observations.length > 0).observations[0];
    const firstInstagramObservation = (candidate) => candidate.instagramProfiles
      .find((profile) => profile.observations.length > 0).observations[0];

    for (const [change, pattern] of [
      [(candidate) => { candidate.entities[0].kind = 'invented_kind'; }, /kind has invalid value/],
      [(candidate) => { candidate.entities[0].campus = 'moon'; }, /campus has invalid value/],
      [(candidate) => { candidate.entities[0].status = 'enabled'; }, /status has invalid value/],
      [(candidate) => { candidate.webSources[0].role = 'collector'; }, /role has invalid value/],
      [(candidate) => { candidate.webSources[0].sourceKind = 'api'; }, /sourceKind has invalid value/],
      [(candidate) => { candidate.webSources[0].baseTier = 4; }, /invalid baseTier/],
      [(candidate) => { candidate.webSources[0].collection.strategy = 'crawl_all'; }, /collection strategy has invalid value/],
      [(candidate) => { candidate.webSources[0].collection.maxItems = 201; }, /integer from 1 to 200/],
      [(candidate) => { candidate.webSources[0].collection.forceDetailFetch = 'yes'; }, /forceDetailFetch/],
      [(candidate) => { candidate.webSources[0].allowPatterns = ['eventos', 'eventos']; }, /unique items/],
      [(candidate) => { candidate.webSources[0].blockPatterns = ['']; }, /non-empty strings/],
      [(candidate) => { candidate.webSources[0].reviewState = 'ready'; }, /reviewState has invalid value/],
      [(candidate) => { candidate.webSources[0].reviewIssues = ['unknown_issue']; }, /reviewIssue has invalid value/],
      [(candidate) => { candidate.webSources[0].endpoints.unknown = { url: candidate.webSources[0].canonicalUrl, status: 'confirmed' }; }, /endpoints has unknown field/],
      [(candidate) => { Object.values(candidate.webSources[0].endpoints)[0].status = 'ready'; }, /endpoint .* status has invalid value/],
      [(candidate) => { candidate.webSources[0].transport.status = 'online'; }, /transport status has invalid value/],
      [(candidate) => { firstWebObservation(candidate).inventory = 'browser'; }, /observation .* inventory has invalid value/],
      [(candidate) => { firstWebObservation(candidate).tier = 4; }, /invalid tier/],
      [(candidate) => { firstWebObservation(candidate).quick = 'yes'; }, /invalid quick/],
      [(candidate) => { firstWebObservation(candidate).forceDetailFetch = 1; }, /invalid forceDetailFetch/],
      [(candidate) => { firstWebObservation(candidate).maxItems = 0; }, /invalid maxItems/],
      [(candidate) => { firstWebObservation(candidate).unexpected = true; }, /has unknown field unexpected/],
      [(candidate) => {
        const observation = candidate.webSources
          .flatMap((source) => source.observations)
          .find((entry) => entry.publisherDeclared !== null);
        observation.publisherDeclared.qualityScore = 2;
      }, /invalid qualityScore/],
      [(candidate) => { candidate.instagramProfiles[0].status = 'enabled'; }, /status has invalid value/],
      [(candidate) => { candidate.instagramProfiles[0].identityStatus = 'guessed'; }, /identityStatus has invalid value/],
      [(candidate) => { firstInstagramObservation(candidate).inventory = 'browser'; }, /inventory has invalid value/],
      [(candidate) => { firstInstagramObservation(candidate).unexpected = true; }, /fields drift/],
    ]) {
      rejectMutation(change, pattern);
    }

    const permissiveSchema = JSON.parse(JSON.stringify(schema));
    permissiveSchema.$defs.webSource.properties.collection.properties.maxItems.maximum = Number.MAX_SAFE_INTEGER;
    const permissiveSchemaBytes = Buffer.from(JSON.stringify(permissiveSchema), 'utf8');
    const unsafeRegistry = JSON.parse(JSON.stringify(registry));
    unsafeRegistry.webSources[0].collection.maxItems = Number.MAX_SAFE_INTEGER;
    unsafeRegistry.provenance.schemaContentSha256 = sha256(permissiveSchemaBytes);
    const matchingReport = JSON.parse(JSON.stringify(report));
    matchingReport.generatedFrom = JSON.parse(JSON.stringify(unsafeRegistry.provenance));
    expect(validateRegistrySchema(unsafeRegistry, permissiveSchema)).toBe(unsafeRegistry);
    expect(() => validateRegistryBundle(
      unsafeRegistry,
      permissiveSchema,
      matchingReport,
      permissiveSchemaBytes,
    )).toThrow(/integer from 1 to 200/);
  });

  test('enforces cross-record identity, reference, provenance and report metric contracts', () => {
    const { registry, schema, report } = verifyMirroredRegistry();
    const cloneRegistry = () => JSON.parse(JSON.stringify(registry));

    const profileUrlDrift = cloneRegistry();
    profileUrlDrift.instagramProfiles[0].profileUrl = 'https://www.instagram.com/wrong/';
    expect(() => validateCandidateRegistry(profileUrlDrift)).toThrow(/profile URL\/handle drift/);

    const duplicateHandle = cloneRegistry();
    duplicateHandle.instagramProfiles[1].handle = duplicateHandle.instagramProfiles[0].handle;
    duplicateHandle.instagramProfiles[1].profileUrl = duplicateHandle.instagramProfiles[0].profileUrl;
    expect(() => validateCandidateRegistry(duplicateHandle)).toThrow(/handle collides/);

    const missingReplacement = cloneRegistry();
    const reassigned = missingReplacement.instagramProfiles.find((profile) => profile.identityStatus === 'reassigned');
    reassigned.supersededBy = 'ig.unknown-replacement';
    expect(() => validateCandidateRegistry(missingReplacement)).toThrow(/references unknown profile/);

    const selfReplacement = cloneRegistry();
    const selfReassigned = selfReplacement.instagramProfiles.find((profile) => profile.identityStatus === 'reassigned');
    selfReassigned.supersededBy = selfReassigned.id;
    expect(() => validateCandidateRegistry(selfReplacement)).toThrow(/cannot supersede itself/);

    const unknownSourceReference = cloneRegistry();
    unknownSourceReference.instagramProfiles[0].observations[0].sourceId = 'web.unknown';
    expect(() => validateCandidateRegistry(unknownSourceReference)).toThrow(/unknown sourceId/);

    const unknownInstagramReference = cloneRegistry();
    const webObservation = unknownInstagramReference.webSources
      .flatMap((source) => source.observations.map((observation) => ({ source, observation })))
      .find(({ observation }) => observation.instagram !== null);
    webObservation.observation.instagram = 'unknown.handle';
    expect(() => validateCandidateRegistry(unknownInstagramReference)).toThrow(/unknown Instagram handle/);

    const provenancePathDrift = cloneRegistry();
    provenancePathDrift.provenance.inputs[1].path = 'scripts/other.js';
    expect(() => validateCandidateRegistry(provenancePathDrift)).toThrow(/path drift/);

    const reportProvenanceDrift = JSON.parse(JSON.stringify(report));
    reportProvenanceDrift.generatedFrom.generator = 'other-generator.js';
    expect(() => validateReconciliationReport(reportProvenanceDrift, registry)).toThrow(/provenance drift/);

    const normalizedMetricDrift = JSON.parse(JSON.stringify(report));
    normalizedMetricDrift.normalizedRegistry.pendingWebSources += 1;
    expect(() => validateReconciliationReport(normalizedMetricDrift, registry)).toThrow(/normalized metrics drift/);

    const blockerMetricDrift = JSON.parse(JSON.stringify(report));
    blockerMetricDrift.activationBlockers.find((blocker) => blocker.id === 'quarantined-sources').count += 1;
    expect(() => validateReconciliationReport(blockerMetricDrift, registry)).toThrow(/quarantined-sources count drift/);

    const schemaHashDriftRegistry = cloneRegistry();
    schemaHashDriftRegistry.provenance.schemaContentSha256 = '0'.repeat(64);
    const schemaHashDriftReport = JSON.parse(JSON.stringify(report));
    schemaHashDriftReport.generatedFrom = JSON.parse(JSON.stringify(schemaHashDriftRegistry.provenance));
    const schemaBytes = fs.readFileSync(path.join(REGISTRY_DIR, 'ufg-source-registry.schema.json'));
    expect(() => validateRegistryBundle(
      schemaHashDriftRegistry,
      schema,
      schemaHashDriftReport,
      schemaBytes,
    )).toThrow(/schemaContentSha256 drift/);
  });

  test('rejects declared OpenClaw provenance whose pinned Git bytes do not match', () => {
    const { registry } = verifyMirroredRegistry();
    const fakeGit = (args, encoding = 'utf8') => {
      if (args[0] === 'merge-base') return '';
      if (args[0] === 'cat-file') return 'blob\n';
      if (args[0] === 'show') return Buffer.from('different upstream bytes\n', 'utf8');
      if (args[0] === 'rev-parse' && /\^\{commit\}$/.test(args[2])) {
        return `${args[2].replace(/\^\{commit\}$/, '')}\n`;
      }
      if (args[0] === 'rev-parse') return `${'b'.repeat(40)}\n`;
      throw new Error(`unexpected fake Git call: ${args.join(' ')}, ${encoding}`);
    };
    expect(() => validateOpenClawProvenance(registry, fakeGit, 'f'.repeat(40)))
      .toThrow(/provenance content hash drift/);
  });

  test('matches upstream OpenClaw text provenance across CRLF, bare CR and LF', () => {
    const { registry: bundledRegistry } = verifyMirroredRegistry();
    const registry = JSON.parse(JSON.stringify(bundledRegistry));
    const mixedEolBytes = Buffer.from('first\r\nsecond\rthird\nfourth\r\n', 'utf8');
    const normalizedHash = sha256(Buffer.from('first\nsecond\nthird\nfourth\n', 'utf8'));
    expect(sha256(mixedEolBytes)).not.toBe(normalizedHash);
    for (const input of registry.provenance.inputs
      .filter((entry) => entry.repository === EXPECTED_OPENCLAW_REMOTE)) {
      input.contentSha256 = normalizedHash;
    }
    const fakeGit = (args) => {
      if (args[0] === 'merge-base') return '';
      if (args[0] === 'cat-file') return 'blob\n';
      if (args[0] === 'show') return mixedEolBytes;
      if (args[0] === 'rev-parse' && /\^\{commit\}$/.test(args[2])) {
        return `${args[2].replace(/\^\{commit\}$/, '')}\n`;
      }
      if (args[0] === 'rev-parse') return `${'b'.repeat(40)}\n`;
      throw new Error(`unexpected fake Git call: ${args.join(' ')}`);
    };
    expect(() => validateOpenClawProvenance(registry, fakeGit, 'f'.repeat(40))).not.toThrow();
  });

  test('preserves __proto__ as canonical JSON data without invoking the legacy prototype setter', () => {
    const withProtoKey = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');
    const withoutProtoKey = { safe: 1 };
    const sorted = sortObjectDeepByCodepoint(withProtoKey);

    expect(Object.getPrototypeOf(sorted)).toBe(null);
    expect(Object.prototype.hasOwnProperty.call(sorted, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(sorted)).__proto__).toEqual({ polluted: true });
    expect(canonicalJsonSha256(withProtoKey)).not.toBe(canonicalJsonSha256(withoutProtoKey));
    expect({}.polluted).toBeUndefined();
  });

  test('recomputes a canonical Kino publisher payload from a hermetic fetched Git blob', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-kino-hermetic-'));
    try {
      const { registry: bundledRegistry } = verifyMirroredRegistry();
      const bundledInput = bundledRegistry.provenance.inputs
        .find((input) => input.id === 'kino_publisher');
      expect(bundledInput).toEqual(expect.objectContaining({
        commit: 'd8f31d3984d781ed167f637c3fa2455a028c1d07',
        contentSha256: 'ff41a4d9d71d1c6f3af46388bf0000bfbf76c15c562f084359da58f4bd18af49',
      }));

      const fixture = createKinoPublisherFixture(tempRoot);
      const registry = JSON.parse(JSON.stringify(bundledRegistry));
      const fixtureInput = registry.provenance.inputs.find((input) => input.id === 'kino_publisher');
      fixtureInput.commit = fixture.commit;
      fixtureInput.contentSha256 = fixture.canonicalPayloadSha256;
      const verified = validateKinoPublisherProvenance(registry, { runGit: fixture.runGit });
      expect(verified).toEqual(expect.objectContaining({
        branch: EXPECTED_KINO_BRANCH,
        canonicalPayloadSha256: fixture.canonicalPayloadSha256,
        commit: fixture.commit,
        gitBlobOid: fixture.gitBlobOid,
        trustTarget: `refs/remotes/origin/${EXPECTED_KINO_BRANCH}`,
      }));
      expect(verified.rawContentSha256).not.toBe(verified.canonicalPayloadSha256);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('rejects untrusted Kino publisher hash, commit, path, object and Git graph state', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-kino-provenance-'));
    const kinoRepo = path.join(tempRoot, 'kino-campus');
    const sourcePath = EXPECTED_PROVENANCE.inputs.find((input) => input.id === 'kino_publisher').path;
    const sourceFile = path.join(kinoRepo, sourcePath);
    const cloneRegistry = () => JSON.parse(JSON.stringify(verifyMirroredRegistry().registry));
    try {
      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
      runGit(kinoRepo, ['init', `--initial-branch=${EXPECTED_KINO_BRANCH}`]);
      const payload = {
        meta: { zeta: { second: 2, first: 1 }, totalSites: 2, alpha: true },
        sources: [
          { z: 3, a: { y: 2, x: 1 } },
          { name: 'segunda', flags: { quick: true, full: false } },
        ],
      };
      const deliberatelyUnsorted = { sources: payload.sources, meta: payload.meta };
      fs.writeFileSync(
        sourceFile,
        `\uFEFF${JSON.stringify(deliberatelyUnsorted, null, 4).replace(/\n/g, '\r\n')}\r\n`,
        'utf8',
      );
      runGit(kinoRepo, ['add', sourcePath]);
      runGit(kinoRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'canonical publisher fixture',
      ]);
      const validCommit = runGit(kinoRepo, ['rev-parse', 'HEAD']);

      const validRegistry = cloneRegistry();
      const kinoInput = validRegistry.provenance.inputs.find((input) => input.id === 'kino_publisher');
      kinoInput.commit = validCommit;
      kinoInput.contentSha256 = canonicalJsonSha256(payload);
      const trustedFetchGit = () => makeOfflineFetchGit(
        kinoRepo,
        `refs/heads/${EXPECTED_KINO_BRANCH}`,
      );
      const validated = validateKinoPublisherProvenance(validRegistry, { runGit: trustedFetchGit() });
      expect(validated.canonicalPayloadSha256).toBe(kinoInput.contentSha256);
      expect(validated.rawContentSha256).not.toBe(kinoInput.contentSha256);

      fs.writeFileSync(sourceFile, '{"workingTree":"must not be read"}\n', 'utf8');
      expect(validateKinoPublisherProvenance(validRegistry, { runGit: trustedFetchGit() }).gitBlobOid)
        .toBe(validated.gitBlobOid);
      runGit(kinoRepo, ['restore', sourcePath]);

      const hashDrift = JSON.parse(JSON.stringify(validRegistry));
      hashDrift.provenance.inputs.find((input) => input.id === 'kino_publisher').contentSha256 = '0'.repeat(64);
      expect(() => validateKinoPublisherProvenance(hashDrift, { runGit: trustedFetchGit() }))
        .toThrow(/canonical payload hash drift/);

      const missingCommit = JSON.parse(JSON.stringify(validRegistry));
      missingCommit.provenance.inputs.find((input) => input.id === 'kino_publisher').commit = 'f'.repeat(40);
      expect(() => validateKinoPublisherProvenance(missingCommit, { runGit: trustedFetchGit() }))
        .toThrow(/not reachable from fetched origin/);

      const pathDrift = JSON.parse(JSON.stringify(validRegistry));
      pathDrift.provenance.inputs.find((input) => input.id === 'kino_publisher').path = 'other/sources.json';
      expect(() => validateKinoPublisherProvenance(pathDrift, { runGit: trustedFetchGit() }))
        .toThrow(/path drift/);

      runGit(kinoRepo, ['checkout', '-b', 'untrusted-side']);
      fs.writeFileSync(path.join(kinoRepo, 'side.txt'), 'side\n', 'utf8');
      runGit(kinoRepo, ['add', 'side.txt']);
      runGit(kinoRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'untrusted side commit',
      ]);
      const sideCommit = runGit(kinoRepo, ['rev-parse', 'HEAD']);
      runGit(kinoRepo, ['checkout', EXPECTED_KINO_BRANCH]);
      fs.writeFileSync(path.join(kinoRepo, 'canonical.txt'), 'canonical\n', 'utf8');
      runGit(kinoRepo, ['add', 'canonical.txt']);
      runGit(kinoRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'trusted canonical branch advance',
      ]);
      const canonicalCommit = runGit(kinoRepo, ['rev-parse', 'HEAD']);
      const nonAncestor = JSON.parse(JSON.stringify(validRegistry));
      nonAncestor.provenance.inputs.find((input) => input.id === 'kino_publisher').commit = sideCommit;
      const sideObjectGit = makeOfflineFetchGit(
        kinoRepo,
        `refs/heads/${EXPECTED_KINO_BRANCH}`,
        {
          afterFetch: ({ repoDir }) => runGit(repoDir, [
            'fetch',
            '--quiet',
            '--no-tags',
            pathToFileURL(kinoRepo).href,
            '+refs/heads/untrusted-side:refs/heads/untrusted-side',
          ]),
        },
      );
      expect(() => validateKinoPublisherProvenance(nonAncestor, { runGit: sideObjectGit }))
        .toThrow(/not an ancestor/);

      runGit(kinoRepo, ['update-ref', `refs/remotes/origin/${EXPECTED_KINO_BRANCH}`, sideCommit]);
      runGit(kinoRepo, ['checkout', 'untrusted-side']);
      expect(validateKinoPublisherProvenance(validRegistry, { runGit: trustedFetchGit() }).commit)
        .toBe(validCommit);
      runGit(kinoRepo, ['checkout', EXPECTED_KINO_BRANCH]);

      const replaceGit = makeOfflineFetchGit(
        kinoRepo,
        `refs/heads/${EXPECTED_KINO_BRANCH}`,
        {
          afterFetch: ({ repoDir }) => runGit(repoDir, ['replace', validCommit, canonicalCommit]),
        },
      );
      expect(() => validateKinoPublisherProvenance(validRegistry, { runGit: replaceGit }))
        .toThrow(/replace refs are not allowed/);

      const graftGit = makeOfflineFetchGit(
        kinoRepo,
        `refs/heads/${EXPECTED_KINO_BRANCH}`,
        {
          afterFetch: ({ repoDir }) => {
            const graftsPath = path.join(repoDir, 'info', 'grafts');
            fs.mkdirSync(path.dirname(graftsPath), { recursive: true });
            fs.writeFileSync(graftsPath, `${validCommit} ${canonicalCommit}\n`, 'utf8');
          },
        },
      );
      expect(() => validateKinoPublisherProvenance(validRegistry, { runGit: graftGit }))
        .toThrow(/repository grafts are not allowed/);

      const redirectedOriginGit = makeOfflineFetchGit(
        kinoRepo,
        `refs/heads/${EXPECTED_KINO_BRANCH}`,
        {
          afterRemoteAdd: ({ repoDir }) => runGit(repoDir, [
            'config',
            `url.${pathToFileURL(kinoRepo).href}.insteadOf`,
            `${EXPECTED_KINO_REMOTE}.git`,
          ]),
        },
      );
      expect(() => validateKinoPublisherProvenance(validRegistry, { runGit: redirectedOriginGit }))
        .toThrow(/effective KinoCampus origin remote mismatch/);

      fs.rmSync(sourceFile, { force: true });
      fs.mkdirSync(sourceFile, { recursive: true });
      fs.writeFileSync(path.join(sourceFile, 'child.json'), '{}\n', 'utf8');
      runGit(kinoRepo, ['add', '-A']);
      runGit(kinoRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'path becomes tree',
      ]);
      const treeCommit = runGit(kinoRepo, ['rev-parse', 'HEAD']);
      const nonBlob = JSON.parse(JSON.stringify(validRegistry));
      nonBlob.provenance.inputs.find((input) => input.id === 'kino_publisher').commit = treeCommit;
      expect(() => validateKinoPublisherProvenance(nonBlob, { runGit: trustedFetchGit() }))
        .toThrow(/object must be a blob/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('preserves declared, canonical, transport, endpoint and Instagram evidence fields', () => {
    const { registry, report } = verifyMirroredRegistry();
    const sources = new Map(registry.webSources.map((source) => [source.id, source]));
    const proec = sources.get('web.ufg.proec');
    expect(proec).toEqual(expect.objectContaining({
      declaredUrl: 'https://proex.ufg.br/',
      canonicalUrl: 'https://proex.ufg.br/',
      enabled: false,
    }));
    expect(proec.aliases).toContain('https://proec.ufg.br/');
    expect(proec.transport.status).toBe('verified_200');
    expect(proec.audit.evidence.some((entry) => entry.field === 'entity_and_canonical_url')).toBe(true);

    const nanofarma = sources.get('web.ufg.ppg.ppgnanofarma.profile');
    expect(nanofarma.declaredUrl).toBe('https://www.ufrgs.br/farmacia/?page_id=1589');
    expect(nanofarma.aliases).not.toContain(nanofarma.declaredUrl);
    // Operational PPGAC root is the IAC Weby host; the pos.ufg.br/p page remains
    // directory evidence/linhagem, not the collection canonical URL.
    expect(sources.get('web.ufg.ppg.ppgac.profile').canonicalUrl)
      .toBe('https://artesdacenappg.iac.ufg.br/');

    const publisherObservations = registry.webSources
      .flatMap((source) => source.observations)
      .filter((observation) => observation.inventory === 'kino_publisher');
    expect(publisherObservations).toHaveLength(107);
    expect(publisherObservations.every((observation) => observation.publisherDeclared)).toBe(true);
    expect(publisherObservations.filter((observation) => observation.publisherDeclared.hasFeedRss)).toHaveLength(103);

    expect(registry.instagramProfiles.filter((profile) => profile.audit.evidence.length > 0)).toHaveLength(57);
    expect(report.instagramOverlap.legacyNotScanned).toEqual([
      'jornalufg',
      'labmic.ufg',
      'patiodaciencia_ufg',
      'ppgccufg',
    ]);
    expect(report.instagramOverlap.scannerWithoutEntity).toHaveLength(5);
  });

  test('keeps the legacy registry as the only active publisher input', () => {
    const legacy = loadSources(DEFAULT_SOURCE_PATH);
    expect(legacy).toHaveLength(107);
    expect(selectSources(legacy, 'quick')).toHaveLength(103);
    expect(selectSources(legacy, 'full')).toHaveLength(107);
    expect(legacy.find((source) => source.id === 'proex')).toMatchObject({
      name: 'Pró-Reitoria de Extensão (PROEX)',
      baseUrl: 'https://proex.ufg.br/',
      tier: 1,
      quick: true,
      enabled: true,
    });

    const toolingAllowlist = new Set([
      path.resolve(SYNC_SCRIPT),
      path.resolve(ROOT, 'services', 'cadu-ufg-publisher', 'scripts', 'lib', 'candidate-source-registry.js'),
      // The admin proxy only forwards the immutable OpenClaw shadow API; it
      // never loads this repository's candidate artifact into the publisher.
      path.resolve(ROOT, 'api', 'cadu', 'sites.js'),
      // The admin projection validator consumes only the authenticated shadow
      // API response and has no filesystem access to the candidate artifact.
      path.resolve(ROOT, 'assets', 'js', 'controllers', 'admin', 'admin-cadu-sources.js'),
      // The admin controller requests that validated projection through the
      // proxy; it does not activate or import the publisher candidate.
      path.resolve(ROOT, 'assets', 'js', 'controllers', 'admin', 'admin-cadu.controller.js'),
      // The server-side admin mirror projects the pinned candidate exclusively
      // as a disabled, read-only fallback. API contract tests prove that it is
      // unavailable to readiness and mutation routes.
      path.resolve(ROOT, 'server', 'cadu-source-registry-mirror.js'),
    ]);
    const executableRoots = ['api', 'assets', 'scripts', 'server', 'services', 'supabase']
      .map((directory) => path.join(ROOT, directory))
      .filter((directory) => fs.existsSync(directory));
    const executableFiles = executableRoots
      .flatMap(listFiles)
      .filter((file) => /\.(?:c?js|mjs|ts|tsx)$/.test(file) && !toolingAllowlist.has(path.resolve(file)));
    for (const filePath of executableFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/(?:cadu-)?source-registry|candidate-source-registry/i);
    }
    const adminProxy = fs.readFileSync(path.join(ROOT, 'api', 'cadu', 'sites.js'), 'utf8');
    expect(adminProxy).toContain('/api/source-registry');
    expect(adminProxy).not.toMatch(/config[\\/]+cadu-source-registry|ufg-source-registry\.candidate\.json/i);
    const adminProjection = fs.readFileSync(
      path.join(ROOT, 'assets', 'js', 'controllers', 'admin', 'admin-cadu-sources.js'),
      'utf8'
    );
    expect(adminProjection).not.toMatch(/config[\\/]+cadu-source-registry|ufg-source-registry\.candidate\.json/i);
    const adminController = fs.readFileSync(
      path.join(ROOT, 'assets', 'js', 'controllers', 'admin', 'admin-cadu.controller.js'),
      'utf8'
    );
    expect(adminController).not.toMatch(/config[\\/]+cadu-source-registry|ufg-source-registry\.candidate\.json/i);
    const adminMirror = fs.readFileSync(
      path.join(ROOT, 'server', 'cadu-source-registry-mirror.js'),
      'utf8'
    );
    expect(adminMirror).toContain('ufg-source-registry.candidate.json');
    expect(adminMirror).toContain("state: 'candidate'");
    expect(adminMirror).toContain('runtimeConsumers: []');
    expect(adminMirror.match(/enabled: false/g)).toHaveLength(3);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(manifest.safety).toEqual(expect.objectContaining({
      lifecycle: 'shadow',
      readOnlyMirror: true,
      runtimeActivated: false,
      publisherUsesLegacySources: true,
    }));
  });

  test('--check is read-only and rejects byte drift', () => {
    const tracked = [
      MANIFEST_PATH,
      ...fs.readdirSync(REGISTRY_DIR)
        .filter((file) => file.endsWith('.json') && file !== path.basename(MANIFEST_PATH))
        .map((file) => path.join(REGISTRY_DIR, file)),
    ];
    const mtimes = new Map(tracked.map((file) => [file, fs.statSync(file).mtimeMs]));
    const checked = spawnSync(process.execPath, [SYNC_SCRIPT, '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(checked.status).toBe(0);
    for (const [file, mtime] of mtimes) expect(fs.statSync(file).mtimeMs).toBe(mtime);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-candidate-'));
    try {
      fs.cpSync(REGISTRY_DIR, tempDir, { recursive: true });
      const candidatePath = path.join(tempDir, 'ufg-source-registry.candidate.json');
      const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
      candidate.webSources[0].enabled = true;
      expect(() => validateCandidateRegistry(candidate)).toThrow(/must remain disabled/);
      fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
      expect(() => verifyMirroredRegistry({ registryDir: tempDir })).toThrow(/drift/);

      fs.cpSync(REGISTRY_DIR, tempDir, { recursive: true });
      const manifestPath = path.join(tempDir, path.basename(MANIFEST_PATH));
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.artifacts[0].file = '../ufg-source-registry.candidate.json';
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      expect(() => verifyMirroredRegistry({ registryDir: tempDir })).toThrow(/local file path drift/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('installs the manifest last and rolls back an interrupted artifact replacement', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-atomic-mirror-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const originals = Object.fromEntries(allFiles.map((file) => [file, Buffer.from(`old:${file}`)]));
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    const manifest = { marker: 'new manifest' };
    try {
      for (const [file, bytes] of Object.entries(originals)) fs.writeFileSync(path.join(tempDir, file), bytes);
      const installedOrder = [];
      const realRename = fs.renameSync.bind(fs);
      const realUnlink = fs.unlinkSync.bind(fs);
      let transientBackupDeleteInjected = false;
      const successSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (/\.tmp$/.test(source)) installedOrder.push(path.basename(destination));
        return realRename(source, destination);
      });
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
        if (!transientBackupDeleteInjected && /\.bak$/i.test(String(target))) {
          transientBackupDeleteInjected = true;
          const error = new Error('injected transient Windows backup handle');
          error.code = 'EBUSY';
          throw error;
        }
        return realUnlink(target);
      });
      try {
        writeImportAtomically(tempDir, contents, manifest, () => ({ verified: true }));
      } finally {
        unlinkSpy.mockRestore();
        successSpy.mockRestore();
      }
      expect(transientBackupDeleteInjected).toBe(true);
      expect(installedOrder).toEqual([...artifactFiles, 'upstream-manifest.json']);
      expect(JSON.parse(fs.readFileSync(path.join(tempDir, 'upstream-manifest.json'), 'utf8'))).toEqual(manifest);
      expect(fs.readdirSync(tempDir).filter((file) => /\.(?:tmp|bak)$/i.test(file))).toEqual([]);

      for (const [file, bytes] of Object.entries(originals)) fs.writeFileSync(path.join(tempDir, file), bytes);
      let injected = false;
      let caseVariantNestedResidue = null;
      const failureSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!caseVariantNestedResidue && /\.bak$/i.test(String(destination))
            && path.basename(source) === artifactFiles[0]) {
          caseVariantNestedResidue = path.join(
            path.dirname(destination),
            `${path.basename(destination).toUpperCase()}.tmp`,
          );
          fs.writeFileSync(caseVariantNestedResidue, 'simulated Windows filesystem-filter residue');
        }
        if (!injected && /\.tmp$/.test(source)
            && path.basename(destination) === 'ufg-source-registry.schema.json') {
          injected = true;
          throw new Error('injected rename failure');
        }
        return realRename(source, destination);
      });
      try {
        expect(() => writeImportAtomically(
          tempDir,
          contents,
          manifest,
          () => ({ verified: true }),
        )).toThrow(/injected rename failure/);
      } finally {
        failureSpy.mockRestore();
      }
      expect(caseVariantNestedResidue).not.toBeNull();
      for (const [file, bytes] of Object.entries(originals)) {
        expect(fs.readFileSync(path.join(tempDir, file))).toEqual(bytes);
      }
      expect(fs.readdirSync(tempDir).filter((file) => /\.(?:tmp|bak)$/i.test(file))).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps backups through post-install verification and fully rolls back verification failure', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-post-install-rollback-'));
    const mirrorDir = path.join(tempRoot, 'mirror');
    const emptyDir = path.join(tempRoot, 'empty');
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    try {
      fs.cpSync(REGISTRY_DIR, mirrorDir, { recursive: true });
      fs.mkdirSync(emptyDir);
      const originals = Object.fromEntries(allFiles.map((file) => [
        file,
        fs.readFileSync(path.join(mirrorDir, file)),
      ]));
      const manifest = JSON.parse(originals['upstream-manifest.json'].toString('utf8'));
      const tamperedContents = new Map(artifactFiles.map((file) => [file, Buffer.from(originals[file])]));
      tamperedContents.set(
        'ufg-source-registry.candidate.json',
        Buffer.concat([tamperedContents.get('ufg-source-registry.candidate.json'), Buffer.from(' ')]),
      );

      let verifierReached = false;
      const installedOrder = [];
      const realRename = fs.renameSync.bind(fs);
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (/\.tmp$/.test(source)) installedOrder.push(path.basename(destination));
        return realRename(source, destination);
      });
      try {
        expect(() => writeImportAtomically(
          mirrorDir,
          tamperedContents,
          manifest,
          ({ registryDir }) => {
            verifierReached = true;
            expect(installedOrder).toEqual(allFiles);
            expect(fs.readdirSync(registryDir).filter((file) => /\.bak$/.test(file))).toHaveLength(4);
            return verifyMirroredRegistry({ registryDir });
          },
        )).toThrow(/byte length drift/);
      } finally {
        renameSpy.mockRestore();
      }
      expect(verifierReached).toBe(true);
      for (const [file, bytes] of Object.entries(originals)) {
        expect(fs.readFileSync(path.join(mirrorDir, file))).toEqual(bytes);
      }
      expect(() => verifyMirroredRegistry({ registryDir: mirrorDir })).not.toThrow();
      expect(fs.readdirSync(mirrorDir).filter((file) => /\.(?:tmp|bak)$/i.test(file))).toEqual([]);

      expect(() => writeImportAtomically(
        emptyDir,
        tamperedContents,
        manifest,
        () => { throw new Error('post-install verification failure'); },
      )).toThrow(/post-install verification failure/);
      for (const file of allFiles) expect(fs.existsSync(path.join(emptyDir, file))).toBe(false);
      expect(fs.readdirSync(emptyDir).filter((file) => /\.(?:tmp|bak)$/i.test(file))).toEqual([]);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('preserves a sole case-variant nested backup when rollback cannot prove restoration', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-missing-rollback-backup-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const originals = Object.fromEntries(allFiles.map((file) => [file, Buffer.from(`old:${file}`)]));
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    const manifest = { marker: 'new manifest' };
    try {
      for (const [file, bytes] of Object.entries(originals)) fs.writeFileSync(path.join(tempDir, file), bytes);
      const realRename = fs.renameSync.bind(fs);
      let soleBackupPath = null;
      let installFailureInjected = false;
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!soleBackupPath && /\.bak$/i.test(String(destination))
            && path.basename(source) === artifactFiles[0]) {
          const result = realRename(source, destination);
          soleBackupPath = path.join(
            path.dirname(destination),
            `${path.basename(destination).toUpperCase()}.tmp`,
          );
          realRename(destination, soleBackupPath);
          return result;
        }
        if (!installFailureInjected && /\.tmp$/.test(source)
            && path.basename(destination) === artifactFiles[1]) {
          installFailureInjected = true;
          throw new Error('injected artifact installation failure');
        }
        return realRename(source, destination);
      });
      let thrown;
      try {
        writeImportAtomically(tempDir, contents, manifest, () => ({ verified: true }));
      } catch (error) {
        thrown = error;
      } finally {
        renameSpy.mockRestore();
      }

      expect(installFailureInjected).toBe(true);
      expect(soleBackupPath).not.toBeNull();
      expect(thrown).toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/rollback was incomplete/);
      expect(thrown.errors.map((error) => error.message).join('\n'))
        .toMatch(/artifact installation failure[\s\S]*rollback backup disappeared/);
      expect(fs.existsSync(path.join(tempDir, artifactFiles[0]))).toBe(false);
      expect(fs.readFileSync(soleBackupPath)).toEqual(originals[artifactFiles[0]]);
      for (const file of allFiles.filter((file) => file !== artifactFiles[0])) {
        expect(fs.readFileSync(path.join(tempDir, file))).toEqual(originals[file]);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('aggregates cleanup failures without masking the primary import failure', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-cleanup-failure-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    try {
      for (const file of allFiles) fs.writeFileSync(path.join(tempDir, file), `old:${file}`);
      const realRename = fs.renameSync.bind(fs);
      const realUnlink = fs.unlinkSync.bind(fs);
      let installFailureInjected = false;
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!installFailureInjected && /\.tmp$/.test(source)
            && path.basename(destination) === artifactFiles[1]) {
          installFailureInjected = true;
          throw new Error('injected primary installation failure');
        }
        return realRename(source, destination);
      });
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
        const basename = path.basename(String(target));
        if (basename.startsWith(`${artifactFiles[1]}.`) && /\.tmp$/i.test(basename)) {
          const error = new Error('injected persistent temporary cleanup failure');
          error.code = 'EBUSY';
          throw error;
        }
        return realUnlink(target);
      });
      let thrown;
      try {
        writeImportAtomically(tempDir, contents, { marker: 'new manifest' }, () => ({ verified: true }));
      } catch (error) {
        thrown = error;
      } finally {
        unlinkSpy.mockRestore();
        renameSpy.mockRestore();
      }

      expect(installFailureInjected).toBe(true);
      expect(thrown).toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/import failed and cleanup was incomplete/);
      expect(thrown.errors[0].message).toMatch(/primary installation failure/);
      expect(thrown.errors.slice(1).map((error) => error.message).join('\n'))
        .toMatch(/temporary cleanup failure/);
      for (const file of allFiles) {
        expect(fs.readFileSync(path.join(tempDir, file), 'utf8')).toBe(`old:${file}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('accepts cleanup recovered by the token sweep and preserves the primary failure', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-cleanup-recovered-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    try {
      for (const file of allFiles) fs.writeFileSync(path.join(tempDir, file), `old:${file}`);
      const realRename = fs.renameSync.bind(fs);
      const realUnlink = fs.unlinkSync.bind(fs);
      let installFailureInjected = false;
      let transientCleanupAttempts = 0;
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!installFailureInjected && /\.tmp$/.test(source)
            && path.basename(destination) === artifactFiles[1]) {
          installFailureInjected = true;
          throw new Error('injected primary installation failure');
        }
        return realRename(source, destination);
      });
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
        const basename = path.basename(String(target));
        if (basename.startsWith(`${artifactFiles[1]}.`) && /\.tmp$/i.test(basename)
            && transientCleanupAttempts < 9) {
          transientCleanupAttempts += 1;
          const error = new Error('injected first-pass cleanup contention');
          error.code = 'EBUSY';
          throw error;
        }
        return realUnlink(target);
      });
      let thrown;
      try {
        writeImportAtomically(tempDir, contents, { marker: 'new manifest' }, () => ({ verified: true }));
      } catch (error) {
        thrown = error;
      } finally {
        unlinkSpy.mockRestore();
        renameSpy.mockRestore();
      }

      expect(installFailureInjected).toBe(true);
      expect(transientCleanupAttempts).toBe(9);
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/primary installation failure/);
      expect(fs.readdirSync(tempDir).filter((file) => /\.(?:tmp|bak)$/i.test(file))).toEqual([]);
      for (const file of allFiles) {
        expect(fs.readFileSync(path.join(tempDir, file), 'utf8')).toBe(`old:${file}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reports persistent cleanup failure after a verified commit without reverting canonical files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-post-commit-cleanup-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    const manifest = { marker: 'verified commit' };
    try {
      for (const file of allFiles) fs.writeFileSync(path.join(tempDir, file), `old:${file}`);
      const realUnlink = fs.unlinkSync.bind(fs);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
        const basename = path.basename(String(target));
        if (basename.startsWith(`${artifactFiles[1]}.`) && /\.bak$/i.test(basename)) {
          const error = new Error('injected persistent committed-backup cleanup failure');
          error.code = 'EBUSY';
          throw error;
        }
        return realUnlink(target);
      });
      let thrown;
      try {
        writeImportAtomically(tempDir, contents, manifest, () => ({ verified: true }));
      } catch (error) {
        thrown = error;
      } finally {
        unlinkSpy.mockRestore();
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/import committed but cleanup was incomplete/);
      expect(thrown.errors.map((error) => error.message).join('\n'))
        .toMatch(/committed-backup cleanup failure/);
      for (const file of artifactFiles) {
        expect(fs.readFileSync(path.join(tempDir, file), 'utf8')).toBe(`new:${file}`);
      }
      expect(JSON.parse(fs.readFileSync(path.join(tempDir, 'upstream-manifest.json'), 'utf8')))
        .toEqual(manifest);
      const residualBackups = fs.readdirSync(tempDir).filter((file) => /\.bak$/i.test(file));
      expect(residualBackups).toHaveLength(1);
      expect(fs.readFileSync(path.join(tempDir, residualBackups[0]), 'utf8'))
        .toBe(`old:${artifactFiles[1]}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects a rollback whose restored content no longer matches the original hash', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-rollback-hash-drift-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    const originals = Object.fromEntries(allFiles.map((file) => [file, Buffer.from(`old:${file}`)]));
    const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(`new:${file}`)]));
    try {
      for (const [file, bytes] of Object.entries(originals)) fs.writeFileSync(path.join(tempDir, file), bytes);
      const realRename = fs.renameSync.bind(fs);
      let backupTampered = false;
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!backupTampered && /\.bak$/i.test(String(source))
            && path.basename(destination) === artifactFiles[0]) {
          backupTampered = true;
          fs.writeFileSync(source, 'tampered rollback bytes');
        }
        return realRename(source, destination);
      });
      let thrown;
      try {
        writeImportAtomically(
          tempDir,
          contents,
          { marker: 'new manifest' },
          () => { throw new Error('injected post-install verification failure'); },
        );
      } catch (error) {
        thrown = error;
      } finally {
        renameSpy.mockRestore();
      }

      expect(backupTampered).toBe(true);
      expect(thrown).toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/rollback was incomplete/);
      expect(thrown.errors.map((error) => error.message).join('\n'))
        .toMatch(/post-install verification failure[\s\S]*rollback content hash drift/);
      expect(fs.readFileSync(path.join(tempDir, artifactFiles[0]), 'utf8'))
        .toBe('tampered rollback bytes');
      for (const file of allFiles.filter((file) => file !== artifactFiles[0])) {
        expect(fs.readFileSync(path.join(tempDir, file))).toEqual(originals[file]);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('continues restoring other artifacts and preserves a backup when one rollback rename fails', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-rollback-failure-'));
    const artifactFiles = [
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'source-reconciliation-report.json',
    ];
    const allFiles = [...artifactFiles, 'upstream-manifest.json'];
    try {
      fs.cpSync(REGISTRY_DIR, tempDir, { recursive: true });
      const originals = Object.fromEntries(allFiles.map((file) => [
        file,
        fs.readFileSync(path.join(tempDir, file)),
      ]));
      const contents = new Map(artifactFiles.map((file) => [file, Buffer.from(originals[file])]));
      const manifest = JSON.parse(originals['upstream-manifest.json'].toString('utf8'));
      const realRename = fs.renameSync.bind(fs);
      let restoreFailureInjected = false;
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
        if (!restoreFailureInjected
            && /\.bak$/.test(source)
            && path.basename(destination) === 'ufg-source-registry.schema.json') {
          restoreFailureInjected = true;
          throw new Error('injected rollback restore failure');
        }
        return realRename(source, destination);
      });
      let thrown;
      try {
        writeImportAtomically(
          tempDir,
          contents,
          manifest,
          () => { throw new Error('post-install verification failure'); },
        );
      } catch (error) {
        thrown = error;
      } finally {
        renameSpy.mockRestore();
      }
      expect(restoreFailureInjected).toBe(true);
      expect(thrown).toBeInstanceOf(AggregateError);
      expect(thrown.message).toMatch(/rollback was incomplete/);
      expect(thrown.errors.map((error) => error.message).join('\n'))
        .toMatch(/post-install verification failure[\s\S]*injected rollback restore failure/);
      for (const file of allFiles.filter((file) => file !== 'ufg-source-registry.schema.json')) {
        expect(fs.readFileSync(path.join(tempDir, file))).toEqual(originals[file]);
      }
      expect(fs.existsSync(path.join(tempDir, 'ufg-source-registry.schema.json'))).toBe(false);
      expect(fs.readdirSync(tempDir).some((file) => (
        /^ufg-source-registry\.schema\.json\..+\.bak$/.test(file)
      ))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('holds an exclusive interprocess import lock and safely reclaims a dead owner', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-import-lock-'));
    const markerPath = path.join(tempDir, 'holder-ready');
    const childSource = [
      `const fs = require('fs');`,
      `const { withImportLock } = require(${JSON.stringify(SYNC_SCRIPT)});`,
      `withImportLock(${JSON.stringify(tempDir)}, () => {`,
      `  fs.writeFileSync(${JSON.stringify(markerPath)}, 'ready');`,
      `  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);`,
      `});`,
    ].join('\n');
    const holder = spawn(process.execPath, ['-e', childSource], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const holderExit = new Promise((resolve) => holder.once('exit', resolve));
    let stderr = '';
    holder.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    try {
      const waitArray = new Int32Array(new SharedArrayBuffer(4));
      const deadline = Date.now() + 4_000;
      while (!fs.existsSync(markerPath) && Date.now() < deadline && holder.exitCode === null) {
        Atomics.wait(waitArray, 0, 0, 25);
      }
      expect(fs.existsSync(markerPath)).toBe(true);
      expect(() => withImportLock(tempDir, () => 'should not enter')).toThrow(/lock is held by PID/);
      expect(fs.readdirSync(tempDir).some((file) => file.startsWith(`${IMPORT_LOCK_FILE}.ticket.`))).toBe(true);

      const exitCode = await holderExit;
      expect(stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(fs.readdirSync(tempDir).some((file) => file.startsWith(`${IMPORT_LOCK_FILE}.`))).toBe(false);

      const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      expect(exited.status).toBe(0);
      const staleToken = 'a'.repeat(32);
      const stalePath = path.join(tempDir, `${IMPORT_LOCK_FILE}.ticket.${exited.pid}.${staleToken}`);
      fs.writeFileSync(stalePath, JSON.stringify({
        schemaVersion: 1,
        kind: 'ticket',
        pid: exited.pid,
        createdAt: new Date().toISOString(),
        ticket: '1',
        token: staleToken,
      }));
      expect(withImportLock(tempDir, () => 'reclaimed')).toBe('reclaimed');
      expect(fs.readdirSync(tempDir).some((file) => file.startsWith(`${IMPORT_LOCK_FILE}.`))).toBe(false);

      const reusedPidToken = 'b'.repeat(32);
      const reusedPidPath = path.join(
        tempDir,
        `${IMPORT_LOCK_FILE}.ticket.${process.pid}.${reusedPidToken}`,
      );
      fs.writeFileSync(reusedPidPath, JSON.stringify({
        schemaVersion: 1,
        kind: 'ticket',
        pid: process.pid,
        createdAt: new Date().toISOString(),
        ticket: '1',
        token: reusedPidToken,
      }));
      expect(withImportLock(tempDir, () => 'reclaimed reused PID')).toBe('reclaimed reused PID');
      expect(fs.existsSync(reusedPidPath)).toBe(false);

      expect(() => withImportLock(
        tempDir,
        () => withImportLock(tempDir, () => 'must not enter nested lock'),
      )).toThrow(new RegExp(`lock is held by PID ${process.pid}`));
      expect(fs.readdirSync(tempDir).some((file) => file.startsWith(`${IMPORT_LOCK_FILE}.`))).toBe(false);
    } finally {
      if (holder.exitCode === null) holder.kill();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 10_000);

  test('does not let lock-release failure mask callback success or failure', () => {
    const successDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-lock-release-success-'));
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-lock-release-failure-'));
    const realUnlink = fs.unlinkSync.bind(fs);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      if (path.basename(String(target)).startsWith(`${IMPORT_LOCK_FILE}.ticket.`)) {
        const error = new Error('injected persistent ticket cleanup failure');
        error.code = 'EBUSY';
        throw error;
      }
      return realUnlink(target);
    });
    try {
      let successThrown;
      try {
        withImportLock(successDir, () => 'committed result');
      } catch (error) {
        successThrown = error;
      }
      expect(successThrown).toBeInstanceOf(AggregateError);
      expect(successThrown.message).toMatch(/operation completed but lock release was incomplete/);
      expect(successThrown.errors.map((error) => error.message).join('\n'))
        .toMatch(/ticket cleanup failure/);

      let failureThrown;
      try {
        withImportLock(failureDir, () => { throw new Error('primary callback failure'); });
      } catch (error) {
        failureThrown = error;
      }
      expect(failureThrown).toBeInstanceOf(AggregateError);
      expect(failureThrown.message).toMatch(/operation failed and lock release was incomplete/);
      expect(failureThrown.errors[0].message).toBe('primary callback failure');
      expect(failureThrown.errors[1].message).toMatch(/ticket cleanup failure/);
    } finally {
      unlinkSpy.mockRestore();
      fs.rmSync(successDir, { recursive: true, force: true });
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  });

  test('derives artifact bytes and blob OIDs from the declared OpenClaw commit', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-upstream-git-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const bareOrigin = path.join(tempRoot, 'openclaw-cadu-origin.git');
    const outputDir = path.join(tempRoot, 'mirror');
    try {
      const kinoFixture = createKinoPublisherFixture(tempRoot);
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      const inputBytesById = new Map();
      for (const input of EXPECTED_PROVENANCE.inputs.filter((entry) => entry.repository === EXPECTED_OPENCLAW_REMOTE)) {
        const bytes = Buffer.from(`trusted\r\nfixture\rfor ${input.id}\n`, 'utf8');
        inputBytesById.set(input.id, bytes);
        const destination = path.join(upstreamRepo, input.path);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes);
      }
      runGit(upstreamRepo, ['add', '.']);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'trusted inventory inputs',
      ]);
      const inputCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      const bundledManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      for (const artifact of bundledManifest.artifacts) {
        const destination = path.join(upstreamRepo, artifact.upstreamPath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(REGISTRY_DIR, artifact.file), destination);
      }
      const fixtureRegistryPath = path.join(upstreamRepo, bundledManifest.artifacts
        .find((artifact) => artifact.id === 'candidate').upstreamPath);
      const fixtureReportPath = path.join(upstreamRepo, bundledManifest.artifacts
        .find((artifact) => artifact.id === 'reconciliation-report').upstreamPath);
      const { registry: shadowRegistry, report: shadowReport } = shadowFixtureFromBundledArtifacts();
      shadowRegistry.provenance.inputs = shadowRegistry.provenance.inputs.map((input) => {
        if (input.id === 'kino_publisher') {
          return {
            ...input,
            commit: kinoFixture.commit,
            contentSha256: kinoFixture.canonicalPayloadSha256,
          };
        }
        if (!inputBytesById.has(input.id)) return input;
        return {
          ...input,
          commit: inputCommit,
          contentSha256: sha256(Buffer.from(
            inputBytesById.get(input.id).toString('utf8').replace(/\r\n?/g, '\n'),
            'utf8',
          )),
        };
      });
      shadowReport.generatedFrom = JSON.parse(JSON.stringify(shadowRegistry.provenance));
      fs.writeFileSync(fixtureRegistryPath, `${JSON.stringify(shadowRegistry, null, 2)}\n`, 'utf8');
      fs.writeFileSync(fixtureReportPath, `${JSON.stringify(shadowReport, null, 2)}\n`, 'utf8');
      runGit(upstreamRepo, ['add', '.']);
      runGit(upstreamRepo, ['-c', 'user.name=KinoCampus Test', '-c', 'user.email=test@kino.invalid', 'commit', '-m', 'test fixture']);
      const commit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      runGitCommand(['clone', '--quiet', '--bare', upstreamRepo, bareOrigin], tempRoot);
      const declaredRemote = 'https://github.com/yandiamantinoBr/openclaw-cadu.git';
      runGit(upstreamRepo, ['remote', 'add', 'origin', declaredRemote]);
      runGit(upstreamRepo, ['update-ref', 'refs/remotes/origin/main', commit]);
      const kinoOfflineGit = kinoFixture.runGit;
      const offlineGit = (repoDir, args, encoding = 'utf8') => {
        if (args.includes('fetch')) {
          if (String(args[args.length - 1]).includes(`refs/heads/${EXPECTED_KINO_BRANCH}:`)) {
            return kinoOfflineGit(repoDir, args, encoding);
          }
          return runGit(repoDir, [
            'fetch',
            '--quiet',
            '--no-tags',
            pathToFileURL(upstreamRepo).href,
            '+refs/remotes/origin/main:refs/remotes/origin/main',
          ], encoding);
        }
        return runGit(repoDir, args, encoding);
      };
      const imported = importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      );
      expect(imported.manifest.upstream.commit).toBe(commit);
      expect(imported.manifest.safety).toEqual(EXPECTED_MIRROR_SAFETY);
      expect(imported.registry.activation).toEqual({ state: 'shadow', runtimeConsumers: ['cadu-api'] });
      expect(imported.report.safety).toEqual(expect.objectContaining({
        lifecycle: 'shadow',
        runtimeActivated: true,
        collectionActivated: false,
        publishAttempted: false,
      }));
      for (const artifact of imported.manifest.artifacts) {
        expect(artifact.upstreamGitBlobOid)
          .toBe(runGit(upstreamRepo, ['rev-parse', `${commit}:${artifact.upstreamPath}`]));
      }

      const preFailureSnapshot = Object.fromEntries(
        fs.readdirSync(outputDir).map((file) => [file, fs.readFileSync(path.join(outputDir, file))]),
      );
      let postInstallVerifierReached = false;
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        {
          runGit: offlineGit,
          verifyInstalledMirror: ({ registryDir }) => {
            postInstallVerifierReached = true;
            verifyMirroredRegistry({ registryDir });
            throw new Error('injected post-install verifier failure');
          },
        },
      )).toThrow(/injected post-install verifier failure/);
      expect(postInstallVerifierReached).toBe(true);
      for (const [file, bytes] of Object.entries(preFailureSnapshot)) {
        expect(fs.readFileSync(path.join(outputDir, file))).toEqual(bytes);
      }
      expect(fs.readdirSync(outputDir).every((file) => !/\.(?:tmp|bak)$/i.test(file))).toBe(true);

      const outputCandidatePath = path.join(outputDir, 'ufg-source-registry.candidate.json');
      fs.writeFileSync(outputCandidatePath, '{"interrupted":true}\n', 'utf8');
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/mirror is invalid; use --repair/);
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, repair: true },
        outputDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(commit);
      expect(() => verifyMirroredRegistry({ registryDir: outputDir })).not.toThrow();

      const interruptedDir = path.join(tempRoot, 'interrupted-mirror');
      fs.cpSync(outputDir, interruptedDir, { recursive: true });
      fs.writeFileSync(path.join(interruptedDir, 'ufg-source-registry.candidate.json'), '{}\n', 'utf8');
      fs.renameSync(
        path.join(interruptedDir, 'upstream-manifest.json'),
        path.join(interruptedDir, 'upstream-manifest.json.999-1234567890-aaaaaaaaaaaaaaaa.bak'),
      );
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, repair: true },
        interruptedDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(commit);
      expect(fs.readdirSync(interruptedDir).some((file) => /\.(?:tmp|bak)$/i.test(file))).toBe(false);

      const unprovableDir = path.join(tempRoot, 'unprovable-mirror');
      fs.cpSync(outputDir, unprovableDir, { recursive: true });
      fs.writeFileSync(path.join(unprovableDir, 'upstream-manifest.json'), '{broken', 'utf8');
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, repair: true },
        unprovableDir,
        { runGit: offlineGit },
      )).toThrow(/cannot prove a monotonic repair baseline/);

      const tamperedBaselineDir = path.join(tempRoot, 'tampered-baseline-mirror');
      fs.cpSync(outputDir, tamperedBaselineDir, { recursive: true });
      const tamperedManifestPath = path.join(tamperedBaselineDir, 'upstream-manifest.json');
      const tamperedManifest = JSON.parse(fs.readFileSync(tamperedManifestPath, 'utf8'));
      tamperedManifest.artifacts[1].id = tamperedManifest.artifacts[0].id;
      fs.writeFileSync(tamperedManifestPath, `${JSON.stringify(tamperedManifest, null, 2)}\n`, 'utf8');
      fs.writeFileSync(path.join(tamperedBaselineDir, 'ufg-source-registry.candidate.json'), '{}\n', 'utf8');
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, repair: true },
        tamperedBaselineDir,
        { runGit: offlineGit },
      )).toThrow(/cannot prove a monotonic repair baseline/);

      const monotonicRepairDir = path.join(tempRoot, 'monotonic-repair-mirror');
      fs.cpSync(outputDir, monotonicRepairDir, { recursive: true });
      const futureManifestPath = path.join(monotonicRepairDir, 'upstream-manifest.json');
      const futureManifest = JSON.parse(fs.readFileSync(futureManifestPath, 'utf8'));
      const futureVersionMatch = futureManifest.registryVersion.match(/^(\d{4}-\d{2}-\d{2}\.)(\d+)$/);
      expect(futureVersionMatch).not.toBeNull();
      futureManifest.registryVersion = `${futureVersionMatch[1]}${BigInt(futureVersionMatch[2]) + 1n}`;
      fs.writeFileSync(futureManifestPath, `${JSON.stringify(futureManifest, null, 2)}\n`, 'utf8');
      fs.writeFileSync(path.join(monotonicRepairDir, 'ufg-source-registry.candidate.json'), '{}\n', 'utf8');
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, repair: true },
        monotonicRepairDir,
        { runGit: offlineGit },
      )).toThrow(/source registry downgrade/);

      fs.writeFileSync(path.join(upstreamRepo, 'safe-advance.txt'), 'new upstream provenance\n', 'utf8');
      runGit(upstreamRepo, ['add', 'safe-advance.txt']);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'safe provenance advance',
      ]);
      const safeAdvanceCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      runGit(upstreamRepo, ['update-ref', 'refs/remotes/origin/main', safeAdvanceCommit]);
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: safeAdvanceCommit },
        outputDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(safeAdvanceCommit);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/commit downgrade requires --allow-downgrade/);
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit, allowDowngrade: true },
        outputDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(commit);
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: safeAdvanceCommit },
        outputDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(safeAdvanceCommit);

      const fixtureSchemaPath = path.join(upstreamRepo, bundledManifest.artifacts
        .find((artifact) => artifact.id === 'schema').upstreamPath);
      const originalSchemaBytes = fs.readFileSync(fixtureSchemaPath);
      const originalCandidateBytes = fs.readFileSync(fixtureRegistryPath);
      const originalReportBytes = fs.readFileSync(fixtureReportPath);
      const sameVersionSchema = JSON.parse(originalSchemaBytes.toString('utf8'));
      sameVersionSchema.$comment = 'unversioned schema drift fixture';
      const sameVersionSchemaBytes = Buffer.from(`${JSON.stringify(sameVersionSchema, null, 2)}\n`, 'utf8');
      const sameVersionCandidate = JSON.parse(originalCandidateBytes.toString('utf8'));
      sameVersionCandidate.provenance.schemaContentSha256 = sha256(sameVersionSchemaBytes);
      const sameVersionReport = JSON.parse(originalReportBytes.toString('utf8'));
      sameVersionReport.generatedFrom = JSON.parse(JSON.stringify(sameVersionCandidate.provenance));
      fs.writeFileSync(fixtureSchemaPath, sameVersionSchemaBytes);
      fs.writeFileSync(fixtureRegistryPath, `${JSON.stringify(sameVersionCandidate, null, 2)}\n`, 'utf8');
      fs.writeFileSync(fixtureReportPath, `${JSON.stringify(sameVersionReport, null, 2)}\n`, 'utf8');
      runGit(upstreamRepo, ['add', fixtureSchemaPath, fixtureRegistryPath, fixtureReportPath]);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'same version schema drift',
      ]);
      const sameVersionSchemaCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      runGit(upstreamRepo, ['update-ref', 'refs/remotes/origin/main', sameVersionSchemaCommit]);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: sameVersionSchemaCommit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/artifacts changed without a version increment/);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: sameVersionSchemaCommit, allowDowngrade: true },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/artifacts changed without a version increment/);

      fs.writeFileSync(fixtureSchemaPath, originalSchemaBytes);
      fs.writeFileSync(fixtureRegistryPath, originalCandidateBytes);
      fs.writeFileSync(fixtureReportPath, originalReportBytes);
      runGit(upstreamRepo, ['add', fixtureSchemaPath, fixtureRegistryPath, fixtureReportPath]);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'restore versioned schema',
      ]);
      const schemaRestoreCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      runGit(upstreamRepo, ['update-ref', 'refs/remotes/origin/main', schemaRestoreCommit]);
      expect(importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: schemaRestoreCommit },
        outputDir,
        { runGit: offlineGit },
      ).manifest.upstream.commit).toBe(schemaRestoreCommit);

      const outputSnapshot = Object.fromEntries(
        fs.readdirSync(outputDir).map((file) => [file, fs.readFileSync(path.join(outputDir, file))]),
      );
      const unsafeRegistry = { ...shadowRegistry, activation: { state: 'candidate', runtimeConsumers: [] } };
      fs.writeFileSync(fixtureRegistryPath, `${JSON.stringify(unsafeRegistry, null, 2)}\n`, 'utf8');
      runGit(upstreamRepo, ['add', '.']);
      runGit(upstreamRepo, [
        '-c', 'user.name=KinoCampus Test',
        '-c', 'user.email=test@kino.invalid',
        'commit', '-m', 'unsafe activation fixture',
      ]);
      const unsafeCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);

      runGit(upstreamRepo, ['replace', commit, unsafeCommit]);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/replace refs are not allowed/);
      runGit(upstreamRepo, ['replace', '-d', commit]);

      const gitDir = path.resolve(upstreamRepo, runGit(upstreamRepo, ['rev-parse', '--git-common-dir']));
      const graftsPath = path.join(gitDir, 'info', 'grafts');
      fs.mkdirSync(path.dirname(graftsPath), { recursive: true });
      fs.writeFileSync(graftsPath, `${unsafeCommit} ${commit}\n`, 'utf8');
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: unsafeCommit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/repository grafts are not allowed/);
      fs.unlinkSync(graftsPath);

      runGit(upstreamRepo, ['update-ref', 'refs/remotes/origin/main', unsafeCommit]);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: unsafeCommit },
        outputDir,
        { runGit: offlineGit },
      ))
        .toThrow(/shadowed only by cadu-api|violates mirrored schema/);
      for (const [file, bytes] of Object.entries(outputSnapshot)) {
        expect(fs.readFileSync(path.join(outputDir, file))).toEqual(bytes);
      }
      expect(fs.readdirSync(outputDir).every((file) => !/\.(?:tmp|bak)$/i.test(file))).toBe(true);

      fs.writeFileSync(path.join(upstreamRepo, 'unpublished.txt'), 'not on origin/main\n', 'utf8');
      runGit(upstreamRepo, ['add', 'unpublished.txt']);
      runGit(upstreamRepo, ['-c', 'user.name=KinoCampus Test', '-c', 'user.email=test@kino.invalid', 'commit', '-m', 'unpublished']);
      const unpublishedCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: unpublishedCommit },
        outputDir,
        { runGit: offlineGit },
      ))
        .toThrow(/not reachable from fetched origin\/main/);

      runGit(upstreamRepo, [
        'config',
        `url.${pathToFileURL(bareOrigin).href}.insteadOf`,
        declaredRemote,
      ]);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      )).toThrow(/effective OpenClaw origin remote mismatch/);

      for (const sshRemote of [
        'git@github.com:yandiamantinoBr/openclaw-cadu.git',
        'ssh://git@github.com/yandiamantinoBr/openclaw-cadu.git',
      ]) {
        runGit(upstreamRepo, ['remote', 'set-url', 'origin', sshRemote]);
        expect(() => importRegistry(
          { openclawRepo: upstreamRepo, openclawCommit: commit },
          outputDir,
          { runGit: offlineGit },
        )).toThrow(/origin remote mismatch/);
      }

      runGit(upstreamRepo, ['remote', 'set-url', 'origin', 'https://github.com/example/untrusted.git']);
      expect(() => importRegistry(
        { openclawRepo: upstreamRepo, openclawCommit: commit },
        outputDir,
        { runGit: offlineGit },
      ))
        .toThrow(/origin remote mismatch/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
