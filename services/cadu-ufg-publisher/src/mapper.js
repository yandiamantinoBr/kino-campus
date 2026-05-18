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
  stripHtml,
  uniq,
} = require('./utils');

const ICON_DEADLINE = '\u23F0';
const ICON_DOCUMENT = '\u{1F4C4}';
const ICON_LINK = '\u{1F517}';
const ICON_SCHEDULE = '\u{1F4CB}';

function detectArea(text) {
  const normalized = normalizeText(text);
  if (/direito|juridic/.test(normalized)) return 'Direito';
  if (/saude|farmacia|medicina|enfermagem|biologia|nutricao/.test(normalized)) return 'Saude';
  if (/computacao|software|tecnologia|sistema|informatica/.test(normalized)) return 'Tecnologia';
  if (/comunicacao|jornalismo|publicidade/.test(normalized)) return 'Comunicacao';
  if (/engenharia|arquitetura/.test(normalized)) return 'Engenharia';
  if (/letras|linguas|idioma/.test(normalized)) return 'Linguas';
  if (/arte|musica|danca|teatro/.test(normalized)) return 'Artes';
  if (/pesquisa|pibic|pivic|fapeg|iniciacao cientifica|mobilidade/.test(normalized)) return 'Pesquisa';
  return 'Academica';
}

function detectLocation(text, sourceName) {
  const source = normalizeWhitespace(sourceName || 'UFG');
  const match = String(text || '').match(/\b(?:local|onde|campus|cidade)\s*:\s*([^\n.;]{4,90})/i);
  return normalizeWhitespace(match ? match[1] : source || 'UFG');
}

function formatDatePt(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function validRemoteImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function normalizeMarkdownText(value) {
  return String(stripHtml(value || '') || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join('\n');
}

function markdownLink(label, url) {
  const cleanLabel = normalizeWhitespace(label || '');
  if (!cleanLabel || !url) return cleanLabel || '';
  return `[${cleanLabel.replace(/[[\]]/g, '')}](${url})`;
}

function buildSourceLabel(item) {
  const name = normalizeWhitespace((item && item.sourceName) || 'UFG');
  if (!name || /^ufg$/i.test(name)) return 'Fonte oficial: UFG';
  if (/ufg/i.test(name) || /verbena/i.test(name)) return `Fonte oficial: ${name}`;
  if (/^[A-Z0-9]{2,8}$/.test(name)) return `Fonte oficial: ${name}/UFG`;
  return `Fonte oficial: ${name}`;
}

function isGenericInstitutionalText(value) {
  const text = normalizeText(value);
  return /universidade gratuita|mais de\s+\d+\s+mil alunos|ensino pesquisa e extensao|ensino extensao e pesquisa|uma das (maiores|melhores) universidades|instituicao federal de ensino/.test(text);
}

function pickActionableSentences(text, limit = 4) {
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const picked = [];
  const seen = new Set();
  const actionPattern = /\b(edital|chamada|inscric|submiss|prazo|cronograma|resultado|recurso|homolog|bolsa|vagas|pibic|pivic|fapeg|mobilidade|pesquisa|selecao)\w*/i;
  const datePattern = /\b[0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?\b|\b[0-3]?\d\s+de\s+[A-Za-z\xc0-\xff]+/i;

  sentences.forEach((sentence) => {
    if (picked.length >= limit) return;
    if (!actionPattern.test(sentence) && !datePattern.test(sentence)) return;
    const key = normalizeText(sentence);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(clamp(sentence, 260));
  });

  return picked.join('\n');
}

function selectLeadSummary(summaryText, item, fullText) {
  const modelSummary = normalizeMarkdownText(summaryText || '');
  if (modelSummary && !isGenericInstitutionalText(modelSummary)) return modelSummary;

  const actionable = pickActionableSentences(fullText);
  if (actionable) return actionable;

  if (modelSummary) return modelSummary;
  return normalizeMarkdownText(item.summary || item.text || '');
}

function clampMarkdown(value, maxLength) {
  const text = String(value || '').normalize('NFKC').trim();
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const boundary = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('\n'), sliced.lastIndexOf(' '));
  return `${(boundary > 80 ? sliced.slice(0, boundary) : sliced).trim()}...`;
}

function buildImageList(item) {
  return uniq([
    item.imageUrl,
    item.raw && item.raw.image,
    item.raw && item.raw.image_url,
    item.raw && item.raw.cover,
  ].map(validRemoteImageUrl)).slice(0, 1);
}

function extractScheduleEntries(text, limit = 5) {
  const candidates = [];
  const seen = new Set();
  const chunks = String(text || '')
    .normalize('NFKC')
    .split(/(?<=[.!?])\s+|\n+|;/)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const datePattern = /\b(?:[0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?|[0-3]?\d\s+(?:a|ate|-)\s*[0-3]?\d(?:[\/.-][01]?\d|\s+de\s+[a-zçãéíóú]+)|[0-3]?\d\s+de\s+[a-zçãéíóú]+(?:\s+de\s+(?:20)?\d{2})?)\b/ig;
  const contextPattern = /\b(inscric|submiss|prazo|cronograma|resultado|recurso|matricula|homolog|entrevista|prova|periodo|chamada|divulga)\w*/i;

  chunks.forEach((chunk) => {
    if (!datePattern.test(chunk)) {
      datePattern.lastIndex = 0;
      return;
    }
    datePattern.lastIndex = 0;
    if (!contextPattern.test(chunk) && candidates.length >= 2) return;
    const key = chunk.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(clamp(chunk, 220));
  });

  return candidates.slice(0, limit);
}

function countDateMentions(text) {
  return (String(text || '').match(/\b[0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?\b|\b[0-3]?\d\s+de\s+[A-Za-z\xc0-\xff]+/g) || []).length;
}

function removeScheduleLikeLines(text) {
  const lines = String(text || '').split(/\n+/).map(normalizeWhitespace).filter(Boolean);
  if (lines.length < 2) return normalizeWhitespace(text);
  const datePattern = /\b[0-3]?\d[\/.-][01]?\d(?:[\/.-](?:20)?\d{2})?\b|\b[0-3]?\d\s+de\s+[A-Za-z\xc0-\xff]+/i;
  const contextPattern = /\b(inscric|submiss|prazo|cronograma|resultado|recurso|matricula|homolog|entrevista|prova|periodo|chamada)\w*/i;
  const kept = lines.filter((line) => !(datePattern.test(line) && contextPattern.test(line)));
  return kept.length ? kept.join('\n') : '';
}

function inferScheduleLabel(entry) {
  const text = normalizeText(entry);
  if (/resultado.*final/.test(text)) return 'Resultado final';
  if (/resultado.*preliminar/.test(text)) return 'Resultado preliminar';
  if (/inscric|submiss|candidat/.test(text)) return 'Inscricoes';
  if (/recurso/.test(text)) return 'Recursos';
  if (/homolog/.test(text)) return 'Homologacao';
  if (/entrevista/.test(text)) return 'Entrevistas';
  if (/prova/.test(text)) return 'Provas';
  if (/matricula/.test(text)) return 'Matricula';
  return 'Data';
}

function formatScheduleEntries(entries) {
  return entries.map((entry) => `- **${inferScheduleLabel(entry)}:** ${entry}`);
}

function extractPdfLabel(url, index) {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const decoded = decodeURIComponent(last).replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    return clamp(normalizeWhitespace(decoded) || `documento ${index + 1}`, 80);
  } catch (_) {
    return `documento ${index + 1}`;
  }
}

function normalizeDocumentLinks(item) {
  const byUrl = new Map();
  const extracted = Array.isArray(item.extractedLinks) ? item.extractedLinks : [];

  extracted.forEach((link) => {
    const url = typeof link === 'string' ? link : link && link.url;
    if (!url || byUrl.has(url)) return;
    const label = typeof link === 'object' ? link.label : '';
    if (/\.pdf(?:$|[?#])/i.test(url) || /edital|chamada|fapeg|pibic|pivic|mobilidade|documento/i.test(label || url)) {
      byUrl.set(url, { url, label: normalizeWhitespace(label || '') });
    }
  });

  (Array.isArray(item.pdfLinks) ? item.pdfLinks : []).forEach((url, index) => {
    if (!url || byUrl.has(url)) return;
    byUrl.set(url, { url, label: extractPdfLabel(url, index) });
  });

  return Array.from(byUrl.values()).slice(0, 6).map((link, index) => ({
    url: link.url,
    label: clamp(link.label || extractPdfLabel(link.url, index), 90),
  }));
}

function buildDescription(item, classification, summaryText = '') {
  const fullText = normalizeMarkdownText(`${item.summary || ''}\n${item.text || ''}`);
  const schedule = extractScheduleEntries(fullText);
  const originalRaw = selectLeadSummary(summaryText, item, fullText);
  const original = schedule.length && countDateMentions(originalRaw) >= 2 ? removeScheduleLikeLines(originalRaw) : originalRaw;
  const chunks = [];
  const sourceLabel = buildSourceLabel(item);
  const sourceLink = item.sourceUrl ? `[${sourceLabel}](${item.sourceUrl})` : sourceLabel;
  const deadlineDate = classification.temporal && classification.temporal.deadlineDate
    ? formatDatePt(classification.temporal.deadlineDate)
    : '';
  const eventDate = classification.temporal && classification.temporal.eventDate
    ? formatDatePt(classification.temporal.eventDate)
    : '';
  const audience = pickSentence(fullText || original, /(quem pode|publico|estudantes|discente|candidato|servidor|comunidade|pesquisador|docente|proponente|coordenador)/i);
  const deadline = pickSentence(fullText || original, /(prazo|inscricoes?|ate o dia|periodo|cronograma|submiss|homolog|resultado|recurso)/i);
  const pdfLinks = Array.isArray(item.pdfLinks) ? item.pdfLinks.filter(Boolean) : [];
  const documentLinks = normalizeDocumentLinks(item);

  if (original) chunks.push(clamp(original, 650));

  if (classification.hasDeadline) {
    chunks.push(deadlineDate
      ? `**${ICON_DEADLINE} Prazo:** ${deadlineDate}. Confira regras, etapas e eventuais retificacoes no link oficial.`
      : `**${ICON_DEADLINE} Prazo:** confira datas, regras e cronograma no link oficial.`);
  } else if (eventDate) {
    chunks.push(`**${ICON_SCHEDULE} Data:** ${eventDate}. Confira horario/local no link oficial.`);
  }

  if (classification.hasPdf) {
    chunks.push([
      `**${ICON_DOCUMENT} Edital**`,
      `- **Quem pode participar:** ${audience || 'confira os requisitos no edital oficial.'}`,
      `- **Prazo/cronograma:** ${deadline || deadlineDate || 'confira o cronograma no edital oficial.'}`,
      `- **Inscricao:** use a ${sourceLink}.`,
      '- **Atencao:** o edital oficial prevalece sobre este resumo.',
    ].join('\n'));
  } else {
    chunks.push(`**${ICON_LINK} ${sourceLink}**`);
  }

  if (classification.hasPdf && documentLinks.length) {
    chunks.push([
      `**${ICON_DOCUMENT} Editais e documentos:**`,
      ...documentLinks.map((link) => `- ${markdownLink(link.label, link.url)}`),
    ].join('\n'));
  } else if (classification.hasPdf && pdfLinks.length > 1) {
    chunks.push([
      `**${ICON_DOCUMENT} Editais e documentos:**`,
      ...pdfLinks.slice(0, 4).map((url, index) => `- ${markdownLink(extractPdfLabel(url, index), url)}`),
    ].join('\n'));
  }

  if (schedule.length) {
    chunks.push([
      `**${ICON_SCHEDULE} Datas importantes**`,
      ...formatScheduleEntries(schedule),
    ].join('\n'));
  }

  if (classification.hasPdf) {
    chunks.push(`**${ICON_LINK} ${sourceLink}**`);
  }

  return clampMarkdown(chunks.filter(Boolean).join('\n\n'), 2000);
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
  const images = buildImageList(item);
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
    edital_pdf_urls: Array.isArray(item.pdfLinks) ? item.pdfLinks.slice(0, 10) : [],
    extracted_links: Array.isArray(item.extractedLinks) ? item.extractedLinks.slice(0, 12) : [],
    official_document_urls: normalizeDocumentLinks(item).map((link) => link.url),
    image_url: images[0] || '',
    cover_url: images[0] || '',
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
      imagens: images,
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
    imagens: images,
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
  const images = Array.isArray(payload.imagens) ? payload.imagens : (Array.isArray(payload.images) ? payload.images : []);
  const imageUrl = metadata.cover_url || metadata.image_url || payload.cover_url || payload.image_url || images[0] || null;
  return {
    author_id: userId,
    title: payload.titulo || payload.title,
    description: payload.descricao || payload.description,
    price: payload.preco == null ? null : payload.preco,
    location: payload.localizacao || '',
    module: moduleDB,
    category: categoryDB,
    image_url: imageUrl || null,
    visibility: payload.visibility || metadata.visibility || 'public',
    metadata: {
      ...metadata,
      image_url: metadata.image_url || imageUrl || '',
      cover_url: metadata.cover_url || imageUrl || '',
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
