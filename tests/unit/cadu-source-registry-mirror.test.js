'use strict';

const fs = require('fs');
const path = require('path');

const model = require('../../assets/js/controllers/admin/admin-cadu-sources.js');
const { getCaduSourceRegistryMirror } = require('../../server/cadu-source-registry-mirror.js');

const ROOT = path.resolve(__dirname, '../..');

describe('bundled Cadu source-registry mirror', () => {
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
    expect(catalog.summary).toMatchObject({
      sources: 194,
      entities: 166,
      instagramProfiles: 83,
      deferred: 0,
    });
    expect(catalog.sources.every((source) => source.enabled === false)).toBe(true);
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
});
