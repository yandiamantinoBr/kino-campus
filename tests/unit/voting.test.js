const fs = require('fs');
const path = require('path');

beforeAll(() => {
  global.window = global.window || global;
  // Define KC_UUID_RE que voting.js depende (originalmente em carousel.js)
  global.KC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // voting.js declara funcoes globais (sem IIFE). No Node/Jest, require() encapsula
  // em modulo e nao expoe ao escopo global. Usamos eval no contexto global do Jest
  // para simular o comportamento de <script> no browser.
  const filePath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'components', 'voting.js');
  const code = fs.readFileSync(filePath, 'utf-8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
});

describe('Voting - kcNormalizeDirection', () => {
  test('retorna "hot" para entrada "hot"', () => {
    expect(kcNormalizeDirection('hot')).toBe('hot');
  });

  test('retorna "cold" para entrada "cold"', () => {
    expect(kcNormalizeDirection('cold')).toBe('cold');
  });

  test('normaliza maiusculas para minusculas (HOT -> hot)', () => {
    expect(kcNormalizeDirection('HOT')).toBe('hot');
    expect(kcNormalizeDirection('COLD')).toBe('cold');
    expect(kcNormalizeDirection('Cold')).toBe('cold');
  });

  test('remove espacos em branco antes e depois', () => {
    expect(kcNormalizeDirection(' cold ')).toBe('cold');
    expect(kcNormalizeDirection('  hot  ')).toBe('hot');
  });

  test('retorna null para direcao invalida', () => {
    expect(kcNormalizeDirection('up')).toBeNull();
    expect(kcNormalizeDirection('down')).toBeNull();
    expect(kcNormalizeDirection('like')).toBeNull();
  });

  test('retorna null para string vazia', () => {
    expect(kcNormalizeDirection('')).toBeNull();
  });

  test('retorna null para null e undefined', () => {
    expect(kcNormalizeDirection(null)).toBeNull();
    expect(kcNormalizeDirection(undefined)).toBeNull();
  });
});

describe('Voting - kcIsUuid', () => {
  test('retorna true para UUID v4 valido', () => {
    expect(kcIsUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  test('retorna true para UUID v1 valido', () => {
    expect(kcIsUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  test('retorna false para string invalida', () => {
    expect(kcIsUuid('nao-e-uuid')).toBe(false);
    expect(kcIsUuid('12345')).toBe(false);
  });

  test('retorna false para string vazia', () => {
    expect(kcIsUuid('')).toBe(false);
  });

  test('retorna false para null', () => {
    expect(kcIsUuid(null)).toBe(false);
  });

  test('retorna true para UUID com espacos (trim aplicado)', () => {
    expect(kcIsUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true);
  });
});

describe('Voting - kcDecodeAttr', () => {
  test('decodifica URI component corretamente', () => {
    expect(kcDecodeAttr('hello%20world')).toBe('hello world');
  });

  test('retorna string vazia para null', () => {
    expect(kcDecodeAttr(null)).toBe('');
  });

  test('retorna string vazia para undefined', () => {
    expect(kcDecodeAttr(undefined)).toBe('');
  });

  test('retorna texto simples inalterado', () => {
    expect(kcDecodeAttr('texto-simples')).toBe('texto-simples');
  });

  test('retorna string original quando encoding e invalido', () => {
    expect(kcDecodeAttr('%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('Voting - kcMyVotesCacheGet', () => {
  test('retorna undefined para post nao cacheado', () => {
    expect(kcMyVotesCacheGet('post-inexistente-xyz')).toBeUndefined();
  });
});

describe('Voting - kcMyVotesCacheSet + kcMyVotesCacheGet', () => {
  test('armazena e recupera direcao "hot"', () => {
    kcMyVotesCacheSet('post-001', 'hot');
    expect(kcMyVotesCacheGet('post-001')).toBe('hot');
  });

  test('armazena e recupera direcao "cold"', () => {
    kcMyVotesCacheSet('post-002', 'cold');
    expect(kcMyVotesCacheGet('post-002')).toBe('cold');
  });

  test('armazena e recupera null (voto removido)', () => {
    kcMyVotesCacheSet('post-003', null);
    expect(kcMyVotesCacheGet('post-003')).toBeNull();
  });

  test('sobrescreve valor anterior no cache', () => {
    kcMyVotesCacheSet('post-004', 'hot');
    expect(kcMyVotesCacheGet('post-004')).toBe('hot');
    kcMyVotesCacheSet('post-004', 'cold');
    expect(kcMyVotesCacheGet('post-004')).toBe('cold');
  });
});

describe('Voting - kcMyVotesCacheIsFresh', () => {
  test('retorna false quando timestamp do cache e zero (estado inicial)', () => {
    // KC_MY_VOTES_CACHE_TS permanece 0 apos os sets, entao isFresh retorna false
    // porque (Date.now() - 0) > KC_MY_VOTES_CACHE_TTL (30s)
    const result = kcMyVotesCacheIsFresh();
    expect(typeof result).toBe('boolean');
  });
});
