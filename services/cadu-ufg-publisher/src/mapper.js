'use strict';

const { isValidCategoryForModule, normalizeCategoryForModule } = require('./classifier');
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

function isoDateFromDateTime(value) {
  const match = String(value || '').match(/(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function timeFromDateTime(value) {
  const raw = String(value || '');
  const match = raw.match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/)
    || raw.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  return match ? `${match[1]}:${match[2]}` : '';
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

function markdownUrlLink(url) {
  const cleanUrl = validRemoteImageUrl(url);
  return cleanUrl ? `[${cleanUrl}](${cleanUrl})` : '';
}

// Labels aligned to the canonical Edge/create-post taxonomy.
// These values are persisted metadata, so accents and singular/plural forms
// must remain byte-consistent with CATEGORY_DEFINITIONS.
const CATEGORY_LABELS = {
  eventos: {
    academicos: 'Acadêmicos',
    palestras: 'Palestras',
    congressos: 'Congressos',
    cursos: 'Cursos',
    culturais: 'Culturais',
    esportivos: 'Esportivos',
    workshops: 'Workshops',
    festas: 'Festas',
    sustentabilidade: 'Sustentabilidade',
  },
  oportunidades: {
    editais: 'Editais',
    concursos: 'Concursos',
    bolsas: 'Bolsas',
    estagios: 'Estágio',
    empregos: 'Emprego',
    monitoria: 'Monitoria',
    pesquisa: 'Pesquisa',
    'cursos-capacitacoes': 'Cursos e capacitações',
    voluntariado: 'Voluntariado',
    freelancer: 'Freelancer',
  },
};

const CATEGORY_ALIASES = {
  eventos: {
    academico: 'academicos',
    academica: 'academicos',
    academicas: 'academicos',
    palestra: 'palestras',
    congresso: 'congressos',
    curso: 'cursos',
    cultural: 'culturais',
    esportivo: 'esportivos',
    workshop: 'workshops',
    festa: 'festas',
  },
  oportunidades: {
    edital: 'editais',
    concurso: 'concursos',
    bolsa: 'bolsas',
    estagio: 'estagios',
    emprego: 'empregos',
    monitorias: 'monitoria',
    'curso-capacitacao': 'cursos-capacitacoes',
    'curso-capacitacoes': 'cursos-capacitacoes',
    'cursos-capacitacao': 'cursos-capacitacoes',
    'curso-e-capacitacao': 'cursos-capacitacoes',
    'cursos-e-capacitacoes': 'cursos-capacitacoes',
    voluntariados: 'voluntariado',
    freelancers: 'freelancer',
  },
};

function categoryLabel(moduleKey, category) {
  const labels = CATEGORY_LABELS[moduleKey];
  return (labels && labels[category]) || '';
}

function canonicalCategoryIdentity(moduleKey, categoryKey) {
  const module = slugify(moduleKey || '');
  const rawCategory = slugify(categoryKey || '');
  const labels = CATEGORY_LABELS[module] || {};
  const aliases = CATEGORY_ALIASES[module] || {};
  const categoryFromLabel = Object.keys(labels).find((key) => slugify(labels[key]) === rawCategory);
  const category = aliases[rawCategory] || categoryFromLabel || rawCategory;
  if (!isValidCategoryForModule(module, category)) {
    throw new Error(`invalid category for module: ${module || '(missing)'}/${category || '(missing)'}`);
  }
  const label = categoryLabel(module, category);
  return {
    module,
    category,
    label,
    metadata: {
      category,
      categoryKey: category,
      categoriaKey: category,
      categoryLabel: label,
      categoria: label,
      categoriaLabel: label,
    },
  };
}

function buildSourceLabel(item) {
  const name = normalizeWhitespace((item && item.sourceName) || 'UFG');
  if (!name || /^ufg$/i.test(name)) return 'Fonte oficial: UFG';
  if (/ufg/i.test(name) || /verbena/i.test(name)) return `Fonte oficial: ${name}`;
  if (/^[A-Z0-9]{2,8}$/.test(name)) return `Fonte oficial: ${name}/UFG`;
  return `Fonte oficial: ${name}`;
}

function inferActionLabel(item, classification, actionUrlCount) {
  const text = normalizeText(`${item.title || ''}\n${item.summary || ''}\n${item.text || ''}`);
  if (classification.hasPdf) return actionUrlCount > 1 ? 'Acessar editais' : 'Acessar edital';
  if (/\binscric|submiss|formulario|candidat/.test(text)) return 'Realizar inscricao';
  if (classification.module === 'eventos') return 'Acessar evento';
  return 'Acessar oportunidade';
}

function scoreActionLink(link, item, classification) {
  const url = String((link && link.url) || '').trim();
  if (!url) return -1;
  const label = normalizeText((link && link.label) || '');
  const haystack = normalizeText(`${label} ${url}`);
  let score = 0;
  if (!/\.pdf(?:$|[?#])/i.test(url)) score += 20;
  if (classification.hasPdf && /\b(edital|editais|chamada|fapeg|confap|sparkx|pibic|pivic|mobilidade)\b/.test(haystack)) score += 35;
  if (/\b(inscric|submiss|formulario|forms\.gle|eventos?|evento|even3|plateia|candidat)\w*/.test(haystack)) score += 30;
  if (classification.module === 'eventos' && /\b(evento|inscric|formulario|forms\.gle|even3|plateia)\w*/.test(haystack)) score += 20;
  if (classification.module === 'oportunidades' && /\b(edital|chamada|bolsa|vaga|selecao|processo|fapeg|confap)\w*/.test(haystack)) score += 20;
  if (/\b(clique aqui|saiba mais|acesse aqui)\b/.test(label)) score -= 8;
  if (item && item.sourceUrl && url === item.sourceUrl) score -= 5;
  return score;
}

function buildActionMetadata(item, classification, documentLinks) {
  const candidates = (documentLinks || [])
    .filter((link) => link && link.url)
    .map((link, index) => ({ ...link, _index: index, _score: scoreActionLink(link, item, classification) }))
    .sort((a, b) => (b._score - a._score) || (a._index - b._index));
  const preferredDocument = candidates.find((link) => link._score >= 20) || candidates[0] || null;
  const link = preferredDocument && preferredDocument.url ? preferredDocument.url : item.sourceUrl;
  const actionLabel = inferActionLabel(item, classification, (documentLinks || []).length);
  return {
    link,
    link_as_cta: true,
    actionLabel,
    actionKey: slugify(actionLabel),
  };
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
  const sourceLink = item.sourceUrl ? `${sourceLabel}: ${markdownUrlLink(item.sourceUrl)}` : sourceLabel;
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
      ...documentLinks.map((link) => `- ${link.label ? `**${link.label}:** ` : ''}${markdownUrlLink(link.url)}`),
    ].join('\n'));
  } else if (classification.hasPdf && pdfLinks.length > 1) {
    chunks.push([
      `**${ICON_DOCUMENT} Editais e documentos:**`,
      ...pdfLinks.slice(0, 4).map((url, index) => `- **${extractPdfLabel(url, index)}:** ${markdownUrlLink(url)}`),
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
  const documentLinks = normalizeDocumentLinks(item);
  const action = buildActionMetadata(item, classification, documentLinks);
  const moduleKey = classification.module === 'oportunidades' ? 'oportunidades' : 'eventos';
  const fallbackCategory = moduleKey === 'eventos' ? 'academicos' : 'editais';
  const category = normalizeCategoryForModule(
    moduleKey,
    classification.category || fallbackCategory,
  );
  const categoryText = categoryLabel(moduleKey, category);
  const tags = uniq([
    'UFG',
    item.sourceName,
    categoryText,
    classification.hasPdf ? 'Edital' : '',
    classification.hasDeadline ? 'Prazo' : '',
  ]).slice(0, 8);
  const tagKeys = tags.map((tag) => slugify(tag)).filter(Boolean);
  const emails = extractEmails(text);
  const contato = emails[0] || 'Ver link oficial da UFG';
  const area = classification.module === 'eventos' ? categoryText : detectArea(text);
  const areaKey = slugify(area);

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
    contato,
    link: action.link,
    link_as_cta: action.link_as_cta,
    actionLabel: action.actionLabel,
    actionKey: action.actionKey,
    gratuito: true,
    area,
    areaLabel: area,
    areaKey,
    tags,
    tagKeys,
    categoria: categoryText,
    categoriaLabel: categoryText,
    categoriaKey: category,
    category: category,
    categoryKey: category,
    categoryLabel: categoryText,
    visibility: 'public',
  };

  if (classification.module === 'eventos') {
    const date = (classification.temporal && classification.temporal.eventDate)
      || isoDateFromDateTime(item.dateBeginAt)
      || parseBrazilianDate(text);
    const time = timeFromDateTime(item.dateBeginAt) || parseTime(text);
    return {
      modulo: 'eventos',
      moduloLabel: 'Eventos',
      categoria: category,
      categoriaLabel: categoryText,
      categoriaKey: category,
      subcategoria: '',
      subcategoriaKey: '',
      titulo: title,
      descricao: description,
      preco: 0,
      localizacao: detectLocation(text, item.sourceName),
      visibility: 'public',
      tags,
      tagKeys,
      imagens: images,
      metadata: {
        ...metadata,
        subcategory: '',
        data_evento: date,
        hora_evento: time,
      },
    };
  }

  return {
    modulo: 'oportunidades',
    moduloLabel: 'Oportunidades',
    categoria: category,
    categoriaLabel: categoryText,
    categoriaKey: category,
    subcategoria: slugify(area),
    subcategoriaKey: slugify(area),
    titulo: title,
    descricao: description,
    preco: 0,
    localizacao: detectLocation(text, item.sourceName),
    area: area,
    areaKey,
    modalidadeTrabalho: 'Presencial',
    contato,
    remuneracao: '',
    visibility: 'public',
    tags,
    tagKeys,
    imagens: images,
    metadata: {
      ...metadata,
      subcategory: slugify(area),
      workMode: 'presencial',
      workModeLabel: 'Presencial',
      remuneracao: '',
      modalidadeTrabalho: 'Presencial',
    },
  };
}

function toPostgrestInsert(payload, userId) {
  const metadata = payload.metadata || {};
  const moduleDB = payload.modulo || payload.module;
  const categoryDB = payload.categoriaKey
    || payload.category
    || payload.categoria
    || metadata.category
    || metadata.categoryKey
    || metadata.categoriaKey;
  const categoryIdentity = canonicalCategoryIdentity(moduleDB, categoryDB);
  const images = Array.isArray(payload.imagens) ? payload.imagens : (Array.isArray(payload.images) ? payload.images : []);
  const imageUrl = metadata.cover_url || metadata.image_url || payload.cover_url || payload.image_url || images[0] || null;
  const tags = Array.isArray(payload.tags) ? payload.tags : (Array.isArray(metadata.tags) ? metadata.tags : []);
  const tagKeys = Array.isArray(payload.tagKeys) ? payload.tagKeys : (Array.isArray(metadata.tagKeys) ? metadata.tagKeys : tags.map((tag) => slugify(tag)).filter(Boolean));
  const subcategoryKey = payload.subcategoriaKey || metadata.subcategoryKey || metadata.subcategoriaKey || metadata.subcategory || '';
  const subcategoryLabel = payload.subcategoriaLabel || metadata.subcategoryLabel || metadata.subcategoria || payload.subcategoria || '';
  return {
    author_id: userId,
    title: payload.titulo || payload.title,
    description: payload.descricao || payload.description,
    price: payload.preco == null ? null : payload.preco,
    location: payload.localizacao || '',
    module: categoryIdentity.module,
    category: categoryIdentity.category,
    image_url: imageUrl || null,
    visibility: payload.visibility || metadata.visibility || 'public',
    metadata: {
      ...metadata,
      image_url: metadata.image_url || imageUrl || '',
      cover_url: metadata.cover_url || imageUrl || '',
      tags,
      tagKeys,
      contato: metadata.contato || payload.contato || 'Ver link oficial da UFG',
      link: metadata.link || payload.link || '',
      link_as_cta: metadata.link_as_cta !== undefined ? !!metadata.link_as_cta : !!payload.link_as_cta,
      actionLabel: metadata.actionLabel || payload.actionLabel || '',
      actionKey: metadata.actionKey || payload.actionKey || '',
      gratuito: metadata.gratuito !== undefined ? !!metadata.gratuito : !!payload.gratuito,
      area: metadata.area || payload.area || '',
      areaLabel: metadata.areaLabel || payload.areaLabel || metadata.area || payload.area || '',
      areaKey: metadata.areaKey || payload.areaKey || '',
      modalidadeTrabalho: metadata.modalidadeTrabalho || payload.modalidadeTrabalho || '',
      remuneracao: metadata.remuneracao || payload.remuneracao || '',
      ...categoryIdentity.metadata,
      subcategoryKey,
      subcategoryLabel,
    },
  };
}

module.exports = {
  buildDescription,
  canonicalCategoryIdentity,
  mapToKinoPayload,
  toPostgrestInsert,
};
