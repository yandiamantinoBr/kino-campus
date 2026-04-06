/* KinoCampus - Hero Carousel (V8.1.2.4.5) */
// -----------------------------

let _kcCurrentSlide = 0;
let _kcAutoSlideInterval = null;
let _kcHeroControlsBound = false;
const KC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProductionRuntime() {
  return !!(KC_ENV && KC_ENV.isProduction === true);
}

function isSupabaseRuntime() {
  return !!(KCAPI && KCAPI.ENV && KCAPI.ENV.driver === 'supabase');
}

function showSlide(index) {
  const slides = document.querySelectorAll('.kc-hero-banner');
  const dots = document.querySelectorAll('.kc-dot');
  if (!slides.length) return;

  // wrap
  if (index >= slides.length) _kcCurrentSlide = 0;
  else if (index < 0) _kcCurrentSlide = slides.length - 1;
  else _kcCurrentSlide = index;

  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));

  slides[_kcCurrentSlide].classList.add('active');
  if (dots[_kcCurrentSlide]) dots[_kcCurrentSlide].classList.add('active');
}

function changeSlide(direction) {
  showSlide(_kcCurrentSlide + direction);
  resetAutoSlide();
}

function goToSlide(index) {
  showSlide(index);
  resetAutoSlide();
}

function startAutoSlide() {
  stopAutoSlide();
  _kcAutoSlideInterval = setInterval(() => showSlide(_kcCurrentSlide + 1), 5000);
}

function stopAutoSlide() {
  if (_kcAutoSlideInterval) {
    clearInterval(_kcAutoSlideInterval);
    _kcAutoSlideInterval = null;
  }
}

function resetAutoSlide() {
  startAutoSlide();
}

function refreshHeroCarousel() {
  if (!document.querySelector('.kc-hero-carousel')) return;
  showSlide(0);
  startAutoSlide();

  if (!_kcHeroControlsBound) {
    _kcHeroControlsBound = true;

    const carousel = document.querySelector('.kc-hero-carousel');
    const prevBtn = document.querySelector('.kc-carousel-prev[data-kc-slide="prev"]');
    const nextBtn = document.querySelector('.kc-carousel-next[data-kc-slide="next"]');
    const dotsWrap = document.getElementById('kc-carousel-dots');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeSlide(-1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeSlide(1);
      });
    }

    if (dotsWrap) {
      dotsWrap.addEventListener('click', (e) => {
        const dot = e.target.closest('.kc-dot[data-kc-slide]');
        if (!dot) return;
        const index = Number.parseInt(String(dot.getAttribute('data-kc-slide') || ''), 10);
        if (!Number.isFinite(index)) return;
        e.preventDefault();
        e.stopPropagation();
        goToSlide(index);
      });
    }

    // Fallback: em alguns devices/cliques o alvo chega como .kc-hero-carousel
    // (e não no botão), então usamos zonas laterais para prev/next.
    if (carousel) {
      carousel.addEventListener('click', (e) => {
        if (e.target.closest('.kc-carousel-prev, .kc-carousel-next, .kc-dot, a, button, input, textarea, select, [role="button"]')) return;
        const r = carousel.getBoundingClientRect();
        const x = e.clientX;
        const edge = Math.max(56, Math.min(88, r.width * 0.12));
        if (x <= r.left + edge) {
          changeSlide(-1);
        } else if (x >= r.right - edge) {
          changeSlide(1);
        }
      });
    }
  }
}
