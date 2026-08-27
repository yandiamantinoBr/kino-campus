'use strict';

const lifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');
const {
  applyRuntimeAssetRevision,
  buildProductValues,
  shouldIndexPost,
} = require('../../api/og-product.js');
const { parseDateLike } = require('../../api/_lib/product-seo-policy.js');

function buildPost(overrides) {
  return {
    id: 'f45a772b-0a98-4dc1-9b38-209c2a0d1f10',
    title: 'Semana acadêmica com oficinas e palestras abertas',
    description: 'Programação organizada pela comunidade universitária com atividades gratuitas, datas confirmadas e participação aberta.',
    module: 'eventos',
    category: 'academico',
    location: 'Campus Samambaia',
    status: 'published',
    metadata: {},
    post_media: [],
    ...overrides,
  };
}

describe('metadados SEO de product.html', () => {
  test('revisiona assets imutáveis do SSR com o SHA exato do deploy', () => {
    const previous = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = '1dc1471f19eb0ce7bcdf0f0bafb3107270f5d5a2';
    try {
      const html = [
        '<link href="assets/css/product.css?v=8.6.1" rel="stylesheet" />',
        '<script defer src="assets/vendor/supabase-js-2.112.4.js"></script>',
        '<script defer src="https://cdn.example.com/external.js?v=old"></script>',
      ].join('');
      const revised = applyRuntimeAssetRevision(html);

      expect(revised).toContain('assets/css/product.css?v=1dc1471f19eb0ce7bcdf0f0bafb3107270f5d5a2');
      expect(revised).toContain('assets/vendor/supabase-js-2.112.4.js?v=1dc1471f19eb0ce7bcdf0f0bafb3107270f5d5a2');
      expect(revised).toContain('https://cdn.example.com/external.js?v=old');
    } finally {
      if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previous;
    }
  });

  test('não inventa revisão quando a variável de deploy é inválida', () => {
    const previous = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = 'not-a-commit';
    try {
      expect(applyRuntimeAssetRevision('<script src="assets/app.js?v=8.6.1"></script>'))
        .toContain('assets/app.js?v=8.6.1');
    } finally {
      if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previous;
    }
  });

  test('mantém canonical e imagem de fallback no domínio oficial', () => {
    const values = buildProductValues(buildPost());

    expect(values.canonicalUrl).toBe('https://www.kinocampus.com.br/product.html?id=f45a772b-0a98-4dc1-9b38-209c2a0d1f10');
    expect(values.image).toBe('https://www.kinocampus.com.br/api/og-image?type=eventos');
  });

  test('prioriza capa marcada em post_media para preview social', () => {
    const values = buildProductValues(buildPost({
      post_media: [
        { url: 'https://cdn.example.com/galeria-1.jpg', is_cover: false },
        { url: 'https://cdn.example.com/capa-evento.webp', is_cover: true },
      ],
    }));

    expect(values.image).toBe('https://cdn.example.com/capa-evento.webp');
  });

  test('aceita listas de imagens em metadata mesmo sem extensao explicita', () => {
    const values = buildProductValues(buildPost({
      metadata: {
        gallery_image_urls: [
          'https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover',
        ],
      },
    }));

    expect(values.image).toBe('https://project.supabase.co/storage/v1/object/public/kino-media/post-media/post-1/cover');
  });

  test('limita title e description sem perder contexto editorial', () => {
    const values = buildProductValues(buildPost({
      title: 'Evento '.repeat(30),
      description: 'Descrição detalhada da atividade universitária. '.repeat(20),
    }));

    expect(values.seoTitle.length).toBeLessThanOrEqual(70);
    expect(values.description.length).toBeLessThanOrEqual(180);
    expect(values.description).toContain('Eventos');
    expect(values.description).toContain('Campus Samambaia');
  });

  test('não indexa item sem descrição real mesmo quando o prefixo é longo', () => {
    const post = buildPost({ description: '', location: 'Campus Samambaia, Goiânia, Goiás' });
    const values = buildProductValues(post);

    expect(shouldIndexPost(post, values)).toBe(false);
  });

  test('interpreta prazo em formato brasileiro sem expirar no dia correto', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-02T12:00:00.000Z').getTime());
    try {
      const post = buildPost({
        metadata: { deadline_date: '02/07/2026' },
        expires_at: '2026-07-31T14:14:22.237246+00:00',
      });
      const values = buildProductValues(post);

      expect(values.deadline).toBe('2026-07-02');
      expect(shouldIndexPost(post, values)).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test.each([
    ['data civil ISO', '2026-07-02'],
    ['data brasileira com barra', '02/07/2026'],
    ['data brasileira com ponto', '02.07.2026'],
    ['data brasileira com hifen', '02-07-2026'],
    ['datetime local', '2026-08-20 00:30'],
    ['datetime ISO com offset', '2026-08-20T00:30:00-03:00'],
    ['epoch em segundos numerico', 1787194800],
    ['epoch em milissegundos numerico', 1787194800000],
    ['epoch em segundos textual', '1787194800'],
    ['epoch em milissegundos textual', '1787194800000'],
    ['data civil impossivel', '2026-02-31'],
    ['datetime local impossivel', '2026-02-31 12:00'],
    ['datetime ISO impossivel', '2026-09-31T12:00:00-03:00'],
    ['objeto invalido', { value: '2026-08-20' }],
  ])('parser SSR permanece identico ao lifecycle do cliente: %s', (_label, value) => {
    const expectedMs = lifecycle.parseDateMs(value, 'end');
    const parsed = parseDateLike(value, 'end');
    expect(parsed ? parsed.getTime() : null).toBe(expectedMs);

    const expectedDeadline = expectedMs == null
      ? ''
      : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(expectedMs));
    expect(buildProductValues(buildPost({ metadata: { deadline_date: value } })).deadline)
      .toBe(expectedDeadline);
  });

  test('SSR nao exibe expiracao tecnica nem prazo historico de outra fase', () => {
    const post = buildPost({
      expires_at: '2026-08-15T23:59:59-03:00',
      metadata: {
        applicationPurpose: 'listener_registration',
        application_episode: 'listener_registration',
        application_episodes: [
          { deadline: '2026-07-15', purpose: 'submission', status: 'closed' },
          { deadline: null, purpose: 'listener_registration', status: 'open' },
        ],
        dates: {
          applicationPurpose: 'listener_registration',
          applicationDeadline: null,
          submissionDeadline: '2026-07-15',
        },
      },
    });

    expect(buildProductValues(post).deadline).toBe('');
  });

  test.each([
    ['PROFMAT', {
      applicationPurpose: 'registration',
      application_episodes: [
        { deadline: '2026-08-09', purpose: 'submission', status: 'closed' },
        { deadline: '2026-09-15', purpose: 'registration', status: 'open' },
      ],
      deadline_date: '2026-09-15',
      dates: {
        applicationDeadline: '2026-09-15',
        applicationPurpose: 'registration',
        submissionDeadline: '2026-08-09',
      },
    }, '2026-09-15'],
    ['SIPACV', {
      applicationPurpose: 'submission',
      application_episodes: [
        { deadline: '2026-08-20', purpose: 'submission', status: 'open' },
        { deadline: '2026-10-10', purpose: 'listener_registration', status: 'scheduled' },
      ],
      deadline_date: '2026-08-20',
      dates: {
        applicationDeadline: '2026-08-20',
        applicationPurpose: 'submission',
        listenerRegistrationDeadline: '2026-10-10',
      },
    }, '2026-08-20'],
  ])('SSR da fixture literal %s usa apenas a fase ativa', (_name, metadata, expected) => {
    expect(buildProductValues(buildPost({ metadata })).deadline).toBe(expected);
  });

  test('episodio aberto identifica finalidade sem applicationPurpose global', () => {
    const values = buildProductValues(buildPost({
      metadata: {
        application_episodes: [
          { deadline: '2026-07-15', purpose: 'submission', status: 'closed' },
          { deadline: '2026-09-15', purpose: 'registration', status: 'open' },
        ],
        dates: { submissionDeadline: '2026-07-15' },
      },
    }));

    expect(values.deadline).toBe('2026-09-15');
  });

  test.each([
    ['registration', 'registrationDeadline'],
    ['submission', 'submissionDeadline'],
    ['candidacy', 'candidacyDeadline'],
    ['enrollment', 'enrollmentDeadline'],
    ['listener_registration', 'listenerRegistrationDeadline'],
  ])('SSR usa apenas o prazo declarado da fase %s', (purpose, alias) => {
    const metadata = {
      dates: {
        applicationPurpose: purpose,
        submissionDeadline: '2026-07-15',
      },
    };
    metadata.dates[alias] = '2026-09-15T23:59:59-03:00';

    expect(buildProductValues(buildPost({ metadata })).deadline).toBe('2026-09-15');
  });

  test('fase desconhecida ou conflitante falha fechada', () => {
    expect(buildProductValues(buildPost({
      metadata: {
        applicationPurpose: 'future_unknown_phase',
        deadline_date: '2026-09-15',
      },
    })).deadline).toBe('');

    expect(buildProductValues(buildPost({
      applicationPurpose: 'registration',
      metadata: {
        applicationPurpose: 'submission',
        deadline_date: '2026-09-15',
      },
    })).deadline).toBe('');
  });
});
