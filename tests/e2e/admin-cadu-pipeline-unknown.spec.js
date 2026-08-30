const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'http://cadu-snapshot.test';
const RUN_ID = '00000000-0000-4000-8000-000000000012';
const controller = fs.readFileSync(path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'assets/js/core/kc-i18n.js'), 'utf8');
// Keep the real page DOM/styles; start only the controller and tooltip module
// under test. All HTTP is intercepted, including assets and authenticated GETs.
const html = fs.readFileSync(path.join(ROOT, 'admin/cadu.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

test.use({ serviceWorkers: 'block' });

function snapshot({ active = false, expired = false, criticalHealth = false } = {}) {
  const now = Date.now();
  const script = 'scripts/pipeline-kino.js';
  return {
    contract_version: 'cadu-pipeline-control-v1',
    generated_at: new Date(now - (expired ? 60000 : 0)).toISOString(),
    capabilities: { explicit_dry_run: true, explicit_run_mode_routes: true, full_run_dry_run_optional: true },
    active_run: active ? {
      id: RUN_ID, stage: 'all', status: 'running', effective_status: 'running',
      started_at: Math.floor(now / 1000) - 30, dry_run: false,
    } : null,
    history: [],
    stages: [{
      id: 'all', name: 'Pipeline Completa', description: 'Fixture offline de estado operacional.',
      script, estimated_sec: 900, category: 'process', last_run: null,
      preflight: {
        stage: 'all', checked_at: now / 1000, can_run: true, command: `node ${script} all`,
        profile: {
          risk: 'high', mode: 'pipeline', dry_run_available: true, default_dry_run: false,
          force_dry_run: false, mutates_platform: true, effects: ['supabase_write'], notes: [],
        },
        checks: [{ id: 'script', label: 'Script do estágio', detail: script, blocking: true, status: 'ok' }],
        blockers: [], warnings: [],
        script: { exists: true, path: `/offline/${script}`, relative_path: script },
      },
    }],
    health: {
      status: criticalHealth ? 'critical' : 'ok', level: criticalHealth ? 'critical' : 'ok',
      seconds_since_successful_all: criticalHealth ? 43200 : 60,
      failures_recent_count: 0,
      issues: criticalHealth ? ['Recorrência: última execução completa bem-sucedida há 12 horas.'] : [],
    },
  };
}

async function offlinePipeline(page) {
  let release;
  const firstReply = new Promise((resolve) => { release = resolve; });
  let reply;
  let pipelineGets = 0;
  const writes = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const session = {
      access_token: 'offline-admin-fixture',
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test' },
    };
    const profile = {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: { is_admin: true, email: session.user.email }, error: null }; },
    };
    const client = {
      auth: { async getSession() { return { data: { session } }; } },
      from() { return profile; },
    };
    window.KC_ENV = { driver: 'supabase' };
    window.KCSupabase = {
      async refreshSession() { return session; }, getSession() { return session; },
      async getCurrentUser() { return session.user; }, getUser() { return session.user; },
      getClient() { return client; },
    };
    localStorage.setItem('kc:cadu:tab', 'pipeline');
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/admin/cadu.html') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/api/cadu/pipeline') {
      pipelineGets += 1;
      return route.fulfill(reply || await firstReply);
    }
    if (url.pathname.startsWith('/api/cadu/pipeline/')) {
      if (url.pathname.endsWith('/log')) return route.fulfill({ json: { content: 'Log offline da execução ativa.' } });
      // Use the normal polling fallback instead of a live SSE connection.
      if (url.pathname.endsWith('/stream')) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: {} });
    }
    if (url.pathname === '/api/cadu/health') return route.fulfill({ json: { status: 'ok', ts: Date.now() / 1000 } });
    if (url.pathname === '/api/cadu/sites') return route.fulfill({ json: [] });
    if (url.pathname.startsWith('/api/cadu/')) return route.fulfill({ json: { items: [], total: 0, sources: [], entities: [] } });
    const asset = path.resolve(ROOT, `.${url.pathname}`);
    if (url.pathname.startsWith('/assets/') && asset.startsWith(ROOT + path.sep) && fs.existsSync(asset) && fs.statSync(asset).isFile()) {
      return route.fulfill({ path: asset });
    }
    return route.abort();
  });
  await page.goto(`${ORIGIN}/admin/cadu.html`, { waitUntil: 'domcontentloaded' });
  return {
    writes, errors,
    async start() {
      await page.addScriptTag({ content: i18n });
      await page.addScriptTag({ content: controller });
      await expect(page.getByRole('tab', { name: /Pipeline/ })).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => pipelineGets).toBeGreaterThan(0);
    },
    respond(response) { reply = response; release(response); },
  };
}

async function expectUnknown(page, { cold = false } = {}) {
  await expect(page.locator('#pipeline-active-card')).toContainText('Aguardando um snapshot operacional válido');
  await expect(page.locator('#pipeline-active-status')).not.toContainText('nenhuma execução ativa');
  if (cold) await expect(page.locator('#pipeline-status-dot')).not.toHaveAttribute('title');
  else await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('title', /desconhecido/);
  await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('aria-describedby', 'pipeline-active-status');
  await expect(page.locator('#pipeline-status-dot')).not.toHaveAttribute('data-i18n-tooltip');
  await expect(page.locator('[data-stop]')).toHaveCount(0);
}

async function attachSnapshot(page, name) {
  const dom = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector).textContent.trim().replace(/\s+/g, ' ');
    return {
      activeCard: text('#pipeline-active-card'),
      liveRegion: text('#pipeline-active-status'),
      tooltip: document.querySelector('#pipeline-status-dot').title,
      health: text('#pipeline-health-card'),
      actions: Array.from(document.querySelectorAll('#pipeline-stages-list .kc-pipeline-stage__btn'))
        .map((button) => ({ label: button.textContent.trim(), disabled: button.disabled })),
    };
  });
  await test.info().attach(name, { body: JSON.stringify(dom, null, 2), contentType: 'application/json' });
}

test.afterEach(async ({ page }) => {
  await attachSnapshot(page, 'final-offline-dom');
});

test('cold HTML and an outstanding GET remain unknown, including translated tooltips', async ({ page }) => {
  const fixture = await offlinePipeline(page);
  await expectUnknown(page, { cold: true });
  await attachSnapshot(page, 'cold-html');
  await fixture.start();
  await expectUnknown(page);
  await attachSnapshot(page, 'get-pending');
  await expect(page.locator('#pipeline-stages-list')).toContainText('Carregando');
  fixture.respond({ status: 502, json: { error: 'cadu_api_unreachable' } });
  await expect(page.locator('#pipeline-health-card')).toContainText('indisponível');
  await expectUnknown(page);
  expect(fixture.writes).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const status of [502, 504]) {
  test(`initial HTTP ${status} cannot claim idle; a later valid empty snapshot can`, async ({ page }) => {
    const fixture = await offlinePipeline(page);
    await fixture.start();
    fixture.respond({ status, json: { error: status === 504 ? 'cadu_api_timeout' : 'cadu_api_unreachable' } });
    await expect(page.locator('#pipeline-active-status')).toContainText('controle indisponível');
    await expectUnknown(page);
    await attachSnapshot(page, `http-${status}-unknown`);
    fixture.respond({ json: snapshot() });
    await page.locator('#cadu-refresh-btn').click();
    await expect(page.locator('#pipeline-active-card')).toContainText('Nenhuma execução ativa.');
    await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('title', 'Sem execução ativa');
    await expect(page.locator('#pipeline-active-status')).toHaveText('Pipeline: nenhuma execução ativa.');
    expect(fixture.writes).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test('a successful GET with an expired control snapshot remains unknown', async ({ page }) => {
  const fixture = await offlinePipeline(page);
  await fixture.start();
  fixture.respond({ json: snapshot({ expired: true }) });
  await expect(page.locator('#pipeline-active-status')).toContainText('controle indisponível');
  await expectUnknown(page);
  await expect(page.locator('#pipeline-stages-list')).toContainText('Controles bloqueados');
  for (const action of await page.locator('#pipeline-stages-list .kc-pipeline-stage__btn').all()) {
    await expect(action).toBeDisabled();
  }
  expect(fixture.writes).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test('a stale last-known idle snapshot qualifies the tooltip instead of asserting current idle', async ({ page }) => {
  const fixture = await offlinePipeline(page);
  await fixture.start();
  fixture.respond({ json: snapshot() });
  await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('title', 'Sem execução ativa');
  fixture.respond({ status: 504, json: { error: 'cadu_api_timeout' } });
  await page.locator('#cadu-refresh-btn').click();
  await expect(page.locator('#pipeline-active-status')).toContainText('controle indisponível');
  await expect(page.locator('#pipeline-active-card')).toContainText('na última visão válida');
  await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('title', /desconhecido.*desatualizado/);
  expect(fixture.writes).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test('an active run stays active despite old critical recurrence health and tooltip refresh', async ({ page }) => {
  const fixture = await offlinePipeline(page);
  await fixture.start();
  fixture.respond({ json: snapshot({ active: true, criticalHealth: true }) });
  await expect(page.locator('#pipeline-active-card')).toHaveClass(/is-running/);
  await expect(page.locator('#pipeline-active-status')).toContainText('em execução');
  await expect(page.locator('#pipeline-health-card')).toContainText('crítico');
  await expect(page.locator('#pipeline-health-card')).toContainText('12 horas');
  const tooltip = await page.locator('#pipeline-status-dot').getAttribute('title');
  expect(tooltip).toMatch(/^em execução/);
  await page.evaluate(() => window.KCi18n.applyTooltips(document));
  await expect(page.locator('#pipeline-status-dot')).toHaveAttribute('title', tooltip);
  await expect(page.locator(`[data-stop="${RUN_ID}"]`)).toBeEnabled();
  // New-run actions remain blocked while an execution exists; never click a write.
  const actions = page.locator('#pipeline-stages-list .kc-pipeline-stage__btn');
  expect(await actions.count()).toBeGreaterThan(0);
  for (const action of await actions.all()) await expect(action).toBeDisabled();
  expect(fixture.writes).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
