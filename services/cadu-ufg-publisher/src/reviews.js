#!/usr/bin/env node
'use strict';

const { loadConfig } = require('./config');
const { SupabasePublisher } = require('./publisher');
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
    `${index + 1}. [${String(item.key || '').slice(0, 12)}] ${item.title || '(sem titulo)'}`,
    `   decisao: ${item.decision || 'review'}`,
    `   confianca: ${item.confidence == null ? 'n/a' : item.confidence}`,
    item.module || item.category ? `   modulo/categoria: ${item.module || 'n/a'}/${item.category || 'n/a'}` : '',
    item.pendingReason ? `   moderacao: ${item.pendingReason}` : '',
    `   fonte: ${item.sourceUrl || 'n/a'}`,
    item.payload && item.payload.descricao ? `   preview:\n${String(item.payload.descricao).slice(0, 1200)}` : '',
    `   aprovar: npm run cadu:reviews -- --approve=${String(item.key || '').slice(0, 12)}`,
    `   rejeitar: npm run cadu:reviews -- --reject=${String(item.key || '').slice(0, 12)}`,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function resolveReviewKey(stateData, input) {
  const wanted = String(input || '').trim();
  if (!wanted) return '';
  const seen = (stateData && stateData.seen) || {};
  if (seen[wanted]) return wanted;
  const matches = Object.keys(seen).filter((key) => key.startsWith(wanted));
  return matches.length === 1 ? matches[0] : '';
}

async function approveReview(state, keyInput, config) {
  const key = resolveReviewKey(state.data, keyInput);
  if (!key) throw new Error(`Item de revisao nao encontrado ou prefixo ambiguo: ${keyInput}`);
  const item = state.data.seen[key];
  if (!item || !item.payload) throw new Error(`Item sem payload publicavel: ${keyInput}`);

  const publisher = new SupabasePublisher(config);
  const result = await publisher.createPost(item.payload);
  if (!result || !result.ok) {
    state.mark(key, { decision: 'review:publish-failed', error: result || { code: 'unknown' } });
    state.save();
    throw new Error(`Falha ao publicar revisao ${keyInput}: ${(result && result.code) || 'unknown'}`);
  }

  state.mark(key, {
    decision: result.pending ? 'pending' : 'published',
    postId: result.post && result.post.id,
    pendingReason: result.pendingReason || '',
  });
  state.save();
  return result;
}

function rejectReview(state, keyInput, reason = '') {
  const key = resolveReviewKey(state.data, keyInput);
  if (!key) throw new Error(`Item de revisao nao encontrado ou prefixo ambiguo: ${keyInput}`);
  state.mark(key, { decision: 'discard:manual', rejectReason: reason || 'rejeitado pelo operador' });
  state.save();
  return state.data.seen[key];
}

function parseArgs(argv) {
  const args = { limit: 20 };
  argv.forEach((arg) => {
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--state=')) args.statePath = arg.slice('--state='.length);
    else if (arg.startsWith('--approve=')) args.approve = arg.slice('--approve='.length);
    else if (arg.startsWith('--reject=')) args.reject = arg.slice('--reject='.length);
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
  });
  return args;
}

if (require.main === module) {
  const config = loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const state = new StateStore(args.statePath || config.statePath).load();
  Promise.resolve()
    .then(async () => {
      if (args.approve) {
        const result = await approveReview(state, args.approve, config);
        console.log(`Revisao aprovada. Post: ${(result.post && result.post.id) || 'n/a'}${result.pending ? ' (pendente de moderacao)' : ''}`);
        return;
      }
      if (args.reject) {
        const item = rejectReview(state, args.reject, args.reason);
        console.log(`Revisao rejeitada: ${item.title || args.reject}`);
        return;
      }
      console.log(formatReviews(collectReviews(state.data, Number.isFinite(args.limit) ? args.limit : 20)));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  approveReview,
  collectReviews,
  formatReviews,
  parseArgs,
  rejectReview,
  resolveReviewKey,
};
