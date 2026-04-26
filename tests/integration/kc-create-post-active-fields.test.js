const fs = require('fs');
const path = require('path');

describe('kc-create-post active field gating', () => {
  const filePath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'kc-create-post.js');

  beforeAll(() => {
    global.window = global.window || global;
    global.KC_ENV = { isProduction: false };
    global.KCUtils = {
      escapeHtml: (value) => String(value == null ? '' : value),
      canonicalCategory: (value) => String(value || '').trim().toLowerCase(),
    };
    global.KC_CONSTANTS = {};
    global.showToast = jest.fn();

    // Carrega o core primeiro (registra window._KCCreatePost namespace e stubs)
    const code = fs.readFileSync(filePath, 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);

    // Carrega o sub-módulo fields (registra window._KCCreatePost.fields)
    // necessário após v11.31.5 pois kcBuildFieldsForModule delega para esse módulo.
    const fieldsPath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'kc-create-post.fields.js');
    const fieldsCode = fs.readFileSync(fieldsPath, 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(fieldsCode);
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
    // v11.31.6: submit pipeline extraído para kc-create-post.submit.js
    const submitPath = path.resolve(__dirname, '..', '..', 'assets', 'js', 'kc-create-post.submit.js');
    const submitSource = fs.readFileSync(submitPath, 'utf8');

    expect(submitSource).toContain('const activeFieldNames = kcGetActiveCreateFieldNames(');
    expect(submitSource).toContain("const activeCondicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'condicao', '');");
    expect(submitSource).toContain("const activeOrcamento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'orcamento', '');");
    expect(submitSource).toContain("const activeRegimeContratacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regimeContratacao', '');");
  });
});
