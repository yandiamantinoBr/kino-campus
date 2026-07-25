#!/usr/bin/env node
/**
 * pipeline-kino.js — Pipeline Completo Kino Campus
 * 
 * Integra: curador v4.4 → formatador IA → publish_auto_v5 → endpoint
 * 
 * Fluxo completo automatizado:
 *   1. Scan sites UFG (curador v4.4, modo daily)
 *   2. Scan Instagram via browser CDP (se --ig)
 *   3. Classificação + dedup
 *   4. Formatação IA de descrições (itens publish)
 *   5. Publicação via endpoint cadu-publish (se --publish)
 * 
 * Uso (todo estágio deve ser explícito):
 *   node scripts/pipeline-kino.js --stage=curator
 *   node scripts/pipeline-kino.js --stage=format
 *   node scripts/pipeline-kino.js --stage=publish --dry-run
 *   node scripts/pipeline-kino.js --stage=all --dry-run
 *   node scripts/pipeline-kino.js --stage=all --full  → curadoria full + pipeline completa
 */

'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonAtomic } = require('./lib/atomic-json-file.js');
const { resolveWorkspacePath } = require('./lib/safe-directory.js');
const { resolveActionLabel } = require('./lib/curator-action-policy.js');
const { URL_IDENTITY_VERSION, canonicalUrl } = require('./lib/canonical-url.js');
const { instagramPermalinkKey } = require('./lib/instagram-url.js');
const { selectEnrichmentSourceUrl } = require('./lib/enrichment-source-selector.js');
const { fetchWithRetry, pageGotoWithRetry } = require('./lib/network-fetch.js');
const {
  getActiveInstagramHandles,
  instagramShortcode,
  resolveInstagramSeenRetentionDays,
  resolveInstagramSupervisorTimeout,
  validateInstagramArtifact,
} = require('./scan-ig-browser.js');
const {
  commitAcknowledgedInstagramSeen,
  validateInstagramSeenCheckpoint,
} = require('./lib/instagram-seen-outbox.js');
const https = require('https');

// ============================================================
// CONFIG
// ============================================================

const BASE_DIR = path.resolve(process.env.CADU_PIPELINE_BASE_DIR || '/data/.openclaw/workspace');
const SCRIPTS_DIR = resolveWorkspacePath(
  BASE_DIR,
  process.env.CADU_PIPELINE_SCRIPTS_DIR,
  'scripts',
);
const CANONICAL_DATA_DIR = resolveWorkspacePath(
  BASE_DIR,
  process.env.CADU_PIPELINE_DATA_DIR,
  'data/ufg-scrape',
);
const CANONICAL_IG_DATA_DIR = resolveWorkspacePath(
  BASE_DIR,
  process.env.CADU_PIPELINE_IG_DATA_DIR,
  'data/ufg-instagram',
);
let DATA_DIR = CANONICAL_DATA_DIR;
let IG_DATA_DIR = CANONICAL_IG_DATA_DIR;
let PIPELINE_CHILD_ENV = null;
const PIPELINE_TIME_ZONE = 'America/Sao_Paulo';

function isoDateInTimeZone(date = new Date(), timeZone = PIPELINE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const TIMESTAMP = isoDateInTimeZone();
const START_TIME = Date.now();
const SUPABASE_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co';

// ============================================================
// FLAGS v4.4 — Estágios para evitar OOM (2026-06-08)
// ============================================================
// --stage=ig              → só scan Instagram
// --stage=curator         → só curador UFG sites
// --stage=duplicates      → só enriquecimento de duplicatas
// --stage=enrich-instagram → cache imagens IG (Fix A) + source oficial (Fix B)
// --stage=format          → só formatação IA (após curador já ter rodado)
// --stage=publish         → só publicação (após format ter rodado)
// --stage=enrich          → só enriquecimento de imagens
// --stage=all             → tudo de uma vez (legado, alto consumo RAM)
//
// Cada estágio libera memória ao terminar (process.exit após conclusao).
// Recomendado: 4 crons separados (curator 8h, enrich-instagram 8:20,
// format 8:30, publish 9h).
// ============================================================
const COMPLETE_PIPELINE_STAGES = [
  'ig',
  'curator',
  'duplicates',
  'enrich-instagram',
  'format',
  'publish',
  'enrich',
];

function parsePipelineArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new TypeError('argumentos da pipeline devem ser strings');
  }
  if (argv.length === 0) {
    throw new Error('nenhum estágio informado; use --stage=<id> explicitamente');
  }

  const stageFlags = [];
  let dryRun = false;
  let fullMode = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      if (dryRun) throw new Error('argumento duplicado: --dry-run');
      dryRun = true;
      continue;
    }
    if (arg === '--full') {
      if (fullMode) throw new Error('argumento duplicado: --full');
      fullMode = true;
      continue;
    }
    if (arg.startsWith('--stage=')) {
      const stage = arg.slice('--stage='.length);
      if (!stage) throw new Error('estágio vazio');
      if (stage !== 'all' && !COMPLETE_PIPELINE_STAGES.includes(stage)) {
        throw new Error(`estágio desconhecido: ${stage}`);
      }
      if (stageFlags.includes(stage)) throw new Error(`estágio duplicado: ${stage}`);
      stageFlags.push(stage);
      continue;
    }
    throw new Error(`argumento desconhecido: ${arg}`);
  }
  if (stageFlags.length === 0) {
    throw new Error('nenhum estágio informado; flags de modo não executam a pipeline');
  }
  if (stageFlags.includes('all') && stageFlags.length !== 1) {
    throw new Error('--stage=all não pode ser combinado com outros estágios');
  }
  const stages = stageFlags[0] === 'all' ? [...COMPLETE_PIPELINE_STAGES] : stageFlags;
  if (fullMode && !stages.includes('curator')) {
    throw new Error('--full exige o estágio curator');
  }
  return { stages, dryRun, fullMode, explicitAll: stageFlags[0] === 'all' };
}

// Importar este módulo para testar os validadores não deve iniciar estágios.
// A execução CLI, por outro lado, sempre passa pelo parser estrito acima.
const CLI_OPTIONS = require.main === module
  ? parsePipelineArgs(process.argv.slice(2))
  : { stages: [], dryRun: false, fullMode: false, explicitAll: false };
const ACTIVE_STAGES = CLI_OPTIONS.stages;
const WITH_IG = ACTIVE_STAGES.includes('ig');
const WITH_CURATOR = ACTIVE_STAGES.includes('curator');
const WITH_DUPLICATES = ACTIVE_STAGES.includes('duplicates');
const WITH_ENRICH_IG = ACTIVE_STAGES.includes('enrich-instagram');
const WITH_FORMAT = ACTIVE_STAGES.includes('format');
const WITH_PUBLISH = ACTIVE_STAGES.includes('publish');
const WITH_ENRICH = ACTIVE_STAGES.includes('enrich');
const ENRICH_IS_ISOLATED_STAGE = ACTIVE_STAGES.length === 1 && ACTIVE_STAGES[0] === 'enrich';
const DRY_RUN = CLI_OPTIONS.dryRun;
const FULL_MODE = CLI_OPTIONS.fullMode;
const ENRICH_STEP_REQUIRED = false;

function buildInstagramScanArgs({ dryRun = DRY_RUN, fullMode = FULL_MODE } = {}) {
  if (!dryRun) return [];
  return [...(fullMode ? [] : ['--skip-enrich']), '--dry-run'];
}

function resolvePipelineInstagramSupervisorTimeout({
  dryRun = DRY_RUN,
  fullMode = FULL_MODE,
  env = process.env,
  profileCount = getActiveInstagramHandles().length,
} = {}) {
  return resolveInstagramSupervisorTimeout({
    profileCount,
    skipEnrich: dryRun && !fullMode,
    includeDiscovery: !dryRun,
    env,
  });
}

function resolvePipelineCuratorTimeout({
  fullMode = FULL_MODE,
  multiStage = ACTIVE_STAGES.filter(stage => stage !== 'curator').length > 0,
  env = process.env,
} = {}) {
  const configured = Number(env.CADU_CURATOR_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 60_000 && configured <= 3_600_000) {
    return Math.floor(configured);
  }
  if (fullMode) return 2_400_000; // 40m, leaving 5m over the full source budget
  return multiStage ? 1_500_000 : 1_200_000; // 25m / 20m daily
}

function buildIsolatedEnrichArgs({ dryRun = DRY_RUN, count = 10 } = {}) {
  const boundedCount = Number.isInteger(count) && count >= 1 && count <= 100 ? count : 10;
  return [...(dryRun ? ['--dry-run'] : []), '--from-recent', String(boundedCount)];
}

function summarizeEnrichResults(results) {
  const outcomes = Array.isArray(results) ? results : [];
  return {
    total: outcomes.length,
    errors: outcomes.filter(result => result && result.error).length,
    enriched: outcomes.filter(result => Number(result?.added) > 0).length,
  };
}

function attachEnrichmentContext(outcomes, sourceItems) {
  const contexts = new Map();
  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    const identity = itemIdentity(item);
    if (!identity) continue;
    contexts.set(identity, {
      sourceId: item.sourceId || '',
      sourceUrl: item.sourceUrl || item.url || '',
      canonicalSourceUrl: item.canonicalSourceUrl || item.url || item.sourceUrl || '',
      sourcePageUrl: item.url || '',
      enrichmentSources: Array.isArray(item.enrichmentSources) ? item.enrichmentSources : [],
    });
  }

  return (Array.isArray(outcomes) ? outcomes : []).map((outcome) => {
    const context = contexts.get(itemIdentity(outcome));
    return context ? { ...outcome, ...context } : outcome;
  });
}

function buildEnrichItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && item.postId && item.sourceUrl)
    .map((item) => ({
      postId: item.postId,
      title: item.title,
      sourceUrl: selectEnrichmentSourceUrl({
        preferredUrls: [item.sourcePageUrl, item.canonicalSourceUrl],
        enrichmentSources: item.enrichmentSources,
        fallbackUrls: [item.sourceUrl],
      }),
    }))
    .filter(item => item.sourceUrl);
}

function buildPublisherItem(item) {
  // `item.url` is the article/event page and therefore the durable identity.
  // `item.sourceUrl` may intentionally be an application form discovered by
  // the curator. Keep that URL as the CTA, never as the publication identity.
  const canonicalSourceUrl = item.url || item.sourceUrl || item.link || '';
  const actionUrl = item.link || item.sourceUrl || canonicalSourceUrl;
  const enrichmentSources = [
    { url: canonicalSourceUrl, label: 'Fonte oficial', type: 'official' },
    ...(Array.isArray(item.enrichmentSources) ? item.enrichmentSources : []),
  ].filter(source => source && /^https?:\/\//i.test(String(source.url || '')))
    .filter((source, index, sources) => (
      sources.findIndex(candidate => String(candidate.url) === String(source.url)) === index
    ));
  return {
    module: item.module,
    category: item.category,
    title: item.title,
    formattedTitle: item.formattedTitle || '',
    sourceTitle: item.sourceTitle || item.title || '',
    description: item.formattedDescription || item.description || item.text || '',
    formattedDescription: item.formattedDescription || '',
    text: item.text || item.description || '',
    url: canonicalSourceUrl,
    image: item.image || '',
    images: Array.isArray(item.images)
      ? item.images
      : [item.image, item.imageUrl, item.image_url, item.cover].filter(Boolean),
    sourceId: item.sourceId || `${item.site || 'ufg'}:${canonicalSourceUrl}`,
    sourceRegistryId: item.sourceRegistryId || '',
    actionFingerprints: Array.isArray(item.actionFingerprints) ? item.actionFingerprints : [],
    sourceUrl: canonicalSourceUrl,
    sourceName: item.sourceName || item.site || 'UFG',
    enrichmentSources,
    link: actionUrl,
    linkAsCta: item.linkAsCta !== false,
    actionLabel: resolveActionLabel(item, item.formattedDescription || item.description || item.text || ''),
    actionKey: item.actionKey || '',
    contato: item.contato || '',
    score: item.score,
    dates: item.dates || {},
    relevantLinks: item.relevantLinks || {},
    actionEvidence: Array.isArray(item.actionEvidence) ? item.actionEvidence : [],
    pdfLinks: item.pdfLinks || item.pdfs || [],
    tags: item.tags || [],
    area: item.area || '',
    location: item.location || item.place || '',
    gratuito: item.module === 'eventos' ? true : undefined,
  };
}

function parseEnrichOutput(stdout) {
  const output = String(stdout || '').trim();
  if (!output) return { ok: false, reason: 'missing_output', results: [] };

  // enrich-images imprime logs antes do array JSON. Procure, de trás para
  // frente, o primeiro sufixo que seja de fato um array; isso também aceita
  // `[]` e não confunde colchetes presentes nos logs com um resultado válido.
  for (let index = output.lastIndexOf('['); index >= 0; index = output.lastIndexOf('[', index - 1)) {
    try {
      const parsed = JSON.parse(output.slice(index));
      if (Array.isArray(parsed)
          && parsed.every(result => result && typeof result === 'object' && !Array.isArray(result))) {
        return { ok: true, reason: null, results: parsed };
      }
    } catch (_) { /* continue procurando um array anterior */ }
  }

  return { ok: false, reason: 'missing_output', results: [] };
}

function selectDuplicateEnrichmentCandidates(discarded) {
  return (Array.isArray(discarded) ? discarded : [])
    .filter(item => item && (item.duplicate || item.update));
}

function duplicateWorkIdentity(item) {
  const material = String(
    item?.sourceId
    || item?.sourceUrl
    || item?.url
    || item?.link
    || `${item?.site || ''}|${item?.title || ''}|${item?.updateType || ''}`,
  ).trim();
  return crypto.createHash('sha256').update(material).digest('hex');
}

function selectRotatingDuplicateBatch(items, limit, lastIdentity = '') {
  const unique = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const identity = duplicateWorkIdentity(item);
    if (!unique.has(identity)) unique.set(identity, item);
  }
  const ordered = [...unique.entries()].sort(([left], [right]) => left.localeCompare(right));
  if (ordered.length === 0) {
    return { batch: [], total: 0, nextCursor: null, startIndex: 0 };
  }
  const boundedLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, ordered.length)
    : ordered.length;
  let startIndex = 0;
  if (lastIdentity) {
    const exact = ordered.findIndex(([identity]) => identity === lastIdentity);
    if (exact >= 0) startIndex = (exact + 1) % ordered.length;
    else {
      const successor = ordered.findIndex(([identity]) => identity > lastIdentity);
      startIndex = successor >= 0 ? successor : 0;
    }
  }
  const selected = Array.from({ length: boundedLimit }, (_, offset) => (
    ordered[(startIndex + offset) % ordered.length]
  ));
  return {
    batch: selected.map(([, item]) => item),
    total: ordered.length,
    nextCursor: selected.at(-1)?.[0] || null,
    startIndex,
  };
}

function buildDuplicateCursorState(rotation, { ok, updatedAt = new Date().toISOString() } = {}) {
  if (!rotation?.nextCursor) return null;
  return {
    schemaVersion: 1,
    lastIdentity: rotation.nextCursor,
    lastAttemptStatus: ok === true ? 'success' : 'failed',
    updatedAt,
  };
}

function resolveFullCuratorReport(trulyNewArtifact, { directories = [] } = {}) {
  const contract = trulyNewArtifact?.artifactContract;
  const sourceArtifact = String(contract?.sourceArtifact || '');
  const sourceHash = String(contract?.sourceContentSha256 || '');
  const issues = [];
  if (!sourceArtifact || path.basename(sourceArtifact) !== sourceArtifact) {
    issues.push('source_artifact_path_invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) issues.push('source_artifact_hash_invalid');
  if (issues.length > 0) return { ok: false, file: null, report: null, issues };

  for (const directory of directories) {
    const root = path.resolve(directory);
    const candidate = path.resolve(root, sourceArtifact);
    if (path.dirname(candidate) !== root || !fs.existsSync(candidate)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const reportContract = report?.artifactContract;
      const hash = sha256Json(artifactPayloadWithoutContract(report));
      const reportIssues = [];
      if (reportContract?.kind !== 'curator-report') reportIssues.push('source_artifact_kind_mismatch');
      if (reportContract?.contentSha256 !== sourceHash) reportIssues.push('source_artifact_contract_hash_mismatch');
      if (hash !== sourceHash) reportIssues.push('source_artifact_content_hash_mismatch');
      if (reportIssues.length === 0) {
        return { ok: true, file: candidate, report, issues: [] };
      }
      issues.push(...reportIssues);
    } catch (_) {
      issues.push('source_artifact_unreadable');
    }
  }
  if (issues.length === 0) issues.push('source_artifact_not_found');
  return { ok: false, file: null, report: null, issues: [...new Set(issues)] };
}

function reducedDiscardedMetadata(report, sample) {
  const source = report && typeof report === 'object' && !Array.isArray(report) ? report : {};
  const discarded = Array.isArray(source.discarded) ? source.discarded : [];
  const reducedSample = Array.isArray(sample) ? sample : [];
  const totalCandidates = [
    source.discardedTotal,
    source.stats?.discarded,
    discarded.length,
    reducedSample.length,
  ].filter(value => Number.isInteger(value) && value >= 0);
  const discardedTotal = Math.max(0, ...totalCandidates);
  const discardedSampleCount = reducedSample.length;
  return {
    discardedTotal,
    discardedSampleCount,
    discardedTruncated: source.discardedTruncated === true || discardedTotal > discardedSampleCount,
  };
}

function withReducedDiscarded(report, sample) {
  const metadata = reducedDiscardedMetadata(report, sample);
  return {
    ...report,
    stats: {
      ...(report?.stats || {}),
      // `discarded` representa o universo completo, nunca o tamanho da amostra.
      discarded: metadata.discardedTotal,
    },
    ...metadata,
    discarded: Array.isArray(sample) ? sample : [],
  };
}
const PIPELINE_RUN_ID = String(process.env.CADU_PIPELINE_RUN_ID || crypto.randomUUID());
PIPELINE_CHILD_ENV = {
  ...process.env,
  CADU_PIPELINE_RUN_ID: PIPELINE_RUN_ID,
  CADU_PIPELINE_DATE_BRT: TIMESTAMP,
  CADU_PIPELINE_STARTED_AT: new Date(START_TIME).toISOString(),
};
// Todo dry-run usa um workspace efêmero. Embora os children bloqueiem efeitos
// externos, os estágios desacoplados também produzem artefatos determinísticos
// locais; isolá-los evita que uma simulação substitua a cadeia canônica.
const ZERO_WRITE_DRY_RUN = DRY_RUN;

// ── Load env vars from .env.local (same logic as publish_auto_v5.js) ──
(function loadEnvFiles() {
  const files = [
    path.join(BASE_DIR, '.env.local'),
    path.join(BASE_DIR, 'kino-campus/services/cadu-ufg-publisher/.env.local'),
  ];
  files.forEach(filePath => {
    try {
      if (!fs.existsSync(filePath)) return;
      fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      });
    } catch (_) {}
  });
})();

// ============================================================
// HELPERS
// ============================================================

function log(icon, msg) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${icon} ${msg}`);
}

const STEP_MARKER = '__CADU_STEP_JSON__';
const OUTCOME_MARKER = '__CADU_PIPELINE_OUTCOME__';
const PUBLISH_MARKER = '__CADU_PUBLISH_JSON__';
const FUNNEL_MARKER = '__CADU_PIPELINE_FUNNEL__';
const FORMATTED_ARTIFACT_SCHEMA_VERSION = 1;
const FORMATTED_ARTIFACT_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const DEFAULT_STDOUT_CAPTURE_BYTES = 8 * 1024 * 1024;
const DEFAULT_STDERR_CAPTURE_BYTES = 2 * 1024 * 1024;
const CANONICAL_RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pipelineSteps = [];
let pipelineOutcomeEmitted = false;
let pipelineFunnelEmitted = false;
let pipelineFunnelReport = {};
let pipelineFunnelState = {};
let instagramSeenCheckpoint = null;
let instagramSeenCheckpointSettled = false;
let instagramSeenSettlement = null;
const terminalInstagramSeenKeys = new Set();

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonNegativeCount(value, fallback = null) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function buildPipelineFunnel(report = {}, state = {}) {
  const stats = report && typeof report.stats === 'object' && report.stats !== null
    ? report.stats
    : {};
  const created = nonNegativeCount(state.created);
  const merged = nonNegativeCount(state.merged);
  const pending = nonNegativeCount(state.pending);
  // PENDING is a row persisted for moderation; it is not publicly visible yet,
  // but it is still a successful database mutation in the funnel.
  const persisted = [created, merged, pending].every(Number.isInteger)
    ? created + merged + pending
    : null;

  return {
    schemaVersion: 1,
    runId: CANONICAL_RUN_ID_PATTERN.test(String(state.runId || PIPELINE_RUN_ID || '').toLowerCase())
      ? String(state.runId || PIPELINE_RUN_ID).toLowerCase()
      : null,
    dryRun: state.dryRun === undefined ? DRY_RUN : state.dryRun === true,
    configuredSources: nonNegativeCount(stats.configuredSourcesConsidered),
    collectionAttempted: nonNegativeCount(
      stats.collectionAttempted,
      nonNegativeCount(stats.totalSites),
    ),
    collectedItems: nonNegativeCount(stats.totalItems),
    instagramProfilesExpected: nonNegativeCount(
      state.instagramProfilesExpected,
      nonNegativeCount(stats.instagramProfilesExpected),
    ),
    instagramProfilesSuccessful: nonNegativeCount(
      state.instagramProfilesSuccessful,
      nonNegativeCount(stats.instagramProfilesSuccessful),
    ),
    instagramProfilesFailed: nonNegativeCount(
      state.instagramProfilesFailed,
      nonNegativeCount(stats.instagramProfilesFailed),
    ),
    instagramPostOccurrences: nonNegativeCount(
      state.instagramPostOccurrences,
      nonNegativeCount(stats.instagramPostOccurrences),
    ),
    instagramUniquePosts: nonNegativeCount(
      state.instagramUniquePosts,
      nonNegativeCount(stats.instagramUniquePosts),
    ),
    instagramDuplicatePostOccurrences: nonNegativeCount(
      state.instagramDuplicatePostOccurrences,
      nonNegativeCount(stats.instagramDuplicatePostOccurrences),
    ),
    instagramRelevantOccurrences: nonNegativeCount(
      state.instagramRelevantOccurrences,
      nonNegativeCount(stats.instagramRelevantOccurrences),
    ),
    instagramUniqueRelevant: nonNegativeCount(
      state.instagramUniqueRelevant,
      nonNegativeCount(stats.instagramUniqueRelevant),
    ),
    instagramDetailEligible: nonNegativeCount(
      state.instagramDetailEligible,
      nonNegativeCount(stats.instagramDetailEligible),
    ),
    instagramDetailRequested: nonNegativeCount(
      state.instagramDetailRequested,
      nonNegativeCount(stats.instagramDetailRequested),
    ),
    instagramDetailReady: nonNegativeCount(
      state.instagramDetailReady,
      Number.isInteger(stats.instagramDetailSucceeded)
        && Number.isInteger(stats.instagramDetailCompletedFromCache)
        ? stats.instagramDetailSucceeded + stats.instagramDetailCompletedFromCache
        : null,
    ),
    instagramDetailSucceeded: nonNegativeCount(
      state.instagramDetailSucceeded,
      nonNegativeCount(stats.instagramDetailSucceeded),
    ),
    instagramDetailCompletedFromCache: nonNegativeCount(
      state.instagramDetailCompletedFromCache,
      nonNegativeCount(stats.instagramDetailCompletedFromCache),
    ),
    instagramDetailPartial: nonNegativeCount(
      state.instagramDetailPartial,
      nonNegativeCount(stats.instagramDetailPartial),
    ),
    instagramDetailFailed: nonNegativeCount(
      state.instagramDetailFailed,
      nonNegativeCount(stats.instagramDetailFailed),
    ),
    instagramDetailDeferred: nonNegativeCount(
      state.instagramDetailDeferred,
      nonNegativeCount(stats.instagramDetailDeferred),
    ),
    instagramDetailDeferredByBackoff: nonNegativeCount(
      state.instagramDetailDeferredByBackoff,
      nonNegativeCount(stats.instagramDetailDeferredByBackoff),
    ),
    curatorCandidates: nonNegativeCount(
      state.curatorCandidates,
      nonNegativeCount(stats.curatorCandidates),
    ),
    curatorReview: nonNegativeCount(stats.reviewable),
    curatorDiscarded: nonNegativeCount(stats.discarded),
    alreadyPersisted: nonNegativeCount(
      state.alreadyPersisted,
      nonNegativeCount(stats.alreadyPersisted),
    ),
    trulyNew: nonNegativeCount(
      state.trulyNew,
      nonNegativeCount(stats.trulyNew, nonNegativeCount(stats.publishable)),
    ),
    qualityReview: nonNegativeCount(state.qualityReview),
    publishEvaluated: nonNegativeCount(state.publishEvaluated),
    created,
    merged,
    pending,
    persisted,
  };
}

function updatePipelineFunnelContext(report, state = {}) {
  if (report && typeof report === 'object' && !Array.isArray(report)) {
    pipelineFunnelReport = report;
  }
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    pipelineFunnelState = { ...pipelineFunnelState, ...state };
  }
  return buildPipelineFunnel(pipelineFunnelReport, pipelineFunnelState);
}

function emitPipelineFunnel(report, state) {
  const funnel = updatePipelineFunnelContext(report, state);
  if (!pipelineFunnelEmitted) {
    pipelineFunnelEmitted = true;
    console.log(`${FUNNEL_MARKER}${JSON.stringify(funnel)}`);
  }
  return funnel;
}

function artifactPayloadWithoutContract(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return artifact;
  const copy = { ...artifact };
  delete copy.artifactContract;
  return copy;
}

function curatorLineageFilename(contract) {
  const mode = String(contract?.mode || '');
  const dateBrt = String(contract?.dateBrt || '');
  const runId = String(contract?.runId || '').toLowerCase();
  if (!['daily', 'full', 'quick'].includes(mode)) {
    throw new Error('modo inválido para snapshot imutável do Curador');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateBrt)) {
    throw new Error('data BRT inválida para snapshot imutável do Curador');
  }
  if (!CANONICAL_RUN_ID_PATTERN.test(runId)) {
    throw new Error('runId inválido para snapshot imutável do Curador');
  }
  return `curadoria-v4.4-${mode}-${dateBrt}--${runId}.json`;
}

function persistImmutableCuratorReport(directory, report) {
  const target = path.join(directory, curatorLineageFilename(report?.artifactContract));
  const expectedBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`colisão insegura no snapshot do Curador: ${path.basename(target)}`);
    }
    const existingBytes = fs.readFileSync(target);
    if (!existingBytes.equals(expectedBytes)) {
      throw new Error(`colisão de conteúdo no snapshot do Curador: ${path.basename(target)}`);
    }
    return target;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return writeJsonAtomic(target, report, { newline: true });
}

function validateRunArtifact(artifact, {
  kind,
  runId = PIPELINE_RUN_ID,
  version,
  mode,
  dateBrt = TIMESTAMP,
  startedAtMs = START_TIME,
  requireNonEmpty = false,
} = {}) {
  const issues = [];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { ok: false, issues: ['artifact_not_object'] };
  }
  const contract = artifact.artifactContract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return { ok: false, issues: ['artifact_contract_missing'] };
  }
  if (contract.schemaVersion !== 1) issues.push('artifact_schema_unsupported');
  if (contract.kind !== kind) issues.push('artifact_kind_mismatch');
  if (contract.runId !== runId) issues.push('artifact_run_id_mismatch');
  if (version !== undefined && contract.version !== version) issues.push('artifact_version_mismatch');
  if (mode !== undefined && contract.mode !== mode) issues.push('artifact_mode_mismatch');
  if (contract.dateBrt !== dateBrt) issues.push('artifact_brt_date_mismatch');
  const generatedAtMs = Date.parse(contract.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    issues.push('artifact_timestamp_invalid');
  } else {
    if (generatedAtMs < startedAtMs - 5000) issues.push('artifact_predates_run');
    if (generatedAtMs > Date.now() + 5 * 60 * 1000) issues.push('artifact_from_future');
  }
  if (!/^[a-f0-9]{64}$/.test(String(contract.contentSha256 || ''))) {
    issues.push('artifact_hash_invalid');
  } else if (sha256Json(artifactPayloadWithoutContract(artifact)) !== contract.contentSha256) {
    issues.push('artifact_hash_mismatch');
  }
  if (requireNonEmpty) {
    const totalItems = artifact.stats?.totalItems;
    if (!Number.isInteger(totalItems) || totalItems < 1) issues.push('artifact_empty');
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)], contract };
}

function stampTrulyNewArtifact(curatorReport, items, generatedAt = new Date().toISOString()) {
  const sourceContract = curatorReport?.artifactContract;
  if (!sourceContract || !['curator-report', 'truly-new'].includes(sourceContract.kind)) {
    throw new Error('relatório do curador sem contrato de origem');
  }
  const sourceArtifact = sourceContract.kind === 'curator-report'
    ? curatorLineageFilename(sourceContract)
    : sourceContract.sourceArtifact;
  const sourceContentSha256 = sourceContract.kind === 'curator-report'
    ? sourceContract.contentSha256
    : sourceContract.sourceContentSha256;
  // Slim artifact: keep only duplicate/update candidates from discarded (not the full 8MB dump).
  // Full curator report remains on disk for multi-stage (reportFile path).
  // Keep version/mode/timestamp so pipeline-artifact-validator accepts the payload.
  const discardedCandidates = selectDuplicateEnrichmentCandidates(curatorReport.discarded).slice(0, 200);
  const discardedMetadata = reducedDiscardedMetadata(curatorReport, discardedCandidates);
  const artifact = {
    version: curatorReport.version || sourceContract.version || '4.4',
    mode: curatorReport.mode || sourceContract.mode,
    timestamp: curatorReport.timestamp || sourceContract.generatedAt || generatedAt,
    generatedAt,
    stats: {
      ...(curatorReport.stats || {}),
      publishable: items.length,
      discarded: discardedMetadata.discardedTotal,
      reviewable: Math.max(
        Number.isInteger(curatorReport.stats?.reviewable) ? curatorReport.stats.reviewable : 0,
        Array.isArray(curatorReport.reviewable) ? curatorReport.reviewable.length : 0,
      ),
      discardedDuplicatesKept: discardedCandidates.filter(item => item.duplicate).length,
      discardedEnrichmentCandidatesKept: discardedCandidates.length,
    },
    ...discardedMetadata,
    publishable: items,
    discarded: discardedCandidates,
    reviewable: [],
  };
  delete artifact.artifactContract;
  artifact.artifactContract = {
    schemaVersion: 1,
    kind: 'truly-new',
    version: '4.4',
    mode: sourceContract.mode,
    runId: sourceContract.runId,
    dateBrt: sourceContract.dateBrt,
    generatedAt,
    sourceArtifact,
    sourceContentSha256,
    contentSha256: sha256Json(artifact),
  };
  return artifact;
}

function validateTrulyNewArtifact(artifact, {
  nowMs = Date.now(),
  maxAgeMs = 25 * 60 * 60 * 1000,
  dateBrt = TIMESTAMP,
} = {}) {
  const issues = [];
  const contract = artifact?.artifactContract;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { ok: false, issues: ['truly_new_not_object'] };
  }
  if (!Array.isArray(artifact.publishable)) issues.push('truly_new_publishable_not_array');
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return { ok: false, issues: [...issues, 'truly_new_contract_missing'] };
  }
  if (contract.schemaVersion !== 1) issues.push('truly_new_schema_unsupported');
  if (contract.kind !== 'truly-new') issues.push('truly_new_kind_mismatch');
  if (contract.version !== '4.4') issues.push('truly_new_version_mismatch');
  if (contract.dateBrt !== dateBrt) issues.push('truly_new_brt_date_mismatch');
  if (!/^[a-f0-9]{64}$/.test(String(contract.sourceContentSha256 || ''))) {
    issues.push('truly_new_source_hash_invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(String(contract.contentSha256 || ''))) {
    issues.push('truly_new_hash_invalid');
  } else if (sha256Json(artifactPayloadWithoutContract(artifact)) !== contract.contentSha256) {
    issues.push('truly_new_hash_mismatch');
  }
  const generatedAtMs = Date.parse(contract.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    issues.push('truly_new_timestamp_invalid');
  } else {
    if (generatedAtMs > nowMs + 5 * 60 * 1000) issues.push('truly_new_from_future');
    if (nowMs - generatedAtMs > maxAgeMs) issues.push('truly_new_stale');
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)], contract };
}

function hasRequiredFailure() {
  return pipelineSteps.some(step => step.required && !step.ok);
}

function instagramPermalinkShortcode(item) {
  return [
    item?.canonicalSourceUrl,
    item?.sourceUrl,
    item?.sourcePageUrl,
    item?.link,
    item?.url,
  ].map(value => instagramShortcode({ link: value })).find(Boolean) || '';
}

function instagramSeenKey(item) {
  const sourceId = String(item?.sourceId || '').trim();
  const sourceMatch = sourceId.match(/^ig:([^:]+):([A-Za-z0-9_-]{1,128})$/);
  const permalinkShortcode = instagramPermalinkShortcode(item);
  if (sourceId && !sourceMatch) return '';
  if (!sourceMatch) return permalinkShortcode;
  const [, sourceHandle, sourceShortcode] = sourceMatch;
  if (permalinkShortcode && permalinkShortcode !== sourceShortcode) return '';
  const checkpointEntry = instagramSeenCheckpoint?.entries?.[sourceShortcode];
  if (checkpointEntry?.handle
      && String(checkpointEntry.handle).toLowerCase() !== sourceHandle.toLowerCase()) {
    return '';
  }
  return sourceShortcode;
}

function stageInstagramSeenCheckpoint(checkpoint, {
  expectedRunId = PIPELINE_RUN_ID,
  expectedRelevanceVersion,
  nowMs = Date.now(),
} = {}) {
  const validation = validateInstagramSeenCheckpoint(checkpoint, {
    expectedRunId,
    expectedRelevanceVersion,
    nowMs,
    requireDownstreamAck: true,
  });
  if (!validation.ok) {
    throw new Error(`instagram_seen_checkpoint_invalid:${validation.issues.join(',')}`);
  }
  instagramSeenCheckpoint = checkpoint;
  instagramSeenCheckpointSettled = false;
  instagramSeenSettlement = null;
  terminalInstagramSeenKeys.clear();
  return checkpoint;
}

function acknowledgeTerminalInstagramItems(items) {
  if (!instagramSeenCheckpoint) return [];
  const added = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = instagramSeenKey(item);
    if (!key || !Object.prototype.hasOwnProperty.call(instagramSeenCheckpoint.entries, key)) continue;
    if (!terminalInstagramSeenKeys.has(key)) added.push(key);
    terminalInstagramSeenKeys.add(key);
  }
  return added;
}

function acknowledgeAlreadyPublishedInstagramPosts(artifact, publishedSourceIndex) {
  if (!instagramSeenCheckpoint || !(publishedSourceIndex instanceof Map)) return [];
  const acknowledged = [];
  for (const profile of Array.isArray(artifact?.results) ? artifact.results : []) {
    for (const post of Array.isArray(profile?.posts) ? profile.posts : []) {
      if (post?.relevant !== true) continue;
      const key = instagramSeenKey(post);
      const rawUrl = String(post?.link || post?.url || '').trim();
      const candidate = {
        ...post,
        sourceId: `ig:${profile.handle}:${key}`,
        sourceUrl: rawUrl,
      };
      if (!key || !publishedSourceKey(rawUrl)
          || !shouldSkipPublishedItem(candidate, publishedSourceIndex)) continue;
      acknowledged.push(...acknowledgeTerminalInstagramItems([candidate]));
    }
  }
  return acknowledged;
}

function settleInstagramSeenCheckpoint({
  stateFile = path.join(CANONICAL_IG_DATA_DIR, 'seen-posts.json'),
  dryRun = DRY_RUN,
  nowMs = Date.now(),
  recordStep = true,
} = {}) {
  if (!instagramSeenCheckpoint || instagramSeenCheckpointSettled) return instagramSeenSettlement;
  instagramSeenCheckpointSettled = true;

  if (dryRun || terminalInstagramSeenKeys.size === 0) {
    instagramSeenSettlement = {
      committedKeys: [],
      pendingKeys: Object.keys(instagramSeenCheckpoint.entries),
      dryRun: dryRun === true,
    };
    if (recordStep) {
      recordSyntheticStep('ig_checkpoint', 'Confirmação transacional do Instagram', {
        required: false,
        ok: true,
        status: 'skipped',
        reason: dryRun
          ? 'dry_run_no_seen_mutation'
          : `no_terminal_items:${instagramSeenSettlement.pendingKeys.length}_replayable`,
      });
    }
    return instagramSeenSettlement;
  }

  try {
    instagramSeenSettlement = commitAcknowledgedInstagramSeen(
      instagramSeenCheckpoint,
      terminalInstagramSeenKeys,
      {
        stateFile,
        nowMs,
        retentionDays: resolveInstagramSeenRetentionDays(),
      },
    );
    if (recordStep) {
      recordSyntheticStep('ig_checkpoint', 'Confirmação transacional do Instagram', {
        required: true,
        ok: true,
        status: 'success',
        reason: `${instagramSeenSettlement.committedKeys.length}_terminal;`
          + `${instagramSeenSettlement.pendingKeys.length}_replayable`,
      });
    }
  } catch (error) {
    instagramSeenSettlement = {
      committedKeys: [],
      pendingKeys: Object.keys(instagramSeenCheckpoint.entries),
      error: String(error.message || error).slice(0, 160),
    };
    if (recordStep) {
      recordSyntheticStep('ig_checkpoint', 'Confirmação transacional do Instagram', {
        required: true,
        ok: false,
        exitCode: 2,
        reason: `seen_checkpoint_commit_failed:${instagramSeenSettlement.error}`,
      });
    }
  }
  return instagramSeenSettlement;
}

function ensureSelectedStageCoverage() {
  for (const stage of ACTIVE_STAGES) {
    if (!pipelineSteps.some(step => step.id === stage)) {
      recordSyntheticStep(stage, `Estágio ${stage} sem evidência de execução`, {
        required: true,
        ok: false,
        exitCode: 2,
        reason: 'selected_stage_missing_evidence',
      });
    }
  }
}

function createDryRunWorkspace() {
  const parent = path.resolve(process.env.CADU_PIPELINE_DRY_RUN_PARENT || os.tmpdir());
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'cadu-pipeline-dry-run-'));
  const dataDir = path.join(root, 'ufg-scrape');
  const igDataDir = path.join(root, 'ufg-instagram');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(igDataDir, { recursive: true });
  return { root, dataDir, igDataDir };
}

function activateDryRunWorkspace(workspace) {
  DATA_DIR = workspace.dataDir;
  IG_DATA_DIR = workspace.igDataDir;
  PIPELINE_CHILD_ENV = {
    ...PIPELINE_CHILD_ENV,
    CADU_DRY_RUN_ARTIFACT_DIR: workspace.root,
    CADU_PIPELINE_IG_ARTIFACT: path.join(workspace.igDataDir, `ig-browser-${TIMESTAMP}.json`),
  };
}

function cleanupDryRunWorkspace(workspace) {
  if (!workspace) return;
  fs.rmSync(workspace.root, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 50,
  });
}

function publicStepResult(result) {
  return {
    schema_version: 1,
    id: result.id,
    label: result.label,
    required: result.required,
    status: result.status,
    exit_code: result.exitCode,
    signal: result.signal,
    duration_ms: result.durationMs,
    stdout_truncated: result.stdoutTruncated === true,
    stderr_truncated: result.stderrTruncated === true,
    ...(result.error ? { error: result.error } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

function recordStepResult(result) {
  const normalized = {
    id: result.id,
    label: result.label || result.id,
    required: result.required === true,
    status: result.status || (result.ok ? 'success' : 'failed'),
    ok: result.ok === true,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
    signal: result.signal || null,
    durationMs: Number.isFinite(result.durationMs) ? Math.max(0, Math.round(result.durationMs)) : 0,
    stdoutTruncated: result.stdoutTruncated === true,
    stderrTruncated: result.stderrTruncated === true,
    error: result.error || null,
    reason: result.reason || null,
  };
  pipelineSteps.push(normalized);
  console.log(`${STEP_MARKER}${JSON.stringify(publicStepResult(normalized))}`);
  return normalized;
}

function recordSyntheticStep(id, label, { required = false, ok = true, status, exitCode = null, reason = null } = {}) {
  return recordStepResult({
    id,
    label,
    required,
    ok,
    status: status || (ok ? 'skipped' : 'failed'),
    exitCode,
    signal: null,
    durationMs: 0,
    reason,
  });
}

function derivePipelineOutcome(steps = pipelineSteps) {
  const requiredFailures = steps.filter(step => step.required && !step.ok);
  const optionalFailures = steps.filter(step => !step.required && !step.ok);
  const status = requiredFailures.length > 0
    ? 'failed'
    : optionalFailures.length > 0
      ? 'partial'
      : 'success';
  return {
    schema_version: 1,
    status,
    required_failures: [...new Set(requiredFailures.map(step => step.id))],
    optional_failures: [...new Set(optionalFailures.map(step => step.id))],
    step_count: steps.length,
  };
}

function emitPipelineOutcome(extra = {}) {
  if (pipelineOutcomeEmitted) return derivePipelineOutcome();
  settleInstagramSeenCheckpoint();
  ensureSelectedStageCoverage();
  // Every terminal path, including early failures and unhandled exceptions,
  // emits one complete (nullable) funnel snapshot before the outcome marker.
  emitPipelineFunnel();
  const outcome = { ...derivePipelineOutcome(), ...extra };
  pipelineOutcomeEmitted = true;
  console.log(`${OUTCOME_MARKER}${JSON.stringify(outcome)}`);
  return outcome;
}

// ============================================================
// RUN STEP — Streaming stdio + captura para regex
// ============================================================
// Usa spawn em vez de execSync para que o stdout do child seja ECOADO
// no terminal (visivel no log) E capturado em buffer para o pubMatch.
// Solucao para o bug de "0 publicados" reportado em 2026-06-08.
// ============================================================
function getSupabaseKey() {
  return (
    process.env.CADU_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.KINOCAMPUS_SUPABASE_ANON_KEY
    || ''
  ).trim();
}

function curatorCoverageIssues(report) {
  const stats = report?.stats && typeof report.stats === 'object' ? report.stats : {};
  const declared = Array.isArray(stats.collectionIssues)
    ? stats.collectionIssues.filter(issue => typeof issue === 'string' && issue.trim())
    : [];
  const issues = [...declared];
  if (stats.globalEventCollectionFailure && !issues.includes('global_events_collection_failed')) {
    issues.push('global_events_collection_failed');
  }
  const pagination = stats.globalEventPagination;
  const paginationCovered = pagination?.coverageComplete === true
    || ['total_reconciled', 'temporal_frontier'].includes(pagination?.stopReason);
  if (pagination
      && !paginationCovered
      && !issues.includes('global_events_pagination_incomplete')) {
    issues.push('global_events_pagination_incomplete');
  }
  if (Number(stats.localEventPaginationFailures) > 0
      && !issues.some(issue => issue.startsWith('local_event_pagination_failures:'))) {
    issues.push(`local_event_pagination_failures:${Number(stats.localEventPaginationFailures)}`);
  }
  if (stats.collectionComplete === false && issues.length === 0) {
    issues.push('curator_collection_incomplete');
  }
  return [...new Set(issues)];
}

function recordCuratorCoverageStep(report) {
  const issues = curatorCoverageIssues(report);
  if (issues.length === 0) return null;
  return recordSyntheticStep('curator_coverage', 'Cobertura das fontes do curador', {
    required: false,
    ok: false,
    status: 'failed',
    reason: `curator_coverage_partial:${issues.join(',')}`,
  });
}

function publishedSourceKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return instagramPermalinkKey(raw) || canonicalUrl(raw) || raw;
}

function addPostUrlToSet(urls, value) {
  const url = String(value || '').trim();
  if (!url) return;
  urls.add(publishedSourceKey(url));
}

function itemSourceUrls(item) {
  return [...new Set(
    [item?.sourceUrl, item?.url, item?.link]
      .map(value => String(value || '').trim())
      .filter(Boolean),
  )];
}

function buildPublishedSourceIndex(posts) {
  const index = new Map();
  for (const post of Array.isArray(posts) ? posts : []) {
    const metadata = post?.metadata && typeof post.metadata === 'object' ? post.metadata : {};
    const sourceId = String(metadata.source_id || '').trim();
    for (const value of [metadata.source_url, metadata.link]) {
      const rawUrl = String(value || '').trim();
      if (!rawUrl) continue;
      const key = publishedSourceKey(rawUrl);
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(sourceId);
    }
  }
  return index;
}

function shouldSkipPublishedItem(item, publishedSourceIndex) {
  const incomingSourceId = String(item?.sourceId || '').trim();
  const matchingSourceIds = [];
  for (const value of itemSourceUrls(item)) {
    const key = publishedSourceKey(value);
    const sourceIds = publishedSourceIndex instanceof Map
      ? publishedSourceIndex.get(key)
      : null;
    if (sourceIds instanceof Set) matchingSourceIds.push(...sourceIds);
  }
  if (matchingSourceIds.length === 0) return false;
  // A URL ao vivo só prova que o mesmo item já foi tratado quando não há
  // evidência de outra origem. Identidades diferentes devem chegar ao
  // publisher, que possui as regras conservadoras de merge/dedup.
  return !incomingSourceId
    || matchingSourceIds.every(sourceId => !sourceId || sourceId === incomingSourceId);
}

function loadFileCacheUrls(cacheFile) {
  const urls = new Set();
  try {
    if (!fs.existsSync(cacheFile)) return urls;
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const p of (cache.posts || [])) {
      addPostUrlToSet(urls, p.metadata_link);
      addPostUrlToSet(urls, p.metadata?.source_url);
      addPostUrlToSet(urls, p.metadata?.link);
    }
  } catch (e) {
    log('⚠️', `Cache Supabase em arquivo falhou: ${e.message ? e.message.slice(0, 100) : 'unknown'}`);
  }
  return urls;
}

async function collectPaginatedRows(fetchPage, {
  pageSize = 1000,
  maxPages = 100,
  label = 'Supabase',
} = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage deve ser função');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new TypeError('pageSize deve estar entre 1 e 1000');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    throw new TypeError('maxPages deve estar entre 1 e 1000');
  }

  const rows = [];
  let expectedTotal = null;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const response = await fetchPage({ offset, limit: pageSize, page });
    if (!response || response.ok !== true || !Array.isArray(response.rows)) {
      throw new Error(`${label}: página ${page + 1} falhou (${response?.error || 'invalid_response'})`);
    }
    if (!Number.isInteger(response.total) || response.total < 0) {
      throw new Error(`${label}: contagem total ausente/ambígua na página ${page + 1}`);
    }
    if (expectedTotal === null) expectedTotal = response.total;
    if (response.total !== expectedTotal) {
      throw new Error(`${label}: total mudou durante paginação (${expectedTotal}→${response.total})`);
    }
    const expectedPageLength = Math.min(pageSize, Math.max(0, expectedTotal - offset));
    if (response.rows.length !== expectedPageLength) {
      throw new Error(
        `${label}: página incompleta ${page + 1} (${response.rows.length}/${expectedPageLength})`,
      );
    }
    rows.push(...response.rows);
    if (rows.length === expectedTotal) return rows;
    if (rows.length > expectedTotal) throw new Error(`${label}: paginação excedeu total declarado`);
  }
  throw new Error(`${label}: limite de ${maxPages} páginas atingido antes de concluir`);
}

function fetchPublishedUrlPage(key, { offset, limit }) {
  const url = `${SUPABASE_URL}/rest/v1/posts?select=id,metadata&status=eq.published&order=id.asc&limit=${limit}&offset=${offset}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
    Range: `${offset}-${offset + limit - 1}`,
    'Range-Unit': 'items',
  };
  return new Promise((resolve) => {
    fetchWithRetry(url, {
      headers,
      timeoutMs: 12000,
      onRetry: (attempt, kind, _err, backoffMs) => {
        log('🔁', `cache Supabase página ${offset / 1000 + 1} retry ${attempt}: ${kind} (${backoffMs}ms)`);
      },
    }).then((result) => {
      if (!result.ok) {
        if (result.kind === 'response_too_large') {
          resolve({ ok: false, rows: [], total: null, error: 'response_too_large' });
          return;
        }
        if (/^http_/.test(result.kind || '')) {
          resolve({ ok: false, rows: [], total: null, error: result.kind });
          return;
        }
        if (result.kind === 'invalid_json_or_range' || result.status === 200) {
          // Status 200 mas parse falhou - tentar parse manual abaixo
          if (result.status === 200) {
            try {
              const rows = JSON.parse(result.body);
              if (!Array.isArray(rows)) throw new Error('posts response is not an array');
              const contentRange = String(result.headers['content-range'] || '');
              const rangeMatch = contentRange.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
              const total = rangeMatch ? Number(rangeMatch[1]) : null;
              resolve({ ok: true, rows, total, error: null });
              return;
            } catch (_) {
              resolve({ ok: false, rows: [], total: null, error: 'invalid_json_or_range' });
              return;
            }
          }
        }
        const errKind = result.kind || 'network_error';
        resolve({ ok: false, rows: [], total: null, error: errKind });
        return;
      }
      // 200 OK path
      try {
        const rows = JSON.parse(result.body);
        if (!Array.isArray(rows)) throw new Error('posts response is not an array');
        const contentRange = String(result.headers['content-range'] || '');
        const rangeMatch = contentRange.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
        const total = rangeMatch ? Number(rangeMatch[1]) : null;
        resolve({ ok: true, rows, total, error: null });
      } catch (_) {
        resolve({ ok: false, rows: [], total: null, error: 'invalid_json_or_range' });
      }
    }).catch((err) => {
      log('⚠️', `fetchPublishedUrlPage falhou: ${String(err && err.message || err).slice(0, 200)}`);
      resolve({ ok: false, rows: [], total: null, error: 'unhandled_exception' });
    });
  });
}

function seedDryRunArtifact(source, target, label) {
  try {
    fs.lstatSync(source);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  // Lazy import avoids a module cycle while pipeline-kino is still loading;
  // main() runs only after this module has published its validation exports.
  const {
    parseStrictJson,
    readBoundedStableFile,
  } = require('./lib/pipeline-artifact-validator.js');
  const snapshot = readBoundedStableFile(source);
  const artifact = parseStrictJson(snapshot.bytes);
  writeJsonAtomic(target, artifact);
  const sourceTime = new Date(snapshot.mtimeMs);
  fs.utimesSync(target, sourceTime, sourceTime);
  log('🧪', `${label} copiado para o workspace efêmero`);
  return true;
}

async function fetchLivePublishedSourceIndex() {
  if (process.env.NODE_ENV === 'test' && process.env.CADU_TEST_PUBLISHED_URLS_JSON) {
    try {
      const values = JSON.parse(process.env.CADU_TEST_PUBLISHED_URLS_JSON);
      if (!Array.isArray(values)) throw new Error('fixture must be an array');
      const posts = values.map(value => {
        if (typeof value === 'string') return { metadata: { source_url: value } };
        if (value && typeof value === 'object' && value.metadata) return value;
        return {
          metadata: {
            source_url: value?.url,
            link: value?.link,
            source_id: value?.sourceId || value?.source_id,
          },
        };
      });
      return { ok: true, index: buildPublishedSourceIndex(posts), error: null };
    } catch (_) {
      return { ok: false, index: new Map(), error: 'invalid_test_fixture' };
    }
  }
  const key = getSupabaseKey();
  if (!key) return { ok: false, index: new Map(), error: 'supabase_key_missing' };
  try {
    const posts = await collectPaginatedRows(
      page => fetchPublishedUrlPage(key, page),
      { pageSize: 1000, maxPages: 100, label: 'posts publicados' },
    );
    return { ok: true, index: buildPublishedSourceIndex(posts), error: null };
  } catch (error) {
    log('⚠️', `Cache Supabase vivo falhou: ${String(error.message || error).slice(0, 160)}`);
    return { ok: false, index: new Map(), error: 'pagination_incomplete' };
  }
}

async function loadPublishedSourceIndex(cacheFile) {
  const fileUrls = loadFileCacheUrls(cacheFile);
  const live = await fetchLivePublishedSourceIndex();
  if (!live.ok) {
    throw new Error(`não foi possível confirmar posts publicados no Supabase: ${live.error}`);
  }
  const liveUrls = new Set(live.index.keys());
  const staleFileUrls = [...fileUrls].filter(url => !liveUrls.has(url)).length;
  log(
    '📦',
    `Supabase ao vivo: ${liveUrls.size} URLs autoritativas `
      + `(${fileUrls.size} no arquivo local; ${staleFileUrls} stale ignoradas)`,
  );
  return live.index;
}

function dateValues(item) {
  const dates = item.dates || {};
  return [
    ...(Array.isArray(dates.futureDates) ? dates.futureDates : []),
    dates.dateStart,
    dates.dateEnd,
    dates.latestDate,
    item.dateStart,
    item.dateEnd,
  ].filter(Boolean).map(v => String(v).slice(0, 10));
}

function hasFutureDate(item) {
  const today = isoDateInTimeZone();
  return dateValues(item).some(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today);
}

function publishReadinessIssues(item) {
  const issues = [];
  const dates = item.dates || {};
  const module = item.module || '';
  const desc = item.formattedDescription || item.description || '';
  const blocking = Array.isArray(item.qualityBlockingIssues) ? item.qualityBlockingIssues : [];
  if (blocking.length) issues.push(...blocking);
  if (item.needsReview === true) issues.push('needs_review');
  if (!desc || desc.length < 80) issues.push('weak_description');
  if (dates.isExpired === true || dates.expired === true || item.expired === true) issues.push('expired');
  if (module === 'eventos' && !hasFutureDate(item)) issues.push('no_future_event_date');
  if (module === 'oportunidades' && !hasFutureDate(item) && dates.hasDeadline !== true) issues.push('opportunity_without_deadline');
  return [...new Set(issues)];
}

function itemIdentity(item) {
  if (!item || typeof item !== 'object') return null;

  // Curator records deliberately keep two URL roles:
  //   - `url` is the durable article/event page;
  //   - `sourceUrl`/`link` may be a shared application form or another CTA.
  // Using the CTA first collapses unrelated articles which happen to reuse
  // the same form. Prefer the editorial page, then the stable source id. The
  // sourceUrl/link fallback remains for legacy records and Weby event payloads
  // which predate the explicit `url`/`sourceId` fields.
  const primaryUrl = [item.url, item.canonicalSourceUrl, item.sourcePageUrl]
    .find(value => typeof value === 'string' && value.trim());
  if (primaryUrl) {
    const canonical = canonicalUrl(primaryUrl);
    if (canonical) return `url:${URL_IDENTITY_VERSION}:${canonical}`;
  }
  if (typeof item.sourceId === 'string' && item.sourceId.trim()) {
    return `source:v1:${item.sourceId.trim()}`;
  }
  const legacyUrl = [item.sourceUrl, item.link]
    .find(value => typeof value === 'string' && value.trim());
  if (legacyUrl) {
    const canonical = canonicalUrl(legacyUrl);
    if (canonical) return `url:${URL_IDENTITY_VERSION}:${canonical}`;
  }
  return null;
}

function identityState(values, label) {
  const identities = [];
  const issues = [];
  const seen = new Set();
  if (!Array.isArray(values)) {
    return { identities, issues: [`${label}_not_array`] };
  }
  values.forEach((value, index) => {
    const identity = typeof value === 'string' ? value.trim() : itemIdentity(value);
    if (!identity) {
      issues.push(`${label}_missing_identity:${index}`);
      return;
    }
    if (seen.has(identity)) issues.push(`${label}_duplicate_identity:${identity}`);
    seen.add(identity);
    identities.push(identity);
  });
  return { identities, issues };
}

function sameIdentitySet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every(identity => rightSet.has(identity));
}

function validateFormattedItemSet(expectedItems, formattedItems, skippedItems = [], failedItems = []) {
  const expected = identityState(expectedItems, 'expected');
  const formatted = identityState(formattedItems, 'formatted');
  const skipped = identityState(skippedItems, 'skipped');
  const failed = identityState(failedItems, 'failed_formatting');
  const issues = [...expected.issues, ...formatted.issues, ...skipped.issues, ...failed.issues];
  const expectedSet = new Set(expected.identities);
  const formattedSet = new Set(formatted.identities);
  const skippedSet = new Set(skipped.identities);
  const failedSet = new Set(failed.identities);

  for (const identity of formattedSet) {
    if (!expectedSet.has(identity)) issues.push(`unexpected_formatted_identity:${identity}`);
    if (skippedSet.has(identity)) issues.push(`formatted_and_skipped_identity:${identity}`);
    if (failedSet.has(identity)) issues.push(`formatted_and_failed_identity:${identity}`);
  }
  for (const identity of skippedSet) {
    if (!expectedSet.has(identity)) issues.push(`unexpected_skipped_identity:${identity}`);
    if (failedSet.has(identity)) issues.push(`skipped_and_failed_identity:${identity}`);
  }
  for (const identity of failedSet) {
    if (!expectedSet.has(identity)) issues.push(`unexpected_failed_formatting_identity:${identity}`);
  }
  for (const identity of expectedSet) {
    if (!formattedSet.has(identity) && !skippedSet.has(identity) && !failedSet.has(identity)) {
      issues.push(`missing_formatted_identity:${identity}`);
    }
  }
  if (formatted.identities.length + skipped.identities.length + failed.identities.length !== expected.identities.length) {
    issues.push(
      `formatted_cardinality_mismatch:${formatted.identities.length}+${skipped.identities.length}+${failed.identities.length}!=${expected.identities.length}`,
    );
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    expectedIdentities: expected.identities,
    formattedIdentities: formatted.identities,
    skippedIdentities: skipped.identities,
    failedFormattingIdentities: failed.identities,
  };
}

function isSuccessfullyFormattedItem(item) {
  return item?.formatted === true
    && typeof item.formattedTitle === 'string'
    && item.formattedTitle.trim().length > 0
    && typeof item.formattedDescription === 'string'
    && item.formattedDescription.trim().length > 0;
}

function formatFailureEvidence(item) {
  const failure = item?.formatFailure && typeof item.formatFailure === 'object'
    ? item.formatFailure
    : {};
  const code = String(failure.code || 'formatter_unsuccessful').slice(0, 80);
  const httpStatus = Number.isInteger(failure.httpStatus) ? failure.httpStatus : null;
  const evidence = {
    title: String(item?.title || '').slice(0, 160),
    sourceUrl: item?.sourceUrl || item?.url || item?.link || null,
    sourceId: item?.sourceId || null,
    provider: String(failure.provider || 'unknown').slice(0, 80),
    providerHost: String(failure.providerHost || 'unknown').slice(0, 160),
    model: String(failure.model || 'unknown').slice(0, 160),
    code,
    httpStatus,
    message: httpStatus && httpStatus >= 400
      ? `Provider returned HTTP ${httpStatus}`
      : code.startsWith('response_') || code.startsWith('provider_envelope_')
        || code === 'content_filtered' || code === 'provider_insufficient_system_resource'
        ? 'Provider response did not satisfy the formatter contract'
        : 'Formatter did not produce a successful result',
  };
  if (['credentials', 'transport', 'provider_envelope', 'content_contract', 'http'].includes(failure.phase)) {
    evidence.phase = failure.phase;
  }
  if (Number.isSafeInteger(failure.attempts) && failure.attempts >= 1 && failure.attempts <= 50) {
    evidence.attempts = failure.attempts;
  }
  if (typeof failure.finishReason === 'string' && /^[a-z_]{1,64}$/.test(failure.finishReason)) {
    evidence.finishReason = failure.finishReason;
  }
  if (['absolute', 'socket'].includes(failure.timeoutType)) evidence.timeoutType = failure.timeoutType;
  return evidence;
}

function classifyFormatterOutput(expectedItems, formatterItems) {
  const allItems = Array.isArray(formatterItems) ? formatterItems : [];
  const reconciliation = validateFormattedItemSet(expectedItems, allItems);
  const successfulItems = allItems.filter(isSuccessfullyFormattedItem);
  const failedItems = allItems.filter(item => !isSuccessfullyFormattedItem(item));
  const failures = failedItems.map(formatFailureEvidence);
  const issues = [...reconciliation.issues];

  return {
    ok: issues.length === 0 && successfulItems.length > 0,
    integrityOk: issues.length === 0,
    zeroSuccess: allItems.length > 0 && successfulItems.length === 0,
    partial: successfulItems.length > 0 && failedItems.length > 0,
    issues: [...new Set(issues)],
    successfulItems,
    failedItems,
    failures,
  };
}

function formattedArtifactPayloadForHash(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return artifact;
  const copy = { ...artifact };
  if (copy.pipelineContract && typeof copy.pipelineContract === 'object') {
    copy.pipelineContract = { ...copy.pipelineContract };
    delete copy.pipelineContract.contentSha256;
  }
  return copy;
}

function resealFormattedArtifact(artifact, generatedAt = new Date().toISOString()) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new TypeError('artefato formatado inválido');
  }
  if (!artifact.pipelineContract || typeof artifact.pipelineContract !== 'object') {
    throw new Error('pipelineContract ausente');
  }
  const sealed = {
    ...artifact,
    pipelineContract: {
      ...artifact.pipelineContract,
      generatedAt,
    },
  };
  delete sealed.pipelineContract.contentSha256;
  sealed.pipelineContract.contentSha256 = sha256Json(formattedArtifactPayloadForHash(sealed));
  return sealed;
}

function formatFailureSummary(failures) {
  const counts = new Map();
  for (const failure of (Array.isArray(failures) ? failures : [])) {
    const provider = String(failure?.provider || 'unknown').slice(0, 80);
    const code = String(failure?.code || 'formatter_unsuccessful').slice(0, 80);
    const key = `${provider}:${code}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(',') || 'unknown:formatter_unsuccessful=1';
}

function stampFormattedArtifact(artifact, {
  sourceArtifact,
  sourceContentSha256 = null,
  sourceRunId = null,
  expectedItems,
  skippedAlreadyPublished = [],
  failedFormatting = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = artifact && Array.isArray(artifact.items) ? artifact.items : [];
  const reconciliation = validateFormattedItemSet(
    expectedItems,
    items,
    skippedAlreadyPublished,
    failedFormatting,
  );
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    reconciliation.issues.unshift('formatted_artifact_not_object');
    reconciliation.ok = false;
  } else if (!Array.isArray(artifact.items)) {
    reconciliation.issues.push('formatted_artifact_items_not_array');
    reconciliation.ok = false;
  }
  if (!sourceArtifact || typeof sourceArtifact !== 'string') {
    reconciliation.issues.push('formatted_artifact_source_missing');
    reconciliation.ok = false;
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    reconciliation.issues.push('formatted_artifact_generated_at_invalid');
    reconciliation.ok = false;
  }
  if (!reconciliation.ok) return { ok: false, issues: reconciliation.issues, artifact: null };

  const stampedArtifact = resealFormattedArtifact({
    ...artifact,
    pipelineContract: {
      schemaVersion: FORMATTED_ARTIFACT_SCHEMA_VERSION,
      sourceArtifact,
      sourceContentSha256,
      sourceRunId,
      generatedAt,
      expectedIdentities: reconciliation.expectedIdentities,
      formattedIdentities: reconciliation.formattedIdentities,
      skippedAlreadyPublishedIdentities: reconciliation.skippedIdentities,
      failedFormattingIdentities: reconciliation.failedFormattingIdentities,
    },
  }, generatedAt);
  return { ok: true, issues: [], artifact: stampedArtifact };
}

function validateFormattedArtifact(artifact, expectedItems, {
  sourceArtifact,
  sourceContentSha256 = null,
  sourceRunId = null,
  sourceMtimeMs = null,
  nowMs = Date.now(),
  maxAgeMs = FORMATTED_ARTIFACT_MAX_AGE_MS,
} = {}) {
  const issues = [];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { ok: false, issues: ['formatted_artifact_not_object'] };
  }
  if (!Array.isArray(artifact.items)) issues.push('formatted_artifact_items_not_array');
  const contract = artifact.pipelineContract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return { ok: false, issues: [...issues, 'formatted_artifact_contract_missing'] };
  }
  if (contract.schemaVersion !== FORMATTED_ARTIFACT_SCHEMA_VERSION) {
    issues.push('formatted_artifact_schema_unsupported');
  }
  if (!/^[a-f0-9]{64}$/.test(String(contract.contentSha256 || ''))) {
    issues.push('formatted_artifact_hash_invalid');
  } else if (sha256Json(formattedArtifactPayloadForHash(artifact)) !== contract.contentSha256) {
    issues.push('formatted_artifact_hash_mismatch');
  }
  if (contract.sourceArtifact !== sourceArtifact) issues.push('formatted_artifact_source_mismatch');
  if (sourceContentSha256 !== null && contract.sourceContentSha256 !== sourceContentSha256) {
    issues.push('formatted_artifact_source_hash_mismatch');
  }
  if (sourceRunId !== null && contract.sourceRunId !== sourceRunId) {
    issues.push('formatted_artifact_source_run_mismatch');
  }
  const generatedAtMs = Date.parse(contract.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    issues.push('formatted_artifact_generated_at_invalid');
  } else {
    if (generatedAtMs > nowMs + 5 * 60 * 1000) issues.push('formatted_artifact_from_future');
    if (nowMs - generatedAtMs > maxAgeMs) issues.push('formatted_artifact_stale');
    if (Number.isFinite(sourceMtimeMs) && generatedAtMs < sourceMtimeMs) {
      issues.push('formatted_artifact_older_than_source');
    }
  }

  const skipped = Array.isArray(contract.skippedAlreadyPublishedIdentities)
    ? contract.skippedAlreadyPublishedIdentities
    : [];
  const failedFormatting = Array.isArray(contract.failedFormattingIdentities)
    ? contract.failedFormattingIdentities
    : [];
  const reconciliation = validateFormattedItemSet(
    expectedItems,
    artifact.items || [],
    skipped,
    failedFormatting,
  );
  issues.push(...reconciliation.issues);
  for (const [index, item] of (artifact.items || []).entries()) {
    if (!isSuccessfullyFormattedItem(item)) issues.push(`formatted_artifact_unsuccessful_item:${index}`);
  }
  if (!Array.isArray(contract.expectedIdentities)
      || !sameIdentitySet(contract.expectedIdentities, reconciliation.expectedIdentities)) {
    issues.push('formatted_artifact_expected_identity_mismatch');
  }
  if (!Array.isArray(contract.formattedIdentities)
      || !sameIdentitySet(contract.formattedIdentities, reconciliation.formattedIdentities)) {
    issues.push('formatted_artifact_output_identity_mismatch');
  }
  if (!Array.isArray(contract.skippedAlreadyPublishedIdentities)
      || !sameIdentitySet(contract.skippedAlreadyPublishedIdentities, reconciliation.skippedIdentities)) {
    issues.push('formatted_artifact_skipped_identity_mismatch');
  }
  if (contract.failedFormattingIdentities !== undefined
      && (!Array.isArray(contract.failedFormattingIdentities)
        || !sameIdentitySet(contract.failedFormattingIdentities, reconciliation.failedFormattingIdentities))) {
    issues.push('formatted_artifact_failed_identity_mismatch');
  }
  if (failedFormatting.length > 0) {
    const evidence = identityState(artifact.formatFailures, 'format_failure_evidence');
    issues.push(...evidence.issues);
    if (!sameIdentitySet(evidence.identities, reconciliation.failedFormattingIdentities)) {
      issues.push('formatted_artifact_failure_evidence_mismatch');
    }
    if ((artifact.items || []).length === 0) issues.push('formatted_artifact_zero_success');
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    failedFormattingIdentities: reconciliation.failedFormattingIdentities,
  };
}

function validatePublishSummary(stdout, expectedItemsOrCount, { dryRun = false } = {}) {
  const issues = [];
  const expectedItems = Array.isArray(expectedItemsOrCount) ? expectedItemsOrCount : null;
  const expectedCount = expectedItems ? expectedItems.length : expectedItemsOrCount;
  const markerLines = String(stdout || '')
    .split(/\r?\n/)
    .filter(line => line.startsWith(PUBLISH_MARKER));
  if (markerLines.length !== 1) {
    return {
      ok: false,
      issues: [markerLines.length === 0 ? 'publish_summary_missing' : 'publish_summary_ambiguous'],
    };
  }

  let summary;
  try {
    summary = JSON.parse(markerLines[0].slice(PUBLISH_MARKER.length));
  } catch (_) {
    return { ok: false, issues: ['publish_summary_invalid_json'] };
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return { ok: false, issues: ['publish_summary_not_object'] };
  }
  const countKeys = ['published', 'merged', 'duplicated', 'pending', 'errors'];
  for (const key of countKeys) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) issues.push(`publish_summary_invalid_count:${key}`);
  }
  if (summary.dryRun !== dryRun) issues.push('publish_summary_dry_run_mismatch');
  if (!Number.isInteger(expectedCount) || expectedCount < 0) issues.push('publish_expected_count_invalid');

  const itemGroups = summary.items;
  if (!itemGroups || typeof itemGroups !== 'object' || Array.isArray(itemGroups)) {
    issues.push('publish_summary_items_missing');
  } else {
    for (const key of countKeys) {
      if (!Array.isArray(itemGroups[key])) {
        issues.push(`publish_summary_items_not_array:${key}`);
      } else if (Number.isInteger(summary[key]) && itemGroups[key].length !== summary[key]) {
        issues.push(`publish_summary_count_mismatch:${key}`);
      }
    }
  }

  if (countKeys.every(key => Number.isInteger(summary[key]) && summary[key] >= 0)) {
    const classifiedCount = countKeys.reduce((total, key) => total + summary[key], 0);
    if (dryRun) {
      if (classifiedCount !== 0) issues.push('publish_dry_run_reported_mutations');
      const dryRunProcessedCount = String(stdout || '')
        .split(/\r?\n/)
        .filter(line => /\[DRY\]\s/.test(line))
        .length;
      if (dryRunProcessedCount !== expectedCount) {
        issues.push(`publish_dry_run_unreconciled_items:${dryRunProcessedCount}!=${expectedCount}`);
      }
    } else if (classifiedCount !== expectedCount) {
      issues.push(`publish_summary_unreconciled_items:${classifiedCount}!=${expectedCount}`);
    }
  }

  if (!dryRun && expectedItems && itemGroups && typeof itemGroups === 'object' && !Array.isArray(itemGroups)) {
    const classifiedItems = countKeys.flatMap(key => Array.isArray(itemGroups[key]) ? itemGroups[key] : []);
    const expectedIdentities = identityState(expectedItems, 'publish_expected');
    const actualIdentities = identityState(classifiedItems, 'publish_actual');
    issues.push(...expectedIdentities.issues, ...actualIdentities.issues);
    if (!sameIdentitySet(expectedIdentities.identities, actualIdentities.identities)) {
      issues.push('publish_summary_identity_mismatch');
    }
    const expectedByIdentity = new Map();
    expectedItems.forEach((item) => {
      const identity = itemIdentity(item);
      if (identity && !expectedByIdentity.has(identity)) expectedByIdentity.set(identity, item);
    });
    classifiedItems.forEach((item, index) => {
      const identity = itemIdentity(item);
      const expected = identity ? expectedByIdentity.get(identity) : null;
      if (!expected) return;
      const expectedSourceId = String(expected.sourceId || '').trim();
      const actualSourceId = String(item?.sourceId || '').trim();
      if (expectedSourceId && actualSourceId !== expectedSourceId) {
        issues.push(`publish_summary_source_id_mismatch:${index}`);
      }

      const expectedIdentity = itemIdentity(expected);
      for (const field of ['canonicalSourceUrl', 'sourceUrl', 'url']) {
        const fieldUrl = String(item?.[field] || '').trim();
        if (!fieldUrl || !expectedIdentity?.startsWith('url:')) continue;
        const fieldKey = canonicalUrl(fieldUrl);
        const fieldIdentity = fieldKey ? `url:${URL_IDENTITY_VERSION}:${fieldKey}` : '';
        if (fieldIdentity !== expectedIdentity) {
          issues.push(`publish_summary_source_url_mismatch:${index}:${field}`);
        }
      }

      const expectedInstagram = expectedSourceId.match(
        /^ig:([^:]+):([A-Za-z0-9_-]{1,128})$/,
      );
      if (!expectedInstagram) return;
      const expectedShortcode = expectedInstagram[2];
      const inputShortcode = instagramPermalinkShortcode(expected);
      const outcomeShortcodes = ['canonicalSourceUrl', 'sourceUrl', 'url']
        .map(field => instagramShortcode({ link: item?.[field] }))
        .filter(Boolean);
      if ((inputShortcode && inputShortcode !== expectedShortcode)
          || outcomeShortcodes.length === 0
          || outcomeShortcodes.some(shortcode => shortcode !== expectedShortcode)) {
        issues.push(`publish_summary_instagram_identity_mismatch:${index}`);
      }
    });
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)], summary };
}

function resolveTerminalPublisherItems(summary, sourceItems) {
  const sourceByIdentity = new Map();
  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    const identity = itemIdentity(item);
    if (!identity || sourceByIdentity.has(identity)) {
      throw new Error('terminal_publisher_source_identity_invalid');
    }
    sourceByIdentity.set(identity, item);
  }
  const terminalOutcomes = [
    ...(Array.isArray(summary?.items?.published) ? summary.items.published : []),
    ...(Array.isArray(summary?.items?.merged) ? summary.items.merged : []),
  ];
  const resolved = [];
  const seen = new Set();
  for (const outcome of terminalOutcomes) {
    const identity = itemIdentity(outcome);
    if (!identity || seen.has(identity) || !sourceByIdentity.has(identity)) {
      throw new Error('terminal_publisher_outcome_identity_invalid');
    }
    seen.add(identity);
    resolved.push(sourceByIdentity.get(identity));
  }
  return resolved;
}

function nodeCommand(scriptPath, args = []) {
  if (typeof scriptPath !== 'string' || !scriptPath.trim()) {
    throw new TypeError('nodeCommand requires a script path');
  }
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw new TypeError('nodeCommand args must be strings');
  }
  return { command: process.execPath, args: [scriptPath, ...args] };
}

function appendBoundedText(current, chunk, maxBytes) {
  const combined = `${current}${chunk}`;
  const buffer = Buffer.from(combined, 'utf8');
  if (buffer.length <= maxBytes) return { text: combined, truncated: false };
  let text = buffer.subarray(buffer.length - maxBytes).toString('utf8');
  if (text.startsWith('\uFFFD')) text = text.slice(1);
  return { text, truncated: true };
}

function captureLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(64 * 1024 * 1024, Math.max(1024, Math.floor(parsed)));
}

function runStep(commandSpec, label, {
  id = 'step',
  required = false,
  timeoutMs = 900000,
  stdoutCaptureBytes = process.env.CADU_STEP_STDOUT_CAPTURE_BYTES,
  stderrCaptureBytes = process.env.CADU_STEP_STDERR_CAPTURE_BYTES,
} = {}) {
  if (!commandSpec || typeof commandSpec !== 'object' || Array.isArray(commandSpec)) {
    throw new TypeError('runStep requires a command specification');
  }
  const command = String(commandSpec.command || '').trim();
  const args = commandSpec.args || [];
  if (!command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw new TypeError('invalid runStep command specification');
  }
  const stdoutLimit = captureLimit(stdoutCaptureBytes, DEFAULT_STDOUT_CAPTURE_BYTES);
  const stderrLimit = captureLimit(stderrCaptureBytes, DEFAULT_STDERR_CAPTURE_BYTES);
  log('⏳', label);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { shell: false, timeout: timeoutMs, env: PIPELINE_CHILD_ENV });
    let stdoutBuf = '';
    let stderrBuf = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    const finalize = (code, signal, error = null) => {
      if (settled) return;
      settled = true;
      const ok = code === 0 && !signal && !error;
      const result = recordStepResult({
        id,
        label,
        required,
        ok,
        status: ok ? 'success' : 'failed',
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAt,
        stdoutTruncated,
        stderrTruncated,
        error: error ? String(error.message || error).slice(0, 200) : null,
      });
      resolve({ ...result, stdout: stdoutBuf, stderr: stderrBuf });
    };
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const captured = appendBoundedText(stdoutBuf, text, stdoutLimit);
      stdoutBuf = captured.text;
      stdoutTruncated ||= captured.truncated;
      process.stdout.write(text); // ECOAR no terminal
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      const captured = appendBoundedText(stderrBuf, text, stderrLimit);
      stderrBuf = captured.text;
      stderrTruncated ||= captured.truncated;
      process.stderr.write(text); // ECOAR erros
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        log('✅', `${label} — OK`);
      } else {
        const detail = signal ? `signal ${signal}` : `exit code ${code}`;
        log('❌', `${label} — ${detail}`);
      }
      finalize(code, signal);
    });
    child.on('error', (err) => {
      log('❌', `${label} — ERRO: ${err.message.slice(0, 100)}`);
      finalize(null, null, err);
    });
  });
}

// ============================================================
// PIPELINE
// ============================================================

async function main() {
  const dryRunWorkspace = ZERO_WRITE_DRY_RUN ? createDryRunWorkspace() : null;
  if (dryRunWorkspace) activateDryRunWorkspace(dryRunWorkspace);

  try {
  console.log(`\n🚀 PIPELINE KINO CAMPUS — ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Estágios: ${ACTIVE_STAGES.join(', ').toUpperCase()}`);
  console.log(`  IG: ${WITH_IG ? '✅' : '❌'} | Curador: ${WITH_CURATOR ? '✅' : '❌'} | Duplicatas: ${WITH_DUPLICATES ? '✅' : '❌'} | Formatar: ${WITH_FORMAT ? '✅' : '❌'} | Publicar: ${WITH_PUBLISH ? '✅' : '❌'} | Enrich: ${WITH_ENRICH ? '✅' : '❌'}`);
  if (DRY_RUN) console.log(`  ⚠️  DRY-RUN — nada será publicado`);
  if (dryRunWorkspace) console.log('  🧪 ZERO-WRITE — caches e artefatos canônicos estão isolados');
  console.log();

  // ── STEP 1: Scan Instagram (se --ig) ──────────────────────────
  const igOutputFile = path.join(IG_DATA_DIR, `ig-browser-${TIMESTAMP}.json`);
  let igArtifact = null;
  if (WITH_IG) {
    log('📸', 'Iniciando scan Instagram via browser (perfis configurados)...');
    // A simulação comum mantém o atalho rápido. Em --full --dry-run, o detalhe
    // também é hidratado nos artefatos efêmeros para representar a coleta real.
    const igArgs = buildInstagramScanArgs();
    if (dryRunWorkspace) {
      igArgs.push('--output', PIPELINE_CHILD_ENV.CADU_PIPELINE_IG_ARTIFACT);
    } else {
      try { fs.unlinkSync(igOutputFile); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      PIPELINE_CHILD_ENV = {
        ...PIPELINE_CHILD_ENV,
        CADU_PIPELINE_IG_ARTIFACT: igOutputFile,
      };
    }
    const igStartedAt = Date.now();
    const igSupervisor = resolvePipelineInstagramSupervisorTimeout({
      dryRun: DRY_RUN,
      fullMode: FULL_MODE,
      env: PIPELINE_CHILD_ENV,
    });
    log(
      '⏱️',
      `Supervisor Instagram: ${Math.ceil(igSupervisor.timeoutMs / 60000)} min `
      + `(contrato ${Math.ceil(igSupervisor.contractMs / 60000)} min, `
      + `${igSupervisor.profileCount} ativos + até ${igSupervisor.discoveredProfileCap} descobertos)`,
    );
    const igResult = await runStep(
      nodeCommand(path.join(SCRIPTS_DIR, 'scan-ig-browser.js'), igArgs),
      'Instagram scan',
      { id: 'ig', required: true, timeoutMs: igSupervisor.timeoutMs }
    );
    if (igResult.ok) {
      try {
        igArtifact = JSON.parse(fs.readFileSync(igOutputFile, 'utf8'));
        const validation = validateRunArtifact(igArtifact, {
          kind: 'instagram-scan',
          version: '1.2.0',
          startedAtMs: igStartedAt,
        });
        if (!validation.ok) throw new Error(validation.issues.join(', '));
        const semanticValidation = validateInstagramArtifact(igArtifact, {
          expectedRunId: PIPELINE_RUN_ID,
          expectedDateBrt: TIMESTAMP,
          expectedStartedAt: PIPELINE_CHILD_ENV.CADU_PIPELINE_STARTED_AT,
          requireFullScope: true,
          expectedScope: 'all_active',
          requireDownstreamAck: true,
        });
        if (!semanticValidation.ok) {
          throw new Error(`semantic:${semanticValidation.issues.join(', ')}`);
        }
        const igStats = igArtifact.stats || {};
        const detailStats = igStats.detail || {};
        updatePipelineFunnelContext(null, {
          instagramProfilesExpected: igStats.profileCoverage?.expectedCount,
          instagramProfilesSuccessful: igStats.profileCoverage?.successfulCount,
          instagramProfilesFailed: igStats.profileCoverage?.failedCount,
          instagramPostOccurrences: igStats.totalPostOccurrences,
          instagramUniquePosts: igStats.uniquePosts,
          instagramDuplicatePostOccurrences: igStats.duplicatePostOccurrences,
          instagramRelevantOccurrences: igStats.totalRelevantOccurrences,
          instagramUniqueRelevant: igStats.uniqueRelevant,
          instagramDetailEligible: detailStats.eligible,
          instagramDetailRequested: detailStats.requested,
          instagramDetailReady: Number.isInteger(detailStats.succeeded)
            && Number.isInteger(detailStats.completedFromCache)
            ? detailStats.succeeded + detailStats.completedFromCache
            : null,
          instagramDetailSucceeded: detailStats.succeeded,
          instagramDetailCompletedFromCache: detailStats.completedFromCache,
          instagramDetailPartial: detailStats.partial,
          instagramDetailFailed: detailStats.failed,
          instagramDetailDeferred: detailStats.deferred,
          instagramDetailDeferredByBackoff: detailStats.deferredByBackoff,
        });
        if (semanticValidation.warnings?.length) {
          recordSyntheticStep('ig_health', 'Saúde da hidratação Instagram', {
            required: false,
            ok: false,
            status: 'failed',
            reason: `ig_health_partial:${semanticValidation.warnings.join(',')}`,
          });
        }
        stageInstagramSeenCheckpoint(igArtifact.seenCheckpoint, {
          expectedRelevanceVersion: igArtifact.relevanceVersion,
        });
      } catch (error) {
        igArtifact = null;
        // Soft for multi-stage: do not mark the whole Pipeline Completa as a
        // hard required failure when only the IG contract is bad. Web/event
        // curation still runs; overall outcome becomes partial if it succeeds.
        recordSyntheticStep('ig', 'Validação do artefato Instagram', {
          required: false,
          ok: false,
          exitCode: 1,
          status: 'failed',
          reason: `ig_artifact_invalid:${String(error.message || error).slice(0, 160)}`,
        });
      }
    }
    if (!igResult.ok || !igArtifact) {
      log('💥', 'Scan Instagram sem artefato íntegro desta execução; publicação será bloqueada');
      // Do not hand a corrupt/partial IG file to the curator. Web collection must
      // still run; Instagram is simply absent for this pipeline execution.
      try { fs.unlinkSync(igOutputFile); } catch (error) {
        if (error && error.code !== 'ENOENT') {
          log('⚠️', `Não foi possível remover artefato IG inválido: ${String(error.message || error).slice(0, 120)}`);
        }
      }
      if (PIPELINE_CHILD_ENV) {
        const nextEnv = { ...PIPELINE_CHILD_ENV, CADU_PIPELINE_IG_SKIP: '1' };
        delete nextEnv.CADU_PIPELINE_IG_ARTIFACT;
        PIPELINE_CHILD_ENV = nextEnv;
      }
      // Demote any prior required IG step (scanner exit non-zero) so a multi-stage
      // run can still finish web→publish as partial instead of hard-failed.
      // Isolated --stage=ig keeps the hard failure (only stage present).
      if (WITH_CURATOR || WITH_DUPLICATES || WITH_FORMAT || WITH_PUBLISH || WITH_ENRICH) {
        for (const step of pipelineSteps) {
          if (step.id === 'ig' && step.required && !step.ok) {
            step.required = false;
            step.reason = [step.reason, 'soft_continue_web_path'].filter(Boolean).join(';');
          }
        }
        log('↪️', 'IG ausente nesta run; estágios web/eventos seguem (outcome parcial se o restante ok)');
      }
    }
    // v4.5: Browser CDP roda dentro do openclaw container (CDP 18800).
    // NAO tentar matar daqui (chrome está em outro PID namespace, e pkill nao existe
    // em python:3.12-slim nem na imagem openclaw). O ensure-browser-cdp.py
    // é acionado sob demanda e pela manutenção horária; o scanner reconecta.
    log('🧹', 'Browser CDP mantido (auto-restart via ensure-browser-cdp.py)');
  }

  // ── STEP 2: Curador v4.4 (scan sites UFG) ─────────────────────
  let reportFile = null;
  let duplicateSourceReportFile = null;
  let report = null;
  let publishable = [];
  let trulyNew = [];
  let curatorCandidateCount = null;
  let alreadyPersistedCount = null;
  const trulyNewFile = path.join(DATA_DIR, `_truly_new_${TIMESTAMP}.json`);
  if (dryRunWorkspace && !WITH_CURATOR
      && (WITH_DUPLICATES || WITH_FORMAT || WITH_PUBLISH || (WITH_ENRICH && !ENRICH_IS_ISOLATED_STAGE))) {
    seedDryRunArtifact(
      path.join(CANONICAL_DATA_DIR, `_truly_new_${TIMESTAMP}.json`),
      trulyNewFile,
      '_truly_new canônico',
    );
  }

  if (!WITH_CURATOR) {
    log('⏭️', 'Curador pulado (estágios: ' + ACTIVE_STAGES.join(',') + ')');
  } else {
  const curadorMode = FULL_MODE ? '' : '--daily';
  const curadorModeName = curadorMode ? curadorMode.replace('--', '') : 'full';
  const curadorOutputFile = path.join(DATA_DIR, `curadoria-v4.4-${curadorModeName}-${TIMESTAMP}.json`);
  const curadorArgs = curadorMode ? [curadorMode] : [];
  if (DRY_RUN) curadorArgs.push('--dry-run');
  if (dryRunWorkspace) curadorArgs.push('--output', curadorOutputFile);
  if (!dryRunWorkspace) {
    try { fs.unlinkSync(curadorOutputFile); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const curadorCmd = nodeCommand(
    path.join(SCRIPTS_DIR, 'cadu-curador-v4.4.js'),
    curadorArgs,
  );
  const curatorStartedAt = Date.now();
  // 2026-07-15: run b08a5737 was SIGTERM'd at the default 900s while still on
  // Tier-2 (museu). Pipeline Completa already spends ~3min on IG; curator needs
  // headroom for Weby detail fetches. Env CADU_CURATOR_TIMEOUT_MS overrides.
  const multiStage = ACTIVE_STAGES.filter((s) => s !== 'curator').length > 0;
  const curatorTimeoutMs = resolvePipelineCuratorTimeout({
    fullMode: FULL_MODE,
    multiStage,
    env: PIPELINE_CHILD_ENV,
  });
  PIPELINE_CHILD_ENV = {
    ...PIPELINE_CHILD_ENV,
    CADU_CURATOR_TIMEOUT_MS: String(curatorTimeoutMs),
  };
  log(
    '⏱️',
    `Curador timeout=${Math.round(curatorTimeoutMs / 1000)}s `
      + `(mode=${FULL_MODE ? 'full' : 'daily'}, multi-stage=${multiStage})`,
  );
  const curadorOutput = await runStep(
    curadorCmd,
    `Curador v4.4 (${curadorMode || 'full'})`,
    { id: 'curator', required: true, timeoutMs: curatorTimeoutMs },
  );
  
  if (!curadorOutput.ok) {
    log('💥', 'Curador falhou — abortando pipeline');
    emitPipelineOutcome();
    process.exitCode = 1;
    return;
  }

  // O único artefato aceito é o caminho determinístico produzido por este run.
  // Nunca reutilize relatório de outro modo, dia ou execução.
  reportFile = fs.existsSync(curadorOutputFile) ? curadorOutputFile : null;
  duplicateSourceReportFile = reportFile;
  
  if (!reportFile) {
    log('💥', 'Nenhum relatório do curador encontrado');
    recordSyntheticStep('curator', 'Leitura do relatório do curador', {
      required: true,
      ok: false,
      exitCode: 1,
      reason: 'report_not_found',
    });
    emitPipelineOutcome();
    process.exitCode = 1;
    return;
  }
  
  log('📂', `Relatório: ${path.basename(reportFile)}`);
  report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  updatePipelineFunnelContext(report);
  const curatorValidation = validateRunArtifact(report, {
    kind: 'curator-report',
    version: '4.4',
    mode: curadorModeName,
    startedAtMs: curatorStartedAt,
    requireNonEmpty: true,
  });
  if (!curatorValidation.ok) {
    recordSyntheticStep('curator', 'Validação do relatório do curador', {
      required: true,
      ok: false,
      exitCode: 1,
      reason: `curator_artifact_invalid:${curatorValidation.issues.join(',')}`,
    });
    emitPipelineOutcome();
    process.exitCode = 1;
    return;
  }
  recordCuratorCoverageStep(report);
  reportFile = persistImmutableCuratorReport(DATA_DIR, report);
  duplicateSourceReportFile = reportFile;
  log('🔐', `Snapshot imutável da curadoria: ${path.basename(reportFile)}`);
  publishable = Array.isArray(report.publishable) ? report.publishable : [];
  curatorCandidateCount = publishable.length;
  updatePipelineFunnelContext(report, { curatorCandidates: curatorCandidateCount });
  
  log('📊', `Curador: ${report.stats?.totalItems || '?'} itens, ${publishable.length} publicáveis, ${(report.reviewable || []).length} revisão`);
  // Source health (2026-07-15): distinguish real empty fetches from catalog landings
  // without Weby feeds (pos.ufg.br/p/*) so partial coverage is actionable.
  if (report.stats && typeof report.stats === 'object') {
    const ok = report.stats.siteSourcesOk;
    const empty = report.stats.siteSourcesEmpty;
    const noFeed = report.stats.siteSourcesNoFeed;
    const quar = report.stats.siteSourcesQuarantined;
    if ([ok, empty, noFeed, quar].some((v) => v !== undefined && v !== null)) {
      log(
        '📡',
        `Fontes web: ok=${ok ?? '?'} vazias=${empty ?? '?'} no-feed=${noFeed ?? '?'} quarentena=${quar ?? '?'}`,
      );
    }
    const noFeedNames = Array.isArray(report.stats.noFeedSourceNames)
      ? report.stats.noFeedSourceNames
      : [];
    if (noFeedNames.length > 0) {
      log('ℹ️', `No-feed (${noFeedNames.length}): ${noFeedNames.slice(0, 24).join(', ')}${noFeedNames.length > 24 ? '…' : ''}`);
    }
    const emptyDetails = Array.isArray(report.stats.emptySourceDetails)
      ? report.stats.emptySourceDetails
      : [];
    const emptyNames = Array.isArray(report.stats.emptySourceNames)
      ? report.stats.emptySourceNames
      : [];
    if (emptyDetails.length > 0) {
      const detailSummary = emptyDetails
        .slice(0, 24)
        .map((entry) => `${entry.name || '?'}:${entry.reason || 'unknown'}`)
        .join(', ');
      log('⚠️', `Fontes sem itens (${emptyDetails.length}): ${detailSummary}${emptyDetails.length > 24 ? '…' : ''}`);
    } else if (emptyNames.length > 0) {
      log('⚠️', `Fontes vazias após fetch (${emptyNames.length}): ${emptyNames.slice(0, 24).join(', ')}${emptyNames.length > 24 ? '…' : ''}`);
    }
    const quarantineDetails = Array.isArray(report.stats.quarantinedSources)
      ? report.stats.quarantinedSources
      : [];
    if (quarantineDetails.length > 0) {
      const quarantineSummary = quarantineDetails
        .slice(0, 12)
        .map((entry) => (
          `${entry.id || entry.name || '?'}[${(entry.reviewIssues || []).join('|') || 'reason_unknown'}`
          + `;reviewAfter=${entry.reviewAfter || 'unknown'};due=${entry.reviewDue === true}]`
        ))
        .join(', ');
      log('🛡️', `Quarentena manual (${quarantineDetails.length}): ${quarantineSummary}`);
    }
  }

  // ── STEP 2.1: Filtrar itens já existentes no Supabase (cache) ──
  const CACHE_FILE = path.join(CANONICAL_DATA_DIR, '..', 'kino-posts-cache.json');
  const publishedSourceIndex = await loadPublishedSourceIndex(CACHE_FILE);
  const existingInstagramAcknowledgements = acknowledgeAlreadyPublishedInstagramPosts(
    igArtifact,
    publishedSourceIndex,
  );
  if (existingInstagramAcknowledgements.length > 0) {
    log(
      '✅',
      `${existingInstagramAcknowledgements.length} item(ns) Instagram já persistidos `
      + 'foram marcados como terminais',
    );
  }
  
  // Supabase ao vivo é a autoridade. Uma URL com sourceId divergente segue
  // para o publisher para que a mesclagem semântica seja decidida lá.
  trulyNew = publishable.filter(p => !shouldSkipPublishedItem(p, publishedSourceIndex));
  alreadyPersistedCount = publishable.length - trulyNew.length;
  
  if (trulyNew.length < publishable.length) {
    log('🔍', `${publishable.length - trulyNew.length} itens já existem no Supabase (pulados via cache)`);
  }
  
  // Replace publishable with truly new items for downstream steps
  report.publishable = trulyNew;
  report.stats.curatorCandidates = curatorCandidateCount;
  report.stats.alreadyPersisted = alreadyPersistedCount;
  report.stats.trulyNew = trulyNew.length;
  report.stats.publishable = trulyNew.length;
  
  // SALVA _truly_new para estágios posteriores (format, publish, enrich)
  // Fix 2026-06-24: _truly_new nunca era salvo → --stage=format quebrava
  const trulyNewArtifact = stampTrulyNewArtifact(report, trulyNew);
  writeJsonAtomic(trulyNewFile, trulyNewArtifact);
  report = trulyNewArtifact;
  updatePipelineFunnelContext(report, {
    curatorCandidates: curatorCandidateCount,
    alreadyPersisted: alreadyPersistedCount,
    trulyNew: trulyNew.length,
  });
  log('💾', `_truly_new_${TIMESTAMP}.json salvo (${trulyNew.length} itens)`);
  } // fecha else do WITH_CURATOR

  const hasDownstreamSelected = WITH_DUPLICATES || WITH_FORMAT || WITH_PUBLISH || WITH_ENRICH;
  if (!publishable.length && WITH_CURATOR && !hasDownstreamSelected) {
    log('✅', 'Nenhum item novo para publicar. Curador concluído.');
    printSummary(report, 0, 0, {
      curatorCandidates: curatorCandidateCount,
      alreadyPersisted: alreadyPersistedCount,
      trulyNew: trulyNew.length,
    });
    emitPipelineOutcome();
    return;
  }
  
  if (!trulyNew.length && WITH_CURATOR && !hasDownstreamSelected) {
    log('✅', 'Todos os itens publicáveis já existem no Supabase.');
    printSummary(report, 0, 0, {
      curatorCandidates: curatorCandidateCount,
      alreadyPersisted: alreadyPersistedCount,
      trulyNew: trulyNew.length,
    });
    emitPipelineOutcome();
    return;
  } else if (!trulyNew.length && WITH_CURATOR && WITH_DUPLICATES) {
    log('ℹ️', 'Todos os publicáveis já existem; mantendo duplicatas/updates antes de encerrar.');
  }
  
  // Estágios desacoplados só aceitam o _truly_new canônico, íntegro e fresco.
  // Não há fallback para relatórios antigos ou para curadoria de outra execução.
  if (!WITH_CURATOR
      && (WITH_DUPLICATES || WITH_FORMAT || WITH_PUBLISH || (WITH_ENRICH && !ENRICH_IS_ISOLATED_STAGE))) {
    if (fs.existsSync(trulyNewFile)) {
      const tn = JSON.parse(fs.readFileSync(trulyNewFile, 'utf8'));
      const validation = validateTrulyNewArtifact(tn);
      if (!validation.ok) {
        recordSyntheticStep('pipeline_input', 'Validação do _truly_new', {
          required: true,
          ok: false,
          exitCode: 1,
          reason: `truly_new_invalid:${validation.issues.join(',')}`,
        });
        emitPipelineOutcome();
        process.exitCode = 1;
        return;
      }
      trulyNew = tn.publishable;
      report = tn;
      curatorCandidateCount = nonNegativeCount(tn.stats?.curatorCandidates);
      alreadyPersistedCount = nonNegativeCount(tn.stats?.alreadyPersisted);
      updatePipelineFunnelContext(report, {
        curatorCandidates: curatorCandidateCount,
        alreadyPersisted: alreadyPersistedCount,
        trulyNew: trulyNew.length,
      });
      reportFile = trulyNewFile;
      if (WITH_DUPLICATES) {
        const resolvedSource = resolveFullCuratorReport(tn, {
          directories: [DATA_DIR, CANONICAL_DATA_DIR],
        });
        if (!resolvedSource.ok) {
          recordSyntheticStep('pipeline_input', 'Relatório completo para duplicatas', {
            required: true,
            ok: false,
            exitCode: 1,
            reason: `duplicate_source_invalid:${resolvedSource.issues.join(',')}`,
          });
          emitPipelineOutcome();
          process.exitCode = 1;
          return;
        }
        duplicateSourceReportFile = resolvedSource.file;
      }
      log('📂', `Carregados ${trulyNew.length} trulyNew de ${path.basename(trulyNewFile)} (sem curator)`);
    } else {
      log('💥', `${path.basename(trulyNewFile)} ausente. Rode o curador primeiro.`);
      recordSyntheticStep('pipeline_input', 'Entrada canônica da pipeline', {
        required: true,
        ok: false,
        exitCode: 1,
        reason: 'truly_new_not_found',
      });
      emitPipelineOutcome();
      process.exitCode = 1;
      return;
    }
  }
  
  // ── STEP 2b: Duplicatas (enriquecer posts existentes) ─────────
  // Fail-open + DEFER multi-stage (2026-07-15 evidence run 445545bc / PR #42):
  // Pipeline Completa was dying mid-duplicates (~100s of "Nenhum post existente")
  // with exit_code=null before format/publish — 7 publicáveis never published.
  // Isolated `--stage=duplicates` still runs here and remains required.
  // Multi-stage defers duplicates until AFTER format/publish/enrich.
  const duplicatesIsIsolatedStage = ACTIVE_STAGES.length === 1 && ACTIVE_STAGES[0] === 'duplicates';
  const deferDuplicatesToEnd = WITH_DUPLICATES && !duplicatesIsIsolatedStage && (WITH_FORMAT || WITH_PUBLISH);

  async function runDuplicatesStage() {
    if (!WITH_DUPLICATES) {
      log('⏭️', 'Enriquecimento de duplicatas pulado: estágio ou relatório indisponível (' + ACTIVE_STAGES.join(',') + ')');
      return { aborted: false };
    }
    if (!report) {
      recordSyntheticStep('duplicates', 'Enriquecimento de duplicatas', {
        required: duplicatesIsIsolatedStage,
        ok: !duplicatesIsIsolatedStage,
        status: duplicatesIsIsolatedStage ? 'blocked' : 'skipped',
        reason: 'curator_report_unavailable',
      });
      if (duplicatesIsIsolatedStage) {
        emitPipelineOutcome();
        process.exitCode = 1;
        return { aborted: true };
      }
      return { aborted: false };
    }

    // Prefer full curator report on disk (has discarded[]); fall back to in-memory report.
    let fullReport = report;
    let dupReportPath = duplicateSourceReportFile || reportFile;
    let temporaryDupReportPath = null;
    try {
      if (dupReportPath && fs.existsSync(dupReportPath)) {
        fullReport = JSON.parse(fs.readFileSync(dupReportPath, 'utf8'));
      }
    } catch (_) { /* use in-memory report */ }

    // `update` e `duplicate` são sinais independentes do curador. Um item com
    // ambos deve ser processado uma única vez; um update sem duplicate também
    // precisa chegar ao enriquecedor do post existente.
    let duplicates = selectDuplicateEnrichmentCandidates(fullReport.discarded);
    // Cap multi-stage work to avoid OOM/timeout killing the whole all-run.
    const maxDupEnv = parseInt(String(process.env.CADU_DUPLICATES_MAX || ''), 10);
    const maxDup = Number.isFinite(maxDupEnv) && maxDupEnv > 0
      ? maxDupEnv
      : (duplicatesIsIsolatedStage ? duplicates.length : 60);
    let duplicateRotation = null;
    if (duplicates.length > maxDup) {
      const cursorFile = path.join(CANONICAL_DATA_DIR, '_duplicate_enrichment_cursor.json');
      let lastIdentity = '';
      try {
        const cursor = JSON.parse(fs.readFileSync(cursorFile, 'utf8'));
        if (cursor?.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(String(cursor.lastIdentity || ''))) {
          lastIdentity = cursor.lastIdentity;
        }
      } catch (_) { /* first run or invalid cursor: start from the sorted beginning */ }
      duplicateRotation = selectRotatingDuplicateBatch(duplicates, maxDup, lastIdentity);
      log(
        '⚠️',
        `Duplicatas: lote rotativo ${duplicateRotation.batch.length}/${duplicateRotation.total}`
        + ` (início=${duplicateRotation.startIndex}, CADU_DUPLICATES_MAX / multi-stage cap)`,
      );
      duplicates = duplicateRotation.batch;
      // Write a slim temp report so enrich-duplicates does not scan 1000+ no-ops.
      const slimPath = path.join(DATA_DIR, `_dup_batch_${TIMESTAMP}.json`);
      writeJsonAtomic(slimPath, {
        ...withReducedDiscarded(fullReport, duplicates),
        publishable: Array.isArray(fullReport.publishable) ? fullReport.publishable : [],
      });
      dupReportPath = slimPath;
      temporaryDupReportPath = slimPath;
    }

    if (duplicates.length > 0) {
      log('🔄', `${duplicates.length} duplicatas — verificando atualizações...`);
      const enrichDupCmd = nodeCommand(
        path.join(SCRIPTS_DIR, 'enrich-duplicates.js'),
        [...(DRY_RUN ? ['--dry-run'] : []), dupReportPath],
      );
      // Multi-stage: 4 min budget so format/publish (already done if deferred) or remaining stages aren't starved.
      const dupTimeoutMs = duplicatesIsIsolatedStage ? 900000 : 240000;
      const duplicateResult = await runStep(enrichDupCmd, `Enriquecimento de duplicatas (${duplicates.length})`, {
        id: 'duplicates',
        required: duplicatesIsIsolatedStage,
        timeoutMs: dupTimeoutMs,
      });
      if (temporaryDupReportPath) {
        try { fs.unlinkSync(temporaryDupReportPath); } catch (_) {}
      }
      if (!duplicateResult.ok) {
        if (duplicatesIsIsolatedStage) {
          log('🛑', 'Duplicatas falhou (estágio isolado) — abortando');
          emitPipelineOutcome();
          process.exitCode = duplicateResult.exitCode || 2;
          return { aborted: true };
        }
        log('⚠️', 'Duplicatas falhou/timeout — fail-open (publicáveis novos não dependem deste estágio)');
      }
      // Advance after an attempted fail-open batch as well. Otherwise one
      // pathological item can pin the same first page forever and starve the
      // remaining backlog; failed work returns after a complete rotation.
      if (duplicateRotation?.nextCursor && !DRY_RUN) {
        try {
          writeJsonAtomic(
            path.join(CANONICAL_DATA_DIR, '_duplicate_enrichment_cursor.json'),
            buildDuplicateCursorState(duplicateRotation, { ok: duplicateResult.ok }),
          );
        } catch (error) {
          recordSyntheticStep('duplicates_cursor', 'Persistência do cursor de duplicatas', {
            required: false,
            ok: false,
            reason: `cursor_write_failed:${String(error?.message || error).slice(0, 120)}`,
          });
        }
      }
    } else {
      log('ℹ️', 'Nenhuma duplicata para processar');
      recordSyntheticStep('duplicates', 'Enriquecimento de duplicatas (0 itens)', {
        required: duplicatesIsIsolatedStage,
        ok: true,
        status: 'skipped',
        reason: 'no_duplicates',
      });
    }
    return { aborted: false };
  }

  // ── STEP 2c: Enrich-Instagram (Fix A + Fix B) ─────────────────
  // Fail-open: entre cross-match (STEP 2.5) e format (STEP 3). Roda:
  //   1. cache-instagram-images.js (Fix A): baixa imagens do IG via
  //      openclaw CDP e faz upload pro Supabase Storage (resolve
  //      only_temporary_or_svg_images).
  //   2. enrich-instagram-with-official-source.js (Fix B): mapeia
  //      handle IG → site oficial UFG (resolve
  //      instagram_without_official_source).
  // Ambos sao required:false (fail-open). Se qualquer um falhar,
  // trulyNew original e preservado para format/publish.
  async function runEnrichInstagramStage() {
    if (!WITH_ENRICH_IG) {
      log('⏭️', 'Enrich-Instagram pulado (estagios: ' + ACTIVE_STAGES.join(',') + ')');
      return { aborted: false };
    }
    if (!trulyNew || trulyNew.length === 0) {
      log('ℹ️', 'Enrich-Instagram: 0 itens trulyNew para enriquecer');
      recordSyntheticStep('enrich-instagram', 'Enrich-Instagram (0 itens)', {
        required: false,
        ok: true,
        status: 'skipped',
        reason: 'no_truly_new',
      });
      return { aborted: false };
    }

    let working = trulyNew;
    const allStats = { cache: null, enrich: null };

    // ── Fix A: cache-instagram-images ─────────────────────────
    log('📦', 'Cache de imagens Instagram (Fix A)...');
    const cacheInputFile = path.join(DATA_DIR, `_ig_cache_input_${TIMESTAMP}.json`);
    const cacheArgs = [path.join(SCRIPTS_DIR, 'cache-instagram-images.js')];
    if (DRY_RUN) cacheArgs.push('--dry-run');
    cacheArgs.push(cacheInputFile);
    writeJsonAtomic(cacheInputFile, { publishable: working });
    const cacheResult = await runStep(
      { command: process.execPath, args: cacheArgs },
      'Cache imagens Instagram (Fix A)',
      // 2026-07-24 (Fix J): 600s (10min) nao foi suficiente para 48+ itens IG
      // (cada imagem precisa navegar no browser CDP + canvas.toDataURL). 1800s
      // (30min) cobre 100+ itens com folga. cache-instagram-images.js tambem
      // faz flush incremental (checa cache local antes de re-baixar).
      { id: 'ig_image_cache', required: false, timeoutMs: 1800000 },
    );
    try { fs.unlinkSync(cacheInputFile); } catch (_) { /* best-effort */ }
    if (cacheResult.ok) {
      try {
        const cacheOutput = JSON.parse(cacheResult.stdout);
        if (Array.isArray(cacheOutput.items)) {
          working = cacheOutput.items;
          allStats.cache = cacheOutput.stats;
          log('✅', `Cache imagens: ${allStats.cache?.cached ?? 0}/${working.length} cacheadas`);
        } else {
          log('⚠️', 'Cache imagens: stdout sem array items — fail-open');
        }
      } catch (error) {
        log('⚠️', `Cache imagens: stdout invalido (${String(error.message || error).slice(0, 100)}) — fail-open`);
      }
    } else {
      log('⚠️', `Cache imagens falhou (exit ${cacheResult.exitCode ?? '?'}) — fail-open, Fix B ainda roda`);
    }

    // ── Fix B: enrich-instagram-with-official-source ────────
    log('🔗', 'Enrich Instagram com source oficial (Fix B)...');
    const enrichInputFile = path.join(DATA_DIR, `_enrich_ig_input_${TIMESTAMP}.json`);
    const enrichArgs = [path.join(SCRIPTS_DIR, 'enrich-instagram-with-official-source.js')];
    if (DRY_RUN) enrichArgs.push('--dry-run');
    enrichArgs.push(enrichInputFile);
    writeJsonAtomic(enrichInputFile, { publishable: working });
    const enrichResult = await runStep(
      { command: process.execPath, args: enrichArgs },
      'Enrich Instagram com source oficial (Fix B)',
      { id: 'ig_official_source', required: false, timeoutMs: 120000 },
    );
    try { fs.unlinkSync(enrichInputFile); } catch (_) { /* best-effort */ }
    if (enrichResult.ok) {
      try {
        const enrichOutput = JSON.parse(enrichResult.stdout);
        if (Array.isArray(enrichOutput.items)) {
          working = enrichOutput.items;
          allStats.enrich = enrichOutput.stats;
          log('✅', `Enrich Instagram: ${allStats.enrich?.enriched ?? 0}/${working.length} com source oficial`);
        } else {
          log('⚠️', 'Enrich Instagram: stdout sem array items — fail-open');
        }
      } catch (error) {
        log('⚠️', `Enrich Instagram: stdout invalido (${String(error.message || error).slice(0, 100)}) — fail-open`);
      }
    } else {
      log('⚠️', `Enrich Instagram falhou (exit ${enrichResult.exitCode ?? '?'}) — fail-open`);
    }

    // Persist updated trulyNew
    trulyNew = working;
    report.publishable = working;
    report.stats.publishable = working.length;
    if (allStats.cache || allStats.enrich) {
      report.stats.enrichInstagram = allStats;
    }
    const updatedArtifact = stampTrulyNewArtifact(report, working);
    writeJsonAtomic(trulyNewFile, updatedArtifact);
    log('💾', `_truly_new_${TIMESTAMP}.json atualizado com enrich-instagram`);
    // Fix P (2026-07-24): registrar stage pai `enrich-instagram` como success
    // para que `ensureSelectedStageCoverage` nao adicione um step sintetico
    // `selected_stage_missing_evidence`. Sem isso, o run termina como failed
    // mesmo com cache (Fix A) e enrich (Fix B) tendo rodado com sucesso
    // (sub-steps ig_image_cache + ig_official_source ficam success).
    const enrichOk = !!(allStats.cache || allStats.enrich);
    recordSyntheticStep('enrich-instagram', 'Enrich Instagram (cache + source oficial)', {
      required: false,
      ok: enrichOk,
      status: enrichOk ? 'success' : 'skipped',
      reason: enrichOk
        ? `cache=${allStats.cache?.cached ?? 0}/${allStats.cache?.processed ?? 0}; enrich=${allStats.enrich?.enriched ?? 0}/${allStats.enrich?.processed ?? 0}`
        : 'all_substeps_skipped',
    });
    return { aborted: false };
  }

  if (!deferDuplicatesToEnd) {
    const dupOutcome = await runDuplicatesStage();
    if (dupOutcome.aborted) return;
  } else {
    log('⏭️', 'Duplicatas adiado para o fim (multi-stage): format/publish primeiro');
  }

  // ── STEP 2.5: Cross-match com Instagram (se --ig) ──────────
  // Fail-open: cross-match enriches captions/images but must NEVER block format/publish.
  // Evidence: required cross_match failures previously set upstream_required_failure and
  // zeroed publications even when curator produced publicáveis.
  if (WITH_IG && WITH_CURATOR && trulyNew.length > 0) {
    const enrichedFile = path.join(DATA_DIR, `curadoria-enriquecida-${TIMESTAMP}.json`);
    if (!igArtifact) {
      recordSyntheticStep('ig_cross_match', 'Cross-match sites UFG ↔ Instagram', {
        required: false,
        ok: true,
        status: 'skipped',
        reason: 'current_run_ig_artifact_unavailable',
      });
      log('⚠️', 'Cross-match pulado (artefato IG ausente) — format usa trulyNew sem enrich IG');
    } else {
      try { fs.unlinkSync(enrichedFile); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const crossMatchArgs = [trulyNewFile, igOutputFile];
      if (DRY_RUN) crossMatchArgs.push('--dry-run');
      if (dryRunWorkspace) crossMatchArgs.push('--output', enrichedFile);
      log('🔗', `Cross-match: sites UFG ↔ Instagram (${path.basename(igOutputFile)})`);
      const crossMatchStartedAt = Date.now();
      const crossMatchResult = await runStep(
        nodeCommand(path.join(SCRIPTS_DIR, 'cross-matcher.js'), crossMatchArgs),
        'Cross-match sites UFG ↔ Instagram',
        { id: 'ig_cross_match', required: false, timeoutMs: 30000 },
      );
      if (crossMatchResult.ok) {
        try {
          const enriched = JSON.parse(fs.readFileSync(enrichedFile, 'utf8'));
          const validation = validateRunArtifact(enriched, {
            kind: 'cross-match',
            version: '1.0.0',
            startedAtMs: crossMatchStartedAt,
          });
          if (!validation.ok) throw new Error(validation.issues.join(', '));
          const enrichedTrulyNew = Array.isArray(enriched.publishable) ? enriched.publishable : [];
          const expected = identityState(trulyNew, 'cross_match_expected');
          const actual = identityState(enrichedTrulyNew, 'cross_match_actual');
          if (expected.issues.length || actual.issues.length
              || !sameIdentitySet(expected.identities, actual.identities)) {
            throw new Error('cross_match_identity_mismatch');
          }
          report = stampTrulyNewArtifact(report, enrichedTrulyNew);
          trulyNew = report.publishable;
          writeJsonAtomic(trulyNewFile, report);
          const matchCount = enriched.crossMatch?.matched || 0;
          log('✅', `Cross-match: ${matchCount}/${trulyNew.length} itens alimentaram o formatador`);
        } catch (error) {
          recordSyntheticStep('ig_cross_match', 'Validação do cross-match', {
            required: false,
            ok: false,
            exitCode: 1,
            reason: `cross_match_artifact_invalid:${String(error.message || error).slice(0, 120)}`,
          });
          log('⚠️', `Cross-match inválido — fail-open com trulyNew original: ${String(error.message || error).slice(0, 100)}`);
        }
      } else {
        log('⚠️', 'Cross-match falhou — fail-open: format/publish usam trulyNew sem enrich IG');
      }
    }
  }

  // ── STEP 2c: Enrich-Instagram (Fix A + Fix B) ─────────────────
  // Roda entre cross-match e format. Cacheia imagens IG (Fix A) e
  // adiciona source oficial UFG aos items vindos do Instagram (Fix B),
  // destravando os 2 principais bloqueios da Edge Function cadu-publish.
  await runEnrichInstagramStage();

  // ── STEP 3: Formatação IA (obrigatória via --publish/--format) ─
  let formattedItems = trulyNew;
  let formatFailed = false;
  const formattedFile = path.join(DATA_DIR, `_formatted_${TIMESTAMP}.json`);
  if (dryRunWorkspace && !WITH_FORMAT && (WITH_PUBLISH || WITH_ENRICH)) {
    seedDryRunArtifact(
      path.join(CANONICAL_DATA_DIR, `_formatted_${TIMESTAMP}.json`),
      formattedFile,
      '_formatted canônico',
    );
  }
  
  if (WITH_FORMAT && hasRequiredFailure()) {
    formatFailed = true;
    formattedItems = [];
    recordSyntheticStep('format', 'Formatação bloqueada por falha anterior', {
      required: true,
      ok: false,
      status: 'blocked',
      reason: 'upstream_required_failure',
    });
  } else if (!WITH_FORMAT) {
    log('⏭️', 'Formatador pulado (estágios: ' + ACTIVE_STAGES.join(',') + ')');
    if (ACTIVE_STAGES.includes('format') || ACTIVE_STAGES.includes('publish') || ACTIVE_STAGES.includes('enrich')) {
      // Modo stage: precisa carregar formattedItems do disco
      const stageFormatted = formattedFile;
      if (trulyNew.length === 0) {
        formattedItems = [];
        log('ℹ️', 'Formatted ignorado: _truly_new do dia está vazio');
      } else if (fs.existsSync(stageFormatted)) {
        const f = JSON.parse(fs.readFileSync(stageFormatted, 'utf8'));
        const validation = validateFormattedArtifact(f, trulyNew, {
          sourceArtifact: path.basename(trulyNewFile),
          sourceContentSha256: report.artifactContract.contentSha256,
          sourceRunId: report.artifactContract.runId,
          sourceMtimeMs: fs.statSync(trulyNewFile).mtimeMs,
        });
        if (validation.ok && f.items.length > 0) {
          formattedItems = f.items;
          log('📂', `Carregados ${formattedItems.length} itens formatados de ${path.basename(stageFormatted)}`);
          if (validation.failedFormattingIdentities.length > 0) {
            const failureSummary = formatFailureSummary(f.formatFailures);
            recordSyntheticStep('format_provider', 'Formatação parcial preservada no artefato', {
              required: false,
              ok: false,
              reason: `partial_provider_failure:${failureSummary}`,
            });
            log('⚠️', `Artefato de formatação degradado: ${failureSummary}`);
          }
        } else if (validation.ok && f.items.length === 0 && f.reason === 'all_already_published') {
          formattedItems = [];
          recordSyntheticStep('format', 'Artefato do formatador (sem itens)', {
            required: true,
            ok: true,
            status: 'skipped',
            reason: f.reason,
          });
        } else {
          formatFailed = true;
          formattedItems = [];
          log('💥', `Artefato formatado rejeitado: ${validation.issues.join(', ')}`);
          recordSyntheticStep('format', 'Artefato do formatador', {
            required: true,
            ok: false,
            exitCode: 1,
            reason: 'formatted_artifact_invalid',
          });
        }
      } else {
        log('⚠️', `Arquivo ${path.basename(stageFormatted)} nao encontrado. Rodar --stage=format antes.`);
        formatFailed = true;
        formattedItems = [];
        recordSyntheticStep('format', 'Artefato do formatador', {
          required: true,
          ok: false,
          exitCode: 1,
          reason: 'formatted_artifact_not_found',
        });
      }
    }
  } else if (WITH_FORMAT && trulyNew.length === 0) {
    log('ℹ️', 'Formatador: 0 itens trulyNew para formatar');
    recordSyntheticStep('format', 'Formatador IA (0 itens)', {
      required: true,
      ok: true,
      status: 'skipped',
      reason: 'no_truly_new',
    });
    const emptyArtifact = stampFormattedArtifact({
      items: [],
      generatedAt: new Date().toISOString(),
      source: path.basename(trulyNewFile),
      reason: 'no_truly_new',
    }, {
      sourceArtifact: path.basename(trulyNewFile),
      sourceContentSha256: report.artifactContract.contentSha256,
      sourceRunId: report.artifactContract.runId,
      expectedItems: trulyNew,
    });
    if (!emptyArtifact.ok) throw new Error(`Falha ao selar artefato vazio: ${emptyArtifact.issues.join(', ')}`);
    writeJsonAtomic(formattedFile, emptyArtifact.artifact);
    log('💾', `${path.basename(formattedFile)} salvo vazio (no-op)`);
  } else if (WITH_FORMAT && trulyNew.length > 0) {
    let needsFormatting = trulyNew;
    let alreadyPublished = [];

    // Autoridade única e fail-closed: se a paginação viva do Supabase não
    // puder ser concluída e reconciliada, nada segue como se fosse novo.
    const CACHE_FILE_FORMAT = path.join(CANONICAL_DATA_DIR, '..', 'kino-posts-cache.json');
    const confirmedPublishedSourceIndex = await loadPublishedSourceIndex(CACHE_FILE_FORMAT);
    needsFormatting = trulyNew.filter(
      item => !shouldSkipPublishedItem(item, confirmedPublishedSourceIndex),
    );
    alreadyPublished = trulyNew.filter(
      item => shouldSkipPublishedItem(item, confirmedPublishedSourceIndex),
    );
    acknowledgeTerminalInstagramItems(alreadyPublished);
    if (alreadyPublished.length > 0) {
      log('📋', `${alreadyPublished.length} itens confirmados como já publicados; não voltarão ao formatador`);
    }
    
    // Se não há itens novos, pula formatação
    let tempFile = null;
    if (needsFormatting.length === 0) {
      log('⏭️', 'Nenhum item novo para formatar — todos já publicados (ou dedup já cobriu)');
      // FIX 2026-06-25: nao publicar itens sem formattedDescription.
      // Quando o pre-check marca 100% como alreadyPublished (falso positivo ou URL duplicada),
      // precisamos GARANTIR que eles nao vao pro publish — senao o publisher rejeita todos
      // com "sem formattedDescription (0ch)" (vide run 49c7ccec - 7 erros).
      // O dedup stage (Stage 2) ja atualizou capas/metadata dos posts existentes.
      formattedItems = [];
      const skippedArtifact = stampFormattedArtifact({
        items: [],
        generatedAt: new Date().toISOString(),
        source: path.basename(trulyNewFile),
        skippedAlreadyPublished: alreadyPublished.length,
        reason: 'all_already_published',
      }, {
        sourceArtifact: path.basename(trulyNewFile),
        sourceContentSha256: report.artifactContract.contentSha256,
        sourceRunId: report.artifactContract.runId,
        expectedItems: trulyNew,
        skippedAlreadyPublished: alreadyPublished,
      });
      if (!skippedArtifact.ok) {
        throw new Error(`Falha ao reconciliar itens já publicados: ${skippedArtifact.issues.join(', ')}`);
      }
      writeJsonAtomic(formattedFile, skippedArtifact.artifact);
      log('💾', `${path.basename(formattedFile)} salvo vazio (todos ja publicados)`);
      recordSyntheticStep('format', 'Formatador IA (itens já publicados)', {
        required: true,
        ok: true,
        status: 'skipped',
        reason: 'all_already_published',
      });
    } else {
    log('🤖', `Formatando ${needsFormatting.length} itens com o provedor IA configurado...`);
    
    // Write needsFormatting items to temp file for formatador
    tempFile = path.join(DATA_DIR, `_temp_format_${TIMESTAMP}.json`);
    writeJsonAtomic(tempFile, { publishable: needsFormatting }, { space: 0 });

    try {
      if (fs.existsSync(formattedFile)) {
        fs.unlinkSync(formattedFile);
        log('🧹', `Artefato anterior ${path.basename(formattedFile)} invalidado antes da formatação`);
      }
    } catch (e) {
      formatFailed = true;
      formattedItems = [];
      recordSyntheticStep('format', 'Invalidação do artefato anterior', {
        required: true,
        ok: false,
        exitCode: 1,
        reason: 'formatted_artifact_invalidation_failed',
      });
      log('💥', `Não foi possível invalidar artefato anterior: ${e.message.slice(0, 100)}`);
    }

    const formatResult = formatFailed ? null : await runStep(
      nodeCommand(path.join(SCRIPTS_DIR, 'formatador-ia.js'), [tempFile, '--output', formattedFile]),
      `Formatador IA (${trulyNew.length} itens)`,
      { id: 'format', required: true },
    );

    if (formatResult && formatResult.ok) {
      let validationIssues = [];
      try {
        if (!fs.existsSync(formattedFile)) {
          validationIssues.push('formatted_artifact_not_created');
        } else {
          const formatted = JSON.parse(fs.readFileSync(formattedFile, 'utf8'));
          const classification = classifyFormatterOutput(needsFormatting, formatted.items || []);
          validationIssues.push(...classification.issues);
          if (classification.zeroSuccess) validationIssues.push('formatter_zero_success');
          if (classification.integrityOk && !classification.zeroSuccess) {
            const artifact = {
              ...formatted,
              items: classification.successfulItems,
              formatFailures: classification.failures,
              formatterSummary: {
                attempted: needsFormatting.length,
                succeeded: classification.successfulItems.length,
                failed: classification.failedItems.length,
              },
            };
            const stamped = stampFormattedArtifact(artifact, {
              sourceArtifact: path.basename(trulyNewFile),
              sourceContentSha256: report.artifactContract.contentSha256,
              sourceRunId: report.artifactContract.runId,
              expectedItems: trulyNew,
              skippedAlreadyPublished: alreadyPublished,
              failedFormatting: classification.failedItems,
            });
            validationIssues.push(...stamped.issues);
            if (stamped.ok) {
              writeJsonAtomic(formattedFile, stamped.artifact);
              formattedItems = stamped.artifact.items;
              log('✅', `${formattedItems.length}/${needsFormatting.length} itens formatados e reconciliados`);
              if (classification.partial) {
                const failureSummary = formatFailureSummary(classification.failures);
                recordSyntheticStep('format_provider', 'Falha parcial do provedor de formatação', {
                  required: false,
                  ok: false,
                  reason: `partial_provider_failure:${failureSummary}`,
                });
                log('⚠️', `Formatação parcial; somente itens válidos seguirão para publicação: ${failureSummary}`);
              }
            }
          }
        }
      } catch (e) {
        validationIssues.push(`formatted_artifact_read_failed:${e.message.slice(0, 80)}`);
      }
      if (validationIssues.length > 0) {
        formatFailed = true;
        formattedItems = [];
        recordSyntheticStep('format', 'Validação do resultado do formatador', {
          required: true,
          ok: false,
          exitCode: 1,
          reason: 'invalid_or_partial_output',
        });
        log('💥', `Resultado do formatador rejeitado: ${[...new Set(validationIssues)].join(', ')}`);
      }
    } else if (formatResult) {
      formatFailed = true;
      formattedItems = [];
      try {
        if (fs.existsSync(formattedFile)) {
          const failedOutput = JSON.parse(fs.readFileSync(formattedFile, 'utf8'));
          const classification = classifyFormatterOutput(needsFormatting, failedOutput.items || []);
          if (classification.failures.length > 0) {
            const failureSummary = formatFailureSummary(classification.failures);
            recordSyntheticStep('format_provider', 'Falha do provedor de formatação', {
              required: false,
              ok: false,
              reason: `provider_failure:${failureSummary}`,
            });
            log('💥', `Provedor não formatou nenhum item: ${failureSummary}`);
          }
        }
      } catch (e) {
        log('⚠️', `Não foi possível ler a evidência da falha do formatador: ${e.message.slice(0, 80)}`);
      }
      log('💥', 'Formatador falhou — publicação bloqueada para evitar conteúdo não formatado');
    }
    } // end else (needsFormatting > 0)
    
    // ── POST-FORMAT: Scrub past dates from descriptions ──
    // Fix 2026-06-24: Edge Function quality gate bloqueia deadline_past/event_past.
    // Remove datas vencidas das descrições formatadas para evitar QUALITY_BLOCKED.
    if (formattedItems.length > 0) {
      const hojeStr = isoDateInTimeZone();
      const currentYearBrt = Number(hojeStr.slice(0, 4));
      let scrubbedCount = 0;
      
      const meses = {janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
      const dateRegex = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(de\s+)?(20\d{2})?\b/gi;
      
      for (const item of formattedItems) {
        const desc = item.formattedDescription || item.description || '';
        let changed = false;
        let newDesc = desc;
        
        newDesc = newDesc.replace(dateRegex, (match, dia, mesNome, _, ano) => {
          const mesIdx = meses[mesNome.toLowerCase()] || 1;
          const anoNum = ano ? parseInt(ano) : currentYearBrt;
          const dataStr = `${anoNum}-${String(mesIdx).padStart(2,'0')}-${String(parseInt(dia)).padStart(2,'0')}`;
          if (dataStr < hojeStr) {
            changed = true;
            return '';
          }
          return match;
        });
        
        if (changed) {
          newDesc = newDesc.replace(/\*\*\s+\*\*/g, '');
          newDesc = newDesc.replace(/📅\s*\n?/g, '');
          newDesc = newDesc.replace(/\n{3,}/g, '\n\n');
          newDesc = newDesc.replace(/\s{2,}/g, ' ');
          newDesc = newDesc.trim();
          item.formattedDescription = newDesc;
          item.description = newDesc;
          scrubbedCount++;
        }
      }
      if (scrubbedCount > 0) {
        log('🧹', `${scrubbedCount} descrições tiveram datas vencidas removidas`);
        // Publish desacoplado deve consumir exatamente o estado saneado desta
        // etapa. Re-sela o artefato (incluindo hash) depois da mutação em
        // memória. Um dry-run não isolado jamais altera o arquivo canônico.
        if (!DRY_RUN || dryRunWorkspace) {
          const persisted = JSON.parse(fs.readFileSync(formattedFile, 'utf8'));
          persisted.items = formattedItems;
          const resealed = resealFormattedArtifact(persisted);
          writeJsonAtomic(formattedFile, resealed);
          log('💾', `${path.basename(formattedFile)} re-selado após saneamento de datas`);
        } else {
          log('🏷️', 'DRY-RUN: saneamento validado em memória; artefato canônico permaneceu inalterado');
        }
      }
    }
    
    // Cleanup temp file
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
  }

  // O enriquecimento adicional de links via browser foi removido: o helper
  // nunca existiu neste repositório e gerava uma falha opcional por item UFG.
  // Os links oficiais extraídos pelo curador continuam preservados no artefato.

  // ── STEP 4: Publicação (se --publish) ────────────────────────
  let published = 0;
  let publishErrors = 0;
  let qualityBlocked = 0;   // FIX 2026-07-02: decisao editorial, NAO falha tecnica
  let technicalErrors = 0;  // FIX 2026-07-02: erros de HTTP/JSON/etc → exit 2
  let qualityReviewCount = WITH_PUBLISH ? 0 : null;
  let publishEvaluatedCount = WITH_PUBLISH ? 0 : null;
  let publishCreatedCount = WITH_PUBLISH ? 0 : null;
  let publishMergedCount = WITH_PUBLISH ? 0 : null;
  let publishPendingCount = WITH_PUBLISH ? 0 : null;
  let publishedRunItems = [];
  
  if (WITH_PUBLISH && hasRequiredFailure()) {
    recordSyntheticStep('publish', 'Publicação bloqueada por falha anterior', {
      required: true,
      ok: false,
      status: 'blocked',
      reason: 'upstream_required_failure',
    });
  } else if (WITH_PUBLISH && formatFailed) {
    log('🚫', 'Publicação não executada porque a etapa obrigatória de formatação falhou');
    recordSyntheticStep('publish', 'Publicação bloqueada', {
      required: true,
      ok: false,
      status: 'blocked',
      reason: 'format_failed',
    });
  } else if (WITH_PUBLISH && formattedItems.length > 0) {
    const skippedForQuality = [];
    const publishItems = [];
    for (const item of formattedItems) {
      const issues = publishReadinessIssues(item);
      if (issues.length) {
        skippedForQuality.push({
          title: item.title,
          sourceUrl: item.sourceUrl || item.url || item.link || '',
          module: item.module,
          issues,
          reasons: item.reasons || [],
          dates: item.dates || {},
        });
      } else {
        publishItems.push(item);
      }
    }
    qualityReviewCount = skippedForQuality.length;
    updatePipelineFunnelContext(report, {
      curatorCandidates: curatorCandidateCount,
      alreadyPersisted: alreadyPersistedCount,
      trulyNew: trulyNew.length,
      qualityReview: qualityReviewCount,
    });

    if (skippedForQuality.length > 0) {
      const skippedFile = path.join(DATA_DIR, `_publish_skipped_quality_${TIMESTAMP}.json`);
      writeJsonAtomic(skippedFile, {
        generatedAt: new Date().toISOString(),
        skipped: skippedForQuality,
      });
      log('🚧', `${skippedForQuality.length} itens enviados para revisão antes do publish (${path.basename(skippedFile)})`);
    }

    if (publishItems.length === 0) {
      log('ℹ️', 'Publicação: nenhum item apto após filtro de qualidade');
      recordSyntheticStep('publish', 'Publicação (0 itens aptos)', {
        required: true,
        ok: true,
        status: 'skipped',
        reason: 'no_quality_approved_items',
      });
    } else {
    // Write formatted items for publish_auto_v5
    const publishFile = path.join(DATA_DIR, `_temp_publish_${TIMESTAMP}.json`);
    const publisherItems = publishItems.map(buildPublisherItem);
    publishEvaluatedCount = publisherItems.length;
    updatePipelineFunnelContext(report, {
      publishEvaluated: publishEvaluatedCount,
    });
    writeJsonAtomic(publishFile, {
      publishable: publisherItems,
    }, { space: 0 });
    
    const publishCmd = nodeCommand(
      path.join(SCRIPTS_DIR, 'publish_auto_v5.js'),
      [...(DRY_RUN ? ['--dry-run'] : []), publishFile],
    );
    
    log('📤', `${DRY_RUN ? 'DRY-RUN' : 'PUBLICANDO'} ${publishItems.length} itens...`);
    const publishResult = await runStep(publishCmd, `Publicação (${publishItems.length} itens)`, {
      id: 'publish',
      required: true,
    });
    
    const publishValidation = validatePublishSummary(publishResult.stdout, publisherItems, {
      dryRun: DRY_RUN,
    });
    if (publishValidation.ok) {
      const summary = publishValidation.summary;
      published = summary.published;
      publishCreatedCount = summary.published;
      publishMergedCount = summary.merged;
      publishPendingCount = summary.pending;
      publishErrors = summary.errors;
      publishedRunItems = attachEnrichmentContext([
        ...summary.items.published,
        ...summary.items.merged,
      ], publisherItems);
      acknowledgeTerminalInstagramItems(resolveTerminalPublisherItems(summary, publisherItems));
      // QUALITY_BLOCKED é decisão editorial; qualquer outro registro de erro é técnico.
      const errItems = summary.items.errors;
      qualityBlocked = errItems.filter(e => e?.code === 'QUALITY_BLOCKED').length;
      technicalErrors = errItems.filter(e => e?.code !== 'QUALITY_BLOCKED').length;
      updatePipelineFunnelContext(report, {
        qualityReview: qualityReviewCount + qualityBlocked,
        publishEvaluated: publishEvaluatedCount,
        created: publishCreatedCount,
        merged: publishMergedCount,
        pending: publishPendingCount,
      });
    } else {
      publishCreatedCount = null;
      publishMergedCount = null;
      publishPendingCount = null;
      technicalErrors = 1;
      publishErrors = 1;
      updatePipelineFunnelContext(report, {
        qualityReview: qualityReviewCount,
        publishEvaluated: publishEvaluatedCount,
        created: null,
        merged: null,
        pending: null,
      });
      log('💥', `Resumo estruturado da publicação rejeitado: ${publishValidation.issues.join(', ')}`);
    }
    if (!publishResult.ok && technicalErrors === 0) {
      technicalErrors = 1;
      publishErrors = Math.max(publishErrors, 1);
    }
    if (publishErrors > qualityBlocked && technicalErrors === 0) {
      technicalErrors = publishErrors - qualityBlocked;
    }
    
    try { fs.unlinkSync(publishFile); } catch (_) {}
    }
  } else if (WITH_PUBLISH) {
    recordSyntheticStep('publish', 'Publicação (0 itens)', {
      required: true,
      ok: true,
      status: 'skipped',
      reason: 'no_items',
    });
  }

  // ── STEP 4b: Duplicatas adiadas (multi-stage) ───────────────
  // Roda depois de format/publish para não matar a pipeline com 1000+ no-ops.
  if (deferDuplicatesToEnd) {
    const dupOutcome = await runDuplicatesStage();
    if (dupOutcome.aborted) return;
  }

  // ── STEP 5: Enriquecimento de Imagens (se --publish) ───────
  let enrichedImages = 0;
  const enrichItems = buildEnrichItems(publishedRunItems);
  
  if (WITH_ENRICH && ENRICH_IS_ISOLATED_STAGE) {
    const configuredCount = Number(process.env.CADU_ENRICH_RECENT_COUNT);
    const recentCount = Number.isInteger(configuredCount) && configuredCount >= 1 && configuredCount <= 100
      ? configuredCount
      : 10;
    const enrichResult = await runStep(
      nodeCommand(
        path.join(SCRIPTS_DIR, 'enrich-images.js'),
        buildIsolatedEnrichArgs({ dryRun: DRY_RUN, count: recentCount }),
      ),
      `Enriquecimento isolado dos ${recentCount} posts recentes`,
      { id: 'enrich', required: true },
    );
    if (enrichResult.ok) {
      const parsedOutput = parseEnrichOutput(enrichResult.stdout);
      if (!parsedOutput.ok) {
        recordSyntheticStep('enrich_output', 'Saída do enriquecimento isolado', {
          required: true,
          ok: false,
          reason: parsedOutput.reason,
        });
      } else {
        const enrichSummary = summarizeEnrichResults(parsedOutput.results);
        enrichedImages = enrichSummary.enriched;
        if (enrichSummary.errors > 0) {
          recordSyntheticStep('enrich_items', 'Enriquecimento isolado parcial', {
            required: false,
            ok: false,
            reason: `${enrichSummary.errors}_of_${enrichSummary.total}_items_failed`,
          });
        }
      }
    }
  } else if (WITH_ENRICH && DRY_RUN) {
    // enrich-images possui uma guarda --dry-run segura, mas só consegue
    // avaliar registros que já tenham postId. O publisher dry-run atual não
    // cria nem expõe esses IDs para itens novos; sem eles, este estágio fica
    // explicitamente bloqueado em vez de simular sucesso.
    if (enrichItems.length > 0) {
      const enrichFile = path.join(DATA_DIR, `_temp_enrich_${TIMESTAMP}.json`);
      writeJsonAtomic(enrichFile, { items: enrichItems }, { space: 0 });
      try {
        await runStep(
          nodeCommand(path.join(SCRIPTS_DIR, 'enrich-images.js'), ['--dry-run', '--file', enrichFile]),
          `Enriquecimento de imagens dry-run (${enrichItems.length} fontes)`,
          { id: 'enrich', required: ENRICH_STEP_REQUIRED },
        );
      } finally {
        try { fs.unlinkSync(enrichFile); } catch (_) {}
      }
    } else {
      log('🛑', 'DRY-RUN: enrich bloqueado — publisher não fornece postId persistido para itens novos');
      recordSyntheticStep('enrich', 'Enriquecimento de imagens dry-run', {
        required: ENRICH_STEP_REQUIRED,
        ok: false,
        status: 'blocked',
        reason: 'dry_run_requires_persisted_post_ids',
      });
    }
  } else if (WITH_ENRICH && enrichItems.length > 0) {
    log('🖼️', 'Enriquecendo imagens complementares dos posts publicados/mesclados...');
    
    const enrichFile = path.join(DATA_DIR, `_temp_enrich_${TIMESTAMP}.json`);
    writeJsonAtomic(enrichFile, { items: enrichItems }, { space: 0 });

    const enrichCmd = nodeCommand(path.join(SCRIPTS_DIR, 'enrich-images.js'), ['--file', enrichFile]);
    const enrichResult = await runStep(enrichCmd, `Enriquecimento de imagens (${enrichItems.length} fontes)`, {
      id: 'enrich',
      required: ENRICH_STEP_REQUIRED,
    });
      
    if (enrichResult.ok) {
      const parsedOutput = parseEnrichOutput(enrichResult.stdout);
      if (!parsedOutput.ok) {
        log('⚠️', 'Enrich terminou sem o array de resultado obrigatório');
        recordSyntheticStep('enrich_output', 'Saída do enriquecimento de imagens', {
          required: ENRICH_STEP_REQUIRED,
          ok: false,
          reason: parsedOutput.reason,
        });
      } else {
        const enrichSummary = summarizeEnrichResults(parsedOutput.results);
        enrichedImages = enrichSummary.enriched;
        if (enrichSummary.errors > 0) {
          recordSyntheticStep('enrich_items', 'Enriquecimento parcial de imagens', {
            required: false,
            ok: false,
            reason: `${enrichSummary.errors}_of_${enrichSummary.total}_items_failed`,
          });
        }
      }
    }

    try { fs.unlinkSync(enrichFile); } catch (_) {}
  } else if (WITH_ENRICH && publishedRunItems.length > 0) {
    log('⚠️', 'Enriquecimento bloqueado: publisher não retornou postId/sourceUrl dos itens do run');
    recordSyntheticStep('enrich', 'Enriquecimento de imagens', {
      required: ENRICH_STEP_REQUIRED,
      ok: false,
      status: 'blocked',
      reason: 'publisher_result_missing_post_identity',
    });
  } else if (WITH_ENRICH) {
    recordSyntheticStep('enrich', 'Enriquecimento de imagens (0 posts publicados/mesclados)', {
      required: ENRICH_STEP_REQUIRED,
      ok: true,
      status: 'skipped',
      reason: 'no_published_or_merged_posts_in_run',
    });
  }

  // ── STEP 6 (F2 B6, 2026-07-06): Deduplicação inline pós-publish ─
  // Antes o `dedup-kino.js` rodava SÓ em cron diário → posts duplicados
  // ficavam visíveis no site por horas/dias. Agora roda inline ao final
  // do publish (mesma sessão), fechando a janela de duplicação.
  // Usa --no-llm (sem IA) + --days=7 (lookback curto) pra ser rápido.
  if (WITH_PUBLISH && (published > 0 || qualityBlocked > 0) && !DRY_RUN) {
    log('🔁', 'Dedup inline pós-publish (--no-llm --days=7 --auto-apply) — fecha janela de duplicação visível');
    // Fix Y (2026-07-25): passa --auto-apply para dedup-kino.js aplicar hides/flags
    // ANTES: sem flag, dedup rodava em DRY-RUN, reportava 9 hiddens mas NAO aplicava.
    // DEPOIS: --auto-apply garante aplicação quando rodado inline pelo pipeline.
    const dedupCmd = nodeCommand(path.join(SCRIPTS_DIR, 'dedup-kino.js'), ['--no-llm', '--days=7', '--auto-apply']);
    try {
      const dedupResult = await runStep(dedupCmd, 'Dedup inline', {
        id: 'dedup',
        required: false,
      });
      // (dedupResult é std-out string; log aparece no run, nao precisa parsear)
    } catch (e) {
      log('⚠️', `Dedup inline falhou (publicação já foi ok, dedup roda em cron depois): ${e.message ? e.message.slice(0, 80) : 'unknown'}`);
    }
  } else if (WITH_PUBLISH && (published > 0 || qualityBlocked > 0) && DRY_RUN) {
    log('ℹ️', 'DRY-RUN: dedup inline pulado (rodar com --no-dry-run em prod)');
  }

  // ── FINAL SUMMARY ────────────────────────────────────────────
  printSummary(report || {}, published, enrichedImages, {
    curatorCandidates: curatorCandidateCount,
    alreadyPersisted: alreadyPersistedCount,
    trulyNew: report ? trulyNew.length : null,
    qualityReview: Number.isInteger(qualityReviewCount)
      ? qualityReviewCount + qualityBlocked
      : null,
    publishEvaluated: publishEvaluatedCount,
    created: publishCreatedCount,
    merged: publishMergedCount,
    pending: publishPendingCount,
  });
  if (WITH_PUBLISH && publishErrors > 0) {
    // FIX 2026-07-02: QUALITY_BLOCKED e separado de erros tecnicos.
    // Se TODOS os erros foram decisao editorial (deadline_past, etc),
    // exit 0 (success) e log mostra quantos foram rejeitados.
    // So marca como failed (exit 2) se houver erros tecnicos reais.
    if (technicalErrors > 0) {
      log('❌', `Publish terminou com ${technicalErrors} erro(s) tecnico(s) + ${qualityBlocked} bloqueio(s) de qualidade; marcando run como falho`);
      if (!pipelineSteps.some(step => step.id === 'publish' && !step.ok)) {
        recordSyntheticStep('publish', 'Validação do resultado de publicação', {
          required: true,
          ok: false,
          exitCode: 2,
          reason: 'technical_publish_errors',
        });
      }
    } else if (qualityBlocked > 0) {
      log('⚠️', `Publish rejeitou ${qualityBlocked} item(ns) por barreira de qualidade editorial (NAO falhou); run OK`);
      // process.exitCode permanece 0 (success)
    }
  }
  const outcome = emitPipelineOutcome();
  if (outcome.status === 'failed') process.exitCode = process.exitCode || 2;
  } finally {
    cleanupDryRunWorkspace(dryRunWorkspace);
  }
}

function printSummary(report, published, enrichedImages = 0, funnelState = {}) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  const funnel = updatePipelineFunnelContext(report, funnelState);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PIPELINE CONCLUÍDO em ${elapsed}s`);
  console.log(`${'='.repeat(60)}`);
  
  const stats = report.stats || {};
  console.log(`  Sites escaneados:  ${stats.totalSites || '?'}`);
  console.log(`  Total itens:       ${stats.totalItems || '?'}`);
  console.log(`  📝 Publicáveis:    ${stats.publishable || 0}`);
  console.log(`  🔍 Revisão:        ${stats.reviewable || 0}`);
  console.log(`  ❌ Descartados:    ${stats.discarded || 0}`);
  if (funnel.configuredSources !== null) console.log(`  Fontes configuradas: ${funnel.configuredSources}`);
  if (funnel.curatorCandidates !== null) console.log(`  Candidatos do curador: ${funnel.curatorCandidates}`);
  if (funnel.alreadyPersisted !== null) console.log(`  Já persistidos:    ${funnel.alreadyPersisted}`);
  if (funnel.trulyNew !== null) console.log(`  Novos na pipeline:  ${funnel.trulyNew}`);
  if (funnel.qualityReview !== null) console.log(`  Revisão de qualidade: ${funnel.qualityReview}`);
  if (funnel.publishEvaluated !== null) console.log(`  Avaliados pelo publisher: ${funnel.publishEvaluated}`);
  
  if (WITH_PUBLISH) {
    console.log(`  📤 Publicados:     ${published}${DRY_RUN ? ' (dry-run)' : ''}`);
    if (funnel.merged !== null) console.log(`  Mesclados:         ${funnel.merged}`);
    if (funnel.persisted !== null) console.log(`  Persistidos:       ${funnel.persisted}`);
    if (enrichedImages > 0) {
      console.log(`  🖼️  Imagens comp.:  ${enrichedImages} posts enriquecidos`);
    }
  }
  
  console.log(`\n📁 Relatório: data/ufg-scrape/curadoria-v4.4-*-${TIMESTAMP}.json`);
  emitPipelineFunnel();
  console.log();
}

function resetPipelineOutcomeForTests() {
  pipelineSteps.splice(0, pipelineSteps.length);
  pipelineOutcomeEmitted = false;
  pipelineFunnelEmitted = false;
  pipelineFunnelReport = {};
  pipelineFunnelState = {};
  instagramSeenCheckpoint = null;
  instagramSeenCheckpointSettled = false;
  instagramSeenSettlement = null;
  terminalInstagramSeenKeys.clear();
}

module.exports = {
  ENRICH_STEP_REQUIRED,
  STEP_MARKER,
  OUTCOME_MARKER,
  PUBLISH_MARKER,
  FUNNEL_MARKER,
  URL_IDENTITY_VERSION,
  acknowledgeAlreadyPublishedInstagramPosts,
  acknowledgeTerminalInstagramItems,
  attachEnrichmentContext,
  buildEnrichItems,
  buildDuplicateCursorState,
  buildIsolatedEnrichArgs,
  buildPublishedSourceIndex,
  buildPublisherItem,
  buildPipelineFunnel,
  updatePipelineFunnelContext,
  buildInstagramScanArgs,
  classifyFormatterOutput,
  collectPaginatedRows,
  curatorCoverageIssues,
  derivePipelineOutcome,
  duplicateWorkIdentity,
  emitPipelineOutcome,
  formatFailureSummary,
  formattedArtifactPayloadForHash,
  itemIdentity,
  isSuccessfullyFormattedItem,
  nodeCommand,
  isoDateInTimeZone,
  loadPublishedSourceIndex,
  parsePipelineArgs,
  parseEnrichOutput,
  printSummary,
  persistImmutableCuratorReport,
  recordSyntheticStep,
  recordCuratorCoverageStep,
  resetPipelineOutcomeForTests,
  settleInstagramSeenCheckpoint,
  stageInstagramSeenCheckpoint,
  resolvePipelineInstagramSupervisorTimeout,
  resolvePipelineCuratorTimeout,
  resolveTerminalPublisherItems,
  resolveFullCuratorReport,
  resealFormattedArtifact,
  runStep,
  selectDuplicateEnrichmentCandidates,
  selectRotatingDuplicateBatch,
  shouldSkipPublishedItem,
  summarizeEnrichResults,
  stampFormattedArtifact,
  stampTrulyNewArtifact,
  curatorLineageFilename,
  validateFormattedArtifact,
  validateFormattedItemSet,
  validatePublishSummary,
  validateRunArtifact,
  validateTrulyNewArtifact,
  withReducedDiscarded,
};

if (require.main === module) {
  main().catch(e => {
    console.error('💥', e.message);
    recordSyntheticStep('pipeline', 'Pipeline', {
      required: true,
      ok: false,
      exitCode: 1,
      reason: 'unhandled_exception',
    });
    emitPipelineOutcome();
    process.exitCode = 1;
  });
}
