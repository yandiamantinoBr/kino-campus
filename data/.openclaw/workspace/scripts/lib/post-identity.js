#!/usr/bin/env node
'use strict';

/**
 * Conservative, deterministic identity evidence for KinoCampus posts.
 *
 * A shared image is deliberately not an identity proof. UFG units commonly
 * reuse institutional templates across different courses and events.
 */

const GENERIC_TITLE_TOKENS = new Set([
  'abre', 'aberta', 'abertas', 'aberto', 'abertos', 'agosto', 'aluno',
  'alunos', 'ano', 'ate', 'aula', 'aulas', 'com', 'comunidade', 'concurso',
  'curso', 'cursos', 'das', 'de', 'do', 'dos', 'edicao', 'edital', 'em',
  'evento', 'eventos', 'federal', 'goias', 'goiania', 'inscricao',
  'inscricoes', 'julho', 'junho', 'matricula', 'matriculas', 'mestrado',
  'novo', 'novos', 'oportunidade', 'oportunidades', 'para', 'pela', 'pelo',
  'processo', 'programa', 'publica', 'publico', 'selecao', 'seletivo',
  'semestre', 'ufg', 'universidade', 'vaga', 'vagas',
]);

const GENERIC_ACRONYMS = new Set([
  'UFG', 'GO', 'BR', 'IES', 'PROEX', 'PRPG',
]);

const LANGUAGE_KEYS = [
  ['alemao', /\balema[oa]?\b|\bgerman\b/],
  ['espanhol', /\bespanhol\b|\bspanish\b/],
  ['frances', /\bfrances\b|\bfrench\b/],
  ['ingles', /\bingles\b|\benglish\b/],
  ['italiano', /\bitalian[oa]?\b/],
  ['mandarim', /\bmandarim\b|\bchines\b/],
  ['portugues', /\bportugues\b/],
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value, { distinctive = false } = {}) {
  const tokens = normalizeText(value)
    .split(' ')
    .filter(token => token.length > 2)
    .filter(token => !/^\d+$/.test(token));
  return new Set(distinctive
    ? tokens.filter(token => !GENERIC_TITLE_TOKENS.has(token))
    : tokens);
}

function setIntersection(left, right) {
  return [...left].filter(value => right.has(value));
}

function setMetrics(left, right) {
  const shared = setIntersection(left, right);
  const unionSize = new Set([...left, ...right]).size;
  const smallerSize = Math.min(left.size, right.size);
  return {
    shared,
    jaccard: unionSize ? shared.length / unionSize : 0,
    containment: smallerSize ? shared.length / smallerSize : 0,
  };
}

function titleSignals(a, b) {
  const normalizedA = normalizeText(a?.title);
  const normalizedB = normalizeText(b?.title);
  const all = setMetrics(tokenSet(a?.title), tokenSet(b?.title));
  const distinctive = setMetrics(
    tokenSet(a?.title, { distinctive: true }),
    tokenSet(b?.title, { distinctive: true }),
  );
  return {
    exact: Boolean(normalizedA && normalizedA === normalizedB),
    jaccard: all.jaccard,
    containment: all.containment,
    shared: all.shared,
    distinctiveJaccard: distinctive.jaccard,
    distinctiveContainment: distinctive.containment,
    distinctiveShared: distinctive.shared,
    strong: distinctive.shared.length >= 3
      && (distinctive.jaccard >= 0.48 || distinctive.containment >= 0.82),
    veryStrong: distinctive.shared.length >= 4
      && distinctive.jaccard >= 0.62
      && distinctive.containment >= 0.72,
  };
}

function metadataOf(post) {
  return post?.metadata && typeof post.metadata === 'object'
    ? post.metadata
    : {};
}

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

function collectSemanticDates(post) {
  const metadata = metadataOf(post);
  const dates = metadata.dates && typeof metadata.dates === 'object'
    ? metadata.dates
    : {};
  const out = {
    event: new Set(),
    deadline: new Set(),
    all: new Set(),
  };
  const add = (bucket, value) => {
    const normalized = normalizeDateOnly(value);
    if (!normalized) return;
    out[bucket].add(normalized);
    out.all.add(normalized);
  };

  [
    metadata.date_start,
    metadata.data_evento,
    dates.eventStartsAt,
    dates.event_starts_at,
  ].forEach(value => add('event', value));
  [
    metadata.date_end,
    metadata.data_fim_evento,
    dates.eventEndsAt,
    dates.event_ends_at,
  ].forEach(value => add('event', value));
  [
    metadata.deadline_date,
    dates.applicationDeadline,
    dates.application_deadline,
    dates.deadlineDate,
    dates.deadline_date,
  ].forEach(value => add('deadline', value));

  return out;
}

function latestRelevantLifecycleDate(post) {
  const moduleName = String(post?.module || '').trim().toLowerCase();
  const semanticDates = collectSemanticDates(post);
  const roleDates = moduleName === 'eventos'
    ? semanticDates.event
    : (moduleName === 'oportunidades' ? semanticDates.deadline : new Set());
  if (roleDates.size > 0) return [...roleDates].sort().pop();

  // Legacy records may only expose an untyped dates[] array. It is a
  // conservative fallback: the latest date must pass before auto-close.
  const metadata = metadataOf(post);
  const legacyDates = Array.isArray(metadata?.dates?.dates)
    ? metadata.dates.dates.map(normalizeDateOnly).filter(Boolean)
    : [];
  return [...new Set(legacyDates)].sort().pop() || '';
}

function daysApart(left, right) {
  const leftMs = Date.parse(`${left}T12:00:00Z`);
  const rightMs = Date.parse(`${right}T12:00:00Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return Infinity;
  return Math.abs(leftMs - rightMs) / 86400000;
}

function dateSignals(a, b) {
  const left = collectSemanticDates(a);
  const right = collectSemanticDates(b);
  const exactEvent = setIntersection(left.event, right.event);
  const exactDeadline = setIntersection(left.deadline, right.deadline);
  const exactAny = setIntersection(left.all, right.all);
  const exactSameRole = [...exactEvent, ...exactDeadline];
  const nearSameRole = [
    ...[...left.event].flatMap(l => [...right.event].map(r => [l, r])),
    ...[...left.deadline].flatMap(l => [...right.deadline].map(r => [l, r])),
  ].filter(([l, r]) => daysApart(l, r) <= 1);

  return {
    exactEvent,
    exactDeadline,
    exactSameRole,
    exactAny,
    nearSameRole,
    // Never let an event date confirm an application deadline in another row.
    corroborated: exactSameRole.length > 0 || nearSameRole.length > 0,
  };
}

function identityText(post) {
  const metadata = metadataOf(post);
  return [
    post?.title,
    metadata.source_title,
  ].filter(Boolean).join(' ');
}

function extractProgramKeys(post) {
  const metadata = metadataOf(post);
  const raw = [
    post?.title,
    metadata.source_unit,
    metadata.source_site,
    metadata.source_registry_id,
    metadata.source_title,
  ].filter(Boolean).join(' ');
  return new Set((raw.match(/\bPPG[A-Z0-9]{1,12}\b/gi) || [])
    .map(value => value.toUpperCase()));
}

function extractAcronymKeys(post) {
  const raw = String(post?.title || '');
  const keys = (raw.match(/\b[A-Z][A-Z0-9-]{2,14}\b/g) || [])
    .map(value => value.toUpperCase())
    .filter(value => !GENERIC_ACRONYMS.has(value))
    .filter(value => !/^[IVXLCDM]+$/.test(value));
  return new Set(keys);
}

function extractProcessKeys(post) {
  const normalized = identityText(post)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const keys = new Set();
  const pattern = /\b(?:edital|processo(?: seletivo)?)\s*(?:n\s*)?(\d{1,3})\s*[/-]\s*(20\d{2})\b/g;
  for (const match of normalized.matchAll(pattern)) {
    keys.add(`${match[1].replace(/^0+/, '') || '0'}/${match[2]}`);
  }
  return keys;
}

function extractLanguageKeys(post) {
  const normalized = normalizeText(identityText(post));
  return new Set(LANGUAGE_KEYS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([key]) => key));
}

function extractYearKeys(post) {
  return new Set(identityText(post).match(/\b20\d{2}\b/g) || []);
}

function extractLevelKeys(post) {
  const normalized = normalizeText(identityText(post));
  return new Set((normalized.match(/\b[abc][12]\b/g) || [])
    .map(value => value.toUpperCase()));
}

function extractAcademicTermKeys(post) {
  const raw = identityText(post)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const keys = new Set();
  for (const match of raw.matchAll(/\b(20\d{2})\s*[/.:-]\s*([12])\b/g)) {
    keys.add(`${match[1]}/${match[2]}`);
  }
  for (const match of raw.matchAll(/\b([12])(?:o|\u00ba|\u00b0)?\s+semestre(?:\s+de)?\s+(20\d{2})\b/g)) {
    keys.add(`${match[2]}/${match[1]}`);
  }
  return keys;
}

function extractDegreeKeys(post) {
  const normalized = normalizeText(identityText(post));
  const keys = new Set();
  if (/\bpos doutorado\b|\bposdoc\b/.test(normalized)) {
    keys.add('pos_doutorado');
  } else {
    if (/\bmestrado\b/.test(normalized)) keys.add('mestrado');
    if (/\bdoutorado\b/.test(normalized)) keys.add('doutorado');
  }
  if (/\bgraduacao\b/.test(normalized)) keys.add('graduacao');
  return keys;
}

function extractEmploymentKeys(post) {
  const normalized = normalizeText(identityText(post));
  return new Set(['efetivo', 'substituto']
    .filter(value => new RegExp(`\\b${value}\\b`).test(normalized)));
}

function extractLifecycleKeys(post) {
  const normalized = normalizeText(post?.title);
  if (/^(?:resultado|aprovados?|selecionados?|homologacao)\b/.test(normalized)) {
    return new Set(['result']);
  }
  if (/\b(?:edital|inscricoes?|processo seletivo|selecao|vagas?)\b/.test(normalized)) {
    return new Set(['call']);
  }
  return new Set();
}

function fingerprintSet(post) {
  const metadata = metadataOf(post);
  return new Set((Array.isArray(metadata.action_fingerprints)
    ? metadata.action_fingerprints
    : [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => /^[a-f0-9]{64}$/.test(value)));
}

function disjointConflict(left, right) {
  return left.size > 0 && right.size > 0 && setIntersection(left, right).length === 0;
}

function pairSignals(a, b) {
  const titles = titleSignals(a, b);
  const dates = dateSignals(a, b);
  const programsA = extractProgramKeys(a);
  const programsB = extractProgramKeys(b);
  const acronymsA = extractAcronymKeys(a);
  const acronymsB = extractAcronymKeys(b);
  const processA = extractProcessKeys(a);
  const processB = extractProcessKeys(b);
  const languagesA = extractLanguageKeys(a);
  const languagesB = extractLanguageKeys(b);
  const yearsA = extractYearKeys(a);
  const yearsB = extractYearKeys(b);
  const levelsA = extractLevelKeys(a);
  const levelsB = extractLevelKeys(b);
  const termsA = extractAcademicTermKeys(a);
  const termsB = extractAcademicTermKeys(b);
  const degreesA = extractDegreeKeys(a);
  const degreesB = extractDegreeKeys(b);
  const employmentA = extractEmploymentKeys(a);
  const employmentB = extractEmploymentKeys(b);
  const lifecycleA = extractLifecycleKeys(a);
  const lifecycleB = extractLifecycleKeys(b);
  const sharedPrograms = setIntersection(programsA, programsB);
  const sharedAcronyms = setIntersection(acronymsA, acronymsB);
  const sharedYears = setIntersection(yearsA, yearsB);
  const sharedLevels = setIntersection(levelsA, levelsB);
  const sharedTerms = setIntersection(termsA, termsB);
  const sharedFingerprints = setIntersection(fingerprintSet(a), fingerprintSet(b));
  const conflicts = [];

  if (disjointConflict(programsA, programsB)) conflicts.push('different_programs');
  if (disjointConflict(processA, processB)) conflicts.push('different_process_numbers');
  if (disjointConflict(languagesA, languagesB)) conflicts.push('different_languages');
  if (disjointConflict(yearsA, yearsB)) conflicts.push('different_years');
  if (disjointConflict(levelsA, levelsB)) conflicts.push('different_language_levels');
  if (disjointConflict(termsA, termsB)) conflicts.push('different_academic_terms');
  if (disjointConflict(degreesA, degreesB)) conflicts.push('different_degrees');
  if (disjointConflict(employmentA, employmentB)) conflicts.push('different_employment_types');
  if (disjointConflict(lifecycleA, lifecycleB)) conflicts.push('different_lifecycle');

  return {
    titles,
    dates,
    sharedPrograms,
    sharedAcronyms,
    sharedYears,
    sharedLevels,
    sharedTerms,
    sharedFingerprints,
    conflicts,
  };
}

function decideDuplicatePair(a, b, evidence = {}) {
  const signals = pairSignals(a, b);
  const reasons = [];
  const hasConflict = signals.conflicts.length > 0;

  if (evidence.sameWebyEvent) reasons.push('same_weby_event');
  if (evidence.sameCanonicalUrl) reasons.push('same_canonical_url');
  if (evidence.sameImage) reasons.push('same_image_supporting_only');
  if (signals.sharedFingerprints.length > 0) reasons.push('same_action_fingerprint');
  if (signals.sharedPrograms.length > 0) reasons.push('same_program');
  if (signals.sharedAcronyms.length > 0) reasons.push('same_acronym');
  if (signals.sharedTerms.length > 0) reasons.push('same_academic_term');
  if (signals.sharedLevels.length > 0) reasons.push('same_language_level');
  if (signals.dates.exactSameRole.length > 0) reasons.push('same_semantic_date_role');
  else if (signals.dates.nearSameRole.length > 0) reasons.push('near_semantic_date');
  if (signals.titles.exact) reasons.push('exact_title');
  if (signals.titles.veryStrong) reasons.push('very_strong_title');
  else if (signals.titles.strong) reasons.push('strong_title');

  let autoHide = false;
  if (!hasConflict) {
    autoHide = Boolean(
      evidence.sameWebyEvent
      || (
        signals.sharedFingerprints.length > 0
        && (
          (
            signals.titles.strong
            && signals.titles.distinctiveShared.length >= 3
          )
          || (
            signals.dates.corroborated
            && (
              signals.sharedPrograms.length > 0
              || signals.sharedAcronyms.length > 0
            )
            && signals.titles.distinctiveShared.length >= 2
          )
        )
      )
      || (
        evidence.sameCanonicalUrl
        && (
          signals.titles.veryStrong
          || (signals.titles.strong && (
            signals.dates.corroborated
            || signals.sharedPrograms.length > 0
            || signals.sharedAcronyms.length > 0
            || evidence.sameImage
          ))
        )
      )
      || (
        signals.dates.corroborated
        && (
          (
            signals.sharedPrograms.length > 0
            && (
              signals.titles.distinctiveShared.length >= 2
              || (
                signals.titles.distinctiveShared.length >= 1
                && signals.sharedTerms.length > 0
              )
            )
          )
          || (
            signals.sharedAcronyms.length > 0
            && (
              signals.titles.distinctiveShared.length >= 3
              || (
                signals.titles.shared.length >= 4
                && signals.titles.containment >= 0.7
              )
            )
          )
          || (
            signals.titles.strong
            && signals.titles.distinctiveShared.length >= 4
          )
        )
      )
      || (
        signals.titles.veryStrong
        && signals.titles.distinctiveShared.length >= 5
        && (
          signals.sharedPrograms.length > 0
          || signals.sharedAcronyms.length > 0
          || signals.sharedTerms.length > 0
          || signals.dates.corroborated
          || evidence.sameImage
        )
      )
      || (
        signals.titles.exact
        && signals.titles.distinctiveShared.length >= 3
        && (
          signals.dates.corroborated
          || signals.sharedPrograms.length > 0
          || signals.sharedAcronyms.length > 0
          || signals.sharedTerms.length > 0
          || evidence.sameImage
        )
      )
    );
  }

  return {
    autoHide,
    review: !autoHide && Boolean(
      evidence.sameCanonicalUrl
      || evidence.sameImage
      || evidence.sameWebyEvent
      || signals.titles.exact
      || signals.titles.strong
    ),
    reasons,
    conflicts: signals.conflicts,
    signals,
  };
}

module.exports = {
  collectSemanticDates,
  dateSignals,
  decideDuplicatePair,
  extractAcronymKeys,
  extractAcademicTermKeys,
  extractDegreeKeys,
  extractEmploymentKeys,
  extractLanguageKeys,
  extractLevelKeys,
  extractLifecycleKeys,
  extractProcessKeys,
  extractProgramKeys,
  extractYearKeys,
  latestRelevantLifecycleDate,
  normalizeDateOnly,
  normalizeText,
  pairSignals,
  titleSignals,
};
