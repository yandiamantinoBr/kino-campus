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

  test('pipeline actions make dry-run versus real execution explicit', () => {
    expect(controller).toContain('data-dry-run="');
    expect(controller).toContain("state.pipelineCapabilities = status.capabilities || {};");
    expect(controller).toContain("capabilities.explicit_run_mode_routes === true");
    expect(controller).toContain("profile.force_dry_run === true");
    expect(controller).toContain("profile.mutates_platform ? 'Executar real' : 'Executar'");
    expect(controller).toContain('buildPipelineRunRequest(stageId, dryRun, state.pipelineCapabilities)');
    expect(controller).toContain("path += dryRun ? '/dry-run' : '/real'");
    expect(controller).toContain('body: JSON.stringify(request.payload)');
    expect(html).toContain('.kc-pipeline-stage__actions');
  });

  test('pipeline action siblings are locked and restored as one operation', () => {
    expect(controller).toContain('function lockPipelineActionButtons(clickedButton)');
    expect(controller).toContain("parent.querySelectorAll('.kc-pipeline-stage__btn')");
    expect(controller).toContain('state.pipelineStartPending = true;');
    expect(controller).toContain('state.pipelineStartPending = false;');
    expect(controller).toContain('renderPipelineStages(state.pipelineStages || []);');
    expect(controller).toContain('restoreButtons();');
  });

  test('active pipeline card exposes the effective execution mode', () => {
    expect(controller).toContain("typeof active.dry_run === 'boolean'");
    expect(controller).toContain("active.dry_run ? 'simulação' : 'execução real'");
    expect(controller).toContain("typeof r.dry_run === 'boolean'");
  });
});
