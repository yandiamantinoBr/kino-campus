const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_SOURCE_PATH,
  loadSources,
  selectSources
} = require('../../services/cadu-ufg-publisher/src/sources');

describe('Cadu source registry', () => {
  test('loads the versioned registry through the same path used by the CLI', () => {
    const sources = loadSources(DEFAULT_SOURCE_PATH);
    const ids = sources.map((source) => source.id);

    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sources.every((source) => /^https:\/\//.test(source.baseUrl))).toBe(true);
    expect(selectSources(sources, 'quick').length).toBeGreaterThan(0);
    expect(selectSources(sources, 'full')).toHaveLength(sources.length);
  });

  test('accepts UTF-8 BOM without hiding malformed registry shapes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-sources-'));
    const bomPath = path.join(tempDir, 'sources-bom.json');
    const invalidPath = path.join(tempDir, 'sources-invalid.json');

    try {
      fs.writeFileSync(
        bomPath,
        `\uFEFF${JSON.stringify({ sources: [{ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br', quick: true }] })}`,
        'utf8'
      );
      fs.writeFileSync(invalidPath, JSON.stringify({ sources: null }), 'utf8');

      expect(loadSources(bomPath)).toEqual([
        expect.objectContaining({ id: 'ufg', baseUrl: 'https://ufg.br/', quick: true })
      ]);
      expect(() => loadSources(invalidPath)).toThrow('expected sources[]');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
