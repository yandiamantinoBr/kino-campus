const { test, expect } = require('@playwright/test');

const HASH = 'a'.repeat(64);
const LIST_ETAG = `"${'9'.repeat(64)}"`;
const SOURCE_REVISION = 'b'.repeat(64);
const SOURCE_ETAG = `"${SOURCE_REVISION}"`;

function registryProjection() {
  const orphanRowKey = 'c'.repeat(64);
  const legacyRowKey = 'd'.repeat(64);
  return {
    registryVersion: '2026-07-13.3',
    registrySha256: HASH,
    activation: { state: 'shadow', runtimeConsumers: ['cadu-api'] },
    entities: [
      {
        id: 'ufg.portal',
        name: 'Universidade Federal de Goiás',
        acronym: 'UFG',
        kind: 'university',
        parentId: null,
        campus: 'Goiânia',
        status: 'active',
        observedIn: [],
        legacyIds: []
      },
      {
        id: 'ufg.ceagrif',
        name: 'Centro de Gestão do Espaço Físico',
        acronym: 'CEAGRIF',
        kind: 'administrative_body',
        parentId: 'ufg.portal',
        campus: 'Goiânia',
        status: 'active',
        observedIn: [],
        legacyIds: ['CEAGRIF']
      }
    ],
    sources: [{
      id: 'web.ufg.portal',
      registrySha256: HASH,
      entityIds: ['ufg.portal'],
      entities: [{
        id: 'ufg.portal',
        name: 'Universidade Federal de Goiás',
        acronym: 'UFG',
        kind: 'university',
        status: 'active'
      }],
      canonicalUrl: 'https://ufg.br/',
      declaredUrl: 'https://ufg.br/',
      aliases: [],
      role: 'official_portal',
      sourceKind: 'institutional_site',
      enabled: false,
      baseTier: 1,
      overrideTier: 2,
      effectiveTier: 2,
      overrideOrigin: 'legacy_inherited',
      isInheritedLegacy: true,
      overrideUnitId: 'UFG',
      note: 'Nota legada: revisar antes de promover',
      updatedAt: '2026-07-13T12:00:00Z',
      overrideRevision: 4,
      collision: false,
      revision: SOURCE_REVISION,
      etag: SOURCE_ETAG,
      instagramProfiles: [{
        id: 'ig.ufg',
        handle: 'ufg_oficial',
        profileUrl: 'https://www.instagram.com/ufg_oficial/',
        aliases: [],
        status: 'confirmed',
        enabled: false,
        shared: false,
        entityIds: ['ufg.portal'],
        viaSourceObservation: true,
        viaEntityIds: ['ufg.portal']
      }],
      executionModes: [],
      reviewState: 'reviewed',
      reviewIssues: ['confirmar política editorial'],
      audit: {},
      transport: {}
    }],
    instagramProfiles: [
      {
        id: 'ig.ufg',
        handle: 'ufg_oficial',
        profileUrl: 'https://www.instagram.com/ufg_oficial/',
        aliases: [],
        entityIds: ['ufg.portal'],
        shared: false,
        enabled: false,
        status: 'confirmed',
        executionModes: [],
        audit: {},
        observations: [{ inventory: 'official_ufg_page', handle: 'ufg_oficial', sourceId: 'web.ufg.portal' }]
      },
      {
        id: 'ig.loose',
        handle: 'ufg_sem_site',
        profileUrl: 'https://www.instagram.com/ufg_sem_site/',
        aliases: [],
        entityIds: [],
        shared: false,
        enabled: false,
        status: 'pending_verification',
        executionModes: [],
        audit: {},
        observations: [{ inventory: 'instagram_scanner', handle: 'ufg_sem_site', sourceId: null }]
      }
    ],
    metaClassification: {
      unambiguous: [{
        unitId: 'UFG',
        rowKey: legacyRowKey,
        matchType: 'admin_observation',
        sourceIds: ['web.ufg.portal'],
        sourceId: 'web.ufg.portal',
        entityIds: [],
        row: {
          unit_id: 'UFG',
          tier: 2,
          note: 'Nota legada: revisar antes de promover',
          revision: 4,
          updated_at: '2026-07-13T12:00:00Z'
        }
      }],
      ambiguous: [],
      orphan: [{
        unitId: 'CEAGRIF',
        rowKey: orphanRowKey,
        matchType: 'entity_identity',
        sourceIds: [],
        entityIds: ['ufg.ceagrif'],
        row: { unit_id: 'CEAGRIF', tier: 3, note: null, revision: 1, updated_at: '2026-07-13T12:00:00Z' }
      }],
      collisions: [],
      counts: { rows: 2, unambiguous: 1, ambiguous: 0, orphan: 1, collisions: 0 }
    }
  };
}

async function installAdminSession(page) {
  await page.addInitScript(() => {
    const session = {
      access_token: 'playwright-admin-token',
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test' }
    };
    const profileChain = {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: { is_admin: true, email: session.user.email }, error: null };
      }
    };
    const client = {
      auth: { async getSession() { return { data: { session } }; } },
      from() { return profileChain; }
    };
    const facade = {
      async refreshSession() { return session; },
      getSession() { return session; },
      async getCurrentUser() { return session.user; },
      getUser() { return session.user; },
      getClient() { return client; }
    };
    Object.defineProperty(window, 'KCSupabase', {
      configurable: true,
      get() { return facade; },
      set() {}
    });
    Object.defineProperty(window, 'KC_ENV', {
      configurable: true,
      get() { return { driver: 'supabase' }; },
      set() {}
    });
    localStorage.setItem('kc:user', JSON.stringify({ email: session.user.email }));
  });
}

function registryReadiness() {
  return {
    ready: true,
    contractVersion: 'cadu-unit-meta-cas-v1',
    phase: 'phase-a',
    checks: { table: true, stableRpc: true, legacyRpc: true },
    metadataRowsValidated: 2,
    registryVersion: '2026-07-13.3',
    registrySha256: HASH
  };
}

async function mockCommonCaduRoutes(page, registryHandler, readinessHandler) {
  await page.route('**/api/cadu/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/cadu/health') {
      return route.fulfill({ json: { status: 'ok', version: 'test', ts: 1783960000 } });
    }
    if (path === '/api/cadu/openclaw/context') {
      return route.fulfill({ json: { sites: { count: 1 }, feed: { count: 0 }, openclaw: { openclaw_reachable: true } } });
    }
    if (path === '/api/cadu/pipeline/runs') {
      return route.fulfill({
        json: {
          runs: [{ id: 'run-playwright-1', stage: 'publish', status: 'finished', started_at: Math.floor(Date.now() / 1000), exit_code: 0 }]
        }
      });
    }
    if (path === '/api/cadu/sites/source-registry/readiness') {
      if (readinessHandler) return readinessHandler(route, path);
      return route.fulfill({
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
          'X-Cadu-Registry-Sha256': HASH
        },
        json: registryReadiness()
      });
    }
    if (path === '/api/cadu/sites/source-registry' || path === '/api/cadu/sites/source-registry/web.ufg.portal/override') {
      return registryHandler(route, path);
    }
    if (path === '/api/cadu/sites') {
      return route.fulfill({ json: [{ name: 'UFG legado', tier: 1, url: 'https://ufg.br/', instagram: 'ufg_oficial', instagram_status: 'confirmed', note: null }] });
    }
    if (path.startsWith('/api/cadu/feed')) {
      return route.fulfill({ json: { items: [], total: 0, has_more: false } });
    }
    return route.fulfill({ json: {} });
  });
}

async function dismissConsentBanner(page) {
  const reject = page.getByRole('button', { name: 'Rejeitar opcionais' }).first();
  try {
    await reject.waitFor({ state: 'visible', timeout: 1500 });
    await reject.click();
  } catch (_) {
    // The consent script is intentionally optional in this isolated fixture.
  }
}

test.describe('Admin Cadu — catálogo canônico', () => {
  test.beforeEach(async ({ page }) => {
    await installAdminSession(page);
  });

  test('renderiza todas as visões e trata 412 sem retry automático', async ({ page }, testInfo) => {
    const pageErrors = [];
    const patchRequests = [];
    let registryReads = 0;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockCommonCaduRoutes(page, async (route, path) => {
      if (path.endsWith('/override')) {
        patchRequests.push({
          headers: route.request().headers(),
          body: route.request().postDataJSON()
        });
        return route.fulfill({
          status: 412,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
          json: { error: 'precondition_failed' }
        });
      }
      registryReads += 1;
      return route.fulfill({
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
          ETag: LIST_ETAG,
          'X-Cadu-Registry-Sha256': HASH
        },
        json: registryProjection()
      });
    });

    await page.goto('/admin/cadu.html');
    await dismissConsentBanner(page);
    await expect(page.locator('#sites-registry-status')).toContainText('Catálogo canônico validado em modo shadow');
    await expect(page.locator('#kpi-sites')).toHaveText('2');
    await expect(page.locator('#sites-catalog-summary')).toContainText('2entidades UFG');
    await expect(page.locator('tr[data-source-id="web.ufg.portal"]')).toBeVisible();
    await expect(page.locator('.kc-cadu-inherited-warning')).toContainText('não será copiada');
    await expect(page.locator('.kc-cadu-source-note-input')).toHaveValue('');
    await expect(page.locator('.kc-cadu-save-source-btn')).toBeDisabled();
    await expect(page.locator('.kc-cadu-publish-btn')).toBeDisabled();
    await expect(page.locator('.kc-cadu-publish-btn')).toContainText('Shadow');
    await expect(page.locator('tr[data-source-id="web.ufg.portal"]')).toContainText('associação direta observada nesta fonte');
    await expect(page.locator('.kc-cadu-ask-btn[data-ask-kind="site"]'))
      .toHaveAttribute('data-ask-instagram', '@ufg_oficial (confirmed)');
    const desktopHeroLayout = await page.evaluate(() => {
      const hero = document.querySelector('.kc-cadu-hero').getBoundingClientRect();
      const toolbar = document.querySelector('.kc-cadu-hero > .kc-cadu-toolbar').getBoundingClientRect();
      return { hero: { left: hero.left, right: hero.right }, toolbar: { left: toolbar.left, right: toolbar.right, width: toolbar.width } };
    });
    expect(desktopHeroLayout.toolbar.left).toBeGreaterThanOrEqual(desktopHeroLayout.hero.left - 1);
    expect(desktopHeroLayout.toolbar.right).toBeLessThanOrEqual(desktopHeroLayout.hero.right + 1);
    expect(desktopHeroLayout.toolbar.width).toBeLessThan(360);
    if (process.env.CADU_VISUAL_CAPTURE === '1') {
      await page.screenshot({ path: testInfo.outputPath('cadu-sources-desktop.png'), fullPage: true });
    }

    await page.locator('.kc-cadu-source-tier-select').selectOption('2');
    await page.locator('.kc-cadu-source-note-input').fill('Decisão editorial explícita');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.kc-cadu-save-source-btn').click();

    await expect.poll(() => patchRequests.length).toBe(1);
    expect(patchRequests[0].headers['if-match']).toBe(SOURCE_ETAG);
    expect(patchRequests[0].body).toEqual({ tier: 2, note: 'Decisão editorial explícita' });
    await expect(page.locator('.kc-cadu-conflict-warning')).toContainText('Compare novamente');
    await expect(page.locator('#cadu-error')).toContainText('decida manualmente');
    expect(registryReads).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(250);
    expect(patchRequests).toHaveLength(1);

    await page.locator('#sites-view').selectOption('entities');
    await expect(page.locator('#sites-tbody tr')).toHaveCount(2);
    await expect(page.locator('#sites-tbody')).toContainText('CEAGRIF');
    await expect(page.locator('#sites-tbody')).toContainText('sem site associado');

    await page.locator('#sites-view').selectOption('instagram');
    await expect(page.locator('#sites-tbody tr')).toHaveCount(2);
    await expect(page.locator('#sites-tbody')).toContainText('@ufg_sem_site');
    await expect(page.locator('#sites-tbody')).toContainText('sem fonte web associada');

    await page.locator('#sites-view').selectOption('deferred');
    await expect(page.locator('#sites-tbody tr')).toHaveCount(1);
    await expect(page.locator('#sites-tbody')).toContainText('orphan');
    await expect(page.locator('#sites-tier')).toBeDisabled();

    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      const toolbar = document.querySelector('#tab-sites .kc-cadu-toolbar');
      const toolbarBox = toolbar.getBoundingClientRect();
      const controls = Array.from(toolbar.children).map((element) => {
        const box = element.getBoundingClientRect();
        return { id: element.id, left: box.left, right: box.right, width: box.width };
      });
      const tableWrap = document.querySelector('.kc-cadu-table-wrap');
      const header = document.querySelector('.kc-header--admin');
      const mobileNav = document.querySelector('.kc-mobile-nav');
      const navBox = mobileNav.getBoundingClientRect();
      const notificationDropdown = document.querySelector('#kcCaduActivityDropdown');
      const tabs = document.querySelector('.kc-cadu-tabs');
      const tabsBox = tabs.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        body: rect('body'),
        main: rect('#kc-main'),
        wrapper: rect('.kc-cadu-wrapper'),
        section: rect('#tab-sites'),
        toolbar: { left: toolbarBox.left, right: toolbarBox.right, width: toolbarBox.width },
        controls,
        header: { clientWidth: header.clientWidth, scrollWidth: header.scrollWidth },
        mobileNav: {
          left: navBox.left,
          right: navBox.right,
          clientWidth: mobileNav.clientWidth,
          scrollWidth: mobileNav.scrollWidth,
          overflowX: getComputedStyle(mobileNav).overflowX
        },
        notificationDropdown: {
          hidden: notificationDropdown.hidden,
          display: getComputedStyle(notificationDropdown).display
        },
        tabs: {
          left: tabsBox.left,
          right: tabsBox.right,
          clientWidth: tabs.clientWidth,
          scrollWidth: tabs.scrollWidth,
          overflowX: getComputedStyle(tabs).overflowX
        },
        tableWrap: {
          clientWidth: tableWrap.clientWidth,
          scrollWidth: tableWrap.scrollWidth,
          overflowX: getComputedStyle(tableWrap).overflowX
        }
      };
    });
    expect(layout.viewport).toBe(390);
    expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.body.width).toBeGreaterThanOrEqual(layout.viewport - 1);
    expect(layout.main.width).toBeGreaterThanOrEqual(layout.viewport - 1);
    expect(layout.wrapper.width).toBeGreaterThanOrEqual(layout.viewport - 1);
    expect(layout.section.width).toBeGreaterThan(layout.viewport * 0.9);
    expect(layout.header.scrollWidth).toBeLessThanOrEqual(layout.header.clientWidth + 1);
    expect(layout.mobileNav.left).toBeGreaterThanOrEqual(-1);
    expect(layout.mobileNav.right).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.mobileNav.overflowX).toBe('auto');
    expect(layout.notificationDropdown).toEqual({ hidden: true, display: 'none' });
    expect(layout.tabs.left).toBeGreaterThanOrEqual(-1);
    expect(layout.tabs.right).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.tabs.overflowX).toBe('auto');
    expect(layout.tabs.scrollWidth).toBeGreaterThan(layout.tabs.clientWidth);
    expect(layout.tableWrap.overflowX).toBe('auto');
    expect(layout.tableWrap.scrollWidth).toBeGreaterThan(layout.tableWrap.clientWidth);
    for (const control of layout.controls) {
      expect.soft(control.width, `${control.id} deve continuar utilizável`).toBeGreaterThan(100);
      expect.soft(control.left, `${control.id} não pode escapar à esquerda`).toBeGreaterThanOrEqual(layout.toolbar.left - 1);
      expect.soft(control.right, `${control.id} não pode escapar à direita`).toBeLessThanOrEqual(layout.toolbar.right + 1);
    }
    const activityBell = page.locator('#kcCaduActivityBell');
    const activityDropdown = page.locator('#kcCaduActivityDropdown');
    await activityBell.click();
    await expect(activityBell).toHaveAttribute('aria-expanded', 'true');
    await expect(activityDropdown).toBeVisible();
    await expect(page.locator('#kcCaduActivityList')).toContainText('publish');
    const openActivity = await activityDropdown.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: box.left, right: box.right, display: style.display, opacity: style.opacity, visibility: style.visibility };
    });
    expect(openActivity.left).toBeGreaterThanOrEqual(0);
    expect(openActivity.right).toBeLessThanOrEqual(layout.viewport);
    expect(openActivity.display).not.toBe('none');
    expect(openActivity.opacity).toBe('1');
    expect(openActivity.visibility).toBe('visible');
    await activityBell.click();
    await expect(activityBell).toHaveAttribute('aria-expanded', 'false');
    await expect(activityDropdown).toBeHidden();

    await page.locator('#sites-view').selectOption('sources');
    await expect(page.locator('#sites-table')).toHaveAttribute('data-view', 'sources');
    const sourceTableWidths = await page.locator('.kc-cadu-table-wrap').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(sourceTableWidths.scrollWidth).toBeGreaterThan(sourceTableWidths.clientWidth * 2);
    if (process.env.CADU_VISUAL_CAPTURE === '1') {
      await page.screenshot({ path: testInfo.outputPath('cadu-sources-mobile.png'), fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  });

  test('não declara sucesso quando PATCH 200 não pode ser revalidado e preserva o rascunho', async ({ page }) => {
    const patchRequests = [];
    let registryReads = 0;
    let serveRecovery = false;
    const committedRevision = 'e'.repeat(64);
    const committedEtag = `"${committedRevision}"`;
    await mockCommonCaduRoutes(page, async (route, path) => {
      if (path.endsWith('/override')) {
        patchRequests.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
            ETag: committedEtag,
            'X-Cadu-Registry-Sha256': HASH
          },
          json: { id: 'web.ufg.portal', etag: committedEtag }
        });
      }
      registryReads += 1;
      if (registryReads === 1 || serveRecovery) {
        return route.fulfill({
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
            ETag: LIST_ETAG,
            'X-Cadu-Registry-Sha256': HASH
          },
          json: registryProjection()
        });
      }
      return route.fulfill({
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        json: registryProjection()
      });
    });

    await page.goto('/admin/cadu.html');
    await expect(page.locator('#sites-registry-status')).toContainText('Catálogo canônico validado');
    await page.locator('.kc-cadu-source-tier-select').selectOption('2');
    await page.locator('.kc-cadu-source-note-input').fill('Rascunho que não pode ser perdido');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.kc-cadu-save-source-btn').click();

    await expect.poll(() => patchRequests.length).toBe(1);
    await expect(page.locator('#sites-registry-status')).toContainText('mapa legado somente leitura');
    await expect(page.locator('#cadu-error')).toContainText('estado final não foi confirmado');
    await page.waitForTimeout(250);
    expect(patchRequests).toHaveLength(1);

    serveRecovery = true;
    await page.locator('#cadu-refresh-btn').click();
    await expect(page.locator('#sites-registry-status')).toContainText('Catálogo canônico validado');
    await expect(page.locator('.kc-cadu-source-tier-select')).toHaveValue('2');
    await expect(page.locator('.kc-cadu-source-note-input')).toHaveValue('Rascunho que não pode ser perdido');
    await expect(page.locator('.kc-cadu-save-source-btn')).toBeEnabled();
    expect(patchRequests).toHaveLength(1);
  });

  test('preserva a intenção explícita de limpar tier e nota após transição CAS para override estável', async ({ page }) => {
    const patchRequests = [];
    let registryReads = 0;
    const initial = registryProjection();
    Object.assign(initial.sources[0], {
      overrideTier: null,
      effectiveTier: 1,
      overrideOrigin: 'base',
      isInheritedLegacy: false,
      overrideUnitId: null,
      note: null,
      updatedAt: null,
      overrideRevision: null,
      collision: false
    });
    initial.metaClassification = {
      unambiguous: [], ambiguous: [], orphan: [], collisions: [],
      counts: { rows: 0, unambiguous: 0, ambiguous: 0, orphan: 0, collisions: 0 }
    };
    const competing = registryProjection();
    const competingRevision = 'e'.repeat(64);
    Object.assign(competing.sources[0], {
      overrideTier: 3,
      effectiveTier: 3,
      overrideOrigin: 'stable',
      isInheritedLegacy: false,
      overrideUnitId: 'web.ufg.portal',
      note: 'Decisão concorrente',
      updatedAt: '2026-07-13T13:00:00Z',
      overrideRevision: 5,
      collision: false,
      revision: competingRevision,
      etag: `"${competingRevision}"`
    });
    competing.metaClassification.unambiguous[0].unitId = 'web.ufg.portal';
    competing.metaClassification.unambiguous[0].matchType = 'stable_source_id';
    competing.metaClassification.unambiguous[0].row.unit_id = 'web.ufg.portal';
    competing.metaClassification.unambiguous[0].row.tier = 3;
    competing.metaClassification.unambiguous[0].row.note = 'Decisão concorrente';
    competing.metaClassification.unambiguous[0].row.revision = 5;
    competing.metaClassification.unambiguous[0].row.updated_at = '2026-07-13T13:00:00Z';
    await mockCommonCaduRoutes(page, async (route, path) => {
      if (path.endsWith('/override')) {
        patchRequests.push(route.request().postDataJSON());
        return route.fulfill({
          status: 412,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
          json: { detail: 'override changed' }
        });
      }
      registryReads += 1;
      return route.fulfill({
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
          ETag: LIST_ETAG,
          'X-Cadu-Registry-Sha256': HASH
        },
        json: registryReads === 1 ? initial : competing
      });
    });

    await page.goto('/admin/cadu.html');
    await page.locator('.kc-cadu-source-tier-select').selectOption('');
    await page.locator('.kc-cadu-source-note-input').fill('temporária');
    await page.locator('.kc-cadu-source-note-input').fill('');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.kc-cadu-save-source-btn').click();

    await expect.poll(() => patchRequests.length).toBe(1);
    expect(patchRequests[0]).toEqual({ tier: null, note: null });
    await expect(page.locator('.kc-cadu-conflict-warning')).toContainText('Decisão concorrente');
    await expect(page.locator('.kc-cadu-source-tier-select')).toHaveValue('');
    await expect(page.locator('.kc-cadu-source-note-input')).toHaveValue('');
    await expect(page.locator('.kc-cadu-save-source-btn')).toBeEnabled();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.kc-cadu-save-source-btn').click();
    await expect.poll(() => patchRequests.length).toBe(2);
    expect(patchRequests[1]).toEqual({ tier: null, note: null });
  });

  test('falha fechado e mantém fallback legado somente leitura sem headers fortes', async ({ page }) => {
    const pageErrors = [];
    const publishRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/cadu/publish') publishRequests.push(request);
    });
    await mockCommonCaduRoutes(page, async (route, path) => {
      if (path.endsWith('/override')) throw new Error('PATCH must not be reachable in fallback mode');
      return route.fulfill({
        headers: { 'Content-Type': 'application/json' },
        json: registryProjection()
      });
    });

    await page.goto('/admin/cadu.html');
    await expect(page.locator('#sites-registry-status')).toContainText('mapa legado somente leitura');
    await expect(page.locator('#sites-view')).toBeDisabled();
    await expect(page.locator('#sites-tbody')).toContainText('UFG legado');
    await expect(page.locator('#sites-tbody')).toContainText('somente leitura');
    await expect(page.locator('.kc-cadu-publish-btn')).toBeDisabled();
    await expect(page.locator('.kc-cadu-publish-btn')).toContainText('Somente leitura');
    await expect(page.locator('.kc-cadu-save-source-btn')).toHaveCount(0);
    await expect(page.locator('.kc-cadu-source-note-input')).toHaveCount(0);
    await page.locator('.kc-cadu-publish-btn').evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    expect(publishRequests).toHaveLength(0);
    expect(pageErrors).toEqual([]);
  });

  test('mantém o catálogo visível e bloqueia PATCH quando readiness/CAS falha', async ({ page }) => {
    const patchRequests = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') patchRequests.push(request);
    });
    await mockCommonCaduRoutes(page, async (route, path) => {
      if (path.endsWith('/override')) throw new Error('PATCH must not be reachable without readiness');
      return route.fulfill({
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
          ETag: LIST_ETAG,
          'X-Cadu-Registry-Sha256': HASH
        },
        json: registryProjection()
      });
    }, async (route) => route.fulfill({
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      json: { error: 'cadu_api_error', status: 503 }
    }));

    await page.goto('/admin/cadu.html');
    await expect(page.locator('#sites-registry-status')).toContainText('overrides em modo somente leitura');
    await expect(page.locator('tr[data-source-id="web.ufg.portal"]')).toBeVisible();
    await expect(page.locator('.kc-cadu-source-tier-select')).toBeDisabled();
    await expect(page.locator('.kc-cadu-source-note-input')).toBeDisabled();
    await expect(page.locator('.kc-cadu-save-source-btn')).toBeDisabled();
    expect(patchRequests).toHaveLength(0);
  });
});
