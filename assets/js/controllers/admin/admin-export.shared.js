(function () {
  'use strict';

  const BRAND = Object.freeze({
    name: 'KinoCampus',
    orange: [255, 107, 0],
    dark: [31, 41, 55],
    muted: [107, 114, 128],
    light: [255, 247, 237],
    border: [229, 231, 235],
  });

  const SENSITIVE_KEY_RE = /(token|cookie|authorization|apikey|api_key|password|secret|refresh|access_token|refresh_token|user_agent|user-agent|ip_address|ip\b)/i;
  const MAX_CELL_LENGTH = 1200;
  const MAX_PDF_ROWS = 60;
  const MAX_PDF_CELL_LINES = 3;
  const CHART_PALETTE = Object.freeze([
    [255, 107, 0],
    [37, 99, 235],
    [22, 163, 74],
    [147, 51, 234],
    [220, 38, 38],
    [8, 145, 178],
    [202, 138, 4],
    [79, 70, 229],
  ]);
  const LABELS_PT_BR = Object.freeze({
    acao: 'Ação',
    acoes_da_sessao: 'Ações da sessão',
    actor_id: 'ID do ator',
    audit_action: 'Ação do audit log',
    audit_actor: 'Ator do audit log',
    audit_entity: 'Entidade do audit log',
    audit_entity_type: 'Entidade do audit log',
    audit_page_size: 'Registros por página',
    audit_rows_na_pagina: 'Registros do audit log',
    atualizado_em: 'Atualizado em',
    author_id: 'ID do autor',
    abertas: 'Abertas',
    acoes_admin: 'Ações admin',
    ator: 'Ator',
    auth: 'Auth',
    aviso: 'Aviso',
    banners_ativos: 'Banners ativos',
    banners_inativos: 'Banners inativos',
    banners_total: 'Total de banners',
    botao: 'Botão',
    buscas: 'Buscas',
    campanhas_ativas: 'Campanhas ativas',
    campanhas_cadastradas: 'Campanhas cadastradas',
    campanhas_total: 'Total de campanhas',
    cliques: 'Cliques',
    cliques_registrados: 'Cliques registrados',
    comentarios: 'Comentários',
    campanhas: 'Campanhas',
    categoria: 'Categoria',
    chave_evento: 'Chave do evento',
    contexto: 'Contexto',
    created_at: 'Criado em',
    criado_em: 'Criado em',
    data: 'Data',
    dados_excluidos: 'Dados excluídos',
    detalhes: 'Detalhes',
    descricao: 'Descrição',
    entidade: 'Entidade',
    entity_id: 'ID da entidade',
    entity_type: 'Tipo de entidade',
    event_name: 'Evento',
    events: 'Eventos',
    e_mail_alvo: 'E-mail alvo',
    filtro: 'Filtro',
    filtro_eventos_recentes: 'Filtro dos eventos recentes',
    fechamento: 'Fechamento',
    fechadas: 'Fechadas',
    generated_at: 'Gerado em',
    gradiente: 'Gradiente',
    id: 'ID',
    hash_do_e_mail: 'Hash do e-mail',
    icone: 'Ícone',
    impressao: 'Impressão',
    impressoes: 'Impressões',
    impressoes_registradas: 'Impressões registradas',
    indicador: 'Indicador',
    item: 'Item',
    janela_minutos: 'Janela (min)',
    legacy_id: 'ID legado',
    limit: 'Limite',
    limites_ativos: 'Limites ativos',
    limites_de_ritmo: 'Limites de ritmo',
    max_active: 'Máx. ativas',
    max_ativas: 'Máx. ativas',
    max_posts: 'Máx. posts',
    metadata: 'Metadados',
    modo_adsense: 'Modo AdSense',
    midias: 'Mídias',
    monetizacao: 'Monetização',
    motivo: 'Motivo',
    motivos: 'Motivos',
    modulo: 'Módulo',
    module: 'Módulo',
    observacao: 'Observação',
    ordem: 'Ordem',
    page_path: 'Página',
    participacao: 'Participação',
    participacao_percentual: 'Participação (%)',
    payload: 'Payload',
    pedidos_de_ajuda: 'Pedidos de ajuda',
    periodo: 'Período',
    periodo_dias: 'Período (dias)',
    posicao: 'Posição',
    pode_fechar: 'Pode fechar?',
    post_id: 'ID do post',
    post_status: 'Status do post',
    post_titulo: 'Título do post',
    posts_carregados: 'Posts carregados',
    posts_filtrados_total: 'Posts filtrados no total',
    reason_key: 'Chave do motivo',
    relatorio: 'Relatório',
    reporter_id: 'ID do denunciante',
    reporter_nome: 'Denunciante',
    search: 'Busca',
    solicitacao: 'Solicitação',
    status: 'Status',
    status_final: 'Status final',
    status_lgpd: 'Status LGPD',
    subtitle: 'Subtítulo',
    subtitulo: 'Subtítulo',
    termo: 'Termo',
    termos: 'Termos',
    tratamento_previsto: 'Tratamento',
    top_termos: 'Top termos',
    title: 'Título',
    titulo: 'Título',
    tom: 'Tom',
    total: 'Total',
    total_conhecido: 'Total conhecido',
    updated_at: 'Atualizado em',
    url: 'URL',
    user_id: 'ID do usuário',
    usuario: 'Usuário',
    usuario_auth_encontrado: 'Usuário Auth encontrado',
    usuario_encontrado: 'Usuário encontrado',
    valor: 'Valor',
    window_minutes: 'Janela (min)'
  });
  const WORD_LABELS_PT_BR = Object.freeze({
    acao: 'Ação',
    acoes: 'Ações',
    actor: 'Ator',
    admin: 'Admin',
    atualizado: 'Atualizado',
    busca: 'Busca',
    buscas: 'Buscas',
    banners: 'Banners',
    botao: 'Botão',
    categoria: 'Categoria',
    cliques: 'Cliques',
    comentarios: 'Comentários',
    criado: 'Criado',
    data: 'Data',
    de: 'de',
    do: 'do',
    da: 'da',
    em: 'em',
    entidade: 'Entidade',
    exportacao: 'Exportação',
    filtro: 'Filtro',
    filtros: 'Filtros',
    flood: 'Flood',
    impressoes: 'Impressões',
    indicador: 'Indicador',
    id: 'ID',
    janela: 'Janela',
    kpi: 'KPI',
    kpis: 'KPIs',
    limite: 'Limite',
    limites: 'Limites',
    max: 'Máx.',
    motivo: 'Motivo',
    motivos: 'Motivos',
    modulo: 'Módulo',
    modulos: 'Módulos',
    observacao: 'Observação',
    ordem: 'Ordem',
    pagina: 'Página',
    paginas: 'Páginas',
    periodo: 'Período',
    posicao: 'Posição',
    por: 'por',
    publicacao: 'Publicação',
    publicacoes: 'Publicações',
    relatorio: 'Relatório',
    ritmo: 'Ritmo',
    saude: 'Saúde',
    secao: 'Seção',
    selecao: 'Seleção',
    sessao: 'Sessão',
    status: 'Status',
    usuario: 'Usuário',
    usuarios: 'Usuários'
  });

  function repairMojibake(value) {
    let text = String(value == null ? '' : value);
    if (!/[ÃÂ]|â[€\u0080-\u009f]/.test(text)) return text;
    const replacements = [
      ['Ã¡', 'á'], ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã¤', 'ä'],
      ['Ã©', 'é'], ['Ãª', 'ê'], ['Ã¨', 'è'],
      ['Ã­', 'í'], ['Ã®', 'î'], ['Ã¬', 'ì'],
      ['Ã³', 'ó'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã²', 'ò'],
      ['Ãº', 'ú'], ['Ã¼', 'ü'], ['Ã¹', 'ù'],
      ['Ã§', 'ç'],
      ['Ã', 'Á'], ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'],
      ['Ã‰', 'É'], ['ÃŠ', 'Ê'], ['Ã', 'Í'],
      ['Ã“', 'Ó'], ['Ã”', 'Ô'], ['Ã•', 'Õ'],
      ['Ãš', 'Ú'], ['Ã‡', 'Ç'],
      ['Âº', 'º'], ['Âª', 'ª'], ['Â°', '°'], ['Â', ''],
      ['â€œ', '“'], ['â€', '”'], ['â€\x9d', '”'],
      ['â€˜', '‘'], ['â€™', '’'], ['â€“', '–'],
      ['â€”', '—'], ['â€¢', '•'], ['â€¦', '…'],
    ];
    replacements.forEach(function (pair) {
      text = text.split(pair[0]).join(pair[1]);
    });
    return text;
  }

  function normalizeUnicode(value) {
    const text = repairMojibake(value);
    return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
  }

  function pdfLines(doc, value, width, maxLines) {
    const text = String(value == null ? '' : value);
    const lines = doc.splitTextToSize(normalizeUnicode(text), Math.max(24, width || 120));
    const limit = Math.max(1, Number(maxLines) || MAX_PDF_CELL_LINES);
    if (lines.length <= limit) return lines;
    const clipped = lines.slice(0, limit);
    const last = clipped[clipped.length - 1] || '';
    clipped[clipped.length - 1] = truncate(last, Math.max(8, last.length)).replace(/\.*$/, '') + '...';
    return clipped;
  }

  function normalizeKey(key) {
    return normalizeUnicode(key)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function getAssetPrefix() {
    const path = String(window.location && window.location.pathname || '');
    return path.indexOf('/admin/') >= 0 || /\/admin\/[^/]*$/.test(path) ? '../' : '';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const needle = src.replace(/^\.\.\//, '');
      const existing = Array.from(document.scripts || []).find(function (script) {
        return script.src && script.src.indexOf(needle) >= 0;
      });
      if (existing) {
        if (existing.dataset.kcLoaded === '1' || existing.readyState === 'complete') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = function () {
        script.dataset.kcLoaded = '1';
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function ensureXLSX() {
    if (window.XLSX) return window.XLSX;
    const prefix = getAssetPrefix();
    try {
      await loadScript(prefix + 'assets/vendor/xlsx.full.min.js');
    } catch (_) {
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    }
    if (!window.XLSX) throw new Error('XLSX indisponível');
    return window.XLSX;
  }

  async function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    const prefix = getAssetPrefix();
    try {
      await loadScript(prefix + 'assets/vendor/jspdf.umd.min.js');
    } catch (_) {
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    }
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF indisponível');
    return window.jspdf.jsPDF;
  }

  async function ensureExcelJS() {
    if (window.ExcelJS) return window.ExcelJS;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      throw new Error('DOM indisponível para carregar ExcelJS');
    }
    const prefix = getAssetPrefix();
    try {
      await loadScript(prefix + 'assets/vendor/exceljs.min.js');
    } catch (_) {
      await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
    }
    if (!window.ExcelJS) throw new Error('ExcelJS indisponível');
    return window.ExcelJS;
  }

  async function ensureAutoTable() {
    const JsPDF = await ensureJsPDF();
    // O plugin se anexa ao prototype do jsPDF (doc.autoTable).
    if (JsPDF.API && typeof JsPDF.API.autoTable === 'function') return JsPDF;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      throw new Error('DOM indisponível para carregar jspdf-autotable');
    }
    const prefix = getAssetPrefix();
    try {
      await loadScript(prefix + 'assets/vendor/jspdf.plugin.autotable.min.js');
    } catch (_) {
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js');
    }
    if (!(JsPDF.API && typeof JsPDF.API.autoTable === 'function')) {
      throw new Error('jspdf-autotable indisponível');
    }
    return JsPDF;
  }

  function titleCaseLabel(key) {
    const normalizedKey = normalizeKey(key || 'valor');
    if (LABELS_PT_BR[normalizedKey]) return LABELS_PT_BR[normalizedKey];
    return normalizedKey
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(function (word, index) {
        if (WORD_LABELS_PT_BR[word]) return WORD_LABELS_PT_BR[word];
        if (index > 0 && /^(a|as|de|do|da|dos|das|e|em|por)$/.test(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ') || 'Valor';
  }

  function truncate(value, limit) {
    const text = normalizeUnicode(value == null ? '' : value);
    const max = Number.isFinite(limit) ? limit : MAX_CELL_LENGTH;
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
  }

  function sanitizeExportValue(value, key) {
    if (key && SENSITIVE_KEY_RE.test(String(key))) return '[removido]';
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return truncate(value.map(function (item) {
      return typeof item === 'object' && item !== null ? sanitizeExportObject(item) : sanitizeExportValue(item);
    }).join('; '));
    if (typeof value === 'object') return truncate(JSON.stringify(sanitizeExportObject(value)));
    return truncate(normalizeUnicode(value));
  }

  function normalizeColumn(column) {
    if (!column) return null;
    if (typeof column === 'string') {
      return { key: column, label: titleCaseLabel(column) };
    }
    if (typeof column === 'object') {
      const key = column.key || column.field || column.name;
      if (!key) return null;
      return {
        key: String(key),
        label: normalizeUnicode(column.label || titleCaseLabel(key)),
        width: column.width || null
      };
    }
    return null;
  }

  function normalizeColumns(columns) {
    return (Array.isArray(columns) ? columns : [])
      .map(normalizeColumn)
      .filter(Boolean);
  }

  function sanitizeExportObject(row, columns) {
    if (!row || typeof row !== 'object') return row;
    const clean = {};
    const normalizedColumns = normalizeColumns(columns);
    if (normalizedColumns.length) {
      normalizedColumns.forEach(function (column) {
        if (SENSITIVE_KEY_RE.test(column.key)) return;
        clean[column.label] = sanitizeExportValue(row[column.key], column.key);
      });
      return clean;
    }
    Object.keys(row).forEach(function (key) {
      if (SENSITIVE_KEY_RE.test(key)) return;
      clean[titleCaseLabel(key)] = sanitizeExportValue(row[key], key);
    });
    return clean;
  }

  function normalizeRows(rows, columns) {
    return Array.isArray(rows) ? rows.map(function (row) {
      if (!row || typeof row !== 'object') return { Valor: sanitizeExportValue(row) };
      return sanitizeExportObject(row, columns);
    }) : [];
  }

  function parseChartColor(value, index) {
    if (Array.isArray(value) && value.length >= 3) {
      return [
        Math.max(0, Math.min(255, Number(value[0]) || 0)),
        Math.max(0, Math.min(255, Number(value[1]) || 0)),
        Math.max(0, Math.min(255, Number(value[2]) || 0)),
      ];
    }
    const text = String(value || '').trim();
    const hex = text.charAt(0) === '#' ? text.slice(1) : text;
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return CHART_PALETTE[Math.abs(Number(index) || 0) % CHART_PALETTE.length];
  }

  function normalizeChart(chart, fallbackRows) {
    if (!chart || typeof chart !== 'object') return null;
    const rows = Array.isArray(chart.rows) ? chart.rows : (Array.isArray(fallbackRows) ? fallbackRows : []);
    const series = (Array.isArray(chart.series) ? chart.series : [])
      .map(function (item, index) {
        const key = item && (item.key || item.field || item.name);
        if (!key) return null;
        return {
          key: String(key),
          label: normalizeUnicode((item && item.label) || titleCaseLabel(key)),
          color: parseChartColor(item && item.color, index),
        };
      })
      .filter(Boolean);
    if (!rows.length || !series.length) return null;
    return {
      type: String(chart.type || 'line'),
      xKey: String(chart.xKey || chart.labelKey || 'label'),
      xLabel: normalizeUnicode(chart.xLabel || titleCaseLabel(chart.xKey || 'label')),
      yLabel: normalizeUnicode(chart.yLabel || 'Total'),
      rows,
      series,
    };
  }

  function normalizeFilters(filters) {
    if (!filters || typeof filters !== 'object') return [];
    return Object.keys(filters).map(function (key) {
      return { Filtro: titleCaseLabel(key), Valor: sanitizeExportValue(filters[key], key) || 'Todos' };
    });
  }

  function normalizeKpis(kpis) {
    if (Array.isArray(kpis)) {
      return kpis.map(function (item) {
        return {
          Indicador: sanitizeExportValue(item && (item.label || item.name || item.key || 'Indicador')),
          Valor: sanitizeExportValue(item && item.value),
          Contexto: sanitizeExportValue(item && (item.note || item.context || item.description || '')),
        };
      });
    }
    if (kpis && typeof kpis === 'object') {
      return Object.keys(kpis).map(function (key) {
        return { Indicador: titleCaseLabel(key), Valor: sanitizeExportValue(kpis[key], key), Contexto: '' };
      });
    }
    return [];
  }

  function normalizeSections(sections) {
    return (Array.isArray(sections) ? sections : []).map(function (section) {
      const columns = normalizeColumns(section && section.columns);
      const pdfColumns = normalizeColumns(section && (section.pdfColumns || section.columns));
      const xlsxColumns = normalizeColumns(section && (section.xlsxColumns || section.columns));
      return {
        title: normalizeUnicode(section && (section.title || section.name) || 'Dados'),
        rows: Array.isArray(section && section.rows) ? section.rows : [],
        columns,
        pdfColumns,
        xlsxColumns,
        chart: normalizeChart(section && section.chart, section && section.rows),
        maxPdfRows: Number(section && section.maxPdfRows) || null,
        note: normalizeUnicode(section && section.note || ''),
      };
    });
  }

  function normalizeReport(report) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const generatedAt = safeReport.generatedAt || new Date().toISOString();
    const title = normalizeUnicode(safeReport.title || 'Relatório administrativo KinoCampus');
    const subtitle = normalizeUnicode(safeReport.subtitle || 'Exportação contextual do painel admin');
    const filters = normalizeFilters(safeReport.filters || {});
    const kpis = normalizeKpis(safeReport.kpis || {});
    const sections = normalizeSections(safeReport.sections || []);
    return {
      title,
      subtitle,
      generatedAt,
      source: normalizeUnicode(safeReport.source || 'Painel Admin KinoCampus'),
      filters,
      kpis,
      sections,
    };
  }

  function sheetName(name, fallback) {
    return String(name || fallback || 'Dados')
      .replace(/[\\/?*[\]:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'Dados';
  }

  function applyWorksheetLayout(worksheet, rows) {
    const sample = Array.isArray(rows) && rows.length ? rows : [];
    const headers = sample.length ? Object.keys(sample[0]) : ['Valor'];
    worksheet['!cols'] = headers.map(function (key) {
      const max = Math.max(
        String(key).length,
        sample.slice(0, 50).reduce(function (acc, row) {
          return Math.max(acc, String(row && row[key] == null ? '' : row[key]).length);
        }, 0)
      );
      return { wch: Math.max(12, Math.min(42, max + 2)) };
    });
    worksheet['!autofilter'] = worksheet['!ref'] ? { ref: worksheet['!ref'] } : undefined;
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  function appendSheet(XLSX, workbook, name, rows, columns) {
    const normalized = normalizeRows(rows, columns);
    const safeRows = normalized.length ? normalized : [{ Status: 'Sem dados para os filtros selecionados' }];
    const worksheet = XLSX.utils.json_to_sheet(safeRows);
    applyWorksheetLayout(worksheet, safeRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName(name), true);
  }

  function buildFallbackCsv(report) {
    const lines = [];
    lines.push(report.title);
    lines.push(report.subtitle);
    lines.push('Fonte,' + report.source);
    lines.push('Gerado em,' + new Date(report.generatedAt).toLocaleString('pt-BR'));
    lines.push('');
    report.filters.forEach(function (row) {
      lines.push('Filtro,' + csvCell(row.Filtro) + ',' + csvCell(row.Valor));
    });
    report.sections.forEach(function (section) {
      lines.push('');
      lines.push(section.title);
      const rows = normalizeRows(section.rows || [], section.xlsxColumns.length ? section.xlsxColumns : section.columns);
      const headers = rows.length ? Object.keys(rows[0]) : ['Status'];
      lines.push(headers.map(csvCell).join(','));
      (rows.length ? rows : [{ Status: 'Sem dados' }]).forEach(function (row) {
        lines.push(headers.map(function (key) { return csvCell(row[key]); }).join(','));
      });
    });
    return lines.join('\n');
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 0);
  }

  // ── XLSX estilizado (ExcelJS) ───────────────────────────────────────────────
  function argbColor(rgb, alpha) {
    function h(n) { return ('0' + Math.max(0, Math.min(255, Number(n) || 0)).toString(16)).slice(-2).toUpperCase(); }
    return (alpha || 'FF') + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
  }

  const ZEBRA_RGB = [249, 250, 251];

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 0);
  }

  function excelThinBorder() {
    const edge = { style: 'thin', color: { argb: argbColor(BRAND.border) } };
    return { top: edge, left: edge, bottom: edge, right: edge };
  }

  function coerceExcelCell(value) {
    if (typeof value === 'string' && /^-?\d{1,12}$/.test(value)) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return value == null ? '' : value;
  }

  function styleExcelHeaderRow(row) {
    row.height = 22;
    row.eachCell({ includeEmpty: true }, function (cell) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(BRAND.orange) } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = excelThinBorder();
    });
  }

  function styleExcelBody(worksheet, firstDataRow) {
    const border = excelThinBorder();
    for (let r = firstDataRow; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const zebra = (r - firstDataRow) % 2 === 1;
      row.eachCell({ includeEmpty: true }, function (cell) {
        cell.border = border;
        cell.alignment = { vertical: 'top', wrapText: true };
        if (typeof cell.value === 'number') cell.numFmt = '#,##0';
        if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(ZEBRA_RGB) } };
      });
    }
  }

  function addExcelSection(workbook, name, columns, rows) {
    const normalizedColumns = normalizeColumns(columns);
    const normalizedRows = normalizeRows(rows, columns);
    const safeRows = normalizedRows.length ? normalizedRows : [{ Status: 'Sem dados para os filtros selecionados' }];
    const headers = normalizedColumns.length
      ? normalizedColumns.map(function (column) { return column.label; })
      : Object.keys(safeRows[0]);

    const worksheet = workbook.addWorksheet(sheetName(name), { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = headers.map(function (header, index) {
      const sampleMax = safeRows.slice(0, 80).reduce(function (acc, row) {
        return Math.max(acc, String(row && row[header] == null ? '' : row[header]).length);
      }, String(header).length);
      const declared = normalizedColumns[index] && Number(normalizedColumns[index].width) > 0
        ? Number(normalizedColumns[index].width) * 12 : 0;
      return { header: header, key: 'c' + index, width: Math.max(12, Math.min(54, Math.max(sampleMax + 2, declared))) };
    });

    styleExcelHeaderRow(worksheet.getRow(1));
    safeRows.forEach(function (row) {
      worksheet.addRow(headers.map(function (header) { return coerceExcelCell(row[header]); }));
    });
    styleExcelBody(worksheet, 2);
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, headers.length) } };
    return worksheet;
  }

  function addExcelCover(workbook, normalized) {
    const ws = workbook.addWorksheet('Resumo');
    ws.columns = [{ width: 28 }, { width: 32 }, { width: 30 }, { width: 22 }];

    ws.mergeCells('A1:D1');
    const titleCell = ws.getCell('A1');
    titleCell.value = BRAND.name + ' — ' + normalized.title;
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(BRAND.orange) } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:D2');
    const subCell = ws.getCell('A2');
    subCell.value = normalized.subtitle;
    subCell.font = { color: { argb: argbColor(BRAND.muted) }, size: 11, italic: true };

    function metaRow(label, value) {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { bold: true, color: { argb: argbColor(BRAND.dark) } };
      row.getCell(2).font = { color: { argb: argbColor(BRAND.dark) } };
    }
    ws.addRow([]);
    metaRow('Fonte', normalized.source);
    metaRow('Gerado em', new Date(normalized.generatedAt).toLocaleString('pt-BR'));

    ws.addRow([]);
    const kpiTitle = ws.addRow(['Indicadores']);
    kpiTitle.getCell(1).font = { bold: true, size: 13, color: { argb: argbColor(BRAND.dark) } };
    const kpiHeaderRow = ws.rowCount + 1;
    ws.addRow(['Indicador', 'Valor', 'Contexto']);
    styleExcelHeaderRow(ws.getRow(kpiHeaderRow));
    (normalized.kpis.length ? normalized.kpis : [{ Indicador: 'Sem KPIs', Valor: '', Contexto: '' }]).forEach(function (row) {
      ws.addRow([row.Indicador, coerceExcelCell(row.Valor), row.Contexto]);
    });
    styleExcelBody(ws, kpiHeaderRow + 1);

    ws.addRow([]);
    const filterTitle = ws.addRow(['Filtros aplicados']);
    filterTitle.getCell(1).font = { bold: true, size: 13, color: { argb: argbColor(BRAND.dark) } };
    const filterHeaderRow = ws.rowCount + 1;
    ws.addRow(['Filtro', 'Valor']);
    styleExcelHeaderRow(ws.getRow(filterHeaderRow));
    (normalized.filters.length ? normalized.filters : [{ Filtro: 'Todos', Valor: 'Sem filtros adicionais' }]).forEach(function (row) {
      ws.addRow([row.Filtro, row.Valor]);
    });
    styleExcelBody(ws, filterHeaderRow + 1);
    return ws;
  }

  function buildSparkline(values) {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const list = (Array.isArray(values) ? values : []).map(function (value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    });
    if (!list.length) return '';
    const max = Math.max.apply(null, list.concat([1]));
    return list.map(function (value) {
      const index = Math.max(0, Math.min(blocks.length - 1, Math.round((value / max) * (blocks.length - 1))));
      return blocks[index];
    }).join('');
  }

  function addExcelChartSheet(workbook, section) {
    if (!section || !section.chart) return null;
    const chart = section.chart;
    const ws = workbook.addWorksheet(sheetName('Gráfico - ' + section.title), { views: [{ state: 'frozen', ySplit: 5 }] });
    ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 42 }, { width: 18 }];

    ws.mergeCells('A1:E1');
    const title = ws.getCell('A1');
    title.value = section.title;
    title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(BRAND.orange) } };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = section.note || 'Visualização operacional das séries selecionadas.';
    ws.getCell('A2').font = { color: { argb: argbColor(BRAND.muted) }, italic: true };
    ws.getCell('A3').value = 'Eixo horizontal';
    ws.getCell('B3').value = chart.xLabel;
    ws.getCell('D3').value = 'Eixo vertical';
    ws.getCell('E3').value = chart.yLabel;

    const summaryHeader = ws.getRow(5);
    summaryHeader.values = ['Série', 'Total', 'Pico', 'Tendência', 'Último valor'];
    styleExcelHeaderRow(summaryHeader);

    chart.series.forEach(function (serie, index) {
      const values = chart.rows.map(function (row) {
        const n = Number(row && row[serie.key]);
        return Number.isFinite(n) ? n : 0;
      });
      const total = values.reduce(function (sum, value) { return sum + value; }, 0);
      const peak = values.reduce(function (max, value) { return Math.max(max, value); }, 0);
      const row = ws.addRow([serie.label, total, peak, buildSparkline(values), values.length ? values[values.length - 1] : 0]);
      row.eachCell({ includeEmpty: true }, function (cell) {
        cell.border = excelThinBorder();
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      row.getCell(1).font = { bold: true, color: { argb: argbColor(serie.color) } };
      row.getCell(4).font = { color: { argb: argbColor(serie.color) }, size: 14 };
      if (index % 2 === 1) {
        row.eachCell({ includeEmpty: true }, function (cell) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(ZEBRA_RGB) } };
        });
      }
    });

    ws.addRow([]);
    const dataTitle = ws.addRow(['Dados do gráfico']);
    dataTitle.getCell(1).font = { bold: true, size: 12, color: { argb: argbColor(BRAND.dark) } };
    const headerRow = ws.addRow([chart.xLabel].concat(chart.series.map(function (serie) { return serie.label; })));
    styleExcelHeaderRow(headerRow);
    chart.rows.forEach(function (item, rowIndex) {
      const row = ws.addRow([sanitizeExportValue(item && item[chart.xKey])].concat(chart.series.map(function (serie) {
        return coerceExcelCell(sanitizeExportValue(item && item[serie.key], serie.key));
      })));
      row.eachCell({ includeEmpty: true }, function (cell) {
        cell.border = excelThinBorder();
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      if (rowIndex % 2 === 1) {
        row.eachCell({ includeEmpty: true }, function (cell) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor(ZEBRA_RGB) } };
        });
      }
    });
    ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: Math.max(1, chart.series.length + 1) } };
    return ws;
  }

  async function exportReportXLSXExcelJS(filename, normalized) {
    const ExcelJSLib = await ensureExcelJS();
    const workbook = new ExcelJSLib.Workbook();
    workbook.creator = BRAND.name;
    workbook.created = new Date(normalized.generatedAt);
    workbook.title = normalized.title;

    addExcelCover(workbook, normalized);
    normalized.sections.forEach(function (section, index) {
      if (section.chart) addExcelChartSheet(workbook, section);
      addExcelSection(workbook, section.title || ('Dados ' + (index + 1)), section.xlsxColumns.length ? section.xlsxColumns : section.columns, section.rows);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(filename, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // Fallback SheetJS (sem estilo) — usado se o ExcelJS falhar.
  async function exportReportXLSXSheetJS(filename, normalized) {
    const XLSX = await ensureXLSX();
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: normalized.title,
      Subject: normalized.subtitle,
      Author: BRAND.name,
      CreatedDate: new Date(normalized.generatedAt),
    };
    appendSheet(XLSX, workbook, 'Resumo Executivo', [{
      relatorio: normalized.title,
      Contexto: normalized.subtitle,
      Fonte: normalized.source,
      Gerado_em: new Date(normalized.generatedAt).toLocaleString('pt-BR'),
    }].concat(normalized.kpis.map(function (row) {
      return { relatorio: row.Indicador, Contexto: row.Valor, Fonte: row.Contexto, Gerado_em: '' };
    })));
    appendSheet(XLSX, workbook, 'Filtros Aplicados', normalized.filters.length ? normalized.filters : [{ Filtro: 'Todos', Valor: 'Sem filtros adicionais' }]);
    appendSheet(XLSX, workbook, 'Indicadores', normalized.kpis.length ? normalized.kpis : [{ Indicador: 'Sem KPIs', Valor: '', Contexto: '' }]);
    normalized.sections.forEach(function (section, index) {
      if (section.chart) {
        appendSheet(XLSX, workbook, 'Gráfico - ' + section.title, section.chart.series.map(function (serie) {
          const values = section.chart.rows.map(function (row) { return Number(row && row[serie.key]) || 0; });
          return {
            serie: serie.label,
            total: values.reduce(function (sum, value) { return sum + value; }, 0),
            pico: values.reduce(function (max, value) { return Math.max(max, value); }, 0),
            tendencia: buildSparkline(values),
            ultimo_valor: values.length ? values[values.length - 1] : 0
          };
        }), ['serie', 'total', 'pico', 'tendencia', 'ultimo_valor']);
      }
      appendSheet(XLSX, workbook, section.title || ('Dados ' + (index + 1)), section.rows, section.xlsxColumns.length ? section.xlsxColumns : section.columns);
    });
    XLSX.writeFile(workbook, filename);
  }

  async function exportReportXLSX(filename, report) {
    const normalized = normalizeReport(report);
    try {
      await exportReportXLSXExcelJS(filename, normalized);
      return;
    } catch (excelError) {
      console.warn('[KCAdminExport] ExcelJS indisponível, tentando SheetJS:', excelError);
    }
    try {
      await exportReportXLSXSheetJS(filename, normalized);
      return;
    } catch (sheetError) {
      console.warn('[KCAdminExport] XLSX indisponível, usando CSV simples:', sheetError);
      downloadText(filename.replace(/\.xlsx$/i, '.csv'), buildFallbackCsv(normalized), 'text/csv;charset=utf-8');
    }
  }

  function setTextColor(doc, color) {
    doc.setTextColor(color[0], color[1], color[2]);
  }

  function setFillColor(doc, color) {
    doc.setFillColor(color[0], color[1], color[2]);
  }

  function addPdfHeader(doc, report, pageWidth) {
    setFillColor(doc, BRAND.orange);
    doc.rect(0, 0, pageWidth, 76, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(BRAND.name, 42, 31);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfLines(doc, report.title, pageWidth - 84, 2), 42, 50);
  }

  function addPdfFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextColor(doc, BRAND.muted);
      doc.text('KinoCampus Admin - dados administrativos agregados', 42, pageHeight - 24);
      doc.text(String(page) + '/' + String(pageCount), pageWidth - 64, pageHeight - 24);
    }
  }

  async function exportReportPDF(filename, report) {
    const normalized = normalizeReport(report);
    try {
      const JsPDF = await ensureAutoTable();
      const doc = new JsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      let y = 102;

      function addPageIfNeeded(height) {
        if (y + height <= pageHeight - 48) return;
        doc.addPage();
        addPdfHeader(doc, normalized, pageWidth);
        y = 102;
      }

      function drawSectionTitle(title, note) {
        addPageIfNeeded(44);
        setTextColor(doc, BRAND.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        const titleLines = pdfLines(doc, String(title || 'Seção'), pageWidth - margin * 2, 2);
        doc.text(titleLines, margin, y);
        y += titleLines.length * 12 + 3;
        if (note) {
          setTextColor(doc, BRAND.muted);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const lines = pdfLines(doc, String(note), pageWidth - margin * 2, 3);
          doc.text(lines, margin, y);
          y += lines.length * 10 + 6;
        }
      }

      function drawKpiCards(rows) {
        const list = Array.isArray(rows) && rows.length ? rows : [{ Indicador: 'Sem KPIs', Valor: '', Contexto: '' }];
        const gap = 12;
        const columns = 2;
        const cardWidth = (pageWidth - margin * 2 - gap) / columns;
        const cardHeight = 66;

        list.slice(0, 8).forEach(function (row, index) {
          const col = index % columns;
          const x = margin + (col * (cardWidth + gap));
          if (col === 0) addPageIfNeeded(cardHeight + 12);
          const yCard = y;
          doc.setDrawColor(BRAND.border[0], BRAND.border[1], BRAND.border[2]);
          doc.setFillColor(255, 255, 255);
          doc.rect(x, yCard, cardWidth, cardHeight, 'FD');
          setFillColor(doc, BRAND.light);
          doc.rect(x, yCard, 5, cardHeight, 'F');
          setTextColor(doc, BRAND.muted);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(pdfLines(doc, truncate(row.Indicador || 'Indicador', 48), cardWidth - 28, 1), x + 14, yCard + 18);
          setTextColor(doc, BRAND.dark);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          const valueLines = pdfLines(doc, truncate(row.Valor, 64), cardWidth - 28, 2);
          doc.text(valueLines, x + 14, yCard + 36);
          if (row.Contexto) {
            setTextColor(doc, BRAND.muted);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(pdfLines(doc, truncate(row.Contexto, 42), cardWidth - 28, 1), x + 14, yCard + 56);
          }
          if (col === columns - 1 || index === Math.min(list.length, 8) - 1) y += cardHeight + 12;
        });
        if (list.length > 8) {
          addPageIfNeeded(18);
          setTextColor(doc, BRAND.muted);
          doc.setFontSize(8);
          doc.text('KPIs adicionais disponíveis no XLSX.', margin, y);
          y += 18;
        }
      }

      function drawRows(rows, maxRows, columns) {
        const normalizedColumns = normalizeColumns(columns);
        const normalizedRows = normalizeRows(rows, columns);
        const limit = maxRows || MAX_PDF_ROWS;
        const fullList = normalizedRows.length ? normalizedRows : [{ Status: 'Sem dados para os filtros selecionados' }];
        const list = fullList.slice(0, limit);
        const headers = normalizedColumns.length
          ? normalizedColumns.map(function (column) { return column.label; })
          : Object.keys(list[0]).slice(0, 6);
        const head = [headers];
        const body = list.map(function (row) {
          return headers.map(function (header) { return truncate(sanitizeExportValue(row[header], header), 600); });
        });

        const tableWidth = pageWidth - margin * 2;
        const totalWeight = normalizedColumns.reduce(function (sum, column) {
          return sum + (Number(column.width) > 0 ? Number(column.width) : 1);
        }, 0) || headers.length || 1;
        const columnStyles = {};
        if (normalizedColumns.length) {
          normalizedColumns.forEach(function (column, index) {
            const weight = Number(column.width) > 0 ? Number(column.width) : 1;
            columnStyles[index] = { cellWidth: tableWidth * (weight / totalWeight) };
          });
        }

        doc.autoTable({
          head: head,
          body: body,
          startY: y,
          margin: { left: margin, right: margin, top: 90, bottom: 40 },
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.5, valign: 'top' },
          headStyles: { fillColor: BRAND.orange, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: columnStyles,
          didDrawPage: function () { addPdfHeader(doc, normalized, pageWidth); },
        });

        y = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : y) + 14;
        if (fullList.length > limit) {
          addPageIfNeeded(18);
          setTextColor(doc, BRAND.muted);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(pdfLines(doc, 'PDF resumido: ' + (fullList.length - limit) + ' linhas adicionais disponíveis no XLSX.', pageWidth - margin * 2, 2), margin, y);
          y += 18;
        }
        y += 6;
      }

      function drawLineChart(chart) {
        if (!chart || !Array.isArray(chart.rows) || !chart.rows.length || !Array.isArray(chart.series) || !chart.series.length) return;
        const chartHeight = 190;
        const legendRows = Math.ceil(chart.series.length / 2);
        const legendHeight = Math.max(18, legendRows * 16);
        addPageIfNeeded(chartHeight + legendHeight + 26);

        const chartX = margin;
        const chartY = y;
        const chartWidth = pageWidth - margin * 2;
        const padLeft = 42;
        const padRight = 14;
        const padTop = 18;
        const padBottom = 32;
        const innerWidth = chartWidth - padLeft - padRight;
        const innerHeight = chartHeight - padTop - padBottom;
        const rows = chart.rows;
        const series = chart.series;
        let maxValue = 0;

        rows.forEach(function (row) {
          series.forEach(function (serie) {
            const value = Number(row && row[serie.key]);
            if (Number.isFinite(value)) maxValue = Math.max(maxValue, value);
          });
        });
        maxValue = Math.max(maxValue, 1);

        doc.setDrawColor(BRAND.border[0], BRAND.border[1], BRAND.border[2]);
        doc.setFillColor(255, 255, 255);
        doc.rect(chartX, chartY, chartWidth, chartHeight, 'FD');

        setTextColor(doc, BRAND.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        for (let i = 0; i <= 4; i += 1) {
          const ratio = i / 4;
          const value = Math.round(maxValue * (1 - ratio));
          const gridY = chartY + padTop + (innerHeight * ratio);
          doc.setDrawColor(229, 231, 235);
          doc.line(chartX + padLeft, gridY, chartX + chartWidth - padRight, gridY);
          doc.text(String(value), chartX + 8, gridY + 2.5);
        }

        doc.setDrawColor(156, 163, 175);
        doc.line(chartX + padLeft, chartY + padTop, chartX + padLeft, chartY + padTop + innerHeight);
        doc.line(chartX + padLeft, chartY + padTop + innerHeight, chartX + chartWidth - padRight, chartY + padTop + innerHeight);

        const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;
        series.forEach(function (serie) {
          const color = parseChartColor(serie.color);
          doc.setDrawColor(color[0], color[1], color[2]);
          doc.setFillColor(color[0], color[1], color[2]);
          doc.setLineWidth(1.6);
          let previous = null;
          rows.forEach(function (row, index) {
            const value = Math.max(0, Number(row && row[serie.key]) || 0);
            const pointX = chartX + padLeft + (step * index);
            const pointY = chartY + padTop + innerHeight - ((value / maxValue) * innerHeight);
            if (previous) doc.line(previous.x, previous.y, pointX, pointY);
            previous = { x: pointX, y: pointY };
          });
          doc.setLineWidth(0.8);
          rows.forEach(function (row, index) {
            const value = Math.max(0, Number(row && row[serie.key]) || 0);
            const pointX = chartX + padLeft + (step * index);
            const pointY = chartY + padTop + innerHeight - ((value / maxValue) * innerHeight);
            doc.circle(pointX, pointY, 1.6, 'F');
          });
        });

        setTextColor(doc, BRAND.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        rows.forEach(function (row, index) {
          if (rows.length > 9 && index !== 0 && index !== rows.length - 1 && index % Math.ceil(rows.length / 6) !== 0) return;
          const pointX = chartX + padLeft + (step * index);
          const label = sanitizeExportValue(row && row[chart.xKey]);
          doc.text(pdfLines(doc, label, 34, 1), pointX, chartY + chartHeight - 10, { align: 'center' });
        });

        doc.setFontSize(8);
        doc.text(chart.yLabel || 'Total', chartX + 8, chartY + 12);
        doc.text(chart.xLabel || 'Dia', chartX + chartWidth - padRight, chartY + chartHeight - 10, { align: 'right' });

        y += chartHeight + 10;
        const legendWidth = (chartWidth - 12) / 2;
        series.forEach(function (serie, index) {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const lx = margin + (col * (legendWidth + 12));
          const ly = y + (row * 16);
          const color = parseChartColor(serie.color, index);
          doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(lx + 4, ly + 4, 3, 'F');
          setTextColor(doc, BRAND.dark);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const total = chart.rows.reduce(function (sum, item) { return sum + (Number(item && item[serie.key]) || 0); }, 0);
          doc.text(pdfLines(doc, serie.label + ': ' + total, legendWidth - 16, 1), lx + 12, ly + 6);
        });
        y += legendHeight + 10;
      }

      addPdfHeader(doc, normalized, pageWidth);

      setTextColor(doc, BRAND.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const subtitleLines = pdfLines(doc, normalized.subtitle, pageWidth - margin * 2, 2);
      doc.text(subtitleLines, margin, y);
      y += subtitleLines.length * 11 + 4;
      const sourceLines = pdfLines(doc, 'Fonte: ' + normalized.source + ' | Gerado em ' + new Date(normalized.generatedAt).toLocaleString('pt-BR'), pageWidth - margin * 2, 2);
      doc.text(sourceLines, margin, y);
      y += sourceLines.length * 11 + 12;

      if (normalized.filters.length) {
        drawSectionTitle('Filtros aplicados');
        drawRows(normalized.filters, 12);
      }

      if (normalized.kpis.length) {
        drawSectionTitle('Resumo executivo');
        drawKpiCards(normalized.kpis);
      }

      normalized.sections.forEach(function (section) {
        drawSectionTitle(section.title, section.note);
        if (section.chart) drawLineChart(section.chart);
        drawRows(section.rows, section.maxPdfRows || MAX_PDF_ROWS, section.pdfColumns.length ? section.pdfColumns : section.columns);
      });

      addPdfFooter(doc);
      doc.save(filename);
    } catch (error) {
      console.warn('[KCAdminExport] PDF avançado indisponível, usando TXT simples:', error);
      downloadText(filename.replace(/\.pdf$/i, '.txt'), buildFallbackCsv(normalized), 'text/plain;charset=utf-8');
    }
  }

  async function exportXLSX(filename, sheets) {
    return exportReportXLSX(filename, {
      title: 'KinoCampus - Exportação Admin',
      subtitle: 'Exportação contextual',
      sections: (Array.isArray(sheets) ? sheets : []).map(function (sheet) {
        return { title: sheet && (sheet.title || sheet.name) || 'Dados', rows: sheet && sheet.rows || [] };
      }),
    });
  }

  async function exportPDF(filename, title, sections) {
    return exportReportPDF(filename, {
      title: title || 'KinoCampus - Exportação Admin',
      subtitle: 'Relatório administrativo',
      sections: (Array.isArray(sections) ? sections : []).map(function (section) {
        return { title: section && (section.title || section.name) || 'Dados', rows: section && section.rows || [] };
      }),
    });
  }

  window.KCAdminExport = Object.freeze({
    ensureXLSX,
    ensureJsPDF,
    ensureExcelJS,
    ensureAutoTable,
    sanitizeExportValue,
    sanitizeExportObject,
    normalizeRows,
    normalizeColumns,
    exportReportXLSX,
    exportReportPDF,
    exportXLSX,
    exportPDF,
  });
}());
