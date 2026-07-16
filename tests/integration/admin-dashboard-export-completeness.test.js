'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

describe('dashboard admin — completude do PDF', () => {
  const exporter = read('assets/js/controllers/admin/admin-export.shared.js');
  const audit = read('assets/js/controllers/admin/admin-dashboard.audit.js');
  const migration = read('supabase/migrations/20260716163009_harden_moderation_profile_autocomplete.sql');

  test('não corta KPIs nem filtros silenciosamente', () => {
    expect(exporter).toContain('for (let rowStart = 0; rowStart < list.length; rowStart += columns)');
    expect(exporter).not.toContain('list.slice(0, 8)');
    expect(exporter).toContain('drawRows(normalized.filters, normalized.filters.length)');
    expect(exporter).not.toContain('KPIs adicionais disponíveis no XLSX.');
  });

  test('audit log busca páginas adicionais para o arquivo completo com limite explícito', () => {
    expect(audit).toContain('var MAX_EXPORT_AUDIT_ROWS = 5000;');
    expect(audit).toContain('function captureDashboardExportContext(data, deps)');
    expect(audit).toContain('snapshot.exportContext = exportContext;');
    expect(audit).toContain('async function buildCompleteExportSnapshot(data, deps)');
    expect(audit).toContain('while (offset < MAX_EXPORT_AUDIT_ROWS)');
    expect(audit).toContain('var exportData = await buildCompleteExportSnapshot(data, deps);');
    expect(audit).toContain('maxPdfRows: Math.max((data.auditRows || []).length, 1)');
    expect(audit).toContain("auditAvailable ? (data.auditRows || []).length : 'Indisponível'");
  });

  test('snapshot de auditoria congela o instante do clique e ordena com desempate estável', () => {
    expect(audit).toContain('var until = exportContext.capturedAt;');
    expect(audit).toContain("if (until) query = query.lte('created_at', until);");
    expect(audit).toContain(".order('id', { ascending: false })");
    expect(audit).toContain('if (until) rpcArgs.p_until = until;');
    expect(audit).toContain('page.__kcSnapshotBounded !== true');
    expect(migration).toContain('p_until timestamptz');
    expect(migration).toContain('audit_row.created_at <= p_until');
    expect(migration).toContain('order by audit_row.created_at desc, audit_row.id desc');
  });

  test('exportador mantém paginação automática para blocos extensos', () => {
    expect(exporter).toContain('function addPageIfNeeded(');
    expect(exporter).toMatch(/function drawRows\([\s\S]*?addPageIfNeeded/);
    expect(exporter).toContain('section.maxPdfRows || MAX_PDF_ROWS');
  });

  test('PDF usa cabeçalho compacto, metadados e navegação documental', () => {
    expect(exporter).toContain('function addPdfHeader(doc, report, pageWidth, compact)');
    expect(exporter).toContain('function addPdfFinalChrome(doc, report)');
    expect(exporter).toContain('addPdfHeader(doc, report, pageWidth, page > 1)');
    expect(exporter).toContain("'Página ' + String(page) + ' de ' + String(pageCount)");
    expect(exporter).toContain('doc.setProperties({');
    expect(exporter).toContain("doc.setLanguage('pt-BR')");
    expect(exporter).toContain("doc.setDisplayMode('fullwidth', 'continuous', 'UseOutlines')");
    expect(exporter).toContain('doc.outline.add(null, String(title ||');
  });

  test('cartões executivos preservam o contexto completo em altura dinâmica', () => {
    expect(exporter).toContain('function fullLines(value)');
    expect(exporter).toContain('const contextLines = row.Contexto ? fullLines(row.Contexto) : [];');
    expect(exporter).not.toContain('truncate(row.Contexto, 42)');
    expect(exporter).not.toContain('cardHeight = 66');
  });

  test('relatório separa filtros de disponibilidade e explica classificação e séries', () => {
    expect(audit).toContain("title: 'Disponibilidade das fontes'");
    expect(audit).toContain('series_exibidas: visibleSeriesLabels.length');
    expect(audit).toContain('series_ocultas: hiddenSeriesLabels.length');
    expect(audit).toContain("label: 'Cobertura da classificação'");
    expect(audit).toContain("label: 'Buscas não classificadas'");
  });
});
