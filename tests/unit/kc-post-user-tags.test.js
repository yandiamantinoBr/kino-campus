'use strict';

const UserTags = require('../../assets/js/shared/kc-post-user-tags.shared.js');

describe('KCPostUserTags', () => {
  test('normaliza espaços, acentos e duplicatas sem tocar na taxonomia', () => {
    const result = UserTags.normalize(['  Acessibilidade  ', 'acessibilidade', 'Monitoria', 'Inclusão']);

    expect(result).toEqual({
      tags: ['Acessibilidade', 'Monitoria', 'Inclusão'],
      tagKeys: ['acessibilidade', 'monitoria', 'inclusao'],
      errors: [],
    });
  });

  test('interpreta vírgula, ponto e vírgula e quebra de linha no campo textual', () => {
    expect(UserTags.parseText('Monitoria; Inclusão, acessibilidade\nbolsa'))
      .toEqual(['Monitoria', 'Inclusão', 'acessibilidade', 'bolsa']);
  });

  test('aceita seis tags para usuário comum e rejeita a sétima', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(UserTags.validate(six)).toMatchObject({ ok: true, limit: 6, tags: six });

    const seven = UserTags.validate(six.concat('g'));
    expect(seven.ok).toBe(false);
    expect(seven.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TOO_MANY_TAGS', limit: 6 }),
    ]));
  });

  test('aceita doze tags privilegiadas e rejeita a décima terceira', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => 'tag ' + (index + 1));
    expect(UserTags.validate(twelve, { isPrivileged: true })).toMatchObject({ ok: true, limit: 12 });

    const thirteen = UserTags.validate(twelve.concat('tag 13'), { isPrivileged: true });
    expect(thirteen.ok).toBe(false);
    expect(thirteen.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TOO_MANY_TAGS', limit: 12 }),
    ]));
  });

  test('rejeita valores inválidos e textos maiores que sessenta caracteres', () => {
    expect(UserTags.validate(['!!!']).ok).toBe(false);
    expect(UserTags.validate(['x'.repeat(61)]).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TAG_TOO_LONG' }),
    ]));
  });

  test('lê tags legadas até a dupla canônica existir e respeita limpeza explícita', () => {
    expect(UserTags.read({ metadata: { tags: ['Evento', 'Curso'], tagKeys: ['evento', 'curso'] } }))
      .toMatchObject({ tags: ['Evento', 'Curso'], tagKeys: ['evento', 'curso'], source: 'legacy', isLegacy: true });
    // KCAPI normaliza propriedades de conveniência vazias no nível superior.
    // Elas não podem esconder a lista legada que ainda vive no JSONB.
    expect(UserTags.read({
      userTags: [],
      userTagKeys: [],
      metadata: { tags: ['Direito', 'Concursos', 'UFG', 'institutoverbena', 'Presencial'] },
    })).toMatchObject({
      tags: ['Direito', 'Concursos', 'UFG', 'institutoverbena', 'Presencial'],
      source: 'legacy',
      isLegacy: true,
    });
    expect(UserTags.read({ metadata: { userTags: ['Monitoria'], userTagKeys: ['forjada'] } }))
      .toMatchObject({ tags: ['Monitoria'], tagKeys: ['monitoria'], source: 'canonical', isLegacy: false });
    expect(UserTags.read({ metadata: { tags: ['Evento'], userTags: [] } }))
      .toMatchObject({ tags: [], tagKeys: [], source: 'canonical', isLegacy: false });
    expect(UserTags.metadataPatch([], { isPrivileged: false })).toMatchObject({
      ok: true,
      metadata: { userTags: [], userTagKeys: [] },
    });
  });

  test('preserva uma lista histórica acima do limite apenas quando ela permanece idêntica', () => {
    const imported = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'];

    expect(UserTags.validate(imported, {
      allowExistingOverflow: true,
      initialTags: imported,
    })).toMatchObject({ ok: true, preservesExistingOverflow: true, tags: imported });

    const changed = UserTags.validate(imported.concat('Oito'), {
      allowExistingOverflow: true,
      initialTags: imported,
    });
    expect(changed.ok).toBe(false);
    expect(changed.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TOO_MANY_TAGS', limit: 6 }),
    ]));
  });
});
