/*
 * KinoCampus -- v75.1
 * kc-card-image-aspect.js
 *
 * Aplica um aspect-ratio "snapado" ao .kc-card__image-wrapper de cada
 * card de publicação, baseado na proporção REAL da imagem carregada.
 *
 * Presets verticais padrão (sempre altura ≥ largura) — escolhidos por
 * serem as proporções mais estabelecidas em mídia social/print:
 *   1:1   (square)
 *   4:5   (Instagram portrait leve)
 *   3:4   (foto clássica vertical)
 *   2:3   (foto DSLR vertical)
 *   9:16  (stories/reels)
 *
 * Imagens HORIZONTAIS (paisagem) caem em 1:1 com object-fit:cover, que
 * recorta o excesso pelos lados — atende ao pedido de "sempre vertical".
 *
 * Como funciona:
 *   1. Para cada <img> dentro de .kc-card__image-wrapper, espera onload.
 *   2. Lê naturalWidth/Height; calcula ratio = nh/nw.
 *   3. Snap para o preset com menor distância.
 *   4. Aplica `--kc-card-image-ar: <w>/<h>` no wrapper via inline style.
 *   5. CSS faz o resto via `aspect-ratio: var(--kc-card-image-ar, 1/1)`.
 *
 * Robusto:
 *   - Idempotente (data-attr para não reaplicar).
 *   - Roda em DOMContentLoaded + MutationObserver no body para pegar
 *     cards inseridos dinamicamente (paginação infinita, hidratação,
 *     re-render do feed).
 *   - Fallback silencioso para 1:1 em caso de erro/imagem sem dimensões.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__kcCardImageAspectInstalled) return;
  window.__kcCardImageAspectInstalled = true;

  // Presets ordenados por ratio (h/w) crescente
  const PRESETS = [
    { w: 1, h: 1, r: 1.0 },
    { w: 4, h: 5, r: 1.25 },
    { w: 3, h: 4, r: 1.3333 },
    { w: 2, h: 3, r: 1.5 },
    { w: 9, h: 16, r: 1.7778 },
  ];
  // Limite abaixo do qual consideramos a imagem "muito horizontal" → snap em 1:1
  const HORIZONTAL_THRESHOLD = 0.875; // h/w < 0.875 = imagem mais larga que alta

  function snap(naturalRatio) {
    if (!isFinite(naturalRatio) || naturalRatio <= 0) return PRESETS[0];
    if (naturalRatio < HORIZONTAL_THRESHOLD) return PRESETS[0];
    let best = PRESETS[0];
    let bestDist = Math.abs(naturalRatio - best.r);
    for (let i = 1; i < PRESETS.length; i++) {
      const d = Math.abs(naturalRatio - PRESETS[i].r);
      if (d < bestDist) { best = PRESETS[i]; bestDist = d; }
    }
    return best;
  }

  function applyToImg(img) {
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.kcArApplied === '1') return;
    const wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('kc-card__image-wrapper')) return;

    const finish = () => {
      const nw = img.naturalWidth || 0;
      const nh = img.naturalHeight || 0;
      if (nw > 0 && nh > 0) {
        const preset = snap(nh / nw);
        wrapper.style.setProperty('--kc-card-image-ar', preset.w + ' / ' + preset.h);
        wrapper.dataset.kcImageAr = preset.w + ':' + preset.h;
      }
      img.dataset.kcArApplied = '1';
    };

    // Imagem já carregada (cache, ou dataURL): aplica imediatamente
    if (img.complete && img.naturalWidth > 0) {
      finish();
      return;
    }

    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', () => {
      // Mantém default 1:1 (sem var setada → fallback do CSS)
      img.dataset.kcArApplied = '1';
    }, { once: true });
  }

  function applyAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const imgs = scope.querySelectorAll('.kc-card__image-wrapper > img:not([data-kc-ar-applied="1"])');
    for (let i = 0; i < imgs.length; i++) applyToImg(imgs[i]);
  }

  function init() {
    applyAll(document);

    // Observa inserções de novos cards (paginação infinita, re-render)
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
          const added = muts[i].addedNodes;
          for (let j = 0; j < added.length; j++) {
            const node = added[j];
            if (!node || node.nodeType !== 1) continue;
            // Caso o próprio nó seja um card ou um wrapper, ou contenha imagens
            if (node.matches && node.matches('.kc-card__image-wrapper > img, img')) {
              applyToImg(node);
            } else if (node.querySelectorAll) {
              applyAll(node);
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exporta para uso manual (ex.: depois de re-render explícito)
  window.kcApplyCardImageAspect = applyAll;
})();
