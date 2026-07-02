'use strict';

const { buildProductValues, shouldIndexPost } = require('../../api/og-product.js');

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

      expect(values.deadline).toBe('02/07/2026');
      expect(shouldIndexPost(post, values)).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
