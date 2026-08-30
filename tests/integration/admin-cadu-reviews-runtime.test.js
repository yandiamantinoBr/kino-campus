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
const REVIEW_KEY = 'b'.repeat(64);

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

function centralV2Item() {
  const item = centralItem();
  item.review_identity_version = 'cadu-review-identity-v2';
  item.review_key = REVIEW_KEY;
  item.occurrence_count = 4;
  item.first_seen_at = 1785100000;
  item.last_seen_at = item.created_at;
  item.metadata = {
    decision_effect: 'editorial_record_only',
    identity_scope: 'aggregate_subject',
    carry_policy: 'no_automatic_carry',
    review_cluster: {
      occurrence_count: 4,
      version_count: 1,
      item_versions: [ITEM_VERSION],
      first_seen_at: 1785100000,
      last_seen_at: item.created_at,
      run_ids: [item.run_id],
      artifacts: [item.artifact],
      provenance_truncated: false
    },
    review_links: {
      evidence_count: 2,
      item_ids: [REVIEW_ID, '123e4567-e89b-52d3-a456-426614174005'],
      origins: ['pipeline', 'feed'],
      kinds: ['pipeline_quality', 'feed_item'],
      decision_policy: 'independent_version_bound'
    }
  };
  return item;
}

function communityRelevance() {
  return {
    contract: 'cadu-community-relevance-v1',
    score: 0.84,
    tier: 'high',
    audiences: ['undergraduate_students', 'postgraduate_students', 'external_community'],
    signals: ['student_support_and_rights', 'cross_campus_collaboration'],
    recovery_actions: ['find_action_url', 'corroborate_official_source']
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function snapshotEnvelope(pending, items = [centralItem()]) {
  return {
    ok: true,
    data: {
      items,
      total: items.length,
      limit: 25,
      offset: 0,
      has_more: false,
      providers: providers().map((provider) => ({
        ...provider,
        pending: provider.id === 'pipeline' ? pending : 0,
      })),
    },
  };
}

function createPage(apiFetchResponse) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="badge-reviews"></span>
    <div id="reviews-providers"></div>
    <div id="reviews-count-status"></div>
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
     <select id="reviews-repass-filter"><option value="all">Todas</option><option value="done">Com reanálise</option><option value="pending">Sem reanálise</option></select>
     <button id="reviews-repass-run"></button>
     <div id="reviews-repass-summary"></div>
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
  test('updates the tab badge from a lightweight summary before the review tab is opened', async () => {
    const summaryProviders = providers().map((provider) => {
      if (provider.id === 'pipeline') return { ...provider, pending: 128 };
      if (provider.id === 'feed') return { ...provider, pending: 19 };
      return provider;
    });
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: { providers: summaryProviders }
    }));
    const page = createPage(apiFetchResponse);

    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('—');
    const listBeforeSummary = page.window.document.getElementById('reviews-list').textContent;
    await page.window.KCCaduReviews.refreshSummary();

    expect(apiFetchResponse).toHaveBeenCalledWith(
      '/api/cadu/reviews?state=pending&limit=1&offset=0',
      { timeoutMs: 25000, signal: expect.anything() }
    );
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('147');
    expect(page.window.document.getElementById('badge-reviews').title)
      .toBe('147 itens de revisão pendentes; não é uma fila de publicação.');
    expect(page.window.document.getElementById('badge-reviews').getAttribute('aria-label'))
      .toBe('147 itens de revisão pendentes; não é uma fila de publicação.');
    expect(page.window.document.querySelector('[data-review-provider="pipeline"]').textContent).toContain('128 pendentes');
    expect(page.window.document.getElementById('reviews-list').textContent).toBe(listBeforeSummary);
    page.dom.window.close();
  });

  test('does not report zero before a successful complete snapshot, then confirms a real zero', async () => {
    const failed = deferred();
    const apiFetchResponse = jest.fn()
      .mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce(snapshotEnvelope(0, []));
    const page = createPage(apiFetchResponse);
    const badge = page.window.document.getElementById('badge-reviews');
    expect(badge.dataset.snapshotState).toBe('unknown');
    expect(page.window.document.querySelector('[data-review-provider="pipeline"]').textContent).toContain('— pendentes');

    const request = page.window.KCCaduReviews.refreshSummary();
    expect(badge.textContent).toBe('…');
    expect(badge.dataset.snapshotState).toBe('loading');
    expect(badge.getAttribute('aria-busy')).toBe('true');
    failed.resolve({ ok: false, status: 504, data: { error: 'cadu_api_timeout' } });
    await request;
    expect(badge.textContent).toBe('—');
    expect(badge.dataset.snapshotState).toBe('unknown');
    expect(badge.getAttribute('aria-busy')).toBe('false');
    expect(page.window.document.getElementById('reviews-count-status').textContent).toContain('Tempo limite');

    await page.window.KCCaduReviews.refreshSummary();
    expect(badge.textContent).toBe('0');
    expect(badge.dataset.snapshotState).toBe('fresh');
    expect(badge.classList.contains('is-warning')).toBe(false);
    expect(page.window.document.getElementById('reviews-count-status').classList.contains('is-error')).toBe(false);
    page.dom.window.close();
  });

  test('retains the last confirmed count as stale after failure and recovers without a cached rejection', async () => {
    const failed = deferred();
    const apiFetchResponse = jest.fn()
      .mockResolvedValueOnce(snapshotEnvelope(312))
      .mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce(snapshotEnvelope(0, []));
    const page = createPage(apiFetchResponse);
    const badge = page.window.document.getElementById('badge-reviews');
    await page.window.KCCaduReviews.refresh();
    const retry = page.window.KCCaduReviews.refreshSummary();
    expect(badge.textContent).toBe('312…');
    failed.reject(new Error('fixture_transport_unavailable'));
    await retry;
    expect(badge.textContent).toBe('312*');
    expect(badge.dataset.snapshotState).toBe('stale');
    expect(badge.title).toContain('Contagem desatualizada');
    expect(page.window.document.querySelector('[data-review-provider="pipeline"]').textContent).toContain('312 pendentes');
    await page.window.KCCaduReviews.refresh();
    expect(badge.textContent).toBe('0');
    expect(badge.dataset.snapshotState).toBe('fresh');
    expect(apiFetchResponse).toHaveBeenCalledTimes(3);
    page.dom.window.close();
  });

  test.each([
    ['absent', undefined],
    ['empty', []],
    ['partial', providers().slice(0, 1)],
    ['duplicate', providers().map((provider) => ({ ...provider, id: 'pipeline' }))],
    ['invalid', providers().map((provider) => ({ ...provider, pending: '0' }))],
  ])('does not turn %s provider counts into a confirmed zero', async (_name, counts) => {
    const page = createPage(jest.fn(async () => ({ ok: true, data: { providers: counts } })));
    await page.window.KCCaduReviews.refreshSummary();
    const badge = page.window.document.getElementById('badge-reviews');
    expect(badge.textContent).toBe('—');
    expect(badge.dataset.snapshotState).toBe('unknown');
    page.dom.window.close();
  });

  test.each([
    ['refresh', 'refreshSummary', 'older-first'],
    ['refresh', 'refreshSummary', 'newer-first'],
    ['refreshSummary', 'refresh', 'older-first'],
    ['refreshSummary', 'refresh', 'newer-first'],
  ])('shares count generation across %s -> %s (%s)', async (first, second, order) => {
    const older = deferred();
    const newer = deferred();
    const apiFetchResponse = jest.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const page = createPage(apiFetchResponse);
    const reviews = page.window.KCCaduReviews;
    const badge = page.window.document.getElementById('badge-reviews');
    const oldRequest = reviews[first]();
    const newRequest = reviews[second]();
    expect(apiFetchResponse).toHaveBeenCalledTimes(2);
    if (order === 'older-first') {
      older.resolve(snapshotEnvelope(100));
      await oldRequest;
      expect(badge.dataset.snapshotState).toBe('loading');
      expect(badge.textContent).toBe('…');
      newer.resolve(snapshotEnvelope(312));
      await newRequest;
    } else {
      newer.resolve(snapshotEnvelope(312));
      await newRequest;
      expect(badge.textContent).toBe('312');
      older.resolve(snapshotEnvelope(100));
      await oldRequest;
    }
    expect(badge.textContent).toBe('312');
    expect(badge.dataset.snapshotState).toBe('fresh');
    expect(page.window.document.getElementById('reviews-count-status').textContent).toContain('312');
    page.dom.window.close();
  });

  test.each(['refresh', 'refreshSummary'])('coalesces concurrent identical %s reads, but not settled results', async (method) => {
    const pending = deferred();
    const apiFetchResponse = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(snapshotEnvelope(0, []));
    const page = createPage(apiFetchResponse);
    const first = page.window.KCCaduReviews[method]();
    const second = page.window.KCCaduReviews[method]();
    expect(second).toBe(first);
    expect(apiFetchResponse).toHaveBeenCalledTimes(1);
    expect(apiFetchResponse.mock.calls[0][1].signal.aborted).toBe(false);
    pending.resolve(snapshotEnvelope(312));
    await Promise.all([first, second]);
    await page.window.KCCaduReviews[method]();
    expect(apiFetchResponse).toHaveBeenCalledTimes(2);
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('0');
    page.dom.window.close();
  });

  test('coalescing an older list does not promote it over a newer summary', async () => {
    const older = deferred();
    const newer = deferred();
    const apiFetchResponse = jest.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const page = createPage(apiFetchResponse);
    const oldRequest = page.window.KCCaduReviews.refresh();
    const newRequest = page.window.KCCaduReviews.refreshSummary();
    const shared = page.window.KCCaduReviews.refresh();
    expect(shared).toBe(oldRequest);
    newer.resolve(snapshotEnvelope(312));
    await newRequest;
    older.resolve(snapshotEnvelope(100));
    await shared;
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('312');
    expect(apiFetchResponse).toHaveBeenCalledTimes(2);
    page.dom.window.close();
  });

  test.each(['older-first', 'newer-first'])('supersedes a changed list query without stale rows or count rollback (%s)', async (order) => {
    const older = deferred();
    const newer = deferred();
    const apiFetchResponse = jest.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const page = createPage(apiFetchResponse);
    const oldRequest = page.window.KCCaduReviews.refresh();
    page.window.KCCaduReviews.open('feed', 'pending');
    const newRequest = page.window.KCCaduReviews.refresh();
    expect(apiFetchResponse).toHaveBeenCalledTimes(2);
    expect(apiFetchResponse.mock.calls[0][1].signal.aborted).toBe(true);
    const newItem = { ...centralItem(), origin: 'feed', title: 'Recorte atual' };
    if (order === 'older-first') {
      older.resolve(snapshotEnvelope(100, [{ ...centralItem(), title: 'Recorte antigo' }]));
      await oldRequest;
      expect(page.window.KCCaduReviews.refresh()).toBe(newRequest);
      newer.resolve(snapshotEnvelope(312, [newItem]));
      await newRequest;
    } else {
      newer.resolve(snapshotEnvelope(312, [newItem]));
      await newRequest;
      older.resolve(snapshotEnvelope(100, [{ ...centralItem(), title: 'Recorte antigo' }]));
      await oldRequest;
    }
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('312');
    expect(page.window.document.getElementById('reviews-list').textContent).toContain('Recorte atual');
    expect(page.window.document.getElementById('reviews-list').textContent).not.toContain('Recorte antigo');
    page.dom.window.close();
  });

  test.each([true, false])('obsolete results cannot hide a newer failure or introduce an old failure (newerOk=%s)', async (newerOk) => {
    const older = deferred();
    const newer = deferred();
    const page = createPage(jest.fn()
      .mockResolvedValueOnce(snapshotEnvelope(250))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise));
    await page.window.KCCaduReviews.refreshSummary();
    const oldRequest = page.window.KCCaduReviews.refresh();
    const newRequest = page.window.KCCaduReviews.refreshSummary();
    newer.resolve(newerOk ? snapshotEnvelope(312) : { ok: false, status: 502 });
    await newRequest;
    older.resolve(newerOk ? { ok: false, status: 502 } : snapshotEnvelope(100));
    await oldRequest;
    const badge = page.window.document.getElementById('badge-reviews');
    expect(badge.textContent).toBe(newerOk ? '312' : '250*');
    expect(badge.dataset.snapshotState).toBe(newerOk ? 'fresh' : 'stale');
    page.dom.window.close();
  });

  test('keeps the institutional count separate and ignores invalid values rather than inventing zero', async () => {
    const page = createPage(jest.fn().mockResolvedValue(snapshotEnvelope(0, [])));
    page.window.KCCaduReviews.setInstitutionalPending(3);
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('—');
    await page.window.KCCaduReviews.refreshSummary();
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('3');
    page.window.KCCaduReviews.setInstitutionalPending(null);
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('3');
    page.window.KCCaduReviews.setInstitutionalPending(0);
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('0');
    page.dom.window.close();
  });

  test.each([
    ['pipeline_quality', 'Qualidade da Pipeline · decisão editorial', 'Qualidade da Pipeline — decisão editorial; não publica automaticamente.'],
    ['pipeline_incident', 'Incidente da Pipeline · acompanhamento', 'Incidente da Pipeline — acompanhamento operacional; não é publicação pendente.'],
    ['feed_item', 'Evidência do Feed · não publica', 'Evidência do Feed — não é publicação pendente.']
  ])('labels %s without presenting it as a publication queue', async (kind, label, title) => {
    const item = { ...centralItem(), kind };
    const page = createPage(jest.fn(async () => ({
      ok: true,
      data: {
        items: [item],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    })));

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('.kc-cadu-review-item__kind'));
    const kindBadge = page.window.document.querySelector('.kc-cadu-review-item__kind');
    expect(kindBadge.textContent).toBe(label);
    expect(kindBadge.title).toBe(title);
    page.dom.window.close();
  });

  test('translates incident diagnostics and makes run/chat shortcuts explicit', async () => {
    const incident = {
      ...centralItem(),
      kind: 'pipeline_incident',
      title: 'Falha: Deduplicação visual e textual',
      summary: 'A etapa obrigatória falhou.',
      issues: ['dedup_preview_state_changed', '1_of_9_items_failed'],
      allowed_decisions: ['acknowledged', 'deferred']
    };
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: {
        items: [incident],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    }));
    const page = createPage(apiFetchResponse);
    const runCard = page.window.document.createElement('div');
    runCard.dataset.runId = incident.run_id;
    runCard.className = 'kc-pipeline-history-item';
    page.window.document.body.appendChild(runCard);

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('[data-review-run]'));
    const listText = page.window.document.getElementById('reviews-list').textContent;
    expect(listText).toContain('A plataforma mudou depois da simulação');
    expect(listText).toContain('Falha em 1 de 9 itens');

    page.window.document.querySelector('[data-review-run]').click();
    await waitFor(() => runCard.classList.contains('is-review-target'));
    expect(runCard.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    });

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('[data-review-chat]'));
    page.window.document.querySelector('[data-review-chat]').click();
    const chatInput = page.window.document.getElementById('openclaw-chat-input');
    expect(chatInput.value).toContain('Falha: Deduplicação visual e textual');
    expect(page.switchTab).toHaveBeenCalledWith('openclaw');
    page.dom.window.close();
  });

  test('surfaces v2 grouped provenance and linked evidence without exposing identity digests', async () => {
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: {
        schema_version: 2,
        contract_version: 'cadu-review-center-v2',
        items: [centralV2Item()],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    }));
    const page = createPage(apiFetchResponse);

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('.kc-cadu-review-item__provenance'));
    const provenance = page.window.document.querySelector('.kc-cadu-review-item__provenance');
    expect(provenance.textContent).toContain('Assunto em fonte agregadora');
    expect(provenance.textContent).toContain('sem reaproveitamento automático');
    expect(provenance.textContent).toContain('4 ocorrências agrupadas');
    expect(provenance.textContent).toContain('2 evidências relacionadas em Pipeline e Feed Coletado');
    expect(provenance.textContent).toContain('decisões independentes por versão');
    expect(page.window.document.getElementById('reviews-list').textContent).not.toContain(REVIEW_KEY);
    page.dom.window.close();
  });

  test('renders bounded community relevance as accessible editorial context without internal fields', async () => {
    const item = centralV2Item();
    item.metadata.score = 0.72;
    item.metadata.community_relevance = communityRelevance();
    item.metadata.source_revision = 'c'.repeat(64);
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: {
        schema_version: 2,
        contract_version: 'cadu-review-center-v2',
        items: [item],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    }));
    const page = createPage(apiFetchResponse);

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('.kc-cadu-review-community'));
    const panel = page.window.document.querySelector('.kc-cadu-review-community');
    const tier = panel.querySelector('.kc-cadu-review-community__tier');
    const curatorScore = page.window.document.querySelector('.kc-cadu-review-score.is-base');
    expect(panel.getAttribute('aria-label')).toBe('Relevância para a comunidade');
    expect(tier.hasAttribute('aria-label')).toBe(false);
    expect(tier.querySelector('.kc-sr-only').textContent).toBe('Relevância alta, pontuação 84 de 100');
    expect(curatorScore.textContent).toBe('Curador 72/100');
    expect(curatorScore.getAttribute('aria-label')).toBe('Nota original do Curador: 72 de 100. Nota não é aprovação.');
    expect(panel.querySelectorAll('ul')).toHaveLength(3);
    expect(panel.textContent).toContain('Estudantes de graduação');
    expect(panel.textContent).toContain('Estudantes de pós-graduação');
    expect(panel.textContent).toContain('Comunidade externa');
    expect(panel.textContent).toContain('Assistência, acolhimento e direitos');
    expect(panel.textContent).toContain('Cross campus collaboration');
    expect(panel.textContent).toContain('Localizar o link oficial de inscrição ou ação');
    expect(panel.textContent).toContain('Corroborar as informações em outra fonte oficial');
    const listText = page.window.document.getElementById('reviews-list').textContent;
    expect(listText).not.toContain('cadu-community-relevance-v1');
    expect(listText).not.toContain(REVIEW_KEY);
    expect(listText).not.toContain('c'.repeat(64));
    page.dom.window.close();
  });

  test.each(['reject', 'publish_ready'])('keeps community value distinct from curatorial reassessment without inventing approval (%s)', async (hint) => {
    const item = centralV2Item();
    item.metadata.score = 0.50;
    item.metadata.community_relevance = { ...communityRelevance(), score: 0.86 };
    item.allowed_decisions = [];
    item.repass = {
      score: 0.15,
      previous_score: 0.50,
      delta: -0.35,
      decision_hint: hint,
      reasons: ['Prazo e ação ainda não confirmados.'],
      created_at: 1785300000,
    };
    const page = createPage(jest.fn().mockResolvedValue(snapshotEnvelope(1, [item])));
    await page.window.KCCaduReviews.refresh();
    const score = page.window.document.querySelector('.kc-cadu-review-score');
    expect(score.textContent).toBe('Reanálise 15/100 ▼ 35 p.');
    expect(score.getAttribute('aria-label')).toContain('nota curatorial anterior: 50/100');
    expect(score.getAttribute('aria-label')).not.toContain('86');
    expect(score.title).toContain('Nota não é aprovação');
    expect(page.window.document.querySelector('.kc-cadu-review-community__tier').textContent).toContain('86/100');
    expect(page.window.document.querySelector('.kc-cadu-review-community').textContent).toContain('não confirma prazo, ação nem autorização');
    expect(page.window.document.querySelector('[data-review-decision="approved"]')).toBeNull();
    page.dom.window.close();
  });

  test('displays a real zero reanalysis score without inventing a missing previous score', async () => {
    const item = centralItem();
    item.repass = { score: 0, previous_score: null, delta: null, decision_hint: 'reject', reasons: [], created_at: 1785300000 };
    const page = createPage(jest.fn().mockResolvedValue(snapshotEnvelope(1, [item])));
    await page.window.KCCaduReviews.refresh();
    const score = page.window.document.querySelector('.kc-cadu-review-score');
    expect(score.textContent).toBe('Reanálise 0/100');
    expect(score.title).toContain('nota curatorial anterior não informada');
    page.dom.window.close();
  });

  test('renders unknown inherited-property identifiers as inert fallback text', async () => {
    const item = centralV2Item();
    item.metadata.community_relevance = {
      ...communityRelevance(),
      audiences: ['constructor'],
      signals: ['future_signal'],
      recovery_actions: ['future_action']
    };
    const page = createPage(jest.fn(async () => ({
      ok: true,
      data: {
        schema_version: 2,
        contract_version: 'cadu-review-center-v2',
        items: [item],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    })));

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('.kc-cadu-review-community'));
    const panelText = page.window.document.querySelector('.kc-cadu-review-community').textContent;
    expect(panelText).toContain('Constructor');
    expect(panelText).toContain('Future signal');
    expect(panelText).toContain('Future action');
    expect(panelText).not.toContain('[native code]');
    expect(panelText).not.toContain('function Object');
    page.dom.window.close();
  });

  test('suppresses malformed community relevance when the controller is invoked without the proxy', async () => {
    const item = centralItem();
    item.metadata.community_relevance = {
      ...communityRelevance(),
      score: '0.84',
      debug_hash: 'd'.repeat(64),
      audiences: ['undergraduate_students<script>']
    };
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: {
        items: [item],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    }));
    const page = createPage(apiFetchResponse);

    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('[data-review-item]'));
    expect(page.window.document.querySelector('.kc-cadu-review-community')).toBeNull();
    expect(page.window.document.getElementById('reviews-list').textContent).not.toContain('debug_hash');
    expect(page.window.document.querySelector('script')).toBeNull();
    page.dom.window.close();
  });

  test('renders a strict email action without opening an unsafe browsing context', async () => {
    const item = centralItem();
    item.action_url = 'mailto:bolsas@ufg.br';
    const page = createPage(jest.fn(async () => ({
      ok: true,
      data: {
        items: [item],
        total: 1,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    })));
    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('a[href="mailto:bolsas@ufg.br"]'));
    const action = page.window.document.querySelector('a[href="mailto:bolsas@ufg.br"]');
    expect(action.textContent).toContain('Abrir ação');
    expect(action.hasAttribute('target')).toBe(false);
    expect(action.hasAttribute('rel')).toBe(false);
    page.dom.window.close();
  });

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

  test('invalidates an open decision when a refresh returns a different evidence version', async () => {
    const original = centralItem();
    const refreshed = centralItem();
    refreshed.item_version = 'c'.repeat(64);
    refreshed.title = 'Evento atualizado na fonte oficial';
    let listCalls = 0;
    const apiFetchResponse = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') {
        return { ok: true, data: { published: false } };
      }
      listCalls += 1;
      return {
        ok: true,
        data: {
          items: [listCalls === 1 ? original : refreshed],
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
    await waitFor(() => page.window.document.querySelector('[data-review-decision="approved"]'));

    page.window.document.querySelector('[data-review-decision="approved"]').click();
    expect(page.window.document.querySelector('[data-review-resolution]')).not.toBeNull();
    await page.window.KCCaduReviews.refresh();

    expect(page.window.document.querySelector('[data-review-resolution]')).toBeNull();
    expect(page.window.document.getElementById('reviews-status').textContent)
      .toContain('nenhuma decisão foi enviada');
    expect(apiFetchResponse.mock.calls.filter(([, options = {}]) => options.method === 'POST')).toHaveLength(0);
    page.dom.window.close();
  });

  test('applies the reanalysis filter immediately and explains pending items without a permitted decision', async () => {
    const withoutRepass = centralItem();
    withoutRepass.title = 'Item sem reanálise';
    withoutRepass.allowed_decisions = [];
    const withRepass = centralItem();
    withRepass.id = '123e4567-e89b-52d3-a456-426614174006';
    withRepass.title = 'Item com reanálise';
    withRepass.repass = {
      score: 0.84,
      delta: null,
      decision_hint: 'review',
      reasons: [],
      created_at: 1785300000
    };
    const apiFetchResponse = jest.fn(async () => ({
      ok: true,
      data: {
        items: [withoutRepass, withRepass],
        total: 2,
        limit: 25,
        offset: 0,
        has_more: false,
        providers: providers()
      }
    }));
    const page = createPage(apiFetchResponse);
    page.window.KCCaduReviews.open('pipeline', 'pending');
    await waitFor(() => page.window.document.querySelector('[data-review-item]'));
    expect(page.window.document.getElementById('reviews-list').textContent)
      .toContain('ainda não aceita uma decisão editorial');

    const filter = page.window.document.getElementById('reviews-repass-filter');
    filter.value = 'done';
    filter.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await waitFor(() => {
      const text = page.window.document.getElementById('reviews-list').textContent;
      return text.includes('Item com reanálise') && !text.includes('Item sem reanálise');
    });

    const listText = page.window.document.getElementById('reviews-list').textContent;
    expect(listText).toContain('Item com reanálise');
    expect(listText).not.toContain('Item sem reanálise');
    page.dom.window.close();
  });

  test('recovers controls after an exceptional resolution transport failure', async () => {
    const apiFetchResponse = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') throw new Error('transport_unavailable');
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
    await waitFor(() => page.window.document.querySelector('[data-review-decision="approved"]'));

    page.window.document.querySelector('[data-review-decision="approved"]').click();
    const form = page.window.document.querySelector('[data-review-resolution]');
    form.dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => page.window.document.getElementById('reviews-status').textContent.includes('não confirmou'));

    const approved = page.window.document.querySelector('[data-review-decision="approved"]');
    expect(approved.disabled).toBe(false);
    expect(page.window.document.querySelector('[data-review-resolution]')).toBeNull();
    const posts = apiFetchResponse.mock.calls.filter(([, options = {}]) => options.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].timeoutMs).toBe(25000);
    page.dom.window.close();
  });

  test('forces a post-decision snapshot rather than reusing a read that started before the write finished', async () => {
    const write = deferred();
    const beforeWrite = deferred();
    const afterWrite = deferred();
    let gets = 0;
    const apiFetchResponse = jest.fn((url, options = {}) => {
      if (options.method === 'POST') return write.promise;
      gets += 1;
      if (gets === 1) return Promise.resolve(snapshotEnvelope(1));
      return gets === 2 ? beforeWrite.promise : afterWrite.promise;
    });
    const page = createPage(apiFetchResponse);
    await page.window.KCCaduReviews.refresh();
    page.window.document.querySelector('[data-review-decision="approved"]').click();
    page.window.document.querySelector('[data-review-resolution]').dispatchEvent(
      new page.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const obsolete = page.window.KCCaduReviews.refresh();
    write.resolve({ ok: true, data: { published: false } });
    await waitFor(() => gets === 3);
    const oldGet = apiFetchResponse.mock.calls.filter(([, options = {}]) => options.method !== 'POST')[1];
    expect(oldGet[1].signal.aborted).toBe(true);
    afterWrite.resolve(snapshotEnvelope(0, []));
    await waitFor(() => page.window.document.getElementById('badge-reviews').textContent === '0');
    beforeWrite.resolve(snapshotEnvelope(1));
    await obsolete;
    expect(page.window.document.getElementById('badge-reviews').textContent).toBe('0');
    expect(page.window.document.querySelector('[data-review-decision="approved"]')).toBeNull();
    const posts = apiFetchResponse.mock.calls.filter(([, options = {}]) => options.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toMatchObject({ expected_item_version: ITEM_VERSION, decision: 'approved' });
    page.dom.window.close();
  });

  test('does not retry a timed-out repass POST and uses its own route budget', async () => {
    const pending = deferred();
    const apiFetchResponse = jest.fn().mockReturnValue(pending.promise);
    const page = createPage(apiFetchResponse);
    const button = page.window.document.getElementById('reviews-repass-run');
    button.click();
    button.click();
    expect(apiFetchResponse).toHaveBeenCalledTimes(1);
    expect(apiFetchResponse.mock.calls[0]).toEqual([
      '/api/cadu/reviews/repass',
      expect.objectContaining({ method: 'POST', timeoutMs: 435000 }),
    ]);
    pending.resolve({ ok: false, status: 504, data: { error: 'cadu_api_timeout' } });
    await waitFor(() => !button.disabled);
    expect(apiFetchResponse).toHaveBeenCalledTimes(1);
    expect(page.window.document.getElementById('reviews-status').textContent).toContain('nenhuma operação foi repetida automaticamente');
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
              resolved_at: 1785200000,
              review_identity_version: 'legacy-v1',
              review_key: null
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
    expect(page.window.document.getElementById('reviews-audit-list').textContent)
      .toContain('Identidade legada: somente auditoria, sem reaproveitamento automático.');

    page.window.document.querySelector('[data-review-provider="sites"]').click();
    await waitFor(() => page.window.document.getElementById('reviews-audit-list').textContent.includes('Portal UFG'));
    const auditText = page.window.document.getElementById('reviews-audit-list').textContent;
    expect(auditText).toContain('Fonte oficial conferida.');
    expect(auditText).not.toContain('Decisão central antiga');
    expect(apiFetchResponse.mock.calls.filter(([url]) => url.startsWith('/api/cadu/source-reviews?'))).toHaveLength(3);
    page.dom.window.close();
  });
});
