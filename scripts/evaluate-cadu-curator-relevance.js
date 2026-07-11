#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const nowArg = process.argv.find(arg => arg.startsWith('--now='));
const referenceDate = nowArg ? nowArg.slice('--now='.length) : null;
if (referenceDate) {
  const parsedReferenceDate = new Date(referenceDate);
  if (Number.isNaN(parsedReferenceDate.getTime())) {
    throw new Error(`Invalid --now value: ${referenceDate}`);
  }
  process.env.CADU_REFERENCE_DATE = parsedReferenceDate.toISOString();
}

const curator = require(path.join(
  __dirname,
  '..',
  'data',
  '.openclaw',
  'workspace',
  'scripts',
  'cadu-curador-v4.4.js'
));

function readInput() {
  const inputArg = process.argv.find(arg => arg.startsWith('--input='));
  if (inputArg) {
    return fs.readFileSync(path.resolve(inputArg.slice('--input='.length)));
  }
  return fs.readFileSync(0);
}

function relevantLinkText(item) {
  const groups = item?.relevantLinks && typeof item.relevantLinks === 'object'
    ? Object.values(item.relevantLinks)
    : [];
  const links = groups
    .flatMap(group => Array.isArray(group) ? group : [])
    .map(link => `${link.label || 'Link'}: ${link.url || ''}`)
    .filter(Boolean);
  return links.length ? `\n${links.join('\n')}` : '';
}

function classifyRecord(item) {
  const dates = item?.dates || {};
  const result = curator.classifyItem(
    item?.title || '',
    `${item?.text || ''}${relevantLinkText(item)}`,
    '',
    item?.site || 'artifact',
    item?.url || item?.sourceUrl || '',
    {
      created_at: dates.publishedAt || dates.webyDate || item?.created_at || null,
      updated_at: dates.updatedAt || item?.updated_at || null,
      nativeCategories: item?.nativeCategories || [],
      sourceKind: item?.sourceKind || 'news',
      eventStartsAt: dates.eventStartsAt || dates.beginAt || null,
      eventEndsAt: dates.eventEndsAt || dates.endAt || null,
      relevantLinks: item?.relevantLinks || null,
    }
  );

  return {
    title: item?.title || '',
    url: item?.url || item?.sourceUrl || '',
    sourceKind: item?.sourceKind || 'news',
    before: {
      decision: item?.decision || 'publish',
      module: item?.module || '',
      score: item?.score ?? null,
      dates: item?.dates || {},
    },
    after: {
      decision: result.decision,
      module: result.module,
      category: result.category,
      score: result.score,
      reasons: result.reasons,
      actionEvidence: result.actionEvidence,
      gateReason: result.gateReason,
      shouldHydrate: result.shouldHydrate,
      temporal: {
        publishedAt: result.temporal.publishedAt,
        eventStartsAt: result.temporal.eventStartsAt,
        eventEndsAt: result.temporal.eventEndsAt,
        applicationOpensAt: result.temporal.applicationOpensAt,
        applicationDeadline: result.temporal.applicationDeadline,
        applicationStatus: result.temporal.applicationStatus,
        eventStatus: result.temporal.eventStatus,
        canApply: result.temporal.canApply,
        isOld: result.temporal.isOld,
        dateEvidence: result.temporal.dateEvidence,
      },
    },
  };
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

const inputBuffer = readInput();
const inputSha256 = crypto.createHash('sha256').update(inputBuffer).digest('hex');
const artifact = JSON.parse(inputBuffer.toString('utf8').replace(/^\uFEFF/, ''));
if (!Array.isArray(artifact.publishable)) {
  throw new Error('Invalid curator artifact: publishable[] is required');
}
const candidates = Array.isArray(artifact.publishable) ? artifact.publishable : [];
const items = candidates.map(classifyRecord);

const report = {
  dryRun: true,
  generatedAt: process.env.CADU_REFERENCE_DATE || new Date().toISOString(),
  referenceDate: process.env.CADU_REFERENCE_DATE || null,
  sourceArtifact: {
    sha256: inputSha256,
    version: artifact.version || null,
    mode: artifact.mode || null,
    timestamp: artifact.timestamp || null,
    candidateCount: candidates.length,
  },
  before: {
    decisions: countBy(items, item => item.before.decision),
    modules: countBy(items, item => item.before.module),
  },
  after: {
    decisions: countBy(items, item => item.after.decision),
    modules: countBy(items, item => item.after.module),
    blockedByReason: countBy(
      items.filter(item => item.after.decision === 'discard'),
      item => item.after.gateReason
    ),
  },
  items,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
