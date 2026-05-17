'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { clamp, normalizeWhitespace } = require('./utils');

async function extractPdfText(config, pdfUrl) {
  if (!pdfUrl) return { text: '', skippedReason: 'missing_pdf_url' };
  const maxBytes = Number(config.maxPdfBytes || process.env.CADU_MAX_PDF_BYTES || 25 * 1024 * 1024);
  const command = process.env.CADU_PDFTOTEXT_PATH || 'pdftotext';

  const response = await fetch(pdfUrl, {
    headers: {
      'user-agent': config.userAgent || 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)',
      accept: 'application/pdf,*/*',
    },
  });
  if (!response.ok) return { text: '', skippedReason: `http_${response.status}` };

  const length = Number(response.headers.get('content-length') || 0);
  if (length && length > maxBytes) return { text: '', skippedReason: 'pdf_too_large' };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) return { text: '', skippedReason: 'pdf_too_large' };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadu-pdf-'));
  const filePath = path.join(tmpDir, 'edital.pdf');
  try {
    fs.writeFileSync(filePath, buffer);
    const result = spawnSync(command, ['-layout', filePath, '-'], {
      encoding: 'utf8',
      timeout: Number(process.env.CADU_PDFTOTEXT_TIMEOUT_MS || 20000),
      maxBuffer: 5 * 1024 * 1024,
    });
    if (result.error) return { text: '', skippedReason: `pdftotext:${result.error.message}` };
    if (result.status !== 0) return { text: '', skippedReason: `pdftotext_exit_${result.status}` };
    return { text: clamp(normalizeWhitespace(result.stdout || ''), 12000), skippedReason: '' };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }
  }
}

module.exports = {
  extractPdfText,
};
