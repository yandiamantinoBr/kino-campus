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
  // Alinhado ao curador v4.5+ / archive VPS 2026-07-20
  'concurso professor efetivo', 'webnario', 'webinar', 'live', 'mutirao',
  'abertura de turma', 'transferencia', 'segunda chamada', 'recurso',
  'resultado', 'classificacao', 'convocacao', 'nomeacao', 'treinamento',
  'workshop', 'minicurso', 'simposio', 'jornada', 'semana academica',
  'festival', 'mostra',
];

const EXCLUDE_TERMS = [
  'nota de pesar', 'luto oficial', 'visita institucional', 'reuniao institucional',
  'homenagem', 'posse', 'balanco de gestao', 'relatorio de gestao',
  'marca presenca', 'marcou presenca', 'participa de encontro', 'recebe alunos',
  'se engaja', 'reune autoridades', 'e finalista', 'fica em 3', 'homenageia',
  'conquista', 'estao na china', 'recebe expoente', 'expoente nacional', 'reconhece os destaques',
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

function hasConcretePublishActionSignal(text) {
  return /\b(edital|chamada|processo seletivo|inscric\w*|submiss\w*|formulario|candidat\w*|prazo|bolsa|vagas?|monitoria|estagio|professor substituto|concurso publico|matricula|recurso)\b/.test(text);
}

function isInstitutionalRelease(text) {
  return /\b(marca presenca|marcou presenca|participa de encontro|recebe alunos|se engaja|reune autoridades|e finalista|fica em 3|homenageia|conquista|estao na china|recebe expoente|expoente nacional|reconhece os destaques|prospecta acordos|visita institucional|reuniao institucional|trajetoria academica|trajetoria profissional|perfil do servidor|perfil da servidora|servidor em destaque|historia de vida|conheca o servidor)\b/.test(text);
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
  const minStart = Math.max(0, index - 120);
  const maxEnd = Math.min(text.length, index + length + 120);
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const previousBreak = Math.max(
    before.lastIndexOf('.'),
    before.lastIndexOf(';'),
    before.lastIndexOf('!'),
    before.lastIndexOf('?'),
    before.lastIndexOf('|'),
  );
  const nextBreakValues = ['.', ';', '!', '?', '|']
    .map((token) => after.indexOf(token))
    .filter((value) => value >= 0);
  const nextBreak = nextBreakValues.length ? Math.min(...nextBreakValues) : -1;
  const start = Math.max(minStart, previousBreak >= 0 ? previousBreak + 1 : minStart);
  const end = Math.min(maxEnd, nextBreak >= 0 ? index + length + nextBreak : maxEnd);
  return text.slice(start, end);
}

function hasDeadlineContext(context) {
  return deadlinePriority(context) > 0;
}

function hasEventContext(context) {
  return /\b(evento|acontece|realiza|sera realizado|seminario|palestra|oficina|curso|congresso|mostra|festival|webinario)\b/i.test(context);
}

function deadlinePriority(context) {
  if (/\b(inscric\w*|submiss\w*|candidat\w*|prazo(?:\s+final)?|encerra\w*|termina\w*|envio\w*|propost\w*|formulario|solicit\w*)\b/i.test(context)) {
    return 3;
  }
  if (/\b(recurso\w*|matricula\w*|homolog\w*|resultado\w*|entrevista\w*|prova\w*|cronograma|periodo)\b/i.test(context)) {
    return 2;
  }
  if (/\bate\b/i.test(context)) {
    return 1;
  }
  return 0;
}

function addCandidate(candidates, text, match, iso, kind) {
  if (!iso) return;
  const windowText = contextFor(text, match.index || 0, match[0].length);
  const priority = deadlinePriority(windowText);
  candidates.push({
    iso,
    kind,
    isDeadline: priority > 0,
    deadlinePriority: priority,
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

function bestDeadlineIso(candidates) {
  const eligible = candidates.filter((candidate) => candidate.deadlinePriority > 0);
  if (!eligible.length) return '';
  const maxPriority = Math.max(...eligible.map((candidate) => candidate.deadlinePriority));
  return latestIso(eligible
    .filter((candidate) => candidate.deadlinePriority === maxPriority)
    .map((candidate) => candidate.iso));
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
  const deadlineCandidates = candidates.filter((candidate) => candidate.isDeadline);
  const eventValues = candidates.filter((candidate) => candidate.isEvent).map((candidate) => candidate.iso);

  if (rawDateEnd && hasActionableDateEndContext(rawText)) {
    deadlineCandidates.push({
      iso: rawDateEnd,
      kind: 'source-end',
      isDeadline: true,
      deadlinePriority: 3,
      isEvent: false,
    });
  }
  if (rawDateBegin && isEventItem) eventValues.push(rawDateBegin);
  if (rawDateEnd && isEventItem) eventValues.push(rawDateEnd);

  const deadlineDate = bestDeadlineIso(deadlineCandidates);
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

/**
 * Create-post schema keys (assets/js/features/create-post/kc-create-post.schema.js).
 * Cadu must only emit these keys so feed chips and filters stay consistent.
 */
const EVENT_CATEGORIES = Object.freeze([
  'academicos',
  'palestras',
  'congressos',
  'cursos',
  'culturais',
  'esportivos',
  'workshops',
  'festas',
  'sustentabilidade',
]);

const OPPORTUNITY_CATEGORIES = Object.freeze([
  'editais',
  'concursos',
  'bolsas',
  'estagios',
  'empregos',
  'monitoria',
  'pesquisa',
  'cursos-capacitacoes',
  'voluntariado',
  'freelancer',
]);

const EVENT_CATEGORY_SET = new Set(EVENT_CATEGORIES);
const OPPORTUNITY_CATEGORY_SET = new Set(OPPORTUNITY_CATEGORIES);

function isValidCategoryForModule(moduleKey, categoryKey) {
  const module = String(moduleKey || '').trim();
  const category = String(categoryKey || '').trim();
  if (!module || !category) return false;
  if (module === 'eventos') return EVENT_CATEGORY_SET.has(category);
  if (module === 'oportunidades') return OPPORTUNITY_CATEGORY_SET.has(category);
  return false;
}

function normalizeCategoryForModule(moduleKey, categoryKey) {
  const module = String(moduleKey || '').trim();
  const category = String(categoryKey || '').trim();
  if (isValidCategoryForModule(module, category)) return category;
  if (module === 'eventos') return 'academicos';
  if (module === 'oportunidades') return 'editais';
  return category || '';
}

function detectOpportunityCategory(text) {
  // Specific opportunity types first — avoid dumping everything into monitoria/pesquisa.
  if (has(text, 'monitoria')) return 'monitoria';
  if (has(text, 'estagio') || has(text, 'estagios')) return 'estagios';
  if (has(text, 'freelancer') || has(text, 'free lancer')) return 'freelancer';
  if (has(text, 'voluntariado') || has(text, 'voluntario')) return 'voluntariado';

  if (
    has(text, 'concurso publico') ||
    has(text, 'concurso') ||
    has(text, 'professor substituto') ||
    has(text, 'professor efetivo') ||
    has(text, 'premio') ||
    has(text, 'premiacao') ||
    has(text, 'nomeacao') ||
    has(text, 'convocacao')
  ) return 'concursos';

  const researchSignal = (
    has(text, 'iniciacao cientifica') ||
    has(text, 'pibic') ||
    has(text, 'pivic') ||
    has(text, 'probec') ||
    has(text, 'fapeg') ||
    has(text, 'mobilidade internacional') ||
    has(text, 'mestrado') ||
    has(text, 'doutorado') ||
    has(text, 'pos-graduacao') ||
    has(text, 'pos graduacao') ||
    has(text, 'aluno especial') ||
    has(text, 'residencia multiprofissional') ||
    has(text, 'residencia medica') ||
    has(text, 'residencia') ||
    has(text, 'prpi') ||
    has(text, 'pesquisa')
  );

  // Research-linked bolsas (PIBIC etc.) stay in pesquisa; pure aid/scholarship → bolsas
  if (
    has(text, 'bolsa') ||
    has(text, 'bolsas') ||
    has(text, 'auxilio financeiro') ||
    has(text, 'auxilio estudantil')
  ) {
    if (researchSignal) return 'pesquisa';
    return 'bolsas';
  }

  if (researchSignal) return 'pesquisa';

  if (
    has(text, 'capacitacao') ||
    has(text, 'curso de verao') ||
    has(text, 'curso de extensao') ||
    has(text, 'treinamento') ||
    has(text, 'formacao continuada') ||
    (has(text, 'curso') && (
      has(text, 'inscric') ||
      has(text, 'vagas') ||
      has(text, 'edital') ||
      has(text, 'selecao') ||
      has(text, 'matricula')
    )) ||
    (has(text, 'oficina') && (has(text, 'inscric') || has(text, 'vagas') || has(text, 'edital')))
  ) return 'cursos-capacitacoes';

  if (
    has(text, 'emprego') ||
    has(text, 'vaga de emprego') ||
    has(text, 'contratacao') ||
    has(text, 'clt') ||
    has(text, 'regime celetista') ||
    (has(text, 'trabalho') && (has(text, 'vaga') || has(text, 'vagas') || has(text, 'selecao')))
  ) return 'empregos';

  if (
    has(text, 'edital') ||
    has(text, 'editais') ||
    has(text, 'chamada') ||
    has(text, 'processo seletivo') ||
    has(text, 'matricula') ||
    has(text, 'selecao')
  ) return 'editais';

  // Fail-closed default for UFG opportunity feed: generic admin call → editais
  return 'editais';
}

function detectEventCategory(text) {
  // Order: specific formats before broad academicos default.
  if (has(text, 'sustentabilidade') || has(text, 'meio ambiente') || has(text, 'ambiental')) {
    return 'sustentabilidade';
  }

  if (
    has(text, 'palestra') ||
    has(text, 'palestras') ||
    has(text, 'webinario') ||
    has(text, 'webinar') ||
    has(text, 'webnario') ||
    has(text, 'live ') ||
    has(text, 'dialogos') ||
    has(text, 'circuito de palestras')
  ) return 'palestras';

  if (
    has(text, 'congresso') ||
    has(text, 'congressos') ||
    has(text, 'simposio') ||
    has(text, 'simposios') ||
    has(text, 'jornada') ||
    has(text, 'jornadas') ||
    has(text, 'semana academica') ||
    has(text, 'semana pedagogica') ||
    has(text, 'encontro cientifico') ||
    has(text, 'coloquio')
  ) return 'congressos';

  if (
    has(text, 'oficina') ||
    has(text, 'oficinas') ||
    has(text, 'workshop') ||
    has(text, 'workshops') ||
    has(text, 'minicurso') ||
    has(text, 'minicursos') ||
    has(text, 'hands-on') ||
    has(text, 'hands on')
  ) return 'workshops';

  if (
    has(text, 'curso de extensao') ||
    has(text, 'curso de verao') ||
    has(text, 'curso') ||
    has(text, 'cursos') ||
    has(text, 'capacitacao')
  ) return 'cursos';

  if (
    has(text, 'festival') ||
    has(text, 'mostra') ||
    has(text, 'cultura') ||
    has(text, 'cultural') ||
    has(text, 'cinema') ||
    has(text, 'musica') ||
    has(text, 'concerto') ||
    has(text, 'teatro') ||
    has(text, 'arte') ||
    has(text, 'exposicao')
  ) return 'culturais';

  if (
    has(text, 'esporte') ||
    has(text, 'esportivo') ||
    has(text, 'campeonato') ||
    has(text, 'tornero') ||
    has(text, 'torneio') ||
    has(text, 'jogos') ||
    has(text, 'danca') ||
    has(text, 'atletismo')
  ) return 'esportivos';

  if (has(text, 'festa') || has(text, 'festas') || has(text, 'baile') || has(text, 'celebracao')) {
    return 'festas';
  }

  // seminario / academico / default
  return 'academicos';
}

function detectModule(text, isEventItem) {
  if (isEventItem) return 'eventos';

  const opportunitySignals = [
    'edital', 'editais', 'chamada', 'processo seletivo', 'bolsa', 'bolsas',
    'monitoria', 'estagio', 'estagios', 'vagas', 'selecao', 'pibic', 'pivic',
    'probec', 'pesquisa', 'fapeg', 'mobilidade', 'mestrado', 'doutorado',
    'residencia', 'professor substituto', 'concurso', 'concurso publico',
    'premio', 'capacitacao', 'freelancer', 'voluntariado', 'matricula',
  ];
  const eventSignals = [
    'evento', 'eventos', 'curso', 'oficina', 'palestra', 'palestras',
    'seminario', 'congresso', 'congressos', 'simposio', 'jornada',
    'semana academica', 'mostra', 'festival', 'programacao', 'profissoes',
    'espaco das profissoes', 'webinario', 'webinar', 'webnario', 'live',
    'workshop', 'minicurso', 'concerto', 'campeonato', 'dialogos',
  ];

  // Strong event formats should stay on eventos even if text mentions pesquisa/estagio.
  const strongEventFormat = /\b(palestra|palestras|congresso|congressos|simposio|jornada|semana academica|webinario|webinar|webnario|festival|mostra|concerto|campeonato|oficina|workshop|minicurso|circuito de palestras|dialogos)\b/.test(text);
  const strongOpportunityFormat = /\b(edital|editais|processo seletivo|chamada|concurso publico|bolsa|bolsas|monitoria|vagas? de (estagio|emprego)|inscricoes abertas para)\b/.test(text);

  if (strongEventFormat && !strongOpportunityFormat) return 'eventos';
  if (strongOpportunityFormat && !strongEventFormat) return 'oportunidades';

  const opportunityScore = opportunitySignals.filter((term) => has(text, term)).length;
  const eventScore = eventSignals.filter((term) => has(text, term)).length;
  return opportunityScore > eventScore ? 'oportunidades' : 'eventos';
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
  const titleText = normalizeText(item.title || '');
  const institutionalRelease = (
    (isInstitutionalRelease(titleText) && !hasConcretePublishActionSignal(text)) ||
    (isInstitutionalRelease(text) && !hasStrongActionSignal(text))
  );

  let score = 0.18 + sourceBoost;
  score += Math.min(includeHits.length * 0.09, 0.45);
  if (hasDeadline) score += 0.1;
  if (hasPdf) score += 0.08;
  if (/ufg|prograd|proex|prpi|secom|verbena/.test(text)) score += 0.04;
  score -= Math.min(excludeHits.length * 0.2, 0.5);
  if (temporal.expired) score = Math.min(score, 0.49);
  if (institutionalRelease) score = Math.min(score, 0.39);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const module = detectModule(text, isEventItem);
  const rawCategory = module === 'oportunidades'
    ? detectOpportunityCategory(text)
    : detectEventCategory(text);
  const category = normalizeCategoryForModule(module, rawCategory);
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
  EVENT_CATEGORIES,
  OPPORTUNITY_CATEGORIES,
  analyzeTemporalRelevance,
  classifyItem,
  detectEventCategory,
  detectModule,
  detectOpportunityCategory,
  isValidCategoryForModule,
  normalizeCategoryForModule,
};
