'use strict';

const { analyzeTemporalRelevance, classifyItem } = require('../../services/cadu-ufg-publisher/src/classifier');
const { cleanTitle, extractFirstImageUrl, extractLinksFromHtml, normalizeWebyItem } = require('../../services/cadu-ufg-publisher/src/extractors');
const { HttpClient } = require('../../services/cadu-ufg-publisher/src/http-client');
const { mapToKinoPayload, toPostgrestInsert } = require('../../services/cadu-ufg-publisher/src/mapper');
const { resolveDeepSeekEndpoint, resolveDeepSeekModel } = require('../../services/cadu-ufg-publisher/src/model');
const { splitMessage } = require('../../services/cadu-ufg-publisher/src/notifier');
const { normalizeImages, SupabasePublisher } = require('../../services/cadu-ufg-publisher/src/publisher');
const { evaluatePayloadQuality } = require('../../services/cadu-ufg-publisher/src/quality');
const { collectReviews, formatReviews, resolveReviewKey } = require('../../services/cadu-ufg-publisher/src/reviews');
const { isAllowedByRobots, parseRobotsTxt } = require('../../services/cadu-ufg-publisher/src/robots');
const { discoverFromWebyJson } = require('../../services/cadu-ufg-publisher/src/runner');
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

  test('extractor normalizes Weby event JSON fields', () => {
    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 39107,
      slug: '39107-concerto-cenico-a-vida-do-heroi',
      name: 'Concerto Cenico - A Vida do Heroi',
      information: '<p>Evento cultural da UFG.</p>',
      image: 'https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg',
      begin_at: '2026-05-22T20:00:00.000-03:00',
      end_at: '2026-05-22T21:30:00.000-03:00',
      kind: 'regional',
    }, 'event');

    expect(item.type).toBe('event');
    expect(item.sourceUrl).toBe('https://ufg.br/e/39107-concerto-cenico-a-vida-do-heroi');
    expect(item.title).toBe('Concerto Cenico - A Vida do Heroi');
    expect(item.text).toContain('Evento cultural da UFG.');
    expect(item.dateBeginAt).toBe('2026-05-22T20:00:00.000-03:00');
    expect(item.dateEndAt).toBe('2026-05-22T21:30:00.000-03:00');
    expect(item.imageUrl).toBe('https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg');
  });

  test('extractor preserves individual edital links with labels', () => {
    const links = extractLinksFromHtml(`
      <a href="/files/Edital-PIBIC.pdf">Edital PIBIC</a>
      <a href="https://fapeg.go.gov.br/chamada-1">Chamada Fapeg</a>
    `, 'https://prpi.ufg.br/n/1');

    expect(links).toEqual(expect.arrayContaining([
      { url: 'https://prpi.ufg.br/files/Edital-PIBIC.pdf', label: 'Edital PIBIC' },
      { url: 'https://fapeg.go.gov.br/chamada-1', label: 'Chamada Fapeg' },
    ]));
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
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
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

  test('classifier keeps Weby events as eventos even when text mentions estagio', () => {
    const item = {
      type: 'event',
      title: 'XIX Seminario de Estagio Supervisionado',
      summary: 'Evento academico da Faculdade de Historia.',
      text: 'Seminario com inscricoes para apresentacao de trabalhos.',
      dateBeginAt: '2026-06-10T19:00:00.000-03:00',
    };
    const result = classifyItem(item, { tier: 3 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('eventos');
    expect(result.category).toBe('academicos');
  });

  test('classifier sends pos-graduacao and aluno especial opportunities to pesquisa', () => {
    const item = {
      title: 'Processo seletivo para aluno especial de mestrado',
      summary: 'Inscricoes abertas para disciplinas da pos-graduacao.',
      text: 'Edital de selecao para mestrado e doutorado com prazo ate 10/06/2026.',
      updatedAt: '2026-05-21',
      pdfLinks: ['https://ppgadm.face.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 3 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('oportunidades');
    expect(result.category).toBe('pesquisa');
  });

  test('classifier promotes Espaco das Profissoes to review instead of discard', () => {
    const item = {
      title: 'Espaco das Profissoes apresenta oportunidades para o futuro',
      summary: 'Evento segue ate 25/05/2026 com programacao para estudantes.',
      text: 'Estandes mostram cursos de graduacao e oportunidades da Universidade Federal de Goias.',
      updatedAt: '2026-05-21',
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.module).toBe('eventos');
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

  test('classifier uses Weby date_end_at as actionable deadline context', () => {
    const item = {
      title: 'Edital MARCA seleciona estudantes para mobilidade internacional',
      summary: 'Inscricoes abertas para estudantes da UFG interessados em mobilidade.',
      text: 'Processo seletivo com edital e formulario de candidatura.',
      dateBeginAt: '2026-05-10T08:00:00.000-03:00',
      dateEndAt: '2026-05-18T23:59:00.000-03:00',
      pdfLinks: ['https://sri.ufg.br/edital.pdf'],
    };
    const result = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });

    expect(result.temporal.deadlineDate).toBe('2026-05-18');
    expect(result.temporal.expired).toBe(true);
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
    expect(payload.descricao).not.toContain('Resumo');
    expect(payload.descricao).toContain('[Fonte oficial: PROGRAD/UFG]');
    expect(payload.imagens).toEqual(['https://prograd.ufg.br/assets/cover.jpg']);
    expect(payload.metadata.source_url).toBe(item.sourceUrl);
    expect(payload.metadata.cover_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(payload.metadata.link_as_cta).toBe(true);
    expect(payload.metadata.deadline_date).toBe('2026-05-20');

    const row = toPostgrestInsert(payload, 'user-1');
    expect(row.author_id).toBe('user-1');
    expect(row.module).toBe('oportunidades');
    expect(row.image_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(row.metadata.image_url).toBe('https://prograd.ufg.br/assets/cover.jpg');
    expect(row.metadata.source_url).toBe(item.sourceUrl);
  });

  test('mapper preserves Weby event begin_at as event date and time metadata', () => {
    const item = normalizeWebyItem({ id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, {
      id: 39107,
      slug: '39107-concerto-cenico-a-vida-do-heroi',
      name: 'Concerto Cenico - A Vida do Heroi',
      information: '<p>Evento cultural da UFG.</p>',
      begin_at: '2026-05-22T20:00:00.000-03:00',
      image: 'https://files.cercomp.ufg.br/weby/up/1/o/evento.jpeg',
    }, 'event');
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-21T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });

    expect(payload.modulo).toBe('eventos');
    expect(payload.metadata.data_evento).toBe('2026-05-22');
    expect(payload.metadata.hora_evento).toBe('20:00');
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
      extractedLinks: [
        { url: 'https://prpi.ufg.br/files/Edital-PIBIC.pdf', label: 'Edital PIBIC' },
        { url: 'https://prpi.ufg.br/files/Edital-PIVIC.pdf', label: 'Edital PIVIC' },
        { url: 'https://fapeg.go.gov.br/chamada-mobilidade', label: 'Chamada Mobilidade Fapeg' },
      ],
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, { runId: 'test-run' });
    expect(payload.categoriaKey).toBe('pesquisa');
    expect(payload.descricao).toContain('Datas importantes');
    expect(payload.descricao).toContain('Resultado final em 29/05/2026');
    expect(payload.descricao).toContain('[Edital PIBIC](https://prpi.ufg.br/files/Edital-PIBIC.pdf)');
    expect(payload.descricao).toContain('[Chamada Mobilidade Fapeg](https://fapeg.go.gov.br/chamada-mobilidade)');
    expect(payload.metadata.edital_pdf_urls).toHaveLength(3);
    expect(payload.metadata.official_document_urls).toContain('https://fapeg.go.gov.br/chamada-mobilidade');
  });

  test('mapper replaces generic institutional model summaries with actionable source details', () => {
    const item = {
      id: 'prpi:generic',
      sourceName: 'PRPI',
      sourceUrl: 'https://prpi.ufg.br/n/generic',
      title: 'PRPI divulga quatro editais abertos da Fapeg',
      summary: 'UFG divulga editais para pesquisa.',
      text: [
        'Edital PIBIC recebe inscricoes ate 18/05/2026.',
        'Edital PIVIC tem resultado preliminar em 26/05/2026.',
        'Edital de mobilidade internacional tem resultado final em 29/05/2026.',
      ].join('\n'),
      pdfLinks: [
        'https://prpi.ufg.br/files/Edital-PIBIC.pdf',
        'https://prpi.ufg.br/files/Edital-PIVIC.pdf',
      ],
    };
    const classification = classifyItem(item, { tier: 1 }, { now: '2026-05-18T12:00:00-03:00' });
    const payload = mapToKinoPayload(item, classification, {
      runId: 'test-run',
      summaryText: 'A UFG e uma universidade gratuita, com mais de 35 mil alunos.',
    });

    expect(payload.descricao).not.toContain('35 mil alunos');
    expect(payload.descricao).toContain('Edital PIBIC');
    expect(payload.descricao).toContain('Edital PIVIC');
  });

  test('quality guard flags generic summaries and missing multi-document context', () => {
    const item = {
      title: 'PRPI divulga quatro editais abertos da Fapeg',
      summary: '',
      text: 'Inscricoes ate 18/05/2026. Resultado em 26/05/2026.',
      sourceUrl: 'https://prpi.ufg.br/n/1',
      pdfLinks: ['https://prpi.ufg.br/a.pdf', 'https://prpi.ufg.br/b.pdf'],
    };
    const classification = {
      hasPdf: true,
      hasDeadline: true,
      module: 'oportunidades',
      category: 'pesquisa',
    };
    const payload = {
      descricao: 'A UFG e uma universidade gratuita, com mais de 35 mil alunos.',
      imagens: [],
      metadata: { source_url: item.sourceUrl },
    };

    const quality = evaluatePayloadQuality(item, classification, payload);
    expect(quality.ok).toBe(false);
    expect(quality.warnings).toEqual(expect.arrayContaining([
      'generic_summary',
      'missing_multiple_documents',
      'missing_deadline_context',
      'missing_schedule_dates',
      'missing_image_url',
    ]));
  });

  test('Weby JSON discovery paginates news and events before sorting candidates', async () => {
    const calls = [];
    const http = {
      json: jest.fn(async (url) => {
        calls.push(url);
        const parsed = new URL(url);
        const page = parsed.searchParams.get('page');
        if (url.includes('/news.json') && page === '1') {
          return {
            data: { news: [{
              id: 1,
              slug: '1-noticia-antiga',
              title: 'Noticia antiga',
              text: '<p>Edital antigo</p>',
              updated_at: '2026-05-19T10:00:00.000-03:00',
            }] },
          };
        }
        if (url.includes('/news.json') && page === '2') {
          return {
            data: { news: [{
              id: 2,
              slug: '2-noticia-recente',
              title: 'Noticia recente',
              text: '<p>Edital recente</p>',
              updated_at: '2026-05-21T10:00:00.000-03:00',
            }] },
          };
        }
        if (url.includes('/events.json') && page === '1') {
          return {
            data: { events: [{
              id: 3,
              slug: '3-evento',
              name: 'Evento UFG',
              information: '<p>Programacao aberta</p>',
              begin_at: '2026-05-22T20:00:00.000-03:00',
            }] },
          };
        }
      return { data: [] };
      }),
    };

    const items = await discoverFromWebyJson(http, { id: 'ufg', name: 'UFG', baseUrl: 'https://ufg.br' }, 1, {
      maxPages: 2,
      perPage: 1,
    });

    expect(calls).toEqual(expect.arrayContaining([
      'https://ufg.br/news.json?per_page=1&page=1&order=updated_at&direction=desc',
      'https://ufg.br/news.json?per_page=1&page=2&order=updated_at&direction=desc',
      'https://ufg.br/events.json?per_page=1&page=1&order=updated_at&direction=desc',
    ]));
    expect(items.map((item) => item.title)).toEqual([
      'Evento UFG',
      'Noticia recente',
      'Noticia antiga',
    ]);
  });

  test('DeepSeek endpoint accepts official base URL or explicit v1 base URL', () => {
    expect(resolveDeepSeekEndpoint({})).toBe('https://api.deepseek.com/chat/completions');
    expect(resolveDeepSeekEndpoint({ deepseekBaseUrl: 'https://api.deepseek.com/v1' }))
      .toBe('https://api.deepseek.com/v1/chat/completions');
    expect(resolveDeepSeekEndpoint({ deepseekEndpoint: 'https://proxy.local/chat/completions' }))
      .toBe('https://proxy.local/chat/completions');
  });

  test('DeepSeek model resolves deprecated aliases to the current flash model', () => {
    expect(resolveDeepSeekModel({})).toBe('deepseek-v4-flash');
    expect(resolveDeepSeekModel({ deepseekModel: 'deepseek-chat' })).toBe('deepseek-v4-flash');
    expect(resolveDeepSeekModel({ deepseekModel: 'deepseek-reasoner' })).toBe('deepseek-v4-flash');
    expect(resolveDeepSeekModel({ deepseekModel: 'deepseek-v4-pro' })).toBe('deepseek-v4-pro');
  });

  test('publisher uploads remote cover images to Supabase Storage before post_media', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith('https://source.local')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
      return { ok: true, status: 200, text: async () => '{"Key":"ok"}' };
    });

    try {
      const publisher = new SupabasePublisher({
        supabaseUrl: 'https://project.supabase.co',
        supabaseAnonKey: 'anon',
        kinoEmail: 'cadu@example.com',
        kinoPassword: 'secret',
        supabaseStorageBucket: 'kino-media',
        maxImageBytes: 1024,
      });
      publisher.session = { access_token: 'token', user: { id: 'user-1' } };
      const prepared = await publisher.prepareImagesForPost('post-1', ['https://source.local/cover.jpg']);

      expect(prepared.images[0]).toMatch(/^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/kino-media\/post-media\//);
      expect(prepared.uploads[0].ok).toBe(true);
      expect(calls[1].url).toContain('/storage/v1/object/kino-media/post-media/');
      expect(calls[1].options.headers['content-type']).toBe('image/jpeg');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('publisher normalizes direct and metadata cover image URLs', () => {
    expect(normalizeImages({
      imagens: ['https://source.local/cover.jpg'],
      image_url: 'https://source.local/cover.jpg',
      metadata: {
        image_url: 'https://source.local/meta.png',
        cover_url: 'javascript:alert(1)',
      },
    })).toEqual([
      'https://source.local/cover.jpg',
      'https://source.local/meta.png',
    ]);
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

  test('state aliases prevent cross-source duplicate publications', () => {
    const state = new StateStore('unused');
    state.mark('item:primary', { decision: 'review' }, ['url:portal', 'raw:weby']);

    expect(state.has('url:portal')).toBe(true);
    expect(state.hasAny(['url:unit', 'raw:weby'])).toBe(true);
    expect(Object.keys(state.data.seen)).toEqual(['item:primary']);
  });
});
