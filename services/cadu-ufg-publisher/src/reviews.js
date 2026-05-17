#!/usr/bin/env node
'use strict';

const { loadConfig } = require('./config');
const { StateStore } = require('./state');

function collectReviews(stateData, limit = 20) {
  const seen = (stateData && stateData.seen) || {};
  return Object.entries(seen)
    .map(([key, value]) => ({ key, ...(value || {}) }))
    .filter((item) => {
      const decision = String(item.decision || '');
      return decision.startsWith('review') || decision === 'pending';
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit);
}

function formatReviews(items) {
  if (!items.length) return 'Nenhum item em revisao no state local.';
  return items.map((item, index) => [
    `${index + 1}. ${item.title || '(sem titulo)'}`,
    `   decisao: ${item.decision || 'review'}`,
    `   confianca: ${item.confidence == null ? 'n/a' : item.confidence}`,
    item.pendingReason ? `   moderacao: ${item.pendingReason}` : '',
    `   fonte: ${item.sourceUrl || 'n/a'}`,
  ].filter(Boolean).join('\n')).join('\n\n');
}

if (require.main === module) {
  const config = loadConfig();
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 20;
  const statePathArg = process.argv.find((arg) => arg.startsWith('--state='));
  const state = new StateStore(statePathArg ? statePathArg.slice('--state='.length) : config.statePath).load();
  console.log(formatReviews(collectReviews(state.data, Number.isFinite(limit) ? limit : 20)));
}

module.exports = {
  collectReviews,
  formatReviews,
};
