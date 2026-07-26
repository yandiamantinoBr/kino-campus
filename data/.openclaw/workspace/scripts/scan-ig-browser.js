#!/usr/bin/env node
/**
 * scan-ig-browser.js — Scanner Instagram via WebSocket CDP
 * 
 * Conecta ao browser OpenClaw (CDP ws://127.0.0.1:18800) com sessão
 * autenticada (@kinocampusbr) e extrai posts de perfis UFG.
 *
 * Uso:
 *   node scripts/scan-ig-browser.js                    → todos os perfis ativos
 *   node scripts/scan-ig-browser.js --handle ufg_oficial → perfil único
 *   node scripts/scan-ig-browser.js --dry-run             → sem salvar arquivo
 *   node scripts/scan-ig-browser.js --dry-run --output /tmp/run/ig.json
 *                                                       → artefato efêmero, sem alterar seen-posts
 */

'use strict';

let WebSocket;
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { resolveDryRunOutput } = require('./lib/dry-run-artifacts.js');
const { pageGotoWithRetry, fetchWithRetry, retryOnNetworkError } = require('./lib/network-fetch.js');
const {
  canonicalInstagramPostUrl,
  instagramPostShortcode,
  parseInstagramPostUrl,
} = require('./lib/instagram-url.js');
const {
  buildInstagramSeenCheckpoint,
  partitionInstagramSeenState,
  validateInstagramSeenCheckpoint,
} = require('./lib/instagram-seen-outbox.js');

// ============================================================
// CONFIG
// ============================================================

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 18800;
function isoDateInTimeZone(date = new Date(), timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveInstagramRunDateBrt(env = process.env, now = new Date()) {
  const configured = String(env?.CADU_PIPELINE_DATE_BRT || '').trim();
  if (configured) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(configured)
      ? new Date(`${configured}T12:00:00-03:00`)
      : new Date(Number.NaN);
    if (Number.isNaN(parsed.getTime()) || isoDateInTimeZone(parsed) !== configured) {
      throw new Error('CADU_PIPELINE_DATE_BRT invalida');
    }
    return configured;
  }
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(reference.getTime())) throw new Error('relogio de referencia invalido');
  return isoDateInTimeZone(reference);
}

function parseScannerArgs(argv) {
  const options = { handle: null, dryRun: false, skipEnrich: false, output: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      if (options.dryRun) throw new Error('argumento duplicado: --dry-run');
      options.dryRun = true;
    } else if (arg === '--skip-enrich') {
      if (options.skipEnrich) throw new Error('argumento duplicado: --skip-enrich');
      options.skipEnrich = true;
    } else if (arg === '--handle' || arg === '--output') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requer um valor`);
      const key = arg === '--handle' ? 'handle' : 'output';
      if (options[key]) throw new Error(`argumento duplicado: ${arg}`);
      options[key] = value;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  if (options.handle && !/^(?:@)?[a-z0-9._]{1,30}$/i.test(options.handle)) {
    throw new Error('handle Instagram inválido');
  }
  return options;
}

const SCANNER_OPTIONS = require.main === module
  ? parseScannerArgs(process.argv.slice(2))
  : { handle: null, dryRun: false, skipEnrich: false, output: null };
const TIMESTAMP = resolveInstagramRunDateBrt();
const OUTPUT_DIR = '/data/.openclaw/workspace/data/ufg-instagram';
const SINGLE_HANDLE = SCANNER_OPTIONS.handle;
const DRY_RUN = SCANNER_OPTIONS.dryRun;
const SKIP_ENRICH = SCANNER_OPTIONS.skipEnrich;
const REQUESTED_OUTPUT_FILE = SCANNER_OPTIONS.output;
const EXPLICIT_OUTPUT_FILE = resolveDryRunOutput(REQUESTED_OUTPUT_FILE, {
  dryRun: DRY_RUN,
  label: 'Instagram scanner output',
});
// Seen-posts are versioned: classifier/detail changes must re-evaluate the
// recent backlog instead of silently accepting decisions made by old logic.
const RELEVANCE_VERSION = '2026-07-22-durable-detail-progress-v7';
const INSTAGRAM_DETAIL_POLL_TIMEOUT_MS = 5000;
const INSTAGRAM_DETAIL_POLL_INTERVAL_MS = 250;
const PIPELINE_PARENT_RUN_ID = String(process.env.CADU_PIPELINE_RUN_ID || '').trim();
const PIPELINE_MANAGED = Boolean(PIPELINE_PARENT_RUN_ID);
const PIPELINE_RUN_ID = PIPELINE_PARENT_RUN_ID || crypto.randomUUID();
const INSTAGRAM_DETAIL_LIMITS = resolveInstagramDetailLimits();
const INSTAGRAM_LOOKBACK_DAYS = resolveInstagramLookbackDays();
const INSTAGRAM_GRID_LIMITS = resolveInstagramGridLimits();
const INSTAGRAM_PROFILE_LIMITS = resolveInstagramProfileLimits();
const INSTAGRAM_SCAN_TIMING = resolveInstagramScanTiming();
const INSTAGRAM_DISCOVERY_LIMITS = resolveInstagramDiscoveryLimits();

const IG_HANDLE_ALIASES = {
  icbufg: 'icb.ufg',
  emacufg: 'em.ufg',
  'fct.ufg': 'campusaparecidaufg',
  odontologiaufg: 'odontologia.ufg',
  fefdufg: 'fefufg',
  culturaufg: 'centroculturalufg',
  esportesufg: 'cecasufg',
};

const ACTIVE_HANDLES_RAW = [
  // Tier 1 — já escaneados
  'ufg_oficial', 'posufg', 'face.ufg', 'fen_ufg', 'fanutufg',
  'evzufg', 'icb.ufg', 'iptsp_ufg', 'em.ufg', 'propessoas_ufg',
  'inf.ufg', 'emc_ufg', 'fav_ufg', 'fcs_ufg',
  // Tier 2 — pró-reitorias e órgãos centrais
  'pesquisaeinovacaoufg', 'proex.ufg', 'prograd_ufg', 'praeufg',
  'sri_ufg', 'institutoverbenaufg', 'cei.ufg', 'ciar_ufg',
  // Tier 3 — unidades acadêmicas
  'letras.ufg', 'fic.ufg', 'campusaparecidaufg', 'odontologia.ufg', 'iqufg',
  'cerofufg', 'eeca_ufg', 'ime_ufg',
  // Tier 4 — museus, centros, órgãos
  'museu_ufg', 'planetario.ufg', 'editora.ufg', 'sibi_ufg',
  'cepae_ufg', 'fafilufg', 'iesa.ufg', 'campusgoiasufg', 'sdh_ufg',
  'firminopolis_ufg', 'centroculturalufg', 'lacena_ufg',
  // Tier 5 — perfis descobertos
  'escoladeposufg',
  // Tier 6 — 07/06/2026: mapeamento expandido (unidades acadêmicas + órgãos)
  // Fontes: sites oficiais das unidades + reposts do @ufg_oficial
  'ea.ufg',           // Escola de Agronomia (723 posts, 2.4K seguidores)
  'fefufg',           // Faculdade de Educacao Fisica (perfil encontrado por busca/IG)
  'cecasufg',         // CECAS/PRAE - esportes e atividades do campus
  'direitoufg',        // Faculdade de Direito (147 posts, 2.8K, perfil oficial)
  'patiodaciencia.ufg', // Pátio da Ciência (reposts @ufg_oficial)
  'tvufg',             // TV UFG (reposts @ufg_oficial)
  'lapigufg',          // LAPIG UFG (reposts @ufg_oficial)
  // Tier 7 — 15/06/2026: projetos de extensão
  'floreser.ufg',      // FLORESER UFG (projeto de extensão - Yan pediu)
  // Tier 8 — 19/07/2026: declarados em páginas institucionais e confirmados
  // acessíveis por canário autenticado. funapeufg e ppgcta_ufg permanecem em
  // quarentena porque os respectivos perfis estavam indisponíveis.
  'campusocidentalufg', 'fundacaofagep', 'fundacaortve', 'poshistoriaufg',
  'ppga_ufg', 'ppgacv_ufg', 'ppgban.ufg', 'ppgca_ufg', 'ppgcb_ufg',
  'ppgecoevolufg', 'ppgeo.ufg', 'ppggmp.ufg', 'ppgnut.ufg', 'ppgoufg',
  'ppgzufg',
  // Tier 9 — 22/07/2026: perfis ativos, vinculados a fonte institucional
  // primária e com publicação recente verificada diretamente.
  'centrodelinguasflufg', 'cepeconf_ufg', 'funape.oficial', 'herbarioufg',
  'ipelab.ufg', 'ppgadm.ufg', 'ppgci.ufg', 'ppgcont.ufg', 'pts.ufg',
  'radioufg',
];

// Preserve identity lineage for handles removed from the runtime inventory.
// These values are consumed only by the canonical registry reconciler; the
// scanner must never request them or count them toward execution coverage.
const RETIRED_HANDLES_RAW = [
  // Identidades indisponíveis que possuem sucessor institucional atual.
  'fl_ufg_oficial',
  'funapeufg',
  'icb_acoes',
  // Replaced by the institutionally declared @iesa.ufg.
  'iesaufg',
  // O portal ainda exibe este identificador legado, mas a conta ativa usa
  // ponto. Mantemos a divergência auditável sem transformar um no alias do outro.
  'patiodaciencia_ufg',
];

function parseInstagramHandle(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function canonicalInstagramHandle(input) {
  const handle = parseInstagramHandle(input);
  return IG_HANDLE_ALIASES[handle] || handle;
}

function buildHandleList(rawHandles) {
  const handles = [];
  const seen = new Set();
  const aliasesResolved = [];
  const duplicatesSkipped = [];
  for (const raw of rawHandles) {
    const parsed = parseInstagramHandle(raw);
    const canonical = canonicalInstagramHandle(parsed);
    if (!canonical) continue;
    if (parsed && parsed !== canonical) aliasesResolved.push({ from: parsed, to: canonical });
    if (seen.has(canonical)) {
      duplicatesSkipped.push({ handle: canonical, from: parsed || raw });
      continue;
    }
    seen.add(canonical);
    handles.push(canonical);
  }
  return { handles, aliasesResolved, duplicatesSkipped };
}

const HANDLE_SOURCE_AUDIT = buildHandleList(ACTIVE_HANDLES_RAW);
const ACTIVE_HANDLES = HANDLE_SOURCE_AUDIT.handles;

function getActiveInstagramHandles() {
  return [...ACTIVE_HANDLES];
}

function resolveInstagramMinimumProfileCoverage(env = process.env) {
  const configured = Number(env.CADU_IG_MIN_PROFILE_COVERAGE);
  return Number.isFinite(configured) && configured >= 0.80 && configured <= 1
    ? Number(configured.toFixed(4))
    : 0.90;
}

const INSTAGRAM_GRID_STOP_REASONS = new Set([
  'budget',
  'max_items',
  'max_observed_items',
  'max_scrolls',
  'seen_or_cutoff',
  'stable_grid',
]);

/**
 * After durable detail-progress reinjection, live grid counters must still
 * describe only this run's observed grid. Restored posts stay in `posts` for
 * retry, but never inflate `newPosts` past gridScan.observedItems.
 */
function reconcileInstagramProfileGridAfterReinjection(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const posts = Array.isArray(result.posts) ? result.posts : [];
  const livePosts = posts.filter(post => post?._fromDetailProgress !== true);
  const gridScan = result.gridScan && typeof result.gridScan === 'object' && !Array.isArray(result.gridScan)
    ? result.gridScan
    : null;
  const observedItems = Number(gridScan?.observedItems);
  let newPosts = livePosts.length;
  if (Number.isInteger(observedItems) && observedItems >= 0 && newPosts > observedItems) {
    newPosts = observedItems;
  }
  result.newPosts = newPosts;
  if (!Number.isInteger(Number(result.skippedPosts)) || Number(result.skippedPosts) < 0) {
    result.skippedPosts = 0;
  }
  return result;
}

function inspectInstagramProfileGridEvidence(result) {
  const gridScan = result?.gridScan;
  if (!gridScan || typeof gridScan !== 'object' || Array.isArray(gridScan)) {
    return { ok: false, reason: 'grid_scan_missing', observedItems: 0 };
  }

  const observedItems = Number(gridScan.observedItems);
  if (!Number.isInteger(observedItems) || observedItems < 1) {
    return { ok: false, reason: 'grid_observed_items_invalid', observedItems: 0 };
  }

  const stopReason = String(gridScan.stopReason || '').trim();
  if (!INSTAGRAM_GRID_STOP_REASONS.has(stopReason)) {
    return { ok: false, reason: 'grid_stop_reason_invalid', observedItems };
  }

  const counters = ['scrolls', 'seenItems', 'oldItems', 'eligibleItems'];
  for (const key of counters) {
    const value = Number(gridScan[key]);
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, reason: `grid_${key}_invalid`, observedItems };
    }
    if (key !== 'scrolls' && value > observedItems) {
      return { ok: false, reason: `grid_${key}_exceeds_observed`, observedItems };
    }
  }

  if (!Array.isArray(result?.posts)) {
    return { ok: false, reason: 'grid_posts_inconsistent', observedItems };
  }
  // Durable detail retries are restored after the live profile scan. They must
  // remain in the artifact so opportunities cannot disappear between runs, but
  // they are not evidence observed in this run's grid and therefore cannot
  // consume gridScan.observedItems.
  const restoredPosts = result.posts.filter(post => post?._fromDetailProgress === true);
  const resultHandle = canonicalInstagramHandle(result?.handle);
  const invalidRestoredPost = restoredPosts.find(post => {
    const sourceHandle = canonicalInstagramHandle(
      String(post?.source || '').replace(/^ig:@/i, ''),
    );
    return !instagramShortcode(post) || !sourceHandle || sourceHandle !== resultHandle;
  });
  if (invalidRestoredPost) {
    return { ok: false, reason: 'grid_restored_post_invalid', observedItems };
  }
  const gridPostCount = result.posts.length - restoredPosts.length;
  if (gridPostCount > observedItems) {
    return { ok: false, reason: 'grid_posts_inconsistent', observedItems };
  }
  for (const key of ['newPosts', 'skippedPosts']) {
    const value = Number(result?.[key] || 0);
    if (!Number.isInteger(value) || value < 0 || value > observedItems) {
      return { ok: false, reason: `grid_${key}_inconsistent`, observedItems };
    }
  }

  return {
    ok: true,
    reason: '',
    observedItems,
    stopReason,
    gridPostCount,
    restoredPostCount: restoredPosts.length,
  };
}

function summarizeInstagramProfileCoverage(expectedHandles, results, {
  scope = 'all_active',
  minimumCoverageRatio = resolveInstagramMinimumProfileCoverage(),
} = {}) {
  const expectedAudit = buildHandleList(Array.isArray(expectedHandles) ? expectedHandles : []);
  const expected = expectedAudit.handles;
  const resultList = Array.isArray(results) ? results : [];
  const resultHandles = resultList.map(result => canonicalInstagramHandle(result?.handle));
  const resultHandleCounts = new Map();
  for (const handle of resultHandles) {
    if (!handle) continue;
    resultHandleCounts.set(handle, (resultHandleCounts.get(handle) || 0) + 1);
  }

  const expectedSet = new Set(expected);
  const resultSet = new Set(resultHandles.filter(Boolean));
  const missingHandles = expected.filter(handle => !resultSet.has(handle));
  const unexpectedHandles = [...resultSet].filter(handle => !expectedSet.has(handle));
  const duplicateResultHandles = [...resultHandleCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([handle]) => handle);
  const expectedCount = expected.length;
  const minimumSuccessfulCount = expectedCount === 1
    ? 1
    : Math.ceil(expectedCount * minimumCoverageRatio);
  const resultByHandle = new Map();
  for (let index = 0; index < resultList.length; index += 1) {
    const handle = resultHandles[index];
    if (handle && !resultByHandle.has(handle)) resultByHandle.set(handle, resultList[index]);
  }

  const gridEvidence = expected.map(handle => {
    const result = resultByHandle.get(handle);
    const evidence = inspectInstagramProfileGridEvidence(result);
    return {
      handle,
      error: String(result?.error || '').trim(),
      ...evidence,
    };
  });
  const gridEvidenceCount = gridEvidence.filter(evidence => evidence.ok).length;
  const minimumGridEvidenceCount = minimumSuccessfulCount;
  const gridEvidenceRatio = expectedCount > 0
    ? Number((gridEvidenceCount / expectedCount).toFixed(4))
    : 0;
  const missingGridEvidenceHandles = gridEvidence
    .filter(evidence => !evidence.ok)
    .map(evidence => evidence.handle);
  const invalidGridEvidence = gridEvidence
    .filter(evidence => !evidence.ok && !evidence.error)
    .map(({ handle, reason }) => ({ handle, reason }));
  const successfulCount = gridEvidence.filter(evidence => evidence.ok && !evidence.error).length;
  const failedCount = Math.max(0, expectedCount - successfulCount);
  const actualCoverageRatio = expectedCount > 0
    ? Number((successfulCount / expectedCount).toFixed(4))
    : 0;

  const issues = [];
  if (expectedCount === 0) issues.push('expected_handles_empty');
  if (expectedAudit.duplicatesSkipped.length > 0) issues.push('expected_handles_duplicate');
  if (resultHandles.some(handle => !handle)) issues.push('result_handle_invalid');
  if (missingHandles.length > 0) issues.push('result_handles_missing');
  if (unexpectedHandles.length > 0) issues.push('result_handles_unexpected');
  if (duplicateResultHandles.length > 0) issues.push('result_handles_duplicate');
  if (successfulCount < minimumSuccessfulCount) issues.push('profile_coverage_below_minimum');
  if (gridEvidenceCount < minimumGridEvidenceCount) {
    issues.push('profile_grid_evidence_below_minimum');
  }

  return {
    ok: issues.length === 0,
    scope,
    expectedHandles: expected,
    expectedCount,
    minimumCoverageRatio,
    minimumSuccessfulCount,
    successfulCount,
    failedCount,
    actualCoverageRatio,
    minimumGridEvidenceCount,
    gridEvidenceCount,
    gridEvidenceRatio,
    missingGridEvidenceHandles,
    invalidGridEvidence,
    missingHandles,
    unexpectedHandles,
    duplicateResultHandles,
    issues,
  };
}

function summarizeInstagramPostMetrics(results) {
  const shortcodes = new Set();
  const relevantShortcodes = new Set();
  let totalPostOccurrences = 0;
  let totalRelevantOccurrences = 0;
  let identifiedPostOccurrences = 0;
  let identifiedRelevantOccurrences = 0;
  let unidentifiedPostOccurrences = 0;
  let unidentifiedRelevantOccurrences = 0;
  let restoredPostOccurrences = 0;
  let restoredRelevantOccurrences = 0;

  for (const result of Array.isArray(results) ? results : []) {
    for (const post of Array.isArray(result?.posts) ? result.posts : []) {
      totalPostOccurrences += 1;
      const relevant = post?.relevant === true;
      if (relevant) totalRelevantOccurrences += 1;
      if (post?._fromDetailProgress === true) {
        restoredPostOccurrences += 1;
        if (relevant) restoredRelevantOccurrences += 1;
      }
      const shortcode = instagramShortcode(post);
      if (!shortcode) {
        unidentifiedPostOccurrences += 1;
        if (relevant) unidentifiedRelevantOccurrences += 1;
        continue;
      }
      identifiedPostOccurrences += 1;
      shortcodes.add(shortcode);
      if (relevant) {
        identifiedRelevantOccurrences += 1;
        relevantShortcodes.add(shortcode);
      }
    }
  }

  return {
    totalPostOccurrences,
    uniquePosts: shortcodes.size,
    duplicatePostOccurrences: Math.max(0, identifiedPostOccurrences - shortcodes.size),
    unidentifiedPostOccurrences,
    gridPostOccurrences: Math.max(0, totalPostOccurrences - restoredPostOccurrences),
    restoredPostOccurrences,
    totalRelevantOccurrences,
    uniqueRelevant: relevantShortcodes.size,
    duplicateRelevantOccurrences: Math.max(
      0,
      identifiedRelevantOccurrences - relevantShortcodes.size,
    ),
    unidentifiedRelevantOccurrences,
    gridRelevantOccurrences: Math.max(0, totalRelevantOccurrences - restoredRelevantOccurrences),
    restoredRelevantOccurrences,
  };
}

function validateInstagramDetailMetrics(detail, {
  minimumRequestedForHealth = 3,
  postMetrics = null,
} = {}) {
  const issues = [];
  const warnings = [];
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return { ok: false, issues: ['detail_metrics_missing'], warnings };
  }
  const requiredCounters = [
    'eligible',
    'eligibleBeforeShortcodeDedupe',
    'duplicateShortcodesRemoved',
    'restoredFromProgress',
    'requested',
    'completedFromCache',
    'cacheLoaded',
    'deferredByBackoff',
    'deferred',
    'succeeded',
    'partial',
    'failed',
    'retried',
    'preHydrationRelevantEligible',
    'preliminaryRelevantEligible',
    'preliminaryRelevantRequested',
    'explorationRequested',
    'progressEntriesBefore',
    'progressEntriesAfter',
  ];
  for (const key of requiredCounters) {
    if (!Number.isInteger(detail[key]) || detail[key] < 0) {
      issues.push(`detail_counter_invalid:${key}`);
    }
  }
  if (!Number.isInteger(detail.progressEntriesNet)) {
    issues.push('detail_counter_invalid:progressEntriesNet');
  }
  if (issues.length > 0) return { ok: false, issues, warnings };

  if (detail.requested !== detail.succeeded + detail.partial + detail.failed) {
    issues.push('detail_outcomes_mismatch');
  }
  if (detail.eligibleBeforeShortcodeDedupe
      !== detail.eligible + detail.duplicateShortcodesRemoved) {
    issues.push('detail_shortcode_dedupe_mismatch');
  }
  if (detail.eligible !== detail.completedFromCache + detail.deferredByBackoff
      + detail.requested + detail.deferred) {
    issues.push('detail_queue_reconciliation_mismatch');
  }
  if (detail.requested !== detail.preliminaryRelevantRequested + detail.explorationRequested) {
    issues.push('detail_lane_reconciliation_mismatch');
  }
  if (detail.preliminaryRelevantRequested > detail.preliminaryRelevantEligible
      || detail.preliminaryRelevantEligible > detail.eligible) {
    issues.push('detail_preliminary_relevance_mismatch');
  }
  if (detail.preHydrationRelevantEligible > detail.eligible) {
    issues.push('detail_pre_hydration_relevance_mismatch');
  }
  if (detail.retried > detail.requested) issues.push('detail_retried_exceeds_requested');
  if (detail.completedFromCache > detail.cacheLoaded) {
    issues.push('detail_completed_cache_exceeds_loaded');
  }
  if (detail.progressEntriesNet !== detail.progressEntriesAfter - detail.progressEntriesBefore) {
    issues.push('detail_progress_reconciliation_mismatch');
  }
  if (postMetrics && detail.restoredFromProgress !== postMetrics.restoredPostOccurrences) {
    issues.push('detail_restored_posts_mismatch');
  }
  if (detail.completedFromCache > detail.eligible
      || detail.deferredByBackoff > detail.eligible
      || detail.requested > detail.eligible
      || detail.deferred > detail.eligible) {
    issues.push('detail_counter_exceeds_eligible');
  }
  if (!detail.failureReasons || typeof detail.failureReasons !== 'object'
      || Array.isArray(detail.failureReasons)) {
    issues.push('detail_failure_reasons_invalid');
  } else {
    const maximumFailedOutcomes = detail.partial + detail.failed;
    for (const [reason, count] of Object.entries(detail.failureReasons)) {
      if (!String(reason).trim() || !Number.isInteger(count) || count < 0
          || count > maximumFailedOutcomes) {
        issues.push('detail_failure_reason_count_invalid');
        break;
      }
    }
  }
  if (detail.requested >= minimumRequestedForHealth && detail.succeeded === 0) {
    warnings.push('detail_live_hydration_unavailable');
  }
  if (detail.requested === 0 && detail.deferred >= minimumRequestedForHealth) {
    warnings.push('detail_hydration_not_attempted');
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)], warnings };
}

function validateInstagramArtifact(artifact, {
  expectedRunId = PIPELINE_RUN_ID,
  expectedDateBrt = process.env.CADU_PIPELINE_DATE_BRT,
  expectedStartedAt = process.env.CADU_PIPELINE_STARTED_AT,
  nowMs = Date.now(),
  maxAgeMs = 2 * 60 * 60 * 1000,
  requireFullScope = true,
  expectedScope = '',
  requireDownstreamAck = Boolean(process.env.CADU_PIPELINE_RUN_ID),
} = {}) {
  const issues = [];
  const warnings = [];
  const contract = artifact?.artifactContract;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { ok: false, issues: ['ig_not_object'] };
  }
  if (!Array.isArray(artifact.results)) issues.push('ig_results_not_array');
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return { ok: false, issues: [...issues, 'ig_contract_missing'] };
  }
  if (contract.schemaVersion !== 1) issues.push('ig_schema_unsupported');
  if (artifact.scanner !== 'scan-ig-browser.js') issues.push('ig_scanner_mismatch');
  if (artifact.version !== '1.2.0') issues.push('ig_artifact_version_mismatch');
  if (artifact.timestamp !== contract.generatedAt) issues.push('ig_timestamp_contract_mismatch');
  if (typeof artifact.relevanceVersion !== 'string' || !artifact.relevanceVersion.trim()) {
    issues.push('ig_relevance_version_missing');
  } else if (artifact.relevanceVersion !== RELEVANCE_VERSION) {
    issues.push('ig_relevance_version_mismatch');
  }
  if (contract.kind !== 'instagram-scan') issues.push('ig_kind_mismatch');
  if (contract.version !== '1.2.0') issues.push('ig_version_mismatch');
  if (contract.runId !== expectedRunId) issues.push('ig_run_id_mismatch');
  const referenceClock = Number.isFinite(Number(nowMs)) ? new Date(Number(nowMs)) : new Date();
  let referenceDateBrt = '';
  try {
    referenceDateBrt = resolveInstagramRunDateBrt(
      expectedDateBrt ? { CADU_PIPELINE_DATE_BRT: expectedDateBrt } : {},
      referenceClock,
    );
  } catch (_) {
    issues.push('ig_expected_brt_date_invalid');
  }
  if (contract.dateBrt !== referenceDateBrt) issues.push('ig_brt_date_mismatch');

  const payload = { ...artifact };
  delete payload.artifactContract;
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (contract.contentSha256 !== expectedHash) issues.push('ig_hash_mismatch');
  const seenCheckpointValidation = validateInstagramSeenCheckpoint(artifact.seenCheckpoint, {
    expectedRunId,
    expectedRelevanceVersion: artifact.relevanceVersion,
    nowMs,
    requireDownstreamAck,
  });
  for (const checkpointIssue of seenCheckpointValidation.issues) {
    issues.push(`ig_${checkpointIssue}`);
  }
  if (artifact?.seenCheckpoint?.generatedAt !== contract.generatedAt) {
    issues.push('ig_seen_checkpoint_timestamp_mismatch');
  }

  const generatedAtMs = Date.parse(contract.generatedAt);
  const startedAtMs = expectedStartedAt ? Date.parse(expectedStartedAt) : Number.NaN;
  if (expectedStartedAt && !Number.isFinite(startedAtMs)) issues.push('ig_run_started_at_invalid');
  if (!Number.isFinite(generatedAtMs)) issues.push('ig_timestamp_invalid');
  else {
    if (generatedAtMs > nowMs + 5 * 60 * 1000) issues.push('ig_from_future');
    if (Number.isFinite(startedAtMs) && generatedAtMs < startedAtMs - 5 * 1000) {
      issues.push('ig_predates_run');
    }
    if (nowMs - generatedAtMs > maxAgeMs) issues.push('ig_stale');
  }

  const declaredCoverage = contract.profileCoverage;
  const expectedHandles = artifact?.sourceAudit?.expectedHandles;
  if (!declaredCoverage || typeof declaredCoverage !== 'object' || Array.isArray(declaredCoverage)) {
    issues.push('ig_profile_coverage_missing');
  }
  if (!Array.isArray(expectedHandles)) issues.push('ig_expected_handles_missing');
  if (declaredCoverage && !Array.isArray(declaredCoverage.expectedHandles)) {
    issues.push('ig_contract_expected_handles_missing');
  }

  if (Array.isArray(expectedHandles) && Array.isArray(declaredCoverage?.expectedHandles)) {
    if (JSON.stringify(expectedHandles) !== JSON.stringify(declaredCoverage.expectedHandles)) {
      issues.push('ig_expected_handles_mismatch');
    }
    const resolvedExpectedScope = String(expectedScope || (
      requireFullScope ? 'all_active' : 'single_handle'
    ));
    if (!['all_active', 'single_handle'].includes(resolvedExpectedScope)) {
      issues.push('ig_expected_scope_invalid');
    } else if (declaredCoverage.scope !== resolvedExpectedScope) {
      issues.push('ig_scope_mismatch');
    }
    if (resolvedExpectedScope === 'all_active') {
      const expectedSet = new Set(expectedHandles);
      if (getActiveInstagramHandles().some(handle => !expectedSet.has(handle))) {
        issues.push('ig_active_handles_missing');
      }
    }

    const requiredMinimumCoverage = resolveInstagramMinimumProfileCoverage();
    if (declaredCoverage.minimumCoverageRatio !== requiredMinimumCoverage) {
      issues.push('ig_minimum_coverage_mismatch');
    }
    const computedCoverage = summarizeInstagramProfileCoverage(expectedHandles, artifact.results, {
      scope: declaredCoverage.scope,
      minimumCoverageRatio: requiredMinimumCoverage,
    });
    for (const coverageIssue of computedCoverage.issues) issues.push(`ig_${coverageIssue}`);

    const coverageCounters = [
      'expectedCount',
      'minimumCoverageRatio',
      'minimumSuccessfulCount',
      'successfulCount',
      'failedCount',
      'actualCoverageRatio',
      'minimumGridEvidenceCount',
      'gridEvidenceCount',
      'gridEvidenceRatio',
    ];
    for (const key of coverageCounters) {
      if (declaredCoverage[key] !== computedCoverage[key]) {
        issues.push(`ig_contract_${key}_mismatch`);
      }
      if (artifact?.stats?.profileCoverage?.[key] !== computedCoverage[key]) {
        issues.push(`ig_stats_${key}_mismatch`);
      }
    }
    for (const [label, value] of [
      ['contract', declaredCoverage.missingGridEvidenceHandles],
      ['stats', artifact?.stats?.profileCoverage?.missingGridEvidenceHandles],
    ]) {
      if (JSON.stringify(value) !== JSON.stringify(computedCoverage.missingGridEvidenceHandles)) {
        issues.push(`ig_${label}_missing_grid_evidence_handles_mismatch`);
      }
    }

    const results = Array.isArray(artifact.results) ? artifact.results : [];
    const postMetrics = summarizeInstagramPostMetrics(results);
    const relevantShortcodes = new Set(results.flatMap(result => (
      Array.isArray(result?.posts)
        ? result.posts
          .filter(post => post?.relevant === true)
          .map(instagramShortcode)
          .filter(Boolean)
        : []
    )));
    let computedSkipped = 0;
    for (const result of results) {
      if (!Number.isInteger(result?.skippedPosts) || result.skippedPosts < 0) {
        issues.push('ig_profile_skipped_posts_invalid');
      } else {
        computedSkipped += result.skippedPosts;
      }
    }
    if (results.some(result => !Array.isArray(result?.posts))) issues.push('ig_profile_posts_not_array');
    if (artifact?.stats?.profilesScanned !== computedCoverage.expectedCount) {
      issues.push('ig_profiles_scanned_mismatch');
    }
    if (artifact?.stats?.profilesOk !== computedCoverage.successfulCount) {
      issues.push('ig_profiles_ok_mismatch');
    }
    if (artifact?.stats?.profilesFail !== computedCoverage.failedCount) {
      issues.push('ig_profiles_fail_mismatch');
    }
    if (artifact?.stats?.totalPosts !== postMetrics.totalPostOccurrences) {
      issues.push('ig_total_posts_mismatch');
    }
    if (artifact?.stats?.totalRelevant !== postMetrics.totalRelevantOccurrences) {
      issues.push('ig_total_relevant_mismatch');
    }
    if (artifact?.stats?.totalSkipped !== computedSkipped) issues.push('ig_total_skipped_mismatch');
    for (const [key, expected] of Object.entries(postMetrics)) {
      if (artifact?.stats?.[key] !== expected) issues.push(`ig_${key}_mismatch`);
    }
    if (postMetrics.unidentifiedPostOccurrences > 0) issues.push('ig_post_shortcode_missing');
    for (const checkpointKey of Object.keys(artifact?.seenCheckpoint?.entries || {})) {
      if (!relevantShortcodes.has(checkpointKey)) {
        issues.push(`ig_seen_checkpoint_entry_not_in_results:${checkpointKey.slice(0, 40)}`);
      }
    }

    const detailValidation = validateInstagramDetailMetrics(artifact?.stats?.detail, { postMetrics });
    issues.push(...detailValidation.issues.map(issue => `ig_${issue}`));
    warnings.push(...detailValidation.warnings.map(warning => `ig_${warning}`));
  }

  const result = { ok: issues.length === 0, issues: [...new Set(issues)] };
  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length > 0) result.warnings = uniqueWarnings;
  return result;
}

// v4.3 P1-4: Perfis descobertos via reposts do @ufg_oficial
const DISCOVERED_HANDLES = [];

const INCLUDE_TERMS = [
  'edital', 'chamada', 'processo seletivo', 'inscricao', 'inscricoes',
  'selecao', 'bolsa', 'bolsas', 'monitoria', 'estagio', 'vagas',
  'curso', 'oficina', 'palestra', 'seminario', 'congresso', 'evento',
  'extensao', 'pibic', 'pivic', 'pesquisa', 'mobilidade', 'prazo',
  'oportunidade', 'concurso', 'exposicao', 'mostra', 'festival',
  'mestrado', 'doutorado', 'pos-graduacao', 'auxilio', 'apoio financeiro',
  'capacitacao', 'hackaton', 'empreendedorismo', 'inovacao',
  'professor substituto', 'convocacao', 'residencia',
  'premio', 'premiacao', 'intercambio', 'vestibular',
  'inscreva-se', 'inscreva se', 'participe', 'programacao',
  'abertura das inscricoes',
  'chamamento', 'submissao', 'matricula', 'matriculas', 'aula aberta',
  'aula inaugural', 'roda de conversa', 'mesa redonda', 'debate',
  'minicurso', 'apresentacao', 'temporada', 'sarau', 'lancamento',
  'sessao', 'ciclo',
];

const STRONG_OPPORTUNITY_TERMS_IG = [
  'edital', 'chamada', 'processo seletivo', 'inscricao', 'inscricoes',
  'inscreva-se', 'inscreva se', 'selecao', 'seleção', 'bolsa', 'bolsas',
  'monitoria', 'estagio', 'estágio', 'vagas', 'submissao', 'submissão',
  'prazo', 'concurso', 'vestibular', 'matricula', 'matriculas',
  'mestrado', 'doutorado', 'auxilio', 'auxílio', 'premio', 'prêmio',
  'premiacao', 'premiação', 'intercambio', 'intercâmbio',
  'professor substituto', 'residencia', 'residência',
];

const ACTION_EVENT_TERMS_IG = [
  'evento', 'curso', 'oficina', 'palestra', 'seminario', 'seminário',
  'congresso', 'simposio', 'simpósio', 'mostra', 'festival', 'exposicao',
  'exposição', 'aula aberta', 'aula inaugural', 'roda de conversa',
  'mesa redonda', 'debate', 'minicurso', 'apresentacao', 'apresentação',
  'temporada', 'sarau', 'lancamento', 'lançamento', 'sessao', 'sessão',
  'ciclo', 'workshop', 'programacao', 'programação',
];

const GENERIC_IG_NOISE = [
  'principais noticias', 'principais notícias', 'ultimas noticias',
  'últimas notícias', 'pov:', 'pos em foco', 'pós em foco',
  'experiencias na pos', 'experiências na pós', 'voce sabia', 'você sabia',
];

const EXCLUDE_TERMS = [
  'nota de pesar', 'luto', 'aconteceu', 'ocorreu', 'foi realizado',
  'encerrou', 'terminou', 'ultima sexta', 'ultimo sabado',
  // v4.4.2: Eventos institucionais que não são oportunidades reais
  'inaugura o', 'inauguracao de',
  'fecham parceria', 'fecha parceria', 'firmam parceria',
  'acolhida 2026', 'acolhida de ingressantes',
  'recebe novos estudantes', 'recebe alunos premiados',
  // v4.4.3: Resultados/seleções já realizadas (NÃO são oportunidades novas)
  'resultado final', 'resultado preliminar', 'homologacao final', 'homologacao preliminar',
  'aprovados em', 'aprovados no', 'aprovados para', 'aprovados pela',
  'aprovada em', 'aprovado em', 'selecionados para', 'confira o resultado',
  'confira os aprovados', 'confira os selecionados', 'confira a classificacao',
  'confira a lista', 'saiba mais sobre', 'saiba quem foi', 'saiba quem sao',
  'parabens', 'foi premiado', 'foram premiados', 'encerrou as inscricoes',
  'inscricoes encerradas', 'prazo encerrado', 'ja aconteceu', 'foi realizado',
  'aconteceu no dia', 'resultado do sorteio', 'sorteio realizado',
  'vaga preenchida', 'vaga ocupada', 'em memoria', 'nota de falecimento',
  'inaugurou', 'inauguracao realizada', 'foi assinada', 'acordo firmado',
  'selecao para representantes', 'representante eleito',
  // v4.4.3: Mais padrões
  'foi premiado', 'foram premiados', 'premiado pela', 'premiada pela',
  'divulgacao do resultado', 'divulgado o resultado', 'resultado divulgado',
  'vagas preenchidas', 'encerrada a recepcao', 'matriculas encerradas',
  'comemoracao de', 'celebracao de', 'em memoria de', 'falecimento de',
];

const PRELIMINARY_RESULT_TERMS_IG = [
  'resultado preliminar', 'homologacao preliminar',
];

const RESULT_FOLLOWUP_TERMS_IG = [
  'recurso', 'recursos', 'interposicao de recurso', 'pedido de reconsideracao',
  'contestacao', 'contestar',
];

const ACTION_CTA_TERMS_IG = [
  'inscricao', 'inscricoes', 'inscreva-se', 'inscreva se', 'candidatura',
  'candidaturas', 'submissao', 'submissoes', 'matricula', 'matriculas',
  'vagas abertas', 'vagas disponiveis', 'participe', 'prazo', 'recurso',
  'recursos', 'confirmacao de presenca', 'envie sua proposta', 'reabertura',
  'reaberto', 'reaberta', 'novo prazo', 'prazo prorrogado', 'prazo prorrogada',
];

const REOPENING_TERMS_IG = [
  'reabertura', 'reaberto', 'reaberta', 'reabertos', 'reabertas',
  'novo prazo', 'prazo prorrogado', 'prazo prorrogada',
  'inscricoes prorrogadas', 'inscricao prorrogada',
];

const CLOSED_APPLICATION_TERMS_IG = [
  'inscricoes encerradas', 'inscricao encerrada', 'prazo encerrado',
  'encerrou as inscricoes', 'matriculas encerradas', 'matricula encerrada',
  'vagas preenchidas', 'vaga preenchida',
];

const TERMINAL_RESULT_TERMS_IG = [
  'resultado final', 'homologacao final', 'lista final', 'resultado definitivo',
  'aprovados', 'aprovadas', 'selecionados', 'selecionadas', 'classificados',
  'classificadas', 'convocados', 'convocadas',
];

const DEFENSE_TERMS_IG = [
  'defesa de tese', 'defesa de dissertacao', 'banca de defesa',
  'defesa de mestrado', 'defesa de doutorado',
];

const AWARDED_GRANT_TERMS_IG = [
  'bolsa concedida', 'bolsas concedidas', 'contemplado com bolsa',
  'contemplada com bolsa', 'recebeu uma bolsa', 'ganhou uma bolsa',
  'bolsista selecionado', 'bolsista selecionada',
];

const VETERAN_TERMS_IG = ['veterano', 'veterana', 'veteranos', 'veteranas'];

// Estes termos descrevem a divulgacao do resultado, mas nao encerram a
// oportunidade quando o mesmo post abre uma etapa futura de recurso.
const OVERRIDABLE_RESULT_EXCLUDE_TERMS_IG = new Set([
  'resultado preliminar', 'homologacao preliminar', 'confira o resultado',
  'confira a classificacao', 'confira a lista', 'divulgacao do resultado',
  'divulgado o resultado', 'resultado divulgado',
].map(normalizeTextPT));

// v4.4.2: Sinais de oportunidade (para classificar módulo)
const OPP_SIGNALS_IG = ['edital', 'chamada', 'processo seletivo', 'seleção', 'selecao',
  'bolsa', 'bolsas', 'monitoria', 'estágio', 'estagio', 'vagas',
  'inscrição', 'inscricao', 'inscrições', 'inscricoes',
  'prêmio', 'premio', 'premiacao', 'premiação',
  'pibic', 'pivic', 'probec', 'proex', 'prpi',
  'mobilidade', 'intercâmbio', 'intercambio',
  'mestrado', 'doutorado', 'pós-graduação', 'pos-graduacao',
  'auxílio', 'auxilio', 'permanência', 'permanencia',
  'vestibular', 'sisu', 'concurso', 'credenciamento',
  'casle', 'proficiência', 'proficiencia', 'suficiência', 'suficiencia',
  'prace', 'prae', 'conpeex', 'pibex', 'fapeg', 'capes', 'cnpq',
  'olimpíada', 'olimpiada', 'hackaton', 'maratona',
  'residencia', 'residência', 'pet'];

// v4.4.2: Sinais de evento
const EVT_SIGNALS_IG = ['evento', 'curso', 'oficina', 'palestra', 'seminário', 'seminario',
  'congresso', 'simpósio', 'simposio', 'mostra', 'festival',
  'exposição', 'exposicao', 'concerto', 'espetáculo', 'espetaculo',
  'inauguração', 'inauguracao', 'acolhida', 'feira',
  'encontro', 'live', 'webinário', 'webinario', 'colação', 'colacao',
  'formatura', 'cerimônia', 'cerimonia', 'defesa', 'qualificação',
  'fórum', 'forum', 'debate', 'mesa-redonda',
  'semana', 'jornada', 'colóquio', 'coloquio', 'workshop',
  'festa', 'aniversário', 'aniversario', 'comemoração', 'comemoracao',
  'naugural', 'abertura', 'encerramento'];

// v4.4.2: Regex para detectar prazo no caption
const DEADLINE_REGEX_IG = /(^|\s|\.|,)(prazo|ate|at[eé]|inscricoes? (ate|at[eé]|vao at[eé]|v[ãa]o at[eé]|abertas? ate|abertas? at[eé]|prorrogadas? ate|prorrogadas? at[eé]|ate o|at[eé] o)|inscrições? (at[eé]|v[ãa]o at[eé]|abertas? at[eé]|prorrogadas? at[eé]|ate o|at[eé] o)|submissoes? (ate|at[eé]|ate o|at[eé] o)|submissão (ate|at[eé]|ate o|at[eé] o)|encerram? em|encerram? no dia|terminam? em|data limite|data de inscricao|data de inscrição|data de submissao|data de submissão|prazo final|prazo limite|prazo de inscricao|prazo de submissao|vagas? limitadas?|vagas? dispon[ií]veis)(\s|$|\.|,)/i;

function normalizeTextPT(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedTokenMatches(token, termToken) {
  if (token === termToken) return true;
  const pluralForms = new Set();
  if (termToken.endsWith('ao')) pluralForms.add(`${termToken.slice(0, -2)}oes`);
  if (termToken.endsWith('l')) pluralForms.add(`${termToken.slice(0, -1)}is`);
  if (termToken.endsWith('m')) pluralForms.add(`${termToken.slice(0, -1)}ns`);
  if (termToken.endsWith('r') || termToken.endsWith('z')) pluralForms.add(`${termToken}es`);
  if (!termToken.endsWith('s')) pluralForms.add(`${termToken}s`);
  return pluralForms.has(token);
}

function containsNormalizedTerm(text, term) {
  const haystack = normalizeTextPT(text);
  const needle = normalizeTextPT(term);
  if (!haystack || !needle) return false;
  const tokens = haystack.split(' ');
  const termTokens = needle.split(' ');
  for (let start = 0; start <= tokens.length - termTokens.length; start++) {
    if (termTokens.every((termToken, offset) =>
      normalizedTokenMatches(tokens[start + offset], termToken)
    )) return true;
  }
  return false;
}

function matchingInstagramTerms(text, terms) {
  return terms.filter(term => containsNormalizedTerm(text, term));
}

function has(t, term) {
  return containsNormalizedTerm(t, term);
}

function relevantInstagramSignal(caption, futureDates, hasDeadline) {
  const strongOpportunity = matchingInstagramTerms(caption, STRONG_OPPORTUNITY_TERMS_IG);
  const actionEvent = matchingInstagramTerms(caption, ACTION_EVENT_TERMS_IG);
  const genericNoise = matchingInstagramTerms(caption, GENERIC_IG_NOISE).length > 0;

  if (genericNoise && !hasDeadline && futureDates.length === 0) {
    return { relevant: false, reason: 'generic_news_or_profile', strongOpportunity, actionEvent };
  }
  if (strongOpportunity.length > 0) {
    return { relevant: true, reason: 'strong_opportunity', strongOpportunity, actionEvent };
  }
  if (hasDeadline && actionEvent.length > 0) {
    return { relevant: true, reason: 'event_with_deadline', strongOpportunity, actionEvent };
  }
  if (futureDates.length > 0 && actionEvent.length > 0) {
    return { relevant: true, reason: 'future_event', strongOpportunity, actionEvent };
  }
  return { relevant: false, reason: 'weak_signal', strongOpportunity, actionEvent };
}

// v4.4.2: Classificar módulo (oportunidade ou evento)
function classifyModule(caption) {
  let opp = 0, evt = 0;
  for (const t of OPP_SIGNALS_IG) if (containsNormalizedTerm(caption, t)) opp++;
  for (const t of EVT_SIGNALS_IG) if (containsNormalizedTerm(caption, t)) evt++;
  if (opp === 0 && evt === 0) return null;
  return opp > evt ? 'oportunidades' : 'eventos';
}

// v4.4.2: Classificar categoria (bolsa, monitoria, estagio, pesquisa, etc)
function classifyCategory(caption) {
  const nt = normalizeTextPT(caption);
  if (has(nt, 'vestibular') || has(nt, 'sisu') || has(nt, 'concurso') || has(nt, 'professor substituto')) return 'empregos';
  if (has(nt, 'estagio') || has(nt, 'estágio')) return 'estagios';
  if (has(nt, 'monitoria')) return 'monitoria';
  if (has(nt, 'voluntariado')) return 'voluntariado';
  if (has(nt, 'bolsa') || has(nt, 'auxilio') || has(nt, 'permanencia') || has(nt, 'probec')) return 'bolsas';
  if (has(nt, 'pesquisa') || has(nt, 'pibic') || has(nt, 'pivic') || has(nt, 'fapeg') ||
      has(nt, 'mestrado') || has(nt, 'doutorado') || has(nt, 'pos-graduacao') ||
      has(nt, 'premiacao') || has(nt, 'idioma sem fronteiras')) return 'pesquisa';
  if (has(nt, 'palestra') || has(nt, 'seminario') || has(nt, 'congresso') || has(nt, 'simposio') ||
      has(nt, 'oficina') || has(nt, 'workshop') || has(nt, 'curso')) return 'workshops';
  if (has(nt, 'aula inaugural') || has(nt, 'seminario academico') || has(nt, 'conferencia academica') ||
      has(nt, 'jornada academica')) return 'academicos';
  if (has(nt, 'exposicao') || has(nt, 'mostra cultural') || has(nt, 'feira') ||
      has(nt, 'festival') || has(nt, 'concerto') || has(nt, 'espetaculo')) return 'culturais';
  return null;
}

// v4.4.2: Detectar prazo no caption
function detectDeadlineInCaption(caption) {
  if (!caption) return false;
  return DEADLINE_REGEX_IG.test(caption);
}

function isoDateFromParts(day, month, year, referenceDate = new Date()) {
  const referenceIso = isoDateInTimeZone(referenceDate);
  let y = year
    ? parseInt(year, 10)
    : Number(referenceIso.slice(0, 4));
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  let candidate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidIsoCalendarDate(candidate)) return null;

  // Instagram frequentemente omite o ano. Somente atravessamos a virada
  // quando a referencia esta no fim do ano e a data citada no inicio do
  // seguinte; fora dessa janela, uma data passada continua passada.
  const referenceMonth = Number(referenceIso.slice(5, 7));
  if (!year && candidate < referenceIso && referenceMonth >= 10 && m <= 3) {
    y += 1;
    candidate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isValidIsoCalendarDate(candidate)) return null;
  }
  return candidate;
}

function extractInstagramDatesFromCaption(caption, referenceDate = new Date()) {
  const text = String(caption || '');
  const dates = new Set();
  const months = {
    janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  };
  const numeric = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](20\d{2}))?\b/g;
  let m;
  while ((m = numeric.exec(text)) !== null) {
    const iso = isoDateFromParts(m[1], m[2], m[3], referenceDate);
    if (iso) dates.add(iso);
  }
  const byName = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(20\d{2}))?\b/gi;
  while ((m = byName.exec(text)) !== null) {
    const month = months[normalizeTextPT(m[2])] || 0;
    const iso = isoDateFromParts(m[1], month, m[3], referenceDate);
    if (iso) dates.add(iso);
  }
  return [...dates].sort();
}

function extractFutureDatesFromCaption(caption, referenceDate = new Date()) {
  const today = isoDateInTimeZone(referenceDate);
  return extractInstagramDatesFromCaption(caption, referenceDate)
    .filter(date => date >= today);
}

function analyzeInstagramTemporalEvidence(caption, referenceDate = new Date()) {
  const today = isoDateInTimeZone(referenceDate);
  const allDates = extractInstagramDatesFromCaption(caption, referenceDate);
  const futureDates = allDates.filter(date => date >= today);
  const pastDates = allDates.filter(date => date < today);
  const hasDeadlineLanguage = detectDeadlineInCaption(caption);
  const normalized = normalizeTextPT(caption);
  const lifecycleSignals = [];
  for (const term of REOPENING_TERMS_IG) {
    const normalizedTerm = normalizeTextPT(term);
    let offset = normalized.indexOf(normalizedTerm);
    while (offset >= 0) {
      lifecycleSignals.push({ type: 'reopened', term: normalizedTerm, offset });
      offset = normalized.indexOf(normalizedTerm, offset + normalizedTerm.length);
    }
  }
  for (const term of CLOSED_APPLICATION_TERMS_IG) {
    const normalizedTerm = normalizeTextPT(term);
    let offset = normalized.indexOf(normalizedTerm);
    while (offset >= 0) {
      const context = normalized.slice(Math.max(0, offset - 40), offset + normalizedTerm.length + 40);
      const historical = /\b(?:anteriormente|prazo anterior|etapa anterior|primeira etapa)\b/.test(context);
      lifecycleSignals.push({ type: 'closed', term: normalizedTerm, offset, historical });
      offset = normalized.indexOf(normalizedTerm, offset + normalizedTerm.length);
    }
  }
  lifecycleSignals.sort((left, right) => left.offset - right.offset);
  const effectiveSignals = lifecycleSignals.filter(signal => signal.type !== 'closed' || !signal.historical);
  const lastLifecycleSignal = effectiveSignals.at(-1) || null;
  const hasReopeningSignal = lifecycleSignals.some(signal => signal.type === 'reopened');
  const activeReopening = futureDates.length > 0
    && hasReopeningSignal
    && (!lastLifecycleSignal || lastLifecycleSignal.type === 'reopened');
  const explicitlyClosed = lifecycleSignals.some(signal => signal.type === 'closed' && !signal.historical)
    && !activeReopening;
  const isExpired = explicitlyClosed
    || (futureDates.length === 0 && pastDates.length > 0 && hasDeadlineLanguage);
  return {
    today,
    allDates,
    futureDates,
    pastDates,
    hasDeadlineLanguage,
    explicitlyClosed,
    activeReopening,
    lifecycleSignals,
    isExpired,
    status: isExpired ? 'expired' : (futureDates.length > 0 ? 'upcoming' : 'unknown'),
  };
}

function instagramDetailComplete(post) {
  return post?._needsDetail === false
    && String(post?._detailStatus || '').toLowerCase() === 'succeeded';
}

function scoreInstagramPostEvidence(evidence = {}) {
  const matchedTerms = Array.isArray(evidence.matchedTerms) ? evidence.matchedTerms : [];
  const strongOpportunityTerms = Array.isArray(evidence.strongOpportunityTerms)
    ? evidence.strongOpportunityTerms
    : [];
  const actionEventTerms = Array.isArray(evidence.actionEventTerms)
    ? evidence.actionEventTerms
    : [];
  const actionEvidence = Array.isArray(evidence.actionEvidence) ? evidence.actionEvidence : [];
  const futureDates = Array.isArray(evidence.futureDates) ? evidence.futureDates : [];
  const detailComplete = evidence.detailComplete === true;
  const activeOpportunity = detailComplete
    && actionEvidence.length > 0
    && futureDates.length > 0
    && evidence.expired !== true;

  let score = 0.18;
  score += Math.min(matchedTerms.length * 0.04, 0.16);
  if (strongOpportunityTerms.length > 0) score += 0.12;
  if (actionEventTerms.length > 0) score += 0.08;
  if (evidence.module) score += 0.03;
  if (evidence.category) score += 0.04;
  if (detailComplete) score += 0.10;
  if (actionEvidence.length > 0) score += 0.14;
  if (futureDates.length > 0) score += 0.18;
  if (evidence.hasDeadline === true) score += 0.08;
  if (activeOpportunity) score += 0.08;

  const penaltySignals = Array.isArray(evidence.penaltySignals) ? evidence.penaltySignals : [];
  if (penaltySignals.includes('academic_defense')) score = Math.min(score - 0.20, 0.59);
  if (penaltySignals.includes('veteran_content')) score = Math.min(score - 0.20, 0.59);
  if (penaltySignals.includes('awarded_grant')) score = Math.min(score, 0.35);
  if (penaltySignals.includes('terminal_result')) score = Math.min(score, 0.35);
  if (evidence.expired === true) score = Math.min(score, 0.35);

  // Uma legenda truncada ou sem ação/data concreta pode ir para revisão, mas
  // nunca ultrapassa sozinha o corte automático de publicação (0,70).
  if (!activeOpportunity) score = Math.min(score, 0.69);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function computeIGScore(inc, caption, evidence = {}) {
  const matchedTerms = Array.isArray(inc) ? inc : [];
  return scoreInstagramPostEvidence({
    ...evidence,
    matchedTerms,
    module: evidence.module || classifyModule(caption),
    category: evidence.category || classifyCategory(caption),
    hasDeadline: evidence.hasDeadline ?? detectDeadlineInCaption(caption),
  });
}

function hasActivePreliminaryResultFollowup(caption, futureDates, hasDeadline) {
  const preliminary = matchingInstagramTerms(caption, PRELIMINARY_RESULT_TERMS_IG).length > 0;
  if (!preliminary || (!hasDeadline && futureDates.length === 0)) return false;
  return matchingInstagramTerms(caption, RESULT_FOLLOWUP_TERMS_IG).length > 0;
}

function excludedInstagramTerms(
  caption,
  activePreliminaryFollowup = false,
  activeReopening = false,
) {
  return matchingInstagramTerms(caption, EXCLUDE_TERMS).filter(term =>
    (!activePreliminaryFollowup
      || !OVERRIDABLE_RESULT_EXCLUDE_TERMS_IG.has(normalizeTextPT(term)))
    && (!activeReopening
      || !CLOSED_APPLICATION_TERMS_IG.includes(normalizeTextPT(term)))
  );
}

function classifyInstagramPost(post, referenceDate = new Date()) {
  const caption = String(post?.text || post?.title || '');
  const matchedTerms = matchingInstagramTerms(caption, INCLUDE_TERMS);
  const temporal = analyzeInstagramTemporalEvidence(caption, referenceDate);
  const futureDates = temporal.futureDates;
  let module = classifyModule(caption);
  const category = classifyCategory(caption);
  const hasDeadline = temporal.hasDeadlineLanguage || futureDates.length > 0;
  const activePreliminaryFollowup = hasActivePreliminaryResultFollowup(
    caption,
    futureDates,
    hasDeadline,
  );
  const excludedTerms = excludedInstagramTerms(
    caption,
    activePreliminaryFollowup,
    temporal.activeReopening,
  );
  const relevanceInfo = activePreliminaryFollowup
    ? {
        relevant: true,
        reason: 'preliminary_result_active_followup',
        strongOpportunity: matchingInstagramTerms(caption, RESULT_FOLLOWUP_TERMS_IG),
        actionEvent: [],
      }
    : relevantInstagramSignal(caption, futureDates, hasDeadline);
  if (activePreliminaryFollowup && !module) module = 'oportunidades';
  const isPastEvent = /\b(aconteceu|ocorreu|foi realizado|encerrou|terminou|ultima sexta|ultimo sabado)\b/i.test(caption);
  const isRepost = /^(repost de|compartilhado por|via)\s+@?[a-z0-9_.]+/i.test(caption) ||
    /repost de\s+@?[a-z0-9_.]+/i.test(caption.slice(0, 200));
  const skipReason = excludedTerms.length > 0
    ? 'exclude_terms'
    : (isPastEvent ? 'past_event_terms' : (isRepost ? 'repost' : ''));

  const actionEvidence = matchingInstagramTerms(caption, ACTION_CTA_TERMS_IG);
  if (relevanceInfo.actionEvent.length > 0 && futureDates.length > 0) {
    actionEvidence.push(...relevanceInfo.actionEvent);
  }
  if (activePreliminaryFollowup) {
    actionEvidence.push(...matchingInstagramTerms(caption, RESULT_FOLLOWUP_TERMS_IG));
  }
  const normalizedActionEvidence = [...new Set(actionEvidence.map(normalizeTextPT))].filter(Boolean);
  const penaltySignals = [];
  if (!activePreliminaryFollowup
      && matchingInstagramTerms(caption, TERMINAL_RESULT_TERMS_IG).length > 0) {
    penaltySignals.push('terminal_result');
  }
  if (matchingInstagramTerms(caption, DEFENSE_TERMS_IG).length > 0) {
    penaltySignals.push('academic_defense');
  }
  if (matchingInstagramTerms(caption, AWARDED_GRANT_TERMS_IG).length > 0) {
    penaltySignals.push('awarded_grant');
  }
  if (matchingInstagramTerms(caption, VETERAN_TERMS_IG).length > 0) {
    penaltySignals.push('veteran_content');
  }

  const detailComplete = instagramDetailComplete(post);
  const score = scoreInstagramPostEvidence({
    matchedTerms,
    strongOpportunityTerms: relevanceInfo.strongOpportunity,
    actionEventTerms: relevanceInfo.actionEvent,
    actionEvidence: normalizedActionEvidence,
    futureDates,
    detailComplete,
    module,
    category,
    hasDeadline,
    expired: temporal.isExpired,
    penaltySignals,
  });

  return {
    ...post,
    relevant: relevanceInfo.relevant && !skipReason,
    relevanceReason: relevanceInfo.reason,
    strongOpportunityTerms: relevanceInfo.strongOpportunity.slice(0, 8),
    actionEventTerms: relevanceInfo.actionEvent.slice(0, 8),
    matchedTerms: matchedTerms.slice(0, 8),
    excludedTerms: excludedTerms.slice(0, 8),
    module,
    category,
    hasDeadline,
    allDates: temporal.allDates,
    futureDates,
    pastDates: temporal.pastDates,
    expired: temporal.isExpired,
    temporalStatus: temporal.status,
    activeReopening: temporal.activeReopening,
    actionEvidence: normalizedActionEvidence,
    penaltySignals,
    detailComplete,
    score,
    skipReason,
  };
}

function shouldCheckpointInstagramPreliminarySkip(post) {
  return Boolean(post?.skipReason) && post?._needsDetail !== true;
}

function selectInstagramDetailQueue(results, { skipEnrich = false } = {}) {
  if (skipEnrich) return [];
  const queue = (Array.isArray(results) ? results : []).flatMap(result =>
    (Array.isArray(result?.posts) ? result.posts : [])
      .filter(post => post?._isNew === true && post?._needsDetail === true)
  );
  return dedupeInstagramPostsByShortcode(queue);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function resolveInstagramScanTiming(env = process.env) {
  return {
    // These are execution-contract limits, not performance targets. Allowing an
    // environment override below the defaults would make coverage fail because
    // the outer supervisor and the per-profile scanner would disagree.
    profileTimeoutMs: boundedInteger(env.CADU_IG_PROFILE_TIMEOUT_MS, 20000, 20000, 120000),
    profilePauseMs: boundedInteger(env.CADU_IG_PROFILE_PAUSE_MS, 1000, 1000, 10000),
    discoveryBudgetMs: boundedInteger(
      env.CADU_IG_DISCOVERY_BUDGET_MS,
      90000,
      90000,
      300000,
    ),
    supervisorMarginMs: boundedInteger(
      env.CADU_IG_SCANNER_TIMEOUT_MARGIN_MS,
      60000,
      60000,
      900000,
    ),
  };
}

function resolveInstagramDiscoveryLimits(env = process.env) {
  return {
    maxProfiles: boundedInteger(env.CADU_IG_DISCOVERY_MAX_PROFILES, 3, 0, 10),
  };
}

function resolveInstagramSupervisorTimeout({
  profileCount = getActiveInstagramHandles().length,
  skipEnrich = false,
  includeDiscovery = true,
  env = process.env,
} = {}) {
  const resolvedProfileCount = Number.isInteger(profileCount)
    && profileCount >= 1
    && profileCount <= 500
    ? profileCount
    : null;
  if (resolvedProfileCount === null) {
    throw new RangeError('Instagram supervisor profileCount must be an integer between 1 and 500');
  }

  const timing = resolveInstagramScanTiming(env);
  const discovery = resolveInstagramDiscoveryLimits(env);
  const discoveredProfileCap = includeDiscovery ? discovery.maxProfiles : 0;
  const profileBudgetCount = resolvedProfileCount + discoveredProfileCap;
  const detailBudgetMs = skipEnrich ? 0 : resolveInstagramDetailLimits(env).budgetMs;
  const discoveryBudgetMs = includeDiscovery ? timing.discoveryBudgetMs : 0;
  const profileBudgetMs = profileBudgetCount * timing.profileTimeoutMs;
  const pauseBudgetMs = Math.max(0, profileBudgetCount - 1) * timing.profilePauseMs;
  const contractMs = profileBudgetMs + pauseBudgetMs + detailBudgetMs
    + discoveryBudgetMs + timing.supervisorMarginMs;

  // Four hours is a safety ceiling for an operator-supplied extension. The
  // computed contract itself always wins, even if a future legitimate profile
  // inventory grows beyond that ceiling.
  const configured = Number(env.CADU_IG_SCANNER_TIMEOUT_MS);
  const configuredTimeoutMs = Number.isInteger(configured) && configured >= 1
    ? Math.min(configured, 4 * 60 * 60 * 1000)
    : contractMs;

  return {
    timeoutMs: Math.max(contractMs, configuredTimeoutMs),
    contractMs,
    configuredTimeoutMs,
    profileCount: resolvedProfileCount,
    profileBudgetCount,
    discoveredProfileCap,
    profileTimeoutMs: timing.profileTimeoutMs,
    profilePauseMs: timing.profilePauseMs,
    profileBudgetMs,
    pauseBudgetMs,
    detailBudgetMs,
    discoveryBudgetMs,
    marginMs: timing.supervisorMarginMs,
    skipEnrich: skipEnrich === true,
    includeDiscovery: includeDiscovery === true,
  };
}

function resolveInstagramDetailLimits(env = process.env) {
  return {
    maxPosts: boundedInteger(env.CADU_IG_DETAIL_MAX_POSTS, 72, 1, 150),
    budgetMs: boundedInteger(env.CADU_IG_DETAIL_BUDGET_MS, 360000, 5000, 900000),
  };
}

function resolveInstagramProfileLimits(env = process.env) {
  return {
    maxPosts: boundedInteger(env.CADU_IG_PROFILE_MAX_POSTS, 60, 1, 150),
  };
}

function resolveInstagramGridLimits(env = process.env) {
  const maxItems = boundedInteger(env.CADU_IG_GRID_MAX_ITEMS, 60, 12, 150);
  return {
    maxItems,
    // Already-seen cards must not consume the opportunity cap. Keep a
    // separate hard observation ceiling so deep profiles remain bounded.
    maxObservedItems: boundedInteger(
      env.CADU_IG_GRID_MAX_OBSERVED_ITEMS,
      Math.max(300, maxItems),
      maxItems,
      600,
    ),
    maxScrolls: boundedInteger(env.CADU_IG_GRID_MAX_SCROLLS, 12, 1, 20),
    budgetMs: boundedInteger(env.CADU_IG_GRID_BUDGET_MS, 12000, 2000, 16000),
    settleMs: boundedInteger(env.CADU_IG_GRID_SETTLE_MS, 600, 100, 2000),
    terminalBatches: boundedInteger(env.CADU_IG_GRID_TERMINAL_BATCHES, 2, 1, 4),
  };
}

function resolveInstagramLookbackDays(env = process.env) {
  return boundedInteger(env.CADU_IG_LOOKBACK_DAYS, 180, 1, 730);
}

function resolveInstagramSeenRetentionDays(
  lookbackDays = INSTAGRAM_LOOKBACK_DAYS,
) {
  return Math.max(180, boundedInteger(lookbackDays, INSTAGRAM_LOOKBACK_DAYS, 1, 730));
}

function instagramLookbackCutoff(dateBrt = TIMESTAMP, lookbackDays = INSTAGRAM_LOOKBACK_DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateBrt || ''))) return '';
  const days = boundedInteger(lookbackDays, INSTAGRAM_LOOKBACK_DAYS, 1, 730);
  const reference = Date.parse(`${dateBrt}T12:00:00Z`);
  if (!Number.isFinite(reference)) return '';
  return new Date(reference - (days * 86400000)).toISOString().slice(0, 10);
}

function shouldKeepInstagramGridPost(post, {
  dateBrt = TIMESTAMP,
  lookbackDays = INSTAGRAM_LOOKBACK_DAYS,
} = {}) {
  const postDate = String(post?.date || '').trim();
  if (!postDate) return true;
  const cutoff = instagramLookbackCutoff(dateBrt, lookbackDays);
  return !cutoff || postDate >= cutoff;
}

function instagramGridPostDate(post) {
  const existing = String(post?.date || '').trim();
  if (isValidIsoCalendarDate(existing)) return existing;
  const match = String(post?.dateStr || '').match(/([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  if (!match) return '';
  const months = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
  };
  const candidate = `${match[3]}-${months[match[1]] || '00'}-${String(parseInt(match[2], 10)).padStart(2, '0')}`;
  return isValidIsoCalendarDate(candidate) ? candidate : '';
}

function requiresInstagramGridDetail(post) {
  return Boolean(String(post?.url || '').trim());
}

function createInstagramGridScanState() {
  return {
    posts: [],
    observedItems: 0,
    scrolls: 0,
    consecutiveEmptyBatches: 0,
    consecutiveTerminalBatches: 0,
    seenItems: 0,
    oldItems: 0,
    eligibleItems: 0,
    stopReason: '',
  };
}

function ingestInstagramGridBatch(state, batch, {
  seenPosts = {},
  dateBrt = TIMESTAMP,
  lookbackDays = INSTAGRAM_LOOKBACK_DAYS,
  limits = INSTAGRAM_GRID_LIMITS,
  elapsedMs = 0,
} = {}) {
  const previous = state || createInstagramGridScanState();
  const known = new Set(previous.posts.map(post => post.url).filter(Boolean));
  const fresh = [];
  for (const post of Array.isArray(batch) ? batch : []) {
    const url = String(post?.url || '').trim();
    if (!url || known.has(url)) continue;
    known.add(url);
    fresh.push(post);
  }

  const maxEligibleItems = boundedInteger(limits.maxItems, 60, 1, 150);
  const maxObservedItems = boundedInteger(
    limits.maxObservedItems,
    Math.max(300, maxEligibleItems),
    maxEligibleItems,
    600,
  );
  const observedBefore = Number.isSafeInteger(previous.observedItems)
    ? previous.observedItems
    : previous.posts.length;
  const accepted = [];
  let seenItems = 0;
  let oldItems = 0;
  let eligibleItems = 0;
  let oldNonPinnedItems = 0;
  let terminalCandidates = 0;
  for (const post of fresh) {
    if (observedBefore + accepted.length >= maxObservedItems) break;
    accepted.push(post);
    const date = instagramGridPostDate(post);
    const current = isNewPost(post.url, seenPosts);
    const withinLookback = shouldKeepInstagramGridPost(
      { ...post, date },
      { dateBrt, lookbackDays },
    );
    if (!current) seenItems += 1;
    if (!withinLookback) oldItems += 1;
    if (current && withinLookback) eligibleItems += 1;
    if (!post?.isPinned) {
      terminalCandidates += 1;
      if (!withinLookback) oldNonPinnedItems += 1;
    }
    if (previous.eligibleItems + eligibleItems >= maxEligibleItems) break;
  }

  // A seen checkpoint is intentionally sparse: posts awaiting detail or
  // downstream acknowledgement are not persisted there.  Therefore a page
  // containing only seen posts is not a chronological frontier.  Only the
  // explicit lookback cutoff may end pagination early; the hard scroll/item/
  // time limits still bound profiles whose dates are unavailable.
  const terminalBatch = terminalCandidates > 0
    && oldNonPinnedItems === terminalCandidates;
  const next = {
    ...previous,
    posts: previous.posts.concat(accepted),
    observedItems: observedBefore + accepted.length,
    consecutiveEmptyBatches: accepted.length === 0
      ? previous.consecutiveEmptyBatches + 1
      : 0,
    consecutiveTerminalBatches: terminalBatch
      ? previous.consecutiveTerminalBatches + 1
      : 0,
    seenItems: previous.seenItems + seenItems,
    oldItems: previous.oldItems + oldItems,
    eligibleItems: previous.eligibleItems + eligibleItems,
    stopReason: '',
  };

  if (elapsedMs >= limits.budgetMs) next.stopReason = 'budget';
  else if (next.eligibleItems >= maxEligibleItems) next.stopReason = 'max_items';
  else if (next.observedItems >= maxObservedItems) next.stopReason = 'max_observed_items';
  else if (next.scrolls >= limits.maxScrolls) next.stopReason = 'max_scrolls';
  else if (next.consecutiveEmptyBatches >= 2) next.stopReason = 'stable_grid';
  else if (next.consecutiveTerminalBatches >= limits.terminalBatches) {
    next.stopReason = 'seen_or_cutoff';
  }
  return next;
}

function advanceInstagramGridScan(state) {
  return { ...state, scrolls: state.scrolls + 1 };
}

function instagramShortcode(post) {
  const candidate = String(post?.link || post?.url || '').trim();
  return instagramPostShortcode(candidate);
}

function instagramPreliminaryPriority(post) {
  let priority = 0;
  if (post?.relevant === true) priority += 100;
  priority += (Array.isArray(post?.strongOpportunityTerms) ? post.strongOpportunityTerms.length : 0) * 12;
  priority += (Array.isArray(post?.actionEventTerms) ? post.actionEventTerms.length : 0) * 8;
  if (post?.hasDeadline === true) priority += 18;
  if (Array.isArray(post?.futureDates) && post.futureDates.length > 0) priority += 20;
  if (post?.module === 'oportunidades') priority += 8;
  priority += Math.min(String(post?.text || '').trim().length, 400) / 100;
  return priority;
}

function dedupeInstagramPostsByShortcode(posts) {
  const byIdentity = new Map();
  const withoutShortcode = [];
  for (const post of Array.isArray(posts) ? posts : []) {
    const shortcode = instagramShortcode(post);
    if (!shortcode) {
      withoutShortcode.push(post);
      continue;
    }
    const current = byIdentity.get(shortcode);
    if (!current || instagramPreliminaryPriority(post) > instagramPreliminaryPriority(current)) {
      byIdentity.set(shortcode, post);
    }
  }
  return [...byIdentity.values(), ...withoutShortcode];
}

function limitInstagramProfilePosts(posts, maxPosts = INSTAGRAM_PROFILE_LIMITS.maxPosts) {
  const candidates = Array.isArray(posts) ? posts : [];
  const limit = boundedInteger(maxPosts, INSTAGRAM_PROFILE_LIMITS.maxPosts, 1, 150);
  const retained = candidates.slice(0, limit);
  return {
    posts: retained,
    candidates: candidates.length,
    retained: retained.length,
    truncated: Math.max(0, candidates.length - retained.length),
    maxPosts: limit,
  };
}

function limitInstagramDetailQueue(posts, maxPosts = INSTAGRAM_DETAIL_LIMITS.maxPosts) {
  const queue = Array.isArray(posts) ? posts : [];
  const limit = boundedInteger(maxPosts, INSTAGRAM_DETAIL_LIMITS.maxPosts, 1, 150);
  return queue.slice(0, limit);
}

function rotateInstagramDetailQueue(
  posts,
  dateBrt = TIMESTAMP,
  windowSize = INSTAGRAM_DETAIL_LIMITS.maxPosts,
) {
  const queue = Array.isArray(posts) ? [...posts] : [];
  if (queue.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateBrt || ''))) return queue;
  const dayNumber = Math.floor(Date.parse(`${dateBrt}T12:00:00Z`) / 86400000);
  const step = boundedInteger(windowSize, INSTAGRAM_DETAIL_LIMITS.maxPosts, 1, 150);
  if (!Number.isFinite(dayNumber)) return queue;
  const offset = ((dayNumber * step) % queue.length + queue.length) % queue.length;
  return queue.slice(offset).concat(queue.slice(0, offset));
}

function normalizeInstagramDetailCursor(value) {
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

function rotateInstagramDetailQueueByCursor(posts, cursor = 0) {
  const queue = Array.isArray(posts) ? [...posts] : [];
  if (queue.length < 2) return queue;
  const offset = normalizeInstagramDetailCursor(cursor) % queue.length;
  return queue.slice(offset).concat(queue.slice(0, offset));
}

function roundRobinInstagramDetailQueue(posts) {
  const groups = new Map();
  for (const post of Array.isArray(posts) ? posts : []) {
    const handle = String(post?.source || '').replace(/^ig:@/, '') || 'unknown';
    if (!groups.has(handle)) groups.set(handle, []);
    groups.get(handle).push(post);
  }
  const queues = [...groups.values()];
  const result = [];
  let cursor = 0;
  while (queues.some(queue => cursor < queue.length)) {
    for (const queue of queues) {
      if (cursor < queue.length) result.push(queue[cursor]);
    }
    cursor += 1;
  }
  return result;
}

function mergeWeightedInstagramDetailQueues(
  priorityPosts,
  explorationPosts,
  priorityWeight = 3,
  mixCursor = 0,
) {
  const priority = Array.isArray(priorityPosts) ? priorityPosts : [];
  const exploration = Array.isArray(explorationPosts) ? explorationPosts : [];
  const weight = boundedInteger(priorityWeight, 3, 1, 10);
  const result = [];
  let priorityCursor = 0;
  let explorationCursor = 0;
  const cycleLength = weight + 1;
  let phase = normalizeInstagramDetailCursor(mixCursor) % cycleLength;

  while (priorityCursor < priority.length || explorationCursor < exploration.length) {
    const preferPriority = phase < weight;
    if (preferPriority && priorityCursor < priority.length) {
      result.push(priority[priorityCursor++]);
    } else if (!preferPriority && explorationCursor < exploration.length) {
      result.push(exploration[explorationCursor++]);
    } else if (priorityCursor < priority.length) {
      result.push(priority[priorityCursor++]);
    } else {
      result.push(exploration[explorationCursor++]);
    }
    // Exactly one weighted phase is consumed per emitted post, including a
    // fallback when one lane is empty. This keeps persisted progress tied to
    // the prefix actually requested rather than the planned queue window.
    phase = (phase + 1) % cycleLength;
  }
  return result;
}

function normalizeInstagramDetailLanes(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    priorityCursor: normalizeInstagramDetailCursor(source.priorityCursor),
    explorationCursor: normalizeInstagramDetailCursor(source.explorationCursor),
    mixCursor: normalizeInstagramDetailCursor(source.mixCursor),
  };
}

function advanceInstagramDetailLanes(lanes, {
  priorityRequested = 0,
  explorationRequested = 0,
  totalRequested = 0,
} = {}) {
  const current = normalizeInstagramDetailLanes(lanes);
  const advance = (cursor, amount) => {
    const increment = normalizeInstagramDetailCursor(amount);
    return (cursor + increment) % 2147483647;
  };
  return {
    priorityCursor: advance(current.priorityCursor, priorityRequested),
    explorationCursor: advance(current.explorationCursor, explorationRequested),
    mixCursor: advance(current.mixCursor, totalRequested),
  };
}

function advanceInstagramDetailLanesForScope(lanes, requested = {}, {
  scope = 'all_active',
} = {}) {
  return scope === 'all_active'
    ? advanceInstagramDetailLanes(lanes, requested)
    : normalizeInstagramDetailLanes(lanes);
}

function instagramDetailLaneQuotas(
  priorityCount,
  explorationCount,
  windowSize = INSTAGRAM_DETAIL_LIMITS.maxPosts,
  priorityWeight = 3,
) {
  const priorityTotal = Math.max(0, Math.floor(Number(priorityCount) || 0));
  const explorationTotal = Math.max(0, Math.floor(Number(explorationCount) || 0));
  const cap = boundedInteger(windowSize, INSTAGRAM_DETAIL_LIMITS.maxPosts, 1, 150);
  const configuredWeight = boundedInteger(priorityWeight, 3, 1, 10);
  const weight = priorityTotal > 0 && explorationTotal > 0 && cap > 1
    ? Math.min(configuredWeight, cap - 1)
    : configuredWeight;
  let priority = 0;
  let exploration = 0;
  let consumed = 0;
  while (consumed < cap && (priority < priorityTotal || exploration < explorationTotal)) {
    for (let index = 0;
      index < weight && priority < priorityTotal && consumed < cap;
      index++) {
      priority++;
      consumed++;
    }
    if (exploration < explorationTotal && consumed < cap) {
      exploration++;
      consumed++;
    }
  }
  return { priority, exploration, weight };
}

function prioritizeInstagramDetailQueue(posts, {
  dateBrt = TIMESTAMP,
  windowSize = INSTAGRAM_DETAIL_LIMITS.maxPosts,
  priorityWeight = 3,
  laneCursors = null,
} = {}) {
  const queue = Array.isArray(posts) ? posts : [];
  const discoveryHandles = new Set([
    'ea.ufg', 'fefufg', 'cecasufg', 'direitoufg',
    'patiodaciencia.ufg', 'tvufg', 'lapigufg',
  ]);
  const sourceTier = post => discoveryHandles.has(
    String(post?.source || '').replace(/^ig:@/, ''),
  ) ? 1 : 0;
  const preparePool = pool => roundRobinInstagramDetailQueue(
    pool
      .map((post, index) => ({ post, index }))
      .sort((left, right) => (
        instagramPreliminaryPriority(right.post) - instagramPreliminaryPriority(left.post)
        || sourceTier(right.post) - sourceTier(left.post)
        || left.index - right.index
      ))
      .map(entry => entry.post),
  );

  const likelyRelevantPool = preparePool(queue.filter(post => post?.relevant === true));
  const explorationPool = preparePool(queue.filter(post => post?.relevant !== true));
  const quotas = instagramDetailLaneQuotas(
    likelyRelevantPool.length,
    explorationPool.length,
    windowSize,
    priorityWeight,
  );
  const durableLanes = laneCursors === null || laneCursors === undefined
    ? null
    : normalizeInstagramDetailLanes(laneCursors);
  const likelyRelevant = durableLanes
    ? rotateInstagramDetailQueueByCursor(likelyRelevantPool, durableLanes.priorityCursor)
    : rotateInstagramDetailQueue(
      likelyRelevantPool,
      dateBrt,
      Math.max(1, quotas.priority),
    );
  const exploration = durableLanes
    ? rotateInstagramDetailQueueByCursor(explorationPool, durableLanes.explorationCursor)
    : rotateInstagramDetailQueue(
      explorationPool,
      dateBrt,
      Math.max(1, quotas.exploration),
    );
  return mergeWeightedInstagramDetailQueues(
    likelyRelevant,
    exploration,
    quotas.weight,
    durableLanes?.mixCursor || 0,
  );
}

function hasInstagramDetailBudget(startedAt, budgetMs, now = Date.now()) {
  return Number.isFinite(startedAt)
    && Number.isFinite(budgetMs)
    && budgetMs > 0
    && now - startedAt < budgetMs;
}

function instagramDetailRequirements(post) {
  const captionBaseline = String(post?.text || '').trim();
  const captionLength = captionBaseline.length;
  return {
    caption: captionLength < 150,
    captionMinLength: captionLength,
    captionBaseline,
    date: !String(post?.date || '').trim(),
    evidence: post?._needsDetail === true,
  };
}

const INSTAGRAM_DETAIL_FAILURE_REASONS = new Set([
  'budget_exhausted',
  'caption_missing',
  'caption_not_expanded',
  'date_missing',
  'detail_evaluate_error',
  'detail_evidence_missing',
  'detail_root_missing',
  'detail_unexpected_error',
  'final_handle_mismatch',
  'final_profile_path_mismatch',
  'final_post_handle_mismatch',
  'final_shortcode_mismatch',
  'final_url_invalid',
  'final_url_not_instagram',
  'final_url_not_post',
  'navigation_error',
  'page_navigate_error',
  'requested_shortcode_invalid',
]);

function sanitizeInstagramDetailFailureReason(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('page_navigate_error:')) return 'page_navigate_error';
  if (INSTAGRAM_DETAIL_FAILURE_REASONS.has(normalized)) return normalized;
  return 'detail_unexpected_error';
}

function instagramDetailFailureReasons(detail) {
  const raw = [
    ...(Array.isArray(detail?.failureReasons) ? detail.failureReasons : []),
    detail?.navigationError,
    detail?.extractionError,
  ];
  return [...new Set(raw.map(sanitizeInstagramDetailFailureReason).filter(Boolean))];
}

function mergeInstagramDetails(...details) {
  const captionEntries = details
    .map(detail => ({
      caption: String(detail?.caption || '').trim(),
      extractionSource: String(detail?.extractionSource || '').trim(),
    }))
    .filter(entry => Boolean(entry.caption))
    .sort((left, right) => (
      Number(isAuthoritativeInstagramCaptionEntry(right))
        - Number(isAuthoritativeInstagramCaptionEntry(left))
      || Number(!looksLikeTruncatedInstagramCaption(right.caption))
        - Number(!looksLikeTruncatedInstagramCaption(left.caption))
      || right.caption.length - left.caption.length
    ));
  const date = details
    .map(detail => String(detail?.date || '').trim())
    .find(Boolean) || '';
  const failureReasons = [...new Set(details.flatMap(instagramDetailFailureReasons))];
  const merged = { caption: captionEntries[0]?.caption || '', date };
  if (captionEntries[0]?.extractionSource) {
    merged.extractionSource = captionEntries[0].extractionSource;
  }
  if (failureReasons.length > 0) merged.failureReasons = failureReasons;
  return merged;
}

function isTrustedInstagramCaptionSource(value) {
  return value === 'article_h1' || value === 'og_description';
}

function looksLikeTruncatedInstagramCaption(value, { trusted = false } = {}) {
  const suffix = trusted ? /(?:\.{3}|\u2026)\s*$/ : /(?:\.{3}|\u2026|(?:\s|\u00a0)(?:more|mais))\s*$/i;
  return suffix.test(String(value || '').trim());
}

function isAuthoritativeInstagramCaptionEntry(entry) {
  return isTrustedInstagramCaptionSource(entry?.extractionSource)
    && !looksLikeTruncatedInstagramCaption(entry?.caption, { trusted: true });
}

function instagramDetailCaptionIsComplete(requirements, detail) {
  const needs = requirements || {};
  const detailCaption = String(detail?.caption || '').trim();
  const detailCaptionLength = detailCaption.length;
  const hasCaptionBaseline = Object.prototype.hasOwnProperty.call(needs, 'captionBaseline');
  const captionBaseline = String(needs.captionBaseline || '').trim();
  const normalizedDetailCaption = detailCaption.replace(/\s+/g, ' ');
  const normalizedCaptionBaseline = captionBaseline.replace(/\s+/g, ' ');
  const trustedSource = isTrustedInstagramCaptionSource(detail?.extractionSource);
  const captionAppearsComplete = detailCaptionLength > 0
    && !looksLikeTruncatedInstagramCaption(detailCaption, { trusted: trustedSource });
  const trustedDetailCaption = trustedSource
    && captionAppearsComplete;
  return !needs.caption || (hasCaptionBaseline
    ? trustedDetailCaption
      || (captionAppearsComplete
        && detailCaptionLength > captionBaseline.length
        && normalizedDetailCaption !== normalizedCaptionBaseline)
    : detailCaptionLength >= Math.max(1, Number(needs.captionMinLength) || 0));
}

function instagramDetailIsComplete(requirements, detail) {
  const needs = requirements || {};
  const captionComplete = instagramDetailCaptionIsComplete(needs, detail);
  // Every grid candidate is derived from image alt text.  A date proves that
  // the post loaded, but does not turn that alt text into a caption.  Require
  // caption metadata from the post itself before treating grid evidence as
  // final and checkpointable.
  const evidenceComplete = !needs.evidence
    || isAuthoritativeInstagramCaptionEntry(detail);
  return captionComplete
    && (!needs.date || Boolean(String(detail?.date || '').trim()))
    && evidenceComplete;
}

function applyInstagramPostDetail(post, detail, requirements = instagramDetailRequirements(post)) {
  const originalCaption = String(post?.text || '').trim();
  const fetched = mergeInstagramDetails(detail);
  const merged = mergeInstagramDetails({ caption: originalCaption }, fetched);
  const fetchedHasEvidence = Boolean(fetched.caption || fetched.date);
  const currentCaption = String(post?.text || '').trim();
  const fetchedCaptionIsTrusted = isAuthoritativeInstagramCaptionEntry(fetched);
  const captionToApply = fetchedCaptionIsTrusted ? fetched.caption : merged.caption;
  if (captionToApply && (
    fetchedCaptionIsTrusted
    || requirements.caption
    || captionToApply.length > currentCaption.length
  )) {
    post.text = captionToApply.slice(0, 800);
    post.title = captionToApply.slice(0, 120).replace(/\n/g, ' ');
  }
  if (merged.date && (requirements.date || !String(post?.date || '').trim())) {
    post.date = merged.date;
  }

  const complete = instagramDetailIsComplete(requirements, fetched);
  const failureReasons = instagramDetailFailureReasons(fetched);
  if (!complete && requirements.caption && !fetched.caption) failureReasons.push('caption_missing');
  if (!instagramDetailCaptionIsComplete(requirements, fetched)
      && requirements.caption && fetched.caption) {
    failureReasons.push('caption_not_expanded');
  }
  if (!complete && requirements.date && !fetched.date) failureReasons.push('date_missing');
  if (!complete && requirements.evidence
      && !isAuthoritativeInstagramCaptionEntry(fetched)) {
    failureReasons.push('detail_evidence_missing');
  }
  const uniqueFailureReasons = [...new Set(failureReasons)].slice(0, 8);
  post._needsDetail = !complete;
  post._detailStatus = complete
    ? 'succeeded'
    : (fetchedHasEvidence ? 'partial' : 'failed');
  post._detailFailureReasons = complete ? [] : uniqueFailureReasons;
  Object.assign(post, classifyInstagramPost(post));
  return {
    complete,
    status: post._detailStatus,
    detail: merged,
    fetchedDetail: fetched,
    failureReasons: uniqueFailureReasons,
  };
}

function recordInstagramDetailOutcome(metrics, applied) {
  const outcome = applied?.complete === true
    ? 'succeeded'
    : (applied?.status === 'partial' ? 'partial' : 'failed');
  metrics[outcome] = Number(metrics[outcome] || 0) + 1;
  if (outcome !== 'succeeded') {
    if (!metrics.failureReasons || typeof metrics.failureReasons !== 'object') {
      metrics.failureReasons = {};
    }
    const reasons = Array.isArray(applied?.failureReasons) && applied.failureReasons.length > 0
      ? applied.failureReasons
      : ['detail_unexpected_error'];
    for (const reason of reasons.map(sanitizeInstagramDetailFailureReason).filter(Boolean)) {
      metrics.failureReasons[reason] = Number(metrics.failureReasons[reason] || 0) + 1;
    }
  }
  return outcome;
}

function shouldRetryInstagramDetail(detail) {
  const retryable = new Set([
    'caption_not_expanded',
    'detail_evaluate_error',
    'detail_root_missing',
    'navigation_error',
    'page_navigate_error',
  ]);
  return instagramDetailFailureReasons(detail).some(reason => retryable.has(reason));
}

function shouldCheckpointInstagramPost(post, {
  detailSucceeded = false,
} = {}) {
  return Boolean(post) && (post._needsDetail !== true || detailSucceeded);
}

// ============================================================
// HELPERS
// ============================================================

function normalizeText(t) {
  if (!t) return '';
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://${CDP_HOST}:${CDP_PORT}${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(null); }
      });
    }).on('error', reject).setTimeout(5000, function() { this.destroy(); resolve(null); });
  });
}

// ============================================================
// CDP via WebSocket
// ============================================================

class CDPClient {
  constructor(wsUrl, {
    webSocketFactory = null,
    connectTimeoutMs = 5000,
  } = {}) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.webSocketFactory = typeof webSocketFactory === 'function'
      ? webSocketFactory
      : url => new WebSocket(url);
    this.connectTimeoutMs = boundedInteger(connectTimeoutMs, 5000, 1, 5000);
  }

  _rejectPending(error) {
    const failure = error instanceof Error ? error : new Error(String(error || 'CDP error'));
    for (const { reject } of [...this.pending.values()]) reject(failure);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = this.webSocketFactory(this.wsUrl);
      let settled = false;
      let timer = null;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.ws.removeListener('open', onOpen);
        callback(value);
      };
      const terminateSocket = () => {
        try {
          if (typeof this.ws.terminate === 'function') this.ws.terminate();
          else this.ws.close();
        } catch (_) {}
      };
      const onSocketError = error => {
        const failure = error instanceof Error ? error : new Error('CDP websocket error');
        if (!settled) {
          finish(reject)(failure);
          terminateSocket();
        } else {
          this._rejectPending(failure);
        }
      };
      const onSocketClose = () => {
        const failure = new Error('CDP connection closed');
        if (!settled) finish(reject)(failure);
        else this._rejectPending(failure);
      };
      const onOpen = finish(resolve);
      this.ws.on('open', onOpen);
      this.ws.on('error', onSocketError);
      this.ws.on('close', onSocketClose);
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
            else resolve(msg.result);
          }
        } catch (e) {}
      });
      timer = setTimeout(() => {
        finish(reject)(new Error('CDP connect timeout'));
        terminateSocket();
      }, this.connectTimeoutMs);
    });
  }

  async send(method, params = {}, {
    signal = null,
    timeoutMs = 15000,
  } = {}) {
    throwIfInstagramProfileAborted(signal);
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        this.pending.delete(id);
      };
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const resolvePending = finish(resolve);
      const rejectPending = finish(reject);
      const onAbort = () => rejectPending(instagramProfileAbortError(signal));
      const commandTimeoutMs = boundedInteger(timeoutMs, 15000, 1, 15000);
      this.pending.set(id, { resolve: resolvePending, reject: rejectPending });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(
        () => rejectPending(new Error(`CDP timeout: ${method}`)),
        commandTimeoutMs,
      );
      timer.unref?.();
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        rejectPending(error);
      }
    });
  }

  async evaluate(expression, options = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, options);
    return result?.result?.value;
  }

  async navigate(url, {
    signal = null,
    timeoutMs = 15000,
    wait = sleep,
  } = {}) {
    await this.send('Page.enable', {}, { signal, timeoutMs });
    const result = await this.send('Page.navigate', { url }, { signal, timeoutMs });
    const navigation = validateInstagramNavigation({
      navigationResult: result,
      finalUrl: url,
    });
    if (!navigation.ok) throw new Error(navigation.reason);
    await waitForInstagramProfile(1000, signal, wait);
    return result;
  }

  async extractImageFromPage(selector = 'main img') {
    // HARDENING 2026-06-04: Extract image via canvas to bypass CDN block
    // Instagram CDN (cdninstagram.com) blocks datacenter IPs via HTTP 403
    // Canvas.toDataURL() works because the image is already rendered in-browser
    const result = await this.evaluate(`
      (() => {
        const img = document.querySelector('${selector}');
        if (!img || !img.complete || img.naturalWidth < 200) return null;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return {
          dataUrl: canvas.toDataURL('image/jpeg', 0.90),
          width: img.naturalWidth,
          height: img.naturalHeight
        };
      })()
    `);
    return result;
  }

  close() {
    this._rejectPending(new Error('CDP connection closed'));
    if (this.ws) this.ws.close();
  }
}

// ============================================================
// INSTAGRAM EXTRACTION
// ============================================================

async function readInstagramGridBatch(cdp, { signal = null } = {}) {
  const result = await cdp.evaluate(`
    (() => {
      const posts = [];
      const links = document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]');
      const seen = new Set();
      links.forEach(a => {
        const href = a.getAttribute('href');
        if (!href || seen.has(href)) return;
        seen.add(href);
        const img = a.querySelector('img');
        const alt = img ? img.getAttribute('alt') || '' : '';
        const src = img ? img.getAttribute('src') || '' : '';
        const dateMatch = alt.match(/on ([A-Z][a-z]+ \\d{1,2}, \\d{4})/);
        posts.push({
          url: 'https://www.instagram.com' + href,
          caption: alt,
          imageUrl: src,
          dateStr: dateMatch ? dateMatch[1] : '',
          isReel: href.includes('/reel/'),
          isPinned: alt.includes('Pinned post')
        });
      });
      return posts;
    })()
  `, { signal });
  return Array.isArray(result) ? result : [];
}

async function scrollInstagramGrid(cdp, { signal = null } = {}) {
  return cdp.evaluate(`
    (() => {
      const before = window.scrollY;
      const distance = Math.max(1000, Math.round(window.innerHeight * 1.5));
      window.scrollBy(0, distance);
      return { before, after: window.scrollY, height: document.documentElement.scrollHeight };
    })()
  `, { signal });
}

async function collectInstagramGridPosts(cdp, seenPosts, {
  dateBrt = TIMESTAMP,
  lookbackDays = INSTAGRAM_LOOKBACK_DAYS,
  limits = INSTAGRAM_GRID_LIMITS,
  now = Date.now,
  wait = sleep,
  readBatch = null,
  scroll = null,
  signal = null,
} = {}) {
  const readNextBatch = typeof readBatch === 'function'
    ? readBatch
    : () => readInstagramGridBatch(cdp, { signal });
  const scrollNext = typeof scroll === 'function'
    ? scroll
    : () => scrollInstagramGrid(cdp, { signal });
  const startedAt = now();
  let state = createInstagramGridScanState();
  while (!state.stopReason) {
    throwIfInstagramProfileAborted(signal);
    const batch = await readNextBatch();
    throwIfInstagramProfileAborted(signal);
    state = ingestInstagramGridBatch(state, batch, {
      seenPosts,
      dateBrt,
      lookbackDays,
      limits,
      elapsedMs: now() - startedAt,
    });
    if (state.stopReason) break;

    await scrollNext();
    throwIfInstagramProfileAborted(signal);
    state = advanceInstagramGridScan(state);
    const remainingMs = limits.budgetMs - (now() - startedAt);
    if (remainingMs <= 0) {
      state = { ...state, stopReason: 'budget' };
      break;
    }
    await waitForInstagramProfile(Math.min(limits.settleMs, remainingMs), signal, wait);
  }

  return {
    posts: state.posts,
    total: state.posts.length,
    gridScan: {
      scrolls: state.scrolls,
      observedItems: state.observedItems,
      seenItems: state.seenItems,
      oldItems: state.oldItems,
      eligibleItems: state.eligibleItems,
      stopReason: state.stopReason,
    },
  };
}

function instagramProfileAbortError(signal) {
  const reason = signal?.reason;
  const message = reason instanceof Error ? reason.message : String(reason || 'profile_aborted');
  return new Error(message);
}

function throwIfInstagramProfileAborted(signal) {
  if (signal?.aborted) throw instagramProfileAbortError(signal);
}

function waitForInstagramProfile(milliseconds, signal, wait = sleep) {
  if (!signal) return wait(milliseconds);
  throwIfInstagramProfileAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject)(instagramProfileAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(wait(milliseconds)).then(finish(resolve), finish(reject));
  });
}

async function runInstagramProfileWithTimeout(scrape, timeoutMs, {
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const controller = new AbortController();
  const timeoutMessage = `timeout_${timeoutMs}ms`;
  let timedOut = false;
  const timer = setTimer(() => {
    timedOut = true;
    controller.abort(new Error(timeoutMessage));
  }, timeoutMs);
  try {
    const result = await scrape(controller.signal);
    return { timedOut, result, error: timedOut ? timeoutMessage : null };
  } catch (error) {
    if (timedOut || controller.signal.aborted) {
      return { timedOut: true, result: null, error: timeoutMessage };
    }
    throw error;
  } finally {
    clearTimer(timer);
  }
}

async function scrapeInstagramProfile(cdp, handle, seenPosts, {
  signal = null,
  wait = sleep,
} = {}) {
  const url = `https://www.instagram.com/${handle}/`;

  // Wrap navigate in retry/circuit breaker: blips de DNS (VPS datacenter)
  // e connection reset nao devem matar o scan inteiro (issue 2026-07-24
  // run bab056bf: 76/76 perfis falharam com net::ERR_NAME_NOT_RESOLVED
  // em um blip de rede de ~5 min).
  const navResult = await retryOnNetworkError(
    async () => {
      throwIfInstagramProfileAborted(signal);
      const result = await cdp.navigate(url, { signal, wait });
      return { ok: true, result };
    },
    {
      maxAttempts: 3,
      backoffMs: 1500,
      onRetry: (attempt, err, backoffMs) => {
        console.warn(`[ig-scan] ${handle} navigate retry ${attempt}: ${String(err).slice(0, 80)} (${backoffMs}ms)`);
      },
    },
  );
  if (!navResult.ok) {
    return { handle, posts: [], newPosts: 0, skippedPosts: 0, error: navResult.error };
  }
  const navigationResult = navResult.result;

  try {
    throwIfInstagramProfileAborted(signal);
    await waitForInstagramProfile(1500, signal, wait);

    const finalUrl = await cdp.evaluate('location.href', { signal });
    throwIfInstagramProfileAborted(signal);
    const navigation = validateInstagramNavigation({
      navigationResult,
      finalUrl,
      expectedHandle: handle,
    });
    if (!navigation.ok) {
      return { handle, posts: [], newPosts: 0, skippedPosts: 0, error: navigation.reason };
    }

    const pageState = await cdp.evaluate(`
      (() => {
        const text = (document.body && document.body.innerText) || '';
        const title = document.title || '';
        const unavailable = /Sorry, this page isn't available|Esta p[áa]gina n[ãa]o est[áa] dispon[ií]vel|P[áa]gina n[ãa]o encontrada/i.test(text + ' ' + title);
        return { unavailable, title, path: location.pathname };
      })()
    `, { signal });
    throwIfInstagramProfileAborted(signal);
    if (pageState && pageState.unavailable) {
      return { handle, posts: [], newPosts: 0, skippedPosts: 0, error: 'profile_unavailable' };
    }

    // A grade carrega sob demanda. Leia paginas incrementais com limites
    // estritos e pare quando a fronteira ja vista/antiga se repetir.
    const result = await collectInstagramGridPosts(cdp, seenPosts, { signal, wait });
    
    if (!result || !result.posts) {
      return { handle, posts: [], newPosts: 0, skippedPosts: 0, error: 'no_data' };
    }
    
    let skippedPosts = 0;
    
    const candidates = result.posts
      .map(p => {
        const date = instagramGridPostDate(p);
        if (!shouldKeepInstagramGridPost({ date, isPinned: p.isPinned })) return null;
        
        // v4.4: Skip posts already seen in previous scans
        if (!isNewPost(p.url, seenPosts)) {
          skippedPosts++;
          return null;
        }

        const caption = (p.caption || '');
        // Alt text da grade nunca e fonte final: ate uma legenda longa e
        // datada pode estar truncada ou descrever a imagem, nao o post.
        const needsDetail = requiresInstagramGridDetail(p);
        const classified = classifyInstagramPost({
          title: caption.slice(0, 120).replace(/\n/g, ' '),
          text: caption.slice(0, 800),
          link: p.url,
          image: p.imageUrl || '',
          date,
          source: `ig:@${handle}`,
          isReel: p.isReel,
          isPinned: p.isPinned,
          _needsDetail: needsDetail,
          _detailStatus: needsDetail ? 'deferred' : 'succeeded',
          _isNew: true,
        });
        const markSeen = (skipReason = '') => markPostSeen(p.url, handle, date, seenPosts, {
          relevanceVersion: RELEVANCE_VERSION,
          relevant: classified.relevant && !skipReason,
          matchedTerms: classified.matchedTerms,
          relevanceReason: classified.relevanceReason,
          strongOpportunityTerms: classified.strongOpportunityTerms,
          actionEventTerms: classified.actionEventTerms,
          excludedTerms: classified.excludedTerms,
          module: classified.module,
          category: classified.category,
          hasDeadline: classified.hasDeadline,
          futureDates: classified.futureDates,
          skipReason,
        });
        const preliminarySkipReason = classified.skipReason;

        // Profile-grid alt text is truncated. Wait for the detail page before
        // permanently discarding an incomplete post.
        if (shouldCheckpointInstagramPreliminarySkip({
          skipReason: preliminarySkipReason,
          _needsDetail: needsDetail,
        })) {
          markSeen(preliminarySkipReason);
          return null;
        }

        return classified;
      })
      .filter(Boolean);

    const profileLimit = limitInstagramProfilePosts(candidates);
    const posts = profileLimit.posts;

    // newPosts must describe retained live grid posts only. Counting before
    // preliminary skips / profile limits made newPosts > observedItems and
    // broke post-reinjection coverage validation (run bd4702d7).
    return {
      handle,
      posts,
      newPosts: posts.length,
      skippedPosts,
      gridScan: result.gridScan,
      profileLimit,
      error: null,
    };
  } catch (e) {
    return { handle, posts: [], newPosts: 0, skippedPosts: 0, error: e.message };
  }
}

// ============================================================
// POST DETAIL FETCH (v4.3 P2-5/6)
// ============================================================

// Navigate to individual post page to get: full caption + real date
// This fixes 2 issues:
//   P2-5: Truncated captions from alt-text (profile page only shows ~120 chars)
//   P2-6: Missing dates on reels (profile page doesn't expose reel dates)
function isValidIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseInstagramDetailDate({ timeDateTime = '', timeTitle = '' } = {}) {
  const rawDateTime = String(timeDateTime || '').trim();
  if (isValidIsoCalendarDate(rawDateTime)) return rawDateTime;
  if (rawDateTime) {
    const calendarPrefix = rawDateTime.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (!calendarPrefix || isValidIsoCalendarDate(calendarPrefix[1])) {
      const parsedDateTime = new Date(rawDateTime);
      if (!Number.isNaN(parsedDateTime.getTime())) {
        return isoDateInTimeZone(parsedDateTime, 'America/Sao_Paulo');
      }
    }
  }

  const months = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const titleMatch = String(timeTitle || '').match(/\b([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!titleMatch || !months[titleMatch[1]]) return '';
  const candidate = `${titleMatch[3]}-${months[titleMatch[1]]}-${String(parseInt(titleMatch[2], 10)).padStart(2, '0')}`;
  return isValidIsoCalendarDate(candidate) ? candidate : '';
}

function normalizeInstagramDetailText(value, maxLength = 4000) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isInstagramDetailUiText(value) {
  const text = normalizeInstagramDetailText(value);
  if (!text) return true;
  const normalized = normalizeText(text);
  return /^(?:view all|ver todos|verified|verificado|follow|following|seguir|seguindo|more|mais|see translation|ver traducao)$/.test(normalized)
    || /^(?:view all|ver todos)(?:\s+(?:os|the))?\s+\d[\d.,]*\s+(?:comments?|comentarios?)$/.test(normalized)
    || /^(?:liked by|curtido por)\s+[@a-z0-9_.]/.test(normalized)
    || /^(?:original audio|audio original)(?:\s*[-\u00b7]\s*[@a-z0-9_. ]+)?$/.test(normalized)
    || /^\d[\d.,]*\s+(?:likes?|comments?|curtidas?|comentarios?)\b/.test(normalized);
}

function extractInstagramCaptionFromOgDescription(value) {
  const text = normalizeInstagramDetailText(value);
  if (!text) return '';
  const quoted = text.match(/:\s*["“]([\s\S]+?)["”]\s*\.?\s*$/);
  const caption = normalizeInstagramDetailText(quoted?.[1] || '');
  return isInstagramDetailUiText(caption) ? '' : caption;
}

function parseInstagramOgDescriptionDate(value) {
  const text = normalizeInstagramDetailText(value);
  if (!text) return '';
  const match = text.match(
    /\bon\s+([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})\s*:\s*["“]/,
  );
  return match ? parseInstagramDetailDate({ timeTitle: match[1] }) : '';
}

function extractInstagramDetailSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const candidates = [];
  const addCandidate = (value, extractionSource, priority) => {
    const caption = normalizeInstagramDetailText(value);
    if (caption.length < 2 || isInstagramDetailUiText(caption)) return;
    const safeSource = /^[a-z0-9_]{1,40}$/.test(String(extractionSource || ''))
      ? String(extractionSource)
      : 'dom_candidate';
    candidates.push({
      caption,
      extractionSource: safeSource,
      priority: boundedInteger(priority, 0, 0, 500),
    });
  };

  addCandidate(source.h1Text, 'article_h1', 400);
  addCandidate(extractInstagramCaptionFromOgDescription(source.ogDescription), 'og_description', 400);
  for (const candidate of (Array.isArray(source.captionCandidates)
    ? source.captionCandidates.slice(0, 40)
    : [])) {
    if (candidate && typeof candidate === 'object') {
      addCandidate(candidate.text, candidate.source, candidate.priority);
    } else {
      addCandidate(candidate, 'dom_candidate', 100);
    }
  }
  candidates.sort((left, right) =>
    right.priority - left.priority
    || right.caption.length - left.caption.length
    || left.extractionSource.localeCompare(right.extractionSource)
  );

  const caption = candidates[0]?.caption || '';
  const date = parseInstagramDetailDate(source)
    || parseInstagramOgDescriptionDate(source.ogDescription);
  const failureReasons = [];
  if (source.rootState === 'missing') failureReasons.push('detail_root_missing');
  if (!caption) failureReasons.push('caption_missing');
  if (!date) failureReasons.push('date_missing');
  const detail = { caption, date };
  if (candidates[0]?.extractionSource) {
    detail.extractionSource = candidates[0].extractionSource;
  }
  if (failureReasons.length > 0) detail.failureReasons = failureReasons;
  return detail;
}

const INSTAGRAM_DETAIL_EXPRESSION = `
  (() => {
    /* __KINO_IG_DETAIL_V2__ */
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const root = article || main;
    const normalize = value => String(value || '')
      .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    const ogDescription = normalize(
      (document.querySelector('meta[property="og:description"]') || {}).content || ''
    );
    if (!root) {
      return {
        rootState: 'missing',
        h1Text: '',
        captionCandidates: [],
        ogDescription,
        timeTitle: '',
        timeDateTime: '',
      };
    }

    const timeEl = root.querySelector('time[datetime], time')
      || document.querySelector('article time[datetime], main time[datetime], time[datetime]');
    const captionCandidates = [];
    const seen = new Set();
    const add = (element, source, priority) => {
      if (!element || captionCandidates.length >= 40) return;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return;
      const text = normalize(element.textContent);
      if (!text || seen.has(text)) return;
      seen.add(text);
      captionCandidates.push({ text, source, priority });
    };
    const selectorGroups = [
      ['article h1', 'article_h1', 400],
      ['main h1', 'main_h1', 380],
      ['article [role="button"] span', 'article_button_span', 320],
      ['article span[dir="auto"]', 'article_dir_span', 300],
      ['article div[dir="auto"]', 'article_dir_div', 280],
      ['main span[dir="auto"]', 'main_dir_span', 220],
      ['article span', 'article_span', 100],
    ];
    for (const [selector, source, priority] of selectorGroups) {
      for (const element of document.querySelectorAll(selector)) {
        add(element, source, priority);
        if (captionCandidates.length >= 40) break;
      }
      if (captionCandidates.length >= 40) break;
    }
    return {
      rootState: article ? 'article' : 'main',
      h1Text: normalize((article || main).querySelector('h1')?.textContent || ''),
      captionCandidates,
      ogDescription,
      timeTitle: timeEl ? normalize(timeEl.getAttribute('title')) : '',
      timeDateTime: timeEl ? normalize(timeEl.getAttribute('datetime')) : '',
    };
  })()
`;

async function fetchPostDetail(cdp, postUrl, {
  deadlineMs = Number.POSITIVE_INFINITY,
  now = Date.now,
  wait = sleep,
  pollTimeoutMs = INSTAGRAM_DETAIL_POLL_TIMEOUT_MS,
  pollIntervalMs = INSTAGRAM_DETAIL_POLL_INTERVAL_MS,
  requirements = null,
} = {}) {
  const nowFn = typeof now === 'function' ? now : Date.now;
  const waitFn = typeof wait === 'function' ? wait : sleep;
  const pollTimeout = boundedInteger(
    pollTimeoutMs,
    INSTAGRAM_DETAIL_POLL_TIMEOUT_MS,
    100,
    15000,
  );
  const pollInterval = boundedInteger(
    pollIntervalMs,
    INSTAGRAM_DETAIL_POLL_INTERVAL_MS,
    10,
    2000,
  );
  const hasBudget = () => nowFn() < deadlineMs;
  const failure = reason => ({
    caption: '',
    date: '',
    failureReasons: [sanitizeInstagramDetailFailureReason(reason)],
  });

  if (!hasBudget()) return failure('budget_exhausted');
  const expectedShortcode = instagramShortcode({ link: postUrl });
  if (!expectedShortcode) return failure('requested_shortcode_invalid');
  const expectedPostHandle = canonicalInstagramHandle(parseInstagramPostUrl(postUrl)?.handle);

  let navigationResult = null;
  const navigationCandidates = [];
  const primaryUrl = String(postUrl || '').trim();
  if (primaryUrl) navigationCandidates.push(primaryUrl);
  // Instagram SPA sometimes no-ops deep links as /reel/ while /p/ still opens.
  if (expectedShortcode) {
    const asPost = `https://www.instagram.com/p/${expectedShortcode}/`;
    const asReel = `https://www.instagram.com/reel/${expectedShortcode}/`;
    for (const candidate of [asPost, asReel]) {
      if (!navigationCandidates.includes(candidate)) navigationCandidates.push(candidate);
    }
  }

  // Instagram often lands on an intermediate or unrelated profile URL before
  // client routing settles (production: 72/72 final_url_not_post in bd4702d7).
  // Poll longer, force location.assign once, and try /p vs /reel alternates.
  let navigation = { ok: false, reason: 'final_url_not_post' };
  let finalUrl = '';
  const settleBudgetMs = Math.min(8_000, Math.max(pollTimeout, 4_000));
  const settleDeadlineMs = Math.min(deadlineMs, nowFn() + settleBudgetMs);
  let forcedAssign = false;
  let candidateIndex = 0;

  while (nowFn() < settleDeadlineMs && candidateIndex < navigationCandidates.length) {
    if (!hasBudget()) return failure('budget_exhausted');
    const candidateUrl = navigationCandidates[candidateIndex];
    try {
      if (candidateIndex === 0 && !forcedAssign) {
        navigationResult = await cdp.navigate(candidateUrl);
      } else {
        await cdp.evaluate(`window.location.assign(${JSON.stringify(candidateUrl)})`);
        navigationResult = navigationResult || { forcedAssign: true };
      }
    } catch (_) {
      if (candidateIndex === 0 && !forcedAssign) return failure('navigation_error');
    }

    const hopDeadlineMs = Math.min(settleDeadlineMs, nowFn() + 2_500);
    while (nowFn() < hopDeadlineMs) {
      try {
        finalUrl = await cdp.evaluate('location.href');
      } catch (_) {
        return failure('detail_evaluate_error');
      }
      navigation = validateInstagramNavigation({
        navigationResult,
        finalUrl,
        expectedShortcode,
        expectedPostHandle,
      });
      if (navigation.ok) break;
      if (navigation.reason === 'final_url_login_required'
          || navigation.reason === 'final_url_auth_challenge'
          || navigation.reason === 'final_url_not_instagram'
          || String(navigation.reason || '').startsWith('page_navigate_error')) {
        break;
      }
      if (!forcedAssign && navigation.reason === 'final_url_not_post') {
        forcedAssign = true;
        try {
          await cdp.evaluate(`window.location.assign(${JSON.stringify(candidateUrl)})`);
        } catch (_) {
          // keep polling the original navigation result
        }
      }
      const remainingMs = hopDeadlineMs - nowFn();
      if (remainingMs <= 0) break;
      await waitFn(Math.min(250, remainingMs));
    }
    if (navigation.ok
        || navigation.reason === 'final_url_login_required'
        || navigation.reason === 'final_url_auth_challenge'
        || navigation.reason === 'final_url_not_instagram'
        || String(navigation.reason || '').startsWith('page_navigate_error')) {
      break;
    }
    candidateIndex += 1;
    forcedAssign = false;
  }
  if (!navigation.ok) return failure(navigation.reason);

  const pollDeadlineMs = Math.min(deadlineMs, nowFn() + pollTimeout);
  let detail = { caption: '', date: '' };
  while (nowFn() < pollDeadlineMs) {
    try {
      const snapshot = await cdp.evaluate(INSTAGRAM_DETAIL_EXPRESSION);
      detail = mergeInstagramDetails(detail, extractInstagramDetailSnapshot(snapshot));
      const complete = requirements
        ? instagramDetailIsComplete(requirements, detail)
        : Boolean(detail.caption && detail.date);
      if (complete) return detail;
    } catch (_) {
      detail = mergeInstagramDetails(detail, {
        caption: '',
        date: '',
        failureReasons: ['detail_evaluate_error'],
      });
    }

    const remainingMs = pollDeadlineMs - nowFn();
    if (remainingMs <= 0) break;
    await waitFn(Math.min(pollInterval, remainingMs));
  }

  const failureReasons = instagramDetailFailureReasons(detail);
  if (!detail.caption) failureReasons.push('caption_missing');
  if (requirements?.caption && detail.caption
      && !instagramDetailCaptionIsComplete(requirements, detail)) {
    failureReasons.push('caption_not_expanded');
  }
  if (!detail.date) failureReasons.push('date_missing');
  if (!hasBudget()) failureReasons.push('budget_exhausted');
  return {
    ...detail,
    failureReasons: [...new Set(failureReasons)].slice(0, 8),
  };
}

// ============================================================
// REPOST DISCOVERY (v4.3 P1-4)
// ============================================================

function selectDiscoveredInstagramHandles(values, {
  activeHandles = ACTIVE_HANDLES,
  previouslyDiscovered = DISCOVERED_HANDLES,
  maxProfiles = INSTAGRAM_DISCOVERY_LIMITS.maxProfiles,
} = {}) {
  const cap = boundedInteger(maxProfiles, INSTAGRAM_DISCOVERY_LIMITS.maxProfiles, 0, 10);
  const active = new Set(buildHandleList(activeHandles).handles);
  const previous = new Set(buildHandleList(previouslyDiscovered).handles);
  const candidates = buildHandleList(Array.isArray(values) ? values : []).handles
    .filter(handle => !active.has(handle) && !previous.has(handle))
    .filter(handle => /^[a-z0-9._]+$/.test(handle))
    .filter(handle => handle.length > 3)
    .filter(handle => (
      handle.includes('ufg')
      || handle.includes('tv')
      || handle.includes('fapeg')
      || handle.includes('ifg')
      || handle.includes('radio')
    ))
    .sort();
  return candidates.slice(0, cap);
}

async function discoverHandlesFromReposts(cdp) {
  try {
    const navigationResult = await cdp.navigate('https://www.instagram.com/ufg_oficial/reposts/');
    await sleep(3000);
    const finalUrl = await cdp.evaluate('location.href');
    const navigation = validateInstagramNavigation({
      navigationResult,
      finalUrl,
      expectedHandle: 'ufg_oficial',
      expectedProfileSuffix: 'reposts',
    });
    if (!navigation.ok) return [];
    const result = await cdp.evaluate('(() => { const handles = new Set(); const links = document.querySelectorAll("main a[href*=\"/\"]"); links.forEach(a => { const href = a.getAttribute("href") || ""; const m = href.match(/^\\/([a-zA-Z0-9_.]+)\\/(p|reel)\\//); if (m && m[1] !== "ufg_oficial") handles.add(m[1]); const alt = (a.querySelector("img") || {}).getAttribute("alt") || ""; const tags = alt.match(/@([a-zA-Z0-9_.]+)/g) || []; tags.forEach(t => handles.add(t.slice(1))); }); return [...handles]; })()');
    if (Array.isArray(result)) return selectDiscoveredInstagramHandles(result);
    return [];
  } catch (e) {
    return [];
  }
}

// ============================================================
// POST TRACKING (v4.4 — evita retrabalho)
// ============================================================

const STATE_FILE = path.join(OUTPUT_DIR, 'seen-posts.json');
const DETAIL_PROGRESS_FILE = path.join(OUTPUT_DIR, 'detail-progress.json');
const INSTAGRAM_DETAIL_PROGRESS_SCHEMA_VERSION = 1;
const INSTAGRAM_DETAIL_PROGRESS_MAX_BYTES = 16 * 1024 * 1024;
const INSTAGRAM_DETAIL_PROGRESS_WRITE_BUDGET_BYTES = 15 * 1024 * 1024;
const INSTAGRAM_DETAIL_PROGRESS_MAX_ENTRIES = 5000;
const INSTAGRAM_DETAIL_PROGRESS_MAX_ATTEMPTS = 31;
const INSTAGRAM_DETAIL_PROGRESS_COMPLETE_REVALIDATE_MS = 24 * 60 * 60 * 1000;
const INSTAGRAM_DETAIL_PROGRESS_BACKOFF_WITH_EVIDENCE_MS = [
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
const INSTAGRAM_DETAIL_PROGRESS_BACKOFF_WITHOUT_EVIDENCE_MS = [
  10 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, filePath);
    // Persistência do rename no diretório é best-effort: funciona em Linux;
    // alguns hosts Windows não permitem abrir diretórios como descritores.
    try {
      const directoryFd = fs.openSync(directory, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    } catch (_) {}
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_) {}
    }
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
}

function createInstagramDetailProgress() {
  return {
    schemaVersion: INSTAGRAM_DETAIL_PROGRESS_SCHEMA_VERSION,
    relevanceVersion: RELEVANCE_VERSION,
    updatedAt: null,
    lanes: normalizeInstagramDetailLanes(),
    entries: {},
  };
}

function instagramDetailProgressKey(post) {
  const handle = canonicalInstagramHandle(
    String(post?.source || post?.handle || '').replace(/^ig:@/, ''),
  );
  const shortcode = instagramShortcode(post);
  if (!/^[a-z0-9._]{1,30}$/.test(handle)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(shortcode)) return '';
  return `${handle}|${shortcode}`;
}

function instagramDetailGridFingerprint(post) {
  const key = instagramDetailProgressKey(post);
  if (!key) return '';
  const shortcode = instagramShortcode(post);
  const identity = {
    shortcode,
    caption: normalizeInstagramDetailText(post?.text, 4000),
    date: isValidIsoCalendarDate(String(post?.date || '').trim())
      ? String(post.date).trim()
      : '',
  };
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function normalizeInstagramDetailPostUrl(value, shortcode = '') {
  const expectedShortcode = String(shortcode || '').trim();
  const parsed = parseInstagramPostUrl(value);
  if (!parsed || (expectedShortcode && parsed.shortcode !== expectedShortcode)) return '';
  return canonicalInstagramPostUrl(value);
}

function normalizeInstagramDetailImageUrl(value) {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function instagramDetailProgressPostSnapshot(post) {
  const shortcode = instagramShortcode(post);
  const postUrl = normalizeInstagramDetailPostUrl(post?.link || post?.url, shortcode);
  if (!shortcode || !postUrl) return null;
  return {
    postUrl,
    gridCaption: normalizeInstagramDetailText(post?.text, 800),
    gridDate: isValidIsoCalendarDate(String(post?.date || '').trim())
      ? String(post.date).trim()
      : '',
    imageUrl: normalizeInstagramDetailImageUrl(post?.image),
    isReel: post?.isReel === true || /\/reel\//i.test(postUrl),
  };
}

function normalizeInstagramDetailProgressTimestamp(value, {
  nowMs = Date.now(),
  maxFutureMs = 7 * 86400000,
} = {}) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > nowMs + maxFutureMs) return '';
  return new Date(parsed).toISOString();
}

function seenContainsCurrentInstagramDetail(seenPosts, shortcode) {
  const entry = seenPosts && typeof seenPosts === 'object' ? seenPosts[shortcode] : null;
  return Boolean(entry && typeof entry === 'object'
    && entry.relevanceVersion === RELEVANCE_VERSION);
}

function normalizeInstagramDetailProgressEntry(key, value, {
  nowMs = Date.now(),
  seenPosts = {},
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const [keyHandle, keyShortcode, ...extra] = String(key || '').split('|');
  const handle = canonicalInstagramHandle(value.handle);
  const shortcode = String(value.shortcode || '').trim();
  if (extra.length > 0
      || handle !== keyHandle
      || shortcode !== keyShortcode
      || !/^[a-z0-9._]{1,30}$/.test(handle)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(shortcode)
      || seenContainsCurrentInstagramDetail(seenPosts, shortcode)) return null;

  const gridFingerprint = String(value.gridFingerprint || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(gridFingerprint)) return null;
  const postUrl = normalizeInstagramDetailPostUrl(value.postUrl, shortcode);
  if (!postUrl) return null;
  const gridCaption = normalizeInstagramDetailText(value.gridCaption, 800);
  const gridDate = isValidIsoCalendarDate(String(value.gridDate || '').trim())
    ? String(value.gridDate).trim()
    : '';
  const imageUrl = normalizeInstagramDetailImageUrl(value.imageUrl);
  if (instagramDetailGridFingerprint({
    source: `ig:@${handle}`,
    link: postUrl,
    text: gridCaption,
    date: gridDate,
  }) !== gridFingerprint) return null;
  const caption = normalizeInstagramDetailText(value.caption, 4000);
  const date = isValidIsoCalendarDate(String(value.date || '').trim())
    ? String(value.date).trim()
    : '';
  const extractionSource = /^[a-z0-9_]{1,40}$/.test(String(value.extractionSource || ''))
    ? String(value.extractionSource)
    : '';
  const attempts = boundedInteger(
    value.attempts,
    0,
    0,
    INSTAGRAM_DETAIL_PROGRESS_MAX_ATTEMPTS,
  );
  const firstAttemptAt = normalizeInstagramDetailProgressTimestamp(value.firstAttemptAt, { nowMs });
  const updatedAt = normalizeInstagramDetailProgressTimestamp(value.updatedAt, { nowMs });
  if (!firstAttemptAt || !updatedAt) return null;
  const retentionCutoff = nowMs - resolveInstagramSeenRetentionDays() * 86400000;
  if (Date.parse(updatedAt) < retentionCutoff) return null;

  if (!['partial', 'complete'].includes(value.status)) return null;
  const requestedStatus = value.status;
  const completeEvidence = instagramDetailIsComplete(
    instagramDetailRequirements({
      text: gridCaption,
      date: gridDate,
      _needsDetail: true,
    }),
    { caption, date, extractionSource },
  );
  const status = requestedStatus === 'complete' && completeEvidence
    ? 'complete'
    : 'partial';
  let nextAttemptAt = status === 'partial'
    ? normalizeInstagramDetailProgressTimestamp(value.nextAttemptAt, { nowMs })
    : '';
  if (status === 'partial' && !nextAttemptAt) {
    if (requestedStatus !== 'complete') return null;
    nextAttemptAt = updatedAt;
  }
  const failureReasons = [...new Set(
    (Array.isArray(value.failureReasons) ? value.failureReasons : [])
      .map(sanitizeInstagramDetailFailureReason)
      .filter(Boolean),
  )].slice(0, 8);
  return {
    handle,
    shortcode,
    gridFingerprint,
    postUrl,
    gridCaption,
    gridDate,
    imageUrl,
    isReel: value.isReel === true || /\/reel\//i.test(postUrl),
    caption,
    date,
    extractionSource,
    failureReasons: status === 'complete' ? [] : failureReasons,
    attempts,
    firstAttemptAt,
    updatedAt,
    nextAttemptAt: status === 'complete' ? null : nextAttemptAt,
    status,
  };
}

function normalizeInstagramDetailProgress(value, {
  nowMs = Date.now(),
  seenPosts = {},
  maxEntries = INSTAGRAM_DETAIL_PROGRESS_MAX_ENTRIES,
} = {}) {
  const empty = createInstagramDetailProgress();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  if (value.schemaVersion !== INSTAGRAM_DETAIL_PROGRESS_SCHEMA_VERSION
      || value.relevanceVersion !== RELEVANCE_VERSION) return empty;
  const normalizedEntries = Object.entries(
    value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)
      ? value.entries
      : {},
  )
    .map(([key, entry]) => [
      key,
      normalizeInstagramDetailProgressEntry(key, entry, { nowMs, seenPosts }),
    ])
    .filter(([, entry]) => Boolean(entry))
    .sort((left, right) => (
      Date.parse(right[1].updatedAt) - Date.parse(left[1].updatedAt)
      || left[0].localeCompare(right[0])
    ));
  const entryLimit = boundedInteger(
    maxEntries,
    INSTAGRAM_DETAIL_PROGRESS_MAX_ENTRIES,
    1,
    INSTAGRAM_DETAIL_PROGRESS_MAX_ENTRIES,
  );
  const entries = {};
  const retainedShortcodes = new Set();
  let estimatedBytes = 1024;
  for (const [key, entry] of normalizedEntries) {
    if (retainedShortcodes.size >= entryLimit) break;
    if (retainedShortcodes.has(entry.shortcode)) continue;
    const entryBytes = Buffer.byteLength(JSON.stringify({ [key]: entry }, null, 2), 'utf8') + 8;
    if (estimatedBytes + entryBytes > INSTAGRAM_DETAIL_PROGRESS_WRITE_BUDGET_BYTES) continue;
    entries[key] = entry;
    retainedShortcodes.add(entry.shortcode);
    estimatedBytes += entryBytes;
  }
  return {
    ...empty,
    updatedAt: normalizeInstagramDetailProgressTimestamp(value.updatedAt, { nowMs }) || null,
    lanes: normalizeInstagramDetailLanes(value.lanes),
    entries,
  };
}

function loadInstagramDetailProgress({
  filePath = DETAIL_PROGRESS_FILE,
  nowMs = Date.now(),
  seenPosts = {},
} = {}) {
  try {
    const metadata = fs.lstatSync(filePath);
    if (!metadata.isFile() || metadata.size > INSTAGRAM_DETAIL_PROGRESS_MAX_BYTES) {
      return createInstagramDetailProgress();
    }
    return normalizeInstagramDetailProgress(
      JSON.parse(fs.readFileSync(filePath, 'utf8')),
      { nowMs, seenPosts },
    );
  } catch (_) {
    return createInstagramDetailProgress();
  }
}

function saveInstagramDetailProgress(progress, {
  filePath = DETAIL_PROGRESS_FILE,
  dryRun = false,
  nowMs = Date.now(),
  seenPosts = {},
} = {}) {
  if (dryRun) return false;
  const normalized = normalizeInstagramDetailProgress(progress, { nowMs, seenPosts });
  normalized.updatedAt = new Date(nowMs).toISOString();
  writeJsonAtomic(filePath, normalized);
  Object.assign(progress, normalized);
  return true;
}

function checkpointInstagramDetailProgressAttempt(progress, {
  filePath = DETAIL_PROGRESS_FILE,
  dryRun = false,
  nowMs = Date.now(),
  baselineSeenPosts = {},
} = {}) {
  return saveInstagramDetailProgress(progress, {
    filePath,
    dryRun,
    nowMs,
    // Do not use the mutable in-run state: relevant entries are staged until
    // the downstream acknowledgement and must remain replayable after a kill.
    seenPosts: baselineSeenPosts,
  });
}

function instagramDetailProgressEvidence(progress, post, {
  nowMs = Date.now(),
  gridFingerprint = instagramDetailGridFingerprint(post),
} = {}) {
  const requestedKey = instagramDetailProgressKey(post);
  const entries = progress?.entries && typeof progress.entries === 'object'
    ? progress.entries
    : {};
  let key = requestedKey;
  let entry = requestedKey ? entries[requestedKey] : null;
  if (!entry && requestedKey) {
    const shortcode = instagramShortcode(post);
    const fallback = Object.entries(entries)
      .filter(([, candidate]) => candidate?.shortcode === shortcode)
      .sort((left, right) => (
        Date.parse(right[1]?.updatedAt || '') - Date.parse(left[1]?.updatedAt || '')
        || left[0].localeCompare(right[0])
      ))[0];
    if (fallback) [key, entry] = fallback;
  }
  if (!key || !entry) {
    return {
      key,
      entry: null,
      detail: {},
      due: true,
      evidenceStale: false,
      fingerprintMismatch: false,
    };
  }
  if (!gridFingerprint || entry.gridFingerprint !== gridFingerprint) {
    return {
      key,
      entry: null,
      detail: {},
      due: true,
      evidenceStale: false,
      fingerprintMismatch: true,
    };
  }
  if (requestedKey && key !== requestedKey) {
    const requestedHandle = requestedKey.split('|')[0];
    const migrated = { ...entry, handle: requestedHandle };
    delete entries[key];
    entries[requestedKey] = migrated;
    key = requestedKey;
    entry = migrated;
  }
  const detail = {
    caption: entry.caption,
    date: entry.date,
    extractionSource: entry.extractionSource,
    failureReasons: entry.failureReasons,
  };
  const nextAttemptMs = Date.parse(String(entry.nextAttemptAt || ''));
  const updatedAtMs = Date.parse(String(entry.updatedAt || ''));
  const firstAttemptMs = Date.parse(String(entry.firstAttemptAt || ''));
  const evidenceStale = entry.status === 'partial'
    && Boolean(entry.caption || entry.date)
    && (!Number.isFinite(firstAttemptMs)
      || firstAttemptMs + INSTAGRAM_DETAIL_PROGRESS_COMPLETE_REVALIDATE_MS <= nowMs);
  const due = entry.status === 'complete'
    ? (!Number.isFinite(updatedAtMs)
      || updatedAtMs + INSTAGRAM_DETAIL_PROGRESS_COMPLETE_REVALIDATE_MS <= nowMs)
    : (evidenceStale || !Number.isFinite(nextAttemptMs) || nextAttemptMs <= nowMs);
  return { key, entry, detail, due, evidenceStale, fingerprintMismatch: false };
}

function instagramPostFromDetailProgressEntry(entry, referenceDate = new Date()) {
  if (!entry || typeof entry !== 'object') return null;
  const postUrl = normalizeInstagramDetailPostUrl(entry.postUrl, entry.shortcode);
  if (!postUrl || !/^[a-z0-9._]{1,30}$/.test(String(entry.handle || ''))) return null;
  const gridCaption = normalizeInstagramDetailText(entry.gridCaption, 800);
  return classifyInstagramPost({
    title: gridCaption.slice(0, 120).replace(/\n/g, ' '),
    text: gridCaption,
    link: postUrl,
    image: normalizeInstagramDetailImageUrl(entry.imageUrl),
    date: isValidIsoCalendarDate(String(entry.gridDate || '').trim())
      ? String(entry.gridDate).trim()
      : '',
    source: `ig:@${entry.handle}`,
    isReel: entry.isReel === true || /\/reel\//i.test(postUrl),
    isPinned: false,
    _needsDetail: true,
    _detailStatus: 'deferred',
    _isNew: true,
    _fromDetailProgress: true,
  }, referenceDate);
}

function selectInstagramDetailProgressRetryPosts(progress, {
  currentPosts = [],
  seenPosts = {},
  allowedHandles = ACTIVE_HANDLES,
  nowMs = Date.now(),
  dateBrt = TIMESTAMP,
} = {}) {
  const allowed = new Set(buildHandleList(
    Array.isArray(allowedHandles) ? allowedHandles : [],
  ).handles);
  const currentShortcodes = new Set(
    (Array.isArray(currentPosts) ? currentPosts : [])
      .map(instagramShortcode)
      .filter(Boolean),
  );
  const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateBrt || ''))
    ? new Date(`${dateBrt}T12:00:00-03:00`)
    : new Date(nowMs);
  const candidates = [];
  for (const entry of Object.values(
    progress?.entries && typeof progress.entries === 'object' ? progress.entries : {},
  )) {
    if (!entry || !allowed.has(canonicalInstagramHandle(entry.handle))
        || currentShortcodes.has(entry.shortcode)
        || seenContainsCurrentInstagramDetail(seenPosts, entry.shortcode)) continue;
    const post = instagramPostFromDetailProgressEntry(entry, referenceDate);
    if (!post || !shouldKeepInstagramGridPost({ date: post.date, isPinned: false }, {
      dateBrt,
    })) continue;
    const cached = instagramDetailProgressEvidence(progress, post, { nowMs });
    if (!cached.entry) continue;
    if (entry.status !== 'complete' && !cached.due) continue;
    candidates.push({ post, updatedAt: Date.parse(entry.updatedAt) || 0 });
  }
  return candidates
    .sort((left, right) => left.updatedAt - right.updatedAt
      || left.post.link.localeCompare(right.post.link))
    .map(candidate => candidate.post);
}

function remainingInstagramDetailRequirements(requirements, cachedDetail) {
  const original = requirements || {};
  return {
    ...original,
    caption: Boolean(original.caption)
      && !instagramDetailCaptionIsComplete(original, cachedDetail),
    date: Boolean(original.date) && !String(cachedDetail?.date || '').trim(),
    evidence: Boolean(original.evidence)
      && !isAuthoritativeInstagramCaptionEntry(cachedDetail),
  };
}

function resolveInstagramDetailBackoffMs(attempts, { hasEvidence = false } = {}) {
  const schedule = hasEvidence
    ? INSTAGRAM_DETAIL_PROGRESS_BACKOFF_WITH_EVIDENCE_MS
    : INSTAGRAM_DETAIL_PROGRESS_BACKOFF_WITHOUT_EVIDENCE_MS;
  const normalizedAttempts = boundedInteger(
    attempts,
    1,
    1,
    INSTAGRAM_DETAIL_PROGRESS_MAX_ATTEMPTS,
  );
  return schedule[Math.min(normalizedAttempts - 1, schedule.length - 1)];
}

function upsertInstagramDetailProgress(progress, post, applied, {
  gridFingerprint = instagramDetailGridFingerprint(post),
  gridPostSnapshot = instagramDetailProgressPostSnapshot(post),
  nowMs = Date.now(),
  replaceEvidence = false,
  incrementAttempt = true,
} = {}) {
  const key = instagramDetailProgressKey(post);
  if (!key || !gridFingerprint || !progress || typeof progress !== 'object') return null;
  if (!progress.entries || typeof progress.entries !== 'object' || Array.isArray(progress.entries)) {
    progress.entries = {};
  }
  const [handle, shortcode] = key.split('|');
  const previous = progress.entries[key]?.gridFingerprint === gridFingerprint
    ? progress.entries[key]
    : null;
  const snapshot = gridPostSnapshot || (previous ? {
    postUrl: previous.postUrl,
    gridCaption: previous.gridCaption,
    gridDate: previous.gridDate,
    imageUrl: previous.imageUrl,
    isReel: previous.isReel,
  } : null);
  if (!snapshot || !normalizeInstagramDetailPostUrl(snapshot.postUrl, shortcode)) return null;
  const attempts = Math.min(
    INSTAGRAM_DETAIL_PROGRESS_MAX_ATTEMPTS,
    Math.max(0, Number(previous?.attempts) || 0)
      + (incrementAttempt || !previous ? 1 : 0),
  );
  const detail = mergeInstagramDetails(
    previous && !replaceEvidence ? {
      caption: previous.caption,
      date: previous.date,
      extractionSource: previous.extractionSource,
      failureReasons: previous.failureReasons,
    } : {},
    applied?.fetchedDetail || applied?.detail || {},
  );
  const complete = applied?.complete === true;
  const hasEvidence = Boolean(detail.caption || detail.date);
  const updatedAt = new Date(nowMs).toISOString();
  const entry = {
    handle,
    shortcode,
    gridFingerprint,
    postUrl: normalizeInstagramDetailPostUrl(snapshot.postUrl, shortcode),
    gridCaption: normalizeInstagramDetailText(snapshot.gridCaption, 800),
    gridDate: isValidIsoCalendarDate(String(snapshot.gridDate || '').trim())
      ? String(snapshot.gridDate).trim()
      : '',
    imageUrl: normalizeInstagramDetailImageUrl(snapshot.imageUrl),
    isReel: snapshot.isReel === true || /\/reel\//i.test(String(snapshot.postUrl || '')),
    caption: normalizeInstagramDetailText(detail.caption, 4000),
    date: isValidIsoCalendarDate(String(detail.date || '').trim())
      ? String(detail.date).trim()
      : '',
    extractionSource: /^[a-z0-9_]{1,40}$/.test(String(detail.extractionSource || ''))
      ? String(detail.extractionSource)
      : '',
    failureReasons: complete
      ? []
      : [...new Set(
        (Array.isArray(applied?.failureReasons) ? applied.failureReasons : [])
          .map(sanitizeInstagramDetailFailureReason)
          .filter(Boolean),
      )].slice(0, 8),
    attempts,
    firstAttemptAt: !replaceEvidence && previous?.firstAttemptAt
      ? previous.firstAttemptAt
      : updatedAt,
    updatedAt,
    nextAttemptAt: complete
      ? null
      : new Date(nowMs + resolveInstagramDetailBackoffMs(attempts, { hasEvidence })).toISOString(),
    status: complete ? 'complete' : 'partial',
  };
  progress.entries[key] = entry;
  return entry;
}

async function discoverHandlesWithinBudget(cdp, budgetMs = INSTAGRAM_SCAN_TIMING.discoveryBudgetMs) {
  let timer = null;
  try {
    return await Promise.race([
      discoverHandlesFromReposts(cdp).then(handles => ({ handles, timedOut: false })),
      new Promise(resolve => {
        timer = setTimeout(() => resolve({ handles: [], timedOut: true }), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function loadSeenPosts() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // v4.4.2: Filtrar entries inválidas (sem firstSeen ou firstSeen < 0)
      // Se é string antiga (legado), descartar — é órfão
      const cleaned = {};
      const now = Date.now();
      const cutoff = now - resolveInstagramSeenRetentionDays() * 86400000;
      for (const [k, v] of Object.entries(data)) {
        if (!v || typeof v !== 'object') continue; // legado string
        if (!v.firstSeen || v.firstSeen > now) continue; // sem timestamp ou futuro
        if (v.firstSeen < cutoff) continue; // expirado
        cleaned[k] = v;
      }
      if (Object.keys(cleaned).length !== Object.keys(data).length) {
        console.log(`   🧹 Limpeza: ${Object.keys(data).length - Object.keys(cleaned).length} posts expirados/órfãos removidos`);
      }
      return cleaned;
    }
  } catch (e) {}
  return {}; // { url_or_id: { handle, date, firstSeen } }
}

function saveSeenPosts(seen) {
  // A janela de deduplicacao nunca pode ser menor que a janela de coleta,
  // senao posts ainda elegiveis voltam a ser processados e publicados.
  const cutoff = Date.now() - resolveInstagramSeenRetentionDays() * 86400000;
  for (const [key, val] of Object.entries(seen)) {
    if (val.firstSeen && val.firstSeen < cutoff) delete seen[key];
  }
  writeJsonAtomic(STATE_FILE, seen);
}

function postKey(postUrl) {
  // Extract the shortcode from Instagram URL: /p/CODE or /reel/CODE
  return instagramPostShortcode(postUrl) || postUrl;
}

function isNewPost(postUrl, seen) {
  const entry = seen[postKey(postUrl)];
  return !entry || entry.relevanceVersion !== RELEVANCE_VERSION;
}

function markPostSeen(postUrl, handle, date, seen, meta = {}) {
  seen[postKey(postUrl)] = {
    handle,
    date: date || '',
    relevanceVersion: meta.relevanceVersion || RELEVANCE_VERSION,
    relevant: Boolean(meta.relevant),
    relevanceReason: meta.relevanceReason || '',
    matchedTerms: Array.isArray(meta.matchedTerms) ? meta.matchedTerms : [],
    strongOpportunityTerms: Array.isArray(meta.strongOpportunityTerms) ? meta.strongOpportunityTerms : [],
    actionEventTerms: Array.isArray(meta.actionEventTerms) ? meta.actionEventTerms : [],
    excludedTerms: Array.isArray(meta.excludedTerms) ? meta.excludedTerms : [],
    module: meta.module || null,
    category: meta.category || null,
    hasDeadline: Boolean(meta.hasDeadline),
    futureDates: Array.isArray(meta.futureDates) ? meta.futureDates : [],
    skipReason: meta.skipReason || '',
    firstSeen: Date.now(),
  };
}

function checkpointInstagramPost(post, seenPosts) {
  const handle = String(post?.source || '').replace(/^ig:@/, '');
  markPostSeen(post.link, handle, post.date, seenPosts, {
    relevanceVersion: RELEVANCE_VERSION,
    relevant: post.relevant,
    relevanceReason: post.relevanceReason,
    matchedTerms: post.matchedTerms,
    strongOpportunityTerms: post.strongOpportunityTerms,
    actionEventTerms: post.actionEventTerms,
    excludedTerms: post.excludedTerms,
    module: post.module,
    category: post.category,
    hasDeadline: post.hasDeadline,
    futureDates: post.futureDates,
    skipReason: post.skipReason,
  });
}

function validateInstagramNavigation({
  navigationResult = null,
  finalUrl = '',
  expectedHandle = '',
  expectedShortcode = '',
  expectedPostHandle = '',
  expectedProfileSuffix = '',
} = {}) {
  const errorText = String(navigationResult?.errorText || '').trim();
  if (errorText) {
    return { ok: false, reason: `page_navigate_error:${errorText.slice(0, 120)}` };
  }

  let parsed;
  try {
    parsed = new URL(String(finalUrl || ''));
  } catch (_) {
    return { ok: false, reason: 'final_url_invalid' };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (parsed.protocol !== 'https:' || hostname !== 'instagram.com') {
    return { ok: false, reason: 'final_url_not_instagram' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  // Auth/challenge walls are the most common production cause of detail
  // hydration collapse (72/72 final_url_not_post in run 68345df7). Classify
  // them explicitly so ops can re-auth CDP instead of chasing shortcode bugs.
  const firstSeg = String(segments[0] || '').toLowerCase();
  if (firstSeg === 'accounts' || firstSeg === 'challenge' || firstSeg === 'auth') {
    if (segments.some((part) => String(part).toLowerCase() === 'login')) {
      return { ok: false, reason: 'final_url_login_required' };
    }
    return { ok: false, reason: 'final_url_auth_challenge' };
  }
  if (expectedShortcode) {
    const postRoute = parseInstagramPostUrl(parsed.href);
    if (!postRoute) {
      return { ok: false, reason: 'final_url_not_post' };
    }
    if (postRoute.shortcode !== expectedShortcode) {
      return { ok: false, reason: 'final_shortcode_mismatch' };
    }
    const requestedHandle = canonicalInstagramHandle(expectedPostHandle);
    const finalPostHandle = canonicalInstagramHandle(postRoute.handle);
    if (requestedHandle && finalPostHandle && finalPostHandle !== requestedHandle) {
      return { ok: false, reason: 'final_post_handle_mismatch' };
    }
  }

  if (expectedHandle) {
    const finalHandle = canonicalInstagramHandle(segments[0]);
    if (!finalHandle || finalHandle !== canonicalInstagramHandle(expectedHandle)) {
      return { ok: false, reason: 'final_handle_mismatch' };
    }
    const expectedSuffix = String(expectedProfileSuffix || '').replace(/^\/+|\/+$/g, '');
    if (expectedSuffix) {
      if (segments.length !== 2 || segments[1].toLowerCase() !== expectedSuffix.toLowerCase()) {
        return { ok: false, reason: 'final_profile_path_mismatch' };
      }
    } else if (segments.length !== 1) {
      return { ok: false, reason: 'final_profile_path_mismatch' };
    }
  }

  return { ok: true, reason: '', finalUrl: parsed.href };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  WebSocket = require('ws');
  const seenPosts = loadSeenPosts();
  const detailProgress = loadInstagramDetailProgress({ seenPosts });
  // Relevant decisions form an outbox. Preserve the pre-run state so only
  // terminal non-relevant decisions advance immediately; opportunities stay
  // replayable until pipeline-kino proves publication or merge per identity.
  const baselineSeenPosts = JSON.parse(JSON.stringify(seenPosts));
  const requestedHandles = SINGLE_HANDLE ? [SINGLE_HANDLE] : [...ACTIVE_HANDLES];
  const scanHandleAudit = SINGLE_HANDLE ? buildHandleList(requestedHandles) : {
    handles: [...ACTIVE_HANDLES],
    aliasesResolved: [...HANDLE_SOURCE_AUDIT.aliasesResolved],
    duplicatesSkipped: [...HANDLE_SOURCE_AUDIT.duplicatesSkipped],
  };
  let handles = [...scanHandleAudit.handles];
  let discoveryTimedOut = false;

  // v4.3: Discover new profiles from @ufg_oficial reposts
  if (!SINGLE_HANDLE && !DRY_RUN) {
    const pages = await httpGetJson('/json');
    const pageList = Array.isArray(pages) ? pages.filter(t => t.type === 'page' && t.url && !t.url.startsWith('chrome://')) : [];
    if (pageList.length > 0) {
      const cdp2 = new CDPClient(pageList[0].webSocketDebuggerUrl);
      try {
        await cdp2.connect();
        process.stdout.write('\n🔍 Descobrindo novos perfis via reposts... ');
        const discovery = await discoverHandlesWithinBudget(cdp2);
        discoveryTimedOut = discovery.timedOut;
        const newHandles = discovery.handles;
        if (discoveryTimedOut) {
          console.log(`tempo esgotado (${INSTAGRAM_SCAN_TIMING.discoveryBudgetMs}ms); nenhum perfil dinâmico foi incluído`);
        }
        if (newHandles.length > 0) {
          console.log('\n   🆕 ' + newHandles.length + ' novos perfis: ' + newHandles.join(', '));
          const discoveredAudit = buildHandleList(newHandles);
          DISCOVERED_HANDLES.push(...discoveredAudit.handles);
          scanHandleAudit.aliasesResolved.push(...discoveredAudit.aliasesResolved);
          scanHandleAudit.duplicatesSkipped.push(...discoveredAudit.duplicatesSkipped);
          handles = buildHandleList(handles.concat(discoveredAudit.handles)).handles;
        } else {
          process.stdout.write('nenhum novo\n');
        }
      } finally {
        cdp2.close();
      }
    }
  }
  
  console.log(`\n📸 SCAN Instagram via CDP`);
  console.log(`${'='.repeat(55)}`);
  console.log(`  Perfis: ${handles.length}`);
  if (scanHandleAudit.aliasesResolved.length > 0) {
    console.log(`  Aliases resolvidos: ${scanHandleAudit.aliasesResolved.map(a => '@' + a.from + '->@' + a.to).join(', ')}`);
  }
  if (scanHandleAudit.duplicatesSkipped.length > 0) {
    console.log(`  Duplicatas de handle puladas: ${scanHandleAudit.duplicatesSkipped.length}`);
  }
  console.log(`  Sessão: @kinocampusbr\n`);
  
  // Get available tabs (any URL exceto chrome:// devtools/about:blank — Chrome 149 só tem chrome://newtab)
  const tabsList = await httpGetJson('/json');
  let pages = Array.isArray(tabsList)
    ? tabsList.filter(t => t.type === 'page' && t.url && !t.url.startsWith('chrome-devtools://'))
    : [];

  // Se não tem página "real", tenta criar uma tab nova via PUT /json/new (CDP HTTP API).
  // Chrome 149+ abre com apenas chrome://newtab/ — que serve pra navegação via CDP.
  // chrome://newtab é aceitável porque o scanner navega (Page.navigate) pra URL do perfil.
  if (!pages.length && Array.isArray(tabsList)) {
    const newTabCandidates = tabsList.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (newTabCandidates.length > 0) {
      // Aceita chrome://newtab/ como fallback (o scanner vai navegar pra URL real)
      pages = newTabCandidates;
      console.log('  ℹ️  Usando tab padrão do browser (será navegada)');
    }
  }

  if (!pages.length) {
    console.error('❌ Nenhuma página aberta no browser.');
    console.error('   Dica: docker exec openclaw-hahq-openclaw-1 openclaw browser start');
    process.exit(1);
  }
  
  // Use first available tab
  const targetTab = pages[0];
  console.log(`  Tab: ${targetTab.url.slice(0, 60)}\n`);
  
  // Connect CDP
  const cdp = new CDPClient(targetTab.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('  ✅ CDP conectado\n');
  
  const results = [];
  let totalPosts = 0, totalRelevant = 0, profilesOk = 0, profilesFail = 0;
  // Systemic DNS/network collapse (run bab056bf: 76× ERR_NAME_NOT_RESOLVED) must
  // fail fast with an actionable ops message instead of burning the full profile
  // budget after the first few identical resolution failures.
  const SYSTEMIC_NAV_ERROR_PREFIXES = Object.freeze([
    'page_navigate_error:net::ERR_NAME_NOT_RESOLVED',
    'page_navigate_error:net::ERR_INTERNET_DISCONNECTED',
    'page_navigate_error:net::ERR_NETWORK_CHANGED',
    'page_navigate_error:net::ERR_CONNECTION_REFUSED',
    'page_navigate_error:net::ERR_NAME_RESOLUTION_FAILED',
  ]);
  const systemicFailFastAfter = SINGLE_HANDLE
    ? 1
    : Math.min(5, Math.max(3, Math.ceil(handles.length * 0.05)));
  
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    const pct = Math.round(((i + 1) / handles.length) * 100);
    
    process.stdout.write(`  [${String(pct).padStart(3)}%] @${handle.padEnd(22)} `);
    
    const profileRun = await runInstagramProfileWithTimeout(
      signal => scrapeInstagramProfile(cdp, handle, seenPosts, { signal }),
      INSTAGRAM_SCAN_TIMING.profileTimeoutMs,
    ).catch(error => ({ timedOut: false, result: null, error: error.message || 'profile_error' }));
    const result = profileRun.timedOut || !profileRun.result
      ? { handle, posts: [], newPosts: 0, skippedPosts: 0, error: profileRun.error || 'profile_error' }
      : profileRun.result;
    results.push(result);
    
    if (result.error) {
      profilesFail++;
      process.stdout.write(`❌ ${result.error}\n`);
    } else {
      profilesOk++;
      totalPosts += result.posts.length;
      const rel = result.posts.filter(p => p.relevant).length;
      totalRelevant += rel;
      const skipped = result.skippedPosts || 0;
      process.stdout.write(`${result.posts.length} posts (${rel} relevant)${skipped > 0 ? ' [' + skipped + ' já vistos]' : ''}\n`);
    }

    if (results.length >= systemicFailFastAfter) {
      const recent = results.slice(0, systemicFailFastAfter);
      const systemic = recent.every(entry => {
        const err = String(entry?.error || '');
        return SYSTEMIC_NAV_ERROR_PREFIXES.some(prefix => err.startsWith(prefix));
      });
      if (systemic) {
        cdp.close();
        const sample = String(recent[0]?.error || 'network_error');
        throw new Error(
          `scan Instagram abortado por falha de rede sistêmica `
          + `(${recent.length}/${handles.length} primeiros perfis: ${sample}). `
          + 'Verifique DNS do host (systemd-resolved), conectividade do container '
          + 'e o browser CDP antes de reexecutar a Pipeline Completa.',
        );
      }
    }
    
    if (i < handles.length - 1) await sleep(INSTAGRAM_SCAN_TIMING.profilePauseMs);
  }

  let profileCoverage = summarizeInstagramProfileCoverage(handles, results, {
    scope: SINGLE_HANDLE ? 'single_handle' : 'all_active',
  });
  if (!profileCoverage.ok) {
    cdp.close();
    throw new Error(
      `scan Instagram invalido: cobertura ${profileCoverage.successfulCount}/`
      + `${profileCoverage.expectedCount}, minimo ${profileCoverage.minimumSuccessfulCount} `
      + `(${profileCoverage.issues.join(',')})`,
    );
  }
  profilesOk = profileCoverage.successfulCount;
  profilesFail = profileCoverage.failedCount;

  // A post pode sair da janela visível do perfil antes do próximo backoff.
  // Reinjete o snapshot mínimo persistido para que o trabalho parcial não se
  // torne um registro órfão que nunca mais alcança a fila de detalhes.
  const currentGridPosts = results.flatMap(result => (
    Array.isArray(result?.posts) ? result.posts : []
  ));
  const detailProgressRetryPosts = SKIP_ENRICH ? [] : selectInstagramDetailProgressRetryPosts(
    detailProgress,
    {
      currentPosts: currentGridPosts,
      seenPosts,
      allowedHandles: handles,
      nowMs: Date.now(),
      dateBrt: TIMESTAMP,
    },
  );
  for (const post of detailProgressRetryPosts) {
    const handle = canonicalInstagramHandle(String(post.source || '').replace(/^ig:@/, ''));
    let target = results.find(result => canonicalInstagramHandle(result?.handle) === handle);
    if (!target) {
      target = {
        handle,
        posts: [],
        newPosts: 0,
        skippedPosts: 0,
        error: null,
        detailProgressOnly: true,
        gridScan: null,
        profileLimit: { candidates: 0, retained: 0, truncated: 0 },
      };
      results.push(target);
    }
    target.posts.push(post);
  }
  for (const result of results) {
    reconcileInstagramProfileGridAfterReinjection(result);
  }
  totalPosts = results.reduce(
    (sum, result) => sum + (Array.isArray(result?.posts) ? result.posts.length : 0),
    0,
  );

  // Detail every new incomplete post before the final relevance decision. A
  // truncated profile-grid alt text is not enough to safely discard a post.
  const rawNeedingDetail = SKIP_ENRICH ? [] : results.flatMap(result =>
    (Array.isArray(result?.posts) ? result.posts : [])
      .filter(post => post?._isNew === true && post?._needsDetail === true)
  );
  const allNeedingDetail = selectInstagramDetailQueue(results, { skipEnrich: SKIP_ENRICH });
  const detailQueue = new Set(allNeedingDetail);
  const detailContexts = new WeakMap();
  const detailMetrics = {
    eligible: allNeedingDetail.length,
    eligibleBeforeShortcodeDedupe: rawNeedingDetail.length,
    duplicateShortcodesRemoved: Math.max(0, rawNeedingDetail.length - allNeedingDetail.length),
    restoredFromProgress: detailProgressRetryPosts.length,
    preHydrationRelevantEligible: allNeedingDetail.filter(post => post?.relevant === true).length,
    preliminaryRelevantEligible: 0,
    requested: 0,
    preliminaryRelevantRequested: 0,
    explorationRequested: 0,
    deferred: 0,
    deferredByBackoff: 0,
    cacheLoaded: 0,
    completedFromCache: 0,
    fingerprintInvalidated: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    retried: 0,
    failureReasons: {},
    progressEntriesBefore: Object.keys(detailProgress.entries).length,
    progressEntriesAfter: Object.keys(detailProgress.entries).length,
    progressEntriesNet: 0,
    schedulerCursorBefore: { ...detailProgress.lanes },
    schedulerCursorAfter: { ...detailProgress.lanes },
  };

  for (const result of results) {
    for (const post of result.posts) {
      if (!detailQueue.has(post) && shouldCheckpointInstagramPost(post, { skipEnrich: SKIP_ENRICH })) {
        checkpointInstagramPost(post, seenPosts);
      }
    }
  }
  const dueNeedingDetail = [];
  const progressNowMs = Date.now();
  for (const post of allNeedingDetail) {
    const requirements = instagramDetailRequirements(post);
    const gridFingerprint = instagramDetailGridFingerprint(post);
    const gridPostSnapshot = instagramDetailProgressPostSnapshot(post);
    const cached = instagramDetailProgressEvidence(detailProgress, post, {
      nowMs: progressNowMs,
      gridFingerprint,
    });
    if (cached.fingerprintMismatch && cached.key) {
      delete detailProgress.entries[cached.key];
      detailMetrics.fingerprintInvalidated += 1;
    }
    // Preserve evidence across runs, but do not let a transient reason from a
    // previous run force an unnecessary second retry in the current run.
    const cachedDetail = cached.entry ? mergeInstagramDetails({
      caption: cached.detail.caption,
      date: cached.detail.date,
      extractionSource: cached.detail.extractionSource,
    }) : {};
    const revalidateComplete = cached.entry?.status === 'complete' && cached.due;
    const revalidatePartial = cached.entry?.status === 'partial' && cached.evidenceStale;
    detailContexts.set(post, {
      requirements,
      gridFingerprint,
      gridPostSnapshot,
      cachedDetail,
      revalidateEvidence: revalidateComplete || revalidatePartial,
    });
    if (!cached.entry) {
      dueNeedingDetail.push(post);
      continue;
    }

    detailMetrics.cacheLoaded += 1;
    const cachedApplied = applyInstagramPostDetail(post, cached.detail, requirements);
    if (cachedApplied.complete && cached.entry.status === 'complete' && !cached.due) {
      cached.entry.status = 'complete';
      cached.entry.nextAttemptAt = null;
      cached.entry.failureReasons = [];
      detailMetrics.completedFromCache += 1;
      checkpointInstagramPost(post, seenPosts);
      continue;
    }
    if (!cached.due && cached.entry.status === 'partial') {
      detailMetrics.deferredByBackoff += 1;
      continue;
    }
    // A persisted entry marked complete that no longer satisfies the original
    // grid requirements is treated as due instead of being trusted blindly.
    dueNeedingDetail.push(post);
  }
  detailMetrics.deferred = dueNeedingDetail.length;
  detailMetrics.preliminaryRelevantEligible = dueNeedingDetail
    .filter(post => post?.relevant === true).length;

  if (dueNeedingDetail.length > 0) {
    // Preliminary relevance raises yield, while a 3:1 weighted exploration
    // lane still discovers opportunities hidden by truncated grid captions.
    // Each lane is round-robin by profile and rotated daily, so a large source
    // cannot monopolize the bounded detail budget.
    const prioritizedDetailQueue = prioritizeInstagramDetailQueue(
      dueNeedingDetail,
      {
        dateBrt: TIMESTAMP,
        windowSize: INSTAGRAM_DETAIL_LIMITS.maxPosts,
        laneCursors: detailProgress.lanes,
      },
    );
    const boundedDetailQueue = limitInstagramDetailQueue(
      prioritizedDetailQueue,
      INSTAGRAM_DETAIL_LIMITS.maxPosts,
    );
    const detailStartedAt = Date.now();
    const detailDeadlineMs = detailStartedAt + INSTAGRAM_DETAIL_LIMITS.budgetMs;

    console.log(
      `\n🔍 Enriquecendo até ${boundedDetailQueue.length}/${dueNeedingDetail.length} posts ` +
      `com detalhes (cap=${INSTAGRAM_DETAIL_LIMITS.maxPosts}, budget=${INSTAGRAM_DETAIL_LIMITS.budgetMs}ms)...`,
    );
    let completed = 0;
    for (const post of boundedDetailQueue) {
      if (!hasInstagramDetailBudget(
        detailStartedAt,
        INSTAGRAM_DETAIL_LIMITS.budgetMs,
      )) break;

      detailMetrics.requested += 1;
      if (post?.relevant === true) detailMetrics.preliminaryRelevantRequested += 1;
      else detailMetrics.explorationRequested += 1;
      detailMetrics.deferred -= 1;
      const context = detailContexts.get(post) || {
        requirements: instagramDetailRequirements(post),
        gridFingerprint: instagramDetailGridFingerprint(post),
        gridPostSnapshot: instagramDetailProgressPostSnapshot(post),
        cachedDetail: {},
        revalidateEvidence: false,
      };
      const requirements = context.requirements;
      const cachedEvidenceForAttempt = context.revalidateEvidence
        ? {}
        : context.cachedDetail;
      const fetchRequirements = context.revalidateEvidence
        ? remainingInstagramDetailRequirements(requirements, cachedEvidenceForAttempt)
        : remainingInstagramDetailRequirements(requirements, context.cachedDetail);
      let firstAttempt = {
        caption: '',
        date: '',
        failureReasons: ['detail_unexpected_error'],
      };
      try {
        firstAttempt = await fetchPostDetail(cdp, post.link, {
          deadlineMs: detailDeadlineMs,
          requirements: fetchRequirements,
        });
      } catch (_) {
        firstAttempt = {
          caption: '',
          date: '',
          failureReasons: ['detail_unexpected_error'],
        };
      }
      let detail = mergeInstagramDetails(cachedEvidenceForAttempt, firstAttempt);
      const persistAttempt = (appliedAttempt, { incrementAttempt = true } = {}) => {
        const entry = upsertInstagramDetailProgress(
          detailProgress,
          post,
          appliedAttempt,
          {
            gridFingerprint: context.gridFingerprint,
            gridPostSnapshot: context.gridPostSnapshot,
            nowMs: Date.now(),
            replaceEvidence: context.revalidateEvidence,
            incrementAttempt,
          },
        );
        if (entry && !DRY_RUN) {
          // Flush each browser attempt. The supervisor may terminate a long
          // retry before the final artifact; baseline seen state preserves
          // staged relevant outbox items for replay.
          checkpointInstagramDetailProgressAttempt(detailProgress, {
            baselineSeenPosts,
          });
        }
        return entry;
      };

      const retryDetail = !instagramDetailIsComplete(requirements, detail)
          && shouldRetryInstagramDetail(detail)
          && hasInstagramDetailBudget(detailStartedAt, INSTAGRAM_DETAIL_LIMITS.budgetMs);
      let attemptAlreadyCounted = false;
      if (retryDetail) {
        const firstApplied = applyInstagramPostDetail({ ...post }, detail, requirements);
        attemptAlreadyCounted = Boolean(persistAttempt(firstApplied));
        detailMetrics.retried += 1;
        await sleep(250);
        let secondAttempt = {
          caption: '',
          date: '',
          failureReasons: ['detail_unexpected_error'],
        };
        try {
          const retryRequirements = remainingInstagramDetailRequirements(requirements, detail);
          secondAttempt = await fetchPostDetail(cdp, post.link, {
            deadlineMs: detailDeadlineMs,
            requirements: retryRequirements,
          });
        } catch (_) {
          secondAttempt = {
            caption: '',
            date: '',
            failureReasons: ['detail_unexpected_error'],
          };
        }
        detail = mergeInstagramDetails(detail, secondAttempt);
      }

      const applied = applyInstagramPostDetail(post, detail, requirements);
      persistAttempt(applied, { incrementAttempt: !attemptAlreadyCounted });
      recordInstagramDetailOutcome(detailMetrics, applied);
      if (!applied.complete) {
        await sleep(1500);
        continue;
      }

      completed += 1;
      if (shouldCheckpointInstagramPost(post, { detailSucceeded: applied.complete })) {
        checkpointInstagramPost(post, seenPosts);
      }

      if (completed % 10 === 0) {
        process.stdout.write(`\n   [${completed}/${detailMetrics.requested}]`);
      }
      await sleep(1500);
    }
    detailProgress.lanes = advanceInstagramDetailLanesForScope(
      detailProgress.lanes,
      {
        priorityRequested: detailMetrics.preliminaryRelevantRequested,
        explorationRequested: detailMetrics.explorationRequested,
        totalRequested: detailMetrics.requested,
      },
      { scope: SINGLE_HANDLE ? 'single_handle' : 'all_active' },
    );
    detailMetrics.schedulerCursorAfter = { ...detailProgress.lanes };
    console.log(`\n   ✅ ${completed}/${detailMetrics.requested} posts completamente enriquecidos`);
  }

  const postMetrics = summarizeInstagramPostMetrics(results);
  totalPosts = postMetrics.totalPostOccurrences;
  totalRelevant = postMetrics.totalRelevantOccurrences;
  // Recompute after durable retry reinjection. The grid validator explicitly
  // separates live observations from restored work, so final counters and the
  // signed contract describe the exact payload that will be consumed.
  profileCoverage = summarizeInstagramProfileCoverage(handles, results, {
    scope: SINGLE_HANDLE ? 'single_handle' : 'all_active',
  });
  if (!profileCoverage.ok) {
    cdp.close();
    throw new Error(
      `scan Instagram invalido apos reconciliacao: cobertura ${profileCoverage.successfulCount}/`
      + `${profileCoverage.expectedCount} (${profileCoverage.issues.join(',')})`,
    );
  }
  profilesOk = profileCoverage.successfulCount;
  profilesFail = profileCoverage.failedCount;
  detailMetrics.progressEntriesAfter = Object.keys(detailProgress.entries).length;
  detailMetrics.progressEntriesNet = detailMetrics.progressEntriesAfter
    - detailMetrics.progressEntriesBefore;
  console.log(`  Detail metrics: eligible=${detailMetrics.eligible} requested=${detailMetrics.requested} ` +
    `shortcode-dedup=${detailMetrics.duplicateShortcodesRemoved} ` +
    `likely=${detailMetrics.preliminaryRelevantRequested}/${detailMetrics.preliminaryRelevantEligible} ` +
    `exploration=${detailMetrics.explorationRequested} ` +
    `deferred=${detailMetrics.deferred} backoff=${detailMetrics.deferredByBackoff} ` +
    `cache=${detailMetrics.cacheLoaded}/${detailMetrics.completedFromCache} ` +
    `succeeded=${detailMetrics.succeeded} ` +
    `partial=${detailMetrics.partial} failed=${detailMetrics.failed} retried=${detailMetrics.retried}`);
  const detailFailureSummary = Object.entries(detailMetrics.failureReasons)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `${reason}:${count}`)
    .join(',');
  console.log(`  Detail failures: ${detailFailureSummary || 'none'}`);

  cdp.close();
  
  // Summary
  const totalSkipped = results.reduce((sum, r) => sum + (r.skippedPosts || 0), 0);
  const profileTruncation = {
    profilesTruncated: results.filter(result => Number(result?.profileLimit?.truncated) > 0).length,
    postsTruncated: results.reduce(
      (sum, result) => sum + Math.max(0, Number(result?.profileLimit?.truncated) || 0),
      0,
    ),
    maxPostsPerProfile: INSTAGRAM_PROFILE_LIMITS.maxPosts,
  };
  console.log(`\n${'='.repeat(55)}`);
  console.log(`📊 RESUMO:`);
  console.log(`  ✅ ${profilesOk} perfis OK  |  ❌ ${profilesFail} falhas`);
  // Stable machine-parsed line consumed by cadu-api/pipeline.py.
  console.log(
    `  📝 ${postMetrics.gridPostOccurrences} novos posts 2026 `
    + `(${postMetrics.gridRelevantOccurrences} relevantes)`,
  );
  console.log(
    `  📝 ${postMetrics.uniquePosts} posts únicos `
    + `(${postMetrics.totalPostOccurrences} ocorrências; `
    + `${postMetrics.uniqueRelevant} relevantes únicos)`,
  );
  console.log(
    `  📐 Limite/perfil: ${profileTruncation.maxPostsPerProfile}; `
    + `${profileTruncation.postsTruncated} posts truncados em ${profileTruncation.profilesTruncated} perfis`,
  );
  if (totalSkipped > 0) console.log(`  ⏭️ ${totalSkipped} posts já analisados em scans anteriores\n`);
  else console.log('');
  
  for (const r of results) {
    const rel = r.posts.filter(p => p.relevant).length;
    const icon = r.error ? '❌' : (r.posts.length > 0 ? '✅' : '⚪');
    const skipped = r.skippedPosts || 0;
    const truncated = Math.max(0, Number(r?.profileLimit?.truncated) || 0);
    console.log(`  ${icon} @${r.handle.padEnd(25)} ${r.posts.length} posts (${rel} relevant)${skipped > 0 ? ' [' + skipped + ' já vistos]' : ''}${truncated > 0 ? ` [${truncated} truncados]` : ''}${r.error ? ' → ' + r.error : ''}`);
  }
  
  const allRelevant = results.flatMap(r => r.posts.filter(p => p.relevant));
  if (allRelevant.length > 0) {
    console.log(`\n🎯 RELEVANTES (${allRelevant.length}):`);
    for (const post of allRelevant.slice(0, 20)) {
      const newFlag = post._isNew ? ' 🆕' : '';
      console.log(`  [${post.date || 'sem data'}]${newFlag} ${post.title.slice(0, 80)}`);
      console.log(`    ${post.link}`);
    }
  }
  
  // Em dry-run, só é permitido escrever um artefato explicitamente confinado
  // ao workspace efêmero criado pelo pipeline. seen-posts nunca é persistido.
  if (!DRY_RUN || EXPLICIT_OUTPUT_FILE) {
    const outFile = EXPLICIT_OUTPUT_FILE || path.join(OUTPUT_DIR, `ig-browser-${TIMESTAMP}.json`);
    const seenPartition = partitionInstagramSeenState(baselineSeenPosts, seenPosts);
    const stateToPersist = PIPELINE_MANAGED ? seenPartition.immediateSeen : seenPosts;
    Object.assign(detailProgress, normalizeInstagramDetailProgress(detailProgress, {
      seenPosts: stateToPersist,
    }));
    detailMetrics.progressEntriesAfter = Object.keys(detailProgress.entries).length;
    detailMetrics.progressEntriesNet = detailMetrics.progressEntriesAfter
      - detailMetrics.progressEntriesBefore;
    const generatedAt = new Date().toISOString();
    const seenCheckpoint = buildInstagramSeenCheckpoint({
      runId: PIPELINE_RUN_ID,
      relevanceVersion: RELEVANCE_VERSION,
      entries: seenPartition.pendingRelevantEntries,
      generatedAt,
      requiresDownstreamAck: PIPELINE_MANAGED,
    });
    const seenCheckpointValidation = validateInstagramSeenCheckpoint(seenCheckpoint, {
      expectedRunId: PIPELINE_RUN_ID,
      expectedRelevanceVersion: RELEVANCE_VERSION,
      requireDownstreamAck: PIPELINE_MANAGED,
    });
    if (!seenCheckpointValidation.ok) {
      throw new Error(`checkpoint IG invalido: ${seenCheckpointValidation.issues.join(',')}`);
    }
    const output = {
      scanner: 'scan-ig-browser.js',
      version: '1.2.0',
      relevanceVersion: RELEVANCE_VERSION,
      timestamp: generatedAt,
      stats: {
        profilesScanned: handles.length,
        profilesOk,
        profilesFail,
        totalPosts,
        totalRelevant,
        totalSkipped,
        ...postMetrics,
        profileTruncation,
        detail: detailMetrics,
        profileCoverage,
      },
      sourceAudit: {
        expectedHandles: profileCoverage.expectedHandles,
        aliases: IG_HANDLE_ALIASES,
        aliasesResolved: scanHandleAudit.aliasesResolved,
        duplicatesSkipped: scanHandleAudit.duplicatesSkipped,
        discoveredHandles: DISCOVERED_HANDLES,
        discovery: {
          budgetMs: INSTAGRAM_SCAN_TIMING.discoveryBudgetMs,
          maxProfiles: INSTAGRAM_DISCOVERY_LIMITS.maxProfiles,
          timedOut: discoveryTimedOut,
        },
      },
      seenCheckpoint,
      results,
    };
    output.artifactContract = {
      schemaVersion: 1,
      kind: 'instagram-scan',
      version: output.version,
      runId: PIPELINE_RUN_ID,
      dateBrt: TIMESTAMP,
      generatedAt: output.timestamp,
      profileCoverage: {
        scope: profileCoverage.scope,
        expectedHandles: profileCoverage.expectedHandles,
        expectedCount: profileCoverage.expectedCount,
        minimumCoverageRatio: profileCoverage.minimumCoverageRatio,
        minimumSuccessfulCount: profileCoverage.minimumSuccessfulCount,
        successfulCount: profileCoverage.successfulCount,
        failedCount: profileCoverage.failedCount,
        actualCoverageRatio: profileCoverage.actualCoverageRatio,
        minimumGridEvidenceCount: profileCoverage.minimumGridEvidenceCount,
        gridEvidenceCount: profileCoverage.gridEvidenceCount,
        gridEvidenceRatio: profileCoverage.gridEvidenceRatio,
        missingGridEvidenceHandles: profileCoverage.missingGridEvidenceHandles,
      },
      contentSha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex'),
    };
    const outputValidation = validateInstagramArtifact(output, {
      expectedRunId: PIPELINE_RUN_ID,
      expectedDateBrt: TIMESTAMP,
      expectedStartedAt: process.env.CADU_PIPELINE_STARTED_AT,
      nowMs: Date.parse(output.timestamp),
      requireFullScope: !SINGLE_HANDLE,
      expectedScope: SINGLE_HANDLE ? 'single_handle' : 'all_active',
      requireDownstreamAck: PIPELINE_MANAGED,
    });
    if (!outputValidation.ok) {
      throw new Error(`artefato IG invalido antes da gravacao: ${outputValidation.issues.join(',')}`);
    }
    if (outputValidation.warnings?.length) {
      console.log(`  ⚠️ Saúde do detalhe: ${outputValidation.warnings.join(',')}`);
    }
    // O checkpoint seen-posts só pode avançar depois que o artefato do run
    // estiver duravelmente materializado. Assim, uma falha de disco não faz o
    // próximo scan pular posts que nunca chegaram ao pipeline.
    writeJsonAtomic(outFile, output);
    console.log(`\n📁 ${outFile}`);
    if (!DRY_RUN) {
      saveSeenPosts(stateToPersist);
      console.log(`📁 ${STATE_FILE} (${Object.keys(stateToPersist).length} posts confirmados)`);
      saveInstagramDetailProgress(detailProgress, { seenPosts: stateToPersist });
      console.log(
        `📁 ${DETAIL_PROGRESS_FILE} `
        + `(${Object.keys(detailProgress.entries).length} evidências/cursores persistidos)`,
      );
      if (PIPELINE_MANAGED && seenCheckpoint.entryCount > 0) {
        console.log(
          `  ⏳ ${seenCheckpoint.entryCount} oportunidade(s) aguardando `
          + 'confirmação individual de publicação/mesclagem',
        );
      }
    } else {
      console.log('  DRY-RUN: artefato efêmero salvo; seen-posts permaneceu inalterado');
    }
  }

  if (DRY_RUN && !EXPLICIT_OUTPUT_FILE) {
    console.log('  DRY-RUN: nenhum artefato ou seen-posts foi alterado');
  }
  
  return { results, stats: { totalPosts, totalRelevant, totalSkipped, detail: detailMetrics } };
}

if (require.main === module) main().then(() => {
  // v4.4: Garante saida limpa para liberar memoria do browser CDP
  process.exit(0);
}).catch(e => { console.error('\n💥', e.message); process.exit(1); });

module.exports = {
  CDPClient,
  RELEVANCE_VERSION,
  advanceInstagramDetailLanes,
  advanceInstagramDetailLanesForScope,
  applyInstagramPostDetail,
  advanceInstagramGridScan,
  buildHandleList,
  canonicalInstagramHandle,
  checkpointInstagramDetailProgressAttempt,
  checkpointInstagramPost,
  classifyInstagramPost,
  containsNormalizedTerm,
  createInstagramDetailProgress,
  createInstagramGridScanState,
  dedupeInstagramPostsByShortcode,
  extractInstagramCaptionFromOgDescription,
  extractInstagramDetailSnapshot,
  extractInstagramDatesFromCaption,
  extractFutureDatesFromCaption,
  fetchPostDetail,
  getActiveInstagramHandles,
  hasActivePreliminaryResultFollowup,
  hasInstagramDetailBudget,
  instagramDetailIsComplete,
  instagramDetailCaptionIsComplete,
  instagramDetailGridFingerprint,
  instagramDetailLaneQuotas,
  instagramDetailProgressEvidence,
  instagramDetailProgressKey,
  instagramDetailProgressPostSnapshot,
  instagramDetailComplete,
  instagramDetailFailureReasons,
  instagramDetailRequirements,
  instagramGridPostDate,
  inspectInstagramProfileGridEvidence,
  reconcileInstagramProfileGridAfterReinjection,
  instagramShortcode,
  ingestInstagramGridBatch,
  isoDateInTimeZone,
  isoDateFromParts,
  limitInstagramDetailQueue,
  limitInstagramProfilePosts,
  loadInstagramDetailProgress,
  mergeInstagramDetails,
  normalizeInstagramDetailProgress,
  parseInstagramDetailDate,
  parseInstagramOgDescriptionDate,
  parseInstagramHandle,
  parseScannerArgs,
  prioritizeInstagramDetailQueue,
  recordInstagramDetailOutcome,
  remainingInstagramDetailRequirements,
  resolveInstagramDetailBackoffMs,
  runInstagramProfileWithTimeout,
  resolveInstagramDetailLimits,
  resolveInstagramDiscoveryLimits,
  resolveInstagramGridLimits,
  resolveInstagramLookbackDays,
  resolveInstagramMinimumProfileCoverage,
  resolveInstagramProfileLimits,
  resolveInstagramRunDateBrt,
  resolveInstagramScanTiming,
  resolveInstagramSeenRetentionDays,
  resolveInstagramSupervisorTimeout,
  sanitizeInstagramDetailFailureReason,
  saveInstagramDetailProgress,
  selectDiscoveredInstagramHandles,
  selectInstagramDetailProgressRetryPosts,
  requiresInstagramGridDetail,
  rotateInstagramDetailQueue,
  rotateInstagramDetailQueueByCursor,
  roundRobinInstagramDetailQueue,
  mergeWeightedInstagramDetailQueues,
  selectInstagramDetailQueue,
  scoreInstagramPostEvidence,
  shouldCheckpointInstagramPreliminarySkip,
  shouldCheckpointInstagramPost,
  shouldKeepInstagramGridPost,
  shouldRetryInstagramDetail,
  summarizeInstagramProfileCoverage,
  summarizeInstagramPostMetrics,
  upsertInstagramDetailProgress,
  instagramLookbackCutoff,
  validateInstagramArtifact,
  validateInstagramDetailMetrics,
  validateInstagramNavigation,
  validateInstagramSeenCheckpoint,
  writeJsonAtomic,
};
