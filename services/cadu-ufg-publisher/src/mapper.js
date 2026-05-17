'use strict';

const {
  clamp,
  extractEmails,
  normalizeText,
  normalizeWhitespace,
  parseBrazilianDate,
  parseTime,
  sha256,
  slugify,
  uniq,
} = require('./utils');

function detectArea(text) {
  const normalized = normalizeText(text);
  if (/direito|juridic/.test(normalized)) return 'Direito';
  if (/saude|farmacia|medicina|enfermagem|biologia|nutricao/.test(normalized)) return 'Saude';
  if (/computacao|software|tecnologia|sistema|informatica/.test(normalized)) return 'Tecnologia';
  if (/comunicacao|jornalismo|publicidade/.test(normalized)) return 'Comunicacao';
  if (/engenharia|arquitetura/.test(normalized)) return 'Engenharia';
  if (/letras|linguas|idioma/.test(normalized)) return 'Linguas';
  if (/arte|musica|danca|teatro/.test(normalized)) return 'Artes';
  return 'Academica';
}

function detectLocation(text, sourceName) {
  const source = normalizeWhitespace(sourceName || 'UFG');
  const match = String(text || '').match(/\b(?:local|onde|campus|cidade)\s*:\s*([^\n.;]{4,90})/i);
  return normalizeWhitespace(match ? match[1] : source || 'UFG');
}

function buildDescription(item, classification, summaryText = '') {
  const original = normalizeWhitespace(summaryText || item.summary || item.text || '');
  const chunks = [];
  const isOpportunity = classification.module === 'oportunidades';
  chunks.push(isOpportunity ? '📌 Resumo' : '📅 Resumo');
  chunks.push(clamp(original, 850));

  if (classification.hasDeadline) {
    const deadlineDate = classification.temporal && classification.temporal.deadlineDate
      ? classification.temporal.deadlineDate.split('-').reverse().join('/')
      : '';
    chunks.push(deadlineDate
      ? `⏰ Prazo: ${deadlineDate}. Confira as regras no link oficial.`
      : '⏰ Prazo: confira a data e as regras no link oficial.');
  }

  if (classification.hasPdf) {
    const audience = pickSentence(original, /(quem pode|publico|estudantes|discente|candidato|servidor|comunidade)/i);
    const deadline = pickSentence(original, /(prazo|inscricoes?|ate o dia|periodo|cronograma)/i);
    chunks.push([
      '📄 Edital',
      `Quem pode participar: ${audience || 'confira os requisitos no edital oficial.'}`,
      `Prazo: ${deadline || 'confira o cronograma no edital oficial.'}`,
      'Inscricao: use o link oficial da UFG.',
      'Atencao: o edital oficial prevalece sobre este resumo.',
    ].join('\n'));
  }

  chunks.push(`🔗 Fonte oficial: ${item.sourceUrl}`);
  return clamp(chunks.filter(Boolean).join('\n\n'), 2000);
}

function pickSentence(text, pattern) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+|\n+/).map(normalizeWhitespace).filter(Boolean);
  const found = sentences.find((sentence) => pattern.test(sentence));
  return found ? clamp(found, 220) : '';
}

function mapToKinoPayload(item, classification, options = {}) {
  const text = `${item.title}\n${item.summary}\n${item.text}`;
  const title = clamp(item.title, 80);
  const description = buildDescription(item, classification, options.summaryText);
  const sourceUrl = item.sourceUrl;
  const tags = uniq([
    'UFG',
    item.sourceName,
    classification.category,
    classification.hasPdf ? 'edital' : '',
    classification.hasDeadline ? 'prazo' : '',
  ]).slice(0, 8);

  const metadata = {
    source_url: sourceUrl,
    source_host: (() => { try { return new URL(sourceUrl).host; } catch (_) { return ''; } })(),
    source_unit: item.sourceName,
    source_id: item.id,
    source_lastmod: item.updatedAt || '',
    content_hash: sha256(`${item.title}\n${item.text}`),
    original_title: item.title,
    edital_pdf_url: (item.pdfLinks && item.pdfLinks[0]) || '',
    confidence_score: classification.confidence,
    deadline_date: (classification.temporal && classification.temporal.deadlineDate) || '',
    event_date_detected: (classification.temporal && classification.temporal.eventDate) || '',
    temporal_status: classification.temporal && classification.temporal.expired ? classification.temporal.reason : 'current_or_unknown',
    cadu_run_id: options.runId || '',
    link: sourceUrl,
    link_as_cta: true,
    visibility: 'public',
  };

  if (classification.module === 'eventos') {
    const date = parseBrazilianDate(text);
    const time = parseTime(text);
    return {
      modulo: 'eventos',
      moduloLabel: 'Eventos',
      categoria: classification.category,
      categoriaKey: classification.category,
      subcategoria: '',
      subcategoriaKey: '',
      titulo: title,
      descricao: description,
      preco: 0,
      localizacao: detectLocation(text, item.sourceName),
      visibility: 'public',
      tags,
      imagens: [],
      metadata: {
        ...metadata,
        subcategory: '',
        categoriaKey: classification.category,
        data_evento: date,
        hora_evento: time,
        gratuito: true,
      },
    };
  }

  const emails = extractEmails(text);
  const area = detectArea(text);
  const category = classification.category || 'monitoria';
  return {
    modulo: 'oportunidades',
    moduloLabel: 'Oportunidades',
    categoria: category,
    categoriaKey: category,
    subcategoria: slugify(area),
    subcategoriaKey: slugify(area),
    titulo: title,
    descricao: description,
    preco: null,
    localizacao: detectLocation(text, item.sourceName),
    area: area,
    areaKey: slugify(area),
    modalidadeTrabalho: 'Presencial',
    contato: emails[0] || 'Ver link oficial da UFG',
    remuneracao: '',
    visibility: 'public',
    tags,
    imagens: [],
    metadata: {
      ...metadata,
      subcategory: slugify(area),
      area,
      areaLabel: area,
      areaKey: slugify(area),
      workMode: 'presencial',
      workModeLabel: 'Presencial',
      contato: emails[0] || 'Ver link oficial da UFG',
      remuneracao: '',
      modalidadeTrabalho: 'Presencial',
    },
  };
}

function toPostgrestInsert(payload, userId) {
  const metadata = payload.metadata || {};
  const moduleDB = payload.modulo || payload.module;
  const categoryDB = payload.categoriaKey || payload.category || payload.categoria;
  return {
    author_id: userId,
    title: payload.titulo || payload.title,
    description: payload.descricao || payload.description,
    price: payload.preco == null ? null : payload.preco,
    location: payload.localizacao || '',
    module: moduleDB,
    category: categoryDB,
    visibility: payload.visibility || metadata.visibility || 'public',
    metadata: {
      ...metadata,
      tags: payload.tags || [],
      categoryKey: categoryDB,
      categoryLabel: payload.categoriaLabel || payload.categoria || categoryDB,
      subcategoryKey: payload.subcategoriaKey || '',
      subcategoryLabel: payload.subcategoriaLabel || payload.subcategoria || '',
    },
  };
}

module.exports = {
  buildDescription,
  mapToKinoPayload,
  toPostgrestInsert,
};
