'use strict';

const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const model = require('../../assets/js/controllers/admin/admin-cadu-sources.js');
const {
  __test,
  getCaduSourceRegistryMirror,
} = require('../../server/cadu-source-registry-mirror.js');

const ROOT = path.resolve(__dirname, '../..');

function strictShadowFixture() {
  const mirrorDirectory = path.join(
    ROOT,
    'services/cadu-ufg-publisher/config/cadu-source-registry',
  );
  const candidate = JSON.parse(fs.readFileSync(
    path.join(mirrorDirectory, 'ufg-source-registry.candidate.json'),
    'utf8',
  ));
  candidate.activation = { state: 'shadow', runtimeConsumers: ['cadu-api'] };
  const sourceBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  const registrySha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const upstreamGitBlobOid = createHash('sha1')
    .update(Buffer.from(`blob ${sourceBytes.length}\0`, 'utf8'))
    .update(sourceBytes)
    .digest('hex');
  const bundledManifest = JSON.parse(fs.readFileSync(
    path.join(mirrorDirectory, 'upstream-manifest.json'),
    'utf8',
  ));
  const manifest = {
    ...bundledManifest,
    registryVersion: candidate.registryVersion,
    auditCutoff: candidate.auditCutoff,
    safety: {
      lifecycle: 'shadow',
      readOnlyMirror: true,
      runtimeActivated: false,
      publisherUsesLegacySources: true,
      activePublisherRegistry: 'services/cadu-ufg-publisher/config/sources.json',
    },
    artifacts: bundledManifest.artifacts.map((artifact) => artifact.id === 'candidate'
      ? {
        ...artifact,
        upstreamGitBlobOid,
        contentSha256: registrySha256,
        byteLength: sourceBytes.length,
      }
      : artifact),
  };
  const artifactBytes = new Map([
    ['candidate', sourceBytes],
    ['schema', fs.readFileSync(path.join(mirrorDirectory, 'ufg-source-registry.schema.json'))],
    ['reconciliation-report', fs.readFileSync(path.join(mirrorDirectory, 'source-reconciliation-report.json'))],
  ]);
  return { artifactBytes, candidate, manifest, registrySha256 };
}

describe('bundled Cadu source-registry mirror', () => {
  test('ships every integrity artifact with the Vercel fallback function', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(config.functions['api/cadu/sites.js'].includeFiles)
      .toBe('services/cadu-ufg-publisher/config/cadu-source-registry/*.json');

    const requiredFiles = [
      'source-reconciliation-report.json',
      'ufg-source-registry.candidate.json',
      'ufg-source-registry.schema.json',
      'upstream-manifest.json',
    ];
    const mirrorDirectory = path.join(
      ROOT,
      'services/cadu-ufg-publisher/config/cadu-source-registry',
    );
    expect(fs.readdirSync(mirrorDirectory).filter((file) => file.endsWith('.json')).sort())
      .toEqual(requiredFiles);

    const vercelIgnore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim());
    const publisherExclusion = vercelIgnore.indexOf('services/cadu-ufg-publisher/**');
    expect(publisherExclusion).toBeGreaterThanOrEqual(0);
    for (const exception of [
      '!services/cadu-ufg-publisher/config/',
      '!services/cadu-ufg-publisher/config/cadu-source-registry/',
      ...requiredFiles.map((file) => `!services/cadu-ufg-publisher/config/cadu-source-registry/${file}`),
    ]) {
      expect(vercelIgnore.indexOf(exception)).toBeGreaterThan(publisherExclusion);
    }
  });

  test('fails closed unless upstream is exactly shadow+cadu-api and fully disabled', () => {
    const fixture = strictShadowFixture();
    expect(__test.validateUpstreamShadowRegistry(fixture.candidate)).toBe(fixture.candidate);
    expect(__test.validateMirrorManifest(
      fixture.manifest,
      fixture.candidate,
      fixture.artifactBytes,
      fixture.registrySha256,
    )).toBe(fixture.manifest);
    const mirror = __test.buildMirror(fixture.candidate, fixture.registrySha256);
    expect(mirror.activation).toEqual({ state: 'candidate', runtimeConsumers: [] });
    expect(mirror.administrativeMetadata).toEqual({
      available: false,
      state: 'unavailable',
      reason: 'mirror_excludes_runtime_overrides',
    });

    for (const activation of [
      { state: 'candidate', runtimeConsumers: [] },
      { state: 'shadow', runtimeConsumers: [] },
      { state: 'shadow', runtimeConsumers: ['cadu-api', 'publisher'] },
      { state: 'active', runtimeConsumers: ['cadu-api'] },
    ]) {
      expect(() => __test.validateUpstreamShadowRegistry({
        ...fixture.candidate,
        activation,
      })).toThrow(/shadowed only by cadu-api/);
    }
    const enabledSource = JSON.parse(JSON.stringify(fixture.candidate));
    enabledSource.webSources[0].enabled = true;
    expect(() => __test.buildMirror(enabledSource, fixture.registrySha256)).toThrow(/enabled web source/);
    const enabledProfile = JSON.parse(JSON.stringify(fixture.candidate));
    enabledProfile.instagramProfiles[0].enabled = true;
    expect(() => __test.buildMirror(enabledProfile, fixture.registrySha256)).toThrow(/enabled Instagram profile/);
  });

  test('rejects mirror manifest downgrade, activation, path and hash drift', () => {
    const fixture = strictShadowFixture();
    const validate = (manifest) => __test.validateMirrorManifest(
      manifest,
      fixture.candidate,
      fixture.artifactBytes,
      fixture.registrySha256,
    );
    const mutations = [
      { ...fixture.manifest, safety: { ...fixture.manifest.safety, lifecycle: 'candidate' } },
      { ...fixture.manifest, safety: { ...fixture.manifest.safety, readOnlyMirror: false } },
      { ...fixture.manifest, safety: { ...fixture.manifest.safety, runtimeActivated: true } },
      { ...fixture.manifest, safety: { ...fixture.manifest.safety, publisherUsesLegacySources: false } },
      { ...fixture.manifest, safety: { ...fixture.manifest.safety, unexpected: true } },
      {
        ...fixture.manifest,
        artifacts: fixture.manifest.artifacts.map((artifact) => artifact.id === 'candidate'
          ? { ...artifact, contentSha256: '0'.repeat(64) }
          : artifact),
      },
      {
        ...fixture.manifest,
        artifacts: fixture.manifest.artifacts.map((artifact) => artifact.id === 'candidate'
          ? { ...artifact, upstreamGitBlobOid: '0'.repeat(40) }
          : artifact),
      },
      {
        ...fixture.manifest,
        artifacts: fixture.manifest.artifacts.map((artifact) => artifact.id === 'candidate'
          ? { ...artifact, file: '../ufg-source-registry.candidate.json' }
          : artifact),
      },
    ];
    for (const manifest of mutations) expect(() => validate(manifest)).toThrow();

    const corruptedArtifacts = new Map(fixture.artifactBytes);
    corruptedArtifacts.set('schema', Buffer.concat([
      corruptedArtifacts.get('schema'),
      Buffer.from('\n'),
    ]));
    expect(() => __test.validateMirrorManifest(
      fixture.manifest,
      fixture.candidate,
      corruptedArtifacts,
      fixture.registrySha256,
    )).toThrow(/artifact content drift: schema/);
  });

  test('projects the content-addressed candidate into the exact read-only UI contract', () => {
    const mirror = getCaduSourceRegistryMirror();
    const catalog = model.buildCatalog(mirror.payload, {
      headers: {
        ETag: mirror.etag,
        'X-Cadu-Registry-Sha256': mirror.registrySha256,
        'X-Cadu-Registry-Origin': 'kino-campus-mirror',
      },
    });

    expect(catalog.registryOrigin).toBe('kino-campus-mirror');
    expect(catalog.activation).toEqual({ state: 'candidate', runtimeConsumers: [] });
    expect(catalog.administrativeMetadataAvailable).toBe(false);
    expect(catalog.administrativeMetadata).toEqual({
      available: false,
      state: 'unavailable',
      reason: 'mirror_excludes_runtime_overrides',
    });
    expect(catalog.summary).toMatchObject({
      sources: 197,
      entities: 170,
      instagramProfiles: 86,
      deferred: 0,
    });
    expect(catalog.sources.every((source) => source.enabled === false)).toBe(true);
    expect(catalog.sources.every((source) => source.administrativeMetadataAvailable === false)).toBe(true);
    expect(catalog.sources.every((source) => (
      source.effectiveTier === null && source.overrideTier === null &&
      source.overrideOrigin === 'metadata_unavailable' && source.overrideUnitId === null &&
      source.note === null
    ))).toBe(true);
    expect(catalog.entities.flatMap((entity) => entity.sources)
      .every((source) => source.effectiveTier === null)).toBe(true);
    expect(catalog.instagram.every((profile) => profile.enabled === false)).toBe(true);
    expect(new Set(catalog.sources.map((source) => source.revision)).size).toBe(catalog.sources.length);
  });

  test('matches the audited candidate hash recorded in the upstream manifest', () => {
    const mirror = getCaduSourceRegistryMirror();
    const manifest = JSON.parse(fs.readFileSync(path.join(
      ROOT,
      'services/cadu-ufg-publisher/config/cadu-source-registry/upstream-manifest.json',
    ), 'utf8'));
    const candidate = manifest.artifacts.find((artifact) => artifact.id === 'candidate');

    expect(candidate).toBeDefined();
    expect(mirror.registrySha256).toBe(candidate.contentSha256);
    expect(mirror.payload.auditCutoff).toBe(manifest.auditCutoff);
  });

  test('cannot make a candidate catalog trusted without the server-owned mirror header', () => {
    const mirror = getCaduSourceRegistryMirror();

    expect(() => model.buildCatalog(mirror.payload, {
      headers: {
        ETag: mirror.etag,
        'X-Cadu-Registry-Sha256': mirror.registrySha256,
      },
    })).toThrow(expect.objectContaining({ code: 'registry_not_shadow' }));

    expect(() => model.buildCatalog(mirror.payload, {
      headers: {
        ETag: mirror.etag,
        'X-Cadu-Registry-Sha256': mirror.registrySha256,
        'X-Cadu-Registry-Origin': 'untrusted-mirror',
      },
    })).toThrow(expect.objectContaining({ code: 'invalid_registry_origin' }));
  });

  test('rejects a mirror that omits or weakens the administrative metadata warning', () => {
    const mirror = getCaduSourceRegistryMirror();
    const responseMeta = {
      headers: {
        ETag: mirror.etag,
        'X-Cadu-Registry-Sha256': mirror.registrySha256,
        'X-Cadu-Registry-Origin': 'kino-campus-mirror',
      },
    };
    const missing = JSON.parse(JSON.stringify(mirror.payload));
    delete missing.administrativeMetadata;
    expect(() => model.buildCatalog(missing, responseMeta)).toThrow();

    const weakened = JSON.parse(JSON.stringify(mirror.payload));
    weakened.administrativeMetadata.available = true;
    expect(() => model.buildCatalog(weakened, responseMeta)).toThrow(expect.objectContaining({
      code: 'invalid_mirror_administrative_metadata',
    }));
  });
});
