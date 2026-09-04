'use strict';

const ORIGIN = 'https://feed-avatar-fixture.supabase.co';
const PREFIX = '/storage/v1/object/public/kino-media/profile-avatars/';
const ORIGINAL = ORIGIN + PREFIX + 'author/avatar.jpg';
// 2026-09-04: thumbnails passam por /api/media (sharp na Vercel) — mesmo
// recorte 144x144 fit=cover, sem consumir a quota de transformacoes do Supabase.
const THUMBNAIL = '/api/media?path=' + encodeURIComponent('kino-media/profile-avatars/author/avatar.jpg') + '&w=144&h=144&fit=cover&q=80';
const RESOLVED_THUMBNAIL = 'http://localhost' + THUMBNAIL;
const POST = Object.freeze({ id: 'feed-avatar-post', modulo: 'eventos', titulo: 'Publicação de teste', descricao: 'Descrição', authorId: 'feed-avatar-author', imagens: Object.freeze([]) });

beforeAll(() => {
  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.format.js');
  require('../../assets/js/utils/kc-utils.dom.js');
  require('../../assets/js/utils/kc-utils.identity.js');
  require('../../assets/js/utils/kc-utils.taxonomy.js');
  require('../../assets/js/utils/kc-utils.location.js');
  require('../../assets/js/utils/kc-utils.presentation.js');
  require('../../assets/js/features/kc-ranking.js');
});

describe('feed author avatar thumbnails', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="feed-avatar-container"></div>';
    window.KC_ENV = { SUPABASE_URL: ORIGIN };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.KC_ENV;
    delete window.KCAPI;
  });

  function render(source = ORIGINAL) {
    const author = Object.freeze({ name: 'Ana <Campus>', avatar: source });
    window.KCAPI = { getAuthorById: jest.fn(() => author) };
    const container = document.querySelector('#feed-avatar-container');
    container.innerHTML = window._KCU.presentation.renderPostCard(POST);
    return { author, container, image: container.querySelector('.kc-card__author > img') };
  }

  test('uses exactly the ranking URL without changing source objects or card semantics', () => {
    const { image, author, container } = render();
    expect(image.getAttribute('src')).toBe(THUMBNAIL);
    expect(image.alt).toBe('Avatar de Ana <Campus>');
    expect(image.getAttribute('data-kc-feed-avatar-original')).toBe(ORIGINAL);
    expect(image.getAttribute('data-kc-feed-avatar-thumbnail')).toBe(THUMBNAIL);
    expect(author.avatar).toBe(ORIGINAL);
    expect(POST.imagens).toEqual([]);
    expect(container.textContent).toContain('Publicação de teste');
    expect(container.querySelector('.kc-card__title').getAttribute('href')).toBe('product.html?id=feed-avatar-post');
    expect(container.querySelector('[onerror]')).toBeNull();
    const ranking = document.createElement('div');
    document.body.appendChild(ranking);
    window.KCRanking.renderHomeRanking(ranking, [Object.freeze({ user_id: 'feed-avatar-author', display_name: 'Ana <Campus>', avatar_url: ORIGINAL, score: 42 })], null);
    expect(ranking.querySelector('img').src).toBe(image.src);
  });

  test.each(['jpg', 'jpeg', 'png', 'webp', 'JPG'])('handles known raster %s and preserves encoded filenames', (extension) => {
    const source = ORIGIN + PREFIX + 'author/avatar%20name.' + extension;
    expect(render(source).image.getAttribute('src')).toBe('/api/media?path=' + encodeURIComponent(source.replace(ORIGIN + '/storage/v1/object/public/', '')) + '&w=144&h=144&fit=cover&q=80');
  });

  test.each([
    ['external', 'https://example.com/avatar.jpg'],
    ['lookalike suffix', 'https://feed-avatar-fixture.supabase.co.attacker.example' + PREFIX + 'avatar.jpg'],
    ['lookalike prefix', 'https://not-feed-avatar-fixture.supabase.co' + PREFIX + 'avatar.jpg'],
    ['other project', 'https://other.supabase.co' + PREFIX + 'avatar.jpg'],
    ['http', ORIGINAL.replace('https:', 'http:')],
    ['port', ORIGINAL.replace('.co/', '.co:444/')],
    ['signed', ORIGIN + '/storage/v1/object/sign/kino-media/profile-avatars/avatar.jpg?token=fixture'],
    ['query token', ORIGINAL + '?token=fixture&v=1'],
    ['cache version', ORIGINAL + '?v=1'],
    ['empty query', ORIGINAL + '?'],
    ['hash', ORIGINAL + '#position'],
    ['empty hash', ORIGINAL + '#'],
    ['other bucket', ORIGIN + '/storage/v1/object/public/avatars/avatar.jpg'],
    ['other folder', ORIGIN + '/storage/v1/object/public/kino-media/posts/avatar.jpg'],
    ['similar folder', ORIGIN + '/storage/v1/object/public/kino-media/profile-avatars-other/avatar.jpg'],
    ['GIF', ORIGIN + PREFIX + 'avatar.gif'],
    ['SVG', ORIGIN + PREFIX + 'avatar.svg'],
    ['AVIF', ORIGIN + PREFIX + 'avatar.avif'],
    ['no extension', ORIGIN + PREFIX + 'avatar'],
    ['encoded slash', ORIGIN + PREFIX + 'author%2Favatar.jpg'],
    ['encoded backslash', ORIGIN + PREFIX + 'author%5Cavatar.jpg'],
    ['already transformed', THUMBNAIL],
    ['credentials', ORIGINAL.replace('https://', 'https://fixture:fixture@')],
    ['data SVG', 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'],
  ])('leaves %s source unchanged and unmarked', (_label, source) => {
    const { image } = render(source);
    expect(image.getAttribute('src')).toBe(source);
    expect(image.hasAttribute('data-kc-feed-avatar-original')).toBe(false);
    const before = image.getAttribute('src');
    image.dispatchEvent(new Event('error'));
    expect(image.getAttribute('src')).toBe(before);
  });

  test.each([
    undefined, {}, { SUPABASE_URL: '__KC_SUPABASE_URL__' },
    { SUPABASE_URL: ORIGIN.replace('https:', 'http:') },
    { SUPABASE_URL: ORIGIN + '/unexpected' },
    { SUPABASE_URL: ORIGIN + '?token=fixture' },
    { SUPABASE_URL: ORIGIN.replace('https://', 'https://fixture:fixture@') },
  ])('keeps original if project configuration is missing/invalid (%j)', (configuration) => {
    window.KC_ENV = configuration;
    expect(render().image.src).toBe(ORIGINAL);
  });

  test('uses nested config alias and legacy author-avatar fallback', () => {
    window.KC_ENV = { supabase: { url: ORIGIN + '/' } };
    window.KCAPI = { getAuthorById: () => null };
    const legacy = Object.freeze({ ...POST, autor: 'Ana', autorAvatar: ORIGINAL });
    document.querySelector('#feed-avatar-container').innerHTML = window._KCU.presentation.renderPostCard(legacy);
    expect(document.querySelector('.kc-card__author img').src).toBe(RESOLVED_THUMBNAIL);
    expect(legacy.autorAvatar).toBe(ORIGINAL);
  });

  test('captures non-bubbling errors and retries the original only once', () => {
    const { image } = render();
    const setAttribute = jest.spyOn(image, 'setAttribute');
    image.dispatchEvent(new Event('error', { bubbles: false }));
    expect(image.src).toBe(ORIGINAL);
    expect(image.hasAttribute('data-kc-feed-avatar-original')).toBe(false);
    expect(image.hasAttribute('data-kc-feed-avatar-thumbnail')).toBe(false);
    image.dispatchEvent(new Event('error', { bubbles: false }));
    expect(setAttribute.mock.calls.filter(([key]) => key === 'src')).toEqual([['src', ORIGINAL]]);
  });

  test('handles an immediately failing dynamically appended card without another listener or scan', () => {
    const { container } = render();
    const addListener = jest.spyOn(document, 'addEventListener');
    container.insertAdjacentHTML('beforeend', window._KCU.presentation.renderPostCard({ ...POST, id: 'next-page' }));
    const added = container.querySelectorAll('.kc-card__author img')[1];
    added.dispatchEvent(new Event('error', { bubbles: false }));
    expect(added.src).toBe(ORIGINAL);
    expect(addListener).not.toHaveBeenCalled();
  });

  test('does not revert a newer src after an old request fails', () => {
    const { image } = render();
    const replacement = 'https://example.com/replacement.png';
    image.src = replacement;
    image.dispatchEvent(new Event('error'));
    expect(image.src).toBe(replacement);
    expect(image.hasAttribute('data-kc-feed-avatar-original')).toBe(false);
  });

  test('does not touch unrelated images or marked images moved out of the author slot', () => {
    const { image } = render();
    const unrelated = document.createElement('img');
    unrelated.src = THUMBNAIL;
    document.body.appendChild(unrelated);
    unrelated.dispatchEvent(new Event('error'));
    expect(unrelated.src).toBe(RESOLVED_THUMBNAIL);
    document.body.appendChild(image);
    image.dispatchEvent(new Event('error'));
    expect(image.src).toBe(RESOLVED_THUMBNAIL);
  });
});
