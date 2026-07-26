#!/usr/bin/env node
/**
 * publish_auto_v5.js — Publicador do Cadu via Edge Function cadu-publish.
 * Lê o relatório do curador (curadoria-v4-*.json) e publica pelo endpoint oficial.
 *
 * Uso:
 *   node scripts/publish_auto_v5.js --dry-run
 *   node scripts/publish_auto_v5.js
 *   node scripts/publish_auto_v5.js arquivo.json
 *
 * v0.6 (2026-06-12): P0-A — aplica normalizeImageUrl em cada imagem do item
 *                   P0-B — valida tamanho da imagem armazenada após publish
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { normalizeImageUrl: normalizeCmsUrl, isThumbnailUrl, validateImageUrl } = require('./lib/image-utils.js');
const { resolveActionLabel } = require('./lib/curator-action-policy.js');
const { canonicalUrl: sharedCanonicalUrl } = require('./lib/canonical-url.js');
const { instagramPermalinkKey } = require('./lib/instagram-url.js');

const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

const env = {};
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
}
[
  path.join(process.cwd(), '.env.local'),
  '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local',
].forEach(loadEnvFile);
const ANON_KEY = process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || env.CADU_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

// F1 (2026-07-06): canonical URL parser. Normaliza formatos diferentes do mesmo
// evento pra mesma chave:
//   /events?event=39173        → ufg.br/events/39173
//   /e/39173-slug-do-evento    → ufg.br/events/39173
// Sincronizado com curador-v4.4.js, dedup-kino.js e cleanup-dup-2026-07-06.js.
function canonicalUrl(url) {
  return instagramPermalinkKey(url) || sharedCanonicalUrl(url);
}

const ENDPOINT = `${SUPABASE_URL}/functions/v1/cadu-publish`;
const BASE_DIR = '/data/.openclaw/workspace/data/ufg-scrape';
const MIN_SCORE = 0.70;  // Workflow Hardening 2026-06-01: must match curador
const DEDUP_RECENT_PAGE_SIZE = 500;
const DEDUP_RECENT_MAX_PAGES = 20;

// Pure parser exported for the pipeline contract test. Validates argv before
// any I/O so the publisher fail-closes on ambiguous or empty invocations.
function parsePublisherArgs(argv) {
  const options = { dryRun: false, report: null };
  let dryRunSeen = false;
  let reportSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      if (dryRunSeen) throw new Error('argumento duplicado: --dry-run');
      options.dryRun = true;
      dryRunSeen = true;
    } else if (arg === '--report') {
      if (reportSeen) throw new Error('argumento duplicado: --report');
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--report requer um caminho');
      options.report = value;
      reportSeen = true;
      index += 1;
    } else if (arg.endsWith('.json') && !arg.startsWith('--')) {
      if (reportSeen) throw new Error('relatório explícito obrigatório (apenas um)');
      options.report = arg;
      reportSeen = true;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  if (!reportSeen) {
    throw new Error('relatório explícito obrigatório (informe um .json ou --report <caminho>)');
  }
  return options;
}

const DRY_RUN = process.argv.includes('--dry-run');
const CUSTOM_FILE = process.argv.find(a => a.endsWith('.json') && !a.startsWith('--'));

function pickLatestReport() {
  const files = fs.readdirSync(BASE_DIR).filter(f => f.startsWith('_formatted_') && f.endsWith('.json'));
  if (!files.length) return null;
  files.sort((a, b) => {
    const ma = fs.statSync(path.join(BASE_DIR, a)).mtimeMs;
    const mb = fs.statSync(path.join(BASE_DIR, b)).mtimeMs;
    return mb - ma;
  });
  return path.join(BASE_DIR, files[0]);
}function normalizeImages(rec) {
  const rawImages = [
    rec.image,
    rec.imageUrl,
    rec.image_url,
    rec.cover,
    ...(Array.isArray(rec.images) ? rec.images : []),
    ...(Array.isArray(rec.gallery) ? rec.gallery : []),
  ];
  const seen = new Set();
  return rawImages
    .filter(Boolean)
    .map(String)
    .map(s => s.trim())
    .filter(s => /^https?:\/\//i.test(s) && !/\.svg(?:$|[?#])/i.test(s))
    .map(s => normalizeCmsUrl(s)) // P0-A: troca /l/ por /o/ no CMS UFG
    .filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .slice(0, 6); // S19 fix: 6 imagens (cadu 6-image contract)
}

function normalizeEnrichmentSources(rec) {
  const sources = [
    rec.url,
    rec.sourceUrl,
    rec.link,
    ...(Array.isArray(rec.enrichmentSources) ? rec.enrichmentSources : []),
    ...(Array.isArray(rec.sourcesChecked) ? rec.sourcesChecked : []),
  ];
  const seen = new Set();
  return sources
    .map(src => typeof src === 'string' ? { url: src, label: '', type: 'supplemental' } : src)
    .filter(src => src && /^https?:\/\//i.test(String(src.url || '')))
    .map(src => ({
      url: String(src.url).trim(),
      label: String(src.label || src.title || '').trim(),
      type: String(src.type || 'supplemental').trim(),
    }))
    .filter(src => {
      if (seen.has(src.url)) return false;
      seen.add(src.url);
      return true;
    })
    .slice(0, 12);
}

function normalizeExtractedLinks(rec) {
  const grouped = rec?.relevantLinks && typeof rec.relevantLinks === 'object'
    ? Object.entries(rec.relevantLinks).flatMap(([group, entries]) => (
      (Array.isArray(entries) ? entries : []).map(entry => ({ group, entry }))
    ))
    : [];
  const candidates = [
    ...(Array.isArray(rec?.extractedLinks)
      ? rec.extractedLinks.map(entry => ({ group: '', entry }))
      : []),
    ...grouped,
  ];
  const seen = new Set();
  return candidates
    .map(({ group, entry }) => {
      const source = typeof entry === 'string' ? { url: entry } : (entry || {});
      return {
        url: String(source.url || source.value || '').trim(),
        label: String(source.label || source.title || '').trim(),
        type: String(source.type || group || 'official').trim(),
      };
    })
    .filter(entry => /^(?:https?:\/\/|mailto:)/i.test(entry.url))
    .filter(entry => {
      const key = entry.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function normalizedDateOnly(value) {
  const match = String(value || '').match(/^(20\d{2}-\d{2}-\d{2})/);
  if (!match) return '';
  const parsed = new Date(`${match[1]}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function publisherReferenceNow(now = null) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  const configuredValue = String(process.env.CADU_REFERENCE_DATE || '').trim();
  const configured = /^20\d{2}-\d{2}-\d{2}$/.test(configuredValue)
    ? new Date(`${configuredValue}T12:00:00-03:00`)
    : (configuredValue ? new Date(configuredValue) : null);
  return configured && !Number.isNaN(configured.getTime()) ? configured : new Date();
}

function publisherTodayIso(now = null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(publisherReferenceNow(now));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function semanticPublicationDateFields(rec) {
  const dates = rec?.dates && typeof rec.dates === 'object' ? rec.dates : {};
  const module = String(rec?.module || 'oportunidades');

  if (module === 'eventos') {
    const eventStartsAt = normalizedDateOnly(dates.eventStartsAt || rec.eventStartsAt);
    const eventEndsAt = normalizedDateOnly(dates.eventEndsAt || rec.eventEndsAt);
    if (eventStartsAt || eventEndsAt) {
      return { dateStart: eventStartsAt, dateEnd: eventEndsAt, deadlineDate: '' };
    }
  }

  if (module === 'oportunidades') {
    const applicationDeadline = normalizedDateOnly(dates.applicationDeadline || rec.applicationDeadline);
    if (applicationDeadline) {
      return { dateStart: applicationDeadline, dateEnd: '', deadlineDate: applicationDeadline };
    }
  }

  return null;
}

function publicationDateFields(rec, todayIso = '') {
  const dates = rec?.dates && typeof rec.dates === 'object' ? rec.dates : {};
  const semantic = semanticPublicationDateFields(rec);
  if (semantic) return semantic;
  const future = Array.isArray(dates.futureDates)
    ? dates.futureDates.map(normalizedDateOnly).filter(date => date && (!todayIso || date >= todayIso))
    : [];
  const module = String(rec?.module || 'oportunidades');

  // Backwards compatibility for collectors that still emit only futureDates.
  return {
    dateStart: future[0] || '',
    dateEnd: future.length > 1 ? future[future.length - 1] : '',
    deadlineDate: module === 'oportunidades' && future.length === 1 ? future[0] : '',
  };
}

function recordToItem(rec, now = null) {
  const todayIso = publisherTodayIso(now);
  const publicationDates = publicationDateFields(rec, todayIso);
  const formattedDescription = rec.formattedDescription || rec.formatted_description || (rec.formatted ? rec.description : '');

  const qualityBlockingIssues = Array.isArray(rec.qualityBlockingIssues)
    ? rec.qualityBlockingIssues.filter(Boolean)
    : [];
  if (rec.needsReview === true || rec.qualityOk === false || rec.formatted === false || qualityBlockingIssues.length > 0) {
    console.error(`   ⚠️ REJEITADO: revisão/qualidade pendente — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }
  
  // HARDENING 2026-06-04: Rejeitar item sem formattedDescription (falta formatacao IA)
  if (!formattedDescription || formattedDescription.length < 80) {
    console.error(`   ⚠️ REJEITADO: sem formattedDescription (${formattedDescription.length}ch) — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }

  // HARDENING 2026-06-23: Rejeitar item com TODAS as datas no passado (já expirou)
  // Se futureDates está vazio E há pastDates, o evento/oportunidade já passou.
  const recDates = rec.dates || {};
  const module = String(rec.module || 'oportunidades');
  const explicitlyExpired = rec.expired === true || rec.expired === 'true' ||
    recDates.isExpired === true || recDates.isExpired === 'true' ||
    recDates.expired === true || recDates.expired === 'true';
  const lifecycleExpired = (module === 'oportunidades' && String(recDates.applicationStatus || '').toLowerCase() === 'closed') ||
    (module === 'eventos' && /^(?:past|ended|expired|closed)$/.test(String(recDates.eventStatus || '').toLowerCase()));
  const semanticBoundary = module === 'eventos'
    ? normalizedDateOnly(recDates.eventEndsAt || rec.eventEndsAt || recDates.eventStartsAt || rec.eventStartsAt)
    : normalizedDateOnly(recDates.applicationDeadline || rec.applicationDeadline);
  if (explicitlyExpired || lifecycleExpired || (semanticBoundary && semanticBoundary < todayIso)) {
    console.error(`   ⚠️ REJEITADO: ciclo semântico expirado — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }
  const futureD = [
    ...(Array.isArray(recDates.futureDates) ? recDates.futureDates : []),
    publicationDates.dateStart,
    publicationDates.dateEnd,
    publicationDates.deadlineDate,
  ].map(normalizedDateOnly).filter(date => date && date >= todayIso);
  const pastD = Array.isArray(recDates.pastDates)
    ? recDates.pastDates.map(normalizedDateOnly).filter(Boolean)
    : [];
  const knownDates = [
    ...(Array.isArray(recDates.futureDates) ? recDates.futureDates : []),
    ...pastD,
    recDates.applicationDeadline,
    recDates.eventStartsAt,
    recDates.eventEndsAt,
  ].map(normalizedDateOnly).filter(Boolean);
  if (futureD.length === 0 && knownDates.length > 0) {
    console.error(`   ⚠️ REJEITADO: todas as datas no passado (${pastD.join(', ')}) — '${(rec.title||'').slice(0,60)}'`);
    return null;
  }
  
  const description = formattedDescription;
  const images = normalizeImages(rec);
  
  // Closed registration on a future event is informational, never an open
  // application CTA. Other records preserve the historical inference.
  const actionLabel = resolveActionLabel(rec, formattedDescription);
  
  // HARDENING 2026-06-04: contato padrao inferido
  let contato = rec.contato || '';
  if ((!contato || contato === 'Ver link oficial da UFG') && rec.site) {
    contato = `${rec.site.toLowerCase()}.ufg.br`;
  }
  
  return {
    module: rec.module || 'oportunidades',
    category: rec.category || '',
    // Keep raw and display titles separate. The Edge mapper uses
    // formattedTitle for display and preserves title as source identity.
    title: rec.title || '',
    formattedTitle: rec.formattedTitle || '',
    sourceTitle: rec.sourceTitle || rec.title || '',
    description,
    actionLabel,
    formattedDescription,
    location: rec.location || '',
    dateStart: publicationDates.dateStart,
    dateEnd: publicationDates.dateEnd,
    deadlineDate: publicationDates.deadlineDate,
    gratuito: rec.module === 'eventos' ? true : undefined,
    link: rec.link || rec.sourceUrl || rec.url || '',
    linkAsCta: true,
    actionLabel,
    actionKey: rec.actionKey || '',
    contato,
    image: images[0] || '',
    images,
    pdfLinks: Array.isArray(rec.pdfLinks) ? rec.pdfLinks : (Array.isArray(rec.pdfs) ? rec.pdfs : []),
    extractedLinks: normalizeExtractedLinks(rec),
    relevantLinks: rec.relevantLinks && typeof rec.relevantLinks === 'object' ? rec.relevantLinks : {},
    actionEvidence: Array.isArray(rec.actionEvidence) ? rec.actionEvidence : [],
    enrichmentSources: normalizeEnrichmentSources(rec),
    enrichmentCheckedAt: rec.enrichmentCheckedAt || new Date().toISOString(),
    score: typeof rec.score === 'number' ? rec.score : undefined,
    dates: rec.dates || {},
    // The article/event URL is the durable identity. A curator-resolved
    // `sourceUrl` can be an application form and remains available in `link`.
    sourceUrl: rec.url || rec.sourceUrl || '',
    // S8 fix: formato canônico de sourceId = `${site}:${item.id || slug || url}`
    sourceId: rec.sourceId || (rec.site ? `${rec.site}:${rec.id || rec.slug || rec.url || ''}` : (rec.url || '')),
    sourceRegistryId: rec.sourceRegistryId || '',
    actionFingerprints: Array.isArray(rec.actionFingerprints)
      ? [...new Set(rec.actionFingerprints
        .map(value => String(value || '').trim().toLowerCase())
        .filter(value => /^[a-f0-9]{64}$/.test(value)))]
      : [],
    sourceName: rec.sourceName || rec.site || 'UFG',
    area: rec.area || '',
    contato,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
  };
}

// Every structured outcome must carry the immutable identity received from
// the pipeline. The public Kino URL returned by cadu-publish is a result of
// the mutation, never the identity of the collected source.
function publishOutcomeIdentity(record, normalizedItem = null) {
  const sourceUrl = String(
    normalizedItem?.sourceUrl
      || record?.url
      || record?.sourceUrl
      || record?.link
      || '',
  ).trim();
  return {
    sourceId: String(normalizedItem?.sourceId || record?.sourceId || '').trim(),
    sourceUrl,
    canonicalSourceUrl: sourceUrl,
  };
}

// ============================================================
// P1-MERGE (2026-06-12): Funções client-side de dedup + merge
// Regra do Yan: manter SEMPRE a postagem mais antiga ou que tem mais interações
// ============================================================

/**
 * Normaliza título para comparação: lowercase, sem acentos, remove stopwords.
 */
function normalizeTitleForCompare(s) {
  if (!s) return '';
  // Remove acentos
  let n = s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove stopwords comuns em títulos de eventos
  const stop = new Set(['de','da','do','e','a','o','em','para','com','no','na','nos','nas','um','uma','uns','umas','os','as','—','-']);
  return n.split(' ').filter(w => w && !stop.has(w) && w.length > 2).join(' ');
}

/**
 * Compara 2 títulos normalizados. Retorna true se forem do "mesmo evento":
 * - Match exato: ambos têm a mesma sequência
 * - Match substring: um contém o outro
 * - Match fuzzy: 70%+ de similaridade (SequenceMatcher-like)
 */
function titlesMatch(left, right) {
  if (!left || !right) return false;
  if (publisherTitleIdentityConflict(left, right)) return false;
  const a = normalizeTitleForCompare(left);
  const b = normalizeTitleForCompare(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 15 && b.length >= 15 && (a.includes(b) || b.includes(a))) return true;
  // Fuzzy: trigrama overlap ≥ 50%
  const trigramsA = new Set();
  for (let i = 0; i < a.length - 2; i++) trigramsA.add(a.slice(i, i + 3));
  const trigramsB = new Set();
  for (let i = 0; i < b.length - 2; i++) trigramsB.add(b.slice(i, i + 3));
  let inter = 0;
  for (const t of trigramsA) if (trigramsB.has(t)) inter++;
  const total = Math.max(trigramsA.size, trigramsB.size);
  return total > 0 && inter / total >= 0.5;
}

function publisherTitleIdentityConflict(left, right) {
  const normalizeIdentity = value => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const a = normalizeIdentity(left);
  const b = normalizeIdentity(right);
  const editalNumber = value => {
    const match = value.match(/\bedital\s+(?:n\s+)?(\d{1,4})\s+(20\d{2})\b/);
    return match ? `${Number(match[1])}/${match[2]}` : null;
  };
  const editalA = editalNumber(a);
  const editalB = editalNumber(b);
  if (editalA && editalB && editalA !== editalB) return 'different_edital';

  const resultPattern = /^(?:resultado|aprovados?|selecionados?|homologacao)\b/;
  if (resultPattern.test(a) !== resultPattern.test(b)) return 'different_lifecycle';

  const ppg = value => (value.match(/\bppg[a-z]{1,12}\b/g) || [])
    .sort((x, y) => y.length - x.length)[0] || null;
  const ppgA = ppg(a);
  const ppgB = ppg(b);
  if (ppgA && ppgB && ppgA !== ppgB) return 'different_ppg';

  const exclusivePivot = value => {
    if (/\b(?:pos\s+doutorado|posdoc)\b/.test(value)) return 'academic:pos_doutorado';
    const hasMestrado = /\bmestrado\b/.test(value);
    const hasDoutorado = /\bdoutorado\b/.test(value);
    if (hasMestrado !== hasDoutorado) return `academic:${hasMestrado ? 'mestrado' : 'doutorado'}`;
    const employmentTypes = ['efetivo', 'substituto']
      .filter(type => new RegExp(`\\b${type}\\b`).test(value));
    if (employmentTypes.length === 1) return `employment:${employmentTypes[0]}`;
    return null;
  };
  const pivotA = exclusivePivot(a);
  const pivotB = exclusivePivot(b);
  if (pivotA && pivotB && pivotA !== pivotB) return 'different_audience';

  const yearsA = [...new Set(a.match(/\b20\d{2}\b/g) || [])];
  const yearsB = [...new Set(b.match(/\b20\d{2}\b/g) || [])];
  if (yearsA.length === 1 && yearsB.length === 1 && yearsA[0] !== yearsB[0]) {
    return 'different_year';
  }
  return null;
}

function publisherSourceIdentityConflict(item, post) {
  const itemSourceId = String(item?.sourceId || '').trim();
  const postSourceId = String(post?.metadata?.source_id || '').trim();
  if (itemSourceId && postSourceId && itemSourceId !== postSourceId) {
    return 'different_source_id';
  }

  const itemRegistryId = String(item?.sourceRegistryId || '').trim();
  const postRegistryId = String(post?.metadata?.source_registry_id || '').trim();
  if (itemRegistryId && postRegistryId && itemRegistryId !== postRegistryId) {
    return 'different_source_registry';
  }
  return null;
}

function identityDates(value) {
  const dates = new Set();
  const visit = (entry) => {
    if (entry === null || entry === undefined) return;
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (typeof entry === 'object') {
      Object.values(entry).forEach(visit);
      return;
    }
    const matches = String(entry).match(/20\d{2}-\d{2}-\d{2}/g) || [];
    matches.forEach(date => dates.add(date));
  };
  visit(value?.dates);
  visit(value?.dateStart);
  visit(value?.dateEnd);
  visit(value?.deadlineDate);
  visit(value?.deadline_date);
  visit(value?.metadata?.dates);
  visit(value?.metadata?.data_evento);
  visit(value?.metadata?.data_fim_evento);
  visit(value?.metadata?.deadline_date);
  return dates;
}

function actionFingerprintConfirmsCandidate(item, post, identityTitle) {
  const itemSourceId = String(item?.sourceId || '').trim();
  const postSourceId = String(post?.metadata?.source_id || '').trim();
  if (!itemSourceId || !postSourceId || itemSourceId === postSourceId) return true;

  // Different releases may announce the same action. Permit that strong
  // identity only inside the same registry, with compatible titles and at
  // least one shared calendar date. This blocks recurring calls that reuse a
  // form and prevents a bad merge from poisoning later fingerprints.
  const itemRegistry = String(item?.sourceRegistryId || '').trim();
  const postRegistry = String(post?.metadata?.source_registry_id || '').trim();
  if (!itemRegistry || !postRegistry || itemRegistry !== postRegistry) return false;
  if (!titlesMatch(identityTitle, post?.metadata?.source_title || post?.title)) return false;

  const itemDates = identityDates(item);
  const postDates = identityDates(post);
  if (itemDates.size === 0 || postDates.size === 0) return false;
  return [...itemDates].some(date => postDates.has(date));
}

function hasItemLevelUrlIdentity(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const instagramPost = Boolean(instagramPermalinkKey(rawUrl));
    const identityParameter = [...parsed.searchParams.keys()]
      .find(key => /^(?:event|evento|id)$/i.test(key)
        && String(parsed.searchParams.get(key) || '').trim());
    return /\/(?:n|e)\/\d+(?:\b|[-/])/i.test(parsed.pathname)
      || instagramPost
      || Boolean(identityParameter);
  } catch (_) {
    return false;
  }
}

class DedupQueryError extends Error {
  constructor(stage, cause) {
    const detail = cause && cause.message ? String(cause.message) : 'resposta ausente ou ambigua';
    super(`consulta de deduplicacao ${stage} falhou: ${detail}`);
    this.name = 'DedupQueryError';
    this.code = 'DEDUP_QUERY_FAILED';
    this.stage = stage;
    this.supabaseCode = cause && cause.code ? String(cause.code) : '';
    this.cause = cause;
  }
}

async function runDedupQuery(stage, query) {
  let result;
  try {
    result = await query;
  } catch (error) {
    throw new DedupQueryError(stage, error);
  }
  if (!result || result.error) {
    throw new DedupQueryError(stage, result && result.error);
  }
  if (!Array.isArray(result.data)) {
    throw new DedupQueryError(stage, { message: 'Supabase nao retornou uma lista de linhas' });
  }
  return result;
}

async function runDedupSelect(stage, query) {
  return (await runDedupQuery(stage, query)).data;
}

async function fetchPaginatedDedupRows(stage, buildPage, {
  pageSize = DEDUP_RECENT_PAGE_SIZE,
  maxPages = DEDUP_RECENT_MAX_PAGES,
} = {}) {
  const rows = [];
  const seenIds = new Set();
  let expectedTotal = null;
  for (let page = 0; page < maxPages; page += 1) {
    const from = rows.length;
    const to = from + pageSize - 1;
    const result = await runDedupQuery(
      `${stage}_page_${page + 1}`,
      buildPage({ page, from, to }),
    );
    if (!Number.isSafeInteger(result.count) || result.count < 0) {
      throw new DedupQueryError(`${stage}_count`, {
        message: 'Supabase nao retornou a contagem exata da consulta',
      });
    }
    if (expectedTotal === null) {
      expectedTotal = result.count;
      if (expectedTotal > pageSize * maxPages) {
        throw new DedupQueryError(`${stage}_pagination`, {
          code: 'DEDUP_PAGINATION_LIMIT',
          message: `consulta contem ${expectedTotal} posts e excede o teto seguro`,
        });
      }
    } else if (result.count !== expectedTotal) {
      throw new DedupQueryError(`${stage}_count_changed`, {
        message: `contagem mudou de ${expectedTotal} para ${result.count} durante a paginacao`,
      });
    }

    const pageRows = result.data;
    if (pageRows.length === 0 && rows.length < expectedTotal) {
      throw new DedupQueryError(`${stage}_incomplete_page`, {
        message: `paginacao encerrou em ${rows.length} de ${expectedTotal} posts`,
      });
    }
    for (const row of pageRows) {
      const id = String(row.id || '');
      if (!id || seenIds.has(id)) {
        throw new DedupQueryError(`${stage}_unstable_order`, {
          message: `linha repetida ou sem id durante a paginacao (${id || 'sem-id'})`,
        });
      }
      seenIds.add(id);
      rows.push(row);
    }
    if (rows.length === expectedTotal) return rows;
    if (rows.length > expectedTotal) {
      throw new DedupQueryError(`${stage}_count_mismatch`, {
        message: `Supabase retornou ${rows.length} linhas para uma contagem de ${expectedTotal}`,
      });
    }
  }
  throw new DedupQueryError(`${stage}_pagination`, {
    code: 'DEDUP_PAGINATION_LIMIT',
    message: `paginacao nao terminou apos ${maxPages} paginas`,
  });
}

async function fetchRecentPostsForCanonicalDedup(supabase, sinceIso) {
  return fetchPaginatedDedupRows(
    'canonical_recent',
    ({ from, to }) => (
      supabase
        .from('posts')
        .select(
          'id, title, status, created_at, updated_at, view_count, share_count, coupon_clicks, description, image_url, metadata',
          { count: 'exact' },
        )
        .gte('updated_at', sinceIso)
        .neq('status', 'deleted')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  );
}

/**
 * Busca posts existentes no DB que podem ser duplicatas do item.
 * Critérios:
 *   1. Mesmo sourceUrl (canônico)
 *   2. Mesmo sourceId
 *   3. Mesmo link (extra link do item)
 *   4. Título similar (slug match)
 *   5. Status != 'deleted'
 */
async function findExistingPostsClient(supabase, item) {
  const candidates = [];
  const seen = new Set();
  const identityTitle = item.sourceTitle || item.title;
  const tNorm = normalizeTitleForCompare(identityTitle);

  // Helper para adicionar
  const addCandidate = (p) => {
    if (!p || p.id === undefined || seen.has(p.id)) return;
    seen.add(p.id);
    candidates.push(p);
  };

  // F1 (2026-07-06): REMOVIDO filtro `.eq('author_id', supabase.auth.user?.id)`.
  // Bug B4: o signInWithPassword loga como `yandiamantino@egresso.ufg.br` (user
  // humano), mas os posts de evento foram criados pelo cadu-publish Edge Function
  // com `author_id` do bot (2345582d-...). O filtro zerava todas as queries,
  // então findExistingPostsClient SEMPRE retornava vazio, criando duplicatas.
  //
  // F1 (2026-07-06): NOVA query por canonical URL (Bug B3). Como a UFG tem 2
  // formatos de URL pro mesmo evento (`ufg.br/events?event=X` vs
  // `ufg.br/e/X-slug-do-evento`), o match raw por `source_url` falhava.

  // 1. Mesmo sourceUrl (raw) OU canonical URL equivalente
  const itemSourceCanonical = canonicalUrl(item.sourceUrl || item.link);
  const titleConfirmsCandidate = (post) => {
    if (publisherSourceIdentityConflict(item, post)) return false;
    return titlesMatch(identityTitle, post?.title)
      || titlesMatch(identityTitle, post?.metadata?.source_title);
  };
  const selectFields = 'id, title, status, created_at, updated_at, view_count, share_count, coupon_clicks, description, image_url, metadata';
  const fetchExactMatches = (stage, applyFilter) => fetchPaginatedDedupRows(
    stage,
    ({ from, to }) => applyFilter(
      supabase.from('posts').select(selectFields, { count: 'exact' }),
    )
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (item.sourceUrl) {
    const data = await fetchExactMatches(
      'source_url',
      query => query.eq('metadata->>source_url', item.sourceUrl),
    );
    data.filter(post => hasItemLevelUrlIdentity(item.sourceUrl) || titleConfirmsCandidate(post))
      .forEach(addCandidate);
  }

  // 2. Mesmo sourceId
  if (item.sourceId) {
    const data = await fetchExactMatches(
      'source_id',
      query => query.eq('metadata->>source_id', item.sourceId),
    );
    data.forEach(addCandidate);
  }

  // 2b. Mesma identidade de acao (fonte + janela + endpoint). Esse hash
  // liga releases diferentes da mesma oportunidade sem expor email/URL.
  const actionFingerprints = Array.isArray(item.actionFingerprints)
    ? [...new Set(item.actionFingerprints.filter(value => /^[a-f0-9]{64}$/i.test(value)))]
    : [];
  for (const fingerprint of actionFingerprints) {
    const data = await fetchExactMatches(
      `action_fingerprint_${fingerprint.slice(0, 12)}`,
      query => query.contains('metadata', { action_fingerprints: [fingerprint] }),
    );
    data
      .filter(post => actionFingerprintConfirmsCandidate(item, post, identityTitle))
      .forEach(addCandidate);
  }

  // 3. Mesmo link (item.link raw)
  if (item.link && item.link !== item.sourceUrl) {
    const data = await fetchExactMatches(
      'link',
      query => query.eq('metadata->>link', item.link),
    );
    data.filter(post => hasItemLevelUrlIdentity(item.link) || titleConfirmsCandidate(post))
      .forEach(addCandidate);
  }

  // 4. (F1) NOVO: match por canonical URL contra posts recentes.
  //    Pega posts atualizados nos últimos 14 dias e filtra in-Node por
  //    canonicalUrl(source_url) === canonicalUrl(item).
  //    Cobre o caso "ufg.br/events?event=X" vs "ufg.br/e/X-slug-do-evento".
  if (itemSourceCanonical) {
    const sinceIso = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const recentPosts = await fetchRecentPostsForCanonicalDedup(supabase, sinceIso);
    for (const p of recentPosts) {
      const pCanonical = canonicalUrl(p.metadata?.source_url || p.metadata?.link || '');
      if (pCanonical && pCanonical === itemSourceCanonical
          && (hasItemLevelUrlIdentity(item.sourceUrl || item.link) || titleConfirmsCandidate(p))) {
        addCandidate(p);
      }
    }
  }

  // 5. Título similar (slug match) — heurística: trigrama overlap ≥ 50%
  if (tNorm && tNorm.length >= 15) {
    const words = tNorm.split(' ').filter(w => w.length >= 5).sort((a, b) => b.length - a.length).slice(0, 2);
    for (const word of words) {
      const data = await fetchExactMatches(
        `title_word_${word}`,
        query => query.ilike('title', `%${word}%`),
      );
      for (const p of data) {
        if (titleConfirmsCandidate(p)) {
          addCandidate(p);
        }
      }
    }
  }

  return candidates;
}

function relevantExpiryFromItem(item, now = null) {
  const referenceNow = publisherReferenceNow(now);
  const candidates = [];
  const add = value => {
    const match = String(value || '').match(/(20\d{2}-\d{2}-\d{2})/);
    if (match) candidates.push(match[1]);
  };
  const dates = item?.dates && typeof item.dates === 'object' ? item.dates : {};

  if (item?.module === 'eventos') {
    const semanticEnd = normalizedDateOnly(dates.eventEndsAt || item.eventEndsAt);
    const semanticStart = normalizedDateOnly(dates.eventStartsAt || item.eventStartsAt);
    if (semanticEnd || semanticStart) {
      add(semanticEnd);
      add(semanticStart);
    } else {
      add(item.dateEnd);
      add(item.dateStart);
      add(dates.endDate);
      add(dates.end);
      if (Array.isArray(dates.futureDates)) dates.futureDates.forEach(add);
    }
  } else if (item?.module === 'oportunidades') {
    const semanticDeadline = normalizedDateOnly(dates.applicationDeadline || item.applicationDeadline);
    if (semanticDeadline) {
      add(semanticDeadline);
    } else {
      add(item.deadlineDate);
      add(item.deadline_date);
      add(item.deadline);
      add(dates.deadlineDate);
      add(dates.deadline_date);
      add(dates.deadline);
    }
    if (candidates.length === 0 && Array.isArray(dates.futureDates) && dates.futureDates.length === 1) {
      add(dates.futureDates[0]);
    }
  }

  const latest = [...new Set(candidates)].sort().pop();
  if (!latest) return '';
  const expiry = new Date(`${latest}T23:59:59.999-03:00`);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= referenceNow.getTime()) return '';
  return expiry.toISOString();
}

/**
 * Mescla formatação de um item em um post existente.
 * Regra: manter o ID do post existente (que é o mais antigo, canônico).
 * Atualiza com: description mais completa, image maior, link da fonte mais recente.
 *
 * FIX 2026-07-15: Se o winner estiver `closed` (auto-close por data passada
 * ou admin_close), o item NOVO é evidência de que a UFG republicou o evento.
 * Reativar para `published` é a ação correta (regra Yan: "as pessoas
 * podem ter visto a mais antiga, eu não quero que na hora que vai ver não
 * tenha mais"). Caso contrário, o item novo vira `hidden` e nunca aparece
 * no KinoCampus — a UI mostra o post closed como encerrado, e o item
 * "novo" some. Sem reativação, o sistema parece "zero publish" mesmo
 * com N publicáveis identificados.
 */
async function mergeIntoExisting(supabase, postId, item, opts = {}) {
  const { reactivateIfHidden = true, reactivateIfClosed = true } = opts;
  // Pega o post existente
  const { data: existing, error: existingError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (existingError) {
    console.warn(`   ⚠️ leitura do post ${postId} falhou: ${existingError.message}`);
    return false;
  }
  if (!existing) {
    console.warn(`   ⚠️ post ${postId} não encontrado`);
    return false;
  }

  const existingMeta = existing.metadata || {};
  const mergeTimestamp = new Date().toISOString();
  const semanticDateFields = semanticPublicationDateFields(item);
  const incomingExpiry = relevantExpiryFromItem(item);
  const mergedActionFingerprints = [...new Set([
    ...(Array.isArray(existingMeta.action_fingerprints) ? existingMeta.action_fingerprints : []),
    ...(Array.isArray(item.actionFingerprints) ? item.actionFingerprints : []),
  ].map(value => String(value || '').trim().toLowerCase())
    .filter(value => /^[a-f0-9]{64}$/.test(value)))];
  const mergedExtractedLinks = normalizeExtractedLinks({
    extractedLinks: [
      ...(Array.isArray(existingMeta.extracted_links) ? existingMeta.extracted_links : []),
      ...(Array.isArray(item.extractedLinks) ? item.extractedLinks : []),
    ],
  });
  const mergedActionEvidence = [...new Map([
    ...(Array.isArray(existingMeta.action_evidence) ? existingMeta.action_evidence : []),
    ...(Array.isArray(item.actionEvidence) ? item.actionEvidence : []),
  ].filter(Boolean).map(evidence => [
    `${String(evidence.type || '')}:${String(evidence.value || '')}`,
    evidence,
  ])).values()].slice(0, 24);
  // F2 B7 (2026-07-06): se o usuário marcou o post como 'manual_edits_lock=true'
  // (via painel admin / direto no DB), NÃO sobrescreve campos manuais.
  // Whitelist de AI-only (sobrescreve sempre): last_update, enrichment_sources,
  //   merged_at, merge_reason, cadu_run_id, dead_link_check.
  // Whitelist de manual (preserva se locked): description, image_url,
  //   image_gallery, category, module, tags, title, link_as_cta.
  // Se ainda não tem lock mas a descrição manual está muito maior que a da IA,
  // também respeita (heurística).
  const manualLock = existingMeta.manual_edits_lock === true || existingMeta.manual_edits_lock === 'true';
  const manualDesc = existingMeta.manual_description === true || existingMeta.manual_description === 'true';
  const manualImage = existingMeta.manual_image === true || existingMeta.manual_image === 'true';

  const patch = {};
  // Fix S4 (2026-07-25): GUARD contra reativação indevida. Se o post tem
  // moderation_reason começando com "audit-" (sinal de hide MANUAL da
  // auditoria por problema de imagem, data, etc), NÃO reativar.
  // ANTES: mergeIntoExisting reativava QUALQUER post hidden quando havia
  // item novo. Resultado: posts escondidos manualmente pela auditoria
  // (com motivo) voltavam a published SEM checar o motivo.
  // Exemplo: d163e99c (PPGCA imagem placeholder) foi escondido em 25/07
  //   com moderation_reason='audit-2026-07-25-run-58267b6c: ...placeholder
  //   EDITAL...', mas o dedup inline do run e57ac3fe o reativou.
  // DEPOIS: se moderation_reason começa com "audit-", skip reativação.
  const modReason = (existing.moderation_reason || '').toString();
  const isAuditHide = modReason.startsWith('audit-');
  if (isAuditHide) {
    console.log(`   ⚠️ [S4] skip reativação: moderation_reason=audit-* (post escondido manualmente pela auditoria)`);
  }
  // Status: reativar se hidden ou closed (mas respeita guard de audit-)
  if (reactivateIfHidden && existing.status === 'hidden' && !isAuditHide) {
    patch.status = 'published';
  }
  // FIX 2026-07-15: reativar `closed` (auto-close por data passada) quando
  // há um item NOVO para o mesmo source. Caso contrário o item novo vira
  // `hidden` e o post closed fica inativo — UI mostra "encerrado" e nada
  // é publicado, mesmo com N publicáveis identificados pelo curador.
  // IMPORTANTE: o audit trail vai DIRETO no mergedMeta (não no patch)
  // porque _reactivated_from_closed_at não é coluna da tabela `posts`
  // — é uma chave dentro de metadata. Setar como campo top-level do
  // patch faz o Supabase retornar:
  //   "Could not find the '_reactivated_from_closed_at' column of 'posts'
  //   in the schema cache"
  // e o update INTEIRO falha (status: published não é aplicado).
  const reactivationTrail = {};
  if (reactivateIfClosed && existing.status === 'closed' && incomingExpiry) {
    patch.status = 'published';
    reactivationTrail._reactivated_from_closed_at = new Date().toISOString();
    reactivationTrail._reactivated_from_closed_by = 'cadu-publish-merge';
  }
  if (reactivateIfHidden && existing.status === 'hidden' && !isAuditHide) {
    patch.status = 'published';
    reactivationTrail._reactivated_from_hidden_at = new Date().toISOString();
    reactivationTrail._reactivated_from_hidden_by = 'cadu-publish-merge';
  }

  // Description: pegar a mais completa, MAS respeitar manual edits
  const newDesc = (item.description || item.formattedDescription || '').trim();
  const curDesc = (existing.description || '').trim();
  const descLenDelta = newDesc.length - curDesc.length;
  if (descLenDelta > 50 && !(manualLock || manualDesc)) {
    patch.description = newDesc;
  }

  // Image: respeitar manual edits
  if (item.image && !(manualLock || manualImage)) {
    patch.image_url = item.image;
  }

  // A confirmed newer release should refresh the user-facing fields as one
  // coherent unit. The canonical identity below remains immutable and manual
  // edits keep precedence.
  if (!manualLock) {
    const incomingTitle = String(item.formattedTitle || item.title || '').trim();
    if (incomingTitle && !publisherTitleIdentityConflict(existing.title, incomingTitle)) {
      patch.title = incomingTitle.slice(0, 120);
    }
    const allowedModules = new Set([
      'eventos', 'oportunidades', 'moradia', 'compra-venda',
      'caronas', 'achados-perdidos',
    ]);
    if (allowedModules.has(String(item.module || ''))) patch.module = item.module;
    if (String(item.category || '').trim()) patch.category = String(item.category).trim();
  }

  const currentExpiryMs = Date.parse(String(existing.expires_at || ''));
  const incomingExpiryMs = Date.parse(incomingExpiry);
  // A role-specific date is authoritative enough to repair an overlong
  // canonical expiry. Legacy futureDates may still extend a post, but never
  // shorten it because they can contain result, appeal or enrollment dates.
  const shouldShortenSemanticExpiry = Boolean(semanticDateFields)
    && Number.isFinite(currentExpiryMs)
    && incomingExpiryMs < currentExpiryMs;
  if (incomingExpiry && (
    !Number.isFinite(currentExpiryMs)
    || incomingExpiryMs > currentExpiryMs
    || shouldShortenSemanticExpiry
  )) {
    patch.expires_at = incomingExpiry;
  }

  const incomingMergedSource = {
    source_id: String(item.sourceId || '').trim(),
    source_url: String(item.sourceUrl || '').trim(),
    source_registry_id: String(item.sourceRegistryId || '').trim(),
    source_title: String(item.sourceTitle || item.title || '').trim(),
    merged_at: mergeTimestamp,
  };
  const mergedSourceHistory = [...new Map([
    ...(Array.isArray(existingMeta.merged_sources) ? existingMeta.merged_sources : []),
    incomingMergedSource,
  ].map(source => ({
    source_id: String(source?.source_id || source?.sourceId || '').trim(),
    source_url: String(source?.source_url || source?.sourceUrl || '').trim(),
    source_registry_id: String(source?.source_registry_id || source?.sourceRegistryId || '').trim(),
    source_title: String(source?.source_title || source?.sourceTitle || source?.title || '').trim(),
    merged_at: String(source?.merged_at || source?.mergedAt || mergeTimestamp),
  })).filter(source => source.source_id || source.source_url)
    .map(source => [source.source_id || source.source_url, source])).values()].slice(-24);

  // Metadata merge — AI-only fields (sempre sobrescreve, mesmo com lock)
  // Preserve any reactivation audit trail set above (closed→published, hidden→published)
  // so the diff persists across the metadata replacement.
  const incomingDates = item.dates && typeof item.dates === 'object'
    ? { ...item.dates }
    : {};
  if (semanticDateFields && item.module === 'eventos') {
    if (semanticDateFields.dateStart) incomingDates.eventStartsAt = semanticDateFields.dateStart;
    if (semanticDateFields.dateEnd) incomingDates.eventEndsAt = semanticDateFields.dateEnd;
  } else if (semanticDateFields && item.module === 'oportunidades') {
    incomingDates.applicationDeadline = semanticDateFields.deadlineDate;
  }
  const mergedMeta = {
    ...existingMeta,
    source_url: existingMeta.source_url || item.sourceUrl,
    source_title: existingMeta.source_title || existingMeta.original_title
      || existing.title || item.sourceTitle || item.title,
    ...(existingMeta.source_registry_id
      ? { source_registry_id: existingMeta.source_registry_id }
      : (item.sourceRegistryId ? { source_registry_id: item.sourceRegistryId } : {})),
    ...(mergedSourceHistory.length > 0 ? { merged_sources: mergedSourceHistory } : {}),
    ...(mergedActionFingerprints.length > 0
      ? { action_fingerprints: mergedActionFingerprints }
      : {}),
    ...(Object.keys(incomingDates).length > 0 ? { dates: incomingDates } : {}),
    ...(semanticDateFields ? {
      date_start: semanticDateFields.dateStart || null,
      date_end: semanticDateFields.dateEnd || null,
      deadline_date: semanticDateFields.deadlineDate || null,
    } : {}),
    ...(mergedExtractedLinks.length > 0 ? { extracted_links: mergedExtractedLinks } : {}),
    ...(mergedActionEvidence.length > 0 ? { action_evidence: mergedActionEvidence } : {}),
    ...(item.relevantLinks && Object.keys(item.relevantLinks).length > 0
      ? { relevant_links: item.relevantLinks }
      : {}),
    link: existingMeta.manual_link === true ? existingMeta.link : (item.link || existingMeta.link),
    sourceName: existingMeta.sourceName || item.sourceName,
    merged_at: mergeTimestamp,
    merge_reason: 'P2-OLDEST (2026-07-02): preservou o post canônico (SEMPRE o mais antigo, independente de interações, regra Yan) e mesclou formatação/imagem do item atual se melhor.' + (manualLock ? ' (manual_edits_lock respeitado)' : ''),
    ...reactivationTrail,
  };
  patch.metadata = mergedMeta;

  if (Object.keys(patch).length === 0) {
    return false;  // nada para atualizar
  }
  const { error } = await supabase.from('posts').update(patch).eq('id', postId);
  if (error) {
    console.warn(`   ⚠️ merge falhou para ${postId}: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  if (!ANON_KEY) {
    console.error('❌ CADU_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY ausente no ambiente');
    process.exit(1);
  }
  const email = process.env.CADU_KINO_EMAIL || process.env.CADU_EMAIL || env.CADU_KINO_EMAIL || env.CADU_EMAIL;
  const password = process.env.CADU_KINO_PASSWORD || process.env.CADU_PASSWORD || env.CADU_KINO_PASSWORD || env.CADU_PASSWORD;
  if (!email || !password) {
    console.error('❌ CADU_KINO_EMAIL/CADU_KINO_PASSWORD ausentes no ambiente');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !auth || !auth.session) {
    console.error('❌ Login do Cadu falhou:', authErr ? authErr.message : 'sem sessão');
    process.exit(1);
  }
  const token = auth.session.access_token;
  console.log(`🔑 Logado como ${auth.user.id}`);

  const reportFile = CUSTOM_FILE || pickLatestReport();
  if (!reportFile || !fs.existsSync(reportFile)) {
    console.error('❌ Relatório não encontrado em', BASE_DIR);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const candidates = (report.publishable || []).filter(p => p.score >= MIN_SCORE && !p.expired && !p.duplicate);
  console.log(`📄 ${reportFile}\n   Candidatos (score ≥ ${MIN_SCORE}): ${candidates.length}\n`);

  // ============================================================
  // RETRY COM BACKOFF — Resiliencia a 429/5xx do endpoint cadu-publish
  // 5 tentativas: 2s, 4s, 8s, 16s, 32s
  // ============================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_RETRIES = 5;
  const BASE_BACKOFF_MS = 2000;

  async function call(action, payload) {
    const body = JSON.stringify({ action, ...payload });
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body,
      });
      // 429 ou 5xx → retry com backoff
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(`   ⏳ ${action} HTTP ${resp.status} (tentativa ${attempt}/${MAX_RETRIES}) — aguardando ${Math.round(backoff/1000)}s...`);
          await sleep(backoff);
          continue;
        }
        // Ultima tentativa falhou
        let errBody;
        try { errBody = await resp.json(); } catch (_) { errBody = { ok: false, code: 'HTTP_' + resp.status, http: resp.status }; }
        return errBody;
      }
      // 2xx ou 4xx (nao-429) → processa direto
      try {
        return await resp.json();
      } catch (_) {
        return { ok: false, code: 'BAD_RESPONSE', http: resp.status };
      }
    }
    return { ok: false, code: 'MAX_RETRIES_EXCEEDED' };
  }

  let published = 0, dup = 0, pending = 0, errors = 0, merged = 0;
  const publishedRecords = [];
  const mergedRecords = [];
  const duplicateRecords = [];
  const pendingRecords = [];
  const errorRecords = [];
  for (const rec of candidates) {
    const item = recordToItem(rec);
    
    // HARDENING 2026-06-04: pular itens rejeitados pelo recordToItem (ex: sem formattedDescription)
    if (!item) {
      errors++;
      errorRecords.push({
        ...publishOutcomeIdentity(rec),
        title: rec.title || '',
        code: 'INVALID_ITEM',
      });
      continue;
    }

    // Dry-run guard: short-circuits ALL mutations (dedup, merge, publish) so
    // the contract test can prove no Supabase write path is reachable when
    // --dry-run is set. Keep this BEFORE findExistingPostsClient and before
    // the cadu-publish call. bcaa7da contract.
    if (DRY_RUN) {
      console.log(`📋 [DRY] ${item.module}/${item.category} — ${item.title.slice(0, 70)}`);
      // Still call dedup in dry-run for parity reports? No — that would
      // require a read-only Supabase session. The parser's explicit
      // --dry-run contract keeps this branch side-effect free.
      continue;
    }

// P1-MERGE (2026-06-12): ANTES de chamar cadu-publish, detecta duplicatas
    // e mescla no mais antigo (regra do Yan). Cobre sourceUrl, sourceId, link, e título similar.
    //
    // P2-OLDEST (2026-07-02): Yan confirmou preferência SEMPRE pelo mais antigo
    // (created_at ASC) - "as pessoas podem ter visto e compartilhado a mais antiga,
    // eu não quero que na hora que vai ver não tenha mais na plataforma".
    // Tiebreaker mantido: mais interações (em caso de empate de timestamp).
    if (!DRY_RUN) {
      let dedupFailure = null;
      const existingList = await findExistingPostsClient(supabase, item).catch((error) => {
        dedupFailure = error;
        return null;
      });
      if (dedupFailure || !existingList) {
        const stage = dedupFailure && dedupFailure.stage ? dedupFailure.stage : 'unknown';
        const message = dedupFailure && dedupFailure.message
          ? dedupFailure.message
          : 'consulta de deduplicacao sem resultado confiavel';
        console.error(`   bloqueado por falha de deduplicacao (${stage}): ${message}`);
        errors++;
        errorRecords.push({
          ...publishOutcomeIdentity(rec, item),
          title: item.title,
          code: 'DEDUP_QUERY_FAILED',
          stage,
          message,
        });
        continue;
      }
      if (existingList.length > 0) {
        const winner = existingList.sort((a, b) => {
          // Critério primário: created_at ASC (mais antigo primeiro)
          const tsA = new Date(a.created_at || 0).getTime();
          const tsB = new Date(b.created_at || 0).getTime();
          if (tsA !== tsB) return tsA - tsB;
          // Tiebreaker: mais interações (se houver posts criados no mesmo segundo)
          const intA = (a.view_count || 0) + (a.share_count || 0) + (a.coupon_clicks || 0);
          const intB = (b.view_count || 0) + (b.share_count || 0) + (b.coupon_clicks || 0);
          return intB - intA;
        })[0];
        console.log(`🔁 [merge] ${item.title.slice(0, 50)} → canônico ${winner.id.slice(0, 8)} (${winner.status}, V:${winner.view_count}, oldest)`);
        const mergeApplied = await mergeIntoExisting(supabase, winner.id, item);
        if (!mergeApplied) {
          console.error(`   bloqueado: merge no canônico ${winner.id.slice(0, 8)} falhou`);
          errors++;
          errorRecords.push({
            ...publishOutcomeIdentity(rec, item),
            title: item.title,
            code: 'MERGE_FAILED',
            postId: winner.id,
          });
          continue;
        }
        const cleanupFailedPostIds = [];
        for (const other of existingList) {
          if (other.id !== winner.id && other.status !== 'hidden') {
            const { error: hideError } = await supabase.from('posts').update({ status: 'hidden' }).eq('id', other.id);
            if (hideError) {
              console.warn(`   ⚠️ não ocultou ${other.id.slice(0, 8)}: ${hideError.message}`);
              cleanupFailedPostIds.push(other.id);
            } else {
              console.log(`   🙈 escondeu ${other.id.slice(0, 8)} (mais novo)`);
            }
          }
        }
        if (cleanupFailedPostIds.length > 0) {
          errors++;
          errorRecords.push({
            ...publishOutcomeIdentity(rec, item),
            title: item.title,
            code: 'MERGE_CLEANUP_FAILED',
            postId: winner.id,
            failedPostIds: cleanupFailedPostIds.slice(0, 24),
          });
          console.error('   merge aplicado, mas a limpeza ficou incompleta; item será repetido com segurança');
          continue;
        }
        console.log(`   ✓ merge aplicado (preservou o mais antigo)`);
        merged++;
        mergedRecords.push({
          ...publishOutcomeIdentity(rec, item),
          postId: winner.id,
          title: item.title,
          status: winner.status,
          source: 'client_dedup_oldest',
        });
        continue;
      }
    }
    
    const res = await call('publish', { item, options: { dryRun: DRY_RUN, runId: report.timestamp || '' } });

    if (DRY_RUN) {
      console.log(`📋 [DRY] ${item.module}/${item.category} — ${item.title.slice(0, 70)}`);
      if (!res.ok) console.log(`   ⚠️ ${res.code}: ${res.message || ''}`);
      continue;
    }
    if (res.ok && res.code === 'PUBLISHED') {
      console.log(`✅ ${item.title.slice(0, 70)} → ${res.url} (img:${res.media && res.media.uploaded})`);
      published++;
      publishedRecords.push({
        ...publishOutcomeIdentity(rec, item),
        postId: res.post_id || '',
        title: item.title,
        postUrl: res.url || '',
        imageUrl: res.image_url || (res.media && res.media.cover_url) || '',
      });
      // P0-B (2026-06-12): valida tamanho da imagem armazenada.
      // Se a capa ficou < 30KB, é provavelmente thumbnail — marca para revisão.
      const storedUrl = (res.image_url || (res.media && res.media.cover_url) || '').trim();
      if (storedUrl && storedUrl.includes('supabase.co/storage/')) {
        validateImageUrl(storedUrl, { minBytes: 30000, timeoutMs: 12000 })
          .then(v => {
            if (!v.ok) {
              console.warn(`   ⚠️ imagem armazenada suspeita: ${v.error || 'desconhecido'} (${v.bytes || 0}B) — ${storedUrl.slice(-60)}`);
            } else {
              console.log(`   📐 imagem: ${v.bytes}B ${v.contentType}`);
            }
          })
          .catch(() => { /* best-effort */ });
      }
    } else if (res.code === 'DUPLICATE') {
      // P1-merge (2026-06-12): Se cadu-publish detectou duplicata, mescla no existente
      if (res.post_id) {
        const mergeApplied = await mergeIntoExisting(supabase, res.post_id, item, { reactivateIfHidden: true });
        if (!mergeApplied) {
          console.error(`   merge-cadu falhou para ${res.post_id.slice(0, 8)}`);
          errors++;
          errorRecords.push({
            ...publishOutcomeIdentity(rec, item),
            title: item.title,
            code: 'MERGE_FAILED',
            postId: res.post_id,
          });
          continue;
        }
        console.log(`🔁 [merge-cadu] ${item.title.slice(0, 50)} → ${res.post_id.slice(0, 8)} (era ${res.status})`);
        merged++;
        mergedRecords.push({
          ...publishOutcomeIdentity(rec, item),
          postId: res.post_id,
          title: item.title,
          status: res.status || '',
          source: 'cadu_publish',
        });
      } else {
        console.log(`⏭️ já existe: ${item.title.slice(0, 60)}`);
        dup++;
        duplicateRecords.push({
          ...publishOutcomeIdentity(rec, item),
          title: item.title,
        });
      }
    } else if (res.code === 'PENDING') {
      console.log(`🕓 pendente: ${item.title.slice(0, 60)} (${res.pending_reason || ''})`);
      pending++;
      pendingRecords.push({
        ...publishOutcomeIdentity(rec, item),
        postId: res.post_id || '',
        title: item.title,
        reason: res.pending_reason || '',
      });
    } else if (res.code === 'QUALITY_BLOCKED') {
      console.log(`🚫 bloqueado qualidade: ${item.title.slice(0, 60)} — ${res.message || ''}`);
      errors++;
      errorRecords.push({
        ...publishOutcomeIdentity(rec, item),
        title: item.title,
        code: res.code,
        message: res.message || '',
        quality: res.quality || null,
      });
    } else {
      console.log(`❌ ${item.title.slice(0, 50)}: ${res.code} ${res.message || ''}`);
      errors++;
      errorRecords.push({
        ...publishOutcomeIdentity(rec, item),
        title: item.title,
        code: res.code || 'UNKNOWN',
        message: res.message || '',
      });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n📊 Publicados: ${published} | Merged: ${merged} | Duplicados: ${dup} | Pendentes: ${pending} | Erros: ${errors}`);
  if (DRY_RUN) console.log('⚠️ DRY-RUN — nada foi publicado de fato.');
  console.log('__CADU_PUBLISH_JSON__' + JSON.stringify({
    published,
    merged,
    duplicated: dup,
    pending,
    errors,
    dryRun: DRY_RUN,
    items: {
      published: publishedRecords,
      merged: mergedRecords,
      duplicated: duplicateRecords,
      pending: pendingRecords,
      errors: errorRecords,
    },
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('💥', e.message); process.exit(1); });
}

module.exports = {
  canonicalUrl,
  DEDUP_RECENT_PAGE_SIZE,
  DedupQueryError,
  fetchPaginatedDedupRows,
  fetchRecentPostsForCanonicalDedup,
  findExistingPostsClient,
  mergeIntoExisting,
  actionFingerprintConfirmsCandidate,
  hasItemLevelUrlIdentity,
  parsePublisherArgs,
  publicationDateFields,
  publishOutcomeIdentity,
  publisherSourceIdentityConflict,
  relevantExpiryFromItem,
  recordToItem,
  publisherTitleIdentityConflict,
  runDedupQuery,
  runDedupSelect,
  titlesMatch,
};
