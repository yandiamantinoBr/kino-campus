/*
  KinoCampus — kc-banners.js (v8.3.2.0)
  Carrega os banners ativos do Supabase e substitui o
  carrossel estático da index.html.
  Fallback: mantém os banners hardcoded se o Supabase falhar
  ou se o driver for 'local'.
*/
(function () {
  'use strict';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildBannerHTML(banner, isActive) {
    const gradStyle = `background: linear-gradient(90deg, ${esc(banner.gradient_from)}, ${esc(banner.gradient_to)});`;
    return `
      <div class="kc-hero-banner${isActive ? ' active' : ''}" style="${gradStyle}">
        <div class="kc-hero-inner">
          <div class="kc-hero-content">
            <span class="kc-hero-pill">${esc(banner.pill_text)}</span>
            <h1>${esc(banner.title)}</h1>
            <p>${esc(banner.subtitle)}</p>
            <a class="kc-btn-primary" href="${esc(banner.button_url)}">${esc(banner.button_text)}</a>
          </div>
          <div aria-hidden="true" class="kc-hero-illustration">
            <i class="${esc(banner.icon_class)}"></i>
          </div>
        </div>
      </div>`;
  }

  function buildDotsHTML(count) {
    const dots = [];
    for (let i = 0; i < count; i++) {
      dots.push(`<span class="kc-dot${i === 0 ? ' active' : ''}" data-kc-slide="${i}"></span>`);
    }
    return dots.join('');
  }

  async function loadBanners() {
    const env = window.KC_ENV || {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
    if (driver !== 'supabase') return; // mantém banners estáticos no modo local

    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client) return;

    try {
      const { data, error } = await client
        .from('hero_banners')
        .select('id, pill_text, title, subtitle, button_text, button_url, icon_class, gradient_from, gradient_to, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[KC Banners] Erro ao carregar banners do Supabase:', error.message || error);
        return; // fallback estático
      }
      if (!Array.isArray(data) || !data.length) return; // sem banners ativos — mantém estáticos

      const slidesEl = document.getElementById('kc-hero-slides');
      const dotsEl   = document.getElementById('kc-carousel-dots');
      if (!slidesEl || !dotsEl) return;

      // Injeta slides
      slidesEl.innerHTML = data.map((b, i) => buildBannerHTML(b, i === 0)).join('');

      // Atualiza dots
      dotsEl.innerHTML = buildDotsHTML(data.length);

      // Reinicializa o carrossel após troca dinâmica de slides/dots
      if (typeof window.kcRefreshHeroCarousel === 'function') {
        window.kcRefreshHeroCarousel();
      } else if (typeof window.showSlide === 'function') {
        window.showSlide(0);
      }
    } catch (e) {
      console.warn('[KC Banners] Exceção ao carregar banners:', e && e.message || e);
      // Fallback silencioso — banners estáticos permanecem
    }
  }

  // Aguarda o DOM e o cliente Supabase
  document.addEventListener('DOMContentLoaded', function () {
    const tryLoad = () => loadBanners();

    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      tryLoad();
    } else {
      document.addEventListener('kc:authchange', function onFirst() {
        document.removeEventListener('kc:authchange', onFirst);
        tryLoad();
      });
      // Tenta após 1s caso o evento não dispare
      setTimeout(tryLoad, 1000);
    }
  });
})();
