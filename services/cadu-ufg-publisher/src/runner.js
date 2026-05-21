'use strict';

const { classifyItem } = require('./classifier');
const { loadConfig } = require('./config');
const { extractHtmlDocument, normalizeWebyItem } = require('./extractors');
const { HttpClient } = require('./http-client');
const { mapToKinoPayload } = require('./mapper');
const { summarizeWithDeepSeek } = require('./model');
const { notify } = require('./notifier');
const { extractPdfText } = require('./pdf');
const { SupabasePublisher } = require('./publisher');
const { evaluatePayloadQuality } = require('./quality');
const { isAllowedByRobots, parseRobotsTxt } = require('./robots');
const { loadSources, selectSources } = require('./sources');
const { StateStore } = require('./state');
const { canonicalizeUrl, normalizeText, nowIso, sha256, uniq } = require('./utils');
const { parseFeed, parseSitemap } = require('./xml');

function parseWebyRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data && data.items)) return data.items;
  if (Array.isArray(data && data.data)) return data.data;
  if (Array.isArray(data && data.news)) return data.news;
  if (Array.isArray(data && data.events)) return data.events;
  return [];
}

function candidateSortValue(item) {
  const raw = String(
    (item && (item.updatedAt || item.dateBeginAt || item.dateEndAt))
    || (item && item.raw && (item.raw.updated_at || item.raw.date_begin_at || item.raw.begin_at || item.raw.date_end_at || item.raw.end_at))
    || ''
  );
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortCandidates(items) {
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((left, right) => candidateSortValue(right) - candidateSortValue(left));
}

async function discoverFromWebyJson(http, source, maxItems, options = {}) {
  const items = [];
  const maxPages = Math.max(1, Number(options.maxPages || 1));
  const perPage = Math.max(1, Math.min(Number(options.perPage || maxItems || 10), 50));
  for (const endpoint of ['news.json', 'events.json']) {
    const seenPageSignatures = new Set();
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const url = `${source.baseUrl}/${endpoint}?per_page=${perPage}&page=${page}&order=updated_at&direction=desc`;
        const { data } = await http.json(url);
        const records = parseWebyRecords(data);
        if (!records.length) break;

        const pageSignature = sha256(records.map((record) => record && (record.id || record.slug || record.title || record.name)).join('|'));
        if (seenPageSignatures.has(pageSignature)) break;
        seenPageSignatures.add(pageSignature);

        records.slice(0, perPage).forEach((record) => items.push(normalizeWebyItem(source, record, endpoint.startsWith('events') ? 'event' : 'news')));
        if (records.length < perPage) break;
      }
    } catch (_) {
      // Some UFG sites expose only one endpoint. Fallbacks handle the rest.
    }
  }
  return sortCandidates(items);
}

async function discoverFromSitemap(http, source, robots, maxItems) {
  const sitemapUrl = robots.sitemaps && robots.sitemaps[0]
    ? robots.sitemaps[0]
    : `${source.baseUrl}/sitemap.xml`;
  if (!isAllowedByRobots(sitemapUrl, robots)) return [];
  const { text } = await http.text(sitemapUrl, { accept: 'application/xml,text/xml,*/*' });
  const parsed = parseSitemap(text);
  return parsed.urls
    .filter((entry) => /\/(n|e|p)\//.test(entry.loc) || /edital|evento|noticia|news/i.test(entry.loc))
    .slice(0, maxItems)
    .map((entry) => ({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: canonicalizeUrl(entry.loc, source.baseUrl),
      title: '',
      summary: '',
      text: '',
      updatedAt: entry.lastmod || '',
      type: 'sitemap',
      pdfLinks: [],
      raw: entry,
    }));
}

async function discoverFromFeed(http, source, maxItems) {
  try {
    const { text } = await http.text(`${source.baseUrl}/feed`, { accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' });
    return parseFeed(text).slice(0, maxItems).map((entry) => ({
      id: `${source.id}:feed:${entry.url}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: canonicalizeUrl(entry.url, source.baseUrl),
      title: entry.title,
      summary: entry.summary,
      text: entry.summary,
      updatedAt: entry.updatedAt || '',
      type: 'feed',
      pdfLinks: [],
      raw: entry,
    }));
  } catch (_) {
    return [];
  }
}

async function hydrateItem(http, source, item, robots) {
  if (item.text && item.title) return item;
  if (!item.sourceUrl || !isAllowedByRobots(item.sourceUrl, robots)) return item;
  const { text } = await http.text(item.sourceUrl);
  const htmlDoc = extractHtmlDocument(source, item.sourceUrl, text);
  return {
    ...item,
    ...htmlDoc,
    id: item.id || htmlDoc.id,
    updatedAt: item.updatedAt || htmlDoc.updatedAt,
  };
}

async function validateSource(http, source) {
  try {
    const robotsUrl = `${source.baseUrl}/robots.txt`;
    const { text } = await http.text(robotsUrl, { accept: 'text/plain,*/*' });
    return { ok: true, robots: parseRobotsTxt(text) };
  } catch (error) {
    return { ok: false, error: error.message, robots: parseRobotsTxt('') };
  }
}

function itemKeys(item) {
  const source = item && typeof item === 'object' ? item : {};
  const canonicalUrl = canonicalizeUrl(source.sourceUrl || '');
  const title = normalizeText(source.title || '');
  const content = normalizeText(`${source.title || ''}\n${source.summary || ''}\n${source.text || ''}`).slice(0, 4000);
  const primaryDoc = Array.isArray(source.pdfLinks) && source.pdfLinks[0] ? canonicalizeUrl(source.pdfLinks[0]) : '';
  const dateKey = source.dateEndAt || source.updatedAt || source.dateBeginAt || '';
  const raw = source.raw && typeof source.raw === 'object' ? source.raw : {};
  const rawId = raw.site_id && raw.id ? `weby:${raw.site_id}:${raw.id}` : '';
  const base = canonicalUrl || `${source.sourceId || ''}:${source.id || ''}:${title}`;
  const keys = [
    `item:${sha256(`${base}\n${title}\n${dateKey}`)}`,
    canonicalUrl ? `url:${sha256(canonicalUrl)}` : '',
    rawId ? `raw:${sha256(rawId)}` : '',
    title && (primaryDoc || dateKey) ? `title-doc-date:${sha256(`${title}\n${primaryDoc}\n${dateKey}`)}` : '',
    content.length > 80 ? `content:${sha256(content)}` : '',
  ];
  return uniq(keys);
}

function shortReviewKey(key) {
  return String(key || '').slice(0, 12);
}

function buildReviewItem(key, hydrated, classification, payload, decision) {
  return {
    key: shortReviewKey(key),
    title: hydrated.title,
    decision,
    confidence: classification.confidence,
    module: payload.modulo || classification.module,
    category: payload.categoriaKey || classification.category,
    sourceUrl: hydrated.sourceUrl,
    preview: String(payload.descricao || '').slice(0, 1400),
    qualityWarnings: payload.metadata && payload.metadata.quality_warnings,
  };
}

function markForReview(context, stats, key, hydrated, classification, payload, decision, aliases = []) {
  const reviewDecision = decision || 'review';
  stats.review += 1;
  stateMarkReview(context.state, key, hydrated, classification, payload, reviewDecision, aliases);
  if (!stats.reviewItems) stats.reviewItems = [];
  if (stats.reviewItems.length < context.config.reviewPreviewLimit) {
    stats.reviewItems.push(buildReviewItem(key, hydrated, classification, payload, reviewDecision));
  }
}

function stateMarkReview(state, key, hydrated, classification, payload, decision, aliases = []) {
  state.mark(key, {
    decision,
    sourceUrl: hydrated.sourceUrl,
    title: hydrated.title,
    confidence: classification.confidence,
    module: classification.module,
    category: classification.category,
    payload,
  }, aliases);
}

async function processSource(context, source) {
  const { http, config, state, dryRun, publisher, runId } = context;
  const stats = { source: source.id, discovered: 0, published: 0, pending: 0, review: 0, discarded: 0, skipped: 0, disabled: false, errors: [] };
  const validation = await validateSource(http, source);
  if (!validation.ok) {
    stats.disabled = true;
    stats.errors.push(`robots: ${validation.error}`);
    return stats;
  }

  const robots = validation.robots;
  let candidates = [];
  const maxItems = config.maxItemsPerSource;
  candidates = candidates.concat(await discoverFromWebyJson(http, source, maxItems, { maxPages: config.webyMaxPages }));
  if (candidates.length < maxItems) candidates = candidates.concat(await discoverFromFeed(http, source, maxItems));
  if (candidates.length < maxItems) {
    try {
      candidates = candidates.concat(await discoverFromSitemap(http, source, robots, maxItems));
    } catch (error) {
      stats.errors.push(`sitemap: ${error.message}`);
    }
  }

  const byUrl = new Map();
  candidates.forEach((candidate) => {
    if (candidate.sourceUrl && !byUrl.has(candidate.sourceUrl)) byUrl.set(candidate.sourceUrl, candidate);
  });
  const uniqueCandidates = sortCandidates(Array.from(byUrl.values())).slice(0, maxItems);
  stats.discovered = uniqueCandidates.length;

  for (const candidate of uniqueCandidates) {
    try {
      const hydrated = await hydrateItem(http, source, candidate, robots);
      const keys = itemKeys(hydrated);
      const key = keys[0];
      const aliases = keys.slice(1);
      if (state.hasAny(keys)) {
        stats.skipped += 1;
        continue;
      }

      const classification = classifyItem(hydrated, source);
      if (classification.decision === 'discard') {
        stats.discarded += 1;
        state.mark(key, { decision: 'discard', sourceUrl: hydrated.sourceUrl, title: hydrated.title, confidence: classification.confidence }, aliases);
        continue;
      }

      if (classification.hasPdf && hydrated.pdfLinks && hydrated.pdfLinks[0]) {
        try {
          const pdf = await extractPdfText(config, hydrated.pdfLinks[0]);
          if (pdf.text) {
            hydrated.pdfText = pdf.text;
            hydrated.text = `${hydrated.text}\n\n${pdf.text}`;
          } else if (pdf.skippedReason) {
            stats.errors.push(`pdf:${hydrated.pdfLinks[0]}: ${pdf.skippedReason}`);
          }
        } catch (error) {
          stats.errors.push(`pdf:${hydrated.pdfLinks[0]}: ${error.message}`);
        }
      }

      let summaryText = '';
      try {
        summaryText = await summarizeWithDeepSeek(config, hydrated, classification);
      } catch (error) {
        stats.errors.push(`model:${hydrated.sourceUrl}: ${error.message}`);
      }

      const payload = mapToKinoPayload(hydrated, classification, { runId, summaryText });
      const quality = evaluatePayloadQuality(hydrated, classification, payload);
      payload.metadata = {
        ...(payload.metadata || {}),
        quality_warnings: quality.warnings,
      };

      if (classification.decision === 'review') {
        markForReview(context, stats, key, hydrated, classification, payload, 'review', aliases);
        continue;
      }

      if (!quality.ok) {
        markForReview(context, stats, key, hydrated, classification, payload, 'review:quality', aliases);
        continue;
      }

      if (dryRun) {
        stats.published += 1;
        continue;
      }

      if (config.reviewBeforePublish) {
        markForReview(context, stats, key, hydrated, classification, payload, 'review:preview', aliases);
        continue;
      }

      if (context.publishedThisRun >= config.maxPublishPerRun) {
        markForReview(context, stats, key, hydrated, classification, payload, 'review:publish-cap', aliases);
        continue;
      }

      const result = await publisher.createPost(payload);
      if (result && result.ok) {
        context.publishedThisRun += 1;
        if (result.media && result.media.ok === false) {
          stats.errors.push(`media:${hydrated.sourceUrl}: ${result.media.error || 'post_media_insert_failed'}`);
        }
        if (result.pending) {
          stats.pending += 1;
          state.mark(key, {
            decision: 'pending',
            sourceUrl: hydrated.sourceUrl,
            title: hydrated.title,
            confidence: classification.confidence,
            postId: result.post && result.post.id,
            pendingReason: result.pendingReason || '',
          }, aliases);
        } else {
          stats.published += 1;
          state.mark(key, { decision: 'published', sourceUrl: hydrated.sourceUrl, title: hydrated.title, confidence: classification.confidence, postId: result.post && result.post.id }, aliases);
        }
      } else {
        stats.errors.push(`publish:${hydrated.sourceUrl}: ${(result && result.code) || 'unknown'}`);
        markForReview(context, stats, key, hydrated, classification, payload, 'review:publish-failed', aliases);
      }
    } catch (error) {
      stats.errors.push(`${candidate.sourceUrl || source.id}: ${error.message}`);
    }
  }

  return stats;
}

function buildDigest(run) {
  const totals = run.sources.reduce((acc, item) => {
    ['discovered', 'published', 'pending', 'review', 'discarded', 'skipped'].forEach((key) => { acc[key] += item[key] || 0; });
    if (item.disabled) acc.disabled += 1;
    acc.errors += (item.errors || []).length;
    return acc;
  }, { discovered: 0, published: 0, pending: 0, review: 0, discarded: 0, skipped: 0, disabled: 0, errors: 0 });

  const lines = [
    `Run: ${run.id}`,
    `Modo: ${run.mode}${run.dryRun ? ' (dry-run)' : ''}`,
    `Descobertos: ${totals.discovered}`,
    `Publicados: ${totals.published}`,
    `Pendentes de moderacao: ${totals.pending}`,
    `Para revisao: ${totals.review}`,
    `Descartados: ${totals.discarded}`,
    `Duplicados/ignorados: ${totals.skipped}`,
    `Fontes desabilitadas nesta execucao: ${totals.disabled}`,
    `Erros: ${totals.errors}`,
  ];

  const reviewItems = run.sources.flatMap((source) => source.reviewItems || []).slice(0, 6);
  if (reviewItems.length) {
    lines.push('');
    lines.push('Previews para revisao/aprovacao:');
    reviewItems.forEach((item, index) => {
      lines.push('');
      lines.push(`${index + 1}. [${item.key}] ${item.title || '(sem titulo)'}`);
      lines.push(`Modulo/categoria: ${item.module}/${item.category} | confianca: ${item.confidence}`);
      if (item.qualityWarnings && item.qualityWarnings.length) {
        lines.push(`Avisos de qualidade: ${item.qualityWarnings.join(', ')}`);
      }
      lines.push(`Fonte: ${item.sourceUrl}`);
      lines.push('Markdown proposto:');
      lines.push(item.preview);
      lines.push(`Para aprovar: npm run cadu:reviews -- --approve=${item.key}`);
      lines.push(`Para rejeitar: npm run cadu:reviews -- --reject=${item.key}`);
    });
  }

  return lines.join('\n');
}

async function runCadu(options = {}) {
  const config = loadConfig();
  const mode = options.mode || 'quick';
  const dryRun = options.dryRun !== false && !options.publish;
  const runId = `cadu-${mode}-${Date.now()}`;
  const http = new HttpClient({
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    minDelayMs: config.minDelayMs,
    fetchProxyTemplate: config.fetchProxyTemplate,
    hostAliases: config.hostAliases,
  });
  const state = new StateStore(options.statePath || config.statePath).load();
  const sources = selectSources(loadSources(config.sourcePath), mode, options.sources || []);
  const publisher = (dryRun || config.reviewBeforePublish) ? null : new SupabasePublisher(config);
  const context = { config, dryRun, http, publisher, runId, state, publishedThisRun: 0 };
  const run = { id: runId, mode, dryRun, startedAt: nowIso(), sources: [] };

  for (const source of sources) {
    const stats = await processSource(context, source);
    run.sources.push(stats);
  }

  run.finishedAt = nowIso();
  state.addRun(run);
  state.save();

  const digest = buildDigest(run);
  if (!dryRun || options.notifyDryRun) {
    await notify(config, 'Cadu Bot - curadoria UFG', digest);
  }

  return { run, digest };
}

module.exports = {
  buildDigest,
  discoverFromFeed,
  discoverFromSitemap,
  discoverFromWebyJson,
  runCadu,
  validateSource,
};
