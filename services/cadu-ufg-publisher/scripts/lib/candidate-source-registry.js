'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REGISTRY_DIR = path.resolve(__dirname, '../../config/cadu-source-registry');
const MANIFEST_PATH = path.join(REGISTRY_DIR, 'upstream-manifest.json');
const EXPECTED_ARTIFACTS = Object.freeze({
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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gitBlobOid(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function readJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    bytes,
    value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')),
  };
}

function assertObject(value, context) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${context} must be an object`);
}

function validateRegistrySchema(registry, schema) {
  assertObject(schema, 'mirrored schema');
  assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', 'unexpected schema dialect');
  assert.strictEqual(schema.$id, 'https://kino-campus.local/schemas/ufg-source-registry.schema.json', 'unexpected schema ID');
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateSchema: true });
  addFormats(ajv);
  assert.strictEqual(ajv.validateSchema(schema), true, `invalid registry schema: ${ajv.errorsText(ajv.errors)}`);
  const validate = ajv.compile(schema);
  if (!validate(registry)) {
    const details = validate.errors
      .slice(0, 8)
      .map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    assert.fail(`candidate registry violates mirrored schema: ${details}`);
  }
  return registry;
}

function validateCandidateRegistry(registry) {
  assertObject(registry, 'candidate registry');
  assert.strictEqual(registry.schemaVersion, 1, 'candidate schemaVersion');
  assert(/^20\d{2}-\d{2}-\d{2}\.[1-9]\d*$/.test(registry.registryVersion), 'invalid registryVersion');
  assert(/^20\d{2}-\d{2}-\d{2}$/.test(registry.auditCutoff), 'invalid auditCutoff');
  assertObject(registry.activation, 'candidate activation');
  assert.strictEqual(registry.activation.state, 'candidate', 'mirrored registry must remain candidate');
  assert.deepStrictEqual(registry.activation.runtimeConsumers, [], 'candidate must have no runtime consumers');
  assert(Array.isArray(registry.entities), 'candidate entities[]');
  assert(Array.isArray(registry.webSources), 'candidate webSources[]');
  assert(Array.isArray(registry.instagramProfiles), 'candidate instagramProfiles[]');

  const ids = [];
  const entityIds = new Set();
  for (const entity of registry.entities) {
    assertObject(entity, 'entity');
    assert(/^ufg\.[a-z0-9][a-z0-9.-]*$/.test(entity.id), `invalid entity id ${entity.id}`);
    assert(!entityIds.has(entity.id), `duplicate entity id ${entity.id}`);
    entityIds.add(entity.id);
    ids.push(entity.id);
  }
  for (const entity of registry.entities) {
    assert(entity.parentId === null || entityIds.has(entity.parentId), `${entity.id} unknown parent ${entity.parentId}`);
  }
  const entitiesById = new Map(registry.entities.map((entity) => [entity.id, entity]));
  for (const entity of registry.entities) {
    const ancestry = new Set([entity.id]);
    let cursor = entity;
    while (cursor.parentId !== null) {
      assert(!ancestry.has(cursor.parentId), `entity hierarchy cycle involving ${cursor.parentId}`);
      ancestry.add(cursor.parentId);
      cursor = entitiesById.get(cursor.parentId);
    }
  }
  for (const source of registry.webSources) {
    assertObject(source, 'web source');
    assert(/^web\.[a-z0-9][a-z0-9.-]*$/.test(source.id), `invalid web source id ${source.id}`);
    assert.strictEqual(source.enabled, false, `${source.id} must remain disabled`);
    assert(Array.isArray(source.entityIds) && source.entityIds.length > 0, `${source.id} entityIds[]`);
    for (const entityId of source.entityIds) assert(entityIds.has(entityId), `${source.id} unknown entity ${entityId}`);
    assert(/^https:\/\//.test(source.canonicalUrl), `${source.id} canonical URL must use HTTPS`);
    assert(source.declaredUrl === null || /^https:\/\//.test(source.declaredUrl), `${source.id} declared URL must use HTTPS`);
    assertObject(source.transport, `${source.id} transport`);
    assertObject(source.audit, `${source.id} audit`);
    assert(Array.isArray(source.observations), `${source.id} observations[]`);
    ids.push(source.id);
  }
  for (const profile of registry.instagramProfiles) {
    assertObject(profile, 'Instagram profile');
    assert(/^ig\.[a-z0-9][a-z0-9.-]*$/.test(profile.id), `invalid Instagram id ${profile.id}`);
    assert.strictEqual(profile.enabled, false, `${profile.id} must remain disabled`);
    assert(/^[a-z0-9._]+$/.test(profile.handle) && profile.handle !== 'null', `${profile.id} invalid handle`);
    assert(Array.isArray(profile.entityIds), `${profile.id} entityIds[]`);
    for (const entityId of profile.entityIds) assert(entityIds.has(entityId), `${profile.id} unknown entity ${entityId}`);
    assertObject(profile.audit, `${profile.id} audit`);
    ids.push(profile.id);
  }
  assert.strictEqual(new Set(ids).size, ids.length, 'registry IDs must be globally unique');
  return registry;
}

function validateManifest(manifest) {
  assertObject(manifest, 'registry manifest');
  assert.strictEqual(manifest.schemaVersion, 1, 'manifest schemaVersion');
  assertObject(manifest.upstream, 'manifest upstream');
  assert.strictEqual(manifest.upstream.repository, 'https://github.com/yandiamantinoBr/openclaw-cadu');
  assert(/^[0-9a-f]{40}$/.test(manifest.upstream.commit), 'manifest requires full upstream commit');
  assert(/^20\d{2}-\d{2}-\d{2}\.[1-9]\d*$/.test(manifest.registryVersion), 'manifest registryVersion');
  assert(/^20\d{2}-\d{2}-\d{2}$/.test(manifest.auditCutoff), 'manifest auditCutoff');
  assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 3, 'manifest requires three artifacts');
  assertObject(manifest.safety, 'manifest safety');
  assert.strictEqual(manifest.safety.lifecycle, 'candidate');
  assert.strictEqual(manifest.safety.runtimeActivated, false);
  assert.strictEqual(manifest.safety.publisherUsesLegacySources, true);
  return manifest;
}

function verifyMirroredRegistry(options = {}) {
  const registryDir = path.resolve(options.registryDir || REGISTRY_DIR);
  const manifestPath = path.resolve(options.manifestPath || path.join(registryDir, 'upstream-manifest.json'));
  const manifest = validateManifest(readJson(manifestPath).value);
  const expectedIds = new Set(['candidate', 'schema', 'reconciliation-report']);
  const loaded = {};

  for (const artifact of manifest.artifacts) {
    assertObject(artifact, 'manifest artifact');
    assert(expectedIds.delete(artifact.id), `unexpected or duplicate artifact ${artifact.id}`);
    const expected = EXPECTED_ARTIFACTS[artifact.id];
    assert.strictEqual(artifact.file, expected.file, `${artifact.id} local file path drift`);
    assert.strictEqual(artifact.upstreamPath, expected.upstreamPath, `${artifact.id} upstream path drift`);
    assert(/^[0-9a-f]{40}$/.test(artifact.upstreamGitBlobOid), `${artifact.id} upstream Git blob`);
    assert(/^[0-9a-f]{64}$/.test(artifact.contentSha256), `${artifact.id} content SHA-256`);
    assert(Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0, `${artifact.id} byte length`);
    const filePath = path.resolve(registryDir, artifact.file);
    assert.strictEqual(path.dirname(filePath), registryDir, `${artifact.id} must stay inside registry directory`);
    const current = readJson(filePath);
    assert.strictEqual(current.bytes.length, artifact.byteLength, `${artifact.id} byte length drift`);
    assert.strictEqual(sha256(current.bytes), artifact.contentSha256, `${artifact.id} content hash drift`);
    assert.strictEqual(gitBlobOid(current.bytes), artifact.upstreamGitBlobOid, `${artifact.id} Git blob drift`);
    loaded[artifact.id] = current.value;
  }
  assert.strictEqual(expectedIds.size, 0, `manifest missing artifact(s): ${[...expectedIds].join(', ')}`);
  validateRegistrySchema(loaded.candidate, loaded.schema);
  const registry = validateCandidateRegistry(loaded.candidate);
  assert.strictEqual(registry.registryVersion, manifest.registryVersion, 'manifest/candidate version drift');
  assert.strictEqual(registry.auditCutoff, manifest.auditCutoff, 'manifest/candidate audit cutoff drift');
  assertObject(loaded['reconciliation-report'], 'reconciliation report');
  assert.strictEqual(loaded['reconciliation-report'].schemaVersion, 1, 'report schemaVersion');
  assert.strictEqual(loaded['reconciliation-report'].registryVersion, registry.registryVersion, 'report/candidate version drift');
  assert.strictEqual(loaded['reconciliation-report'].auditCutoff, registry.auditCutoff, 'report/candidate audit cutoff drift');
  return { manifest, registry, schema: loaded.schema, report: loaded['reconciliation-report'] };
}

function loadCandidateSourceRegistry(options = {}) {
  return verifyMirroredRegistry(options).registry;
}

module.exports = {
  MANIFEST_PATH,
  REGISTRY_DIR,
  EXPECTED_ARTIFACTS,
  gitBlobOid,
  loadCandidateSourceRegistry,
  sha256,
  validateCandidateRegistry,
  validateRegistrySchema,
  verifyMirroredRegistry,
};
