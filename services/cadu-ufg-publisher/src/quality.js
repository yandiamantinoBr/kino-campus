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

function getPayloadMeta(payload) {
  const metadata = payload && payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  return metadata;
}

function hasHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return /^https?:$/.test(url.protocol);
  } catch (_) {
    return false;
  }
}

function evaluatePayloadQuality(item, classification, payload) {
  const warnings = [];
  const description = String(payload.descricao || payload.description || '');
  const normalizedDescription = normalizeText(description);
  const metadata = getPayloadMeta(payload);
  const moduleKey = String(payload.modulo || payload.module || classification.module || '').trim();
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

  if (item.sourceUrl && metadata.source_url !== item.sourceUrl) {
    warnings.push('source_url_mismatch');
  }

  if (!String(metadata.contato || payload.contato || '').trim()) {
    warnings.push('missing_contact');
  }

  if (!hasHttpUrl(metadata.link || payload.link)) {
    warnings.push('missing_cta_link');
  }

  if (metadata.link_as_cta !== true) {
    warnings.push('missing_link_as_cta');
  }

  if (!String(metadata.actionLabel || payload.actionLabel || '').trim() || !String(metadata.actionKey || payload.actionKey || '').trim()) {
    warnings.push('missing_action_metadata');
  }

  if (!String(metadata.area || payload.area || '').trim() || !String(metadata.areaKey || payload.areaKey || '').trim()) {
    warnings.push('missing_area_metadata');
  }

  if (!String(metadata.categoria || metadata.categoryLabel || payload.categoriaLabel || payload.categoria || '').trim()
    || !String(metadata.categoriaKey || metadata.categoryKey || payload.categoriaKey || payload.category || '').trim()) {
    warnings.push('missing_category_metadata');
  }

  if (!Array.isArray(metadata.tags) || !metadata.tags.length || !Array.isArray(metadata.tagKeys) || !metadata.tagKeys.length) {
    warnings.push('missing_tag_metadata');
  }

  if (metadata.gratuito !== true) {
    warnings.push('missing_free_flag');
  }

  if (moduleKey === 'eventos' && !String(metadata.data_evento || '').trim()) {
    warnings.push('missing_event_date');
  } else if (moduleKey === 'eventos' && !String(metadata.hora_evento || '').trim()) {
    warnings.push('missing_event_time');
  }

  if (moduleKey === 'oportunidades' && !String(metadata.modalidadeTrabalho || payload.modalidadeTrabalho || '').trim()) {
    warnings.push('missing_work_mode');
  }

  if (!imageUrls(payload).length) {
    warnings.push('missing_image_url');
  } else if (!hasValidRemoteImages(payload)) {
    warnings.push('invalid_image_url');
  }

  const blockingWarnings = warnings.filter((warning) => warning !== 'missing_event_time');
  return {
    ok: blockingWarnings.length === 0,
    warnings,
    blockingWarnings,
  };
}

module.exports = {
  countDates,
  evaluatePayloadQuality,
  hasGenericBoilerplate,
  hasHttpUrl,
  imageUrls,
};
