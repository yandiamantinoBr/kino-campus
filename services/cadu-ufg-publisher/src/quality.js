'use strict';

const { normalizeText } = require('./utils');

function countDates(text) {
  return (String(text || '').match(/\b[0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?\b|\b[0-3]?\d\s+de\s+[A-Za-z\xc0-\xff]+/g) || []).length;
}

function hasGenericBoilerplate(text) {
  const normalized = normalizeText(text);
  return /universidade gratuita|mais de\s+\d+\s+mil alunos|ensino pesquisa e extensao|ensino extensao e pesquisa|uma das (maiores|melhores) universidades|instituicao federal de ensino/.test(normalized);
}

function imageUrls(payload) {
  const metadata = payload && payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  return [
    ...(Array.isArray(payload && payload.imagens) ? payload.imagens : []),
    payload && payload.image_url,
    payload && payload.cover_url,
    metadata.image_url,
    metadata.cover_url,
  ].filter(Boolean);
}

function hasValidRemoteImages(payload) {
  const images = imageUrls(payload);
  return images.every((image) => {
    try {
      const url = new URL(String(image || ''));
      return /^https?:$/.test(url.protocol);
    } catch (_) {
      return false;
    }
  });
}

function evaluatePayloadQuality(item, classification, payload) {
  const warnings = [];
  const description = String(payload.descricao || payload.description || '');
  const normalizedDescription = normalizeText(description);
  const sourceText = `${item.title || ''}\n${item.summary || ''}\n${item.text || ''}`;
  const normalizedSource = normalizeText(sourceText);
  const pdfLinks = Array.isArray(item.pdfLinks) ? item.pdfLinks.filter(Boolean) : [];
  const actionable = Boolean(
    classification.hasPdf ||
    classification.hasDeadline ||
    pdfLinks.length ||
    /\b(edital|chamada|processo seletivo|inscric|submiss|prazo|cronograma|bolsa|vagas)\w*/.test(normalizedSource)
  );

  if (actionable && hasGenericBoilerplate(description)) {
    warnings.push('generic_summary');
  }

  if (pdfLinks.length > 1 && !/\bdocumentos encontrados\b|\beditais e documentos\b|\bpdfs oficiais\b|\bvarios editais\b|\bmultiplos editais\b/.test(normalizedDescription)) {
    warnings.push('missing_multiple_documents');
  }

  if (classification.hasDeadline && !/\b(prazo|cronograma|inscric|submiss)\w*/.test(normalizedDescription)) {
    warnings.push('missing_deadline_context');
  }

  const sourceDateCount = countDates(sourceText);
  const descriptionDateCount = countDates(description);
  if (sourceDateCount >= 2 && descriptionDateCount < Math.min(2, sourceDateCount)) {
    warnings.push('missing_schedule_dates');
  }

  if (item.sourceUrl && payload.metadata && payload.metadata.source_url !== item.sourceUrl) {
    warnings.push('source_url_mismatch');
  }

  if (!imageUrls(payload).length) {
    warnings.push('missing_image_url');
  } else if (!hasValidRemoteImages(payload)) {
    warnings.push('invalid_image_url');
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}

module.exports = {
  countDates,
  evaluatePayloadQuality,
  hasGenericBoilerplate,
  imageUrls,
};
