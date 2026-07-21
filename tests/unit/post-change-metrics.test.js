'use strict';

/**
 * Contract tests: voting must classify post metric UPDATEs as metrics_updated
 * so feeds/product pages do not wipe scroll position / navigation state.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'api', 'kc-supabase.client.js');
const FEED_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'kc-feed.controller.js');
const CORE_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'core', 'kc-core.js');
const PRODUCT_LOAD_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'product.load.js');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

describe('post change metrics — vote must not refresh feeds', () => {
  const clientSrc = fs.readFileSync(CLIENT_PATH, 'utf8');
  const feedSrc = fs.readFileSync(FEED_PATH, 'utf8');
  const coreSrc = fs.readFileSync(CORE_PATH, 'utf8');
  const productSrc = fs.readFileSync(PRODUCT_LOAD_PATH, 'utf8');

  test('classifica UPDATEs só de contadores como metrics_updated', () => {
    expect(clientSrc).toContain('function isMetricsOnlyPostUpdate');
    expect(clientSrc).toContain("type = 'metrics_updated'");
    expect(clientSrc).toContain("'votos'");
    expect(clientSrc).toContain("'highlight_score'");
  });

  test('isMetricsOnlyPostUpdate ignora título/status e detecta votos', () => {
    const fnSrc = extractFunction(clientSrc, 'isMetricsOnlyPostUpdate');
    expect(fnSrc).toBeTruthy();
    // eslint-disable-next-line no-new-func
    const isMetricsOnlyPostUpdate = new Function(`${fnSrc}; return isMetricsOnlyPostUpdate;`)();

    const base = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Bolsa de pesquisa',
      description: 'Desc',
      status: 'published',
      module: 'oportunidades',
      category: 'bolsas',
      votos: 3,
      highlight_score: 10,
      view_count: 1,
    };

    expect(isMetricsOnlyPostUpdate(base, { ...base, votos: 4, highlight_score: 12 })).toBe(true);
    expect(isMetricsOnlyPostUpdate(base, { ...base, view_count: 9 })).toBe(true);
    expect(isMetricsOnlyPostUpdate(base, { ...base, title: 'Outro título' })).toBe(false);
    expect(isMetricsOnlyPostUpdate(base, { ...base, status: 'closed' })).toBe(false);
    expect(isMetricsOnlyPostUpdate(base, { ...base })).toBe(false);
  });

  test('normalizePostChangePayload marca vote update como metrics_updated', () => {
    const metricsFn = extractFunction(clientSrc, 'isMetricsOnlyPostUpdate');
    const normalizeFn = extractFunction(clientSrc, 'normalizePostChangePayload');
    expect(metricsFn && normalizeFn).toBeTruthy();
    // eslint-disable-next-line no-new-func
    const normalizePostChangePayload = new Function(
      `${metricsFn}\n${normalizeFn}; return normalizePostChangePayload;`,
    )();

    const oldRow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Evento',
      description: 'x',
      status: 'published',
      module: 'eventos',
      votos: 1,
      highlight_score: 5,
    };
    const newRow = { ...oldRow, votos: 2, highlight_score: 7, updated_at: '2026-07-21T00:00:00Z' };

    const change = normalizePostChangePayload({
      eventType: 'UPDATE',
      old: oldRow,
      new: newRow,
    });

    expect(change).toBeTruthy();
    expect(change.type).toBe('metrics_updated');
    expect(change.postId).toBe(oldRow.id);
    expect(Number(change.votos)).toBe(2);
  });

  test('feed e product ignoram metrics_updated sem scheduleFreshnessRefresh/loadPost', () => {
    expect(feedSrc).toContain("changeType === 'metrics_updated'");
    expect(feedSrc).toContain('kcUpdateVoteScoreInDOM');
    expect(productSrc).toContain("changeType === 'metrics_updated'");
    expect(productSrc).toContain('kcUpdateVoteScoreInDOM');
  });

  test('click de voto previne default/propagação (sem navegação acidental)', () => {
    expect(coreSrc).toContain("action === 'vote-hot'");
    expect(coreSrc).toContain('e.preventDefault()');
    expect(coreSrc).toContain('e.stopPropagation()');
    expect(coreSrc).toContain('vote(voteTrigger, voteType)');
  });
});
