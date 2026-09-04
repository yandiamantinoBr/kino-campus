const { test, expect } = require('@playwright/test');

const csp = require('../../vercel.json').headers.flatMap((entry) => entry.headers)
  .find((header) => header.key === 'Content-Security-Policy').value;
const origin = 'https://feed-avatar-fixture.supabase.co';
const original = origin + '/storage/v1/object/public/kino-media/profile-avatars/author/avatar.jpg';
// 2026-09-04: thumbnails agora passam por /api/og-image (sharp na Vercel) em vez
// de /render/image — a URL e relativa ao site sob teste.
const thumbnail = '/api/og-image?path=' + encodeURIComponent('kino-media/profile-avatars/author/avatar.jpg') + '&w=144&h=144&fit=cover&q=80';
const authorId = '11111111-1111-4111-8111-111111111111';
const postId = '22222222-2222-4222-8222-222222222222';
const author = { id: authorId, display_name: 'Ana Campus', avatar_url: original, verified: false };
const row = {
  id: postId, author_id: authorId, title: 'Publicação de teste', description: 'Descrição de teste',
  module: 'eventos', category: 'academico', status: 'published', visibility: 'public',
  created_at: '2026-08-31T00:00:00Z', profiles: author, post_media: [],
  metadata: { autorNome: author.display_name, autorAvatar: original },
};

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

async function bootHome(page, { failThumbnail = false, failOriginal = false } = {}) {
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 144;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff6b00';
    context.fillRect(0, 0, 144, 144);
    context.fillStyle = '#ffffff';
    context.fillRect(36, 36, 72, 72);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const imageRequests = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(({ origin }) => {
    window.KC_ENV = {
      driver: 'supabase', DATA_DRIVER: 'supabase', SUPABASE_URL: origin,
      SUPABASE_ANON_KEY: 'fixture-public-anon-key', debug: false,
      APP_ENV: 'development', environment: 'development',
    };
    localStorage.setItem('kc_consent_v1', JSON.stringify({
      version: '2026-06-05', necessary: true, preferences: false,
      analytics: false, advertising: false, updatedAt: '2026-08-31T00:00:00Z', source: 'test',
    }));
    window.__feedAvatarCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__feedAvatarCspViolations.push(event.effectiveDirective);
    });
  }, { origin });
  await page.routeWebSocket('**', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      if (url.pathname.startsWith('/storage/v1/')) {
        imageRequests.push(url.href);
        const failed = url.href === thumbnail ? failThumbnail : (url.href === original && failOriginal);
        return route.fulfill(failed
          ? { status: 503, contentType: 'text/plain', body: 'controlled image failure' }
          : { status: 200, contentType: 'image/png', body: png });
      }
      let data = [];
      if (url.pathname.endsWith('/kc_get_feed_cursor')) data = { posts: [row], nextCursor: null, hasMore: false };
      else if (url.pathname.endsWith('/kc_get_top_contributors')) data = [{ user_id: authorId, display_name: author.display_name, avatar_url: original, score: 42 }];
      else if (url.pathname.endsWith('/posts')) data = [row];
      else if (url.pathname.endsWith('/profiles')) data = [author];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      if (request.isNavigationRequest() && (url.pathname === '/' || url.pathname === '/index.html')) {
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
      }
      if (url.pathname === '/api/og-image') {
        const mediaUrl = url.pathname + url.search;
        imageRequests.push(mediaUrl);
        const failed = mediaUrl === thumbnail && failThumbnail;
        return route.fulfill(failed
          ? { status: 503, contentType: 'text/plain', body: 'controlled image failure' }
          : { status: 200, contentType: 'image/png', body: png });
      }
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
  // Real HTML, defer ordering, SDK, adapters, feed controller and ranking boot.
  // Only fictional HTTP responses are replaced; no renderer/API globals mocked.
  await page.goto('/');
  const feed = page.locator('.kc-card__author > img').first();
  const ranking = page.locator('[data-kc-ranking-container] img').first();
  await expect(feed).toHaveCount(1);
  await expect(ranking).toHaveCount(1);
  await expect.poll(() => feed.evaluate((image) => image.complete)).toBe(true);
  await expect.poll(() => ranking.evaluate((image) => image.complete)).toBe(true);
  return { feed, ranking, imageRequests, pageErrors };
}

test('full cold home boot shares one thumbnail between feed and ranking without an eager original', async ({ page }) => {
  const fixture = await bootHome(page);
  for (const image of [fixture.feed, fixture.ranking]) {
    await expect(image).toHaveAttribute('src', thumbnail);
    expect(await image.evaluate((element) => element.naturalWidth)).toBe(144);
    expect(await image.evaluate((element) => element.naturalWidth >= element.getBoundingClientRect().width * devicePixelRatio)).toBe(true);
  }
  expect((await fixture.feed.boundingBox()).width).toBe(20);
  expect(fixture.imageRequests.filter((url) => url === thumbnail)).toHaveLength(1);
  expect(fixture.imageRequests.filter((url) => url === original)).toHaveLength(0);
  expect(fixture.pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__feedAvatarCspViolations)).toEqual([]);
  await expect(page.locator('.kc-card__title').first()).toContainText('Publicação de teste');
  expect(await page.evaluate(async () => (await window.KCAPI.getFeedCursor({})).posts[0].autorAvatar)).toBe(original);
});

for (const failOriginal of [false, true]) {
  test(`full home boot falls back once under CSP after thumbnail 503 (original fails: ${failOriginal})`, async ({ page }) => {
    const fixture = await bootHome(page, { failThumbnail: true, failOriginal });
    const requestsBeforeRepeatedError = fixture.imageRequests.length;
    for (const image of [fixture.feed, fixture.ranking]) {
      await expect(image).toHaveAttribute('src', original);
      expect(await image.evaluate((element) => element.naturalWidth)).toBe(failOriginal ? 0 : 144);
      await image.evaluate((element) => element.dispatchEvent(new Event('error')));
      await expect(image).toHaveAttribute('src', original);
    }
    const originalRequests = fixture.imageRequests.filter((url) => url === original).length;
    // Successful originals share the decoded image. A 503 is not cacheable and
    // the browser may fetch once per independently mounted consumer, never loop.
    if (failOriginal) {
      expect(originalRequests).toBeGreaterThanOrEqual(1);
      expect(originalRequests).toBeLessThanOrEqual(2);
    } else expect(originalRequests).toBe(1);
    expect(fixture.imageRequests).toHaveLength(requestsBeforeRepeatedError);
    expect(fixture.pageErrors).toEqual([]);
    expect(await page.evaluate(() => window.__feedAvatarCspViolations)).toEqual([]);
    await expect(fixture.feed).not.toHaveAttribute('data-kc-feed-avatar-original', original);
  });
}

test('dynamic cards handle immediate image errors and never overwrite a newer src', async ({ page }) => {
  const fixture = await bootHome(page, { failThumbnail: true });
  await page.evaluate(({ postId, authorId, original }) => {
    const container = document.createElement('div');
    container.id = 'feed-avatar-dynamic';
    document.body.appendChild(container);
    container.insertAdjacentHTML('beforeend', window.KCUtils.renderPostCard({
      id: postId, modulo: 'eventos', titulo: 'Dinâmico', descricao: 'Teste', authorId,
      autor: 'Ana Campus', autorAvatar: original, imagens: [],
    }));
  }, { postId, authorId, original });
  const dynamic = page.locator('#feed-avatar-dynamic .kc-card__author > img');
  await expect(dynamic).toHaveAttribute('src', original);
  await expect.poll(() => dynamic.evaluate((image) => image.complete && image.naturalWidth)).toBe(144);
  const countBefore = fixture.imageRequests.length;
  const replacement = origin + '/storage/v1/object/public/kino-media/profile-avatars/author/replacement.png';
  await dynamic.evaluate((image, { original, thumbnail, replacement }) => {
    image.setAttribute('data-kc-feed-avatar-original', original);
    image.setAttribute('data-kc-feed-avatar-thumbnail', thumbnail);
    image.src = replacement;
    image.dispatchEvent(new Event('error'));
  }, { original, thumbnail, replacement });
  await expect(dynamic).toHaveAttribute('src', replacement);
  await expect.poll(() => dynamic.evaluate((image) => image.complete && image.naturalWidth)).toBe(144);
  expect(fixture.imageRequests.slice(countBefore)).toEqual([replacement]);
  expect(fixture.pageErrors).toEqual([]);
});
