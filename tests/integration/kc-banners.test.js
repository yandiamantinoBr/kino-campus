const Banners = require('../../assets/js/features/kc-banners.js');

describe('KCBanners', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('maps the known banner icon classes to stable keys', () => {
    expect(Banners.getHeroIconKey('fas fa-calendar-alt')).toBe('calendar');
    expect(Banners.getHeroIconKey('fas fa-exchange-alt')).toBe('exchange');
    expect(Banners.getHeroIconKey('fas fa-campground')).toBe('launch');
  });

  test('falls back to a safe mobile illustration for unknown icons', () => {
    const markup = Banners.buildMobileIllustration('fas fa-star');
    expect(markup).toContain('kc-hero-illustration-mobile');
    expect(markup).toContain('data-kc-hero-mobile="fallback"');
    expect(markup).toContain('<svg');
  });

  test('buildBannerHTML renders the mobile-safe illustration and icon key', () => {
    const html = Banners.buildBannerHTML({
      pill_text: 'Destaque',
      title: 'Semana de Sustentabilidade UFG',
      subtitle: 'Troque materiais, ganhe cashback em dobro e suba no ranking de impacto!',
      button_text: 'Ver Programacao',
      button_url: 'eventos.html?filter=sustentabilidade',
      icon_class: 'fas fa-calendar-alt',
      gradient_from: '#59d66f',
      gradient_to: '#7fe26f',
    }, true);

    expect(html).toContain('data-hero-icon="calendar"');
    expect(html).toContain('kc-hero-illustration-mobile');
    expect(html).toContain('data-kc-hero-mobile="calendar"');
    expect(html).toContain('<svg');
  });

  test('buildBannerSignature normaliza dados para cache de sessao', () => {
    const rows = Banners.normalizeBannerRows([
      {
        id: 3,
        pill_text: 'Destaque',
        title: 'Evento UFG',
        subtitle: 'Inscricoes abertas',
        button_text: 'Ver',
        button_url: 'eventos.html',
        icon_class: 'fas fa-calendar-alt',
        gradient_from: '#111',
        gradient_to: '#222',
        sort_order: '2',
      },
      { id: 4, title: '' },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('3');
    expect(rows[0].sort_order).toBe(2);
    expect(Banners.buildBannerSignature(rows)).toContain('Evento UFG');
  });

  test('renderBannerRows marca assinatura e evita re-render igual', () => {
    document.body.innerHTML = [
      '<div class="kc-hero-carousel kc-hero-loading">',
      '<div id="kc-hero-slides"></div>',
      '<div id="kc-carousel-dots"></div>',
      '</div>',
    ].join('');

    const rows = [{
      title: 'Banner cacheado',
      pill_text: 'Novo',
      subtitle: 'Resumo',
      button_text: 'Abrir',
      button_url: 'eventos.html',
      icon_class: 'fas fa-calendar-alt',
      gradient_from: '#111',
      gradient_to: '#222',
    }];
    const signature = Banners.buildBannerSignature(rows);

    expect(Banners.renderBannerRows(rows, signature, document)).toBe(true);
    expect(document.getElementById('kc-hero-slides').dataset.kcBannersSignature).toBe(signature);
    expect(document.querySelector('.kc-hero-carousel').classList.contains('kc-hero-loading')).toBe(false);
  });

  test('hydrateExistingBanners upgrades static banners that only have the desktop illustration', () => {
    document.body.innerHTML = [
      '<div class="kc-hero-banner">',
      '<div class="kc-hero-inner">',
      '<div class="kc-hero-content"><h1>Banner</h1></div>',
      '<div aria-hidden="true" class="kc-hero-illustration"><i class="fas fa-campground"></i></div>',
      '</div>',
      '</div>',
    ].join('');

    Banners.hydrateExistingBanners(document);

    const banner = document.querySelector('.kc-hero-banner');
    const mobileIllustration = document.querySelector('.kc-hero-illustration-mobile');

    expect(banner.getAttribute('data-hero-icon')).toBe('launch');
    expect(mobileIllustration).not.toBeNull();
    expect(mobileIllustration.getAttribute('data-kc-hero-mobile')).toBe('launch');
  });

  test('bindHeroCTAInteractions marks hero CTAs as bound for gesture isolation', () => {
    document.body.innerHTML = [
      '<div class="kc-hero-carousel">',
      '<a class="kc-btn-primary" href="eventos.html">Participar</a>',
      '</div>',
    ].join('');

    Banners.bindHeroCTAInteractions(document);

    const cta = document.querySelector('.kc-btn-primary');
    expect(cta.dataset.kcHeroCtaBound).toBe('true');
  });
});
