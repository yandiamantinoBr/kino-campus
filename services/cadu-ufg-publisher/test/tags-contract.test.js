'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_USER_TAGS,
  mapToKinoPayload,
  toPostgrestInsert,
} = require('../src/mapper');
const { SupabasePublisher } = require('../src/publisher');

function eventClassification() {
  return {
    module: 'eventos',
    category: 'academicos',
    confidence: 0.94,
    hasPdf: true,
    hasDeadline: true,
    temporal: {
      deadlineDate: '2026-09-30',
      eventDate: '2026-09-20',
      expired: false,
    },
  };
}

function sourceItem(overrides = {}) {
  return {
    id: 'eventos-ufg-tags',
    title: 'Evento de teste com inscrições abertas',
    summary: 'Atividade acadêmica aberta à comunidade.',
    text: 'Consulte o edital e confirme os requisitos.',
    sourceUrl: 'https://eventos.ufg.br/teste',
    sourceName: 'Eventos UFG',
    pdfLinks: ['https://eventos.ufg.br/edital.pdf'],
    ...overrides,
  };
}

function createPublisher() {
  return new SupabasePublisher({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    kinoEmail: 'cadu-test@example.com',
    kinoPassword: 'x',
  });
}

test('maps legacy source tags to the editable surface without changing automatic facets', () => {
  const payload = mapToKinoPayload(sourceItem({
    tags: [
      'UFG',
      'Eventos UFG',
      'Acadêmicos',
      'Acadêmico',
      'Edital',
      'Prazo',
      'site-institucional',
      'tier-1',
      'Direito',
      '🏷️ Acessibilidade',
      'direito',
      'Palestras',
    ],
  }), eventClassification());

  assert.deepEqual(payload.metadata.tags, ['UFG', 'Eventos UFG', 'Acadêmicos', 'Edital', 'Prazo']);
  assert.deepEqual(payload.metadata.tagKeys, ['ufg', 'eventos-ufg', 'academicos', 'edital', 'prazo']);
  assert.deepEqual(payload.metadata.userTags, ['Direito', 'Acessibilidade']);
  assert.deepEqual(payload.metadata.userTagKeys, ['direito', 'acessibilidade']);
});

test('makes userTags authoritative, derives keys, and enforces the Cadu limit after automatic facets', () => {
  const topics = Array.from({ length: MAX_USER_TAGS + 2 }, (_, index) => `Tema ${index + 1}`);
  const row = toPostgrestInsert({
    modulo: 'oportunidades',
    categoriaKey: 'estagios',
    titulo: 'Estágio de teste',
    descricao: 'Descrição de teste.',
    tags: ['UFG', 'Estágio', 'Edital'],
    tagKeys: ['ufg', 'estagio', 'edital'],
    userTags: ['UFG', 'Estágio', ...topics, 'Tema 1'],
    userTagKeys: ['forged-key'],
  }, 'agent-1');

  assert.deepEqual(row.metadata.tags, ['UFG', 'Estágio', 'Edital']);
  assert.deepEqual(row.metadata.tagKeys, ['ufg', 'estagio', 'edital']);
  assert.deepEqual(row.metadata.userTags, topics.slice(0, MAX_USER_TAGS));
  assert.deepEqual(row.metadata.userTagKeys, topics.slice(0, MAX_USER_TAGS).map((topic) => topic.toLowerCase().replace(/ /g, '-')));
});

test('edits preserve omitted Tags, normalize explicit replacements, and only clear on an explicit empty array', async () => {
  const publisher = createPublisher();
  const current = {
    id: 'post-1',
    module: 'oportunidades',
    category: 'estagios',
    metadata: {
      tags: ['UFG', 'Estágio', 'Edital'],
      tagKeys: ['ufg', 'estagio', 'edital'],
      userTags: ['Direito'],
      userTagKeys: ['direito'],
      preserved: true,
    },
  };

  const unrelated = publisher.buildSafePatch(current, { title: 'Novo título' });
  assert.deepEqual(unrelated.metadata.tags, current.metadata.tags);
  assert.deepEqual(unrelated.metadata.userTags, ['Direito']);
  assert.deepEqual(unrelated.metadata.userTagKeys, ['direito']);

  const replacement = publisher.buildSafePatch(current, {
    metadata: {
      userTags: ['  Acessibilidade ', '🏷️ Acessibilidade', 'UFG', 'Estágio', 'Direito'],
      userTagKeys: ['forged-key'],
    },
  });
  assert.deepEqual(replacement.metadata.tags, current.metadata.tags);
  assert.deepEqual(replacement.metadata.userTags, ['Acessibilidade', 'Direito']);
  assert.deepEqual(replacement.metadata.userTagKeys, ['acessibilidade', 'direito']);

  const cleared = publisher.buildSafePatch(current, { metadata: { userTags: [] } });
  assert.deepEqual(cleared.metadata.userTags, []);
  assert.deepEqual(cleared.metadata.userTagKeys, []);

  let updateRow = null;
  publisher.safeUpdatePost = async (_postId, row) => {
    updateRow = row;
    return { ok: true };
  };
  await publisher.updatePost('post-1', {
    modulo: 'oportunidades',
    categoriaKey: 'estagios',
    titulo: 'Reparo sem Tags',
    descricao: 'Apenas corrige o texto.',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(updateRow.metadata, 'tags'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updateRow.metadata, 'userTags'), false);

  const updatePatch = publisher.buildSafePatch(current, updateRow);
  assert.deepEqual(updatePatch.metadata.tags, current.metadata.tags);
  assert.deepEqual(updatePatch.metadata.userTags, current.metadata.userTags);
  assert.deepEqual(updatePatch.metadata.userTagKeys, current.metadata.userTagKeys);
});

test('unrelated edits preserve historical user Tags above the current limit', () => {
  const publisher = createPublisher();
  const historicalTags = Array.from({ length: MAX_USER_TAGS + 2 }, (_, index) => `Histórico ${index + 1}`);
  const current = {
    module: 'eventos',
    category: 'academicos',
    metadata: {
      tags: ['UFG', 'Acadêmicos'],
      tagKeys: ['ufg', 'academicos'],
      userTags: historicalTags,
      userTagKeys: historicalTags.map((tag) => tag.toLowerCase().replace(/ /g, '-')),
    },
  };

  const patch = publisher.buildSafePatch(current, { metadata: { link: 'https://eventos.ufg.br/novo-link' } });
  assert.deepEqual(patch.metadata.userTags, historicalTags);
  assert.deepEqual(patch.metadata.userTagKeys, current.metadata.userTagKeys);
});
