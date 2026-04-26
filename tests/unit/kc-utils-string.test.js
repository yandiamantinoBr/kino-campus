/*
  Suite de testes — window._KCU.string (v12.2.0)

  Cobre o contrato estático do sub-módulo e o comportamento das 8 funções
  do domínio string extraídas de kc-utils.js para kc-utils.string.js.

  Estrutura:
    1. Contrato estático — namespace e shape
    2. titleCase
    3. beautifyKey
    4. normalizeText
    5. canonicalCategory
    6. slugifyText
    7. levenshteinDistance
    8. escapeHtml
    9. renderMarkdownInline
*/

beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/kc-utils.string.js');
});

// ─── 1. Contrato estático ────────────────────────────────────────────────────

describe('_KCU.string — contrato estático', () => {
  test('window._KCU.string é um objeto congelado', () => {
    expect(window._KCU).toBeDefined();
    expect(window._KCU.string).toBeDefined();
    expect(Object.isFrozen(window._KCU.string)).toBe(true);
  });

  test('expõe exatamente as 8 funções do domínio', () => {
    const m = window._KCU.string;
    expect(typeof m.titleCase).toBe('function');
    expect(typeof m.beautifyKey).toBe('function');
    expect(typeof m.normalizeText).toBe('function');
    expect(typeof m.canonicalCategory).toBe('function');
    expect(typeof m.slugifyText).toBe('function');
    expect(typeof m.levenshteinDistance).toBe('function');
    expect(typeof m.escapeHtml).toBe('function');
    expect(typeof m.renderMarkdownInline).toBe('function');
  });

  test('não expõe funções internas privadas', () => {
    const m = window._KCU.string;
    const keys = Object.keys(m);
    expect(keys).toHaveLength(8);
  });
});

// ─── 2. titleCase ────────────────────────────────────────────────────────────

describe('_KCU.string.titleCase', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.titleCase; });

  test('capitaliza primeira letra de cada palavra', () => {
    expect(fn('kino campus')).toBe('Kino Campus');
    expect(fn('engenharia de software')).toBe('Engenharia De Software');
  });

  test('trata null e undefined sem erro', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
    expect(fn('')).toBe('');
  });

  test('remove espaços duplicados antes de capitalizar', () => {
    expect(fn('  hello   world  ')).toBe('Hello World');
  });
});

// ─── 3. beautifyKey ──────────────────────────────────────────────────────────

describe('_KCU.string.beautifyKey', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.beautifyKey; });

  test('converte snake_case e kebab-case para Title Case', () => {
    expect(fn('area_atuacao')).toBe('Area Atuacao');
    expect(fn('tipo-moradia')).toBe('Tipo Moradia');
    expect(fn('area_de-trabalho')).toBe('Area De Trabalho');
  });

  test('retorna vazio para entrada vazia ou nula', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });
});

// ─── 4. normalizeText ────────────────────────────────────────────────────────

describe('_KCU.string.normalizeText', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.normalizeText; });

  test('remove acentos, converte para minúsculas e trim', () => {
    expect(fn(' Árvore ')).toBe('arvore');
    expect(fn('Comunicação')).toBe('comunicacao');
    expect(fn('ÉnErGiA')).toBe('energia');
  });

  test('trata null e undefined sem erro', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });

  test('preserva hifens e underscores', () => {
    expect(fn('kino-campus_v12')).toBe('kino-campus_v12');
  });
});

// ─── 5. canonicalCategory ────────────────────────────────────────────────────

describe('_KCU.string.canonicalCategory', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.canonicalCategory; });

  test('remove prefixo # e singular básico pt-BR', () => {
    expect(fn('#moradia')).toBe('moradia');
    expect(fn('moradias')).toBe('moradia');
    expect(fn('oportunidades')).toBe('oportunidade');
  });

  test('não altera palavras curtas (<= 3 chars)', () => {
    expect(fn('ods')).toBe('ods');
    expect(fn('bus')).toBe('bus');
  });

  test('normaliza acentos via normalizeText e aplica singular básico', () => {
    // 'Habitações' → normalizeText → 'habitacoes' → remove 's' → 'habitacoe'
    expect(fn('Habitações')).toBe('habitacoe');
    expect(fn('Moradias')).toBe('moradia');
  });
});

// ─── 6. slugifyText ──────────────────────────────────────────────────────────

describe('_KCU.string.slugifyText', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.slugifyText; });

  test('gera slug legível sem caracteres especiais', () => {
    expect(fn('Kino Campus')).toBe('kino-campus');
    expect(fn('Ação & Reação !!!')).toBe('acao-reacao');
    expect(fn('moradia/hospedagem')).toBe('moradia-hospedagem');
  });

  test('retorna vazio para string vazia ou somente especiais', () => {
    expect(fn('')).toBe('');
    expect(fn(' ')).toBe('');
    expect(fn('!@#$%')).toBe('');
  });
});

// ─── 7. levenshteinDistance ──────────────────────────────────────────────────

describe('_KCU.string.levenshteinDistance', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.levenshteinDistance; });

  test('retorna 0 para strings idênticas', () => {
    expect(fn('abc', 'abc')).toBe(0);
    expect(fn('', '')).toBe(0);
  });

  test('retorna o tamanho da outra string quando uma é vazia', () => {
    expect(fn('', 'abc')).toBe(3);
    expect(fn('abc', '')).toBe(3);
  });

  test('calcula distância corretamente', () => {
    expect(fn('kitten', 'sitting')).toBe(3);
    expect(fn('moradia', 'moradias')).toBe(1);
    expect(fn('kino', 'campus')).toBe(6);
  });
});

// ─── 8. escapeHtml ───────────────────────────────────────────────────────────

describe('_KCU.string.escapeHtml', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.escapeHtml; });

  test('escapa os 5 caracteres HTML perigosos', () => {
    expect(fn('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  test('não altera texto seguro', () => {
    expect(fn('Kino Campus 2026')).toBe('Kino Campus 2026');
  });

  test('trata null/undefined sem erro (via ?? coerção)', () => {
    // null ?? '' = '' → String('') = ''
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
    expect(fn('')).toBe('');
  });

  test('previne XSS básico', () => {
    const input = '<script>alert("xss")</script>';
    expect(fn(input)).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
});

// ─── 9. renderMarkdownInline ─────────────────────────────────────────────────

describe('_KCU.string.renderMarkdownInline', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.string.renderMarkdownInline; });

  test('converte **bold** para <strong>', () => {
    expect(fn('texto **negrito** aqui')).toBe('texto <strong>negrito</strong> aqui');
  });

  test('converte *itálico* para <em>', () => {
    expect(fn('texto *itálico* aqui')).toContain('<em>it\u00e1lico</em>');
  });

  test('converte `código` para <code>', () => {
    expect(fn('use `window.KCUtils`')).toBe('use <code>window.KCUtils</code>');
  });

  test('escapa HTML antes de processar markdown (anti-XSS)', () => {
    const result = fn('<b>não negrito</b>');
    expect(result).toContain('&lt;b&gt;');
    expect(result).not.toContain('<b>');
  });

  test('retorna string vazia para entrada vazia', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });

  test('converte link [label](url) para <a>', () => {
    const result = fn('[KinoCampus](https://kinocampus.com.br)');
    expect(result).toContain('<a href="https://kinocampus.com.br"');
    expect(result).toContain('KinoCampus');
    expect(result).toContain('target="_blank"');
  });
});
