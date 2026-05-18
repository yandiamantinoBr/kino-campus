'use strict';

const { analyzeTemporalRelevance, classifyItem } = require('../../services/cadu-ufg-publisher/src/classifier');
const { cleanTitle, extractFirstImageUrl, normalizeWebyItem } = require('../../services/cadu-ufg-publisher/src/extractors');
const { HttpClient } = require('../../services/cadu-ufg-publisher/src/http-client');
const { mapToKinoPayload, toPostgrestInsert } = require('../../services/cadu-ufg-publisher/src/mapper');
const { splitMessage } = require('../../services/cadu-ufg-publisher/src/notifier');
const { collectReviews, formatReviews, resolveReviewKey } = require('../../services/cadu-ufg-publisher/src/reviews');
const { isAllowedByRobots, parseRobotsTxt } = require('../../services/cadu-ufg-publisher/src/robots');
const { StateStore } = require('../../services/cadu-ufg-publisher/src/state');
const { normalizeWhitespace } = require('../../services/cadu-ufg-publisher/src/utils');
const { parseFeed, parseSitemap } = require('../../services/cadu-ufg-publisher/src/xml');

describe('cadu-ufg-publisher', () => {
  test('extractor strips UFG site suffix from titles', () => {
    expect(cleanTitle('PRPI UFG divulga quatro editais abertos da Fapeg | UFG - Universidade Federal de Goiás'))
      .toBe('PRPI UFG divulga quatro editais abertos da Fapeg');
  });

  test('normalizeWhitespace preserves Portuguese accents while normalizing width and spacing', () => {
    expect(normalizeWhitespace('  Iniciação   científica para estudantes da UFG  ')).toBe('Iniciação científica para estudantes da UFG');
    expect(normalizeWhitespace('edital： pesquisa')).toBe('edital: pesquisa');
  });

  test('extractor keeps absolute image URLs and resolves relative images', () => {
    expect(extractFirstImageUrl('<img src="https://files.cercomp.ufg.br/cover.jpg">', 'https://ufg.br/n/1'))
      .toBe('https://files.cercomp.ufg.br/cover.jpg');
    expect(extractFirstImageUrl('<img src="/media/cover.jpg">', 'https://prograd.ufg.br/n/1'))
      .toBe('https://prograd.ufg.br/media/cover.jpg');

    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 1,
      title: 'Edital',
      image: 'https://files.cercomp.ufg.br/img.png',
      text: 'Inscricoes abertas',
    });
    expect(item.imageUrl).toBe('https://files.cercomp.ufg.br/img.png');
  });

  test('parseSitemap extracts loc and lastmod', () => {
    const parsed = parseSitemap(`
      <urlset>
        <url><loc>https://ufg.br/n/1-edital</loc><lastmod>2026-05-17</lastmod></url>
      </urlset>
    `);
    expect(parsed.urls).toEqual([
      expect.objectContaining({ loc: 'https://ufg.br/n/1-edital', lastmod: '2026-05-17' }),
    ]);
  });

  test('parseFeed extracts RSS items', () => {
    const parsed = parseFeed(`
      <rss><channel><item><title>Edital aberto</title><link>https://ufg.br/n/1</link><description>Inscricoes abertas</description></item></channel></rss>
    `);
    expect(parsed[0]).toEqual(expect.objectContaining({ title: 'Edital aberto', url: 'https://ufg.br/n/1' }));
  });

  test('robots longest rule allows specific path', () => {
    const robots = parseRobotsTxt(`
      User-agent: *
      Disallow: /admin
      Disallow: /noticias
      Allow: /noticias/publicas
    `);
    expect(isAllowedByRobots('https://ufg.br/admin', robots)).toBe(false);
    expect(isAllowedByRobots('https://ufg.br/noticias/publicas/1', robots)).toBe(true);
  });

  test('classifier promotes actionable edital to publish or review', () => {
    const item = {
      title: 'Edital de selecao para monitoria com inscricoes abertas',
      summary: 'Prazo ate 20/05/2026. Vagas para estudantes da UFG.',
      text: 'Processo seletivo com bolsa e edital em PDF.',
      pdfLinks: ['https://ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 });
    expect(['publish', 'review']).toContain(result.decision);
    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('monitoria');
  });

  test('classifier maps research and PRPI/Fapeg calls to pesquisa', () => {
    const item = {
      title: 'PRPI divulga editais Fapeg para pesquisa',
      summary: 'Chamadas de iniciacao cientifica com inscricoes ate 29/05/2026.',
      text: 'Editais PIBIC, PIVIC e mobilidade internacional para pesquisadores da UFG.',
      updatedAt: '2026-05-18',
      pdfLinks: ['https://prpi.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('pesquisa');
    expect(['publish', 'review']).toContain(result.decision);
  });

  test('classifier discards expired signup windows', () => {
    const item = {
      title: 'Quer trabalhar com redes sociais na UFG?',
      summary: 'Inscricoes de 04 a 11 de maio para estudantes da UFG.',
      text: 'Processo seletivo com bolsa para redes sociais.',
      updatedAt: '2026-05-04',
      pdfLinks: [],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });

    expect(result.temporal.expired).toBe(true);
    expect(result.temporal.deadlineDate).toBe('2026-05-11');
    expect(result.decision).toBe('discard');
  });

  test('temporal analysis keeps future deadlines eligible', () => {
    const item = {
      title: 'Edital de monitoria para estudantes da UFG',
      summary: 'Inscricoes ate 20/05/2026.',
      text: 'Processo seletivo com bolsa.',
      updatedAt: '2026-05-17',
    };
    const temporal = analyzeTemporalRelevance(item, { now: '2026-05-17T12:00:00-03:00' });
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });

    expect(temporal.expired).toBe(false);
    expect(temporal.deadlineDate).toBe('2026-05-20');
    expect(['publish', 'review']).toContain(result.decision);
  });

  test('mapper keeps Kino modal fields and one official link', () => {
    const item = {
      id: 'ufg:1',
      sourceName: 'PROGRAD',
      sourceUrl: 'https://prograd.ufg.br/n/1',
      title: 'Edital de monitoria para estudantes da UFG',
      summary: 'Inscricoes abertas para monitoria.',
      text: 'Contato: monitoria@ufg.br. Local: Campus Samambaia. Prazo ate 20/05/2026.',
      updatedAt: '2026-05-17',
      pdfLinks: ['https://prograd.ufg.br/edital.pdf'],
      imageUrl: 'https://prograd.ufg.br/assets/cover.jpg',
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-17T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.modulo).toBe('oportunidades');
    expect(payload.titulo.length).toBeLessThanOrEqual(80);
    expect(payload.descricao.length).toBeLessThanOrEqual(2000);
    expect(payload.descricao).toContain('**📌 Resumo**');
    expect(payload.descricao).toContain('[pagina oficial da UFG]');
    expect(payload.imagens).toEqual(['https://prograd.ufg.br/assets/cover.jpg']);
    expect(payload.metadata.source_url).toBe(item.sourceUrl);
    expect(payload.metadata.link_as_cta).toBe(true);
    expect(payload.metadata.deadline_date).toBe('2026-05-20');

    const row = toPostgrestInsert(payload, 'user-1');
    expect(row.author_id).toBe('user-1');
    expect(row.module).toBe('oportunidades');
    expect(row.metadata.source_url).toBe(item.sourceUrl);
  });

  test('reviews helper lists review decisions only', () => {
    const items = collectReviews({
      seen: {
        a: { decision: 'discard', title: 'Nao entra' },
        b: { decision: 'review', title: 'Edital para revisar', sourceUrl: 'https://ufg.br/n/2', updatedAt: '2026-05-17T10:00:00Z' },
        c: { decision: 'review:publish-failed', title: 'Falha de publish', sourceUrl: 'https://ufg.br/n/3', updatedAt: '2026-05-17T11:00:00Z' },
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Falha de publish');
    expect(formatReviews(items)).toContain('Edital para revisar');
    expect(resolveReviewKey({ seen: { abcdef1234567890: { decision: 'review' } } }, 'abcdef123456')).toBe('abcdef1234567890');
  });

  test('mapper adds schedule and multiple official PDF labels to markdown preview', () => {
    const item = {
      id: 'prpi:1',
      sourceName: 'PRPI',
      sourceUrl: 'https://prpi.ufg.br/n/1',
      title: 'PRPI divulga editais Fapeg para pesquisa',
      summary: 'Editais para pesquisa com cronograma detalhado.',
      text: 'Inscricoes ate 18/05/2026. Resultado preliminar em 26/05/2026. Resultado final em 29/05/2026.',
      updatedAt: '2026-05-18',
      pdfLinks: [
        'https://prpi.ufg.br/files/Edital-PIBIC.pdf',
        'https://prpi.ufg.br/files/Edital-PIVIC.pdf',
        'https://prpi.ufg.br/files/Edital-Mobilidade.pdf',
      ],
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.categoriaKey).toBe('pesquisa');
    expect(payload.descricao).toContain('Cronograma detectado');
    expect(payload.descricao).toContain('Resultado final em 29/05/2026');
    expect(payload.descricao).toContain('3 PDFs oficiais');
    expect(payload.metadata.edital_pdf_urls).toHaveLength(3);
  });

  test('telegram notifier chunks long review messages', () => {
    const chunks = splitMessage(['a'.repeat(2000), 'b'.repeat(2000), 'c'.repeat(2000)].join('\n\n'), 3900);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(3900));
  });

  test('http client retries through configured proxy on network failure', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      if (calls.length === 1) throw new TypeError('fetch failed');
      return { ok: true, status: 200, text: async () => 'ok' };
    });
    try {
      const client = new HttpClient({ minDelayMs: 0, fetchProxyTemplate: 'https://proxy.local/read?url={url}' });
      const response = await client.fetch('https://proex.ufg.br/robots.txt');
      expect(response.ok).toBe(true);
      expect(calls[1]).toBe('https://proxy.local/read?url=https%3A%2F%2Fproex.ufg.br%2Frobots.txt');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('state ignores dry-run publish markers for real publishes', () => {
    const state = new StateStore('unused');
    state.mark('dry', { decision: 'dry-run-publish' });
    state.mark('published', { decision: 'published' });

    expect(state.has('dry')).toBe(false);
    expect(state.has('published')).toBe(true);
  });
});
