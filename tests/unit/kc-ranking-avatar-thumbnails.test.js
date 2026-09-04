'use strict';

const ORIGIN = 'https://ranking-fixture.supabase.co';
const PREFIX = '/storage/v1/object/public/kino-media/profile-avatars/';
const ORIGINAL = ORIGIN + PREFIX + 'test-user/avatar.jpg';
// 2026-09-04: /api/media substitui /render/image (quota Supabase). jsdom
// resolve a URL relativa contra http://localhost.
const SITE_ORIGIN = 'http://localhost';
const THUMBNAIL = SITE_ORIGIN + '/api/media?path=' + encodeURIComponent('kino-media/profile-avatars/test-user/avatar.jpg') + '&w=144&h=144&fit=cover&q=80';
const RENDERERS = ['renderHomeRanking', 'renderSidebarRanking'];

describe('ranking avatar thumbnails', () => {
  let ranking;
  let container;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="ranking-avatar-test"></div>';
    container = document.querySelector('#ranking-avatar-test');
    window.KC_ENV = { SUPABASE_URL: ORIGIN };
    window.KCAPI = { getTopContributors: jest.fn().mockResolvedValue([]) };
    window.KCSessionStore = { get: jest.fn(() => null), set: jest.fn() };
    delete window.KCRanking;
    require('../../assets/js/features/kc-ranking.js');
    ranking = window.KCRanking;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.KC_ENV;
    delete window.KCSessionStore;
    delete window.KCAPI;
  });

  function render(renderer, avatar = ORIGINAL) {
    const user = Object.freeze({ user_id: 'test-user', display_name: 'Ana <Campus>', avatar_url: avatar, score: 42 });
    ranking[renderer](container, Object.freeze([user]), null);
    return container.querySelector('img');
  }

  test.each(RENDERERS)('%s transforms only presentation, retaining markup, profile link and original signature', (renderer) => {
    const image = render(renderer);
    expect(image.src).toBe(THUMBNAIL);
    expect(image.getAttribute('data-kc-ranking-avatar-original')).toBe(ORIGINAL);
    expect(image.alt).toBe('Ana <Campus>');
    expect(image.loading || image.getAttribute('loading')).toBe('lazy');
    expect(container.textContent).toContain('Ana <Campus>');
    expect(container.textContent).toContain('42 pts');
    expect(container.querySelector('a').getAttribute('href')).toBe('profile.html?id=test-user');
    expect(container.dataset.kcRankingSignature).toContain(ORIGINAL);
    expect(container.dataset.kcRankingSignature).not.toContain('/render/image/');
    expect(container.querySelector('[onerror], [onload], script')).toBeNull();
  });

  test.each(['jpg', 'jpeg', 'png', 'webp', 'JPG'])('supports known raster extension %s and preserves encoded file names', (extension) => {
    const source = ORIGIN + PREFIX + 'test-user/avatar%20name.' + extension;
    expect(render('renderHomeRanking', source).src).toBe(SITE_ORIGIN + '/api/media?path=' + encodeURIComponent(source.replace(ORIGIN + '/storage/v1/object/public/', '')) + '&w=144&h=144&fit=cover&q=80');
  });

  const untouched = [
    ['external', 'https://example.com/avatar.jpg'],
    ['lookalike suffix', 'https://ranking-fixture.supabase.co.attacker.example' + PREFIX + 'avatar.jpg'],
    ['lookalike prefix', 'https://attacker-ranking-fixture.supabase.co' + PREFIX + 'avatar.jpg'],
    ['another project', 'https://other-project.supabase.co' + PREFIX + 'avatar.jpg'],
    ['insecure origin', 'http://ranking-fixture.supabase.co' + PREFIX + 'avatar.jpg'],
    ['nondefault port', 'https://ranking-fixture.supabase.co:444' + PREFIX + 'avatar.jpg'],
    ['signed', ORIGIN + '/storage/v1/object/sign/kino-media/profile-avatars/avatar.jpg?token=fixture'],
    ['query token on public path', ORIGINAL + '?token=fixture'],
    ['cache-busting query', ORIGINAL + '?v=3'],
    ['empty query', ORIGINAL + '?'],
    ['fragment', ORIGINAL + '#face'],
    ['empty fragment', ORIGINAL + '#'],
    ['other bucket', ORIGIN + '/storage/v1/object/public/avatars/avatar.jpg'],
    ['other folder', ORIGIN + '/storage/v1/object/public/kino-media/posts/avatar.jpg'],
    ['similar folder', ORIGIN + '/storage/v1/object/public/kino-media/profile-avatars-old/avatar.jpg'],
    ['already transformed', THUMBNAIL],
    ['animated GIF', ORIGIN + PREFIX + 'avatar.gif'],
    ['vector SVG', ORIGIN + PREFIX + 'avatar.svg'],
    ['unreviewed AVIF', ORIGIN + PREFIX + 'avatar.avif'],
    ['no extension', ORIGIN + PREFIX + 'avatar'],
    ['encoded slash', ORIGIN + PREFIX + 'test%2Favatar.jpg'],
    ['encoded backslash', ORIGIN + PREFIX + 'test%5Cavatar.jpg'],
  ];

  test.each(untouched)('keeps %s unchanged', (_label, source) => {
    const image = render('renderHomeRanking', source);
    expect(image.src).toBe(source);
    expect(image.hasAttribute('data-kc-ranking-avatar-original')).toBe(false);
  });

  test('credential-bearing URLs retain existing credential stripping, without transforming them', () => {
    const source = ORIGINAL.replace('https://', 'https://fixture:fixture@');
    const image = render('renderHomeRanking', source);
    expect(image.src).toBe(ORIGINAL);
    expect(image.hasAttribute('data-kc-ranking-avatar-original')).toBe(false);
  });

  test.each(['data:image/png;base64,fixture', 'javascript:alert(1)', 'blob:https://example.com/fixture', ''])('keeps the existing rejection of unsafe/empty URLs (%s)', (source) => {
    expect(render('renderHomeRanking', source)).toBeNull();
    expect(container.querySelector('.fa-user')).not.toBeNull();
  });

  test.each([
    undefined,
    {},
    { SUPABASE_URL: '__KC_SUPABASE_URL__' },
    { SUPABASE_URL: 'http://ranking-fixture.supabase.co' },
    { SUPABASE_URL: ORIGIN + '/unexpected' },
    { SUPABASE_URL: ORIGIN + '?token=fixture' },
    { SUPABASE_URL: 'https://fixture:fixture@ranking-fixture.supabase.co' },
  ])('keeps originals when project configuration is absent or invalid (%j)', (configuration) => {
    window.KC_ENV = configuration;
    expect(render('renderHomeRanking').src).toBe(ORIGINAL);
  });

  test('supports the existing nested Supabase URL alias', () => {
    window.KC_ENV = { supabase: { url: ORIGIN + '/' } };
    expect(render('renderHomeRanking').src).toBe(THUMBNAIL);
  });

  test.each(RENDERERS)('%s restores the original once and keeps it across identical rerenders', (renderer) => {
    const image = render(renderer);
    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const assignments = jest.fn((value) => nativeSrc.set.call(image, value));
    Object.defineProperty(image, 'src', { get: () => nativeSrc.get.call(image), set: assignments });
    image.dispatchEvent(new Event('error'));
    expect(image.src).toBe(ORIGINAL);
    expect(image.hasAttribute('data-kc-ranking-avatar-original')).toBe(false);
    image.dispatchEvent(new Event('error'));
    expect(assignments).toHaveBeenCalledTimes(1);
    const rerendered = render(renderer);
    expect(rerendered).toBe(image);
    expect(rerendered.src).toBe(ORIGINAL);
    expect(assignments).toHaveBeenCalledTimes(1);
  });

  test('handles an already-completed cached failure without an error event', () => {
    jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    jest.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    const image = render('renderHomeRanking');
    expect(image.src).toBe(ORIGINAL);
    expect(image.hasAttribute('data-kc-ranking-avatar-original')).toBe(false);
  });

  test('does not replace an already-completed successful thumbnail', () => {
    jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    jest.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(144);
    expect(render('renderHomeRanking').src).toBe(THUMBNAIL);
  });

  test('home and sidebar use the same image URL without modifying network/session/cache data', async () => {
    const users = Object.freeze([Object.freeze({ user_id: 'test-user', display_name: 'Ana', avatar_url: ORIGINAL, score: 42 })]);
    window.KCAPI.getTopContributors.mockResolvedValue(users);
    const result = await ranking.fetchRanking('month', null, 10);
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
    await ranking.loadHomeRanking(container, 'month', null);
    await ranking.loadSidebarRanking(sidebar, 'month', null);
    expect(container.querySelector('img').src).toBe(THUMBNAIL);
    expect(sidebar.querySelector('img').src).toBe(THUMBNAIL);
    expect(result.users).toEqual(users);
    expect(result.users[0]).toBe(users[0]);
    expect(ranking.getCachedRanking('month', null).users[0].avatar_url).toBe(ORIGINAL);
    expect(window.KCSessionStore.set).toHaveBeenCalledWith('ranking', '__general__:month', {
      users,
      signature: JSON.stringify([['test-user', 'Ana', ORIGINAL, 42]]),
    });
    expect(window.KCAPI.getTopContributors).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.getTopContributors).toHaveBeenCalledWith('month', null, 10);
  });
});
