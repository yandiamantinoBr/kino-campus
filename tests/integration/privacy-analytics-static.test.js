'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('privacidade, cookies e analytics - contratos estaticos', () => {
  test('codigo da plataforma continua sem uso direto de cookies', () => {
    const files = [
      'assets/js/core/kc-consent.js',
      'assets/js/features/kc-search.js',
      'assets/js/features/kc-home-categories.js',
      'assets/js/features/kc-privacy-analytics.js',
      'assets/js/features/kc-nav-links-personalized.js',
      'assets/js/api/kc-supabase.client.js',
    ];
    files.forEach((file) => {
      const source = read(file);
      expect(source).not.toMatch(/document\.cookie|Set-Cookie|cookieStore/);
    });
  });

  test('busca e categorias negam analytics quando KCConsent nao carrega', () => {
    const search = read('assets/js/features/kc-search.js');
    const categories = read('assets/js/features/kc-home-categories.js');
    expect(search).toMatch(/function hasAnalyticsConsent\(\)[\s\S]*return false;\s*\}/);
    expect(categories).toMatch(/function hasAnalyticsConsent\(\)[\s\S]*return false;\s*\}/);
  });

  test('migration de privacidade usa RLS, hash de sessao e security definer seguro', () => {
    const sql = read('supabase/migrations/_archive-v75/v9.3.5.16_privacy_analytics.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.privacy_analytics_events');
    expect(sql).toContain('ALTER TABLE public.privacy_analytics_events ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("encode(digest(v_session_id, 'sha256'), 'hex')");
    expect(sql).toContain('public.kc_admin_privacy_analytics');
    expect(sql).toContain('public.kc_prune_old_analytics()');
  });

  test('admin possui pagina dedicada, nav e exportacao', () => {
    const page = read('admin/privacy-analytics.html');
    const dashboard = read('admin/index.html');
    const controller = read('assets/js/controllers/admin/admin-privacy-analytics.controller.js');
    expect(page).toContain('Privacidade e Analytics');
    expect(page).toContain('privacyExportXlsx');
    expect(page).toContain('privacyExportPdf');
    expect(page).toContain('privacyEventLogSearch');
    expect(page).toContain('privacyEventLogPageSize');
    expect(page).toContain('privacyEventLogPrev');
    expect(page).toContain('privacyEventLogNext');
    expect(page).toContain('privacyEventLogCount');
    expect(page).toContain('../assets/js/controllers/admin/admin-export.shared.js?v=8.6.9');
    expect(page).toContain('../assets/js/controllers/admin/admin-privacy-analytics.controller.js?v=8.6.3');
    expect(dashboard).toContain('admin-dashboard.privacy.js?v=8.6.2');
    expect(dashboard).toContain('privacy-analytics.html');
    expect(controller).toContain('isMissingRpcError');
    expect(controller).toContain('loadLegacyAnalyticsRows');
    expect(controller).toContain('getFilteredEventRows');
    expect(controller).toContain('getPagedEventRows');
    expect(controller).toContain('KinoCampus - Relatório de Privacidade e Analytics');
    expect(controller).toContain('Inventário de cookies e armazenamento');
    expect(controller).toContain('Eventos recentes');
  });

  test('menu principal nasce na ordem fixa atual e nao reordena visualmente pelo JavaScript', () => {
    const script = read('assets/js/features/kc-nav-links-personalized.js');
    const expectedOrder = [
      'eventos.html',
      'oportunidades.html',
      'moradia.html',
      'compra-venda-feed.html',
      'caronas-feed.html',
      'achados-perdidos.html',
    ];
    [
      '_product.html',
      'achados-perdidos.html',
      'caronas-feed.html',
      'compra-venda-feed.html',
      'create-post.html',
      'eventos.html',
      'index.html',
      'moradia.html',
      'my-posts.html',
      'ods.html',
      'oportunidades.html',
      'privacidade.html',
      'search-results.html',
      'termos.html',
      'transparencia.html',
    ].forEach((file) => {
      const html = read(file);
      expect(html).toContain('assets/js/features/kc-nav-links-personalized.js?v=8.6.3');
      const nav = html.match(/<nav class="kc-nav-links"[\s\S]*?<\/nav>/);
      expect(nav).toBeTruthy();
      const hrefs = Array.from(nav[0].matchAll(/<a\b[^>]*href="([^"]+)"/g)).map((match) => match[1]);
      expect(hrefs.slice(0, expectedOrder.length)).toEqual(expectedOrder);
    });
    expect(script).not.toContain('kc:navLinksOrder:v1');
    expect(script).not.toContain('KCAPI.getPersonalizedTabs');
    expect(script).not.toContain('KCHomeCategories.getCategoryCounts');
    expect(script).not.toContain('applyOrderToNav');
    expect(script).not.toContain('appendChild');
    expect(script).toContain('KCPrivacyAnalytics.track');
  });

  test('rodape publico de transparencia nao aponta para painel admin', () => {
    const consent = read('assets/js/core/kc-consent.js');

    expect(consent).toContain('Central de Transparência');
    expect(consent).toContain("getLegalHref('transparencia.html')");
    expect(consent).toContain("getRootHref('ajuda.html#solicitacoes-suporte')");
    expect(consent).not.toContain("getRootHref('admin/help-requests.html')");
  });
});
