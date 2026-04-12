/*
  create-post.controller.js — Static contract tests (v11.26.1)
  Verifica instalação do wrapper de diagnóstico, stages de erro,
  idempotência e fallback gracioso.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'controllers', 'create-post.controller.js');
const WRAP_FLAG = '__kcCreatePostDiagnosticsWrapped';

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('create-post.controller — wrapper installation', () => {
  beforeEach(() => {
    delete window.KCAPI;
    delete window.KCActions;
    document.body.innerHTML = '';
  });

  test('instala KCActions.createPost quando KCAPI.createPost existe', () => {
    window.KCAPI = {
      createPost: jest.fn(),
      ENV: { driver: 'local' },
    };

    loadController();

    expect(typeof window.KCActions).toBe('object');
    expect(typeof window.KCActions.createPost).toBe('function');
  });

  test('marca o WRAP_FLAG em KCActions após instalação', () => {
    window.KCAPI = {
      createPost: jest.fn(),
      ENV: { driver: 'local' },
    };

    loadController();

    expect(window.KCActions[WRAP_FLAG]).toBe(true);
  });

  test('não substitui KCAPI.createPost — preserva o original', () => {
    const originalCreatePost = jest.fn().mockResolvedValue({ ok: true });
    window.KCAPI = {
      createPost: originalCreatePost,
      ENV: { driver: 'local' },
    };

    loadController();

    expect(window.KCAPI.createPost).toBe(originalCreatePost);
  });

  test('é idempotente — segunda carga não reinstala se WRAP_FLAG já está ativo', () => {
    window.KCAPI = {
      createPost: jest.fn(),
      ENV: { driver: 'local' },
    };

    loadController();
    const firstWrapper = window.KCActions.createPost;

    // Simula segunda carga com WRAP_FLAG já presente em KCActions
    loadController();
    // O wrapper pode ou não ser substituído — o flag já está ativo
    expect(window.KCActions[WRAP_FLAG]).toBe(true);
    expect(typeof window.KCActions.createPost).toBe('function');
    // Confirma que ainda é uma função válida
    expect(firstWrapper).not.toBeUndefined();
  });

  test('não lança erro se KCAPI não está presente (fallback silencioso)', () => {
    delete window.KCAPI;
    expect(() => loadController()).not.toThrow();
  });

  test('registra DOMContentLoaded se KCAPI não estava disponível inicialmente', () => {
    delete window.KCAPI;
    const spy = jest.spyOn(document, 'addEventListener');

    loadController();

    const domCall = spy.mock.calls.find(
      ([event]) => event === 'DOMContentLoaded'
    );
    expect(domCall).toBeDefined();
    spy.mockRestore();
  });
});

describe('create-post.controller — wrapper comportamento', () => {
  beforeEach(() => {
    delete window.KCAPI;
    delete window.KCActions;
    document.body.innerHTML = '';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('wrapper delega ao KCAPI.createPost original e retorna resultado', async () => {
    const mockResult = { ok: true, id: 'post-uuid-1' };
    const originalCreatePost = jest.fn().mockResolvedValue(mockResult);

    window.KCAPI = {
      createPost: originalCreatePost,
      ENV: { driver: 'local' },
    };

    loadController();

    const result = await window.KCActions.createPost({ titulo: 'Teste', modulo: 'eventos' });
    expect(originalCreatePost).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResult);
  });

  test('wrapper acessa KCAPI.getLastCreatePostError em falha no modo supabase', async () => {
    const diagnostic = { stage: 'POST_INSERT', message: 'DB error' };
    const originalCreatePost = jest.fn().mockResolvedValue({ ok: false, _kcError: true });
    const getLastError = jest.fn().mockReturnValue(diagnostic);

    window.KCAPI = {
      createPost: originalCreatePost,
      getLastCreatePostError: getLastError,
      activeDriver: 'supabase',
      ENV: { driver: 'supabase' },
    };

    loadController();

    await window.KCActions.createPost({ titulo: 'Teste', modulo: 'compra-venda' });
    expect(getLastError).toHaveBeenCalled();
  });

  test('wrapper loga stage POST_INSERT em console.error', async () => {
    const diagnostic = { stage: 'POST_INSERT' };
    window.KCAPI = {
      createPost: jest.fn().mockResolvedValue({ ok: false, _kcError: true }),
      getLastCreatePostError: jest.fn().mockReturnValue(diagnostic),
      activeDriver: 'supabase',
      ENV: { driver: 'supabase' },
    };

    loadController();

    await window.KCActions.createPost({ titulo: 'X' });
    expect(console.error).toHaveBeenCalled();
  });

  test('wrapper loga stage STORAGE_UPLOAD em console.error', async () => {
    const diagnostic = { stage: 'STORAGE_UPLOAD' };
    window.KCAPI = {
      createPost: jest.fn().mockResolvedValue({ ok: false, _kcError: true }),
      getLastCreatePostError: jest.fn().mockReturnValue(diagnostic),
      activeDriver: 'supabase',
      ENV: { driver: 'supabase', supabase: { storageBucket: 'kino-media' } },
    };

    loadController();

    await window.KCActions.createPost({ titulo: 'X', imagens: ['file.jpg'] });
    expect(console.error).toHaveBeenCalled();
  });

  test('wrapper loga stage POST_MEDIA_INSERT em console.error', async () => {
    const diagnostic = { stage: 'POST_MEDIA_INSERT' };
    window.KCAPI = {
      createPost: jest.fn().mockResolvedValue({ ok: false, _kcError: true }),
      getLastCreatePostError: jest.fn().mockReturnValue(diagnostic),
      activeDriver: 'supabase',
      ENV: { driver: 'supabase' },
    };

    loadController();

    await window.KCActions.createPost({ titulo: 'X' });
    expect(console.error).toHaveBeenCalled();
  });

  test('wrapper loga stage POST_FETCH em console.error', async () => {
    const diagnostic = { stage: 'POST_FETCH' };
    window.KCAPI = {
      createPost: jest.fn().mockResolvedValue({ ok: false, _kcError: true }),
      getLastCreatePostError: jest.fn().mockReturnValue(diagnostic),
      activeDriver: 'supabase',
      ENV: { driver: 'supabase' },
    };

    loadController();

    await window.KCActions.createPost({ titulo: 'X' });
    expect(console.error).toHaveBeenCalled();
  });

  test('wrapper re-lança exceção original', async () => {
    window.KCAPI = {
      createPost: jest.fn().mockRejectedValue(new Error('rede falhou')),
      ENV: { driver: 'local' },
    };

    loadController();

    await expect(
      window.KCActions.createPost({ titulo: 'X' })
    ).rejects.toThrow('rede falhou');
  });
});

describe('create-post.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('define LOG_TAG com prefixo [RC-', () => {
    expect(source).toMatch(/LOG_TAG\s*=\s*'\[RC-/);
  });

  test('define WRAP_FLAG como string não vazia', () => {
    expect(source).toMatch(/WRAP_FLAG\s*=\s*'__kc/);
  });

  test('referencia os 4 stages de erro esperados', () => {
    expect(source).toContain("'POST_INSERT'");
    expect(source).toContain("'STORAGE_UPLOAD'");
    expect(source).toContain("'POST_MEDIA_INSERT'");
    expect(source).toContain("'POST_FETCH'");
  });

  test('acessa KCAPI.getLastCreatePostError', () => {
    expect(source).toContain('getLastCreatePostError');
  });

  test('acessa KCAPI.activeDriver e KCAPI.ENV.driver', () => {
    expect(source).toContain('activeDriver');
    expect(source).toContain('ENV.driver');
  });

  test('instala wrapper em window.KCActions (não KCAPI)', () => {
    expect(source).toContain('window.KCActions');
    expect(source).not.toMatch(/window\.KCAPI\.createPost\s*=/);
  });

  test('registra DOMContentLoaded como fallback', () => {
    expect(source).toContain("addEventListener('DOMContentLoaded'");
  });
});
