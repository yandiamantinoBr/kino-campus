const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-cadu.controller.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(ROOT, 'admin/cadu.html'), 'utf8');

describe('admin Cadu UX contracts', () => {
  test('keeps the feed page size aligned with the visible default', () => {
    expect(controller).toContain('var FEED_PAGE_SIZE = 25;');
    expect(controller).toContain('feedLimit: FEED_PAGE_SIZE');
    expect(html).toMatch(/<option value="25">25 itens<\/option>/);
  });

  test('load more appends the next page instead of replacing the current rows', () => {
    expect(controller).toContain('function loadFeedMore()');
    expect(controller).toContain('state.feedPage + loadedPages');
    expect(controller).toContain('state.allFeedItems.concat(items)');
    expect(controller).toContain("feedMoreB.addEventListener('click', loadFeedMore)");
  });

  test('KPI shortcuts reset stale site filters before applying their own filter', () => {
    expect(controller).toContain("state.sitesFilter = { q: '', tier: '', ig: '' }");
    expect(controller).toContain("if (filter !== 'all')");
    expect(html).toContain('data-kpi-filter="all"');
    expect(html).toContain('data-kpi-filter="ig=confirmed"');
    expect(html).toContain('data-kpi-filter="tier=1"');
  });

  test('PDF export restores the original button markup', () => {
    expect(controller).not.toContain('.innerHtml');
    expect(controller.match(/btn \? btn\.innerHTML : ''/g).length).toBeGreaterThanOrEqual(2);
  });

  test('new interactive controls keep localized tooltip contracts', () => {
    [
      'tooltip.cadu-kpi-sites',
      'tooltip.cadu-kpi-instagram',
      'tooltip.cadu-kpi-tier1',
      'tooltip.cadu-kpi-feed',
      'tooltip.cadu-kpi-api',
      'tooltip.cadu-sites-export-pdf',
      'tooltip.cadu-feed-export-pdf',
      'tooltip.cadu-feed-load-more'
    ].forEach((key) => expect(html).toContain(`data-i18n-tooltip="${key}"`));
  });
});
