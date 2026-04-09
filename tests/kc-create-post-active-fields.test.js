const fs = require('fs');
const path = require('path');

describe('kc-create-post active field gating', () => {
  const filePath = path.resolve(__dirname, '..', 'assets', 'js', 'kc-create-post.js');

  beforeAll(() => {
    global.window = global.window || global;
    global.KC_ENV = { isProduction: false };
    global.KCUtils = {
      escapeHtml: (value) => String(value == null ? '' : value),
      canonicalCategory: (value) => String(value || '').trim().toLowerCase(),
    };
    global.showToast = jest.fn();

    const code = fs.readFileSync(filePath, 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('compra-venda keeps preco active and drops condicao when action switches to compro', () => {
    const activeNames = kcGetActiveCreateFieldNames(
      'compra-venda',
      { categoria: 'livros', acao: 'compro' },
      { preco: '40,00', condicao: 'Usado', localizacao: 'Campus Samambaia' }
    );

    expect(activeNames.has('preco')).toBe(true);
    expect(activeNames.has('localizacao')).toBe(true);
    expect(activeNames.has('condicao')).toBe(false);
    expect(
      kcReadActiveCreateStringValue(activeNames, { preco: '40,00', condicao: 'Usado' }, 'condicao', '')
    ).toBe('');
  });

  test('caronas removes vagas from the active submit surface when tipo is procuro', () => {
    const activeNames = kcGetActiveCreateFieldNames(
      'caronas',
      { tipo: 'procuro' },
      { vagas: '3', origem: 'Campus Samambaia', destino: 'Centro' }
    );

    expect(activeNames.has('origem')).toBe(true);
    expect(activeNames.has('destino')).toBe(true);
    expect(activeNames.has('vagas')).toBe(false);
    expect(
      kcReadActiveCreateStringValue(activeNames, { vagas: '3' }, 'vagas', '')
    ).toBe('');
  });

  test('eventos hides preco from active fields when gratuito is checked', () => {
    const activeNames = kcGetActiveCreateFieldNames(
      'eventos',
      { topico: 'culturais' },
      { gratuito: true, preco: '25,00', link: 'https://kinocampus.com.br' }
    );

    expect(activeNames.has('gratuito')).toBe(true);
    expect(activeNames.has('link')).toBe(true);
    expect(activeNames.has('preco')).toBe(false);
    expect(
      kcReadActiveCreateStringValue(activeNames, { preco: '25,00' }, 'preco', '')
    ).toBe('');
  });

  test('submit path derives active field names before building the payload', () => {
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('const activeFieldNames = kcGetActiveCreateFieldNames(');
    expect(source).toContain("const activeCondicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'condicao', '');");
    expect(source).toContain("const activeOrcamento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'orcamento', '');");
    expect(source).toContain("const activeRegimeContratacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regimeContratacao', '');");
  });
});
