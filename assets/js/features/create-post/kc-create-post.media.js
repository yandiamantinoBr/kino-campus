/**
 * @file kc-create-post.media.js
 * @description Sub-módulo de mídia/imagens do formulário de criação de publicações (v11.31.3).
 * Extraído de kc-create-post.js. Registra window._KCCreatePost.media.
 *
 * Dependências em runtime:
 *   - window._KCCreatePost        — namespace criado por kc-create-post.js
 *   - window._KCCreatePost._state — referência ao estado mútuo (kcCreateState)
 *   - window.kcRenderCreateModal  — função de re-render do modal (global em kc-create-post.js)
 *   - window.KCUtils              — escapeHtml
 *   - window.showToast            — toast global
 *
 * Carregado após kc-create-post.js em todos os HTMLs que usam o modal de criação.
 * Execução: IIFE imediata → window._KCCreatePost.media disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  // ── Utilitário local ──────────────────────────────────────────────────────
  function _esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str || '');
  }

  // ── Acesso defensivo ao estado compartilhado ──────────────────────────────
  function _getState() {
    return window._KCCreatePost && window._KCCreatePost._state;
  }

  function _rerender() {
    if (typeof window.kcRenderCreateModal === 'function') {
      window.kcRenderCreateModal();
    }
  }

  // ── Constantes ────────────────────────────────────────────────────────────
  // v13.6.3: limite aumentado de 5 → 12 (necessário para posts com galeria rica,
  // ex: carrossel de 7+ frames do Instagram). Hard-limit anti-abuso mantido.
  var KC_CREATE_MAX_IMAGES = 12;

  // ── Leitura de arquivo ────────────────────────────────────────────────────
  function kcReadFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(reader.error || new Error('Falha ao ler imagem')); };
        reader.readAsDataURL(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Compressão de imagem ──────────────────────────────────────────────────
  async function kcReadAndCompressImage(file, opts) {
    var maxSide = (opts && typeof opts.maxSide === 'number') ? opts.maxSide : 1200;
    var quality = (opts && typeof opts.quality === 'number') ? opts.quality : 0.82;

    var original = await kcReadFileAsDataUrl(file);
    if (!original) return '';

    // Mantém GIF como está (para não quebrar animação)
    if (String(file.type || '').toLowerCase() === 'image/gif') return original;

    try {
      var img = await new Promise(function (resolve) {
        var i = new Image();
        i.onload = function () { resolve(i); };
        i.onerror = function () { resolve(null); };
        i.src = original;
      });

      if (!img) return original;

      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (!w || !h) return original;

      var scale = Math.min(1, maxSide / Math.max(w, h));
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;

      var ctx = canvas.getContext('2d');
      if (!ctx) return original;

      ctx.drawImage(img, 0, 0, outW, outH);

      // Converte para JPEG para reduzir tamanho
      var out = canvas.toDataURL('image/jpeg', quality);
      return out || original;
    } catch (_) {
      return original;
    }
  }

  // ── Adicionar imagens a partir de uma FileList ────────────────────────────
  async function kcAddImagesFromFiles(fileList) {
    var state = _getState();
    if (!state) return;

    var files = Array.from(fileList || []);
    if (!files.length) return;

    var remaining = KC_CREATE_MAX_IMAGES - state.images.length;
    if (remaining <= 0) {
      if (typeof window.showToast === 'function') {
        window.showToast('Máximo de ' + KC_CREATE_MAX_IMAGES + ' imagens (1 capa + ' + (KC_CREATE_MAX_IMAGES - 1) + ').', 'warn', 2600);
      }
      return;
    }

    var candidates = files
      .filter(function (f) { return f && typeof f.type === 'string' && f.type.startsWith('image/'); })
      .slice(0, remaining);

    if (!candidates.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Selecione arquivos de imagem (JPG/PNG/WebP).', 'warn', 2400);
      }
      return;
    }

    for (var i = 0; i < candidates.length; i++) {
      var file = candidates[i];
      // Proteção simples: evita localStorage enorme
      if (file.size > 8 * 1024 * 1024) {
        if (typeof window.showToast === 'function') {
          window.showToast('Imagem muito grande (máx ~8MB). Use uma menor.', 'warn', 2600);
        }
        continue;
      }
      try {
        var dataUrl = await kcReadAndCompressImage(file);
        if (!dataUrl) continue;

        var id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        state.images.push({ id: id, dataUrl: dataUrl, name: file.name || '', size: file.size || 0 });

        if (!state.coverImageId) state.coverImageId = id;
      } catch (_) {
        if (typeof window.showToast === 'function') {
          window.showToast('Não consegui carregar uma das imagens.', 'warn', 2400);
        }
      }
    }

    _rerender();
  }

  // ── Remover imagem por id ─────────────────────────────────────────────────
  function kcRemoveCreateImageById(id) {
    var state = _getState();
    if (!state) return;

    var before = state.images.length;
    state.images = state.images.filter(function (img) { return String(img.id) !== String(id); });

    if (state.images.length !== before) {
      if (state.coverImageId && String(state.coverImageId) === String(id)) {
        state.coverImageId = state.images.length ? state.images[0].id : null;
      }
      _rerender();
    }
  }

  // ── Definir capa por id ───────────────────────────────────────────────────
  function kcSetCreateCoverImageById(id) {
    var state = _getState();
    if (!state || !id) return;

    var exists = state.images.some(function (img) { return String(img.id) === String(id); });
    if (!exists) return;

    state.coverImageId = id;
    _rerender();
  }

  // ── Obter imagens ordenadas (capa primeiro) ───────────────────────────────
  function kcGetOrderedCreateImages() {
    var state = _getState();
    if (!state) return [];

    var imgs = Array.isArray(state.images) ? state.images : [];
    if (!imgs.length) return [];

    var coverId = state.coverImageId;
    var cover = coverId ? imgs.find(function (i) { return String(i.id) === String(coverId); }) : null;

    if (!cover) return imgs.map(function (i) { return i.dataUrl; }).filter(Boolean);

    var others = imgs
      .filter(function (i) { return String(i.id) !== String(coverId); })
      .map(function (i) { return i.dataUrl; })
      .filter(Boolean);

    return [cover.dataUrl].concat(others).filter(Boolean);
  }

  // ── HTML da seção de imagens ──────────────────────────────────────────────
  function kcCreateImagesSectionHtml() {
    var state = _getState();
    var images = (state && Array.isArray(state.images)) ? state.images : [];
    var coverImageId = state ? state.coverImageId : null;

    var count = images.length;
    var remaining = KC_CREATE_MAX_IMAGES - count;
    var disabled = remaining <= 0;

    var thumbs = images.map(function (img) {
      var isCover = coverImageId && String(coverImageId) === String(img.id);
      return (
        '<div class="kc-img-thumb' + (isCover ? ' is-cover' : '') + '">' +
        '<img src="' + _esc(img.dataUrl) + '" alt="Imagem da publicação" loading="lazy" />' +
        (isCover ? '<div class="kc-img-badge"><i class="fas fa-star"></i> Capa</div>' : '') +
        '<div class="kc-img-actions">' +
        '<button type="button" class="kc-img-action" data-kc-img-action="cover" data-kc-img-id="' + _esc(img.id) + '" title="Definir como capa">' +
        '<i class="fas fa-star"></i>' +
        '</button>' +
        '<button type="button" class="kc-img-action" data-kc-img-action="remove" data-kc-img-id="' + _esc(img.id) + '" title="Remover">' +
        '<i class="fas fa-trash"></i>' +
        '</button>' +
        '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="kc-create-group kc-create-images">' +
      '<div class="kc-create-group__head kc-create-group__head--row">' +
      '<span>Imagens</span>' +
      '<small>' + count + '/' + KC_CREATE_MAX_IMAGES + '</small>' +
      '</div>' +
      '<input id="kcImagesInput" type="file" accept="image/*" ' + (disabled ? 'disabled' : '') + ' multiple hidden />' +
      '<button type="button" class="kc-img-dropzone" data-kc-open-images="true" ' + (disabled ? 'disabled' : '') + '>' +
      '<i class="fas fa-cloud-upload-alt"></i>' +
      '<div>' +
      '<div class="kc-img-dropzone__title">' + (disabled ? 'Limite de imagens atingido' : 'Clique para adicionar imagens') + '</div>' +
      '<div class="kc-img-dropzone__sub">Máximo ' + KC_CREATE_MAX_IMAGES + ' imagens (1 capa + ' + (KC_CREATE_MAX_IMAGES - 1) + ').</div>' +
      '</div>' +
      '</button>' +
      (count ? '<div class="kc-img-grid">' + thumbs + '</div>' : '') +
      '<div class="kc-img-hint">Dica: clique na estrela para escolher a <strong>capa</strong>.</div>' +
      '</div>'
    );
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCCreatePost.media = {
    MAX_IMAGES: KC_CREATE_MAX_IMAGES,
    readFile: kcReadFileAsDataUrl,
    compressImage: kcReadAndCompressImage,
    addFromFiles: kcAddImagesFromFiles,
    removeById: kcRemoveCreateImageById,
    setCoverById: kcSetCreateCoverImageById,
    getOrdered: kcGetOrderedCreateImages,
    sectionHtml: kcCreateImagesSectionHtml,
  };

})();
