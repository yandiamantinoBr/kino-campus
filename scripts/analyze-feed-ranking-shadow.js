'use strict';

const fs = require('fs');
const path = require('path');

const Policy = require('../assets/js/shared/kc-feed-ranking-policy.shared.js');
const { analyzeTemporalRelevance } = require('../services/cadu-ufg-publisher/src/classifier.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PUBLIC_ENV_URL = 'https://www.kinocampus.com.br/assets/js/boot/kc-env.js';
const DEFAULT_MODULES = ['eventos', 'oportunidades'];
const DEFAULT_SORTS = ['votos', 'recentes', 'comentados'];

function parseArgs(argv) {
  const options = {
    envUrl: DEFAULT_PUBLIC_ENV_URL,
    limit: 120,
    rpcLimit: 20,
    triageLimit: 25,
    repairLimit: 100,
    modules: DEFAULT_MODULES.slice(),
    statuses: ['published'],
    sortBys: DEFAULT_SORTS.slice(),
    now: process.env.KC_FEED_RANKING_NOW || new Date().toISOString(),
    pretty: false,
    output: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--pretty') {
      options.pretty = true;
      continue;
    }
    if (arg === '--no-rpc') {
      options.sortBys = [];
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : '';
    if (key === 'limit') options.limit = Math.max(1, Number(value) || options.limit);
    else if (key === 'rpc-limit') options.rpcLimit = Math.max(1, Number(value) || options.rpcLimit);
    else if (key === 'triage-limit') options.triageLimit = Math.max(1, Number(value) || options.triageLimit);
    else if (key === 'repair-limit') options.repairLimit = Math.max(1, Number(value) || options.repairLimit);
    else if (key === 'modules') options.modules = csv(value, DEFAULT_MODULES);
    else if (key === 'statuses') options.statuses = csv(value, ['published']);
    else if (key === 'sort-by') options.sortBys = csv(value, DEFAULT_SORTS);
    else if (key === 'now') options.now = value || options.now;
    else if (key === 'env-url') options.envUrl = value || options.envUrl;
    else if (key === 'supabase-url') options.supabaseUrl = value || '';
    else if (key === 'anon-key') options.anonKey = value || '';
    else if (key === 'output') options.output = value || '';
  }
  return options;
}

function csv(value, fallback) {
  const items = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback.slice();
}

function readEnvFile(filePath) {
  const target = filePath || path.join(ROOT, '.env');
  if (!fs.existsSync(target)) return {};
  const result = {};
  fs.readFileSync(target, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    result[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  });
  return result;
}

function usableSecret(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('__KC_') || /^<.+>$/.test(text)) return '';
  return text;
}

function parsePublicEnv(text) {
  const patterns = {
    url: [
      /SUPABASE_URL\s*[:=]\s*['"]([^'"]+)/,
      /supabase\s*:\s*\{[\s\S]*?url\s*:\s*['"]([^'"]+)/,
      /supabaseUrl\s*[:=]\s*['"]([^'"]+)/i
    ],
    anonKey: [
      /SUPABASE_ANON_KEY\s*[:=]\s*['"]([^'"]+)/,
      /anonKey\s*:\s*['"]([^'"]+)/,
      /supabaseAnonKey\s*[:=]\s*['"]([^'"]+)/i
    ]
  };
  const find = (list) => {
    for (const pattern of list) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1];
    }
    return '';
  };
  return { url: find(patterns.url), anonKey: find(patterns.anonKey) };
}

async function resolveSupabaseConfig(options = {}) {
  const envFile = readEnvFile();
  let url = usableSecret(options.supabaseUrl || process.env.KC_SUPABASE_URL || process.env.SUPABASE_URL || envFile.KC_SUPABASE_URL || envFile.SUPABASE_URL);
  let anonKey = usableSecret(options.anonKey || process.env.KC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || envFile.KC_SUPABASE_ANON_KEY || envFile.SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    const response = await fetch(options.envUrl || DEFAULT_PUBLIC_ENV_URL);
    if (!response.ok) throw new Error(`Nao foi possivel ler KC_ENV publico: HTTP ${response.status}`);
    const publicEnv = parsePublicEnv(await response.text());
    url = url || usableSecret(publicEnv.url);
    anonKey = anonKey || usableSecret(publicEnv.anonKey);
  }

  if (!url || !anonKey) throw new Error('Supabase anon config indisponivel. Informe --supabase-url e --anon-key ou publique KC_ENV valido.');
  return { url: url.replace(/\/$/, ''), anonKey };
}

function headers(config) {
  return {
    apikey: config.anonKey,
    authorization: `Bearer ${config.anonKey}`,
    'content-type': 'application/json'
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchRestPosts(config, options) {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc');
  params.set('limit', String(options.limit));
  if (options.statuses.length === 1) params.set('status', `eq.${options.statuses[0]}`);
  else params.set('status', `in.(${options.statuses.join(',')})`);
  if (options.modules.length === 1) params.set('module', `eq.${options.modules[0]}`);
  else params.set('module', `in.(${options.modules.join(',')})`);
  return fetchJson(`${config.url}/rest/v1/posts?${params.toString()}`, { headers: headers(config) });
}

async function fetchRpcFeed(config, sortBy, options) {
  const body = {
    p_module: options.modules.length === 1 ? options.modules[0] : null,
    p_modules: options.modules.length > 1 ? options.modules : null,
    p_category: null,
    p_subcategory: null,
    p_tag: null,
    p_q: null,
    p_sort_by: sortBy,
    p_limit: options.rpcLimit,
    p_cursor: null,
    p_request_params: null
  };
  try {
    const payload = await fetchJson(`${config.url}/rest/v1/rpc/kc_get_feed_cursor`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body)
    });
    const posts = Array.isArray(payload && payload.posts) ? payload.posts : [];
    return { ok: payload && payload.ok !== false, sortBy, posts };
  } catch (error) {
    return { ok: false, sortBy, error: error.message, posts: [] };
  }
}

function moduleOf(entry) {
  return entry.module || 'unknown';
}

function titleOf(post) {
  return String((post && (post.title || post.titulo || post.name)) || '').replace(/\s+/g, ' ').trim();
}

function sourceOf(post) {
  const metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  return String(post && (post.source_url || post.url || post.link) || metadata.source_url || metadata.link || '').trim();
}

function sourceHostOf(post) {
  try {
    return new URL(sourceOf(post)).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function isCaduPublished(post) {
  const metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  return (
    metadata.cadu_published === true ||
    metadata.published_by_cadu === true ||
    post && post.cadu_published === true ||
    post && post.published_by_cadu === true ||
    Boolean(metadata.cadu_run_id || post && post.cadu_run_id)
  );
}

function reasonTypes(entry) {
  return (entry.eligibility.reasons || []).map((reason) => reason.type);
}

function classifyIssue(entry) {
  const post = entry.post || {};
  const title = titleOf(post);
  const reasons = reasonTypes(entry);
  const moduleKey = moduleOf(entry);
  const metadata = post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  const caduPublished = isCaduPublished(post);
  let severity = 'info';
  let suggestion = '';

  if (!entry.eligibility.active) {
    severity = 'high';
    suggestion = 'Retirar do feed ativo ou revisar metadados antes de ranquear.';
  }
  if (reasons.includes('missing-event-date')) {
    severity = 'high';
    suggestion = 'Evento precisa de data_evento/data_fim_evento; se for edital, curso com inscricao ou noticia, reclassificar.';
  } else if (reasons.includes('expired-event') || reasons.includes('expired-deadline')) {
    severity = 'high';
    suggestion = 'Encerrar, arquivar ou mover para historico.';
  } else if (reasons.includes('missing-deadline')) {
    severity = 'medium';
    suggestion = 'Oportunidade sem prazo normalizado; extrair deadline_date/deadline_at ou marcar como continua.';
  }

  const looksLikeOpportunity = moduleKey === 'eventos' && /inscri[cç][aã]o|inscri[cç][oõ]es|edital|bolsa|sele[cç][aã]o|curso|vaga/i.test(`${title} ${post.description || ''}`);
  if (looksLikeOpportunity && reasons.includes('missing-event-date')) {
    suggestion = 'Provavelmente deveria entrar como oportunidade ou item de inscricao, nao como evento sem data.';
  }

  if (severity === 'info' && !caduPublished) return null;
  return {
    id: entry.id,
    module: moduleKey,
    severity,
    state: entry.eligibility.state,
    score: entry.finalScore,
    reasons,
    caduPublished,
    caduRunId: String(metadata.cadu_run_id || post.cadu_run_id || ''),
    title: title.slice(0, 120),
    source: sourceOf(post),
    sourceHost: sourceHostOf(post),
    suggestion
  };
}

function countBy(values) {
  return values.reduce((acc, value) => {
    const key = String(value || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function repairAction(issue) {
  const reasons = issue.reasons || [];
  if (reasons.includes('missing-deadline')) return 'extract_deadline_date';
  if (reasons.includes('missing-event-date')) return 'fill_data_evento_or_reclassify';
  if (reasons.includes('expired-event') || reasons.includes('expired-deadline') || reasons.includes('expired')) return 'archive_or_close';
  return 'review_metadata';
}

function triageItem(issue) {
  return {
    id: issue.id,
    module: issue.module,
    severity: issue.severity,
    score: issue.score,
    reasons: issue.reasons,
    caduPublished: issue.caduPublished,
    caduRunId: issue.caduRunId,
    repairAction: repairAction(issue),
    title: issue.title,
    source: issue.source,
    sourceHost: issue.sourceHost,
    suggestion: issue.suggestion
  };
}

function postRepairText(post) {
  const metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  return [
    post && (post.title || post.titulo || ''),
    post && (post.description || post.descricao || ''),
    metadata.original_title,
    metadata.summary,
    metadata.resumo,
    metadata.source_unit,
    metadata.source_url,
    Array.isArray(metadata.tags) ? metadata.tags.join(' ') : '',
    Array.isArray(metadata.tagKeys) ? metadata.tagKeys.join(' ') : ''
  ].filter(Boolean).join('\n');
}

function postForTemporalRepair(post) {
  const metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  return {
    id: post && post.id,
    title: titleOf(post),
    summary: post && (post.description || post.descricao || ''),
    text: postRepairText(post),
    type: moduleOf({ module: post && (post.module || post.modulo) }) === 'eventos' ? 'event' : '',
    updatedAt: post && (post.updated_at || post.created_at) || metadata.source_lastmod || ''
  };
}

function looksLikeOpportunityText(post) {
  return /inscri[cç][aã]o|inscri[cç][oõ]es|edital|chamada|bolsa|sele[cç][aã]o|vaga|monitoria|est[aá]gio|submiss/i.test(postRepairText(post));
}

function buildRepairSuggestion(entry, options = {}) {
  const issue = classifyIssue(entry);
  if (!issue || issue.severity === 'info') return null;
  const post = entry.post || {};
  const temporal = analyzeTemporalRelevance(postForTemporalRepair(post), { now: options.now });
  const suggestion = {
    id: issue.id,
    module: issue.module,
    dryRun: true,
    wouldWrite: false,
    action: repairAction(issue),
    confidence: 0,
    reasons: issue.reasons,
    title: issue.title,
    source: issue.source,
    metadataPatch: {},
    rowPatch: {},
    evidence: {
      detectedDates: temporal.dates || [],
      deadlineDate: temporal.deadlineDate || '',
      eventDate: temporal.eventDate || '',
      temporalExpired: !!temporal.expired,
      temporalReason: temporal.reason || ''
    },
    notes: []
  };

  if (issue.reasons.includes('missing-deadline')) {
    if (temporal.deadlineDate) {
      suggestion.action = 'patch_deadline_date';
      suggestion.confidence = temporal.expired ? 0.74 : 0.82;
      suggestion.metadataPatch.deadline_date = temporal.deadlineDate;
      suggestion.metadataPatch.temporal_status = temporal.expired ? temporal.reason : 'current_or_unknown';
      suggestion.notes.push(temporal.expired
        ? 'Prazo detectado ja esta vencido; aplicar o patch deve fazer o ranking tratar o item como expirado.'
        : 'Prazo detectado a partir do texto publicado; revisar fonte oficial antes de aplicar.');
    } else {
      suggestion.action = 'manual_deadline_review';
      suggestion.confidence = 0.25;
      suggestion.notes.push('Nao foi possivel extrair prazo do texto publicado; consultar fonte oficial ou OpenClaw.');
    }
  } else if (issue.reasons.includes('missing-event-date')) {
    if (temporal.eventDate) {
      suggestion.action = 'patch_event_date';
      suggestion.confidence = temporal.expired ? 0.68 : 0.78;
      suggestion.metadataPatch.data_evento = temporal.eventDate;
      suggestion.metadataPatch.event_date_detected = temporal.eventDate;
      suggestion.metadataPatch.temporal_status = temporal.expired ? temporal.reason : 'current_or_unknown';
      suggestion.notes.push('Data de evento detectada a partir do texto publicado; revisar se e realizacao, nao prazo de inscricao.');
    } else if (looksLikeOpportunityText(post)) {
      suggestion.action = 'manual_reclassify_event';
      suggestion.confidence = 0.48;
      suggestion.rowPatch.module = 'oportunidades';
      suggestion.notes.push('Texto parece inscricao/edital/curso sem data de realizacao; reclassificar somente apos checar prazo e categoria.');
    } else {
      suggestion.action = 'manual_event_date_review';
      suggestion.confidence = 0.2;
      suggestion.notes.push('Evento sem data e sem sinal suficiente para patch automatico.');
    }
  } else if (issue.reasons.some((reason) => ['expired', 'expired-event', 'expired-deadline', 'closed'].includes(reason))) {
    suggestion.action = issue.state === 'closed' ? 'keep_out_of_active_feed' : 'archive_or_close';
    suggestion.confidence = 0.72;
    suggestion.notes.push('Item nao deve competir no feed ativo; preservar historico quando houver comentarios.');
  }

  if (!Object.keys(suggestion.metadataPatch).length && !Object.keys(suggestion.rowPatch).length) {
    suggestion.wouldWrite = false;
  }
  return suggestion;
}

function buildRepairSuggestions(entries, options = {}) {
  const limit = Math.max(1, Number(options.limit) || entries.length || 25);
  const candidates = entries
    .map((entry) => buildRepairSuggestion(entry, options))
    .filter(Boolean)
    .sort((left, right) => {
      const actionOrder = {
        patch_deadline_date: 0,
        patch_event_date: 1,
        archive_or_close: 2,
        manual_reclassify_event: 3,
        manual_deadline_review: 4,
        manual_event_date_review: 5,
        keep_out_of_active_feed: 6
      };
      return (actionOrder[left.action] ?? 99) - (actionOrder[right.action] ?? 99) || right.confidence - left.confidence;
    });
  const suggestions = candidates.slice(0, limit);
  return {
    total: candidates.length,
    totalCandidates: candidates.length,
    shown: suggestions.length,
    limit,
    byAction: countBy(candidates.map((item) => item.action)),
    shownByAction: countBy(suggestions.map((item) => item.action)),
    suggestions
  };
}

function buildCaduTriage(entries, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 25);
  const issues = entries
    .map(classifyIssue)
    .filter(Boolean)
    .filter((issue) => issue.severity !== 'info')
    .sort((left, right) => {
      const severityOrder = { high: 0, medium: 1, info: 2 };
      return severityOrder[left.severity] - severityOrder[right.severity] || right.score - left.score;
    });
  const actionable = issues.filter((issue) => issue.caduPublished || ['eventos', 'oportunidades'].includes(issue.module));
  const byReason = {};
  actionable.forEach((issue) => {
    (issue.reasons || []).forEach((reason) => {
      byReason[reason] = (byReason[reason] || 0) + 1;
    });
  });
  const bySourceHost = countBy(actionable.map((issue) => issue.sourceHost).filter(Boolean));
  const byRepairAction = countBy(actionable.map(repairAction));
  const sortIssue = (left, right) => right.score - left.score || String(left.title).localeCompare(String(right.title));
  return {
    total: actionable.length,
    caduMarked: actionable.filter((issue) => issue.caduPublished).length,
    unmarkedButRelevant: actionable.filter((issue) => !issue.caduPublished).length,
    byReason,
    bySourceHost,
    byRepairAction,
    queues: {
      missingDeadlines: actionable
        .filter((issue) => issue.module === 'oportunidades' && issue.reasons.includes('missing-deadline'))
        .sort(sortIssue)
        .slice(0, limit)
        .map(triageItem),
      eventDateReview: actionable
        .filter((issue) => issue.module === 'eventos' && issue.reasons.includes('missing-event-date'))
        .sort(sortIssue)
        .slice(0, limit)
        .map(triageItem),
      expired: actionable
        .filter((issue) => issue.reasons.some((reason) => ['expired', 'expired-event', 'expired-deadline'].includes(reason)))
        .sort(sortIssue)
        .slice(0, limit)
        .map(triageItem)
    }
  };
}

function summarize(entries) {
  const summary = {
    total: entries.length,
    active: 0,
    inactive: 0,
    byModule: {},
    byState: {},
    byReason: {},
    bySourceHost: {}
  };
  entries.forEach((entry) => {
    const moduleKey = moduleOf(entry);
    const state = entry.eligibility.state || 'unknown';
    summary.byModule[moduleKey] = (summary.byModule[moduleKey] || 0) + 1;
    summary.byState[state] = (summary.byState[state] || 0) + 1;
    if (entry.eligibility.active) summary.active += 1;
    else summary.inactive += 1;
    reasonTypes(entry).forEach((reason) => {
      summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
    });
    try {
      const host = new URL(sourceOf(entry.post)).hostname.replace(/^www\./, '');
      if (host) summary.bySourceHost[host] = (summary.bySourceHost[host] || 0) + 1;
    } catch (_) {}
  });
  return summary;
}

function compactEntry(entry) {
  return {
    id: entry.id,
    module: moduleOf(entry),
    score: entry.finalScore,
    state: entry.eligibility.state,
    active: entry.eligibility.active,
    components: entry.components,
    reasons: reasonTypes(entry),
    title: titleOf(entry.post).slice(0, 120),
    source: sourceOf(entry.post)
  };
}

function compareRpcFeed(feed, options) {
  const entries = Policy.rankForShadow(feed.posts, {
    now: options.now,
    diversify: false,
    dedupe: false
  });
  return {
    ok: feed.ok,
    sortBy: feed.sortBy,
    error: feed.error || null,
    total: feed.posts.length,
    summary: summarize(entries),
    currentTop: entries.slice(0, Math.min(8, entries.length)).map((entry, index) => Object.assign({ currentRank: index + 1 }, compactEntry(entry))),
    issues: entries.map(classifyIssue).filter(Boolean).filter((issue) => issue.severity !== 'info').slice(0, 12)
  };
}

async function run(options) {
  const config = await resolveSupabaseConfig(options);
  const sampledPosts = await fetchRestPosts(config, options);
  const shadowEntries = Policy.rankForShadow(sampledPosts, {
    now: options.now,
    diversify: true
  });
  const rpcFeeds = [];
  for (const sortBy of options.sortBys) {
    rpcFeeds.push(compareRpcFeed(await fetchRpcFeed(config, sortBy, options), options));
  }

  const issues = shadowEntries
    .map(classifyIssue)
    .filter(Boolean)
    .filter((issue) => issue.severity !== 'info')
    .sort((left, right) => {
      const severityOrder = { high: 0, medium: 1, info: 2 };
      return severityOrder[left.severity] - severityOrder[right.severity] || right.score - left.score;
    })
    .slice(0, 40);

  return {
    generatedAt: new Date().toISOString(),
    policyVersion: Policy.VERSION,
    scope: {
      modules: options.modules,
      statuses: options.statuses,
      limit: options.limit,
      rpcLimit: options.rpcLimit,
      now: options.now,
      source: 'Supabase REST/RPC anon, read-only'
    },
    sample: {
      summary: summarize(shadowEntries),
      topShadow: shadowEntries.slice(0, 12).map(compactEntry),
      issues,
      caduTriage: buildCaduTriage(shadowEntries, { limit: options.triageLimit }),
      repairSuggestions: buildRepairSuggestions(shadowEntries, { limit: options.repairLimit, now: options.now })
    },
    currentFeeds: rpcFeeds
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);
  const json = JSON.stringify(report, null, options.pretty ? 2 : 0);
  if (options.output) {
    const target = path.resolve(ROOT, options.output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${json}\n`, 'utf8');
  }
  process.stdout.write(`${json}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  parsePublicEnv,
  resolveSupabaseConfig,
  summarize,
  classifyIssue,
  buildCaduTriage,
  buildRepairSuggestion,
  buildRepairSuggestions,
  isCaduPublished,
  compareRpcFeed,
  run
};
