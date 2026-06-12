/**
 * @file kc-api-normalize-post-snapshot.test.js
 * @description Behavioral snapshots for KCAPI.normalizePost before V76 extraction.
 */
'use strict';

function loadKCAPI() {
  global.window = global.window || global;

  window.KC_ENV = {
    version: '9.0.0',
    driver: 'local',
    environment: 'development',
    APP_ENV: 'development',
    isProduction: false,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: { url: 'https://test.supabase.co', anonKey: 'test-key', storageBucket: 'kino-media' },
    clamp: { month: 'February', year: 2026 },
  };

  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.format.js');
  require('../../assets/js/utils/kc-utils.dom.js');
  require('../../assets/js/utils/kc-utils.identity.js');
  require('../../assets/js/utils/kc-utils.taxonomy.js');
  require('../../assets/js/utils/kc-utils.location.js');
  require('../../assets/js/utils/kc-utils.presentation.js');
  require('../../assets/js/utils/kc-utils.js');
  require('../../assets/js/api/kc-api.notifications.js');
  require('../../assets/js/api/kc-api.saved.js');
  require('../../assets/js/api/kc-api.help.js');
  require('../../assets/js/api/kc-api.posts-read.js');
  require('../../assets/js/api/kc-api.comments-votes.js');
  require('../../assets/js/api/kc-api.ratings.js');
  require('../../assets/js/api/kc-api.posts-feed.js');
  require('../../assets/js/api/kc-api.posts-write.js');
  require('../../assets/js/api/kc-api.profiles.js');
  require('../../assets/js/api/kc-api.related.js');
  require('../../assets/js/api/kc-api.auth.js');
  require('../../assets/js/api/kc-api.chat.js');
  require('../../assets/js/api/kc-api.diagnostics.js');
  require('../../assets/js/api/kc-api.session.js');
  require('../../assets/js/api/kc-api.filters.js');
  require('../../assets/js/api/kc-api.authors.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
  require('../../assets/js/api/kc-api.client.js');

  return window.KCAPI;
}

function avatarKind(value) {
  const avatar = String(value || '');
  return avatar.startsWith('data:image/svg+xml') ? 'default-svg' : avatar;
}

function emojiKind(value) {
  return value === '\u2728' ? 'default-sparkles' : value;
}

function normalizePostSnapshot(raw) {
  const post = window.KCAPI.normalizePost(raw);
  return {
    id: post.id,
    modulo: post.modulo,
    categoria: post.categoria,
    titulo: post.titulo,
    descricao: post.descricao,
    preco: post.preco,
    authorId: post.authorId,
    authorVerified: post.authorVerified,
    timestamp: post.timestamp,
    createdAt: post.createdAt,
    created_at: post.created_at,
    bumpedAt: post.bumpedAt,
    bumped_at: post.bumped_at,
    effectiveAt: post.effectiveAt,
    effective_at: post.effective_at,
    emoji: emojiKind(post.emoji),
    verificado: post.verificado,
    status: post.status,
    isClosed: post.isClosed,
    visibility: post.visibility,
    categoriaKey: post.categoriaKey,
    subcategoria: post.subcategoria,
    subcategoriaKey: post.subcategoriaKey,
    tags: post.tags,
    tagKeys: post.tagKeys,
    rating: post.rating,
    ratingCount: post.ratingCount,
    rating_count: post.rating_count,
    imagens: post.imagens,
    images: post.images,
    image_url: post.image_url,
    imageUrl: post.imageUrl,
    cover_url: post.cover_url,
    coverUrl: post.coverUrl,
    metadata: post.metadata,
    authorProfile: post.authorProfile,
    autor: post.autor,
    author: post.author,
    autorAvatar: avatarKind(post.autorAvatar),
    authorAvatar: avatarKind(post.authorAvatar),
    authorName: post.authorName,
    _legacyAuthorName: post._legacyAuthorName,
    _legacyAuthorAvatar: post._legacyAuthorAvatar,
    legacyId: post.legacyId,
    legacy_id: post.legacy_id,
  };
}

beforeAll(() => {
  loadKCAPI();
});

describe('KCAPI.normalizePost - V76 pre-extraction snapshots', () => {
  test('normaliza post Supabase com aliases snake/camel, datas efetivas, rating e media', () => {
    expect(normalizePostSnapshot({
      id: 'uuid-1',
      module: 'eventos',
      category: 'academicos',
      title: 'Semana academica',
      description: 'Talks',
      price: '15',
      authorProfile: { id: 'profile-1', display_name: 'Ana', rating_avg: '4.2', rating_count: '8' },
      profiles: { verified: true },
      rating_avg: '4.8',
      rating_count: '12',
      created_at: '2026-06-01T10:00:00Z',
      bumped_at: '2026-06-02T10:00:00Z',
      metadata: {
        image_url: 'https://cdn.example.com/event.jpg',
        visibility: 'private',
        categoryKey: 'evento',
        subcategory: 'workshop',
      },
      tags: ['ufg', 'week'],
      status: 'closed',
    })).toMatchInlineSnapshot(`
{
  "_legacyAuthorAvatar": null,
  "_legacyAuthorName": null,
  "author": "Autor",
  "authorAvatar": "default-svg",
  "authorId": null,
  "authorName": "Autor",
  "authorProfile": {
    "display_name": "Ana",
    "id": "profile-1",
    "ratingAvg": 4.8,
    "ratingCount": 12,
    "rating_avg": 4.8,
    "rating_count": 12,
  },
  "authorVerified": true,
  "autor": "Autor",
  "autorAvatar": "default-svg",
  "bumpedAt": "2026-06-02T10:00:00Z",
  "bumped_at": "2026-06-02T10:00:00Z",
  "categoria": "academicos",
  "categoriaKey": "evento",
  "coverUrl": "https://cdn.example.com/event.jpg",
  "cover_url": "https://cdn.example.com/event.jpg",
  "createdAt": "2026-06-01T10:00:00Z",
  "created_at": "2026-06-01T10:00:00Z",
  "descricao": "Talks",
  "effectiveAt": "2026-06-02T10:00:00Z",
  "effective_at": "2026-06-02T10:00:00Z",
  "emoji": "default-sparkles",
  "id": "uuid-1",
  "imageUrl": "https://cdn.example.com/event.jpg",
  "image_url": "https://cdn.example.com/event.jpg",
  "imagens": [
    "https://cdn.example.com/event.jpg",
  ],
  "images": [
    "https://cdn.example.com/event.jpg",
  ],
  "isClosed": true,
  "legacyId": null,
  "legacy_id": null,
  "metadata": {
    "categoryKey": "evento",
    "image_url": "https://cdn.example.com/event.jpg",
    "subcategory": "workshop",
    "subcategoryKey": "workshop",
    "visibility": "private",
  },
  "modulo": "eventos",
  "preco": "15",
  "rating": 4.8,
  "ratingCount": 12,
  "rating_count": 12,
  "status": "closed",
  "subcategoria": "",
  "subcategoriaKey": "workshop",
  "tagKeys": [
    "ufg",
    "week",
  ],
  "tags": [
    "ufg",
    "week",
  ],
  "timestamp": "2026-06-02T10:00:00Z",
  "titulo": "Semana academica",
  "verificado": true,
  "visibility": "private",
}
`);
  });

  test('preserva autor legado resolvido pelo modulo authors e normaliza imagens diretas', () => {
    expect(normalizePostSnapshot({
      _id: 'legacy-1',
      modulo: 'moradia',
      categoria: 'republica',
      titulo: 'Quarto perto campus',
      descricao: 'Suite',
      preco: 700,
      autor: 'Lucas Ferreira',
      autorAvatar: 'https://i.pravatar.cc/150?img=32',
      timestamp: '2026-06-03T09:00:00Z',
      verified: true,
      imagens: [' https://cdn.example.com/a.jpg ', '', 'https://cdn.example.com/b.jpg'],
      metadata: { visibility: 'community' },
      legacy_id: 'legacy-db-1',
    })).toMatchInlineSnapshot(`
{
  "_legacyAuthorAvatar": "https://i.pravatar.cc/150?img=32",
  "_legacyAuthorName": "Lucas Ferreira",
  "author": "Lucas Ferreira",
  "authorAvatar": "https://i.pravatar.cc/150?img=32",
  "authorId": "USER_39",
  "authorName": "Lucas Ferreira",
  "authorProfile": null,
  "authorVerified": false,
  "autor": "Lucas Ferreira",
  "autorAvatar": "https://i.pravatar.cc/150?img=32",
  "bumpedAt": null,
  "bumped_at": null,
  "categoria": "republica",
  "categoriaKey": "",
  "coverUrl": "https://cdn.example.com/a.jpg",
  "cover_url": "https://cdn.example.com/a.jpg",
  "createdAt": null,
  "created_at": null,
  "descricao": "Suite",
  "effectiveAt": null,
  "effective_at": null,
  "emoji": "default-sparkles",
  "id": "legacy-1",
  "imageUrl": "https://cdn.example.com/a.jpg",
  "image_url": "https://cdn.example.com/a.jpg",
  "imagens": [
    "https://cdn.example.com/a.jpg",
    "https://cdn.example.com/b.jpg",
  ],
  "images": [
    "https://cdn.example.com/a.jpg",
    "https://cdn.example.com/b.jpg",
  ],
  "isClosed": false,
  "legacyId": "legacy-db-1",
  "legacy_id": "legacy-db-1",
  "metadata": {
    "visibility": "community",
  },
  "modulo": "moradia",
  "preco": 700,
  "rating": null,
  "ratingCount": 0,
  "rating_count": 0,
  "status": "published",
  "subcategoria": "",
  "subcategoriaKey": "",
  "tagKeys": [],
  "tags": [],
  "timestamp": "2026-06-03T09:00:00Z",
  "titulo": "Quarto perto campus",
  "verificado": true,
  "visibility": "community",
}
`);
  });

  test('congela regra de compra-venda que converte acao em subcategoria de produto', () => {
    expect(normalizePostSnapshot({
      id: 'market-1',
      modulo: 'compra-venda',
      categoria: 'livros',
      titulo: 'Livro usado',
      descricao: 'Calculo',
      categoriaKey: 'livros',
      subcategoriaKey: 'vendo',
      metadata: { subcategory: 'vendo' },
      priceText: 'R$ 50',
    })).toMatchInlineSnapshot(`
{
  "_legacyAuthorAvatar": null,
  "_legacyAuthorName": null,
  "author": "Autor",
  "authorAvatar": "default-svg",
  "authorId": null,
  "authorName": "Autor",
  "authorProfile": null,
  "authorVerified": false,
  "autor": "Autor",
  "autorAvatar": "default-svg",
  "bumpedAt": null,
  "bumped_at": null,
  "categoria": "livros",
  "categoriaKey": "livros",
  "coverUrl": "",
  "cover_url": "",
  "createdAt": null,
  "created_at": null,
  "descricao": "Calculo",
  "effectiveAt": null,
  "effective_at": null,
  "emoji": "default-sparkles",
  "id": "market-1",
  "imageUrl": "",
  "image_url": "",
  "imagens": [],
  "images": [],
  "isClosed": false,
  "legacyId": null,
  "legacy_id": null,
  "metadata": {
    "categoryKey": "livros",
    "subcategory": "livros",
    "subcategoryKey": "livros",
    "visibility": "public",
  },
  "modulo": "compra-venda",
  "preco": null,
  "rating": null,
  "ratingCount": 0,
  "rating_count": 0,
  "status": "published",
  "subcategoria": "",
  "subcategoriaKey": "livros",
  "tagKeys": [],
  "tags": [],
  "timestamp": "",
  "titulo": "Livro usado",
  "verificado": false,
  "visibility": "public",
}
`);
  });

  test('mantem shape atual da funcao dentro da fachada antes da extracao', () => {
    expect(typeof window.KCAPI.normalizePost).toBe('function');
    expect(window.KCAPI.normalizePost.name).toBe('normalizePost');
  });
});
