const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MODULE_PATH = path.join(ROOT, 'assets/js/controllers/admin/admin-export.shared.js');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function loadExporter() {
  jest.resetModules();
  global.window = global.window || global;
  delete window.KCAdminExport;
  require(MODULE_PATH);
  return window.KCAdminExport;
}

describe('admin-export.shared.js', () => {
  test('expoe API nova sem remover API legada', () => {
    const exporter = loadExporter();
    expect(typeof exporter.exportReportXLSX).toBe('function');
    expect(typeof exporter.exportReportPDF).toBe('function');
    expect(typeof exporter.exportXLSX).toBe('function');
    expect(typeof exporter.exportPDF).toBe('function');
    expect(typeof exporter.sanitizeExportObject).toBe('function');
  });

  test('remove campos sensiveis antes de exportar linhas', () => {
    const exporter = loadExporter();
    const clean = exporter.sanitizeExportObject({
      title: 'Post',
      access_token: 'secret-token',
      cookie: 'raw-cookie',
      ip_address: '127.0.0.1',
      user_agent: 'browser',
      status: 'published',
    });
    expect(clean).toEqual({
      'Título': 'Post',
      Status: 'published',
    });
  });

  test('normaliza linhas com labels legiveis', () => {
    const exporter = loadExporter();
    const rows = exporter.normalizeRows([{ post_id: 'abc', created_at: '2026-05-23' }]);
    expect(rows[0]).toEqual({ 'ID do post': 'abc', 'Criado em': '2026-05-23' });
  });

  test('normaliza chaves acentuadas sem quebrar labels PT-BR', () => {
    const exporter = loadExporter();
    const rows = exporter.normalizeRows([{ 'usuário_encontrado': 'Sim', publicações: 2, descrição: 'Texto', status_final: 'Pendente', solicitacao: 'abc' }]);
    expect(rows[0]).toEqual({ 'Usuário encontrado': 'Sim', 'Publicações': '2', 'Descrição': 'Texto', 'Status final': 'Pendente', 'Solicitação': 'abc' });
  });

  test('respeita colunas explicitas com labels PT-BR', () => {
    const exporter = loadExporter();
    const rows = exporter.normalizeRows(
      [{ max_posts: 10, window_minutes: 60, ignored: 'fora' }],
      [{ key: 'max_posts', label: 'Máx. posts' }, 'window_minutes']
    );
    expect(rows[0]).toEqual({ 'Máx. posts': '10', 'Janela (min)': '60' });
  });

  test('gera workbook XLSX com resumo, filtros e abas contextuais sanitizadas', async () => {
    const exporter = loadExporter();
    let savedWorkbook = null;
    window.XLSX = {
      utils: {
        book_new: () => ({ Sheets: [], Props: null }),
        json_to_sheet: (rows) => ({ rows, '!ref': 'A1:B2' }),
        book_append_sheet: (workbook, worksheet, name) => {
          workbook.Sheets.push({ name, worksheet });
        },
      },
      writeFile: (workbook, filename) => {
        savedWorkbook = { workbook, filename };
      },
    };

    await exporter.exportReportXLSX('relatorio.xlsx', {
      title: 'Relatório Admin',
      source: 'Teste',
      filters: { page_path: '/admin', access_token: 'secret' },
      kpis: [{ label: 'Eventos', value: 2 }],
      sections: [{
        title: 'Eventos recentes',
        rows: [{ event_name: 'search', cookie: 'raw', ip_address: '127.0.0.1' }],
      }],
    });

    expect(savedWorkbook.filename).toBe('relatorio.xlsx');
    expect(savedWorkbook.workbook.Sheets.map((sheet) => sheet.name)).toEqual(['Resumo Executivo', 'Filtros Aplicados', 'Indicadores', 'Eventos recentes']);
    expect(savedWorkbook.workbook.Sheets[1].worksheet.rows).toEqual([{ Filtro: 'Página', Valor: '/admin' }, { Filtro: 'Access Token', Valor: '[removido]' }]);
    expect(savedWorkbook.workbook.Sheets[2].worksheet.rows).toEqual([{ Indicador: 'Eventos', Valor: '2', Contexto: '' }]);
    expect(savedWorkbook.workbook.Sheets[3].worksheet.rows).toEqual([{ Evento: 'search' }]);
  });

  test('gera PDF com identidade KinoCampus e salva arquivo', async () => {
    const exporter = loadExporter();
    const saved = [];
    class FakePDF {
      constructor() {
        this.internal = {
          pageSize: { getWidth: () => 595, getHeight: () => 842 },
          getNumberOfPages: () => 1,
        };
      }
      rect() {}
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setFillColor() {}
      text(value) { saved.push(String(Array.isArray(value) ? value.join(' ') : value)); }
      splitTextToSize(value) { return [String(value)]; }
      setDrawColor() {}
      line() {}
      addPage() {}
      setPage() {}
      save(filename) { saved.push(filename); }
    }
    window.jspdf = { jsPDF: FakePDF };

    await exporter.exportReportPDF('relatorio.pdf', {
      title: 'Relatório Admin',
      subtitle: 'Resumo contextual',
      filters: { periodo: '30 dias' },
      sections: [{ title: 'Dados', rows: [{ post_id: 'abc' }] }],
    });

    expect(saved).toContain('KinoCampus');
    expect(saved).toContain('relatorio.pdf');
  });
});

describe('exportacao contextual nas paginas admin', () => {
  test('paginas contextuais carregam exportador compartilhado e botoes de export', () => {
    [
      ['admin/index.html', ['admin-export-xlsx', 'admin-export-pdf']],
      ['admin/moderation.html', ['moderation-export-xlsx', 'moderation-export-pdf']],
      ['admin/reports.html', ['reports-export-xlsx', 'reports-export-pdf']],
      ['admin/banners.html', ['banners-export-xlsx', 'banners-export-pdf']],
      ['admin/help-requests.html', ['helpExportXlsx', 'helpExportPdf']],
      ['admin/privacy-analytics.html', ['privacyExportXlsx', 'privacyExportPdf']],
    ].forEach(([page, ids]) => {
      const html = read(page);
      expect(html).toContain('admin-export.shared.js');
      ids.forEach((id) => expect(html).toContain(`id="${id}"`));
    });
  });
});
