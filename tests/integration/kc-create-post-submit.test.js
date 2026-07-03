/**
 * @file kc-create-post-submit.test.js
 * @description Testes de contrato estático para kc-create-post.submit.js (v11.31.6).
 *
 * Estratégia: fs.readFileSync → análise de texto; sem DOM, sem eval.
 * Cobre: estrutura IIFE, registro de namespace, _getState(), handleCreateSubmit,
 * acesso ao estado, validações, construção do payload, modo edição, modo
 * supabase vs local, audit log, redirect e stubs no core.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SUBMIT_PATH = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.submit.js');
const CORE_PATH   = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.js');

let source = '';
let coreSource = '';

beforeAll(() => {
  source     = fs.readFileSync(SUBMIT_PATH, 'utf8');
  coreSource = fs.readFileSync(CORE_PATH, 'utf8');
});

// ─── 1. Arquivo e estrutura IIFE ─────────────────────────────────────────────
describe('kc-create-post.submit.js — estrutura de arquivo', () => {
  test('arquivo existe e tem tamanho substancial (>5000 chars)', () => {
    expect(source.length).toBeGreaterThan(5000);
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

// ─── 2. Helper _getState ─────────────────────────────────────────────────────
describe('kc-create-post.submit.js — _getState()', () => {
  test('define função _getState', () => {
    expect(source).toContain('function _getState()');
  });

  test('_getState acessa window._KCCreatePost._state', () => {
    const idx = source.indexOf('function _getState()');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('._state');
    expect(slice).toContain('&&');
  });
});

// ─── 3. handleCreateSubmit — presença e assinatura ───────────────────────────
describe('kc-create-post.submit.js — handleCreateSubmit', () => {
  test('define handleCreateSubmit como async function', () => {
    expect(source).toContain('async function handleCreateSubmit()');
  });

  test('obtém kcCreateState via _getState() no início', () => {
    const idx = source.indexOf('async function handleCreateSubmit()');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getState()');
    expect(slice).toContain('kcCreateState');
  });

  test('retorna early se kcCreateState é falsy', () => {
    const idx = source.indexOf('async function handleCreateSubmit()');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('if (!kcCreateState) return;');
  });

  test('retorna early se submitting já é true', () => {
    const idx = source.indexOf('async function handleCreateSubmit()');
    const slice = source.slice(idx, idx + 400);
    expect(slice).toContain('kcCreateState.submitting === true');
    expect(slice).toContain('return;');
  });
});

// ─── 4. Captura e validação de formulário ─────────────────────────────────────
describe('kc-create-post.submit.js — captura e validação', () => {
  test('chama kcCaptureCreateValues()', () => {
    expect(source).toContain('kcCaptureCreateValues()');
  });

  test('procura o formulário por ID kcCreatePostForm', () => {
    expect(source).toContain("document.getElementById('kcCreatePostForm')");
  });

  test('desabilita submitBtn durante o envio', () => {
    expect(source).toContain('submitBtn.disabled = true;');
  });

  test('chama kcGetSchema para obter o schema do módulo', () => {
    expect(source).toContain('kcGetSchema(kcCreateState.moduleKey)');
  });

  test('valida tags obrigatórias antes de enviar', () => {
    expect(source).toContain('schema.tagGroups');
    expect(source).toContain('g.required');
    expect(source).toContain("showToast('Selecione: '");
  });

  test('valida campos de moeda (preco, orcamento, recompensa, contribuicao, remuneracao)', () => {
    expect(source).toContain("'preco', 'orcamento', 'recompensa', 'contribuicao', 'remuneracao'");
    expect(source).toContain('kcNormalizeMoneyInput(raw)');
  });

  test('usa form.checkValidity() para validação HTML5', () => {
    expect(source).toContain('form.checkValidity()');
    expect(source).toContain('form.reportValidity()');
  });
});

// ─── 5. Campos ativos e payload ──────────────────────────────────────────────
describe('kc-create-post.submit.js — campos ativos e payload', () => {
  test('chama kcGetActiveCreateFieldNames com moduleKey, selections e values', () => {
    expect(source).toContain('kcGetActiveCreateFieldNames(');
    expect(source).toContain('kcCreateState.moduleKey,');
    expect(source).toContain('kcCreateState.selections,');
    expect(source).toContain('kcCreateState.values');
  });

  test('lê campos ativos via kcReadActiveCreateStringValue', () => {
    expect(source).toContain('kcReadActiveCreateStringValue(');
  });

  test('lê campos de array via kcReadActiveCreateArrayValue', () => {
    expect(source).toContain('kcReadActiveCreateArrayValue(');
  });

  test('lê campos booleanos via kcReadActiveCreateBooleanValue', () => {
    expect(source).toContain('kcReadActiveCreateBooleanValue(');
  });

  test('constrói objeto payload com campo modulo', () => {
    expect(source).toContain('modulo: kcCreateState.moduleKey,');
  });

  test('payload contém campos categoria e subcategoria', () => {
    expect(source).toContain('categoriaKey:');
    expect(source).toContain('subcategoriaKey:');
  });

  test('payload contém tags e tagKeys', () => {
    expect(source).toContain('tags: tagLabels,');
    expect(source).toContain('tagKeys,');
  });

  test('payload contém titulo e descricao', () => {
    expect(source).toContain('titulo: title,');
    expect(source).toContain('descricao: desc,');
  });

  test('payload preserva localizacao e location para edicao/leitura normalizada', () => {
    expect(source).toContain('const persistedLocation =');
    expect(source).toContain('localizacao: persistedLocation,');
    expect(source).toContain('location: persistedLocation,');
  });

  test('payload contém metadado com subcategory para filtros', () => {
    expect(source).toContain('metadata: {');
    expect(source).toContain('subcategory: filterSubKey');
  });

  test('metadata preserva aliases localizacao/location', () => {
    const idx = source.indexOf('lostFoundLocationEmoji:');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('localizacao: persistedLocation,');
    expect(slice).toContain('location: persistedLocation,');
  });

  test('obtém imagens via kcGetOrderedCreateImages()', () => {
    expect(source).toContain('kcGetOrderedCreateImages()');
  });

  test('normaliza visibilidade via kcNormalizePostVisibilityValue()', () => {
    expect(source).toContain('kcNormalizePostVisibilityValue(');
  });

  test('eventos: persiste data_fim_evento e valida término >= início', () => {
    expect(source).toContain("data_fim_evento: (kcCreateState.moduleKey === 'eventos')");
    expect(source).toContain("kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'data_fim', '')");
    expect(source).toContain('A data de término não pode ser anterior à data de início.');
  });
});

// ─── 6. Resolvers de domínio ─────────────────────────────────────────────────
describe('kc-create-post.submit.js — uso de resolvers', () => {
  test('usa kcNormalizeOpportunityTypeKey', () => {
    expect(source).toContain('kcNormalizeOpportunityTypeKey(');
  });

  test('usa kcNormalizeHousingTypeKey', () => {
    expect(source).toContain('kcNormalizeHousingTypeKey(');
  });

  test('usa kcResolveOpportunityAreaValue', () => {
    expect(source).toContain('kcResolveOpportunityAreaValue(');
  });

  test('usa kcResolveHousingRegionValue', () => {
    expect(source).toContain('kcResolveHousingRegionValue(');
  });

  test('usa kcResolveHousingFeatureValues', () => {
    expect(source).toContain('kcResolveHousingFeatureValues(');
  });

  test('usa kcResolveLostFoundLocationValue', () => {
    expect(source).toContain('kcResolveLostFoundLocationValue(');
  });

  test('usa kcResolveOpportunityWorkMode', () => {
    expect(source).toContain('kcResolveOpportunityWorkMode(');
  });

  test('usa kcResolveOpportunityRegime', () => {
    expect(source).toContain('kcResolveOpportunityRegime(');
  });

  test('usa kcResolveCaronasLocationValue para audit log', () => {
    expect(source).toContain('kcResolveCaronasLocationValue(');
  });

  test('usa kcParseBRLNumber para campos monetários', () => {
    expect(source).toContain('kcParseBRLNumber(');
  });

  test('usa kcTagLabel para montar tagMap', () => {
    expect(source).toContain('kcTagLabel(schema,');
  });
});

// ─── 7. Modo edição ──────────────────────────────────────────────────────────
describe('kc-create-post.submit.js — modo edição', () => {
  test('detecta editMode e editPostId', () => {
    expect(source).toContain('kcCreateState.editMode && kcCreateState.editPostId');
  });

  test('chama KCAPI.updatePost em modo edição', () => {
    expect(source).toContain('KCAPI.updatePost(kcCreateState.editPostId, payload)');
  });

  test('chama kcCloseCreatePostModal após edição bem-sucedida', () => {
    expect(source).toContain('kcCloseCreatePostModal()');
  });

  test("exibe toast 'Publicação atualizada com sucesso!' no modo edição", () => {
    expect(source).toContain("'Publicação atualizada com sucesso!'");
  });
});

// ─── 8. Modo criação (Supabase vs local) ─────────────────────────────────────
describe('kc-create-post.submit.js — modo criação', () => {
  test('detecta driver Supabase via KCAPI.activeDriver', () => {
    expect(source).toContain("KCAPI.activeDriver === 'supabase'");
  });

  test('chama isProductionRuntime() para guard de produção', () => {
    expect(source).toContain('isProductionRuntime()');
  });

  test('verifica duplicata via KCAPI.checkDuplicatePost', () => {
    expect(source).toContain('KCAPI.checkDuplicatePost(');
  });

  test("verifica flag _kcError no retorno de createPost", () => {
    expect(source).toContain('post._kcError');
  });

  test('verifica flag _kcPending (moderação)', () => {
    expect(source).toContain('post._kcPending');
  });

  test('chama kcCreateUserPost no modo local sem API', () => {
    expect(source).toContain('kcCreateUserPost(payload)');
  });

  test("exibe toast 'Publicado com sucesso!'", () => {
    expect(source).toContain("'Publicado com sucesso!'");
  });
});

// ─── 9. Audit log e redirect ─────────────────────────────────────────────────
describe('kc-create-post.submit.js — audit log e redirect', () => {
  test("insere na tabela 'audit_log'", () => {
    expect(source).toContain("'audit_log'");
    expect(source).toContain("action: 'post_created'");
  });

  test("chama kc_increment_location_usage para caronas", () => {
    expect(source).toContain("'kc_increment_location_usage'");
  });

  test("chama kc_upsert_custom_location para locais custom", () => {
    expect(source).toContain("'kc_upsert_custom_location'");
  });

  test('redireciona para kcModulePage após publicação', () => {
    expect(source).toContain('kcModulePage(kcCreateState.moduleKey)');
  });

  test('redireciona com filter para compra-venda', () => {
    expect(source).toContain("'filter=' + encodeURIComponent(catKey)");
  });

  test('redireciona com hash para outros módulos', () => {
    expect(source).toContain("'#' + encodeURIComponent(catKey)");
  });
});

// ─── 10. Tratamento de erros e finally ───────────────────────────────────────
describe('kc-create-post.submit.js — tratamento de erros', () => {
  test('tem bloco try/catch externo', () => {
    expect(source).toContain("console.error('[KinoCampus] Erro inesperado no submit de criação:'");
  });

  test('tem bloco finally que reseta submitting', () => {
    expect(source).toContain('kcCreateState.submitting = false;');
  });

  test('bloco finally reabilita o submitBtn', () => {
    const idx = source.indexOf('kcCreateState.submitting = false;');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('submitBtn.disabled = false;');
  });
});

// ─── 11. Namespace window._KCCreatePost.submit ───────────────────────────────
describe('kc-create-post.submit.js — registro de namespace', () => {
  test('registra window._KCCreatePost.submit', () => {
    expect(source).toContain('window._KCCreatePost.submit =');
  });

  test('expõe handleCreateSubmit no namespace', () => {
    const idx = source.indexOf('window._KCCreatePost.submit =');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('handleCreateSubmit,');
  });
});

// ─── 12. kc-create-post.js — stubs de delegação ──────────────────────────────
describe('kc-create-post.js — stub _kcSubmitModule + kcHandleCreateSubmit', () => {
  test('define _kcSubmitModule()', () => {
    expect(coreSource).toContain('function _kcSubmitModule()');
  });

  test('_kcSubmitModule acessa window._KCCreatePost.submit', () => {
    const idx = coreSource.indexOf('function _kcSubmitModule()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('.submit');
  });

  test('stub kcHandleCreateSubmit delega para s.handleCreateSubmit', () => {
    const idx = coreSource.indexOf('async function kcHandleCreateSubmit()');
    const slice = coreSource.slice(idx, idx + 300);
    expect(slice).toContain('_kcSubmitModule()');
    expect(slice).toContain('s.handleCreateSubmit');
  });

  test('stub kcHandleCreateSubmit retorna undefined como fallback', () => {
    const idx = coreSource.indexOf('async function kcHandleCreateSubmit()');
    const slice = coreSource.slice(idx, idx + 300);
    expect(slice).toContain(': undefined');
  });

  test('não contém mais a implementação de kcHandleCreateSubmit no core', () => {
    // Strings exclusivas do corpo original que não aparecem em outros lugares
    expect(coreSource).not.toContain("'Publicado com sucesso!'");
    expect(coreSource).not.toContain("'audit_log'");
    expect(coreSource).not.toContain('checkDuplicatePost(');
    expect(coreSource).not.toContain('_kcPending');
  });

  test('ainda contém comentário de extração v11.31.6', () => {
    expect(coreSource).toContain('kc-create-post.submit.js (v11.31.6)');
  });
});
