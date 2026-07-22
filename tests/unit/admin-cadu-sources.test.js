const {
  SourceRegistryContractError,
  validateProjection,
  buildCatalog,
  filterCatalog,
  validateRegistryReadiness,
  instagramStatusGroup,
  selectUnambiguousConfirmedInstagram,
  buildFirstStableOverridePayload,
  buildOverrideMutation
} = require('../../assets/js/controllers/admin/admin-cadu-sources');

const HASH = 'a'.repeat(64);
const LIST_ETAG = `"${'9'.repeat(64)}"`;
const READINESS_CHECKS = {
  metadataTable: true,
  revisionColumn: true,
  revisionConstraint: true,
  touchTrigger: true,
  stableRpc: true,
  legacyRpc: true,
  browserWritesRevoked: true,
  legacyReadsPreserved: true,
  serviceRolePhaseA: true
};
const REVIEW_READINESS_CHECKS = {
  reviewTable: true,
  reviewConstraints: true,
  reviewIndexes: true,
  reviewRlsPolicy: true,
  reviewTableAcl: true,
  reviewGuardTrigger: true,
  reviewCreateRpc: true,
  reviewResolveRpc: true,
  reviewDependencies: true
};

function rowEntry(unitId, rowKey, sourceIds, entityIds = [], tier = 2) {
  const entry = {
    unitId,
    rowKey,
    matchType: sourceIds.length > 1 ? 'admin_observation' : 'stable_source_id',
    sourceIds,
    entityIds,
    row: { unit_id: unitId, tier, note: null, revision: 1, updated_at: '2026-07-13T12:00:00Z' }
  };
  if (sourceIds.length === 1) entry.sourceId = sourceIds[0];
  return entry;
}

function portalRow(unitId, tier) {
  return {
    unit_id: unitId,
    tier,
    note: null,
    revision: 1,
    updated_at: '2026-07-13T12:00:00Z'
  };
}

const FIXTURE_ENTITIES = [
  { id: 'ufg.portal', name: 'Universidade Federal de Goiás', acronym: 'UFG', parentId: null, kind: 'university', campus: 'Goiânia', status: 'active', observedIn: [], legacyIds: [] },
  { id: 'ufg.fac', name: 'Faculdade de Artes Cênicas', acronym: 'FAC', parentId: 'ufg.portal', kind: 'academic_unit', campus: 'Goiânia', status: 'active', observedIn: [], legacyIds: [] },
  { id: 'ufg.ceagrif', name: 'CEAGRIF', acronym: 'CEAGRIF', parentId: 'ufg.portal', kind: 'administrative_body', campus: 'Goiânia', status: 'active', observedIn: [], legacyIds: ['CEAGRIF'] }
];

function embeddedEntity(entityId) {
  const entity = FIXTURE_ENTITIES.find((item) => item.id === entityId);
  return {
    id: entity.id,
    name: entity.name,
    acronym: entity.acronym,
    kind: entity.kind,
    status: entity.status
  };
}

function source(id, entityId, revisionCharacter, nestedProfiles, tier) {
  const revision = revisionCharacter.repeat(64);
  return {
    id,
    registrySha256: HASH,
    entityIds: [entityId],
    entities: [embeddedEntity(entityId)],
    canonicalUrl: `https://${id.slice(4)}.ufg.br/`,
    role: 'official_publisher',
    sourceKind: 'institutional_site',
    enabled: false,
    baseTier: tier,
    overrideTier: null,
    effectiveTier: tier,
    overrideOrigin: 'base',
    isInheritedLegacy: false,
    overrideUnitId: null,
    collision: false,
    note: null,
    updatedAt: null,
    overrideRevision: null,
    revision,
    etag: `"${revision}"`,
    instagramProfiles: nestedProfiles.map((item) => ({
      id: item.id,
      handle: item.handle,
      profileUrl: item.profileUrl,
      aliases: item.aliases,
      status: item.status,
      enabled: item.enabled,
      shared: item.shared,
      entityIds: item.entityIds,
      viaSourceObservation: item.observations.some((observation) => observation.sourceId === id),
      viaEntityIds: item.entityIds.filter((profileEntityId) => profileEntityId === entityId)
    })),
    executionModes: [],
    reviewState: 'reviewed',
    reviewIssues: []
  };
}

function profile(id, handle, status, entityIds, sourceId) {
  return {
    id,
    handle,
    profileUrl: `https://www.instagram.com/${handle}/`,
    aliases: [],
    enabled: false,
    status,
    entityIds,
    shared: entityIds.length > 1,
    executionModes: [],
    audit: {},
    observations: [{ inventory: 'official_ufg_page', handle, sourceId }]
  };
}

function fixture() {
  const portalStable = rowEntry('web.ufg.portal', '1'.repeat(64), ['web.ufg.portal'], [], 1);
  const portalLegacy = rowEntry('UFG', '2'.repeat(64), ['web.ufg.portal']);
  portalLegacy.matchType = 'admin_observation';
  const facStable = rowEntry('web.ufg.fac', '3'.repeat(64), ['web.ufg.fac']);
  const ambiguous = rowEntry(
    'PROAD',
    '4'.repeat(64),
    ['web.ufg.fac', 'web.ufg.portal']
  );
  const orphan = rowEntry('CEAGRIF', '5'.repeat(64), [], ['ufg.ceagrif']);
  orphan.matchType = 'entity_identity';

  const ufgProfile = profile('ig.ufg', 'ufg_oficial', 'confirmed', ['ufg.portal'], 'web.ufg.portal');
  const facProfile = profile('ig.fac', 'facufg', 'pending_verification', ['ufg.fac'], null);
  const looseProfile = profile('ig.loose', 'ufg_sem_site', 'tentative', [], null);
  const portalSource = source('web.ufg.portal', 'ufg.portal', 'b', [ufgProfile], 1);
  Object.assign(portalSource, {
    overrideTier: 1,
    effectiveTier: 1,
    overrideOrigin: 'stable',
    overrideUnitId: 'web.ufg.portal',
    updatedAt: portalStable.row.updated_at,
    overrideRevision: portalStable.row.revision,
    collision: true
  });
  const facSource = source('web.ufg.fac', 'ufg.fac', 'c', [facProfile], 2);
  Object.assign(facSource, {
    overrideTier: 2,
    overrideOrigin: 'stable',
    overrideUnitId: 'web.ufg.fac',
    updatedAt: facStable.row.updated_at,
    overrideRevision: facStable.row.revision
  });

  return {
    registryVersion: '2026-07-13.3',
    registrySha256: HASH,
    activation: { state: 'shadow', runtimeConsumers: ['cadu-api'] },
    entities: clone(FIXTURE_ENTITIES),
    sources: [portalSource, facSource],
    instagramProfiles: [ufgProfile, facProfile, looseProfile],
    metaClassification: {
      unambiguous: [portalStable, portalLegacy, facStable],
      ambiguous: [ambiguous],
      orphan: [orphan],
      collisions: [{
        sourceId: 'web.ufg.portal',
        unitIds: ['web.ufg.portal', 'UFG'],
        rowKeys: [portalStable.rowKey, portalLegacy.rowKey]
      }],
      counts: { rows: 5, unambiguous: 3, ambiguous: 1, orphan: 1, collisions: 1 }
    }
  };
}

function headers(overrides = {}) {
  return {
    'X-Cadu-Registry-Sha256': HASH,
    ETag: LIST_ETAG,
    ...overrides
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectContractError(action, code) {
  try {
    action();
    throw new Error(`expected SourceRegistryContractError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(SourceRegistryContractError);
    expect(error.code).toBe(code);
  }
}

describe('KCAdminCaduSources fail-closed projection', () => {
  test('consolidates every entity, source and Instagram profile without dropping unassociated records', () => {
    const catalog = buildCatalog(fixture(), headers());

    expect(catalog.summary).toEqual({
      sources: 2,
      entities: 3,
      instagramProfiles: 3,
      instagramConfirmed: 1,
      instagramPending: 2,
      instagramMissing: 0,
      instagramRetired: 0,
      entitiesWithoutWebSource: 1,
      instagramWithoutWebSource: 1,
      deferred: 3,
      ambiguous: 1,
      orphan: 1,
      collisions: 1
    });
    expect(catalog.responseEtag).toBe(LIST_ETAG);
    expect(catalog.entities.find((item) => item.id === 'ufg.ceagrif')).toMatchObject({
      sourceIds: [],
      instagramProfileIds: []
    });
    expect(catalog.instagram.find((item) => item.id === 'ig.loose')).toMatchObject({
      sourceIds: [],
      status: 'tentative',
      statusGroup: 'pending'
    });
    expect(catalog.sources.find((item) => item.id === 'web.ufg.fac')).toMatchObject({
      entityIds: ['ufg.fac'],
      instagramProfileIds: ['ig.fac']
    });
    expect(catalog.sources.find((item) => item.id === 'web.ufg.portal').instagramProfiles[0])
      .toMatchObject({ viaSourceObservation: true, viaEntityIds: ['ufg.portal'] });
    expect(catalog.sources.find((item) => item.id === 'web.ufg.fac').instagramProfiles[0])
      .toMatchObject({ viaSourceObservation: false, viaEntityIds: ['ufg.fac'] });
    expect(catalog.deferred.map((item) => item.deferredKind)).toEqual([
      'ambiguous',
      'collision',
      'orphan'
    ]);
    expect(catalog.deferred.find((item) => item.unitId === 'CEAGRIF')).toMatchObject({
      deferredKind: 'orphan',
      entityIds: ['ufg.ceagrif'],
      sourceIds: []
    });
    expect(catalog.deferred.find((item) => item.deferredKind === 'collision')).toMatchObject({
      sourceIds: ['web.ufg.portal'],
      unitIds: ['web.ufg.portal', 'UFG'],
      rowKeys: ['1'.repeat(64), '2'.repeat(64)],
      matchTypes: ['stable_source_id', 'admin_observation']
    });
    expect(catalog.deferred.find((item) => item.deferredKind === 'collision').rows)
      .toEqual([portalRow('web.ufg.portal', 1), portalRow('UFG', 2)]);
  });

  test('computes summary from the payload instead of assuming production cardinalities', () => {
    const input = fixture();
    input.entities.push({
      id: 'ufg.no-source',
      name: 'Entidade sem site',
      acronym: null,
      parentId: 'ufg.portal',
      kind: 'other',
      campus: null,
      status: 'active',
      observedIn: [],
      legacyIds: []
    });

    const catalog = buildCatalog(input, headers());

    expect(catalog.summary.entities).toBe(input.entities.length);
    expect(catalog.summary.sources).toBe(input.sources.length);
    expect(catalog.summary.instagramProfiles).toBe(input.instagramProfiles.length);
    expect(catalog.summary.entitiesWithoutWebSource).toBe(2);
  });

  test('supports literal, view-scoped filters without compiling user input as regex', () => {
    const catalog = buildCatalog(fixture(), headers());

    expect(() => filterCatalog(catalog, { view: 'entities', query: '[' })).not.toThrow();
    expect(filterCatalog(catalog, { view: 'entities', query: 'ceagríf' }).map((item) => item.id))
      .toEqual(['ufg.ceagrif']);
    expect(filterCatalog(catalog, { view: 'sources', tier: 2 }).map((item) => item.id))
      .toEqual(['web.ufg.fac']);
    expect(filterCatalog(catalog, { view: 'sources', query: 'ufg_oficial' }).map((item) => item.id))
      .toEqual(['web.ufg.portal']);
    expect(filterCatalog(catalog, { view: 'instagram', status: 'confirmed' }).map((item) => item.id))
      .toEqual(['ig.ufg']);
    expect(filterCatalog(catalog, { view: 'instagram', status: 'pending' }).map((item) => item.id))
      .toEqual(['ig.fac', 'ig.loose']);
    expect(filterCatalog(catalog, { view: 'deferred', status: 'orphan' }).map((item) => item.unitId))
      .toEqual(['CEAGRIF']);
    expectContractError(() => filterCatalog(catalog, { view: '__proto__' }), 'invalid_view');
  });

  test.each([
    ['confirmed', 'confirmed'],
    ['pending_verification', 'pending'],
    ['tentative', 'pending'],
    ['missing', 'missing'],
    ['retired', 'retired']
  ])('keeps Instagram status %s distinct as %s', (status, expected) => {
    expect(instagramStatusGroup(status)).toBe(expected);
  });

  test('selects an Instagram handle only when exactly one confirmed profile exists', () => {
    const confirmed = { id: 'ig.one', status: 'confirmed', viaSourceObservation: true, shared: false };
    const pending = { id: 'ig.pending', status: 'pending_verification', viaSourceObservation: true, shared: false };
    expect(selectUnambiguousConfirmedInstagram([pending])).toBeNull();
    expect(selectUnambiguousConfirmedInstagram([confirmed, pending])).toBe(confirmed);
    expect(selectUnambiguousConfirmedInstagram([confirmed, { id: 'ig.two', status: 'confirmed', viaSourceObservation: true, shared: false }]))
      .toBeNull();
    expect(selectUnambiguousConfirmedInstagram([
      { id: 'ig.inferred', status: 'confirmed', viaSourceObservation: false, shared: false }
    ])).toBeNull();
    expect(selectUnambiguousConfirmedInstagram([
      { id: 'ig.shared', status: 'confirmed', viaSourceObservation: true, shared: true }
    ])).toBeNull();
  });

  test('enables registry writes only for matching hash/version and a ready CAS contract', () => {
    const input = fixture();
    const catalog = buildCatalog(input, headers());
    const readiness = {
      ready: true,
      contractVersion: 'cadu-unit-meta-cas-v1',
      phase: 'phase-a',
      checks: { ...READINESS_CHECKS },
      reviewContractVersion: 'cadu-institutional-review-v1',
      reviewChecks: { ...REVIEW_READINESS_CHECKS },
      reviewQueueReady: true,
      reviewProxyReady: true,
      edgeCapabilityVersion: 'cadu-publish-capabilities-v1',
      institutionalReviewEnabled: true,
      metadataRowsValidated: 5,
      registryVersion: input.registryVersion,
      registrySha256: HASH
    };
    expect(validateRegistryReadiness(readiness, {
      headers: { 'X-Cadu-Registry-Sha256': HASH }
    }, catalog)).toMatchObject({ ready: true, metadataRowsValidated: 5 });

    expectContractError(() => validateRegistryReadiness(
      { ...readiness, registrySha256: '0'.repeat(64) },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'registry_hash_mismatch');
    expectContractError(() => validateRegistryReadiness(
      { ...readiness, checks: { ...READINESS_CHECKS, stableRpc: false } },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'metadata_contract_not_ready');
    expectContractError(() => validateRegistryReadiness(
      {
        ...readiness,
        checks: Object.fromEntries(Object.entries(READINESS_CHECKS).filter(([name]) => name !== 'stableRpc'))
      },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'metadata_contract_not_ready');
    expectContractError(() => validateRegistryReadiness(
      { ...readiness, checks: { ...READINESS_CHECKS, irrelevant: true } },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'metadata_contract_not_ready');
    expectContractError(() => validateRegistryReadiness(
      { ...readiness, reviewProxyReady: false },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'review_contract_mismatch');
    expectContractError(() => validateRegistryReadiness(
      { ...readiness, reviewChecks: { ...REVIEW_READINESS_CHECKS, reviewResolveRpc: false } },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'review_contract_not_ready');
    expectContractError(() => validateRegistryReadiness(
      { ...readiness, institutionalReviewEnabled: false },
      { headers: { 'X-Cadu-Registry-Sha256': HASH } },
      catalog
    ), 'review_edge_not_ready');
  });

  test('rejects duplicate canonical IDs and duplicate source revisions/ETags', () => {
    const duplicateEntity = fixture();
    duplicateEntity.entities.push(clone(duplicateEntity.entities[0]));
    expectContractError(
      () => validateProjection(duplicateEntity, headers()),
      'duplicate_identifier'
    );

    const duplicateRevision = fixture();
    duplicateRevision.sources[1].revision = duplicateRevision.sources[0].revision;
    duplicateRevision.sources[1].etag = duplicateRevision.sources[0].etag;
    expectContractError(
      () => validateProjection(duplicateRevision, headers()),
      'duplicate_revision'
    );
  });

  test('rejects mismatched or missing registry headers and weak response ETags', () => {
    expectContractError(
      () => validateProjection(fixture(), headers({ 'X-Cadu-Registry-Sha256': '0'.repeat(64) })),
      'registry_hash_mismatch'
    );
    expectContractError(
      () => validateProjection(fixture(), { ETag: LIST_ETAG }),
      'missing_registry_hash_header'
    );
    expectContractError(
      () => validateProjection(fixture(), headers({ ETag: `W/${LIST_ETAG}` })),
      'invalid_response_etag'
    );
  });

  test('accepts a strong canonical CAS header when transport weakens the HTTP ETag', () => {
    const catalog = buildCatalog(fixture(), headers({
      ETag: `W/${LIST_ETAG}`,
      'X-Cadu-Canonical-ETag': LIST_ETAG
    }));
    expect(catalog.registrySha256).toBe(HASH);
    expect(catalog.responseEtag).toBe(LIST_ETAG);

    expectContractError(
      () => validateProjection(fixture(), headers({
        ETag: LIST_ETAG,
        'X-Cadu-Canonical-ETag': `W/${LIST_ETAG}`
      })),
      'invalid_response_etag'
    );
    expectContractError(
      () => validateProjection(fixture(), headers({
        ETag: LIST_ETAG,
        'X-Cadu-Canonical-ETag': ''
      })),
      'invalid_response_etag'
    );
  });

  test('rejects activated registries and any enabled shadow source or profile', () => {
    const active = fixture();
    active.activation.state = 'active';
    expectContractError(() => validateProjection(active, headers()), 'registry_not_shadow');

    const enabledSource = fixture();
    enabledSource.sources[0].enabled = true;
    expectContractError(() => validateProjection(enabledSource, headers()), 'shadow_source_enabled');

    const enabledProfile = fixture();
    enabledProfile.instagramProfiles[0].enabled = true;
    expectContractError(() => validateProjection(enabledProfile, headers()), 'shadow_profile_enabled');
  });

  test('rejects missing and incomplete entity/Instagram associations', () => {
    const unknownEntity = fixture();
    unknownEntity.sources[0].entityIds = ['ufg.unknown'];
    unknownEntity.sources[0].entities = [{ id: 'ufg.unknown' }];
    expectContractError(() => validateProjection(unknownEntity, headers()), 'unknown_reference');

    const unknownInstagramEntity = fixture();
    unknownInstagramEntity.instagramProfiles[0].entityIds = ['ufg.unknown'];
    expectContractError(
      () => validateProjection(unknownInstagramEntity, headers()),
      'unknown_reference'
    );

    const omittedNestedAssociation = fixture();
    omittedNestedAssociation.sources[1].instagramProfiles = [];
    expectContractError(
      () => validateProjection(omittedNestedAssociation, headers()),
      'association_mismatch'
    );
  });

  test('rejects inconsistent deferred classification counts', () => {
    const input = fixture();
    input.metaClassification.counts.orphan = 0;
    expectContractError(
      () => validateProjection(input, headers()),
      'classification_count_mismatch'
    );
  });

  test('rejects malformed classification buckets and duplicate collision evidence', () => {
    const unknownMatch = fixture();
    unknownMatch.metaClassification.orphan[0].matchType = 'fuzzy_guess';
    expectContractError(() => validateProjection(unknownMatch, headers()), 'invalid_match_type');

    const orphanCandidate = fixture();
    orphanCandidate.metaClassification.orphan[0].sourceIds = ['web.ufg.portal'];
    expectContractError(() => validateProjection(orphanCandidate, headers()), 'classification_mismatch');

    const duplicateEvidence = fixture();
    duplicateEvidence.metaClassification.collisions[0].rowKeys[1] =
      duplicateEvidence.metaClassification.collisions[0].rowKeys[0];
    expectContractError(() => validateProjection(duplicateEvidence, headers()), 'duplicate_row_key');
  });

  test('accepts nullable base/effective tiers and stable-wins collision evidence from the real contract', () => {
    const input = fixture();
    input.metaClassification.unambiguous = input.metaClassification.unambiguous
      .filter((entry) => entry.sourceId !== 'web.ufg.fac');
    input.metaClassification.ambiguous = [];
    input.metaClassification.counts.rows -= 2;
    input.metaClassification.counts.unambiguous -= 1;
    input.metaClassification.counts.ambiguous = 0;
    Object.assign(input.sources[1], {
      baseTier: null,
      overrideTier: null,
      effectiveTier: null,
      overrideOrigin: 'base',
      overrideUnitId: null,
      updatedAt: null,
      overrideRevision: null
    });

    expect(() => validateProjection(input, headers())).not.toThrow();
    expect(() => validateProjection(fixture(), headers())).not.toThrow();
  });

  test('rejects renderer-field drift, hierarchy cycles and inconsistent resolved metadata', () => {
    const missingReviewIssues = fixture();
    delete missingReviewIssues.sources[0].reviewIssues;
    expectContractError(() => validateProjection(missingReviewIssues, headers()), 'invalid_array');

    const wrongTier = fixture();
    wrongTier.sources[0].effectiveTier = 3;
    expectContractError(() => validateProjection(wrongTier, headers()), 'effective_tier_mismatch');

    const embeddedDrift = fixture();
    embeddedDrift.sources[0].entities[0].name = 'Outra entidade';
    expectContractError(() => validateProjection(embeddedDrift, headers()), 'association_mismatch');

    const cycle = fixture();
    cycle.entities[0].parentId = 'ufg.fac';
    expectContractError(() => validateProjection(cycle, headers()), 'entity_parent_cycle');

    const resolvedDrift = fixture();
    resolvedDrift.sources[1].overrideRevision = 99;
    expectContractError(() => validateProjection(resolvedDrift, headers()), 'override_projection_mismatch');
  });
});

describe('KCAdminCaduSources stable override helpers', () => {
  test('requires explicit tier and note on first stable write and never inherits a legacy note', () => {
    const legacyInherited = {
      id: 'web.ufg.prograd',
      etag: `"${'d'.repeat(64)}"`,
      overrideOrigin: 'legacy_inherited',
      overrideUnitId: 'PROGRAD',
      effectiveTier: 1,
      note: 'nota legada que não pode ser promovida silenciosamente'
    };

    expectContractError(
      () => buildFirstStableOverridePayload(legacyInherited, { tier: 2 }),
      'explicit_first_override_required'
    );
    expectContractError(
      () => buildOverrideMutation(legacyInherited, { note: 'nova nota' }),
      'explicit_first_override_required'
    );

    expect(buildFirstStableOverridePayload(legacyInherited, { tier: 2, note: null }))
      .toEqual({ tier: 2, note: null });
    expect(buildOverrideMutation(legacyInherited, { tier: 3, note: 'revisada' })).toEqual({
      sourceId: 'web.ufg.prograd',
      path: 'source-registry/web.ufg.prograd/override',
      method: 'PATCH',
      ifMatch: legacyInherited.etag,
      headers: {
        'Content-Type': 'application/json',
        'If-Match': legacyInherited.etag
      },
      body: { tier: 3, note: 'revisada' },
      isFirstStable: true
    });
  });

  test('builds subsequent CAS patches by canonical source.id and current strong ETag', () => {
    const stable = {
      id: 'web.ufg.proad',
      etag: `"${'e'.repeat(64)}"`,
      overrideOrigin: 'stable',
      overrideUnitId: 'web.ufg.proad',
      note: 'atual'
    };

    const mutation = buildOverrideMutation(stable, { note: 'nova' });

    expect(mutation.sourceId).toBe('web.ufg.proad');
    expect(mutation.path).toBe('source-registry/web.ufg.proad/override');
    expect(mutation.ifMatch).toBe(stable.etag);
    expect(mutation.body).toEqual({ note: 'nova' });
    expect(mutation.isFirstStable).toBe(false);

    expectContractError(
      () => buildOverrideMutation({ ...stable, etag: `W/${stable.etag}` }, { note: 'nova' }),
      'invalid_source_etag'
    );
  });
});
