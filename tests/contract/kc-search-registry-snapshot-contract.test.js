'use strict';

const fs = require('fs');
const path = require('path');
const Generator = require('../../scripts/generate-search-registry-snapshot.js');
const Snapshot = require('../../assets/js/shared/kc-search-registry.generated.js');

const ROOT = path.resolve(__dirname, '..', '..');

describe('snapshot gerado do registry de busca', () => {
  test('está sincronizado com schema, builder e políticas de projeção', () => {
    expect(Generator.checkSnapshot()).toBe(true);
    expect(Snapshot.sourceHash).toBe(Generator.sourceHash());
    expect(Generator.normalizeSource('schema\r\nbuilder\rpolicies\n')).toBe('schema\nbuilder\npolicies\n');
    expect(Generator.snapshotMatches(Generator.generateSource().replace(/\n/g, '\r\n'))).toBe(true);
  });

  test('é UMD, versionado e profundamente imutável', () => {
    const source = fs.readFileSync(Generator.TARGET, 'utf8');
    expect(source).toContain('root.KCSearchFieldRegistrySnapshot = factory();');
    expect(Snapshot.snapshotVersion).toBe('1.0.0');
    expect(Snapshot.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(Snapshot)).toBe(true);
    expect(Object.isFrozen(Snapshot.registry.modules)).toBe(true);
  });

  test('mantém paridade integral com o registry construído em memória', () => {
    expect(Snapshot.registry).toEqual(JSON.parse(JSON.stringify(Generator.buildRegistry())));
  });

  test('preserva os seis módulos e seus contratos de campos', () => {
    expect(Snapshot.registry.moduleKeys).toEqual([
      'achados-perdidos', 'caronas', 'compra-venda', 'eventos', 'moradia', 'oportunidades'
    ]);
    Snapshot.registry.moduleKeys.forEach((moduleKey) => {
      expect(Snapshot.registry.modules[moduleKey].tagGroups.length).toBeGreaterThan(0);
      expect(Snapshot.registry.modules[moduleKey].fields.length).toBeGreaterThan(1);
    });
  });

  test('mantém contato e link proibidos para índice, filtro e preferência', () => {
    Snapshot.registry.prohibitedPreferenceFields.forEach((fieldName) => {
      Snapshot.registry.moduleKeys.forEach((moduleKey) => {
        const field = Snapshot.registry.modules[moduleKey].fields.find((entry) => entry.name === fieldName);
        if (!field) return;
        expect(field.policy).toMatchObject({ indexable: false, filterable: false, preferenceEligible: false });
      });
    });
  });

  test('geração é determinística e o snapshot não é carregado estaticamente', () => {
    expect(Generator.normalizeSource(fs.readFileSync(Generator.TARGET, 'utf8')))
      .toBe(Generator.normalizeSource(Generator.generateSource()));
    expect(Generator.generateSource()).not.toMatch(/generatedAt|\d{4}-\d{2}-\d{2}T\d{2}:/);
    const htmlFiles = fs.readdirSync(ROOT).filter((name) => name.endsWith('.html'))
      .map((name) => path.join(ROOT, name))
      .concat(fs.readdirSync(path.join(ROOT, 'admin')).filter((name) => name.endsWith('.html'))
        .map((name) => path.join(ROOT, 'admin', name)));
    htmlFiles.forEach((file) => expect(fs.readFileSync(file, 'utf8')).not.toContain('kc-search-registry.generated.js'));
  });
});
