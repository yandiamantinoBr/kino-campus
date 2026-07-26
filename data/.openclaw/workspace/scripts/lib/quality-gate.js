'use strict';

function isoDateInTimeZone(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const configuredReferenceDate = process.env.CADU_REFERENCE_DATE
  ? new Date(process.env.CADU_REFERENCE_DATE)
  : null;
const TODAY = configuredReferenceDate && !Number.isNaN(configuredReferenceDate.getTime())
  ? configuredReferenceDate
  : new Date();
const TODAY_ISO = isoDateInTimeZone(TODAY);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

// Fix F (2026-07-23): detectar placeholders que o LLM insere quando
// nao tem info canonica. Esses placeholders sao aceitaveis no PROMPT
// como instrucao ("se nao souber, escreva X"), mas o item NAO pode
// ser publicado se o OUTPUT final contem esses placeholders — vai
// direto pra needsReview para revisao humana.
const PLACEHOLDER_PATTERNS = [
  /\bconsulte\s+(?:o|os|a|as)?\s*edital(?:s)?(?:\s+oficial(?:s)?)?\b/i,
  /\bconsulte\s+(?:o|os|a|as)?\s*(?:fonte|site|link|url)\b/i,
  /\bconsulte\s+(?:o|os|a|as)?\s*divulgacao\b/i,
  /\bentre\s+em\s+contato\s+com(?:o|a)?\s+(?:a\s+)?(?:comissao|organizacao|secretaria|coordenacao|programa)\b/i,
  /\bdata\s+a\s+(?:confirmar|definir|esclarecer)\b/i,
  /\b(?:horario|local|endereco)\s+a\s+(?:confirmar|definir|esclarecer)\b/i,
  /\b(?:a|a\s+ser)\s+definid[oa]s?\b/i,
  /\ba\s+definir\b/i,
  /\b(?:mais\s+)?informacoes\s+em\s+breve\b/i,
  /\bdisponibilizaremos?\s+em\s+breve\b/i,
  /\bem\s+breve\s+divulgamos\b/i,
  /\bdivulgacao\s+em\s+breve\b/i,
  /\bedital\s+completo\s+em\s+breve\b/i,
  /\[(?:a\s+definir|tbd|em\s+breve)\]/i,
  /\b(?:ser(a|ao)\s+divulgad[oa]s?)\s+em\s+breve\b/i,
];

function detectPlaceholderDescription(description) {
  const text = normalizeText(description);
  if (!text) return null;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(description)) {
      return pattern.source.replace(/\\b|\?|\(s\)|\.\?/g, '').replace(/\\/g, '');
    }
  }
  return null;
}

function futureDatesFrom(record) {
  const dates = record.dates || {};
  const semantic = {
    applicationDeadline: dates.applicationDeadline || record.applicationDeadline,
    eventStartsAt: dates.eventStartsAt || dates.beginAt || record.eventStartsAt,
    eventEndsAt: dates.eventEndsAt || dates.endAt || record.eventEndsAt,
    resultPublishedAt: dates.resultPublishedAt || record.resultPublishedAt,
  };
  const hasSemanticRole = Object.values(semantic).some(Boolean);
  let values;
  if (record.module === 'eventos' && hasSemanticRole) {
    values = [semantic.eventStartsAt, semantic.eventEndsAt];
  } else if (record.module === 'oportunidades' && hasSemanticRole) {
    values = [semantic.applicationDeadline];
  } else {
    values = [
      ...asArray(dates.futureDates),
      dates.dateStart,
      dates.dateEnd,
      record.dateStart,
      record.dateEnd,
    ];
  }
  values = values.filter(Boolean).map(v => String(v).slice(0, 10));
  return [...new Set(values.map(validIsoDate).filter(v => v && v >= TODAY_ISO))].sort();
}

function linkCount(record, key) {
  const links = record.relevantLinks || {};
  return Array.isArray(links[key]) ? links[key].length : 0;
}

function normalizeHttpUrl(value) {
  try {
    const raw = String(value || '').trim()
      .replace(/(?:%20|%09|%0a|%0d)+(?=[?#]|$)/gi, '');
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/(?:%20|%09|%0a|%0d)+$/gi, '');
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function collectAllowedUrls(record) {
  const values = [record.url, record.link, record.sourceUrl, ...asArray(record.pdfs), ...asArray(record.pdfLinks)];
  for (const links of Object.values(record.relevantLinks || {})) {
    for (const link of asArray(links)) values.push(link?.url);
  }
  for (const url of collectApplicationUrls(record)) values.push(url);
  return new Set(values.map(normalizeHttpUrl).filter(Boolean));
}

function collectApplicationUrls(record) {
  return new Set(asArray(record.actionEvidence)
    .filter(evidence => ['application_url', 'form'].includes(evidence?.type) &&
      evidence?.purpose === 'application' && evidence?.confidence === 'high')
    .map(evidence => normalizeHttpUrl(evidence?.value))
    .filter(Boolean));
}

function collectDeclaredFormUrls(record) {
  return new Set(asArray(record?.relevantLinks?.formularios)
    .map(link => normalizeHttpUrl(link?.url))
    .filter(Boolean));
}

function markdownLinks(description) {
  const links = [];
  const regex = /\[([^\]\r\n]+)\]\(\s*(?:<([^>\r\n]+)>|((?:[^()\s]|\([^()\r\n]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  let match;
  while ((match = regex.exec(description)) !== null) {
    links.push({ label: match[1], url: match[2] || match[3] || '' });
  }
  return links;
}

function htmlAnchors(description) {
  const links = [];
  const regex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = regex.exec(String(description || ''))) !== null) {
    links.push({
      label: String(match[4] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      url: match[1] || match[2] || match[3] || '',
    });
  }
  return links;
}

function descriptionUrls(description) {
  const text = String(description || '');
  const destinations = [];
  const seen = new Set();
  const add = (raw, kind, trimTerminal = false) => {
    let value = String(raw || '').trim();
    if (trimTerminal) value = value.replace(/[\])}>.,;!?]+$/g, '');
    if (!value) return;
    const key = `${kind}\u0000${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    destinations.push({ raw: value, normalized: normalizeHttpUrl(value), kind });
  };

  for (const link of markdownLinks(text)) add(link.url, 'markdown');

  const hrefRegex = /\b(?:href|src|action|formaction|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  let match;
  while ((match = hrefRegex.exec(text)) !== null) {
    add(match[1] || match[2] || match[3] || '', 'html');
  }

  const autolinkRegex = /<((?:[a-z][a-z0-9+.-]*:|\/\/)[^<>\s]*)>/gi;
  while ((match = autolinkRegex.exec(text)) !== null) add(match[1], 'autolink');

  // Bare destinations are intentionally limited to unambiguous URI forms.
  // Relative paths in ordinary prose (for example `/admin/index.html`) are
  // text, while a relative destination inside Markdown/HTML is rejected above.
  const bareRegex = /(^|[\s>=(\[{,:;])((?:(?:[a-z][a-z0-9+.-]*:\/\/)|(?:javascript|data|vbscript|file|blob|ftp|mailto|tel):|(?<!:)\/\/)[^\s<>"'\])}]+)/gi;
  while ((match = bareRegex.exec(text)) !== null) add(match[2], 'bare', true);

  return destinations;
}

function hasDocumentOrAction(record) {
  const text = normalizeText([
    record.title,
    record.text,
    record.description,
    record.formattedDescription,
    record.actionLabel,
  ].filter(Boolean).join(' '));
  const pdfs = asArray(record.pdfs).length + asArray(record.pdfLinks).length;
  const forms = linkCount(record, 'formularios');
  const docs = linkCount(record, 'editais');
  return Boolean(
    pdfs ||
    forms ||
    docs ||
    /\b(edital|chamada|processo seletivo|inscric|submiss|formulario|bolsa|vaga|monitoria|concurso)\w*/.test(text)
  );
}

function hasSemanticIssue(record, code) {
  const dates = record.dates || {};
  const values = [
    record.gateReason,
    ...asArray(record.reasons),
    ...asArray(record.semanticIssues),
    ...asArray(dates.semanticIssues),
  ];
  const normalizedCode = normalizeText(code).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return values.some(value =>
    normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') === normalizedCode
  );
}

function claimsOpenApplications(description) {
  const plainDescription = String(description || '').replace(/[*_~`]/g, ' ').replace(/<[^>]+>/g, ' ');
  const clauses = normalizeText(plainDescription).split(/[\r\n.!?;]+/).map(value => value.trim()).filter(Boolean);
  return clauses.some((clause) => {
    if (/\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b.{0,40}\b(?:encerrad\w*|fechad\w*|suspens\w*|cancelad\w*)\b/.test(clause)) {
      return false;
    }
    if (/\bnao\s+(?:ha|exist\w*|estao?)\b.{0,32}\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\s+(?:abert|disponive)\w*\b/.test(clause)) {
      return false;
    }
    if (/\bnao\s+(?:estao?|seguem|continuam|permanecem|ficam)\b[^.!?;]{0,12}\b(?:abert|disponive)\w*\s+(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/.test(clause)) {
      return false;
    }
    if (/\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,20}\bnao\s+(?:(?:estao?|seguem|continuam|permanecem|ficam)\s+)?[^.!?;]{0,12}\b(?:abert|disponive)\w*\b/.test(clause)) return false;
    if (/\bsem\s+(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\s+(?:abert|disponive)\w*\b/.test(clause)) return false;
    const presentClause = clause
      .replace(/\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,20}\b(?:estarao?|serao?|ficarao?|abrirao?)\b[^.!?;]{0,16}\b(?:abert|disponive)\w*\b/g, ' ')
      .replace(/\b(?:estarao?|serao?|ficarao?|abrirao?)\b[^.!?;]{0,16}\b(?:abert|disponive)\w*\b[^.!?;]{0,16}\b(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/g, ' ')
      .replace(/\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,20}\b(?:estavam?|estiveram|permaneciam|ficavam|foram)\b[^.!?;]{0,16}\babert\w*\b/g, ' ')
      .replace(/\b(?:estavam?|estiveram|permaneciam|ficavam|foram)\b[^.!?;]{0,16}\babert\w*\b[^.!?;]{0,16}\b(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/g, ' ');
    return /\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,32}\b(?:abert|disponive)\w*\b/.test(presentClause)
      || /\b(?:estao|seguem|continuam|permanecem|ficam)\b[^.!?;]{0,16}\b(?:abert|disponive)\w*\b[^.!?;]{0,16}\b(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/.test(presentClause)
      || /\b(?:abert|disponive)\w*\b[^.!?;]{0,16}\b(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/.test(presentClause)
      || /\b(?:esta|estao|segue|seguem|continua|continuam|permanece|permanecem)\b[^.!?;]{0,20}\brecebendo\b[^.!?;]{0,16}\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/.test(presentClause)
      || /\b(?:periodo|prazo)\b[^.!?;]{0,32}\b(?:d[aeo]s?|para)\s+(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,24}\bem\s+andamento\b/.test(presentClause)
      || /\b(?:edital|chamada|selecao|processo\s+seletivo)\b.{0,60}\bcom\s+(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\s+abert\w*\b/.test(presentClause);
  });
}

function claimsClosedApplications(description) {
  const plainDescription = String(description || '').replace(/[*_~`]/g, ' ').replace(/<[^>]+>/g, ' ');
  const clauses = normalizeText(plainDescription).split(/[\r\n.!?;]+/).map(value => value.trim()).filter(Boolean);
  return clauses.some((clause) => {
    if (/\bnao\b[^.!?;]{0,20}\b(?:encerrad|fechad|cancelad|suspens|finalizad)\w*\b/.test(clause)) return false;
    const presentClause = clause
      .replace(/\b(?:serao?|estarao?|ficarao?)\b[^.!?;]{0,18}\b(?:encerrad|fechad|cancelad|suspens|finalizad)\w*\b/g, ' ');
    return /\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,40}\b(?:encerrad|fechad|cancelad|suspens|finalizad)\w*\b/.test(presentClause)
      || /\b(?:encerrad|fechad|cancelad|suspens|finalizad)\w*\b[^.!?;]{0,32}\b(?:as\s+)?(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/.test(presentClause);
  });
}

function validIsoDate(value) {
  const iso = String(value || '').trim().slice(0, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(iso)) return '';
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

function deadlineClaimDates(description, applicationDeadline) {
  const deadline = validIsoDate(applicationDeadline);
  const fallbackYear = (deadline || TODAY_ISO).slice(0, 4);
  const monthNumbers = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };
  const values = new Set();
  const add = (year, month, day) => {
    const iso = validIsoDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (iso) values.add(iso);
  };
  const fragments = String(description || '')
    .replace(/[*_~`]/g, '')
    .split(/[\r\n]+|[.;!?](?:\s+|$)/)
    .map(value => value.trim())
    .filter(Boolean);

  for (const fragment of fragments) {
    const normalized = normalizeText(fragment);
    const lastIndexFor = (value, pattern) => {
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let found = -1;
      let current;
      while ((current = regex.exec(value)) !== null) {
        found = current.index;
        if (current[0].length === 0) regex.lastIndex += 1;
      }
      return found;
    };
    const belongsToDeadline = (index) => {
      const before = normalized.slice(Math.max(0, index - 180), index);
      const deadlineCue = Math.max(
        lastIndexFor(before, /\bprazo(?:\s+final)?(?:\s+(?:d[aeo]s?|para))?\s+(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/g),
        lastIndexFor(before, /\b(?:ultimo\s+dia|data\s+limite)\s+(?:d[aeo]s?|para)\s+(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b/g),
        lastIndexFor(before, /\b(?:inscric\w*|candidatur\w*|submiss\w*|matricul\w*)\b[^.!?;]{0,90}\b(?:ate|encerram?|terminam?|finalizam?|de\s+\d{1,2}\s+a)\b[^.!?;]{0,20}$/g),
        lastIndexFor(before, /\b(?:inscreva-se|candidate-se|submeta|matricule-se)\b[^.!?;]{0,24}\bate\b/g),
        lastIndexFor(before, /\bprazo(?:\s+final)?\s*:\s*(?:ate\s*)?$/g),
      );
      const nonDeadlineCue = lastIndexFor(
        before,
        /\b(?:resultado|deferid\w*|homolog\w*|recurso\w*|entrevista|prova|cronograma)\b/g,
      );
      return deadlineCue >= 0 && deadlineCue >= nonDeadlineCue;
    };

    let match;
    const isoPattern = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    while ((match = isoPattern.exec(normalized))) {
      if (belongsToDeadline(match.index)) add(match[1], match[2], match[3]);
    }

    const numericPattern = /\b([0-3]?\d)[\/.]([01]?\d)(?:[\/.](20\d{2}))?\b/g;
    while ((match = numericPattern.exec(normalized))) {
      if (belongsToDeadline(match.index)) add(match[3] || fallbackYear, match[2], match[1]);
    }

    const namedPattern = /\b([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(20\d{2}))?\b/g;
    while ((match = namedPattern.exec(normalized))) {
      if (belongsToDeadline(match.index)) add(match[3] || fallbackYear, monthNumbers[match[2]], match[1]);
    }
  }
  return [...values].sort();
}

function isExpired(record) {
  const dates = record.dates || {};
  const future = futureDatesFrom(record);
  if (dates.isExpired === true || dates.expired === true || record.expired === true) return true;
  const pastDates = asArray(dates.pastDates);
  return future.length === 0 && pastDates.length > 0;
}

async function ensureQuality(record) {
  const warnings = [];
  const blockingIssues = [];
  const description = String(record.formattedDescription || record.description || '').trim();
  const displayTitle = String(record.formattedTitle || record.title || '').trim();
  const displayCopy = `${displayTitle}. ${description}`.trim();
  const module = String(record.module || '').trim();
  const dates = record.dates || {};
  const future = futureDatesFrom(record);

  const warn = (code) => {
    if (!warnings.includes(code)) warnings.push(code);
  };
  const block = (code) => {
    warn(code);
    if (!blockingIssues.includes(code)) blockingIssues.push(code);
  };

  if (!['eventos', 'oportunidades'].includes(module)) block('unsupported_module');
  if (description.length < 120) block('weak_description');
  // Fix F (2026-07-23): se a descricao contem placeholder de LLM
  // (ex: "consulte o edital oficial"), o item NAO pode ser publicado.
  // Vai pra needsReview para revisao humana.
  if (detectPlaceholderDescription(description)) {
    block('placeholder_description');
  }
  if (!record.title || String(record.title).trim().length < 12) warn('weak_title');
  if (!record.image && !asArray(record.images).length) warn('no_image');
  if (isExpired(record)) block('expired');
  if (record.mixedEventEpisodes === true || dates.mixedEventEpisodes === true || hasSemanticIssue(record, 'mixed_event_episodes')) {
    block('mixed_event_episodes');
  }
  if (record.conflictingEventIdentity === true || dates.conflictingEventIdentity === true || hasSemanticIssue(record, 'conflicting_event_identity')) {
    block('conflicting_event_identity');
  }
  if (hasSemanticIssue(record, 'ambiguous_application_extension')) {
    block('ambiguous_application_extension');
  }
  const semanticDateEntries = [
    ['applicationOpensAt', dates.applicationOpensAt],
    ['applicationDeadline', dates.applicationDeadline],
    ['eventStartsAt', dates.eventStartsAt || dates.beginAt],
    ['eventEndsAt', dates.eventEndsAt || dates.endAt],
    ['resultPublishedAt', dates.resultPublishedAt],
  ];
  if (semanticDateEntries.some(([, value]) => value && !validIsoDate(value))) {
    block('invalid_semantic_date');
  }
  const applicationOpensAt = validIsoDate(dates.applicationOpensAt);
  const applicationDeadline = validIsoDate(dates.applicationDeadline);
  const eventStartsAt = validIsoDate(dates.eventStartsAt || dates.beginAt);
  const eventEndsAt = validIsoDate(dates.eventEndsAt || dates.endAt);
  if (applicationOpensAt && applicationDeadline && applicationOpensAt > applicationDeadline) {
    block('invalid_application_date_range');
  }
  if (eventStartsAt && eventEndsAt && eventStartsAt > eventEndsAt) {
    block('invalid_event_date_range');
  }

  const applicationUrls = collectApplicationUrls(record);
  const declaredFormUrls = collectDeclaredFormUrls(record);
  const allowedUrls = new Set([...collectAllowedUrls(record), ...applicationUrls]);
  const applicationCta = /\b(?:inscreva(?:-se)?|candidate(?:-se)?|submeta|matricule(?:-se)?|aplique|(?:faca|realize)\s+(?:a\s+)?sua\s+inscricao|preencha\b[^.!?;]{0,32}\bformulario|envie\s+sua\s+(?:inscricao|proposta|candidatura)|(?:ja\s+)?pode\s+se\s+(?:inscrever|candidatar)|acesse\b[^.!?;]{0,28}\bformulario)\b/;
  const applicationLinkLabel = /\b(?:inscreva(?:-se)?|inscricao|candidate(?:-se)?|candidatura|submeta|submissao|matricule(?:-se)?|matricula|aplique|aplicacao|formulario|ficha\s+(?:de\s+)?(?:inscricao|participacao))\b/;
  const isInformationalApplicationLabel = label =>
    /\b(?:resultado|homologacao|recurso|deferimento|indeferimento|lista\s+(?:de\s+)?(?:aprovados|selecionados|classificados))\b/.test(normalizeText(label));
  const normalizedDisplayCopy = normalizeText(displayCopy);
  const applicationStatus = String(dates.applicationStatus || '').toLowerCase();
  if (dates.canApply === true && applicationStatus && applicationStatus !== 'open') {
    block('application_state_inconsistent');
  }
  if (claimsOpenApplications(displayCopy)) {
    // Fix U (2026-07-25): a regra antiga exigia `dates.canApply === true`,
    // o que era dependente do LLM extractor (DeepSeek) setar esse flag.
    // Em muitos casos o extractor falha em detectar canApply mesmo quando
    // o caption do IG e inequivoco ("inscricoes abertas ate 31 de julho").
    // Resultado: 21 posts validos foram QUALITY_BLOCKED no run 5101099a.
    // Nova regra: bloquear APENAS se ha evidencia explicita de que NAO pode
    // aplicar (canApply === false) ou o status foi setado como 'closed'.
    // Quando canApply e undefined (LLM extractor nao conseguiu), ACEITAR.
    const explicitlyClosed = dates.canApply === false || applicationStatus === 'closed';
    if (explicitlyClosed) {
      block('application_status_claim_mismatch');
    }
  }
  if (claimsClosedApplications(displayCopy) &&
      (applicationStatus === 'open' || dates.canApply === true)) {
    block('application_status_claim_mismatch');
  }
  const claimedDeadlineDates = deadlineClaimDates(displayCopy, dates.applicationDeadline);
  const expectedApplicationDeadline = validIsoDate(dates.applicationDeadline);
  if (claimedDeadlineDates.length > 0 &&
      (!expectedApplicationDeadline || claimedDeadlineDates.some(date => date !== expectedApplicationDeadline))) {
    // A data citada explicitamente como prazo deve corresponder ao campo
    // semantico applicationDeadline. Datas de resultado, matricula ou outra
    // edicao nao podem validar um prazo apenas por constarem em dates[].
    block('application_deadline_mismatch');
  }
  const hasApplicationCta = normalizedDisplayCopy
    .split(/[\r\n.!?;]+/)
    .some(clause => {
      if (/\b(?:nao|nunca)\s+(?:se\s+)?(?:inscreva|candidate|submeta|matricule|aplique|preencha|envie|acesse|faca|realize)\b/.test(clause)) return false;
      if (/\b(?:nao|nunca)\s+pode\s+se\s+(?:inscrever|candidatar)\b/.test(clause)) return false;
      return applicationCta.test(clause);
    });
  if (dates.canApply !== true && hasApplicationCta) {
    block('non_actionable_application_cta');
  }
  for (const link of descriptionUrls(description)) {
    if (!link.normalized || !allowedUrls.has(link.normalized)) {
      block('unapproved_description_url');
    }
    if (link.normalized && declaredFormUrls.has(link.normalized) &&
        (dates.canApply !== true || !applicationUrls.has(link.normalized))) {
      block('non_actionable_application_cta');
    }
  }
  for (const link of markdownLinks(description)) {
    const normalizedUrl = normalizeHttpUrl(link.url);
    if (!isInformationalApplicationLabel(link.label) && applicationLinkLabel.test(normalizeText(link.label)) &&
        (dates.canApply !== true || !applicationUrls.has(normalizedUrl))) {
      block('non_actionable_application_cta');
    }
  }
  for (const link of htmlAnchors(description)) {
    const normalizedUrl = normalizeHttpUrl(link.url);
    if (!isInformationalApplicationLabel(link.label) && applicationLinkLabel.test(normalizeText(link.label)) &&
        (dates.canApply !== true || !applicationUrls.has(normalizedUrl))) {
      block('non_actionable_application_cta');
    }
  }
  if (/<style\b|\bstyle\s*=|\bsrcset\s*=|@import\b/i.test(description)) {
    block('unsafe_description_resource');
  }

  if (module === 'eventos') {
    if (future.length === 0) {
      block('no_future_event_date');
    }
  } else if (module === 'oportunidades') {
    if (future.length === 0) {
      block(hasDocumentOrAction(record)
        ? 'opportunity_without_deadline'
        : 'opportunity_without_deadline_or_action');
    }
  }

  const nextRecord = {
    ...record,
    qualityOk: blockingIssues.length === 0,
    qualityWarnings: warnings,
    qualityBlockingIssues: blockingIssues,
  };

  return {
    ok: blockingIssues.length === 0,
    record: nextRecord,
    warnings,
    issues: blockingIssues,
  };
}

module.exports = {
  collectAllowedUrls,
  descriptionUrls,
  ensureQuality,
  detectPlaceholderDescription,
  normalizeHttpUrl,
  PLACEHOLDER_PATTERNS,
};
