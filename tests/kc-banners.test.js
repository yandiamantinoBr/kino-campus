const Banners = require('../assets/js/kc-banners.js');

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
});
