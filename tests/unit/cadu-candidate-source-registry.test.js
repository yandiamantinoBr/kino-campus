const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const {
  MANIFEST_PATH,
  REGISTRY_DIR,
  loadCandidateSourceRegistry,
  validateCandidateRegistry,
  validateRegistrySchema,
  verifyMirroredRegistry,
} = require('../../services/cadu-ufg-publisher/scripts/lib/candidate-source-registry');
const { importRegistry } = require('../../services/cadu-ufg-publisher/scripts/sync-candidate-source-registry');
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

function runGit(repoDir, args) {
  return runGitCommand(['-C', repoDir, ...args]);
}

function runGitCommand(args, cwd = ROOT) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git exited ${result.status}`);
  return result.stdout.trim();
}

function listFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

describe('Cadu candidate source registry mirror', () => {
  test('pins all upstream artifacts to the merged OpenClaw commit', () => {
    const { manifest } = verifyMirroredRegistry();
    expect(manifest.upstream).toEqual({
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      commit: '2d579048a5e013572a1270742db48ba8aa465ca9',
    });
    expect(Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.id, artifact.upstreamGitBlobOid]))).toEqual({
      candidate: '220b0cafeb0df3d60b5f826432e48d4c9a99a74f',
      schema: 'e7a041d450338a4c58a00f915c19612344451e30',
      'reconciliation-report': 'e0604368f4f74cb79d12213d2471a4b388ac49f4',
    });
  });

  test('loads the full structured candidate without enabling it', () => {
    const { registry, schema } = verifyMirroredRegistry();
    expect(loadCandidateSourceRegistry()).toEqual(registry);
    expect(registry.activation).toEqual({ state: 'candidate', runtimeConsumers: [] });
    expect(registry.entities).toHaveLength(166);
    expect(registry.webSources).toHaveLength(194);
    expect(registry.instagramProfiles).toHaveLength(83);
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

  test('preserves declared, canonical, transport, endpoint and Instagram evidence fields', () => {
    const { registry, report } = verifyMirroredRegistry();
    const sources = new Map(registry.webSources.map((source) => [source.id, source]));
    const proec = sources.get('web.ufg.proec');
    expect(proec).toEqual(expect.objectContaining({
      declaredUrl: 'https://proec.ufg.br/',
      canonicalUrl: 'https://proex.ufg.br/',
      enabled: false,
    }));
    expect(proec.transport.status).toBe('verified_redirect');
    expect(proec.audit.evidence[0].field).toBe('entity_and_declared_url');

    const nanofarma = sources.get('web.ufg.ppg.ppgnanofarma.profile');
    expect(nanofarma.declaredUrl).toBe('https://www.ufrgs.br/farmacia/?page_id=1589');
    expect(nanofarma.aliases).not.toContain(nanofarma.declaredUrl);
    expect(sources.get('web.ufg.ppg.ppgac.profile').canonicalUrl)
      .toBe('https://pos.ufg.br/p/programa-pos-graduacao-artes-cena-ppgac');

    const publisherObservations = registry.webSources
      .flatMap((source) => source.observations)
      .filter((observation) => observation.inventory === 'kino_publisher');
    expect(publisherObservations).toHaveLength(106);
    expect(publisherObservations.every((observation) => observation.publisherDeclared)).toBe(true);
    expect(publisherObservations.filter((observation) => observation.publisherDeclared.hasFeedRss)).toHaveLength(102);

    expect(registry.instagramProfiles.filter((profile) => profile.audit.evidence.length > 0)).toHaveLength(13);
    expect(report.instagramOverlap.legacyNotScanned).toHaveLength(20);
    expect(report.instagramOverlap.scannerWithoutEntity).toHaveLength(5);
  });

  test('keeps the legacy registry as the only active publisher input', () => {
    const legacy = loadSources(DEFAULT_SOURCE_PATH);
    expect(legacy).toHaveLength(106);
    expect(selectSources(legacy, 'quick')).toHaveLength(102);
    expect(selectSources(legacy, 'full')).toHaveLength(106);

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
      lifecycle: 'candidate',
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

  test('derives artifact bytes and blob OIDs from the declared OpenClaw commit', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-upstream-git-'));
    const upstreamRepo = path.join(tempRoot, 'openclaw-cadu');
    const bareOrigin = path.join(tempRoot, 'openclaw-cadu-origin.git');
    const outputDir = path.join(tempRoot, 'mirror');
    try {
      fs.mkdirSync(upstreamRepo, { recursive: true });
      runGit(upstreamRepo, ['init', '--initial-branch=main']);
      for (const artifact of verifyMirroredRegistry().manifest.artifacts) {
        const destination = path.join(upstreamRepo, artifact.upstreamPath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(REGISTRY_DIR, artifact.file), destination);
      }
      runGit(upstreamRepo, ['add', '.']);
      runGit(upstreamRepo, ['-c', 'user.name=KinoCampus Test', '-c', 'user.email=test@kino.invalid', 'commit', '-m', 'test fixture']);
      const commit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      runGitCommand(['clone', '--quiet', '--bare', upstreamRepo, bareOrigin], tempRoot);
      const declaredRemote = 'https://github.com/yandiamantinoBr/openclaw-cadu.git';
      runGit(upstreamRepo, ['remote', 'add', 'origin', declaredRemote]);
      runGit(upstreamRepo, [
        'config',
        `url.${pathToFileURL(bareOrigin).href}.insteadOf`,
        declaredRemote,
      ]);
      const imported = importRegistry({ openclawRepo: upstreamRepo, openclawCommit: commit }, outputDir);
      expect(imported.manifest.upstream.commit).toBe(commit);
      for (const artifact of imported.manifest.artifacts) {
        expect(artifact.upstreamGitBlobOid)
          .toBe(runGit(upstreamRepo, ['rev-parse', `${commit}:${artifact.upstreamPath}`]));
      }

      fs.writeFileSync(path.join(upstreamRepo, 'unpublished.txt'), 'not on origin/main\n', 'utf8');
      runGit(upstreamRepo, ['add', 'unpublished.txt']);
      runGit(upstreamRepo, ['-c', 'user.name=KinoCampus Test', '-c', 'user.email=test@kino.invalid', 'commit', '-m', 'unpublished']);
      const unpublishedCommit = runGit(upstreamRepo, ['rev-parse', 'HEAD']);
      expect(() => importRegistry({ openclawRepo: upstreamRepo, openclawCommit: unpublishedCommit }, outputDir))
        .toThrow(/not reachable from fetched origin\/main/);

      runGit(upstreamRepo, ['remote', 'set-url', 'origin', 'https://github.com/example/untrusted.git']);
      expect(() => importRegistry({ openclawRepo: upstreamRepo, openclawCommit: commit }, outputDir))
        .toThrow(/origin remote mismatch/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
