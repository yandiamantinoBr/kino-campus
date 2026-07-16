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

  test('neutraliza fórmulas de planilha sem converter números negativos', () => {
    const exporter = loadExporter();
    const clean = exporter.sanitizeExportObject({
      title: '=HYPERLINK("https://example.test")',
      observacao: '  +SUM(1,1)',
      total: -5,
    });
    expect(clean['Título']).toBe('\'=HYPERLINK("https://example.test")');
    expect(clean['Observação']).toBe("'  +SUM(1,1)");
    expect(clean.Total).toBe('-5');
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

  test('repara mojibake comum em labels e valores exportados', () => {
    const exporter = loadExporter();
    const rows = exporter.normalizeRows([{ title: 'RelatÃ³rio de PÃ¡ginas', observacao: 'UsuÃ¡rio sem sessÃ£o' }]);
    expect(rows[0]).toEqual({ 'Título': 'Relatório de Páginas', 'Observação': 'Usuário sem sessão' });
  });

  test('preserva a letra Â legítima e repara apenas sequências contextuais', () => {
    const exporter = loadExporter();
    const rows = exporter.normalizeRows([{
      usuario: 'Ângela',
      observacao: 'Âmbito acadêmico',
      descricao: 'ItemÂ com espaço e 10Âº lugar'
    }]);
    expect(rows[0]).toEqual({
      'Usuário': 'Ângela',
      'Observação': 'Âmbito acadêmico',
      'Descrição': 'Item com espaço e 10º lugar'
    });
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

    // Força o fallback SheetJS — o caminho ExcelJS é validado por amostra Node (jsdom não roda os sinks de download).
    window.ExcelJS = { Workbook: function () { throw new Error('ExcelJS desabilitado no teste'); } };

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

  test('ExcelJS exibe a mensagem contextual de indisponibilidade mesmo com colunas declaradas', async () => {
    const exporter = loadExporter();
    let savedWorkbook = null;

    class FakeRow {
      constructor(values, number) {
        this.values = Array.isArray(values) ? values : [];
        this.number = number;
        this.cells = {};
      }
      getCell(index) {
        this.cells[index] = this.cells[index] || { value: this.values[index - 1] };
        return this.cells[index];
      }
      eachCell(_options, callback) {
        const length = Math.max(this.values.length, 1);
        for (let index = 1; index <= length; index += 1) callback(this.getCell(index), index);
      }
    }

    class FakeWorksheet {
      constructor(name) {
        this.name = name;
        this.rows = [];
        this.rowCount = 0;
        this.cells = {};
      }
      set columns(value) {
        this._columns = value;
        if (Array.isArray(value) && value.some((column) => column && column.header != null) && !this.rowCount) {
          this.addRow(value.map((column) => column.header));
        }
      }
      get columns() {
        return this._columns;
      }
      addRow(values) {
        const row = new FakeRow(values, this.rows.length + 1);
        this.rows.push(row);
        this.rowCount = this.rows.length;
        return row;
      }
      getRow(number) {
        while (this.rows.length < number) this.addRow([]);
        return this.rows[number - 1];
      }
      getCell(reference) {
        this.cells[reference] = this.cells[reference] || {};
        return this.cells[reference];
      }
      mergeCells() {}
    }

    class FakeWorkbook {
      constructor() {
        this.worksheets = [];
        this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) };
        savedWorkbook = this;
      }
      addWorksheet(name) {
        const worksheet = new FakeWorksheet(name);
        this.worksheets.push(worksheet);
        return worksheet;
      }
    }

    const originalDocument = global.document;
    const originalUrl = global.URL;
    const link = { click: jest.fn(), parentNode: { removeChild: jest.fn() } };
    global.document = {
      createElement: () => link,
      body: { appendChild: jest.fn() }
    };
    global.URL = {
      createObjectURL: jest.fn(() => 'blob:report'),
      revokeObjectURL: jest.fn()
    };
    window.ExcelJS = { Workbook: FakeWorkbook };

    try {
      await exporter.exportReportXLSX('vazio.xlsx', {
        title: 'Relatório vazio',
        sections: [{
          title: 'Vazio',
          rows: [],
          columns: [{ key: 'event_name', label: 'Evento' }],
          emptyMessage: 'Fonte indisponível neste carregamento'
        }]
      });
    } finally {
      global.document = originalDocument;
      global.URL = originalUrl;
    }

    const worksheet = savedWorkbook.worksheets.find((item) => item.name === 'Vazio');
    expect(worksheet.rows[0].values).toEqual(['Status']);
    expect(worksheet.rows[1].values).toEqual(['Fonte indisponível neste carregamento']);
  });

  test('preserva detail como contexto dos KPIs', async () => {
    const exporter = loadExporter();
    let savedWorkbook = null;
    window.XLSX = {
      utils: {
        book_new: () => ({ Sheets: [] }),
        json_to_sheet: (rows) => ({ rows, '!ref': 'A1:B2' }),
        book_append_sheet: (workbook, worksheet, name) => workbook.Sheets.push({ name, worksheet }),
      },
      writeFile: (workbook) => { savedWorkbook = workbook; },
    };
    window.ExcelJS = { Workbook: function () { throw new Error('fallback'); } };

    await exporter.exportReportXLSX('detalhes.xlsx', {
      title: 'Detalhes',
      kpis: [{ label: 'Denúncias abertas', value: 2, detail: 'Backlog atual' }],
      sections: []
    });

    const indicadores = savedWorkbook.Sheets.find((sheet) => sheet.name === 'Indicadores');
    expect(indicadores.worksheet.rows[0].Contexto).toBe('Backlog atual');
  });

  test('gera PDF com identidade KinoCampus e salva arquivo', async () => {
    const exporter = loadExporter();
    const saved = [];
    const rects = [];
    class FakePDF {
      constructor() {
        this.pages = 1;
        this.internal = {
          pageSize: { getWidth: () => 595, getHeight: () => 842 },
          getNumberOfPages: () => this.pages,
        };
      }
      rect(...args) { rects.push(args); }
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setFillColor() {}
      text(value) { saved.push(String(Array.isArray(value) ? value.join(' ') : value)); }
      splitTextToSize(value) { return [String(value)]; }
      setDrawColor() {}
      line() {}
      addPage() { this.pages += 1; }
      setPage() {}
      save(filename) { saved.push(filename); }
      autoTable() {
        this.lastAutoTable = { finalY: 150 };
      }
    }
    FakePDF.API = { autoTable: function () {} };
    window.jspdf = { jsPDF: FakePDF };

    await exporter.exportReportPDF('relatorio.pdf', {
      title: 'Relatório Admin',
      subtitle: 'Resumo contextual',
      filters: { periodo: '30 dias' },
      sections: [{ title: 'Dados', rows: [{ post_id: 'abc' }] }],
    });

    expect(saved).toContain('KinoCampus');
    expect(saved).toContain('relatorio.pdf');
    expect(rects).toContainEqual([0, 0, 595, 842, 'F']);
    expect(rects).toContainEqual([0, 0, 595, 76, 'F']);
    expect(read('assets/js/controllers/admin/admin-export.shared.js')).toContain(
      'willDrawPage: ensureCurrentPageChrome'
    );
  });

  test('PDF exibe a mensagem contextual de indisponibilidade mesmo com colunas declaradas', async () => {
    const exporter = loadExporter();
    const tables = [];
    class FakePDF {
      constructor() {
        this.pages = 1;
        this.internal = {
          pageSize: { getWidth: () => 595, getHeight: () => 842 },
          getNumberOfPages: () => this.pages,
        };
      }
      rect() {}
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setFillColor() {}
      text() {}
      splitTextToSize(value) { return [String(value)]; }
      setDrawColor() {}
      line() {}
      addPage() { this.pages += 1; }
      setPage() {}
      save() {}
      autoTable(options) {
        tables.push(options);
        this.lastAutoTable = { finalY: 150 };
      }
    }
    FakePDF.API = { autoTable: function () {} };
    window.jspdf = { jsPDF: FakePDF };

    await exporter.exportReportPDF('vazio.pdf', {
      title: 'Relatório vazio',
      sections: [{
        title: 'Vazio',
        rows: [],
        columns: [{ key: 'event_name', label: 'Evento' }],
        emptyMessage: 'Fonte indisponível neste carregamento'
      }]
    });

    expect(tables).toHaveLength(1);
    expect(tables[0].head).toEqual([['Status']]);
    expect(tables[0].body).toEqual([['Fonte indisponível neste carregamento']]);
  });

  test('grafico PDF separa o titulo do eixo X dos rotulos inicial e final', () => {
    const source = read('assets/js/controllers/admin/admin-export.shared.js');
    expect(source).toContain("const align = index === 0 ? 'left' : (index === rows.length - 1 ? 'right' : 'center');");
    expect(source).toContain("chartX + padLeft + (innerWidth / 2), chartY + chartHeight - 5, { align: 'center' }");
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
