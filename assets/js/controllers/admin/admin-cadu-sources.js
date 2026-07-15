(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KCAdminCaduSources = Object.freeze(api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SHA256_PATTERN = /^[0-9a-f]{64}$/;
  var STRONG_ETAG_PATTERN = /^"[0-9a-f]{64}"$/;
  var ENTITY_ID_PATTERN = /^ufg\.[a-z0-9][a-z0-9.-]*$/;
  var SOURCE_ID_PATTERN = /^web\.[a-z0-9][a-z0-9.-]*$/;
  var INSTAGRAM_ID_PATTERN = /^ig\.[a-z0-9][a-z0-9.-]*$/;
  var INSTAGRAM_STATUSES = Object.freeze([
    'confirmed',
    'tentative',
    'missing',
    'retired',
    'pending_verification'
  ]);
  var META_MATCH_TYPES = Object.freeze([
    'stable_source_id',
    'admin_observation',
    'admin_normalized',
    'legacy_observation',
    'entity_identity',
    'orphan'
  ]);
  var METADATA_READINESS_CHECKS = Object.freeze([
    'metadataTable',
    'revisionColumn',
    'revisionConstraint',
    'touchTrigger',
    'stableRpc',
    'legacyRpc',
    'browserWritesRevoked',
    'legacyReadsPreserved',
    'serviceRolePhaseA'
  ]);
  var VIEWS = Object.freeze(['sources', 'entities', 'instagram', 'deferred']);

  function SourceRegistryContractError(code, path, message) {
    this.name = 'SourceRegistryContractError';
    this.code = code;
    this.path = path;
    this.message = path ? path + ': ' + message : message;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SourceRegistryContractError);
    }
  }
  SourceRegistryContractError.prototype = Object.create(Error.prototype);
  SourceRegistryContractError.prototype.constructor = SourceRegistryContractError;

  function fail(code, path, message) {
    throw new SourceRegistryContractError(code, path, message);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function requireObject(value, path) {
    if (!isPlainObject(value)) fail('invalid_object', path, 'expected an object');
    return value;
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail('invalid_array', path, 'expected an array');
    return value;
  }

  function requireString(value, path) {
    if (typeof value !== 'string' || !value.trim()) {
      fail('invalid_string', path, 'expected a non-empty string');
    }
    return value;
  }

  function requireNullableString(value, path, maxLength) {
    if (value === null) return value;
    requireString(value, path);
    if (maxLength && value.length > maxLength) fail('invalid_string', path, 'exceeds ' + maxLength + ' characters');
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
      fail('invalid_string', path, 'contains control characters');
    }
    return value;
  }

  function requireNullableText(value, path, maxLength) {
    if (value === null) return value;
    if (typeof value !== 'string') fail('invalid_string', path, 'expected a string or null');
    if (maxLength && value.length > maxLength) fail('invalid_string', path, 'exceeds ' + maxLength + ' characters');
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
      fail('invalid_string', path, 'contains control characters');
    }
    return value;
  }

  function requireUniqueTextStrings(values, path) {
    requireArray(values, path);
    var seen = Object.create(null);
    values.forEach(function (value, index) {
      requireString(value, path + '[' + index + ']');
      if (seen[value]) fail('duplicate_identifier', path + '[' + index + ']', 'duplicate value ' + value);
      seen[value] = true;
    });
    return values;
  }

  function requireNullableRevision(value, path) {
    if (value === null) return value;
    if (!Number.isSafeInteger(value) || value < 1) fail('invalid_revision', path, 'expected a positive integer or null');
    return value;
  }

  function requirePattern(value, pattern, path, label) {
    requireString(value, path);
    if (!pattern.test(value)) fail('invalid_identifier', path, 'expected ' + label);
    return value;
  }

  function requireBoolean(value, path) {
    if (typeof value !== 'boolean') fail('invalid_boolean', path, 'expected a boolean');
    return value;
  }

  function requireHttpsUrl(value, path) {
    requireString(value, path);
    var parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      fail('invalid_https_url', path, 'expected an absolute HTTPS URL');
    }
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      /\s/.test(value)
    ) {
      fail('invalid_https_url', path, 'expected an absolute HTTPS URL without credentials, query or fragment');
    }
    return value;
  }

  function requireNullableTier(value, path) {
    if (value === null) return value;
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      fail('invalid_tier', path, 'expected 1, 2, 3 or null');
    }
    return value;
  }

  function requireUniqueStrings(values, pattern, path, knownIds) {
    requireArray(values, path);
    var seen = Object.create(null);
    values.forEach(function (value, index) {
      var itemPath = path + '[' + index + ']';
      requirePattern(value, pattern, itemPath, 'a canonical ID');
      if (seen[value]) fail('duplicate_identifier', itemPath, 'duplicate ID ' + value);
      if (knownIds && !knownIds[value]) {
        fail('unknown_reference', itemPath, 'unknown ID ' + value);
      }
      seen[value] = true;
    });
    return values;
  }

  function indexCanonicalItems(items, pattern, path) {
    var index = Object.create(null);
    requireArray(items, path).forEach(function (item, position) {
      requireObject(item, path + '[' + position + ']');
      var id = requirePattern(item.id, pattern, path + '[' + position + '].id', 'a canonical ID');
      if (index[id]) fail('duplicate_identifier', path + '[' + position + '].id', 'duplicate ID ' + id);
      index[id] = item;
    });
    return index;
  }

  function sortedKeys(index) {
    return Object.keys(index).sort();
  }

  function sameStringSet(left, right) {
    if (left.length !== right.length) return false;
    var a = left.slice().sort();
    var b = right.slice().sort();
    return a.every(function (value, index) { return value === b[index]; });
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readHeader(container, name) {
    var headers = container && container.headers ? container.headers : container;
    if (!headers) return null;
    if (typeof headers.get === 'function') {
      var fromGetter = headers.get(name);
      return fromGetter == null ? null : String(fromGetter).trim();
    }
    if (!isPlainObject(headers)) return null;
    var wanted = name.toLowerCase();
    var keys = Object.keys(headers);
    for (var index = 0; index < keys.length; index += 1) {
      if (keys[index].toLowerCase() === wanted) {
        return headers[keys[index]] == null ? null : String(headers[keys[index]]).trim();
      }
    }
    return null;
  }

  function requireResponseHeaders(responseMeta, registrySha256) {
    var registryHeader = readHeader(responseMeta, 'X-Cadu-Registry-Sha256');
    var responseEtag = readHeader(responseMeta, 'ETag');
    if (!registryHeader) {
      fail('missing_registry_hash_header', 'headers.x-cadu-registry-sha256', 'required header is missing');
    }
    if (registryHeader !== registrySha256) {
      fail('registry_hash_mismatch', 'headers.x-cadu-registry-sha256', 'does not match payload.registrySha256');
    }
    if (!responseEtag || !STRONG_ETAG_PATTERN.test(responseEtag)) {
      fail('invalid_response_etag', 'headers.etag', 'expected a strong SHA-256 ETag');
    }
    return responseEtag;
  }

  function validateRegistryReadiness(payload, responseMeta, registry) {
    requireObject(payload, 'readiness');
    requireObject(registry, 'registry');
    var expectedSha = requirePattern(
      registry.registrySha256,
      SHA256_PATTERN,
      'registry.registrySha256',
      'a lowercase SHA-256'
    );
    var expectedVersion = requireString(registry.registryVersion, 'registry.registryVersion');
    var headerSha = readHeader(responseMeta, 'X-Cadu-Registry-Sha256');
    if (!headerSha) {
      fail('missing_registry_hash_header', 'headers.x-cadu-registry-sha256', 'required header is missing');
    }
    if (headerSha !== expectedSha || payload.registrySha256 !== expectedSha) {
      fail('registry_hash_mismatch', 'readiness.registrySha256', 'readiness and list hashes must agree');
    }
    if (payload.registryVersion !== expectedVersion) {
      fail('registry_version_mismatch', 'readiness.registryVersion', 'readiness and list versions must agree');
    }
    if (payload.ready !== true) fail('registry_not_ready', 'readiness.ready', 'expected true');
    if (payload.contractVersion !== 'cadu-unit-meta-cas-v1' || payload.phase !== 'phase-a') {
      fail('metadata_contract_mismatch', 'readiness', 'unsupported metadata contract');
    }
    requireObject(payload.checks, 'readiness.checks');
    var checkNames = Object.keys(payload.checks).sort();
    var expectedCheckNames = METADATA_READINESS_CHECKS.slice().sort();
    if (
      checkNames.length !== expectedCheckNames.length ||
      checkNames.some(function (name, index) {
        return name !== expectedCheckNames[index] || payload.checks[name] !== true;
      })
    ) {
      fail('metadata_contract_not_ready', 'readiness.checks', 'expected the exact phase-a check set with every value true');
    }
    if (!Number.isSafeInteger(payload.metadataRowsValidated) || payload.metadataRowsValidated < 0) {
      fail('invalid_metadata_count', 'readiness.metadataRowsValidated', 'expected a non-negative integer');
    }
    return {
      ready: true,
      contractVersion: payload.contractVersion,
      phase: payload.phase,
      metadataRowsValidated: payload.metadataRowsValidated,
      registryVersion: payload.registryVersion,
      registrySha256: payload.registrySha256
    };
  }

  function validateEntityReferences(entities, entityIndex) {
    entities.forEach(function (entity, index) {
      var path = 'entities[' + index + ']';
      requireString(entity.name, path + '.name');
      if (entity.acronym !== null) requireString(entity.acronym, path + '.acronym');
      requireString(entity.kind, path + '.kind');
      if (entity.campus !== null) requireString(entity.campus, path + '.campus');
      requireString(entity.status, path + '.status');
      requireUniqueTextStrings(entity.observedIn, path + '.observedIn');
      requireUniqueTextStrings(entity.legacyIds, path + '.legacyIds');
      if (entity.parentId === undefined) fail('invalid_identifier', path + '.parentId', 'expected an entity ID or null');
      if (entity.parentId !== null) {
        requirePattern(entity.parentId, ENTITY_ID_PATTERN, path + '.parentId', 'an entity ID');
        if (!entityIndex[entity.parentId]) {
          fail('unknown_reference', path + '.parentId', 'unknown entity ' + entity.parentId);
        }
      }
    });
    entities.forEach(function (entity, index) {
      var seen = Object.create(null);
      var cursor = entity;
      seen[entity.id] = true;
      while (cursor.parentId !== null) {
        if (seen[cursor.parentId]) {
          fail('entity_parent_cycle', 'entities[' + index + '].parentId', 'entity hierarchy contains a cycle');
        }
        seen[cursor.parentId] = true;
        cursor = entityIndex[cursor.parentId];
      }
    });
  }

  function validateSources(sources, sourceIndex, entityIndex, registrySha256) {
    var revisions = Object.create(null);
    var etags = Object.create(null);
    sources.forEach(function (source, index) {
      var path = 'sources[' + index + ']';
      if (source.registrySha256 !== registrySha256) {
        fail('registry_hash_mismatch', path + '.registrySha256', 'does not match registrySha256');
      }
      requireBoolean(source.enabled, path + '.enabled');
      if (source.enabled) fail('shadow_source_enabled', path + '.enabled', 'shadow sources must be disabled');
      requireHttpsUrl(source.canonicalUrl, path + '.canonicalUrl');
      requireString(source.role, path + '.role');
      requireString(source.sourceKind, path + '.sourceKind');
      requireUniqueTextStrings(source.executionModes, path + '.executionModes');
      requireString(source.reviewState, path + '.reviewState');
      requireUniqueTextStrings(source.reviewIssues, path + '.reviewIssues');
      requireNullableText(source.note, path + '.note', 500);
      requireNullableText(source.updatedAt, path + '.updatedAt', 128);
      requireNullableRevision(source.overrideRevision, path + '.overrideRevision');
      requireNullableTier(source.baseTier, path + '.baseTier');
      requireNullableTier(source.overrideTier, path + '.overrideTier');
      requireNullableTier(source.effectiveTier, path + '.effectiveTier');
      if (source.effectiveTier !== (source.overrideTier === null ? source.baseTier : source.overrideTier)) {
        fail('effective_tier_mismatch', path + '.effectiveTier', 'must resolve overrideTier over baseTier');
      }
      if (['base', 'stable', 'legacy_inherited', 'collision', 'ambiguous'].indexOf(source.overrideOrigin) === -1) {
        fail('invalid_override_origin', path + '.overrideOrigin', 'unknown override origin');
      }
      requireBoolean(source.isInheritedLegacy, path + '.isInheritedLegacy');
      requireBoolean(source.collision, path + '.collision');
      if (source.overrideUnitId !== null) requireNullableString(source.overrideUnitId, path + '.overrideUnitId', 500);
      var selectedOverride = source.overrideOrigin === 'stable' || source.overrideOrigin === 'legacy_inherited';
      if (selectedOverride) {
        if (source.overrideUnitId === null || source.overrideRevision === null || source.updatedAt === null) {
          fail('incomplete_override', path, 'selected overrides require unit ID, revision and updated timestamp');
        }
        if (source.overrideOrigin === 'stable' && source.overrideUnitId !== source.id) {
          fail('invalid_override_unit_id', path + '.overrideUnitId', 'a stable override must use source.id');
        }
        if (source.overrideOrigin === 'legacy_inherited' && source.overrideUnitId === source.id) {
          fail('invalid_override_unit_id', path + '.overrideUnitId', 'a legacy override cannot use source.id');
        }
      } else if (
        source.overrideUnitId !== null || source.overrideTier !== null || source.note !== null ||
        source.updatedAt !== null || source.overrideRevision !== null
      ) {
        fail('unexpected_override_data', path, 'unselected override origins must not expose row metadata');
      }
      if (source.isInheritedLegacy !== (source.overrideOrigin === 'legacy_inherited')) {
        fail('invalid_legacy_inheritance', path + '.isInheritedLegacy', 'must match overrideOrigin');
      }
      if (source.overrideOrigin === 'collision' && !source.collision) {
        fail('invalid_collision_state', path + '.collision', 'collision origin requires collision evidence');
      }
      if (source.overrideOrigin !== 'stable' && source.overrideOrigin !== 'collision' && source.collision) {
        fail('invalid_collision_state', path + '.collision', 'only stable-wins or collision origins can expose collision evidence');
      }
      requireUniqueStrings(source.entityIds, ENTITY_ID_PATTERN, path + '.entityIds', entityIndex);
      if (!source.entityIds.length) fail('missing_association', path + '.entityIds', 'a web source must reference an entity');
      requirePattern(source.revision, SHA256_PATTERN, path + '.revision', 'a lowercase SHA-256');
      if (revisions[source.revision]) {
        fail('duplicate_revision', path + '.revision', 'source revisions must be unique');
      }
      revisions[source.revision] = true;
      if (source.etag !== '"' + source.revision + '"' || !STRONG_ETAG_PATTERN.test(source.etag)) {
        fail('invalid_source_etag', path + '.etag', 'must be the strong ETag for source.revision');
      }
      if (etags[source.etag]) fail('duplicate_etag', path + '.etag', 'source ETags must be unique');
      etags[source.etag] = true;

      requireArray(source.entities, path + '.entities');
      var embeddedEntityIds = source.entities.map(function (entity, entityPosition) {
        requireObject(entity, path + '.entities[' + entityPosition + ']');
        var entityId = requirePattern(
          entity.id,
          ENTITY_ID_PATTERN,
          path + '.entities[' + entityPosition + '].id',
          'an entity ID'
        );
        if (!entityIndex[entityId]) {
          fail('unknown_reference', path + '.entities[' + entityPosition + '].id', 'unknown entity ' + entityId);
        }
        var canonicalEntity = entityIndex[entityId];
        if (
          entity.name !== canonicalEntity.name || entity.acronym !== canonicalEntity.acronym ||
          entity.kind !== canonicalEntity.kind || entity.status !== canonicalEntity.status
        ) {
          fail('association_mismatch', path + '.entities[' + entityPosition + ']', 'embedded entity differs from the canonical entity');
        }
        return entityId;
      });
      if (!sameStringSet(source.entityIds, embeddedEntityIds)) {
        fail('association_mismatch', path + '.entities', 'embedded entities do not match entityIds');
      }
      requireArray(source.instagramProfiles, path + '.instagramProfiles');
    });
    if (sortedKeys(sourceIndex).length !== sources.length) {
      fail('duplicate_identifier', 'sources', 'source IDs must be unique');
    }
  }

  function instagramStatusGroup(status) {
    if (status === 'confirmed') return 'confirmed';
    if (status === 'tentative' || status === 'pending_verification') return 'pending';
    if (status === 'missing') return 'missing';
    if (status === 'retired') return 'retired';
    fail('invalid_instagram_status', 'instagram.status', 'unknown status ' + String(status));
  }

  function selectUnambiguousConfirmedInstagram(profiles) {
    requireArray(profiles, 'instagramProfiles');
    var confirmed = profiles.filter(function (profile) {
      return profile && profile.status === 'confirmed' && profile.viaSourceObservation === true && profile.shared !== true;
    });
    return confirmed.length === 1 ? confirmed[0] : null;
  }

  function validateInstagramProfiles(profiles, profileIndex, entityIndex, sourceIndex) {
    var handles = Object.create(null);
    profiles.forEach(function (profile, index) {
      var path = 'instagramProfiles[' + index + ']';
      requireString(profile.handle, path + '.handle');
      if (!/^[a-z0-9._]+$/.test(profile.handle)) {
        fail('invalid_instagram_handle', path + '.handle', 'expected a normalized Instagram handle');
      }
      if (handles[profile.handle]) {
        fail('duplicate_instagram_handle', path + '.handle', 'duplicate handle ' + profile.handle);
      }
      handles[profile.handle] = true;
      requireHttpsUrl(profile.profileUrl, path + '.profileUrl');
      if (profile.profileUrl !== 'https://www.instagram.com/' + profile.handle + '/') {
        fail('invalid_instagram_url', path + '.profileUrl', 'must be the canonical URL for handle');
      }
      requireBoolean(profile.enabled, path + '.enabled');
      if (profile.enabled) fail('shadow_profile_enabled', path + '.enabled', 'shadow profiles must be disabled');
      if (INSTAGRAM_STATUSES.indexOf(profile.status) === -1) {
        fail('invalid_instagram_status', path + '.status', 'unknown status ' + String(profile.status));
      }
      requireUniqueStrings(profile.entityIds, ENTITY_ID_PATTERN, path + '.entityIds', entityIndex);
      requireUniqueTextStrings(profile.aliases, path + '.aliases');
      profile.aliases.forEach(function (alias, aliasIndex) {
        if (!/^[a-z0-9._]+$/.test(alias)) {
          fail('invalid_instagram_handle', path + '.aliases[' + aliasIndex + ']', 'expected a normalized Instagram handle');
        }
      });
      requireBoolean(profile.shared, path + '.shared');
      if (profile.shared !== (profile.entityIds.length > 1)) {
        fail('invalid_shared_profile', path + '.shared', 'must match whether more than one entity is referenced');
      }
      requireUniqueTextStrings(profile.executionModes, path + '.executionModes');
      requireObject(profile.audit, path + '.audit');
      requireArray(profile.observations, path + '.observations').forEach(function (observation, observationIndex) {
        var observationPath = path + '.observations[' + observationIndex + ']';
        requireObject(observation, observationPath);
        requireString(observation.inventory, observationPath + '.inventory');
        requireString(observation.handle, observationPath + '.handle');
        if (!/^[a-z0-9._]+$/.test(observation.handle)) {
          fail('invalid_instagram_handle', observationPath + '.handle', 'expected a normalized Instagram handle');
        }
        if (observation.sourceId !== null && observation.sourceId !== undefined) {
          requirePattern(observation.sourceId, SOURCE_ID_PATTERN, observationPath + '.sourceId', 'a source ID');
          if (!sourceIndex[observation.sourceId]) {
            fail('unknown_reference', observationPath + '.sourceId', 'unknown source ' + observation.sourceId);
          }
        }
      });
    });
    if (sortedKeys(profileIndex).length !== profiles.length) {
      fail('duplicate_identifier', 'instagramProfiles', 'profile IDs must be unique');
    }
  }

  function profileSourceIds(profile, sources) {
    var direct = Object.create(null);
    profile.observations.forEach(function (observation) {
      if (observation.sourceId) direct[observation.sourceId] = true;
    });
    sources.forEach(function (source) {
      var sharesEntity = source.entityIds.some(function (entityId) {
        return profile.entityIds.indexOf(entityId) !== -1;
      });
      if (sharesEntity) direct[source.id] = true;
    });
    return sortedKeys(direct);
  }

  function validateNestedInstagramAssociations(sources, profiles, profileIndex) {
    var expectedBySource = Object.create(null);
    sources.forEach(function (source) { expectedBySource[source.id] = []; });
    profiles.forEach(function (profile) {
      profileSourceIds(profile, sources).forEach(function (sourceId) {
        expectedBySource[sourceId].push(profile.id);
      });
    });

    sources.forEach(function (source, sourceIndex) {
      var path = 'sources[' + sourceIndex + '].instagramProfiles';
      var nestedIds = [];
      var seen = Object.create(null);
      source.instagramProfiles.forEach(function (profile, profilePosition) {
        var nestedPath = path + '[' + profilePosition + ']';
        requireObject(profile, nestedPath);
        var id = requirePattern(profile.id, INSTAGRAM_ID_PATTERN, nestedPath + '.id', 'an Instagram profile ID');
        if (!profileIndex[id]) fail('unknown_reference', nestedPath + '.id', 'unknown profile ' + id);
        if (seen[id]) fail('duplicate_identifier', nestedPath + '.id', 'duplicate nested profile ' + id);
        requireBoolean(profile.enabled, nestedPath + '.enabled');
        if (profile.enabled) fail('shadow_profile_enabled', nestedPath + '.enabled', 'shadow profiles must be disabled');
        var canonicalProfile = profileIndex[id];
        requireUniqueTextStrings(profile.aliases, nestedPath + '.aliases');
        requireUniqueStrings(profile.entityIds, ENTITY_ID_PATTERN, nestedPath + '.entityIds');
        requireBoolean(profile.shared, nestedPath + '.shared');
        requireBoolean(profile.viaSourceObservation, nestedPath + '.viaSourceObservation');
        requireUniqueStrings(profile.viaEntityIds, ENTITY_ID_PATTERN, nestedPath + '.viaEntityIds');
        var expectedDirect = canonicalProfile.observations.some(function (observation) {
          return observation.sourceId === source.id;
        });
        var expectedViaEntityIds = source.entityIds.filter(function (entityId) {
          return canonicalProfile.entityIds.indexOf(entityId) !== -1;
        });
        if (
          profile.handle !== canonicalProfile.handle || profile.profileUrl !== canonicalProfile.profileUrl ||
          profile.status !== canonicalProfile.status || profile.shared !== canonicalProfile.shared ||
          profile.viaSourceObservation !== expectedDirect ||
          !sameStringSet(profile.aliases, canonicalProfile.aliases) ||
          !sameStringSet(profile.entityIds, canonicalProfile.entityIds) ||
          !sameStringSet(profile.viaEntityIds, expectedViaEntityIds)
        ) {
          fail('association_mismatch', nestedPath, 'embedded profile differs from the canonical profile');
        }
        seen[id] = true;
        nestedIds.push(id);
      });
      if (!sameStringSet(nestedIds, expectedBySource[source.id])) {
        fail('association_mismatch', path, 'nested profiles are incomplete or inconsistent');
      }
    });
  }

  function validateClassificationEntry(entry, path, entityIndex, sourceIndex, rowKeys) {
    requireObject(entry, path);
    requireString(entry.unitId, path + '.unitId');
    requireNullableString(entry.unitId, path + '.unitId', 500);
    requireString(entry.matchType, path + '.matchType');
    if (META_MATCH_TYPES.indexOf(entry.matchType) === -1) {
      fail('invalid_match_type', path + '.matchType', 'unknown metadata match type');
    }
    requirePattern(entry.rowKey, SHA256_PATTERN, path + '.rowKey', 'a lowercase SHA-256');
    if (rowKeys[entry.rowKey]) fail('duplicate_row_key', path + '.rowKey', 'rowKey occurs in more than one bucket');
    rowKeys[entry.rowKey] = true;
    requireUniqueStrings(entry.sourceIds, SOURCE_ID_PATTERN, path + '.sourceIds', sourceIndex);
    requireUniqueStrings(entry.entityIds, ENTITY_ID_PATTERN, path + '.entityIds', entityIndex);
    requireObject(entry.row, path + '.row');
    if (entry.row.unit_id !== entry.unitId) {
      fail('classification_mismatch', path + '.row.unit_id', 'must equal unitId');
    }
    requireNullableTier(entry.row.tier, path + '.row.tier');
    requireNullableText(entry.row.note, path + '.row.note', 500);
    requireString(entry.row.updated_at, path + '.row.updated_at');
    requireNullableString(entry.row.updated_at, path + '.row.updated_at', 128);
    requireNullableRevision(entry.row.revision, path + '.row.revision');
    if (entry.row.revision === null) {
      fail('invalid_revision', path + '.row.revision', 'metadata rows require a positive CAS revision');
    }
  }

  function requireCount(value, expected, path) {
    if (!Number.isSafeInteger(value) || value < 0 || value !== expected) {
      fail('classification_count_mismatch', path, 'expected ' + expected);
    }
  }

  function validateMetaClassification(classification, entityIndex, sourceIndex) {
    requireObject(classification, 'metaClassification');
    var unambiguous = requireArray(classification.unambiguous, 'metaClassification.unambiguous');
    var ambiguous = requireArray(classification.ambiguous, 'metaClassification.ambiguous');
    var orphan = requireArray(classification.orphan, 'metaClassification.orphan');
    var collisions = requireArray(classification.collisions, 'metaClassification.collisions');
    var rowKeys = Object.create(null);

    [unambiguous, ambiguous, orphan].forEach(function (bucket, bucketIndex) {
      var bucketName = ['unambiguous', 'ambiguous', 'orphan'][bucketIndex];
      bucket.forEach(function (entry, index) {
        validateClassificationEntry(
          entry,
          'metaClassification.' + bucketName + '[' + index + ']',
          entityIndex,
          sourceIndex,
          rowKeys
        );
        if (bucketName === 'unambiguous') {
          requirePattern(
            entry.sourceId,
            SOURCE_ID_PATTERN,
            'metaClassification.unambiguous[' + index + '].sourceId',
            'a source ID'
          );
          if (!sourceIndex[entry.sourceId] || entry.sourceIds.indexOf(entry.sourceId) === -1) {
            fail('unknown_reference', 'metaClassification.unambiguous[' + index + '].sourceId', 'unknown or inconsistent source');
          }
          if (entry.sourceIds.length !== 1) {
            fail('classification_mismatch', 'metaClassification.unambiguous[' + index + '].sourceIds', 'must contain exactly sourceId');
          }
        } else if (bucketName === 'ambiguous' && entry.sourceIds.length < 1) {
          fail('classification_mismatch', 'metaClassification.ambiguous[' + index + '].sourceIds', 'must contain at least one candidate');
        } else if (bucketName === 'orphan' && entry.sourceIds.length !== 0) {
          fail('classification_mismatch', 'metaClassification.orphan[' + index + '].sourceIds', 'must not contain source candidates');
        }
      });
    });

    var collisionSources = Object.create(null);
    collisions.forEach(function (collision, index) {
      var path = 'metaClassification.collisions[' + index + ']';
      requireObject(collision, path);
      requirePattern(collision.sourceId, SOURCE_ID_PATTERN, path + '.sourceId', 'a source ID');
      if (!sourceIndex[collision.sourceId]) fail('unknown_reference', path + '.sourceId', 'unknown source');
      if (collisionSources[collision.sourceId]) fail('duplicate_identifier', path + '.sourceId', 'duplicate collision source');
      collisionSources[collision.sourceId] = true;
      var unitIds = requireUniqueTextStrings(collision.unitIds, path + '.unitIds');
      var collisionRowKeys = requireArray(collision.rowKeys, path + '.rowKeys');
      if (unitIds.length < 2 || unitIds.length !== collisionRowKeys.length) {
        fail('invalid_collision', path, 'expected aligned unitIds and rowKeys for at least two rows');
      }
      unitIds.forEach(function (unitId, itemIndex) { requireString(unitId, path + '.unitIds[' + itemIndex + ']'); });
      var seenCollisionRowKeys = Object.create(null);
      collisionRowKeys.forEach(function (rowKey, itemIndex) {
        requirePattern(rowKey, SHA256_PATTERN, path + '.rowKeys[' + itemIndex + ']', 'a lowercase SHA-256');
        if (seenCollisionRowKeys[rowKey]) {
          fail('duplicate_row_key', path + '.rowKeys[' + itemIndex + ']', 'collision rowKey is duplicated');
        }
        seenCollisionRowKeys[rowKey] = true;
        if (!rowKeys[rowKey]) fail('invalid_collision', path + '.rowKeys[' + itemIndex + ']', 'does not identify a classified row');
      });
    });

    var counts = requireObject(classification.counts, 'metaClassification.counts');
    requireCount(counts.rows, unambiguous.length + ambiguous.length + orphan.length, 'metaClassification.counts.rows');
    requireCount(counts.unambiguous, unambiguous.length, 'metaClassification.counts.unambiguous');
    requireCount(counts.ambiguous, ambiguous.length, 'metaClassification.counts.ambiguous');
    requireCount(counts.orphan, orphan.length, 'metaClassification.counts.orphan');
    requireCount(counts.collisions, collisions.length, 'metaClassification.counts.collisions');
  }

  function validateResolvedOverrides(sources, classification) {
    var mappedBySource = Object.create(null);
    classification.unambiguous.forEach(function (entry) {
      if (!mappedBySource[entry.sourceId]) mappedBySource[entry.sourceId] = [];
      mappedBySource[entry.sourceId].push(entry);
    });
    var collisionBySource = Object.create(null);
    classification.collisions.forEach(function (collision, collisionIndex) {
      collisionBySource[collision.sourceId] = collision;
      var mapped = mappedBySource[collision.sourceId] || [];
      if (mapped.length < 2) {
        fail('invalid_collision', 'metaClassification.collisions[' + collisionIndex + ']', 'source has fewer than two unambiguous rows');
      }
      var evidenceByRowKey = Object.create(null);
      mapped.forEach(function (entry) { evidenceByRowKey[entry.rowKey] = entry; });
      collision.rowKeys.forEach(function (rowKey, pairIndex) {
        var entry = evidenceByRowKey[rowKey];
        if (!entry || entry.unitId !== collision.unitIds[pairIndex]) {
          fail('invalid_collision', 'metaClassification.collisions[' + collisionIndex + ']', 'unitIds and rowKeys must identify rows for the collision source');
        }
      });
      if (collision.rowKeys.length !== mapped.length) {
        fail('invalid_collision', 'metaClassification.collisions[' + collisionIndex + ']', 'must include every unambiguous row for the source');
      }
    });

    sources.forEach(function (source, sourceIndex) {
      var path = 'sources[' + sourceIndex + ']';
      var mapped = mappedBySource[source.id] || [];
      var stable = mapped.filter(function (entry) { return entry.matchType === 'stable_source_id'; });
      var listedCollision = Boolean(collisionBySource[source.id]);
      var ambiguousCandidate = classification.ambiguous.some(function (entry) {
        return entry.sourceIds.indexOf(source.id) !== -1;
      });
      if ((mapped.length > 1) !== listedCollision) {
        fail('invalid_collision', 'metaClassification.collisions', 'collision coverage does not match unambiguous rows for ' + source.id);
      }
      if (source.collision !== listedCollision) {
        fail('override_projection_mismatch', path + '.collision', 'does not match metaClassification collision evidence');
      }

      var expectedOrigin = 'base';
      var selected = null;
      if (stable.length === 1) {
        expectedOrigin = 'stable';
        selected = stable[0];
      } else if (stable.length > 1) {
        expectedOrigin = 'collision';
      } else if (mapped.length === 1 && !listedCollision) {
        expectedOrigin = 'legacy_inherited';
        selected = mapped[0];
      } else if (listedCollision || mapped.length > 1) {
        expectedOrigin = 'collision';
      } else if (ambiguousCandidate) {
        expectedOrigin = 'ambiguous';
      }
      if (source.overrideOrigin !== expectedOrigin) {
        fail('override_projection_mismatch', path + '.overrideOrigin', 'does not match metaClassification');
      }
      if (selected) {
        var row = selected.row;
        if (
          source.overrideUnitId !== selected.unitId || source.overrideTier !== row.tier ||
          source.note !== row.note || source.updatedAt !== row.updated_at ||
          source.overrideRevision !== row.revision
        ) {
          fail('override_projection_mismatch', path, 'selected metadata row does not match the projected override');
        }
      }
    });
  }

  function validateProjection(payload, responseMeta) {
    requireObject(payload, 'payload');
    requireString(payload.registryVersion, 'registryVersion');
    requirePattern(payload.registrySha256, SHA256_PATTERN, 'registrySha256', 'a lowercase SHA-256');
    var activation = requireObject(payload.activation, 'activation');
    var registryOrigin = readHeader(responseMeta, 'X-Cadu-Registry-Origin') || 'cadu-api';
    if (registryOrigin !== 'cadu-api' && registryOrigin !== 'kino-campus-mirror') {
      fail('invalid_registry_origin', 'headers.x-cadu-registry-origin', 'unknown registry origin');
    }
    requireArray(activation.runtimeConsumers, 'activation.runtimeConsumers');
    if (registryOrigin === 'kino-campus-mirror') {
      if (activation.state !== 'candidate' || activation.runtimeConsumers.length !== 0) {
        fail('invalid_mirror_activation', 'activation', 'the local mirror must be a non-runtime candidate');
      }
      var administrativeMetadata = requireObject(
        payload.administrativeMetadata,
        'administrativeMetadata'
      );
      if (administrativeMetadata.available !== false ||
          administrativeMetadata.state !== 'unavailable' ||
          administrativeMetadata.reason !== 'mirror_excludes_runtime_overrides') {
        fail(
          'invalid_mirror_administrative_metadata',
          'administrativeMetadata',
          'the local mirror must declare runtime overrides unavailable'
        );
      }
      requireString(payload.auditCutoff, 'auditCutoff');
    } else {
      if (activation.state !== 'shadow') {
        fail('registry_not_shadow', 'activation.state', 'expected shadow');
      }
      if (!sameStringSet(activation.runtimeConsumers, ['cadu-api'])) {
        fail('unexpected_runtime_consumer', 'activation.runtimeConsumers', 'expected only cadu-api');
      }
    }

    var entities = requireArray(payload.entities, 'entities');
    var sources = requireArray(payload.sources, 'sources');
    var profiles = requireArray(payload.instagramProfiles, 'instagramProfiles');
    var entityIndex = indexCanonicalItems(entities, ENTITY_ID_PATTERN, 'entities');
    var sourceIndex = indexCanonicalItems(sources, SOURCE_ID_PATTERN, 'sources');
    var profileIndex = indexCanonicalItems(profiles, INSTAGRAM_ID_PATTERN, 'instagramProfiles');

    validateEntityReferences(entities, entityIndex);
    validateSources(sources, sourceIndex, entityIndex, payload.registrySha256);
    validateInstagramProfiles(profiles, profileIndex, entityIndex, sourceIndex);
    validateNestedInstagramAssociations(sources, profiles, profileIndex);
    validateMetaClassification(payload.metaClassification, entityIndex, sourceIndex);
    validateResolvedOverrides(sources, payload.metaClassification);
    requireResponseHeaders(responseMeta, payload.registrySha256);
    return cloneJson(payload);
  }

  function buildDeferred(classification) {
    var deferred = [];
    var entriesByRowKey = Object.create(null);
    classification.unambiguous.concat(classification.ambiguous, classification.orphan).forEach(function (entry) {
      entriesByRowKey[entry.rowKey] = entry;
    });
    function normalizedEntry(entry, kind) {
      return Object.assign({
        deferredKind: kind,
        unitIds: entry.unitIds || (entry.unitId ? [entry.unitId] : []),
        sourceIds: entry.sourceIds || (entry.sourceId ? [entry.sourceId] : []),
        entityIds: entry.entityIds || [],
        rowKeys: entry.rowKeys || (entry.rowKey ? [entry.rowKey] : []),
        matchTypes: entry.matchTypes || (entry.matchType ? [entry.matchType] : []),
        rows: entry.rows || (entry.row ? [entry.row] : [])
      }, cloneJson(entry));
    }
    classification.ambiguous.forEach(function (entry) {
      deferred.push(normalizedEntry(entry, 'ambiguous'));
    });
    classification.orphan.forEach(function (entry) {
      deferred.push(normalizedEntry(entry, 'orphan'));
    });
    classification.collisions.forEach(function (entry) {
      var evidence = entry.rowKeys.map(function (rowKey) { return entriesByRowKey[rowKey]; }).filter(Boolean);
      deferred.push(normalizedEntry(Object.assign({}, entry, {
        sourceIds: [entry.sourceId],
        entityIds: evidence.reduce(function (ids, item) { return ids.concat(item.entityIds || []); }, []).filter(function (id, index, values) { return values.indexOf(id) === index; }),
        matchTypes: evidence.map(function (item) { return item.matchType; }),
        rows: evidence.map(function (item) { return cloneJson(item.row); })
      }), 'collision'));
    });
    return deferred.sort(function (left, right) {
      var a = left.deferredKind + ':' + (left.unitId || left.sourceId || '');
      var b = right.deferredKind + ':' + (right.unitId || right.sourceId || '');
      return a.localeCompare(b);
    });
  }

  function buildCatalog(payload, responseMeta) {
    var projection = validateProjection(payload, responseMeta);
    var registryOrigin = readHeader(responseMeta, 'X-Cadu-Registry-Origin') || 'cadu-api';
    var administrativeMetadataAvailable = registryOrigin !== 'kino-campus-mirror';
    var entityIndex = Object.create(null);
    var sourceIndex = Object.create(null);
    var profileIndex = Object.create(null);

    projection.entities.forEach(function (entity) { entityIndex[entity.id] = entity; });
    projection.sources.forEach(function (source) { sourceIndex[source.id] = source; });
    projection.instagramProfiles.forEach(function (profile) { profileIndex[profile.id] = profile; });

    function entityReference(entity) {
      return {
        id: entity.id,
        name: entity.name,
        acronym: entity.acronym,
        kind: entity.kind,
        status: entity.status
      };
    }

    function sourceReference(source) {
      return {
        id: source.id,
        canonicalUrl: source.canonicalUrl,
        effectiveTier: administrativeMetadataAvailable ? source.effectiveTier : null,
        reviewState: source.reviewState,
        enabled: source.enabled,
        etag: source.etag
      };
    }

    function profileReference(profile) {
      return {
        id: profile.id,
        handle: profile.handle,
        profileUrl: profile.profileUrl,
        status: profile.status,
        statusGroup: instagramStatusGroup(profile.status),
        enabled: profile.enabled,
        shared: profile.shared,
        viaSourceObservation: profile.viaSourceObservation === true,
        viaEntityIds: cloneJson(profile.viaEntityIds || [])
      };
    }

    var profiles = projection.instagramProfiles.map(function (profile) {
      var sourceIds = profileSourceIds(profile, projection.sources);
      return Object.assign({}, profile, {
        statusGroup: instagramStatusGroup(profile.status),
        entities: profile.entityIds.map(function (entityId) { return entityReference(entityIndex[entityId]); }),
        sourceIds: sourceIds,
        sources: sourceIds.map(function (sourceId) { return sourceReference(sourceIndex[sourceId]); })
      });
    });
    profiles.forEach(function (profile) { profileIndex[profile.id] = profile; });

    var sources = projection.sources.map(function (source) {
      var profileIds = source.instagramProfiles.map(function (profile) { return profile.id; });
      return Object.assign({}, source, {
        administrativeMetadataAvailable: administrativeMetadataAvailable,
        effectiveTier: administrativeMetadataAvailable ? source.effectiveTier : null,
        overrideTier: administrativeMetadataAvailable ? source.overrideTier : null,
        overrideOrigin: administrativeMetadataAvailable ? source.overrideOrigin : 'metadata_unavailable',
        overrideUnitId: administrativeMetadataAvailable ? source.overrideUnitId : null,
        note: administrativeMetadataAvailable ? source.note : null,
        entities: source.entityIds.map(function (entityId) { return entityReference(entityIndex[entityId]); }),
        instagramProfileIds: profileIds,
        instagramProfiles: source.instagramProfiles.map(function (profile) { return profileReference(profile); })
      });
    });
    sources.forEach(function (source) { sourceIndex[source.id] = source; });

    var entities = projection.entities.map(function (entity) {
      var sourceIds = sources.filter(function (source) {
        return source.entityIds.indexOf(entity.id) !== -1;
      }).map(function (source) { return source.id; });
      var profileIds = profiles.filter(function (profile) {
        return profile.entityIds.indexOf(entity.id) !== -1;
      }).map(function (profile) { return profile.id; });
      return Object.assign({}, entity, {
        sourceIds: sourceIds,
        sources: sourceIds.map(function (sourceId) { return sourceReference(sourceIndex[sourceId]); }),
        instagramProfileIds: profileIds,
        instagramProfiles: profileIds.map(function (profileId) { return profileReference(profileIndex[profileId]); })
      });
    });

    var catalog = {
      registryVersion: projection.registryVersion,
      registrySha256: projection.registrySha256,
      registryOrigin: registryOrigin,
      auditCutoff: projection.auditCutoff || null,
      administrativeMetadata: administrativeMetadataAvailable
        ? { available: true, state: 'available', reason: null }
        : cloneJson(projection.administrativeMetadata),
      administrativeMetadataAvailable: administrativeMetadataAvailable,
      activation: cloneJson(projection.activation),
      responseEtag: readHeader(responseMeta, 'ETag'),
      sources: sources,
      entities: entities,
      instagram: profiles,
      deferred: buildDeferred(projection.metaClassification),
      metaClassification: cloneJson(projection.metaClassification)
    };
    catalog.summary = summarizeCatalog(catalog);
    return catalog;
  }

  function summarizeCatalog(catalog) {
    requireObject(catalog, 'catalog');
    var sources = requireArray(catalog.sources, 'catalog.sources');
    var entities = requireArray(catalog.entities, 'catalog.entities');
    var profiles = requireArray(catalog.instagram, 'catalog.instagram');
    var deferred = requireArray(catalog.deferred, 'catalog.deferred');
    return {
      sources: sources.length,
      entities: entities.length,
      instagramProfiles: profiles.length,
      instagramConfirmed: profiles.filter(function (profile) { return profile.status === 'confirmed'; }).length,
      instagramPending: profiles.filter(function (profile) { return profile.statusGroup === 'pending'; }).length,
      instagramMissing: profiles.filter(function (profile) { return profile.statusGroup === 'missing'; }).length,
      instagramRetired: profiles.filter(function (profile) { return profile.statusGroup === 'retired'; }).length,
      entitiesWithoutWebSource: entities.filter(function (entity) { return entity.sourceIds.length === 0; }).length,
      instagramWithoutWebSource: profiles.filter(function (profile) { return profile.sourceIds.length === 0; }).length,
      deferred: deferred.length,
      ambiguous: deferred.filter(function (item) { return item.deferredKind === 'ambiguous'; }).length,
      orphan: deferred.filter(function (item) { return item.deferredKind === 'orphan'; }).length,
      collisions: deferred.filter(function (item) { return item.deferredKind === 'collision'; }).length
    };
  }

  function normalizeSearch(value, maxLength) {
    var normalized = String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    return Number.isSafeInteger(maxLength) && maxLength > 0
      ? normalized.slice(0, maxLength)
      : normalized;
  }

  function searchableValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(searchableValue).join(' ');
    if (typeof value === 'object') {
      return Object.keys(value).map(function (key) {
        if (key === 'audit' || key === 'observations') return '';
        return searchableValue(value[key]);
      }).join(' ');
    }
    return String(value);
  }

  function itemMatchesFilters(item, view, filters) {
    var query = normalizeSearch(filters.query, 200);
    if (query && normalizeSearch(searchableValue(item), 20000).indexOf(query) === -1) return false;
    if (filters.tier !== undefined && filters.tier !== null && filters.tier !== '') {
      var expectedTier = Number(filters.tier);
      if (![1, 2, 3].includes(expectedTier)) return false;
      if (view !== 'sources' || item.effectiveTier !== expectedTier) return false;
    }
    if (filters.status) {
      var status = String(filters.status);
      if (view === 'instagram') {
        if (item.status !== status && item.statusGroup !== status) return false;
      } else if (view === 'deferred') {
        if (item.deferredKind !== status) return false;
      } else if (item.status !== status && item.reviewState !== status) {
        return false;
      }
    }
    if (filters.kind && String(item.kind || item.sourceKind || '') !== String(filters.kind)) return false;
    return true;
  }

  function filterCatalog(catalog, filters) {
    requireObject(catalog, 'catalog');
    var options = filters == null ? {} : requireObject(filters, 'filters');
    var view = options.view || 'sources';
    if (VIEWS.indexOf(view) === -1) fail('invalid_view', 'filters.view', 'unknown view ' + String(view));
    var items = requireArray(catalog[view], 'catalog.' + view);
    return items.filter(function (item) {
      return itemMatchesFilters(item, view, options);
    });
  }

  function validateTier(tier, path) {
    if (tier === null) return null;
    if (!Number.isInteger(tier) || tier < 1 || tier > 3) {
      fail('invalid_override_tier', path, 'expected 1, 2, 3 or null');
    }
    return tier;
  }

  function validateNote(note, path) {
    if (note === null) return null;
    if (
      typeof note !== 'string' ||
      note.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
    ) {
      fail('invalid_override_note', path, 'expected at most 500 characters without control characters, or null');
    }
    return note;
  }

  function hasStableOverride(source) {
    return source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
  }

  function buildFirstStableOverridePayload(source, changes) {
    requireObject(source, 'source');
    requirePattern(source.id, SOURCE_ID_PATTERN, 'source.id', 'a source ID');
    requireObject(changes, 'changes');
    if (hasStableOverride(source)) {
      fail('stable_override_exists', 'source.overrideOrigin', 'source already has a stable override');
    }
    if (!hasOwn(changes, 'tier') || !hasOwn(changes, 'note')) {
      fail(
        'explicit_first_override_required',
        'changes',
        'the first stable override requires explicit tier and note'
      );
    }
    return {
      tier: validateTier(changes.tier, 'changes.tier'),
      note: validateNote(changes.note, 'changes.note')
    };
  }

  function buildOverrideMutation(source, changes) {
    requireObject(source, 'source');
    var sourceId = requirePattern(source.id, SOURCE_ID_PATTERN, 'source.id', 'a source ID');
    if (!STRONG_ETAG_PATTERN.test(source.etag || '')) {
      fail('invalid_source_etag', 'source.etag', 'expected a strong source ETag');
    }
    requireObject(changes, 'changes');
    var firstStable = !hasStableOverride(source);
    var body;
    if (firstStable) {
      body = buildFirstStableOverridePayload(source, changes);
    } else {
      if (!hasOwn(changes, 'tier') && !hasOwn(changes, 'note')) {
        fail('empty_override', 'changes', 'tier or note must be supplied');
      }
      body = {};
      if (hasOwn(changes, 'tier')) body.tier = validateTier(changes.tier, 'changes.tier');
      if (hasOwn(changes, 'note')) body.note = validateNote(changes.note, 'changes.note');
    }
    return {
      sourceId: sourceId,
      path: 'source-registry/' + encodeURIComponent(sourceId) + '/override',
      method: 'PATCH',
      ifMatch: source.etag,
      headers: {
        'Content-Type': 'application/json',
        'If-Match': source.etag
      },
      body: body,
      isFirstStable: firstStable
    };
  }

  return Object.freeze({
    SourceRegistryContractError: SourceRegistryContractError,
    VIEWS: VIEWS,
    validateProjection: validateProjection,
    buildCatalog: buildCatalog,
    summarizeCatalog: summarizeCatalog,
    filterCatalog: filterCatalog,
    validateRegistryReadiness: validateRegistryReadiness,
    instagramStatusGroup: instagramStatusGroup,
    selectUnambiguousConfirmedInstagram: selectUnambiguousConfirmedInstagram,
    buildFirstStableOverridePayload: buildFirstStableOverridePayload,
    buildOverrideMutation: buildOverrideMutation
  });
});
