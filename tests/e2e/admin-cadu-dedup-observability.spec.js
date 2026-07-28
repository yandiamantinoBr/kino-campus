const path = require('path');
const { test, expect } = require('@playwright/test');

const RUN_ID = 'dfc30e45-7e39-444c-af24-de971446f941';
const STARTED_AT = Math.floor(Date.now() / 1000) - 105;
const FINISHED_AT = STARTED_AT + 100;

const DEDUP_METRICS = {
  dedup_posts_analyzed: 137,
  dedup_exact_url_pairs: 0,
  dedup_official_reference_pairs: 1,
  dedup_text_candidates: 36,
  dedup_exact_image_groups: 1,
  dedup_similar_image_pairs: 7,
  dedup_logo_issues: 0,
  dedup_ai_pairs: 0,
  dedup_semantic_pairs: 2,
  dedup_program_identity_pairs: 1,
  dedup_semantic_distinct: 2,
  dedup_semantic_ambiguous: 1,
  dedup_semantic_hides_blocked: 1,
  dedup_preview_reused: 1,
  dedup_hides_planned: 0,
  dedup_reviews_planned: 4,
  dedup_hidden: 0,
  dedup_flagged: 0,
  dedup_apply_failures: 0,
};

function dedupRun() {
  return {
    id: RUN_ID,
    stage: 'dedup',
    status: 'finished',
    effective_status: 'success',
    outcome_status: 'success',
    started_at: STARTED_AT,
    finished_at: FINISHED_AT,
    exit_code: 0,
    dry_run: false,
    summary: {
      metrics: { ...DEDUP_METRICS },
      warnings: [],
      duration_sec: 100,
    },
  };
}

function pipelineSnapshot(previewStatus = 'ok', runtimeBusy = false) {
  const nowSeconds = Date.now() / 1000;
  const run = dedupRun();
  const relativePath = 'scripts/dedup-kino.js';
  const previewCheck = {
    id: 'dedup_preview_real',
    label: 'Prévia para execução real',
    detail: previewStatus === 'ok'
      ? 'Prévia válida por mais 12 minutos.'
      : 'A prévia expirou. Execute uma nova simulação.',
    blocking: false,
    status: previewStatus,
  };
  const checks = [
    {
      id: 'script',
      label: 'Script do estágio',
      detail: relativePath,
      blocking: true,
      status: 'ok',
    },
    {
      id: 'pipeline_runtime_lock',
      label: 'Exclusão mútua da pipeline',
      detail: runtimeBusy
        ? 'Lock global ocupado por outra pipeline ou implantação.'
        : 'Lock global livre; nenhuma pipeline ou implantação está usando os artefatos.',
      blocking: true,
      status: runtimeBusy ? 'warning' : 'ok',
    },
    {
      id: 'dedup_preview_config',
      label: 'Contrato da prévia',
      detail: 'Configuração da prévia disponível.',
      blocking: true,
      status: 'ok',
    },
    previewCheck,
  ];
  return {
    contract_version: 'cadu-pipeline-control-v1',
    generated_at: new Date().toISOString(),
    capabilities: {
      explicit_dry_run: true,
      explicit_run_mode_routes: true,
    },
    active_run: null,
    history: [run],
    stages: [{
      id: 'dedup',
      name: 'Deduplicação global',
      description: 'Audita publicações ativas por texto e imagem antes de qualquer alteração.',
      script: relativePath,
      estimated_sec: 900,
      category: 'maintenance',
      last_run: run,
      preflight: {
        stage: 'dedup',
        checked_at: nowSeconds,
        can_run: !runtimeBusy,
        command: `node ${relativePath} --all-active --report --no-auto-close --emit-cadu-markers --dry-run`,
        profile: {
          risk: 'high',
          mode: 'global_dedup',
          dry_run_available: true,
          default_dry_run: true,
          force_dry_run: false,
          mutates_platform: true,
          effects: ['supabase_write', 'ai_inference'],
          notes: ['A execução real exige confirmação explícita e mantém auto-ocultação desativada.'],
        },
        checks,
        blockers: runtimeBusy ? [checks[1]] : [],
        warnings: previewStatus === 'ok' ? [] : [previewCheck],
        script: {
          exists: true,
          path: `C:\\openclaw\\${relativePath.replace(/\//g, '\\')}`,
          relative_path: relativePath,
        },
      },
    }],
    health: {
      status: 'ok',
      level: 'ok',
      failures_recent_count: 0,
      seconds_since_successful_all: 60,
      issues: [],
      recommendation: '',
      latest_run: run,
      last_successful_all_run: null,
    },
  };
}

async function installAdminSession(page) {
  await page.addInitScript(() => {
    const session = {
      access_token: 'playwright-admin-token',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.test',
      },
    };
    const profileChain = {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: { is_admin: true, email: session.user.email }, error: null };
      },
    };
    const client = {
      auth: { async getSession() { return { data: { session } }; } },
      from() { return profileChain; },
    };
    const facade = {
      async refreshSession() { return session; },
      getSession() { return session; },
      async getCurrentUser() { return session.user; },
      getUser() { return session.user; },
      getClient() { return client; },
    };
    Object.defineProperty(window, 'KCSupabase', {
      configurable: true,
      get() { return facade; },
      set() {},
    });
    Object.defineProperty(window, 'KC_ENV', {
      configurable: true,
      get() { return { driver: 'supabase' }; },
      set() {},
    });
    localStorage.setItem('kc:user', JSON.stringify({ email: session.user.email }));
  });
}

async function mockCaduApi(page, previewStatus = 'ok', runtimeBusy = false) {
  await page.route('**/api/cadu/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname;
    const run = dedupRun();

    if (requestPath === '/api/cadu/health') {
      return route.fulfill({ json: { status: 'ok', version: '0.5.16', ts: Date.now() / 1000 } });
    }
    if (requestPath === '/api/cadu/openclaw/context') {
      return route.fulfill({
        json: {
          sites: { count: 0 },
          feed: { count: 0 },
          cadu_api: { openclaw_reachable: true },
        },
      });
    }
    if (requestPath === '/api/cadu/pipeline') {
      return route.fulfill({ json: pipelineSnapshot(previewStatus, runtimeBusy) });
    }
    if (requestPath === '/api/cadu/pipeline/health') {
      return route.fulfill({ json: pipelineSnapshot(previewStatus, runtimeBusy).health });
    }
    if (requestPath === '/api/cadu/pipeline/runs') {
      return route.fulfill({ json: { runs: [run] } });
    }
    if (requestPath === `/api/cadu/pipeline/${RUN_ID}/artifacts`) {
      return route.fulfill({
        json: {
          artifacts: [
            {
              kind: 'dedup_report',
              name: `dedup-2026-07-27--${RUN_ID}.json`,
              size_bytes: 191211,
              produced_during_run: true,
              stale_for_run: false,
            },
            {
              kind: 'dedup_report',
              name: 'dedup-2026-07-27--contexto-anterior.json',
              size_bytes: 174000,
              produced_during_run: false,
              stale_for_run: true,
            },
          ],
        },
      });
    }
    if (requestPath === `/api/cadu/pipeline/${RUN_ID}/log`) {
      return route.fulfill({
        json: {
          content: [
            'Dedup global: 137 publicações ativas analisadas',
            'Pares enviados à IA: 0',
            'Pares semânticos avaliados: 2',
            'Pares por identidade de programa: 1',
            'Classificados como distintos: 2',
            'Classificados como ambíguos: 1',
            'Recomendações de hide bloqueadas: 1',
            'Prévia semântica aplicada: 1',
            'Ocultações planejadas: 0',
            'Revisões planejadas: 4',
          ].join('\n'),
        },
      });
    }
    if (requestPath === `/api/cadu/pipeline/${RUN_ID}/export`) {
      return route.fulfill({
        json: {
          summary_metrics: { ...DEDUP_METRICS },
          summary_warnings: [],
          summary: { duration_sec: 100 },
        },
      });
    }
    if (requestPath === '/api/cadu/source-reviews') {
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          limit: 10,
          offset: 0,
          has_more: false,
          filters: { state: null, source_id: null },
        },
      });
    }
    if (requestPath === '/api/cadu/sites/source-registry/readiness') {
      return route.fulfill({ status: 503, json: { ready: false } });
    }
    if (requestPath === '/api/cadu/sites/source-registry') {
      return route.fulfill({ json: { sources: [], entities: [], instagramProfiles: [] } });
    }
    if (requestPath === '/api/cadu/sites') {
      return route.fulfill({ json: [] });
    }
    if (requestPath.startsWith('/api/cadu/feed')) {
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          limit: 25,
          offset: 0,
          has_more: false,
          status: 'ready',
          stale: false,
          legacy_memory_feed_retired: true,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
}

async function openDedupDetails(page) {
  await page.goto('/admin/cadu.html', { waitUntil: 'domcontentloaded' });
  const rejectConsent = page.getByRole('button', { name: 'Rejeitar opcionais' }).first();
  try {
    await rejectConsent.waitFor({ state: 'visible', timeout: 1500 });
    await rejectConsent.click();
  } catch (_) {
    // O banner pode já ter sido resolvido pelo estado local do navegador.
  }
  await page.getByRole('tab', { name: /Pipeline/ }).click();
  const history = page.locator(`[data-run-id="${RUN_ID}"]`);
  await expect(history).toBeVisible();
  await expect(history).toContainText('analisados 137');
  await expect(history).toContainText('referências oficiais compartilhadas 1');
  await expect(history).toContainText('pares por identidade de programa 1');
  await expect(history).toContainText('classificados como distintos 2');
  await expect(history).toContainText('classificados como ambíguos 1');
  await expect(history).toContainText('recomendações de ocultação bloqueadas 1');
  await expect(history).toContainText('prévia semântica aplicada 1');
  await expect(history).toContainText('revisões planejadas 4');
  await history.getByRole('button', { name: 'Ver artefatos e log' }).click();
  const modal = page.locator('#run-details-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Gerados nesta execução (1)');
  await expect(modal).toContainText('gerado nesta execução');
  await expect(modal).toContainText('Contexto anterior (1)');
  await expect(modal.locator('details')).not.toHaveAttribute('open', '');
  return modal;
}

test.describe('Admin Cadu - observabilidade da deduplicação', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await installAdminSession(page);
    await mockCaduApi(
      page,
      testInfo.title.includes('prévia expirada') ? 'warning' : 'ok',
      testInfo.title.includes('lock global'),
    );
  });

  test('mostra o funil e separa artefatos atuais no desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const modal = await openDedupDetails(page);
    const overlayBox = await modal.boundingBox();
    const modalBox = await modal.locator('.kc-modal__inner').boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox.x).toBe(0);
    expect(overlayBox.width).toBeGreaterThanOrEqual(1439);
    expect(modalBox).not.toBeNull();
    expect(modalBox.x).toBeGreaterThanOrEqual(0);
    expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(1440);
    await page.screenshot({
      path: path.resolve('output/playwright/cadu-dedup-desktop.png'),
      fullPage: false,
    });
  });

  test('mantém relatório e ações dentro da viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const modal = await openDedupDetails(page);
    const modalInner = modal.locator('.kc-modal__inner');
    const overlayBox = await modal.boundingBox();
    const modalBox = await modalInner.boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox.x).toBe(0);
    expect(overlayBox.width).toBeGreaterThanOrEqual(389);
    expect(modalBox).not.toBeNull();
    expect(modalBox.x).toBeGreaterThanOrEqual(0);
    expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(390);

    const overflow = await modalInner.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    const artifactOverflow = await modal.locator('.kc-pipeline-artifact.is-current').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(artifactOverflow.scrollWidth).toBeLessThanOrEqual(artifactOverflow.clientWidth + 1);
    await page.screenshot({
      path: path.resolve('output/playwright/cadu-dedup-mobile.png'),
      fullPage: false,
    });
  });

  test('mantém a subaba persistida visível ao abrir no mobile', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kc:cadu:tab', 'openclaw');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/cadu.html', { waitUntil: 'domcontentloaded' });

    const activeTab = page.getByRole('tab', { name: /OpenClaw/ });
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => {
      return page.locator('.kc-cadu-tabs').evaluate((rail) => {
        const active = rail.querySelector('.kc-cadu-tab.is-active');
        if (!active) return false;
        const railRect = rail.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const style = getComputedStyle(rail);
        const startInset = parseFloat(style.paddingInlineStart) || 0;
        const endInset = parseFloat(style.paddingInlineEnd) || 0;
        return activeRect.left >= railRect.left + startInset - 1
          && activeRect.right <= railRect.right - endInset + 1;
      });
    }).toBe(true);

    // Reproduz a expansão tardia observada em produção quando fontes ou badges
    // assíncronos alteram a largura após a restauração da aba persistida.
    await activeTab.evaluate((tab) => {
      tab.style.paddingInline = '52px';
    });
    await expect.poll(async () => {
      return page.locator('.kc-cadu-tabs').evaluate((rail) => {
        const active = rail.querySelector('.kc-cadu-tab.is-active');
        if (!active) return false;
        const railRect = rail.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const style = getComputedStyle(rail);
        const startInset = parseFloat(style.paddingInlineStart) || 0;
        const endInset = parseFloat(style.paddingInlineEnd) || 0;
        return activeRect.left >= railRect.left + startInset - 1
          && activeRect.right <= railRect.right - endInset + 1;
      });
    }).toBe(true);

    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - window.innerWidth
    ));
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('mantém Simular disponível e orienta a execução real com prévia expirada', async ({ page }) => {
    const pipelinePosts = [];
    page.on('request', (request) => {
      const requestPath = new URL(request.url()).pathname;
      if (request.method() === 'POST' && requestPath.startsWith('/api/cadu/pipeline/')) {
        pipelinePosts.push(requestPath);
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/admin/cadu.html', { waitUntil: 'domcontentloaded' });
    const rejectConsent = page.getByRole('button', { name: 'Rejeitar opcionais' }).first();
    try {
      await rejectConsent.waitFor({ state: 'visible', timeout: 1500 });
      await rejectConsent.click();
    } catch (_) {
      // O banner pode já ter sido resolvido pelo estado local do navegador.
    }
    await page.getByRole('tab', { name: /Pipeline/ }).click();
    const stage = page.locator('.kc-pipeline-stage').filter({ hasText: 'Deduplicação global' });
    await expect(stage).toContainText('nova simulação necessária');
    const simulateButton = stage.getByRole('button', { name: 'Simular' });
    await expect(simulateButton).toBeEnabled();
    const realButton = stage.getByRole('button', { name: /Executar real/ });
    await expect(realButton).toBeEnabled();
    await expect(realButton).toHaveClass(/is-guarded/);
    await expect(realButton).toHaveAttribute('title', /A prévia expirou/);

    const alertMessage = new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        resolve(dialog.message());
        await dialog.dismiss();
      });
    });
    await realButton.click();
    await expect(alertMessage).resolves.toContain('Use “Simular”');
    await expect(simulateButton).toBeFocused();
    expect(pipelinePosts).toEqual([]);

    await page.screenshot({
      path: path.resolve('output/playwright/cadu-dedup-preview-expired.png'),
      fullPage: false,
    });
  });

  test('bloqueia os dois modos quando o lock global está ocupado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/admin/cadu.html', { waitUntil: 'domcontentloaded' });
    const rejectConsent = page.getByRole('button', { name: 'Rejeitar opcionais' }).first();
    try {
      await rejectConsent.waitFor({ state: 'visible', timeout: 1500 });
      await rejectConsent.click();
    } catch (_) {
      // O banner pode já ter sido resolvido pelo estado local do navegador.
    }
    await page.getByRole('tab', { name: /Pipeline/ }).click();
    const stage = page.locator('.kc-pipeline-stage').filter({ hasText: 'Deduplicação global' });
    await expect(stage).toContainText('bloqueado');
    const simulateButton = stage.getByRole('button', { name: 'Simular' });
    const realButton = stage.getByRole('button', { name: 'Executar real' });
    await expect(simulateButton).toBeDisabled();
    await expect(realButton).toBeDisabled();
    await expect(simulateButton).toHaveAttribute('title', /Lock global ocupado/);
    await expect(realButton).toHaveAttribute('title', /Lock global ocupado/);
  });
});
