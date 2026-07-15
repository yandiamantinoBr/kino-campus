import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIRROR_DIRECTORY = resolve(
  process.cwd(),
  'services/cadu-ufg-publisher/config/cadu-source-registry',
);
const MIRROR_MANIFEST_PATH = resolve(MIRROR_DIRECTORY, 'upstream-manifest.json');
const EXPECTED_ARTIFACT_LOCATIONS = Object.freeze({
  candidate: Object.freeze({
    file: 'ufg-source-registry.candidate.json',
    upstreamPath: 'data/.openclaw/workspace/config/cadu-source-registry/ufg-source-registry.candidate.json',
  }),
  schema: Object.freeze({
    file: 'ufg-source-registry.schema.json',
    upstreamPath: 'data/.openclaw/workspace/config/cadu-source-registry/ufg-source-registry.schema.json',
  }),
  'reconciliation-report': Object.freeze({
    file: 'source-reconciliation-report.json',
    upstreamPath: 'data/.openclaw/workspace/config/cadu-source-registry/source-reconciliation-report.json',
  }),
});
const EXPECTED_ACTIVE_PUBLISHER_REGISTRY = 'services/cadu-ufg-publisher/config/sources.json';
const MIRRORED_ARTIFACT_PATHS = new Map(Object.entries(EXPECTED_ARTIFACT_LOCATIONS)
  .map(([id, artifact]) => [id, resolve(MIRROR_DIRECTORY, artifact.file)]));

let cachedMirror = null;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitBlobOid(value) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`, 'utf8'))
    .update(value)
    .digest('hex');
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, context) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${context} has unexpected fields`);
  }
}

function validateUpstreamShadowRegistry(candidate) {
  assertObject(candidate, 'upstream source registry');
  assertObject(candidate.activation, 'upstream activation');
  assertExactKeys(candidate.activation, ['state', 'runtimeConsumers'], 'upstream activation');
  if (candidate.activation.state !== 'shadow'
      || !Array.isArray(candidate.activation.runtimeConsumers)
      || candidate.activation.runtimeConsumers.length !== 1
      || candidate.activation.runtimeConsumers[0] !== 'cadu-api') {
    throw new TypeError('upstream registry must be shadowed only by cadu-api');
  }
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.webSources)
      || !Array.isArray(candidate.instagramProfiles)) {
    throw new TypeError('incomplete upstream source registry');
  }
  if (candidate.webSources.some((source) => !source || source.enabled !== false)) {
    throw new TypeError('upstream shadow registry contains an enabled web source');
  }
  if (candidate.instagramProfiles.some((profile) => !profile || profile.enabled !== false)) {
    throw new TypeError('upstream shadow registry contains an enabled Instagram profile');
  }
  return candidate;
}

function validateMirrorManifest(manifest, candidate, artifactBytes, registrySha256) {
  assertObject(manifest, 'source registry mirror manifest');
  if (!(artifactBytes instanceof Map)) throw new TypeError('mirror artifact bytes must be a Map');
  if (manifest.schemaVersion !== 1) throw new TypeError('unexpected mirror manifest schemaVersion');
  if (!manifest.upstream || !/^[0-9a-f]{40}$/.test(manifest.upstream.commit || '')) {
    throw new TypeError('mirror manifest requires a full upstream commit');
  }
  if (manifest.upstream.repository !== 'https://github.com/yandiamantinoBr/openclaw-cadu') {
    throw new TypeError('unexpected mirror upstream repository');
  }
  assertObject(manifest.safety, 'mirror safety policy');
  assertExactKeys(manifest.safety, [
    'lifecycle',
    'readOnlyMirror',
    'runtimeActivated',
    'publisherUsesLegacySources',
    'activePublisherRegistry',
  ], 'mirror safety policy');
  if (manifest.safety.lifecycle !== 'shadow'
      || manifest.safety.readOnlyMirror !== true
      || manifest.safety.runtimeActivated !== false
      || manifest.safety.publisherUsesLegacySources !== true
      || manifest.safety.activePublisherRegistry !== EXPECTED_ACTIVE_PUBLISHER_REGISTRY) {
    throw new TypeError('unsafe source registry mirror policy');
  }
  if (manifest.registryVersion !== candidate.registryVersion
      || manifest.auditCutoff !== candidate.auditCutoff) {
    throw new TypeError('mirror manifest metadata drift');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) {
    throw new TypeError('mirror manifest must contain exactly three artifacts');
  }
  const artifacts = new Map();
  for (const artifact of manifest.artifacts) {
    assertObject(artifact, 'mirror artifact');
    if (artifacts.has(artifact.id)) throw new TypeError(`duplicate mirror artifact ${artifact.id}`);
    const expected = EXPECTED_ARTIFACT_LOCATIONS[artifact.id];
    if (!expected || artifact.file !== expected.file || artifact.upstreamPath !== expected.upstreamPath) {
      throw new TypeError(`mirror artifact location drift: ${artifact.id}`);
    }
    const bytes = artifactBytes.get(artifact.id);
    if (!Buffer.isBuffer(bytes)
        || artifact.contentSha256 !== sha256(bytes)
        || artifact.upstreamGitBlobOid !== gitBlobOid(bytes)
        || artifact.byteLength !== bytes.length) {
      throw new TypeError(`mirror artifact content drift: ${artifact.id}`);
    }
    artifacts.set(artifact.id, artifact);
  }
  if (artifacts.size !== 3
      || !artifacts.has('candidate')
      || !artifacts.has('schema')
      || !artifacts.has('reconciliation-report')) {
    throw new TypeError('mirror manifest artifact set drift');
  }
  if (artifacts.get('candidate').contentSha256 !== registrySha256) {
    throw new TypeError('candidate artifact does not match mirror manifest');
  }
  return manifest;
}

function entityReference(entity) {
  return {
    id: entity.id,
    name: entity.name,
    acronym: entity.acronym,
    kind: entity.kind,
    status: entity.status,
  };
}

function profileBelongsToSource(profile, source) {
  const directlyObserved = profile.observations.some((observation) => (
    observation && observation.sourceId === source.id
  ));
  const sharedEntity = source.entityIds.some((entityId) => profile.entityIds.includes(entityId));
  return directlyObserved || sharedEntity;
}

function nestedProfile(profile, source) {
  return {
    id: profile.id,
    handle: profile.handle,
    profileUrl: profile.profileUrl,
    aliases: jsonClone(profile.aliases),
    entityIds: jsonClone(profile.entityIds),
    shared: profile.shared,
    enabled: false,
    status: profile.status,
    viaSourceObservation: profile.observations.some((observation) => (
      observation && observation.sourceId === source.id
    )),
    viaEntityIds: source.entityIds.filter((entityId) => profile.entityIds.includes(entityId)),
  };
}

function sourceRevision(registrySha256, source) {
  return sha256(JSON.stringify({
    registrySha256,
    id: source.id,
    entityIds: source.entityIds,
    canonicalUrl: source.canonicalUrl,
    baseTier: source.baseTier,
    reviewState: source.reviewState,
    reviewIssues: source.reviewIssues,
  }));
}

function buildMirror(candidate, registrySha256) {
  validateUpstreamShadowRegistry(candidate);
  if (!/^[0-9a-f]{64}$/.test(registrySha256 || '')) throw new TypeError('invalid registry SHA-256');

  const entityIndex = new Map(candidate.entities.map((entity) => [entity.id, entity]));
  const profiles = candidate.instagramProfiles.map((profile) => ({
    ...jsonClone(profile),
    enabled: false,
  }));
  const sources = candidate.webSources.map((source) => {
    const revision = sourceRevision(registrySha256, source);
    return {
      ...jsonClone(source),
      enabled: false,
      registrySha256,
      overrideUnitId: null,
      overrideTier: null,
      effectiveTier: source.baseTier,
      note: null,
      updatedAt: null,
      overrideRevision: null,
      overrideOrigin: 'base',
      isInheritedLegacy: false,
      collision: false,
      revision,
      etag: `"${revision}"`,
      entities: source.entityIds.map((entityId) => {
        const entity = entityIndex.get(entityId);
        if (!entity) throw new TypeError(`unknown entity reference: ${entityId}`);
        return entityReference(entity);
      }),
      instagramProfiles: profiles
        .filter((profile) => profileBelongsToSource(profile, source))
        .map((profile) => nestedProfile(profile, source)),
    };
  });

  return Object.freeze({
    registryVersion: candidate.registryVersion,
    registrySha256,
    auditCutoff: candidate.auditCutoff,
    administrativeMetadata: {
      available: false,
      state: 'unavailable',
      reason: 'mirror_excludes_runtime_overrides',
    },
    activation: {
      state: 'candidate',
      runtimeConsumers: [],
    },
    entities: jsonClone(candidate.entities),
    sources,
    instagramProfiles: profiles,
    metaClassification: {
      unambiguous: [],
      ambiguous: [],
      orphan: [],
      collisions: [],
      counts: {
        rows: 0,
        unambiguous: 0,
        ambiguous: 0,
        orphan: 0,
        collisions: 0,
      },
    },
  });
}

export function getCaduSourceRegistryMirror() {
  if (cachedMirror) return cachedMirror;
  const artifactBytes = new Map([...MIRRORED_ARTIFACT_PATHS]
    .map(([id, filePath]) => [id, readFileSync(filePath)]));
  const sourceBytes = artifactBytes.get('candidate');
  const manifest = JSON.parse(readFileSync(MIRROR_MANIFEST_PATH, 'utf8'));
  const candidate = JSON.parse(sourceBytes.toString('utf8'));
  const registrySha256 = sha256(sourceBytes);
  validateUpstreamShadowRegistry(candidate);
  validateMirrorManifest(manifest, candidate, artifactBytes, registrySha256);
  const payload = buildMirror(candidate, registrySha256);
  cachedMirror = Object.freeze({
    payload,
    registrySha256,
    etag: `"${registrySha256}"`,
    auditCutoff: candidate.auditCutoff,
  });
  return cachedMirror;
}

export const __test = Object.freeze({
  buildMirror,
  sourceRevision,
  validateMirrorManifest,
  validateUpstreamShadowRegistry,
});
