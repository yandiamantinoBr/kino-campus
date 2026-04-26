/*
  Suite de testes — window._KCU.dom (v12.2.2)

  Cobre o contrato estático do sub-módulo e o comportamento das 4 funções
  do domínio dom extraídas de kc-utils.js para kc-utils.dom.js.

  Estrutura:
    1. Contrato estático — namespace e shape
    2. debounce
    3. canSelectInputLike
    4. fallbackCopyText
    5. copyTextToClipboard
*/

beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/utils/kc-utils.dom.js');
});

// ─── 1. Contrato estático ────────────────────────────────────────────────────

describe('_KCU.dom — contrato estático', () => {
  test('window._KCU.dom é um objeto congelado', () => {
    expect(window._KCU).toBeDefined();
    expect(window._KCU.dom).toBeDefined();
    expect(Object.isFrozen(window._KCU.dom)).toBe(true);
  });

  test('expõe exatamente 4 funções do domínio', () => {
    const chaves = Object.keys(window._KCU.dom).sort();
    expect(chaves).toEqual([
      'canSelectInputLike',
      'copyTextToClipboard',
      'debounce',
      'fallbackCopyText',
    ]);
  });

  test('todas as entradas são funções', () => {
    Object.values(window._KCU.dom).forEach(fn => {
      expect(typeof fn).toBe('function');
    });
  });

  test('não vaza variáveis internas do IIFE', () => {
    expect(window._KCU.dom._t).toBeUndefined();
    expect(window._KCU.dom.normalized).toBeUndefined();
  });
});

// ─── 2. debounce ─────────────────────────────────────────────────────────────

describe('_KCU.dom.debounce', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.dom.debounce; });

  test('retorna uma função', () => {
    const debounced = fn(jest.fn(), 50);
    expect(typeof debounced).toBe('function');
  });

  test('chama a função original após o delay', (done) => {
    const mock = jest.fn();
    const debounced = fn(mock, 30);
    debounced();
    expect(mock).not.toHaveBeenCalled();
    setTimeout(() => {
      expect(mock).toHaveBeenCalledTimes(1);
      done();
    }, 60);
  });

  test('agrupa chamadas rápidas em uma só invocação', (done) => {
    const mock = jest.fn();
    const debounced = fn(mock, 50);
    debounced();
    debounced();
    debounced();
    setTimeout(() => {
      expect(mock).toHaveBeenCalledTimes(1);
      done();
    }, 100);
  });

  test('usa wait=120 como padrão quando omitido', () => {
    // Apenas verifica que retorna uma função sem erro
    const debounced = fn(jest.fn());
    expect(typeof debounced).toBe('function');
  });

  test('encaminha os argumentos para a função original', (done) => {
    const mock = jest.fn();
    const debounced = fn(mock, 20);
    debounced('arg1', 'arg2');
    setTimeout(() => {
      expect(mock).toHaveBeenCalledWith('arg1', 'arg2');
      done();
    }, 50);
  });
});

// ─── 3. canSelectInputLike ───────────────────────────────────────────────────

describe('_KCU.dom.canSelectInputLike', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.dom.canSelectInputLike; });

  test('retorna true para elemento INPUT', () => {
    const input = { nodeType: 1, tagName: 'INPUT' };
    expect(fn(input)).toBe(true);
  });

  test('retorna true para elemento TEXTAREA', () => {
    const ta = { nodeType: 1, tagName: 'TEXTAREA' };
    expect(fn(ta)).toBe(true);
  });

  test('retorna false para elemento DIV', () => {
    const div = { nodeType: 1, tagName: 'DIV' };
    expect(fn(div)).toBe(false);
  });

  test('retorna false para elemento BUTTON', () => {
    const btn = { nodeType: 1, tagName: 'BUTTON' };
    expect(fn(btn)).toBe(false);
  });

  test('retorna false para null/undefined', () => {
    expect(fn(null)).toBe(false);
    expect(fn(undefined)).toBe(false);
  });

  test('retorna false para nó de texto (nodeType !== 1)', () => {
    const textNode = { nodeType: 3, tagName: 'INPUT' };
    expect(fn(textNode)).toBe(false);
  });

  test('é case-insensitive no tagName', () => {
    expect(fn({ nodeType: 1, tagName: 'input' })).toBe(true);
    expect(fn({ nodeType: 1, tagName: 'textarea' })).toBe(true);
  });
});

// ─── 4. fallbackCopyText ─────────────────────────────────────────────────────

describe('_KCU.dom.fallbackCopyText', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.dom.fallbackCopyText; });

  test('retorna false para texto vazio', () => {
    expect(fn('')).toBe(false);
    expect(fn(null)).toBe(false);
  });

  test('retorna false quando documento não tem execCommand', () => {
    const fakeDoc = { body: {}, getSelection: () => null };
    // sem execCommand → retorna false
    expect(fn('texto', { document: fakeDoc })).toBe(false);
  });

  test('tenta copiar via execCommand quando disponível', () => {
    const appendedElements = [];
    const removedElements = [];
    const mockField = {
      value: '',
      setAttribute: jest.fn(),
      style: {},
      focus: jest.fn(),
      select: jest.fn(),
      setSelectionRange: jest.fn(),
      parentNode: null,
    };
    const fakeDoc = {
      body: {
        appendChild: jest.fn((el) => {
          appendedElements.push(el);
          el.parentNode = fakeDoc.body;
          fakeDoc.body.removeChild = (el) => { removedElements.push(el); };
        }),
        removeChild: jest.fn(),
      },
      activeElement: null,
      getSelection: () => null,
      createElement: jest.fn(() => mockField),
      execCommand: jest.fn(() => true),
    };

    const result = fn('Texto a copiar', { document: fakeDoc });
    expect(fakeDoc.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });
});

// ─── 5. copyTextToClipboard ──────────────────────────────────────────────────

describe('_KCU.dom.copyTextToClipboard', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.dom.copyTextToClipboard; });

  test('retorna false para texto vazio', async () => {
    const result = await fn('');
    expect(result).toBe(false);
  });

  test('retorna false para null', async () => {
    const result = await fn(null);
    expect(result).toBe(false);
  });

  test('usa Clipboard API quando disponível', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });

    const result = await fn('texto de teste');
    expect(writeText).toHaveBeenCalledWith('texto de teste');
    expect(result).toBe(true);

    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  test('cai para fallbackCopyText quando Clipboard API falha', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });

    // Sem documento real, fallbackCopyText retorna false
    const result = await fn('texto de teste');
    expect(result).toBe(false);

    delete global.navigator;
  });
});
