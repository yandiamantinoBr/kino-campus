/*
  Suite de testes — window._KCU.identity (v12.2.3)

  Cobre o contrato estático do sub-módulo e o comportamento das 5 funções
  do domínio identity extraídas de kc-utils.js para kc-utils.identity.js.

  Estrutura:
    1. Contrato estático — namespace e shape
    2. normalizeEmail
    3. getEmailDomain
    4. normalizeAllowedDomains
    5. isInstitutionalEmailAllowed
    6. buildPublicHandle
*/

beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.identity.js');
});

// ─── 1. Contrato estático ────────────────────────────────────────────────────

describe('_KCU.identity — contrato estático', () => {
  test('window._KCU.identity é um objeto congelado', () => {
    expect(window._KCU).toBeDefined();
    expect(window._KCU.identity).toBeDefined();
    expect(Object.isFrozen(window._KCU.identity)).toBe(true);
  });

  test('expõe exatamente 5 funções do domínio', () => {
    const chaves = Object.keys(window._KCU.identity).sort();
    expect(chaves).toEqual([
      'buildPublicHandle',
      'getEmailDomain',
      'isInstitutionalEmailAllowed',
      'normalizeAllowedDomains',
      'normalizeEmail',
    ]);
  });

  test('todas as entradas são funções', () => {
    Object.values(window._KCU.identity).forEach(fn => {
      expect(typeof fn).toBe('function');
    });
  });

  test('não vaza helpers privados (_str, _slugifyText)', () => {
    expect(window._KCU.identity._str).toBeUndefined();
    expect(window._KCU.identity._slugifyText).toBeUndefined();
  });
});

// ─── 2. normalizeEmail ────────────────────────────────────────────────────────

describe('_KCU.identity.normalizeEmail', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.identity.normalizeEmail; });

  test('converte para minúsculas e remove espaços', () => {
    expect(fn('  USER@UFG.BR  ')).toBe('user@ufg.br');
  });

  test('preserva e-mail já normalizado', () => {
    expect(fn('aluno@discente.ufg.br')).toBe('aluno@discente.ufg.br');
  });

  test('retorna "" para null/undefined', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
    expect(fn('')).toBe('');
  });

  test('trata entrada numérica como string', () => {
    expect(fn(123)).toBe('123');
  });
});

// ─── 3. getEmailDomain ────────────────────────────────────────────────────────

describe('_KCU.identity.getEmailDomain', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.identity.getEmailDomain; });

  test('extrai domínio de e-mail válido', () => {
    expect(fn('aluno@discente.ufg.br')).toBe('discente.ufg.br');
  });

  test('normaliza antes de extrair (maiúsculas, espaços)', () => {
    expect(fn('  USER@UFG.BR  ')).toBe('ufg.br');
  });

  test('retorna "" para e-mail sem @', () => {
    expect(fn('naotemdominio')).toBe('');
  });

  test('retorna "" para string vazia e null', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
  });

  test('usa o último @ para determinar o domínio', () => {
    // Endereço inválido mas defensivo: último @ vence
    expect(fn('a@b@ufg.br')).toBe('ufg.br');
  });
});

// ─── 4. normalizeAllowedDomains ───────────────────────────────────────────────

describe('_KCU.identity.normalizeAllowedDomains', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.identity.normalizeAllowedDomains; });

  test('normaliza domínios para minúsculas e remove duplicatas', () => {
    const result = fn(['UFG.BR', 'ufg.br', 'DISCENTE.UFG.BR']);
    expect(result).toEqual(['ufg.br', 'discente.ufg.br']);
  });

  test('remove entradas vazias e espaços extras', () => {
    const result = fn(['  ufg.br  ', '', null, 'egresso.ufg.br']);
    expect(result).toContain('ufg.br');
    expect(result).toContain('egresso.ufg.br');
    expect(result).not.toContain('');
    expect(result).not.toContain(null);
  });

  test('retorna [] para entrada não-array', () => {
    expect(fn(null)).toEqual([]);
    expect(fn('ufg.br')).toEqual([]);
    expect(fn(undefined)).toEqual([]);
    expect(fn({})).toEqual([]);
  });

  test('retorna [] para array vazio', () => {
    expect(fn([])).toEqual([]);
  });
});

// ─── 5. isInstitutionalEmailAllowed ──────────────────────────────────────────

describe('_KCU.identity.isInstitutionalEmailAllowed', () => {
  let fn;
  const UFG_DOMAINS = ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'];
  beforeEach(() => { fn = window._KCU.identity.isInstitutionalEmailAllowed; });

  test('retorna true para domínio na allowlist', () => {
    expect(fn('aluno@discente.ufg.br', UFG_DOMAINS)).toBe(true);
    expect(fn('prof@ufg.br', UFG_DOMAINS)).toBe(true);
    expect(fn('ex@egresso.ufg.br', UFG_DOMAINS)).toBe(true);
  });

  test('retorna false para domínio fora da allowlist', () => {
    expect(fn('user@gmail.com', UFG_DOMAINS)).toBe(false);
    expect(fn('user@hotmail.com', UFG_DOMAINS)).toBe(false);
  });

  test('retorna true quando allowlist está vazia (sem restrição)', () => {
    expect(fn('qualquer@email.com', [])).toBe(true);
    expect(fn('qualquer@email.com', null)).toBe(true);
  });

  test('retorna false para e-mail sem @', () => {
    expect(fn('naotemdomain', UFG_DOMAINS)).toBe(false);
  });

  test('retorna false para e-mail vazio', () => {
    expect(fn('', UFG_DOMAINS)).toBe(false);
    expect(fn(null, UFG_DOMAINS)).toBe(false);
  });

  test('é case-insensitive no e-mail de entrada', () => {
    expect(fn('ALUNO@DISCENTE.UFG.BR', UFG_DOMAINS)).toBe(true);
  });
});

// ─── 6. buildPublicHandle ─────────────────────────────────────────────────────

describe('_KCU.identity.buildPublicHandle', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.identity.buildPublicHandle; });

  test('gera handle com @ por padrão', () => {
    expect(fn('Joao Silva')).toBe('@joao-silva');
  });

  test('remove acentos e caracteres especiais', () => {
    expect(fn('Ação Universitária')).toBe('@acao-universitaria');
  });

  test('limita a 32 caracteres (sem contar o @)', () => {
    const longo = 'a'.repeat(40);
    const result = fn(longo);
    // O handle sem @ deve ter no máximo 32 chars
    expect(result.slice(1).length).toBeLessThanOrEqual(32);
  });

  test('omite o @ quando options.prefix === false', () => {
    expect(fn('Yan Diamantino', { prefix: false })).toBe('yan-diamantino');
  });

  test('retorna "" para entrada vazia', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });

  test('retorna "" para string com apenas caracteres especiais', () => {
    expect(fn('!@#$%')).toBe('');
  });
});
