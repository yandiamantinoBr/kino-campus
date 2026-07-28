'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu-reviews.js'),
  'utf8'
);
const REVIEW_ID = '123e4567-e89b-52d3-a456-426614174000';
const ITEM_VERSION = 'a'.repeat(64);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  throw new Error(`condition_not_met_within_${timeoutMs}ms`);
}

function providers() {
  return [
    { id: 'pipeline', label: 'Pipeline', description: 'Quality gate.', queue: 'central', pending: 1, resolved: 1 },
    { id: 'feed', label: 'Feed Coletado', description: 'Curador.', queue: 'central', pending: 0, resolved: 0 },
    { id: 'sites', label: 'Mapa UFG', description: 'CAS.', queue: 'institutional', pending: 0, resolved: 1 },
    { id: 'openclaw', label: 'OpenClaw', description: 'Reservado.', queue: 'central', pending: 0, resolved: 0 }
  ];
}

function centralItem() {
  return {
    id: REVIEW_ID,
    item_version: ITEM_VERSION,
    origin: 'pipeline',
    kind: 'pipeline_quality',
    title: 'Evento em revisão',
    summary: 'Evidência editorial.',
    source_url: 'https://ufg.br/e/123',
    action_url: null,
    image_url: null,
    run_id: '123e4567-e89b-42d3-a456-426614174004',
    artifact: 'quality.json',
    created_at: 1785200000,
    issues: ['application_deadline_mismatch'],
    allowed_decisions: ['approved', 'changes_requested', 'deferred', 'rejected'],
    metadata: { decision_effect: 'editorial_record_only' },
    state: 'pending',
    resolution: null
  };
}

function createPage(apiFetchResponse) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="badge-reviews"></span>
    <div id="reviews-providers"></div>
    <form id="reviews-filters">
      <select id="reviews-origin"><option value=""></option><option value="pipeline">Pipeline</option><option value="sites">Mapa UFG</option></select>
      <select id="reviews-state"><option value="pending">Pendente</option><option value="resolved">Resolvida</option></select>
      <input id="reviews-search">
      <select id="reviews-limit"><option value="25">25</option></select>
      <button type="submit">Aplicar</button>
      <button type="button" id="reviews-clear">Limpar</button>
    </form>
    <div id="reviews-status"></div>
    <div id="reviews-list"></div>
    <span id="reviews-page-meta"></span>
    <button id="reviews-prev"></button>
    <button id="reviews-next"></button>
    <button id="reviews-refresh"></button>
    <button id="reviews-export-json"></button>
    <details id="reviews-audit">
      <button id="reviews-audit-refresh"></button>
      <div id="reviews-audit-list"></div>
    </details>
    <section id="institutional-review-queue"></section>
    <textarea id="openclaw-chat-input"></textarea>
  </body></html>`, {
    url: 'https://www.kinocampus.com.br/admin/cadu.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.Element.prototype.scrollIntoView = jest.fn();
  window.eval(SOURCE);
  const switchTab = jest.fn();
  window.KCCaduReviews.init({ apiFetchResponse, switchTab });
  return { dom, window, switchTab };
}

describe('Admin Cadu review center runtime', () => {
  test('requires a rejection note and records an editorial-only versioned decision', async () => {
    const calls = [];
    const apiFetchResponse = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          data: {
            ok: true,
            published: false,
            decision_effect: 'editorial_record_only',
            item_id: REVIEW_ID,
            item_version: ITEM_VERSION,
            decision: body.decision
          }
        };
      }
      return {
        ok: true,
        data: {
          items: [centralItem()],
          total: 1,
          limit: 25,
          offset: 0,
          has_more: false,
          providers: providers()
        }
      };
    });
    const page = createPage(apiFetchResponse);
    page.window.KCCaduReviews.open('pipeline', 'pending');
    expect(page.switchTab).toHaveBeenCalledWith('reviews', { skipOperationalRefresh: true });
    await waitFor(() => page.window.document.querySelector('[data-review-decision="rejected"]'));

    page.window.document.querySelector('[data-review-decision="rejected"]').click();
    const form = page.window.document.querySelector('[data-review-resolution]');
    form.dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(20);
    expect(calls.filter((call) => call.options.method === 'POST')).toHaveLength(0);

    const note = page.window.document.querySelector('[data-review-note]');
    note.value = 'Prazo não confirmado na fonte oficial.';
    form.dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.some((call) => call.options.method === 'POST'));
    const post = calls.find((call) => call.options.method === 'POST');
    expect(post.url).toBe(`/api/cadu/reviews/${REVIEW_ID}/resolve`);
    expect(JSON.parse(post.options.body)).toEqual({
      review_id: REVIEW_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'rejected',
      resolution_note: 'Prazo não confirmado na fonte oficial.'
    });
    await waitFor(() => page.window.document.getElementById('reviews-status').textContent
      .includes('não publicam automaticamente'));
    expect(page.window.document.getElementById('reviews-status').textContent)
      .toContain('não publicam automaticamente');
    page.dom.window.close();
  });

  test('switches an open audit from central decisions to the institutional queue', async () => {
    const apiFetchResponse = jest.fn(async (url) => {
      if (url.startsWith('/api/cadu/reviews/audit?')) {
        return {
          ok: true,
          data: {
            items: [{
              item_id: REVIEW_ID,
              item_version: ITEM_VERSION,
              origin: 'pipeline',
              decision: 'approved',
              title: 'Decisão central antiga',
              resolved_at: 1785200000
            }],
            total: 1,
            limit: 50,
            offset: 0,
            has_more: false
          }
        };
      }
      if (url.startsWith('/api/cadu/source-reviews?')) {
        const state = new URL(url, 'https://www.kinocampus.com.br').searchParams.get('state');
        const items = state === 'approved' ? [{
          id: '123e4567-e89b-42d3-a456-426614174010',
          source_id: 'web.ufg.portal',
          source_revision: 'b'.repeat(64),
          source_url: 'https://ufg.br/',
          name: 'Portal UFG',
          state: 'approved',
          resolution_note: 'Fonte oficial conferida.',
          resolved_by: '123e4567-e89b-42d3-a456-426614174002',
          resolved_at: '2026-07-28T12:00:00Z'
        }] : [];
        return { ok: true, data: { items, total: items.length, has_more: false } };
      }
      return {
        ok: true,
        data: {
          items: [],
          total: 0,
          limit: 25,
          offset: 0,
          has_more: false,
          providers: providers()
        }
      };
    });
    const page = createPage(apiFetchResponse);
    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('[data-review-provider="sites"]'));
    const audit = page.window.document.getElementById('reviews-audit');
    audit.open = true;
    audit.dispatchEvent(new page.window.Event('toggle'));
    await waitFor(() => page.window.document.getElementById('reviews-audit-list').textContent.includes('Decisão central antiga'));

    page.window.document.querySelector('[data-review-provider="sites"]').click();
    await waitFor(() => page.window.document.getElementById('reviews-audit-list').textContent.includes('Portal UFG'));
    const auditText = page.window.document.getElementById('reviews-audit-list').textContent;
    expect(auditText).toContain('Fonte oficial conferida.');
    expect(auditText).not.toContain('Decisão central antiga');
    expect(apiFetchResponse.mock.calls.filter(([url]) => url.startsWith('/api/cadu/source-reviews?'))).toHaveLength(3);
    page.dom.window.close();
  });
});
