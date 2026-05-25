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
    const sql = read('supabase/migrations/v9.3.5.16_privacy_analytics.sql');
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
    expect(page).toContain('../assets/js/controllers/admin/admin-export.shared.js?v=8.6.4');
    expect(page).toContain('../assets/js/controllers/admin/admin-privacy-analytics.controller.js?v=8.6.2');
    expect(dashboard).toContain('admin-dashboard.privacy.js?v=8.6.2');
    expect(dashboard).toContain('privacy-analytics.html');
    expect(controller).toContain('isMissingRpcError');
    expect(controller).toContain('loadLegacyAnalyticsRows');
  });

  test('menu principal carrega personalizacao isolada sem editar a estrutura base', () => {
    const index = read('index.html');
    const script = read('assets/js/features/kc-nav-links-personalized.js');
    expect(index).toContain('assets/js/features/kc-nav-links-personalized.js?v=8.6.2');
    expect(script).toContain('kc:navLinksOrder:v1');
    expect(script).toContain('KCAPI.getPersonalizedTabs');
    expect(script).toContain('KCHomeCategories.getCategoryCounts');
    expect(script).toContain('applyOrderToNav');
  });
});
