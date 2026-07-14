'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
const manifest = require('../../scripts/admin-pages.manifest');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function createTimerHarness() {
  const timers = [];
  let nextId = 1;
  return {
    setTimeout(callback, delay) {
      const timer = { id: nextId++, callback, delay, active: true };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(timerId) {
      const timer = timers.find((item) => item.id === timerId);
      if (timer) timer.active = false;
    },
    run(delay) {
      const timer = timers.find((item) => item.active && item.delay === delay);
      if (!timer) throw new Error(`No active timer found for ${delay}ms`);
      timer.active = false;
      timer.callback();
    },
    hasPending(delay) {
      return timers.some((item) => item.active && item.delay === delay);
    },
  };
}

async function flushMicrotasks(turns = 8) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

function createTimedGoogleTagRuntime(invoke) {
  const source = read('assets/js/boot/kc-google-tag.js');
  const calls = [];
  const listeners = {};
  const timers = createTimerHarness();
  const context = {
    window: {
      dataLayer: [],
      KCSupabase: {
        getClient: () => ({
          functions: {
            invoke: invoke || (() => Promise.resolve({ data: null, error: null })),
          },
        }),
      },
      location: {
        origin: 'https://www.kinocampus.com.br',
        href: 'https://www.kinocampus.com.br/',
      },
      KCConsent: { hasConsent: (category) => category === 'analytics' },
      addEventListener: () => {},
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
    document: {
      title: 'Kino Campus',
      referrer: '',
      addEventListener: (name, handler) => { listeners[name] = handler; },
      getElementById: () => null,
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
      head: { appendChild: () => {} },
    },
    encodeURIComponent,
    Date,
    Promise,
    URL,
  };
  context.window.dataLayer.push = function push(args) {
    calls.push(Array.from(args));
    return Array.prototype.push.call(this, args);
  };

  vm.runInNewContext(source, context);
  return { calls, context, listeners, timers };
}

describe('Google tag e consentimento LGPD', () => {
  test('todas as paginas carregam Google tag depois do consentimento e antes da telemetria', () => {
    manifest.ALL_HTML_PAGES.forEach((file) => {
      const html = read(file);
      const consent = html.indexOf('kc-consent.js');
      const googleTag = html.indexOf('kc-google-tag.js');
      const telemetry = html.indexOf('kc-telemetry.js');

      expect(consent).toBeGreaterThan(-1);
      expect(googleTag).toBeGreaterThan(consent);
      expect(telemetry).toBeGreaterThan(googleTag);
    });
  });

  test('CSP permite Google Tag Manager e GA4', () => {
    const vercel = read('vercel.json');

    expect(vercel).toContain('https://www.googletagmanager.com');
    expect(vercel).toContain('https://www.google-analytics.com');
    expect(vercel).toContain('https://region1.google-analytics.com');
  });

  test('script usa Consent Mode negado por padrao e libera analytics/publicidade por KCConsent', () => {
    const source = read('assets/js/boot/kc-google-tag.js');

    expect(source).toContain("MEASUREMENT_ID = 'G-P9RKYHPB7Z'");
    expect(source).toContain("window.gtag('consent', 'default', consentPayload(false, false));");
    expect(source).toContain("gtag('consent', 'update', consentPayload(analyticsGranted, advertisingGranted));");
    expect(source).toContain("window.KCConsent.hasConsent('analytics')");
    expect(source).toContain("window.KCConsent.hasConsent('advertising')");
    expect(source).toContain("ad_storage: advertisingGranted ? 'granted' : 'denied'");
    expect(source).toContain("ad_user_data: 'denied'");
    expect(source).toContain("ad_personalization: 'denied'");
    expect(source).toContain('allow_google_signals: false');
    expect(source).toContain('allow_ad_personalization_signals: false');
  });

  test('runtime nao configura page_view quando analytics esta negado', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    const listeners = {};
    let insertedScripts = 0;
    const context = {
      window: {
        dataLayer: [],
        location: {
          origin: 'https://www.kinocampus.com.br',
          href: 'https://www.kinocampus.com.br/',
        },
        KCConsent: { hasConsent: () => false },
        addEventListener: (name, handler) => { listeners[name] = handler; },
      },
      document: {
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
        head: { appendChild: () => {} },
      },
      encodeURIComponent,
      Date,
      URL,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);

    expect(calls.some((call) => call[0] === 'consent' && call[1] === 'default')).toBe(true);
    expect(calls.some((call) => call[0] === 'config')).toBe(false);
    expect(insertedScripts).toBe(0);
    expect(context.window.KCGoogleTag.hasAnalyticsConsent()).toBe(false);
  });

  test.each([
    ['localhost', 'http://localhost:3000/index.html'],
    ['preview', 'https://kino-campus-git-demo.vercel.app/index.html'],
    ['admin', 'https://www.kinocampus.com.br/admin/index.html'],
  ])('nao carrega nem configura GA4 em %s', async (_label, href) => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    let insertedScripts = 0;
    const context = {
      window: {
        dataLayer: [],
        location: { href, origin: new URL(href).origin },
        KCConsent: { hasConsent: () => true },
        addEventListener: () => {},
      },
      document: {
        title: 'Ambiente fora da coleta',
        referrer: '',
        addEventListener: () => {},
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => { insertedScripts += 1; } } }],
        head: { appendChild: () => { insertedScripts += 1; } },
      },
      encodeURIComponent,
      Date,
      Promise,
      URL,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);

    expect(context.window.KCGoogleTag.isCollectionContextAllowed()).toBe(false);
    expect(context.window.gtag).toBeUndefined();
    expect(insertedScripts).toBe(0);
    expect(calls).toHaveLength(0);
    await expect(context.window.KCGoogleTag.setUserId('4b39baaf-996b-49ca-a603-b122066946dd')).resolves.toBeNull();
  });

  test('envia um unico page_view manual com URL e referrer sanitizados', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    let insertedScripts = 0;
    const context = {
      window: {
        dataLayer: [],
        location: {
          origin: 'https://www.kinocampus.com.br',
          href: 'https://www.kinocampus.com.br/auth-callback.html?code=oauth-secret&utm_source=google#access_token=secret',
        },
        KCConsent: { hasConsent: (category) => category === 'analytics' },
        addEventListener: () => {},
      },
      document: {
        title: 'Callback privado',
        referrer: 'https://accounts.google.com/path?email=user@example.com',
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => { insertedScripts += 1; } } }],
        head: { appendChild: () => { insertedScripts += 1; } },
      },
      encodeURIComponent,
      Date,
      URL,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);
    context.window.KCGoogleTag.updateConsent();

    const config = calls.find((call) => call[0] === 'config');
    const pageViews = calls.filter((call) => call[0] === 'event' && call[1] === 'page_view');

    expect(config[2].send_page_view).toBe(false);
    expect(config[2].allow_google_signals).toBe(false);
    expect(config[2].campaign_source).toBe('google');
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0][2].page_location).toBe('https://www.kinocampus.com.br/auth-callback.html');
    expect(pageViews[0][2].page_referrer).toBe('https://accounts.google.com/');
    expect(pageViews[0][2].page_location).not.toMatch(/code|token|secret/);
  });

  test('preserva somente UTM segura como configuracao de campanha e descarta IDs de publicidade', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const context = {
      window: {
        location: { origin: 'https://www.kinocampus.com.br' },
      },
      document: {},
      Date,
      URL,
    };

    vm.runInNewContext(source, context);
    const campaign = context.window.KCGoogleTag.readCampaignConfig(
      'https://www.kinocampus.com.br/?utm_source=newsletter&utm_medium=email&utm_campaign=kc-boas-vindas&gclid=ad-id&utm_content=user%40example.com&utm_term=nome-aluno'
    );

    expect(campaign).toMatchObject({
      campaign_source: 'newsletter',
      campaign_medium: 'email',
      campaign_name: 'kc-boas-vindas',
    });
    expect(campaign).not.toHaveProperty('gclid');
    expect(campaign).not.toHaveProperty('campaign_content');
    expect(campaign).not.toHaveProperty('campaign_term');
    expect(context.window.KCGoogleTag.readCampaignConfig(
      'https://www.kinocampus.com.br/?utm_source=nome-aluno&utm_campaign=turma-fulano'
    )).toEqual({});
  });

  test('substitui titulos de conteudo gerado por usuario por rotulos seguros', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    const context = {
      window: {
        dataLayer: [],
        location: {
          origin: 'https://www.kinocampus.com.br',
          href: 'https://www.kinocampus.com.br/product.html?id=43',
        },
        KCConsent: { hasConsent: (category) => category === 'analytics' },
        addEventListener: () => {},
      },
      document: {
        title: 'Contato user@example.com no WhatsApp',
        referrer: '',
        addEventListener: () => {},
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
        head: { appendChild: () => {} },
      },
      encodeURIComponent,
      Date,
      URL,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);
    const pageView = calls.find((call) => call[0] === 'event' && call[1] === 'page_view');

    expect(pageView[2].page_title).toBe('KinoCampus \u2014 Publica\u00e7\u00e3o');
    expect(JSON.stringify(calls)).not.toContain('user@example.com');
  });

  test('mantem apenas o identificador de publicacao em pagina publica', () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const context = {
      window: {
        dataLayer: [],
        location: {
          origin: 'https://www.kinocampus.com.br',
          href: 'https://www.kinocampus.com.br/search-results.html?q=nome%40example.com',
        },
        KCConsent: { hasConsent: () => false },
        addEventListener: () => {},
      },
      document: {
        title: '',
        referrer: '',
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
        head: { appendChild: () => {} },
      },
      encodeURIComponent,
      Date,
      URL,
    };

    vm.runInNewContext(source, context);

    expect(context.window.KCGoogleTag.sanitizePageUrl(context.window.location.href))
      .toBe('https://www.kinocampus.com.br/search-results.html');
    expect(context.window.KCGoogleTag.sanitizePageUrl(
      'https://www.kinocampus.com.br/product.html?id=4b39baaf-996b-49ca-a603-b122066946dd&with=user-id'
    )).toBe('https://www.kinocampus.com.br/product.html?id=4b39baaf-996b-49ca-a603-b122066946dd');
  });

  test('aguarda o User-ID pseudonimo antes do page_view inicial autenticado', async () => {
    const subjectId = 'kc_0123456789abcdef0123456789abcdef';
    const userId = '4b39baaf-996b-49ca-a603-b122066946dd';
    let resolveSubject;
    let invokeCalls = 0;
    const subjectResponse = new Promise((resolve) => { resolveSubject = resolve; });
    const runtime = createTimedGoogleTagRuntime((name) => {
      invokeCalls += 1;
      expect(name).toBe('kc-analytics-subject-id');
      return subjectResponse;
    });

    expect(runtime.timers.hasPending(250)).toBe(true);
    expect(runtime.calls.some((call) => call[0] === 'event' && call[1] === 'page_view')).toBe(false);

    runtime.listeners['kc:authchange']({ detail: { user: { id: userId } } });
    await flushMicrotasks();

    expect(invokeCalls).toBe(1);
    expect(runtime.timers.hasPending(750)).toBe(true);
    expect(runtime.calls.some((call) => call[0] === 'event' && call[1] === 'page_view')).toBe(false);

    resolveSubject({ data: { ok: true, subjectId }, error: null });
    await flushMicrotasks();

    const userIdIndex = runtime.calls.findIndex(
      (call) => call[0] === 'set' && call[1] && call[1].user_id === subjectId
    );
    const pageViewIndex = runtime.calls.findIndex(
      (call) => call[0] === 'event' && call[1] === 'page_view'
    );
    expect(userIdIndex).toBeGreaterThan(-1);
    expect(pageViewIndex).toBeGreaterThan(userIdIndex);
    expect(runtime.calls.filter((call) => call[0] === 'event' && call[1] === 'page_view')).toHaveLength(1);
  });

  test('libera anonimos assim que o estado auth e conhecido e limita a descoberta a 250ms', async () => {
    const knownAnonymous = createTimedGoogleTagRuntime();
    expect(knownAnonymous.timers.hasPending(250)).toBe(true);

    knownAnonymous.listeners['kc:authchange']({ detail: { user: null } });
    await flushMicrotasks();

    expect(knownAnonymous.timers.hasPending(250)).toBe(false);
    expect(knownAnonymous.calls.filter(
      (call) => call[0] === 'event' && call[1] === 'page_view'
    )).toHaveLength(1);

    const noAuthSignal = createTimedGoogleTagRuntime();
    noAuthSignal.timers.run(250);
    await flushMicrotasks();
    expect(noAuthSignal.calls.filter(
      (call) => call[0] === 'event' && call[1] === 'page_view'
    )).toHaveLength(1);
  });

  test('nao perde o page_view se a resolucao do User-ID ultrapassar 750ms', async () => {
    const userId = '4b39baaf-996b-49ca-a603-b122066946dd';
    const unresolvedSubject = new Promise(() => {});
    const runtime = createTimedGoogleTagRuntime(() => unresolvedSubject);

    runtime.listeners['kc:authchange']({ detail: { user: { id: userId } } });
    await flushMicrotasks();
    expect(runtime.timers.hasPending(750)).toBe(true);

    runtime.timers.run(750);
    await flushMicrotasks();

    expect(runtime.calls.filter(
      (call) => call[0] === 'event' && call[1] === 'page_view'
    )).toHaveLength(1);
  });

  test('User-ID usa HMAC opaco do servidor, respeita consentimento e limpa no logout', async () => {
    const source = read('assets/js/boot/kc-google-tag.js');
    const calls = [];
    let analyticsConsent = true;
    let invokeCalls = 0;
    let serverSubjectId = 'kc_0123456789abcdef0123456789abcdef';
    const userA = '4b39baaf-996b-49ca-a603-b122066946dd';
    const userB = 'cc9af9be-ae6c-4abd-a83a-84c024bbfc8c';
    const context = {
      window: {
        dataLayer: [],
        KCSupabase: {
          getClient: () => ({
            functions: {
              invoke: async (name) => {
                invokeCalls += 1;
                expect(name).toBe('kc-analytics-subject-id');
                return { data: { ok: true, subjectId: serverSubjectId }, error: null };
              },
            },
          }),
        },
        location: {
          origin: 'https://www.kinocampus.com.br',
          href: 'https://www.kinocampus.com.br/',
        },
        KCConsent: { hasConsent: (category) => category === 'analytics' && analyticsConsent },
        addEventListener: () => {},
      },
      document: {
        title: 'Kino Campus',
        referrer: '',
        addEventListener: () => {},
        getElementById: () => null,
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
        head: { appendChild: () => {} },
      },
      encodeURIComponent,
      Date,
      Promise,
      URL,
    };
    context.window.dataLayer.push = function push(args) {
      calls.push(Array.from(args));
      return Array.prototype.push.call(this, args);
    };

    vm.runInNewContext(source, context);
    const hashedId = await context.window.KCGoogleTag.setUserId(userA);
    const setCall = calls.filter((call) => call[0] === 'set').at(-1);

    expect(hashedId).toBe(serverSubjectId);
    expect(setCall[1].user_id).toBe(serverSubjectId);
    expect(invokeCalls).toBe(1);
    await context.window.KCGoogleTag.setUserId(userA);
    expect(invokeCalls).toBe(1);
    expect(source).not.toContain('crypto.subtle.digest');
    expect(source).not.toContain("'kino-ga4:'");

    analyticsConsent = false;
    context.window.KCGoogleTag.updateConsent();
    expect(calls.filter((call) => call[0] === 'set').at(-1)[1].user_id).toBeNull();

    await context.window.KCGoogleTag.setUserId(userA);
    expect(invokeCalls).toBe(1);

    analyticsConsent = true;
    context.window.KCGoogleTag.updateConsent();
    await context.window.KCGoogleTag.setUserId(userA);
    expect(invokeCalls).toBe(2);
    expect(calls.filter((call) => call[0] === 'set').at(-1)[1].user_id).toBe(serverSubjectId);

    serverSubjectId = 'kc_abcdef0123456789abcdef0123456789';
    await context.window.KCGoogleTag.setUserId(userB);
    expect(invokeCalls).toBe(3);
    expect(calls.filter((call) => call[0] === 'set').at(-1)[1].user_id).toBe(serverSubjectId);
    expect(JSON.stringify(calls)).not.toContain(userA);
    expect(JSON.stringify(calls)).not.toContain(userB);

    await context.window.KCGoogleTag.setUserId(null);
    expect(calls.filter((call) => call[0] === 'set').at(-1)[1].user_id).toBeNull();
  });
});
