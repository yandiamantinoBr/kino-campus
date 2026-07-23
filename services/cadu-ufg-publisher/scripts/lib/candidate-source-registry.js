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
const EXPECTED_UPSTREAM_ACTIVATION = Object.freeze({
  state: 'shadow',
  runtimeConsumers: Object.freeze(['cadu-api']),
});
const EXPECTED_MIRROR_SAFETY = Object.freeze({
  lifecycle: 'shadow',
  readOnlyMirror: true,
  runtimeActivated: false,
  publisherUsesLegacySources: true,
  activePublisherRegistry: 'services/cadu-ufg-publisher/config/sources.json',
});
const EXPECTED_PROVENANCE = Object.freeze({
  generator: 'scripts/reconcile-cadu-source-registry.js',
  inputs: Object.freeze([
    Object.freeze({
      id: 'kino_publisher',
      repository: 'https://github.com/yandiamantinoBr/kino-campus',
      path: 'services/cadu-ufg-publisher/config/sources.json',
    }),
    Object.freeze({
      id: 'openclaw_curator',
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      path: 'data/.openclaw/workspace/scripts/cadu-curador-v4.4.js',
    }),
    Object.freeze({
      id: 'instagram_scanner',
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      path: 'data/.openclaw/workspace/scripts/scan-ig-browser.js',
    }),
    Object.freeze({
      id: 'admin_markdown',
      repository: 'https://github.com/yandiamantinoBr/openclaw-cadu',
      path: 'data/.openclaw/workspace/ufg-sites-map.md',
    }),
  ]),
});
const WEB_EXECUTION_MODE_ORDER = Object.freeze(['quick', 'daily', 'full']);
const INSTAGRAM_EXECUTION_MODE_ORDER = Object.freeze(['full', 'ig-only']);
const REGISTRY_STATUSES = Object.freeze([
  'confirmed',
  'tentative',
  'missing',
  'retired',
  'pending_verification',
]);
const ENTITY_KINDS = Object.freeze([
  'university',
  'pro_reitoria',
  'secretaria',
  'academic_unit',
  'campus',
  'administrative_body',
  'supplementary_body',
  'graduate_program',
  'research_body',
  'extension_project',
  'media',
  'affiliated_foundation',
  'other',
]);
const CAMPUS_VALUES = Object.freeze([
  null,
  'goiania',
  'aparecida_de_goiania',
  'goias',
  'cidade_ocidental',
  'caldas_novas',
  'firminopolis',
  'multi_campus',
]);
const WEB_ROLES = Object.freeze([
  'primary_site',
  'official_profile',
  'directory',
  'shared_portal',
  'legacy_observation',
]);
const WEB_SOURCE_KINDS = Object.freeze([
  'weby_site',
  'ojs_site',
  'html_page',
  'external_site',
  'mixed',
]);
const ENDPOINT_NAMES = Object.freeze(['news', 'events', 'rss', 'html']);
const COLLECTION_STRATEGIES = Object.freeze([
  'weby_json_then_html',
  'html',
  'external',
  'disabled',
]);
const REVIEW_STATES = Object.freeze([
  'confirmed_official',
  'pending_review',
  'tier_conflict',
  'url_conflict',
  'quarantined',
  'retired',
]);
const REVIEW_ISSUES = Object.freeze([
  'content_integrity_violation',
  'http_error',
  'platform_misclassified',
  'tier_conflict',
  'url_conflict',
  'transport_unverified',
  'pending_official_evidence',
  'html_profile_not_feed',
  'unreachable',
]);
const TRANSPORT_STATUSES = Object.freeze([
  'verified_200',
  'verified_redirect',
  'pending_verification',
  'unreachable',
  'tls_error',
  'http_error',
]);
const INSTAGRAM_IDENTITY_STATUSES = Object.freeze([
  'unverified',
  'officially_declared',
  'reassigned',
]);
const WEB_OBSERVATION_INVENTORIES = Object.freeze([
  'kino_publisher',
  'openclaw_curator',
  'admin_markdown',
]);
const INSTAGRAM_OBSERVATION_INVENTORIES = Object.freeze([
  ...WEB_OBSERVATION_INVENTORIES,
  'instagram_scanner',
  'instagram_scanner_retired',
  'official_ufg_page',
]);
const OFFICIAL_EVIDENCE_KINDS = Object.freeze(['institutional_directory', 'official_page']);
const INSTAGRAM_RESERVED_HANDLES = new Set([
  'about',
  'accounts',
  'api',
  'challenge',
  'developer',
  'direct',
  'explore',
  'graphql',
  'legal',
  'null',
  'p',
  'privacy',
  'reel',
  'reels',
  'stories',
  'web',
]);

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

function assertExactObjectKeys(value, expectedKeys, context) {
  assertObject(value, context);
  assert.deepStrictEqual(
    Object.keys(value).sort(),
    [...expectedKeys].sort(),
    `${context} fields drift`,
  );
}

function assertObjectKeys(value, allowedKeys, requiredKeys, context) {
  assertObject(value, context);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${context} has unknown field ${key}`);
  for (const key of requiredKeys) {
    assert(Object.prototype.hasOwnProperty.call(value, key), `${context} missing field ${key}`);
  }
}

function assertIsoDate(value, context) {
  assert(/^20\d{2}-\d{2}-\d{2}$/.test(String(value || '')), `${context} must be an ISO date`);
  const [year, month, day] = value.split('-').map(Number);
  assert(month >= 1 && month <= 12, `${context} has invalid month`);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  assert(day >= 1 && day <= daysInMonth, `${context} has invalid day`);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  assert.strictEqual(parsed.getUTCFullYear(), year, `${context} has invalid year`);
  assert.strictEqual(parsed.getUTCMonth(), month - 1, `${context} has invalid month`);
  assert.strictEqual(parsed.getUTCDate(), day, `${context} has invalid day`);
  return value;
}

function assertDateAtOrBefore(value, cutoff, context) {
  assertIsoDate(value, context);
  assert(value <= cutoff, `${context} must not be after auditCutoff ${cutoff}`);
}

function assertUniqueStrings(values, context) {
  assert(Array.isArray(values), `${context} must be an array`);
  assert(values.every((value) => typeof value === 'string'), `${context} must contain strings`);
  assert.strictEqual(new Set(values).size, values.length, `${context} must contain unique items`);
}

function assertNullableString(value, context) {
  assert(value === null || typeof value === 'string', `${context} must be a string or null`);
}

function assertEnum(value, allowed, context) {
  assert(allowed.includes(value), `${context} has invalid value ${value}`);
}

function assertIntegerRange(value, minimum, maximum, context) {
  assert(
    Number.isInteger(value) && value >= minimum && value <= maximum,
    `${context} must be an integer from ${minimum} to ${maximum}`,
  );
}

function isPlaceholder(value) {
  return /(ppgx|unidade\.ufg\.br|example\.|placeholder|<[^>]+>)/i.test(String(value || ''));
}

function normalizeRegistryUrl(input, allowQuery = false) {
  const raw = String(input || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error(`invalid URL: ${raw}`);
  }
  assert.strictEqual(parsed.protocol, 'https:', `URL must use HTTPS: ${raw}`);
  assert(!parsed.username && !parsed.password, `URL must not contain credentials: ${raw}`);
  assert(!parsed.hash, `URL must not contain a fragment: ${raw}`);
  assert(!parsed.port, `URL must not contain an explicit port: ${raw}`);
  if (!allowQuery) assert(!parsed.search, `URL must not contain a query: ${raw}`);
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  if (parsed.pathname !== '/' && (!allowQuery || !parsed.search)) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  if (allowQuery) parsed.searchParams.sort();
  return parsed.toString();
}

function validateRegistryUrl(value, context, allowQuery = false) {
  assert.strictEqual(value, normalizeRegistryUrl(value, allowQuery), `${context} URL must be normalized`);
  assert(!isPlaceholder(value), `${context} must not be a placeholder`);
}

function isValidInstagramHandle(value) {
  return typeof value === 'string'
    && /^[a-z0-9._]{1,30}$/.test(value)
    && !INSTAGRAM_RESERVED_HANDLES.has(value);
}

function validateAuditEvidence(evidence, auditCutoff, context) {
  assertExactObjectKeys(evidence, ['kind', 'url', 'field', 'observedValue', 'checkedAt'], context);
  assert(
    ['institutional_directory', 'official_page', 'legacy_snapshot', 'direct_verification']
      .includes(evidence.kind),
    `${context} kind is invalid`,
  );
  validateRegistryUrl(evidence.url, `${context} URL`);
  assert(typeof evidence.field === 'string' && evidence.field.length > 0, `${context} field is required`);
  assert(
    typeof evidence.observedValue === 'string' && evidence.observedValue.length > 0,
    `${context} observedValue is required`,
  );
  assertDateAtOrBefore(evidence.checkedAt, auditCutoff, `${context} checkedAt`);
}

function assertOrderedExecutionModes(value, order, context) {
  assertUniqueStrings(value, context);
  for (const mode of value) assert(order.includes(mode), `${context} contains invalid mode ${mode}`);
  assert.deepStrictEqual(value, order.filter((mode) => value.includes(mode)), `${context} order drift`);
}

function parseRegistryVersion(value, context = 'registryVersion') {
  const match = /^(20\d{2}-\d{2}-\d{2})\.([1-9]\d*)$/.exec(String(value || ''));
  assert(match, `invalid ${context}`);
  assertIsoDate(match[1], `${context} date`);
  return { date: match[1], revision: match[2] };
}

function validateProvenance(provenance) {
  assertExactObjectKeys(
    provenance,
    [
      'generator',
      'seedContentSha256',
      'adjudicationContentSha256',
      'transportVerificationContentSha256',
      'schemaContentSha256',
      'inputs',
    ],
    'registry provenance',
  );
  assert.strictEqual(provenance.generator, EXPECTED_PROVENANCE.generator, 'unexpected registry generator');
  for (const field of [
    'seedContentSha256',
    'adjudicationContentSha256',
    'transportVerificationContentSha256',
    'schemaContentSha256',
  ]) {
    assert(/^[0-9a-f]{64}$/.test(provenance[field]), `invalid provenance ${field}`);
  }
  assert(Array.isArray(provenance.inputs), 'registry provenance inputs[]');
  assert.deepStrictEqual(
    provenance.inputs.map((input) => input && input.id),
    EXPECTED_PROVENANCE.inputs.map((input) => input.id),
    'provenance inputs must be the exact canonical inventory set and order',
  );
  for (const [index, expected] of EXPECTED_PROVENANCE.inputs.entries()) {
    const input = provenance.inputs[index];
    assertExactObjectKeys(
      input,
      ['id', 'repository', 'commit', 'path', 'contentSha256'],
      `provenance input ${expected.id}`,
    );
    assert.strictEqual(input.repository, expected.repository, `${expected.id} repository drift`);
    assert.strictEqual(input.path, expected.path, `${expected.id} path drift`);
    assert(/^[0-9a-f]{40}$/.test(input.commit), `${expected.id} requires a full commit SHA`);
    assert(/^[0-9a-f]{64}$/.test(input.contentSha256), `${expected.id} invalid content SHA-256`);
  }
  return provenance;
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
  assertExactObjectKeys(
    registry,
    [
      '$schema',
      'schemaVersion',
      'registryVersion',
      'auditCutoff',
      'activation',
      'provenance',
      'authoritativeDirectories',
      'entities',
      'webSources',
      'instagramProfiles',
    ],
    'upstream source registry',
  );
  assert.strictEqual(registry.$schema, './ufg-source-registry.schema.json', 'registry $schema drift');
  assert.strictEqual(registry.schemaVersion, 1, 'registry schemaVersion');
  parseRegistryVersion(registry.registryVersion);
  assertIsoDate(registry.auditCutoff, 'auditCutoff');
  assertObject(registry.activation, 'upstream activation');
  assert.deepStrictEqual(
    registry.activation,
    EXPECTED_UPSTREAM_ACTIVATION,
    'upstream registry must be shadowed only by cadu-api',
  );
  assert(Array.isArray(registry.entities), 'registry entities[]');
  assert(Array.isArray(registry.webSources), 'registry webSources[]');
  assert(Array.isArray(registry.instagramProfiles), 'registry instagramProfiles[]');
  validateProvenance(registry.provenance);

  assert(Array.isArray(registry.authoritativeDirectories), 'registry authoritativeDirectories[]');
  const directoryIds = new Set();
  for (const directory of registry.authoritativeDirectories) {
    assertObject(directory, 'authoritative directory');
    const directoryKeys = Object.keys(directory);
    const allowedKeys = new Set(['id', 'title', 'url', 'publisher', 'checkedAt', 'pageUpdatedAt', 'scope']);
    for (const key of directoryKeys) {
      assert(allowedKeys.has(key), `directory ${directory.id || '<missing>'} has unknown field ${key}`);
    }
    for (const key of ['id', 'title', 'url', 'publisher', 'checkedAt']) {
      assert(Object.prototype.hasOwnProperty.call(directory, key), `directory missing field ${key}`);
    }
    assert(/^[a-z][a-z0-9.-]*$/.test(directory.id), `invalid directory id ${directory.id}`);
    assert(!directoryIds.has(directory.id), `duplicate directory id ${directory.id}`);
    directoryIds.add(directory.id);
    assert(typeof directory.title === 'string' && directory.title.length > 0, `${directory.id} title is required`);
    validateRegistryUrl(directory.url, directory.id);
    assert.strictEqual(
      directory.publisher,
      'Universidade Federal de Goiás',
      `${directory.id} publisher drift`,
    );
    assertDateAtOrBefore(directory.checkedAt, registry.auditCutoff, `${directory.id} checkedAt`);
    if (directory.pageUpdatedAt !== undefined && directory.pageUpdatedAt !== null) {
      assertDateAtOrBefore(directory.pageUpdatedAt, registry.auditCutoff, `${directory.id} pageUpdatedAt`);
    }
    if (directory.scope !== undefined) {
      assert(typeof directory.scope === 'string' && directory.scope.length > 0, `${directory.id} scope is required`);
    }
  }

  const ids = [];
  const entityIds = new Set();
  for (const entity of registry.entities) {
    assertExactObjectKeys(
      entity,
      ['id', 'name', 'acronym', 'kind', 'parentId', 'campus', 'status', 'observedIn', 'legacyIds'],
      `entity ${entity && entity.id ? entity.id : '<missing>'}`,
    );
    assert(/^ufg\.[a-z0-9][a-z0-9.-]*$/.test(entity.id), `invalid entity id ${entity.id}`);
    assert(!entityIds.has(entity.id), `duplicate entity id ${entity.id}`);
    entityIds.add(entity.id);
    ids.push(entity.id);
    assert(typeof entity.name === 'string' && entity.name.length > 0, `${entity.id} name is required`);
    assert(!isPlaceholder(entity.name), `placeholder entity ${entity.id}`);
    assertNullableString(entity.acronym, `${entity.id} acronym`);
    assertEnum(entity.kind, ENTITY_KINDS, `${entity.id} kind`);
    assert(
      entity.parentId === null || /^ufg\.[a-z0-9][a-z0-9.-]*$/.test(entity.parentId),
      `${entity.id} invalid parentId`,
    );
    assertEnum(entity.campus, CAMPUS_VALUES, `${entity.id} campus`);
    assertEnum(entity.status, ['active', 'pending_verification', 'retired'], `${entity.id} status`);
    assertUniqueStrings(entity.observedIn, `${entity.id} observedIn`);
    for (const inventory of entity.observedIn) {
      assert(/^[a-z][a-z0-9_-]*$/.test(inventory), `${entity.id} invalid observedIn value ${inventory}`);
    }
    assertUniqueStrings(entity.legacyIds, `${entity.id} legacyIds`);
    for (const legacyId of entity.legacyIds) {
      assert(legacyId.length > 0, `${entity.id} legacyIds must contain non-empty strings`);
    }
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
  const webSourceIds = new Set();
  const claimedWebUrls = new Map();
  for (const source of registry.webSources) {
    assertExactObjectKeys(
      source,
      [
        'id',
        'entityIds',
        'canonicalUrl',
        'declaredUrl',
        'aliases',
        'role',
        'sourceKind',
        'enabled',
        'baseTier',
        'executionModes',
        'endpoints',
        'collection',
        'allowPatterns',
        'blockPatterns',
        'reviewState',
        'reviewIssues',
        'audit',
        'transport',
        'observations',
      ],
      `web source ${source && source.id ? source.id : '<missing>'}`,
    );
    assert(/^web\.[a-z0-9][a-z0-9.-]*$/.test(source.id), `invalid web source id ${source.id}`);
    assert(!webSourceIds.has(source.id), `duplicate web source id ${source.id}`);
    webSourceIds.add(source.id);
    assert.strictEqual(source.enabled, false, `${source.id} must remain disabled`);
    assert(Array.isArray(source.entityIds) && source.entityIds.length > 0, `${source.id} entityIds[]`);
    assert.strictEqual(new Set(source.entityIds).size, source.entityIds.length, `${source.id} entityIds must be unique`);
    for (const entityId of source.entityIds) assert(entityIds.has(entityId), `${source.id} unknown entity ${entityId}`);
    assertEnum(source.role, WEB_ROLES, `${source.id} role`);
    assertEnum(source.sourceKind, WEB_SOURCE_KINDS, `${source.id} sourceKind`);
    assert(source.baseTier === null || [1, 2, 3].includes(source.baseTier), `${source.id} invalid baseTier`);
    validateRegistryUrl(source.canonicalUrl, `${source.id} canonical`);
    assertNullableString(source.declaredUrl, `${source.id} declaredUrl`);
    if (source.declaredUrl !== null) validateRegistryUrl(source.declaredUrl, `${source.id} declared`, true);
    assert(Array.isArray(source.aliases), `${source.id} aliases[]`);
    assertUniqueStrings(source.aliases, `${source.id} aliases`);
    for (const url of [source.canonicalUrl, ...source.aliases]) {
      validateRegistryUrl(url, source.id);
      assert(!claimedWebUrls.has(url), `${source.id} URL/alias collides with ${claimedWebUrls.get(url)}`);
      claimedWebUrls.set(url, source.id);
    }
    assertOrderedExecutionModes(source.executionModes, WEB_EXECUTION_MODE_ORDER, `${source.id} executionModes`);
    assertObject(source.endpoints, `${source.id} endpoints`);
    for (const endpointName of Object.keys(source.endpoints)) {
      assert(ENDPOINT_NAMES.includes(endpointName), `${source.id} endpoints has unknown field ${endpointName}`);
    }
    assert(Object.keys(source.endpoints).length > 0, `${source.id} endpoints must not be empty`);
    for (const [endpointName, endpoint] of Object.entries(source.endpoints)) {
      assertExactObjectKeys(endpoint, ['url', 'status'], `${source.id} endpoint ${endpointName}`);
      validateRegistryUrl(endpoint.url, `${source.id} endpoint ${endpointName}`);
      assertEnum(endpoint.status, REGISTRY_STATUSES, `${source.id} endpoint ${endpointName} status`);
    }
    assertExactObjectKeys(
      source.transport,
      ['status', 'checkedAt', 'finalUrl', 'httpStatus', 'note'],
      `${source.id} transport`,
    );
    assertEnum(source.transport.status, TRANSPORT_STATUSES, `${source.id} transport status`);
    assertDateAtOrBefore(source.transport.checkedAt, registry.auditCutoff, `${source.id} transport checkedAt`);
    assertNullableString(source.transport.finalUrl, `${source.id} transport finalUrl`);
    assert(
      source.transport.httpStatus === null
        || (Number.isInteger(source.transport.httpStatus)
          && source.transport.httpStatus >= 100
          && source.transport.httpStatus <= 599),
      `${source.id} invalid transport httpStatus`,
    );
    assertNullableString(source.transport.note, `${source.id} transport note`);
    if (source.transport.finalUrl !== null) validateRegistryUrl(source.transport.finalUrl, `${source.id} final`);
    if (['verified_200', 'verified_redirect'].includes(source.transport.status)) {
      assert(source.transport.finalUrl, `${source.id} verified transport needs finalUrl`);
      assert.strictEqual(source.transport.httpStatus, 200, `${source.id} verified transport needs HTTP 200`);
    } else if (source.transport.status === 'http_error') {
      assert(source.transport.finalUrl, `${source.id} HTTP error transport needs finalUrl`);
      assert(
        Number.isInteger(source.transport.httpStatus)
          && source.transport.httpStatus >= 400
          && source.transport.httpStatus <= 599,
        `${source.id} HTTP error transport needs 4xx/5xx`,
      );
      assert(typeof source.transport.note === 'string' && source.transport.note.length > 0, `${source.id} HTTP error transport note`);
    } else {
      assert.strictEqual(source.transport.finalUrl, null, `${source.id} unverified transport must not claim finalUrl`);
      assert.strictEqual(source.transport.httpStatus, null, `${source.id} unverified transport must not claim httpStatus`);
      if (['unreachable', 'tls_error'].includes(source.transport.status)) {
        assert(
          typeof source.transport.note === 'string' && source.transport.note.length > 0,
          `${source.id} failed transport note`,
        );
      }
    }
    assertExactObjectKeys(
      source.collection,
      ['strategy', 'maxItems', 'forceDetailFetch', 'dedupeTarget'],
      `${source.id} collection`,
    );
    assertEnum(source.collection.strategy, COLLECTION_STRATEGIES, `${source.id} collection strategy`);
    assertIntegerRange(source.collection.maxItems, 1, 200, `${source.id} maxItems`);
    assert.strictEqual(
      typeof source.collection.forceDetailFetch,
      'boolean',
      `${source.id} forceDetailFetch`,
    );
    assert.strictEqual(source.collection.dedupeTarget, source.canonicalUrl, `${source.id} dedupeTarget drift`);
    assertUniqueStrings(source.allowPatterns, `${source.id} allowPatterns`);
    for (const pattern of source.allowPatterns) {
      assert(pattern.length > 0, `${source.id} allowPatterns must contain non-empty strings`);
    }
    assertUniqueStrings(source.blockPatterns, `${source.id} blockPatterns`);
    for (const pattern of source.blockPatterns) {
      assert(pattern.length > 0, `${source.id} blockPatterns must contain non-empty strings`);
    }
    assertEnum(source.reviewState, REVIEW_STATES, `${source.id} reviewState`);
    assertUniqueStrings(source.reviewIssues, `${source.id} reviewIssues`);
    for (const issue of source.reviewIssues) {
      assertEnum(issue, REVIEW_ISSUES, `${source.id} reviewIssue`);
    }
    assertExactObjectKeys(source.audit, ['status', 'checkedAt', 'evidence'], `${source.id} audit`);
    assertEnum(source.audit.status, REGISTRY_STATUSES, `${source.id} audit status`);
    assertDateAtOrBefore(source.audit.checkedAt, registry.auditCutoff, `${source.id} audit checkedAt`);
    assert(Array.isArray(source.audit.evidence), `${source.id} audit evidence[]`);
    source.audit.evidence.forEach((evidence, index) => validateAuditEvidence(
      evidence,
      registry.auditCutoff,
      `${source.id} evidence ${index}`,
    ));
    if (source.audit.status === 'confirmed') {
      assert(
        source.audit.evidence.some((evidence) => OFFICIAL_EVIDENCE_KINDS.includes(evidence.kind)),
        `${source.id} confirmed without official evidence`,
      );
    }
    if (source.reviewIssues.includes('tier_conflict')) {
      assert.strictEqual(source.baseTier, null, `${source.id} tier conflict must not choose tier`);
    }
    if (source.reviewState === 'quarantined') {
      assert.deepStrictEqual(source.executionModes, [], `${source.id} quarantine must clear execution modes`);
      assert.strictEqual(source.collection.strategy, 'disabled', `${source.id} quarantine must disable collection`);
      assert(source.reviewIssues.length > 0, `${source.id} quarantine must explain its blockers`);
      assert(
        source.audit.evidence.some((evidence) => evidence.kind === 'direct_verification'),
        `${source.id} quarantine needs direct evidence`,
      );
    }
    if (source.sourceKind === 'ojs_site') {
      assert.deepStrictEqual(Object.keys(source.endpoints), ['html'], `${source.id} OJS source must not infer endpoints`);
    }
    if (/^https:\/\/pos\.ufg\.br\/p\//.test(source.canonicalUrl)) {
      assert.strictEqual(source.sourceKind, 'html_page', `${source.id} PPG page must be html_page`);
      assert.deepStrictEqual(Object.keys(source.endpoints), ['html'], `${source.id} PPG page must expose only html`);
      assert.strictEqual(
        source.collection.strategy,
        source.reviewState === 'quarantined' ? 'disabled' : 'html',
        `${source.id} PPG collection strategy drift`,
      );
    }
    assert(Array.isArray(source.observations), `${source.id} observations[]`);
    for (const [index, observation] of source.observations.entries()) {
      const context = `${source.id} observation ${index}`;
      assertObjectKeys(
        observation,
        [
          'inventory',
          'legacyId',
          'name',
          'url',
          'tier',
          'quick',
          'instagram',
          'forceDetailFetch',
          'maxItems',
          'publisherDeclared',
        ],
        ['inventory', 'legacyId', 'url', 'tier', 'instagram', 'publisherDeclared'],
        context,
      );
      assertEnum(observation.inventory, WEB_OBSERVATION_INVENTORIES, `${context} inventory`);
      assert(
        typeof observation.legacyId === 'string' && observation.legacyId.length > 0,
        `${context} legacyId must be a non-empty string`,
      );
      if (observation.name !== undefined) assertNullableString(observation.name, `${context} name`);
      validateRegistryUrl(observation.url, `${source.id} observation ${index}`);
      assert(observation.tier === null || [1, 2, 3].includes(observation.tier), `${context} invalid tier`);
      assert(
        observation.quick === undefined
          || observation.quick === null
          || typeof observation.quick === 'boolean',
        `${context} invalid quick`,
      );
      assertNullableString(observation.instagram, `${context} instagram`);
      assert.notStrictEqual(observation.instagram, 'null', `${context} must reject false @null`);
      if (observation.instagram !== null) {
        assert(isValidInstagramHandle(observation.instagram), `${context} invalid Instagram handle`);
      }
      assert(
        observation.forceDetailFetch === undefined
          || observation.forceDetailFetch === null
          || typeof observation.forceDetailFetch === 'boolean',
        `${context} invalid forceDetailFetch`,
      );
      assert(
        observation.maxItems === undefined
          || observation.maxItems === null
          || (Number.isInteger(observation.maxItems) && observation.maxItems >= 1),
        `${context} invalid maxItems`,
      );
      if (observation.publisherDeclared === null) continue;
      assert.strictEqual(
        observation.inventory,
        'kino_publisher',
        `${source.id} observation ${index} declaration must be from kino_publisher`,
      );
      assertExactObjectKeys(
        observation.publisherDeclared,
        [
          'hasFeedRss',
          'hasEventsRss',
          'feedRssUrl',
          'feedItemsCount',
          'qualityScore',
          'lastPostDate',
          'lastAudit',
        ],
        `${context} publisherDeclared`,
      );
      assert.strictEqual(
        typeof observation.publisherDeclared.hasFeedRss,
        'boolean',
        `${context} invalid hasFeedRss`,
      );
      assert.strictEqual(
        typeof observation.publisherDeclared.hasEventsRss,
        'boolean',
        `${context} invalid hasEventsRss`,
      );
      assertNullableString(observation.publisherDeclared.feedRssUrl, `${context} feedRssUrl`);
      if (observation.publisherDeclared.feedRssUrl !== null) {
        validateRegistryUrl(observation.publisherDeclared.feedRssUrl, `${context} feedRssUrl`);
      }
      assert(
        observation.publisherDeclared.feedItemsCount === null
          || (Number.isInteger(observation.publisherDeclared.feedItemsCount)
            && observation.publisherDeclared.feedItemsCount >= 0),
        `${context} invalid feedItemsCount`,
      );
      assert(
        observation.publisherDeclared.qualityScore === null
          || (typeof observation.publisherDeclared.qualityScore === 'number'
            && observation.publisherDeclared.qualityScore >= 0
            && observation.publisherDeclared.qualityScore <= 1),
        `${context} invalid qualityScore`,
      );
      for (const field of ['lastPostDate', 'lastAudit']) {
        if (observation.publisherDeclared[field] !== null) {
          assertDateAtOrBefore(
            observation.publisherDeclared[field],
            registry.auditCutoff,
            `${source.id} observation ${index} ${field}`,
          );
        }
      }
    }
    ids.push(source.id);
  }
  const profileIds = new Set();
  const profileById = new Map();
  const claimedHandles = new Map();
  for (const profile of registry.instagramProfiles) {
    assertExactObjectKeys(
      profile,
      [
        'id',
        'handle',
        'profileUrl',
        'aliases',
        'entityIds',
        'shared',
        'enabled',
        'status',
        'identityStatus',
        'supersededBy',
        'executionModes',
        'audit',
        'observations',
      ],
      `Instagram profile ${profile && profile.id ? profile.id : '<missing>'}`,
    );
    assert(/^ig\.[a-z0-9][a-z0-9.-]*$/.test(profile.id), `invalid Instagram id ${profile.id}`);
    assert(!profileIds.has(profile.id), `duplicate Instagram id ${profile.id}`);
    profileIds.add(profile.id);
    profileById.set(profile.id, profile);
    assert.strictEqual(profile.enabled, false, `${profile.id} must remain disabled`);
    assert.strictEqual(typeof profile.shared, 'boolean', `${profile.id} shared must be boolean`);
    assertEnum(profile.status, REGISTRY_STATUSES, `${profile.id} status`);
    assertEnum(profile.identityStatus, INSTAGRAM_IDENTITY_STATUSES, `${profile.id} identityStatus`);
    assert(
      profile.supersededBy === null || /^ig\.[a-z0-9][a-z0-9.-]*$/.test(profile.supersededBy),
      `${profile.id} invalid supersededBy`,
    );
    assert(isValidInstagramHandle(profile.handle), `${profile.id} invalid handle`);
    assert.strictEqual(
      profile.profileUrl,
      `https://www.instagram.com/${profile.handle}/`,
      `${profile.id} profile URL/handle drift`,
    );
    assert(!claimedHandles.has(profile.handle), `${profile.id} handle collides with ${claimedHandles.get(profile.handle)}`);
    claimedHandles.set(profile.handle, profile.id);
    assert(Array.isArray(profile.aliases), `${profile.id} aliases[]`);
    assertUniqueStrings(profile.aliases, `${profile.id} aliases`);
    assert(Array.isArray(profile.entityIds), `${profile.id} entityIds[]`);
    assert.strictEqual(new Set(profile.entityIds).size, profile.entityIds.length, `${profile.id} entityIds must be unique`);
    for (const entityId of profile.entityIds) assert(entityIds.has(entityId), `${profile.id} unknown entity ${entityId}`);
    assert.strictEqual(profile.shared, profile.entityIds.length > 1, `${profile.id} shared flag drift`);
    assertOrderedExecutionModes(
      profile.executionModes,
      INSTAGRAM_EXECUTION_MODE_ORDER,
      `${profile.id} executionModes`,
    );
    assertExactObjectKeys(profile.audit, ['checkedAt', 'evidence'], `${profile.id} audit`);
    assertDateAtOrBefore(profile.audit.checkedAt, registry.auditCutoff, `${profile.id} audit checkedAt`);
    assert(Array.isArray(profile.audit.evidence), `${profile.id} audit evidence[]`);
    profile.audit.evidence.forEach((evidence, index) => validateAuditEvidence(
      evidence,
      registry.auditCutoff,
      `${profile.id} evidence ${index}`,
    ));
    if (profile.status === 'confirmed') {
      assert(
        profile.audit.evidence.some((evidence) => OFFICIAL_EVIDENCE_KINDS.includes(evidence.kind)),
        `${profile.id} confirmed without official evidence`,
      );
    }
    if (profile.identityStatus === 'officially_declared') {
      assert(
        profile.audit.evidence.some((evidence) => (
          evidence.kind === 'official_page' && evidence.field === 'instagram_handle'
        )),
        `${profile.id} official declaration needs evidence`,
      );
      assert.strictEqual(profile.supersededBy, null, `${profile.id} declared profile cannot be superseded`);
    }
    if (profile.identityStatus === 'reassigned') {
      assert.strictEqual(profile.status, 'retired', `${profile.id} reassigned profile must be retired`);
      assert.deepStrictEqual(profile.executionModes, [], `${profile.id} reassigned profile must not execute`);
      assert(
        profile.audit.evidence.some((evidence) => (
          evidence.kind === 'official_page' && evidence.field === 'instagram_identity_transition'
        )),
        `${profile.id} reassigned profile needs transition evidence`,
      );
    }
    assert(Array.isArray(profile.observations), `${profile.id} observations[]`);
    for (const [index, observation] of profile.observations.entries()) {
      assertExactObjectKeys(
        observation,
        ['inventory', 'handle', 'sourceId'],
        `${profile.id} observation ${index}`,
      );
      assertEnum(
        observation.inventory,
        INSTAGRAM_OBSERVATION_INVENTORIES,
        `${profile.id} observation ${index} inventory`,
      );
      assert(isValidInstagramHandle(observation.handle), `${profile.id} observation ${index} invalid handle`);
      assert(
        observation.sourceId === null || webSourceIds.has(observation.sourceId),
        `${profile.id} observation ${index} unknown sourceId ${observation.sourceId}`,
      );
    }
    ids.push(profile.id);
  }
  for (const profile of registry.instagramProfiles) {
    for (const alias of profile.aliases) {
      assert(isValidInstagramHandle(alias), `${profile.id} invalid alias ${alias}`);
      assert(!claimedHandles.has(alias), `${profile.id} alias collides with ${claimedHandles.get(alias)}`);
      claimedHandles.set(alias, profile.id);
    }
  }
  for (const source of registry.webSources) {
    for (const [index, observation] of source.observations.entries()) {
      if (observation.instagram === null) continue;
      assert(
        claimedHandles.has(observation.instagram),
        `${source.id} observation ${index} unknown Instagram handle ${observation.instagram}`,
      );
    }
  }
  for (const profile of registry.instagramProfiles) {
    if (profile.supersededBy === null) {
      assert.notStrictEqual(profile.identityStatus, 'reassigned', `${profile.id} reassigned profile needs supersededBy`);
      continue;
    }
    assert.strictEqual(profile.identityStatus, 'reassigned', `${profile.id} unexpected supersededBy`);
    assert.notStrictEqual(profile.supersededBy, profile.id, `${profile.id} cannot supersede itself`);
    const replacement = profileById.get(profile.supersededBy);
    assert(replacement, `${profile.id} supersededBy references unknown profile ${profile.supersededBy}`);
    assert.notStrictEqual(replacement.status, 'retired', `${profile.id} replacement cannot be retired`);
    assert(!profile.aliases.includes(replacement.handle), `${profile.id} replacement handle must not be an alias`);
    assert(!replacement.aliases.includes(profile.handle), `${profile.id} retired handle must not become an alias`);

    const seen = new Set([profile.id]);
    let cursor = profile;
    while (cursor.supersededBy !== null) {
      assert(!seen.has(cursor.supersededBy), `Instagram supersededBy cycle involving ${cursor.supersededBy}`);
      seen.add(cursor.supersededBy);
      cursor = profileById.get(cursor.supersededBy);
      assert(cursor, `${profile.id} supersededBy chain references unknown profile`);
    }
  }
  assert.strictEqual(new Set(ids).size, ids.length, 'registry IDs must be globally unique');
  return registry;
}

function validateManifest(manifest) {
  assertExactObjectKeys(
    manifest,
    ['schemaVersion', 'registryVersion', 'auditCutoff', 'upstream', 'artifacts', 'safety'],
    'registry manifest',
  );
  assert.strictEqual(manifest.schemaVersion, 1, 'manifest schemaVersion');
  assertExactObjectKeys(manifest.upstream, ['repository', 'commit'], 'manifest upstream');
  assert.strictEqual(manifest.upstream.repository, 'https://github.com/yandiamantinoBr/openclaw-cadu');
  assert(/^[0-9a-f]{40}$/.test(manifest.upstream.commit), 'manifest requires full upstream commit');
  parseRegistryVersion(manifest.registryVersion, 'manifest registryVersion');
  assertIsoDate(manifest.auditCutoff, 'manifest auditCutoff');
  assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 3, 'manifest requires three artifacts');
  const expectedIds = new Set(Object.keys(EXPECTED_ARTIFACTS));
  for (const artifact of manifest.artifacts) {
    assertExactObjectKeys(
      artifact,
      ['id', 'file', 'upstreamPath', 'upstreamGitBlobOid', 'contentSha256', 'byteLength'],
      'manifest artifact',
    );
    assert(expectedIds.delete(artifact.id), `unexpected or duplicate manifest artifact ${artifact.id}`);
    const expected = EXPECTED_ARTIFACTS[artifact.id];
    assert.strictEqual(artifact.file, expected.file, `${artifact.id} local file path drift`);
    assert.strictEqual(artifact.upstreamPath, expected.upstreamPath, `${artifact.id} upstream path drift`);
    assert(/^[0-9a-f]{40}$/.test(artifact.upstreamGitBlobOid), `${artifact.id} upstream Git blob`);
    assert(/^[0-9a-f]{64}$/.test(artifact.contentSha256), `${artifact.id} content SHA-256`);
    assert(
      Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0,
      `${artifact.id} byte length`,
    );
  }
  assert.strictEqual(expectedIds.size, 0, `manifest missing artifact(s): ${[...expectedIds].join(', ')}`);
  assertObject(manifest.safety, 'manifest safety');
  assert.deepStrictEqual(manifest.safety, EXPECTED_MIRROR_SAFETY, 'unexpected mirror safety policy');
  return manifest;
}

function validateReconciliationReport(report, registry) {
  assertObject(report, 'reconciliation report');
  assert.strictEqual(report.schemaVersion, 1, 'report schemaVersion');
  assert.strictEqual(report.registryVersion, registry.registryVersion, 'report/registry version drift');
  assert.strictEqual(report.auditCutoff, registry.auditCutoff, 'report/registry audit cutoff drift');
  assert.deepStrictEqual(report.generatedFrom, registry.provenance, 'report/registry provenance drift');
  assertObject(report.safety, 'report safety');
  assert.strictEqual(report.safety.lifecycle, 'shadow', 'upstream report must describe shadow lifecycle');
  assert.strictEqual(report.safety.runtimeActivated, true, 'upstream report must expose the cadu-api shadow consumer');
  assert.strictEqual(report.safety.collectionActivated, false, 'upstream collection must remain disabled');
  assert.strictEqual(report.safety.publishAttempted, false, 'upstream report must not record a publish attempt');
  assert.strictEqual(report.safety.networkAccessRequired, false, 'registry reconciliation must remain offline');
  assertObject(report.normalizedRegistry, 'report normalizedRegistry');
  const tierConflictSources = registry.webSources
    .filter((source) => source.reviewIssues.includes('tier_conflict'))
    .map((source) => source.id);
  const urlConflictSources = registry.webSources
    .filter((source) => source.reviewIssues.includes('url_conflict'))
    .map((source) => source.id);
  const pendingSources = registry.webSources
    .filter((source) => source.audit.status === 'pending_verification')
    .map((source) => source.id);
  const quarantinedSources = registry.webSources
    .filter((source) => source.reviewState === 'quarantined')
    .map((source) => source.id);
  const transportUnverifiedSources = registry.webSources
    .filter((source) => !['verified_200', 'verified_redirect'].includes(source.transport.status))
    .map((source) => source.id);
  const endpointVerificationPendingSources = registry.webSources
    .filter((source) => Object.values(source.endpoints).some((endpoint) => endpoint.status !== 'confirmed'))
    .map((source) => source.id);
  const provisionalEntityIds = registry.entities
    .filter((entity) => entity.status === 'pending_verification')
    .map((entity) => entity.id);
  const instagramWithoutEntity = registry.instagramProfiles
    // Reassigned/retired handles may intentionally lose their old entity
    // association; their supersededBy edge is the authoritative lineage.
    .filter((profile) => profile.status !== 'retired' && profile.entityIds.length === 0)
    .map((profile) => profile.id);
  const scannerInstagramWithoutEntity = registry.instagramProfiles
    .filter((profile) => profile.entityIds.length === 0
      && profile.observations.some((observation) => observation.inventory === 'instagram_scanner'))
    .map((profile) => profile.id);
  const instagramVerificationPending = registry.instagramProfiles
    .filter((profile) => profile.status === 'pending_verification')
    .map((profile) => profile.id);
  const instagramEvidenceMissing = registry.instagramProfiles
    .filter((profile) => profile.audit.evidence.length === 0)
    .map((profile) => profile.id);
  const expectedNormalizedRegistry = {
    entities: registry.entities.length,
    webSources: registry.webSources.length,
    instagramProfiles: registry.instagramProfiles.length,
    enabledWebSources: registry.webSources.filter((source) => source.enabled).length,
    enabledInstagramProfiles: registry.instagramProfiles.filter((profile) => profile.enabled).length,
    officiallyConfirmedWebSources: registry.webSources
      .filter((source) => source.audit.status === 'confirmed').length,
    officiallyDeclaredInstagramProfiles: registry.instagramProfiles
      .filter((profile) => profile.identityStatus === 'officially_declared').length,
    quarantinedWebSources: quarantinedSources.length,
    retiredInstagramProfiles: registry.instagramProfiles.filter((profile) => profile.status === 'retired').length,
    pendingWebSources: pendingSources.length,
    transportUnverifiedWebSources: transportUnverifiedSources.length,
    endpointVerificationPendingWebSources: endpointVerificationPendingSources.length,
    tierConflictSources: tierConflictSources.length,
    urlConflictSources: urlConflictSources.length,
  };
  assert.deepStrictEqual(report.normalizedRegistry, expectedNormalizedRegistry, 'report normalized metrics drift');

  assertObject(report.conflicts, 'report conflicts');
  for (const field of ['tier', 'effectiveLegacyTier', 'instagram', 'institutionalUrlCandidates']) {
    assert(Array.isArray(report.conflicts[field]), `report conflicts.${field}[]`);
  }
  assertObject(report.instagramOverlap, 'report instagramOverlap');
  assert(Array.isArray(report.instagramOverlap.legacyNotScanned), 'report instagramOverlap.legacyNotScanned[]');
  assertObject(report.invalidObservations, 'report invalidObservations');
  assert(Array.isArray(report.invalidObservations.adminMapRejected), 'report invalidObservations.adminMapRejected[]');
  assertObject(report.inventoryMetrics, 'report inventoryMetrics');
  assertObject(report.inventoryMetrics.adminMapCompat, 'report inventoryMetrics.adminMapCompat');
  assert(
    Number.isSafeInteger(report.inventoryMetrics.adminMapCompat.falseNullHandles)
      && report.inventoryMetrics.adminMapCompat.falseNullHandles >= 0,
    'report adminMapCompat.falseNullHandles must be a non-negative safe integer',
  );
  assert(Array.isArray(report.activationBlockers), 'report activationBlockers[]');
  const blockers = new Map();
  for (const blocker of report.activationBlockers) {
    assertObject(blocker, 'report activation blocker');
    assert(typeof blocker.id === 'string' && blocker.id.length > 0, 'activation blocker id');
    assert(!blockers.has(blocker.id), `duplicate activation blocker ${blocker.id}`);
    assert(Number.isSafeInteger(blocker.count) && blocker.count >= 0, `${blocker.id} invalid count`);
    assert(
      typeof blocker.requiredAction === 'string' && blocker.requiredAction.length > 0,
      `${blocker.id} missing requiredAction`,
    );
    blockers.set(blocker.id, blocker);
  }
  const expectedBlockerIds = [
    'collection-not-activated',
    'tier-conflicts',
    'instagram-conflicts',
    'institutional-url-conflicts',
    'pending-source-audit',
    'quarantined-sources',
    'transport-unverified',
    'endpoint-verification-pending',
    'provisional-entity-identity',
    'instagram-without-entity',
    'legacy-instagram-not-scanned',
    'scanner-instagram-without-entity',
    'instagram-profile-verification-pending',
    'instagram-evidence-missing',
    'admin-map-parser-defects',
  ];
  assert.deepStrictEqual([...blockers.keys()], expectedBlockerIds, 'report activation blocker contract drift');
  const assertBlocker = (id, count, listField, list) => {
    const blocker = blockers.get(id);
    assert.strictEqual(blocker.count, count, `${id} count drift`);
    if (listField) assert.deepStrictEqual(blocker[listField], list, `${id} ${listField} drift`);
  };
  assertBlocker('collection-not-activated', registry.webSources.length + registry.instagramProfiles.length);
  assertBlocker('tier-conflicts', tierConflictSources.length, 'sourceIds', tierConflictSources);
  assert.strictEqual(
    blockers.get('tier-conflicts').commonUrlDeclaredSetCount,
    report.conflicts.tier.length,
    'tier-conflicts declared count drift',
  );
  assert.strictEqual(
    blockers.get('tier-conflicts').commonUrlEffectiveLegacyCount,
    report.conflicts.effectiveLegacyTier.length,
    'tier-conflicts effective count drift',
  );
  assertBlocker('instagram-conflicts', report.conflicts.instagram.length);
  assertBlocker(
    'institutional-url-conflicts',
    report.conflicts.institutionalUrlCandidates.length,
    'sourceIds',
    urlConflictSources,
  );
  assertBlocker('pending-source-audit', pendingSources.length, 'sourceIds', pendingSources);
  assertBlocker('quarantined-sources', quarantinedSources.length, 'sourceIds', quarantinedSources);
  assertBlocker('transport-unverified', transportUnverifiedSources.length, 'sourceIds', transportUnverifiedSources);
  assertBlocker(
    'endpoint-verification-pending',
    endpointVerificationPendingSources.length,
    'sourceIds',
    endpointVerificationPendingSources,
  );
  assertBlocker('provisional-entity-identity', provisionalEntityIds.length, 'entityIds', provisionalEntityIds);
  assertBlocker('instagram-without-entity', instagramWithoutEntity.length, 'profileIds', instagramWithoutEntity);
  assertBlocker(
    'legacy-instagram-not-scanned',
    report.instagramOverlap.legacyNotScanned.length,
    'handles',
    report.instagramOverlap.legacyNotScanned,
  );
  assertBlocker(
    'scanner-instagram-without-entity',
    scannerInstagramWithoutEntity.length,
    'profileIds',
    scannerInstagramWithoutEntity,
  );
  assertBlocker(
    'instagram-profile-verification-pending',
    instagramVerificationPending.length,
    'profileIds',
    instagramVerificationPending,
  );
  assertBlocker(
    'instagram-evidence-missing',
    instagramEvidenceMissing.length,
    'profileIds',
    instagramEvidenceMissing,
  );
  assertBlocker(
    'admin-map-parser-defects',
    report.invalidObservations.adminMapRejected.length
      + report.inventoryMetrics.adminMapCompat.falseNullHandles,
  );
  return report;
}

function validateRegistryBundle(registry, schema, report, schemaBytes) {
  assert(Buffer.isBuffer(schemaBytes), 'mirrored schema bytes are required');
  validateRegistrySchema(registry, schema);
  validateCandidateRegistry(registry);
  assert.strictEqual(
    registry.provenance.schemaContentSha256,
    sha256(schemaBytes),
    'registry provenance schemaContentSha256 drift',
  );
  validateReconciliationReport(report, registry);
  return { registry, schema, report };
}

function verifyMirroredRegistry(options = {}) {
  const registryDir = path.resolve(options.registryDir || REGISTRY_DIR);
  const manifestPath = path.resolve(options.manifestPath || path.join(registryDir, 'upstream-manifest.json'));
  const manifest = validateManifest(readJson(manifestPath).value);
  const expectedIds = new Set(['candidate', 'schema', 'reconciliation-report']);
  const loaded = {};
  const loadedBytes = {};

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
    loadedBytes[artifact.id] = current.bytes;
  }
  assert.strictEqual(expectedIds.size, 0, `manifest missing artifact(s): ${[...expectedIds].join(', ')}`);
  const registry = loaded.candidate;
  const report = loaded['reconciliation-report'];
  validateRegistryBundle(registry, loaded.schema, report, loadedBytes.schema);
  assert.strictEqual(registry.registryVersion, manifest.registryVersion, 'manifest/candidate version drift');
  assert.strictEqual(registry.auditCutoff, manifest.auditCutoff, 'manifest/candidate audit cutoff drift');
  return { manifest, registry, schema: loaded.schema, report };
}

function loadCandidateSourceRegistry(options = {}) {
  return verifyMirroredRegistry(options).registry;
}

module.exports = {
  MANIFEST_PATH,
  REGISTRY_DIR,
  EXPECTED_ARTIFACTS,
  EXPECTED_MIRROR_SAFETY,
  EXPECTED_PROVENANCE,
  EXPECTED_UPSTREAM_ACTIVATION,
  assertIsoDate,
  gitBlobOid,
  loadCandidateSourceRegistry,
  sha256,
  parseRegistryVersion,
  validateCandidateRegistry,
  validateManifest,
  validateReconciliationReport,
  validateRegistryBundle,
  validateRegistrySchema,
  verifyMirroredRegistry,
};
