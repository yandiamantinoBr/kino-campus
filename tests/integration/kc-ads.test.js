const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KCAds = require('../../assets/js/features/kc-ads.js');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('KCAds feed monetization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/eventos.html');
    window.KCConsent = { hasConsent: () => false };
  });

  test('normaliza campanhas e remove URLs perigosas', () => {
    const rows = KCAds.normalizeAdRows([
      {
        id: 'ad-1',
        title: 'Curso patrocinado',
        target_url: 'https://example.com/?utm=1',
        image_url: 'javascript:alert(1)',
        placements: ['feed_inline', 'feed_aside'],
        module_keys: ['Eventos'],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].image_url).toBe('');
    expect(rows[0].module_keys).toEqual(['eventos']);
    expect(rows[0].placements).toEqual(['feed_inline', 'feed_aside']);
  });

  test('renderiza anuncio rotulado com rel sponsored', () => {
    const html = KCAds.buildAdHTML({
      id: 'ad-1',
      title: 'Bolsa para estudantes',
      description: 'Inscrições abertas.',
      target_url: 'https://example.com',
      cta_label: 'Acessar',
      advertiser_name: 'Parceiro',
      placements: ['feed_inline'],
    }, 'feed_inline');

    expect(html).toContain('Patrocinado');
    expect(html).toContain('data-kc-ad-id="ad-1"');
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(html).toContain('Bolsa para estudantes');
  });

  test('insere anuncios inline a cada 6 publicacoes', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 12 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');

    const ok = KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [{
      id: 'ad-1',
      title: 'Anuncio',
      target_url: 'https://example.com',
      placements: ['feed_inline'],
    }], { module_key: 'eventos' });

    expect(ok).toBe(true);
    expect(document.querySelectorAll('.kc-ad-card--inline')).toHaveLength(2);
    expect(document.querySelector('.kc-feed-list').children[6].className).toContain('kc-ad-card');
    expect(document.querySelector('.kc-feed-list').children[13].className).toContain('kc-ad-card');
    expect(KCAds.getInlineSlotCount(18)).toBe(3);
  });

  test('renderiza slot AdSense apenas quando publicidade foi aceita', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 6 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');

    const config = KCAds.normalizeAdConfig({
      status: 'active',
      adsense_client_id: 'ca-pub-2776499020194231',
      placement_modes: { feed_inline: 'adsense_only' },
      adsense_slots: { feed_inline: '1234567890' },
    });

    expect(KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [], { module_key: 'eventos' }, config)).toBe(false);
    expect(document.querySelector('ins.adsbygoogle')).toBeFalsy();

    window.KCConsent = { hasConsent: (key) => key === 'advertising' };
    expect(KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [], { module_key: 'eventos' }, config)).toBe(true);
    const slot = document.querySelector('ins.adsbygoogle');
    expect(slot).toBeTruthy();
    expect(slot.getAttribute('data-ad-client')).toBe('ca-pub-2776499020194231');
    expect(slot.getAttribute('data-ad-slot')).toBe('1234567890');
  });

  test('renderiza anuncios laterais em bloco inicial e bloco sticky final', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="one">Resumo</section>',
      '<section class="kc-sidebar-section" id="two">Filtros</section>',
      '</aside></main>',
    ].join('');

    const ok = KCAds.renderAsideAds([
      { id: 'ad-1', title: 'Topo', target_url: 'https://example.com/a', placements: ['feed_aside'] },
      { id: 'ad-2', title: 'Sticky', target_url: 'https://example.com/b', placements: ['feed_aside'] },
    ], { module_key: 'eventos' }, document);

    expect(ok).toBe(true);
    expect(document.querySelector('[data-kc-ad-aside="top"]')).toBeTruthy();
    expect(document.querySelector('[data-kc-ad-aside="sticky"]')).toBeTruthy();
    expect(document.querySelector('.kc-sidebar').firstElementChild.getAttribute('data-kc-ad-aside')).toBe('top');
    expect(document.querySelector('.kc-sidebar').lastElementChild.getAttribute('data-kc-ad-aside')).toBe('sticky');
  });

  test('adiciona UTMs em URLs externas de campanha', () => {
    const url = KCAds.buildTrackedTargetUrl({
      id: 'ad-1',
      name: 'Curso parceiro UFG',
      title: 'Curso',
      target_url: 'https://parceiro.example/path?x=1',
      placements: ['feed_inline'],
    }, 'feed_inline');

    expect(url).toContain('utm_source=kinocampus');
    expect(url).toContain('utm_medium=feed_ad');
    expect(url).toContain('utm_campaign=curso-parceiro-ufg');
    expect(url).toContain('utm_content=feed_inline');
    expect(url).toContain('kc_ad_id=ad-1');
  });

  test('seleciona feed_aside por contexto de modulo', () => {
    const selected = KCAds.selectAdsForPlacement([
      { id: 'a', title: 'Evento', target_url: 'https://a.test', placements: ['feed_aside'], module_keys: ['eventos'], priority: 1 },
      { id: 'b', title: 'Moradia', target_url: 'https://b.test', placements: ['feed_aside'], module_keys: ['moradia'], priority: 10 },
    ], 'feed_aside', { module_key: 'eventos' }, 2);

    expect(selected.map((ad) => ad.id)).toEqual(['a']);
  });

  test('carrega script apenas nas paginas de feed planejadas', () => {
    [
      'index.html',
      'eventos.html',
      'oportunidades.html',
      'moradia.html',
      'compra-venda-feed.html',
      'caronas-feed.html',
      'achados-perdidos.html',
      'search-results.html',
    ].forEach((file) => {
      expect(read(file)).toContain('assets/js/features/kc-ads.js');
    });

    [
      '_product.html',
      'create-post.html',
      'my-posts.html',
      'profile.html',
      'settings.html',
      'privacidade.html',
      'termos.html',
      'ajuda.html',
      'transparencia.html',
      'admin/banners.html',
    ].forEach((file) => {
      const html = read(file);
      if (file === 'admin/banners.html') {
        expect(html).toContain('../assets/js/features/kc-ads.js');
      } else {
        expect(html).not.toContain('assets/js/features/kc-ads.js');
      }
    });
  });

  test('migration define tabela, RPCs e eventos de anuncios', () => {
    const sql = read('supabase/migrations/20260605010000_feed_ads.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ad_campaigns');
    expect(sql).toContain('public.kc_get_feed_ads');
    expect(sql).toContain('public.kc_admin_save_ad_campaign');
    expect(sql).toContain("'ad_impression'");
    expect(sql).toContain("'ad_click'");
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  test('migration AdSense define settings, RPCs e audit log canonico', () => {
    const sql = read('supabase/migrations/20260605143000_adsense_admin_monetization.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ad_network_settings');
    expect(sql).toContain('public.kc_get_feed_ad_config');
    expect(sql).toContain('public.kc_admin_get_ad_network_settings');
    expect(sql).toContain('public.kc_admin_save_ad_network_settings');
    expect(sql).toContain('public.kc_admin_ads_overview');
    expect(sql).toContain("'ad_campaign_created'");
    expect(sql).toContain("'ad_network_settings_updated'");
    expect(sql).toContain('ca-pub-2776499020194231');
  });

  test('admin de banners contem controles de anuncios de feed', () => {
    const html = read('admin/banners.html');
    const controller = read('assets/js/controllers/admin/admin-feed-ads.controller.js');

    [
      'feed-ads-metric-window',
      'feed-ads-summary',
      'ad-image-file',
      'ad-image-upload',
      'ad-tracking-preview',
      'feed-ads-filter-query',
      'feed-ads-filter-status',
      'feed-ads-filter-module',
      'ad-network-status',
      'ad-network-client-id',
      'ad-mode-feed-inline',
      'ad-mode-feed-aside-top',
      'ad-mode-feed-aside-sticky',
      'ad-network-save',
    ].forEach((id) => {
      expect(html).toContain('id="' + id + '"');
    });
    expect(controller).toContain('uploadAdImage');
    expect(controller).toContain('getMetricWindowDays');
    expect(controller).toContain('fetchAdNetworkSettings');
    expect(controller).toContain('saveAdNetworkSettings');
    expect(controller).toContain('url_rastreavel');
  });
});
