const fs = require('fs');
const path = require('path');

// Ler o código fonte dos utilitários
const constantsPath = path.resolve(__dirname, '../assets/js/kc-constants.js');
const utilsPath = path.resolve(__dirname, '../assets/js/kc-utils.js');

const constantsCode = fs.readFileSync(constantsPath, 'utf8');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');

// O jest-environment-jsdom expõe o "window" e "document" globalmente.
// Executamos os códigos no contexto atual para popular o window.
beforeAll(() => {
  // Executando no escopo global para simular o browser incluí-las
  eval(constantsCode);
  eval(utilsCode);
});

describe('KCUtils - Funções Utilitárias', () => {
  let utils;

  beforeEach(() => {
    utils = window.KCUtils;
  });

  describe('normalizeText', () => {
    test('limpa acentos, espaços e converte para minúsculas', () => {
      expect(utils.normalizeText(' Árvore ')).toBe('arvore');
      expect(utils.normalizeText('Comunicação')).toBe('comunicacao');
    });

    test('lida com null ou undefined graciosamente', () => {
      expect(utils.normalizeText(null)).toBe('');
      expect(utils.normalizeText(undefined)).toBe('');
    });
  });

  describe('timeAgo', () => {
    test('formata datas recentes no futuro ou agora mesmo', () => {
      expect(utils.timeAgo(new Date())).toBe('Agora mesmo');
      const fut = new Date(Date.now() + 10000);
      expect(utils.timeAgo(fut)).toBe('Agora mesmo');
    });

    test('formata minutos corretamente', () => {
      const past = new Date(Date.now() - 6 * 60000); // 6 mins atrás
      expect(utils.timeAgo(past)).toBe('Há 6 min');
    });
  });

  describe('slugifyText', () => {
    test('converte texto em slug legível', () => {
      expect(utils.slugifyText('Kino Campus')).toBe('kino-campus');
      expect(utils.slugifyText('Ação & Reação !!!')).toBe('acao-reacao'); // Comporta os espaços/símbolos, e remove traços no final
      expect(utils.slugifyText(' ')).toBe('');
    });
  });

  describe('normalizeEmail', () => {
    test('remove espaços e minúsculas', () => {
      expect(utils.normalizeEmail('  Teste@AluNo.UFG.br ')).toBe('teste@aluno.ufg.br');
    });
  });

  describe('isInstitutionalEmailAllowed', () => {
    test('identifica corretamente domínios em whitelist', () => {
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
