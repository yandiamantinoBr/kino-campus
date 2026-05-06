/**
 * @file product.report.test.js
 * @description Static contract tests for product.report.js (v11.30.10)
 * Verifica estrutura IIFE, namespace _KCProduct.report, lazy esc, REPORT_REASONS,
 * wireReportButton e buildReportPopover.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.resolve(__dirname, '../../assets/js/controllers/public/product.report.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(REPORT_PATH, 'utf8');
});

describe('product.report.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
  });

  test('registra window._KCProduct.report no final do IIFE', () => {
    expect(source).toContain('window._KCProduct.report = {');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
  });
});

describe('product.report.js — utilitário esc', () => {
  test('define esc() delegando a window.KCUtils.escapeHtml', () => {
    expect(source).toContain('function esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });
});

describe('product.report.js — REPORT_REASONS', () => {
  test('define REPORT_REASONS com 7 motivos', () => {
    expect(source).toContain('var REPORT_REASONS = [');
    expect(source).toContain("value: 'spam'");
    expect(source).toContain("value: 'scam'");
    expect(source).toContain("value: 'inappropriate'");
    expect(source).toContain("value: 'hate'");
    expect(source).toContain("value: 'illegal'");
    expect(source).toContain("value: 'duplicate'");
    expect(source).toContain("value: 'other'");
    expect(source).toContain("value: 'post_closed'");
  });

  test('motivos têm label e icon', () => {
    expect(source).toContain("label: 'Spam / conteúdo repetitivo'");
    expect(source).toContain("label: 'Golpe / fraude'");
    expect(source).toContain("icon: 'fas fa-ban'");
    expect(source).toContain("icon: 'fas fa-exclamation-triangle'");
  });
});

describe('product.report.js — wireReportButton', () => {
  test('define wireReportButton(ctx)', () => {
    expect(source).toContain('function wireReportButton(ctx)');
  });

  test('usa dataset.kcReportBound para idempotência', () => {
    expect(source).toContain("btn.dataset.kcReportBound === '1'");
    expect(source).toContain("btn.dataset.kcReportBound = '1'");
  });

  test('armazena postId e postTitle no dataset do botão', () => {
    expect(source).toContain('btn.dataset.kcReportPostId');
    expect(source).toContain('btn.dataset.kcReportPostTitle');
  });

  test('cria botao direto para relatar publicacao encerrada', () => {
    expect(source).toContain('closedReportButton');
    expect(source).toContain('Relatar encerramento');
    expect(source).toContain("reason: 'post_closed'");
    expect(source).toContain("status === 'closed'");
  });

  test('verifica driver supabase antes de abrir o popover', () => {
    expect(source).toContain("driver !== 'supabase'");
    expect(source).toContain("'Denúncias disponíveis apenas no modo Supabase.'");
  });

  test('requer login — chama window.KCAPI.getCurrentUser', () => {
    expect(source).toContain('window.KCAPI.getCurrentUser');
    expect(source).toContain("'Faça login para denunciar.'");
  });

  test('abre auth modal quando sem usuário', () => {
    expect(source).toContain('window.kcOpenAuthModal');
  });

  test('constrói o popover de forma lazy via buildReportPopover()', () => {
    expect(source).toContain('if (!_reportPopover) _reportPopover = buildReportPopover()');
    expect(source).toContain('_reportPopover.open(payloadCtx, btn)');
  });
});

describe('product.report.js — buildReportPopover', () => {
  test('define buildReportPopover()', () => {
    expect(source).toContain('function buildReportPopover()');
  });

  test('cria backdrop e popover no document.body', () => {
    expect(source).toContain("'kc-report-popover-backdrop'");
    expect(source).toContain("'kc-report-popover'");
    expect(source).toContain('document.body.appendChild(backdrop)');
    expect(source).toContain('document.body.appendChild(popover)');
  });

  test('define aria-modal e role=dialog no popover', () => {
    expect(source).toContain("'aria-modal', 'true'");
    expect(source).toContain("'role', 'dialog'");
    expect(source).toContain("'Denunciar publicação'");
  });

  test('usa REPORT_REASONS.forEach para gerar lista de motivos', () => {
    expect(source).toContain('REPORT_REASONS.forEach(function (r, idx)');
    expect(source).toContain("'kc-report-reason-list'");
    expect(source).toContain("'kc-report-reason-item'");
  });

  test('tem step de confirmação com textarea de detalhes', () => {
    expect(source).toContain("'kc-report-confirm-body'");
    expect(source).toContain("'kc-report-details-field'");
    expect(source).toContain('detailsField.maxLength = 1000');
  });

  test('posiciona popover no desktop via positionPopover()', () => {
    expect(source).toContain('function positionPopover(anchorBtn)');
    expect(source).toContain('window.innerWidth <= 640');
    expect(source).toContain('anchorBtn.getBoundingClientRect()');
  });

  test('submete denúncia via window.KCAPI.reportPost', () => {
    expect(source).toContain('window.KCAPI.reportPost(currentPostId');
    expect(source).toContain('reason: currentReason');
    expect(source).toContain('details: detailsField.value');
  });

  test("mostra 'Denúncia registrada. Obrigado!' em caso de sucesso", () => {
    expect(source).toContain("'Denúncia registrada. Obrigado!'");
    expect(source).toContain('setTimeout(closePopover, 900)');
  });

  test('fecha com Escape quando popover está visível', () => {
    expect(source).toContain("e.key === 'Escape' && popover.style.display !== 'none'");
  });

  test('reposiciona no resize (desktop)', () => {
    expect(source).toContain("window.addEventListener('resize'");
    expect(source).toContain("document.getElementById('reportButton')");
  });

  test('retorna { open, close }', () => {
    expect(source).toContain('return { open: open, close: closePopover }');
  });

  test('usa esc() para escapar o label do motivo no step 2', () => {
    expect(source).toContain('esc(reasonLabel)');
  });
});

describe('product.report.js — exports window._KCProduct.report', () => {
  test('exporta wireReportButton', () => {
    expect(source).toContain('wireReportButton: wireReportButton,');
  });
});
