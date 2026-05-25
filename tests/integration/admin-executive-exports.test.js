const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('exports executivos admin - dashboard, denuncias e banners', () => {
  test('dashboard usa relatorio executivo com labels PT-BR e colunas explicitas', () => {
    const source = read('assets/js/controllers/admin/admin-dashboard.audit.js');

    expect(source).toContain("title: 'KinoCampus - Relatório Executivo Admin'");
    expect(source).toContain("Publicações visíveis");
    expect(source).toContain("Denúncias abertas");
    expect(source).toContain("Saúde/Admin");
    expect(source).toContain("pdfColumns: ['dia', 'total', 'buscas', 'acoes_admin']");
    expect(source).toContain("xlsxColumns: ['data', 'acao', 'entidade', 'entity_id', 'ator', 'detalhes']");
  });

  test('denuncias exporta todos os filtros com fallback, enriquecimento e avisos', () => {
    const source = read('assets/js/controllers/admin/admin-reports.controller.js');

    expect(source).toContain('const EXPORT_ROW_LIMIT = 2000;');
    expect(source).toContain('async function fetchReportsForExport(warnings)');
    expect(source).toContain('async function collectReportsExportData()');
    expect(source).toContain("client.rpc('kc_admin_list_reports'");
    expect(source).toContain("title: 'KinoCampus - Denúncias Admin'");
    expect(source).toContain("title: 'Avisos de exportação'");
    expect(source).toContain('reporter_nome');
    expect(source).toContain("pdfColumns: ['criado_em', 'motivo', 'status', 'post_titulo']");
    expect(source).toContain("xlsxColumns: ['id', 'post_id', 'post_titulo', 'post_status', 'motivo', 'reason_key', 'status', 'detalhes', 'reporter_nome', 'reporter_id', 'criado_em']");
  });

  test('banners possuem periodo de metricas, analytics, fallback e auditoria no export', () => {
    const html = read('admin/banners.html');
    const source = read('assets/js/controllers/admin/admin-banners.controller.js');

    expect(html).toContain('id="banners-metrics-period"');
    ['value="7"', 'value="30"', 'value="90"', 'value="365"'].forEach((option) => {
      expect(html).toContain(option);
    });
    expect(source).toContain("const BANNER_AUDIT_EXPORT_LIMIT = 800;");
    expect(source).toContain("const BANNER_METRIC_EVENTS = ['banner_impression', 'banner_click'];");
    expect(source).toContain("from('privacy_analytics_events')");
    expect(source).toContain('async function fetchBannerAuditForExport(warnings)');
    expect(source).toContain('async function collectBannersExportData()');
    expect(source).toContain("title: 'Métricas por banner'");
    expect(source).toContain("title: 'Validações'");
    expect(source).toContain("title: 'Auditoria'");
    expect(source).toContain('periodo_metricas');
  });

  test('exportador compartilhado preserva acentos, sanitizacao e labels administrativos', () => {
    const source = read('assets/js/controllers/admin/admin-export.shared.js');

    expect(source).toContain("relatorio: 'Relatório'");
    expect(source).toContain("impressoes: 'Impressões'");
    expect(source).toContain("participacao_percentual: 'Participação (%)'");
    expect(source).toContain("post_titulo: 'Título do post'");
    expect(source).toContain("reporter_nome: 'Denunciante'");
    expect(source).toContain("return typeof text.normalize === 'function' ? text.normalize('NFC') : text;");
    expect(source).toContain('SENSITIVE_KEY_RE');
  });
});
