/**
 * @file kc-api-diagnostics-module.test.js
 * @description Contract tests for assets/js/api/kc-api.diagnostics.js (V76)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.diagnostics.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => (
  page !== 'admin/cadu.html'
)));

let source;

function loadFreshDiagnostics() {
  jest.resetModules();
  global.window = {};
  require('../../assets/js/api/kc-api.diagnostics.js');
  return window._KCAPI.diagnostics;
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

describe('kc-api.diagnostics.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno congelado', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.diagnostics = Object.freeze({');
    expect(source.trim().endsWith('}());')).toBe(true);
  });

  test('nao cria nova fachada publica nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });
});

describe('kc-api.diagnostics.js - public module contract', () => {
  let diagnostics;

  beforeEach(() => {
    diagnostics = loadFreshDiagnostics();
  });

  test('exporta os 5 metodos de diagnostico esperados', () => {
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.keys(diagnostics).sort()).toEqual([
      'clearLastCreatePostError',
      'getLastCreatePostError',
      'normalizeErrorForDiagnostics',
      'setLastCreatePostError',
      'summarizeCreatePayloadForDiagnostics',
    ]);
  });

  test('normaliza erro nulo, string e objeto mantendo o contrato anterior', () => {
    expect(diagnostics.normalizeErrorForDiagnostics(null)).toEqual({
      message: 'Erro desconhecido.',
      code: 'UNKNOWN',
      details: null,
      hint: null,
    });
    expect(diagnostics.normalizeErrorForDiagnostics('Formato invalido')).toEqual({
      message: 'Formato invalido',
      code: 'ERROR_STRING',
      details: null,
      hint: null,
    });
    expect(diagnostics.normalizeErrorForDiagnostics({
      msg: 'Falha no RPC',
      code: ' P0001 ',
      details: { field: 'moduleDB' },
      hint: 'Revise payload',
    })).toEqual({
      message: 'Falha no RPC',
      code: 'P0001',
      details: { field: 'moduleDB' },
      hint: 'Revise payload',
    });
  });

  test('resume payload de create-post com os mesmos campos publicos', () => {
    expect(diagnostics.summarizeCreatePayloadForDiagnostics({
      moduleDB: 'moradia',
      categoryDB: 'aluguel',
      subcategoryDB: 'quarto',
      title: 'Republica perto do campus',
      description: 'Descricao longa',
      images: ['a.jpg', 'b.jpg'],
    })).toEqual({
      moduleDB: 'moradia',
      categoryDB: 'aluguel',
      subcategoryDB: 'quarto',
      titleLength: 25,
      descriptionLength: 15,
      imagesCount: 2,
    });

    expect(diagnostics.summarizeCreatePayloadForDiagnostics(null)).toEqual({
      moduleDB: '',
      categoryDB: '',
      subcategoryDB: '',
      titleLength: 0,
      descriptionLength: 0,
      imagesCount: 0,
    });
  });

  test('set/get preserva payload congelado e get retorna copia', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = diagnostics.setLastCreatePostError(
      'INSERT',
      { msg: 'Falha no insert', code: '23505', details: { table: 'posts' }, hint: 'id duplicado' },
      { moduleDB: 'moradia' },
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toMatchObject({
      stage: 'INSERT',
      message: 'Falha no insert',
      code: '23505',
      details: { table: 'posts' },
      hint: 'id duplicado',
      context: { moduleDB: 'moradia' },
    });
    expect(result.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

    const read = diagnostics.getLastCreatePostError();
    expect(read).toEqual(result);
    expect(read).not.toBe(result);
    expect(errorSpy).toHaveBeenCalledWith('[KCAPI][Supabase] createPost falhou:', result);
    errorSpy.mockRestore();
  });

  test('clear reseta estado e contexto nao-objeto continua nulo', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = diagnostics.setLastCreatePostError(null, 'erro', 'contexto-string');

    expect(result.stage).toBe('EXCEPTION');
    expect(result.context).toBeNull();
    expect(diagnostics.getLastCreatePostError()).toEqual(result);

    diagnostics.clearLastCreatePostError();
    expect(diagnostics.getLastCreatePostError()).toBeNull();
    errorSpy.mockRestore();
  });
});

describe('kc-api.diagnostics.js - html loading order', () => {
  test('os carregadores reais incluem diagnostics antes de kc-api.client.js', () => {
    HTML_FILES_WITH_CLIENT.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const diagnosticsIdx = html.indexOf('kc-api.diagnostics.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(diagnosticsIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(diagnosticsIdx).toBeLessThan(clientIdx);
    });
  });
});
