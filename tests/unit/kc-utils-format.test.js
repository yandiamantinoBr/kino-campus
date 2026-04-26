/*
  Suite de testes — window._KCU.format (v12.2.1)

  Cobre o contrato estático do sub-módulo e o comportamento das 7 funções
  do domínio format extraídas de kc-utils.js para kc-utils.format.js.

  Estrutura:
    1. Contrato estático — namespace e shape
    2. timeAgo
    3. formatCurrencyBRL
    4. parseBRLNumber
    5. clamp
    6. buildProductDetailHref
    7. getConditionLabel
    8. splitPriceText
*/

beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.format.js');
});

// ─── 1. Contrato estático ────────────────────────────────────────────────────

describe('_KCU.format — contrato estático', () => {
  test('window._KCU.format é um objeto congelado', () => {
    expect(window._KCU).toBeDefined();
    expect(window._KCU.format).toBeDefined();
    expect(Object.isFrozen(window._KCU.format)).toBe(true);
  });

  test('expõe exatamente 7 funções do domínio', () => {
    const chaves = Object.keys(window._KCU.format).sort();
    expect(chaves).toEqual([
      'buildProductDetailHref',
      'clamp',
      'formatCurrencyBRL',
      'getConditionLabel',
      'parseBRLNumber',
      'splitPriceText',
      'timeAgo',
    ]);
  });

  test('não vaza helpers privados (_str, _normalizeText, _beautifyKey)', () => {
    const m = window._KCU.format;
    expect(m._str).toBeUndefined();
    expect(m._normalizeText).toBeUndefined();
    expect(m._beautifyKey).toBeUndefined();
  });

  test('todas as entradas são funções', () => {
    Object.values(window._KCU.format).forEach(fn => {
      expect(typeof fn).toBe('function');
    });
  });
});

// ─── 2. timeAgo ─────────────────────────────────────────────────────────────

describe('_KCU.format.timeAgo', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.timeAgo; });

  test('retorna "" para string vazia', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });

  test('retorna "Agora mesmo" para data muito recente (< 5 min)', () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1 min atrás
    expect(fn(recent)).toBe('Agora mesmo');
  });

  test('retorna "Agora mesmo" para data futura (descompasso de relógio)', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(fn(future)).toBe('Agora mesmo');
  });

  test('retorna "Há X min" para data entre 5 min e 1 hora atrás', () => {
    const past = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 30 min');
  });

  test('retorna "Há 1 hora" para exatamente 1 hora atrás', () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 1 hora');
  });

  test('retorna "Há X horas" para múltiplas horas atrás', () => {
    const past = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 3 horas');
  });

  test('retorna "Há 1 dia" para exatamente 1 dia atrás', () => {
    const past = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 1 dia');
  });

  test('retorna "Há X dias" para múltiplos dias atrás', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 7 dias');
  });

  test('retorna "Há 1 mês" para cerca de 30 dias atrás', () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 1 mês');
  });

  test('retorna "Há X meses" para múltiplos meses atrás', () => {
    const past = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 3 meses');
  });

  test('retorna "Há 1 ano" para cerca de 365 dias atrás', () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60_000).toISOString();
    expect(fn(past)).toBe('Há 1 ano');
  });

  test('retorna string original para data inválida', () => {
    expect(fn('nao-e-uma-data')).toBe('nao-e-uma-data');
  });
});

// ─── 3. formatCurrencyBRL ────────────────────────────────────────────────────

describe('_KCU.format.formatCurrencyBRL', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.formatCurrencyBRL; });

  test('formata NaN como "R$ 0,00"', () => {
    expect(fn('abc')).toBe('R$ 0,00');
    expect(fn(undefined)).toBe('R$ 0,00');
  });

  test('resultado contém símbolo R$ para valor numérico válido', () => {
    expect(fn(100)).toMatch(/R\$/);
    expect(fn(0)).toMatch(/R\$/);
  });

  test('usa vírgula como separador decimal (locale pt-BR)', () => {
    expect(fn(10.5)).toMatch(/,\d{2}/);
    expect(fn(1234.56)).toMatch(/,\d{2}/);
  });

  test('aceita string numérica com vírgula', () => {
    const result = fn('29,90');
    expect(result).toMatch(/R\$/);
    expect(result).toMatch(/,\d{2}/);
  });
});

// ─── 4. parseBRLNumber ───────────────────────────────────────────────────────

describe('_KCU.format.parseBRLNumber', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.parseBRLNumber; });

  test('parseia "R$ 1.234,56" → 1234.56', () => {
    expect(fn('R$ 1.234,56')).toBe(1234.56);
  });

  test('parseia "250,00" → 250', () => {
    expect(fn('250,00')).toBe(250);
  });

  test('parseia "0" → 0', () => {
    expect(fn('0')).toBe(0);
  });

  test('retorna 0 para string vazia', () => {
    expect(fn('')).toBe(0);
  });

  test('retorna 0 para null/undefined', () => {
    expect(fn(null)).toBe(0);
    expect(fn(undefined)).toBe(0);
  });

  test('ignora espaços e símbolo R$', () => {
    expect(fn('R$   50,00')).toBe(50);
  });
});

// ─── 5. clamp ────────────────────────────────────────────────────────────────

describe('_KCU.format.clamp', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.clamp; });

  test('retorna o valor quando dentro do intervalo', () => {
    expect(fn(5, 0, 10)).toBe(5);
  });

  test('limita ao mínimo quando abaixo do intervalo', () => {
    expect(fn(-5, 0, 10)).toBe(0);
  });

  test('limita ao máximo quando acima do intervalo', () => {
    expect(fn(15, 0, 10)).toBe(10);
  });

  test('aceita valor exatamente nos limites', () => {
    expect(fn(0, 0, 10)).toBe(0);
    expect(fn(10, 0, 10)).toBe(10);
  });

  test('funciona com números negativos como limites', () => {
    expect(fn(-15, -10, -5)).toBe(-10);
    expect(fn(-3, -10, -5)).toBe(-5);
    expect(fn(-7, -10, -5)).toBe(-7);
  });
});

// ─── 6. buildProductDetailHref ───────────────────────────────────────────────

describe('_KCU.format.buildProductDetailHref', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.buildProductDetailHref; });

  test('gera URL correta para ID simples', () => {
    expect(fn('abc-123')).toBe('_product.html?id=abc-123');
  });

  test('encoda caracteres especiais no ID', () => {
    expect(fn('id com espaço')).toBe('_product.html?id=id%20com%20espa%C3%A7o');
  });

  test('retorna "" para ID vazio', () => {
    expect(fn('')).toBe('');
  });

  test('retorna "" para null/undefined', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });

  test('aceita UUID como ID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(fn(uuid)).toBe(`_product.html?id=${uuid}`);
  });
});

// ─── 7. getConditionLabel ────────────────────────────────────────────────────

describe('_KCU.format.getConditionLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.getConditionLabel; });

  test('"semi" → "Semi-novo"', () => {
    expect(fn('semi')).toBe('Semi-novo');
  });

  test('"Semi-novo" → "Semi-novo" (match por includes após normalize)', () => {
    expect(fn('Semi-novo')).toBe('Semi-novo');
  });

  test('"novo" → "Novo"', () => {
    expect(fn('novo')).toBe('Novo');
  });

  test('"Novo em folha" → "Novo" (match por includes)', () => {
    expect(fn('Novo em folha')).toBe('Novo');
  });

  test('valor desconhecido passa por beautifyKey', () => {
    // 'usado' não contém 'semi' nem 'novo' → beautifyKey('usado') = 'Usado'
    expect(fn('usado')).toBe('Usado');
  });

  test('string vazia → ""', () => {
    expect(fn('')).toBe('');
  });

  test('null/undefined → ""', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });
});

// ─── 8. splitPriceText ───────────────────────────────────────────────────────

describe('_KCU.format.splitPriceText', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.format.splitPriceText; });

  test('string vazia → { main: "", small: "" }', () => {
    expect(fn('')).toEqual({ main: '', small: '' });
    expect(fn(null)).toEqual({ main: '', small: '' });
  });

  test('preço simples sem complemento → small vazio', () => {
    expect(fn('R$ 10,00')).toEqual({ main: 'R$ 10,00', small: '' });
  });

  test('quebra por \\n (primeira linha é main)', () => {
    expect(fn('Linha 1\nLinha 2')).toEqual({ main: 'Linha 1', small: 'Linha 2' });
  });

  test('quebra por parênteses: conteúdo em () vira small', () => {
    expect(fn('R$ 10,00 (por mês)')).toEqual({ main: 'R$ 10,00', small: 'por mês' });
  });

  test('quebra pelo separador " - "', () => {
    expect(fn('R$ 5,00 - por dia')).toEqual({ main: 'R$ 5,00', small: 'por dia' });
  });

  test('quebra pelo separador " | "', () => {
    expect(fn('Plano básico | mensal')).toEqual({ main: 'Plano básico', small: 'mensal' });
  });

  test('quebra por unidade "/trecho" com complemento', () => {
    const result = fn('R$ 5,00/trecho Ida e volta');
    expect(result.main).toBe('R$ 5,00/trecho');
    expect(result.small).toBe('Ida e volta');
  });

  test('unidade "/trecho" sem complemento → small vazio', () => {
    const result = fn('R$ 5,00/trecho');
    expect(result.main).toBe('R$ 5,00/trecho');
    expect(result.small).toBe('');
  });
});
