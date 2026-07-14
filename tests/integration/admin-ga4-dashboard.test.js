const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-ga4-dashboard.controller.js'),
  'utf8'
);
const HTML = fs.readFileSync(path.join(ROOT, 'admin/ga4-dashboard.html'), 'utf8');

describe('admin GA4 dashboard event rendering contract', () => {
  test('renders the normalized event list instead of the internal lookup map', () => {
    expect(SOURCE).toContain('snapshot.events = eventsListArr;');
    expect(SOURCE).toContain('renderEvents(snapshot.events);');
    expect(SOURCE).not.toContain('renderEvents(eventsList);');
  });

  test('accepts the key field produced by the normalized event list', () => {
    expect(SOURCE).toContain("String(r.key || r.event || '')");
    expect(SOURCE).toContain('var list = Array.isArray(rows) ? rows : [];');
  });

  test('filters reports to the production hostname and removes admin page views', () => {
    expect(SOURCE).toContain("fieldName: 'hostName'");
    expect(SOURCE).toContain("values: ['www.kinocampus.com.br', 'kinocampus.com.br']");
    expect(SOURCE).toContain("fieldName: 'pagePath'");
    expect(SOURCE).toContain("value: '/admin', matchType: 'EXACT'");
    expect(SOURCE).toContain("value: '/admin/'");
    expect(SOURCE).toContain('JSON.stringify(addProductionFilter(body, options))');
  });

  test('keeps legacy and recommended product events in the same report', () => {
    expect(SOURCE).toContain("values: ['login', 'sign_up', 'search', 'share', 'generate_lead']");
    expect(SOURCE).toContain("eventMap.generate_lead");
    expect(SOURCE).toContain("eventMap.share");
  });

  test('falls back only to product page views and labels that fallback explicitly', () => {
    expect(SOURCE).toContain('function sumPostPageViews(pages)');
    expect(SOURCE).toContain("split(/[?#]/)[0].replace(/\\/+$/, '')");
    expect(SOURCE).toContain('_?product\\.html$/i.test(path)');
    expect(SOURCE).toContain('var fallbackPostViews = sumPostPageViews(pagesList);');
    expect(SOURCE).not.toContain('(snapshot.summary.sevenDays && snapshot.summary.sevenDays.views)');
    expect(SOURCE).toContain('viewsLabel: hasTrackedPostViews');
    expect(SOURCE).toContain("'Visualiza\\u00e7\\u00f5es das p\\u00e1ginas de publica\\u00e7\\u00e3o (fallback)'");
    expect(SOURCE).toContain('step(viewsLabel, v, v)');
    expect(SOURCE).toContain("f.viewsLabel || 'Visualiza\\u00e7\\u00f5es de publica\\u00e7\\u00f5es'");
  });

  test('uses the full page result set for module totals but renders only the top ten', () => {
    expect(SOURCE).toContain('limit: 250');
    expect(SOURCE).toContain('renderPages(snapshot.pages.slice(0, 10));');
    expect(SOURCE).toContain('aggregateModuleBreakdown(pagesList)');
  });

  test('uses an inclusive seven-day range instead of accidentally requesting eight days', () => {
    expect((SOURCE.match(/startDate: '6daysAgo'/g) || [])).toHaveLength(8);
    expect(SOURCE).not.toContain("startDate: '7daysAgo'");
    expect(SOURCE).toContain('limit: 7');
  });
});

describe('admin Search Console dashboard integration', () => {
  test('exposes the 28-day summary and top-query/page regions', () => {
    expect(HTML).toContain('id="searchConsolePanel"');
    expect(HTML).toContain('id="searchConsoleSummary"');
    expect(HTML).toContain('id="searchConsoleQueriesBody"');
    expect(HTML).toContain('id="searchConsolePagesBody"');
    expect(HTML).toContain('Google Search Console — busca orgânica (28 dias)');
  });

  test('calls the authenticated read-only Edge Function for totals, queries and pages', () => {
    expect(SOURCE).toContain("'/functions/v1/kc-search-console-reports'");
    expect(SOURCE).toContain("'Authorization': 'Bearer ' + token");
    expect((SOURCE.match(/action: 'searchAnalytics'/g) || [])).toHaveLength(3);
    expect(SOURCE).toContain("dimensions: ['query']");
    expect(SOURCE).toContain("dimensions: ['page']");
    expect(SOURCE).toContain('rowLimit: 10');
    expect(SOURCE).toContain("type: 'web'");
  });

  test('uses an inclusive 28-day range ending yesterday', () => {
    expect(SOURCE).toContain('end.setDate(end.getDate() - 1);');
    expect(SOURCE).toContain('start.setDate(start.getDate() - 27);');
  });

  test('keeps Search Console failures local so GA4 remains usable', () => {
    var start = SOURCE.indexOf('async function loadSearchConsole');
    var end = SOURCE.indexOf('\n  function renderSearchConsoleSnapshot', start);
    var loader = SOURCE.slice(start, end);
    expect(loader).toContain('statusText: friendlySearchConsoleError(error)');
    expect(loader).toContain('data: null');
    expect(loader).not.toContain('setError(');
    expect(loader).not.toContain('window.__KCGa4Data');
    expect(loader).not.toContain('renderSearchConsoleSummary(');
    expect(SOURCE).toContain('var searchConsoleResult = await searchConsolePromise;');
    expect(SOURCE).toContain('O restante do painel continua disponível.');
  });

  test('escapes Google-provided query and page labels before rendering', () => {
    expect(SOURCE).toContain("'<td><code>' + escapeHtml(row.key) + '</code></td>'");
    expect(SOURCE).toContain("renderSearchConsoleTable('#searchConsoleQueriesBody', result.data.queries");
    expect(SOURCE).toContain("renderSearchConsoleTable('#searchConsolePagesBody', result.data.pages");
  });

  test('neutralizes spreadsheet formulas in Search Console CSV labels', () => {
    expect(SOURCE).toContain("if (/^[=+\\-@\\t\\r]/.test(s)) s = \"'\" + s;");
    expect(SOURCE).toContain('csvEscape(row.key)');
  });
});

describe('admin GA4 dashboard refresh consistency', () => {
  test('aligns the UI and auto-refresh interval to the five-minute Edge cache', () => {
    expect(SOURCE).toContain('var REFRESH_INTERVAL_MS = 300_000;');
    expect(HTML).toContain('O painel atualiza a cada 5 minutos');
    expect(HTML).not.toContain('atualiza a cada 60 s');
    expect(HTML).toContain('admin-ga4-dashboard.controller.js?v=8.6.10');
  });

  test('coalesces overlapping manual and automatic refreshes into one promise', () => {
    expect(SOURCE).toContain('var dashboardLoadPromise = null;');
    expect(SOURCE).toContain('if (dashboardLoadPromise) return dashboardLoadPromise;');
    expect(SOURCE).toContain('dashboardLoadPromise = performDashboardLoad().finally(function () {');
    expect(SOURCE).toContain('dashboardLoadPromise = null;');
  });

  test('disables refresh and CSV actions for the whole in-flight cycle', () => {
    expect(SOURCE).toContain('refreshBtn.disabled = isBusy;');
    expect(SOURCE).toContain('csvBtn.disabled = isBusy || !hasExportableSnapshot();');
    expect(SOURCE).toContain('setDashboardBusy(true);');
    expect(SOURCE).toContain('setDashboardBusy(false);');
    expect(SOURCE).toContain('if (dashboardLoadPromise) return;');
    expect(SOURCE).toContain('if (!snap || !snap.loadedAt)');
  });

  test('builds one local GA4/Search Console snapshot and publishes it once', () => {
    expect(SOURCE).toContain("var snapshot = { startedAt: new Date().toISOString() };");
    expect(SOURCE).toContain('snapshot.searchConsole = searchConsoleResult.data;');
    expect(SOURCE).toContain('commitDashboardSnapshot(snapshot, searchConsoleResult);');
    expect((SOURCE.match(/window\.__KCGa4Data\s*=/g) || [])).toHaveLength(1);
    expect(SOURCE).toContain('window.__KCGa4Data = snapshot;');
    expect(SOURCE).not.toMatch(/window\.__KCGa4Data\.[A-Za-z]+\s*=/);
  });
});
