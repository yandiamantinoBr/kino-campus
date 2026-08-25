'use strict';

const feedHandler = require('../../api/feed.js').default;
const sitemapHandler = require('../../api/sitemap.js').default;
const productHandler = require('../../api/og-product.js').default;
const { fetchPublicSupabaseJson } = require('../../api/_lib/supabase-public-request.js');
const {
  buildProductJsonLd,
  buildProductValues,
  fetchPost,
  serializeJsonForHtml,
} = require('../../api/og-product.js');
const {
  buildIndexabilityValues,
  shouldIndexPost,
} = require('../../api/_lib/product-seo-policy.js');

function createResponse() {
  return {
    body: '',
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = String(body);
      return this;
    },
  };
}

function buildPost(overrides = {}) {
  return {
    id: 'post-indexable',
    legacy_id: null,
    title: 'Publicação universitária confirmada',
    description: 'Descrição suficientemente detalhada para indexação pública e leitura pelos buscadores.',
    module: 'eventos',
    category: 'academicos',
    location: 'Campus Samambaia',
    status: 'published',
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-07-02T12:00:00.000Z',
    expires_at: null,
    image_url: null,
    metadata: {},
    post_media: [],
    ...overrides,
  };
}

function richEntity(data) {
  return data['@graph'].find((entry) => ['Article', 'Event', 'JobPosting', 'Product'].includes(entry['@type']));
}

describe('política SEO dinâmica compartilhada', () => {
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'public-anon-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    if (originalEnv.SUPABASE_ANON_KEY === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalEnv.SUPABASE_ANON_KEY;
    delete global.fetch;
  });

  test('sitemap e RSS excluem exatamente os posts que a política SSR torna noindex', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-14T12:00:00.000Z').getTime());
    const rows = [
      buildPost(),
      buildPost({
        id: 'post-expired',
        expires_at: '2026-12-31T23:59:59.000Z',
        metadata: { deadline_date: '10/07/2026' },
      }),
      buildPost({ id: 'post-short', description: 'Texto curto.' }),
      buildPost({ id: null, legacy_id: 'legacy-indexable' }),
    ];

    expect(rows.map((post) => shouldIndexPost(post, buildIndexabilityValues(post))))
      .toEqual([true, false, false, true]);

    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => rows });
    const sitemapResponse = createResponse();
    await sitemapHandler({}, sitemapResponse);

    const feedResponse = createResponse();
    await feedHandler({}, feedResponse);

    for (const response of [sitemapResponse, feedResponse]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('product.html?id=post-indexable');
      expect(response.body).toContain('product.html?id=legacy-indexable');
      expect(response.body).not.toContain('product.html?id=post-expired');
      expect(response.body).not.toContain('product.html?id=post-short');
    }

    global.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => [rows[0]] });
    const indexableSsr = createResponse();
    await productHandler({ query: { id: rows[0].id } }, indexableSsr);
    expect(indexableSsr.statusCode).toBe(200);
    expect(indexableSsr.body).toContain('index,follow,max-image-preview:large,max-snippet:-1');

    global.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => [rows[1]] });
    const noindexSsr = createResponse();
    await productHandler({ query: { id: rows[1].id } }, noindexSsr);
    expect(noindexSsr.statusCode).toBe(200);
    expect(noindexSsr.body).toContain('noindex,follow,noarchive');
  });

  test('sitemap e RSS mantêm 200 cacheável para uma lista vazia válida', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    const sitemapResponse = createResponse();
    await sitemapHandler({}, sitemapResponse);
    const feedResponse = createResponse();
    await feedHandler({}, feedResponse);

    for (const response of [sitemapResponse, feedResponse]) {
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toContain('s-maxage=900');
    }
    expect(feedResponse.body).not.toContain('<item>');
    expect(sitemapResponse.body).toContain('<loc>https://www.kinocampus.com.br/</loc>');
  });

  test('query de rota interna de 404 nunca altera a resposta pública do sitemap', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const sitemapResponse = createResponse();

    await sitemapHandler({ query: { kc_not_found: '1' } }, sitemapResponse);

    expect(sitemapResponse.statusCode).toBe(200);
    expect(sitemapResponse.headers['content-type']).toContain('application/xml');
    expect(sitemapResponse.body).toContain('<urlset ');
  });

  test('sitemap preserva fallback compatível de schema somente após 400', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [buildPost()] });

    const response = createResponse();
    await sitemapHandler({}, response);

    expect(response.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).not.toContain('image_url');
  });

  test('sitemap preserva URLs estaticas quando Supabase falha e RSS sinaliza indisponibilidade', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const sitemapResponse = createResponse();
    await sitemapHandler({}, sitemapResponse);
    const feedResponse = createResponse();
    await feedHandler({}, feedResponse);

    expect(sitemapResponse.statusCode).toBe(200);
    expect(sitemapResponse.headers['content-type']).toContain('application/xml');
    expect(sitemapResponse.headers['cache-control']).toContain('max-age=60');
    expect(sitemapResponse.headers['retry-after']).toBe('60');
    expect(sitemapResponse.headers['x-kino-sitemap-mode']).toBe('static-fallback');
    expect(sitemapResponse.body).toContain('<loc>https://www.kinocampus.com.br/</loc>');
    expect(sitemapResponse.body).not.toContain('/product.html?id=');

    expect(feedResponse.statusCode).toBe(503);
    expect(feedResponse.headers['cache-control']).toBe('no-store, max-age=0');
    expect(feedResponse.headers['retry-after']).toBe('60');
    expect(feedResponse.body).toBe('Service unavailable');
  });

  test('requisição pública ao Supabase interrompe upstream suspenso', async () => {
    const fetchImpl = jest.fn((_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));

    const result = await fetchPublicSupabaseJson('https://project.example.supabase.co/rest/v1/posts', {
      key: 'public-anon-key',
      fetchImpl,
      timeoutMs: 1,
    });

    expect(result).toEqual({ ok: false, reason: 'supabase_timeout', status: null });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('requisição pública respeita abort externo sem abortar o sinal chamador no próprio timeout', async () => {
    const parent = new AbortController();
    const fetchImpl = jest.fn((_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));

    const pending = fetchPublicSupabaseJson('https://project.example.supabase.co/rest/v1/posts', {
      key: 'public-anon-key',
      fetchImpl,
      signal: parent.signal,
      timeoutMs: 50,
    });
    parent.abort(new Error('caller cancelled'));

    await expect(pending).resolves.toEqual({
      ok: false,
      reason: 'supabase_request_aborted',
      status: null,
    });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(true);

    const timeoutParent = new AbortController();
    const timeoutResult = await fetchPublicSupabaseJson('https://project.example.supabase.co/rest/v1/posts', {
      key: 'public-anon-key',
      fetchImpl,
      signal: timeoutParent.signal,
      timeoutMs: 1,
    });
    expect(timeoutResult).toEqual({ ok: false, reason: 'supabase_timeout', status: null });
    expect(timeoutParent.signal.aborted).toBe(false);
  });

  test('requisição pública aplica o deadline também ao corpo JSON suspenso', async () => {
    const fetchImpl = jest.fn((_, options) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
      }),
    }));

    await expect(fetchPublicSupabaseJson('https://project.example.supabase.co/rest/v1/posts', {
      key: 'public-anon-key',
      fetchImpl,
      timeoutMs: 1,
    })).resolves.toEqual({ ok: false, reason: 'supabase_timeout', status: null });
  });

  test('OG preserva compatibilidade 400 e fallback UUID para legacy_id dentro de um prazo único', async () => {
    const uuid = '2bbcfb9e-331a-4e02-93dd-7bd809f355a8';
    const fallbackPost = buildPost({ id: uuid, legacy_id: uuid });
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [fallbackPost] });

    const response = createResponse();
    await productHandler({ query: { id: uuid } }, response);

    expect(response.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(global.fetch.mock.calls[1][0]).not.toContain('image_url');
    expect(global.fetch.mock.calls[2][0]).toContain(`legacy_id=eq.${uuid}`);
    expect(global.fetch.mock.calls[3][0]).not.toContain('image_url');
  });

  test('deadline compartilhado do OG impede retries após a tentativa compatível suspensa', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const uuid = '406aa2bc-b2a1-45c3-9553-3fedb9b9cf9a';
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockImplementationOnce((_, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));

    await expect(fetchPost(uuid, { fetchImpl, timeoutMs: 20 })).rejects.toThrow(/Supabase post request failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(true);
  });

  test('SSR OG responde 503 privado quando o upstream fica suspenso', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.useFakeTimers();
    try {
      global.fetch.mockImplementation((_, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      const response = createResponse();
      const pending = productHandler({ query: { id: 'produto-suspenso' } }, response);

      await jest.advanceTimersByTimeAsync(8_000);
      await pending;

      expect(response.statusCode).toBe(503);
      expect(response.headers['cache-control']).toContain('private, no-store');
      expect(response.headers['retry-after']).toBe('60');
    } finally {
      jest.useRealTimers();
    }
  });

  test('SSR da fase de ouvintes nao injeta expires_at nem submissao encerrada como Prazo', async () => {
    const semana = buildPost({
      id: 'semana-filosofia',
      title: 'Semana de Filosofia - inscricoes para ouvintes',
      expires_at: '2026-08-15T23:59:59-03:00',
      metadata: {
        dates: {
          applicationPurpose: 'listener_registration',
          applicationDeadline: null,
          submissionDeadline: '2026-07-15',
        },
      },
    });
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [semana] });

    const response = createResponse();
    await productHandler({ query: { id: semana.id } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('Prazo: 2026-08-15');
    expect(response.body).not.toContain('Prazo: 2026-07-15');
    expect(response.body).not.toContain('"validThrough"');
  });

  test('SSR inicial usa datas brasileiras e breadcrumb agrupado antes da hidratacao', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-25T12:00:00.000Z').getTime());
    const opportunity = buildPost({
      id: 'processo-seletivo-ppgacv',
      module: 'oportunidades',
      category: 'pesquisa',
      title: 'PPGACV/UFG oferece 28 vagas para mestrado e doutorado',
      metadata: {
        subcategoria: 'Artes',
        data_evento: '2026-10-01',
        deadline_date: '2026-09-25',
      },
    });
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [opportunity] });

    const response = createResponse();
    await productHandler({ query: { id: opportunity.id } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Prazo: 25/09/2026');
    expect(response.body).toMatch(/<strong>Data do evento<\/strong><span>01\/10\/2026<\/span>/u);
    expect(response.body).toMatch(/<strong>Prazo<\/strong><span>25\/09\/2026<\/span>/u);
    expect(response.body).toContain('kc-breadcrumb-segment kc-breadcrumb-segment--home');
    expect(response.body).toContain('<span aria-current="page">PPGACV/UFG oferece 28 vagas para mestrado e doutorado</span>');
    expect(response.body).not.toMatch(/id="breadcrumb"[^>]*>[\s\S]*?<\/a>\s*<i class="fas fa-chevron-right"><\/i>/u);
  });

  test('serializa JSON-LD sem permitir encerramento de script ou separadores Unicode crus', () => {
    const data = { text: '</script><tag>&\u2028\u2029' };
    const serialized = serializeJsonForHtml(data);

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('&');
    expect(serialized).not.toContain('\u2028');
    expect(serialized).not.toContain('\u2029');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual(data);
  });

  test('só gera Event com data e endereço postal explícitos e usa a descrição completa higienizada', () => {
    const venueOnly = buildPost({
      metadata: { data_evento: '2026-08-20' },
      location: 'Centro de Cultura e Eventos',
    });
    const article = richEntity(buildProductJsonLd(venueOnly, buildProductValues(venueOnly)));
    expect(article['@type']).toBe('Article');
    expect(article).not.toHaveProperty('author');
    expect(article.publisher).toEqual({ '@id': 'https://www.kinocampus.com.br/#organization' });
    expect(JSON.stringify(article)).not.toContain('Comunidade UFG');

    const longDescription = `**Programação completa** ${'atividade acadêmica confirmada '.repeat(10)}encerramento verificável.`;
    const complete = buildPost({
      description: longDescription,
      metadata: {
        data_evento: '2026-08-20',
        gratuito: false,
        event_address: 'Avenida Universitária, 1488',
        event_city: 'Goiânia',
        event_state: 'GO',
        event_postal_code: '74605-010',
      },
      location: 'Centro de Cultura e Eventos',
    });
    const event = richEntity(buildProductJsonLd(complete, buildProductValues(complete)));

    expect(event['@type']).toBe('Event');
    expect(event.location.name).toBe('Centro de Cultura e Eventos');
    expect(event.location.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Avenida Universitária, 1488',
      addressLocality: 'Goiânia',
      addressRegion: 'GO',
      postalCode: '74605-010',
      addressCountry: 'BR',
    });
    expect(event.description).toContain('encerramento verificável.');
    expect(event.description.length).toBeGreaterThan(180);
    expect(event.description).not.toContain('**');
    expect(event.isAccessibleForFree).toBe(false);
    expect(event).not.toHaveProperty('eventAttendanceMode');
    expect(event).not.toHaveProperty('offers');
    expect(event).not.toHaveProperty('organizer');
  });

  test('Event só inclui Offer quando preço/gratuidade e URL são explícitos', () => {
    const base = {
      metadata: {
        data_evento: '2026-08-20',
        event_address: 'Avenida Universitária, 1488',
        event_city: 'Goiânia',
      },
      location: 'Centro de Cultura e Eventos',
    };
    const noEvidence = buildPost({
      ...base,
      metadata: { ...base.metadata, link: 'https://example.edu.br/inscricao' },
    });
    expect(richEntity(buildProductJsonLd(noEvidence, buildProductValues(noEvidence))))
      .not.toHaveProperty('offers');

    const sourceOnly = buildPost({
      ...base,
      metadata: { ...base.metadata, gratuito: true, source_url: 'https://example.edu.br/noticia' },
    });
    expect(richEntity(buildProductJsonLd(sourceOnly, buildProductValues(sourceOnly))))
      .not.toHaveProperty('offers');

    const free = buildPost({
      ...base,
      metadata: { ...base.metadata, gratuito: true, link: 'https://example.edu.br/inscricao' },
    });
    expect(richEntity(buildProductJsonLd(free, buildProductValues(free))).offers).toEqual({
      '@type': 'Offer',
      url: 'https://example.edu.br/inscricao',
      price: 0,
      priceCurrency: 'BRL',
    });

    const paid = buildPost({
      ...base,
      price: 35,
      metadata: { ...base.metadata, gratuito: false, link: 'https://example.edu.br/ingresso' },
    });
    expect(richEntity(buildProductJsonLd(paid, buildProductValues(paid))).offers).toEqual({
      '@type': 'Offer',
      url: 'https://example.edu.br/ingresso',
      price: 35,
      priceCurrency: 'BRL',
    });
  });

  test('Event com data civil inválida volta para Article', () => {
    const invalid = buildPost({
      metadata: {
        data_evento: '2026-02-30',
        event_address: 'Avenida Universitária, 1488',
      },
    });
    expect(richEntity(buildProductJsonLd(invalid, buildProductValues(invalid)))['@type'])
      .toBe('Article');
  });

  test('JobPosting exige sinal de emprego, organização, endereço e datas explícitos', () => {
    const baseJob = buildPost({
      module: 'oportunidades',
      category: 'empregos',
      title: 'Vaga para assistente de laboratório',
      location: 'Goiânia',
      metadata: {
        deadline_date: '2026-08-31',
        link: 'https://example.edu.br/vaga',
        employmentType: 'clt',
        source_unit: 'Instituto de Pesquisa Example',
      },
    });

    expect(richEntity(buildProductJsonLd(baseJob, buildProductValues(baseJob)))['@type'])
      .toBe('Article');

    const completeJob = buildPost({
      ...baseJob,
      description: `**Atividades do cargo** ${'rotina técnica detalhada '.repeat(12)}requisitos finais confirmados.`,
      metadata: {
        ...baseJob.metadata,
        city: 'Goiânia',
        state: 'GO',
      },
    });
    const job = richEntity(buildProductJsonLd(completeJob, buildProductValues(completeJob)));

    expect(job['@type']).toBe('JobPosting');
    expect(job.hiringOrganization).toEqual({
      '@type': 'Organization',
      name: 'Instituto de Pesquisa Example',
    });
    expect(job.jobLocation).toEqual({
      '@type': 'Place',
      name: 'Goiânia',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Goiânia',
        addressRegion: 'GO',
        addressCountry: 'BR',
      },
    });
    expect(job.description).toContain('requisitos finais confirmados.');
    expect(job.description.length).toBeGreaterThan(180);
    expect(job.description).not.toContain('**');
    expect(job).not.toHaveProperty('employmentType');
    expect(JSON.stringify(job)).not.toContain('CONTRACTOR');
  });

  test.each([
    ['editais', 'Processo seletivo para ingresso no mestrado'],
    ['concursos', 'Seleção de trabalhos para congresso acadêmico'],
    ['bolsas', 'Seleção de estudantes para bolsa de iniciação científica'],
  ])('não trata seleção acadêmica em %s como JobPosting', (category, title) => {
    const academicSelection = buildPost({
      module: 'oportunidades',
      category,
      title,
      location: 'Campus Samambaia',
      metadata: {
        deadline_date: '2026-08-31',
        link: 'https://example.edu.br/selecao',
        source_unit: 'Universidade Example',
        city: 'Goiânia',
      },
    });

    expect(richEntity(buildProductJsonLd(academicSelection, buildProductValues(academicSelection)))['@type'])
      .toBe('Article');
  });

  test('aceita JobPosting fora da categoria emprego apenas com flag explícita e dados completos', () => {
    const explicitJob = buildPost({
      module: 'oportunidades',
      category: 'editais',
      title: 'Contratação temporária de analista de laboratório',
      location: 'Instituto de Pesquisa Example',
      metadata: {
        is_job_posting: true,
        deadline_date: '2026-08-31',
        link: 'https://example.edu.br/vaga',
        source_unit: 'Instituto de Pesquisa Example',
        job_address: {
          streetAddress: 'Rua 10, 250',
          addressLocality: 'Goiânia',
          addressRegion: 'GO',
        },
      },
    });

    const job = richEntity(buildProductJsonLd(explicitJob, buildProductValues(explicitJob)));
    expect(job['@type']).toBe('JobPosting');
    expect(job.jobLocation.address.streetAddress).toBe('Rua 10, 250');
  });

  test('JobPosting com prazo civil inválido volta para Article', () => {
    const invalidJob = buildPost({
      module: 'oportunidades',
      category: 'empregos',
      title: 'Vaga para técnico de laboratório',
      metadata: {
        deadline_date: '31/02/2026',
        link: 'https://example.edu.br/vaga',
        source_unit: 'Instituto de Pesquisa Example',
        city: 'Goiânia',
      },
    });

    expect(richEntity(buildProductJsonLd(invalidJob, buildProductValues(invalidJob)))['@type'])
      .toBe('Article');
  });

  test('título ausente permanece noindex no SSR mesmo com fallback visual', async () => {
    const untitled = buildPost({ title: '' });
    expect(shouldIndexPost(untitled)).toBe(false);

    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => [untitled] });
    const response = createResponse();
    await productHandler({ query: { id: untitled.id } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('noindex,follow,noarchive');
    expect(response.body).not.toContain('index,follow,max-image-preview:large,max-snippet:-1');
  });

  test('produto inexistente responde 404, enquanto falha de backend responde 503 sem cache', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    const notFound = createResponse();
    await productHandler({ query: { id: 'produto-inexistente' } }, notFound);

    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['cache-control']).toContain('s-maxage=60');
    expect(notFound.headers).not.toHaveProperty('retry-after');
    expect(notFound.body).toContain('noindex,follow,noarchive');

    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockRejectedValueOnce(new Error('temporary upstream failure'));
    const unavailable = createResponse();
    await productHandler({ query: { id: 'produto-temporario' } }, unavailable);

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.headers['cache-control']).toContain('no-store');
    expect(unavailable.headers['cache-control']).toContain('s-maxage=0');
    expect(unavailable.headers['retry-after']).toBe('60');
    expect(unavailable.body).toContain('noindex,follow,noarchive');
  });
});
