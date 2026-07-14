import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATE_REGISTRY_PATH = resolve(
  process.cwd(),
  'services/cadu-ufg-publisher/config/cadu-source-registry/ufg-source-registry.candidate.json',
);

let cachedMirror = null;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
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
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('invalid candidate source registry');
  }
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.webSources)
      || !Array.isArray(candidate.instagramProfiles)) {
    throw new TypeError('incomplete candidate source registry');
  }

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
  const sourceBytes = readFileSync(CANDIDATE_REGISTRY_PATH);
  const candidate = JSON.parse(sourceBytes.toString('utf8'));
  const registrySha256 = sha256(sourceBytes);
  const payload = buildMirror(candidate, registrySha256);
  cachedMirror = Object.freeze({
    payload,
    registrySha256,
    etag: `"${registrySha256}"`,
    auditCutoff: candidate.auditCutoff,
  });
  return cachedMirror;
}

export const __test = Object.freeze({ buildMirror, sourceRevision });
