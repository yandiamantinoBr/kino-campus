'use strict';

const path = require('path');

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}), { virtual: true });

const publisher = require(path.join(
  __dirname,
  '..',
  '..',
  'data',
  '.openclaw',
  'workspace',
  'scripts',
  'publish_auto_v5.js',
));

describe('Cadu automatic publisher Tags contract', () => {
  test('makes canonical userTags authoritative and excludes automatic facets', () => {
    const result = publisher.caduUserTagsForRecord({
      module: 'oportunidades',
      category: 'concursos',
      sourceName: 'Instituto Verbena',
      tags: ['Legada que não deve vazar'],
      userTags: ['🏷️ Direito', 'Concursos', 'UFG', 'Instituto Verbena', 'Presencial', 'Direito'],
      userTagKeys: ['forjada', 'concursos', 'ufg', 'instituto-verbena', 'presencial', 'direito'],
    });

    expect(result).toEqual({
      ok: true,
      tags: ['Direito', 'Presencial'],
      tagKeys: ['direito', 'presencial'],
    });
  });

  test('migrates independent legacy tags but keeps Cadu system facets out of Tags', () => {
    const result = publisher.caduUserTagsForRecord({
      module: 'oportunidades',
      category: 'monitoria',
      tags: ['UFG', 'site-institucional', 'tier-na', 'Monitoria', 'Acessibilidade'],
      tagKeys: ['ufg', 'site-institucional', 'tier-na', 'monitoria', 'acessibilidade'],
    });

    expect(result).toEqual({
      ok: true,
      tags: ['Acessibilidade'],
      tagKeys: ['acessibilidade'],
    });
  });

  test('rejects more than twelve independent Tags instead of discarding them', () => {
    const result = publisher.caduUserTagsForRecord({
      module: 'eventos',
      category: 'academicos',
      tags: Array.from({ length: 13 }, (_, index) => 'Livre ' + index),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/12/);
  });
});
