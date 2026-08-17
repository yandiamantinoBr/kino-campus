const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);

function extractFunctionSource(name) {
  let start = controller.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  if (controller.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const bodyStart = controller.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < controller.length; index += 1) {
    if (controller[index] === '{') depth += 1;
    if (controller[index] === '}') depth -= 1;
    if (depth === 0) return controller.slice(start, index + 1);
  }
  throw new Error(`function ${name} is incomplete`);
}

function createFreshnessHarness(state, performPipelineRefresh, renderPipelineStages) {
  return Function(
    'state',
    'performPipelineRefresh',
    'renderPipelineStages',
    `"use strict";
     const pipelineControlIsReady = ${extractFunctionSource('pipelineControlIsReady')};
     const invalidatePipelineControl = ${extractFunctionSource('invalidatePipelineControl')};
     const refreshPipeline = ${extractFunctionSource('refreshPipeline')};
     const ensureFreshPipelineControl = ${extractFunctionSource('ensureFreshPipelineControl')};
     return { refreshPipeline, ensureFreshPipelineControl };`
  )(state, performPipelineRefresh, renderPipelineStages);
}

function createExpiryHarness(state, renderPipelineStages) {
  return Function(
    'state',
    'renderPipelineStages',
    `"use strict";
     const invalidatePipelineControl = ${extractFunctionSource('invalidatePipelineControl')};
     const schedulePipelineControlExpiry = ${extractFunctionSource('schedulePipelineControlExpiry')};
     return { schedulePipelineControlExpiry };`
  )(state, renderPipelineStages);
}

function createRenderPipelineStages(state) {
  return Function(
    'state',
    '$',
    '$$',
    'escapeHtml',
    'pipelineRunDisplayStatus',
    'fmtAgo',
    'pipelineStatusLabel',
    'renderStagePreflight',
    'pipelineStageActionModes',
    'renderRunSummary',
    'categoryIcon',
    'runPipelineStage',
    `"use strict";
     const pipelineControlIsReady = ${extractFunctionSource('pipelineControlIsReady')};
     const pipelineRealRunApprovalGated = ${extractFunctionSource('pipelineRealRunApprovalGated')};
     const pipelineStageModePrecondition = ${extractFunctionSource('pipelineStageModePrecondition')};
     const renderDedupProtectedFlow = ${extractFunctionSource('renderDedupProtectedFlow')};
     return (${extractFunctionSource('renderPipelineStages')});`
  )(
    state,
    (selector) => document.querySelector(selector),
    (selector) => Array.from(document.querySelectorAll(selector)),
    (value) => String(value == null ? '' : value),
    (run) => run.status,
    () => 'agora',
    (status) => status,
    () => '',
    () => [{ dryRun: true, label: 'Simular', danger: false }],
    () => '',
    () => 'fa-play',
    jest.fn()
  );
}

function createRunHarness(dependencies) {
  return Function(
    'state',
    'getCaduConfig',
    'getAdminAccessToken',
    'ensureFreshPipelineControl',
    'renderPipelineStages',
    'lockPipelineActionButtons',
    'apiFetch',
    'confirm',
    'alert',
    '$',
    '$$',
    'disconnectPipelineStream',
    'stopPipelineLogPolling',
    'refreshPipeline',
    `"use strict";
     const pipelineControlIsReady = ${extractFunctionSource('pipelineControlIsReady')};
     const invalidatePipelineControl = ${extractFunctionSource('invalidatePipelineControl')};
     const findPipelineStage = ${extractFunctionSource('findPipelineStage')};
     const resolvePipelineDryRun = ${extractFunctionSource('resolvePipelineDryRun')};
     const buildPipelineRunRequest = ${extractFunctionSource('buildPipelineRunRequest')};
     const pipelineStageModePrecondition = ${extractFunctionSource('pipelineStageModePrecondition')};
     return (${extractFunctionSource('runPipelineStage')});`
  )(
    dependencies.state,
    dependencies.getCaduConfig,
    dependencies.getAdminAccessToken,
    dependencies.ensureFreshPipelineControl,
    dependencies.renderPipelineStages,
    dependencies.lockPipelineActionButtons,
    dependencies.apiFetch,
    dependencies.confirm,
    dependencies.alert,
    dependencies.$,
    dependencies.$$,
    dependencies.disconnectPipelineStream,
    dependencies.stopPipelineLogPolling,
    dependencies.refreshPipeline
  );
}

function createCaduFetchRawHarness(dependencies) {
  return Function(
    'getCaduConfig',
    'getAdminAccessToken',
    'buildCaduApiUrl',
    'fetch',
    `"use strict"; return (${extractFunctionSource('caduFetchRaw')});`
  )(
    dependencies.getCaduConfig,
    dependencies.getAdminAccessToken,
    dependencies.buildCaduApiUrl,
    dependencies.fetch
  );
}

function pipelineState(now) {
  return {
    pipelineControlReady: true,
    pipelineControlReason: '',
    pipelineSnapshotExpiresAt: now + 15000,
    pipelineRequestGeneration: 1,
    pipelineRefreshPromise: null,
    pipelineExpiryTimer: null,
    pipelineExpiryGeneration: 0,
    pipelineStartPending: false,
    pipelineCapabilities: { explicit_dry_run: true, explicit_run_mode_routes: true },
    pipelineStages: [{
      id: 'all',
      preflight: {
        can_run: true,
        command: 'node scripts/pipeline-kino.js all --contract=old',
        warnings: [],
        blockers: [],
        profile: {
          risk: 'high',
          dry_run_available: true,
          force_dry_run: false,
          mutates_platform: true,
        },
      },
    }],
  };
}

describe('Cadu pipeline snapshot TTL control', () => {
  const initialNow = Date.parse('2026-07-14T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(initialNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('expires controls just after 15 seconds and rerenders them as safe renewal actions', () => {
    const state = pipelineState(initialNow);
    document.body.innerHTML = '<div id="pipeline-stages-list"></div>';
    const renderPipelineStages = jest.fn(createRenderPipelineStages(state));
    const { schedulePipelineControlExpiry } = createExpiryHarness(state, renderPipelineStages);

    renderPipelineStages(state.pipelineStages);
    expect(document.querySelector('.kc-pipeline-stage__btn').disabled).toBe(false);
    renderPipelineStages.mockClear();
    schedulePipelineControlExpiry();
    jest.advanceTimersByTime(15000);
    expect(state.pipelineControlReady).toBe(true);
    expect(renderPipelineStages).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(state.pipelineControlReady).toBe(false);
    expect(state.pipelineCapabilities).toEqual({});
    expect(state.pipelineControlReason).toContain('dados de controle expirados');
    expect(renderPipelineStages).toHaveBeenCalledWith(state.pipelineStages);
    expect(document.querySelector('.kc-pipeline-stage__btn').disabled).toBe(false);
    expect(document.querySelector('.kc-pipeline-stage__btn').textContent).toContain('Renovar');
    expect(document.querySelector('#pipeline-stages-list').textContent).toContain('dados de controle expirados');
  });

  test('concurrent refresh callers share one in-flight contract request', async () => {
    const state = pipelineState(initialNow);
    state.pipelineControlReady = false;
    state.pipelineSnapshotExpiresAt = 0;
    let finishRefresh;
    const performPipelineRefresh = jest.fn(() => new Promise((resolve) => {
      finishRefresh = () => {
        state.pipelineControlReady = true;
        state.pipelineSnapshotExpiresAt = Date.now() + 15000;
        resolve();
      };
    }));
    const renderPipelineStages = jest.fn();
    const harness = createFreshnessHarness(state, performPipelineRefresh, renderPipelineStages);

    const first = harness.ensureFreshPipelineControl();
    const second = harness.ensureFreshPipelineControl();
    expect(performPipelineRefresh).toHaveBeenCalledTimes(1);

    finishRefresh();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(performPipelineRefresh).toHaveBeenCalledTimes(1);
    expect(state.pipelineRefreshPromise).toBeNull();
  });

  test('confirmation older than 15 seconds is discarded, refreshed and asked again before POST', async () => {
    const state = pipelineState(initialNow);
    const apiFetch = jest.fn().mockResolvedValue({ run_id: 'run-fresh' });
    const confirm = jest.fn()
      .mockImplementationOnce(() => {
        jest.setSystemTime(initialNow + 15001);
        return true;
      })
      .mockReturnValueOnce(true);
    const ensureFreshPipelineControl = jest.fn(async () => {
      if (state.pipelineControlReady && Date.now() <= state.pipelineSnapshotExpiresAt) return true;
      state.pipelineRequestGeneration += 1;
      state.pipelineControlReady = true;
      state.pipelineSnapshotExpiresAt = Date.now() + 15000;
      state.pipelineCapabilities = { explicit_dry_run: true, explicit_run_mode_routes: true };
      state.pipelineStages[0].preflight.command = 'node scripts/pipeline-kino.js all --contract=fresh';
      return true;
    });
    const renderPipelineStages = jest.fn();
    const restoreButtons = jest.fn();
    const refreshPipeline = jest.fn();
    const runPipelineStage = createRunHarness({
      state,
      getCaduConfig: jest.fn(() => ({ direct: false })),
      getAdminAccessToken: jest.fn().mockResolvedValue('admin-jwt'),
      ensureFreshPipelineControl,
      renderPipelineStages,
      lockPipelineActionButtons: jest.fn(() => restoreButtons),
      apiFetch,
      confirm,
      alert: jest.fn(),
      $: jest.fn(() => null),
      $$: jest.fn(() => []),
      disconnectPipelineStream: jest.fn(),
      stopPipelineLogPolling: jest.fn(),
      refreshPipeline,
    });

    await runPipelineStage('all', true, null);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[0][0]).toContain('--contract=old');
    expect(confirm.mock.calls[1][0]).toContain('--contract=fresh');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe('/api/cadu/pipeline/run/dry-run');
    expect(apiFetch.mock.invocationCallOrder[0]).toBeGreaterThan(confirm.mock.invocationCallOrder[1]);
    expect(restoreButtons).toHaveBeenCalledTimes(1);
    expect(refreshPipeline).toHaveBeenCalledTimes(1);
  });

  test('clicking an already expired action renews before the first confirmation and POST', async () => {
    const state = pipelineState(initialNow);
    state.pipelineControlReady = false;
    state.pipelineSnapshotExpiresAt = 0;
    state.pipelineCapabilities = {};
    const ensureFreshPipelineControl = jest.fn(async () => {
      state.pipelineRequestGeneration += 1;
      state.pipelineControlReady = true;
      state.pipelineSnapshotExpiresAt = Date.now() + 15000;
      state.pipelineCapabilities = { explicit_dry_run: true, explicit_run_mode_routes: true };
      state.pipelineStages[0].preflight.command = 'node scripts/pipeline-kino.js all --contract=renewed';
      return true;
    });
    const apiFetch = jest.fn().mockResolvedValue({ run_id: 'run-renewed' });
    const confirm = jest.fn().mockReturnValue(true);
    const runPipelineStage = createRunHarness({
      state,
      getCaduConfig: jest.fn(() => ({ direct: false })),
      getAdminAccessToken: jest.fn().mockResolvedValue('admin-jwt'),
      ensureFreshPipelineControl,
      renderPipelineStages: jest.fn(),
      lockPipelineActionButtons: jest.fn(() => jest.fn()),
      apiFetch,
      confirm,
      alert: jest.fn(),
      $: jest.fn(() => null),
      $$: jest.fn(() => []),
      disconnectPipelineStream: jest.fn(),
      stopPipelineLogPolling: jest.fn(),
      refreshPipeline: jest.fn(),
    });

    await runPipelineStage('all', true, null);

    expect(ensureFreshPipelineControl).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('--contract=renewed');
    expect(confirm.mock.calls[0][0]).not.toContain('--contract=old');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  test('failed renewal after expiry cannot reach a pipeline POST', async () => {
    const state = pipelineState(initialNow);
    state.pipelineControlReady = false;
    state.pipelineSnapshotExpiresAt = 0;
    const apiFetch = jest.fn();
    const confirm = jest.fn();
    const alert = jest.fn();
    const runPipelineStage = createRunHarness({
      state,
      getCaduConfig: jest.fn(() => ({ direct: false })),
      getAdminAccessToken: jest.fn().mockResolvedValue('admin-jwt'),
      ensureFreshPipelineControl: jest.fn().mockResolvedValue(false),
      renderPipelineStages: jest.fn(),
      lockPipelineActionButtons: jest.fn(() => jest.fn()),
      apiFetch,
      confirm,
      alert,
      $: jest.fn(() => null),
      $$: jest.fn(() => []),
      disconnectPipelineStream: jest.fn(),
      stopPipelineLogPolling: jest.fn(),
      refreshPipeline: jest.fn(),
    });

    await runPipelineStage('all', true, null);

    expect(confirm).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Nenhuma execução foi iniciada'));
  });

  test('a prepared Authorization header reaches fetch without another async auth gap', async () => {
    const getAdminAccessToken = jest.fn();
    const fetch = jest.fn().mockResolvedValue({ ok: true });
    const caduFetchRaw = createCaduFetchRawHarness({
      getCaduConfig: jest.fn(() => ({ direct: false, token: '' })),
      getAdminAccessToken,
      buildCaduApiUrl: jest.fn((value) => value),
      fetch,
    });

    const response = caduFetchRaw('/api/cadu/pipeline/run/dry-run', {
      method: 'POST',
      headers: { Authorization: 'Bearer prepared-admin-jwt' },
    });

    expect(getAdminAccessToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(response).resolves.toEqual({ ok: true });
  });
});
