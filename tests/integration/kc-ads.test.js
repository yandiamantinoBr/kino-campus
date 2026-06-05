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

  test('insere anuncio inline depois dos primeiros cards', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      '<article class="kc-card">1</article>',
      '<article class="kc-card">2</article>',
      '<article class="kc-card">3</article>',
      '</div>',
    ].join('');

    const ok = KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [{
      id: 'ad-1',
      title: 'Anuncio',
      target_url: 'https://example.com',
      placements: ['feed_inline'],
    }], { module_key: 'eventos' });

    expect(ok).toBe(true);
    expect(document.querySelectorAll('.kc-ad-card--inline')).toHaveLength(1);
    expect(document.querySelector('.kc-feed-list').children[2].className).toContain('kc-ad-card');
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
});
