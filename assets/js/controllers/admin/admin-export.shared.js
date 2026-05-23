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
    if (!window.XLSX) throw new Error('XLSX indisponivel');
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
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF indisponivel');
    return window.jspdf.jsPDF;
  }

  function titleCaseLabel(key) {
    return String(key || 'valor')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }) || 'Valor';
  }

  function truncate(value, limit) {
    const text = String(value == null ? '' : value);
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
    return truncate(value);
  }

  function sanitizeExportObject(row) {
    if (!row || typeof row !== 'object') return row;
    const clean = {};
    Object.keys(row).forEach(function (key) {
      if (SENSITIVE_KEY_RE.test(key)) return;
      clean[titleCaseLabel(key)] = sanitizeExportValue(row[key], key);
    });
    return clean;
  }

  function normalizeRows(rows) {
    return Array.isArray(rows) ? rows.map(function (row) {
      if (!row || typeof row !== 'object') return { Valor: sanitizeExportValue(row) };
      return sanitizeExportObject(row);
    }) : [];
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
      return {
        title: String(section && (section.title || section.name) || 'Dados'),
        rows: normalizeRows(section && section.rows),
        note: String(section && section.note || ''),
      };
    });
  }

  function normalizeReport(report) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const generatedAt = safeReport.generatedAt || new Date().toISOString();
    const title = String(safeReport.title || 'Relatorio administrativo KinoCampus');
    const subtitle = String(safeReport.subtitle || 'Exportacao contextual do painel admin');
    const filters = normalizeFilters(safeReport.filters || {});
    const kpis = normalizeKpis(safeReport.kpis || {});
    const sections = normalizeSections(safeReport.sections || []);
    return {
      title,
      subtitle,
      generatedAt,
      source: String(safeReport.source || 'Painel Admin KinoCampus'),
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

  function appendSheet(XLSX, workbook, name, rows) {
    const normalized = normalizeRows(rows);
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
      const rows = section.rows || [];
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

  async function exportReportXLSX(filename, report) {
    const normalized = normalizeReport(report);
    try {
      const XLSX = await ensureXLSX();
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: normalized.title,
        Subject: normalized.subtitle,
        Author: BRAND.name,
        CreatedDate: new Date(normalized.generatedAt),
      };

      appendSheet(XLSX, workbook, 'Resumo', [{
        Relatorio: normalized.title,
        Contexto: normalized.subtitle,
        Fonte: normalized.source,
        Gerado_em: new Date(normalized.generatedAt).toLocaleString('pt-BR'),
      }].concat(normalized.kpis.map(function (row) {
        return {
          Relatorio: row.Indicador,
          Contexto: row.Valor,
          Fonte: row.Contexto,
          Gerado_em: '',
        };
      })));
      appendSheet(XLSX, workbook, 'Filtros', normalized.filters.length ? normalized.filters : [{ Filtro: 'Todos', Valor: 'Sem filtros adicionais' }]);
      appendSheet(XLSX, workbook, 'KPIs', normalized.kpis.length ? normalized.kpis : [{ Indicador: 'Sem KPIs', Valor: '', Contexto: '' }]);
      normalized.sections.forEach(function (section, index) {
        appendSheet(XLSX, workbook, section.title || ('Dados ' + (index + 1)), section.rows);
      });
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.warn('[KCAdminExport] XLSX avancado indisponivel, usando CSV simples:', error);
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
    doc.text(report.title, 42, 52);
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
      const JsPDF = await ensureJsPDF();
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
        doc.text(String(title || 'Secao'), margin, y);
        y += 15;
        if (note) {
          setTextColor(doc, BRAND.muted);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const lines = doc.splitTextToSize(String(note), pageWidth - margin * 2);
          doc.text(lines, margin, y);
          y += lines.length * 10 + 6;
        }
      }

      function drawKpiCards(rows) {
        const list = Array.isArray(rows) && rows.length ? rows : [{ Indicador: 'Sem KPIs', Valor: '', Contexto: '' }];
        const gap = 12;
        const columns = 2;
        const cardWidth = (pageWidth - margin * 2 - gap) / columns;
        const cardHeight = 58;

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
          doc.text(truncate(row.Indicador || 'Indicador', 34), x + 14, yCard + 18);
          setTextColor(doc, BRAND.dark);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.text(truncate(row.Valor, 18), x + 14, yCard + 38);
          if (row.Contexto) {
            setTextColor(doc, BRAND.muted);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(truncate(row.Contexto, 36), x + 14, yCard + 50);
          }
          if (col === columns - 1 || index === Math.min(list.length, 8) - 1) y += cardHeight + 12;
        });
        if (list.length > 8) {
          addPageIfNeeded(18);
          setTextColor(doc, BRAND.muted);
          doc.setFontSize(8);
          doc.text('KPIs adicionais disponiveis no XLSX.', margin, y);
          y += 18;
        }
      }

      function drawRows(rows, maxRows) {
        const list = Array.isArray(rows) && rows.length ? rows : [{ Status: 'Sem dados para os filtros selecionados' }];
        const headers = Object.keys(list[0]).slice(0, 4);
        const colWidth = (pageWidth - margin * 2) / Math.max(headers.length, 1);

        addPageIfNeeded(28);
        setFillColor(doc, BRAND.dark);
        doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        headers.forEach(function (header, index) {
          doc.text(truncate(titleCaseLabel(header), 18), margin + (index * colWidth) + 8, y + 14);
        });
        y += 22;

        list.slice(0, maxRows || MAX_PDF_ROWS).forEach(function (row, rowIndex) {
          const cellLines = headers.map(function (header) {
            return doc.splitTextToSize(sanitizeExportValue(row[header], header), colWidth - 14);
          });
          const lineCount = Math.max.apply(null, cellLines.map(function (lines) { return lines.length; }).concat([1]));
          const rowHeight = Math.max(24, lineCount * 10 + 12);
          addPageIfNeeded(rowHeight + 4);
          if (rowIndex % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'F');
          }
          doc.setDrawColor(BRAND.border[0], BRAND.border[1], BRAND.border[2]);
          doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'S');
          setTextColor(doc, BRAND.dark);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          cellLines.forEach(function (lines, index) {
            doc.text(lines, margin + (index * colWidth) + 8, y + 13);
          });
          y += rowHeight;
        });
        if (list.length > (maxRows || MAX_PDF_ROWS)) {
          addPageIfNeeded(18);
          setTextColor(doc, BRAND.muted);
          doc.setFontSize(8);
          doc.text('PDF resumido: ' + (list.length - (maxRows || MAX_PDF_ROWS)) + ' linhas adicionais disponiveis no XLSX.', margin, y);
          y += 18;
        }
      }

      addPdfHeader(doc, normalized, pageWidth);

      setTextColor(doc, BRAND.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(normalized.subtitle, margin, y);
      y += 14;
      doc.text('Fonte: ' + normalized.source + ' | Gerado em ' + new Date(normalized.generatedAt).toLocaleString('pt-BR'), margin, y);
      y += 22;

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
        drawRows(section.rows, MAX_PDF_ROWS);
      });

      addPdfFooter(doc);
      doc.save(filename);
    } catch (error) {
      console.warn('[KCAdminExport] PDF avancado indisponivel, usando TXT simples:', error);
      downloadText(filename.replace(/\.pdf$/i, '.txt'), buildFallbackCsv(normalized), 'text/plain;charset=utf-8');
    }
  }

  async function exportXLSX(filename, sheets) {
    return exportReportXLSX(filename, {
      title: 'KinoCampus - Exportacao Admin',
      subtitle: 'Exportacao contextual',
      sections: (Array.isArray(sheets) ? sheets : []).map(function (sheet) {
        return { title: sheet && (sheet.title || sheet.name) || 'Dados', rows: sheet && sheet.rows || [] };
      }),
    });
  }

  async function exportPDF(filename, title, sections) {
    return exportReportPDF(filename, {
      title: title || 'KinoCampus - Exportacao Admin',
      subtitle: 'Relatorio administrativo',
      sections: (Array.isArray(sections) ? sections : []).map(function (section) {
        return { title: section && (section.title || section.name) || 'Dados', rows: section && section.rows || [] };
      }),
    });
  }

  window.KCAdminExport = Object.freeze({
    ensureXLSX,
    ensureJsPDF,
    sanitizeExportValue,
    sanitizeExportObject,
    normalizeRows,
    exportReportXLSX,
    exportReportPDF,
    exportXLSX,
    exportPDF,
  });
}());
