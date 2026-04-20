beforeAll(() => {
  global.window = global.window || global;
  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../assets/js/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../assets/js/kc-utils.js');
});

describe('KCUtils - Funcoes Utilitarias', () => {
  let utils;

  beforeEach(() => {
    utils = window.KCUtils;
  });

  describe('normalizeText', () => {
    test('limpa acentos, espacos e converte para minusculas', () => {
      expect(utils.normalizeText(' \u00C1rvore ')).toBe('arvore');
      expect(utils.normalizeText('Comunica\u00E7\u00E3o')).toBe('comunicacao');
    });

    test('lida com null ou undefined graciosamente', () => {
      expect(utils.normalizeText(null)).toBe('');
      expect(utils.normalizeText(undefined)).toBe('');
    });
  });

  describe('timeAgo', () => {
    test('formata datas recentes no futuro ou agora mesmo', () => {
      expect(utils.timeAgo(new Date())).toBe('Agora mesmo');
      const future = new Date(Date.now() + 10000);
      expect(utils.timeAgo(future)).toBe('Agora mesmo');
    });

    test('formata minutos corretamente', () => {
      const past = new Date(Date.now() - (6 * 60000));
      expect(utils.timeAgo(past)).toMatch(/6 min/);
    });
  });

  describe('slugifyText', () => {
    test('converte texto em slug legivel', () => {
      expect(utils.slugifyText('Kino Campus')).toBe('kino-campus');
      expect(utils.slugifyText('Acao & Reacao !!!')).toBe('acao-reacao');
      expect(utils.slugifyText(' ')).toBe('');
    });
  });

  describe('normalizeEmail', () => {
    test('remove espacos e minusculas', () => {
      expect(utils.normalizeEmail('  Teste@AluNo.UFG.br ')).toBe('teste@aluno.ufg.br');
    });
  });

  describe('isInstitutionalEmailAllowed', () => {
    test('identifica corretamente dominios em whitelist', () => {
      const allowlist = ['discente.ufg.br', 'ufg.br'];
      expect(utils.isInstitutionalEmailAllowed('aluno@discente.ufg.br', allowlist)).toBe(true);
      expect(utils.isInstitutionalEmailAllowed('prof@ufg.br', allowlist)).toBe(true);
      expect(utils.isInstitutionalEmailAllowed('prof@gmail.com', allowlist)).toBe(false);
    });

    test('devolve true caso a allowlist seja vazia', () => {
      expect(utils.isInstitutionalEmailAllowed('teste@gmail.com', [])).toBe(true);
      expect(utils.isInstitutionalEmailAllowed('teste@gmail.com', null)).toBe(true);
    });
  });
});
