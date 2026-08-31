const CACHE_KEY = 'kc:hero-banners:v2:public';
const TEN_MINUTES = 10 * 60 * 1000;
const ROWS = [{
  id: 'public-banner',
  title: 'Evento da comunidade',
  pill_text: 'Destaque',
  subtitle: 'Inscrições abertas',
  button_text: 'Ver evento',
  button_url: 'eventos.html',
  icon_class: 'fas fa-calendar-alt',
  gradient_from: '#111111',
  gradient_to: '#222222',
  sort_order: 1,
}];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mockClient(response) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockImplementation((column) => (
      column === 'created_at' ? response : query
    )),
  };
  return { from: jest.fn(() => query), query };
}

describe('KCBanners public load coalescing', () => {
  let banners;
  let listeners;

  beforeEach(() => {
    document.body.innerHTML = [
      '<div class="kc-hero-carousel kc-hero-loading" aria-busy="true">',
      '<div id="kc-hero-slides"></div>',
      '<div id="kc-carousel-dots"></div>',
      '</div>',
    ].join('');
    localStorage.clear();
    window.KC_ENV = { DATA_DRIVER: 'supabase' };
    delete window.KCSessionStore;
    delete window.KCSupabase;
    window.kcRefreshHeroCarousel = jest.fn();
    listeners = {};
    const register = jest.spyOn(document, 'addEventListener').mockImplementation((name, callback) => {
      listeners[name] = callback;
    });
    jest.isolateModules(() => { banners = require('../../assets/js/features/kc-banners.js'); });
    register.mockRestore();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    delete window.KC_ENV;
    delete window.KCSupabase;
    delete window.KCSessionStore;
    delete window.KCBanners;
    delete window.kcRefreshHeroCarousel;
  });

  function useClient(client) {
    window.KCSupabase = { getClient: jest.fn(() => client) };
  }

  function cacheRows(age) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: 2,
      timestamp: Date.now() - age,
      banners: ROWS,
      signature: banners.buildBannerSignature(ROWS),
    }));
  }

  test('concurrent calls share one request, render once, and preserve the public query', async () => {
    const pending = deferred();
    const client = mockClient(pending.promise);
    useClient(client);

    const first = banners.loadBanners();
    const second = banners.loadBanners();
    const third = banners.loadBanners();
    expect(first).toBe(second);
    expect(second).toBe(third);
    await Promise.resolve();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('hero_banners');
    expect(client.query.select).toHaveBeenCalledWith('id, pill_text, title, subtitle, button_text, button_url, icon_class, gradient_from, gradient_to, sort_order');
    expect(client.query.eq).toHaveBeenCalledWith('is_active', true);
    expect(client.query.order.mock.calls).toEqual([
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
    ]);

    pending.resolve({ data: ROWS, error: null });
    await Promise.all([first, second, third]);
    expect(document.querySelectorAll('.kc-hero-banner')).toHaveLength(1);
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe(ROWS[0].title);
    expect(document.querySelector('.kc-btn-primary').getAttribute('href')).toBe(ROWS[0].button_url);
    expect(document.querySelector('.kc-btn-primary').dataset.kcHeroCtaBound).toBe('true');
    expect(window.kcRefreshHeroCarousel).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).banners).toEqual(ROWS);
  });

  test('DOMContentLoaded and authchange during startup share the public load', async () => {
    const pending = deferred();
    const client = mockClient(pending.promise);
    useClient(client);
    const register = jest.spyOn(document, 'addEventListener').mockImplementation((name, callback) => {
      listeners[name] = callback;
    });
    listeners.DOMContentLoaded();
    register.mockRestore();
    listeners['kc:authchange']();
    listeners['kc:authchange']();
    const completion = banners.loadBanners();
    await Promise.resolve();
    expect(client.from).toHaveBeenCalledTimes(1);
    pending.resolve({ data: ROWS, error: null });
    await completion;
    expect(window.kcRefreshHeroCarousel).toHaveBeenCalledTimes(1);
  });

  test.each(['response-error', 'rejection', 'empty'])('releases the pending load after %s and permits a later retry', async (outcome) => {
    const pending = deferred();
    const firstClient = mockClient(pending.promise);
    useClient(firstClient);
    const first = banners.loadBanners();
    const concurrent = banners.loadBanners();
    if (outcome === 'rejection') pending.reject(new Error('temporary network error'));
    else pending.resolve(outcome === 'empty'
      ? { data: [], error: null }
      : { data: null, error: { message: 'temporary API error' } });
    await Promise.all([first, concurrent]);
    expect(firstClient.from).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-hero-banner')).toBeNull();
    expect(document.querySelector('.kc-hero-carousel').getAttribute('aria-busy')).toBe('false');
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();

    const retryClient = mockClient(Promise.resolve({ data: ROWS, error: null }));
    useClient(retryClient);
    const retry = banners.loadBanners();
    expect(retry).not.toBe(first);
    await retry;
    expect(retryClient.from).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe(ROWS[0].title);
  });

  test('fresh cache still avoids the network, then revalidates after the existing TTL', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    cacheRows(TEN_MINUTES - 1);
    const client = mockClient(Promise.resolve({ data: [{ ...ROWS[0], title: 'Evento atualizado' }], error: null }));
    useClient(client);
    await banners.loadBanners();
    expect(client.from).not.toHaveBeenCalled();
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe(ROWS[0].title);

    clock.mockReturnValue(now + 2);
    await banners.loadBanners();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe('Evento atualizado');
  });

  test('stale cache remains rendered during one shared request and survives a temporary failure', async () => {
    cacheRows(TEN_MINUTES + 1);
    const originalCache = localStorage.getItem(CACHE_KEY);
    const pending = deferred();
    const client = mockClient(pending.promise);
    useClient(client);
    const first = banners.loadBanners();
    const second = banners.loadBanners();
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe(ROWS[0].title);
    pending.resolve({ data: null, error: { message: 'temporary API error' } });
    await Promise.all([first, second]);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(window.kcRefreshHeroCarousel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe(ROWS[0].title);
    expect(localStorage.getItem(CACHE_KEY)).toBe(originalCache);

    useClient(mockClient(Promise.resolve({ data: [], error: null })));
    await banners.loadBanners();
    expect(document.querySelector('.kc-hero-banner')).toBeNull();
  });

  test('missing client does not leave the load locked when the SDK becomes available later', async () => {
    const first = banners.loadBanners();
    expect(banners.loadBanners()).toBe(first);
    await first;
    const client = mockClient(Promise.resolve({ data: ROWS, error: null }));
    useClient(client);
    await banners.loadBanners();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.kc-hero-banner')).not.toBeNull();
  });

  test('an unexpected cache failure rejects callers but releases the pending load', async () => {
    window.KCSessionStore = { get: jest.fn(() => { throw new Error('cache unavailable'); }) };
    const first = banners.loadBanners();
    expect(banners.loadBanners()).toBe(first);
    await expect(first).rejects.toThrow('cache unavailable');

    delete window.KCSessionStore;
    const client = mockClient(Promise.resolve({ data: ROWS, error: null }));
    useClient(client);
    await expect(banners.loadBanners()).resolves.toBeUndefined();
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  test('local mode still hydrates authoring markup without requesting Supabase', async () => {
    window.KC_ENV.DATA_DRIVER = 'local';
    document.getElementById('kc-hero-slides').innerHTML = [
      '<div class="kc-hero-banner"><div class="kc-hero-inner">',
      '<div class="kc-hero-content"><h1>Banner local</h1></div>',
      '<div class="kc-hero-illustration"><i class="fas fa-campground"></i></div>',
      '</div></div>',
    ].join('');
    const client = mockClient(Promise.resolve({ data: [], error: null }));
    useClient(client);
    await Promise.all([banners.loadBanners(), banners.loadBanners()]);
    expect(client.from).not.toHaveBeenCalled();
    expect(document.querySelector('.kc-hero-banner h1').textContent).toBe('Banner local');
    expect(document.querySelectorAll('.kc-hero-illustration-mobile')).toHaveLength(1);
  });
});
