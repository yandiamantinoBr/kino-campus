/**
 * @file kc-create-post-fields.test.js
 * @description Testes de contrato estático para kc-create-post.fields.js (v11.31.5).
 *
 * Estratégia: fs.readFileSync → análise de texto; sem DOM, sem eval.
 * Cobre: estrutura IIFE, registro de namespace, _getResolvers(), kcBuildFieldsForModule,
 * cobertura de todos os moduleKeys, moneyFieldMeta, delegação defensiva a resolvers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FIELDS_PATH = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.fields.js');
const CORE_PATH   = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.js');

let source = '';
let coreSource = '';

beforeAll(() => {
  source     = fs.readFileSync(FIELDS_PATH, 'utf8');
  coreSource = fs.readFileSync(CORE_PATH, 'utf8');
});

// ─── 1. Arquivo e estrutura IIFE ─────────────────────────────────────────────
describe('kc-create-post.fields.js — estrutura de arquivo', () => {
  test('arquivo existe e não está vazio', () => {
    expect(source.length).toBeGreaterThan(500);
  });

  test('inicia com bloco de documentação JSDoc', () => {
    expect(source.trimStart()).toMatch(/^\/\*\*/);
  });

  test('contém IIFE com "use strict"', () => {
    expect(source).toContain("(function () {");
    expect(source).toContain("'use strict';");
  });

  test('IIFE é auto-invocada corretamente', () => {
    expect(source).toContain('})();');
  });

  test('cria ou reutiliza window._KCCreatePost namespace', () => {
    expect(source).toContain("window._KCCreatePost = window._KCCreatePost || {};");
  });
});

// ─── 2. Helper _getResolvers ─────────────────────────────────────────────────
describe('kc-create-post.fields.js — _getResolvers()', () => {
  test('define função _getResolvers', () => {
    expect(source).toContain('function _getResolvers()');
  });

  test('_getResolvers acessa window._KCCreatePost.resolvers', () => {
    const idx = source.indexOf('function _getResolvers()');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('.resolvers');
  });

  test('_getResolvers usa acesso defensivo (&&)', () => {
    const idx = source.indexOf('function _getResolvers()');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('&&');
  });
});

// ─── 3. kcBuildFieldsForModule — presença e assinatura ───────────────────────
describe('kc-create-post.fields.js — kcBuildFieldsForModule', () => {
  test('define função kcBuildFieldsForModule com 3 parâmetros', () => {
    expect(source).toContain('function kcBuildFieldsForModule(moduleKey, selections, values)');
  });

  test('retorna array fields', () => {
    expect(source).toContain('return fields;');
  });

  test('usa _getResolvers() no início da função', () => {
    const idx = source.indexOf('function kcBuildFieldsForModule(');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getResolvers()');
  });

  test('define moneyFieldMeta com inputmode decimal', () => {
    expect(source).toContain("inputmode: 'decimal'");
    expect(source).toContain('moneyFieldMeta');
  });

  test('define moneyFieldMeta com pattern de moeda brasileira', () => {
    expect(source).toContain("pattern: '^\\\\d{1,3}(?:\\\\.\\\\d{3})*");
  });
});

// ─── 4. Campos comuns (sempre presentes) ─────────────────────────────────────
describe('kc-create-post.fields.js — campos comuns', () => {
  test('empurra campo titulo com maxLength 80', () => {
    expect(source).toContain("name: 'titulo'");
    expect(source).toContain('maxLength: 80');
  });

  test('empurra campo descricao como textarea', () => {
    expect(source).toContain("name: 'descricao'");
    expect(source).toContain("type: 'textarea'");
  });

  test('descricao tem maxLength 2000', () => {
    expect(source).toContain('maxLength: 2000');
  });
});

// ─── 5. Módulo compra-venda ───────────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo compra-venda', () => {
  test("cobre o moduleKey 'compra-venda'", () => {
    expect(source).toContain("moduleKey === 'compra-venda'");
  });

  test('inclui campo localizacao para compra-venda', () => {
    const idx = source.indexOf("moduleKey === 'compra-venda'");
    const slice = source.slice(idx, idx + 600);
    expect(slice).toContain("name: 'localizacao'");
  });

  test('inclui campo preco para compra-venda', () => {
    const idx = source.indexOf("moduleKey === 'compra-venda'");
    const slice = source.slice(idx, idx + 800);
    expect(slice).toContain("name: 'preco'");
  });

  test('inclui campo condicao (select) para acao vendo', () => {
    const idx = source.indexOf("moduleKey === 'compra-venda'");
    const slice = source.slice(idx, idx + 800);
    expect(slice).toContain("name: 'condicao'");
    expect(slice).toContain("options: ['Novo', 'Semi-novo', 'Usado']");
  });

  test("ramifica em acao === 'vendo' vs compra", () => {
    const idx = source.indexOf("moduleKey === 'compra-venda'");
    const slice = source.slice(idx, idx + 600);
    expect(slice).toContain("selections.acao");
    expect(slice).toContain("'vendo'");
  });
});

// ─── 6. Módulo caronas ───────────────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo caronas', () => {
  test("cobre o moduleKey 'caronas'", () => {
    expect(source).toContain("moduleKey === 'caronas'");
  });

  test('delega getCaronasCampusOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 400);
    expect(slice).toContain('getCaronasCampusOptions');
  });

  test('delega getCaronasFeatureOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('getCaronasFeatureOptions');
  });

  test('inclui campos origem e destino (housing-region)', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 900);
    expect(slice).toContain("name: 'origem'");
    expect(slice).toContain("name: 'destino'");
  });

  test('inclui campo horario (time)', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 1000);
    expect(slice).toContain("name: 'horario'");
    expect(slice).toContain("type: 'time'");
  });

  test('inclui campo marcadoresCarona (housing-features)', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 1600);
    expect(slice).toContain("name: 'marcadoresCarona'");
    expect(slice).toContain("type: 'housing-features'");
  });

  test("adiciona campo vagas apenas para tipo 'ofereco'", () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 1600);
    expect(slice).toContain("selections.tipo === 'ofereco'");
    expect(slice).toContain("name: 'vagas'");
  });

  test('inclui notice de validade de 7 dias', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 2000);
    expect(slice).toContain("type: 'notice'");
    expect(slice).toContain('7 dias');
  });
});

// ─── 7. Módulo moradia ───────────────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo moradia', () => {
  test("cobre o moduleKey 'moradia'", () => {
    expect(source).toContain("moduleKey === 'moradia'");
  });

  test('delega getHousingRegionOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 400);
    expect(slice).toContain('getHousingRegionOptions');
  });

  test('delega getHousingFeatureOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('getHousingFeatureOptions');
  });

  test("ramifica em tipo 'procurando' vs oferta", () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 700);
    expect(slice).toContain("selections.tipo");
    expect(slice).toContain("'procurando'");
  });

  test('inclui campo regiao (housing-region)', () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 1500);
    expect(slice).toContain("name: 'regiao'");
    expect(slice).toContain("type: 'housing-region'");
  });

  test('inclui campo marcadoresMoradia (housing-features)', () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 1500);
    expect(slice).toContain("name: 'marcadoresMoradia'");
  });

  test('inclui campo orcamento (procurando) e preco (oferta)', () => {
    const idx = source.indexOf("moduleKey === 'moradia'");
    const slice = source.slice(idx, idx + 2000);
    expect(slice).toContain("name: 'orcamento'");
    expect(slice).toContain("name: 'preco'");
  });
});

// ─── 8. Módulo eventos ───────────────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo eventos', () => {
  test("cobre o moduleKey 'eventos'", () => {
    expect(source).toContain("moduleKey === 'eventos'");
  });

  test('inclui campo localizacao, data e hora', () => {
    const idx = source.indexOf("moduleKey === 'eventos'");
    const slice = source.slice(idx, idx + 600);
    expect(slice).toContain("name: 'localizacao'");
    expect(slice).toContain("name: 'data'");
    expect(slice).toContain("name: 'hora'");
  });

  test('inclui campo link e link_as_cta', () => {
    const idx = source.indexOf("moduleKey === 'eventos'");
    const slice = source.slice(idx, idx + 800);
    expect(slice).toContain("name: 'link'");
    expect(slice).toContain("name: 'link_as_cta'");
  });

  test('inclui checkbox gratuito', () => {
    const idx = source.indexOf("moduleKey === 'eventos'");
    const slice = source.slice(idx, idx + 900);
    expect(slice).toContain("name: 'gratuito'");
    expect(slice).toContain("type: 'checkbox'");
  });

  test('adiciona campo preco apenas se não gratuito', () => {
    const idx = source.indexOf("moduleKey === 'eventos'");
    const slice = source.slice(idx, idx + 1100);
    expect(slice).toContain('values.gratuito');
    expect(slice).toContain("name: 'preco'");
  });
});

// ─── 9. Módulo achados-perdidos ───────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo achados-perdidos', () => {
  test("cobre o moduleKey 'achados-perdidos'", () => {
    expect(source).toContain("moduleKey === 'achados-perdidos'");
  });

  test('delega getLostFoundLocationOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'achados-perdidos'");
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('getLostFoundLocationOptions');
  });

  test('inclui campo localizacao (achados-location)', () => {
    const idx = source.indexOf("moduleKey === 'achados-perdidos'");
    const slice = source.slice(idx, idx + 600);
    expect(slice).toContain("name: 'localizacao'");
    expect(slice).toContain("type: 'achados-location'");
  });

  test("inclui recompensa para status 'perdidos'", () => {
    const idx = source.indexOf("moduleKey === 'achados-perdidos'");
    const slice = source.slice(idx, idx + 800);
    expect(slice).toContain("selections.status === 'perdidos'");
    expect(slice).toContain("name: 'recompensa'");
  });

  test("inclui campo entrega para status 'encontrados'", () => {
    const idx = source.indexOf("moduleKey === 'achados-perdidos'");
    const slice = source.slice(idx, idx + 900);
    expect(slice).toContain("name: 'entrega'");
  });
});

// ─── 10. Módulo oportunidades ────────────────────────────────────────────────
describe('kc-create-post.fields.js — módulo oportunidades', () => {
  test("cobre o moduleKey 'oportunidades'", () => {
    expect(source).toContain("moduleKey === 'oportunidades'");
  });

  test('delega getOpportunityAreaOptions ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('getOpportunityAreaOptions');
  });

  test('delega normalizeOpportunityTypeKey ao módulo resolvers', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 600);
    expect(slice).toContain('normalizeOpportunityTypeKey');
  });

  test('inclui campo areaAtuacao (opportunity-area)', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 800);
    expect(slice).toContain("name: 'areaAtuacao'");
    expect(slice).toContain("type: 'opportunity-area'");
  });

  test('inclui campo modalidadeTrabalho (select)', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 1000);
    expect(slice).toContain("name: 'modalidadeTrabalho'");
    expect(slice).toContain("options: ['Remoto', 'Híbrido', 'Presencial']");
  });

  test("inclui regimeContratacao apenas para tipo 'emprego'", () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 1200);
    expect(slice).toContain("'emprego'");
    expect(slice).toContain("name: 'regimeContratacao'");
  });

  test('inclui campo contato obrigatório', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 1500);
    expect(slice).toContain("name: 'contato'");
  });

  test('inclui campo remuneracao e link opcionais', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 1800);
    expect(slice).toContain("name: 'remuneracao'");
    expect(slice).toContain("name: 'link'");
  });
});

// ─── 11. Namespace window._KCCreatePost.fields ───────────────────────────────
describe('kc-create-post.fields.js — registro de namespace', () => {
  test('registra window._KCCreatePost.fields', () => {
    expect(source).toContain('window._KCCreatePost.fields =');
  });

  test('expõe buildFieldsForModule no namespace', () => {
    const idx = source.indexOf('window._KCCreatePost.fields =');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('buildFieldsForModule: kcBuildFieldsForModule');
  });
});

// ─── 12. Delegação defensiva (safe fallbacks) ─────────────────────────────────
describe('kc-create-post.fields.js — delegação defensiva a resolvers', () => {
  test('usa guard (r && typeof r.getCaronasCampusOptions === "function")', () => {
    expect(source).toContain("typeof r.getCaronasCampusOptions === 'function'");
  });

  test('usa guard (r && typeof r.getCaronasFeatureOptions === "function")', () => {
    expect(source).toContain("typeof r.getCaronasFeatureOptions === 'function'");
  });

  test('usa guard (r && typeof r.getHousingRegionOptions === "function")', () => {
    expect(source).toContain("typeof r.getHousingRegionOptions === 'function'");
  });

  test('usa guard (r && typeof r.getHousingFeatureOptions === "function")', () => {
    expect(source).toContain("typeof r.getHousingFeatureOptions === 'function'");
  });

  test('usa guard (r && typeof r.getLostFoundLocationOptions === "function")', () => {
    expect(source).toContain("typeof r.getLostFoundLocationOptions === 'function'");
  });

  test('usa guard (r && typeof r.getOpportunityAreaOptions === "function")', () => {
    expect(source).toContain("typeof r.getOpportunityAreaOptions === 'function'");
  });

  test('usa guard (r && typeof r.normalizeOpportunityTypeKey === "function")', () => {
    expect(source).toContain("typeof r.normalizeOpportunityTypeKey === 'function'");
  });

  test('fallback para array vazio quando resolvers indisponível (caronas)', () => {
    const idx = source.indexOf("moduleKey === 'caronas'");
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain(': []');
  });

  test('fallback normalizeOpportunityTypeKey para função inline', () => {
    const idx = source.indexOf("moduleKey === 'oportunidades'");
    const slice = source.slice(idx, idx + 700);
    expect(slice).toContain('function (v)');
    expect(slice).toContain("String(v || '').trim().toLowerCase()");
  });
});

// ─── 13. kc-create-post.js — stubs de delegação ──────────────────────────────
describe('kc-create-post.js — stub _kcFieldsModule + kcBuildFieldsForModule', () => {
  test('define _kcFieldsModule()', () => {
    expect(coreSource).toContain('function _kcFieldsModule()');
  });

  test('_kcFieldsModule acessa window._KCCreatePost.fields', () => {
    const idx = coreSource.indexOf('function _kcFieldsModule()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('.fields');
  });

  test('stub kcBuildFieldsForModule delega para f.buildFieldsForModule', () => {
    const idx = coreSource.indexOf('function kcBuildFieldsForModule(');
    const slice = coreSource.slice(idx, idx + 300);
    expect(slice).toContain('_kcFieldsModule()');
    expect(slice).toContain('f.buildFieldsForModule');
    expect(slice).toContain('moduleKey, selections, values');
  });

  test('stub kcBuildFieldsForModule retorna [] como fallback', () => {
    const idx = coreSource.indexOf('function kcBuildFieldsForModule(');
    const slice = coreSource.slice(idx, idx + 300);
    expect(slice).toContain(': []');
  });

  test('não contém mais campos exclusivos da implementação de kcBuildFieldsForModule no core', () => {
    // Strings exclusivas do corpo de kcBuildFieldsForModule (não aparecem em outro lugar no core)
    expect(coreSource).not.toContain("'Livro de Cálculo Vol. 1'");
    expect(coreSource).not.toContain("'Horário de saída'");
    expect(coreSource).not.toContain("'Região desejada'");
    expect(coreSource).not.toContain("'Centro de Eventos'");
    expect(coreSource).not.toContain("'Biblioteca Central'");
    expect(coreSource).not.toContain("'Cidade/Campus (opcional)'");
  });

  test('ainda contém comentário de extração v11.31.5', () => {
    expect(coreSource).toContain('kc-create-post.fields.js (v11.31.5)');
  });
});
