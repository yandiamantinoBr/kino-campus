'use strict';

const {
  buildOgMediaDescriptor,
  buildOgMediaUrl,
  buildProductValues,
} = require('../../api/og-product.js');

const RENDER_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/render/image/public/kino-media/post-media/2345582d-8bf7-4393-aa0d-f9953d0e02ca/c45dd940-2088-4b17-bd21-d59e2d2fe5fd/cadu-1-d5d96aaa.png?width=1920&height=1236&resize=cover&quality=90';
const OBJECT_URL = 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/ab/capa.jpg';

function buildPost(overrides) {
  return {
    id: 'c45dd940-2088-4b17-bd21-d59e2d2fe5fd',
    title: 'CIAR seleciona celetista',
    description: 'Processo seletivo aberto.',
    module: 'oportunidades',
    status: 'published',
    metadata: {},
    post_media: [],
    updated_at: '2026-09-04T17:04:11.000Z',
    ...overrides,
  };
}

describe('buildOgMediaDescriptor (og:image via /api/media)', () => {
  test('roteia cover_render (render URL) para /api/media preservando proporcao', () => {
    const d = buildOgMediaDescriptor(RENDER_URL, '20260904170411');
    expect(d).not.toBeNull();
    expect(d.proxied).toBe(true);
    expect(d.type).toBe('image/jpeg');
    expect(d.width).toBe(1920);
    expect(d.height).toBe(1236);
    expect(d.url.startsWith('https://www.kinocampus.com.br/api/media?')).toBe(true);
    expect(d.url).toContain('path=kino-media%2Fpost-media%2F2345582d-8bf7-4393-aa0d-f9953d0e02ca%2Fc45dd940-2088-4b17-bd21-d59e2d2fe5fd%2Fcadu-1-d5d96aaa.png');
    expect(d.url).toContain('w=1920');
    expect(d.url).toContain('h=1236');
    expect(d.url).toContain('q=82');
    expect(d.url).toContain('v=20260904170411');
    expect(d.url).not.toContain('supabase.co');
  });

  test('object URL sem params usa largura padrao 1200 sem altura', () => {
    const d = buildOgMediaDescriptor(OBJECT_URL);
    expect(d).not.toBeNull();
    expect(d.url).toContain('w=1200');
    expect(d.url).not.toContain('&h=');
  });

  test('URL fora do Supabase ou nao-imagem nao e proxyada', () => {
    expect(buildOgMediaDescriptor('https://cdn.example.com/foto.jpg')).toBeNull();
    expect(buildOgMediaDescriptor('https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/x/doc.pdf')).toBeNull();
    expect(buildOgMediaDescriptor('')).toBeNull();
    expect(buildOgMediaDescriptor('isto nao e url')).toBeNull();
  });

  test('outro bucket nao e proxyado', () => {
    expect(buildOgMediaDescriptor('https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/avatars/a.jpg')).toBeNull();
  });

  test('buildOgMediaUrl devolve a original quando nao proxya', () => {
    const external = 'https://cdn.example.com/foto.jpg';
    expect(buildOgMediaUrl(external, '123')).toBe(external);
    expect(typeof buildOgMediaUrl(RENDER_URL, '123')).toBe('string');
  });

  test('version nao-numerica e sanitizada', () => {
    const d = buildOgMediaDescriptor(OBJECT_URL, '2026-09-04T17:04:11');
    expect(d.url).toContain('v=20260904170411');
  });
});

describe('buildProductValues integra og:image proxyado', () => {
  test('capa em post_media via render vira ogImage /api/media com v do post', () => {
    const values = buildProductValues(buildPost({
      post_media: [
        { url: OBJECT_URL, is_cover: true },
      ],
    }));
    expect(values.ogImageProxied).toBe(true);
    expect(values.ogImage.startsWith('https://www.kinocampus.com.br/api/media?')).toBe(true);
    expect(values.ogImage).toContain('v=20260904170411');
    // values.image (exibicao/JSON-LD) permanece a URL original
    expect(values.image).toBe(OBJECT_URL);
  });

  test('imagem externa mantem ogImage igual a image', () => {
    const external = 'https://cdn.example.com/capa-evento.webp';
    const values = buildProductValues(buildPost({
      post_media: [{ url: external, is_cover: true }],
    }));
    expect(values.ogImageProxied).toBe(false);
    expect(values.ogImage).toBe(external);
    expect(values.ogImageWidth).toBe(0);
  });

  test('fallback sem imagem permanece no dominio oficial sem proxy', () => {
    const values = buildProductValues(buildPost());
    expect(values.ogImageProxied).toBe(false);
    expect(values.ogImage).toBe('https://www.kinocampus.com.br/api/og-image?type=oportunidades');
  });
});
