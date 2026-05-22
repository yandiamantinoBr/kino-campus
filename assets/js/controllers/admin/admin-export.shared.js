(function () {
  'use strict';

  function getAssetPrefix() {
    const path = String(window.location && window.location.pathname || '');
    return path.indexOf('/admin/') >= 0 || /\/admin\/[^/]*$/.test(path) ? '../' : '';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = Array.from(document.scripts || []).find(function (script) {
        return script.src && script.src.indexOf(src.replace(/^\.\.\//, '')) >= 0;
      });
      if (existing) {
        if (existing.dataset.kcLoaded === '1') resolve();
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

  function normalizeRows(rows) {
    return Array.isArray(rows) ? rows.map(function (row) {
      if (!row || typeof row !== 'object') return { valor: row };
      return row;
    }) : [];
  }

  async function exportXLSX(filename, sheets) {
    const XLSX = await ensureXLSX();
    const workbook = XLSX.utils.book_new();
    (Array.isArray(sheets) ? sheets : []).forEach(function (sheet) {
      const name = String(sheet && sheet.name || 'Dados').slice(0, 31);
      const worksheet = XLSX.utils.json_to_sheet(normalizeRows(sheet && sheet.rows));
      XLSX.utils.book_append_sheet(workbook, worksheet, name || 'Dados');
    });
    XLSX.writeFile(workbook, filename);
  }

  async function exportPDF(filename, title, sections) {
    const JsPDF = await ensureJsPDF();
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 48;

    function addPageIfNeeded(height) {
      if (y + height <= pageHeight - 48) return;
      doc.addPage();
      y = 48;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(title || 'Export KinoCampus'), 48, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Gerado em ' + new Date().toLocaleString('pt-BR'), 48, y);
    y += 24;

    (Array.isArray(sections) ? sections : []).forEach(function (section) {
      addPageIfNeeded(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(String(section && section.title || 'Secao'), 48, y);
      y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      normalizeRows(section && section.rows).slice(0, 60).forEach(function (row) {
        const text = Object.keys(row).map(function (key) {
          return key + ': ' + String(row[key] == null ? '' : row[key]);
        }).join(' | ');
        const lines = doc.splitTextToSize(text, pageWidth - 96);
        addPageIfNeeded(lines.length * 11 + 8);
        doc.text(lines, 48, y);
        y += lines.length * 11 + 6;
      });
      y += 10;
    });

    doc.save(filename);
  }

  window.KCAdminExport = Object.freeze({
    ensureXLSX,
    ensureJsPDF,
    exportXLSX,
    exportPDF,
  });
}());
