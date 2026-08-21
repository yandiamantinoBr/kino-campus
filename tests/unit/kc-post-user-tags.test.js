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

  test('lê somente a dupla adicional e permite limpeza explícita', () => {
    expect(UserTags.read({ metadata: { tags: ['Evento', 'Curso'], tagKeys: ['evento', 'curso'] } }))
      .toMatchObject({ tags: [], tagKeys: [] });
    expect(UserTags.read({ metadata: { userTags: ['Monitoria'], userTagKeys: ['forjada'] } }))
      .toMatchObject({ tags: ['Monitoria'], tagKeys: ['monitoria'] });
    expect(UserTags.metadataPatch([], { isPrivileged: false })).toMatchObject({
      ok: true,
      metadata: { userTags: [], userTagKeys: [] },
    });
  });
});
