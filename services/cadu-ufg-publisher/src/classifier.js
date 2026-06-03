'use strict';

const { normalizeText, uniq } = require('./utils');

const INCLUDE_TERMS = [
  'edital', 'chamada', 'processo seletivo', 'inscricao', 'inscricoes', 'selecao',
  'bolsa', 'bolsas', 'monitoria', 'estagio', 'vagas', 'curso', 'oficina',
  'palestra', 'seminario', 'congresso', 'evento', 'extensao', 'voluntariado',
  'pibic', 'pivic', 'probec', 'prpi', 'pesquisa', 'iniciacao cientifica',
  'mobilidade', 'calendario academico', 'prazo', 'programacao', 'capacitacao',
  'espaco das profissoes', 'profissoes', 'mestrado', 'doutorado',
  'pos-graduacao', 'pos graduacao', 'aluno especial', 'residencia',
  'professor substituto',
];

const EXCLUDE_TERMS = [
  'nota de pesar', 'luto oficial', 'visita institucional', 'reuniao institucional',
  'homenagem', 'posse', 'balanco de gestao', 'relatorio de gestao',
  'marca presenca', 'marcou presenca', 'participa de encontro', 'recebe alunos',
  'se engaja', 'reune autoridades', 'e finalista', 'fica em 3', 'homenageia',
  'conquista', 'estao na china', 'recebe expoente', 'reconhece os destaques',
  'prospecta acordos', 'trajetoria academica', 'trajetoria profissional',
  'perfil do servidor', 'perfil da servidora', 'servidor em destaque',
  'historia de vida', 'conheca o servidor',
];

const MONTHS = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

function has(text, term) {
  return text.includes(normalizeText(term));
}

function hasStrongActionSignal(text) {
  return /\b(edital|chamada|processo seletivo|inscric\w*|submiss\w*|formulario|candidat\w*|prazo|bolsa|vagas?|monitoria|estagio|professor substituto|concurso publico|curso|oficina|palestra|seminario|congresso|matricula|resultado|recurso)\b/.test(text);
}

function isInstitutionalRelease(text) {
  return /\b(marca presenca|marcou presenca|participa de encontro|recebe alunos|se engaja|reune autoridades|e finalista|fica em 3|homenageia|conquista|estao na china|recebe expoente|reconhece os destaques|prospecta acordos|visita institucional|reuniao institucional|trajetoria academica|trajetoria profissional|perfil do servidor|perfil da servidora|servidor em destaque|historia de vida|conheca o servidor)\b/.test(text);
}

function toYear(value, fallbackYear) {
  if (!value) return fallbackYear;
  return String(value).length === 2 ? `20${value}` : String(value);
}

function validIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

function todayIso(now) {
  const date = now ? new Date(now) : new Date(process.env.CADU_NOW_ISO || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function referenceYear(item, today) {
  const updated = String(
    item.updatedAt
    || item.dateBeginAt
    || item.dateEndAt
    || item.raw?.updated_at
    || item.raw?.date_begin_at
    || item.raw?.begin_at
    || item.raw?.date_end_at
    || item.raw?.end_at
    || item.raw?.created_at
    || ''
  );
  const match = updated.match(/\b(20\d{2})\b/);
  if (match) return match[1];
  return today.slice(0, 4);
}

function contextFor(text, index, length) {
  return text.slice(Math.max(0, index - 90), Math.min(text.length, index + length + 90));
}

function hasDeadlineContext(context) {
  return /\b(inscric\w*|submiss\w*|prazo|ate|encerra\w*|termina\w*|periodo|candidat\w*|recurso\w*|matricula\w*|solicit\w*|envio\w*)\b/i.test(context);
}

function hasEventContext(context) {
  return /\b(evento|acontece|realiza|sera realizado|seminario|palestra|oficina|curso|congresso|mostra|festival|webinario)\b/i.test(context);
}

function addCandidate(candidates, text, match, iso, kind) {
  if (!iso) return;
  const windowText = contextFor(text, match.index || 0, match[0].length);
  candidates.push({
    iso,
    kind,
    isDeadline: hasDeadlineContext(windowText),
    isEvent: hasEventContext(windowText),
  });
}

function extractDateCandidates(rawText, fallbackYear) {
  const text = normalizeText(rawText);
  const candidates = [];
  let match;

  const numericRange = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\s*(?:a|ate|-)\s*([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numericRange.exec(text))) {
    const year = toYear(match[6] || match[3], fallbackYear);
    addCandidate(candidates, text, match, validIsoDate(year, match[5], match[4]), 'range-end');
  }

  const compactRange = /\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = compactRange.exec(text))) {
    const year = toYear(match[4], fallbackYear);
    addCandidate(candidates, text, match, validIsoDate(year, match[3], match[2]), 'range-end');
  }

  const namedRange = /\b([0-3]?\d)\s*(?:a|ate|-)\s*([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = namedRange.exec(text))) {
    const year = toYear(match[4], fallbackYear);
    addCandidate(candidates, text, match, validIsoDate(year, MONTHS[match[3]], match[2]), 'range-end');
  }

  const numeric = /\b([0-3]?\d)[\/.-]([01]?\d)(?:[\/.-]((?:20)?\d{2}))?\b/g;
  while ((match = numeric.exec(text))) {
    const year = toYear(match[3], fallbackYear);
    addCandidate(candidates, text, match, validIsoDate(year, match[2], match[1]), 'date');
  }

  const named = /\b([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:20)?\d{2}))?\b/g;
  while ((match = named.exec(text))) {
    const year = toYear(match[3], fallbackYear);
    addCandidate(candidates, text, match, validIsoDate(year, MONTHS[match[2]], match[1]), 'date');
  }

  return candidates;
}

function latestIso(values) {
  return values.filter(Boolean).sort().pop() || '';
}

function uniqValues(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function isoDateFromValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return validIsoDate(match[1], match[2], match[3]);
}

function hasActionableDateEndContext(rawText) {
  const text = normalizeText(rawText);
  return /\b(edital|chamada|processo seletivo|inscric\w*|submiss\w*|prazo|encerra\w*|termina\w*|candidat\w*|bolsa|vagas|mobilidade|pibic|pivic|pesquisa|formulario|profissoes)\b/.test(text);
}

function analyzeTemporalRelevance(item, options = {}) {
  const rawText = `${item.title || ''} ${item.summary || ''} ${item.text || ''}`;
  const today = todayIso(options.now);
  const fallbackYear = referenceYear(item, today);
  const candidates = extractDateCandidates(rawText, fallbackYear);
  const rawDateBegin = isoDateFromValue(item.dateBeginAt || item.raw?.date_begin_at || item.raw?.begin_at);
  const rawDateEnd = isoDateFromValue(item.dateEndAt || item.raw?.date_end_at || item.raw?.end_at);
  const isEventItem = String(item.type || '').toLowerCase() === 'event';
  const deadlineValues = candidates.filter((candidate) => candidate.isDeadline).map((candidate) => candidate.iso);
  const eventValues = candidates.filter((candidate) => candidate.isEvent).map((candidate) => candidate.iso);

  if (rawDateEnd && hasActionableDateEndContext(rawText)) deadlineValues.push(rawDateEnd);
  if (rawDateBegin && isEventItem) eventValues.push(rawDateBegin);
  if (rawDateEnd && isEventItem) eventValues.push(rawDateEnd);

  const deadlineDate = latestIso(deadlineValues);
  const eventDate = latestIso(eventValues);
  const dates = uniqValues(candidates.map((candidate) => candidate.iso).concat([rawDateBegin, rawDateEnd]));

  if (deadlineDate && deadlineDate < today) {
    return {
      expired: true,
      reason: 'deadline_past',
      today,
      deadlineDate,
      eventDate,
      dates,
    };
  }

  if (eventDate && eventDate < today) {
    return {
      expired: true,
      reason: 'event_past',
      today,
      deadlineDate,
      eventDate,
      dates,
    };
  }

  return {
    expired: false,
    reason: '',
    today,
    deadlineDate,
    eventDate,
    dates,
  };
}

function detectOpportunityCategory(text) {
  if (has(text, 'estagio')) return 'estagios';
  if (
    has(text, 'pesquisa') ||
    has(text, 'iniciacao cientifica') ||
    has(text, 'pibic') ||
    has(text, 'pivic') ||
    has(text, 'prpi') ||
    has(text, 'fapeg') ||
    has(text, 'mobilidade internacional') ||
    has(text, 'mestrado') ||
    has(text, 'doutorado') ||
    has(text, 'pos-graduacao') ||
    has(text, 'pos graduacao') ||
    has(text, 'aluno especial') ||
    has(text, 'residencia')
  ) return 'pesquisa';
  if (has(text, 'monitoria')) return 'monitoria';
  if (has(text, 'voluntariado') || has(text, 'voluntario')) return 'voluntariado';
  if (has(text, 'emprego') || has(text, 'trabalho') || has(text, 'contratacao')) return 'empregos';
  if (has(text, 'freelancer')) return 'freelancer';
  return 'monitoria';
}

function detectEventCategory(text) {
  if (has(text, 'sustentabilidade') || has(text, 'meio ambiente')) return 'sustentabilidade';
  if (has(text, 'oficina') || has(text, 'workshop') || has(text, 'curso')) return 'workshops';
  if (has(text, 'cultura') || has(text, 'cinema') || has(text, 'musica') || has(text, 'arte')) return 'culturais';
  if (has(text, 'esporte') || has(text, 'jogos') || has(text, 'danca')) return 'esportivos';
  if (has(text, 'festa')) return 'festas';
  return 'academicos';
}

function classifyItem(item, source = {}, options = {}) {
  const text = normalizeText(`${item.title} ${item.summary} ${item.text}`);
  const includeHits = INCLUDE_TERMS.filter((term) => has(text, term));
  const excludeHits = EXCLUDE_TERMS.filter((term) => has(text, term));
  const hasPdf = Array.isArray(item.pdfLinks) && item.pdfLinks.length > 0;
  const isEventItem = String(item.type || '').toLowerCase() === 'event';
  const sourceBoost = Math.max(0, (5 - Number(source.tier || 3)) * 0.04);
  const temporal = analyzeTemporalRelevance(item, options);
  const hasDeadline = /\b(prazo|ate o dia|inscricoes? ate|encerra|termina)\b/i.test(text) || Boolean(temporal.deadlineDate);
  const institutionalRelease = isInstitutionalRelease(text) && !hasStrongActionSignal(text);

  let score = 0.18 + sourceBoost;
  score += Math.min(includeHits.length * 0.09, 0.45);
  if (hasDeadline) score += 0.1;
  if (hasPdf) score += 0.08;
  if (/ufg|prograd|proex|prpi|secom|verbena/.test(text)) score += 0.04;
  score -= Math.min(excludeHits.length * 0.2, 0.5);
  if (temporal.expired) score = Math.min(score, 0.49);
  if (institutionalRelease) score = Math.min(score, 0.39);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const opportunitySignals = ['edital', 'chamada', 'processo seletivo', 'bolsa', 'monitoria', 'estagio', 'vagas', 'selecao', 'pibic', 'pivic', 'probec', 'pesquisa', 'fapeg', 'mobilidade', 'mestrado', 'doutorado', 'residencia', 'professor substituto'];
  const eventSignals = ['evento', 'curso', 'oficina', 'palestra', 'seminario', 'congresso', 'mostra', 'festival', 'programacao', 'profissoes', 'espaco das profissoes'];
  const opportunityScore = opportunitySignals.filter((term) => has(text, term)).length;
  const eventScore = eventSignals.filter((term) => has(text, term)).length;

  const module = isEventItem ? 'eventos' : (opportunityScore > eventScore ? 'oportunidades' : 'eventos');
  const category = module === 'oportunidades' ? detectOpportunityCategory(text) : detectEventCategory(text);
  const decision = score >= 0.78 ? 'publish' : (score >= 0.55 ? 'review' : 'discard');

  return {
    decision,
    confidence: score,
    module,
    category,
    reasons: uniq(includeHits.concat(
      excludeHits.map((term) => `exclude:${term}`),
      institutionalRelease ? ['exclude:institutional_release'] : [],
      temporal.expired ? [`expired:${temporal.reason}`] : [],
    )),
    hasDeadline: hasDeadline || Boolean(temporal.deadlineDate),
    hasPdf,
    temporal,
  };
}

module.exports = {
  analyzeTemporalRelevance,
  classifyItem,
  detectEventCategory,
  detectOpportunityCategory,
};
