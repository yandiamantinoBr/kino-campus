const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const KCAds = require('../../assets/js/features/kc-ads.js');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('KCAds feed monetization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/eventos.html');
    window.KCConsent = { hasConsent: () => false };
    KCAds.clearFrequencyCaps();
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

  test('insere um anúncio depois de cada 5 publicações visíveis', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 12 }, (_, index) => '<article class="kc-card" data-post-id="post-' + (index + 1) + '">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');

    const ok = KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [{
      id: 'ad-1',
      title: 'Anúncio',
      target_url: 'https://example.com',
      placements: ['feed_inline'],
    }], { module_key: 'eventos' });

    expect(ok).toBe(true);
    expect(document.querySelectorAll('.kc-ad-card--inline')).toHaveLength(2);
    expect(document.querySelector('.kc-feed-list').children[5].className).toContain('kc-ad-card');
    expect(document.querySelector('.kc-feed-list').children[11].className).toContain('kc-ad-card');
    expect(KCAds.getInlineSlotCount(4)).toBe(0);
    expect(KCAds.getInlineSlotCount(5)).toBe(1);
    expect(KCAds.getInlineSlotCount(18)).toBe(3);
    expect(KCAds.getInlineSlotCount(45)).toBe(9);
  });

  test('ignora cards ocultos e nunca agrupa anúncios consecutivos', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 24 }, (_, index) => {
        const visible = [0, 1, 4, 8, 12, 16, 20, 23].includes(index);
        return '<article class="kc-card" data-post-id="post-' + (index + 1) + '" style="' + (visible ? '' : 'display:none') + '">' + (index + 1) + '</article>';
      }).join(''),
      '</div>',
    ].join('');

    expect(KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [{
      id: 'ad-1', title: 'Anúncio', target_url: 'https://example.com', placements: ['feed_inline'],
    }], { module_key: 'eventos' })).toBe(true);

    const visibleOrder = Array.from(document.querySelector('.kc-feed-list').children)
      .filter((node) => node.classList.contains('kc-ad-card') || KCAds.isVisibleFeedCard(node))
      .map((node) => node.classList.contains('kc-ad-card') ? 'AD' : node.getAttribute('data-post-id'));
    expect(visibleOrder).toEqual(['post-1', 'post-2', 'post-5', 'post-9', 'post-13', 'AD', 'post-17', 'post-21', 'post-24']);
    expect(visibleOrder.join(',')).not.toContain('AD,AD');
  });

  test('remove anúncios obsoletos quando o filtro deixa menos de 5 cards visíveis', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 10 }, (_, index) => '<article class="kc-card" data-post-id="post-' + index + '">' + index + '</article>').join(''),
      '</div>',
    ].join('');
    const list = document.querySelector('.kc-feed-list');
    const ads = [{ id: 'ad-1', title: 'Anúncio', target_url: 'https://example.com', placements: ['feed_inline'] }];
    expect(KCAds.renderInlineAds(list, ads, { module_key: 'eventos' })).toBe(true);
    expect(list.querySelectorAll('.kc-ad-card--inline')).toHaveLength(2);

    Array.from(list.querySelectorAll('.kc-card')).slice(3).forEach((card) => { card.style.display = 'none'; });
    expect(KCAds.renderInlineAds(list, ads, { module_key: 'eventos' })).toBe(false);
    expect(list.querySelectorAll('.kc-ad-card--inline')).toHaveLength(0);
    expect(list.dataset.kcAdsSignature).toBeUndefined();
  });

  test('reposiciona anúncios quando muda o subconjunto visível com a mesma contagem', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 10 }, (_, index) => '<article class="kc-card" data-post-id="post-' + index + '" style="' + (index >= 5 ? 'display:none' : '') + '">' + index + '</article>').join(''),
      '</div>',
    ].join('');
    const list = document.querySelector('.kc-feed-list');
    const cards = Array.from(list.querySelectorAll('.kc-card'));
    const ads = [{ id: 'ad-1', title: 'Anúncio', target_url: 'https://example.com', placements: ['feed_inline'] }];
    KCAds.renderInlineAds(list, ads, { module_key: 'eventos' });
    expect(list.querySelector('.kc-ad-card').previousElementSibling).toBe(cards[4]);

    cards.forEach((card, index) => { card.style.display = index < 5 ? 'none' : ''; });
    KCAds.renderInlineAds(list, ads, { module_key: 'eventos' });
    expect(list.querySelector('.kc-ad-card').previousElementSibling).toBe(cards[9]);
  });

  test('observador reordena anúncios quando o filtro altera a visibilidade', async () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 10 }, (_, index) => '<article class="kc-card" data-post-id="post-' + index + '">' + index + '</article>').join(''),
      '</div>',
    ].join('');
    const list = document.querySelector('.kc-feed-list');
    const cards = Array.from(list.querySelectorAll('.kc-card'));
    const ads = [{ id: 'ad-1', title: 'Anúncio', target_url: 'https://example.com', placements: ['feed_inline'] }];
    KCAds.renderInlineAds(list, ads, { module_key: 'eventos' });
    KCAds.observeFeeds(ads, { module_key: 'eventos' });

    cards.slice(0, 5).forEach((card) => { card.style.display = 'none'; });
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(list.querySelectorAll('.kc-ad-card--inline')).toHaveLength(1);
    expect(list.querySelector('.kc-ad-card').previousElementSibling).toBe(cards[9]);
  });

  test('renderiza slot AdSense apenas quando publicidade foi aceita', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 5 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
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
    const script = document.querySelector('#kcAdsenseScript');
    expect(script).toBeTruthy();
    expect(script.parentElement).toBe(document.head);
  });

  test('reconcilia grant e revoke de publicidade sem recarregar a página', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 5 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');
    const config = KCAds.normalizeAdConfig({
      status: 'active',
      adsense_client_id: 'ca-pub-2776499020194231',
      placement_modes: { feed_inline: 'adsense_only' },
      adsense_slots: { feed_inline: '1234567890' },
    });

    expect(KCAds.renderAllAds([], { module_key: 'eventos' }, document, config)).toBe(false);
    expect(document.querySelector('ins.adsbygoogle')).toBeFalsy();

    window.KCConsent = { hasConsent: (key) => key === 'advertising' };
    window.dispatchEvent(new CustomEvent('kc:consentchange'));
    expect(document.querySelectorAll('ins.adsbygoogle')).toHaveLength(1);
    expect(document.querySelectorAll('#kcAdsenseScript')).toHaveLength(1);

    expect(KCAds.reconcileAdvertisingConsent()).toBe(true);
    expect(document.querySelectorAll('ins.adsbygoogle')).toHaveLength(1);
    expect(document.querySelectorAll('#kcAdsenseScript')).toHaveLength(1);

    window.KCConsent = { hasConsent: () => false };
    window.dispatchEvent(new CustomEvent('kc:consentchange'));
    expect(document.querySelector('ins.adsbygoogle')).toBeFalsy();
    expect(document.querySelector('#kcAdsenseScript')).toBeFalsy();
  });

  test('carrega Auto ads apenas em feed com consentimento de publicidade', () => {
    const config = KCAds.normalizeAdConfig({
      status: 'active',
      auto_ads_enabled: true,
      adsense_client_id: 'ca-pub-2776499020194231',
      placement_modes: {
        feed_inline: 'adsense_fallback',
        feed_aside_top: 'adsense_fallback',
        feed_aside_sticky: 'adsense_fallback',
      },
      adsense_slots: {},
    });

    expect(KCAds.maybeLoadAutoAds(config)).toBe(false);
    expect(document.querySelector('#kcAdsenseScript')).toBeFalsy();

    window.KCConsent = { hasConsent: (key) => key === 'advertising' };
    expect(KCAds.maybeLoadAutoAds(config)).toBe(true);

    const script = document.querySelector('#kcAdsenseScript');
    expect(script).toBeTruthy();
    expect(script.parentElement).toBe(document.head);
    expect(script.getAttribute('src')).toContain('client=ca-pub-2776499020194231');
  });

  test('respeita limite de impressões por sessão em campanhas próprias', () => {
    KCAds.incrementFrequencyCount('ad-capped');
    const selected = KCAds.selectAdsForPlacement([
      {
        id: 'ad-capped',
        title: 'Campanha limitada',
        target_url: 'https://example.com/a',
        placements: ['feed_inline'],
        priority: 100,
        frequency_cap_per_session: 1,
      },
      {
        id: 'ad-open',
        title: 'Campanha disponível',
        target_url: 'https://example.com/b',
        placements: ['feed_inline'],
        priority: 1,
        frequency_cap_per_session: 1,
      },
    ], 'feed_inline', { module_key: 'eventos' }, 2);

    expect(selected.map((ad) => ad.id)).toEqual(['ad-open']);
  });

  test('não duplica campanha acima do limite por sessão no mesmo render', () => {
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 12 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');

    const ok = KCAds.renderInlineAds(document.querySelector('.kc-feed-list'), [{
      id: 'ad-capped',
      title: 'Campanha limitada',
      target_url: 'https://example.com/a',
      placements: ['feed_inline'],
      frequency_cap_per_session: 1,
    }], { module_key: 'eventos' });

    expect(ok).toBe(true);
    expect(document.querySelectorAll('.kc-ad-card--inline[data-kc-ad-id="ad-capped"]')).toHaveLength(1);
  });

  test('Auto ads não carrega em páginas bloqueadas mesmo com consentimento', () => {
    window.history.replaceState({}, '', '/product.html?id=post-1');
    window.KCConsent = { hasConsent: (key) => key === 'advertising' };
    document.body.innerHTML = '<div class="kc-feed-list"><article class="kc-card">1</article></div>';

    expect(KCAds.maybeLoadAutoAds({
      status: 'active',
      auto_ads_enabled: true,
      adsense_client_id: 'ca-pub-2776499020194231',
    })).toBe(false);

    const rendered = KCAds.renderAllAds([], { module_key: 'eventos' }, document, {
      status: 'active',
      auto_ads_enabled: true,
      adsense_client_id: 'ca-pub-2776499020194231',
    });

    expect(rendered).toBe(false);
    expect(document.querySelector('#kcAdsenseScript')).toBeFalsy();
  });

  test('busca interna noindex nao e placement de anuncios', () => {
    window.history.replaceState({}, '', '/search-results.html?q=evento');
    window.KCConsent = { hasConsent: (key) => key === 'advertising' };
    document.body.innerHTML = [
      '<div class="kc-feed-list">',
      Array.from({ length: 6 }, (_, index) => '<article class="kc-card">' + (index + 1) + '</article>').join(''),
      '</div>',
    ].join('');

    expect(KCAds.isFeedPage('/search-results.html')).toBe(false);
    expect(KCAds.maybeLoadAutoAds({
      status: 'active',
      auto_ads_enabled: true,
      adsense_client_id: 'ca-pub-2776499020194231',
    })).toBe(false);

    const rendered = KCAds.renderAllAds([], { module_key: '' }, document, {
      status: 'active',
      placement_modes: { feed_inline: 'adsense_only' },
      adsense_slots: { feed_inline: '1234567890' },
    });

    expect(rendered).toBe(false);
    expect(document.querySelector('#kcAdsenseScript')).toBeFalsy();
    expect(document.querySelector('ins.adsbygoogle')).toBeFalsy();
  });

  test('renderiza anúncios laterais em bloco inicial e bloco sticky final', () => {
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
    expect(document.querySelector('[data-kc-ad-aside="top"] .kc-ad-card').getAttribute('data-kc-ad-placement')).toBe('feed_aside_top');
    expect(document.querySelector('[data-kc-ad-aside="sticky"] .kc-ad-card').getAttribute('data-kc-ad-placement')).toBe('feed_aside_sticky');
    expect(document.querySelector('.kc-sidebar').firstElementChild.id).toBe('one');
    expect(document.querySelector('#one').nextElementSibling.getAttribute('data-kc-ad-aside')).toBe('top');
    expect(document.querySelector('.kc-sidebar').lastElementChild.getAttribute('data-kc-ad-aside')).toBe('sticky');
  });

  test('não duplica a mesma campanha lateral quando só há uma elegível', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="one">Resumo</section>',
      '</aside></main>',
    ].join('');

    const ok = KCAds.renderAsideAds([
      { id: 'ad-1', title: 'Única campanha', target_url: 'https://example.com/a', placements: ['feed_aside'], frequency_cap_per_session: 1 },
    ], { module_key: 'eventos' }, document);

    expect(ok).toBe(true);
    expect(document.querySelector('[data-kc-ad-aside="top"]')).toBeTruthy();
    expect(document.querySelector('[data-kc-ad-aside="sticky"]')).toBeTruthy();
    expect(document.querySelector('#one').nextElementSibling.getAttribute('data-kc-ad-aside')).toBe('top');
    expect(document.querySelector('.kc-sidebar').lastElementChild.getAttribute('data-kc-ad-aside')).toBe('sticky');
    expect(document.querySelectorAll('.kc-ad-card--aside[data-kc-ad-id="ad-1"]')).toHaveLength(2);
  });

  test('remove anúncios laterais antigos quando nenhuma campanha ou fallback segue elegível', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="one">Resumo</section>',
      '</aside></main>',
    ].join('');

    expect(KCAds.renderAsideAds([
      { id: 'ad-1', title: 'Campanha', target_url: 'https://example.com/a', placements: ['feed_aside'] },
    ], { module_key: 'eventos' }, document)).toBe(true);
    expect(document.querySelectorAll('[data-kc-ad-aside]')).toHaveLength(2);

    const rendered = KCAds.renderAsideAds([], { module_key: 'eventos' }, document, {
      status: 'disabled',
      placement_modes: {
        feed_aside_top: 'off',
        feed_aside_sticky: 'off',
      },
    });

    expect(rendered).toBe(false);
    expect(document.querySelectorAll('[data-kc-ad-aside]')).toHaveLength(0);
    expect(document.querySelector('#one')).toBeTruthy();
  });

  // v9.3.7.1 (2026-07-16): ads-top deve ser inserido APÓS o kc-create-post-btn
  // (não após o primeiro section). Caso real: index.html tem
  // [Context, Criar Publicação, ...] e o ad estava sendo inserido entre
  // Context e Criar Publicação, empurrando o botão para baixo.
  test('insere ads-top após o kc-create-post-btn (não após o primeiro section)', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="context">Sobre</section>',
      '<section class="kc-sidebar-section" id="create"><a class="kc-create-post-btn" href="create-post.html">Criar Publicação</a></section>',
      '<section class="kc-sidebar-section" id="smart">Painel</section>',
      '</aside></main>',
    ].join('');

    const ok = KCAds.renderAsideAds([
      { id: 'ad-top', title: 'Topo', target_url: 'https://example.com/a', placements: ['feed_aside'] },
    ], { module_key: '' }, document);

    expect(ok).toBe(true);
    // Ordem esperada: context, create, ad-top, smart, ad-sticky
    const sidebar = document.querySelector('.kc-sidebar');
    const ids = Array.from(sidebar.children).map((el) => {
      if (el.id) return el.id;
      if (el.getAttribute('data-kc-ad-aside')) return 'ad-' + el.getAttribute('data-kc-ad-aside');
      return '?';
    });
    expect(ids).toEqual(['context', 'create', 'ad-top', 'smart', 'ad-sticky']);
    // O create-post-btn deve estar ACIMA do ad-top
    const createIdx = ids.indexOf('create');
    const adTopIdx = ids.indexOf('ad-top');
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(adTopIdx).toBeGreaterThan(createIdx);
  });

  // v9.3.7.1 (2026-07-16): fallback para comportamento legado quando NÃO há
  // kc-create-post-btn (páginas de módulo: eventos, oportunidades, etc).
  test('fallback: insere ads-top após o primeiro section quando não há kc-create-post-btn', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="one">Filtros</section>',
      '<section class="kc-sidebar-section" id="two">Categorias</section>',
      '</aside></main>',
    ].join('');

    const ok = KCAds.renderAsideAds([
      { id: 'ad-top', title: 'Topo', target_url: 'https://example.com/a', placements: ['feed_aside'] },
    ], { module_key: 'eventos' }, document);

    expect(ok).toBe(true);
    const sidebar = document.querySelector('.kc-sidebar');
    const ids = Array.from(sidebar.children).map((el) => {
      if (el.id) return el.id;
      if (el.getAttribute('data-kc-ad-aside')) return 'ad-' + el.getAttribute('data-kc-ad-aside');
      return '?';
    });
    // Comportamento legado: ad-top após o primeiro (one)
    expect(ids).toEqual(['one', 'ad-top', 'two', 'ad-sticky']);
  });

  // v9.3.7.1 (2026-07-16): kc-create-post-btn no ÚLTIMO section também
  // funciona (ad-top vai para o final, antes do sticky)
  test('kc-create-post-btn como último section: ad-top entra antes do sticky', () => {
    document.body.innerHTML = [
      '<main><aside class="kc-sidebar">',
      '<section class="kc-sidebar-section" id="one">Resumo</section>',
      '<section class="kc-sidebar-section" id="create"><a class="kc-create-post-btn" href="create-post.html">Criar Publicação</a></section>',
      '</aside></main>',
    ].join('');

    const ok = KCAds.renderAsideAds([
      { id: 'ad-top', title: 'Topo', target_url: 'https://example.com/a', placements: ['feed_aside'] },
    ], { module_key: '' }, document);

    expect(ok).toBe(true);
    const sidebar = document.querySelector('.kc-sidebar');
    const ids = Array.from(sidebar.children).map((el) => {
      if (el.id) return el.id;
      if (el.getAttribute('data-kc-ad-aside')) return 'ad-' + el.getAttribute('data-kc-ad-aside');
      return '?';
    });
    // one, create, ad-top, ad-sticky (create é o último, ad-top entra entre create e sticky)
    expect(ids).toEqual(['one', 'create', 'ad-top', 'ad-sticky']);
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
    ].forEach((file) => {
      expect(read(file)).toContain('assets/js/features/kc-ads.js');
    });

    [
      '_product.html',
      'create-post.html',
      'my-posts.html',
      'profile.html',
      'settings.html',
      'search-results.html',
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

  test('protege a carga inicial contra corrida entre authchange e fallback', () => {
    const source = read('assets/js/features/kc-ads.js');
    expect(source).toContain('let initialLoadStarted = false;');
    expect(source).toContain('let initialLoadCompleted = false;');
    expect(source).toContain("code: 'CLIENT_NOT_READY'");
    expect(source).toContain('if (initialLoadCompleted || initialLoadStarted) return;');
    expect(source).toContain('initialLoadStarted = true;');
    expect(source).toContain("root.document.addEventListener('kc:authchange', run);");
    expect(source).toContain("root.addEventListener('kc:consentchange', reconcileAdvertisingConsent);");
  });

  test('tenta novamente no authchange quando o cliente Supabase fica pronto depois do fallback', async () => {
    const listeners = new Map();
    const timers = [];
    const fakeDocument = {
      readyState: 'complete',
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) {
        if (listeners.has(type)) listeners.get(type).delete(listener);
      },
      dispatch(type) {
        Array.from(listeners.get(type) || []).forEach((listener) => listener({ type }));
      },
      querySelectorAll() {
        return [];
      },
    };
    let client = null;
    const runtime = {
      document: fakeDocument,
      location: {
        pathname: '/eventos.html',
        search: '',
        origin: 'https://www.kinocampus.com.br',
      },
      KCSupabase: {
        getClient: () => client,
      },
      setTimeout(callback, delay) {
        const timer = { callback, delay, active: true };
        timers.push(timer);
        return timer;
      },
      clearTimeout(timer) {
        if (timer) timer.active = false;
      },
    };
    const moduleRef = { exports: {} };

    vm.runInNewContext(read('assets/js/features/kc-ads.js'), {
      window: runtime,
      globalThis: runtime,
      module: moduleRef,
      URL,
      URLSearchParams,
    });

    const firstAttempt = timers.find((timer) => timer.active);
    expect(firstAttempt.delay).toBe(250);
    firstAttempt.active = false;
    firstAttempt.callback();
    await Promise.resolve();
    await Promise.resolve();

    expect(listeners.get('kc:authchange').size).toBe(1);
    expect(timers.some((timer) => timer.active && timer.delay === 900)).toBe(true);

    client = {
      rpc: jest.fn(async (name) => {
        if (name === 'kc_get_feed_ad_config') {
          return { data: { enabled: false, status: 'disabled' } };
        }
        return { data: [] };
      }),
    };
    fakeDocument.dispatch('kc:authchange');
    for (let index = 0; index < 10; index += 1) await Promise.resolve();

    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      'kc_get_feed_ad_config',
      'kc_get_feed_ads',
    ]);
    expect(listeners.get('kc:authchange').size).toBe(0);
  });

  test('migration define tabela, RPCs e eventos de anuncios', () => {
    const sql = read('supabase/migrations/_archive-v75/20260605010000_feed_ads.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ad_campaigns');
    expect(sql).toContain('public.kc_get_feed_ads');
    expect(sql).toContain('public.kc_admin_save_ad_campaign');
    expect(sql).toContain("'ad_impression'");
    expect(sql).toContain("'ad_click'");
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  test('migration AdSense define settings, RPCs e audit log canonico', () => {
    const sql = read('supabase/migrations/_archive-v75/20260605182346_adsense_admin_monetization_runtime.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ad_network_settings');
    expect(sql).toContain('public.kc_get_feed_ad_config');
    expect(sql).toContain('public.kc_admin_get_ad_network_settings');
    expect(sql).toContain('public.kc_admin_save_ad_network_settings');
    expect(sql).toContain('public.kc_admin_ads_overview');
    expect(sql).toContain("'ad_campaign_created'");
    expect(sql).toContain("'ad_network_settings_updated'");
    expect(sql).toContain('ca-pub-2776499020194231');
  });

  test('migration AdSense cobre indices de FKs monitorados pelos advisors', () => {
    const sql = read('supabase/migrations/_archive-v75/20260605182516_adsense_fk_indexes.sql');
    [
      'idx_ad_campaigns_created_by',
      'idx_ad_campaigns_updated_by',
      'idx_ad_campaign_audit_changed_by',
      'idx_ad_network_settings_updated_by',
      'idx_privacy_analytics_events_user_id',
    ].forEach((indexName) => {
      expect(sql).toContain(indexName);
    });
  });

  test('migration de anuncios expõe frequency cap no RPC publico', () => {
    const sql = read('supabase/migrations/_archive-v75/20260605184519_adsense_frequency_cap_contract.sql');
    expect(sql).toContain('frequency_cap_per_session INTEGER');
    expect(sql).toContain('c.frequency_cap_per_session');
    expect(sql).toContain('public.kc_get_feed_ads');
  });

  test('migration de anúncios consolida RLS de campanhas sem SELECT duplicado', () => {
    const sql = read('supabase/migrations/_archive-v75/20260605185313_ads_rls_policy_consolidation.sql');
    expect(sql).toContain('DROP POLICY IF EXISTS ad_campaigns_admin_all');
    expect(sql).toContain('CREATE POLICY ad_campaigns_read_active_anon');
    expect(sql).toContain('CREATE POLICY ad_campaigns_read_authenticated');
    expect(sql).toContain('CREATE POLICY ad_campaigns_admin_insert');
    expect(sql).toContain('CREATE POLICY ad_campaigns_admin_update');
    expect(sql).toContain('CREATE POLICY ad_campaigns_admin_delete');
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
